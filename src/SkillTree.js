/* ---------------- XP, NIVEAUX & ARBRE DES POUVOIRS ---------------- */
import { G, S, IS_TOUCH, PATHS, TREE_COMMON, TREES, player } from './state.js';
import { A } from './Audio.js';
import { $, showMsg } from './UI.js';
import { spawnBurst } from './World.js';
import { lockPointer } from './Controls.js';
import { guide } from './Quests.js';

export function xpNeed(l) { return 40 + (l - 1) * 45 + (l - 1) * (l - 1) * 10; }
export function gainXP(n) {
  G.xp += n;
  let up = false;
  while (G.xp >= xpNeed(G.level)) {
    G.xp -= xpNeed(G.level); G.level++; G.sp++; up = true;
    G.maxHp += 8; G.maxMana += 6;
    G.hp = Math.min(G.maxHp, G.hp + Math.round(G.maxHp * 0.4));
    G.mana = G.maxMana;
  }
  if (up) {
    A.power();
    spawnBurst(player.pos.x, player.pos.y + 1.4, player.pos.z, 0xffd97a, 26);
    showMsg('✧ NIVEAU ' + G.level + ' ! +1 point de pouvoir — K (ou ✥) : arbre des pouvoirs.', 4);
    guide('tree', [
      'NIVEAU SUPÉRIEUR ✧ — terrasser des ombres rapporte de l\'expérience (barre dorée). Chaque niveau vous rend +8 PV max, +6 PM max... et 1 POINT DE POUVOIR.',
      'Ouvrez l\'ARBRE DES POUVOIRS avec K (ou ✥ sur mobile) : le jeu se met en pause. Chaque point achète un nœud — dégâts, zone, vitesse, vol de vie... Trois branches propres à votre voie, plus une branche commune (Vitalité, Sagesse, Célérité).',
      'Les nœuds encadrés d\'or sont achetables maintenant ; les grisés demandent un niveau plus haut ou le nœud précédent de la même branche. À ne pas confondre avec les ORBES du sac (Tab) : les points de pouvoir viennent des niveaux, les orbes viennent des essences d\'ombre — deux chemins de progression différents.'
    ]);
    if (G.treeOpen) buildTreeUI();
  }
}
export function hasN(id) { return !!G.nodes[id]; }
export function coolMul() {
  let m = hasN('g_haste') ? 0.75 : 1;
  if (hasN('a_shadow')) m *= 0.7;
  return m;
}
/* Statistiques d'attaque effectives de la voie, dérivées des nœuds acquis */
export function classAtk(path) {
  const B = PATHS[path];
  const P = { melee: B.melee, range: B.range, dmg: B.dmg, pSpeed: B.pSpeed, path: path };
  if (path === 'mage') {
    if (hasN('m_power')) P.dmg = Math.round(P.dmg * 1.6);
    if (hasN('m_pierce')) { P.pierce = true; P.pSpeed *= 1.35; }
    if (hasN('m_chain')) P.chain = hasN('m_storm') ? 4 : 2;
    if (hasN('m_storm')) P.stun = 1;
    if (hasN('m_aoe')) P.aoe = true;
    if (hasN('m_cata')) { P.aoeR = 5; P.burn = true; }
    if (hasN('m_ascend')) P.dmg = Math.round(P.dmg * 1.25);
  } else if (path === 'warrior') {
    if (hasN('w_might')) { P.dmg = Math.round(P.dmg * 1.7); P.lifesteal = 0.15; }
    if (hasN('w_exec')) P.exec = 0.3;
    if (hasN('w_shock')) P.shock = hasN('w_quake') ? 8 : 5;
    if (hasN('w_quake')) P.quake = true;
    if (hasN('w_combo')) P.combo = true;
    if (hasN('w_titan')) P.dmg = Math.round(P.dmg * 1.15);
  } else if (path === 'assassin') {
    if (hasN('a_range')) { P.sniper = true; P.pSpeed *= 1.5; }
    if (hasN('a_fatal')) P.fatal = true;
    P.count = hasN('a_fan') ? 5 : (hasN('a_twin') ? 2 : 1);
    if (hasN('a_poison')) P.poison = true;
    P.backstab = true; // critique ×2,5 dans le dos (voir updateProjectiles)
  } else if (path === 'paladin') {
    if (hasN('p_might')) P.dmg = Math.round(P.dmg * 1.55);
    if (hasN('p_smite')) P.shock = 6;      // onde de lumière (réutilise le pattern w_shock)
    if (hasN('p_reach')) P.range += 1.2;
    if (hasN('p_conse')) P.holyburn = true; // brûlure de lumière au contact
    if (hasN('p_avatar')) P.dmg = Math.round(P.dmg * 1.15);
  }
  if (G.upgrades.boltAoE) P.aoe = true; // Transcendance (artisanat) : compatible
  // Aura du Premier Foyer (Observatoire de l'Aube) : +15 % de dégâts, toutes voies
  if (G.tower && G.tower.aura) P.dmg = Math.round(P.dmg * 1.15);
  // Sceaux du Cœur de nuit (sac) : +10 % de dégâts permanents chacun, max 3
  if (G.nightSeals) P.dmg = Math.round(P.dmg * (1 + 0.1 * G.nightSeals));
  return P;
}
export function nodeById(id) {
  const all = [TREE_COMMON].concat(TREES[G.path] || []);
  for (const b of all) for (const n of b.nodes) if (n.id === id) return n;
  return null;
}
export function buyNode(id) {
  const n = nodeById(id);
  if (!n || G.nodes[id]) return;
  if (G.level < n.req) { showMsg('Niveau ' + n.req + ' requis pour ce pouvoir.', 1.8); return; }
  if (n.needs && !G.nodes[n.needs]) { showMsg('Apprenez d\'abord le pouvoir précédent de cette voie.', 2); return; }
  if (G.sp < 1) { showMsg('Aucun point de pouvoir. Terrassez des ombres pour gagner de l\'expérience !', 2.4); return; }
  G.sp--; G.nodes[id] = true; A.power();
  if (id === 'g_vit') { G.maxHp += 40; G.hp = Math.min(G.maxHp, G.hp + 40); }
  if (id === 'g_wis') { G.maxMana += 40; G.mana = G.maxMana; }
  if (id === 'w_titan') { G.maxHp += 30; G.hp = Math.min(G.maxHp, G.hp + 30); }
  if (id === 'p_avatar') { G.maxHp += 40; G.hp = Math.min(G.maxHp, G.hp + 40); }
  G.items.push('Pouvoir — ' + n.name);
  spawnBurst(player.pos.x, player.pos.y + 1.4, player.pos.z, 0xffd97a, 20);
  showMsg('✧ ' + n.name + ' appris !', 2.5);
  buildTreeUI();
}
export function buildTreeUI() {
  const t = $('tree'); if (!t) return;
  const branches = [TREE_COMMON].concat(TREES[G.path] || []);
  let h = '<h3>ARBRE DES POUVOIRS — ' + PATHS[G.path].name.toUpperCase() + '</h3>';
  h += '<div id="treepts">Niveau <b>' + G.level + '</b> · Points de pouvoir : <b>' + G.sp + '</b> · XP ' + Math.round(G.xp) + ' / ' + xpNeed(G.level) + '</div>';
  for (const b of branches) {
    h += '<div class="tbranch"><div class="bt">' + b.branch + '</div><div class="tnodes">';
    for (const n of b.nodes) {
      const owned = !!G.nodes[n.id];
      const locked = !owned && (G.level < n.req || (n.needs && !G.nodes[n.needs]));
      const buyable = !owned && !locked && G.sp > 0;
      h += '<div class="tnode ' + (owned ? 'owned' : locked ? 'locked' : (buyable ? 'buyable' : '')) + '" data-node="' + n.id + '">'
        + '<div class="tn">' + n.icon + ' ' + n.name + (owned ? ' ✓' : '') + '</div>'
        + '<div class="td">' + n.desc + '</div>'
        + '<div class="tr">' + (owned ? 'Acquis' : ('Niv. ' + n.req + (n.needs ? ' · voie liée' : '') + ' · 1 point')) + '</div></div>';
    }
    h += '</div></div>';
  }
  h += '<button id="treeclose">Fermer (K)</button>';
  t.innerHTML = h;
  t.querySelectorAll('.tnode').forEach(el => el.addEventListener('click', () => buyNode(el.dataset.node)));
  const bc = t.querySelector('#treeclose');
  if (bc) bc.addEventListener('click', toggleTree);
}
export function toggleTree() {
  if (!G.started || G.over || G.dialog) return;
  G.treeOpen = !G.treeOpen;
  if (G.treeOpen) {
    buildTreeUI();
    if (document.exitPointerLock) document.exitPointerLock();
  } else if (!IS_TOUCH && !G.paused) {
    lockPointer();
  }
  $('tree').classList.toggle('hidden', !G.treeOpen);
}
export function updateBuffs(dt) {
  if (G.furyT > 0) G.furyT -= dt;
  if (G.hasteT > 0) G.hasteT -= dt;
  if (G.buffSpeedT > 0) G.buffSpeedT -= dt; // Élixir du Traqueur (sac)
  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.comboN = 0; }
}
