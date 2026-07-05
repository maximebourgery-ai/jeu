/* ================================================================
   CARTE D'OMBRECIEL (touche M / bouton 🗺) — v8.2
   Une carte de parchemin dessinée sur canvas, qui SE DÉVOILE :
   · chaque région reste un contour muet marqué « ? » tant qu'on n'y a
     pas mis les pieds — la visiter OU découvrir son feu de bivouac
     révèle sa forme pleine, son nom, son niveau et ses DÉTAILS
     (fontaine, colonnades, rayonnages, Ossuaire, pont brisé...) ;
   · ZOOM & DÉPLACEMENT : molette / pincement / boutons ＋ −, glisser
     pour se déplacer, ◎ recentre sur le porteur de flamme. Les
     étiquettes fines n'apparaissent qu'en zoomant (la vue d'ensemble
     reste propre) ;
   · les arts anciens PAS ENCORE APPRIS sont marqués ◆ sur les régions
     révélées — on sait toujours où chercher son prochain pouvoir ;
   · les feux découverts sont cliquables (téléportation, jamais en
     combat) — un glisser n'est jamais pris pour un clic ;
   · le porteur de flamme est toujours localisé, y compris dans les
     salles instanciées (ancre sur le plan du château).
   ================================================================ */
import { G, S, IS_TOUCH, QUESTS, CAMPS, zoneSeen, player } from './state.js';
import { $, showMsg, travelTo } from './UI.js';
import { lockPointer } from './Controls.js'; // cycle sûr : appel différé

/* Emprise du monde (x : ouest→est, z : nord→sud — le nord est en HAUT) */
const X0 = -66, X1 = 132, Z0 = -104, Z1 = 84;
let ctx = null, W = 0, H = 0, mapTimer = null;
/* zones cliquables (recalculées à chaque dessin) : { x, y, camp } en px */
let hotspots = [];

/* ---- vue : zoom [1..4] + panoramique (en pixels canvas) ---- */
let zoom = 1, panX = 0, panY = 0;
const ZMIN = 1, ZMAX = 4;

const sx = x => ((x - X0) / (X1 - X0) * W) * zoom + panX;
const sy = z => ((z - Z0) / (Z1 - Z0) * H) * zoom + panY;

function clampPan() {
  panX = Math.min(0, Math.max(W - W * zoom, panX));
  panY = Math.min(0, Math.max(H - H * zoom, panY));
}
/* zoom autour d'un point du canvas (curseur, milieu de pincement...) */
function zoomAt(cx, cy, factor) {
  const nz = Math.min(ZMAX, Math.max(ZMIN, zoom * factor));
  if (nz === zoom) return;
  panX = cx - (cx - panX) * (nz / zoom);
  panY = cy - (cy - panY) * (nz / zoom);
  zoom = nz;
  clampPan();
  drawMap();
}
/* recentre la vue sur le porteur de flamme (à zoom confortable) */
function centerOnPlayer() {
  const a = S.roomId && ROOM_MAP[S.roomId] ? ROOM_MAP[S.roomId] : { x: player.pos.x, z: player.pos.z };
  if (zoom < 2) zoom = 2;
  panX = W / 2 - ((a.x - X0) / (X1 - X0) * W) * zoom;
  panY = H / 2 - ((a.z - Z0) / (Z1 - Z0) * H) * zoom;
  clampPan();
  drawMap();
}

/* Ancres-carte des salles instanciées : leur silhouette dans le plan du
   château (les coordonnées réelles des salles, x ≈ -400, sont hors carte). */
const ROOM_MAP = {
  hall:   { x: 0,   z: 14,  name: 'le Grand Hall' },
  biblio: { x: -38, z: 14,  name: 'la Bibliothèque' },
  aile:   { x: 38,  z: 14,  name: 'l\'Aile Est' },
  trone:  { x: 0,   z: -16, name: 'la Salle du Trône' },
  cata:   { x: 96,  z: -6,  name: 'les Catacombes' }
};

/* ---------------- primitives de dessin ---------------- */
function rect(x1, z1, x2, z2, fill, stroke, dash, lw) {
  ctx.save();
  if (dash) ctx.setLineDash([5, 4]);
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(sx(x1), sy(z1), sx(x2) - sx(x1), sy(z2) - sy(z1)); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.3; ctx.strokeRect(sx(x1), sy(z1), sx(x2) - sx(x1), sy(z2) - sy(z1)); }
  ctx.restore();
}
function label(x, z, txt, color, size, bold) {
  ctx.fillStyle = color || '#8fa0c8';
  ctx.font = (bold ? 'bold ' : '') + (size || 11) + 'px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(txt, sx(x), sy(z));
}
function line(x1, z1, x2, z2, color, w, dash) {
  ctx.save();
  if (dash) ctx.setLineDash([4, 3]);
  ctx.strokeStyle = color; ctx.lineWidth = w || 1.2;
  ctx.beginPath(); ctx.moveTo(sx(x1), sy(z1)); ctx.lineTo(sx(x2), sy(z2)); ctx.stroke();
  ctx.restore();
}
function circle(x, z, rpx, fill, stroke) {
  ctx.beginPath();
  ctx.arc(sx(x), sy(z), rpx, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); }
}
/* petit arbre stylisé (triangle + pied) */
function tree(x, z, color) {
  const px = sx(x), py = sy(z), s = 3 + zoom;
  ctx.fillStyle = color || 'rgba(90,150,95,.75)';
  ctx.beginPath();
  ctx.moveTo(px, py - s); ctx.lineTo(px - s * 0.7, py + s * 0.55); ctx.lineTo(px + s * 0.7, py + s * 0.55);
  ctx.closePath(); ctx.fill();
}
/* colonne / pilier (point de pierre) */
function pillar(x, z) { circle(x, z, 1.2 + zoom * 0.5, 'rgba(190,185,165,.55)'); }
/* rayonnage / mur intérieur court */
function shelf(x1, z1, x2, z2) { line(x1, z1, x2, z2, 'rgba(165,135,95,.6)', 1 + zoom * 0.4); }
/* marqueur d'art ancien pas encore appris */
function artMark(x, z, color, name) {
  const px = sx(x), py = sy(z), s = 3 + zoom * 0.8;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = color;
  ctx.shadowColor = color; ctx.shadowBlur = 6;
  ctx.fillRect(-s / 2, -s / 2, s, s);
  ctx.restore();
  if (zoom >= 1.5) label(x, z + 7 / zoom, name, color, 9);
}

/* révélé si l'une des zones a été visitée OU l'un des feux découverts */
const rev = (zs, cs) => (zs || []).some(id => zoneSeen[id]) || (cs || []).some(id => G.camps[id]);
/* étiquettes fines : seulement quand on zoome (la vue d'ensemble reste propre) */
const fine = () => zoom >= 1.4;
const roomTaken = (room, pid) => !!(G.rooms[room] && G.rooms[room].taken && G.rooms[room].taken[pid]);

/* ---- LES RÉGIONS : contour muet + « ? » tant que non découvertes ---- */
const REGIONS = [
  { r: [-60, 33, 34, 79], f: 'rgba(46,88,58,.26)', s: 'rgba(105,155,110,.5)',
    name: 'Jardins du Crépuscule', lvl: 1, nz: 76, on: () => true,
    details() {
      [[-8, 38], [10, 40], [16, 56], [-14, 50], [8, 66], [22, 64], [-6, 72], [28, 45], [-54, 44], [-56, 72]]
        .forEach(([x, z]) => tree(x, z));
      line(0, 33, 0, 41, 'rgba(210,190,150,.55)', 2);                    // allée de la herse
      circle(0, 42, 4 + zoom, 'rgba(90,160,220,.5)', 'rgba(150,200,255,.65)'); // fontaine
      rect(-50, 52, -21, 78, 'rgba(40,90,50,.32)', 'rgba(90,150,95,.55)');     // labyrinthe de haies
      if (fine()) {
        line(-36, 54.5, -36, 75.5, 'rgba(90,150,95,.4)', 1, true);
        line(-27.5, 56, -27.5, 70, 'rgba(90,150,95,.4)', 1, true);
        label(-35.5, 66, 'labyrinthe', 'rgba(150,200,150,.8)', 9);
        label(0, 47.5, 'fontaine', 'rgba(150,190,230,.8)', 9);
        label(0, 30.2, '▾ herse du château', 'rgba(220,205,160,.85)', 9);
        label(-30, 36, 'stèle de Lumen ✦', 'rgba(160,210,255,.7)', 9);
      }
    } },
  { r: [36, 33, 74, 79], f: 'rgba(72,76,58,.24)', s: 'rgba(150,145,110,.45)',
    name: 'Parvis du Levant', lvl: 3, nz: 76, on: () => rev(['parvis'], []),
    details() {
      [[42, 70], [70, 62], [44, 36], [68, 44], [70, 76]].forEach(([x, z]) => tree(x, z, 'rgba(110,130,85,.7)'));
      rect(51, 43, 65, 57, 'rgba(170,155,115,.4)', 'rgba(220,195,140,.65)'); // Tour du Levant
      circle(58, 50, 2.5 + zoom, null, 'rgba(220,195,140,.55)');             // donjon rond
      line(23, 50, 51, 50, 'rgba(210,190,150,.65)', 2, true);                // pont brisé
      if (!G.powers.tk) artMark(58, 46, '#c8a8ff', 'Main céleste');
      if (fine()) {
        label(58, 51.8, 'Tour du Levant', 'rgba(230,210,160,.9)', 9);
        label(37, 47.5, 'pont brisé', 'rgba(210,190,150,.75)', 9);
        label(63, 41, '✦ portail de l\'Ascension', 'rgba(255,217,122,.85)', 9);
        label(58, 62, 'stèle de la tour', 'rgba(180,175,150,.6)', 8);
      }
    } },
  { r: [-17.5, 0, 17.5, 31], f: 'rgba(120,115,155,.3)', s: 'rgba(170,160,130,.5)',
    name: 'Grand hall', lvl: 2, on: () => rev(['hall'], []), room: 'hall',
    details() {
      [[-10, 8], [10, 8], [-10, 16], [10, 16], [-10, 24], [10, 24]].forEach(([x, z]) => pillar(x, z));
      line(0, 2, 0, 29, 'rgba(170,60,70,.5)', 2 + zoom * 0.5); // tapis
      if (fine()) {
        label(14.5, 25, 'levier ⚙', 'rgba(200,200,220,.75)', 8);
        label(0, 2.6, '▴ porte d\'or → trône', 'rgba(255,215,120,.7)', 8);
        label(-14, 15, '◂ bibliothèque', 'rgba(190,185,210,.65)', 8);
        label(13.5, 15, 'aile est ▸', 'rgba(190,185,210,.65)', 8);
      }
    } },
  { r: [-58, 0, -18, 31], f: 'rgba(110,105,150,.26)', s: 'rgba(160,150,125,.45)',
    name: 'Bibliothèque', lvl: 2, on: () => rev(['biblio'], []), room: 'biblio',
    details() {
      shelf(-50, 8, -34, 8); shelf(-30, 8, -22, 8);
      shelf(-46, 15, -32, 15); shelf(-52, 22, -40, 22); shelf(-32, 22, -24, 22);
      if (!G.powers.dash) artMark(-53, 5, '#9fe8ff', 'Pas du vent');
      if (fine()) {
        label(-38, 27.5, 'rayonnages-labyrinthe', 'rgba(190,165,130,.7)', 8);
        label(-53, 12.5, 'passerelle haute', 'rgba(170,190,220,.7)', 8);
        label(-38, 3, 'alcôve secrète ?', 'rgba(150,150,180,.55)', 8);
      }
    } },
  { r: [18, 0, 57.5, 31], f: 'rgba(110,105,150,.26)', s: 'rgba(160,150,125,.45)',
    name: 'Aile est', lvl: 3, on: () => rev(['aile'], []), room: 'aile',
    details() {
      shelf(22, 4, 30, 4); shelf(34, 4, 42, 4);      // râteliers d'armes
      rect(44, 12, 50, 18, 'rgba(90,110,200,.35)', 'rgba(130,150,230,.6)'); // plaque runique
      if (fine()) {
        label(30, 8, 'armurerie', 'rgba(190,185,210,.7)', 8);
        label(47, 22.5, 'plaque runique ▦', 'rgba(140,160,235,.8)', 8);
        label(53, 27, 'escalier des catacombes ▾', 'rgba(130,160,225,.7)', 8);
      }
    } },
  { r: [-16.5, -28, 16.5, 0], f: 'rgba(155,120,90,.28)', s: 'rgba(180,150,110,.5)',
    name: 'Salle du trône', lvl: 6, on: () => rev(['trone'], []), room: 'trone',
    details() {
      [[-11, -7], [11, -7], [-11, -19], [11, -19]].forEach(([x, z]) => pillar(x, z));
      rect(-6, -24, 6, -18, 'rgba(200,170,110,.3)', 'rgba(220,190,130,.55)'); // estrade
      if (!roomTaken('trone', 'tear_trone')) label(0, -20, '✦', 'rgba(255,217,122,.95)', 13);
      if (fine()) {
        label(0, -15.5, 'le trône', 'rgba(220,195,150,.8)', 8);
        label(8, -26, '▴ passage scellé (2 Larmes)', 'rgba(200,160,255,.75)', 8);
      }
    } },
  { r: [64, -36, 128, 20], f: 'rgba(42,62,105,.24)', s: 'rgba(110,150,225,.45)', dash: true,
    name: 'Catacombes · sous-sol', lvl: 4, nz: 17,
    on: () => rev(['gardes', 'ossuaire', 'gouffre'], ['catacombes']), room: 'cata',
    details() {
      rect(72, -4, 92, 8, null, 'rgba(110,150,225,.4)');                    // salle des gardes
      rect(68, -32, 104, -8, null, 'rgba(110,150,225,.35)', true);          // Ossuaire
      rect(94, -2, 118, 12, 'rgba(20,26,48,.5)', 'rgba(110,150,225,.35)');  // la fosse du Gouffre
      line(94, 5, 105, 5, 'rgba(180,200,255,.5)', 1, true);                 // brèche de 11,5 m
      if (!G.powers.heal) artMark(75, -14, '#9fffc0', 'Bénédiction');
      if (!G.powers.shield) artMark(113, 8, '#9fc8ff', 'Égide');
      if (!roomTaken('cata', 'goldkey') && !G.goldKey) label(88, -28, '🗝', 'rgba(255,220,130,.9)', 11);
      if (!roomTaken('cata', 'tear_cata')) label(122, 6, '✦', 'rgba(255,217,122,.95)', 13);
      if (fine()) {
        label(82, 1, 'salle des gardes', 'rgba(150,170,235,.8)', 8);
        label(86, -20, 'Ossuaire-labyrinthe', 'rgba(150,170,235,.85)', 9);
        label(106, 16, 'Gouffre des Morts', 'rgba(150,170,235,.85)', 9);
        label(121, 1, 'rideau de flammes 🔥', 'rgba(255,150,90,.8)', 8);
      }
    } },
  { r: [-44, -46, 44, -28], f: 'rgba(95,80,70,.26)', s: 'rgba(160,130,110,.45)',
    name: 'Terres Perdues', lvl: 7, on: () => rev(['ruines'], ['terres']),
    details() {
      [[-11, -33], [11, -31], [-20, -38], [18, -42], [-30, -36], [28, -40]].forEach(([x, z]) =>
        circle(x, z, 1.4 + zoom * 0.5, 'rgba(150,130,110,.55)'));
      if (!G.powers.frost) artMark(12, -42, '#9fe8ff', 'Souffle glacé');
      if (fine()) {
        label(-12, -30.5, '▴ passage scellé → trône', 'rgba(200,160,255,.75)', 8);
        label(-24, -43.5, 'ruines', 'rgba(190,165,140,.7)', 8);
        label(3, -47.8, '▾ ronces ardentes (givre)', 'rgba(255,150,90,.75)', 8);
      }
    } },
  { r: [-60, -90, 60, -48], f: 'rgba(28,72,44,.3)', s: 'rgba(70,125,80,.5)',
    name: 'Forêt de Nuit', lvl: 8, on: () => rev(['foret'], []),
    details() {
      [[-45, -51], [21, -51], [45, -51], [-9, -57], [9, -63], [-33, -63], [33, -63],
       [27, -75], [-9, -75], [45, -75], [-27, -87], [27, -87]].forEach(([x, z]) => tree(x, z, 'rgba(45,105,60,.8)'));
      line(-48, -60, -18, -60, 'rgba(60,110,70,.5)', 1, true);
      line(10, -70, 48, -70, 'rgba(60,110,70,.5)', 1, true);
      line(-30, -82, 24, -82, 'rgba(60,110,70,.5)', 1, true);
      if (fine()) {
        label(-39, -72, 'arbre-sanctuaire ✚', 'rgba(140,220,150,.8)', 9);
        label(0, -52, 'labyrinthe de haies (7,5 m)', 'rgba(120,180,130,.6)', 8);
      }
    } },
  { r: [-20, -100, 20, -90], f: 'rgba(92,62,125,.3)', s: 'rgba(150,105,190,.55)',
    name: 'Clairière du Cœur', lvl: 10, on: () => rev(['clairiere'], ['clairiere']),
    details() {
      circle(0, -95, 3 + zoom, null, 'rgba(190,150,230,.6)');
      label(0, -93.6, '✦', 'rgba(255,217,122,.95)', 13);
      if (fine()) label(0, -88, 'l\'autel de la dernière Larme', 'rgba(200,170,235,.85)', 9);
    } }
];

function drawMap() {
  const cv = $('mapcanvas');
  if (!cv) return;
  ctx = cv.getContext('2d');
  W = cv.width; H = cv.height;
  hotspots = [];
  /* parchemin nocturne */
  ctx.fillStyle = '#0b101f';
  ctx.fillRect(0, 0, W, H);
  const grd = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, H * 0.75);
  grd.addColorStop(0, 'rgba(38,48,88,.35)');
  grd.addColorStop(1, 'rgba(5,6,13,.9)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  /* enceinte du monde + façade du château (les grands traits, toujours là) */
  rect(-62, -100, 74, 80, null, 'rgba(160,150,120,.55)', false, 1.6);
  rect(-59.5, 31.75, 74, 33, 'rgba(140,130,105,.3)');

  /* ---- régions : découvertes = pleines, nommées et DÉTAILLÉES · sinon « ? » ---- */
  for (const R of REGIONS) {
    const [x1, z1, x2, z2] = R.r;
    if (R.on()) {
      rect(x1, z1, x2, z2, R.f, R.s, R.dash);
      /* la salle instanciée où l'on se trouve est soulignée d'or */
      if (R.room && S.roomId === R.room) rect(x1, z1, x2, z2, 'rgba(255,215,120,.12)', 'rgba(255,215,120,.85)', false, 2);
      if (R.details) R.details();
      const cx = (x1 + x2) / 2;
      const nz = R.nz !== undefined ? R.nz : (z1 + z2) / 2;
      label(cx, nz, R.name, 'rgba(220,210,180,.97)', 12, true);
      label(cx, nz + 5.5 / zoom, 'niv. ' + R.lvl, 'rgba(155,155,185,.7)', 9);
    } else {
      rect(x1, z1, x2, z2, null, 'rgba(140,140,165,.22)', true);
      label((x1 + x2) / 2, (z1 + z2) / 2 + 1.5, '?', 'rgba(160,160,195,.55)', 14);
    }
  }

  /* rose des vents (fixe à l'écran, hors zoom) */
  ctx.fillStyle = 'rgba(220,205,160,.8)';
  ctx.font = '13px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', W - 26, 24);
  ctx.beginPath();
  ctx.moveTo(W - 26, 30); ctx.lineTo(W - 31, 44); ctx.lineTo(W - 26, 40); ctx.lineTo(W - 21, 44);
  ctx.closePath(); ctx.fill();

  /* objectif en cours (✧ doré) */
  const q = QUESTS[S.questI];
  if (q && q.pos) {
    ctx.fillStyle = '#ffd97a';
    ctx.font = '16px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('✧', sx(q.pos[0]), sy(q.pos[2]) + 5);
  }

  /* feux de bivouac découverts : cliquables (les feux des salles instanciées
     sont dessinés à l'ANCRE-carte de leur salle, hors carte sinon) */
  for (const c of CAMPS) {
    if (!c.travel || !G.camps[c.id]) continue;
    const a = c.room && ROOM_MAP[c.room] ? ROOM_MAP[c.room] : c;
    const px = sx(a.x), py = sy(a.z) - (c.room ? 8 : 0);
    ctx.font = '15px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🔥', px, py + 5);
    ctx.fillStyle = 'rgba(255,210,140,.95)';
    ctx.font = '10px Verdana, sans-serif';
    ctx.fillText(c.label, px, py + 17);
    hotspots.push({ x: px, y: py, camp: c });
  }

  /* le porteur de flamme : flèche orientée — dans une salle instanciée, la
     flèche se pose sur l'ancre-carte de la salle, cerclée d'or */
  if (S.inTower) {
    ctx.fillStyle = 'rgba(200,190,160,.85)';
    ctx.font = '11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('— vous gravissez l\'Ascension de la Tour du Levant, au-delà de cette carte —', W / 2, H - 28);
  } else {
    const anchor = S.roomId && ROOM_MAP[S.roomId] ? ROOM_MAP[S.roomId] : null;
    const px = sx(anchor ? anchor.x : player.pos.x), py = sy(anchor ? anchor.z : player.pos.z);
    if (anchor) {
      ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,215,120,.7)'; ctx.lineWidth = 1.5; ctx.stroke();
      label(anchor.x, anchor.z + 9 / zoom, 'vous êtes dans ' + anchor.name, 'rgba(143,232,255,.9)', 10);
    }
    const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(fx, -fz));
    ctx.fillStyle = '#8fe8ff';
    ctx.shadowColor = '#8fe8ff'; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(-5, 6); ctx.lineTo(0, 3); ctx.lineTo(5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* légende (fixe à l'écran) */
  ctx.textAlign = 'left';
  ctx.font = '10px Verdana, sans-serif';
  ctx.fillStyle = 'rgba(185,195,225,.8)';
  ctx.fillText('🔥 bivouac (cliquer : voyage) · ✧ objectif · ◆ art à apprendre · ▲ vous · « ? » : à découvrir', 12, H - 10);
  if (zoom > 1.01) {
    ctx.textAlign = 'right';
    ctx.fillText('zoom ×' + zoom.toFixed(1) + ' — glissez pour déplacer', W - 12, H - 10);
  }
}

export function openMap() {
  if (!G.started || G.over || G.dialog || G.mapOpen) return;
  if (G.travelOpen) { G.travelOpen = false; $('travel').classList.add('hidden'); }
  G.mapOpen = true;
  zoom = 1; panX = 0; panY = 0; // vue d'ensemble à chaque ouverture
  drawMap();
  $('map').classList.remove('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
  /* la carte vit : position du joueur et objectif rafraîchis en continu */
  if (mapTimer) clearInterval(mapTimer);
  mapTimer = setInterval(() => { if (G.mapOpen) drawMap(); }, 300);
}
export function closeMap() {
  if (!G.mapOpen) return;
  G.mapOpen = false;
  $('map').classList.add('hidden');
  if (mapTimer) { clearInterval(mapTimer); mapTimer = null; }
  if (!G.paused && !G.over && !IS_TOUCH) lockPointer();
}
export function toggleMap() {
  if (G.mapOpen) closeMap(); else openMap();
}

export function initMap() {
  const cv = $('mapcanvas');
  if (!cv) return;
  /* coordonnées d'un évènement dans le référentiel du canvas (il peut être
     affiché redimensionné par le CSS) */
  const toCv = (clientX, clientY) => {
    const r = cv.getBoundingClientRect();
    return { x: (clientX - r.left) * (cv.width / r.width), y: (clientY - r.top) * (cv.height / r.height) };
  };

  /* ---- souris : molette = zoom au curseur · glisser = déplacer ---- */
  let dragging = false, dragMoved = 0, lastX = 0, lastY = 0;
  cv.addEventListener('wheel', e => {
    if (!G.mapOpen) return;
    e.preventDefault();
    const p = toCv(e.clientX, e.clientY);
    zoomAt(p.x, p.y, e.deltaY < 0 ? 1.18 : 1 / 1.18);
  }, { passive: false });
  cv.addEventListener('mousedown', e => {
    if (!G.mapOpen) return;
    dragging = true; dragMoved = 0;
    const p = toCv(e.clientX, e.clientY);
    lastX = p.x; lastY = p.y;
  });
  addEventListener('mousemove', e => {
    if (!dragging || !G.mapOpen) return;
    const p = toCv(e.clientX, e.clientY);
    panX += p.x - lastX; panY += p.y - lastY;
    dragMoved += Math.abs(p.x - lastX) + Math.abs(p.y - lastY);
    lastX = p.x; lastY = p.y;
    clampPan();
    drawMap();
  });
  addEventListener('mouseup', () => { dragging = false; });

  /* ---- tactile : 1 doigt = déplacer · pincement = zoomer ---- */
  let pinchD = 0;
  cv.addEventListener('touchstart', e => {
    if (!G.mapOpen) return;
    e.preventDefault();
    dragMoved = 0;
    if (e.touches.length === 1) {
      const p = toCv(e.touches[0].clientX, e.touches[0].clientY);
      lastX = p.x; lastY = p.y;
    } else if (e.touches.length === 2) {
      pinchD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    if (!G.mapOpen) return;
    e.preventDefault();
    if (e.touches.length === 1) {
      const p = toCv(e.touches[0].clientX, e.touches[0].clientY);
      panX += p.x - lastX; panY += p.y - lastY;
      dragMoved += Math.abs(p.x - lastX) + Math.abs(p.y - lastY);
      lastX = p.x; lastY = p.y;
      clampPan();
      drawMap();
    } else if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const m = toCv((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
      if (pinchD > 0) zoomAt(m.x, m.y, d / pinchD);
      pinchD = d;
      dragMoved += 10; // un pincement n'est jamais un clic-voyage
    }
  }, { passive: false });
  cv.addEventListener('touchend', e => {
    if (!G.mapOpen) return;
    /* toucher bref sans glisser = clic (voyage vers un feu) */
    if (e.changedTouches.length === 1 && dragMoved < 8) tryTravelAt(lastX, lastY);
    pinchD = 0;
  });

  /* clic souris (ignoré après un glisser) */
  cv.addEventListener('click', e => {
    if (!G.mapOpen || dragMoved >= 8) return;
    const p = toCv(e.clientX, e.clientY);
    tryTravelAt(p.x, p.y);
  });
  function tryTravelAt(mx, my) {
    let best = null, bd = 18;
    for (const h of hotspots) {
      const d = Math.hypot(h.x - mx, h.y - my);
      if (d < bd) { bd = d; best = h; }
    }
    if (!best) return;
    if (S.combatT > 0) { showMsg('Les ombres vous traquent : impossible de voyager en plein combat.', 3); return; }
    closeMap();
    travelTo(best.camp);
  }

  /* ---- boutons : zoom ± · recentrer · croix de fermeture ---- */
  $('btn-mapzoomin').addEventListener('click', () => zoomAt(W / 2 || 360, H / 2 || 320, 1.35));
  $('btn-mapzoomout').addEventListener('click', () => zoomAt(W / 2 || 360, H / 2 || 320, 1 / 1.35));
  $('btn-mapcenter').addEventListener('click', centerOnPlayer);
  $('btn-mapx').addEventListener('click', closeMap);
  $('btn-mapclose').addEventListener('click', closeMap);
}
