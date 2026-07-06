/* ================================================================
   SAUVEGARDE LOCALE (localStorage)
   Enregistre : stats, ressources, sorts, quête, position, état du
   monde (portes, ennemis, objets ramassés, blocs runiques).
   Auto-sauvegarde toutes les 25 s + bouton dans le menu pause.
   Clé v8 (ombreciel_save_v8) : les index d'objets/interactions ont changé.
   ================================================================ */
import { G, S, SAVE_KEY, player, tut, pickups, enemies, doors, inter, tkCubes, pedestals, spinners, PLATES, zoneSeen, applyPath } from './state.js';
import { showMsg, buildPowersUI, refreshPowers } from './UI.js';
import { openDoor, syncCube, runRestores } from './World.js';
import { refreshPlayerVisual, addWingsToPlayer } from './Player.js';
import { applyQuest } from './Quests.js';
import { syncRoomState, loadRoom } from './Rooms.js'; // cycle sûr : appels différés

export function saveGame(silent) {
  if (!G.started || G.over) return;
  try {
    /* Dans la Tour (palier instancié), la position enregistrée est ramenée à
       la terrasse : au chargement, le monde existe mais pas l'instance —
       le joueur repart du portail, ses clefs/raccourcis (G.tower) en poche.
       Dans une SALLE instanciée (Rooms.js) en revanche, on sauvegarde la
       salle (s.room) et la position réelle : le chargement rebâtit la salle
       et y repose le joueur exactement où il était. */
    syncRoomState(); // recopie objets uniques ramassés + bloc runique dans G.rooms
    const inTw = S.inTower;
    const TER = { x: 58, y: 23.2, z: 46.8 };
    const s = { v: 8, path: G.path, hp: G.hp, maxHp: G.maxHp, mana: G.mana,
      powers: G.powers, sel: G.sel,
      crystals: G.crystals, goldKey: G.goldKey, items: G.items,
      herbs: G.herbs, shadows: G.shadows, orbes: G.orbes,
      stars: G.stars, // Éclats d'Aube étoilée (secrets v7.4)
      /* v8 : butin par archétype, consommables du sac, boosts forgés, guide */
      feathers: G.feathers, bones: G.bones, threads: G.threads,
      nightHearts: G.nightHearts, potions: G.potions,
      forgeHp: G.forgeHp, forgeMana: G.forgeMana, nightSeals: G.nightSeals, orbAwaken: G.orbAwaken,
      seen: G.seen,
      hasWings: G.hasWings, upgrades: G.upgrades,
      checkpoint: inTw ? TER : G.checkpoint,
      /* v7.1 : l'avancée de la Tour (clefs de palier, Maîtres d'Étage vaincus,
         raccourcis, Aura) et la matrice des Bivouacs découverts */
      tower: G.tower, camps: G.camps, campHeal: G.campHeal, zoneSeen: Object.assign({}, zoneSeen),
      /* v8 : salles instanciées — flags de progression, objets uniques
         ramassés, bloc runique (G.rooms) + salle où le joueur se trouve */
      rooms: G.rooms, room: S.roomId,
      hour: G.hour, // horloge d'Ombreciel (cycle jour/nuit)
      xp: G.xp, level: G.level, sp: G.sp, nodes: G.nodes, maxMana: G.maxMana,
      shards: G.shards, pupg: G.pupg, // Forge des Arts (Éclats + rangs forgés)
      questI: S.questI, tut: Object.assign({}, tut),
      px: inTw ? TER.x : player.pos.x, py: inTw ? TER.y : player.pos.y, pz: inTw ? TER.z : player.pos.z,
      yaw: S.yaw, pitch: S.pitch,
      pickups: pickups.slice(0, S.BASE_PICKUPS).map(p => p.taken ? 1 : 0),
      enemies: enemies.slice(0, S.STATIC_ENEMIES).map(e => e.dead ? 1 : 0),
      doors: doors.map(d => d.open ? 1 : 0),
      inter: inter.map(i => i.on ? 1 : 0),
      tk: tkCubes.map(c => [+c.mesh.position.x.toFixed(2), +c.mesh.position.y.toFixed(2), +c.mesh.position.z.toFixed(2)])
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    /* chaque jalon du v8 (clefs, PNJ, pont, boss, Couronne) force une
       sauvegarde : on en profite pour rafraîchir la ligne d'objectif */
    applyQuest();
    if (!silent) showMsg('💾 Partie sauvegardée dans ce navigateur.', 2.5);
  } catch (e) {
    if (!silent) showMsg('Sauvegarde impossible : stockage local indisponible dans ce navigateur.', 3);
  }
}
export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}
export function loadGame() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
  if (!s) return false;
  applyPath(s.path || 'mage');
  document.querySelectorAll('.classbtn').forEach(b => b.classList.toggle('sel', b.dataset.path === (s.path || 'mage')));
  G.hp = s.hp; G.maxHp = s.maxHp; G.mana = s.mana;
  Object.assign(G.powers, s.powers || {}); G.sel = s.sel || 'bolt';
  G.crystals = s.crystals || 0; G.goldKey = !!s.goldKey;
  if (Array.isArray(s.items)) G.items = s.items;
  G.herbs = s.herbs || 0; G.shadows = s.shadows || 0; G.orbes = s.orbes || 0;
  G.stars = s.stars || 0;
  G.feathers = s.feathers || 0; G.bones = s.bones || 0; G.threads = s.threads || 0;
  G.nightHearts = s.nightHearts || 0; G.potions = s.potions || 0;
  G.forgeHp = s.forgeHp || 0; G.forgeMana = s.forgeMana || 0; G.nightSeals = s.nightSeals || 0;
  G.orbAwaken = s.orbAwaken || 0;
  G.seen = s.seen || {};
  G.hasWings = !!s.hasWings; Object.assign(G.upgrades, s.upgrades || {});
  // v7.1 : Ascension de la Tour + bivouacs découverts (fusion tolérante)
  if (s.tower) {
    Object.assign(G.tower.keys, s.tower.keys || {});
    Object.assign(G.tower.bosses, s.tower.bosses || {});
    Object.assign(G.tower.shortcuts, s.tower.shortcuts || {});
    G.tower.aura = !!s.tower.aura;
    // v8 — l'Outre-Ciel : PNJ rencontrés, quête d'Orin, pont, Couronne
    Object.assign(G.tower.met, s.tower.met || {});
    G.tower.shards = s.tower.shards || 0;
    if (Array.isArray(s.tower.shardsTaken)) G.tower.shardsTaken = s.tower.shardsTaken;
    G.tower.bridge = !!s.tower.bridge;
    G.tower.crown = !!s.tower.crown;
  }
  G.camps = s.camps || {};
  G.campHeal = s.campHeal || {}; // v8.4 : braises des bivouacs (anti-camping)
  Object.assign(zoneSeen, s.zoneSeen || {}); // noms de zones déjà révélés sur la carte
  G.rooms = s.rooms || {}; // v8 : progression des salles instanciées
  G.hour = (typeof s.hour === 'number') ? s.hour : 9; // anciennes sauvegardes : reprise au matin
  G.xp = s.xp || 0; G.level = s.level || 1; G.sp = s.sp || 0;
  G.nodes = s.nodes || {};
  // Forge des Arts — anciennes sauvegardes : 1 Éclat rétroactif par niveau gagné
  G.shards = (typeof s.shards === 'number') ? s.shards : Math.max(0, G.level - 1);
  Object.assign(G.pupg, s.pupg || {});
  refreshPlayerVisual();
  G.maxMana = s.maxMana || (100 + (G.nodes.g_wis ? 40 : 0));
  G.mana = Math.min(G.mana, G.maxMana);
  if (s.checkpoint) G.checkpoint = s.checkpoint;
  (s.pickups || []).forEach((t, i) => { const p = pickups[i]; if (t && p && !p.taken) { p.taken = true; S.scene.remove(p.mesh); } });
  (s.enemies || []).forEach((d, i) => { const e = enemies[i]; if (d && e && !e.dead) { e.dead = true; S.scene.remove(e.g); } });
  (s.doors || []).forEach((o, i) => { if (o && doors[i]) openDoor(doors[i]); });
  // plaques runiques : si la porte associée est ouverte, la plaque était chargée
  PLATES.forEach(p => { if (p.door.open) { p.active = true; p.glow.material.color.setHex(0x4ae08a); } });
  (s.inter || []).forEach((o, i) => { if (inter[i]) inter[i].on = !!o; });
  /* énigmes v7.4 (feux des morts, offrandes, arbre aux lucioles...) :
     ré-applique visuels et objets révélés d'après les flags `inter` */
  runRestores();
  pedestals.forEach(pd => {
    if (G.powers[pd.powerId] && pd.cry.parent) {
      S.scene.remove(pd.cry);
      const i = spinners.indexOf(pd.cry);
      if (i >= 0) spinners.splice(i, 1);
    }
  });
  (s.tk || []).forEach((p, i) => { const c = tkCubes[i]; if (c && !c.held) { c.mesh.position.set(p[0], p[1], p[2]); c.vel = 0; syncCube(c); } });
  S.questI = (typeof s.questI === 'number') ? s.questI : 0;
  Object.assign(tut, s.tut || {});
  player.pos.set(s.px, s.py, s.pz); player.vel.set(0, 0, 0);
  S.yaw = s.yaw || 0; S.pitch = (typeof s.pitch === 'number') ? s.pitch : -0.22;
  /* v8 : sauvegarde prise dans une salle instanciée → on la rebâtit et on y
     repose le joueur exactement où il était (loadRoom pose l'entrée par
     défaut, la position exacte est restaurée juste après). */
  if (s.room) {
    if (loadRoom(s.room)) {
      player.pos.set(s.px, s.py, s.pz); player.vel.set(0, 0, 0);
    } else {
      // salle inconnue (sauvegarde d'une autre version) : repli à la fontaine
      player.pos.set(0, 0.2, 60);
      G.checkpoint = { x: 0, y: 0.2, z: 60 };
    }
  }
  if (G.hasWings) addWingsToPlayer();
  buildPowersUI(); refreshPowers(); applyQuest();
  return true;
}
