/* ================================================================
   L'ASCENSION DE LA TOUR DU LEVANT — v8 (l'épreuve ultime, et au-delà)
   20 étages thématiques répartis en 6 PALIERS INSTANCIÉS :
     · Palier I   — Les Archives Vertigineuses (étages 1-4)  → Clef de Cuivre
     · Palier II  — La Serre des Ombres        (étages 5-9)  → Clef de Sève
     · Palier III — Le Donjon de Fer           (étages 10-14)→ Clef d'Éther
     · Palier IV  — L'Observatoire de l'Aube   (étage 15)    → l'Aura du
       Premier Foyer et le secret des ombres.
     · Palier V   — L'OUTRE-CIEL               (étages 16-18)→ Clef d'Astre
       Les îles flottantes par-delà le firmament. La NOVA D'AURORE (touche 7)
       y dort ; Orin le cartographe céleste retisse le pont de constellations
       contre 3 Éclats d'étoile ; le Berger des Étoiles garde le sommet.
     · Palier VI  — LE CŒUR DE LA NUIT SANS LUNE (étages 19-20) → la
       Couronne de l'Aube. L'instant du désastre, figé depuis cent ans :
       l'ASTRE D'AUBE (touche 8) y dort ; le Veilleur sans Nom garde la
       dernière porte ; l'AVALE-LUNE — l'ombre des Larmes elles-mêmes —
       digère la lune derrière. Seule la Nova d'Aurore déchire son voile.
   La progression du v8 passe par les PNJ : Maëla (Observatoire) nomme le
   porteur au Seuil de l'Outre-Ciel, Orin donne la quête des Éclats,
   le Veilleur ouvre la porte de la Dernière Nuit.

   LEVEL STREAMING (§3.1 du GDD) : un seul palier existe en mémoire à la
   fois. Le site est bâti loin du château (x ≈ 400) ; franchir un portail
   décharge l'étage précédent et charge le suivant sans écran de chargement
   (sas runiques en « S » : aucun palier ne voit l'autre). L'ouverture des
   portails dépend de FLAGS STRICTS (hasKilledBoss && hasFloorKey), jamais
   d'un trigger physique.
   ================================================================ */
import * as THREE from 'three';
import {
  G, S, POWERS, gearScore,
  colliders, doors, pickups, inter, enemies, projectiles, tkCubes,
  spinners, flames, pedestals, player, p2
} from './state.js';
import { A } from './Audio.js';
import { showMsg, withLoading, showVictory, gearWarning } from './UI.js';
import {
  mkBox, mkCyl, addInter, addPickup, torch, bivouac, spawnBurst, mkTkCube,
  pedestal, mkDoor, openDoor, pointSolid, mkAnvil
} from './World.js';
import { lightPillar, groundRing } from './Animations.js';
import { matFor, glow } from './AssetManager.js';
import { mkEnemy } from './Enemies.js';
import { hurt, hurtP2, applyPoison } from './Player.js';
import { tkToggle } from './Powers.js';
import { openDialog } from './Quests.js';
import { saveGame } from './SaveSystem.js';
import { craftAction } from './Crafting.js';

/* Site de l'instance (hors du monde : le brouillard nocturne l'isole) */
const TX = 400, TZ = 0;
/* v9 — l'autre porteur n'est déplacé de force que s'il se trouvait
   physiquement sur le site de la Tour (voir Rooms.js, même principe pour
   les salles instanciées du château). */
const TOWER_SITE_R = 100;
function nearTowerSite(pos) { return !!(pos && Math.hypot(pos.x - TX, pos.z - TZ) < TOWER_SITE_R); }
/* Points d'entrée de chaque palier (0 = vestibule-sas) */
const ENTRY = [
  { x: TX, y: 0.2, z: TZ + 13 },
  { x: TX, y: 0.2, z: TZ + 14 },
  { x: TX, y: 0.2, z: TZ + 16 },
  { x: TX, y: 0.2, z: TZ + 21 },
  { x: TX, y: 0.2, z: TZ + 12 },
  { x: TX, y: 0.2, z: TZ + 20 }, // Palier V — l'Outre-Ciel (île d'entrée)
  { x: TX, y: 0.2, z: TZ + 24 }  // Palier VI — le Cœur de la Nuit sans lune
];
const TERRACE = { x: 58, y: 23.2, z: 46.8 }; // terrasse de la Tour du Levant

/* ---- état runtime du palier chargé (jamais sauvegardé tel quel) ---- */
let snap = null;         // instantané des collections du monde avant le build
let origAdd = null;      // S.scene.add d'origine (capture des meshes du palier)
const hazards = [];      // zones de danger {x,z,w,d,y,h,dmg,label,period,on,mesh}
const spikes = [];       // télégraphes d'impact {x,z,y,t,dmg,col,r,pillar,pois}
const bombs = [];        // globes de nuit de l'Avale-Lune (v8.4) — Égide seule les bloque
const npcs = [];         // PNJ du palier courant {g,y0,seed} — respiration douce
const movers = [];       // plateformes MOBILES {mesh,col,w,h,x,y,z,dx,dy,dz,period,phase,px,py,pz}
let boss = null;         // Maître d'Étage du palier courant
let pillars = [];        // colonnes de feu de l'arène du Chevalier
let pillarT = 0, pillarI = 0;

const KEY_DEFS = {
  copper: { name: 'Clef de Cuivre', color: 0xc87a4a },
  sap:    { name: 'Clef de Sève',   color: 0x7ade5a },
  ether:  { name: 'Clef d\'Éther',  color: 0x9a8cff },
  astre:  { name: 'Clef d\'Astre',  color: 0xffe9a8 }
};
/* Le portail de l'Ascension n'exige que les SIX ARTS ANCIENS du château.
   (Bug v8 corrigé : POWERS compte désormais 8 sorts — la Nova d'Aurore et
   l'Astre d'Aube ne s'apprennent que DANS l'Outre-Ciel, au-delà de la Tour.
   Exiger POWERS.every() rendait le portail impossible à ouvrir.) */
const BASE_ARTS = ['bolt', 'dash', 'tk', 'shield', 'frost', 'heal'];
const allPowersKnown = () => BASE_ARTS.every(id => G.powers[id]);
const powersCount = () => BASE_ARTS.filter(id => G.powers[id]).length;

/* ================================================================
   INSTANCIATION — capture & déchargement (level streaming)
   ================================================================ */
function beginBuild() {
  snap = {
    col: colliders.length, doors: doors.length, pickups: pickups.length,
    inter: inter.length, enemies: enemies.length, flames: flames.length,
    spinners: spinners.length, tk: tkCubes.length, ped: pedestals.length, added: []
  };
  origAdd = S.scene.add;
  S.scene.add = function (...objs) { snap.added.push(...objs); return origAdd.apply(S.scene, objs); };
}
function endBuild() { if (origAdd) { S.scene.add = origAdd; origAdd = null; } }
function unloadPalier() {
  if (!snap) return;
  endBuild();
  /* Trigger Box asynchrone du sas : tout ce que le palier a ajouté au monde
     est retiré — meshes, colliders, portes, ennemis (invocations comprises),
     objets lâchés au sol, feux, cubes runiques. Les collections globales
     retrouvent EXACTEMENT leur longueur d'avant le build : les index des
     sauvegardes du monde restent stables. */
  for (let i = snap.enemies; i < enemies.length; i++) S.scene.remove(enemies[i].g);
  enemies.length = snap.enemies;
  for (let i = snap.pickups; i < pickups.length; i++) if (!pickups[i].taken) S.scene.remove(pickups[i].mesh);
  pickups.length = snap.pickups;
  doors.length = snap.doors;
  inter.length = snap.inter;
  colliders.length = snap.col;
  flames.length = snap.flames;
  for (let i = snap.spinners; i < spinners.length; i++) S.scene.remove(spinners[i]);
  spinners.length = snap.spinners;
  if (S.tkHeld) { S.tkHeld.held = false; S.tkHeld = null; }
  tkCubes.length = snap.tk;
  pedestals.length = snap.ped; // piédestaux instanciés (Nova, Astre) : jamais de doublon
  for (const o of snap.added) S.scene.remove(o);
  for (const pr of projectiles) S.scene.remove(pr.mesh);
  projectiles.length = 0;
  for (const b of bombs) S.scene.remove(b.mesh);
  hazards.length = 0; spikes.length = 0; npcs.length = 0; bombs.length = 0; movers.length = 0;
  boss = null; pillars = []; pillarT = 0; pillarI = 0;
  S.onHeal = null; S.onNova = null;
  snap = null;
}

/* ================================================================
   PETITS CONSTRUCTEURS DU DÉCOR DE LA TOUR
   ================================================================ */
/* Portail runique : deux piliers + anneau tournant + interaction gardée
   par un flag strict (canOpen() — jamais de trigger physique). */
function mkPortal(x, y, z, color, label, canOpen, lockedMsg, onEnter) {
  mkBox(0.6, 3.8, 0.6, x - 1.6, y, z, 'stoneR');
  mkBox(0.6, 3.8, 0.6, x + 1.6, y, z, 'stoneR');
  mkBox(4, 0.5, 0.7, x, y + 3.8, z, 'stoneR');
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.09, 8, 24),
    new THREE.MeshBasicMaterial({ color }));
  ring.position.set(x, y + 1.9, z);
  ring.add(glow(color, 3, 0.45));
  S.scene.add(ring); spinners.push(ring);
  /* rayon GÉNÉREUX (3,6 m) : un portail fait 3,2 m de large avec son
     linteau — avec l'ancien rayon (2,4 m), on pouvait être visiblement
     « au portail » sans que le E n'apparaisse (retour joueur, étage 9). */
  addInter(x, y, z, 3.6, label, () => {
    if (!canOpen()) { showMsg(lockedMsg(), 3.2); return; }
    A.door();
    spawnBurst(x, y + 1.8, z, color, 22);
    /* v8 : franchir un portail passe par l'écran de chargement — la coupure
       masque le déchargement/reconstruction du palier (même contrat que les
       salles instanciées du château, voir UI.withLoading). */
    withLoading(label, onEnter);
  });
  return ring;
}
/* Clef de palier : ne se matérialise que si le Maître d'Étage est vaincu.
   Auto-save FORCÉE au ramassage (§3.5 du GDD). */
function mkTowerKey(kind, x, y, z) {
  if (G.tower.keys[kind]) return;
  const def = KEY_DEFS[kind];
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.35, metalness: 0.75, emissive: def.color, emissiveIntensity: 0.25 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 6, 12), mat);
  const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6), mat);
  tige.position.y = -0.38;
  g.add(ring, tige, glow(def.color, 2.2, 0.5));
  g.position.set(x, y + 1.2, z);
  S.scene.add(g); spinners.push(g);
  addInter(x, y, z, 2.4, 'Prendre la ' + def.name, it => {
    it.on = false;
    S.scene.remove(g);
    const i = spinners.indexOf(g); if (i >= 0) spinners.splice(i, 1);
    G.tower.keys[kind] = true;
    A.key();
    spawnBurst(x, y + 1.2, z, def.color, 20);
    showMsg(def.name + ' obtenue ! (sauvegarde automatique)', 4);
    saveGame(true); // auto-save forcée au ramassage des clefs
  });
}
/* Plaque d'étage (repère narratif des 20 étages) */
function floorSign(n, theme, x, y, z) {
  mkBox(1.2, 1.5, 0.25, x, y, z, 'stoneR');
  addInter(x, y, z, 2.4, 'Lire la plaque de l\'étage ' + n, () => {
    showMsg('— Étage ' + n + ' / 20 — ' + theme, 3);
  });
}
/* PNJ : une silhouette immobile qui respire doucement (jamais dans
   `spinners` — un personnage qui culbute sur lui-même briserait la scène).
   opt = { name, color, eye, halo, emissive, kneel, onTalk } */
function mkNpc(x, y, z, opt) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: opt.color, roughness: 1,
    emissive: opt.emissive || 0x0d0820 });
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.5, opt.kneel ? 1.05 : 1.45, 8), mat);
  cloak.castShadow = true;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), mat);
  hood.position.y = opt.kneel ? 0.5 : 0.7;
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6),
    new THREE.MeshBasicMaterial({ color: opt.eye }));
  e1.position.set(-0.1, hood.position.y + 0.02, 0.2);
  const e2 = e1.clone(); e2.position.x = 0.1;
  g.add(cloak, hood, e1, e2, glow(opt.halo || opt.eye, 2.4, 0.4));
  g.position.set(x, y + (opt.kneel ? 0.72 : 0.95), z);
  S.scene.add(g);
  npcs.push({ g, y0: g.position.y, seed: Math.random() * 10 });
  addInter(x, y, z, 2.6, 'Parler à ' + opt.name, opt.onTalk);
  return g;
}
/* Piédestal d'art ancien DANS une instance : jamais recréé une fois l'art
   appris (le palier se reconstruit à chaque visite). */
function towerPedestal(x, z, y, id, color, lore) {
  if (!G.powers[id]) pedestal(x, z, y, id, color, lore);
}
/* Éclat d'étoile (quête d'Orin) : trois lueurs qui chantent, dispersées
   sur les îles de l'Outre-Ciel. Ramassage persistant (shardsTaken). */
function mkShard(i, x, y, z) {
  if (G.tower.shardsTaken[i] || G.tower.bridge) return;
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.3),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  g.add(core, glow(0xfff2b0, 3, 0.7));
  g.position.set(x, y + 1.3, z);
  S.scene.add(g); spinners.push(g);
  addInter(x, y, z, 2.4, 'Recueillir l\'Éclat d\'étoile', it => {
    it.on = false;
    S.scene.remove(g);
    const k = spinners.indexOf(g); if (k >= 0) spinners.splice(k, 1);
    G.tower.shardsTaken[i] = true;
    G.tower.shards++;
    A.key();
    spawnBurst(x, y + 1.3, z, 0xfff2b0, 22);
    showMsg('Éclat d\'étoile recueilli (' + G.tower.shards + ' / 3). Il chante doucement dans votre main — Orin saura quoi en faire.', 3.5);
    saveGame(true);
  });
}
/* Zone de danger (flammes, poison, lave froide). period = [cycle, durée ON]
   pour les jets rythmés ; sans period, le danger est permanent (Égide !). */
function mkHazard(x, z, w, d, y, h, dmg, color, label, period) {
  const mesh = mkBox(w, 0.12, d, x, y + 0.02, z, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false
  }), false);
  hazards.push({ x, z, w, d, y, h: h || 2.2, dmg, label, period: period || null, on: true, mesh });
}
/* Bordée radiale de projectiles hostiles (tempête de parchemins).
   v8.4 — `size` : gros orbes bien visibles (Avale-Lune) au lieu des petits
   parchemins ; leur rayon de collision (hitR) grossit avec eux.
   pois = [durée, dégâts/s] : la bordée laisse en plus un venin (voir
   applyPoison, Player.js) — encre corrosive, spores, nuit liquide... */
function radialBurst(e, n, dmg, speed, color, size, pois) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + G.time;
    const dir = new THREE.Vector3(Math.cos(a), -0.04, Math.sin(a));
    const core = size
      ? new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0),
          new THREE.MeshStandardMaterial({ color: 0x14082a, emissive: color, emissiveIntensity: 1.3, roughness: 0.4 }))
      : new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.04),
          new THREE.MeshStandardMaterial({ color: 0xe8dfc0, emissive: color, emissiveIntensity: 0.9, roughness: 0.6 }));
    core.add(glow(color, size ? 3.2 : 1.8, 0.6));
    core.position.set(e.g.position.x, e.g.position.y + 0.8, e.g.position.z);
    S.scene.add(core);
    projectiles.push({ mesh: core, vel: dir.multiplyScalar(speed), life: 2.8, dmg,
      hostile: true, spin: 9, hitR: size ? size * 2.4 : 0, pois: pois || null });
  }
  A.hostileBolt();
}
/* Plateforme MOBILE : oscille autour de (x,y,z) sur ±(dx,dy,dz) en `period`
   secondes. Le collider AABB suit le mesh, et le porteur debout dessus est
   EMPORTÉ avec elle (sinon la dalle glisserait sous ses pieds). */
function mkMover(w, h, d, x, y, z, dx, dy, dz, period, phase) {
  const mesh = mkBox(w, h, d, x, y, z, 'slabW');
  const col = colliders[colliders.length - 1];
  const halo = glow(0x8fe8ff, 2.4, 0.3);
  halo.position.y = 0.5;
  mesh.add(halo);
  movers.push({ mesh, col, w, h, d, x, y, z, dx, dy, dz, period, phase: phase || 0, px: x, py: y, pz: z });
}
function updateMovers() {
  for (const mv of movers) {
    const k = Math.sin((G.time + mv.phase) * Math.PI * 2 / mv.period);
    const nx = mv.x + mv.dx * k, ny = mv.y + mv.dy * k, nz = mv.z + mv.dz * k;
    const ddx = nx - mv.px, ddy = ny - mv.py, ddz = nz - mv.pz;
    mv.mesh.position.set(nx, ny + mv.h / 2, nz);
    mv.col.min.x += ddx; mv.col.max.x += ddx;
    mv.col.min.y += ddy; mv.col.max.y += ddy;
    mv.col.min.z += ddz; mv.col.max.z += ddz;
    const top = ny + mv.h;
    const carry = pl => {
      if (!pl.pos) return;
      if (Math.abs(pl.pos.x - nx) < mv.w / 2 + 0.5 && Math.abs(pl.pos.z - nz) < mv.d / 2 + 0.5 &&
          pl.pos.y > top - 0.4 && pl.pos.y < top + 0.7 && pl.vel.y <= 0.01) {
        pl.pos.x += ddx; pl.pos.z += ddz;
        pl.pos.y += ddy; // la dalle soulève ou descend son passager avec elle
      }
    };
    carry(player);
    if (S.COOP) carry(p2);
    mv.px = nx; mv.py = ny; mv.pz = nz;
  }
}

/* ================================================================
   ENTRÉE / SORTIE / TRANSITIONS
   ================================================================ */
export function enterTower() {
  gotoPalier(0);
  showMsg('— L\'ASCENSION DE LA TOUR DU LEVANT — Quinze étages vous séparent de l\'Observatoire de l\'Aube... et l\'on murmure que le ciel n\'est pas le sommet.', 5);
}
export function leaveTower(silent) {
  const dragP2 = S.COOP && p2.pos && nearTowerSite(p2.pos);
  unloadPalier();
  S.inTower = false; S.palier = 0;
  player.pos.set(TERRACE.x, TERRACE.y, TERRACE.z); player.vel.set(0, 0, 0);
  if (dragP2) { p2.pos.set(TERRACE.x + 1.4, TERRACE.y, TERRACE.z + 0.6); p2.vel.set(0, 0, 0); }
  G.checkpoint = { x: TERRACE.x, y: TERRACE.y, z: TERRACE.z };
  if (!silent) showMsg('Le sas vous rend à la terrasse de la Tour du Levant.', 3);
}
/* Rebâtit un palier donné SANS fondu (le voyage rapide, déjà sous écran de
   chargement, s'en sert pour rejoindre un bivouac de la Tour). */
export function enterPalier(n) { gotoPalier(n); }
/* v9 — Gear Score CONSEILLÉ par palier (gear check à l'entrée) */
const PALIER_GEAR = [0, 30, 60, 100, 0, 180, 240];
function gotoPalier(n) {
  const dragP2 = S.COOP && p2.pos && nearTowerSite(p2.pos);
  unloadPalier();
  beginBuild();
  try {
    if (n === 0) buildVestibule();
    else if (n === 1) buildPalier1();
    else if (n === 2) buildPalier2();
    else if (n === 3) buildPalier3();
    else if (n === 4) buildPalier4();
    else if (n === 5) buildPalier5();
    else buildPalier6();
  } finally { endBuild(); }
  /* v9 — GEAR CHECK : très sous-équipé pour l'étage (< 40 % du Score
     conseillé) → alerte claire, et les ombres du palier sont ×3 en PV et
     dégâts. Les Maîtres d'Étage, calibrés à la main, restent inchangés. */
  const rec = PALIER_GEAR[n] || 0;
  // v9.1 — chacun son équipement : le palier juge le MIEUX équipé des porteurs présents
  const gs = Math.max(gearScore(1), dragP2 ? gearScore(2) : 0);
  if (rec && gs < rec * 0.4) {
    for (let i = snap.enemies; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead || e.fsm) continue;
      e.hp *= 3; e.maxHp *= 3; e.dmg = Math.round(e.dmg * 3);
    }
    gearWarning('☠ ZONE DANGEREUSE — Équipement insuffisant (Score ' + gs + ' / ' + rec
      + ' conseillé) : les ombres y frappent TROIS FOIS plus fort. Forgez votre panoplie à une enclume !');
  }
  S.inTower = true; S.palier = n;
  const e = ENTRY[n];
  player.pos.set(e.x, e.y, e.z); player.vel.set(0, 0, 0);
  if (dragP2) { p2.pos.set(e.x + 1.3, e.y, e.z + 0.8); p2.vel.set(0, 0, 0); }
  /* Kill Z-volume de la Tour : le point de contrôle devient l'entrée du
     palier — toute chute hors de l'instance y ramène, sans crash. */
  G.checkpoint = { x: e.x, y: e.y, z: e.z };
  S.yaw = Math.PI; // regard vers le cœur du palier
}

/* Le portail d'entrée, sur la terrasse de la Tour du Levant (monde). */
export function buildTowerGate() {
  mkPortal(62.3, 23.1, 46.5, 0xffd97a, 'Franchir le portail de l\'Ascension',
    allPowersKnown,
    () => 'Le portail reste éteint : les six arts anciens doivent brûler en vous (' + powersCount() + ' / 6).',
    enterTower);
  mkBox(1.2, 1.6, 0.3, 55, 23.1, 44.6, 'stoneR');
  addInter(55, 23.1, 44.6, 2.4, 'Lire la stèle de l\'Ascension', () => {
    showMsg('« Vingt étages, six paliers, quatre clefs. Au sommet, l\'Observatoire et la vérité sur la Nuit sans lune — et par-delà le ciel, l\'Outre-Ciel, où la Dernière Nuit tombe encore. »', 5);
  });
}

/* ================================================================
   PALIER 0 — LE VESTIBULE (sas d'entrée en « S »)
   ================================================================ */
function buildVestibule() {
  // sol + enceinte
  mkBox(30, 1, 36, TX, -1, TZ, 'stoneD');
  mkBox(1, 9, 36, TX - 15, 0, TZ, 'stone');
  mkBox(1, 9, 36, TX + 15, 0, TZ, 'stone');
  mkBox(30, 9, 1, TX, 0, TZ - 18, 'stone');
  mkBox(30, 9, 1, TX, 0, TZ + 18, 'stone');
  mkBox(32, 0.6, 38, TX, 9, TZ, 'stoneD'); // plafond (collider anti-exploit)
  /* sas en « S » : l'entrée ne voit jamais la salle des portails
     (occlusion culling naturelle, §3.1 du GDD) */
  mkBox(20, 9, 1, TX - 5, 0, TZ + 9, 'stone');
  mkBox(20, 9, 1, TX + 5, 0, TZ + 3, 'stone');
  mkBox(4, 0.06, 30, TX, 0.02, TZ + 2, 'path', false);
  torch(TX - 4, 0, TZ + 12, 0xffc86a, 1.2, 15);
  torch(TX + 4, 0, TZ + 6, 0xffc86a, 1.2, 15);
  torch(TX - 10, 0, TZ - 6, 0x9a8cff, 1.2, 16);
  torch(TX + 10, 0, TZ - 6, 0x9a8cff, 1.2, 16);
  addInter(TX, 0, TZ - 2, 3, 'Lire le fronton du vestibule', () => {
    showMsg('« Chaque palier possède ses règles, son Maître d\'Étage et sa clef. Les portails n\'obéissent qu\'aux flags du destin : boss vaincu, clef en main. »', 4.5);
  });
  mkAnvil(TX + 12, 0, TZ - 2); // v9 : la Forge du vestibule (façonnage & fusion)

  // retour à la terrasse
  mkPortal(TX, 0, TZ + 16.5, 0x8fe8ff, 'Revenir à la terrasse', () => true, () => '', () => leaveTower(false));

  // les 4 portails de palier (raccourcis débloqués en battant les Maîtres)
  mkPortal(TX - 10.5, 0, TZ - 15, 0xe8dfc0, 'Palier I — Les Archives Vertigineuses (étages 1-4)',
    () => true, () => '', () => gotoPalier(1));
  mkPortal(TX - 3.5, 0, TZ - 15, 0x7ade5a, 'Palier II — La Serre des Ombres (étages 5-9)',
    () => G.tower.shortcuts.p2, () => 'Raccourci scellé : triomphez d\'abord de l\'Archiviste Corrompu (Palier I).',
    () => gotoPalier(2));
  mkPortal(TX + 3.5, 0, TZ - 15, 0xff8a5a, 'Palier III — Le Donjon de Fer (étages 10-14)',
    () => G.tower.shortcuts.p3, () => 'Raccourci scellé : triomphez d\'abord de la Racine Vengeresse (Palier II).',
    () => gotoPalier(3));
  mkPortal(TX + 10.5, 0, TZ - 15, 0xffd97a, 'Palier IV — L\'Observatoire de l\'Aube (étage 15)',
    () => G.tower.shortcuts.p4, () => 'Raccourci scellé : triomphez d\'abord du Chevalier de l\'Éclipse (Palier III).',
    () => gotoPalier(4));

  /* v8 — la seconde rangée : les paliers par-delà le ciel */
  mkPortal(TX - 7, 0, TZ - 10.5, 0xfff2b0, 'Palier V — L\'Outre-Ciel (étages 16-18)',
    () => G.tower.shortcuts.p5,
    () => G.tower.aura
      ? 'Raccourci scellé : franchissez d\'abord le Seuil de l\'Outre-Ciel depuis l\'Observatoire — Maëla doit vous y nommer.'
      : 'Raccourci scellé : l\'Aura du Premier Foyer (Palier IV) doit d\'abord brûler en vous.',
    () => gotoPalier(5));
  mkPortal(TX + 7, 0, TZ - 10.5, 0x6a5aff, 'Palier VI — Le Cœur de la Nuit sans lune (étages 19-20)',
    () => G.tower.shortcuts.p6,
    () => 'Raccourci scellé : triomphez d\'abord du Berger des Étoiles (Palier V).',
    () => gotoPalier(6));
}

/* ================================================================
   PALIER I — LES ARCHIVES VERTIGINEUSES (étages 1-4)
   Thème : savoir oublié, encre et magie. Boss : l'Archiviste Corrompu.
   ================================================================ */
function buildPalier1() {
  // grande halle 36×36, murs 24 m, plafond (collider anti-exploit §3.2)
  mkBox(38, 1, 38, TX, -1, TZ, 'wood');
  mkBox(1, 24, 38, TX - 18, 0, TZ, 'stone');
  mkBox(1, 24, 38, TX + 18, 0, TZ, 'stone');
  mkBox(38, 24, 1, TX, 0, TZ - 18, 'stone');
  mkBox(38, 24, 1, TX, 0, TZ + 18, 'stone');
  mkBox(40, 0.6, 40, TX, 24, TZ, 'stoneD');
  // sas d'entrée en « S »
  mkBox(12, 5, 1, TX - 5, 0, TZ + 13, 'wood');
  mkBox(12, 5, 1, TX + 5, 0, TZ + 10, 'wood');
  torch(TX - 3, 0, TZ + 15, 0xffc86a, 1.1, 14);

  /* rayonnages-labyrinthe de l'étage 1 (3,4 m : infranchissables d'un saut) */
  [[-12, 4, 10, 1], [-2, 4, 8, 1], [10, 4, 12, 1], [-12, -2, 8, 1], [4, -2, 10, 1],
   [-6, 1, 1, 5], [8, 2, 1, 7]].forEach(([ox, oz, w, d]) =>
    mkBox(w, 3.4, d, TX + ox, 0, TZ + oz, 'wood'));
  floorSign(1, 'Les Archives Vertigineuses. L\'encre a survécu aux archivistes.', TX + 15, 0, TZ + 12);
  torch(TX - 15, 0, TZ + 2, 0x9a8cff, 1.1, 15);
  torch(TX + 15, 0, TZ - 2, 0x9a8cff, 1.1, 15);
  addPickup('mana', TX - 12, 0, TZ + 8);
  addPickup('heart', TX + 12, 0, TZ + 6);

  /* étage 2 (y 5) : mezzanine ouest — escalier d'étagères (pas de 1,55 m) */
  for (let i = 0; i < 3; i++)
    mkBox(3, 1.55 * (i + 1), 2.4, TX - 15.5, 0, TZ + 8 - i * 2.6, 'wood');
  mkBox(10, 0.5, 12, TX - 12.5, 4.65, TZ - 4, 'wood');
  floorSign(2, 'Les parchemins volent seuls, ici.', TX - 9, 5.15, TZ - 8);
  addPickup('mana', TX - 15, 5.15, TZ - 6);

  /* étage 3 (y 10) : galerie est — passerelle d'étagères */
  for (let i = 0; i < 3; i++)
    mkBox(3, 5.15 + 1.55 * (i + 1), 2.4, TX - 4 + i * 3.4, 0, TZ - 9.5, 'wood');
  mkBox(3, 9.8, 2.4, TX + 6.2, 0, TZ - 9.5, 'wood'); // palier de liaison vers la galerie
  mkBox(12, 0.5, 10, TX + 11.5, 9.8, TZ - 6, 'wood');
  floorSign(3, 'Le silence pèse plus lourd que les livres.', TX + 15, 10.3, TZ - 2);
  addPickup('heart', TX + 14, 10.3, TZ - 9);

  /* étage 4 (y 15) : plateforme du Maître d'Étage */
  for (let i = 0; i < 3; i++)
    mkBox(2.6, 10.3 + 1.55 * (i + 1), 2.6, TX + 14.5, 0, TZ - 2 - i * 3, 'wood');
  mkBox(22, 0.5, 16, TX, 14.7, TZ - 8, 'stoneR');
  floorSign(4, 'Le bureau de l\'Archiviste. Il n\'a jamais rendu un seul livre.', TX - 9, 15.2, TZ - 2);
  torch(TX - 8, 15.2, TZ - 14, 0x9a8cff, 1.2, 15);
  torch(TX + 8, 15.2, TZ - 14, 0x9a8cff, 1.2, 15);

  // parchemins en lévitation (décor animé)
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.36), matFor('cloth', 1, 1));
    p.position.set(TX - 14 + (i * 37) % 28, 3 + (i * 5) % 14, TZ - 14 + (i * 23) % 28);
    S.scene.add(p); spinners.push(p);
  }

  /* population : la découverte des archétypes se poursuit dans la Tour */
  mkEnemy(TX - 8, TZ + 6, 0, [[TX - 12, TZ + 6], [TX - 4, TZ + 6]], { type: 'sentinel', lvl: 8 });
  mkEnemy(TX + 8, TZ + 2, 0, [[TX + 8, TZ - 2], [TX + 8, TZ + 6]], { type: 'sentinel', lvl: 8 });
  mkEnemy(TX - 12, TZ - 4, 4.9, [[TX - 15, TZ - 4], [TX - 9, TZ - 4]], { type: 'caster', lvl: 9 });
  mkEnemy(TX + 12, TZ - 6, 10.05, [[TX + 9, TZ - 6], [TX + 15, TZ - 6]], { type: 'wraith', lvl: 9 });

  /* ---- BOSS (étage 4) : L'ARCHIVISTE CORROMPU ----
     Tisseur géant : tempêtes de parchemins à l'ENCRE CORROSIVE (venin),
     geysers d'encre télégraphiés sous les pieds, Traqueurs d'encre. */
  if (!G.tower.bosses.archiviste) {
    boss = mkEnemy(TX, TZ - 12, 15.2, [[TX - 6, TZ - 12], [TX + 6, TZ - 12]], {
      type: 'caster', lvl: 11, hp: 820, dmg: 22, scale: 2.6, speed: 1.9, chase: 3.4
    });
    boss.tName = 'L\'Archiviste Corrompu';
    boss.fsm = { kind: 'archiviste', state: 'IDLE', t: 0, stormT: 3.5, summonT: 8, inkT: 5, inkMsg: false };
    /* v8.4 — ruée du Maître d'Étage (voir chargeProfOf, Enemies.js) */
    boss.chargeProf = { wind: 0.5, speed: 14, range: 11, dmgMul: 1, cool: 8, col: 0xe8dfc0 };
    boss.onKilled = () => {
      G.tower.bosses.archiviste = true;
      G.tower.shortcuts.p2 = true;
      showMsg('L\'ARCHIVISTE CORROMPU s\'effondre en poussière de vélin. La Clef de Cuivre se matérialise, et le raccourci du Palier II s\'éveille au vestibule.', 5);
      mkTowerKey('copper', TX, 15.2, TZ - 10);
      saveGame(true);
      boss = null;
    };
  } else if (!G.tower.keys.copper) mkTowerKey('copper', TX, 15.2, TZ - 10);

  // portails du palier
  mkPortal(TX, 0, TZ + 16.5, 0x8fe8ff, 'Sas — revenir au vestibule', () => true, () => '', () => gotoPalier(0));
  mkPortal(TX, 15.2, TZ - 15.5, 0x7ade5a, 'Sas — Palier II : la Serre des Ombres',
    () => G.tower.bosses.archiviste && G.tower.keys.copper,
    () => G.tower.bosses.archiviste
      ? 'Le portail réclame la Clef de Cuivre.'
      : 'Le portail reste sourd : le Maître d\'Étage veille encore sur les Archives.',
    () => gotoPalier(2));
}

/* ================================================================
   PALIER II — LA SERRE DES OMBRES (étages 5-9)
   Nature corrompue, verticalité, lierre et poison.
   Zone notable : la Salle de l'Alchimiste (hub d'artisanat secondaire).
   Boss : la Racine Vengeresse (vulnérable à la Bénédiction).
   ================================================================ */
function buildPalier2() {
  mkBox(44, 1, 44, TX, -1, TZ, 'grass');
  mkBox(1, 18, 44, TX - 22, 0, TZ, 'hedge');
  mkBox(1, 18, 44, TX + 22, 0, TZ, 'hedge');
  mkBox(44, 18, 1, TX, 0, TZ - 22, 'hedge');
  mkBox(44, 18, 1, TX, 0, TZ + 22, 'hedge');
  mkBox(46, 0.6, 46, TX, 18, TZ, 'hedge'); // canopée close (plafond §3.2)
  // sas d'entrée en « S »
  mkBox(14, 6, 1, TX - 6, 0, TZ + 15, 'hedge');
  mkBox(14, 6, 1, TX + 6, 0, TZ + 12, 'hedge');
  floorSign(5, 'La Serre des Ombres. Le lierre a englouti les verrières.', TX - 8, 0, TZ + 13);
  torch(TX + 8, 0, TZ + 13, 0x7ade5a, 1.1, 15);

  /* étage 5 (y 0) : bassins de poison à contourner */
  mkHazard(TX - 6, TZ + 4, 8, 5, 0, 1.6, 8, 0x4ade5a, 'poison');
  mkHazard(TX + 9, TZ - 2, 7, 6, 0, 1.6, 8, 0x4ade5a, 'poison');
  addPickup('herb', TX - 12, 0, TZ + 6);
  addPickup('herb', TX + 14, 0, TZ + 4);
  mkCyl(0.5, 0.7, 9, TX - 14, 0, TZ - 2, 'hedge', true, 7);
  mkCyl(0.5, 0.7, 12, TX + 4, 0, TZ - 8, 'hedge', true, 7);

  /* étage 6 (y 3) : terrasse ouest + SALLE DE L'ALCHIMISTE */
  for (let i = 0; i < 2; i++)
    mkBox(3.4, 1.5 * (i + 1), 2.6, TX - 10 - i * 0.0, 0, TZ - 1 - i * 2.7, 'stoneR');
  mkBox(14, 0.5, 12, TX - 14, 2.75, TZ - 9, 'stoneR');
  floorSign(6, 'La Salle de l\'Alchimiste. Ses fioles bouillonnent encore.', TX - 20, 3.25, TZ - 5);
  // le hub d'artisanat secondaire : chaudron + établi
  mkCyl(0.8, 1, 1.1, TX - 15, 3.25, TZ - 12, 'iron', true, 9);
  const brew = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 10),
    new THREE.MeshBasicMaterial({ color: 0x4ade5a }));
  brew.position.set(TX - 15, 4.45, TZ - 12);
  S.scene.add(brew);
  addInter(TX - 15, 3.25, TZ - 12, 2.4, 'Alchimiste — distiller une potion (2 herbes)', () => craftAction('H'));
  addInter(TX - 12.4, 3.25, TZ - 12, 2, 'Alchimiste — condenser un orbe (3 essences)', () => craftAction('O'));
  addInter(TX - 17.6, 3.25, TZ - 12, 2, 'Alchimiste — transcender (orbes)', () => craftAction('C'));
  addPickup('herb', TX - 18, 3.25, TZ - 7);
  addPickup('herb', TX - 11, 3.25, TZ - 6);
  addPickup('mana', TX - 19, 3.25, TZ - 12);
  bivouac(TX - 14, 3.25, TZ - 4.5, 'la Salle de l\'Alchimiste', 'alchimiste', false, 4.5);
  mkAnvil(TX - 9.5, 3.25, TZ - 13); // v9 : l'enclume de l'Alchimiste

  /* étage 7 (y 6) : corniche nord — montée par piliers taillés, avec une
     marche intermédiaire (l'ascension se fait en petits sauts lisibles) */
  mkBox(3, 4.5, 2.6, TX - 6, 0, TZ - 14, 'stoneR');
  mkBox(2.4, 5.4, 2.4, TX - 6, 0, TZ - 12.8, 'stoneR');
  mkBox(12, 0.5, 7, TX - 1, 5.75, TZ - 17.5, 'stoneR');
  floorSign(7, 'Les racines percent la pierre comme du papier.', TX + 3, 6.25, TZ - 19);
  addPickup('mana', TX - 4, 6.25, TZ - 18);

  /* étage 8 (y 9) : balcon est au-dessus du vide — marche intermédiaire
     entre le pilier et le balcon (fini le grand saut au pixel près) */
  mkBox(2.8, 7.5, 2.6, TX + 7, 0, TZ - 16, 'stoneR');
  mkBox(2.4, 8.4, 2.4, TX + 8.3, 0, TZ - 16, 'stoneR');
  mkBox(10, 0.5, 8, TX + 14, 8.75, TZ - 14, 'stoneR');
  floorSign(8, 'D\'ici, la Serre entière murmure.', TX + 17, 9.25, TZ - 10);
  addPickup('heart', TX + 17, 9.25, TZ - 17);
  mkHazard(TX + 13, TZ - 11, 4, 3, 9.25, 1.4, 8, 0x4ade5a, 'poison');

  /* étage 9 (y 12) : l'autel de la Racine.
     Montée ADOUCIE (retour joueur « étage pas passable ») : pilier (10,5),
     puis marche intermédiaire (11,4) collée au bord est de la plateforme —
     trois petits sauts lisibles au lieu d'un grand saut au pixel. */
  mkBox(2.6, 10.5, 2.6, TX + 8, 0, TZ - 19, 'stoneR');
  mkBox(2.4, 11.4, 2.4, TX + 7.2, 0, TZ - 17, 'stoneR');
  mkBox(16, 0.5, 10, TX - 2, 11.75, TZ - 16.5, 'stoneR');
  /* plaque écartée du portail du Palier III (leurs zones d'interaction se
     chevauchaient : le E lisait la plaque au lieu d'ouvrir le sas) */
  floorSign(9, 'L\'arbre-sanctuaire de la Serre. Corrompu jusqu\'à la sève.', TX - 1, 12.25, TZ - 13);

  // population
  mkEnemy(TX - 4, TZ + 8, 0, [[TX - 8, TZ + 8], [TX, TZ + 8]], { type: 'wraith', lvl: 9 });
  mkEnemy(TX + 12, TZ + 6, 0, [[TX + 8, TZ + 6], [TX + 16, TZ + 6]], { type: 'wraith', lvl: 10 });
  mkEnemy(TX + 2, TZ - 4, 0, [[TX - 2, TZ - 4], [TX + 6, TZ - 4]], { type: 'caster', lvl: 10 });
  mkEnemy(TX - 2, TZ - 17.5, 5.75, [[TX - 5, TZ - 17.5], [TX + 3, TZ - 17.5]], { type: 'wraith', lvl: 10 });

  /* ---- BOSS (étage 9) : LA RACINE VENGERESSE ----
     Abomination liée à un arbre-sanctuaire corrompu. Sa sève absorbe
     presque tout — seule la BÉNÉDICTION la rend vulnérable. */
  const treeX = TX - 6, treeZ = TZ - 19;
  mkCyl(0.5, 0.8, 4.2, treeX, 12, treeZ, 'trunk', true, 7);
  if (!G.tower.bosses.racine) {
    const deadCone = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a1a30, roughness: 1 }));
    deadCone.position.set(treeX, 17, treeZ);
    S.scene.add(deadCone);
    boss = mkEnemy(TX - 4, TZ - 16, 12.25, [[TX - 6, TZ - 16], [TX - 2, TZ - 16]], {
      type: 'brute', lvl: 12, hp: 1050, dmg: 28, scale: 2.4, speed: 1.15, chase: 2.3, color: 0x1a3a20
    });
    boss.tName = 'La Racine Vengeresse';
    boss.fsm = { kind: 'racine', state: 'CHASE', t: 0, spikeT: 3, vulnT: 0, msgT: 0, summonT: 9, sporeT: 6, sporeMsg: false };
    /* v8.4 — ruée de racines (voir chargeProfOf, Enemies.js) */
    boss.chargeProf = { wind: 0.6, speed: 13, range: 12, dmgMul: 1.1, cool: 7, col: 0x7ade5a };
    boss.onDamaged = (d) => {
      if (boss.fsm.vulnT > 0) return Math.round(d * 1.5);
      if (boss.fsm.msgT <= 0) {
        boss.fsm.msgT = 2.5;
        showMsg('La sève corrompue absorbe vos coups... Une Bénédiction (touche 6) prononcée tout près la ferait chanceler !', 3);
      }
      return Math.max(1, Math.round(d * 0.15));
    };
    boss.onKilled = () => {
      G.tower.bosses.racine = true;
      G.tower.shortcuts.p3 = true;
      // l'arbre-sanctuaire de la Serre reverdit
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.8, 8), matFor('leaf', 1, 1));
      c1.position.set(treeX, 17, treeZ); S.scene.add(c1);
      showMsg('LA RACINE VENGERESSE se fane — et l\'arbre-sanctuaire reverdit. La Clef de Sève tombe de ses branches ; le raccourci du Palier III s\'éveille.', 5);
      mkTowerKey('sap', treeX + 2.5, 12.25, treeZ + 2);
      saveGame(true);
      boss = null;
    };
    /* la Bénédiction, lancée à portée, ouvre la fenêtre de vulnérabilité */
    S.onHeal = () => {
      if (!boss || boss.dead || boss.fsm.kind !== 'racine') return;
      const d = Math.hypot(player.pos.x - boss.g.position.x, player.pos.z - boss.g.position.z);
      if (d < 9 && Math.abs(player.pos.y - boss.floorY) < 4) {
        boss.fsm.vulnT = 6; boss.stunT = Math.max(boss.stunT, 2.2);
        spawnBurst(boss.g.position.x, boss.g.position.y + 1, boss.g.position.z, 0x9fffb0, 26);
        showMsg('La Bénédiction embrase la sève corrompue : la Racine chancelle, frappez !', 3);
      }
    };
  } else {
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.8, 8), matFor('leaf', 1, 1));
    c1.position.set(treeX, 17, treeZ); S.scene.add(c1);
    if (!G.tower.keys.sap) mkTowerKey('sap', treeX + 2.5, 12.25, treeZ + 2);
  }

  mkPortal(TX, 0, TZ + 20.5, 0x8fe8ff, 'Sas — revenir au vestibule', () => true, () => '', () => gotoPalier(0));
  mkPortal(TX + 4, 12.25, TZ - 21, 0xff8a5a, 'Sas — Palier III : le Donjon de Fer',
    () => G.tower.bosses.racine && G.tower.keys.sap,
    () => G.tower.bosses.racine
      ? 'Le portail réclame la Clef de Sève.'
      : 'Le portail reste clos : la Racine Vengeresse étreint encore la Serre.',
    () => gotoPalier(3));
}

/* ================================================================
   PALIER III — LE DONJON DE FER (étages 10-14)
   Pièges mortels, lave froide et armures vides.
   Zone notable : la Fosse Mécanique (labyrinthe de flammes → Égide).
   Boss : le Chevalier de l'Éclipse (FSM stricte, §3.4).
   ================================================================ */
function buildPalier3() {
  mkBox(40, 1, 66, TX, -1, TZ - 8, 'stoneD');
  mkBox(1, 12, 66, TX - 20, 0, TZ - 8, 'iron');
  mkBox(1, 12, 66, TX + 20, 0, TZ - 8, 'iron');
  mkBox(40, 12, 1, TX, 0, TZ + 25, 'iron');
  mkBox(40, 12, 1, TX, 0, TZ - 41, 'iron');
  mkBox(42, 0.6, 68, TX, 12, TZ - 8, 'stoneD'); // plafond blindé (§3.2)

  /* étage 10 (y 0, z 12..25) : hall d'entrée, sas en « S » */
  mkBox(24, 6, 1, TX - 8, 0, TZ + 18, 'iron');
  mkBox(24, 6, 1, TX + 8, 0, TZ + 14, 'iron');
  floorSign(10, 'Le Donjon de Fer. Les armures patrouillent sans corps.', TX - 14, 0, TZ + 16);
  torch(TX + 14, 0, TZ + 16, 0xff8a5a, 1.2, 15);
  mkEnemy(TX - 6, TZ + 11, 0, [[TX - 12, TZ + 11], [TX, TZ + 11]], { type: 'sentinel', lvl: 11, color: 0x3a3f4a });

  /* étage 11 (z 2..10) : couloir des jets de flammes rythmés */
  mkBox(15, 6, 1, TX - 12.5, 0, TZ + 10, 'iron');
  mkBox(15, 6, 1, TX + 12.5, 0, TZ + 10, 'iron');
  floorSign(11, 'Les forges soufflent encore. Comptez leurs respirations.', TX - 17, 0, TZ + 8);
  mkHazard(TX - 6, TZ + 6, 6, 3.4, 0, 2.4, 16, 0xff7a3a, 'flamme', [3.4, 1.4]);
  mkHazard(TX + 3, TZ + 6, 6, 3.4, 0, 2.4, 16, 0xff7a3a, 'flamme', [3.4, 1.4, 1.7]);
  addPickup('heart', TX + 15, 0, TZ + 7);

  /* étage 12 (z -12..2) : LA FOSSE MÉCANIQUE — labyrinthe de rideaux de
     flammes PERMANENTS : seule l'Égide (touche 4) permet de les traverser. */
  mkBox(15, 6, 1, TX - 12.5, 0, TZ + 2, 'iron');
  mkBox(15, 6, 1, TX + 12.5, 0, TZ + 2, 'iron');
  floorSign(12, 'La Fosse Mécanique. Ici, le feu ne dort jamais : l\'Égide ou rien.', TX - 17, 0, TZ);
  // lave froide (bleutée) qui serpente au sol
  mkHazard(TX - 4, TZ - 5, 10, 2.6, 0, 1.4, 10, 0x5a8aff, 'lave froide');
  mkHazard(TX + 9, TZ - 9, 8, 2.6, 0, 1.4, 10, 0x5a8aff, 'lave froide');
  // cloisons du labyrinthe + rideaux de flammes permanents
  mkBox(12, 6, 1, TX - 14, 0, TZ - 4, 'iron');
  mkBox(24, 6, 1, TX + 8, 0, TZ - 4, 'iron');
  mkHazard(TX - 6, TZ - 4, 4.4, 1.6, 0, 2.6, 18, 0xff7a3a, 'flamme');
  mkBox(22, 6, 1, TX - 9, 0, TZ - 12, 'iron');
  mkBox(12, 6, 1, TX + 14, 0, TZ - 12, 'iron');
  mkHazard(TX + 5, TZ - 12, 5.4, 1.6, 0, 2.6, 18, 0xff7a3a, 'flamme');
  addPickup('mana', TX - 12, 0, TZ - 8);
  addPickup('maxhp', TX + 16, 0, TZ - 2); // Fragment de vitalité, gardé par le feu
  mkEnemy(TX + 8, TZ - 7, 0, [[TX + 4, TZ - 7], [TX + 12, TZ - 7]], { type: 'caster', lvl: 11 });

  /* étage 13 (z -26..-12) : la garnison des armures vides */
  floorSign(13, 'La garnison. Nul cœur ne bat sous ces heaumes.', TX - 17, 0, TZ - 14);
  torch(TX - 14, 0, TZ - 20, 0xff8a5a, 1.2, 15);
  torch(TX + 14, 0, TZ - 20, 0xff8a5a, 1.2, 15);
  mkEnemy(TX - 8, TZ - 18, 0, [[TX - 12, TZ - 18], [TX - 4, TZ - 18]], { type: 'sentinel', lvl: 12, color: 0x3a3f4a });
  mkEnemy(TX + 8, TZ - 20, 0, [[TX + 4, TZ - 20], [TX + 12, TZ - 20]], { type: 'brute', lvl: 11, color: 0x30353f });
  addPickup('heart', TX, 0, TZ - 24);

  /* étage 14 (z -40..-26) : l'arène du CHEVALIER DE L'ÉCLIPSE */
  mkBox(15, 6, 1, TX - 12.5, 0, TZ - 26, 'iron');
  mkBox(15, 6, 1, TX + 12.5, 0, TZ - 26, 'iron');
  floorSign(14, 'L\'arène de l\'Éclipse. Son armure est close — mais son dos porte les os du premier ordre.', TX - 17, 0, TZ - 28);
  /* deux blocs runiques : la Main céleste (touche 3) est la seule chose
     qui traverse sa garde — l'impact d'un bloc porté l'étourdit. */
  mkTkCube(TX - 7, 0.55, TZ - 29);
  mkTkCube(TX + 7, 0.55, TZ - 29);
  /* colonnes de feu de l'altération d'arène (préconstruites, activées par
     cycles — voir updateTower) */
  pillars = [];
  [[-8, -32], [0, -36], [8, -32], [-5, -38], [5, -38], [0, -30]].forEach(([ox, oz]) => {
    const mesh = mkCyl(0.8, 1, 5.5, TX + ox, 0, TZ + oz, 'rune', true, 8);
    const col = colliders[colliders.length - 1];
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff7a3a }));
    fl.position.set(TX + ox, 6.2, TZ + oz);
    S.scene.add(fl);
    mesh.visible = false; col.on = false; fl.visible = false;
    pillars.push({ mesh, col, fl, up: false });
  });

  if (!G.tower.bosses.chevalier) {
    boss = mkEnemy(TX, TZ - 34, 0, [[TX - 4, TZ - 34], [TX + 4, TZ - 34]], {
      type: 'brute', lvl: 13, hp: 1350, dmg: 38, scale: 2.2, speed: 1.7, chase: 3.1, color: 0x14101f
    });
    boss.tName = 'Le Chevalier de l\'Éclipse';
    /* FSM stricte (§3.4) : IDLE → CHASE → ATTACK_AOE / CHARGE → (STUNNED)
       → CHASE. La CHARGE traverse l'arène : télégraphe 0,7 s, puis ruée en
       ligne droite — seul un pas de côté l'esquive. La transition vers
       STUNNED n'obéit qu'à l'impact du tag « Projectile_MainCeleste » :
       un bloc runique porté par la Main céleste. */
    boss.fsm = { kind: 'chevalier', state: 'IDLE', t: 0, active: false, summonT: 12, chargeT: 5, cx: 0, cz: 0, hit1: false, hit2: false };
    boss.onDamaged = (d, knock) => {
      if (boss.fsm.state === 'STUNNED') return Math.round(d * 2); // hurtbox grande ouverte
      /* Hitbox asymétrique : la Hurtbox vit sur les os exposés du DOS ;
         de face, l'armure absorbe presque tout. */
      let behind = false;
      if (knock && (knock.x || knock.z)) {
        const l = Math.hypot(knock.x, knock.z) || 1;
        const fx = Math.sin(boss.g.rotation.y), fz = Math.cos(boss.g.rotation.y);
        behind = (knock.x / l) * fx + (knock.z / l) * fz > 0.35; // frappé dans le sens de son regard = dans le dos
      }
      return Math.round(d * (behind ? 1.6 : 0.35));
    };
    boss.onKilled = () => {
      G.tower.bosses.chevalier = true;
      G.tower.shortcuts.p4 = true;
      showMsg('LE CHEVALIER DE L\'ÉCLIPSE ploie le genou — son armure vide sonne comme une cloche. La Clef d\'Éther est vôtre ; le raccourci du Palier IV s\'éveille.', 5);
      mkTowerKey('ether', TX, 0, TZ - 34);
      saveGame(true);
      boss = null;
    };
  } else if (!G.tower.keys.ether) mkTowerKey('ether', TX, 0, TZ - 34);

  mkPortal(TX, 0, TZ + 23.5, 0x8fe8ff, 'Sas — revenir au vestibule', () => true, () => '', () => gotoPalier(0));
  mkPortal(TX, 0, TZ - 39.5, 0xffd97a, 'Sas — Palier IV : l\'Observatoire de l\'Aube',
    () => G.tower.bosses.chevalier && G.tower.keys.ether,
    () => G.tower.bosses.chevalier
      ? 'Le portail réclame la Clef d\'Éther.'
      : 'Le portail reste noir : l\'Éclipse règne encore sur l\'arène.',
    () => gotoPalier(4));
}

/* ================================================================
   PALIER IV — LE SOMMET (étage 15) : L'OBSERVATOIRE DE L'AUBE
   Calme, astres et révélations. Les 3 Clefs → l'Aura du Premier Foyer,
   et Lumen livre le lourd secret du jeu.
   ================================================================ */
function buildPalier4() {
  mkCyl(17, 18, 1, TX, -1, TZ, 'slabW', true, 24);
  // parapet circulaire bas : on voit les étoiles, on ne tombe pas
  for (let k = 0; k < 18; k++) {
    const a = k * Math.PI * 2 / 18;
    mkBox(2.2, 1.4, 0.6, TX + Math.cos(a) * 16.4, 0, TZ + Math.sin(a) * 16.4, 'stoneR');
  }
  floorSign(15, 'L\'Observatoire de l\'Aube. Le ciel, enfin.', TX + 10, 0, TZ + 8);
  // grand télescope de cuivre
  mkCyl(0.9, 1.2, 1.6, TX + 6, 0, TZ - 6, 'stoneR', true, 9);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 5, 10),
    new THREE.MeshStandardMaterial({ color: 0xc87a4a, roughness: 0.35, metalness: 0.7 }));
  tube.position.set(TX + 6.8, 3.1, TZ - 6.8);
  tube.rotation.z = -0.7; tube.rotation.x = 0.4;
  tube.castShadow = true;
  S.scene.add(tube);
  addInter(TX + 6, 0, TZ - 6, 2.6, 'Regarder dans le télescope', () => {
    showMsg('Par la lunette, la lune paraît immense — et, gravés sur sa face, trois cercles : les Larmes, vues depuis la nuit.', 4);
  });
  torch(TX - 8, 0, TZ + 6, 0xffd97a, 1.2, 16);
  torch(TX + 8, 0, TZ + 6, 0xffd97a, 1.2, 16);

  /* l'autel aux trois serrures */
  mkBox(2.6, 1.1, 2.6, TX, 0, TZ - 6, 'rune');
  const sockets = [];
  Object.keys(KEY_DEFS).forEach((k, i) => {
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 12),
      new THREE.MeshBasicMaterial({ color: KEY_DEFS[k].color }));
    c.position.set(TX - 0.8 + i * 0.8, 1.35, TZ - 6);
    c.rotation.x = Math.PI / 2;
    S.scene.add(c);
    sockets.push(c);
  });
  if (!G.tower.aura) {
    addInter(TX, 0, TZ - 4.6, 2.8, 'Insérer les trois Clefs', it => {
      const K = G.tower.keys;
      const n = (K.copper ? 1 : 0) + (K.sap ? 1 : 0) + (K.ether ? 1 : 0);
      if (n < 3) {
        showMsg('L\'autel réclame les trois Clefs de l\'Ascension (' + n + ' / 3) — Cuivre, Sève, Éther.', 3.5);
        return;
      }
      it.on = false;
      G.tower.aura = true;
      A.power();
      sockets.forEach(s => s.add(glow(0xffd97a, 2, 0.6)));
      spawnBurst(TX, 2, TZ - 6, 0xffd97a, 32);
      // le halo doré rejoint le porteur de flamme
      const h = glow(0xffd97a, 2.6, 0.35);
      h.position.y = 1.1;
      player.mesh.add(h);
      showMsg('L\'AURA DU PREMIER FOYER vous enveloppe : +15 % de dégâts, et le foyer répare lentement votre chair. (sauvegarde automatique)', 5);
      saveGame(true);
      setTimeout(lumenReveal, 1800);
    });
  } else {
    sockets.forEach(s => s.add(glow(0xffd97a, 2, 0.6)));
    addInter(TX, 0, TZ - 4.6, 2.8, 'Se recueillir devant l\'autel', () => {
      showMsg('Les trois Clefs chantent doucement dans leurs serrures. L\'Aura du Premier Foyer brûle en vous.', 3.5);
    });
  }

  /* Lumen attend au sommet (silhouette de lueur bleue) */
  const lum = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xbfe8ff }));
  lum.add(core, glow(0x8fd8ff, 2.6, 0.6));
  lum.position.set(TX - 3, 1.5, TZ - 6);
  S.scene.add(lum); spinners.push(lum);
  addInter(TX - 3, 0, TZ - 6, 2.6, 'Parler à Lumen', () => {
    if (G.tower.aura) lumenReveal();
    else showMsg('« Les trois Clefs, porteur de flamme. La vérité attend derrière trois serrures. »', 3.5);
  });

  /* ---- v8 : MAËLA, L'OMBRE SOUVENANTE ----
     Une ombre agenouillée près de l'autel. Tant que l'Aura ne brûle pas,
     elle n'a pas de voix ; ensuite, elle raconte la suite de l'histoire
     et NOMME le porteur au Seuil de l'Outre-Ciel (déblocage du Palier V). */
  mkNpc(TX + 2.5, 0, TZ + 2.5, {
    name: 'l\'ombre agenouillée', color: 0x241a3a, eye: 0x8ff4ff,
    halo: 0x6a4a9e, kneel: true, onTalk: maelaTalk
  });

  /* Le Seuil de l'Outre-Ciel : le portail du v8, au bord nord de la
     plate-forme. FLAGS STRICTS : aura obtenue ET Maëla rencontrée. */
  mkPortal(TX, 0, TZ - 12, 0xfff2b0, 'Le Seuil de l\'Outre-Ciel — étages 16-20',
    () => G.tower.aura && G.tower.met.maela,
    () => G.tower.aura
      ? 'Le Seuil attend qu\'une voix vous nomme. Parlez à l\'ombre agenouillée, près de l\'autel.'
      : 'Par-delà l\'Observatoire, le ciel reste clos : l\'Aura du Premier Foyer d\'abord.',
    () => { G.tower.shortcuts.p5 = true; saveGame(true); gotoPalier(5); });

  mkPortal(TX, 0, TZ + 15, 0x8fe8ff, 'Sas — revenir au vestibule', () => true, () => '', () => gotoPalier(0));
}
/* Le dialogue de Maëla — premier PNJ du v8. L'Aura rend leur voix aux
   ombres : c'est elle qui ouvre la suite du scénario. */
function maelaTalk() {
  if (!G.tower.aura) {
    showMsg('L\'ombre agenouillée frémit sans un mot. Quelque chose, en elle, cherche encore une voix.', 3.5);
    return;
  }
  if (!G.tower.met.maela) {
    openDialog([
      'Votre Aura... elle me rend ma voix. Cent ans que je n\'avais plus de nom. Je m\'appelais Maëla — premier ordre des porteurs de flamme.',
      'Lumen vous a dit ce que nous sommes devenus. Mais pas ce qui nous a dévorés. Une lumière trop pure projette une ombre à sa mesure : la nôtre s\'appelle l\'AVALE-LUNE. C\'est elle qui a gobé la lune, cette nuit-là.',
      'Elle niche toujours au-dessus de nous, dans l\'Outre-Ciel — l\'envers du firmament, là où notre capitaine, le Berger des Étoiles, garde encore son troupeau de constellations... corrompu, comme nous tous.',
      'Deux arts dorment là-haut, que même votre ordre a oubliés : la NOVA D\'AURORE et l\'ASTRE D\'AUBE. Sans la Nova, le voile de l\'Avale-Lune ne se déchirera jamais.',
      'Je vous nomme au Seuil, porteur de flamme. Franchissez-le. Rendez-nous la lune — et nous pourrons enfin dormir.'
    ], () => {
      G.tower.met.maela = true;
      showMsg('Le Seuil de l\'Outre-Ciel s\'éveille dans un chant d\'étoiles. (sauvegarde automatique)', 4);
      saveGame(true);
    }, 'MAËLA, L\'OMBRE SOUVENANTE');
  } else if (!G.tower.bosses.avale) {
    openDialog([
      '« Le Berger n\'était pas cruel, avant — il comptait les étoiles comme un vieux compte ses moutons. S\'il faut l\'abattre, faites-le en berger : d\'un coup franc. Et souvenez-vous : seule la Nova d\'Aurore, prononcée tout contre l\'Avale-Lune, déchire son voile. »'
    ], null, 'MAËLA, L\'OMBRE SOUVENANTE');
  } else {
    openDialog([
      '« La lune est revenue... je la sens à travers la pierre. Merci, porteur de flamme. Nous pouvons enfin fermer les yeux. »'
    ], null, 'MAËLA, L\'OMBRE SOUVENANTE');
  }
}
/* Le lourd secret d'Ombreciel, révélé par Lumen à l'Observatoire. */
function lumenReveal() {
  openDialog([
    'Tu as gravi les quinze étages, et l\'Aura du Premier Foyer t\'a reconnu. Alors écoute — voici ce que je n\'ai jamais osé te dire.',
    'Les ombres ne sont pas des envahisseuses. Elles n\'ont jamais franchi nos murailles : elles en sont les fondations.',
    'Ce sont les premiers porteurs de flamme. Lors de la Nuit sans lune, la lumière des Larmes d\'Aube devint trop pure — elle allait consumer la vallée entière.',
    'Ils se sont offerts à elle. La lumière les a dévorés jusqu\'à ne laisser que leur silhouette — une ombre. Ils se sont sacrifiés pour sauver le monde.',
    'Souviens-t\'en quand ta lame se lève, porteur de flamme : chaque ombre que tu affrontes fut une aube, avant toi.',
    'Et... regarde. L\'ombre agenouillée, près de l\'autel — elle essaie de parler depuis un siècle. Ton Aura est peut-être sa voix.'
  ], () => showMsg('Le ciel de l\'Observatoire semble soudain plus vaste.', 3));
}

/* ================================================================
   PALIER V — L'OUTRE-CIEL (étages 16-18) — v8
   L'envers du firmament : des îles flottantes au-dessus du vide (toute
   chute ramène à l'entrée du palier — Kill Z). La Nova d'Aurore dort sur
   l'île d'entrée ; Orin le cartographe céleste retisse le pont de
   constellations contre 3 Éclats d'étoile ; le Berger des Étoiles garde
   l'île du sommet. Récompense : la Clef d'Astre.
   ================================================================ */
function buildPalier5() {
  /* ---- étage 16 : l'île d'entrée ---- */
  mkBox(26, 1, 26, TX, -1, TZ + 12, 'slabW');
  floorSign(16, 'L\'Outre-Ciel. Les cartes des vivants s\'arrêtent ici.', TX + 8, 0, TZ + 16);
  torch(TX - 10, 0, TZ + 18, 0xfff2b0, 1.2, 16);
  torch(TX + 10, 0, TZ + 18, 0xfff2b0, 1.2, 16);
  // le troupeau d'étoiles : petites lueurs en lévitation tout autour des îles
  for (let i = 0; i < 14; i++) {
    const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.16),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    st.add(glow(0xfff2b0, 1.4, 0.5));
    st.position.set(TX - 18 + (i * 29) % 36, 2 + (i * 7) % 13, TZ + 20 - (i * 17) % 56);
    S.scene.add(st); spinners.push(st);
  }
  /* le piédestal de la NOVA D'AURORE (touche 7) — premier art perdu */
  towerPedestal(TX - 8, TZ + 7, 0, 'nova', 0xffd97a,
    'Nova d\'Aurore apprise ! (touche 7) Le lever du soleil, tenu dans un poing : colonne de lumière, triple anneau d\'aube — et les voiles de la Nuit la craignent.');
  addPickup('mana', TX - 11, 0, TZ + 10);
  addPickup('heart', TX + 11, 0, TZ + 12);
  /* ORIN, LE CARTOGRAPHE CÉLESTE — PNJ de quête (3 Éclats → le pont) */
  const bridgeParts = [];
  mkNpc(TX + 6, 0, TZ + 6, {
    name: 'Orin, le cartographe céleste', color: 0x1a2c4a, eye: 0x8fe8ff,
    halo: 0x5fc8ff, emissive: 0x0a1830, onTalk: () => orinTalk(bridgeParts)
  });
  // sa lunette de poche, plantée là depuis un siècle
  mkCyl(0.25, 0.35, 1.1, TX + 7.4, 0, TZ + 5.4, 'stoneR', true, 8);
  /* Éclat d'étoile n° 1 : sur l'île d'entrée, gardé par un Séraphin */
  mkShard(0, TX + 10, 0, TZ + 3);
  mkEnemy(TX + 8, TZ + 2, 0, [[TX + 5, TZ + 2], [TX + 11, TZ + 5]], { type: 'seraph', lvl: 14 });
  mkEnemy(TX - 6, TZ + 12, 0, [[TX - 10, TZ + 12], [TX - 2, TZ + 12]], { type: 'echo', lvl: 14 });

  /* ---- étage 17 : le chapelet d'îles (Pas du vent conseillé) ---- */
  mkBox(8, 1, 8, TX - 9, 1.4, TZ - 7, 'slabW');   // île A (y 2,4)
  mkBox(8, 1, 8, TX + 2, 3.8, TZ - 15, 'slabW');  // île B (y 4,8)
  mkBox(7, 1, 7, TX + 12, 3.8, TZ - 6, 'slabW');  // île C (y 4,8) — l'Éclat gardé
  mkBox(10, 1, 10, TX - 3, 6.2, TZ - 24, 'slabW');// le Belvédère (y 7,2)
  mkBox(6, 1, 6, TX + 10, 6.2, TZ - 22, 'slabW'); // île E (y 7,2) — l'Éclat des Échos
  floorSign(17, 'Le troupeau du Berger paissait ici. Les étoiles ont peur, maintenant.', TX - 6, 7.2, TZ - 21);
  /* Éclat n° 2 : île C, sous la garde d'un Titan d'obsidienne */
  mkShard(1, TX + 12, 4.8, TZ - 6);
  mkEnemy(TX + 12, TZ - 7.5, 4.8, [[TX + 10, TZ - 7.5], [TX + 14, TZ - 5]], { type: 'obsidian', lvl: 15 });
  /* Éclat n° 3 : île E, deux Échos de l'Aube en maraude */
  mkShard(2, TX + 10, 7.2, TZ - 22);
  mkEnemy(TX + 10, TZ - 20.5, 7.2, [[TX + 8.5, TZ - 20.5], [TX + 11.5, TZ - 23]], { type: 'echo', lvl: 15 });
  mkEnemy(TX + 2, TZ - 13, 4.8, [[TX - 1, TZ - 13], [TX + 5, TZ - 16]], { type: 'echo', lvl: 15 });
  addPickup('mana', TX - 9, 2.4, TZ - 7);
  addPickup('maxhp', TX + 12, 4.8, TZ - 4); // Fragment de vitalité, sous le Titan
  /* le Belvédère des étoiles : bivouac-sanctuaire du palier */
  bivouac(TX - 5, 7.2, TZ - 22, 'le Belvédère des étoiles', 'belvedere', false, 4.5);
  /* DALLE ERRANTE : une plateforme mobile navette entre l'île B et le
     Belvédère — les étoiles portent qui ose sauter au bon moment */
  mkMover(3, 0.5, 3, TX - 0.5, 5.6, TZ - 19.5, -2.2, 1.4, -3.8, 7);

  /* ---- LE PONT DE CONSTELLATIONS (quête d'Orin) ----
     Préconstruit mais éteint (pattern des colonnes du Chevalier) : les
     dalles ne deviennent solides et visibles qu'une fois le pont retissé.
     v8.3 — tracé corrigé : l'ancien pont montait DROIT SOUS l'île du
     Berger (x TX-3, z -33..-37) — les dalles finissaient sous son plancher
     (y 13) et le porteur se cognait au « mur » de l'île sans jamais
     pouvoir monter dessus. Le pont CONTOURNE désormais l'île par son
     flanc ouest (x < TX-12, hors de son emprise 24×24 centrée en z -40)
     et la dernière dalle affleure le sommet (dessus à y 14) : on marche
     directement sur l'île. Chaque marche fait ~1,7 m (saut : ~2,8 m). */
  [[TX - 9,    8.4,  TZ - 26.5, 3.2, 4],
   [TX - 14.5, 10.1, TZ - 29,   3.2, 4],
   [TX - 14.5, 11.8, TZ - 33,   3.2, 4],
   [TX - 13.9, 13.5, TZ - 37,   3.8, 4]].forEach(([bx, by, bz, bw, bd]) => {
    const mesh = mkBox(bw, 0.5, bd, bx, by, bz, 'slabW');
    const col = colliders[colliders.length - 1];
    const halo = glow(0xfff2b0, 2.6, 0.4);
    halo.position.set(bx, by + 1, bz);
    S.scene.add(halo);
    if (!G.tower.bridge) { mesh.visible = false; col.on = false; halo.visible = false; }
    bridgeParts.push({ mesh, col, halo });
  });
  addInter(TX - 3, 6.2, TZ - 27, 3, 'Scruter le gouffre d\'étoiles', () => {
    showMsg(G.tower.bridge
      ? 'Le pont de constellations scintille au-dessus du vide. Merci, Orin.'
      : 'L\'île du Berger flotte bien trop haut, bien trop loin. Il faudrait un pont... ou un cartographe qui commande aux étoiles.', 3.5);
  });

  /* ---- étage 18 : l'île du Berger ---- */
  mkBox(24, 1, 24, TX, 13, TZ - 40, 'slabW');
  /* deux DALLES MOBILES flanquent l'arène au-dessus du vide : pendant la
     pluie d'étoiles du Berger, elles sont le seul refuge — mais elles
     bougent, et le vide attend dessous */
  mkMover(4, 0.5, 4, TX - 15, 13.5, TZ - 40, 0, 0, 5.5, 6);
  mkMover(4, 0.5, 4, TX + 15, 13.5, TZ - 40, 0, 0, -5.5, 6, 3);
  floorSign(18, 'La bergerie céleste. Il ne reste au Berger que des étoiles mordues.', TX - 9, 14, TZ - 32);
  torch(TX - 9, 14, TZ - 47, 0xfff2b0, 1.2, 16);
  torch(TX + 9, 14, TZ - 47, 0xfff2b0, 1.2, 16);
  addPickup('heart', TX + 9, 14, TZ - 33);
  mkEnemy(TX - 8, TZ - 33, 14, [[TX - 8, TZ - 32], [TX - 4, TZ - 32]], { type: 'seraph', lvl: 15 });

  /* ---- BOSS (étage 18) : LE BERGER DES ÉTOILES ----
     Séraphin géant : bordées d'étoiles filantes, PLUIE d'étoiles
     télégraphiée sous les porteurs, invocation d'Échos de l'Aube. */
  if (!G.tower.bosses.berger) {
    boss = mkEnemy(TX, TZ - 42, 14, [[TX - 5, TZ - 42], [TX + 5, TZ - 42]], {
      type: 'seraph', lvl: 15, hp: 2300, dmg: 34, scale: 2.6, speed: 2.1, chase: 3.4
    });
    boss.tName = 'Le Berger des Étoiles';
    boss.fsm = { kind: 'berger', state: 'IDLE', t: 0, starT: 4, rainT: 7.5, summonT: 12, enrMsg: false };
    /* v8.4 — fondu céleste : le Berger fond sur les porteurs (chargeProfOf) */
    boss.chargeProf = { wind: 0.5, speed: 16, range: 14, dmgMul: 1.1, cool: 7, col: 0xfff2b0 };
    boss.onKilled = () => {
      G.tower.bosses.berger = true;
      G.tower.shortcuts.p6 = true;
      showMsg('LE BERGER DES ÉTOILES s\'éteint constellation par constellation... La Clef d\'Astre scintille dans son troupeau, et le raccourci du Palier VI s\'éveille au vestibule.', 5);
      mkTowerKey('astre', TX, 14, TZ - 40);
      saveGame(true);
      boss = null;
    };
  } else if (!G.tower.keys.astre) mkTowerKey('astre', TX, 14, TZ - 40);

  // portails du palier
  mkPortal(TX, 0, TZ + 23, 0x8fe8ff, 'Sas — revenir au vestibule', () => true, () => '', () => gotoPalier(0));
  mkPortal(TX, 14, TZ - 49, 0x6a5aff, 'Sas — Palier VI : le Cœur de la Nuit sans lune',
    () => G.tower.bosses.berger && G.tower.keys.astre,
    () => G.tower.bosses.berger
      ? 'Le portail réclame la Clef d\'Astre.'
      : 'Le portail reste voilé : le Berger veille encore sur son troupeau.',
    () => gotoPalier(6));
}
/* Le dialogue d'Orin — la quête des Éclats d'étoile (fetch-quest du v8). */
function orinTalk(bridgeParts) {
  if (!G.tower.met.orin) {
    openDialog([
      'Oh ! Un vivant ! Pardonnez le désordre — Orin, cartographe céleste de feu l\'Observatoire. Enfin, « feu »... comme moi, techniquement.',
      'J\'ai cartographié l\'Outre-Ciel toute ma mort. Le pont de constellations qui menait à la bergerie du Berger s\'est effondré la Nuit sans lune : ses trois ÉCLATS D\'ÉTOILE se sont éparpillés sur les îles.',
      'Rapportez-les-moi — trois éclats, pas un de moins — et je vous retisse le pont. Les étoiles m\'obéissent encore : c\'est bien le seul avantage d\'être mort ici.',
      'Ma lunette a vu : un éclat près de mon île, un sous la garde d\'un Titan d\'obsidienne, un sur l\'île des Échos. Prudence avec les Échos — ils courent plus vite que le regret.'
    ], () => { G.tower.met.orin = true; saveGame(true); }, 'ORIN, CARTOGRAPHE CÉLESTE');
    return;
  }
  if (G.tower.bridge) {
    openDialog(['« Mon plus beau pont. Filez — et si vous croisez la Grande Ourse là-haut, dites-lui qu\'elle me doit toujours une constellation. »'], null, 'ORIN, CARTOGRAPHE CÉLESTE');
    return;
  }
  if (G.tower.shards >= 3) {
    G.tower.shards -= 3; // les Éclats retournent au ciel : le pont se tisse
    G.tower.bridge = true;
    bridgeParts.forEach((bp, i) => {
      bp.mesh.visible = true; bp.col.on = true; bp.halo.visible = true;
      spawnBurst(bp.mesh.position.x, bp.mesh.position.y + 0.8, bp.mesh.position.z, 0xfff2b0, 18);
      lightPillar(bp.mesh.position.x, bp.mesh.position.y, bp.mesh.position.z, 0xfff2b0, 1.2, 6 + i * 2, 0.9);
    });
    A.power();
    showMsg('Orin lance les trois Éclats au ciel : LE PONT DE CONSTELLATIONS se retisse vers l\'île du Berger ! (sauvegarde automatique)', 5);
    saveGame(true);
  } else {
    openDialog(['« Il me manque des Éclats d\'étoile : ' + G.tower.shards + ' / 3. Cherchez les lueurs qui chantent, sur les îles — et gare au Titan d\'obsidienne, si ma lunette ne ment pas. »'], null, 'ORIN, CARTOGRAPHE CÉLESTE');
  }
}

/* ================================================================
   PALIER VI — LE CŒUR DE LA NUIT SANS LUNE (étages 19-20) — v8
   L'instant du désastre, figé depuis cent ans : la lune à demi avalée
   pend au plafond, la nuit liquide ruisselle au sol. L'Astre d'Aube dort
   à l'étage 19 ; le Veilleur sans Nom garde la porte de la Dernière
   Nuit ; derrière, l'AVALE-LUNE. Récompense : la Couronne de l'Aube.
   ================================================================ */
function buildPalier6() {
  // la salle figée : 42 × 62, murs de 16 m, plafond blindé (§3.2)
  mkBox(42, 1, 62, TX, -1, TZ - 2, 'stoneD');
  mkBox(1, 16, 62, TX - 21, 0, TZ - 2, 'iron');
  mkBox(1, 16, 62, TX + 21, 0, TZ - 2, 'iron');
  mkBox(42, 16, 1, TX, 0, TZ + 29, 'iron');
  mkBox(42, 16, 1, TX, 0, TZ - 33, 'iron');
  mkBox(44, 0.6, 64, TX, 16, TZ - 2, 'stoneD');
  // sas d'entrée en « S »
  mkBox(26, 6, 1, TX - 8, 0, TZ + 21, 'iron');
  mkBox(26, 6, 1, TX + 8, 0, TZ + 17, 'iron');
  torch(TX - 4, 0, TZ + 23, 0x6a5aff, 1.1, 14);

  /* ---- étage 19 : la Veille du Bout de la Nuit ---- */
  floorSign(19, 'Le Cœur de la Nuit sans lune. Ici, l\'instant du désastre n\'a jamais fini de tomber.', TX - 16, 0, TZ + 14);
  /* la lune à demi avalée, suspendue — le décor raconte le crime */
  const moon = new THREE.Mesh(new THREE.SphereGeometry(3.4, 18, 18),
    new THREE.MeshStandardMaterial({ color: 0xcfd8ff, roughness: 0.9, emissive: 0x8fa8ff, emissiveIntensity: 0.35 }));
  moon.position.set(TX, 10.5, TZ - 6);
  moon.add(glow(0xbfd8ff, 8, 0.35));
  S.scene.add(moon);
  const bite = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 14),
    new THREE.MeshBasicMaterial({ color: 0x05030f }));
  bite.position.set(TX + 2.4, 11.6, TZ - 6.8); // la morsure de l'Avale-Lune
  S.scene.add(bite);
  // débris de nuit en suspension (l'instant figé)
  for (let i = 0; i < 10; i++) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), matFor('stoneD', 1, 1));
    d.position.set(TX - 16 + (i * 31) % 32, 4 + (i * 5) % 9, TZ + 12 - (i * 13) % 38);
    S.scene.add(d); spinners.push(d);
  }
  /* la nuit liquide : des mares d'obscurité qui rongent la chair */
  mkHazard(TX - 8, TZ + 7, 9, 5, 0, 1.6, 14, 0x4a2a8a, 'nuit liquide');
  mkHazard(TX + 12, TZ + 2, 7, 5, 0, 1.6, 14, 0x4a2a8a, 'nuit liquide');
  mkHazard(TX + 2, TZ - 6, 6, 4, 0, 1.6, 14, 0x4a2a8a, 'nuit liquide');
  /* le piédestal de l'ASTRE D'AUBE (touche 8), gardé par deux Titans */
  towerPedestal(TX + 8, TZ - 10, 0, 'meteor', 0xffe9a8,
    'Astre d\'Aube appris ! (touche 8) Levez les yeux, visez : une étoile répond — et tombe où porte votre regard.');
  mkEnemy(TX + 4, TZ - 12, 0, [[TX + 2, TZ - 12], [TX + 7, TZ - 12]], { type: 'obsidian', lvl: 15 });
  mkEnemy(TX + 12, TZ - 12, 0, [[TX + 10, TZ - 12], [TX + 14, TZ - 10]], { type: 'obsidian', lvl: 15 });
  mkEnemy(TX - 6, TZ + 2, 0, [[TX - 10, TZ + 2], [TX - 2, TZ + 2]], { type: 'echo', lvl: 15 });
  mkEnemy(TX - 14, TZ - 8, 0, [[TX - 16, TZ - 8], [TX - 11, TZ - 6]], { type: 'seraph', lvl: 16 });
  addPickup('herb', TX - 17, 0, TZ + 4);
  addPickup('herb', TX + 17, 0, TZ + 8);
  addPickup('mana', TX - 4, 0, TZ - 10);
  /* v8.4 — plus de bivouac dans la salle du boss final (retour joueur) :
     la Veille n'offre qu'une torche. Le point de contrôle reste l'entrée
     du palier (Kill Z / mort) — l'arène se mérite d'une traite. */
  torch(TX - 12, 0, TZ - 12, 0xffc06a, 1.2, 14);

  /* ---- la porte de la Dernière Nuit + LE VEILLEUR SANS NOM ---- */
  mkBox(17, 16, 1, TX - 12.5, 0, TZ - 18, 'iron');
  mkBox(17, 16, 1, TX + 12.5, 0, TZ - 18, 'iron');
  mkBox(8, 10, 1, TX, 6, TZ - 18, 'iron');
  const gate = mkDoor(8, 6, 1, TX, 0, TZ - 18, 'iron');
  if (G.tower.met.veilleur) openDoor(gate); // porte déjà accordée par le Veilleur
  torch(TX - 4.8, 0, TZ - 16.8, 0xbfd8ff, 1.2, 14);
  torch(TX + 4.8, 0, TZ - 16.8, 0xbfd8ff, 1.2, 14);
  mkNpc(TX + 3.2, 0, TZ - 15, {
    name: 'le Veilleur sans Nom', color: 0x14101f, eye: 0xbfd8ff,
    halo: 0x3a3f6a, onTalk: () => veilleurTalk(gate)
  });

  /* ---- étage 20 : l'arène de l'AVALE-LUNE ---- */
  floorSign(20, 'La Dernière Nuit. Ce qui a mangé la lune n\'a jamais quitté la table.', TX - 16, 0, TZ - 20);
  /* quatre puits de lune : la seule lumière que la bête n'a pas bue */
  [[-14, -22], [14, -22], [-14, -30], [14, -30]].forEach(([ox, oz]) => {
    torch(TX + ox, 0, TZ + oz, 0xbfd8ff, 1.4, 18);
  });
  if (!G.tower.bosses.avale) {
    boss = mkEnemy(TX, TZ - 26, 0, [[TX - 5, TZ - 26], [TX + 5, TZ - 26]], {
      type: 'obsidian', lvl: 16, hp: 3400, dmg: 45, scale: 3, speed: 1.25, chase: 2.7, color: 0x060312
    });
    boss.tName = 'L\'Avale-Lune';
    /* Le VOILE DE NUIT absorbe 90 % des dégâts. Seule la NOVA D'AURORE
       (touche 7), prononcée tout contre la bête, le déchire 6 s — le
       crochet S.onNova est l'exact pendant de S.onHeal (Racine).
       v8.4 : deux armes nouvelles — le RAYON DE NUIT (laser au ras du sol
       qui tourne autour de la bête : il faut SAUTER à son passage) et les
       GLOBES DE NUIT (grosses bombes en cloche que seule l'ÉGIDE bloque —
       l'esquive ne suffit pas). */
    boss.fsm = { kind: 'avale', state: 'IDLE', t: 0, veilT: 0, msgT: 0, gustT: 5, crocT: 3.5, summonT: 14,
      beamT: 8, beamOn: 0, beamA: 0, bombT: 6, bombMsg: 0, active: false };
    boss.chargeProf = { wind: 0.6, speed: 15, range: 14, dmgMul: 1.2, cool: 6.5, col: 0x8a5aff };
    /* le rayon de nuit : préconstruit invisible (capturé par l'instance) */
    const beam = new THREE.Mesh(new THREE.BoxGeometry(30, 0.24, 0.55),
      new THREE.MeshBasicMaterial({ color: 0xa88aff, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.visible = false;
    S.scene.add(beam);
    boss.beam = beam;
    boss.onDamaged = (d) => {
      if (boss.fsm.veilT > 0) return Math.round(d * 1.4);
      if (boss.fsm.msgT <= 0) {
        boss.fsm.msgT = 3;
        showMsg('Le voile de la Nuit boit vos coups... La NOVA D\'AURORE (touche 7), prononcée tout contre lui, le déchirerait !', 3.2);
      }
      return Math.max(1, Math.round(d * 0.1));
    };
    boss.onKilled = () => {
      G.tower.bosses.avale = true;
      beam.visible = false; // le rayon de nuit s'éteint avec la bête
      showMsg('L\'AVALE-LUNE se déchire d\'un bord à l\'autre — et recrache un siècle de nuit. Quelque chose de clair monte vers le plafond...', 5);
      lightPillar(TX, 0, TZ - 26, 0xfff2c8, 4, 15, 1.4);
      spawnBurst(TX, 3, TZ - 26, 0xbfd8ff, 36);
      crownAltar();
      saveGame(true);
      boss = null;
    };
    S.onNova = (pl) => {
      if (!boss || boss.dead || boss.fsm.kind !== 'avale') return;
      const d = Math.hypot(pl.pos.x - boss.g.position.x, pl.pos.z - boss.g.position.z);
      if (d < 11 && Math.abs(pl.pos.y - boss.floorY) < 4) {
        boss.fsm.veilT = 6;
        boss.stunT = Math.max(boss.stunT, 2.4);
        spawnBurst(boss.g.position.x, boss.g.position.y + 1.4, boss.g.position.z, 0xffd97a, 34);
        lightPillar(boss.g.position.x, boss.floorY, boss.g.position.z, 0xffd97a, 3.4, 14, 1);
        showMsg('La Nova déchire le voile : l\'AVALE-LUNE saigne de lumière — frappez !', 3);
      }
    };
  } else if (!G.tower.crown) crownAltar(); // la Couronne attend toujours son porteur

  mkPortal(TX, 0, TZ + 26.5, 0x8fe8ff, 'Sas — revenir au vestibule', () => true, () => '', () => gotoPalier(0));
}
/* v8.4 — un globe de nuit part en cloche vers un porteur : télégraphe au
   sol, vol parabolique, explosion que seule l'Égide bloque (boucle bombs). */
function nightBomb(bp, floorY) {
  const tgt = (S.COOP && p2.pos && Math.random() < 0.4) ? p2 : player;
  const g = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0x0a0518, emissive: 0x8a5aff, emissiveIntensity: 1.2, roughness: 0.5 }));
  g.add(glow(0x8a5aff, 4, 0.7));
  g.position.set(bp.x, bp.y + 1.5, bp.z);
  S.scene.add(g);
  groundRing(tgt.pos.x, floorY, tgt.pos.z, 0x8a5aff, 4.5); // télégraphe : il tombe ICI
  bombs.push({ mesh: g, x0: bp.x, y0: bp.y + 1.5, z0: bp.z,
    tx: tgt.pos.x, ty: floorY, tz: tgt.pos.z, t: 0, T: 1.5 });
  A.hostileBolt();
}
/* Le dialogue du Veilleur sans Nom — il ouvre la porte de la Dernière
   Nuit et enseigne la mécanique du voile (Nova d'Aurore). */
function veilleurTalk(gate) {
  if (!G.tower.met.veilleur) {
    openDialog([
      'Halte. Pas par orgueil — par habitude. Je garde cette porte depuis cent ans, et je ne sais plus ni mon nom, ni pourquoi je la gardais.',
      'Mon frère portait une armure comme la mienne, quatorze étages plus bas. Le Chevalier de l\'Éclipse, disent les échos. Si tu es arrivé jusqu\'ici, alors tu vaux d\'entendre ceci :',
      'Derrière cette porte, la Nuit sans lune n\'est pas un souvenir. Elle TOMBE ENCORE. L\'Avale-Lune y digère la lune depuis cent ans, enroulée dans un voile qu\'aucune lame n\'entame.',
      'Seule une aube portée à bout de bras — la NOVA D\'AURORE, prononcée tout contre elle — déchire ce voile. Frappe pendant qu\'il saigne de lumière. Puis recommence. Encore. Jusqu\'au bout.',
      'Va. Et si tu croises mon nom là-dedans... garde-le. Il est mieux mort que moi.'
    ], () => {
      G.tower.met.veilleur = true;
      openDoor(gate);
      showMsg('Le Veilleur s\'écarte : la porte de la Dernière Nuit se lève. (sauvegarde automatique)', 4);
      saveGame(true);
    }, 'LE VEILLEUR SANS NOM');
  } else if (!G.tower.bosses.avale) {
    openDialog(['« Le voile ne craint que la Nova d\'Aurore, prononcée tout contre lui. Frappe quand il saigne de lumière — puis recommence. »'], null, 'LE VEILLEUR SANS NOM');
  } else {
    openDialog(['« C\'est donc fini. La nuit tombe... et s\'arrête enfin de tomber. Repose-toi, porteur d\'aube. Nous, on va pouvoir dormir. »'], null, 'LE VEILLEUR SANS NOM');
  }
}
/* La Couronne de l'Aube : récompense du vrai final, matérialisée sur
   l'arène une fois l'Avale-Lune déchirée. */
function crownAltar() {
  const x = TX, y = 0, z = TZ - 26;
  const g = new THREE.Group();
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, roughness: 0.25,
    metalness: 0.8, emissive: 0xffd97a, emissiveIntensity: 0.5 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 8, 18), crownMat);
  band.rotation.x = Math.PI / 2;
  g.add(band);
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 5), crownMat);
    p.position.set(Math.cos(a) * 0.34, 0.2, Math.sin(a) * 0.34);
    g.add(p);
  }
  g.add(glow(0xffe9a8, 3, 0.75));
  g.position.set(x, y + 1.5, z);
  S.scene.add(g); spinners.push(g);
  addInter(x, y, z, 2.8, 'Recevoir la Couronne de l\'Aube', it => {
    it.on = false;
    S.scene.remove(g);
    const i = spinners.indexOf(g); if (i >= 0) spinners.splice(i, 1);
    G.tower.crown = true;
    A.power();
    spawnBurst(x, y + 1.6, z, 0xffe9a8, 36);
    lightPillar(x, y, z, 0xffe9a8, 2.6, 12, 1.1);
    const h = glow(0xfff2c8, 1.6, 0.5); // le diadème rejoint le porteur
    h.position.y = 2.05;
    player.mesh.add(h);
    showMsg('LA COURONNE DE L\'AUBE est vôtre : +10 % de dégâts, et le foyer veille sur votre esprit. (sauvegarde automatique)', 5);
    saveGame(true);
    setTimeout(finalEpilogue, 1600);
  });
}
/* Le vrai épilogue du v8 : la lune rendue au ciel — puis l'ÉCRAN DE FIN
   (v8.4) : le jeu s'arrête vraiment sur un « bien joué » plein écran. */
function finalEpilogue() {
  openDialog([
    'Au-dessus des remparts, le voile de la Dernière Nuit se déchire d\'un bord à l\'autre du ciel — et la lune en tombe, immense, intacte, comme rendue par la marée.',
    'Dans les jardins, dans l\'Ossuaire, au cœur de la Forêt de Nuit : partout, les ombres s\'arrêtent. Elles lèvent leurs yeux clairs vers la première vraie nuit depuis cent ans.',
    '« La Nuit sans lune est finie, porteur de flamme. Il reste des ombres, oui — mais plus une seule qui soit orpheline du ciel. »',
    'Et quelque part près du télescope, une ombre agenouillée sourit dans le noir : « Nous pouvons enfin dormir. Toi... toi, tu peux enfin veiller. »'
  ], showVictory);
}

/* ================================================================
   MISE À JOUR PAR IMAGE — dangers, FSM des Maîtres d'Étage, arène
   ================================================================ */
function inZone(pl, z) {
  return Math.abs(pl.pos.x - z.x) < z.w / 2 && Math.abs(pl.pos.z - z.z) < z.d / 2 &&
    pl.pos.y > z.y - 0.5 && pl.pos.y < z.y + z.h;
}
export function updateTower(dt) {
  if (!S.inTower) return;

  /* respiration douce des PNJ (Maëla, Orin, le Veilleur) */
  for (const n of npcs) n.g.position.y = n.y0 + Math.sin(G.time * 1.4 + n.seed) * 0.06;

  /* plateformes mobiles : la dalle bouge, son collider et son passager avec */
  updateMovers();

  /* zones de danger : jets rythmés (period) ou permanents. hurt() respecte
     l'Égide et l'invulnérabilité — le tempo des dégâts reste équitable.
     Les mares toxiques (poison, nuit liquide) laissent en plus un VENIN
     qui ronge encore la chair après en être sorti. */
  for (const z of hazards) {
    if (z.period) {
      const t = (G.time + (z.period[2] || 0)) % z.period[0];
      z.on = t < z.period[1];
      z.mesh.visible = z.on;
      if (z.on && Math.random() < dt * 8)
        spawnBurst(z.x + (Math.random() - 0.5) * z.w, z.y + 0.4, z.z + (Math.random() - 0.5) * z.d, 0xff9a3a, 1);
    }
    if (!z.on) continue;
    const venom = z.label === 'poison' || z.label === 'nuit liquide';
    if (inZone(player, z)) { hurt(z.dmg, null); if (venom) applyPoison(player, 3, 5); }
    if (S.COOP && p2.pos && inZone(p2, z)) { hurtP2(z.dmg, null); if (venom) applyPoison(p2, 3, 5); }
  }

  /* télégraphes d'impact : pointes de la Racine (défauts verts), pluie
     d'étoiles du Berger, crocs de nuit de l'Avale-Lune (dmg/col/r/pillar
     paramétrés par le Maître d'Étage qui les invoque). */
  for (let i = spikes.length - 1; i >= 0; i--) {
    const sp = spikes[i];
    sp.t -= dt;
    if (Math.random() < dt * 10) spawnBurst(sp.x, sp.y + 0.2, sp.z, sp.col || 0x4ade5a, 1);
    if (sp.t <= 0) {
      spawnBurst(sp.x, sp.y + 0.6, sp.z, sp.col ? sp.col : 0x7ade5a, 14);
      if (sp.pillar) lightPillar(sp.x, sp.y, sp.z, sp.col || 0xffe9a8, 1.4, 8, 0.5);
      A.impact();
      const R = sp.r || 2.2;
      const near = pl => Math.hypot(pl.pos.x - sp.x, pl.pos.z - sp.z) < R && Math.abs(pl.pos.y - sp.y) < 2;
      if (near(player)) { hurt(sp.dmg || 22, { x: sp.x, z: sp.z }); if (sp.pois) applyPoison(player, sp.pois[0], sp.pois[1]); }
      if (S.COOP && p2.pos && near(p2)) { hurtP2(sp.dmg || 22, { x: sp.x, z: sp.z }); if (sp.pois) applyPoison(p2, sp.pois[0], sp.pois[1]); }
      spikes.splice(i, 1);
    }
  }

  /* v8.4 — GLOBES DE NUIT de l'Avale-Lune : gros projectiles en cloche,
     télégraphiés au sol, dont l'éclat n'est bloqué QUE par l'Égide —
     l'esquive et le Pas du vent ne suffisent pas. */
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    b.t += dt;
    const k = Math.min(1, b.t / b.T);
    b.mesh.position.set(
      b.x0 + (b.tx - b.x0) * k,
      b.y0 + (b.ty - b.y0) * k + Math.sin(k * Math.PI) * 6,
      b.z0 + (b.tz - b.z0) * k);
    if (Math.random() < dt * 12)
      spawnBurst(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, 0x8a5aff, 2);
    if (k >= 1) {
      S.scene.remove(b.mesh);
      spawnBurst(b.tx, b.ty + 0.8, b.tz, 0x8a5aff, 30);
      groundRing(b.tx, b.ty, b.tz, 0x8a5aff, 4.5);
      lightPillar(b.tx, b.ty, b.tz, 0x6a5aff, 2, 9, 0.7);
      A.impact();
      const boom = (pl, isP2) => {
        if (Math.hypot(pl.pos.x - b.tx, pl.pos.z - b.tz) > 4.5 || Math.abs(pl.pos.y - b.ty) > 3) return;
        const shielded = isP2 ? p2.shieldT > 0 : G.shieldT > 0;
        if (shielded) {
          spawnBurst(pl.pos.x, pl.pos.y + 1.1, pl.pos.z, 0x66c8ff, 10);
          A.impact();
        } else {
          pl.invuln = 0; // le globe IGNORE l'esquive : seule l'Égide le bloque
          if (isP2) hurtP2(46, { x: b.tx, z: b.tz }); else hurt(46, { x: b.tx, z: b.tz });
        }
      };
      boom(player, false);
      if (S.COOP && p2.pos) boom(p2, true);
      bombs.splice(i, 1);
    }
  }

  /* altération d'arène du Chevalier : des colonnes de feu montent par cycles */
  if (S.palier === 3 && (!boss || boss.dead) && pillars.some(p => p.up)) {
    // le Chevalier tombé, son arène s'apaise : plus aucune colonne dressée
    for (const p of pillars) { p.mesh.visible = false; p.col.on = false; p.fl.visible = false; p.up = false; }
  }
  if (S.palier === 3 && boss && !boss.dead) {
    pillarT -= dt;
    if (pillarT <= 0) {
      pillarT = 4.5; // l'arène respire plus vite : le sol change sous les pieds
      for (const p of pillars) { p.mesh.visible = false; p.col.on = false; p.fl.visible = false; p.up = false; }
      for (let k = 0; k < 4; k++) {
        const p = pillars[(pillarI + k) % pillars.length];
        p.mesh.visible = true; p.col.on = true; p.fl.visible = true; p.up = true;
        spawnBurst(p.mesh.position.x, 0.5, p.mesh.position.z, 0xff7a3a, 10);
      }
      pillarI = (pillarI + 3) % pillars.length;
      A.burst(0.2, 300, 'lowpass', 0.1);
    }
  }

  if (!boss || boss.dead) return;
  /* v8.4 — pendant une RUÉE (Enemies.stepCharge), la ruée pilote seule le
     Maître d'Étage : sa FSM d'attaques marque une pause le temps du sprint */
  if (boss.charge) return;
  const f = boss.fsm;
  f.t += dt;
  if (f.msgT !== undefined) f.msgT -= dt;
  const bp = boss.g.position;
  const dP = Math.hypot(player.pos.x - bp.x, player.pos.z - bp.z);
  const sameY = Math.abs(player.pos.y - boss.floorY) < 4;

  if (f.kind === 'archiviste') {
    if (f.state === 'IDLE') {
      if (dP < 14 && sameY) {
        f.state = 'CHASE'; boss.state = 'chase';
        showMsg('— MAÎTRE D\'ÉTAGE : L\'ARCHIVISTE CORROMPU — « Chhhut. On ne crie pas dans les Archives. »', 4);
      }
      return;
    }
    f.stormT -= dt; f.summonT -= dt; f.inkT -= dt;
    if (f.stormT <= 0) {
      f.stormT = 3.4;
      spawnBurst(bp.x, bp.y + 1, bp.z, 0xe8dfc0, 16);
      // tempête de parchemins à l'encre corrosive : toucher = venin
      radialBurst(boss, 12, boss.dmg, 11.5, 0xff8a5a, 0, [3, 5]);
    }
    /* geysers d'encre : télégraphes sous les pieds du porteur visé */
    if (f.inkT <= 0 && dP < 18 && sameY) {
      f.inkT = 5.5;
      const tgt = (S.COOP && p2.pos && Math.random() < 0.4) ? p2 : player;
      for (let k = 0; k < 2; k++)
        spikes.push({ x: tgt.pos.x + (Math.random() - 0.5) * 2.6, z: tgt.pos.z + (Math.random() - 0.5) * 2.6,
          y: boss.floorY, t: 0.8 + k * 0.3, dmg: 20, col: 0x6a5aff, r: 2.3, pois: [3, 5] });
      if (!f.inkMsg) { f.inkMsg = true; showMsg('L\'encre BOUT sous vos pieds — écartez-vous des lueurs !', 2.5); }
    }
    if (f.summonT <= 0) {
      f.summonT = 8.5;
      let alive = 0;
      for (const e of enemies) if (!e.dead && e.tag === 'summon') alive++;
      /* v8.4 : il déchire DEUX pages à la fois, jusqu'à 4 Traqueurs actifs */
      let born = 0;
      while (alive < 4 && born < 2) {
        const sx = bp.x + (Math.random() - 0.5) * 6, sz = bp.z + (Math.random() - 0.5) * 6;
        const w = mkEnemy(sx, sz, boss.floorY, [[sx, sz], [sx + 2, sz]], { type: 'wraith', lvl: 10, tag: 'summon', dyn: true });
        w.state = 'chase'; w.alerted = true;
        spawnBurst(sx, boss.floorY + 1, sz, 0xe8dfc0, 14);
        alive++; born++;
      }
      if (born) showMsg('L\'Archiviste déchire ses pages : des Traqueurs d\'encre en jaillissent !', 2.5);
    }
  } else if (f.kind === 'racine') {
    if (f.vulnT > 0) {
      f.vulnT -= dt;
      // la sève embrasée goutte : la fenêtre de vulnérabilité se voit aussi
      if (Math.random() < dt * 7)
        spawnBurst(bp.x + (Math.random() - 0.5) * 1.6, bp.y + 0.8, bp.z + (Math.random() - 0.5) * 1.6, 0x9fffb0, 2);
    }
    boss.cloakMat.emissive.setHex(f.vulnT > 0 ? 0x2a6a2a : 0x0d0820);
    /* v8.4 — la Serre se bat avec elle : rejetons de sève (2 à la fois) */
    f.summonT -= dt;
    if (f.summonT <= 0 && dP < 20 && sameY) {
      f.summonT = 11;
      let alive = 0;
      for (const e of enemies) if (!e.dead && e.tag === 'summon') alive++;
      let born = 0;
      while (alive < 4 && born < 2) {
        const sx = bp.x + (Math.random() - 0.5) * 7, sz = bp.z + (Math.random() - 0.5) * 7;
        const w = mkEnemy(sx, sz, boss.floorY, [[sx, sz], [sx + 2, sz]],
          { type: 'wraith', lvl: 10, tag: 'summon', dyn: true, color: 0x1a3a20 });
        w.state = 'chase'; w.alerted = true;
        spawnBurst(sx, boss.floorY + 1, sz, 0x7ade5a, 14);
        alive++; born++;
      }
      if (born) showMsg('La Racine crache des rejetons de sève !', 2.5);
    }
    f.spikeT -= dt; f.sporeT -= dt;
    if (f.spikeT <= 0 && dP < 16 && sameY) {
      f.spikeT = f.vulnT > 0 ? 4 : 2.4;
      /* racines-harpons VENIMEUX : télégraphe sous le porteur visé, plus
         un second harpon décalé — rester immobile ne pardonne plus */
      const tgt = (S.COOP && p2.pos && Math.random() < 0.4) ? p2 : player;
      spikes.push({ x: tgt.pos.x, z: tgt.pos.z, y: boss.floorY, t: 0.9, dmg: 32, pois: [4, 7] });
      spikes.push({ x: tgt.pos.x + (Math.random() - 0.5) * 3.6, z: tgt.pos.z + (Math.random() - 0.5) * 3.6,
        y: boss.floorY, t: 1.15, dmg: 32, pois: [4, 7] });
    }
    /* nuage de spores : bordée radiale empoisonnée — l'arène entière respire mal */
    if (f.sporeT <= 0 && dP < 18 && sameY) {
      f.sporeT = 8;
      spawnBurst(bp.x, bp.y + 1.2, bp.z, 0x7ade5a, 22);
      radialBurst(boss, 10, 16, 8.5, 0x7ade5a, 0, [4, 7]);
      if (!f.sporeMsg) { f.sporeMsg = true; showMsg('La Racine crache un NUAGE DE SPORES — chaque spore inocule son venin !', 3); }
    }
  } else if (f.kind === 'chevalier') {
    /* FSM stricte : IDLE / CHASE / ATTACK_AOE / STUNNED (§3.4) */
    if (f.state === 'IDLE') {
      boss.state = 'patrol';
      if (dP < 12 && sameY) {
        f.state = 'CHASE'; boss.state = 'chase'; f.t = 0;
        showMsg('— MAÎTRE D\'ÉTAGE : LE CHEVALIER DE L\'ÉCLIPSE — L\'armure vide s\'incline... puis lève sa lame.', 4);
      }
      return;
    }
    /* impact du tag « Projectile_MainCeleste » : un bloc runique porté par
       la Main céleste qui touche le Chevalier → STUNNED (seule transition). */
    if (f.state !== 'STUNNED' && S.tkHeld) {
      const c = S.tkHeld.mesh.position;
      if (Math.hypot(c.x - bp.x, c.z - bp.z) < 2.4 && Math.abs(c.y - bp.y) < 2.6) {
        tkToggle(); // le bloc échappe à la Main au moment de l'impact
        f.state = 'STUNNED'; f.t = 0;
        boss.stunT = 3.5;
        spawnBurst(bp.x, bp.y + 1, bp.z, 0xc8a8ff, 26);
        A.impact();
        showMsg('Le bloc runique fracasse l\'armure : le Chevalier est ÉTOURDI — son dos est exposé !', 3.5);
      }
    }
    if (f.state === 'STUNNED') {
      if (boss.stunT <= 0) { f.state = 'CHASE'; boss.state = 'chase'; f.t = 0; }
      return;
    }
    /* v8.4 — il appelle sa garnison : deux armures vides à la fois */
    f.summonT -= dt;
    if (f.summonT <= 0 && f.state !== 'IDLE' && dP < 22) {
      f.summonT = 12;
      let alive = 0;
      for (const e of enemies) if (!e.dead && e.tag === 'summon') alive++;
      let born = 0;
      while (alive < 4 && born < 2) {
        const sx = bp.x + (Math.random() - 0.5) * 8, sz = bp.z + (Math.random() - 0.5) * 8;
        const w = mkEnemy(sx, sz, boss.floorY, [[sx, sz], [sx + 2, sz]],
          { type: 'sentinel', lvl: 12, tag: 'summon', dyn: true, color: 0x3a3f4a });
        w.state = 'chase'; w.alerted = true;
        spawnBurst(sx, boss.floorY + 1, sz, 0xc8a8ff, 14);
        alive++; born++;
      }
      if (born) showMsg('Le Chevalier lève le poing : la garnison des armures vides répond !', 2.5);
    }
    f.chargeT -= dt;
    if (f.state === 'CHASE') {
      boss.state = 'chase';
      if (f.chargeT <= 0 && dP > 5.5 && dP < 16 && sameY) {
        /* CHARGE : l'armure se ramasse sur elle-même, fixe sa proie... */
        f.state = 'CHARGE_WIND'; f.t = 0;
        boss.state = 'patrol'; boss.wps = [[bp.x, bp.z]];
        spawnBurst(bp.x, bp.y + 0.8, bp.z, 0xff3a3a, 22);
        A.alert();
      } else if (dP < 3.4 && sameY) { f.state = 'ATTACK_AOE'; f.t = 0; f.active = false;
        spawnBurst(bp.x, bp.y + 0.4, bp.z, 0xff3a3a, 18); // télégraphe (wind-up)
        A.alert();
      }
    } else if (f.state === 'CHARGE_WIND') {
      boss.state = 'patrol'; boss.wps = [[bp.x, bp.z]];
      const tgt = (S.COOP && p2.pos && dP > Math.hypot(p2.pos.x - bp.x, p2.pos.z - bp.z)) ? p2 : player;
      boss.g.rotation.y = Math.atan2(tgt.pos.x - bp.x, tgt.pos.z - bp.z);
      if (Math.random() < dt * 16) spawnBurst(bp.x, bp.y + 0.9, bp.z, 0xff3a3a, 2);
      if (f.t >= 0.7) {
        f.state = 'CHARGING'; f.t = 0; f.hit1 = false; f.hit2 = false;
        const dx = tgt.pos.x - bp.x, dz = tgt.pos.z - bp.z, l = Math.hypot(dx, dz) || 1;
        f.cx = dx / l; f.cz = dz / l;
        A.impact();
      }
    } else if (f.state === 'CHARGING') {
      /* ... puis TRAVERSE l'arène en ligne droite (murs respectés) */
      boss.state = 'patrol'; boss.wps = [[bp.x, bp.z]];
      const step = 16 * dt, ey = boss.floorY + 1;
      let blocked = false;
      const nx = bp.x + f.cx * step, nz = bp.z + f.cz * step;
      if (!pointSolid(nx, ey, bp.z)) bp.x = nx; else blocked = true;
      if (!pointSolid(bp.x, ey, nz)) bp.z = nz; else blocked = true;
      boss.g.rotation.y = Math.atan2(f.cx, f.cz);
      if (Math.random() < dt * 22) spawnBurst(bp.x, bp.y + 0.3, bp.z, 0xff7a3a, 2);
      const hitNow = pl => Math.hypot(pl.pos.x - bp.x, pl.pos.z - bp.z) < 2.4 && Math.abs(pl.pos.y - boss.floorY) < 3;
      if (!f.hit1 && hitNow(player)) { f.hit1 = true; hurt(32, bp); }
      if (S.COOP && p2.pos && !f.hit2 && hitNow(p2)) { f.hit2 = true; hurtP2(32, bp); }
      if (f.t >= 0.9 || blocked) { f.state = 'CHASE'; boss.state = 'chase'; f.t = 0; f.chargeT = 6.5; }
    } else if (f.state === 'ATTACK_AOE') {
      boss.state = 'patrol'; boss.wps = [[bp.x, bp.z]]; // il se plante pour frapper
      if (f.t >= 0.85 && !f.active) {
        /* ACTIVE FRAMES : la hitbox de dégâts n'existe que dans cette fenêtre */
        f.active = true;
        spawnBurst(bp.x, bp.y + 0.3, bp.z, 0xff7a3a, 30);
        A.impact();
        const hitR = 5;
        if (Math.hypot(player.pos.x - bp.x, player.pos.z - bp.z) < hitR && sameY) hurt(boss.dmg, bp);
        if (S.COOP && p2.pos && Math.hypot(p2.pos.x - bp.x, p2.pos.z - bp.z) < hitR &&
            Math.abs(p2.pos.y - boss.floorY) < 4) hurtP2(boss.dmg, bp);
      }
      if (f.t >= 1.55) { f.state = 'CHASE'; boss.state = 'chase'; f.t = 0; }
    }
  } else if (f.kind === 'berger') {
    /* LE BERGER DES ÉTOILES (étage 18) : bordées d'étoiles filantes,
       pluie d'étoiles télégraphiée, invocation d'Échos de l'Aube. */
    if (f.state === 'IDLE') {
      if (dP < 16 && sameY) {
        f.state = 'CHASE'; boss.state = 'chase';
        showMsg('— MAÎTRE D\'ÉTAGE : LE BERGER DES ÉTOILES — « Mon troupeau... tu marches sur mon troupeau. »', 4);
      }
      return;
    }
    /* enrage sous 50 % de PV : le troupeau entier se cabre — tout s'accélère */
    const bEnr = boss.hp / boss.maxHp < 0.5;
    if (bEnr && !f.enrMsg) {
      f.enrMsg = true;
      spawnBurst(bp.x, bp.y + 1.4, bp.z, 0xffd97a, 30);
      showMsg('Le Berger S\'EMBRASE : « Mon troupeau... TOUT mon troupeau ! » — les dalles mobiles sont votre refuge !', 3.5);
    }
    f.starT -= dt; f.rainT -= dt; f.summonT -= dt;
    if (f.starT <= 0) {
      f.starT = bEnr ? 2.6 : 3.4;
      spawnBurst(bp.x, bp.y + 1.4, bp.z, 0xfff2b0, 18);
      radialBurst(boss, bEnr ? 15 : 13, boss.dmg, 12, 0xfff2b0); // bordée d'étoiles filantes
    }
    if (f.rainT <= 0 && dP < 22 && sameY) {
      f.rainT = bEnr ? 4.6 : 6;
      /* pluie d'étoiles : impacts dorés télégraphiés sous les porteurs */
      const nRain = bEnr ? 5 : 4;
      for (let k = 0; k < nRain; k++) {
        const tgt = (S.COOP && p2.pos && k === 1) ? p2 : player;
        spikes.push({ x: tgt.pos.x + (Math.random() - 0.5) * 4, z: tgt.pos.z + (Math.random() - 0.5) * 4,
          y: boss.floorY, t: 0.85 + k * 0.28, dmg: 34, col: 0xffe9a8, r: 2.8, pillar: true });
      }
      showMsg('Le Berger siffle : ses étoiles PLONGENT — fuyez les lueurs au sol !', 2.5);
    }
    if (f.summonT <= 0) {
      f.summonT = 10;
      let alive = 0;
      for (const e of enemies) if (!e.dead && e.tag === 'summon') alive++;
      if (alive < 3) {
        const sx = bp.x + (Math.random() - 0.5) * 8, sz = bp.z + (Math.random() - 0.5) * 8;
        const w = mkEnemy(sx, sz, boss.floorY, [[sx, sz], [sx + 2, sz]], { type: 'echo', lvl: 15, tag: 'summon', dyn: true });
        w.state = 'chase'; w.alerted = true;
        spawnBurst(sx, boss.floorY + 1, sz, 0xfff2b0, 16);
        showMsg('Une étoile tombe du troupeau — un Écho de l\'Aube en jaillit !', 2.5);
      }
    }
  } else if (f.kind === 'avale') {
    /* L'AVALE-LUNE (étage 20) : voile de nuit quasi impénétrable (10 % des
       dégâts) que seule la Nova d'Aurore déchire (S.onNova → veilT), voile
       dévorant radial, crocs de nuit télégraphiés, Échos recrachés, et une
       gueulée de zone façon Chevalier quand on colle. Sous 50 % de PV, la
       bête s'enrage : tout s'accélère. */
    if (f.veilT > 0) {
      f.veilT -= dt;
      /* le voile déchiré SAIGNE de lumière : la fenêtre de dégâts se voit */
      if (Math.random() < dt * 9)
        spawnBurst(bp.x + (Math.random() - 0.5) * 2, bp.y + 0.6 + Math.random() * 1.6, bp.z + (Math.random() - 0.5) * 2, 0xffd97a, 2);
    }
    boss.cloakMat.emissive.setHex(f.veilT > 0 ? 0x8a6a2a : 0x08041a);
    if (f.state === 'IDLE') {
      if (dP < 15 && sameY) {
        f.state = 'CHASE'; boss.state = 'chase';
        showMsg('— MAÎTRE D\'ÉTAGE : L\'AVALE-LUNE — Le noir au fond de la salle ouvre un œil. Puis deux. Puis la gueule.', 4.5);
      }
      return;
    }
    const enraged = boss.hp / boss.maxHp < 0.5;
    f.gustT -= dt; f.crocT -= dt; f.summonT -= dt; f.beamT -= dt; f.bombT -= dt;
    if (f.gustT <= 0) {
      f.gustT = enraged ? 3.2 : 4.4;
      spawnBurst(bp.x, bp.y + 1.2, bp.z, 0x6a5aff, 20);
      /* v8.4 : GROS orbes de nuit (size 0.55) — la bordée se voit venir */
      radialBurst(boss, enraged ? 16 : 12, boss.dmg - 10, 11.5, 0x6a5aff, 0.55); // voile dévorant
    }
    /* ---- v8.4 : LE RAYON DE NUIT — laser au ras du sol qui tourne autour
       de la bête. Rester au sol sur sa ligne = saigner ; il se SAUTE. ---- */
    if (f.beamOn > 0) {
      f.beamOn -= dt;
      f.beamA += dt * (enraged ? 1.5 : 1.05);
      const bm = boss.beam;
      bm.visible = true;
      bm.position.set(bp.x, boss.floorY + 0.35, bp.z);
      bm.rotation.y = f.beamA;
      bm.material.opacity = 0.65 + 0.25 * Math.sin(G.time * 18);
      if (Math.random() < dt * 16) {
        const rr = (Math.random() - 0.5) * 28;
        spawnBurst(bp.x + Math.cos(f.beamA) * rr, boss.floorY + 0.4, bp.z - Math.sin(f.beamA) * rr, 0xa88aff, 1);
      }
      const beamHit = (pl, isP2) => {
        const dx = pl.pos.x - bp.x, dz = pl.pos.z - bp.z;
        if (Math.hypot(dx, dz) > 15) return;
        if (pl.pos.y - boss.floorY > 0.85) return; // en l'air : le rayon passe SOUS les pieds
        const perp = Math.abs(dx * Math.sin(f.beamA) + dz * Math.cos(f.beamA));
        if (perp < 0.85) { if (isP2) hurtP2(26, bp); else hurt(26, bp); }
      };
      beamHit(player, false);
      if (S.COOP && p2.pos) beamHit(p2, true);
      if (f.beamOn <= 0) bm.visible = false;
    }
    if (f.beamT <= 0) {
      f.beamT = enraged ? 11 : 14;
      f.beamOn = enraged ? 6 : 5;
      f.beamA = Math.random() * Math.PI;
      A.alert();
      showMsg('L\'Avale-Lune fauche la salle d\'un RAYON DE NUIT — SAUTEZ à son passage !', 3);
    }
    /* ---- v8.4 : LES GLOBES DE NUIT — voir la boucle bombs plus haut ---- */
    if (f.bombT <= 0 && dP < 24 && sameY) {
      f.bombT = enraged ? 6.5 : 9;
      nightBomb(bp, boss.floorY);
      if (!f.bombMsg) { f.bombMsg = 1;
        showMsg('Un GLOBE DE NUIT monte de la gueule — son éclat traverse l\'esquive : seule l\'ÉGIDE (touche 4) le bloque !', 3.5);
      }
    }
    if (f.crocT <= 0 && dP < 20 && sameY) {
      f.crocT = enraged ? 1.9 : 2.7;
      /* crocs de nuit CORROSIFS : la morsure de l'ombre inocule la nuit liquide */
      const tgt = (S.COOP && p2.pos && Math.random() < 0.4) ? p2 : player;
      spikes.push({ x: tgt.pos.x, z: tgt.pos.z, y: boss.floorY, t: 0.8, dmg: 40, col: 0x8a5aff, r: 2.4, pois: [4, 8] });
      if (enraged) spikes.push({ x: tgt.pos.x + (Math.random() - 0.5) * 4, z: tgt.pos.z + (Math.random() - 0.5) * 4,
        y: boss.floorY, t: 1.1, dmg: 40, col: 0x8a5aff, r: 2.4, pois: [4, 8] });
    }
    if (f.summonT <= 0) {
      f.summonT = 11;
      let alive = 0;
      for (const e of enemies) if (!e.dead && e.tag === 'summon') alive++;
      if (alive < 3) {
        const sx = bp.x + (Math.random() - 0.5) * 7, sz = bp.z + (Math.random() - 0.5) * 7;
        const w = mkEnemy(sx, sz, boss.floorY, [[sx, sz], [sx + 2, sz]], { type: 'echo', lvl: 16, tag: 'summon', dyn: true });
        w.state = 'chase'; w.alerted = true;
        spawnBurst(sx, boss.floorY + 1, sz, 0x6a5aff, 14);
        showMsg('L\'Avale-Lune recrache un morceau de nuit : un Écho jaillit !', 2.5);
      }
    }
    if (f.state === 'CHASE') {
      boss.state = 'chase';
      if (dP < 4.5 && sameY) {
        f.state = 'ATTACK_AOE'; f.t = 0; f.active = false;
        spawnBurst(bp.x, bp.y + 0.5, bp.z, 0xff3a5a, 16); // télégraphe (la gueule s'ouvre)
        A.alert();
      }
    } else if (f.state === 'ATTACK_AOE') {
      boss.state = 'patrol'; boss.wps = [[bp.x, bp.z]]; // elle se plante pour mordre
      if (f.t >= 0.75 && !f.active) {
        /* ACTIVE FRAMES : la gueulée n'existe que dans cette fenêtre */
        f.active = true;
        spawnBurst(bp.x, bp.y + 0.3, bp.z, 0x8a5aff, 26);
        A.impact();
        const hitR = 5.6;
        if (Math.hypot(player.pos.x - bp.x, player.pos.z - bp.z) < hitR && sameY) hurt(boss.dmg, bp);
        if (S.COOP && p2.pos && Math.hypot(p2.pos.x - bp.x, p2.pos.z - bp.z) < hitR &&
            Math.abs(p2.pos.y - boss.floorY) < 4) hurtP2(boss.dmg, bp);
      }
      if (f.t >= 1.35) { f.state = 'CHASE'; boss.state = 'chase'; f.t = 0; }
    }
  }
}
