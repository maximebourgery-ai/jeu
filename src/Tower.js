/* ================================================================
   L'ASCENSION DE LA TOUR DU LEVANT — v7.1 (l'épreuve ultime)
   15 étages thématiques répartis en 4 PALIERS INSTANCIÉS :
     · Palier I   — Les Archives Vertigineuses (étages 1-4)  → Clef de Cuivre
     · Palier II  — La Serre des Ombres        (étages 5-9)  → Clef de Sève
     · Palier III — Le Donjon de Fer           (étages 10-14)→ Clef d'Éther
     · Palier IV  — L'Observatoire de l'Aube   (étage 15)    → l'Aura du
       Premier Foyer et le secret des ombres.

   LEVEL STREAMING (§3.1 du GDD) : un seul palier existe en mémoire à la
   fois. Le site est bâti loin du château (x ≈ 400) ; franchir un portail
   décharge l'étage précédent et charge le suivant sans écran de chargement
   (sas runiques en « S » : aucun palier ne voit l'autre). L'ouverture des
   portails dépend de FLAGS STRICTS (hasKilledBoss && hasFloorKey), jamais
   d'un trigger physique.
   ================================================================ */
import * as THREE from 'three';
import {
  G, S, POWERS,
  colliders, doors, pickups, inter, enemies, projectiles, tkCubes,
  spinners, flames, player, p2
} from './state.js';
import { A } from './Audio.js';
import { showMsg } from './UI.js';
import {
  mkBox, mkCyl, addInter, addPickup, torch, bivouac, spawnBurst, mkTkCube
} from './World.js';
import { matFor, glow } from './AssetManager.js';
import { mkEnemy } from './Enemies.js';
import { hurt, hurtP2 } from './Player.js';
import { tkToggle } from './Powers.js';
import { openDialog } from './Quests.js';
import { saveGame } from './SaveSystem.js';
import { craftAction } from './Crafting.js';

/* Site de l'instance (hors du monde : le brouillard nocturne l'isole) */
const TX = 400, TZ = 0;
/* Points d'entrée de chaque palier (0 = vestibule-sas) */
const ENTRY = [
  { x: TX, y: 0.2, z: TZ + 13 },
  { x: TX, y: 0.2, z: TZ + 14 },
  { x: TX, y: 0.2, z: TZ + 16 },
  { x: TX, y: 0.2, z: TZ + 21 },
  { x: TX, y: 0.2, z: TZ + 12 }
];
const TERRACE = { x: 58, y: 23.2, z: 46.8 }; // terrasse de la Tour du Levant

/* ---- état runtime du palier chargé (jamais sauvegardé tel quel) ---- */
let snap = null;         // instantané des collections du monde avant le build
let origAdd = null;      // S.scene.add d'origine (capture des meshes du palier)
const hazards = [];      // zones de danger {x,z,w,d,y,h,dmg,label,period,on,mesh}
const spikes = [];       // télégraphes de la Racine {x,z,y,t}
let boss = null;         // Maître d'Étage du palier courant
let pillars = [];        // colonnes de feu de l'arène du Chevalier
let pillarT = 0, pillarI = 0;

const KEY_DEFS = {
  copper: { name: 'Clef de Cuivre', color: 0xc87a4a },
  sap:    { name: 'Clef de Sève',   color: 0x7ade5a },
  ether:  { name: 'Clef d\'Éther',  color: 0x9a8cff }
};
const allPowersKnown = () => POWERS.every(p => G.powers[p.id]);
const powersCount = () => POWERS.filter(p => G.powers[p.id]).length;

/* ================================================================
   INSTANCIATION — capture & déchargement (level streaming)
   ================================================================ */
function beginBuild() {
  snap = {
    col: colliders.length, doors: doors.length, pickups: pickups.length,
    inter: inter.length, enemies: enemies.length, flames: flames.length,
    spinners: spinners.length, tk: tkCubes.length, added: []
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
  for (const o of snap.added) S.scene.remove(o);
  for (const pr of projectiles) S.scene.remove(pr.mesh);
  projectiles.length = 0;
  hazards.length = 0; spikes.length = 0;
  boss = null; pillars = []; pillarT = 0; pillarI = 0;
  S.onHeal = null;
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
  addInter(x, y, z, 2.4, label, () => {
    if (!canOpen()) { showMsg(lockedMsg(), 3.2); return; }
    A.door();
    spawnBurst(x, y + 1.8, z, color, 22);
    onEnter();
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
/* Plaque d'étage (repère narratif des 15 étages) */
function floorSign(n, theme, x, y, z) {
  mkBox(1.2, 1.5, 0.25, x, y, z, 'stoneR');
  addInter(x, y, z, 2.4, 'Lire la plaque de l\'étage ' + n, () => {
    showMsg('— Étage ' + n + ' / 15 — ' + theme, 3);
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
/* Bordée radiale de projectiles hostiles (tempête de parchemins) */
function radialBurst(e, n, dmg, speed, color) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + G.time;
    const dir = new THREE.Vector3(Math.cos(a), -0.04, Math.sin(a));
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xe8dfc0, emissive: color, emissiveIntensity: 0.9, roughness: 0.6 }));
    core.add(glow(color, 1.8, 0.6));
    core.position.set(e.g.position.x, e.g.position.y + 0.8, e.g.position.z);
    S.scene.add(core);
    projectiles.push({ mesh: core, vel: dir.multiplyScalar(speed), life: 2.8, dmg, hostile: true, spin: 9 });
  }
  A.hostileBolt();
}

/* ================================================================
   ENTRÉE / SORTIE / TRANSITIONS
   ================================================================ */
export function enterTower() {
  gotoPalier(0);
  showMsg('— L\'ASCENSION DE LA TOUR DU LEVANT — Quinze étages vous séparent de l\'Observatoire de l\'Aube.', 5);
}
export function leaveTower(silent) {
  unloadPalier();
  S.inTower = false; S.palier = 0;
  player.pos.set(TERRACE.x, TERRACE.y, TERRACE.z); player.vel.set(0, 0, 0);
  if (S.COOP && p2.pos) { p2.pos.set(TERRACE.x + 1.4, TERRACE.y, TERRACE.z + 0.6); p2.vel.set(0, 0, 0); }
  G.checkpoint = { x: TERRACE.x, y: TERRACE.y, z: TERRACE.z };
  if (!silent) showMsg('Le sas vous rend à la terrasse de la Tour du Levant.', 3);
}
function gotoPalier(n) {
  unloadPalier();
  beginBuild();
  try {
    if (n === 0) buildVestibule();
    else if (n === 1) buildPalier1();
    else if (n === 2) buildPalier2();
    else if (n === 3) buildPalier3();
    else buildPalier4();
  } finally { endBuild(); }
  S.inTower = true; S.palier = n;
  const e = ENTRY[n];
  player.pos.set(e.x, e.y, e.z); player.vel.set(0, 0, 0);
  if (S.COOP && p2.pos) { p2.pos.set(e.x + 1.3, e.y, e.z + 0.8); p2.vel.set(0, 0, 0); }
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
    showMsg('« Quinze étages, quatre paliers, trois clefs. Au sommet, l\'Observatoire — et la vérité sur la Nuit sans lune. »', 4.5);
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
     Tisseur géant qui invoque des tempêtes de parchemins. */
  if (!G.tower.bosses.archiviste) {
    boss = mkEnemy(TX, TZ - 12, 15.2, [[TX - 6, TZ - 12], [TX + 6, TZ - 12]], {
      type: 'caster', lvl: 11, hp: 520, dmg: 18, scale: 2.6, speed: 1.4, chase: 2.2
    });
    boss.tName = 'L\'Archiviste Corrompu';
    boss.fsm = { kind: 'archiviste', state: 'IDLE', t: 0, stormT: 3.5, summonT: 8 };
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
  bivouac(TX - 14, 3.25, TZ - 4.5, 'la Salle de l\'Alchimiste', 'alchimiste', false);

  /* étage 7 (y 6) : corniche nord (montée par piliers taillés) */
  mkBox(3, 4.5, 2.6, TX - 6, 0, TZ - 14, 'stoneR');
  mkBox(12, 0.5, 7, TX - 1, 5.75, TZ - 17.5, 'stoneR');
  floorSign(7, 'Les racines percent la pierre comme du papier.', TX + 3, 6.25, TZ - 19);
  addPickup('mana', TX - 4, 6.25, TZ - 18);

  /* étage 8 (y 9) : balcon est au-dessus du vide */
  mkBox(2.8, 7.5, 2.6, TX + 7, 0, TZ - 16, 'stoneR');
  mkBox(10, 0.5, 8, TX + 14, 8.75, TZ - 14, 'stoneR');
  floorSign(8, 'D\'ici, la Serre entière murmure.', TX + 17, 9.25, TZ - 10);
  addPickup('heart', TX + 17, 9.25, TZ - 17);
  mkHazard(TX + 13, TZ - 11, 4, 3, 9.25, 1.4, 8, 0x4ade5a, 'poison');

  /* étage 9 (y 12) : l'autel de la Racine */
  mkBox(2.6, 10.5, 2.6, TX + 8, 0, TZ - 19, 'stoneR');
  mkBox(16, 0.5, 10, TX - 2, 11.75, TZ - 16.5, 'stoneR');
  floorSign(9, 'L\'arbre-sanctuaire de la Serre. Corrompu jusqu\'à la sève.', TX + 4, 12.25, TZ - 20);

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
      type: 'brute', lvl: 12, hp: 700, dmg: 24, scale: 2.4, speed: 0.8, chase: 1.5, color: 0x1a3a20
    });
    boss.tName = 'La Racine Vengeresse';
    boss.fsm = { kind: 'racine', state: 'CHASE', t: 0, spikeT: 3, vulnT: 0, msgT: 0 };
    boss.onDamaged = (d) => {
      if (boss.fsm.vulnT > 0) return Math.round(d * 1.5);
      if (boss.fsm.msgT <= 0) {
        boss.fsm.msgT = 2.5;
        showMsg('La sève corrompue absorbe vos coups... Une Bénédiction (touche 6) prononcée tout près la ferait chanceler !', 3);
      }
      return Math.max(1, Math.round(d * 0.2));
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
      type: 'brute', lvl: 13, hp: 900, dmg: 34, scale: 2.2, speed: 1.3, chase: 2.4, color: 0x14101f
    });
    boss.tName = 'Le Chevalier de l\'Éclipse';
    /* FSM stricte (§3.4) : IDLE → CHASE → ATTACK_AOE → (STUNNED) → CHASE.
       La transition vers STUNNED n'obéit qu'à l'impact du tag
       « Projectile_MainCeleste » : un bloc runique porté par la Main céleste. */
    boss.fsm = { kind: 'chevalier', state: 'IDLE', t: 0, active: false };
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

  mkPortal(TX, 0, TZ + 15, 0x8fe8ff, 'Sas — revenir au vestibule', () => true, () => '', () => gotoPalier(0));
}
/* Le lourd secret d'Ombreciel, révélé par Lumen à l'Observatoire. */
function lumenReveal() {
  openDialog([
    'Tu as gravi les quinze étages, et l\'Aura du Premier Foyer t\'a reconnu. Alors écoute — voici ce que je n\'ai jamais osé te dire.',
    'Les ombres ne sont pas des envahisseuses. Elles n\'ont jamais franchi nos murailles : elles en sont les fondations.',
    'Ce sont les premiers porteurs de flamme. Lors de la Nuit sans lune, la lumière des Larmes d\'Aube devint trop pure — elle allait consumer la vallée entière.',
    'Ils se sont offerts à elle. La lumière les a dévorés jusqu\'à ne laisser que leur silhouette — une ombre. Ils se sont sacrifiés pour sauver le monde.',
    'Souviens-t\'en quand ta lame se lève, porteur de flamme : chaque ombre que tu affrontes fut une aube, avant toi.'
  ], () => showMsg('Le ciel de l\'Observatoire semble soudain plus vaste.', 3));
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

  /* zones de danger : jets rythmés (period) ou permanents. hurt() respecte
     l'Égide et l'invulnérabilité — le tempo des dégâts reste équitable. */
  for (const z of hazards) {
    if (z.period) {
      const t = (G.time + (z.period[2] || 0)) % z.period[0];
      z.on = t < z.period[1];
      z.mesh.visible = z.on;
      if (z.on && Math.random() < dt * 8)
        spawnBurst(z.x + (Math.random() - 0.5) * z.w, z.y + 0.4, z.z + (Math.random() - 0.5) * z.d, 0xff9a3a, 1);
    }
    if (!z.on) continue;
    if (inZone(player, z)) hurt(z.dmg, null);
    if (S.COOP && p2.pos && inZone(p2, z)) hurtP2(z.dmg, null);
  }

  /* télégraphes de pointes de la Racine */
  for (let i = spikes.length - 1; i >= 0; i--) {
    const sp = spikes[i];
    sp.t -= dt;
    if (Math.random() < dt * 10) spawnBurst(sp.x, sp.y + 0.2, sp.z, 0x4ade5a, 1);
    if (sp.t <= 0) {
      spawnBurst(sp.x, sp.y + 0.6, sp.z, 0x7ade5a, 14);
      A.impact();
      const near = pl => Math.hypot(pl.pos.x - sp.x, pl.pos.z - sp.z) < 2.2 && Math.abs(pl.pos.y - sp.y) < 2;
      if (near(player)) hurt(22, { x: sp.x, z: sp.z });
      if (S.COOP && p2.pos && near(p2)) hurtP2(22, { x: sp.x, z: sp.z });
      spikes.splice(i, 1);
    }
  }

  /* altération d'arène du Chevalier : des colonnes de feu montent par cycles */
  if (S.palier === 3 && boss && !boss.dead) {
    pillarT -= dt;
    if (pillarT <= 0) {
      pillarT = 6;
      for (const p of pillars) { p.mesh.visible = false; p.col.on = false; p.fl.visible = false; p.up = false; }
      for (let k = 0; k < 3; k++) {
        const p = pillars[(pillarI + k) % pillars.length];
        p.mesh.visible = true; p.col.on = true; p.fl.visible = true; p.up = true;
        spawnBurst(p.mesh.position.x, 0.5, p.mesh.position.z, 0xff7a3a, 10);
      }
      pillarI = (pillarI + 3) % pillars.length;
      A.burst(0.2, 300, 'lowpass', 0.1);
    }
  }

  if (!boss || boss.dead) return;
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
    f.stormT -= dt; f.summonT -= dt;
    if (f.stormT <= 0) {
      f.stormT = 4.5;
      spawnBurst(bp.x, bp.y + 1, bp.z, 0xe8dfc0, 16);
      radialBurst(boss, 9, boss.dmg, 10, 0xff8a5a); // tempête de parchemins
    }
    if (f.summonT <= 0) {
      f.summonT = 11;
      let alive = 0;
      for (const e of enemies) if (!e.dead && e.tag === 'summon') alive++;
      if (alive < 2) {
        const sx = bp.x + (Math.random() - 0.5) * 6, sz = bp.z + (Math.random() - 0.5) * 6;
        const w = mkEnemy(sx, sz, boss.floorY, [[sx, sz], [sx + 2, sz]], { type: 'wraith', lvl: 9, tag: 'summon', dyn: true });
        w.state = 'chase'; w.alerted = true;
        spawnBurst(sx, boss.floorY + 1, sz, 0xe8dfc0, 14);
        showMsg('L\'Archiviste déchire une page : un Traqueur d\'encre en jaillit !', 2.5);
      }
    }
  } else if (f.kind === 'racine') {
    if (f.vulnT > 0) f.vulnT -= dt;
    boss.cloakMat.emissive.setHex(f.vulnT > 0 ? 0x2a6a2a : 0x0d0820);
    f.spikeT -= dt;
    if (f.spikeT <= 0 && dP < 16 && sameY) {
      f.spikeT = f.vulnT > 0 ? 5 : 3.2;
      // racines-harpons : télégraphe sous les pieds du porteur visé
      const tgt = (S.COOP && p2.pos && Math.random() < 0.4) ? p2 : player;
      spikes.push({ x: tgt.pos.x, z: tgt.pos.z, y: boss.floorY, t: 0.9 });
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
    if (f.state === 'CHASE') {
      boss.state = 'chase';
      if (dP < 3.4 && sameY) { f.state = 'ATTACK_AOE'; f.t = 0; f.active = false;
        spawnBurst(bp.x, bp.y + 0.4, bp.z, 0xff3a3a, 18); // télégraphe (wind-up)
        A.alert();
      }
    } else if (f.state === 'ATTACK_AOE') {
      boss.state = 'patrol'; boss.wps = [[bp.x, bp.z]]; // il se plante pour frapper
      if (f.t >= 1.0 && !f.active) {
        /* ACTIVE FRAMES : la hitbox de dégâts n'existe que dans cette fenêtre */
        f.active = true;
        spawnBurst(bp.x, bp.y + 0.3, bp.z, 0xff7a3a, 30);
        A.impact();
        const hitR = 4.6;
        if (Math.hypot(player.pos.x - bp.x, player.pos.z - bp.z) < hitR && sameY) hurt(boss.dmg, bp);
        if (S.COOP && p2.pos && Math.hypot(p2.pos.x - bp.x, p2.pos.z - bp.z) < hitR &&
            Math.abs(p2.pos.y - boss.floorY) < 4) hurtP2(boss.dmg, bp);
      }
      if (f.t >= 1.8) { f.state = 'CHASE'; boss.state = 'chase'; f.t = 0; }
    }
  }
}
