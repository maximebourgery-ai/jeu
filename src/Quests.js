/* ---------------- HISTOIRE, DIALOGUES, OBJECTIFS & TUTORIEL ---------------- */
import { G, S, QUESTS, POWERS, player, tut } from './state.js';
import { A } from './Audio.js';
import { $ } from './UI.js';

/* ---- Dialogues ----
   `name` : nom affiché du locuteur (LUMEN par défaut — les PNJ de
   l'Outre-Ciel comme Maëla, Orin ou le Veilleur passent le leur). */
export function openDialog(pages, after, name, who) {
  S.dlg = { pages, i: 0, after };
  G.dialog = true;
  /* v9 — le dialogue appartient à qui l'a déclenché (S.actingPlayer, posé par
     tryInteract/tryInteractP2 dans World.js) : SEUL ce joueur s'arrête, voir
     p1Busy/p2Busy dans state.js et la boucle principale (main.js). */
  S.dlgWho = who === 2 ? 2 : (who === 1 ? 1 : (S.actingPlayer === 2 ? 2 : 1));
  $('dialog').classList.remove('hidden');
  $('dlg-name').textContent = name || 'LUMEN';
  $('dlg-text').textContent = pages[0];
  A.talk();
}

/* ---- Guide du porteur ----
   Première rencontre avec une mécanique (ressource inconnue, premier point
   de pouvoir, premier bivouac...) : le jeu SE MET EN PAUSE (G.dialog gèle la
   boucle, voir main.js) et une page du guide explique à quoi ça sert et
   comment s'en servir. Chaque page ne s'affiche qu'une seule fois par partie
   (G.seen, persisté dans la sauvegarde). */
export function guide(id, pages) {
  if (G.seen[id]) return false;
  G.seen[id] = true;
  openDialog(pages, null, '✦ GUIDE DU PORTEUR');
  return true;
}
export function dlgNext() {
  if (!S.dlg) return;
  S.dlg.i++;
  if (S.dlg.i >= S.dlg.pages.length) {
    $('dialog').classList.add('hidden');
    G.dialog = false;
    const f = S.dlg.after; S.dlg = null;
    if (f) f();
  } else {
    $('dlg-text').textContent = S.dlg.pages[S.dlg.i];
    A.talk();
  }
}

/* ---- Objectifs (tutoriel + quête) ---- */
export function applyQuest() {
  const q = QUESTS[S.questI];
  /* Après les 3 Larmes (la quête « tears » ne se referme jamais : l'écran
     de victoire prend le relais), l'objectif suit l'Ascension puis
     l'Outre-Ciel (v8) — la ligne du HUD ne reste jamais vide. */
  if (!q || (q.id === 'tears' && G.crystals >= 3)) {
    $('objective').textContent = '✧ Objectif — ' + towerObjective();
    if (S.beacon) S.beacon.visible = false;
    return;
  }
  $('objective').textContent = '✧ Objectif — ' + q.text;
  if (q.pos && S.beacon) { S.beacon.position.set(q.pos[0], q.pos[1], q.pos[2]); S.beacon.visible = true; }
  else if (S.beacon) S.beacon.visible = false;
}
/* L'échelle d'objectifs de fin de partie (miroir compact des indices de
   Lumen — voir towerLumenHint dans World.js). */
function towerObjective() {
  const T = G.tower;
  const known = POWERS.slice(0, 6).filter(p => G.powers[p.id]).length;
  if (known < 6) return 'Réunissez les six arts anciens (' + known + ' / 6) : le portail de l\'Ascension attend sur la terrasse de la Tour du Levant.';
  if (!T.aura) return 'Gravissez l\'Ascension de la Tour du Levant : trois clefs, puis l\'Observatoire de l\'Aube (étage 15).';
  if (!T.met.maela) return 'À l\'Observatoire, parlez à l\'ombre agenouillée : votre Aura est sa voix.';
  if (!T.bosses.berger) return T.bridge
    ? 'Franchissez le pont de constellations et affrontez le Berger des Étoiles (étage 18).'
    : 'L\'Outre-Ciel : rapportez 3 Éclats d\'étoile à Orin (' + T.shards + ' / 3) pour retisser le pont de constellations.';
  if (!T.met.veilleur) return 'Au Cœur de la Nuit sans lune, parlez au Veilleur sans Nom, devant la porte de la Dernière Nuit.';
  if (!T.bosses.avale) return 'Déchirez le voile de l\'Avale-Lune avec la Nova d\'Aurore (touche 7) — et rendez la lune au ciel.';
  if (!T.crown) return 'Recevez la Couronne de l\'Aube, au centre de l\'arène de la Dernière Nuit.';
  return 'Ombreciel est en paix : la lune veille à nouveau. Explorez librement, porteur d\'aube.';
}
export function questReach(id) {
  const idx = QUESTS.findIndex(q => q.id === id);
  if (idx < 0 || S.questI > idx) return;
  S.questI = idx + 1;
  applyQuest();
  if (G.started) A.pickup();
}

/* ---- Tutoriel ---- */
export function updateTutorial() {
  const q = QUESTS[S.questI];
  if (!q) return;
  if (q.id === 'move' && tut.moved > 4) questReach('move');
  else if (q.id === 'look' && tut.looked > 1.6) questReach('look');
  else if (q.id === 'jump' && tut.jumped && tut.sprinted) questReach('jump');
  else if (q.id === 'hall') {
    // le grand hall est une salle instanciée : y être suffit (Rooms.js)
    if (S.roomId === 'hall') questReach('hall');
  }
}
