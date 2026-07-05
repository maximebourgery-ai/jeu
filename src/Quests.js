/* ---------------- HISTOIRE, DIALOGUES, OBJECTIFS & TUTORIEL ---------------- */
import { G, S, QUESTS, player, tut } from './state.js';
import { A } from './Audio.js';
import { $ } from './UI.js';

/* ---- Dialogues ---- */
export function openDialog(pages, after, name) {
  S.dlg = { pages, i: 0, after };
  G.dialog = true;
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
  if (!q) { $('objective').textContent = ''; if (S.beacon) S.beacon.visible = false; return; }
  $('objective').textContent = '✧ Objectif — ' + q.text;
  if (q.pos && S.beacon) { S.beacon.position.set(q.pos[0], q.pos[1], q.pos[2]); S.beacon.visible = true; }
  else if (S.beacon) S.beacon.visible = false;
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
    const p = player.pos;
    if (p.x > -17 && p.x < 17 && p.z > 1 && p.z < 30) questReach('hall');
  }
}
