/* ---------------- UI / HUD ---------------- */
import * as THREE from 'three';
import { G, S, IS_TOUCH, PATHS, POWERS, CAMPS, player, p2, enemies, flames, spinners, settings,
  RARITIES, RARITY_ORDER, SLOT_DEFS, equipTotals, armorReduction, gearScore } from './state.js';
import { A } from './Audio.js';
import { xpNeed } from './SkillTree.js';
import { nearInter, spawnBurst } from './World.js';
import { lockPointer } from './Controls.js';          // cycle sûr : appel différé
import { leaveTower, enterPalier } from './Tower.js'; // cycle sûr : appel différé
import { loadRoom, unloadRoom } from './Rooms.js';    // cycle sûr : appel différé
import { closeMap } from './WorldMap.js';             // cycle sûr : appel différé
import { dayFactor } from './DayNight.js';            // cycle sûr : appel différé

export const $ = id => document.getElementById(id);
export function showMsg(t, dur) { $('msg').textContent = t; $('msg').style.opacity = 1; G.msgT = dur || 3; }

/* ---------------- ÉCRAN DE CHARGEMENT (transitions de salle) ----------------
   Fondu vers le noir → bascule d'instance (déchargement/chargement synchrone
   de la salle) → fondu retour. La coupure est le CONTRAT du level streaming :
   un seul espace existe en mémoire à la fois, tout le budget de calcul se
   concentre sur la salle courante. S.transitioning verrouille les
   interactions pendant le voile (anti double-déclenchement). */
const LOADTIPS = [
  'Les ombres reprennent leurs postes quand une salle se vide de votre lumière.',
  'Chaque porte d\'Ombreciel n\'obéit qu\'à un art ancien — ou à une clef.',
  'Les feux de bivouac sont des sanctuaires : aucune ombre n\'ose leur lueur.',
  'La nuit, les ombres frappent plus fort... mais leur chute paie davantage.',
  'Un mur trop haut pour un saut cache souvent un mécanisme, jamais un cul-de-sac.',
  'Reposez-vous aux bivouacs : la matrice des feux permet le voyage rapide.'
];
let tipI = Math.floor(Math.random() * LOADTIPS.length);
export function withLoading(title, fn) {
  if (S.transitioning) return;
  S.transitioning = true;
  const ov = $('transition');
  $('trans-title').textContent = title || 'Ombreciel';
  tipI = (tipI + 1) % LOADTIPS.length;
  $('trans-tip').textContent = LOADTIPS[tipI];
  ov.classList.remove('hidden');
  // reflow pour que la transition CSS parte bien de opacity:0
  void ov.offsetHeight;
  ov.classList.add('on');
  setTimeout(() => {
    try { fn(); } catch (e) { console.error('Transition de salle :', e); }
    /* période de grâce : personne ne se fait sauter dessus en sortant d'un
       écran de chargement — le temps de se repérer (voir Enemies.js) */
    S.graceT = 4.5;
    setTimeout(() => {
      ov.classList.remove('on');
      setTimeout(() => {
        ov.classList.add('hidden');
        S.transitioning = false;
      }, 460);
    }, 620);
  }, 460);
}

/* ---------------- VOYAGE RAPIDE — MATRICE DES BIVOUACS ----------------
   Ouverte au repos à un feu de bivouac. Fast-travel INTERDIT si le joueur
   est en combat (isPlayerInCombat ⇔ S.combatT > 0, voir Enemies.js). */
export function openTravel(fromCamp, canSleep) {
  const dests = CAMPS.filter(c => c.travel && G.camps[c.id] && (!fromCamp || c.id !== fromCamp.id));
  /* sans destination ET sans feu de repos, rien à afficher ; au repos, le
     panneau s'ouvre toujours (choix du réveil ci-dessous) */
  if (!dests.length && !fromCamp) return;
  if (S.combatT > 0) { showMsg('Les ombres vous traquent : impossible de voyager en plein combat.', 3); return; }
  G.travelOpen = true;
  const ul = $('travellist'); ul.innerHTML = '';
  const mkRow = (txt, fn, cls) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    if (cls) b.className = cls;
    b.textContent = txt;
    b.addEventListener('click', fn);
    li.appendChild(b); ul.appendChild(li);
  };
  /* ---- CHOIX DU RÉVEIL : on dort près du feu jusqu'à l'heure qu'on préfère.
     v8.4 : dormir exige une braise vive (canSleep) — un feu froid ne fait
     plus passer le temps, il ne reste qu'un relais de voyage rapide. */
  if (fromCamp && canSleep !== false) {
    const f = dayFactor(G.hour);
    if (f < 1) mkRow('☀ Dormir jusqu\'à l\'aube (jour)', () => {
      G.hour = 7.6;
      closeTravel();
      spawnBurst(player.pos.x, player.pos.y + 1, player.pos.z, 0xffd97a, 16);
      showMsg('☀ Vous dormez près du feu... L\'aube se lève sur Ombreciel, les ombres se terrent.', 4);
    }, 'resttime');
    if (f > 0) mkRow('☾ Veiller jusqu\'au crépuscule (nuit)', () => {
      G.hour = 20.6;
      closeTravel();
      spawnBurst(player.pos.x, player.pos.y + 1, player.pos.z, 0x8fa8ff, 16);
      showMsg('☾ Vous veillez près des braises... La nuit tombe : ombres féroces, mais chute payée +50 % d\'XP.', 4);
    }, 'resttime');
  }
  for (const c of dests) mkRow('🔥 ' + c.label, () => travelTo(c));
  $('travel').classList.remove('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
}
/* Ouvre/ferme le sac-atelier : le monde se fige (voir loop, main.js), la
   souris est libérée pour cliquer les boutons, puis re-capturée en sortie. */
export function toggleInv() {
  if (!G.started || G.over || G.dialog || G.paused) return;
  G.inv = !G.inv;
  if (G.inv) {
    refreshInv();
    if (document.exitPointerLock) document.exitPointerLock();
  } else if (!G.treeOpen && !G.travelOpen) {
    lockPointer();
  }
  $('inv').classList.toggle('hidden', !G.inv);
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
  /* Le voyage rapide passe TOUJOURS par l'écran de chargement : on décharge
     l'instance courante (salle ou palier), on charge celle du feu visé
     (c.room = salle instanciée, c.palier = palier de la Tour), puis on pose
     le voyageur près du bivouac. */
  withLoading('🔥 ' + c.label, () => {
    /* v8.4 : arriver par la matrice RAVIVE la braise du feu de destination —
       on retrouve le droit de s'y soigner / d'y dormir une fois. */
    G.campHeal[c.id] = true;
    if (S.roomId) unloadRoom();
    if (S.inTower) leaveTower(true);
    if (c.palier) enterPalier(c.palier);
    else if (c.room) loadRoom(c.room);
    player.pos.set(c.x, c.y, c.z); player.vel.set(0, 0, 0);
    if (S.COOP && p2.pos) { p2.pos.set(c.x + 1.5, c.y, c.z + 0.8); p2.vel.set(0, 0, 0); }
    G.checkpoint = { x: c.x, y: c.y, z: c.z };
    A.dash();
    spawnBurst(c.x, c.y + 1, c.z, 0xffc06a, 20);
    showMsg('Le feu appelle le feu... Vous rouvrez les yeux près du bivouac — ' + c.label + '.', 3.5);
  });
}

/* ---------------- GAME OVER (solo) ----------------
   v7.4 : la mort n'est plus un aller-retour instantané. Un écran s'affiche,
   les ombres « se referment » quelques secondes (aucun bouton actif), puis
   le porteur de flamme CHOISIT à quel feu de bivouac découvert il rouvre
   les yeux. En coop, l'ancien retour immédiat est conservé (l'écran scindé
   continue de vivre pour l'autre joueur — voir hurt() dans Player.js). */
let goTimer = null;
export function gameOver() {
  if (G.dead) return;
  G.dead = true; G.over = true; G.hp = 0;
  S.combatT = 0;
  /* refermer tous les panneaux : la mort a le dernier mot */
  G.inv = false; $('inv').classList.add('hidden');
  G.treeOpen = false; $('tree').classList.add('hidden');
  G.travelOpen = false; $('travel').classList.add('hidden');
  closeMap(); // referme la carte ET libère son minuteur de rafraîchissement
  G.paused = false; $('pause').classList.add('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
  /* un bouton par feu découvert (à défaut : le dernier feu connu) */
  const ul = $('golist'); ul.innerHTML = '';
  const mkBtn = (label, x, y, z) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.textContent = '🔥 ' + label;
    b.disabled = true;
    b.addEventListener('click', () => reviveAt(x, y, z, label));
    li.appendChild(b); ul.appendChild(li);
  };
  const dests = CAMPS.filter(c => c.travel && G.camps[c.id]);
  if (!dests.length) mkBtn('le dernier feu connu', G.checkpoint.x, G.checkpoint.y, G.checkpoint.z);
  for (const c of dests) mkBtn(c.label, c.x, c.y, c.z);
  /* latence de renaissance : les ombres se referment avant tout choix
     (échéance sur horloge réelle — insensible aux dérives des timers) */
  const cnt = $('gocount');
  const deadline = performance.now() + 4000;
  cnt.textContent = 'Les ombres se referment sur vous... 4';
  $('gameover').classList.remove('hidden');
  if (goTimer) clearInterval(goTimer);
  goTimer = setInterval(() => {
    const left = deadline - performance.now();
    if (left > 0) { cnt.textContent = 'Les ombres se referment sur vous... ' + Math.ceil(left / 1000); return; }
    clearInterval(goTimer); goTimer = null;
    cnt.textContent = 'Choisissez le feu où rouvrir les yeux :';
    ul.querySelectorAll('button').forEach(b => { b.disabled = false; });
  }, 200);
}
/* ---------------- LA VRAIE FIN (v8.4) ----------------
   Après l'épilogue de la Couronne de l'Aube (Avale-Lune vaincue), le jeu
   s'ARRÊTE vraiment : écran « bien joué » plein écran, monde figé (G.over),
   avec le choix de continuer en exploration libre ou de recommencer. */
export function showVictory() {
  if (G.dead) return;
  G.over = true;
  S.combatT = 0;
  G.inv = false; $('inv').classList.add('hidden');
  G.treeOpen = false; $('tree').classList.add('hidden');
  G.travelOpen = false; $('travel').classList.add('hidden');
  closeMap();
  G.paused = false; $('pause').classList.add('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
  const st = $('truewin-stats');
  if (st) st.textContent = '— ' + PATHS[G.path].name + ' de niveau ' + G.level +
    ' · Larmes d\'Aube ' + G.crystals + ' / 3 · les cinq Maîtres d\'Étage vaincus —';
  $('truewin').classList.remove('hidden');
}
export function reviveAt(x, y, z, label) {
  if (!G.dead) return;
  if (goTimer) { clearInterval(goTimer); goTimer = null; }
  G.dead = false; G.over = false;
  $('gameover').classList.add('hidden');
  if (S.inTower) leaveTower(true); // l'instance de la Tour ne survit pas à la mort
  G.hp = Math.floor(G.maxHp * 0.6);
  G.mana = G.maxMana;
  player.pos.set(x, y, z); player.vel.set(0, 0, 0);
  player.invuln = 1.5; // le temps de se relever, les ombres ne mordent pas
  G.checkpoint = { x, y, z };
  A.dash();
  spawnBurst(x, y + 1, z, 0xffc06a, 20);
  showMsg('Vous rouvrez les yeux près du feu — ' + label + '. Les ombres vous ont laissé la vie... cette fois.', 4.5);
  if (!IS_TOUCH && !G.paused) lockPointer();
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
  // bouton d'attaque tactile : l'icône reflète l'arme de la voie choisie
  const ta = $('t-attack');
  if (ta) { const ai = ta.querySelector('.aico'); if (ai) ai.textContent = PATHS[G.path].icon; }
  refreshPowers();
}
export function refreshPowers() {
  POWERS.forEach(p => {
    const d = $('pw-' + p.id);
    d.classList.toggle('owned', !!G.powers[p.id]);
    d.classList.toggle('sel', G.sel === p.id);
  });
  updateTouchSlots();
  updatePadLegend();
}

/* ---------------- LÉGENDE MANETTE (bouton → action / sort) ----------------
   Affichée dès qu'une manette physique est la manette principale (S.padBrand,
   posé par Controls.js). Les libellés suivent la MARQUE détectée : mêmes
   positions physiques (mapping standard : 0=bas, 1=droite, 2=gauche, 3=haut),
   seuls les noms gravés sur les boutons changent d'un constructeur à l'autre.
   Les 5 emplacements de sort reflètent ⚙ Réglages ; 🔒 = pas encore appris. */
const PAD_LABELS = {
  xbox: { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 9: 'Start', 10: 'L3' },
  ps:   { 0: '✕', 1: '◯', 2: '□', 3: '△', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 9: 'Options', 10: 'L3' },
  nin:  { 0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR', 9: '+', 10: 'L3' },
};
PAD_LABELS.generic = PAD_LABELS.xbox; // les pads génériques copient la sérigraphie Xbox
export function updatePadLegend() {
  const el = $('padlegend');
  if (!el) return;
  if (!S.padBrand || !G.started) { el.classList.add('hidden'); return; }
  const L = PAD_LABELS[S.padBrand] || PAD_LABELS.generic;
  const chip = t => '<span class="plbtn">' + t + '</span>';
  const spell = (id, btnTxt) => {
    const p = POWERS.find(x => x.id === id);
    if (!p) return null;
    return chip(btnTxt) + '<span class="plico">' + p.icon + '</span>' + p.name + (G.powers[id] ? '' : ' <span class="pllock">🔒</span>');
  };
  const rows = [
    chip('◀ Stick') + 'Déplacer <small>(enfoncé : sprint)</small>',
    chip('Stick ▶') + 'Caméra',
    chip(L[0]) + 'Saut <small>(tenir : planer)</small>',
    chip(L[1]) + 'Interagir',
    spell('bolt', L[2]), // l'attaque de base, toujours sur X/□/Y-phys.
  ];
  settings.slots.forEach((id, i) => { if (id) rows.push(spell(id, L[[3, 4, 5, 6, 7][i]])); });
  rows.push(spell('nova', 'Croix ▲'), spell('meteor', 'Croix ▼'),
    chip('Croix ◀') + '🎒 Sac & atelier',
    chip('Croix ▶') + '❖ Pouvoirs & améliorations',
    chip(L[9]) + 'Pause');
  el.innerHTML = '<div class="plname">🎮 ' + (S.COOP ? 'Joueur 2 · ' : '')
    + (S.padName || 'Manette') + '</div>'
    + rows.filter(Boolean).map(r => '<div class="plrow">' + r + '</div>').join('');
  el.classList.remove('hidden');
}
/* Boutons de sort tactiles (ts-*) : un bouton n'apparaît que si l'art est
   appris ET assigné à un emplacement dans ⚙ Réglages — retirer un sort de
   la manette le retire aussi du pouce droit, l'écran reste dégagé. */
export function updateTouchSlots() {
  POWERS.forEach(p => {
    const b = $('ts-' + p.id);
    if (b) b.classList.toggle('owned', !!G.powers[p.id] && settings.slots.includes(p.id));
  });
}
/* ---------------- LE SAC-ATELIER (Tab — met le jeu en pause) ----------------
   Quatre volets : ressources (avec leur provenance), consommables à boire,
   fabrication (toutes les recettes, boutons grisés si coût non couvert),
   et objets/clefs. Fabriquer NE consomme plus à l'aveugle : les potions se
   gardent et se boivent quand le joueur le décide. */
/* cycle sûr UI ↔ Crafting : module pré-chargé au démarrage via import()
   différé, puis rafraîchissements SYNCHRONES (les boutons du sac ne bougent
   jamais sous le curseur au moment d'un clic). */
let CraftMod = null;
import('./Crafting.js').then(m => { CraftMod = m; });
export function refreshInv() {
  if (CraftMod) buildInvHTML(CraftMod);
  else import('./Crafting.js').then(m => { CraftMod = m; buildInvHTML(m); });
}
function buildInvHTML(C) {
  const box = $('invbody'); if (!box) return;
  let h = '';
  h += '<div class="invcol">';
  h += '<div class="invsec">RESSOURCES <small>— qui lâche quoi</small></div>';
  for (const k of ['herbs', 'shadows', 'orbes', 'feathers', 'bones', 'threads', 'nightHearts']) {
    const r = C.RES[k];
    h += '<div class="invres' + (k === 'nightHearts' ? ' rare' : '') + '"><span class="ri">' + r.icon + '</span><b>' + (G[k] || 0) + '</b> ' + r.name
      + '<small>' + r.src + '</small></div>';
  }
  h += '<div class="invsec">CONSOMMABLES</div>';
  h += '<div class="invres"><span class="ri">🧪</span><b>' + G.potions + '</b> Potion lunaire <button class="invuse" data-use="potion"' + (G.potions > 0 ? '' : ' disabled') + '>Boire (+50 PV)</button></div>';
  if (G.buffSpeedT > 0) h += '<div class="invres"><span class="ri">➶</span>Élixir du Traqueur actif — ' + Math.ceil(G.buffSpeedT) + ' s</div>';
  h += '<div class="invsec">OBJETS & CLEFS</div><ul class="invitems">';
  const rows = ['Voie : ' + PATHS[G.path].name, 'Larmes d\'Aube : ' + G.crystals + ' / 3'];
  if (G.stars > 0) rows.push('Éclats d\'Aube étoilée : ' + G.stars + ' / 3' + (G.upgrades.starBoost ? ' — Faveur des Étoiles active' : ''));
  if (G.goldKey) rows.push('Clef d\'or de la salle du trône');
  if (G.tower.keys.copper) rows.push('Clef de Cuivre — Ascension, Palier I');
  if (G.tower.keys.sap) rows.push('Clef de Sève — Ascension, Palier II');
  if (G.tower.keys.ether) rows.push('Clef d\'Éther — Ascension, Palier III');
  if (G.tower.keys.astre) rows.push('Clef d\'Astre — Ascension, Palier V (l\'Outre-Ciel)');
  if (G.tower.aura) rows.push('Aura du Premier Foyer (+15 % dégâts, régénération)');
  if (G.tower.shards > 0 && !G.tower.bridge) rows.push('Éclats d\'étoile : ' + G.tower.shards + ' / 3 — pour Orin, le cartographe céleste');
  if (G.tower.crown) rows.push('Couronne de l\'Aube (+10 % dégâts, le foyer veille sur l\'esprit)');
  POWERS.forEach(p => { if (G.powers[p.id]) rows.push('Sort — ' + p.name); });
  G.items.forEach(i => rows.push(i));
  rows.forEach(r => { h += '<li>' + r + '</li>'; });
  h += '</ul></div>';
  h += '<div class="invcol">';
  h += '<div class="invsec">FABRICATION <small>— le jeu est en pause, prenez votre temps</small></div>';
  for (const r of C.RECIPES) {
    const done = (r.id === 'transcend' || r.id === 'ailes') ? C.craftCount(r.id) >= 1 : (r.max && C.craftCount(r.id) >= r.max);
    const ok = C.canCraft(r);
    h += '<div class="recipe' + (done ? ' done' : ok ? ' ok' : '') + '">'
      + '<div class="rn">' + r.icon + ' ' + r.name + (r.max ? ' <em>' + C.craftCount(r.id) + '/' + r.max + '</em>' : '') + (done ? ' ✓' : '') + '</div>'
      + '<div class="rd">' + r.desc + '</div>'
      + '<div class="rc">' + (done ? 'Forgé' : C.costText(r)) + (done ? '' : ' <button class="invcraft" data-craft="' + r.id + '"' + (ok ? '' : ' disabled') + '>Fabriquer</button>') + '</div>'
      + '</div>';
  }
  h += '</div>';
  box.innerHTML = h;
  box.querySelectorAll('[data-craft]').forEach(b => b.addEventListener('click', () => C.craftRecipe(b.dataset.craft)));
  box.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => C.usePotion()));
}

/* ---------------- v9 — LA FORGE (enclumes du monde) ----------------
   Panneau interactif ouvert par une enclume : équipement porté (3 slots),
   sac de forge, façonnage d'une pièce Commune adaptée à la Voie, et
   FUSION 3 pièces de même rareté + ressources → rareté supérieure. */
export function toggleForge() {
  if (!G.started || G.over || G.dialog) return;
  G.forgeOpen = !G.forgeOpen;
  if (G.forgeOpen) {
    refreshForge();
    if (document.exitPointerLock) document.exitPointerLock();
  } else if (!IS_TOUCH && !G.paused) lockPointer();
  $('forge').classList.toggle('hidden', !G.forgeOpen);
}
export function refreshForge() {
  if (!G.forgeOpen) return;
  if (CraftMod) buildForgeHTML(CraftMod);
  else import('./Crafting.js').then(m => { CraftMod = m; buildForgeHTML(m); });
}
function gearCard(it, action) {
  const R = RARITIES[it.rarity];
  const stats = Object.keys(it.stats)
    .map(k => ({ dmg: '⚔', armor: '🛡', hp: '♥', mana: '❂', speed: '➶' }[k] + ' +' + it.stats[k] + (k === 'speed' ? ' %' : '')))
    .join(' · ');
  return '<div class="gearcard" style="border-color:' + R.css + '">'
    + '<div class="gn" style="color:' + R.css + '">' + it.icon + ' ' + it.name + ' <em>' + R.name + '</em></div>'
    + '<div class="gs">' + stats + '</div>' + action + '</div>';
}
function buildForgeHTML(C) {
  const t = $('forge'); if (!t) return;
  const tot = equipTotals();
  let h = '<h3>⚒ LA FORGE D\'OMBRECIEL</h3>';
  h += '<div id="forgetop">Score d\'équipement : <b>' + gearScore() + '</b> / 450'
    + ' · Armure ' + tot.armor + ' (−' + Math.round(armorReduction() * 100) + '% des coups)'
    + ' · Arme +' + tot.dmg + ' dégâts · Voie : <b>' + PATHS[G.path].name + '</b></div>';
  /* --- équipement porté --- */
  h += '<div class="tbranch"><div class="bt">ÉQUIPEMENT PORTÉ</div><div class="gearrow">';
  for (const slot of ['weapon', 'armor', 'accessory']) {
    const it = G.equipment[slot];
    h += '<div class="gearslot"><div class="gsl">' + SLOT_DEFS[slot].name + '</div>'
      + (it ? gearCard(it, '<button data-unequip="' + slot + '">Retirer</button>')
            : '<div class="gearempty">— vide —</div>')
      + '</div>';
  }
  h += '</div></div>';
  /* --- façonnage (Commun, adapté à la Voie) --- */
  h += '<div class="tbranch"><div class="bt">FAÇONNER — pièce Commune adaptée au ' + PATHS[G.path].name
    + ' <small>(coût : ' + C.fuseCostText(C.FORGE_COST) + ')</small></div><div class="gearrow">';
  for (const slot of ['weapon', 'armor', 'accessory'])
    h += '<button class="forgebtn" data-forge="' + slot + '">⚒ ' + SLOT_DEFS[slot].name + '</button>';
  h += '</div></div>';
  /* --- fusion 3 → 1 --- */
  h += '<div class="tbranch"><div class="bt">FUSION — 3 pièces de même rareté + ressources → rareté supérieure</div><div class="gearrow">';
  for (let i = 0; i < RARITY_ORDER.length - 1; i++) {
    const rar = RARITY_ORDER[i], next = RARITY_ORDER[i + 1];
    const n = G.gearBag.filter(x => x.rarity === rar).length;
    h += '<button class="forgebtn" data-fuse="' + rar + '" style="border-color:' + RARITIES[next].css + '">'
      + '3× ' + RARITIES[rar].name + ' (' + Math.min(n, 3) + '/3) → <b style="color:' + RARITIES[next].css + '">'
      + RARITIES[next].name + '</b><small>' + C.fuseCostText(C.FUSE_COSTS[next]) + '</small></button>';
  }
  h += '</div></div>';
  /* --- sac de forge --- */
  h += '<div class="tbranch"><div class="bt">SAC DE FORGE — ' + G.gearBag.length + ' / ' + C.BAG_MAX
    + ' <small>(le butin des ombres et vos pièces façonnées)</small></div><div class="gearlist">';
  if (!G.gearBag.length) h += '<div class="gearempty">Le sac est vide : façonnez une pièce, ou arrachez-en aux ombres.</div>';
  G.gearBag.forEach((it, i) => { h += gearCard(it, '<button data-equip="' + i + '">Équiper</button>'); });
  h += '</div></div>';
  h += '<button id="forgeclose">Refermer la Forge</button>';
  t.innerHTML = h;
  t.querySelectorAll('[data-forge]').forEach(b => b.addEventListener('click', () => C.forgeGear(b.dataset.forge)));
  t.querySelectorAll('[data-fuse]').forEach(b => b.addEventListener('click', () => C.fuseGear(b.dataset.fuse)));
  t.querySelectorAll('[data-equip]').forEach(b => b.addEventListener('click', () => C.equipFromBag(+b.dataset.equip)));
  t.querySelectorAll('[data-unequip]').forEach(b => b.addEventListener('click', () => C.unequipToBag(b.dataset.unequip)));
  const bc = t.querySelector('#forgeclose');
  if (bc) bc.addEventListener('click', toggleForge);
}
/* Alerte de zone (gear check, étape 4) : bannière rouge, bien visible. */
export function gearWarning(txt) {
  const el = $('gearwarn'); if (!el) return;
  el.textContent = txt;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 6000);
}

/* ---------------- CHIFFRES DE DÉGÂTS FLOTTANTS ----------------
   Petits nombres qui s'échappent du point d'impact (dégâts, XP), grossis
   et colorés sur coup critique, avec étiquette (« DANS LE DOS ! », « EN
   PLEINE TÊTE ! »...) — projetés à l'écran comme les barres de vie. */
const ftexts = [];
export function dmgText(x, y, z, txt, kind) {
  const box = $('ftexts');
  if (!box || ftexts.length > 44) return;
  const el = document.createElement('div');
  el.className = 'ftext' + (kind ? ' ' + kind : '');
  el.textContent = txt;
  box.appendChild(el);
  ftexts.push({ el, x: x + (Math.random() - 0.5) * 0.6, y: y + Math.random() * 0.2,
    z: z + (Math.random() - 0.5) * 0.6, t: 0,
    life: (kind === 'crit' || kind === 'label') ? 1.05 : 0.8 });
}
function updateFtexts(dt) {
  if (!ftexts.length) return;
  const vw = S.COOP ? innerWidth / 2 : innerWidth;
  for (let i = ftexts.length - 1; i >= 0; i--) {
    const f = ftexts[i];
    f.t += dt; f.y += dt * 1.5; // le chiffre s'élève doucement
    const k = f.t / f.life;
    if (k >= 1 || !S.camera) { f.el.remove(); ftexts.splice(i, 1); continue; }
    const v = new THREE.Vector3(f.x, f.y, f.z);
    v.project(S.camera);
    if (v.z > 1 || v.z < -1) { f.el.style.opacity = 0; continue; }
    f.el.style.left = (v.x * 0.5 + 0.5) * vw + 'px';
    f.el.style.top = (1 - (v.y * 0.5 + 0.5)) * innerHeight + 'px';
    f.el.style.opacity = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35;
  }
}

/* ---------------- BARRES DE VIE DES ENNEMIS ----------------
   Nom + niveau AU-DESSUS de la tête, barre, et PV en chiffres dessous.
   (structure .en / .etrack / .eh : l'ancienne barre unique rognait le nom
   avec son overflow:hidden — le niveau était invisible en pratique). */
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
      el.innerHTML = '<div class="en"></div><div class="etrack"><div class="ef"></div></div><div class="eh"></div>';
      if (e.elite) el.classList.add('elite');
      box.appendChild(el);
      rec = { el, fill: el.querySelector('.ef'), name: el.querySelector('.en'), hp: el.querySelector('.eh') };
      ebarPool.set(e, rec);
    }
    rec.el.style.left = sx + 'px'; rec.el.style.top = sy + 'px';
    rec.fill.style.width = Math.max(0, e.hp / e.maxHp * 100) + '%';
    rec.name.textContent = (e.tName || 'Ombre') + ' · Niv.' + (e.lvl || 1);
    rec.hp.textContent = Math.max(0, Math.ceil(e.hp)) + ' / ' + e.maxHp;
    seen.add(e);
  }
  for (const [e, rec] of ebarPool) {
    if (!seen.has(e)) { rec.el.remove(); ebarPool.delete(e); }
  }
}

/* ---------------- HUD ---------------- */
let comboShown = 0;
export function updateHUD(dt) {
  updateEnemyBars();
  updateFtexts(dt);
  /* v8.4 : l'aide-mémoire clavier (coin bas-droit) s'efface après ~30 s de
     jeu — il encombrait la vue. Les commandes restent dans le menu pause. */
  const hint = $('hint');
  if (hint) hint.classList.toggle('faded', G.time > 30);
  /* Compteur de combo : visible dès 2 coups enchaînés, « pop » à chaque
     coup supplémentaire, s'éteint quand l'enchaînement se brise. */
  const cb = $('combo');
  if (cb) {
    const n = G.comboHits || 0;
    cb.classList.toggle('hidden', n < 2);
    if (n >= 2) {
      cb.textContent = 'COMBO ×' + n + (n >= 8 ? ' — DÉCHAÎNÉ !' : '');
      if (n !== comboShown) {
        cb.classList.remove('pop'); void cb.offsetWidth; // relance l'animation
        cb.classList.add('pop');
      }
    }
    comboShown = n;
  }
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
  $('crystals').textContent = '✦ ' + G.crystals + '/3  ☘' + G.herbs + '  ●' + G.shadows + '  ◉' + G.orbes + (G.potions ? '  🧪' + G.potions : '');
  if (S.COOP) {
    $('hp2fill').style.width = Math.max(0, p2.hp / p2.maxHp * 100) + '%';
    $('mp2fill').style.width = Math.max(0, p2.mana / p2.maxMana * 100) + '%';
    $('hp2num').textContent = Math.max(0, Math.round(p2.hp)) + ' / ' + p2.maxHp;
    $('mp2num').textContent = Math.max(0, Math.round(p2.mana)) + ' / ' + p2.maxMana;
    /* v8.7 : la progression du J2 se lit sous ses barres (XP, niveau, points) */
    $('xp2fill').style.width = Math.min(100, p2.xp / xpNeed(p2.level) * 100) + '%';
    $('xp2num').textContent = Math.round(p2.xp) + ' / ' + xpNeed(p2.level) + ' XP';
    $('lvl2txt').innerHTML = 'Niveau <b>' + p2.level + '</b> — ' + PATHS[p2.path].name
      + (p2.sp > 0 ? ' · <b>' + p2.sp + ' point' + (p2.sp > 1 ? 's' : '') + ' (✥ téléphone)</b>' : '');
    const pw2 = POWERS.find(q => q.id === p2.sel);
    $('p2power').textContent = pw2 ? (p2.sel === 'bolt' ? PATHS[p2.path].boltName : pw2.name) : '';
  }
  POWERS.forEach(p => {
    const el = $('pw-' + p.id).querySelector('.cd');
    el.style.height = (G.cd[p.id] > 0 ? G.cd[p.id] / p.cool * 100 : 0) + '%';
  });
  /* Boutons tactiles : voile de recharge qui descend + grisage si le
     joueur n'a pas la mana du sort — l'état est lisible sous le pouce. */
  if (IS_TOUCH) {
    POWERS.forEach(p => {
      const b = p.id === 'bolt' ? $('t-attack') : $('ts-' + p.id);
      if (!b) return;
      const cd = b.querySelector('.scd');
      if (cd) cd.style.height = (G.cd[p.id] > 0 ? Math.min(100, G.cd[p.id] / p.cool * 100) : 0) + '%';
      if (p.id !== 'bolt') b.classList.toggle('nomana', p.cost > 0 && G.mana < p.cost);
    });
  }
  /* Marqueur ◈ de la visée aimantée : suit la cible douce (orange) ou la
     cible verrouillée d'un toucher (dorée). */
  const lk = $('lockon');
  if (lk) {
    const t = (S.aimTarget && !S.aimTarget.dead && G.started && !G.paused && !G.over) ? S.aimTarget : null;
    if (t) {
      const v = new THREE.Vector3(t.g.position.x, t.g.position.y + 1.05 * t.s + 0.9, t.g.position.z);
      v.project(S.camera);
      if (v.z < 1 && v.z > -1) {
        const vw = S.COOP ? innerWidth / 2 : innerWidth;
        lk.style.left = (v.x * 0.5 + 0.5) * vw + 'px';
        lk.style.top = (1 - (v.y * 0.5 + 0.5)) * innerHeight + 'px';
        lk.classList.remove('hidden');
        lk.classList.toggle('manual', S.aimManual === t && S.aimManualT > 0);
      } else lk.classList.add('hidden');
    } else lk.classList.add('hidden');
  }
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
