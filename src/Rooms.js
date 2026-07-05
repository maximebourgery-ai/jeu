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
  tkCubes, spinners, flames, pedestals, PLATES, CAMPS, player, p2
} from './state.js';
import { A } from './Audio.js';
import { $, showMsg, withLoading } from './UI.js';
import {
  mkBox, mkCyl, mkDoor, openDoor, addInter, addPickup, torch, bivouac,
  spawnBurst, mkTkCube, pedestal, doorFlames, asciiWalls
} from './World.js';
import { matFor, glow } from './AssetManager.js';
import { mkEnemy } from './Enemies.js';
import { hurt } from './Player.js';
import { questReach } from './Quests.js';
import { saveGame } from './SaveSystem.js'; // cycle sûr : appel différé

/* Site des salles (hors du monde, à l'opposé de la Tour qui vit en x +400) */
const RX = -400, RZ = 0;

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

/* Charge une salle (SANS fondu — les enrobages avec fondu sont plus bas).
   Renvoie false si l'id est inconnu (sauvegarde d'une autre version). */
export function loadRoom(id, spawn) {
  const def = ROOMS[id];
  if (!def) return false;
  if (S.roomId) unloadRoom();
  S.buildingRoom = id;
  enemySeq = 0;
  beginBuild();
  try { def.build(); } finally { endBuild(); S.buildingRoom = null; }
  setFlag(id, 'visited'); // les prochaines visites seront moins peuplées
  S.roomId = id;
  const e = spawn || def.entry;
  player.pos.set(e.x, e.y, e.z); player.vel.set(0, 0, 0);
  if (S.COOP && p2.pos) { p2.pos.set(e.x + 1.3, e.y, e.z + 0.8); p2.vel.set(0, 0, 0); }
  G.checkpoint = { x: e.x, y: e.y, z: e.z };
  if (e.yaw !== undefined) S.yaw = e.yaw;
  S.graceT = Math.max(S.graceT, 4.5); // le temps de se repérer avant l'aggro
  return true;
}

/* ---------------- transitions AVEC écran de chargement ---------------- */
function gotoRoom(id, spawn) {
  withLoading(ROOMS[id].name, () => {
    loadRoom(id, spawn);
    saveGame(true); // chaque écran de chargement vaut point de reprise
  });
}
function exitToWorld(title, x, y, z, yaw, msg) {
  withLoading(title, () => {
    unloadRoom();
    player.pos.set(x, y, z); player.vel.set(0, 0, 0);
    if (S.COOP && p2.pos) { p2.pos.set(x + 1.3, y, z + 0.8); p2.vel.set(0, 0, 0); }
    G.checkpoint = { x, y, z };
    if (yaw !== undefined) S.yaw = yaw;
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
            entry: { x: RX, y: 0.2, z: RZ + 30.4, yaw: Math.PI } }
};
