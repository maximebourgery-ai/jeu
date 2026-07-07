/* ================================================================
   SALLES INSTANCIÉES DU CHÂTEAU — v8
   Les intérieurs d'Ombreciel (grand hall, bibliothèque, aile est,
   salle du trône, catacombes) ne vivent plus dans le monde ouvert :
   chacun est une SALLE INSTANCIÉE, bâtie sur un site isolé (x ≈ -400)
   et chargée SEULE en mémoire derrière un écran de chargement noir
   (UI.withLoading). Franchir une porte décharge la salle précédente et
   charge la suivante : tout le budget de calcul (lumières, colliders,
   IA) se concentre sur l'espace courant — ce qui permet des salles
   nettement PLUS GRANDES qu'avant (+40 à +60 %) et, plus tard, des
   énigmes plus ambitieuses. Le monde ouvert (jardins, parvis, Terres
   Perdues, Forêt de Nuit) reste, lui, en balade libre sans coupure.

   PERSISTANCE (G.rooms, sauvegardée) : seuls survivent au déchargement
   les flags de progression nommés (levier tiré, plaque activée, rideau
   de flammes levé, passage scellé ouvert...), les objets UNIQUES déjà
   ramassés (par id : Larmes, Clef d'or, Fragments de vitalité) et la
   position du bloc runique. Les ennemis et consommables (mana, cœurs)
   renaissent à chaque visite — mais dès la DEUXIÈME visite, les ombres
   reviennent moins nombreuses (une sur deux, voir rEnemy).
   ================================================================ */
import * as THREE from 'three';
import {
  G, S, colliders, doors, pickups, inter, enemies, projectiles,
  tkCubes, spinners, flames, pedestals, PLATES, CAMPS, player, p2, gearScore, rollEquipment
} from './state.js';
import { A } from './Audio.js';
import { $, showMsg, withLoading, gearWarning } from './UI.js';
import {
  mkBox, mkCyl, mkDoor, openDoor, addInter, addPickup, torch, bivouac,
  spawnBurst, mkTkCube, pedestal, doorFlames, asciiWalls, mkAnvil, tree
} from './World.js';
import { matFor, glow } from './AssetManager.js';
import { mkEnemy } from './Enemies.js';
import { hurt } from './Player.js';
import { questReach } from './Quests.js';
import { addGearToBag } from './Crafting.js';
import { saveGame } from './SaveSystem.js'; // cycle sûr : appel différé

/* Site des salles (hors du monde, à l'opposé de la Tour qui vit en x +400) */
const RX = -400, RZ = 0;
/* v9 — INDÉPENDANCE DES SALLES : le site (RX,RZ) regroupe TOUTES les salles
   instanciées (rayon large : la salle des catacombes s'étend jusqu'à
   RX+59). L'autre porteur n'est déplacé de force QUE s'il se trouvait
   physiquement DANS la salle qui se décharge — s'il est resté dans le
   monde ouvert (jardins, Terres Perdues...), il n'est jamais téléporté. */
const ROOM_SITE_R = 100;
function nearRoomSite(pos) { return !!(pos && Math.hypot(pos.x - RX, pos.z - RZ) < ROOM_SITE_R); }

/* ---------------- persistance par salle ---------------- */
const roomState = id => G.rooms[id] || (G.rooms[id] = { flags: {}, taken: {}, tk: null });
const flag = (id, k) => !!roomState(id).flags[k];
const setFlag = (id, k) => { roomState(id).flags[k] = true; };
/* le flag « beyond » (passage scellé du trône) est lu par le monde ouvert */
export const beyondOpened = () => flag('trone', 'beyond');

/* Objet unique : ne réapparaît jamais une fois ramassé (id persistant). */
function rPickup(type, x, y, z, pid) {
  if (pid && roomState(S.buildingRoom).taken[pid]) return;
  if (type === 'key' && G.goldKey) return;
  addPickup(type, x, y, z);
  pickups[pickups.length - 1].pid = pid || null;
}
/* Piédestal de pouvoir : si l'art est déjà appris, seul le socle demeure. */
function rPedestal(x, z, y, powerId, color, lore, questId) {
  if (G.powers[powerId]) { mkBox(1.3, 1.1, 1.3, x, y, z, 'stoneR'); return; }
  pedestal(x, z, y, powerId, color, lore, questId);
}
/* Ombre de salle : population complète à la PREMIÈRE visite ; ensuite les
   ombres reviennent MOINS NOMBREUSES (une sur deux, déterministe — pas de
   re-farm complet à chaque porte, mais la salle ne reste jamais vide). */
let enemySeq = 0;
function rEnemy(x, z, floorY, wps, opt) {
  enemySeq++;
  if (flag(S.buildingRoom, 'visited') && enemySeq % 2 === 0) return null;
  return mkEnemy(x, z, floorY, wps, opt);
}
/* Porte déjà ouverte par un flag : posée en position haute, sans son. */
function presetOpen(dr) {
  dr.open = true; dr.t = 1; dr.col.on = false;
  dr.mesh.position.y = dr.baseY + dr.lift;
}
/* Fond de sas : boîte presque noire posée derrière chaque embrasure de
   transition — l'ouverture se lit comme un passage sombre, et personne ne
   peut marcher dans le vide du site en franchissant physiquement la porte. */
const darkMat = () => new THREE.MeshStandardMaterial({ color: 0x141828, roughness: 1 });
function stubCap(w, h, d, x, y, z) { mkBox(w, h, d, x, y, z, darkMat()); }

/* ================================================================
   INSTANCIATION — capture & déchargement (même contrat que la Tour)
   ================================================================ */
let snap = null, origAdd = null;

function beginBuild() {
  snap = {
    col: colliders.length, doors: doors.length, pickups: pickups.length,
    inter: inter.length, enemies: enemies.length, flames: flames.length,
    spinners: spinners.length, tk: tkCubes.length, plates: PLATES.length,
    pedestals: pedestals.length, added: []
  };
  origAdd = S.scene.add;
  S.scene.add = function (...objs) { snap.added.push(...objs); return origAdd.apply(S.scene, objs); };
}
function endBuild() { if (origAdd) { S.scene.add = origAdd; origAdd = null; } }

/* Recopie dans G.rooms ce qui doit survivre : objets uniques ramassés et
   position du bloc runique. Appelée avant chaque déchargement ET par la
   sauvegarde (l'auto-save peut tomber en pleine salle). */
export function syncRoomState() {
  if (!S.roomId || !snap) return;
  const st = roomState(S.roomId);
  for (let i = snap.pickups; i < pickups.length; i++) {
    const p = pickups[i];
    if (p.pid && p.taken) st.taken[p.pid] = 1;
  }
  if (tkCubes.length > snap.tk) {
    const c = tkCubes[snap.tk];
    st.tk = [+c.mesh.position.x.toFixed(2), +c.mesh.position.y.toFixed(2), +c.mesh.position.z.toFixed(2)];
  }
}

export function unloadRoom() {
  if (!S.roomId || !snap) { S.roomId = null; return; }
  syncRoomState();
  endBuild();
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
  PLATES.length = snap.plates;
  pedestals.length = snap.pedestals;
  for (const o of snap.added) S.scene.remove(o);
  for (const pr of projectiles) S.scene.remove(pr.mesh);
  projectiles.length = 0;
  snap = null;
  S.roomId = null;
}

/* v9 — Gear Score conseillé par salle (gear check des zones profondes) */
const ROOM_GEAR = { cata: 25, trone: 40 };
/* Charge une salle (SANS fondu — les enrobages avec fondu sont plus bas).
   Renvoie false si l'id est inconnu (sauvegarde d'une autre version). */
export function loadRoom(id, spawn, who) {
  const def = ROOMS[id];
  if (!def) return false;
  /* v9 — qui entre ? (S.actingPlayer, posé par tryInteract/tryInteractP2) —
     par défaut le J1 (chargement de sauvegarde, voyage rapide...). L'AUTRE
     porteur n'est amené avec lui que s'il se trouvait dans la salle qui se
     décharge — sinon il reste où il est, dans le monde ouvert. */
  const w = who === 2 ? 2 : (who === 1 ? 1 : (S.actingPlayer === 2 ? 2 : 1));
  const mover = w === 2 ? p2 : player;
  const other = w === 2 ? player : p2;
  const dragOther = S.COOP && other.pos && nearRoomSite(other.pos);
  if (S.roomId) unloadRoom();
  S.buildingRoom = id;
  enemySeq = 0;
  beginBuild();
  try { def.build(); } finally { endBuild(); S.buildingRoom = null; }
  /* v9 — GEAR CHECK des salles profondes du château : très sous-équipé
     (< 40 % du Score conseillé) → alerte + ombres de la salle ×3. */
  const rec = ROOM_GEAR[id] || 0;
  if (rec && gearScore(w) < rec * 0.4) {
    for (let i = snap.enemies; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || e.dead || e.fsm) continue;
      e.hp *= 3; e.maxHp *= 3; e.dmg = Math.round(e.dmg * 3);
    }
    gearWarning('☠ ZONE DANGEREUSE — Équipement insuffisant (Score ' + gearScore(w) + ' / ' + rec
      + ' conseillé) : les ombres y frappent TROIS FOIS plus fort. Forgez votre panoplie à une enclume !');
  }
  setFlag(id, 'visited'); // les prochaines visites seront moins peuplées
  S.roomId = id;
  const e = spawn || def.entry;
  mover.pos.set(e.x, e.y, e.z); mover.vel.set(0, 0, 0);
  if (dragOther) { other.pos.set(e.x + 1.3, e.y, e.z + 0.8); other.vel.set(0, 0, 0); }
  if (w === 1) {
    G.checkpoint = { x: e.x, y: e.y, z: e.z };
    if (e.yaw !== undefined) S.yaw = e.yaw;
  } else if (e.yaw !== undefined) p2.yaw = e.yaw;
  S.graceT = Math.max(S.graceT, 4.5); // le temps de se repérer avant l'aggro
  return true;
}

/* ---------------- transitions AVEC écran de chargement ---------------- */
function gotoRoom(id, spawn) {
  const who = S.actingPlayer === 2 ? 2 : 1; // capturé AVANT le fondu (async)
  withLoading(ROOMS[id].name, () => {
    loadRoom(id, spawn, who);
    saveGame(true); // chaque écran de chargement vaut point de reprise
  });
}
function exitToWorld(title, x, y, z, yaw, msg) {
  const who = S.actingPlayer === 2 ? 2 : 1; // capturé AVANT le fondu (async)
  withLoading(title, () => {
    const mover = who === 2 ? p2 : player;
    const other = who === 2 ? player : p2;
    const dragOther = S.COOP && other.pos && nearRoomSite(other.pos);
    unloadRoom();
    mover.pos.set(x, y, z); mover.vel.set(0, 0, 0);
    if (dragOther) { other.pos.set(x + 1.3, y, z + 0.8); other.vel.set(0, 0, 0); }
    if (who === 1) {
      G.checkpoint = { x, y, z };
      if (yaw !== undefined) S.yaw = yaw;
    } else if (yaw !== undefined) p2.yaw = yaw;
    if (msg) showMsg(msg, 3.5);
    saveGame(true);
  });
}
/* Seuils appelés par le monde ouvert (World.js) */
export function enterCastleHall() {
  gotoRoom('hall', { x: RX, y: 0.2, z: RZ + 18.5, yaw: Math.PI });
}
export function enterThroneFromLostLands() {
  gotoRoom('trone', { x: RX + 8, y: 0.2, z: RZ - 17, yaw: 0 });
}
export function enterPilgrimage() {
  gotoRoom('muraille', { x: -900, y: 0.2, z: -30.5, yaw: Math.PI });
}

/* ================================================================
   LE GRAND HALL — 52 × 42 m (contre 36 × 31 avant), plafond à 12 m
   Carrefour du château : jardins (sud), bibliothèque (ouest),
   aile est (est), salle du trône (nord, serrure d'or).
   ================================================================ */
function buildHall() {
  // sol, tapis, plafond
  mkBox(54, 1, 44, RX, -1, RZ, 'slab');
  mkBox(3.6, 0.05, 38, RX, 0.02, RZ, 'cloth', false);
  mkBox(54, 0.6, 44, RX, 12, RZ, 'stoneD');
  // murs sud (porte vers les jardins, x -2.5..2.5)
  mkBox(23.5, 12, 1, RX - 14.25, 0, RZ + 21, 'stone');
  mkBox(23.5, 12, 1, RX + 14.25, 0, RZ + 21, 'stone');
  mkBox(5, 7.5, 1, RX, 4.5, RZ + 21, 'stone');
  // mur ouest (porte de la bibliothèque, z -2.5..2.5)
  mkBox(1, 12, 18.5, RX - 26, 0, RZ - 11.75, 'stone');
  mkBox(1, 12, 18.5, RX - 26, 0, RZ + 11.75, 'stone');
  mkBox(1, 7.5, 5, RX - 26, 4.5, RZ, 'stone');
  // mur est (arche vers l'aile est, z -3..3)
  mkBox(1, 12, 18, RX + 26, 0, RZ - 12, 'stone');
  mkBox(1, 12, 18, RX + 26, 0, RZ + 12, 'stone');
  mkBox(1, 7.5, 6, RX + 26, 4.5, RZ, 'stone');
  // mur nord (porte scellée d'or, x -2..2)
  mkBox(22, 12, 1, RX - 13, 0, RZ - 21, 'stone');
  mkBox(22, 12, 1, RX + 13, 0, RZ - 21, 'stone');
  mkBox(4, 7.5, 1, RX, 4.5, RZ - 21, 'stone');
  // fonds de sas derrière les quatre embrasures
  stubCap(7, 12, 1, RX, 0, RZ + 22.7);
  stubCap(1, 12, 7, RX - 27.7, 0, RZ);
  stubCap(1, 12, 8, RX + 27.7, 0, RZ);
  stubCap(6, 12, 1, RX, 0, RZ - 22.7);

  // double colonnade et bannières : le hall respire enfin
  [[-15, -13], [15, -13], [-15, 0], [15, 0], [-15, 13], [15, 13]].forEach(([cx, cz]) => {
    mkCyl(0.9, 1.05, 12, RX + cx, 0, RZ + cz, 'stoneR', true, 9);
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4, 0.06), matFor('cloth', 1, 1));
    b.position.set(RX + cx, 7.2, RZ + cz + 1.1);
    b.castShadow = true; S.scene.add(b);
  });
  torch(RX - 25.2, 2, RZ + 14); torch(RX + 25.2, 2, RZ + 14);
  torch(RX - 25.2, 2, RZ - 14); torch(RX + 25.2, 2, RZ - 14);
  torch(RX - 8, 2, RZ + 20.4); torch(RX + 8, 2, RZ + 20.4);
  torch(RX - 8, 2, RZ - 20.4); torch(RX + 8, 2, RZ - 20.4);

  addInter(RX, 0, RZ + 14, 3, 'Lire le fronton du hall', () => {
    showMsg('« Quatre portes, un seul foyer. L\'ouest garde le savoir, l\'est garde les armes, le nord garde le trône. »', 4);
  });

  // levier de fer (mur est) → porte de la bibliothèque
  mkBox(0.8, 1, 0.8, RX + 24.6, 0, RZ + 15, 'iron');
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), matFor('wood', 1, 1));
  handle.position.set(RX + 24.6, 1.45, RZ + 15);
  handle.rotation.x = flag('hall', 'lever') ? 0.8 : -0.8;
  handle.castShadow = true;
  S.scene.add(handle);
  const libDoor = mkDoor(1, 4.5, 5, RX - 26, 0, RZ, 'woodD');
  if (flag('hall', 'lever')) presetOpen(libDoor);
  addInter(RX + 24.6, 0, RZ + 15, 2.3, 'Actionner le levier', () => {
    if (flag('hall', 'lever')) { showMsg('Le mécanisme a déjà rendu son office : la bibliothèque est ouverte, à l\'ouest.', 3); return; }
    setFlag('hall', 'lever');
    handle.rotation.x = 0.8;
    A.lever(); openDoor(libDoor);
    showMsg('Un grondement traverse les murs : la porte de la bibliothèque s\'ouvre à l\'ouest.', 4);
    questReach('lever');
  });

  // porte scellée d'or (nord) → salle du trône
  const goldDoor = mkDoor(4, 4.5, 1, RX, 0, RZ - 21, 'gold');
  if (flag('hall', 'gold')) presetOpen(goldDoor);
  addInter(RX, 0, RZ - 19.4, 2.8, 'Salle du trône — la porte scellée d\'or', () => {
    if (flag('hall', 'gold')) {
      gotoRoom('trone', { x: RX, y: 0.2, z: RZ + 17.5, yaw: Math.PI });
    } else if (G.goldKey) {
      setFlag('hall', 'gold');
      openDoor(goldDoor);
      showMsg('La Clef d\'or tourne dans la serrure... La salle du trône vous est ouverte.', 4);
      questReach('throne');
    } else {
      showMsg('Une serrure d\'or scelle cette porte. La clef dort quelque part sous le château...', 2.6);
    }
  });

  // seuils ouest / est / sud
  addInter(RX - 24.4, 0, RZ, 3, 'Entrer dans la bibliothèque', () => {
    if (!flag('hall', 'lever')) { showMsg('La porte de la bibliothèque est close. Un mécanisme, quelque part dans le hall...', 3); return; }
    gotoRoom('biblio', { x: RX + 25, y: 0.2, z: RZ, yaw: -Math.PI / 2 });
  });
  addInter(RX + 24.4, 0, RZ, 3, 'Passer dans l\'aile est', () => {
    gotoRoom('aile', { x: RX - 25, y: 0.2, z: RZ, yaw: Math.PI / 2 });
  });
  addInter(RX, 0, RZ + 19.6, 2.8, 'Sortir vers les jardins', () => {
    exitToWorld('Les Jardins du Crépuscule', 0, 0.2, 33.6, 0,
      'Le vent des jardins vous accueille à nouveau.');
  });

  rPickup('mana', RX - 22, 0, RZ + 17);
  rPickup('mana', RX - 10, 0, RZ - 18);
  rPickup('heart', RX + 22, 0, RZ - 17);

  rEnemy(RX, RZ + 6, 0, [[RX - 12, RZ + 6], [RX + 12, RZ + 6], [RX + 12, RZ - 8], [RX - 12, RZ - 8]], { type: 'sentinel', lvl: 2 });
  rEnemy(RX - 14, RZ - 14, 0, [[RX - 14, RZ - 14], [RX + 14, RZ - 14]], { type: 'sentinel', lvl: 2 });
  rEnemy(RX + 6, RZ + 12, 0, [[RX + 6, RZ + 12], [RX - 4, RZ + 16], [RX + 8, RZ + 18]], { type: 'wraith', lvl: 2 });
  rEnemy(RX - 18, RZ + 2, 0, [[RX - 18, RZ + 8], [RX - 18, RZ - 8]], { type: 'sentinel', lvl: 2 });
}

/* ================================================================
   LA BIBLIOTHÈQUE — 56 × 42 m (contre 40 × 31), plafond à 11 m
   Rayonnages-labyrinthe, alcôve secrète, escalier d'étagères vers la
   passerelle haute où sommeille le PAS DU VENT.
   ================================================================ */
function buildBiblio() {
  mkBox(58, 1, 44, RX, -1, RZ, 'wood');
  mkBox(56, 0.07, 42, RX, 0.01, RZ, 'slabW', false);
  mkBox(58, 0.6, 44, RX, 11, RZ, 'stoneD');
  // mur est (porte vers le hall, z -2.5..2.5)
  mkBox(1, 11, 18.5, RX + 28, 0, RZ - 11.75, 'stone');
  mkBox(1, 11, 18.5, RX + 28, 0, RZ + 11.75, 'stone');
  mkBox(1, 6.5, 5, RX + 28, 4.5, RZ, 'stone');
  // murs ouest et sud pleins
  mkBox(1, 11, 44, RX - 28, 0, RZ, 'stone');
  mkBox(58, 11, 1, RX, 0, RZ + 21, 'stone');
  stubCap(1, 11, 7, RX + 29.7, 0, RZ); // fond de sas vers le hall
  // mur nord avec alcôve secrète (ouverture x -3..3 masquée par la fausse étagère)
  mkBox(25, 11, 1, RX - 15.5, 0, RZ - 21, 'stone');
  mkBox(25, 11, 1, RX + 15.5, 0, RZ - 21, 'stone');
  mkBox(6, 7.4, 1, RX, 3.6, RZ - 21, 'stone');
  /* alcôve secrète (hors murs, z -26..-21) */
  mkBox(10, 1, 6, RX, -1, RZ - 23.5, 'wood');
  mkBox(1, 7, 5, RX - 4.5, 0, RZ - 23.5, 'stone');
  mkBox(1, 7, 5, RX + 4.5, 0, RZ - 23.5, 'stone');
  mkBox(10, 7, 1, RX, 0, RZ - 26, 'stone');
  mkBox(10, 0.6, 6, RX, 7, RZ - 23.5, 'stoneD');
  mkBox(5.8, 3.4, 0.7, RX, 0, RZ - 20.7, 'woodF', false); // FAUSSE étagère
  rPickup('maxhp', RX, 0.2, RZ - 24, 'biblio_secret');
  addInter(RX, 0, RZ - 19.2, 2.2, 'Inspecter l\'étagère', () => {
    showMsg('Cette étagère ne porte aucune poussière... comme si on la déplaçait souvent.', 3);
  });

  /* rayonnages-labyrinthe (3,6 m : infranchissables d'un saut) */
  [[16, 1.2, -16, -10], [10, 1.2, 8, -10], [14, 1.2, -4, -2], [8, 1.2, -23, -2],
   [10, 1.2, 18, -4], [16, 1.2, -12, 6], [10, 1.2, 12, 6], [12, 1.2, -18, 14],
   [12, 1.2, 4, 14], [8, 1.2, 20, 12]].forEach(([w, d, ox, oz]) =>
    mkBox(w, 3.6, d, RX + ox, 0, RZ + oz, 'wood'));
  // caisses basses (repères d'escalade interdite : trop basses pour les murs)
  mkBox(3, 1.1, 1.6, RX - 4, 0, RZ + 10, 'woodD');
  mkBox(3, 1.1, 1.6, RX + 10, 0, RZ - 6, 'woodD');

  /* escalier d'étagères (angle sud-ouest) → passerelle du mur ouest */
  mkBox(3, 1.55, 3, RX - 25, 0, RZ + 18, 'wood');
  mkBox(3, 3.1, 3, RX - 25, 0, RZ + 14, 'wood');
  mkBox(3, 4.65, 3, RX - 25, 0, RZ + 10, 'wood');
  mkBox(3, 6.2, 3, RX - 25, 0, RZ + 6, 'wood');
  mkBox(3, 0.4, 18, RX - 25, 6.4, RZ - 5, 'woodD'); // passerelle (plancher à 6,8 m)
  rPedestal(RX - 25, RZ - 11, 6.8, 'dash', 0x9fe8ff,
    'Pas du vent appris ! (touche 2, puis clic) Un élan fulgurant qui franchit les gouffres.', 'dash');
  rPickup('mana', RX - 25, 6.8, RZ - 1);

  rPickup('mana', RX - 12, 0, RZ - 6);
  rPickup('mana', RX + 20, 0, RZ + 17);
  rPickup('heart', RX - 22, 0, RZ + 19);
  rPickup('heart', RX + 24, 0, RZ - 17);
  torch(RX - 20, 2, RZ - 20.4); torch(RX + 20, 2, RZ - 20.4);
  torch(RX - 10, 2, RZ + 20.4); torch(RX + 14, 2, RZ + 20.4);

  addInter(RX + 26, 0, RZ, 3, 'Retourner au grand hall', () => {
    gotoRoom('hall', { x: RX - 23.5, y: 0.2, z: RZ, yaw: Math.PI / 2 });
  });

  rEnemy(RX - 8, RZ + 10, 0, [[RX - 16, RZ + 10], [RX - 2, RZ + 10]], { type: 'sentinel', lvl: 2 });
  rEnemy(RX - 16, RZ - 6, 0, [[RX - 22, RZ - 6], [RX - 10, RZ - 6]], { type: 'wraith', lvl: 2 });
  rEnemy(RX + 14, RZ + 10, 0, [[RX + 14, RZ + 10], [RX + 14, RZ - 6]], { type: 'caster', lvl: 2 });
  rEnemy(RX + 4, RZ - 14, 0, [[RX - 6, RZ - 14], [RX + 12, RZ - 14]], { type: 'sentinel', lvl: 2 });
}

/* ================================================================
   L'AILE EST — 56 × 42 m (contre 40 × 31), plafond à 10 m
   Armurerie (bloc runique) + salle de la plaque gravée : le poids des
   runes ouvre la voie des morts (escalier des catacombes).
   ================================================================ */
function buildAile() {
  mkBox(58, 1, 44, RX, -1, RZ, 'slab');
  mkBox(58, 0.6, 44, RX, 10, RZ, 'stoneD');
  // mur ouest (arche vers le hall, z -2.5..2.5)
  mkBox(1, 10, 18.5, RX - 28, 0, RZ - 11.75, 'stone');
  mkBox(1, 10, 18.5, RX - 28, 0, RZ + 11.75, 'stone');
  mkBox(1, 5.5, 5, RX - 28, 4.5, RZ, 'stone');
  // murs nord / sud pleins
  mkBox(58, 10, 1, RX, 0, RZ - 21, 'stone');
  mkBox(58, 10, 1, RX, 0, RZ + 21, 'stone');
  // mur est avec la porte des catacombes (z 6..10)
  mkBox(1, 10, 27, RX + 28, 0, RZ - 7.5, 'stone');
  mkBox(1, 10, 11, RX + 28, 0, RZ + 15.5, 'stone');
  mkBox(1, 5.5, 4, RX + 28, 4.5, RZ + 8, 'stone');
  // cloison armurerie / salle de la plaque (arche z -4..4)
  mkBox(1, 10, 17, RX + 2, 0, RZ - 12.5, 'stone');
  mkBox(1, 10, 17, RX + 2, 0, RZ + 12.5, 'stone');
  mkBox(1, 5, 8, RX + 2, 5, RZ, 'stone');
  stubCap(1, 10, 7, RX - 29.7, 0, RZ);     // fond de sas vers le hall
  stubCap(1, 10, 6, RX + 29.7, 0, RZ + 8); // fond de sas vers les catacombes

  /* ---- armurerie (ouest) ---- */
  mkBox(8, 2.4, 0.8, RX - 20, 0, RZ - 19.8, 'woodF');
  mkBox(8, 2.4, 0.8, RX - 8, 0, RZ - 19.8, 'woodF');
  mkCyl(0.7, 0.7, 1.4, RX - 24, 0, RZ + 16, 'wood', true, 9);
  mkCyl(0.7, 0.7, 1.4, RX - 21.4, 0, RZ + 17.2, 'wood', true, 9);
  mkBox(1.4, 1, 0.7, RX - 14, 0, RZ + 16, 'iron'); // enclume
  mkBox(1.2, 1.2, 1.2, RX - 6, 0, RZ + 17, 'wood');
  mkBox(1.2, 1.2, 1.2, RX - 4.7, 0, RZ + 17.4, 'wood');
  mkBox(1.2, 1.2, 1.2, RX - 5.4, 1.2, RZ + 17.2, 'wood');
  /* le bloc runique reprend sa dernière position connue (puzzle en cours) */
  const tkSaved = roomState('aile').tk;
  if (tkSaved) mkTkCube(tkSaved[0], tkSaved[1], tkSaved[2]);
  else mkTkCube(RX - 18, 0.55, RZ - 8);
  addInter(RX - 18, 0, RZ - 8, 2.4, 'Examiner le bloc runique', () => {
    if (G.powers.tk) showMsg('Le bloc vibre doucement. La Main céleste peut le porter (touche 3, puis clic).', 3.5);
    else showMsg('Un bloc gravé de runes, bien trop lourd pour vos bras. Seule une force céleste pourrait le soulever...', 4);
  });

  /* ---- salle de la plaque (est) ---- */
  const plateOn = flag('aile', 'plate');
  mkBox(2.6, 0.12, 2.6, RX + 16, 0.02, RZ + 6, 'stoneD', false);
  const plateGlow = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 2.2),
    new THREE.MeshBasicMaterial({ color: plateOn ? 0x4ae08a : 0x3a4880 }));
  plateGlow.position.set(RX + 16, 0.14, RZ + 6);
  S.scene.add(plateGlow);
  const cataDoor = mkDoor(1, 4.5, 4, RX + 28, 0, RZ + 8, 'stoneD');
  if (plateOn) presetOpen(cataDoor);
  else PLATES.push({
    x: RX + 16, z: RZ + 6, y: 0, glow: plateGlow, door: cataDoor, questId: 'plate',
    msg: 'La plaque s\'enfonce sous le bloc : la porte des catacombes coulisse dans la pierre.',
    onOpen: () => setFlag('aile', 'plate')
  });
  addInter(RX + 12, 0, RZ + 6, 2.6, 'Examiner la plaque gravée', () => {
    showMsg('« Que le poids des runes ouvre la voie des morts. » La plaque attend une charge.', 3.5);
  });
  addInter(RX + 26.3, 0, RZ + 8, 2.6, 'Descendre aux catacombes', () => {
    if (!flag('aile', 'plate')) { showMsg('La porte de pierre est scellée : la plaque gravée attend son fardeau runique.', 3); return; }
    gotoRoom('cata', { x: RX, y: 0.2, z: RZ + 30.4, yaw: Math.PI });
  });

  addInter(RX - 26.3, 0, RZ, 3, 'Retourner au grand hall', () => {
    gotoRoom('hall', { x: RX + 23.5, y: 0.2, z: RZ, yaw: -Math.PI / 2 });
  });

  torch(RX - 14, 2, RZ + 20.4); torch(RX + 16, 2, RZ - 20.4);
  torch(RX + 26, 2, RZ + 14, 0x66a8ff, 1.1, 15);
  rPickup('heart', RX - 10, 0, RZ + 16);
  rPickup('mana', RX + 22, 0, RZ + 16);
  rPickup('mana', RX + 20, 0, RZ - 16);

  rEnemy(RX - 14, RZ + 6, 0, [[RX - 14, RZ + 6], [RX - 8, RZ - 12]], { type: 'sentinel', lvl: 3 });
  rEnemy(RX + 16, RZ + 12, 0, [[RX + 16, RZ + 12], [RX + 10, RZ - 10]], { type: 'brute', lvl: 3, dmg: 28 });
  rEnemy(RX + 20, RZ - 8, 0, [[RX + 24, RZ - 8], [RX + 8, RZ - 8]], { type: 'sentinel', lvl: 3 });
}

/* ================================================================
   LA SALLE DU TRÔNE — 48 × 40 m (contre 32 × 28), plafond à 14 m
   La deuxième Larme d'Aube, gardée par les Colosses. Au nord, le
   passage scellé qui ne cède qu'aux porteurs de DEUX Larmes.
   ================================================================ */
function buildTrone() {
  mkBox(50, 1, 42, RX, -1, RZ, 'slab');
  mkBox(48, 0.07, 40, RX, 0.01, RZ, 'slabR', false);
  mkBox(3.6, 0.05, 34, RX, 0.09, RZ + 1, 'cloth', false);
  mkBox(50, 0.6, 42, RX, 14, RZ, 'stoneD');
  // mur sud (porte du hall, x -2..2)
  mkBox(22, 14, 1, RX - 13, 0, RZ + 20, 'stone');
  mkBox(22, 14, 1, RX + 13, 0, RZ + 20, 'stone');
  mkBox(4, 9.5, 1, RX, 4.5, RZ + 20, 'stone');
  // murs ouest / est pleins
  mkBox(1, 14, 42, RX - 24, 0, RZ, 'stone');
  mkBox(1, 14, 42, RX + 24, 0, RZ, 'stone');
  // mur nord avec le passage scellé (x 6.5..9.5)
  mkBox(30.5, 14, 1, RX - 8.75, 0, RZ - 20, 'stone');
  mkBox(14.5, 14, 1, RX + 16.75, 0, RZ - 20, 'stone');
  mkBox(3, 9, 1, RX + 8, 5, RZ - 20, 'stone');
  stubCap(6, 14, 1, RX, 0, RZ + 21.7);     // fond de sas vers le hall
  stubCap(5, 14, 1, RX + 8, 0, RZ - 21.7); // fond de sas du passage scellé

  [[-13, -12], [13, -12], [-13, 0], [13, 0], [-13, 12], [13, 12]].forEach(([px, pz]) => {
    mkCyl(0.85, 1, 14, RX + px, 0, RZ + pz, 'stoneR', true, 9);
  });

  /* estrade + trône + deuxième Larme */
  mkBox(14, 0.6, 7, RX, 0, RZ - 15.5, 'stoneR');
  mkBox(10, 0.6, 5, RX, 0.6, RZ - 16.5, 'stoneR');
  mkBox(2.2, 3.2, 0.9, RX, 1.2, RZ - 18.3, 'stoneR');
  mkBox(0.5, 1.6, 0.9, RX - 1.35, 1.2, RZ - 18, 'stoneR');
  mkBox(0.5, 1.6, 0.9, RX + 1.35, 1.2, RZ - 18, 'stoneR');
  rPickup('crystal', RX, 1.5, RZ - 17, 'tear_trone');
  rPickup('heart', RX - 20, 0, RZ - 16);
  rPickup('mana', RX + 20, 0, RZ - 16);
  rPickup('mana', RX - 20, 0, RZ + 16);
  torch(RX - 23.2, 2, RZ + 4); torch(RX + 23.2, 2, RZ + 4);
  torch(RX - 5, 1.4, RZ - 18.6, 0xff6a3a, 1.3, 18);
  torch(RX + 5, 1.4, RZ - 18.6, 0xff6a3a, 1.3, 18);

  /* passage scellé vers les Terres Perdues : exige DEUX Larmes */
  const beyondDoor = mkDoor(3, 5, 1, RX + 8, 0, RZ - 20, 'rune');
  if (flag('trone', 'beyond')) presetOpen(beyondDoor);
  addInter(RX + 8, 0, RZ - 18.2, 2.7, 'Franchir le passage scellé', () => {
    if (flag('trone', 'beyond')) {
      exitToWorld('Les Terres Perdues', 0, 0.2, -30.6, Math.PI,
        'Au-delà du seuil, la pierre redevient friche : les Terres Perdues.');
      return;
    }
    if (G.crystals >= 2) {
      setFlag('trone', 'beyond');
      openDoor(beyondDoor);
      if (S.beyondDoor && !S.beyondDoor.open) openDoor(S.beyondDoor); // pendant côté monde
      showMsg('Les deux Larmes réunies font vibrer la pierre... le passage s\'ouvre vers les Terres Perdues.', 4.5);
      questReach('lost');
    } else {
      showMsg('Ce passage ne cédera qu\'aux porteurs de deux Larmes d\'Aube (' + G.crystals + ' / 2).', 3);
    }
  });

  addInter(RX, 0, RZ + 18.6, 2.8, 'Revenir au grand hall', () => {
    gotoRoom('hall', { x: RX, y: 0.2, z: RZ - 18.5, yaw: 0 });
  });

  rEnemy(RX - 8, RZ - 4, 0, [[RX - 8, RZ + 2], [RX - 8, RZ - 12]], { type: 'brute', lvl: 6 });
  rEnemy(RX + 8, RZ - 4, 0, [[RX + 8, RZ - 12], [RX + 8, RZ + 2]], { type: 'brute', lvl: 6 });
  rEnemy(RX, RZ - 10, 0, [[RX, RZ - 10], [RX + 6, RZ - 2], [RX - 6, RZ - 2]], { type: 'caster', lvl: 6 });
  rEnemy(RX, RZ + 8, 0, [[RX - 12, RZ + 8], [RX + 12, RZ + 8]], { type: 'sentinel', lvl: 6 });
  rEnemy(RX + 16, RZ + 2, 0, [[RX + 16, RZ + 12], [RX + 16, RZ - 8]], { type: 'wraith', lvl: 6 });
}

/* ================================================================
   LES CATACOMBES — le grand sous-sol, agrandi et instancié d'un bloc :
   salle des gardes (28 × 26), Ossuaire-labyrinthe (49 × 45, cellules
   de 4,5 m contre 4), Gouffre des Morts (brèche de 11,5 m : Pas du
   vent obligatoire) et chambre de la Première Larme (rideau de
   flammes : Égide obligatoire).
   ================================================================ */
function buildCata() {
  /* ---- vestibule d'entrée (escalier remontant vers l'aile est) ---- */
  mkBox(10, 1, 9, RX, -1, RZ + 31.5, 'slab');
  mkBox(1, 6, 9, RX - 5, 0, RZ + 31.5, 'stoneD');
  mkBox(1, 6, 9, RX + 5, 0, RZ + 31.5, 'stoneD');
  mkBox(10, 6, 1, RX, 0, RZ + 35.5, 'stoneD');
  mkBox(10, 0.6, 10, RX, 5.5, RZ + 31.5, 'stoneD');
  for (let i = 0; i < 4; i++)
    mkBox(6, 0.55 * (i + 1), 0.9, RX, 0, RZ + 34.6 - i * 0.9, 'stoneD');
  torch(RX - 4, 0, RZ + 33, 0x66a8ff, 1.1, 15);
  addInter(RX, 0, RZ + 34.2, 2.6, 'Remonter vers l\'aile est', () => {
    gotoRoom('aile', { x: RX + 25, y: 0.2, z: RZ + 8, yaw: -Math.PI / 2 });
  });

  /* ---- salle des gardes — x -14..14, z 1..27 ---- */
  mkBox(28, 1, 26, RX, -1, RZ + 14, 'slab');
  mkBox(30, 0.6, 28, RX, 6, RZ + 14, 'stoneD');
  // nord (couloir du vestibule, x -2..2)
  mkBox(12, 6, 1, RX - 8, 0, RZ + 27, 'stoneD');
  mkBox(12, 6, 1, RX + 8, 0, RZ + 27, 'stoneD');
  mkBox(4, 2, 1, RX, 4, RZ + 27, 'stoneD');
  // sud (couloir de l'Ossuaire, x -2..2)
  mkBox(12, 6, 1, RX - 8, 0, RZ + 1, 'stoneD');
  mkBox(12, 6, 1, RX + 8, 0, RZ + 1, 'stoneD');
  mkBox(4, 2, 1, RX, 4, RZ + 1, 'stoneD');
  // ouest plein, est avec passage vers le Gouffre (z 10..18)
  mkBox(1, 6, 26, RX - 14, 0, RZ + 14, 'stoneD');
  mkBox(1, 6, 8, RX + 14, 0, RZ + 6, 'stoneD');
  mkBox(1, 6, 8, RX + 14, 0, RZ + 22, 'stoneD');
  mkBox(1, 1.5, 8, RX + 14, 4.5, RZ + 14, 'stoneD');
  [[-9, 8], [9, 8], [-9, 20], [9, 20]].forEach(([px, pz]) => {
    mkCyl(0.6, 0.75, 6, RX + px, 0, RZ + pz, 'stoneR', true, 8);
  });
  torch(RX - 13, 1.5, RZ + 14, 0x66a8ff, 1.25, 18);
  torch(RX + 13, 1.5, RZ + 24, 0x66a8ff, 1.25, 18);
  bivouac(RX - 10, 0, RZ + 23, 'les catacombes', 'catacombes', true, 4.5);
  const cCamp = CAMPS.find(c => c.id === 'catacombes');
  if (cCamp) cCamp.room = 'cata'; // le voyage rapide recharge la salle
  rPickup('heart', RX - 12, 0, RZ + 4);
  rPickup('mana', RX + 12, 0, RZ + 3);
  addInter(RX, 0, RZ + 2.6, 2.6, 'Lire le fronton de l\'Ossuaire', () => {
    showMsg('« Ici dorment les gardiens d\'Ombreciel. Que celui qui cherche la Clef longe le couchant. »', 4);
  });
  rEnemy(RX - 6, RZ + 10, 0, [[RX - 9, RZ + 8], [RX + 9, RZ + 10]], { type: 'sentinel', lvl: 4 });
  rEnemy(RX + 6, RZ + 18, 0, [[RX + 6, RZ + 18], [RX - 6, RZ + 18]], { type: 'sentinel', lvl: 4 });
  rEnemy(RX, RZ + 14, 0, [[RX, RZ + 14], [RX + 9, RZ + 20]], { type: 'brute', lvl: 4 });
  rEnemy(RX + 9, RZ + 6, 0, [[RX + 9, RZ + 6], [RX + 9, RZ + 20]], { type: 'caster', lvl: 4 });

  /* ---- couloir gardes → Ossuaire (z -3..1) ---- */
  mkBox(6, 1, 4, RX, -1, RZ - 1, 'slab');
  mkBox(1, 5.5, 4, RX - 2.5, 0, RZ - 1, 'stoneD');
  mkBox(1, 5.5, 4, RX + 2.5, 0, RZ - 1, 'stoneD');
  mkBox(6, 0.6, 4, RX, 5.2, RZ - 1, 'stoneD');

  /* ---- OSSUAIRE-LABYRINTHE — x -25..24.5, z -48..-3, cellules 4,5 m ----
     Murs de 5,2 m sous plafond : aucun saut ne les franchit. La Bénédiction
     est sur le chemin de l'ouest ; la Clef d'or dort au fond du sud-est. */
  mkBox(51, 1, 47, RX - 0.25, -1, RZ - 25.5, 'slab');
  mkBox(51, 0.6, 47, RX - 0.25, 5.2, RZ - 25.5, 'stoneD');
  asciiWalls([
    '#####.#####',
    '#...#.#...#',
    '#.#.#.#.#.#',
    '#.#.....#.#',
    '#.#####.#.#',
    '#.....#.#.#',
    '###.#.#.#.#',
    '#...#.#...#',
    '#.#####.#.#',
    '###########'
  ], RX - 25, RZ - 3, 4.5, 5.2, 0, 'stoneD');
  rPedestal(RX - 13.75, RZ - 27.75, 0, 'heal', 0x9fffc0,
    'Bénédiction apprise ! (touche 6, puis clic) Une lumière chaude qui referme vos blessures — et ranime ce qui fut vivant.');
  rPickup('key', RX + 13.25, 0, RZ - 36.75, 'goldkey');
  rPickup('maxhp', RX + 17.75, 0, RZ - 9.75, 'cata_oss_vit');
  rPickup('heart', RX - 9.25, 0, RZ - 18.75);
  rPickup('mana', RX + 4.25, 0, RZ - 32.25);
  rPickup('shadow', RX - 20.5, 0, RZ - 36.75);
  rPickup('shadow', RX - 0.25, 0, RZ - 18.75);
  torch(RX - 13.75, 1.5, RZ - 9.75, 0x9a6cff, 1.1, 16);
  torch(RX + 8.75, 1.5, RZ - 27.75, 0x9a6cff, 1.1, 16);
  torch(RX - 4.75, 1.5, RZ - 41.25, 0x9a6cff, 1.1, 16);
  /* ossements épars */
  for (let i = 0; i < 12; i++) {
    const bx = RX - 22 + ((i * 53) % 44), bz = RZ - 6 - ((i * 31) % 38);
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + (i % 3) * 0.05, 0), matFor('slabW', 1, 1));
    b.position.set(bx, 0.15, bz);
    b.rotation.set(i, i * 2, 0);
    S.scene.add(b);
  }
  rEnemy(RX - 0.25, RZ - 9.75, 0, [[RX - 2, RZ - 9.75], [RX + 2, RZ - 9.75]], { type: 'wraith', lvl: 5 });
  rEnemy(RX - 13.75, RZ - 23, 0, [[RX - 13.75, RZ - 27], [RX - 13.75, RZ - 14]], { type: 'sentinel', lvl: 5 });
  rEnemy(RX - 9, RZ - 32.25, 0, [[RX - 15, RZ - 32.25], [RX - 4, RZ - 32.25]], { type: 'wraith', lvl: 5 });
  rEnemy(RX + 13.25, RZ - 30, 0, [[RX + 13.25, RZ - 25], [RX + 13.25, RZ - 34]], { type: 'caster', lvl: 5 });

  /* ---- GOUFFRE DES MORTS — x 14..47, z 2..26, brèche de 11,5 m ---- */
  mkBox(5, 8, 24, RX + 16.5, -8, RZ + 14, 'stoneD');   // rive ouest (bloc plein)
  mkBox(11.5, 1, 24, RX + 24.75, -8, RZ + 14, 'slab'); // fond de la fosse (-7 m)
  mkBox(16.5, 8, 24, RX + 38.75, -8, RZ + 14, 'stoneD'); // rive est (bloc plein)
  mkBox(33, 14.5, 1, RX + 30.5, -8, RZ + 2, 'stoneD');
  mkBox(33, 14.5, 1, RX + 30.5, -8, RZ + 26, 'stoneD');
  mkBox(35, 0.6, 26, RX + 30.5, 6.5, RZ + 14, 'stoneD');
  // mur est avec le rideau de flammes (z 12..16)
  mkBox(1, 6.5, 10, RX + 47, 0, RZ + 7, 'stoneD');
  mkBox(1, 6.5, 10, RX + 47, 0, RZ + 21, 'stoneD');
  mkBox(1, 2, 4, RX + 47, 4.5, RZ + 14, 'stoneD');
  /* escalier de la fosse (remonte du fond vers la rive ouest) */
  for (let i = 0; i < 12; i++)
    mkBox(0.9, 0.6 * (i + 1), 3, RX + 29.6 - 0.9 * i, -7, RZ + 4.5, 'stoneD');
  /* débris de l'ancien pont, au fond */
  mkBox(3.5, 0.4, 2.2, RX + 23, -7, RZ + 15, 'stoneR');
  mkBox(2.6, 0.4, 1.8, RX + 27, -7, RZ + 11, 'stoneR');
  addInter(RX + 17.5, 0, RZ + 14, 2.6, 'Scruter le gouffre', () => {
    showMsg('Le pont s\'est effondré. Onze mètres de vide... Un saut sprinté, puis le Pas du vent en plein vol.', 4);
  });
  torch(RX + 15.5, 0, RZ + 5, 0x66a8ff, 1.1, 16);
  torch(RX + 40, 0, RZ + 24, 0x66a8ff, 1.1, 16);
  rPedestal(RX + 41, RZ + 14, 0, 'shield', 0x9fc8ff,
    'Égide apprise ! (touche 4, puis clic) Un voile de lumière qui absorbe les coups — et que les flammes n\'osent pas mordre.', 'gouffre');
  rPickup('mana', RX + 16, 0, RZ + 22);
  rPickup('heart', RX + 44, 0, RZ + 5);
  rPickup('maxhp', RX + 24, -7, RZ + 20, 'cata_pit_vit');
  rPickup('shadow', RX + 27, -7, RZ + 8);
  rPickup('shadow', RX + 22, -7, RZ + 16);
  rEnemy(RX + 24, RZ + 10, -7, [[RX + 21, RZ + 8], [RX + 28, RZ + 14]], { type: 'brute', lvl: 5 });
  rEnemy(RX + 40, RZ + 18, 0, [[RX + 38, RZ + 18], [RX + 42, RZ + 6]], { type: 'sentinel', lvl: 5 });

  /* ---- rideau de flammes & chambre de la Première Larme ---- */
  const flameDoor = mkDoor(1, 4.5, 4, RX + 47, 0, RZ + 14, 'iron');
  if (flag('cata', 'flame')) presetOpen(flameDoor);
  else doorFlames(flameDoor, [[-0.65, -1.2, -1.2], [-0.65, -1.2, 0], [-0.65, -1.2, 1.2]]);
  addInter(RX + 45.6, 0, RZ + 14, 2.7, 'Traverser le rideau de flammes', it => {
    if (flameDoor.open) { it.on = false; return; }
    if (G.shieldT > 0) {
      it.on = false;
      setFlag('cata', 'flame');
      openDoor(flameDoor);
      spawnBurst(RX + 47, 1.5, RZ + 14, 0x9fc8ff, 24);
      showMsg('L\'Égide écarte les flammes : le rideau se lève dans un souffle de vapeur.', 4);
      questReach('flamme');
    } else if (G.powers.shield) {
      hurt(12, { x: RX + 48, z: RZ + 14 });
      showMsg('Les flammes vous repoussent ! Activez l\'Égide (touche 4) JUSTE AVANT de traverser.', 3);
    } else {
      showMsg('Un rideau de feu scelle la chambre. Seul un voile de lumière pourrait l\'écarter...', 3);
    }
  });
  mkBox(12, 1, 14, RX + 53, -1, RZ + 14, 'slab');
  mkBox(1, 6, 14, RX + 59, 0, RZ + 14, 'stoneD');
  mkBox(12, 6, 1, RX + 53, 0, RZ + 21, 'stoneD');
  mkBox(12, 6, 1, RX + 53, 0, RZ + 7, 'stoneD');
  mkBox(13, 0.6, 15, RX + 53, 5.5, RZ + 14, 'stoneD');
  rPickup('crystal', RX + 53, 0, RZ + 14, 'tear_cata');
  rPickup('heart', RX + 50, 0, RZ + 10);
  rPickup('mana', RX + 56, 0, RZ + 18);
  torch(RX + 56, 0, RZ + 9, 0xff8c3a, 1.2, 14);
  addInter(RX + 53, 0, RZ + 17, 2.6, 'Lire l\'épitaphe', () => {
    showMsg('« On l\'a traînée ici pour qu\'aucune aube ne la retrouve. » La Larme luit doucement, intacte.', 4);
  });
}

/* ================================================================
   v9.3 — LE GRAND PÈLERINAGE : sept salles instanciées supplémentaires
   entre les Terres Perdues et le reste du monde, sur un site dédié loin
   de tout (x ≈ -900 — ni le château, x ≈ -400, ni la Tour, x ≈ +400, ni
   le monde ouvert n'y touchent). Chaînées en une seule route : Muraille
   Céleste → Val des Murmures → Carrière de Sel → Canyon des Lames →
   Aqueduc Colossal → Forêt d'Obsidienne → Bastion des Cendres, puis
   retour aux Terres Perdues avec une récompense de fin de route.
   Esthétique volontairement minérale et monumentale (aucune moisissure,
   aucune chair) : pierre pâle, verre noir, lignes de lumière fines.
   ================================================================ */
const PX = -900; // ancre commune ; chaque salle a SA bande de z, largement espacée

/* v9.6 — REFONTE : les 7 salles du Pèlerinage étaient de simples couloirs
   fermés par une fente de 2 m entre deux blocs (aucune porte visible) —
   retour joueur : « on est dans un vide, pas de vraies portes, c'est
   petit ». zoneGate() bâtit un VRAI seuil (cadre de pierre + vantail qui
   s'est déjà levé, comme la herse ou la porte d'or) au lieu d'une fente
   invisible ; chaque salle gagne une aile latérale reliée par un seuil
   réel, pour une empreinte au sol comparable aux Catacombes. */
function zoneGate(x, y, z, w, h, mat, axis) {
  w = w || 5; h = h || 6.4;
  if (axis === 'x') { // seuil percé dans un mur EST/OUEST (bloque le passage en X)
    mkBox(1.3, 1.2, w + 1.6, x, y + h + 0.2, z, mat); // linteau
    const gate = mkDoor(1, h, w, x, y, z, mat);
    presetOpen(gate);
    return gate;
  }
  mkBox(w + 1.6, 1.2, 1.3, x, y + h + 0.2, z, mat); // linteau, au-dessus du vantail
  const gate = mkDoor(w, h, 1, x, y, z, mat);
  presetOpen(gate);
  return gate;
}

/* ---- Chambres secrètes (une par salle du Pèlerinage) ----
   v9.4 — sept énigmes DIFFÉRENTES (plus l'ancien bloc-sur-plaque recopié
   sept fois) : ordre à deviner, portage en hauteur à la Main céleste,
   passage réservé au Pas du vent, fenêtre de réaction chronométrée,
   leurre à repérer parmi des faux, et un vrai combat de garde renforcé.
   vaultShell() ne construit que la COQUE commune (renfoncement à l'écart
   x = PX-60, porte scellée, coffre, entrée/sortie par fondu — UI.
   withLoading, PAS un rechargement : la salle reste chargée, rien n'est
   perdu si on ressort avant d'avoir résolu). Chaque salle ajoute SA
   propre mécanique à l'intérieur et appelle solve() quand elle est
   validée. Récompense : équipement DÉJÀ FORGÉE, garantie, unique. */
function vaultShell(id, vz, entry, opts) {
  const vx = PX - 60;
  const { slot, rarity, doneMsg, solveMsg, guard, roomD = 22 } = opts;
  const half = roomD / 2;
  const teleport = (tx, ty, tz, yaw) => {
    const who = S.actingPlayer === 2 ? 2 : 1;
    const mover = who === 2 ? p2 : player;
    withLoading('Passage secret', () => {
      mover.pos.set(tx, ty, tz); mover.vel.set(0, 0, 0);
      if (yaw !== undefined) { if (who === 1) S.yaw = yaw; else p2.yaw = yaw; }
    });
  };
  // repère discret dans la salle principale : ne ressemble à rien de plus qu'un détail
  // (entry.gate : certaines chambres n'admettent que qui possède déjà tel pouvoir)
  addInter(entry.x, entry.y, entry.z, 2.4, entry.label, () => {
    if (entry.gate && !entry.gate()) { showMsg(entry.gateMsg || 'Il vous manque quelque chose pour continuer.', 3.5); return; }
    teleport(vx, 0.2, vz - half + 2, 0);
  });

  mkBox(14, 1, roomD, vx, -1, vz, 'stoneD');
  mkBox(0.7, 4.4, roomD, vx - 7, 0, vz, 'stoneR');
  mkBox(0.7, 4.4, roomD, vx + 7, 0, vz, 'stoneR');
  mkBox(5.5, 4.4, 0.7, vx - 4.25, 0, vz + half, 'stoneR');
  mkBox(5.5, 4.4, 0.7, vx + 4.25, 0, vz + half, 'stoneR');
  const vaultDoor = mkDoor(3, 4.4, 0.7, vx, 0, vz + half, 'stoneD');
  const solved = flag(id, 'vaultDone');
  if (solved) presetOpen(vaultDoor);
  torch(vx - 5, 0, vz - half + 4, 0xb08cff, 1.05, 14); torch(vx + 5, 0, vz + half - 5, 0xb08cff, 1.05, 14);
  if (guard && !solved) {
    const gx = vx + (guard.dx || 0), gz = vz + (guard.dz || 0), r = guard.range || 2.5;
    rEnemy(gx, gz, 0, [[gx - r, gz], [gx + r, gz]], guard.opt);
  }
  const solve = () => {
    if (flag(id, 'vaultDone')) return;
    setFlag(id, 'vaultDone');
    openDoor(vaultDoor);
    spawnBurst(vx, 1.4, vz, 0x9fdcff, 20);
    showMsg(solveMsg || 'Le mécanisme cède : la chambre scellée s\'ouvre.', 4);
  };
  if (!flag(id, 'vaultTaken')) {
    addInter(vx, 0, vz + half + 1.3, 2.6, 'Ouvrir le coffre scellé', it => {
      if (!flag(id, 'vaultDone')) { showMsg('Le coffre reste scellé : l\'épreuve n\'est pas achevée.', 3); return; }
      it.on = false; setFlag(id, 'vaultTaken');
      addGearToBag(rollEquipment(slot, rarity, G.path));
      spawnBurst(vx, 1.4, vz + half - 1, 0xffd97a, 30);
      showMsg(doneMsg, 5);
    });
  }
  addInter(vx, 0, vz - half + 1, 2.6, 'Ressortir', () => teleport(entry.x, entry.y, entry.z, entry.yaw));
  return { vx, vz, half, solved, solve, door: vaultDoor };
}

/* ---- 1. LA MURAILLE CÉLESTE (niv 4-7) — chemin de ronde d'un rempart titanesque,
   avec le poste de garde de l'Aube en aile latérale ---- */
function buildMuraille() {
  const z = 0;
  // chemin de ronde principal, élargi (18 m, contre 8 m avant la refonte)
  mkBox(18, 1, 74, PX, -1, z, 'stoneD');
  // mur ouest percé d'un vrai seuil (z 0) vers la Cour d'Armes
  mkBox(0.7, 5.6, 34.5, PX - 9, 0, z - 19.75, 'stoneR'); mkBox(0.7, 5.6, 34.5, PX - 9, 0, z + 19.75, 'stoneR');
  mkBox(0.7, 5.6, 41, PX + 9, 0, z - 16.5, 'stoneR'); mkBox(0.7, 5.6, 29, PX + 9, 0, z + 22.5, 'stoneR');
  // seuils réels aux deux bouts (portes déjà levées, cadre de pierre visible),
  // flanqués de pans de mur pleins couvrant toute la largeur du chemin de ronde
  mkBox(6.5, 5.6, 1, PX - 5.75, 0, z - 37, 'stoneD'); mkBox(6.5, 5.6, 1, PX + 5.75, 0, z - 37, 'stoneD');
  zoneGate(PX, 0, z - 37, 5, 5.4, 'stoneD');
  mkBox(6.5, 5.6, 1, PX - 5.75, 0, z + 37, 'stoneD'); mkBox(6.5, 5.6, 1, PX + 5.75, 0, z + 37, 'stoneD');
  zoneGate(PX, 0, z + 37, 5, 5.4, 'stoneD');
  // colonnade et créneaux : plus de présence architecturale que l'ancien couloir nu
  for (let i = -3; i <= 3; i++) {
    const rz = z + i * 10;
    mkBox(0.6, 1.4, 0.6, PX - 8.5, 4.2, rz, 'stoneD'); mkBox(0.6, 1.4, 0.6, PX + 8.5, 4.2, rz, 'stoneD');
  }
  // lignes de lumière gravées, fines et oniriques, courant le long du mur ouest
  for (let i = 0; i < 13; i++) {
    const rz = z - 33 + i * 5.5;
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 3.4), new THREE.MeshBasicMaterial({ color: 0x8fc8ff }));
    line.position.set(PX - 8.9, 1.1, rz); line.add(glow(0x8fc8ff, 1.1, 0.4));
    S.scene.add(line);
  }
  torch(PX - 7, 0, z - 27, 0x8fc8ff, 1.1, 18); torch(PX + 7, 0, z - 9, 0x8fc8ff, 1.1, 18);
  torch(PX - 7, 0, z + 9, 0x8fc8ff, 1.1, 18); torch(PX + 7, 0, z + 27, 0x8fc8ff, 1.1, 18);
  addInter(PX, 0, z - 30.5, 3, 'Lire les gravures du rempart', () => {
    showMsg('« Ici veillaient les gardes du ciel. » Les lignes de lumière courent encore le long de la pierre, comme un souvenir qui refuse de s\'éteindre.', 4.5);
  });
  addPickup('heart', PX - 5, 0, z - 15);
  addPickup('mana', PX + 5, 0, z + 12);
  rEnemy(PX, z - 12, 0, [[PX - 4, z - 20], [PX + 4, z - 5]], { type: 'sentinel', lvl: 5 });
  rEnemy(PX, z + 20, 0, [[PX - 4, z + 10], [PX + 4, z + 28]], { type: 'wraith', lvl: 6 });

  /* ---- aile latérale : LE POSTE DE GARDE DE L'AUBE (est, via un vrai seuil) ---- */
  const gx = PX + 9, gz = z + 6;
  zoneGate(gx, 0, gz, 4, 5, 'stoneR', 'x');
  mkBox(20, 1, 18, gx + 10, -1, gz, 'stoneD');
  mkBox(0.7, 5.6, 18, gx + 20, 0, gz, 'stoneR');
  mkBox(20, 5.6, 0.7, gx + 10, 0, gz - 9, 'stoneR'); mkBox(20, 5.6, 0.7, gx + 10, 0, gz + 9, 'stoneR');
  mkCyl(0.5, 0.5, 4.4, gx + 6, 0, gz - 5, 'stoneD', true, 8); mkCyl(0.5, 0.5, 4.4, gx + 6, 0, gz + 5, 'stoneD', true, 8);
  mkCyl(0.5, 0.5, 4.4, gx + 15, 0, gz - 5, 'stoneD', true, 8); mkCyl(0.5, 0.5, 4.4, gx + 15, 0, gz + 5, 'stoneD', true, 8);
  torch(gx + 4, 0, gz, 0x8fc8ff, 1.1, 16); torch(gx + 18, 0, gz, 0x8fc8ff, 1.1, 16);
  addInter(gx + 10, 0, gz, 3, 'Fouiller le poste de garde', () => {
    showMsg('Une table renversée, des lances brisées : la garde de l\'aube n\'a pas eu le temps de sonner l\'alarme.', 4.5);
  });
  addPickup('shadow', gx + 5, 0, gz + 3); addPickup('mana', gx + 16, 0, gz - 3);
  rEnemy(gx + 10, gz, 0, [[gx + 5, gz - 4], [gx + 17, gz + 4]], { type: 'caster', lvl: 6 });

  /* ---- grande aile ouest : LA COUR D'ARMES — une seconde enceinte, aussi
     vaste que le chemin de ronde, avec ses barricades de repli, sa tour de
     guet à gravir et un bivouac (point de renaissance) ---- */
  zoneGate(PX - 9, 0, z, 5, 5.4, 'stoneR', 'x');       // seuil réel depuis le chemin de ronde
  const cyX = PX - 21;                                  // centre de la cour
  mkBox(24, 1, 32, cyX, -1, z, 'stoneD');               // dallage de la cour
  mkBox(0.8, 6, 32, PX - 33, 0, z, 'stoneR');           // mur ouest (fond)
  mkBox(24, 6, 0.8, cyX, 0, z - 16, 'stoneR'); mkBox(24, 6, 0.8, cyX, 0, z + 16, 'stoneR'); // murs nord/sud
  // barricades de repli (couvert bas — on les contourne, aucun cul-de-sac)
  mkBox(6, 2.6, 0.8, cyX + 2, 0, z - 6, 'stoneD'); mkBox(6, 2.6, 0.8, cyX - 4, 0, z + 6, 'stoneD');
  mkBox(0.8, 2.6, 6, cyX - 8, 0, z - 3, 'stoneD'); mkBox(0.8, 2.6, 6, cyX + 6, 0, z + 4, 'stoneD');
  // caisses et tonneaux épars
  for (let i = 0; i < 5; i++) mkBox(1.1, 1.1, 1.1, cyX - 9 + ((i * 47) % 20), 0.05, z - 12 + ((i * 29) % 24), 'woodD');
  torch(cyX + 8, 0, z - 12, 0x8fc8ff, 1.15, 18); torch(cyX - 10, 0, z + 12, 0x8fc8ff, 1.15, 18);
  // tour de guet : escalier en colimaçon jusqu'à un belvédère crénelé
  const twX = cyX - 8, twZ = z + 11;
  mkBox(5.5, 1, 5.5, twX, -1, twZ, 'stoneR');          // socle de la tour
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, sx = twX + Math.cos(a) * 1.35, sz = twZ + Math.sin(a) * 1.35;
    mkBox(1.7, 0.5, 1.7, sx, i * 0.72, sz, 'stoneR');
  }
  const twTopY = 12 * 0.72;                             // ≈ 8,6 m
  mkBox(4, 0.6, 4, twX, twTopY - 0.3, twZ, 'stoneR');   // belvédère
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; mkBox(0.5, 1, 0.5, twX + Math.cos(a) * 1.7, twTopY + 0.3, twZ + Math.sin(a) * 1.7, 'stoneR'); }
  torch(twX, twTopY, twZ, 0x8fc8ff, 1.3, 16);
  addInter(twX, twTopY, twZ, 2.4, 'Contempler Ombreciel depuis le belvédère', () => {
    showMsg('D\'ici, tout le Pèlerinage se déroule sous vos yeux, jusqu\'aux nuages où flotte encore, dit-on, la cité perdue.', 5);
  });
  rPickup('maxhp', twX, twTopY, twZ - 1.2, 'muraille_belvedere_vit');
  bivouac(cyX - 3, 0, z, 'la Cour d\'Armes', 'mur_cour', true, 5);
  const murCamp = CAMPS.find(c => c.id === 'mur_cour'); if (murCamp) murCamp.room = 'muraille';
  addInter(cyX + 6, 0, z - 12, 2.6, 'Fouiller le râtelier d\'armes', () => {
    showMsg('Un râtelier renversé, des piques rouillées : les gardes ont défendu cette cour jusqu\'au dernier, puis le silence.', 4.5);
  });
  addPickup('heart', cyX - 6, 0, z - 10); addPickup('mana', cyX + 8, 0, z + 10);
  addPickup('shadow', cyX - 10, 0, z + 2);
  rEnemy(cyX + 4, z - 8, 0, [[cyX, z - 12], [cyX + 8, z - 4]], { type: 'sentinel', lvl: 5 });
  rEnemy(cyX - 6, z + 8, 0, [[cyX - 10, z + 4], [cyX - 2, z + 12]], { type: 'wraith', lvl: 6 });
  rEnemy(cyX - 2, z, 0, [[cyX - 8, z - 2], [cyX + 6, z + 2]], { type: 'brute', lvl: 6 });

  /* ---- chambre secrète n°1 : ORDRE À DEVINER (indice lu dans la salle
     principale, trois flammes à éveiller dans le bon ordre) ---- */
  addInter(PX + 3, 0, z - 6, 2.6, 'Lire une gravure effacée par le temps', () => {
    showMsg('« Trois flammes gardent le seuil : que d\'abord la plus froide s\'éveille, puis la plus ardente, enfin celle du couchant. »', 5.5);
  });
  const muraVault = vaultShell('muraille', z, { x: PX - 3, y: 0.2, z: z + 14, yaw: Math.PI / 2, label: 'Une faille suspecte dans le mur ouest' }, {
    slot: 'armor', rarity: 'rare',
    solveMsg: 'Les trois flammes s\'accordent enfin : un pan de mur pivote sur lui-même.',
    doneMsg: 'Un pan d\'armure oubliée, encore marqué du blason des gardes du ciel.',
    guard: { dx: 0, dz: -4, range: 2, opt: { type: 'sentinel', lvl: 7 } }
  });
  if (!muraVault.solved) {
    const order = ['cold', 'hot', 'dusk'];
    let progress = 0;
    [
      { key: 'cold', x: muraVault.vx - 6, z: muraVault.vz - 6, color: 0x8fc8ff, label: 'Toucher la flamme la plus froide' },
      { key: 'hot',  x: muraVault.vx + 6, z: muraVault.vz,     color: 0xff8a3a, label: 'Toucher la flamme la plus ardente' },
      { key: 'dusk', x: muraVault.vx - 6, z: muraVault.vz + 6, color: 0xb08cff, label: 'Toucher la flamme du couchant' }
    ].forEach(sc => {
      torch(sc.x, 0, sc.z, sc.color, 1.15, 12);
      addInter(sc.x, 0, sc.z, 2.2, sc.label, () => {
        if (order[progress] === sc.key) {
          progress++;
          if (progress === order.length) muraVault.solve();
          else showMsg('La flamme s\'embrase... une autre doit suivre.', 2);
        } else {
          progress = 0;
          showMsg('Les flammes vacillent et s\'éteignent : l\'ordre n\'était pas le bon.', 2.5);
        }
      });
    });
  }
  addInter(PX, 0, z + 32.3, 2.6, 'Poursuivre vers le Val des Murmures', () => {
    gotoRoom('val_murmures', { x: PX, y: 0.2, z: -150 + 29.3, yaw: Math.PI });
  });
  addInter(PX, 0, z - 32.3, 2.6, 'Revenir vers les Terres Perdues', () => {
    exitToWorld('Les Terres Perdues', 55, 0.2, -14, -Math.PI / 2, 'Le vent des Terres Perdues vous accueille de nouveau.');
  });
}

/* ---- 2. LE VAL DES MURMURES (niv 7-9) — plaine balayée par les vents, herbes lunaires ---- */
function buildValMurmures() {
  const z = -150;
  mkBox(50, 1, 60, PX, -1, z, 'grass');
  mkBox(1, 9, 32, PX - 25, 0, z - 14, 'stoneD'); mkBox(1, 9, 24, PX - 25, 0, z + 18, 'stoneD');
  mkBox(1, 9, 60, PX + 25, 0, z, 'stoneD');
  mkBox(21.5, 9, 1, PX - 14.25, 0, z - 30, 'stoneD'); mkBox(21.5, 9, 1, PX + 14.25, 0, z - 30, 'stoneD');
  mkBox(21.5, 9, 1, PX - 14.25, 0, z + 30, 'stoneD'); mkBox(21.5, 9, 1, PX + 14.25, 0, z + 30, 'stoneD');
  zoneGate(PX, 0, z - 30, 7, 6.5, 'stoneD');
  zoneGate(PX, 0, z + 30, 7, 6.5, 'stoneD');
  // rochers et herbes lunaires cristallisées
  for (let i = 0; i < 16; i++) {
    const rx = PX - 22 + ((i * 173) % 44), rz = z - 27 + ((i * 97) % 54);
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + ((i * 13) % 10) * 0.06, 0), matFor('stoneR', 1, 1));
    r.position.set(rx, 0.2, rz); r.rotation.set(i, i * 2, i * 3); r.castShadow = true; r.receiveShadow = true;
    S.scene.add(r);
  }
  // la première enclume abandonnée, sur la route des pèlerins
  mkAnvil(PX + 14, 0, z + 10);
  torch(PX - 18, 0, z - 20, 0x9fe8ff, 1.1, 18); torch(PX + 18, 0, z + 18, 0x9fe8ff, 1.1, 18);
  addInter(PX, 0, z - 5, 3, 'Écouter les murmures du vent', () => {
    showMsg('C\'était la route des pèlerins. Le vent porte encore leurs prières, en échos trop anciens pour se laisser comprendre.', 4.5);
  });
  addPickup('herb', PX - 10, 0, z + 14); addPickup('herb', PX + 8, 0, z - 12);
  addPickup('shadow', PX - 6, 0, z - 20); addPickup('mana', PX + 16, 0, z - 4);
  rEnemy(PX - 10, z - 10, 0, [[PX - 16, z - 10], [PX - 2, z - 16]], { type: 'sentinel', lvl: 7 });
  rEnemy(PX + 8, z + 6, 0, [[PX + 4, z + 14], [PX + 14, z + 2]], { type: 'caster', lvl: 7 });
  rEnemy(PX - 4, z + 20, 0, [[PX - 12, z + 22], [PX + 2, z + 18]], { type: 'sentinel', lvl: 8 });

  /* ---- aile latérale : LE REFUGE DES PÈLERINS (ouest, via un vrai seuil) ---- */
  const rgx = PX - 25, rgz = z + 4;
  zoneGate(rgx, 0, rgz, 4, 5, 'stoneR', 'x');
  mkBox(16, 1, 14, rgx - 8, -1, rgz, 'stoneD');
  mkBox(0.7, 5, 14, rgx - 16, 0, rgz, 'stoneR');
  mkBox(16, 5, 0.7, rgx - 8, 0, rgz - 7, 'stoneR'); mkBox(16, 5, 0.7, rgx - 8, 0, rgz + 7, 'stoneR');
  for (let k = 0; k < 3; k++) mkBox(2.4, 0.5, 0.9, rgx - 5 - k * 3.2, 0, rgz - 4, 'woodF'); // couchettes de fortune
  torch(rgx - 5, 0, rgz + 4, 0x9fe8ff, 1.1, 14); torch(rgx - 14, 0, rgz - 4, 0x9fe8ff, 1.1, 14);
  addInter(rgx - 8, 0, rgz, 3, 'Fouiller le refuge des pèlerins', () => {
    showMsg('Des couchettes de fortune, un foyer éteint depuis des lunes : d\'autres porteurs de flamme se sont arrêtés ici avant vous.', 4.5);
  });
  addPickup('mana', rgx - 12, 0, rgz - 3); addPickup('heart', rgx - 4, 0, rgz + 3);
  rEnemy(rgx - 8, rgz, 0, [[rgx - 12, rgz - 3], [rgx - 4, rgz + 3]], { type: 'wraith', lvl: 8 });

  /* ---- LE DÉDALE DE ROSEAUX LUNAIRES — la plaine, jadis vide, se hérisse
     d'un labyrinthe de hautes herbes cristallisées (serpentine toujours
     franchissable, jamais de cul-de-sac scellé) ; sa récompense dort au
     fond, une relique de vitalité ---- */
  asciiWalls([
    '#######.',
    '........',
    '.#######',
    '........',
    '#######.',
    '........'
  ], PX - 12, z + 28, 3, 2.8, 0, 'hedge');
  torch(PX - 10, 0, z + 24, 0x9fe8ff, 1.05, 14); torch(PX + 10, 0, z + 14, 0x9fe8ff, 1.05, 14);
  rPickup('maxhp', PX + 10.5, 0, z + 26.5, 'val_dedale_vit');
  addPickup('shadow', PX - 7, 0, z + 17); addPickup('mana', PX + 4, 0, z + 20);
  addInter(PX, 0, z + 12, 2.6, 'Écouter les roseaux de lune', () => {
    showMsg('Les hautes herbes cristallisées tintent au vent comme des cloches lointaines. On dit qu\'elles répètent les derniers mots des pèlerins perdus.', 4.5);
  });
  rEnemy(PX + 6, z + 22, 0, [[PX + 2, z + 18], [PX + 10, z + 24]], { type: 'wraith', lvl: 8 });

  /* ---- LE CERCLE DES MENHIRS — au sud de la plaine, sept pierres levées
     autour d'un foyer : le bivouac (renaissance + voyage rapide) ---- */
  const mcz = z - 18;
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    mkCyl(0.6, 0.8, 4.2 + (i % 3) * 0.6, PX + Math.cos(a) * 6, 0, mcz + Math.sin(a) * 6, 'stoneR', true, 6);
  }
  bivouac(PX, 0, mcz, 'le Cercle des Menhirs', 'val_menhirs', true, 5.5);
  const valCamp = CAMPS.find(c => c.id === 'val_menhirs'); if (valCamp) valCamp.room = 'val_murmures';
  addInter(PX + 6, 0, mcz - 6, 2.6, 'Déchiffrer les pierres levées', () => {
    showMsg('Sept menhirs, un par ordre de porteurs de flamme. Les runes gravées invoquent la paix des morts — et, dit-on, protègent le feu qu\'elles entourent.', 4.5);
  });
  addPickup('shadow', PX - 6, 0, mcz + 4);
  rEnemy(PX - 8, mcz, 0, [[PX - 12, mcz - 4], [PX - 4, mcz + 4]], { type: 'caster', lvl: 8 });

  /* ---- chambre secrète n°2 : DEUX BLOCS + L'ÉGIDE (les plaques ne se
     chargent que si l'Égide est active au moment où les deux blocs
     reposent dessus — pas de simple bloc-sur-plaque, il faut savoir QUAND
     invoquer son pouvoir) ---- */
  addInter(PX - 20, 0, z - 10, 2.6, 'Un caillou déplacé, une trace dans l\'herbe', () => {
    showMsg('Les murmures du vent emportent tout ce qui n\'est pas protégé. Seule l\'Égide retient assez longtemps le poids des pierres pour qu\'elles cèdent.', 5.5);
  });
  const valVault = vaultShell('val_murmures', z, { x: PX - 20, y: 0.2, z: z - 10, yaw: 0, label: 'Un caillou déplacé, une trace dans l\'herbe' }, {
    slot: 'weapon', rarity: 'rare',
    solveMsg: 'Sous l\'Égide, les deux plaques cèdent enfin ensemble : la chambre s\'ouvre.',
    doneMsg: 'Une lame encore chantante, façonnée par les pèlerins pour éloigner les échos du vent.'
  });
  if (!valVault.solved) {
    mkTkCube(valVault.vx - 3, 0.55, valVault.vz - 4);
    mkTkCube(valVault.vx + 3, 0.55, valVault.vz - 4);
    [valVault.vx - 2.4, valVault.vx + 2.4].forEach(px2 => {
      const plateGlow = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 1.6), new THREE.MeshBasicMaterial({ color: 0x3a4880 }));
      plateGlow.position.set(px2, 0.14, valVault.vz + 2);
      S.scene.add(plateGlow);
      PLATES.push({
        x: px2, z: valVault.vz + 2, y: 0, glow: plateGlow, door: valVault.door,
        cond: () => (G.shieldT > 0) || (S.COOP && p2.shieldT > 0),
        msg: 'Sous l\'Égide, les deux plaques cèdent enfin ensemble : la chambre s\'ouvre.',
        onOpen: () => valVault.solve()
      });
    });
  }
  addInter(PX, 0, z + 29.3, 2.6, 'Poursuivre vers la Carrière de Sel', () => {
    gotoRoom('carriere_sel', { x: PX, y: 0.2, z: -300 + 29.3, yaw: Math.PI });
  });
  addInter(PX, 0, z - 29.3, 2.6, 'Revenir vers la Muraille Céleste', () => {
    gotoRoom('muraille', { x: PX, y: 0.2, z: -29.3, yaw: 0 });
  });
}

/* ---- 3. LA CARRIÈRE DE SEL ET D'AUBE (niv 9-12) — crevasse aveuglante, ponts suspendus ---- */
function buildCarriereSel() {
  const z = -300;
  mkBox(20, 8, 60, PX - 24, -8, z, 'slabW');   // rive ouest (bloc plein)
  mkBox(8, 1, 60, PX, -8, z, 'slabW');         // fond de la crevasse (-7,5 m)
  mkBox(20, 8, 60, PX + 24, -8, z, 'slabW');   // rive est (bloc plein)
  mkBox(1, 16.5, 60, PX - 14, -8, z, 'slabW', false);
  mkBox(1, 16.5, 60, PX + 14, -8, z, 'slabW', false);
  mkBox(13.5, 9, 1, PX - 10.25, 0, z - 30, 'stoneD'); mkBox(13.5, 9, 1, PX + 10.25, 0, z - 30, 'stoneD');
  mkBox(13.5, 9, 1, PX - 10.25, 0, z + 30, 'stoneD'); mkBox(13.5, 9, 1, PX + 10.25, 0, z + 30, 'stoneD');
  zoneGate(PX, 0, z - 30, 7, 6.5, 'stoneD');
  zoneGate(PX, 0, z + 30, 7, 6.5, 'stoneD');
  mkBox(30, 0.6, 60, PX, 8.5, z, 'stoneD');
  /* débarcadères pleins aux deux seuils : sans eux, les portes des deux bouts
     flottaient au-dessus du vide et l'arrivée par la porte tombait dans la
     crevasse (« bug quand on tombe / on est dans un vide »). Ils relient aussi
     les deux rives par-dessus la faille. */
  mkBox(30, 1, 6, PX, -1, z - 30, 'stoneD');
  mkBox(30, 1, 6, PX, -1, z + 30, 'stoneD');
  // deux ponts de planches suspendus au-dessus du vide
  mkBox(28, 0.35, 3, PX, 0, z - 14, 'woodD');
  mkBox(28, 0.35, 3, PX, 0, z + 14, 'woodD');
  /* v9.6 — escalier de secours taillé dans le sel : sans lui, quiconque
     tombe (ou explore) le fond de la crevasse restait bloqué en bas, sans
     moyen de remonter (retour joueur : « bug quand on tombe »). Relie le
     fond (-7,5 m) au pont sud (0 m). */
  for (let i = 0; i < 6; i++) {
    mkBox(4, 0.6, 2.4, PX - 3, -7.5 + i * 1.35, z - 25 + i * 2.1, 'slabW');
  }
  torch(PX - 20, -7.5, z - 20, 0xf4ecd6, 1.1, 16); torch(PX + 20, -7.5, z + 20, 0xf4ecd6, 1.1, 16);
  addInter(PX, 0, z, 3, 'Contempler la crevasse', () => {
    showMsg('Le sel ronge jusqu\'au métal. C\'est d\'ici que fut extraite chaque pierre du château — et, dit-on, l\'entrée des catacombes dort quelque part sous ce blanc aveuglant.', 5);
  });
  addPickup('mana', PX - 10, 0, z - 14); addPickup('heart', PX + 10, 0, z + 14);
  addPickup('shadow', PX, -7.3, z);
  rEnemy(PX - 8, z - 8, 0, [[PX - 12, z - 14], [PX + 4, z - 8]], { type: 'sentinel', lvl: 9 });
  rEnemy(PX + 6, z + 10, 0, [[PX - 4, z + 14], [PX + 10, z + 6]], { type: 'wraith', lvl: 10 });
  rEnemy(PX, z, -7.5, [[PX - 10, z], [PX + 10, z]], { type: 'caster', lvl: 10 });

  /* ---- LA GALERIE DES MINEURS : le fond de la crevasse s'élargit vers
     l'ouest (comble le vide qui séparait le fond de la rive — plus de
     gouffre invisible entre les deux), une vraie alcôve creusée dans le
     sel plutôt qu'un couloir taillé dans le bloc plein de la rive. */
  mkBox(10, 1, 16, PX - 9, -8, z - 4, 'slabW');
  mkBox(0.7, 5, 16, PX - 14, -7.5, z - 4, 'slabW');
  mkBox(10, 5, 0.7, PX - 9, -7.5, z - 12, 'slabW'); mkBox(10, 5, 0.7, PX - 9, -7.5, z + 4, 'slabW');
  for (let i = 0; i < 3; i++) mkCyl(0.4, 0.5, 4.4, PX - 6 - i * 2.6, -7.5, z - 9, 'slabW', true, 7);
  torch(PX - 7, -7.5, z - 1, 0xf4ecd6, 1.1, 14); torch(PX - 12, -7.5, z - 8, 0xf4ecd6, 1.1, 14);
  addInter(PX - 9, -7.5, z - 4, 3, 'Examiner la galerie des mineurs', () => {
    showMsg('Des pics abandonnés, des paniers renversés : les mineurs ont fui avant d\'achever leur veine. Le sel a tout figé depuis.', 4.5);
  });
  addPickup('shadow', PX - 12, -7.5, z + 1); addPickup('mana', PX - 6, -7.5, z - 9);
  rEnemy(PX - 9, z - 4, -7.5, [[PX - 12, z - 8], [PX - 6, z]], { type: 'sentinel', lvl: 10 });

  /* ---- LA HALLE D'EXTRACTION — la rive est, jadis un simple bloc nu, devient
     une grande halle de taille du sel : colonnes de sel, veines cristallines
     qui luisent, un bivouac (renaissance) au milieu des ruines minières.
     On y accède par les ponts ; le vide côté ouest reste ouvert (les rives
     s'y rejoignent par les débarcadères des deux seuils). ---- */
  mkBox(1, 9, 60, PX + 34, 0, z, 'stoneD');                         // fond est
  mkBox(20, 9, 1, PX + 24, 0, z - 30, 'stoneD'); mkBox(20, 9, 1, PX + 24, 0, z + 30, 'stoneD'); // bouts nord/sud de la halle
  for (const [px, pz] of [[PX + 20, z - 14], [PX + 30, z - 14], [PX + 20, z + 14], [PX + 30, z + 14]])
    mkCyl(0.7, 0.9, 8, px, 0, pz, 'slabW', true, 8);                // colonnes de sel
  // veines de sel qui luisent le long du fond
  for (let i = 0; i < 7; i++) {
    const cy = new THREE.Mesh(new THREE.OctahedronGeometry(0.28 + (i % 3) * 0.08), new THREE.MeshBasicMaterial({ color: 0xdff4ff }));
    cy.position.set(PX + 33, 0.6 + (i % 2) * 1.4, z - 24 + i * 8); cy.add(glow(0xbfe8ff, 1.1, 0.4)); S.scene.add(cy);
  }
  torch(PX + 18, 0, z - 18, 0xf4ecd6, 1.2, 18); torch(PX + 30, 0, z + 18, 0xf4ecd6, 1.2, 18);
  bivouac(PX + 24, 0, z, 'la Halle d\'Extraction', 'carr_halle', true, 5);
  const carrCamp = CAMPS.find(c => c.id === 'carr_halle'); if (carrCamp) carrCamp.room = 'carriere_sel';
  addInter(PX + 30, 0, z - 6, 2.6, 'Examiner une veine de sel d\'aube', () => {
    showMsg('La veine luit d\'une lumière laiteuse : du sel d\'aube, si pur qu\'il éclaire seul. C\'est lui qui donnait sa clarté aux pierres du château.', 4.5);
  });
  rPickup('maxhp', PX + 31, 0, z, 'carr_halle_vit');
  addPickup('heart', PX + 20, 0, z - 20); addPickup('mana', PX + 28, 0, z + 20);
  rEnemy(PX + 24, z - 10, 0, [[PX + 18, z - 16], [PX + 30, z - 4]], { type: 'brute', lvl: 11 });
  rEnemy(PX + 26, z + 12, 0, [[PX + 20, z + 6], [PX + 32, z + 18]], { type: 'caster', lvl: 11 });

  /* ---- chambre secrète n°3 : DEUX POUVOIRS EN CHAÎNE — le Pas du vent pour
     franchir le vide jusqu'à la corde, puis le Souffle glacé pour geler le
     bassin de saumure qui bloque le coffre ---- */
  const carrVault = vaultShell('carriere_sel', z, {
    x: PX, y: 0.2, z: z - 14, yaw: Math.PI / 2, label: 'Une corde effilochée, nouée à la rambarde',
    gate: () => G.powers.dash,
    gateMsg: 'Une corde effilochée pend au-dessus du vide. Sans un Pas au-delà du vent, nul ne peut la rejoindre.'
  }, {
    slot: 'accessory', rarity: 'epic',
    solveMsg: 'La saumure gèle d\'un coup : le passage vers le coffre s\'ouvre.',
    doneMsg: 'Une amulette de sel pur, froide au toucher, qui semble absorber la lumière environnante.'
  });
  if (!carrVault.solved) {
    const brineMat = new THREE.MeshStandardMaterial({ color: 0x3a5a68, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 });
    const brine = new THREE.Mesh(new THREE.BoxGeometry(10, 0.15, 3), brineMat);
    brine.position.set(carrVault.vx, 0.08, carrVault.vz + 3);
    S.scene.add(brine);
    addInter(carrVault.vx, 0, carrVault.vz + 3, 2.8, 'Un bassin de saumure barre le passage', () => {
      if (!G.powers.frost) { showMsg('La saumure ne gèle qu\'au Souffle glacé — nul pas ne la traverse telle quelle.', 3.5); return; }
      brineMat.color.setHex(0xdff4ff); brineMat.opacity = 1;
      spawnBurst(carrVault.vx, 0.3, carrVault.vz + 3, 0xbfe8ff, 20);
      carrVault.solve();
    });
  }
  addInter(PX, 0, z + 29.3, 2.6, 'Poursuivre vers le Canyon des Lames', () => {
    gotoRoom('canyon_lames', { x: PX, y: 0.2, z: -450 + 29.3, yaw: Math.PI });
  });
  addInter(PX, 0, z - 29.3, 2.6, 'Revenir vers le Val des Murmures', () => {
    gotoRoom('val_murmures', { x: PX, y: 0.2, z: -150 - 29.3, yaw: 0 });
  });
}

/* ---- 4. LE CANYON DES LAMES FILIGRANES (niv 12-15) — épées colossales à escalader ---- */
function buildCanyonLames() {
  const z = -450;
  mkBox(28, 1, 60, PX, -1, z, 'stoneD');
  mkBox(1, 20, 60, PX - 14, 0, z, 'stoneD');
  mkBox(1, 20, 40, PX + 14, 0, z - 10, 'stoneD'); mkBox(1, 20, 16, PX + 14, 0, z + 22, 'stoneD');
  mkBox(10.5, 9, 1, PX - 8.75, 0, z - 30, 'stoneD'); mkBox(10.5, 9, 1, PX + 8.75, 0, z - 30, 'stoneD');
  mkBox(10.5, 9, 1, PX - 8.75, 0, z + 30, 'stoneD'); mkBox(10.5, 9, 1, PX + 8.75, 0, z + 30, 'stoneD');
  zoneGate(PX, 0, z - 30, 7, 6.5, 'stoneD');
  zoneGate(PX, 0, z + 30, 7, 6.5, 'stoneD');
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x14101f, roughness: 0.35, metalness: 0.6, emissive: 0x2a1a4a, emissiveIntensity: 0.5 });
  /* épées géantes plantées dans la roche : plateformes d'escalade par paliers */
  for (let i = 0; i < 8; i++) {
    const bx = (i % 2 === 0) ? PX - 6 : PX + 6, bz = z - 24 + i * 6.8;
    const blade = new THREE.Mesh(new THREE.ConeGeometry(1.3, 5 + i * 0.4, 6), bladeMat);
    blade.position.set(bx, (5 + i * 0.4) / 2 - 0.3 + i * 1.35, bz);
    blade.rotation.z = (i % 2 === 0) ? 0.12 : -0.12;
    blade.castShadow = true; S.scene.add(blade); addCol2(blade);
    if (i % 3 === 0) {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0xb08cff }));
      gem.position.set(bx, blade.position.y + (5 + i * 0.4) / 2 + 0.3, bz);
      gem.add(glow(0xb08cff, 1.6, 0.5)); S.scene.add(gem); spinners.push(gem);
    }
  }
  torch(PX - 10, 0, z - 20, 0x9a6cff, 1.1, 18); torch(PX + 10, 0, z + 16, 0x9a6cff, 1.1, 18);
  addInter(PX, 0, z, 3, 'Observer les lames plantées', () => {
    showMsg('Des dizaines d\'épées monumentales, faites d\'un verre sombre parcouru de motifs oniriques. Le site d\'une bataille que nul ne raconte plus.', 4.5);
  });
  addPickup('mana', PX - 8, 0, z - 4); addPickup('heart', PX + 8, 0, z + 4);
  rEnemy(PX - 6, z - 12, 0, [[PX - 8, z - 18], [PX - 4, z - 6]], { type: 'brute', lvl: 12 });
  rEnemy(PX + 6, z + 8, 0, [[PX + 4, z + 2], [PX + 8, z + 16]], { type: 'caster', lvl: 13 });
  rEnemy(PX, z + 20, 12.15, [[PX - 4, z + 20], [PX + 4, z + 20]], { type: 'wraith', lvl: 13 });

  /* ---- aile latérale : LA FORGE ABANDONNÉE (est, via un vrai seuil) ---- */
  const cgx = PX + 14, cgz = z + 12;
  zoneGate(cgx, 0, cgz, 4, 5, 'stoneD', 'x');
  mkBox(16, 1, 16, cgx + 8, -1, cgz, 'stoneD');
  mkBox(0.7, 5, 16, cgx + 16, 0, cgz, 'stoneR');
  mkBox(16, 5, 0.7, cgx + 8, 0, cgz - 8, 'stoneR'); mkBox(16, 5, 0.7, cgx + 8, 0, cgz + 8, 'stoneR');
  mkAnvil(cgx + 6, 0, cgz - 4);
  torch(cgx + 5, 0, cgz + 5, 0x9a6cff, 1.1, 14); torch(cgx + 13, 0, cgz - 5, 0x9a6cff, 1.1, 14);
  addInter(cgx + 12, 0, cgz + 4, 3, 'Examiner l\'enclume brisée', () => {
    showMsg('Une forge de bataille, montée à la hâte pour réparer les lames avant l\'assaut. Elle n\'a pas eu le temps de refroidir.', 4.5);
  });
  addPickup('bone', cgx + 5, 0, cgz + 4); addPickup('shadow', cgx + 13, 0, cgz + 3);
  rEnemy(cgx + 9, cgz, 0, [[cgx + 5, cgz - 4], [cgx + 13, cgz + 4]], { type: 'brute', lvl: 13 });

  /* ---- LE NID DU GUETTEUR — un escalier fiable grimpe le long du mur ouest
     jusqu'à un belvédère perché entre les lames : la récompense qui couronne
     l'ascension (le canyon n'était qu'un fond plat sans raison de grimper) ---- */
  for (let i = 0; i < 14; i++) mkBox(4, 0.5, 2, PX - 10, i * 0.85, z + 4 + i * 1.3, 'stoneD');
  mkBox(7, 0.6, 8, PX - 9, 11.5, z + 22, 'stoneD');                 // belvédère
  for (let i = 0; i < 3; i++) { mkBox(0.5, 1, 0.5, PX - 12 + i * 3.4, 12, z + 25.5, 'stoneR'); }
  torch(PX - 9, 11.8, z + 20, 0x9a6cff, 1.3, 16);
  addInter(PX - 9, 11.8, z + 22, 2.6, 'Contempler le champ de lames d\'en haut', () => {
    showMsg('D\'ici, les épées plantées dessinent un immense cercle : ce n\'était pas une bataille, mais un rituel. On a fiché mille lames pour sceller quelque chose sous la roche.', 5);
  });
  rPickup('maxhp', PX - 9, 11.8, z + 23, 'canyon_nid_vit');
  addPickup('mana', PX - 11, 11.8, z + 20);
  rEnemy(PX - 8, z + 22, 11.8, [[PX - 12, z + 20], [PX - 5, z + 24]], { type: 'caster', lvl: 14, ranged: true });
  // lames supplémentaires basses : plus de densité, plus de couvert au sol
  for (let i = 0; i < 4; i++) {
    const bx = PX - 9 + i * 6, bz = z - 26 + (i % 2) * 4;
    const bl = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 6), bladeMat);
    bl.position.set(bx, 1.9, bz); bl.rotation.z = (i % 2 ? 0.2 : -0.2); bl.castShadow = true; S.scene.add(bl); addCol2(bl);
  }
  // bivouac au sol, dans un renfoncement du mur ouest
  bivouac(PX - 10, 0, z - 18, 'le Champ de Lames', 'canyon_biv', true, 5);
  const canCamp = CAMPS.find(c => c.id === 'canyon_biv'); if (canCamp) canCamp.room = 'canyon_lames';
  addPickup('heart', PX - 11, 0, z - 22);
  rEnemy(PX + 9, z - 18, 0, [[PX + 4, z - 22], [PX + 12, z - 12]], { type: 'wraith', lvl: 13 });

  /* ---- chambre secrète n°4 : DEUX GARDES À VAINCRE, PUIS PORTAGE VERTICAL —
     la Main céleste doit guider le bloc runique jusqu'en haut d'un escalier
     de plateformes (même principe que les lames à escalader de la salle
     principale), et non plus le long d'un simple sol plat ---- */
  const canyVault = vaultShell('canyon_lames', z, { x: PX, y: 0.2, z: z - 2, yaw: Math.PI, label: 'Une petite lame gravée d\'un symbole étrange' }, {
    slot: 'weapon', rarity: 'epic',
    solveMsg: 'Le bloc trouve son socle, tout en haut : un déclic résonne dans tout le canyon.',
    doneMsg: 'Une dague filigranée, taillée dans le même verre sombre que les lames géantes — mais assez légère pour être maniée.',
    guard: { dx: -2, dz: -5, range: 2, opt: { type: 'brute', lvl: 14 } },
    roomD: 26
  });
  if (!canyVault.solved) {
    rEnemy(canyVault.vx + 3, canyVault.vz - 5, 0, [[canyVault.vx, canyVault.vz - 7], [canyVault.vx + 5, canyVault.vz - 3]], { type: 'caster', lvl: 14 });
    addInter(canyVault.vx, 0, canyVault.vz - 7, 2.6, 'Lire une entaille dans la pierre', () => {
      showMsg('Le symbole n\'est pas une arme, mais une clé : ce que la Main céleste peut porter, elle peut aussi élever.', 4.5);
    });
    const steps = 4, stepH = 1.35, stepGap = 2.6;
    for (let i = 0; i < steps; i++) {
      mkBox(3, 0.6, 3, canyVault.vx, (i + 1) * stepH - 0.3, canyVault.vz - 6 + (i + 1) * stepGap, 'stoneR');
    }
    const topY = steps * stepH, topZ = canyVault.vz - 6 + steps * stepGap;
    mkTkCube(canyVault.vx, 0.55, canyVault.vz - 6);
    const plateGlow = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 1.6), new THREE.MeshBasicMaterial({ color: 0x3a4880 }));
    plateGlow.position.set(canyVault.vx, topY + 0.14, topZ);
    S.scene.add(plateGlow);
    PLATES.push({
      x: canyVault.vx, z: topZ, y: topY, glow: plateGlow, door: canyVault.door,
      msg: 'Le bloc trouve son socle, tout en haut : un déclic résonne dans tout le canyon.',
      onOpen: () => canyVault.solve()
    });
  }
  addInter(PX, 0, z + 29.3, 2.6, 'Poursuivre vers l\'Aqueduc Colossal', () => {
    gotoRoom('aqueduc_colossal', { x: PX, y: 15, z: -600 + 29.3, yaw: Math.PI });
  });
  addInter(PX, 0, z - 29.3, 2.6, 'Revenir vers la Carrière de Sel', () => {
    gotoRoom('carriere_sel', { x: PX, y: 0.2, z: -300 - 29.3, yaw: 0 });
  });
}

/* ---- 5. L'AQUEDUC COLOSSAL (niv 15-18) — arches cyclopéennes au-dessus des nuages ---- */
function buildAqueducColossal() {
  const z = -600;
  const H = 15; // altitude de la passerelle : le vide en dessous est mortel
  mkBox(8, 1, 60, PX, H - 0.5, z, 'stoneD');
  mkBox(0.6, 1.3, 24, PX - 4, H, z - 18, 'stoneR'); mkBox(0.6, 1.3, 32, PX - 4, H, z + 14, 'stoneR');
  mkBox(0.6, 1.3, 24, PX + 4, H, z - 18, 'stoneR'); mkBox(0.6, 1.3, 32, PX + 4, H, z + 14, 'stoneR');
  /* portes monumentales aux deux bouts de la passerelle */
  mkBox(2, 9, 1, PX - 4, H, z - 30, 'stoneD'); mkBox(2, 9, 1, PX + 4, H, z - 30, 'stoneD');
  zoneGate(PX, H, z - 30, 6, 6.4, 'stoneD');
  mkBox(2, 9, 1, PX - 4, H, z + 30, 'stoneD'); mkBox(2, 9, 1, PX + 4, H, z + 30, 'stoneD');
  zoneGate(PX, H, z + 30, 6, 6.4, 'stoneD');
  /* arches cyclopéennes soutenant la passerelle, plongeant dans le vide */
  for (let i = 0; i < 5; i++) {
    const az = z - 24 + i * 12;
    mkBox(1.8, H + 1, 1.8, PX - 10, -1, az, 'stoneD');
    mkBox(1.8, H + 1, 1.8, PX + 10, -1, az, 'stoneD');
    mkBox(22, 1.2, 1.8, PX, H - 1, az, 'stoneD', false);
  }
  torch(PX - 3, H, z - 20, 0x8fc8ff, 1.2, 20); torch(PX + 3, H, z + 4, 0x8fc8ff, 1.2, 20); torch(PX - 3, H, z + 22, 0x8fc8ff, 1.2, 20);
  addInter(PX, H, z, 3, 'Regarder par-dessus la rambarde', () => {
    showMsg('Rien que des nuages, à perte de vue. Cet aqueduc ne transportait pas de l\'eau, mais de la lumière liquide vers Ombreciel.', 4.5);
  });
  addPickup('mana', PX - 2, H, z - 10); addPickup('heart', PX + 2, H, z + 12);
  rEnemy(PX, z - 10, H, [[PX, z - 20], [PX, z]], { type: 'caster', lvl: 16, ranged: true });
  rEnemy(PX, z + 14, H, [[PX, z + 6], [PX, z + 24]], { type: 'wraith', lvl: 16 });

  /* ---- annexe : LE POSTE DU GUETTEUR — une échauguette accrochée au flanc
     de l'aqueduc, reliée par une brèche dans la rambarde et un pont, avec
     sa propre porte réelle avant la salle ---- */
  const wgx = PX + 16, wgz = z - 4;
  mkBox(7.5, 1, 5, PX + 7.75, H - 0.5, wgz, 'stoneD');
  mkBox(7.5, 1.3, 0.5, PX + 7.75, H, wgz - 2.5, 'stoneR'); mkBox(7.5, 1.3, 0.5, PX + 7.75, H, wgz + 2.5, 'stoneR');
  mkBox(1.8, H + 1, 1.8, wgx, -1, wgz, 'stoneD');
  mkBox(9, 1, 9, wgx, H - 0.5, wgz, 'stoneD');
  mkBox(9, 9, 1, wgx, H, wgz - 4.5, 'stoneD'); mkBox(9, 9, 1, wgx, H, wgz + 4.5, 'stoneD');
  mkBox(1, 9, 9, wgx + 4.5, H, wgz, 'stoneD');
  mkBox(1, 9, 2.5, PX + 11.5, H, wgz - 3.25, 'stoneD'); mkBox(1, 9, 2.5, PX + 11.5, H, wgz + 3.25, 'stoneD');
  zoneGate(PX + 11.5, H, wgz, 4, 6.4, 'stoneD', 'x');
  torch(wgx - 3, H, wgz - 3, 0xffb15c, 1.1, 18); torch(wgx + 3, H, wgz + 3, 0xffb15c, 1.1, 18);
  addInter(wgx, H, wgz - 2, 2.4, 'Examiner le poste du guetteur', () => {
    showMsg('Une échauguette de guet, accrochée au flanc de l\'aqueduc. Le guetteur qui l\'occupait a disparu depuis longtemps — mais son arme est restée.', 4.5);
  });
  addPickup('mana', wgx - 2.5, H, wgz + 2); addPickup('gold', wgx + 2.5, H, wgz - 2.5);
  rEnemy(wgx, wgz, H, [[wgx - 1.5, wgz - 1.5], [wgx + 1.5, wgz + 1.5]], { type: 'caster', lvl: 17, ranged: true });

  /* ---- LE CHÂTEAU D'EAU — à l'ouest, une brèche de la rambarde (jusque-là
     un simple bord ouvert au-dessus du vide) ouvre sur un pont menant à la
     grande cuve d'où l'aqueduc tirait sa lumière liquide : chambre close
     (aucune chute possible), bivouac, relique de vitalité ---- */
  const rz = z - 4, rcx = PX - 24;
  mkBox(1.8, H + 1, 1.8, PX - 12, -1, rz, 'stoneD');                // pilier de soutien du pont
  mkBox(11, 1, 5, PX - 9.5, H - 0.5, rz, 'stoneD');                 // pont de dérivation
  mkBox(11, 1.3, 0.4, PX - 9.5, H, rz - 2.5, 'stoneR'); mkBox(11, 1.3, 0.4, PX - 9.5, H, rz + 2.5, 'stoneR');
  mkBox(1.8, H + 1, 1.8, rcx - 4, -1, rz - 6, 'stoneD'); mkBox(1.8, H + 1, 1.8, rcx + 4, -1, rz + 6, 'stoneD'); // soutiens de la cuve
  mkBox(18, 1, 18, rcx, H - 0.5, rz, 'stoneD');                     // fond de la cuve
  mkBox(1, 6, 18, rcx - 9, H, rz, 'stoneD');                        // paroi ouest
  mkBox(18, 6, 1, rcx, H, rz - 9, 'stoneD'); mkBox(18, 6, 1, rcx, H, rz + 9, 'stoneD'); // parois nord/sud
  mkBox(1, 6, 6.5, rcx + 9, H, rz - 5.75, 'stoneD'); mkBox(1, 6, 6.5, rcx + 9, H, rz + 5.75, 'stoneD'); // paroi est (brèche du pont)
  // bassin de lumière liquide au centre (décor, non solide)
  const poolMat = new THREE.MeshBasicMaterial({ color: 0x8fd6ff, transparent: true, opacity: 0.7 });
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.25, 24), poolMat);
  pool.position.set(rcx, H + 0.15, rz); pool.add(glow(0x8fc8ff, 3, 0.6)); S.scene.add(pool);
  mkCyl(0.7, 0.9, 6, rcx - 5, H, rz - 5, 'stoneR', true, 8); mkCyl(0.7, 0.9, 6, rcx - 5, H, rz + 5, 'stoneR', true, 8);
  torch(rcx - 6, H, rz - 6, 0x8fc8ff, 1.3, 18); torch(rcx - 6, H, rz + 6, 0x8fc8ff, 1.3, 18);
  bivouac(rcx - 6, H, rz, 'le Château d\'Eau', 'aque_cuve', true, 5);
  const aqueCamp = CAMPS.find(c => c.id === 'aque_cuve'); if (aqueCamp) aqueCamp.room = 'aqueduc_colossal';
  addInter(rcx, H, rz + 4, 2.6, 'Toucher la lumière liquide', () => {
    showMsg('Le bassin retient encore un fond de lumière liquide — tiède, vivante, comme de l\'eau qui aurait appris à briller. C\'est elle qui irriguait Ombreciel.', 5);
  });
  rPickup('maxhp', rcx - 7, H, rz, 'aque_cuve_vit');
  addPickup('mana', rcx + 3, H, rz - 5); addPickup('heart', rcx + 3, H, rz + 5);
  rEnemy(rcx, rz - 5, H, [[rcx - 4, rz - 6], [rcx + 4, rz - 4]], { type: 'wraith', lvl: 17 });
  rEnemy(rcx - 3, rz + 5, H, [[rcx - 6, rz + 4], [rcx, rz + 6]], { type: 'caster', lvl: 18, ranged: true });

  /* ---- chambre secrète n°5 : ÉPREUVE DE RÉFLEXE — un rayon tourne sans
     relâche (le même mécanisme d'auto-rotation que les gemmes du monde
     ouvert) ; il faut frapper chacune des trois gemmes exactement quand
     le rayon les balaie, dans n'importe quel ordre ---- */
  const aqueVault = vaultShell('aqueduc_colossal', z, { x: PX - 2, y: H, z: z + 10, yaw: Math.PI / 2, label: 'Une pierre du parapet, plus mobile que les autres' }, {
    slot: 'armor', rarity: 'epic',
    solveMsg: 'Les trois gemmes s\'embrasent ensemble : la chambre scellée s\'ouvre.',
    doneMsg: 'Une cuirasse légère, tissée de plumes de pierre — un secret des bâtisseurs de l\'aqueduc.'
  });
  if (!aqueVault.solved) {
    addInter(aqueVault.vx, 0, aqueVault.vz - 6, 2.6, 'Lire une inscription érodée par le vent', () => {
      showMsg('Le vent ne s\'arrête jamais de tourner. Seul celui qui frappe juste à l\'instant où la lumière passe peut espérer l\'apaiser.', 5);
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 3.4), new THREE.MeshBasicMaterial({ color: 0x8fc8ff }));
    beam.position.set(aqueVault.vx, 1.2, aqueVault.vz);
    beam.add(glow(0x8fc8ff, 1.4, 0.4));
    S.scene.add(beam); spinners.push(beam);
    const caught = [false, false, false];
    [0, Math.PI * 2 / 3, Math.PI * 4 / 3].forEach((ang, i) => {
      const gx = aqueVault.vx + Math.sin(ang) * 3.2, gz = aqueVault.vz + Math.cos(ang) * 3.2;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0x3a4880 }));
      gem.position.set(gx, 1.2, gz); S.scene.add(gem);
      addInter(gx, 0, gz, 1.8, 'Frapper la gemme au bon instant', () => {
        const cur = ((beam.rotation.y % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        let diff = Math.abs(cur - ang); if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 0.35) {
          if (!caught[i]) { caught[i] = true; gem.material.color.setHex(0x4ae08a); spawnBurst(gx, 1.2, gz, 0x8fc8ff, 10); }
          if (caught.every(Boolean)) aqueVault.solve();
          else showMsg('La gemme s\'embrase ! Il en reste ' + (3 - caught.filter(Boolean).length) + '.', 2);
        } else {
          showMsg('Trop tôt, ou trop tard : la lumière n\'y est pas encore.', 1.6);
        }
      });
    });
  }
  addInter(PX, H, z + 29.3, 2.6, 'Poursuivre vers la Forêt d\'Obsidienne', () => {
    gotoRoom('foret_obsidienne', { x: PX, y: 0.2, z: -750 + 29.3, yaw: Math.PI });
  });
  addInter(PX, H, z - 29.3, 2.6, 'Revenir vers le Canyon des Lames', () => {
    gotoRoom('canyon_lames', { x: PX, y: 0.2, z: -450 - 29.3, yaw: 0 });
  });
}

/* ---- 6. LA FORÊT D'OBSIDIENNE (niv 18-20) — arbres pétrifiés, verre noir tranchant ---- */
function buildForetObsidienne() {
  const z = -750;
  mkBox(46, 1, 60, PX, -1, z, 'stoneD');
  mkBox(1, 10, 60, PX - 23, 0, z, 'stoneD');
  mkBox(1, 10, 22, PX + 23, 0, z - 19, 'stoneD'); mkBox(1, 10, 34, PX + 23, 0, z + 13, 'stoneD');
  mkBox(19.5, 9, 1, PX - 13.25, 0, z - 30, 'stoneD'); mkBox(19.5, 9, 1, PX + 13.25, 0, z - 30, 'stoneD');
  zoneGate(PX, 0, z - 30, 7, 6.5, 'stoneD');
  mkBox(19.5, 9, 1, PX - 13.25, 0, z + 30, 'stoneD'); mkBox(19.5, 9, 1, PX + 13.25, 0, z + 30, 'stoneD');
  zoneGate(PX, 0, z + 30, 7, 6.5, 'stoneD');
  const obsMat = new THREE.MeshStandardMaterial({ color: 0x0a0812, roughness: 0.2, metalness: 0.3, emissive: 0x1a0a2a, emissiveIntensity: 0.35 });
  for (let i = 0; i < 22; i++) {
    const tx = PX - 20 + ((i * 137) % 40), tz = z - 27 + ((i * 211) % 54);
    const h = 2.6 + ((i * 53) % 10) * 0.3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, h, 6), obsMat);
    trunk.position.set(tx, h / 2, tz); trunk.rotation.z = ((i * 7) % 5 - 2) * 0.05;
    trunk.castShadow = true; S.scene.add(trunk); addCol2(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 5), obsMat);
    crown.position.set(tx, h + 0.5, tz); crown.castShadow = true; S.scene.add(crown);
  }
  /* une arche brisée, vestige d'un portail effondré au cœur de la forêt */
  mkBox(1.2, 5, 1.2, PX - 3, 2.5, z - 4, 'stoneR');
  mkBox(4.5, 1, 1.2, PX, 4.9, z - 4, 'stoneR');
  mkBox(1.2, 2.6, 1.2, PX + 3, 1.3, z - 4.6, 'stoneR');
  /* un cercle de duel, stèles de verre noir plantées en rond */
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    mkBox(0.5, 1.1, 0.5, PX - 12 + Math.cos(a) * 3.2, 0.55, z + 20 + Math.sin(a) * 3.2, 'stoneR');
  }
  torch(PX - 16, 0, z - 16, 0x6a3aff, 1.05, 16); torch(PX + 16, 0, z + 14, 0x6a3aff, 1.05, 16);
  addInter(PX, 0, z, 3, 'Toucher un arbre de verre noir', () => {
    showMsg('Tranchant comme un rasoir, froid comme la nuit sans lune. Rien ne pourrit ici : tout est figé depuis un siècle.', 4.5);
  });
  addInter(PX - 12, 0, z + 20, 2.6, 'Le cercle de duel', () => {
    showMsg('Ici, les novices de l\'Ordre s\'affrontaient à l\'aube, sous le regard des maîtres. Le verre noir garde encore, dit-on, l\'écho des lames.', 4.5);
  });
  addPickup('shadow', PX - 12, 0, z - 10); addPickup('shadow', PX + 10, 0, z + 8);
  addPickup('heart', PX, 0, z + 20);
  rEnemy(PX - 10, z - 14, 0, [[PX - 16, z - 18], [PX - 4, z - 8]], { type: 'wraith', lvl: 18 });
  rEnemy(PX + 8, z + 6, 0, [[PX + 2, z + 12], [PX + 16, z]], { type: 'brute', lvl: 19 });
  rEnemy(PX, z + 18, 0, [[PX - 8, z + 22], [PX + 8, z + 16]], { type: 'caster', lvl: 19 });

  /* ---- annexe : LA CLAIRIÈRE DES REFLETS — une poche cachée derrière le
     mur est, ouverte par une vraie porte, où le verre noir reflète une
     étrange lumière ---- */
  const fgx = PX + 35, fgz = z - 6;
  mkBox(4, 1, 4, PX + 25, -1, fgz, 'stoneD');
  zoneGate(PX + 23, 0, fgz, 4, 6.4, 'stoneD', 'x');
  mkBox(16, 1, 16, fgx, -1, fgz, 'stoneD');
  mkBox(16, 9, 1, fgx, 0, fgz - 8, 'stoneD'); mkBox(16, 9, 1, fgx, 0, fgz + 8, 'stoneD');
  mkBox(1, 9, 16, fgx + 8, 0, fgz, 'stoneD');
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const tx = fgx + Math.cos(a) * 4.5, tz = fgz + Math.sin(a) * 4.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 2.8, 6), obsMat);
    trunk.position.set(tx, 1.4, tz); S.scene.add(trunk); addCol2(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.5, 5), obsMat);
    crown.position.set(tx, 3.2, tz); S.scene.add(crown);
  }
  torch(fgx - 5, 0, fgz - 5, 0x6a3aff, 1.1, 16); torch(fgx + 5, 0, fgz + 5, 0x6a3aff, 1.1, 16);
  addInter(fgx, 0, fgz, 2.8, 'Le miroir de verre noir', () => {
    showMsg('Une poche oubliée de la forêt, où le verre noir semble refléter un autre ciel que le nôtre.', 4.5);
  });
  addPickup('shadow', fgx - 3, 0, fgz + 3); addPickup('mana', fgx + 3, 0, fgz - 3);
  rEnemy(fgx, fgz, 0, [[fgx - 2, fgz - 2], [fgx + 2, fgz + 2]], { type: 'wraith', lvl: 19 });
  /* ---- chambre secrète n°6 : LE BON ARBRE PARMI LES LEURRES — un indice
     décrit un détail précis ; se tromper réveille une ombre embusquée
     (pas de simple bloc-sur-plaque : de l'observation, avec une sanction) ---- */
  const foretVault = vaultShell('foret_obsidienne', z, { x: PX - 18, y: 0.2, z: z + 14, yaw: 0, label: 'Un arbre de verre au tronc étrangement creux' }, {
    slot: 'accessory', rarity: 'epic',
    solveMsg: 'Le tronc creux s\'ouvre en silence : un passage descend dans l\'obscurité.',
    doneMsg: 'Un talisman de verre noir, poli par des mains qui ne reviendront plus.'
  });
  if (!foretVault.solved) {
    addInter(foretVault.vx, 0, foretVault.vz - 6, 2.6, 'Lire une marque gravée dans l\'écorce voisine', () => {
      showMsg('« Cherchez l\'arbre dont la sève, encore, scintille : les autres ne sont que des reflets morts. »', 4.5);
    });
    const obsMat2 = new THREE.MeshStandardMaterial({ color: 0x0a0812, roughness: 0.2, metalness: 0.3, emissive: 0x1a0a2a, emissiveIntensity: 0.35 });
    const correctIdx = 2;
    [[-4, -2], [3, -3], [-2, 3], [4, 2]].forEach(([dx, dz], i) => {
      const tx = foretVault.vx + dx, tz = foretVault.vz + dz;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 2.6, 6), obsMat2);
      trunk.position.set(tx, 1.3, tz); trunk.castShadow = true; S.scene.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.2, 5), obsMat2);
      crown.position.set(tx, 3, tz); S.scene.add(crown);
      if (i === correctIdx) {
        const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: 0x7ade5a }));
        spark.position.set(tx, 0.3, tz); spark.add(glow(0x7ade5a, 0.7, 0.3));
        S.scene.add(spark);
      }
      addInter(tx, 0, tz, 1.6, 'Toucher cet arbre', () => {
        if (i === correctIdx) foretVault.solve();
        else {
          showMsg('Rien qu\'un reflet mort : quelque chose remue dans l\'ombre...', 2.5);
          rEnemy(tx, tz + 1.5, 0, [[tx - 2, tz], [tx + 2, tz]], { type: 'wraith', lvl: 19 });
        }
      });
    });
  }
  addInter(PX, 0, z + 29.3, 2.6, 'Poursuivre vers le Bastion des Cendres', () => {
    gotoRoom('bastion_cendres', { x: PX, y: 0.2, z: -900 + 29.3, yaw: Math.PI });
  });
  addInter(PX, 0, z - 29.3, 2.6, 'Revenir vers l\'Aqueduc Colossal', () => {
    gotoRoom('aqueduc_colossal', { x: PX, y: 15, z: -600 - 29.3, yaw: 0 });
  });
}

/* ---- 7. LE BASTION DES CENDRES (niv 20-23) — dernière résistance, lumière crépusculaire ---- */
function buildBastionCendres() {
  const z = -900;
  mkBox(40, 1, 60, PX, -1, z, 'stoneD');
  // mur ouest (z -30..+30) percé du seuil de la Crypte (z +6..+10)
  mkBox(1, 11, 36, PX - 20, 0, z - 12, 'stoneD'); mkBox(1, 11, 20, PX - 20, 0, z + 20, 'stoneD');
  mkBox(1, 11, 60, PX + 20, 0, z, 'stoneD');
  mkBox(16.5, 9, 1, PX - 11.75, 0, z - 30, 'stoneD'); mkBox(16.5, 9, 1, PX + 11.75, 0, z - 30, 'stoneD');
  zoneGate(PX, 0, z - 30, 7, 6.5, 'stoneD');
  mkBox(16.5, 9, 1, PX - 11.75, 0, z + 30, 'stoneD'); mkBox(16.5, 9, 1, PX + 11.75, 0, z + 30, 'stoneD');
  zoneGate(PX, 0, z + 30, 7, 6.5, 'stoneD');
  mkBox(42, 0.6, 62, PX, 11, z, 'stoneD');
  // ruines militaires éventrées : blocs de décombres épars
  for (let i = 0; i < 10; i++) {
    const rx = PX - 16 + ((i * 173) % 32), rz = z - 18 + ((i * 97) % 36);
    mkBox(1.4 + (i % 3) * 0.5, 1 + (i % 4) * 0.4, 1.4 + (i % 2) * 0.6, rx, 0, rz, 'stoneR');
  }
  torch(PX - 14, 0, z - 12, 0xff5a2a, 1.3, 18); torch(PX + 14, 0, z + 12, 0xff5a2a, 1.3, 18);
  torch(PX, 0, z, 0xff8a3a, 1.2, 20);
  addInter(PX, 0, z - 20, 3, 'Se recueillir parmi les cendres', () => {
    showMsg('Ici tomba la dernière résistance de l\'ordre. Les fantômes des Porteurs de Flamme y affrontent encore les Ombres, chaque nuit, pour l\'éternité.', 5);
  });
  addPickup('mana', PX - 10, 0, z - 8); addPickup('heart', PX + 10, 0, z + 8);
  rEnemy(PX - 8, z - 6, 0, [[PX - 14, z - 10], [PX - 2, z]], { type: 'brute', lvl: 21 });
  rEnemy(PX + 8, z + 8, 0, [[PX + 2, z + 4], [PX + 14, z + 14]], { type: 'brute', lvl: 22 });
  rEnemy(PX, z + 16, 0, [[PX - 10, z + 18], [PX + 10, z + 14]], { type: 'caster', lvl: 22 });
  rEnemy(PX - 4, z - 16, 0, [[PX - 10, z - 20], [PX + 2, z - 12]], { type: 'wraith', lvl: 22 });

  /* ---- annexe : LA CRYPTE DES PORTEURS DE FLAMME — un caveau derrière le
     mur ouest, ouvert par une vraie porte, où reposent les derniers
     défenseurs du Bastion ---- */
  const bcx = PX - 32, bcz = z + 8;
  mkBox(5, 1, 4, PX - 22.5, -1, bcz, 'stoneD');
  zoneGate(PX - 20, 0, bcz, 4, 6.4, 'stoneD', 'x');
  mkBox(14, 1, 14, bcx, -1, bcz, 'stoneD');
  mkBox(14, 9, 1, bcx, 0, bcz - 7, 'stoneD'); mkBox(14, 9, 1, bcx, 0, bcz + 7, 'stoneD');
  mkBox(1, 9, 14, bcx - 7, 0, bcz, 'stoneD');
  for (let i = 0; i < 3; i++) mkBox(1.2, 1, 3, bcx - 4 + i * 4, 0.5, bcz - 3, 'stoneR');
  torch(bcx - 4, 0, bcz + 4, 0xff5a2a, 1.15, 16); torch(bcx + 4, 0, bcz + 4, 0xff5a2a, 1.15, 16);
  addInter(bcx, 0, bcz + 3, 2.8, 'Les tombeaux des derniers défenseurs', () => {
    showMsg('Trois Porteurs de Flamme reposent ici, leurs armes brisées posées sur la pierre. Ils n\'ont pas fui, même face aux Ombres.', 4.5);
  });
  addPickup('gold', bcx - 4, 0, bcz - 5); addPickup('heart', bcx + 4, 0, bcz - 5);
  rEnemy(bcx, bcz, 0, [[bcx - 3, bcz - 1], [bcx + 3, bcz - 1]], { type: 'brute', lvl: 23 });
  /* récompense de fin de route : une pièce d'équipement rare, adaptée à la Voie */
  if (!flag('bastion_cendres', 'reward')) {
    setFlag('bastion_cendres', 'reward');
    addInter(PX, 0, z, 2.8, 'Recueillir la relique du Bastion', it => {
      it.on = false;
      addGearToBag(rollEquipment(['weapon', 'armor', 'accessory'][Math.floor(Math.random() * 3)], 'rare', G.path));
      spawnBurst(PX, 1.4, z, 0xffd97a, 30);
      showMsg('Sous les cendres, une relique du dernier Porteur de Flamme — encore tiède de lumière.', 4.5);
    });
  }
  /* ---- chambre secrète n°7 : LE DERNIER GARDIEN — pas d'énigme, un vrai
     combat de garde renforcé (Titan d'obsidienne, bien au-dessus des
     ombres de la salle) pour la récompense la plus rare de tout le
     Pèlerinage ---- */
  addInter(PX + 16, 0, z - 14, 2.6, 'Une dalle descellée parmi les décombres', () => {
    showMsg('Une dalle descellée parmi les décombres : ce que les Porteurs de Flamme ont caché ici, ils l\'ont bien gardé.', 4.5);
  });
  const bastVault = vaultShell('bastion_cendres', z, { x: PX + 16, y: 0.2, z: z - 14, yaw: Math.PI, label: 'Une dalle descellée parmi les décombres' }, {
    slot: 'weapon', rarity: 'legendary',
    solveMsg: 'Le Titan s\'effondre en poussière de cendres : la chambre scellée s\'ouvre.',
    doneMsg: 'La dernière lame d\'un Porteur de Flamme, encore emplie d\'une lumière crépusculaire — légendaire entre toutes.'
  });
  if (!bastVault.solved) {
    addInter(bastVault.vx, 0, bastVault.vz - 6, 2.6, 'Une présence pèse dans l\'ombre', () => {
      showMsg('Le dernier Gardien des Cendres ne cède qu\'au combat : nul mécanisme ne le remplace.', 4);
    });
    const boss = rEnemy(bastVault.vx, bastVault.vz + 1, 0, [[bastVault.vx - 3, bastVault.vz + 1], [bastVault.vx + 3, bastVault.vz + 1]], { type: 'obsidian', lvl: 24 });
    if (boss) boss.onKilled = () => bastVault.solve();
    else bastVault.solve(); // revisite : pas de renfort régénéré, la voie reste ouverte
  }
  addInter(PX, 0, z - 24.3, 2.6, 'Revenir vers la Forêt d\'Obsidienne', () => {
    gotoRoom('foret_obsidienne', { x: PX, y: 0.2, z: -750 - 29.3, yaw: 0 });
  });
}
/* petit utilitaire local : collider simple sans passer par mkBox (formes non-boîtes) */
function addCol2(m) {
  m.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(m);
  colliders.push({ min: b.min.clone(), max: b.max.clone(), on: true, mesh: m });
}

/* ================================================================
   v9.5 — LE SANCTUAIRE OUBLIÉ : salle secrète débloquée en éveillant les
   six pierres du Sanctuaire de l'Arbre (Confins d'Ombre, World.js) avec
   les six dons de base. Site dédié (x ≈ -1400), loin de tout. Trois
   épreuves avant la relique : l'ordre des saisons, le rythme de la sève,
   puis le Gardien de Racine — une arme légendaire garantie au bout.
   ================================================================ */
const NX = -1400, NZ = 0;
function buildSanctuaireAncien() {
  /* ---- chambre d'entrée ---- */
  mkBox(14, 1, 20, NX, -1, NZ, 'stoneD');
  mkBox(0.7, 4.4, 20, NX - 7, 0, NZ, 'trunk'); mkBox(0.7, 4.4, 20, NX + 7, 0, NZ, 'trunk');
  mkBox(14, 4.4, 0.7, NX, 0, NZ - 10, 'trunk');
  torch(NX - 5, 0, NZ - 6, 0x7ade5a, 1.1, 16); torch(NX + 5, 0, NZ + 6, 0x7ade5a, 1.1, 16);
  addInter(NX, 0, NZ - 6, 3, 'Lire les racines gravées', () => {
    showMsg('« Avant la pierre, la sève. Trois épreuves gardent ce qui fut caché : l\'ordre, le rythme, et le courage. »', 5);
  });
  addInter(NX, 0, NZ + 9, 2.6, 'Revenir au Sanctuaire de l\'Arbre', () => {
    exitToWorld('Les Confins d\'Ombre', -40, 0.2, -8, Math.PI, 'La sève ancienne vous rend au grand air.');
  });

  /* ---- épreuve 1 : L'ORDRE DES SAISONS (z 10..30) ---- */
  const z1 = NZ + 20;
  mkBox(18, 1, 20, NX, -1, z1, 'stoneD');
  mkBox(0.7, 4.4, 20, NX - 9, 0, z1, 'trunk'); mkBox(0.7, 4.4, 20, NX + 9, 0, z1, 'trunk');
  const seasonDoor = mkDoor(3, 4.4, 0.7, NX, 0, z1 + 10, 'trunk');
  const seasonDone = flag('sanctuaire_ancien', 'season');
  if (seasonDone) presetOpen(seasonDoor);
  else {
    mkBox(7.5, 4.4, 0.7, NX - 5.25, 0, z1 + 10, 'trunk');
    mkBox(7.5, 4.4, 0.7, NX + 5.25, 0, z1 + 10, 'trunk');
  }
  addInter(NX, 0, z1 - 8, 2.8, 'Lire l\'inscription des saisons', () => {
    showMsg('« Le printemps s\'éveille, l\'été embrase, l\'automne consume, l\'hiver endort : que la ronde suive son cours. »', 5);
  });
  if (!seasonDone) {
    const seasonOrder = ['spring', 'summer', 'autumn', 'winter'];
    let seasonProgress = 0;
    [
      { key: 'spring', x: NX - 6, z: z1 - 2, color: 0x7ade5a, label: 'Toucher la pierre du printemps' },
      { key: 'summer', x: NX - 2, z: z1 + 3, color: 0xffd97a, label: 'Toucher la pierre de l\'été' },
      { key: 'autumn', x: NX + 2, z: z1 - 2, color: 0xff8a3a, label: 'Toucher la pierre de l\'automne' },
      { key: 'winter', x: NX + 6, z: z1 + 3, color: 0x9fe8ff, label: 'Toucher la pierre de l\'hiver' }
    ].forEach(sc => {
      torch(sc.x, 0, sc.z, sc.color, 1.1, 12);
      addInter(sc.x, 0, sc.z, 2, sc.label, () => {
        if (seasonOrder[seasonProgress] === sc.key) {
          seasonProgress++;
          if (seasonProgress === seasonOrder.length) {
            setFlag('sanctuaire_ancien', 'season');
            openDoor(seasonDoor);
            spawnBurst(NX, 1.4, z1 + 10, 0x9fdcff, 24);
            showMsg('La ronde des saisons s\'achève : les racines s\'écartent.', 4);
          } else showMsg('La sève frémit... une autre saison doit suivre.', 2);
        } else {
          seasonProgress = 0;
          showMsg('La ronde se brise : ce n\'était pas la bonne saison.', 2.5);
        }
      });
    });
  }
  rEnemy(NX - 5, z1 + 4, 0, [[NX - 7, z1], [NX - 2, z1 + 6]], { type: 'wraith', lvl: 13 });
  rEnemy(NX + 5, z1 - 4, 0, [[NX + 2, z1 - 6], [NX + 7, z1]], { type: 'caster', lvl: 13 });

  /* ---- épreuve 2 : LE RYTHME DE LA SÈVE (z 30..50) — réflexe, même
     principe que le rayon tournant de l'Aqueduc Colossal, réemployé ici
     avec un thème distinct (la sève qui pulse plutôt que le vent) ---- */
  const z2 = NZ + 40;
  mkBox(18, 1, 20, NX, -1, z2, 'stoneD');
  mkBox(0.7, 4.4, 20, NX - 9, 0, z2, 'trunk'); mkBox(0.7, 4.4, 20, NX + 9, 0, z2, 'trunk');
  const rhythmDoor = mkDoor(3, 4.4, 0.7, NX, 0, z2 + 10, 'trunk');
  const rhythmDone = flag('sanctuaire_ancien', 'rhythm');
  if (rhythmDone) presetOpen(rhythmDoor);
  else {
    mkBox(7.5, 4.4, 0.7, NX - 5.25, 0, z2 + 10, 'trunk');
    mkBox(7.5, 4.4, 0.7, NX + 5.25, 0, z2 + 10, 'trunk');
    addInter(NX, 0, z2 - 8, 2.8, 'Lire l\'inscription du rythme', () => {
      showMsg('« La sève bat comme un cœur : frappez les trois racines quand la lumière les visite, ni trop tôt, ni trop tard. »', 5);
    });
    const pulse = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 3.4), new THREE.MeshBasicMaterial({ color: 0x9fffc0 }));
    pulse.position.set(NX, 1.2, z1 + 20);
    pulse.add(glow(0x9fffc0, 1.4, 0.4));
    S.scene.add(pulse); spinners.push(pulse);
    const caught = [false, false, false];
    [0, Math.PI * 2 / 3, Math.PI * 4 / 3].forEach((ang, i) => {
      const gx = NX + Math.sin(ang) * 3.2, gz = (z1 + 20) + Math.cos(ang) * 3.2;
      const root = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0x2a4a2a }));
      root.position.set(gx, 1.2, gz); S.scene.add(root);
      addInter(gx, 0, gz, 1.8, 'Frapper la racine au bon rythme', () => {
        const cur = ((pulse.rotation.y % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        let diff = Math.abs(cur - ang); if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 0.35) {
          if (!caught[i]) { caught[i] = true; root.material.color.setHex(0x4ae08a); spawnBurst(gx, 1.2, gz, 0x9fffc0, 10); }
          if (caught.every(Boolean)) {
            setFlag('sanctuaire_ancien', 'rhythm');
            openDoor(rhythmDoor);
            spawnBurst(NX, 1.4, z2 + 10, 0x9fdcff, 24);
            showMsg('Les trois racines battent enfin ensemble : le passage s\'ouvre.', 4);
          } else showMsg('La racine s\'éveille ! Il en reste ' + (3 - caught.filter(Boolean).length) + '.', 2);
        } else showMsg('Trop tôt, ou trop tard : le rythme n\'y est pas encore.', 1.6);
      });
    });
  }
  rEnemy(NX, z2 - 4, 0, [[NX - 4, z2 - 6], [NX + 4, z2 - 2]], { type: 'seraph', lvl: 14 });

  /* ---- épreuve 3 : LE GARDIEN DE RACINE + la relique (z 50..65) ---- */
  const z3 = NZ + 58;
  mkBox(16, 1, 16, NX, -1, z3, 'stoneD');
  mkBox(0.7, 4.4, 16, NX - 8, 0, z3, 'trunk'); mkBox(0.7, 4.4, 16, NX + 8, 0, z3, 'trunk');
  mkBox(16, 4.4, 0.7, NX, 0, z3 - 8, 'trunk', false);
  torch(NX - 6, 0, z3 - 4, 0xff8a3a, 1.2, 16); torch(NX + 6, 0, z3 + 4, 0xff8a3a, 1.2, 16);
  const relicDone = flag('sanctuaire_ancien', 'relicTaken');
  if (!relicDone) {
    const boss = mkEnemy(NX, z3 + 2, 0, [[NX - 4, z3 + 2], [NX + 4, z3 + 2]], { type: 'obsidian', lvl: 16, tag: 'guardian' });
    addInter(NX, 0, z3 - 4, 2.8, 'Une présence ancienne veille ici', () => {
      showMsg('Le Gardien de Racine ne cède qu\'au combat : la relique se mérite.', 4);
    });
    boss.onKilled = () => {
      setFlag('sanctuaire_ancien', 'guardianDown');
      showMsg('Le Gardien de Racine s\'effondre en poussière de sève : la relique n\'est plus gardée.', 4);
    };
  }
  addInter(NX, 0, z3 + 6, 2.8, relicDone ? 'Le socle est vide' : 'Recueillir la relique du Sanctuaire', it => {
    if (relicDone) { showMsg('La relique a déjà quitté ce lieu.', 2.5); return; }
    if (!flag('sanctuaire_ancien', 'guardianDown')) { showMsg('Le Gardien de Racine garde encore ce socle.', 3); return; }
    it.on = false;
    setFlag('sanctuaire_ancien', 'relicTaken');
    addGearToBag(rollEquipment('weapon', 'legendary', G.path));
    spawnBurst(NX, 1.4, z3 + 6, 0xffd97a, 32);
    showMsg('Percenuit, la première lame jamais forgée — la sève ancienne vous la confie.', 5.5);
  });
}

/* ---------------- registre des salles ---------------- */
const ROOMS = {
  hall:   { name: 'Le Grand Hall', build: buildHall,
            entry: { x: RX, y: 0.2, z: RZ + 18.5, yaw: Math.PI } },
  biblio: { name: 'La Bibliothèque', build: buildBiblio,
            entry: { x: RX + 25, y: 0.2, z: RZ, yaw: -Math.PI / 2 } },
  aile:   { name: 'L\'Aile Est', build: buildAile,
            entry: { x: RX - 25, y: 0.2, z: RZ, yaw: Math.PI / 2 } },
  trone:  { name: 'La Salle du Trône', build: buildTrone,
            entry: { x: RX, y: 0.2, z: RZ + 17.5, yaw: Math.PI } },
  cata:   { name: 'Les Catacombes', build: buildCata,
            entry: { x: RX, y: 0.2, z: RZ + 30.4, yaw: Math.PI } },

  muraille:         { name: 'La Muraille Céleste', build: buildMuraille,
                      entry: { x: PX, y: 0.2, z: -29.3, yaw: 0 } },
  val_murmures:     { name: 'Le Val des Murmures', build: buildValMurmures,
                      entry: { x: PX, y: 0.2, z: -150 - 29.3, yaw: 0 } },
  carriere_sel:     { name: 'La Carrière de Sel', build: buildCarriereSel,
                      entry: { x: PX, y: 0.2, z: -300 - 29.3, yaw: 0 } },
  canyon_lames:     { name: 'Le Canyon des Lames', build: buildCanyonLames,
                      entry: { x: PX, y: 0.2, z: -450 - 29.3, yaw: 0 } },
  aqueduc_colossal: { name: 'L\'Aqueduc Colossal', build: buildAqueducColossal,
                      entry: { x: PX, y: 15, z: -600 - 29.3, yaw: 0 } },
  foret_obsidienne: { name: 'La Forêt d\'Obsidienne', build: buildForetObsidienne,
                      entry: { x: PX, y: 0.2, z: -750 - 29.3, yaw: 0 } },
  bastion_cendres:  { name: 'Le Bastion des Cendres', build: buildBastionCendres,
                      entry: { x: PX, y: 0.2, z: -900 - 24.3, yaw: 0 } },

  sanctuaire_ancien: { name: 'Le Sanctuaire Oublié', build: buildSanctuaireAncien,
                       entry: { x: NX, y: 0.2, z: NZ - 6, yaw: 0 } }
};
/* Seuil appelé par le Sanctuaire de l'Arbre (World.js), une fois les six
   pierres éveillées avec les six dons de base. */
export function enterSanctuaireAncien() {
  gotoRoom('sanctuaire_ancien', { x: NX, y: 0.2, z: NZ - 6, yaw: 0 });
}
