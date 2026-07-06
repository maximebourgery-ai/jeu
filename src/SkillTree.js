/* ---------------- XP, NIVEAUX & ARBRE DES POUVOIRS ----------------
   v8.7 — TOUT est devenu « par joueur » : en coop, le Joueur 2 a sa propre
   expérience, ses niveaux, ses points, ses nœuds d'arbre et ses rangs de
   Forge. Les fonctions prennent un paramètre `who` (1 = J1 par défaut,
   2 = J2) — la progression du J1 vit dans G, celle du J2 dans p2. */
import { G, S, IS_TOUCH, PATHS, TREE_COMMON, TREES, POWERS, PUPG, player, p2, equipTotals } from './state.js';
import { A } from './Audio.js';
import { $, showMsg } from './UI.js';
import { spawnBurst } from './World.js';
import { lockPointer } from './Controls.js';
import { guide } from './Quests.js';

/* Progression (xp/level/sp/nodes/pupg/shards) et corps du joueur demandé */
function progOf(who) { return who === 2 ? p2 : G; }
function plOf(who) { return who === 2 ? p2 : player; }
function pathOf(who) { return who === 2 ? p2.path : G.path; }

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
    /* v8.4 : gagner un niveau RAVIVE les braises de tous les bivouacs —
       chaque feu peut de nouveau soigner une fois (voir World.bivouac) */
    G.campHeal = {};
  }
  if (up) {
    A.power();
    spawnBurst(player.pos.x, player.pos.y + 1.4, player.pos.z, 0xffd97a, 26);
    showMsg('✧ ' + (S.COOP ? 'JOUEUR 1 — NIVEAU ' : 'NIVEAU ') + G.level + ' ! +1 point de pouvoir, +1 Éclat de puissance — K (ou ✥) : arbre & Forge des Arts.', 4);
    guide('tree', [
      'NIVEAU SUPÉRIEUR ✧ — terrasser des ombres rapporte de l\'expérience (barre dorée). Chaque niveau vous rend +8 PV max, +6 PM max... et 1 POINT DE POUVOIR.',
      'Ouvrez l\'ARBRE DES POUVOIRS avec K (ou ✥ sur mobile) : le jeu se met en pause. Chaque point achète un nœud — dégâts, zone, vitesse, vol de vie... Trois branches propres à votre voie, plus une branche commune (Vitalité, Sagesse, Célérité).',
      'Les nœuds encadrés d\'or sont achetables maintenant ; les grisés demandent un niveau plus haut ou le nœud précédent de la même branche. À ne pas confondre avec les ORBES du sac (Tab) : les points de pouvoir viennent des niveaux, les orbes viennent des essences d\'ombre — deux chemins de progression différents.'
    ]);
    if (G.treeOpen) buildTreeUI();
  }
}
/* v8.7 — expérience du JOUEUR 2 (coop) : mêmes règles que le J1, mais tout
   s'accumule dans p2 — il monte en niveau de son côté, en jouant ensemble. */
export function gainXP2(n) {
  if (!S.COOP || !p2.mesh) return;
  p2.xp += n;
  let up = false;
  while (p2.xp >= xpNeed(p2.level)) {
    p2.xp -= xpNeed(p2.level); p2.level++; p2.sp++; up = true;
    p2.shards++; // Forge des Arts : 1 Éclat de puissance par niveau gagné
    p2.maxHp += 8; p2.maxMana += 6;
    p2.hp = Math.min(p2.maxHp, p2.hp + Math.round(p2.maxHp * 0.4));
    p2.mana = p2.maxMana;
    G.campHeal = {}; // un niveau gagné ravive les braises, quel que soit le porteur
  }
  if (up) {
    A.power();
    spawnBurst(p2.pos.x, p2.pos.y + 1.4, p2.pos.z, 0xff9a6a, 26);
    showMsg('✧ JOUEUR 2 — NIVEAU ' + p2.level + ' ! +1 point de pouvoir, +1 Éclat — ✥ sur SON téléphone : SON arbre.', 4);
    if (G.treeOpen) buildTreeUI();
  }
}
export function hasN(id, who) { return !!progOf(who).nodes[id]; }
export function coolMul(who) {
  let m = hasN('g_haste', who) ? 0.75 : 1;
  if (hasN('a_shadow', who)) m *= 0.7;
  return m;
}
/* v8.4 — Multiplicateur des bonus « globaux » du porteur (Faveur des Étoiles,
   Aura, Couronne, Sceaux du Cœur de nuit, Éveils d'obscurité). L'attaque de
   base en profitait déjà via classAtk ; la Nova d'Aurore et l'Astre d'Aube
   (touches 7-8) le partagent désormais — les arts perdus grandissent AVEC le
   porteur au lieu de rester bloqués à leurs dégâts de découverte. */
export function bonusMul() {
  let m = 1;
  if (G.upgrades.starBoost) m *= 1.15;
  if (G.tower && G.tower.aura) m *= 1.15;
  if (G.tower && G.tower.crown) m *= 1.1;
  if (G.nightSeals) m *= 1 + 0.1 * G.nightSeals;
  if (G.orbAwaken) m *= 1 + 0.06 * G.orbAwaken;
  return m;
}
/* Statistiques d'attaque effectives de la voie, dérivées des nœuds acquis
   PAR CE JOUEUR (who : 1 = J1, 2 = J2 — chacun son arbre en coop).
   v9 : les dégâts de BASE de la voie s'additionnent à ceux de l'ARME
   équipée (G.equipment.weapon) AVANT les multiplicateurs de l'arbre —
   l'arme monte le plancher, l'arbre garde son rôle de multiplicateur.
   L'équipement appartient au J1 (le porteur) : le J2 n'en profite pas. */
export function classAtk(path, who) {
  const B = PATHS[path];
  const P = { melee: B.melee, range: B.range, dmg: B.dmg + (who === 2 ? 0 : (equipTotals().dmg || 0)), pSpeed: B.pSpeed, path: path };
  if (path === 'mage') {
    if (hasN('m_power', who)) P.dmg = Math.round(P.dmg * 1.6);
    if (hasN('m_pierce', who)) { P.pierce = true; P.pSpeed *= 1.35; }
    if (hasN('m_chain', who)) P.chain = hasN('m_storm', who) ? 4 : 2;
    if (hasN('m_storm', who)) P.stun = 0.5; // v8.4 : 1 s → 0,5 s + rendement décroissant
    if (hasN('m_aoe', who)) P.aoe = true;
    if (hasN('m_cata', who)) { P.aoeR = 5; P.burn = true; }
    if (hasN('m_ascend', who)) P.dmg = Math.round(P.dmg * 1.25);
  } else if (path === 'warrior') {
    if (hasN('w_might', who)) { P.dmg = Math.round(P.dmg * 1.7); P.lifesteal = 0.15; }
    if (hasN('w_exec', who)) P.exec = 0.3;
    if (hasN('w_shock', who)) P.shock = hasN('w_quake', who) ? 8 : 5;
    if (hasN('w_quake', who)) P.quake = true;
    if (hasN('w_combo', who)) P.combo = true;
    if (hasN('w_titan', who)) P.dmg = Math.round(P.dmg * 1.15);
  } else if (path === 'assassin') {
    if (hasN('a_range', who)) { P.sniper = true; P.pSpeed *= 1.5; }
    if (hasN('a_fatal', who)) P.fatal = true;
    P.count = hasN('a_fan', who) ? 5 : (hasN('a_twin', who) ? 2 : 1);
    if (hasN('a_poison', who)) P.poison = true;
    P.backstab = true; // critique ×2,5 dans le dos (voir updateProjectiles)
  } else if (path === 'paladin') {
    if (hasN('p_might', who)) P.dmg = Math.round(P.dmg * 1.55);
    if (hasN('p_smite', who)) P.shock = 6;      // onde de lumière (réutilise le pattern w_shock)
    if (hasN('p_reach', who)) P.range += 1.2;
    if (hasN('p_conse', who)) P.holyburn = true; // brûlure de lumière au contact
    if (hasN('p_avatar', who)) P.dmg = Math.round(P.dmg * 1.15);
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
  P.dmg = Math.round(P.dmg * (1 + 0.10 * (progOf(who).pupg.bolt || 0)));
  return P;
}
/* ---- Forge des Arts : dépenser un Éclat de puissance pour forger un rang ---- */
export function upgradePower(id, who) {
  const U = PUPG[id]; if (!U) return;
  const prog = progOf(who), pl = plOf(who);
  if (!G.powers[id]) { showMsg('Cet art sommeille encore quelque part dans Ombreciel...', 2.2); return; }
  const cur = prog.pupg[id] || 0;
  if (cur >= U.max) return;
  if (prog.shards < 1) { showMsg('Aucun Éclat de puissance. Gagnez un niveau pour en forger un.', 2.4); return; }
  prog.shards--; prog.pupg[id] = cur + 1; A.power();
  const pw = POWERS.find(p => p.id === id);
  spawnBurst(pl.pos.x, pl.pos.y + 1.4, pl.pos.z, 0x8feaff, 18);
  showMsg('✧ ' + (id === 'bolt' ? PATHS[pathOf(who)].boltName : pw.name) + ' — rang ' + (cur + 1) + ' forgé !', 2.4);
  buildTreeUI();
}
export function nodeById(id, who) {
  const all = [TREE_COMMON].concat(TREES[pathOf(who)] || []);
  for (const b of all) for (const n of b.nodes) if (n.id === id) return n;
  return null;
}
export function buyNode(id, who) {
  const prog = progOf(who), pl = plOf(who);
  const n = nodeById(id, who);
  if (!n || prog.nodes[id]) return;
  if (prog.level < n.req) { showMsg('Niveau ' + n.req + ' requis pour ce pouvoir.', 1.8); return; }
  if (n.needs && !prog.nodes[n.needs]) { showMsg('Apprenez d\'abord le pouvoir précédent de cette voie.', 2); return; }
  if (prog.sp < 1) { showMsg('Aucun point de pouvoir. Terrassez des ombres pour gagner de l\'expérience !', 2.4); return; }
  prog.sp--; prog.nodes[id] = true; A.power();
  /* les nœuds de stats s'appliquent au BON joueur (G pour J1, p2 pour J2) */
  const addHp = v => { prog.maxHp += v; prog.hp = Math.min(prog.maxHp, prog.hp + v); };
  if (id === 'g_vit') addHp(40);
  if (id === 'g_wis') { prog.maxMana += 40; prog.mana = prog.maxMana; }
  if (id === 'w_titan') addHp(30);
  if (id === 'p_avatar') addHp(40);
  G.items.push('Pouvoir' + (who === 2 ? ' (J2)' : '') + ' — ' + n.name);
  spawnBurst(pl.pos.x, pl.pos.y + 1.4, pl.pos.z, 0xffd97a, 20);
  showMsg('✧ ' + n.name + ' appris' + (who === 2 ? ' (Joueur 2)' : '') + ' !', 2.5);
  buildTreeUI();
}
/* L'arbre appartient au joueur qui l'a ouvert (treeFor) : depuis le clavier
   ou l'écran c'est le J1, depuis le téléphone du J2 (✥) c'est le J2 — chacun
   dépense SES points et SES Éclats. */
let treeFor = 1;
export function buildTreeUI() {
  const t = $('tree'); if (!t) return;
  const who = (treeFor === 2 && S.COOP && p2.mesh) ? 2 : 1;
  const prog = progOf(who), path = pathOf(who);
  const branches = [TREE_COMMON].concat(TREES[path] || []);
  let h = '<h3>ARBRE DES POUVOIRS — ' + (S.COOP ? 'JOUEUR ' + who + ' · ' : '') + PATHS[path].name.toUpperCase() + '</h3>';
  h += '<div id="treepts">Niveau <b>' + prog.level + '</b> · Points de pouvoir : <b>' + prog.sp + '</b> · XP ' + Math.round(prog.xp) + ' / ' + xpNeed(prog.level) + '</div>';
  for (const b of branches) {
    h += '<div class="tbranch"><div class="bt">' + b.branch + '</div><div class="tnodes">';
    for (const n of b.nodes) {
      const owned = !!prog.nodes[n.id];
      const locked = !owned && (prog.level < n.req || (n.needs && !prog.nodes[n.needs]));
      const buyable = !owned && !locked && prog.sp > 0;
      h += '<div class="tnode ' + (owned ? 'owned' : locked ? 'locked' : (buyable ? 'buyable' : '')) + '" data-node="' + n.id + '">'
        + '<div class="tn">' + n.icon + ' ' + n.name + (owned ? ' ✓' : '') + '</div>'
        + '<div class="td">' + n.desc + '</div>'
        + '<div class="tr">' + (owned ? 'Acquis' : ('Niv. ' + n.req + (n.needs ? ' · voie liée' : '') + ' · 1 point')) + '</div></div>';
    }
    h += '</div></div>';
  }
  /* ---- Forge des Arts : l'AUTRE voie de puissance (Éclats de niveau) ---- */
  h += '<div class="tbranch"><div class="bt">⚒ FORGE DES ARTS — Éclats de puissance : <b>'
    + prog.shards + '</b> <small>(1 Éclat par niveau gagné · 1 Éclat par rang)</small></div><div class="tnodes">';
  for (const id in PUPG) {
    const U = PUPG[id], pw = POWERS.find(p => p.id === id);
    const cur = prog.pupg[id] || 0, owned = !!G.powers[id], maxed = cur >= U.max;
    const stars = '◆'.repeat(cur) + '◇'.repeat(U.max - cur);
    h += '<div class="tnode ' + (!owned ? 'locked' : maxed ? 'owned' : (prog.shards > 0 ? 'buyable' : '')) + '" data-upg="' + id + '">'
      + '<div class="tn">' + pw.icon + ' ' + (id === 'bolt' ? PATHS[path].boltName : pw.name)
      + ' <span class="stars">' + stars + '</span></div>'
      + '<div class="td">' + U.desc + '</div>'
      + '<div class="tr">' + (!owned ? 'Art non encore appris' : maxed ? 'Rang maximal atteint' : 'Forger le rang ' + (cur + 1) + ' · 1 Éclat') + '</div></div>';
  }
  h += '</div></div>';
  h += '<button id="treeclose">Fermer (K)</button>';
  t.innerHTML = h;
  t.querySelectorAll('.tnode[data-node]').forEach(el => el.addEventListener('click', () => buyNode(el.dataset.node, who)));
  t.querySelectorAll('.tnode[data-upg]').forEach(el => el.addEventListener('click', () => upgradePower(el.dataset.upg, who)));
  const bc = t.querySelector('#treeclose');
  if (bc) bc.addEventListener('click', () => toggleTree());
}
export function toggleTree(who) {
  if (!G.started || G.over || G.dialog) return;
  G.treeOpen = !G.treeOpen;
  if (G.treeOpen) {
    treeFor = who === 2 ? 2 : 1; // l'arbre appartient à qui l'ouvre
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
