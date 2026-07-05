/* ---------------- UI / HUD ---------------- */
import * as THREE from 'three';
import { G, S, PATHS, POWERS, CAMPS, player, p2, enemies, flames, spinners, settings } from './state.js';
import { A } from './Audio.js';
import { xpNeed } from './SkillTree.js';
import { nearInter, spawnBurst } from './World.js';
import { lockPointer } from './Controls.js'; // cycle sûr : appel différé
import { leaveTower } from './Tower.js';     // cycle sûr : appel différé

export const $ = id => document.getElementById(id);
export function showMsg(t, dur) { $('msg').textContent = t; $('msg').style.opacity = 1; G.msgT = dur || 3; }

/* ---------------- VOYAGE RAPIDE — MATRICE DES BIVOUACS ----------------
   Ouverte au repos à un feu de bivouac. Fast-travel INTERDIT si le joueur
   est en combat (isPlayerInCombat ⇔ S.combatT > 0, voir Enemies.js). */
export function openTravel(fromCamp) {
  const dests = CAMPS.filter(c => c.travel && G.camps[c.id] && (!fromCamp || c.id !== fromCamp.id));
  if (!dests.length) return; // premier feu découvert : rien où voyager encore
  if (S.combatT > 0) { showMsg('Les ombres vous traquent : impossible de voyager en plein combat.', 3); return; }
  G.travelOpen = true;
  const ul = $('travellist'); ul.innerHTML = '';
  for (const c of dests) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.textContent = '🔥 ' + c.label;
    b.addEventListener('click', () => travelTo(c));
    li.appendChild(b); ul.appendChild(li);
  }
  $('travel').classList.remove('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
}
export function closeTravel() {
  if (!G.travelOpen) return;
  G.travelOpen = false;
  $('travel').classList.add('hidden');
  if (!G.paused && !G.over) lockPointer();
}
export function travelTo(c) {
  if (S.combatT > 0) { showMsg('Les ombres vous traquent : impossible de voyager en plein combat.', 3); return; }
  closeTravel();
  if (S.inTower) leaveTower(true); // quitter l'instance de la Tour avant le saut
  player.pos.set(c.x, c.y, c.z); player.vel.set(0, 0, 0);
  if (S.COOP && p2.pos) { p2.pos.set(c.x + 1.5, c.y, c.z + 0.8); p2.vel.set(0, 0, 0); }
  G.checkpoint = { x: c.x, y: c.y, z: c.z };
  A.dash();
  spawnBurst(c.x, c.y + 1, c.z, 0xffc06a, 20);
  showMsg('Le feu appelle le feu... Vous rouvrez les yeux près du bivouac — ' + c.label + '.', 3.5);
}

export function buildPowersUI() {
  const c = $('powers'); c.innerHTML = '';
  POWERS.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'pw'; d.id = 'pw-' + p.id;
    const costTxt = p.cost > 0 ? (p.cost + ' PM') : '—';
    d.innerHTML = '<div class="nm">' + p.name + ' · ' + costTxt + '</div><span class="ico">' + p.icon + '</span><span class="lock">🔒</span><small>' + (i + 1) + '</small><div class="cd"></div>';
    c.appendChild(d);
  });
  refreshPowers();
}
export function refreshPowers() {
  POWERS.forEach(p => {
    const d = $('pw-' + p.id);
    d.classList.toggle('owned', !!G.powers[p.id]);
    d.classList.toggle('sel', G.sel === p.id);
  });
  updateTouchSlots();
}
/* Boutons de sort de la manette tactile (t-s2…t-s6) : reflètent les
   emplacements assignés dans ⚙ Réglages et restent masqués tant que le sort
   n'est pas appris — l'écran ne se remplit qu'au rythme de la progression. */
export function updateTouchSlots() {
  for (let i = 0; i < 5; i++) {
    const el = $('t-s' + (i + 2));
    if (!el) continue;
    const id = settings.slots[i];
    const pw = id && POWERS.find(p => p.id === id);
    el.classList.toggle('hidden', !(pw && G.powers[id]));
    if (pw) el.textContent = pw.icon;
  }
}
export function refreshInv() {
  const ul = $('invlist'); ul.innerHTML = '';
  const rows = [];
  rows.push('Voie : ' + PATHS[G.path].name);
  rows.push('Larmes d\'Aube : ' + G.crystals + ' / 3');
  rows.push('Herbes lunaires : ' + G.herbs + '  (H : potion, 2 herbes = +30 PV)');
  rows.push('Essences d\'ombre : ' + G.shadows + '  (O : 3 essences = 1 orbe)');
  rows.push('Orbes d\'obscurité : ' + G.orbes + '  (C : transcender)');
  if (G.goldKey) rows.push('Clef d\'or de la salle du trône');
  if (G.tower.keys.copper) rows.push('Clef de Cuivre — Ascension, Palier I');
  if (G.tower.keys.sap) rows.push('Clef de Sève — Ascension, Palier II');
  if (G.tower.keys.ether) rows.push('Clef d\'Éther — Ascension, Palier III');
  if (G.tower.aura) rows.push('Aura du Premier Foyer (+15 % dégâts, régénération)');
  POWERS.forEach(p => { if (G.powers[p.id]) rows.push('Sort — ' + p.name); });
  G.items.forEach(i => rows.push(i));
  rows.forEach(r => { const li = document.createElement('li'); li.textContent = r; ul.appendChild(li); });
}

/* ---------------- BARRES DE VIE DES ENNEMIS ---------------- */
const ebarPool = new Map();
export function updateEnemyBars() {
  const box = $('ebars');
  if (!G.started || !S.camera || !box) return;
  const seen = new Set();
  const vw = S.COOP ? innerWidth / 2 : innerWidth, vh = innerHeight;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = S.camera.position.distanceTo(e.g.position);
    if (d > 34) continue;
    const v = new THREE.Vector3(e.g.position.x, e.g.position.y + 1.05 * e.s + 0.55, e.g.position.z);
    v.project(S.camera);
    if (v.z > 1 || v.z < -1) continue;
    const sx = (v.x * 0.5 + 0.5) * vw, sy = (1 - (v.y * 0.5 + 0.5)) * vh;
    if (sx < -30 || sx > vw + 30 || sy < -30 || sy > vh + 30) continue;
    let rec = ebarPool.get(e);
    if (!rec) {
      const el = document.createElement('div'); el.className = 'ebar';
      el.innerHTML = '<div class="en"></div><div class="ef"></div>';
      box.appendChild(el);
      rec = { el, fill: el.querySelector('.ef'), name: el.querySelector('.en') };
      ebarPool.set(e, rec);
    }
    rec.el.style.left = sx + 'px'; rec.el.style.top = sy + 'px';
    rec.fill.style.width = Math.max(0, e.hp / e.maxHp * 100) + '%';
    rec.name.textContent = (e.tName || 'Ombre') + ' · Niv.' + (e.lvl || 1);
    seen.add(e);
  }
  for (const [e, rec] of ebarPool) {
    if (!seen.has(e)) { rec.el.remove(); ebarPool.delete(e); }
  }
}

/* ---------------- HUD ---------------- */
export function updateHUD(dt) {
  updateEnemyBars();
  $('hpfill').style.width = Math.max(0, G.hp / G.maxHp * 100) + '%';
  $('mpfill').style.width = Math.max(0, G.mana / G.maxMana * 100) + '%';
  $('hpnum').textContent = Math.max(0, Math.round(G.hp)) + ' / ' + G.maxHp;
  $('mpnum').textContent = Math.max(0, Math.round(G.mana)) + ' / ' + G.maxMana;
  $('xpfill').style.width = Math.min(100, G.xp / xpNeed(G.level) * 100) + '%';
  $('xpnum').textContent = Math.round(G.xp) + ' / ' + xpNeed(G.level) + ' XP';
  /* Jauge de rage : visible uniquement pour la voie Guerrier */
  const rb = $('ragebar');
  rb.classList.toggle('hidden', G.path !== 'warrior');
  if (G.path === 'warrior') {
    const full = G.rage >= G.maxRage;
    $('ragefill').style.width = Math.min(100, G.rage / G.maxRage * 100) + '%';
    $('ragenum').textContent = full ? 'FUREUR PRÊTE — frappez !' : ('Rage ' + Math.round(G.rage) + ' / ' + G.maxRage);
    rb.classList.toggle('full', full);
  }
  $('lvltxt').innerHTML = 'Niveau <b>' + G.level + '</b> — ' + PATHS[G.path].name + (G.sp > 0 ? ' · <b>' + G.sp + ' point' + (G.sp > 1 ? 's' : '') + ' de pouvoir (K / ✥)</b>' : '');
  $('crystals').textContent = '✦ ' + G.crystals + '/3  ☘' + G.herbs + '  ●' + G.shadows + '  ◉' + G.orbes;
  if (S.COOP) {
    $('hp2fill').style.width = Math.max(0, p2.hp / p2.maxHp * 100) + '%';
    $('mp2fill').style.width = Math.max(0, p2.mana / p2.maxMana * 100) + '%';
    $('hp2num').textContent = Math.max(0, Math.round(p2.hp)) + ' / ' + p2.maxHp;
    $('mp2num').textContent = Math.max(0, Math.round(p2.mana)) + ' / ' + p2.maxMana;
    const pw2 = POWERS.find(q => q.id === p2.sel);
    $('p2power').textContent = pw2 ? (p2.sel === 'bolt' ? PATHS[p2.path].boltName : pw2.name) : '';
  }
  POWERS.forEach(p => {
    const el = $('pw-' + p.id).querySelector('.cd');
    el.style.height = (G.cd[p.id] > 0 ? G.cd[p.id] / p.cool * 100 : 0) + '%';
  });
  const it = (G.started && !G.paused && !G.over && !G.dialog) ? nearInter() : null;
  $('prompt').textContent = it ? ('E — ' + it.label) : '';
  if (G.msgT > 0) {
    G.msgT -= dt;
    if (G.msgT <= 0) $('msg').style.opacity = 0;
  }
  G.vig = Math.max(0, G.vig - dt * 1.8);
  const low = G.hp <= 30 ? 0.35 : 0;
  $('vignette').style.opacity = Math.max(G.vig * 0.9, low);
  for (const f of flames) {
    const n = 0.82 + 0.3 * Math.sin(G.time * 9 + f.seed) + 0.12 * Math.sin(G.time * 23 + f.seed * 3);
    if (f.light) f.light.intensity = f.base * n; // les feux de bivouac n'ont pas de lumière (budget GPU)
    f.flame.scale.y = 0.85 + 0.3 * Math.abs(Math.sin(G.time * 7 + f.seed));
    f.halo.material.opacity = 0.35 + 0.2 * n;
  }
  for (const s of spinners) { s.rotation.y += dt * 1.6; s.rotation.x += dt * 0.5; }
  if (S.beacon && S.beacon.visible) {
    S.beacon.material.opacity = 0.1 + 0.08 * Math.sin(G.time * 2.2);
    S.beacon.rotation.y += dt * 0.4;
  }
  if (S.lumen) {
    S.lumen.position.y = 1.5 + Math.sin(G.time * 1.7) * 0.18;
    S.lumen.children[1].material.opacity = 0.6 + 0.25 * Math.sin(G.time * 3);
  }
}
