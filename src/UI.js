/* ---------------- UI / HUD ---------------- */
import * as THREE from 'three';
import { G, S, PATHS, POWERS, p2, enemies, flames, spinners } from './state.js';
import { xpNeed } from './SkillTree.js';
import { nearInter } from './World.js';

export const $ = id => document.getElementById(id);
export function showMsg(t, dur) { $('msg').textContent = t; $('msg').style.opacity = 1; G.msgT = dur || 3; }

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
