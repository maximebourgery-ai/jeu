/* ================================================================
   SAUVEGARDE LOCALE (localStorage)
   Enregistre : stats, ressources, sorts, quête, position, état du
   monde (portes, ennemis, objets ramassés, blocs runiques).
   Auto-sauvegarde toutes les 25 s + bouton dans le menu pause.
   Clé et format identiques à la v6 d'origine (ombreciel_save_v6).
   ================================================================ */
import { G, S, SAVE_KEY, player, tut, pickups, enemies, doors, inter, tkCubes, pedestals, spinners, applyPath } from './state.js';
import { showMsg, buildPowersUI, refreshPowers } from './UI.js';
import { openDoor, syncCube } from './World.js';
import { refreshPlayerVisual, addWingsToPlayer } from './Player.js';
import { applyQuest } from './Quests.js';

export function saveGame(silent) {
  if (!G.started || G.over) return;
  try {
    const s = { v: 6, path: G.path, hp: G.hp, maxHp: G.maxHp, mana: G.mana,
      powers: G.powers, sel: G.sel,
      crystals: G.crystals, goldKey: G.goldKey, items: G.items,
      herbs: G.herbs, shadows: G.shadows, orbes: G.orbes,
      hasWings: G.hasWings, upgrades: G.upgrades, checkpoint: G.checkpoint,
      xp: G.xp, level: G.level, sp: G.sp, nodes: G.nodes, maxMana: G.maxMana,
      questI: S.questI, tut: Object.assign({}, tut),
      px: player.pos.x, py: player.pos.y, pz: player.pos.z, yaw: S.yaw, pitch: S.pitch,
      pickups: pickups.slice(0, S.BASE_PICKUPS).map(p => p.taken ? 1 : 0),
      enemies: enemies.slice(0, S.STATIC_ENEMIES).map(e => e.dead ? 1 : 0),
      doors: doors.map(d => d.open ? 1 : 0),
      inter: inter.map(i => i.on ? 1 : 0),
      tk: tkCubes.map(c => [+c.mesh.position.x.toFixed(2), +c.mesh.position.y.toFixed(2), +c.mesh.position.z.toFixed(2)])
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
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
  G.hasWings = !!s.hasWings; Object.assign(G.upgrades, s.upgrades || {});
  G.xp = s.xp || 0; G.level = s.level || 1; G.sp = s.sp || 0;
  G.nodes = s.nodes || {};
  refreshPlayerVisual();
  G.maxMana = s.maxMana || (100 + (G.nodes.g_wis ? 40 : 0));
  G.mana = Math.min(G.mana, G.maxMana);
  if (s.checkpoint) G.checkpoint = s.checkpoint;
  (s.pickups || []).forEach((t, i) => { const p = pickups[i]; if (t && p && !p.taken) { p.taken = true; S.scene.remove(p.mesh); } });
  (s.enemies || []).forEach((d, i) => { const e = enemies[i]; if (d && e && !e.dead) { e.dead = true; S.scene.remove(e.g); } });
  (s.doors || []).forEach((o, i) => { if (o && doors[i]) openDoor(doors[i]); });
  (s.inter || []).forEach((o, i) => { if (inter[i]) inter[i].on = !!o; });
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
  if (G.hasWings) addWingsToPlayer();
  buildPowersUI(); refreshPowers(); applyQuest();
  return true;
}
