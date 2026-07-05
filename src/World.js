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
  tkCubes, pedestals, PLATES, CAMPS, player, p2
} from './state.js';
import { assets, matFor, glow } from './AssetManager.js';
import { A } from './Audio.js';
import { $, showMsg, refreshPowers, openTravel } from './UI.js';
import { questReach, openDialog } from './Quests.js';
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
  S.bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.35, 0.95);
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

  /* Ciel nocturne en dégradé généré en mémoire (aucun HDRI à charger). */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 16, 12),
    new THREE.MeshBasicMaterial({ map: assets.skyTex, side: THREE.BackSide, fog: false }));
  S.scene.add(sky);
  /* Ciel de JOUR : sphère jumelle légèrement plus petite dont l'opacité est
     fondue par le cycle (0 = nuit noire, 1 = plein jour). */
  S.skyDay = new THREE.Mesh(new THREE.SphereGeometry(396, 16, 12),
    new THREE.MeshBasicMaterial({ map: assets.skyDayTex, side: THREE.BackSide, fog: false,
      transparent: true, opacity: 0, depthWrite: false }));
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
export function setCamAspects() {
  S.camera.aspect = (S.COOP ? innerWidth / 2 : innerWidth) / innerHeight;
  S.camera.updateProjectionMatrix();
  S.cam2.aspect = (innerWidth / 2) / innerHeight;
  S.cam2.updateProjectionMatrix();
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
      if (delta < 0) { p.y = c.max.y; pl.vel.y = 0; pl.grounded = true; }
      else { p.y = c.min.y - h; pl.vel.y = Math.min(0, pl.vel.y); }
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
    it.on = false; S.scene.remove(cry);
    const idx = spinners.indexOf(cry); if (idx >= 0) spinners.splice(idx, 1);
    G.powers[powerId] = true; G.sel = powerId;
    A.power(); refreshPowers();
    spawnBurst(x, y + 1.6, z, color, 18);
    showMsg(lore, 5.5);
    if (questId) questReach(questId);
  });
}

/* ---------------- OBJETS À RAMASSER ---------------- */
export function addPickup(type, x, y, z) {
  let mesh;
  if (type === 'crystal') {
    mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.42),
      new THREE.MeshBasicMaterial({ color: 0xffd97a }));
    mesh.add(glow(0xffd97a, 3.4, 0.7));
    const l = new THREE.PointLight(0xffc86a, 0.9 * LIGHT_SCALE, 9, 2);
    mesh.add(l);
  } else if (type === 'key') {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 12), matFor('gold', 1, 1));
    const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), matFor('gold', 1, 1));
    tige.position.y = -0.35;
    g.add(ring, tige, glow(0xffd97a, 1.8, 0.5));
    mesh = g;
  } else if (type === 'mana') {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x5fc8ff }));
    mesh.add(glow(0x5fc8ff, 1.7, 0.6));
  } else if (type === 'heart') {
    mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.24),
      new THREE.MeshBasicMaterial({ color: 0xff5566 }));
    mesh.add(glow(0xff5566, 1.6, 0.55));
  } else if (type === 'herb') {
    mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0),
      new THREE.MeshBasicMaterial({ color: 0x6fe07a }));
    mesh.add(glow(0x6fe07a, 1.6, 0.5));
  } else if (type === 'shadow') {
    mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.24),
      new THREE.MeshBasicMaterial({ color: 0x9a6cff }));
    mesh.add(glow(0x7a4cdd, 1.8, 0.55));
  } else {
    mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.36),
      new THREE.MeshBasicMaterial({ color: 0xff8899 }));
    mesh.add(glow(0xff8899, 2.4, 0.6));
  }
  mesh.position.set(x, y + 0.9, z);
  S.scene.add(mesh);
  pickups.push({ mesh, type, y0: y + 0.9, taken: false });
}
export function updatePickups(dt) {
  for (const p of pickups) {
    if (p.taken) continue;
    p.mesh.rotation.y += dt * 1.8;
    p.mesh.position.y = p.y0 + Math.sin(G.time * 2.4 + p.y0) * 0.14;
    const byP1 = player.pos.distanceTo(p.mesh.position) < 1.6;
    const byP2 = S.COOP && p2.pos && p2.pos.distanceTo(p.mesh.position) < 1.6;
    if (byP1 || byP2) {
      const collector = byP1 ? player : p2;
      p.taken = true; S.scene.remove(p.mesh);
      if (p.type === 'crystal') {
        G.crystals++; A.power();
        spawnBurst(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0xffd97a, 20);
        showMsg('Larme d\'Aube recueillie — ' + G.crystals + ' / 3', 4);
        if (QUESTS[S.questI] && QUESTS[S.questI].id === 'tears')
          $('objective').textContent = '✧ Objectif — Réunissez les 3 Larmes d\'Aube (' + G.crystals + ' / 3). Lumen connaît peut-être des secrets...';
        if (G.crystals >= 3) setTimeout(winGame, 1400);
        G.checkpoint = { x: collector.pos.x, y: collector.pos.y, z: collector.pos.z };
      } else if (p.type === 'herb') {
        G.herbs++; A.pickup();
        showMsg('Herbe lunaire cueillie (☘ ' + G.herbs + '). H : potion de soin (2 herbes).', 2.2);
      } else if (p.type === 'shadow') {
        G.shadows++; A.pickup();
        showMsg('Essence d\'ombre absorbée (● ' + G.shadows + '). O : forger un orbe (3 essences).', 2.2);
      } else if (p.type === 'key') {
        G.goldKey = true; A.key();
        showMsg('Vous trouvez la Clef d\'or. Une serrure dorée l\'attend quelque part...', 4.5);
        questReach('crypt');
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
export function addInter(x, y, z, r, label, fn) { inter.push({ x, y, z, r, label, fn, on: true }); }
export function nearInterP(pl) {
  for (const i of inter) {
    if (!i.on) continue;
    if (Math.hypot(pl.pos.x - i.x, pl.pos.z - i.z) < i.r && Math.abs(pl.pos.y - i.y) < 2.8) return i;
  }
  return null;
}
export function nearInter() {
  return nearInterP(player);
}
export function tryInteractP2() {
  if (!G.started || G.paused || G.inv || G.over || G.dialog || S.transitioning) return;
  const it = nearInterP(p2);
  if (it) it.fn(it);
}
export function tryInteract() {
  if (!G.started || G.paused || G.inv || G.over || G.dialog || S.transitioning) return;
  const it = nearInter();
  if (it) it.fn(it);
}

/* ---------------- PARTICULES ---------------- */
export function spawnBurst(x, y, z, color, n) {
  for (let i = 0; i < n; i++) {
    let p = parts.find(q => q.life <= 0);
    if (!p) {
      if (parts.length > 160) break; // rendu simplifié (sans textures) : marge de reste pour des effets plus généreux
      p = { mesh: new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13),
        new THREE.MeshBasicMaterial({ color: 0xffffff })), vel: new THREE.Vector3(), life: 0 };
      S.scene.add(p.mesh); parts.push(p);
    }
    p.mesh.material.color.setHex(color);
    p.mesh.position.set(x, y, z);
    p.mesh.visible = true;
    p.mesh.scale.setScalar(1);
    p.vel.set((Math.random() - 0.5) * 7, Math.random() * 5 + 1.5, (Math.random() - 0.5) * 7);
    p.life = 0.55 + Math.random() * 0.25;
  }
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
    if (Math.abs(pos.y - c.y) < 3.2 && Math.hypot(pos.x - c.x, pos.z - c.z) < (c.safeR || SAFE_R)) return c;
  }
  return null;
}

/* Feu de bivouac : point de contrôle réutilisable (sans PointLight pour
   ménager le budget lumières — le halo additif suffit à le signaler).
   Chaque feu s'inscrit dans la matrice des Bivouacs (CAMPS) : se reposer le
   « découvre » et ouvre l'interface de voyage rapide (voir UI.openTravel). */
export function bivouac(x, y, z, label, id, travel) {
  const l1 = mkBox(1.1, 0.3, 0.3, x - 0.15, y, z - 0.1, 'woodF', false); l1.rotation.y = 0.6;
  const l2 = mkBox(1.1, 0.3, 0.3, x + 0.15, y, z + 0.15, 'woodF', false); l2.rotation.y = -0.5;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.85, 6),
    new THREE.MeshBasicMaterial({ color: 0xffb05a }));
  flame.position.set(x, y + 0.55, z);
  S.scene.add(flame);
  const halo = glow(0xff9c4a, 3.4, 0.55);
  halo.position.set(x, y + 0.65, z);
  S.scene.add(halo);
  flames.push({ flame, light: null, halo, base: 0, seed: Math.random() * 10 });
  /* cercle du sanctuaire : la frontière que les ombres ne franchissent pas,
     visible en permanence pour que le joueur SACHE où il est en sécurité */
  const ring = new THREE.Mesh(new THREE.RingGeometry(SAFE_R - 0.35, SAFE_R, 44),
    new THREE.MeshBasicMaterial({ color: 0xffc06a, transparent: true, opacity: 0.14,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, y + 0.07, z);
  S.scene.add(ring);
  /* les feux instanciés (Tour) se réenregistrent à chaque build du palier :
     on réutilise leur fiche pour ne jamais dupliquer la matrice */
  const cid = id || ('camp' + CAMPS.length);
  let camp = CAMPS.find(c => c.id === cid);
  if (!camp) {
    camp = { id: cid, label: label || 'bivouac', x: x + 1, y: y + 0.2, z, travel: travel !== false, safeR: SAFE_R };
    CAMPS.push(camp);
  }
  addInter(x, y, z, 2.6, 'Se reposer au bivouac', () => {
    G.checkpoint = { x: x + 1, y: y + 0.2, z };
    G.hp = G.maxHp; G.mana = G.maxMana;
    if (S.COOP && p2.pos) { p2.hp = p2.maxHp; p2.mana = p2.maxMana; }
    A.pickup();
    spawnBurst(x, y + 1, z, 0xffc06a, 12);
    const first = !G.camps[camp.id];
    G.camps[camp.id] = true;
    showMsg('Vous vous reposez près du feu' + (label ? ' — ' + label : '') + '. Vous renaîtrez ici.', 3.5);
    openTravel(camp);
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
     PV et dégâts réduits : ce sont les adversaires du tutoriel, elles
     tombent en 2 coups et ne punissent pas les erreurs de débutant. */
  mkEnemy(-10, 46, 0, [[-10, 46], [6, 46]], { tag: 'garden', type: 'sentinel', lvl: 1, hp: 22, dmg: 8 });
  mkEnemy(14, 58, 0, [[14, 56], [14, 66], [24, 60]], { tag: 'garden', type: 'sentinel', lvl: 1, hp: 22, dmg: 8 });
  /* le Traqueur rôde près du labyrinthe de haies, loin du point d'éveil */
  mkEnemy(-12, 68, 0, [[-12, 68], [-4, 72], [-16, 72]], { type: 'wraith', lvl: 1, hp: 12, dmg: 6 });

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
      const h = q ? HINTS[q.id] : null;
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
  /* Spirale de plateformes intérieures (pas de 1,45 m, saut simple) */
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + i * 0.62;
    mkBox(2, 0.35, 2, 58 + Math.cos(a) * 4.3, 6.2 + i * 1.45, 50 + Math.sin(a) * 4.3, 'stoneD');
  }
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
  bivouac(-39, 0, -81, 'le cœur de la forêt', 'foret');

  /* canopée : des arbres plantés SUR les murs de haies (forêt dense) */
  const FTREES = [
    [-45, -51], [-21, -51], [21, -51], [45, -51], [57, -51],
    [-9, -57], [9, -63], [-33, -63], [33, -63], [51, -63],
    [-57, -63], [-15, -63], [27, -75], [-9, -75], [9, -75],
    [45, -75], [-57, -75], [57, -75], [-27, -87], [-3, -87],
    [27, -87], [51, -87], [3, -75], [-45, -87]
  ];
  FTREES.forEach(([tx, tz], i) => tree(tx, tz, 1.8 + (i % 3) * 0.25));
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

/* ---------------- HERBES LUNAIRES (jardins + forêt) ---------------- */
export function buildHerbs() {
  [[6, 52], [-8, 48], [12, 40], [-14, 46], [20, 60], [5, 70], [-4, 66], [26, 44], [18, 72], [-18, 40],
   [-51, -69], [39, -57], [9, -81], [33, -57]]
    .forEach(p => addPickup('herb', p[0], 0, p[1]));
}
