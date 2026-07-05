/* ---------------- XP, NIVEAUX & ARBRE DES POUVOIRS ---------------- */
import { G, S, IS_TOUCH, PATHS, TREE_COMMON, TREES, POWERS, PUPG, player } from './state.js';
import { A } from './Audio.js';
import { $, showMsg } from './UI.js';
import { spawnBurst } from './World.js';
import { lockPointer } from './Controls.js';
import { guide } from './Quests.js';

/* Courbe d'XP durcie (retour joueur : on montait trop vite, full arts dès le
   tutoriel). ~+50 % au début, davantage ensuite — chaque niveau se mérite. */
export function xpNeed(l) { return 60 + (l - 1) * 70 + (l - 1) * (l - 1) * 16; }
export function gainXP(n) {
  G.xp += n;
  let up = false;
  while (G.xp >= xpNeed(G.level)) {
    G.xp -= xpNeed(G.level); G.level++; G.sp++; up = true;
    G.shards++; // Forge des Arts : 1 Éclat de puissance par niveau gagné
    G.maxHp += 8; G.maxMana += 6;
    G.hp = Math.min(G.maxHp, G.hp + Math.round(G.maxHp * 0.4));
    G.mana = G.maxMana;
  }
  if (up) {
    A.power();
    spawnBurst(player.pos.x, player.pos.y + 1.4, player.pos.z, 0xffd97a, 26);
    showMsg('✧ NIVEAU ' + G.level + ' ! +1 point de pouvoir, +1 Éclat de puissance — K (ou ✥) : arbre & Forge des Arts.', 4);
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
  // Faveur des Étoiles (les 3 Éclats d'Aube étoilée secrets) : +15 % de dégâts
  if (G.upgrades.starBoost) P.dmg = Math.round(P.dmg * 1.15);
  // Aura du Premier Foyer (Observatoire de l'Aube) : +15 % de dégâts, toutes voies
  if (G.tower && G.tower.aura) P.dmg = Math.round(P.dmg * 1.15);
  // Couronne de l'Aube (Cœur de la Nuit sans lune, v8) : +10 % de plus, toutes voies
  if (G.tower && G.tower.crown) P.dmg = Math.round(P.dmg * 1.1);
  // Sceaux du Cœur de nuit (sac) : +10 % de dégâts permanents chacun, max 3
  if (G.nightSeals) P.dmg = Math.round(P.dmg * (1 + 0.1 * G.nightSeals));
  // Éveils d'obscurité (sac, 2 orbes chacun) : +6 % de dégâts chacun, max 5 —
  // la voie de puissance intermédiaire, avant les grandes transcendances
  if (G.orbAwaken) P.dmg = Math.round(P.dmg * (1 + 0.06 * G.orbAwaken));
  // Forge des Arts : chaque rang forgé de l'attaque principale = +10 % de dégâts
  P.dmg = Math.round(P.dmg * (1 + 0.10 * (G.pupg.bolt || 0)));
  return P;
}
/* ---- Forge des Arts : dépenser un Éclat de puissance pour forger un rang ---- */
export function upgradePower(id) {
  const U = PUPG[id]; if (!U) return;
  if (!G.powers[id]) { showMsg('Cet art sommeille encore quelque part dans Ombreciel...', 2.2); return; }
  const cur = G.pupg[id] || 0;
  if (cur >= U.max) return;
  if (G.shards < 1) { showMsg('Aucun Éclat de puissance. Gagnez un niveau pour en forger un.', 2.4); return; }
  G.shards--; G.pupg[id] = cur + 1; A.power();
  const pw = POWERS.find(p => p.id === id);
  spawnBurst(player.pos.x, player.pos.y + 1.4, player.pos.z, 0x8feaff, 18);
  showMsg('✧ ' + (id === 'bolt' ? PATHS[G.path].boltName : pw.name) + ' — rang ' + (cur + 1) + ' forgé !', 2.4);
  buildTreeUI();
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
  /* ---- Forge des Arts : l'AUTRE voie de puissance (Éclats de niveau) ---- */
  h += '<div class="tbranch"><div class="bt">⚒ FORGE DES ARTS — Éclats de puissance : <b>'
    + G.shards + '</b> <small>(1 Éclat par niveau gagné · 1 Éclat par rang)</small></div><div class="tnodes">';
  for (const id in PUPG) {
    const U = PUPG[id], pw = POWERS.find(p => p.id === id);
    const cur = G.pupg[id] || 0, owned = !!G.powers[id], maxed = cur >= U.max;
    const stars = '◆'.repeat(cur) + '◇'.repeat(U.max - cur);
    h += '<div class="tnode ' + (!owned ? 'locked' : maxed ? 'owned' : (G.shards > 0 ? 'buyable' : '')) + '" data-upg="' + id + '">'
      + '<div class="tn">' + pw.icon + ' ' + (id === 'bolt' ? PATHS[G.path].boltName : pw.name)
      + ' <span class="stars">' + stars + '</span></div>'
      + '<div class="td">' + U.desc + '</div>'
      + '<div class="tr">' + (!owned ? 'Art non encore appris' : maxed ? 'Rang maximal atteint' : 'Forger le rang ' + (cur + 1) + ' · 1 Éclat') + '</div></div>';
  }
  h += '</div></div>';
  h += '<button id="treeclose">Fermer (K)</button>';
  t.innerHTML = h;
  t.querySelectorAll('.tnode[data-node]').forEach(el => el.addEventListener('click', () => buyNode(el.dataset.node)));
  t.querySelectorAll('.tnode[data-upg]').forEach(el => el.addEventListener('click', () => upgradePower(el.dataset.upg)));
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
  // fenêtre de l'enchaînement universel : 2,2 s sans coup au but = combo brisé
  if (G.comboHitT > 0) { G.comboHitT -= dt; if (G.comboHitT <= 0) G.comboHits = 0; }
}
