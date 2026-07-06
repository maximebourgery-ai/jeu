/* ================================================================
   MONDE — scène, rendu (bloom), collisions, décor, objets, portes,
   particules, interactions, construction du château & Terres Perdues.
   ================================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  G, S, IS_TOUCH, POWERS, QUESTS, HINTS, tut, STEP_HEIGHT, LIGHT_SCALE,
  colliders, doors, pickups, inter, spinners, flames, parts,
  tkCubes, pedestals, PLATES, CAMPS, player, p2,
  equipItem, unequipSlot
} from './state.js';
import { assets, matFor, glow } from './AssetManager.js';
import { A } from './Audio.js';
import { $, showMsg, refreshPowers, openTravel, toggleForge } from './UI.js';
import { questReach, openDialog, guide, applyQuest } from './Quests.js';
import { mkEnemy } from './Enemies.js';
import { saveGame } from './SaveSystem.js'; // (cycle sûr : appel différé au repos)
/* Seuils des salles instanciées (cycle sûr : appels différés, voir Rooms.js) */
import { enterCastleHall, enterThroneFromLostLands, beyondOpened } from './Rooms.js';

/* ---------------- SCÈNE ---------------- */
export function initScene() {
  S.scene = new THREE.Scene();
  S.scene.fog = new THREE.FogExp2(0x0b1024, 0.0135);
  S.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 500);
  S.cam2 = new THREE.PerspectiveCamera(70, (innerWidth / 2) / innerHeight, 0.1, 500);
  S.renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH });
  S.renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.25 : 1.5));
  S.renderer.setSize(innerWidth, innerHeight);
  S.renderer.shadowMap.enabled = true;
  S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  S.renderer.outputColorSpace = THREE.SRGBColorSpace;
  S.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  S.renderer.toneMappingExposure = 1.05;
  document.body.insertBefore(S.renderer.domElement, document.body.firstChild);
  S.clock = new THREE.Clock();

  /* Post-processing : bloom (UnrealBloomPass), seul effet gardé au service du
     gameplay — c'est lui qui rend les sorts/halos lumineux et « cool » à
     l'écran. Utilisé pour le rendu solo ; le mode coop écran scindé garde le
     rendu scissor multi-caméra direct (voir loop() dans main.js). Seuil élevé
     (0.95) : seuls les matériaux magiques (MeshBasic + sprites additifs, qui
     dépassent 1.0 en HDR) brillent — la pierre en couleur plate ne « bave » pas. */
  S.composer = new EffectComposer(S.renderer);
  S.renderPass = new RenderPass(S.scene, S.camera);
  S.bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.62, 0.42, 0.95);
  S.composer.addPass(S.renderPass);
  S.composer.addPass(S.bloomPass);
  S.composer.addPass(new OutputPass());

  /* Lumières pilotées par le cycle jour/nuit (DayNight.js) : on garde les
     références pour fondre couleurs et intensités entre jour et nuit. */
  S.hemi = new THREE.HemisphereLight(0x2a3c68, 0x0a0b14, 0.85);
  S.scene.add(S.hemi);
  S.amb = new THREE.AmbientLight(0x181c30, 0.8);
  S.scene.add(S.amb);
  S.dirLight = new THREE.DirectionalLight(0x9fb4f0, 0.85);
  S.dirLight.position.set(70, 110, -50);
  S.dirLight.castShadow = true;
  S.dirLight.shadow.mapSize.set(1024, 1024); // priorité à la fluidité : le rendu simplifié n'a pas besoin d'ombres très fines
  S.dirLight.shadow.camera.near = 20;
  S.dirLight.shadow.camera.far = 320;
  S.dirLight.shadow.camera.left = -95;
  S.dirLight.shadow.camera.right = 95;
  S.dirLight.shadow.camera.top = 95;
  S.dirLight.shadow.camera.bottom = -95;
  S.dirLight.shadow.bias = -0.0006;
  const tgt = new THREE.Object3D(); tgt.position.set(10, 0, 25);
  S.scene.add(tgt); S.dirLight.target = tgt;
  S.scene.add(S.dirLight);

  /* Ciel nocturne en dégradé généré en mémoire (aucun HDRI à charger).
     IMPORTANT : le dôme (rayon 400) SUIT LA CAMÉRA à chaque frame (voir
     updateDayNight) — les sites d'instance (Tour x +400, salles x -400)
     sont au bord de la sphère : sans ce suivi, la moitié du champ de
     vision regardait HORS du dôme → l'écran était coupé par une nappe
     noire (nuit) ou beige (jour) à la diagonale du bord du ciel. */
  S.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 16, 12),
    new THREE.MeshBasicMaterial({ map: assets.skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  S.sky.renderOrder = -3;
  S.scene.add(S.sky);
  /* Ciel de JOUR : sphère jumelle légèrement plus petite dont l'opacité est
     fondue par le cycle (0 = nuit noire, 1 = plein jour). */
  S.skyDay = new THREE.Mesh(new THREE.SphereGeometry(396, 16, 12),
    new THREE.MeshBasicMaterial({ map: assets.skyDayTex, side: THREE.BackSide, fog: false,
      transparent: true, opacity: 0, depthWrite: false }));
  S.skyDay.renderOrder = -2;
  S.scene.add(S.skyDay);
  // lune + halo (cachée en plein jour)
  S.moon = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xe8f0ff, fog: false }));
  S.moon.position.set(120, 140, -180);
  S.moon.add(glow(0xbdd0ff, 70, 0.55));
  S.scene.add(S.moon);
  // soleil : parcourt la voûte de l'est à l'ouest au fil de l'horloge du monde
  S.sun = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff2c8, fog: false, transparent: true, opacity: 0 }));
  S.sun.add(glow(0xffdf9a, 95, 0.55));
  S.sun.position.set(-240, 60, -140);
  S.scene.add(S.sun);
  // étoiles (fondues à l'aube, ravivées au crépuscule)
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(1500);
  for (let i = 0; i < 500; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.48;
    sp[i * 3] = Math.cos(th) * Math.sin(ph) * 360;
    sp[i * 3 + 1] = Math.cos(ph) * 360;
    sp[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * 360;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  S.stars = new THREE.Points(starGeo,
    new THREE.PointsMaterial({ color: 0xbcd0ff, size: 1.3, sizeAttenuation: false, fog: false,
      transparent: true, opacity: 0.9 }));
  S.scene.add(S.stars);

  // balise d'objectif
  S.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 44, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  S.beacon.position.y = 22; S.beacon.visible = false;
  S.scene.add(S.beacon);

  /* Redimensionnement robuste, pensé pour iOS Safari : la barre d'adresse
     qui apparaît/disparaît ne déclenche que visualViewport.resize, et la
     rotation rapporte d'abord des dimensions PÉRIMÉES (on re-mesure donc
     en différé). Sans ça, le canvas reste à la mauvaise taille sur iPhone. */
  const onResize = () => {
    setCamAspects();
    S.renderer.setSize(innerWidth, innerHeight);
    S.composer.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  addEventListener('orientationchange', () => {
    onResize();
    setTimeout(onResize, 150);
    setTimeout(onResize, 500);
  });
  setTimeout(onResize, 300); // le viewport iOS se stabilise après le chargement
}
/* v9 — le joueur en ligne (2ᵉ PC, voir Network.startNetVideo) reçoit son
   PROPRE rendu plein écran, jamais une moitié d'écran scindé : seule la
   coop LOCALE (manette/téléphone sur LA MÊME machine, un seul écran
   physique à se partager) garde encore le rendu scindé d'origine. */
export function coopNetP2() { return S.COOP && S.ctrlConns.some(o => o.net && o.player === 2); }
/* Le canevas du J2 en ligne n'est JAMAIS affiché localement (voir plus bas) :
   inutile de le rendre à la résolution retina de l'hôte pour l'envoyer
   ensuite en visio — à bitrate égal, plus de pixels à compresser ne donne
   qu'une image PLUS FLOUE. On le plafonne à une résolution confortable
   pour le streaming, en conservant le ratio d'affichage de l'hôte
   (dimensions paires : plus sûr pour l'encodeur H.264/VP8).
   v9.1 (retour joueur) — ramené de 1600 à 1280 : sur une partie EN TEMPS
   RÉEL, moins de pixels à encoder à chaque image laisse à l'encodeur toute
   la marge nécessaire pour rester fluide (voir tuneVideoQuality, Network.js)
   au lieu d'accumuler du retard sur une liaison modeste. */
const NET_MAX_DIM = 1280;
function netP2Size() {
  let w = innerWidth, h = innerHeight;
  const ar = w / h;
  if (Math.max(w, h) > NET_MAX_DIM) {
    if (w >= h) { w = NET_MAX_DIM; h = Math.round(w / ar); }
    else { h = NET_MAX_DIM; w = Math.round(h * ar); }
  }
  w -= w % 2; h -= h % 2;
  return { w, h };
}
export function setCamAspects() {
  const halfScreen = S.COOP && !coopNetP2();
  S.camera.aspect = (halfScreen ? innerWidth / 2 : innerWidth) / innerHeight;
  S.camera.updateProjectionMatrix();
  S.cam2.aspect = (halfScreen ? innerWidth / 2 : innerWidth) / innerHeight;
  S.cam2.updateProjectionMatrix();
  if (S.renderer2) { const { w, h } = netP2Size(); S.renderer2.setSize(w, h); }
  if (S.composer2) { const { w, h } = netP2Size(); S.composer2.setSize(w, h); }
}
/* Second rendu, dédié au Joueur 2 en ligne : même pipeline (bloom compris)
   que le J1, sur un canevas séparé — jamais affiché localement (opacity 0,
   hors du flux visuel), seulement capturé (captureStream) et diffusé au
   joueur distant. Créé une seule fois, à la première connexion en ligne
   du J2 (voir Network.startNetVideo). Résolution plafonnée (netP2Size) :
   ne sert qu'au streaming, pas à un affichage local, pas la peine de payer
   le prix (bande passante, netteté) d'un rendu retina. */
export function ensureP2Renderer() {
  if (S.renderer2) return;
  const { w, h } = netP2Size();
  /* v9.2 (retour joueur : « ça bug énormément côté J2 ») — ce rendu n'est
     JAMAIS vu localement, seulement compressé en vidéo : l'antialiasing
     (lissage des bords) et les ombres portées disparaissent quasiment dans
     la compression, mais coûtent cher au GPU. Les couper ici (SEULEMENT ce
     second rendu — le J1 garde les siennes) rend une bonne partie du coût
     GPU perdu en calculant deux scènes complètes chaque image, sans toucher
     à la résolution ni à la netteté du flux envoyé. */
  S.renderer2 = new THREE.WebGLRenderer({ antialias: false });
  S.renderer2.setPixelRatio(1);
  S.renderer2.setSize(w, h);
  S.renderer2.shadowMap.enabled = false;
  S.renderer2.outputColorSpace = THREE.SRGBColorSpace;
  S.renderer2.toneMapping = THREE.ACESFilmicToneMapping;
  S.renderer2.toneMappingExposure = 1.05;
  S.renderer2.domElement.style.cssText = 'position:fixed;inset:0;opacity:0;pointer-events:none;z-index:-1;';
  document.body.appendChild(S.renderer2.domElement);
  S.composer2 = new EffectComposer(S.renderer2);
  S.renderPass2 = new RenderPass(S.scene, S.cam2);
  S.bloomPass2 = new UnrealBloomPass(new THREE.Vector2(w, h), 0.62, 0.42, 0.95);
  S.composer2.addPass(S.renderPass2);
  S.composer2.addPass(S.bloomPass2);
  S.composer2.addPass(new OutputPass());
}

/* ---------------- GÉOMÉTRIE & COLLISIONS ---------------- */
export function mkBox(w, h, d, x, y, z, kind, solid) {
  const mat = (typeof kind === 'string') ? matFor(kind, Math.max(w, d) / 3, (h > 1.2 ? h : Math.max(w, d)) / 3) : kind;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  S.scene.add(m);
  if (solid !== false) addCol(m);
  return m;
}
export function mkCyl(r1, r2, h, x, y, z, kind, solid, seg) {
  const mat = (typeof kind === 'string') ? matFor(kind, 2, Math.max(1, h / 3)) : kind;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg || 9), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  S.scene.add(m);
  if (solid !== false) addCol(m);
  return m;
}
export function addCol(m) {
  m.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(m);
  // la référence au mesh permet le « dithering » caméra (mur occultant à 20 %)
  const c = { min: b.min.clone(), max: b.max.clone(), on: true, mesh: m };
  colliders.push(c);
  return c;
}
export function overlapP(pl, c) {
  const p = pl.pos, r = 0.42, h = 1.7;
  return c.on &&
    p.x + r > c.min.x && p.x - r < c.max.x &&
    p.y + h > c.min.y && p.y < c.max.y &&
    p.z + r > c.min.z && p.z - r < c.max.z;
}
export function slide(axis, delta) { slideP(player, axis, delta); }
export function slideP(pl, axis, delta) {
  if (delta === 0) return;
  const p = pl.pos, r = 0.42, h = 1.7;
  p[axis] += delta;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!overlapP(pl, c)) continue;
    if (axis === 'y') {
      if (delta < 0) {
        /* Atterrissage : on ne se pose sur le DESSUS que si les pieds
           venaient bien d'au-dessus. Sinon (enfoncé LATÉRALEMENT dans la
           boîte par un recul, une jointure de murs ou un spawn), l'ancien
           code téléportait le joueur AU SOMMET du mur — c'était le fameux
           « certains murs se franchissent » : on repousse désormais par le
           côté le moins profond, jamais par le toit. */
        if (p.y - delta >= c.max.y - 0.35) { p.y = c.max.y; pl.vel.y = 0; pl.grounded = true; }
        else {
          p.y -= delta; // on annule la descente, puis on expulse à l'horizontale
          const pushW = (p.x + r) - c.min.x, pushE = c.max.x - (p.x - r);
          const pushN = (p.z + r) - c.min.z, pushS = c.max.z - (p.z - r);
          const m = Math.min(pushW, pushE, pushN, pushS);
          if (m === pushW) p.x = c.min.x - r - 0.001;
          else if (m === pushE) p.x = c.max.x + r + 0.001;
          else if (m === pushN) p.z = c.min.z - r - 0.001;
          else p.z = c.max.z + r + 0.001;
        }
      } else { p.y = c.min.y - h; pl.vel.y = Math.min(0, pl.vel.y); }
    } else {
      // Rattrapage de rebord : si le sommet de l'obstacle est à portée de pas
      // (à pied ou en plein saut) et qu'il y a de la place au-dessus, on grimpe dessus.
      const stepY = c.max.y;
      const canMantle = (stepY - p.y) <= STEP_HEIGHT && !pointSolid(p.x, stepY + 0.05, p.z) && !pointSolid(p.x, stepY + h * 0.6, p.z);
      if (canMantle) {
        p.y = stepY;
        pl.vel.y = Math.max(pl.vel.y, 0);
        pl.grounded = true;
      } else {
        p[axis] = delta > 0 ? c.min[axis] - r - 0.001 : c.max[axis] + r + 0.001;
      }
    }
  }
}
// Test rayon/boîte (slab method) : renvoie la distance du premier contact ou null
export function rayAABB(o, d, min, max) {
  let tmin = 0, tmax = 1e9;
  for (const ax of ['x', 'y', 'z']) {
    const inv = 1 / (d[ax] || 1e-9);
    let t1 = (min[ax] - o[ax]) * inv, t2 = (max[ax] - o[ax]) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin >= 0 ? tmin : null;
}
export function pointSolid(x, y, z) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.on && x > c.min.x && x < c.max.x && y > c.min.y && y < c.max.y && z > c.min.z && z < c.max.z) return true;
  }
  return false;
}

/* ---------------- PORTES ---------------- */
export function mkDoor(w, h, d, x, y, z, kind) {
  const m = mkBox(w, h, d, x, y, z, kind, true);
  const dr = { mesh: m, col: colliders[colliders.length - 1], open: false, baseY: m.position.y, lift: h - 0.35, t: 0 };
  doors.push(dr);
  return dr;
}
export function openDoor(dr) {
  if (dr.open) return;
  dr.open = true; dr.col.on = false; A.door();
}
export function updateDoors(dt) {
  for (const d of doors) {
    if (d.open && d.t < 1) {
      d.t = Math.min(1, d.t + dt * 0.45);
      d.mesh.position.y = d.baseY + d.t * d.lift;
    }
  }
}

/* ---------------- DÉCOR ---------------- */
export function torch(x, y, z, color, intensity, dist) {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 6), matFor('woodF', 1, 1));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6),
    new THREE.MeshBasicMaterial({ color: color || 0xffc06a }));
  flame.position.y = 0.62;
  const halo = glow(color || 0xff9c4a, 2.6, 0.5);
  halo.position.y = 0.66;
  const light = new THREE.PointLight(color || 0xff8c3a, (intensity || 1.35) * LIGHT_SCALE, dist || 20, 2);
  light.position.y = 0.72;
  g.add(stick, flame, halo, light);
  g.position.set(x, y, z);
  S.scene.add(g);
  flames.push({ flame, light, halo, base: (intensity || 1.35) * LIGHT_SCALE, seed: Math.random() * 10 });
}
export function tree(x, z, s) {
  s = s || 1;
  /* Variété procédurale (déterministe selon la position, pas de hasard) :
     l'érable a un feuillage plus large et plus bas que le chêne. */
  const maple = Math.abs(Math.round(x * 13 + z * 7)) % 3 === 0;
  const rot = (x * 7 + z * 3) % 6;
  mkCyl(0.2 * s, 0.3 * s, 1.6 * s, x, 0, z, 'trunk', true, 7);
  const r1 = maple ? 1.75 : 1.5, h1 = maple ? 2.1 : 2.6, y1 = maple ? 2.1 : 2.5;
  const r2 = maple ? 1.3 : 1.1, h2 = maple ? 1.7 : 2.1, y2 = maple ? 3.1 : 3.6;
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(r1 * s, h1 * s, 8), matFor('leaf', 1, 1));
  c1.position.set(x, y1 * s, z); c1.rotation.y = rot; c1.castShadow = true; S.scene.add(c1);
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(r2 * s, h2 * s, 8), matFor('leaf', 1, 1));
  c2.position.set(x, y2 * s, z); c2.rotation.y = rot; c2.castShadow = true; S.scene.add(c2);
}
/* Paliers de niveau des arts anciens (retour joueur : on récoltait les 6
   sorts trop vite — désormais, chaque art exige un porteur assez aguerri,
   il faut VRAIMENT monter en niveau entre deux pouvoirs). */
export const POWER_LVL = { dash: 2, tk: 3, heal: 5, shield: 6, frost: 7, nova: 12, meteor: 14 };
export function pedestal(x, z, y, powerId, color, lore, questId) {
  mkBox(1.3, 1.1, 1.3, x, y, z, 'stoneR');
  const cry = new THREE.Mesh(new THREE.OctahedronGeometry(0.34),
    new THREE.MeshBasicMaterial({ color }));
  cry.position.set(x, y + 1.75, z);
  cry.add(glow(color, 2.4, 0.6));
  S.scene.add(cry); spinners.push(cry);
  pedestals.push({ powerId, cry });
  const pw = POWERS.find(p => p.id === powerId);
  addInter(x, y, z, 2.5, 'Recueillir « ' + pw.name + ' »', it => {
    const need = POWER_LVL[powerId] || 0;
    if (G.level < need) {
      showMsg('L\'art se dérobe : votre flamme est trop jeune. « ' + pw.name + ' » exige le NIVEAU ' + need +
        ' (vous : ' + G.level + '). Terrassez des ombres et revenez.', 4.5);
      return;
    }
    it.on = false; S.scene.remove(cry);
    const idx = spinners.indexOf(cry); if (idx >= 0) spinners.splice(idx, 1);
    G.powers[powerId] = true; G.sel = powerId;
    A.power(); refreshPowers();
    spawnBurst(x, y + 1.6, z, color, 18);
    showMsg(lore, 5.5);
    guide('spell', [
      'NOUVEL ART ANCIEN — chaque sort appris s\'ajoute à votre barre, en bas de l\'écran. Touches 1 à 6 pour le préparer, clic gauche pour le lancer (sur manette : X reste l\'attaque, les autres sorts se placent sur Y/LB/RB/LT/RT dans ⚙ Réglages).',
      'Les sorts coûtent du MANA (barre bleue, elle se régénère seule) et ont un temps de recharge visible sur leur case. Chaque porte d\'Ombreciel n\'obéit qu\'à un art précis : un passage infranchissable aujourd\'hui attend simplement le bon sort.'
    ]);
    if (questId) questReach(questId);
  });
}

/* ---------------- OBJETS À RAMASSER ----------------
   Langage visuel de rareté : chaque type a une FORME reconnaissable
   (plante, plume, os, fil, cœur...), et les objets rares ou uniques
   portent une COLONNE DE LUMIÈRE verticale — quand un pilier brille au
   loin, c'est que quelque chose d'important vous attend.
   hidden=true : l'objet existe dès la construction du monde (les index de
   sauvegarde restent stables) mais reste invisible et intouchable tant
   qu'une énigme ne l'a pas révélé (revealPickup). */
function rareBeam(color, strong) {
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, strong ? 9 : 6, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: strong ? 0.22 : 0.14,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  b.position.y = strong ? 4.2 : 2.8;
  return b;
}
export function addPickup(type, x, y, z, hidden) {
  let mesh;
  if (type === 'star') {
    /* Éclat d'Aube étoilée : secret majeur (3 = Faveur des Étoiles) */
    mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.3),
      new THREE.MeshBasicMaterial({ color: 0xfff1b8 }));
    mesh.add(glow(0xfff1b8, 3, 0.75));
    const l = new THREE.PointLight(0xffe9a0, 0.8 * LIGHT_SCALE, 8, 2);
    mesh.add(l);
    mesh.add(rareBeam(0xfff1b8, true));
  } else if (type === 'crystal') {
    /* LARME D'AUBE — objectif : gros octaèdre doré + pilier de lumière */
    mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.42),
      new THREE.MeshBasicMaterial({ color: 0xffd97a }));
    mesh.add(glow(0xffd97a, 3.4, 0.7));
    const l = new THREE.PointLight(0xffc86a, 0.9 * LIGHT_SCALE, 9, 2);
    mesh.add(l);
    mesh.add(rareBeam(0xffd97a, true));
  } else if (type === 'key') {
    /* CLEF — anneau + tige d'or, pilier doré (unique) */
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 12), matFor('gold', 1, 1));
    const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), matFor('gold', 1, 1));
    tige.position.y = -0.35;
    g.add(ring, tige, glow(0xffd97a, 1.8, 0.5), rareBeam(0xffd97a, false));
    mesh = g;
  } else if (type === 'mana') {
    /* commun : petite sphère bleue discrète */
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x5fc8ff }));
    mesh.add(glow(0x5fc8ff, 1.7, 0.6));
  } else if (type === 'heart') {
    /* commun : losange rouge */
    mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.24),
      new THREE.MeshBasicMaterial({ color: 0xff5566 }));
    mesh.add(glow(0xff5566, 1.6, 0.55));
  } else if (type === 'herb') {
    /* HERBE LUNAIRE — une vraie petite plante : tige + trois feuilles */
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.4, 5),
      new THREE.MeshBasicMaterial({ color: 0x3d8a4a }));
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 4),
        new THREE.MeshBasicMaterial({ color: 0x6fe07a }));
      const a = i * 2.1;
      leaf.position.set(Math.cos(a) * 0.11, 0.24, Math.sin(a) * 0.11);
      leaf.rotation.set(Math.sin(a) * 0.55, 0, Math.cos(a) * 0.55);
      g.add(leaf);
    }
    g.add(stem, glow(0x6fe07a, 1.4, 0.45));
    mesh = g;
  } else if (type === 'shadow') {
    /* ESSENCE D'OMBRE — tétraèdre sombre dans un anneau violet */
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.TetrahedronGeometry(0.22),
      new THREE.MeshBasicMaterial({ color: 0x9a6cff }));
    const ringE = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 5, 14),
      new THREE.MeshBasicMaterial({ color: 0x7a4cdd, transparent: true, opacity: 0.7 }));
    ringE.rotation.x = 1.2;
    g.add(core, ringE, glow(0x7a4cdd, 1.8, 0.55));
    mesh = g;
  } else if (type === 'feather') {
    /* PLUME SPECTRALE (Traqueurs) — voile effilé penché, vert pâle */
    const g = new THREE.Group();
    const quill = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.62, 4),
      new THREE.MeshBasicMaterial({ color: 0xa8ffd8 }));
    quill.scale.z = 0.28; quill.rotation.z = 0.9;
    g.add(quill, glow(0x5affc8, 1.6, 0.5));
    mesh = g;
  } else if (type === 'bone') {
    /* OS DE COLOSSE (Colosses) — fémur ivoire : tige + deux condyles */
    const g = new THREE.Group();
    const boneMat = new THREE.MeshBasicMaterial({ color: 0xe8e2cc });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.44, 6), boneMat);
    shaft.rotation.z = 0.7;
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), boneMat);
    b1.position.set(-0.17, 0.14, 0);
    const b2 = b1.clone(); b2.position.set(0.17, -0.14, 0);
    g.add(shaft, b1, b2, glow(0xffb86a, 1.5, 0.45));
    mesh = g;
  } else if (type === 'thread') {
    /* FIL D'ÉTHER (Tisseurs) — nœud torsadé orange qui semble tissé */
    mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(0.16, 0.045, 36, 6),
      new THREE.MeshBasicMaterial({ color: 0xffa04a }));
    mesh.add(glow(0xff8a5a, 1.7, 0.55));
  } else if (type === 'nightheart') {
    /* CŒUR DE NUIT — RARE : cœur grenat, halo puissant et PILIER ROUGE
       visible de loin. Quand vous voyez ça, courez le chercher. */
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.27, 0),
      new THREE.MeshBasicMaterial({ color: 0xd81a44 }));
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0),
      new THREE.MeshBasicMaterial({ color: 0x5a0a20, transparent: true, opacity: 0.4, wireframe: true }));
    g.add(core, shell, glow(0xff3a5a, 3, 0.8), rareBeam(0xff3a5a, true));
    const l = new THREE.PointLight(0xff3a5a, 0.8 * LIGHT_SCALE, 8, 2);
    g.add(l);
    mesh = g;
  } else {
    /* FRAGMENT DE VITALITÉ (secret) — octaèdre rose + pilier : rare */
    mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.36),
      new THREE.MeshBasicMaterial({ color: 0xff8899 }));
    mesh.add(glow(0xff8899, 2.4, 0.6));
    mesh.add(rareBeam(0xff8899, false));
  }
  mesh.position.set(x, y + 0.9, z);
  mesh.visible = !hidden;
  S.scene.add(mesh);
  const p = { mesh, type, y0: y + 0.9, taken: false, hidden: !!hidden };
  pickups.push(p);
  return p;
}
/* Révélation d'un objet caché par une énigme (éclair doré + apparition) */
export function revealPickup(p) {
  if (!p || p.taken || !p.hidden) return;
  p.hidden = false;
  p.mesh.visible = true;
  spawnBurst(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0xfff1b8, 22);
  A.power();
}
/* ---- Reconstruction des énigmes au chargement d'une sauvegarde ----
   Chaque énigme qui révèle un objet caché enregistre ici une fonction qui
   relit l'état persistant (flags `inter[i].on`) et ré-applique visuels et
   révélations. SaveSystem.loadGame les appelle après avoir restauré inter. */
export const RESTORES = [];
export function runRestores() { for (const f of RESTORES) f(); }
export function updatePickups(dt) {
  for (const p of pickups) {
    if (p.taken || p.hidden) continue;
    p.mesh.rotation.y += dt * 1.8;
    p.mesh.position.y = p.y0 + Math.sin(G.time * 2.4 + p.y0) * 0.14;
    const byP1 = player.pos.distanceTo(p.mesh.position) < 1.6;
    const byP2 = S.COOP && p2.pos && p2.pos.distanceTo(p.mesh.position) < 1.6;
    if (byP1 || byP2) {
      S.actingPlayer = byP1 ? 1 : 2; // attribue le guide du porteur au bon joueur (v9)
      p.taken = true; S.scene.remove(p.mesh);
      if (p.type === 'crystal') {
        G.crystals++; A.power();
        spawnBurst(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0xffd97a, 20);
        showMsg('Larme d\'Aube recueillie — ' + G.crystals + ' / 3', 4);
        if (QUESTS[S.questI] && QUESTS[S.questI].id === 'tears') {
          if (G.crystals >= 3) applyQuest(); // la suite : l'Ascension, puis l'Outre-Ciel
          else $('objective').textContent = '✧ Objectif — Réunissez les 3 Larmes d\'Aube (' + G.crystals + ' / 3). Lumen connaît peut-être des secrets...';
        }
        if (G.crystals >= 3) setTimeout(winGame, 1400);
        /* (plus de point de contrôle gratuit ici : seuls les bivouacs,
           volontairement rares, fixent votre point de renaissance) */
      } else if (p.type === 'herb') {
        G.herbs++; A.pickup();
        showMsg('Herbe lunaire cueillie (☘ ' + G.herbs + ').', 2.2);
        guide('herb', [
          'HERBE LUNAIRE ☘ — la ressource de SOIN. Elle pousse dans les jardins, la forêt et sur les paliers de la Tour.',
          'Ouvrez votre SAC avec Tab (ou 🎒 sur mobile) : le jeu se met en PAUSE. Avec 2 herbes, fabriquez-y une Potion lunaire (+50 PV) que vous gardez pour plus tard — et buvez-la au meilleur moment avec H, même en plein combat.',
          'Les herbes entrent aussi dans les philtres et élixirs plus puissants : n\'en gaspillez pas une seule.'
        ]);
      } else if (p.type === 'shadow') {
        G.shadows++; A.pickup();
        showMsg('Essence d\'ombre absorbée (● ' + G.shadows + ').', 2.2);
        guide('shadow', [
          'ESSENCE D\'OMBRE ● — lâchée par les Ombres ordinaires que vous terrassez.',
          'Dans le SAC (Tab), 3 essences se condensent en un ORBE D\'OBSCURITÉ ◉. Les orbes sont la matière des deux transcendances : 2 orbes rendent votre attaque de base EXPLOSIVE (dégâts de zone), 3 orbes déploient les AILES d\'Ombreciel (double saut + plané).',
          'Chaque archétype d\'ombre lâche SA ressource : observez ce que laissent les Traqueurs verts, les Colosses rouges et les Tisseurs... chacune ouvre une voie de build différente.'
        ]);
      } else if (p.type === 'feather') {
        G.feathers++; A.pickup();
        showMsg('Plume spectrale recueillie (➶ ' + G.feathers + ').', 2.2);
        guide('feather', [
          'PLUME SPECTRALE ➶ — arrachée aux TRAQUEURS, ces silhouettes vertes ultra-rapides.',
          'Au SAC (Tab) : 2 plumes + 1 herbe = Élixir du Traqueur, +20 % de vitesse pendant 2 minutes. Parfait pour traverser une zone dangereuse, fuir un Colosse... ou foncer récupérer un objet gardé.'
        ]);
      } else if (p.type === 'bone') {
        G.bones++; A.pickup();
        showMsg('Os de Colosse ramassé (☗ ' + G.bones + ').', 2.2);
        guide('bone', [
          'OS DE COLOSSE ☗ — prélevé sur les COLOSSES, les masses rouges lentes et dévastatrices.',
          'Au SAC (Tab) : 2 os + 1 herbe = Philtre de Colosse, +15 PV max PERMANENTS (cumulable 5 fois : jusqu\'à +75 PV). C\'est le build du bastion — chassez les Colosses si vous mourez trop souvent.'
        ]);
      } else if (p.type === 'thread') {
        G.threads++; A.pickup();
        showMsg('Fil d\'éther recueilli (∾ ' + G.threads + ').', 2.2);
        guide('thread', [
          'FIL D\'ÉTHER ∾ — tissé par les TISSEURS, les ombres qui vous bombardent à distance.',
          'Au SAC (Tab) : 2 fils + 1 herbe = Élixir d\'Éther, +15 PM max PERMANENTS (cumulable 5 fois). Le build du sorcier : plus de mana, plus de sorts enchaînés sans attendre.'
        ]);
      } else if (p.type === 'nightheart') {
        G.nightHearts++; A.power();
        spawnBurst(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0xff3a5a, 24);
        showMsg('♦ CŒUR DE NUIT — une ressource RARE bat entre vos mains (' + G.nightHearts + ') !', 4);
        guide('nightheart', [
          'CŒUR DE NUIT ♦ — la ressource la plus RARE du jeu. Certaines ombres vaincues, surtout les plus puissantes, en abandonnent un... parfois. Son pilier de lumière rouge se voit de loin : ne le laissez jamais derrière vous.',
          'Au SAC (Tab), un Cœur se forge en SCEAU DU CŒUR DE NUIT : +10 % de dégâts PERMANENTS, sur tout, cumulable 3 fois. C\'est le boost le plus violent d\'Ombreciel — un porteur aux 3 sceaux frappe 30 % plus fort, pour toujours.'
        ]);
      } else if (p.type === 'key') {
        G.goldKey = true; A.key();
        showMsg('Vous trouvez la Clef d\'or. Une serrure dorée l\'attend quelque part...', 4.5);
        questReach('crypt');
      } else if (p.type === 'star') {
        G.stars++; A.power();
        spawnBurst(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0xfff1b8, 26);
        if (G.stars >= 3 && !G.upgrades.starBoost) {
          G.upgrades.starBoost = true;
          G.maxMana += 20; G.mana = G.maxMana;
          G.items.push('Faveur des Étoiles (+15 % dégâts, +20 PM max)');
          showMsg('★ LA FAVEUR DES ÉTOILES ! Les trois Éclats fusionnent : +15 % de dégâts et +20 PM max, pour toujours.', 6);
        } else {
          showMsg('★ Éclat d\'Aube étoilée (' + G.stars + ' / 3). Les anciens parlaient d\'une faveur accordée au porteur des trois...', 4.5);
        }
      } else if (p.type === 'mana') {
        if (byP1) G.mana = Math.min(G.maxMana, G.mana + 35);
        else p2.mana = Math.min(p2.maxMana, p2.mana + 35);
        A.pickup();
      } else if (p.type === 'heart') {
        if (byP1) G.hp = Math.min(G.maxHp, G.hp + 30);
        else p2.hp = Math.min(p2.maxHp, p2.hp + 30);
        A.pickup();
      } else {
        G.maxHp += 25; G.hp = G.maxHp; A.power();
        G.items.push('Fragment de vitalité (+25 PV max)');
        showMsg('Secret découvert : Fragment de vitalité ! Votre vie maximale augmente.', 4.5);
      }
    }
  }
}

/* ---------------- INTERACTIONS ---------------- */
export function addInter(x, y, z, r, label, fn, kind) {
  const it = { x, y, z, r, label, fn, on: true, kind: kind || null };
  inter.push(it);
  return it;
}
export function nearInterP(pl) {
  /* La PLUS PROCHE interaction à portée gagne — pas la première enregistrée.
     (Bug « étage infranchissable » : quand une plaque d'étage chevauchait un
     portail de sas, la plaque, construite avant, volait le E pour toujours.) */
  let best = null, bestD = Infinity;
  for (const i of inter) {
    if (!i.on) continue;
    const d = Math.hypot(pl.pos.x - i.x, pl.pos.z - i.z);
    if (d < i.r && Math.abs(pl.pos.y - i.y) < 2.8 && d < bestD) { bestD = d; best = i; }
  }
  return best;
}
export function nearInter() {
  return nearInterP(player);
}
export function tryInteractP2() {
  if (!G.started || G.over || S.transitioning) return;
  if (p2.paused || (G.dialog && S.dlgWho === 2)) return; // sa propre pause/dialogue seulement
  const it = nearInterP(p2);
  if (it) { S.actingPlayer = 2; it.fn(it); }
}
export function tryInteract() {
  if (!G.started || G.paused || G.inv || G.over || G.dialog || S.transitioning) return;
  const it = nearInter();
  if (it) { S.actingPlayer = 1; it.fn(it); }
}

/* ---------------- PARTICULES ---------------- */
/* Réservoir partagé d'éclats (bursts + sillages) : réutilise les morts,
   plafonné pour la fluidité. Octaèdres plutôt que cubes : les éclats
   accrochent la lumière comme des éclats de cristal. */
function takePart() {
  let p = parts.find(q => q.life <= 0);
  if (!p) {
    if (parts.length > 240) return null;
    p = { mesh: new THREE.Mesh(new THREE.OctahedronGeometry(0.095, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff })), vel: new THREE.Vector3(), life: 0 };
    S.scene.add(p.mesh); parts.push(p);
  }
  return p;
}
export function spawnBurst(x, y, z, color, n) {
  for (let i = 0; i < n; i++) {
    const p = takePart();
    if (!p) break;
    p.mesh.material.color.setHex(color);
    p.mesh.position.set(x, y, z);
    p.mesh.rotation.set(Math.random() * 2, Math.random() * 2, 0);
    p.mesh.visible = true;
    p.mesh.scale.setScalar(1);
    p.vel.set((Math.random() - 0.5) * 7, Math.random() * 5 + 1.5, (Math.random() - 0.5) * 7);
    p.life = 0.55 + Math.random() * 0.25;
  }
}
/* Sillage de projectile : éclat quasi immobile à courte vie, semé chaque
   frame le long de la trajectoire — le tir laisse une queue de comète. */
export function spawnTrail(x, y, z, color) {
  const p = takePart();
  if (!p) return;
  p.mesh.material.color.setHex(color);
  p.mesh.position.set(x + (Math.random() - 0.5) * 0.14, y + (Math.random() - 0.5) * 0.14,
    z + (Math.random() - 0.5) * 0.14);
  p.mesh.rotation.set(Math.random() * 2, Math.random() * 2, 0);
  p.mesh.visible = true;
  p.mesh.scale.setScalar(0.6);
  p.vel.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5 + 0.6, (Math.random() - 0.5) * 0.5);
  p.life = 0.2 + Math.random() * 0.12;
}
export function updateParticles(dt) {
  for (const p of parts) {
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.life -= dt;
    p.vel.y -= 11 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.scale.setScalar(Math.max(0.05, p.life * 1.6));
    if (p.life <= 0) p.mesh.visible = false;
  }
}

/* ---------------- CUBES RUNIQUES ---------------- */
export function mkTkCube(x, y, z) {
  const m = mkBox(1.1, 1.1, 1.1, x, y, z, 'rune', false);
  const col = { min: new THREE.Vector3(), max: new THREE.Vector3(), on: true };
  colliders.push(col);
  const c = { mesh: m, col, half: 0.55, vel: 0, held: false };
  tkCubes.push(c);
  syncCube(c);
  return c;
}
export function syncCube(c) {
  const p = c.mesh.position, h = c.half;
  c.col.min.set(p.x - h, p.y - h, p.z - h);
  c.col.max.set(p.x + h, p.y + h, p.z + h);
  c.col.on = !c.held;
}

/* ---------------- DÉGÂTS & VICTOIRE ---------------- */
export function winGame() {
  if (G.over) return;
  G.over = true;
  if (document.exitPointerLock) document.exitPointerLock();
  $('win').classList.remove('hidden');
}

/* Après la quête principale, Lumen devient le guide de l'Ascension puis de
   l'Outre-Ciel (v8) : son indice suit l'avancée de la Tour, étape par étape,
   jusqu'à la Couronne de l'Aube. */
function towerLumenHint() {
  const T = G.tower;
  const known = POWERS.slice(0, 6).filter(p => G.powers[p.id]).length;
  if (known < 6)
    return 'Les trois Larmes brûlent à nouveau... mais il te manque des arts anciens (' + known + ' / 6). Le portail doré de la terrasse de la Tour du Levant ne s\'ouvre qu\'aux six.';
  if (!T.aura)
    return 'Le portail doré de la terrasse t\'attend : vingt étages, quatre clefs. Au quinzième, l\'Observatoire de l\'Aube — et une vérité que je te dois depuis trop longtemps.';
  if (!T.met.maela)
    return 'Près de l\'autel de l\'Observatoire, une ombre agenouillée essaie de parler depuis un siècle. Ton Aura est sa voix, porteur de flamme : écoute-la.';
  if (!T.bosses.berger)
    return T.bridge
      ? 'Le pont de constellations est tissé : l\'île du Berger des Étoiles t\'attend au sommet de l\'Outre-Ciel. Vise son troupeau quand il plonge.'
      : 'Dans l\'Outre-Ciel, retrouve les trois Éclats d\'étoile d\'Orin (' + T.shards + ' / 3) : sans son pont de constellations, l\'île du Berger reste hors d\'atteinte.';
  if (!T.met.veilleur)
    return 'La Clef d\'Astre ouvre le Cœur de la Nuit sans lune. Au bout de la salle figée, un Veilleur garde la dernière porte : parle-lui — il attend depuis cent ans.';
  if (!T.bosses.avale)
    return 'L\'Avale-Lune digère la lune derrière la porte de la Dernière Nuit. Souviens-toi : la Nova d\'Aurore (touche 7), prononcée tout contre son voile, le déchire — frappe quand il saigne de lumière.';
  if (!T.crown)
    return 'La bête est déchirée... mais la Couronne de l\'Aube attend toujours son porteur, au centre de l\'arène. Retourne la cueillir.';
  return 'La lune veille à nouveau sur Ombreciel, et les ombres dorment enfin. Il n\'y a plus rien que je puisse t\'apprendre — merci, porteur d\'aube.';
}

/* ================================================================
   CONSTRUCTION DU MONDE — refonte v7
   Progression verrouillée par les pouvoirs (aucun passage ne peut être
   « glitché » par-dessus les murs) :
     jardins (combat) → hall (herse) → bibliothèque (levier) → PAS DU VENT
     → pont brisé du parvis (DASH) → Tour du Levant → MAIN CÉLESTE
     → plaque de l'aile est (TK) → catacombes → Ossuaire-labyrinthe
     (Bénédiction + Clef d'or) → Gouffre des Morts (DASH) → ÉGIDE
     → rideau de flammes (ÉGIDE active) → Larme 1 → trône (CLEF) → Larme 2
     → passage scellé (2 LARMES) → Terres Perdues → SOUFFLE GLACÉ
     → ronces ardentes (GIVRE) → Forêt de Nuit (labyrinthe, murs de 7,5 m)
     → arbre-sanctuaire (BÉNÉDICTION) → Clairière du Cœur → Larme 3.
   Garde-fous anti-glitch : hauteur de saut max ≈ 2,85 m (+0,62 de mantle,
   +1,1 si le bloc runique sert d'escabeau) → tout mur de progression fait
   ≥ 4,8 m ; toutes les salles intérieures ont un PLAFOND ; les brèches à
   franchir au Pas du vent font 11,5 m (saut sprinté seul ≈ 9,4 m).
   ================================================================ */

/* Murs de labyrinthe depuis une carte ASCII ('#' = mur, autre = libre).
   Les '#' consécutifs d'une ligne sont fusionnés en une seule boîte.
   (Exporté : l'Ossuaire instancié des catacombes s'en sert — Rooms.js.) */
export function asciiWalls(rows, ox, oz, cell, h, y, kind) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    let c = 0;
    while (c < row.length) {
      if (row[c] !== '#') { c++; continue; }
      let c2 = c;
      while (c2 < row.length && row[c2] === '#') c2++;
      const w = (c2 - c) * cell;
      mkBox(w, h, cell, ox + c * cell + w / 2, y, oz - (r + 0.5) * cell, kind);
      c = c2;
    }
  }
}

/* ---- Sanctuaires : la lumière des bivouacs repousse les ombres ----
   Dans un rayon de 9 m autour de chaque feu, aucun monstre n'entre ni
   n'attaque (elles fuient), le porteur de flamme se régénère lentement et
   le directeur de renforts n'y invoque jamais rien : un vrai havre pour
   souffler, forger ses potions et dépenser ses points de pouvoir. */
export const SAFE_R = 9;
export function safeZoneAt(pos) {
  if (!pos) return null;
  for (const c of CAMPS) {
    /* v8.4 — braises froides (campHeal[id] === false) : le feu ne repousse
       PLUS les ombres. Le sanctuaire ne protège que tant que sa braise n'a
       pas été consommée — fini le camping éternel derrière le cercle. */
    if (G.campHeal[c.id] === false) continue;
    if (Math.abs(pos.y - c.y) < 3.2 && Math.hypot(pos.x - c.x, pos.z - c.z) < (c.safeR || SAFE_R)) return c;
  }
  return null;
}

/* Feu de bivouac : point de contrôle réutilisable (sans PointLight pour
   ménager le budget lumières — le halo additif suffit à le signaler).
   Chaque feu s'inscrit dans la matrice des Bivouacs (CAMPS) : se reposer le
   « découvre » et ouvre l'interface de voyage rapide (voir UI.openTravel). */
/* r (optionnel) : rayon du sanctuaire. En INTÉRIEUR (salles, paliers de la
   Tour), passer un rayon réduit (4-5 m) — le grand cercle de 9 m débordait
   à travers les murs et donnait des bivouacs « énormes » et bizarres. */
export function bivouac(x, y, z, label, id, travel, r) {
  const safeR = r || SAFE_R;
  const l1 = mkBox(0.9, 0.26, 0.26, x - 0.12, y, z - 0.08, 'woodF', false); l1.rotation.y = 0.6;
  const l2 = mkBox(0.9, 0.26, 0.26, x + 0.12, y, z + 0.12, 'woodF', false); l2.rotation.y = -0.5;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.75, 6),
    new THREE.MeshBasicMaterial({ color: 0xffb05a }));
  flame.position.set(x, y + 0.5, z);
  S.scene.add(flame);
  const halo = glow(0xff9c4a, 3, 0.55);
  halo.position.set(x, y + 0.6, z);
  S.scene.add(halo);
  flames.push({ flame, light: null, halo, base: 0, seed: Math.random() * 10 });
  /* cercle du sanctuaire : la frontière que les ombres ne franchissent pas,
     visible en permanence pour que le joueur SACHE où il est en sécurité */
  const ring = new THREE.Mesh(new THREE.RingGeometry(safeR - 0.35, safeR, 44),
    new THREE.MeshBasicMaterial({ color: 0xffc06a, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, y + 0.07, z);
  S.scene.add(ring);
  /* les feux instanciés (Tour) se réenregistrent à chaque build du palier :
     on réutilise leur fiche pour ne jamais dupliquer la matrice */
  const cid = id || ('camp' + CAMPS.length);
  let camp = CAMPS.find(c => c.id === cid);
  if (!camp) {
    camp = { id: cid, label: label || 'bivouac', x: x + 1, y: y + 0.2, z, travel: travel !== false, safeR };
    CAMPS.push(camp);
  }
  addInter(x, y, z, 2.6, 'Se reposer au bivouac', () => {
    G.checkpoint = { x: x + 1, y: y + 0.2, z };
    /* v8.4 — LA BRAISE : chaque feu ne soigne qu'UNE fois. Elle se ravive en
       voyageant vers ce feu (matrice) ou en gagnant un niveau. Une fois
       froide, le feu reste un point de renaissance + voyage rapide, mais ne
       soigne plus ET ne repousse plus les ombres (safeZoneAt). */
    const charged = G.campHeal[camp.id] !== false;
    const first = !G.camps[camp.id];
    G.camps[camp.id] = true;
    if (charged) {
      G.campHeal[camp.id] = false; // braise consommée
      G.hp = G.maxHp; G.mana = G.maxMana;
      if (S.COOP && p2.pos) { p2.hp = p2.maxHp; p2.mana = p2.maxMana; }
      A.pickup();
      spawnBurst(x, y + 1, z, 0xffc06a, 12);
      showMsg('Vous vous reposez près du feu' + (label ? ' — ' + label : '') + '. La braise vous rend vos forces... puis pâlit : elle ne soignera plus avant de se raviver.', 4);
    } else {
      showMsg('Les braises sont froides : le feu marque votre point de renaissance, mais ne soigne plus — et son cercle ne repousse plus les ombres. (Se ravive : voyage rapide vers ce feu, ou prochain niveau.)', 4.5);
    }
    guide('camp', [
      'BIVOUAC 🔥 — votre point de renaissance. Se reposer fixe votre retour et ouvre le voyage rapide entre les feux découverts.',
      'LA BRAISE : chaque feu ne rend vos forces qu\'UNE seule fois — ensuite elle refroidit, et le cercle du feu ne repousse plus les ombres. Elle se ravive quand vous VOYAGEZ vers ce feu, ou quand vous gagnez un niveau. Fabriquez des potions d\'avance au sac (Tab) : les feux ne feront plus le travail à votre place.'
    ]);
    openTravel(camp, charged);
    if (first) saveGame(true); // découvrir un feu vaut bien une sauvegarde
  });
}

/* Rideau de flammes accroché à une porte : les cônes montent avec elle.
   (Exporté : la chambre de la Première Larme, instanciée, s'en sert.) */
export function doorFlames(dr, offsets, color) {
  for (const [lx, ly, lz] of offsets) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.1, 6),
      new THREE.MeshBasicMaterial({ color: color || 0xff7a3a }));
    f.position.set(lx, ly, lz);
    dr.mesh.add(f);
    const h = glow(color || 0xff7a3a, 2.6, 0.5);
    h.position.set(lx, ly + 0.3, lz);
    dr.mesh.add(h);
    flames.push({ flame: f, light: null, halo: h, base: 0, seed: Math.random() * 10 });
  }
  const light = new THREE.PointLight(color || 0xff7a3a, 1.3 * LIGHT_SCALE, 14, 2);
  dr.mesh.add(light);
}

export function buildWorld() {
  /* ---- SOL (les catacombes sont une salle instanciée : plus de puits) ---- */
  mkBox(220, 1, 180, 0, -1, -10, 'grass');          // z -100..80 d'un seul tenant

  /* ---- ENCEINTE DU MONDE (infranchissable, 14 m) ---- */
  mkBox(1, 14, 180, -62, 0, -10, 'stoneD');
  mkBox(1, 14, 180, 74, 0, -10, 'stoneD');
  mkBox(137, 14, 1, 6, 0, 80, 'stoneD');
  mkBox(137, 14, 1, 6, 0, -100, 'stoneD');

  /* ================================================================
     JARDINS DU CRÉPUSCULE (départ, niveau 1) — z 32..80
     ================================================================ */
  mkBox(4, 0.06, 44, 0, 0.02, 55, 'path', false); // allée fontaine → herse

  /* Façade du château : un seul passage, la herse (levée après la purge). */
  mkBox(59.5, 10, 1.5, -32.25, 0, 31.75, 'stone');
  mkBox(71.5, 10, 1.5, 38.25, 0, 31.75, 'stone');
  mkBox(5, 5.5, 1.5, 0, 4.5, 31.75, 'stone'); // linteau
  S.gateDoor = mkDoor(5, 4.5, 1.5, 0, 0, 31.75, 'iron');
  addInter(0, 0, 34.2, 2.6, 'Examiner la herse', it => {
    if (S.gateDoor.open) { it.on = false; showMsg('La herse est levée : le grand hall vous attend.', 2.5); }
    else showMsg('La herse restera close tant que des Ombres rôdent dans les jardins.', 3);
  });
  torch(-3.6, 0, 33.2); torch(3.6, 0, 33.2);

  /* Fontaine du sanctuaire */
  mkCyl(3, 3.3, 0.7, 0, 0, 42, 'stoneR', true, 14);
  const wa = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.1, 14),
    new THREE.MeshStandardMaterial({ color: 0x2a6a9e, roughness: 0.15, metalness: 0.4, emissive: 0x0a2038 }));
  wa.position.set(0, 0.72, 42); S.scene.add(wa);
  mkCyl(0.4, 0.55, 1.7, 0, 0.7, 42, 'stoneR', false, 8);
  /* SECRET — l'offrande de la fontaine : « une part d'ombre pour une part
     d'étoile ». Sacrifier 1 essence d'ombre révèle un Éclat d'Aube étoilée
     au sommet de la colonne (1er des 3 Éclats de la Faveur des Étoiles). */
  const fountainStar = addPickup('star', 0, 2.45, 42, true);
  const fountainInter = addInter(0, 0, 45.6, 2.3, 'Sonder le bassin de la fontaine', it => {
    if (G.shadows >= 1) {
      G.shadows--;
      it.on = false;
      revealPickup(fountainStar);
      showMsg('L\'essence d\'ombre se dissout dans l\'eau claire... et une lumière monte des profondeurs : un Éclat scintille au sommet de la colonne.', 5);
    } else {
      showMsg('L\'eau murmure : « Une part d\'ombre pour une part d\'étoile. » Il vous faudrait une essence d\'ombre à offrir...', 4);
    }
  });
  RESTORES.push(() => { if (!fountainInter.on) revealPickup(fountainStar); });

  /* Mur est des jardins : sépare du Parvis du Levant.
     Segment bas (3,6 m, sous le pont) : trop haut pour être escaladé,
     assez bas pour laisser passer le pont brisé (tablier à 5,3 m). */
  mkBox(1, 8, 14, 36, 0, 39, 'stone');      // z 32..46
  mkBox(1, 3.6, 8, 36, 0, 50, 'stone');     // z 46..54 (sous le pont)
  mkBox(1, 8, 4, 36, 0, 56, 'stone');       // z 54..58
  mkBox(1, 5, 3, 36, 3, 59.5, 'stone');     // linteau de l'arche (passage z 58..61)
  mkBox(1, 8, 19, 36, 0, 70.5, 'stone');    // z 61..80

  /* Labyrinthe de haies (secret optionnel) — haies de 4,8 m : même le bloc
     runique en escabeau (portée max 4,55 m) ne permet pas de les franchir. */
  mkBox(28, 4.8, 1, -36, 0, 54.5, 'hedge');
  mkBox(28, 4.8, 1, -36, 0, 75.5, 'hedge');
  mkBox(1, 4.8, 22, -49.5, 0, 65, 'hedge');
  mkBox(1, 4.8, 8.5, -21.5, 0, 58.75, 'hedge');
  mkBox(1, 4.8, 8.5, -21.5, 0, 71.25, 'hedge'); // entrée est z 63..67
  mkBox(1, 4.8, 16, -27.5, 0, 62.5, 'hedge');
  mkBox(17, 4.8, 1, -36.5, 0, 70, 'hedge');
  mkBox(1, 4.8, 10, -45, 0, 64.5, 'hedge');
  mkBox(11, 4.8, 1, -39.5, 0, 58.5, 'hedge');
  mkBox(11, 4.8, 1, -39.5, 0, 65.5, 'hedge');
  mkBox(1, 4.8, 1.5, -34, 0, 59.25, 'hedge');
  mkBox(1, 4.8, 1.5, -34, 0, 64.75, 'hedge');
  mkBox(1, 4.7, 4, -34, 0, 62, 'hedgeF', false); // FAUSSE haie (poche secrète)
  addPickup('maxhp', -40, 0.2, 62);
  addPickup('heart', -43, 0, 60);
  addInter(-33, 0, 62, 2.2, 'Observer la haie', () => {
    showMsg('Cette haie semble plus sombre que les autres... et l\'air y circule.', 3);
  });

  /* Escalier + pont brisé vers la Tour du Levant (brèche de 11,5 m : seul
     un saut prolongé d'un Pas du vent la franchit). */
  for (let i = 0; i < 10; i++) mkBox(1, 0.53 * (i + 1), 4, 22.5 + i, 0, 50, 'stoneD');
  mkBox(4, 5.3, 4, 34, 0, 50, 'stoneD');       // plateforme d'élan (5,3 m)
  mkBox(3.5, 4.8, 4, 49.25, 0, 50, 'stoneD');  // réception (4,8 m — hors de portée du sol)
  torch(33.5, 5.3, 47.6);
  addInter(30, 5.3, 50, 2.6, 'Lire la borne du pont', () => {
    showMsg('« Seul le vent franchit ce que la pierre refuse. » Le tablier s\'est effondré il y a des lustres.', 3.5);
  });

  /* Décor des jardins : arbres, rochers, herbes folles */
  [[-8, 38], [10, 40], [16, 56], [-14, 50], [8, 66], [22, 64], [-6, 72], [28, 45],
   [-54, 44], [-56, 72], [30, 72], [24, 36], [-16, 36], [-44, 48]]
    .forEach(([tx, tz], i) => tree(tx, tz, 0.9 + ((i * 7) % 4) * 0.15));
  for (let i = 0; i < 20; i++) {
    const rx = -55 + ((i * 173) % 85), rz = 34 + ((i * 97) % 44);
    if (rx > -52 && rx < -20 && rz > 52 && rz < 78) continue; // labyrinthe
    if (rx > 20 && rx < 38 && rz > 45 && rz < 55) continue;   // escalier du pont
    if (Math.hypot(rx, rz - 42) < 6) continue;                 // fontaine
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + ((i * 13) % 10) * 0.06, 0), matFor('stoneR', 1, 1));
    r.position.set(rx, 0.2, rz);
    r.rotation.set(i, i * 2, i * 3);
    r.castShadow = true; r.receiveShadow = true;
    S.scene.add(r);
  }
  for (let i = 0; i < 60; i++) {
    const gx = -58 + ((i * 211) % 88), gz = 33 + ((i * 131) % 46);
    if (gx > -52 && gx < -20 && gz > 52 && gz < 78) continue;
    if (gx > 20 && gx < 38 && gz > 45 && gz < 55) continue;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 4), matFor('leaf', 1, 1));
    t.position.set(gx, 0.27, gz);
    S.scene.add(t);
  }
  addPickup('mana', 10, 0, 50);
  addPickup('mana', -12, 0, 47);
  addPickup('heart', -30, 0, 50);
  addPickup('heart', 26, 0, 68);
  /* Ombres des jardins (tag 'garden' : leur chute lève la herse).
     PV et dégâts réduits : ce sont les adversaires du tutoriel — mais
     elles encaissent désormais 3 coups de Mage (plus de mise à mort en
     un éclair : le jeu apprend d'emblée à enchaîner les frappes). */
  mkEnemy(-10, 46, 0, [[-10, 46], [6, 46]], { tag: 'garden', type: 'sentinel', lvl: 1, hp: 40, dmg: 9 });
  mkEnemy(14, 58, 0, [[14, 56], [14, 66], [24, 60]], { tag: 'garden', type: 'sentinel', lvl: 1, hp: 40, dmg: 9 });
  /* le Traqueur rôde près du labyrinthe de haies, loin du point d'éveil */
  mkEnemy(-12, 68, 0, [[-12, 68], [-4, 72], [-16, 72]], { type: 'wraith', lvl: 1, hp: 24, dmg: 7 });

  /* ---- LUMEN, l'esprit-guide ---- */
  S.lumen = new THREE.Group();
  const lcore = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xaad8ff }));
  S.lumen.add(lcore, glow(0x7fb8ff, 3.6, 0.85));
  const llight = new THREE.PointLight(0x6fa8ff, 1.4 * LIGHT_SCALE, 12, 2);
  S.lumen.add(llight);
  S.lumen.position.set(2.5, 1.5, 44.5);
  S.scene.add(S.lumen);
  addInter(2.5, 0, 44.5, 2.6, 'Parler à Lumen', () => {
    if (!tut.lumenMet) {
      tut.lumenMet = true;
      openDialog([
        'Enfin... un porteur de flamme. Je suis Lumen, dernier souffle du foyer d\'Ombreciel.',
        'Jadis, trois Larmes d\'Aube baignaient ce château de lumière. La Nuit sans lune les a arrachées : une gît au fond des catacombes, une dans la salle du trône, la dernière au cœur de la Forêt de Nuit, par-delà les Terres Perdues.',
        'Les arts anciens dorment encore ici : vent, main céleste, égide, givre, bénédiction. Chaque porte d\'Ombreciel n\'obéit qu\'à l\'un d\'eux — il te les faudra tous.',
        'Chasse d\'abord les deux ombres qui souillent ces jardins : la herse se lèvera. Reviens me voir si le doute te prend.'
      ], () => questReach('lumen'));
    } else {
      const q = QUESTS[S.questI];
      const h = q ? HINTS[q.id] : towerLumenHint();
      openDialog([h || 'L\'Aube est proche, porteur de flamme. Je le sens.']);
    }
  });

  /* ================================================================
     PARVIS DU LEVANT & TOUR (niveau 3) — x 36..74, z 32..80
     La tour n'a AUCUNE porte au sol : seule la réception du pont (4,8 m)
     y donne accès. Retomber dans le parvis n'est jamais bloquant :
     l'arche du mur est (z 58..61) ramène aux jardins.
     ================================================================ */
  [[42, 70], [70, 62], [44, 36], [68, 44], [70, 76]].forEach(([tx, tz], i) => tree(tx, tz, 1 + (i % 3) * 0.2));
  addPickup('heart', 70, 0, 36);
  addPickup('mana', 40, 0, 76);
  mkBox(1.2, 1.6, 0.3, 58, 0, 60, 'stoneR');
  addInter(58, 0, 60, 2.8, 'Lire la stèle de la tour', () => {
    showMsg('« La Tour du Levant ne s\'ouvre qu\'au ciel. Son seuil est un pont, sa clef est le vent. »', 3.5);
  });

  /* Tour du Levant — x 51..65, z 43..57, murs pleins de 27 m + toit */
  mkBox(1, 27, 5, 51.5, 0, 45.5, 'stone');
  mkBox(1, 27, 5, 51.5, 0, 54.5, 'stone');
  mkBox(1, 4.8, 4, 51.5, 0, 50, 'stone');    // sous la porte (z 48..52, y 4,8..8,8)
  mkBox(1, 18.2, 4, 51.5, 8.8, 50, 'stone'); // au-dessus de la porte
  mkBox(1, 27, 14, 64.5, 0, 50, 'stone');
  mkBox(14, 27, 1, 58, 0, 43.5, 'stone');
  mkBox(14, 27, 1, 58, 0, 56.5, 'stone');
  mkBox(14, 0.6, 14, 58, 27, 50, 'stoneD');  // toit : nul ne saute par-dessus les murs
  mkBox(12, 4.8, 12, 58, 0, 50, 'stoneD');   // socle intérieur (plancher à 4,8 m)
  const cone = new THREE.Mesh(new THREE.ConeGeometry(9.4, 5, 10), matFor('roof', 5, 2));
  cone.position.set(58, 30, 50); cone.castShadow = true; S.scene.add(cone);
  /* Spirale de plateformes intérieures (pas de 1,45 m, saut simple).
     Le départ angulaire est calé pour que la FIN de l'ascension arrive au
     NORD (z > 49,5), côté opposé à la terrasse : les dernières plateformes
     ne passent jamais sous sa dalle (base 22,6), qui ferait plafond et
     rendrait le sommet inatteignable. Deux paliers élargis (i = 4 et 8)
     servent de points de repos — une chute ne renvoie plus tout en bas. */
  for (let i = 0; i < 12; i++) {
    const a = 1.035 + i * 0.62;
    const w = (i === 4 || i === 8) ? 3.2 : 2.4;
    mkBox(w, 0.35, w, 58 + Math.cos(a) * 4.3, 6.2 + i * 1.45, 50 + Math.sin(a) * 4.3, 'stoneD');
  }
  addPickup('mana', 62.1, 18.15, 48.8); // souffle sur le palier de repos haut (i = 8)
  /* passerelle sommitale : de la dernière plateforme (nord, sommet 22,5)
     vers la terrasse sud (dessus 23,1) — deux marches franchies au pas */
  mkBox(2, 0.35, 5, 58, 22.55, 51, 'stoneD');
  mkBox(12, 0.5, 5, 58, 22.6, 46.5, 'stone'); // terrasse sommitale
  pedestal(58, 46, 23.1, 'tk', 0xc8a8ff,
    'Main céleste apprise ! (touche 3, puis clic) Saisissez les blocs runiques par la pensée.', 'tower');
  addPickup('mana', 54, 23.1, 46);
  torch(55, 4.8, 54.8);
  torch(62, 23.1, 44.8);
  mkEnemy(60, 46, 23.1, [[55, 46], [61, 46]], { type: 'caster', lvl: 3 });
  mkEnemy(44, 66, 0, [[44, 66], [44, 40]], { type: 'sentinel', lvl: 3 });
  mkEnemy(62, 64, 0, [[62, 64], [68, 44]], { type: 'wraith', lvl: 3 });

  /* ================================================================
     LE CHÂTEAU SCELLÉ — v8
     Les intérieurs (grand hall, bibliothèque, aile est, salle du trône,
     catacombes) sont devenus des SALLES INSTANCIÉES (Rooms.js) : plus
     grandes, chargées UNE À LA FOIS derrière un écran de chargement —
     tout le budget de calcul se concentre sur l'espace courant. Le
     monde ouvert ne garde que la masse extérieure du château et ses
     deux seuils : la herse (sud) et le passage scellé (nord).
     ================================================================ */
  /* corps principal (hall + bibliothèque + aile est) — x -58..57.5, z 0..31 */
  mkBox(1, 10, 31, -58, 0, 15.5, 'stone');
  mkBox(1, 10, 31, 57.5, 0, 15.5, 'stone');
  mkBox(116.5, 10, 1, -0.25, 0, 0, 'stone');
  mkBox(117, 0.6, 32.5, -0.25, 10, 15.9, 'stoneD'); // toiture : nul ne saute dedans
  /* sas d'entrée derrière la herse : l'alcôve du seuil du grand hall */
  mkBox(1, 10, 2.4, -3, 0, 30.55, 'stone');
  mkBox(1, 10, 2.4, 3, 0, 30.55, 'stone');
  mkBox(8, 10, 1, 0, 0, 29.35, 'stone');
  torch(-2.2, 0, 30.3); torch(2.2, 0, 30.3);
  addInter(0, 0, 30.3, 2.5, 'Entrer dans le grand hall', () => {
    if (!S.gateDoor.open) { showMsg('La herse est close.', 2.5); return; }
    enterCastleHall();
  });

  /* donjon du trône — x -16.5..16.5, z -28..0 */
  mkBox(1, 12, 28, -16.5, 0, -14, 'stone');
  mkBox(1, 12, 28, 16.5, 0, -14, 'stone');
  mkBox(14.5, 12, 1, -8.75, 0, -27.5, 'stone');
  mkBox(14.5, 12, 1, 8.75, 0, -27.5, 'stone');
  mkBox(3, 7, 1, 0, 5, -27.5, 'stone');
  mkBox(35, 0.6, 29, 0, 12, -14, 'stoneD');
  /* le passage scellé, côté Terres Perdues : il ne s'ouvre que de
     l'intérieur (deux Larmes), puis reste un seuil à double sens.
     Fond de sas sombre juste derrière : porte levée, on voit un passage
     obscur — on ne peut pas errer dans la masse creuse du donjon. */
  mkBox(5, 12, 1, 0, 0, -26.2, new THREE.MeshStandardMaterial({ color: 0x07080f, roughness: 1 }));
  S.beyondDoor = mkDoor(3, 5, 1, 0, 0, -27.5, 'rune');
  addInter(0, 0, -29.3, 2.7, 'Franchir le passage scellé', () => {
    if (!beyondOpened()) {
      showMsg('Le passage est scellé de l\'intérieur. Sa rune attend deux Larmes d\'Aube, de l\'autre côté de la pierre...', 3.5);
      return;
    }
    if (!S.beyondDoor.open) openDoor(S.beyondDoor);
    enterThroneFromLostLands();
  });

  buildOpenWorld();
}

/* ================================================================
   LES TERRES PERDUES, LA FORÊT DE NUIT & LA CLAIRIÈRE DU CŒUR
   (niveaux 7-10, derrière le passage scellé)
   ================================================================ */
export function buildOpenWorld() {
  /* ----- TERRES PERDUES (ruines, niveau 7) — x -44..44, z -46..-28 ----- */
  mkBox(1, 10, 18, -44, 0, -37, 'stoneD');
  mkBox(1, 10, 18, 44, 0, -37, 'stoneD');
  mkBox(28, 10, 1, -30, 0, -28, 'stoneD');
  mkBox(28, 10, 1, 30, 0, -28, 'stoneD');
  /* joints d'enceinte de part et d'autre de la lisière de la forêt */
  mkBox(2, 12, 1, -61, 0, -47, 'stoneD');
  mkBox(14, 12, 1, 67, 0, -47, 'stoneD');
  mkBox(4, 0.06, 19, 3, 0.02, -37.5, 'path', false);
  torch(-2.4, 3, -28.8, 0x8a5aff, 1.25, 18);
  addInter(0, 0, -29.5, 3, 'Contempler les Terres Perdues', () => {
    showMsg('Au-delà du seuil, la pierre redevient friche. Au sud, une muraille d\'arbres : la Forêt de Nuit.', 4);
  });
  bivouac(4, 0, -31, 'les Terres Perdues', 'terres');
  const RUINS = [
    [-11, -33, 3.2], [11, -31, 4], [-20, -38, 3.4], [18, -42, 3], [-30, -36, 4.6],
    [28, -40, 3.2], [-36, -44, 4], [34, -44, 3.6], [-24, -44, 3], [24, -33, 3.4]
  ];
  RUINS.forEach(([rx, rz, rh]) => mkCyl(0.55 + rh * 0.05, 0.72 + rh * 0.05, rh, rx, 0, rz, 'stoneD', true, 7));
  [[-15, -35], [15, -44], [-33, -41], [31, -35], [-7, -44], [7, -34]].forEach(([rx, rz], i) => {
    const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 + ((i * 13) % 5) * 0.18, 0), matFor('stoneR', 1, 1));
    rk.position.set(rx, 0.6, rz); rk.rotation.set(i, i * 1.7, i * 0.4);
    rk.castShadow = true; rk.receiveShadow = true;
    S.scene.add(rk); addCol(rk);
  });
  torch(-14, 0, -42, 0x9a6cff, 1.1, 17);
  torch(14, 0, -38, 0x66c8ff, 1.1, 17);
  /* le Souffle glacé, gardé par les Colosses des ruines */
  pedestal(12, -42, 0, 'frost', 0x9fe8ff,
    'Souffle glacé appris ! (touche 5, puis clic) Un souffle qui gèle les ombres — et éteint les feux maudits.');
  addPickup('mana', -9, 0, -33);
  addPickup('heart', 10, 0, -36);
  addPickup('mana', 24, 0, -42);
  addPickup('heart', -24, 0, -40);
  mkEnemy(12, -40, 0, [[8, -40], [16, -44]], { type: 'brute', lvl: 7 });
  mkEnemy(6, -44, 0, [[2, -44], [10, -42]], { type: 'brute', lvl: 7 });
  mkEnemy(-8, -40, 0, [[-8, -36], [-8, -44]], { type: 'caster', lvl: 7 });
  mkEnemy(-18, -34, 0, [[-24, -34], [-12, -38]], { type: 'sentinel', lvl: 7 });
  mkEnemy(22, -34, 0, [[18, -32], [28, -38]], { type: 'sentinel', lvl: 7 });

  /* ----- FORÊT DE NUIT (labyrinthe OBLIGATOIRE, niveau 8) -----
     x -60..60, z -48..-90 — murs de haies de 7,5 m : infranchissables,
     même avec les Ailes d'Ombreciel et le bloc runique (portée max 6,8 m).
     Cellules de 6 m ; le SEUL passage de la rangée r4 est l'arbre-
     sanctuaire (Bénédiction). */
  asciiWalls([
    '##########.#########',
    '#.....####.###.....#',
    '#.###.####.###.###.#',
    '#..............#...#',
    '###G################',
    '#..................#',
    '############.#######'
  ], -60, -48, 6, 7.5, 0, 'hedge');

  /* Porte des ronces ardentes (entrée de la forêt, cellule r0c10) */
  const roncesDoor = mkDoor(6, 5, 1.5, 3, 0, -51, 'hedge');
  doorFlames(roncesDoor, [[-1.9, -1.6, 1], [0, -1.6, 1], [1.9, -1.6, 1]], 0xff5a2a);
  addInter(3, 0, -46.8, 3, 'Examiner les ronces ardentes', it => {
    if (roncesDoor.open) { it.on = false; return; }
    if (G.powers.frost) {
      it.on = false;
      openDoor(roncesDoor);
      spawnBurst(3, 2, -49.5, 0xbfe8ff, 26);
      A.shield();
      showMsg('Le Souffle glacé éteint les ronces : la Forêt de Nuit s\'entrouvre en crissant.', 4.5);
      questReach('frost');
    } else {
      showMsg('Des ronces embrasées barrent la forêt. Elles ne craignent ni lame ni sort... sauf, peut-être, le givre.', 3.5);
    }
  });

  /* ----- LES CONFINS D'OMBRE (friches optionnelles des Terres Perdues) -----
     Deux champs en friche flanquent la salle du trône (x -62..-18 et
     x 17.5..60, z -28..0) : on n'y accède qu'en longeant la lisière de la
     forêt (bande z -46..-48) puis en contournant les murs des ruines.
     Décor entièrement procédural (arbres et sanctuaire faits main). */
  // Friche boisée : arbres isolés (chêne/érable) entre les ruines et les champs
  [[-26, -31], [-38, -34], [22, -30], [38, -36], [-22, -41], [40, -31],
   [-34, -22], [-48, -20], [-28, -8], [-52, -4], [30, -12], [46, -6], [52, -20], [38, -24]]
    .forEach(([tx, tz], i) => tree(tx, tz, 1 + (i % 3) * 0.25));
  // Bosquets denses en lisière des Confins : petits amas d'arbres serrés
  [[-56, -14], [52, -12], [52, -40]].forEach(([bx, bz], gi) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + gi;
      tree(bx + Math.cos(a) * 2.6, bz + Math.sin(a) * 2.6, 0.85 + (i % 2) * 0.2);
    }
  });
  // torche-repère à l'angle des ruines : signale l'entrée des Confins d'ouest
  torch(-46, 0, -46.5, 0x9a6cff, 1.1, 17);
  // Le Sanctuaire de l'Arbre : shrine circulaire de pierre, bâti à la main
  const sx = -40, sz = -14;
  mkCyl(3.4, 3.6, 0.4, sx, 0, sz, 'stoneR', true, 12);
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3;
    mkBox(0.55, 3.2, 0.55, sx + Math.cos(a) * 2.9, 0.4, sz + Math.sin(a) * 2.9, 'stoneR');
  }
  mkCyl(0.4, 0.55, 2.4, sx, 0.4, sz, 'trunk', false, 7);
  const shrineCrown = new THREE.Mesh(new THREE.OctahedronGeometry(0.4),
    new THREE.MeshBasicMaterial({ color: 0x7ade5a }));
  shrineCrown.position.set(sx, 3.2, sz);
  shrineCrown.add(glow(0x7ade5a, 2.2, 0.55));
  S.scene.add(shrineCrown); spinners.push(shrineCrown);
  torch(sx - 4, 0, sz - 8, 0xffc86a, 1.2, 16);
  torch(sx + 4, 0, sz - 8, 0xffc86a, 1.2, 16);
  addPickup('heart', sx, 0, sz - 9.5);
  addInter(sx, 0, sz - 8, 3.2, 'Se recueillir au Sanctuaire de l\'Arbre', () => {
    showMsg('« Avant le château, avant les Larmes, un arbre veillait déjà sur la vallée. Son sanctuaire tient encore debout — la Nuit n\'ose pas y entrer. »', 5);
  });
  // Flèche des Confins — repère visuel du champ d'est
  const spireMat = new THREE.MeshStandardMaterial({ color: 0x241a3a, roughness: 0.7, emissive: 0x140a24 });
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.2, 16, 8), spireMat);
  spire.position.set(48, 8, -14); spire.castShadow = true; S.scene.add(spire); addCol(spire);
  const spireGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshBasicMaterial({ color: 0xb08cff }));
  spireGem.position.set(48, 16.4, -14); spireGem.add(glow(0xb08cff, 3, 0.6));
  S.scene.add(spireGem); spinners.push(spireGem);
  addInter(48, 0, -10.5, 3.5, 'Lire les runes de la flèche', () => {
    showMsg('« Ici finit la carte des anciens. Ce qui suit n\'appartient qu\'à ceux qui osent. »', 4.5);
  });
  // Ressources de soutien pour l'exploration des Confins
  addPickup('mana', 48, 0, -18);
  addPickup('mana', -52, 0, -44);
  addPickup('heart', 52, 0, -44);

  /* Arbre-sanctuaire flétri (cellule r4c3) : la Bénédiction rouvre la voie */
  const groveDoor = mkDoor(6, 6, 2, -39, 0, -75, 'hedge');
  mkCyl(0.35, 0.5, 2.6, -42, 0, -70.5, 'trunk', true, 7);
  const deadBranch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.6, 0.14), matFor('woodF', 1, 1));
  deadBranch.position.set(-41.6, 3.2, -70.5); deadBranch.rotation.z = 0.7;
  deadBranch.castShadow = true; S.scene.add(deadBranch);
  addInter(-39, 0, -71.5, 3, 'Toucher l\'arbre-sanctuaire flétri', it => {
    if (groveDoor.open) { it.on = false; return; }
    if (G.powers.heal) {
      it.on = false;
      openDoor(groveDoor);
      spawnBurst(-42, 2.5, -70.5, 0x9fffb0, 26);
      A.power();
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.4, 8), matFor('leaf', 1, 1));
      c1.position.set(-42, 3.4, -70.5); c1.castShadow = true; S.scene.add(c1);
      const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.9, 8), matFor('leaf', 1, 1));
      c2.position.set(-42, 4.6, -70.5); c2.castShadow = true; S.scene.add(c2);
      showMsg('La Bénédiction ranime l\'arbre-sanctuaire : la haie s\'écarte devant sa sève neuve.', 4.5);
      questReach('grove');
    } else {
      showMsg('L\'arbre-sanctuaire est flétri, et la haie morte avec lui. Une Bénédiction dort dans l\'Ossuaire des catacombes...', 4);
    }
  });
  /* (le bivouac du cœur de la forêt a été retiré : les feux sont rares —
     entre les Terres Perdues et la Clairière du Cœur, la mort coûte cher) */

  /* canopée : des arbres plantés SUR les murs de haies (forêt dense) */
  const FTREES = [
    [-45, -51], [-21, -51], [21, -51], [45, -51], [57, -51],
    [-9, -57], [9, -63], [-33, -63], [33, -63], [51, -63],
    [-57, -63], [-15, -63], [27, -75], [-9, -75], [9, -75],
    [45, -75], [-57, -75], [57, -75], [-27, -87], [-3, -87],
    [27, -87], [51, -87], [3, -75], [-45, -87]
  ];
  FTREES.forEach(([tx, tz], i) => tree(tx, tz, 1.8 + (i % 3) * 0.25));
  /* SECRET — l'arbre aux lucioles : perdu dans un couloir du labyrinthe,
     un arbre éteint que seule la Bénédiction ranime. Ses lucioles rendent
     alors le 3ᵉ Éclat d'Aube étoilée (la Faveur des Étoiles à la clef). */
  mkCyl(0.3, 0.42, 2.2, 21, 0, -69, 'trunk', true, 7);
  const fireflyGlow = glow(0x3a5a3a, 1.6, 0.25);
  fireflyGlow.position.set(21, 2.6, -69);
  S.scene.add(fireflyGlow);
  const fireflyStar = addPickup('star', 21, 1.6, -69.9, true);
  const fireflyInter = addInter(21, 0, -69, 2.6, 'Bénir l\'arbre aux lucioles', it => {
    if (G.powers.heal) {
      it.on = false;
      fireflyGlow.material.color.setHex(0x9fffb0);
      fireflyGlow.material.opacity = 0.6;
      spawnBurst(21, 2.4, -69, 0x9fffb0, 24);
      A.power();
      revealPickup(fireflyStar);
      showMsg('Mille lucioles s\'embrasent dans les branches... et déposent à vos pieds un Éclat d\'Aube étoilée.', 4.5);
    } else {
      showMsg('Un arbre éteint, couvert de lucioles endormies. Une lumière chaude pourrait les réveiller... (la Bénédiction dort dans l\'Ossuaire)', 4);
    }
  });
  RESTORES.push(() => {
    if (!fireflyInter.on) {
      fireflyGlow.material.color.setHex(0x9fffb0);
      fireflyGlow.material.opacity = 0.6;
      revealPickup(fireflyStar);
    }
  });
  torch(3, 0, -57, 0xffa04a, 1.1, 16);
  torch(-39, 0, -69, 0xffa04a, 1.1, 16);
  torch(15, 0, -81, 0xffa04a, 1.1, 16);
  addPickup('heart', 27, 0, -69);
  addPickup('maxhp', 51, 0, -69);
  addPickup('heart', 45, 0, -81);
  addPickup('maxhp', -51, 0, -81);
  addPickup('mana', -27, 0, -57);
  addPickup('mana', 9, 0, -81);
  mkEnemy(-39, -57, 0, [[-51, -57], [-33, -57]], { type: 'sentinel', lvl: 8 });
  mkEnemy(-15, -69, 0, [[-33, -69], [-3, -69]], { type: 'wraith', lvl: 8 });
  mkEnemy(-3, -69, 0, [[-9, -69], [3, -69]], { type: 'wraith', lvl: 8 });
  mkEnemy(45, -69, 0, [[39, -69], [51, -69]], { type: 'caster', lvl: 8 });
  mkEnemy(-9, -81, 0, [[-21, -81], [3, -81]], { type: 'sentinel', lvl: 8 });
  mkEnemy(27, -81, 0, [[15, -81], [39, -81]], { type: 'wraith', lvl: 8 });

  /* ----- CLAIRIÈRE DU CŒUR (niveau 10) — x -20..20, z -90..-100 ----- */
  mkBox(1, 10, 10, -20, 0, -95, 'stoneD');
  mkBox(1, 10, 10, 20, 0, -95, 'stoneD');
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + 0.4;
    mkCyl(0.5, 0.7, 3 + (k % 3) * 0.6, Math.cos(a) * 8, 0, -95 + Math.sin(a) * 4, 'stoneR', true, 7);
  }
  mkBox(3, 1, 3, 0, 0, -95, 'stoneR');
  mkBox(1.6, 0.7, 1.6, 0, 1, -95, 'rune');
  addPickup('crystal', 0, 1.7, -95);   // la troisième et dernière Larme
  addInter(0, 0, -93.2, 2.8, 'Lire l\'autel du Cœur', () => {
    showMsg('« Ici bat le cœur de la nuit. Qui reprend la Larme reprend l\'Aube. » Les gardiens veillent.', 4);
  });
  bivouac(15, 0, -91, 'la Clairière du Cœur', 'clairiere');
  torch(-10, 0, -92, 0x8a5aff, 1.2, 18);
  torch(10, 0, -92, 0x8a5aff, 1.2, 18);
  torch(0, 0, -99, 0xb08cff, 1.2, 18);
  addPickup('heart', -12, 0, -92);
  addPickup('mana', 12, 0, -97);
  addPickup('mana', -12, 0, -97);
  addPickup('heart', 16, 0, -95);
  mkEnemy(-5, -94, 0, [[-5, -92], [-5, -97]], { type: 'brute', lvl: 10 });
  mkEnemy(5, -94, 0, [[5, -97], [5, -92]], { type: 'brute', lvl: 10 });
  mkEnemy(0, -98, 0, [[-6, -98], [6, -98]], { type: 'caster', lvl: 10 });
  /* un Traqueur de plus : la Clairière est le pic de difficulté du jeu */
  mkEnemy(0, -92, 0, [[-8, -92], [8, -92]], { type: 'wraith', lvl: 10 });
}

/* ---------------- PATROUILLES DE RENFORT (v8.1) ----------------
   Les salles du château se vidaient trop vite : quelques ombres de plus
   dans les zones les plus calmes (grand hall, bibliothèque, aile est,
   parvis, trône, ruines). Appelé EN DERNIER par main.js — après tout le
   reste du monde — pour ne pas décaler les index d'ennemis des
   sauvegardes existantes (S.STATIC_ENEMIES / SaveSystem). Les points de
   patrouille reprennent des couloirs déjà arpentés par les ombres
   d'origine : ils sont garantis praticables. */
export function buildExtraPatrols() {
  mkEnemy(0, 20, 0, [[-8, 20], [8, 20]], { type: 'sentinel', lvl: 2 });          // grand hall
  mkEnemy(-40, 15, 0, [[-46, 15], [-34, 15]], { type: 'wraith', lvl: 2 });       // bibliothèque
  mkEnemy(38, 16, 0, [[32, 16], [44, 16]], { type: 'sentinel', lvl: 3 });        // aile est
  mkEnemy(52, 54, 0, [[46, 54], [58, 54]], { type: 'wraith', lvl: 3 });          // parvis du Levant
  mkEnemy(-3, -8, 0, [[-6, -8], [4, -8]], { type: 'wraith', lvl: 6 });           // salle du trône
  mkEnemy(0, -36, 0, [[-8, -36], [8, -36]], { type: 'wraith', lvl: 7 });         // ruines
}

/* ---------------- HERBES LUNAIRES (jardins + forêt) ---------------- */
export function buildHerbs() {
  [[6, 52], [-8, 48], [12, 40], [-14, 46], [20, 60], [5, 70], [-4, 66], [26, 44], [18, 72], [-18, 40],
   [-51, -69], [39, -57], [9, -81], [33, -57]]
    .forEach(p => addPickup('herb', p[0], 0, p[1]));
}

/* ================================================================
   v9 — L'ENCLUME DE FORGE (ouvre le panneau de Forge, UI.js) et le
   CORPSE RUN : à la mort (solo), l'équipement porté tombe dans une
   TOMBE D'AUBE aux coordonnées du trépas — 5 minutes RÉELLES pour
   revenir le chercher, sinon il se dissout dans la nuit.
   ================================================================ */
const anvilSpots = []; // {x,y,z} de chaque enclume — pour le guide de proximité ci-dessous
export function mkAnvil(x, y, z) {
  /* Silhouette d'enclume RECONNAISSABLE (socle → taille → table plate +
     corne), en fer sombre, sur un petit foyer de braises — bien plus
     grande et bien plus éclairée que la v9.0 (invisible en pratique :
     0,77 m de haut, aucune lumière propre). Échelle et éclairage calqués
     sur torch()/bivouac() : c'est un point de repère du monde, il doit
     se voir de loin, de jour comme de nuit. */
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.45, metalness: 0.85 });
  mkBox(0.62, 0.5, 0.5, x, y, z, ironMat);              // socle
  mkBox(0.4, 0.32, 0.34, x, y + 0.5, z, ironMat, false); // taille (col resserré)
  const table = mkBox(1.5, 0.26, 0.58, x, y + 0.82, z, ironMat, false); // table de travail
  table.castShadow = true;
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.72, 8),
    ironMat);
  horn.rotation.z = Math.PI / 2;
  horn.position.set(x + 1.05, y + 0.9, z);
  horn.castShadow = true;
  S.scene.add(horn);
  // braises rougeoyantes incrustées dans la table (le forgeron travaille encore)
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff8a3a });
  const ember = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 6), emberMat);
  ember.position.set(x - 0.3, y + 1.02, z);
  S.scene.add(ember);
  const halo = glow(0xffb05a, 3.2, 0.6); // large et intense : visible de loin, jour comme nuit
  halo.position.set(x - 0.3, y + 1.15, z);
  S.scene.add(halo);
  const light = new THREE.PointLight(0xff8c3a, 1.3 * LIGHT_SCALE, 16, 2);
  light.position.set(x, y + 1.1, z);
  S.scene.add(light);
  flames.push({ flame: ember, light, halo, base: 1.3 * LIGHT_SCALE, seed: Math.random() * 10 });
  /* `kind: 'forge'` : le J2 EN LIGNE (2ᵉ PC) n'ouvre jamais ce panneau
     (celui de l'hôte) — Network.js reconnaît cette interaction à son
     `kind` et lui pousse SA PROPRE Forge, sur SON écran (voir sendForge,
     rendue côté client par NetPlay.js). */
  addInter(x, y, z, 2.8, '⚒ Forge — façonner et fusionner l\'équipement', () => toggleForge(), 'forge');
  anvilSpots.push({ x, y, z });
}
/* Guide du porteur — la Forge, à la première approche (pas seulement à
   l'ouverture du panneau : si le joueur ne s'arrête jamais dessus, il ne
   comprendrait jamais à quoi elle sert). Même mécanique que herb/shadow/
   camp (G.seen, une seule fois par partie) — voir Quests.js. */
export function updateAnvilProximity() {
  if (G.seen.forge || !anvilSpots.length) return;
  for (const a of anvilSpots) {
    const near = pl => pl && pl.pos && Math.hypot(pl.pos.x - a.x, pl.pos.z - a.z) < 4.5 && Math.abs(pl.pos.y - a.y) < 3;
    if (near(player) || (S.COOP && p2.pos && near(p2))) {
      guide('forge', [
        '⚒ LA FORGE — chaque enclume d\'Ombreciel façonne et fusionne de l\'ÉQUIPEMENT : une Arme, une Armure et un Accessoire, en plus de vos arts. Ouvrez le panneau avec E.',
        'Chaque pièce a une RARETÉ (Commun → Rare → Épique → Légendaire) qui fixe sa puissance. Façonnez une pièce Commune contre des essences d\'ombre, ou FUSIONNEZ 3 pièces de même rareté (+ ressources de monstres) pour en forger une supérieure — toujours adaptée à VOTRE voie.',
        'Les ombres vaincues lâchent aussi de l\'équipement (rangé au sac de forge). Votre SCORE D\'ÉQUIPEMENT total rend le monde plus dangereux à mesure qu\'il grandit — et si vous tombez, l\'équipement porté reste 5 minutes sur votre dépouille : revenez le chercher avant qu\'il ne s\'éteigne.'
      ]);
      return;
    }
  }
}

let tombG = null; // mesh de la Tombe d'Aube actuellement posée (ou null)
function mkTombMesh() {
  const g = new THREE.Group();
  const mat = matFor('stoneR', 1, 1);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.22), mat);
  slab.position.y = 0.6; slab.castShadow = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.22, 10, 1, false, 0, Math.PI), mat);
  cap.rotation.z = Math.PI / 2; cap.rotation.y = Math.PI / 2;
  cap.position.y = 1.2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.25, 0.8), mat);
  base.position.y = 0.12;
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.16),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  core.position.set(0, 1.55, 0);
  g.add(slab, cap, base, core, glow(0xffd97a, 3, 0.6));
  return g;
}
/* Transfère l'équipement porté dans G.deathDrop (appelé par hurt(), Player.js,
   au moment du Game Over solo). Contexte (palier/salle) mémorisé : la Tombe
   ne se matérialise que dans le BON espace instancié. */
export function dropEquipmentOnDeath() {
  const items = [];
  for (const slot of ['weapon', 'armor', 'accessory']) {
    const it = unequipSlot(slot);
    if (it) items.push(it);
  }
  if (!items.length) return;
  G.deathDrop = {
    items,
    x: player.pos.x, y: Math.max(0, player.pos.y), z: player.pos.z,
    palier: S.inTower ? S.palier : -1, room: S.roomId || null,
    expire: Date.now() + 300000 // 5 minutes RÉELLES
  };
  showMsg('⚰ Votre équipement gît où vous êtes tombé — une TOMBE D\'AUBE le garde 5 minutes !', 5);
}
/* Boucle du Corpse Run (appelée par main.js) : matérialise/retire la Tombe
   selon le contexte, gère l'expiration réelle et la récupération de proximité. */
export function updateDeathDrop() {
  const D = G.deathDrop;
  if (!D || !D.items || !D.items.length) {
    if (tombG) { S.scene.remove(tombG); tombG = null; }
    return;
  }
  if (Date.now() > D.expire) {
    G.deathDrop = null;
    if (tombG) { S.scene.remove(tombG); tombG = null; }
    showMsg('La Tombe d\'Aube s\'est éteinte... votre ancien équipement appartient à la nuit.', 4.5);
    return;
  }
  /* la Tombe n'existe que dans l'espace où l'on est mort (monde / palier / salle) */
  const hereCtx = S.inTower ? S.palier : -1;
  const ctxOk = (D.palier === hereCtx) && ((D.room || null) === (S.roomId || null));
  if (!ctxOk) { if (tombG) { S.scene.remove(tombG); tombG = null; } return; }
  if (!tombG) {
    tombG = mkTombMesh();
    tombG.position.set(D.x, D.y, D.z);
    S.scene.add(tombG);
  }
  tombG.children[3].rotation.y += 0.03; // l'éclat doré tournoie doucement
  /* récupération par PROXIMITÉ (pas d'addInter : les instances tronquent
     la liste des interactions au déchargement — la Tombe doit y survivre) */
  if (Math.hypot(player.pos.x - D.x, player.pos.z - D.z) < 2.2 &&
      Math.abs(player.pos.y - D.y) < 3) {
    for (const it of D.items) {
      const prev = equipItem(it);
      if (prev) { // un slot déjà rempli entre-temps : l'ancien va au sac de forge
        if (G.gearBag.length < 15) G.gearBag.push(prev);
        else G.shadows += 2;
      }
    }
    G.deathDrop = null;
    S.scene.remove(tombG); tombG = null;
    A.power();
    spawnBurst(D.x, D.y + 1.2, D.z, 0xffd97a, 26);
    showMsg('⚰ → ⚔ Équipement RÉCUPÉRÉ ! La Tombe d\'Aube vous rend ce qui est vôtre.', 4);
  }
}
