/* ================================================================
   CARTE D'OMBRECIEL (touche M / bouton 🗺) — v8.1
   Une carte de parchemin dessinée sur canvas, qui SE DÉVOILE :
   · chaque région reste un contour muet marqué « ? » tant qu'on n'y a
     pas mis les pieds — la visiter OU découvrir son feu de bivouac
     révèle sa forme pleine, son nom, son niveau et ses détails
     (fontaine, pont brisé, tour, Ossuaire...) ;
   · les feux découverts sont cliquables (téléportation, jamais en
     combat) ;
   · le porteur de flamme est toujours localisé — y compris dans les
     salles instanciées (chaque salle a son ancre sur le plan du
     château) et dans la Tour (bannière dédiée).
   ================================================================ */
import { G, S, IS_TOUCH, QUESTS, CAMPS, zoneSeen, player } from './state.js';
import { $, showMsg, travelTo } from './UI.js';
import { lockPointer } from './Controls.js'; // cycle sûr : appel différé

/* Emprise du monde (x : ouest→est, z : nord→sud — le nord est en HAUT) */
const X0 = -66, X1 = 132, Z0 = -104, Z1 = 84;
let ctx = null, W = 0, H = 0, mapTimer = null;
/* zones cliquables (recalculées à chaque dessin) : { x, y, camp } en px */
let hotspots = [];

const sx = x => (x - X0) / (X1 - X0) * W;
const sy = z => (z - Z0) / (Z1 - Z0) * H;

/* Ancres-carte des salles instanciées : leur silhouette dans le plan du
   château (les coordonnées réelles des salles, x ≈ -400, sont hors carte). */
const ROOM_MAP = {
  hall:   { x: 0,   z: 14,  name: 'le Grand Hall' },
  biblio: { x: -38, z: 14,  name: 'la Bibliothèque' },
  aile:   { x: 38,  z: 14,  name: 'l\'Aile Est' },
  trone:  { x: 0,   z: -16, name: 'la Salle du Trône' },
  cata:   { x: 96,  z: -6,  name: 'les Catacombes' }
};

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

/* révélé si l'une des zones a été visitée OU l'un des feux découverts */
const rev = (zs, cs) => (zs || []).some(id => zoneSeen[id]) || (cs || []).some(id => G.camps[id]);

/* ---- LES RÉGIONS : contour muet + « ? » tant que non découvertes ---- */
const REGIONS = [
  { r: [-60, 33, 34, 79], f: 'rgba(46,88,58,.26)', s: 'rgba(105,155,110,.5)',
    name: 'Jardins du Crépuscule', lvl: 1, nz: 76, on: () => true,
    details() {
      circle(0, 42, 5, 'rgba(90,160,220,.5)', 'rgba(150,200,255,.6)');   // fontaine
      label(0, 47.5, 'fontaine', 'rgba(150,190,230,.75)', 9);
      rect(-50, 52, -21, 78, 'rgba(40,90,50,.3)', 'rgba(90,150,95,.5)'); // labyrinthe de haies
      label(-35.5, 66, 'labyrinthe', 'rgba(140,190,140,.7)', 9);
      line(0, 33, 0, 41, 'rgba(210,190,150,.5)', 2);                     // allée de la herse
      label(0, 30, '▾ herse', 'rgba(220,205,160,.8)', 9);
    } },
  { r: [36, 33, 74, 79], f: 'rgba(72,76,58,.24)', s: 'rgba(150,145,110,.45)',
    name: 'Parvis du Levant', lvl: 3, nz: 76, on: () => rev(['parvis'], []),
    details() {
      rect(51, 43, 65, 57, 'rgba(170,155,115,.35)', 'rgba(220,195,140,.6)'); // Tour du Levant
      label(58, 51.5, 'Tour', 'rgba(230,210,160,.9)', 10);
      line(34, 50, 51, 50, 'rgba(210,190,150,.6)', 2, true);                 // pont brisé
      label(42, 47, 'pont brisé', 'rgba(210,190,150,.7)', 9);
      label(63, 41, '✦ Ascension', 'rgba(255,217,122,.85)', 9);
    } },
  { r: [-17.5, 0, 17.5, 31], f: 'rgba(120,115,155,.3)', s: 'rgba(170,160,130,.5)',
    name: 'Grand hall', lvl: 2, on: () => rev(['hall'], []), room: 'hall' },
  { r: [-58, 0, -18, 31], f: 'rgba(110,105,150,.26)', s: 'rgba(160,150,125,.45)',
    name: 'Bibliothèque', lvl: 2, on: () => rev(['biblio'], []), room: 'biblio' },
  { r: [18, 0, 57.5, 31], f: 'rgba(110,105,150,.26)', s: 'rgba(160,150,125,.45)',
    name: 'Aile est', lvl: 3, on: () => rev(['aile'], []), room: 'aile' },
  { r: [-16.5, -28, 16.5, 0], f: 'rgba(155,120,90,.28)', s: 'rgba(180,150,110,.5)',
    name: 'Salle du trône', lvl: 6, on: () => rev(['trone'], []), room: 'trone' },
  { r: [64, -36, 128, 20], f: 'rgba(42,62,105,.24)', s: 'rgba(110,150,225,.45)', dash: true,
    name: 'Catacombes · sous-sol', lvl: 4, nz: 17,
    on: () => rev(['gardes', 'ossuaire', 'gouffre'], ['catacombes']), room: 'cata',
    details() {
      label(84, -16, 'Ossuaire', 'rgba(150,170,235,.8)', 10);
      label(107, 4, 'Gouffre des Morts', 'rgba(150,170,235,.8)', 10);
      label(121, -26, '✦ Larme I', 'rgba(255,217,122,.7)', 9);
    } },
  { r: [-44, -46, 44, -28], f: 'rgba(95,80,70,.26)', s: 'rgba(160,130,110,.45)',
    name: 'Terres Perdues', lvl: 7, on: () => rev(['ruines'], ['terres']),
    details() { label(0, -25.5, '▴ passage scellé', 'rgba(200,160,255,.75)', 9); } },
  { r: [-60, -90, 60, -48], f: 'rgba(28,72,44,.3)', s: 'rgba(70,125,80,.5)',
    name: 'Forêt de Nuit', lvl: 8, on: () => rev(['foret'], []),
    details() {
      line(-48, -60, -18, -60, 'rgba(60,110,70,.5)', 1, true);
      line(10, -70, 48, -70, 'rgba(60,110,70,.5)', 1, true);
      line(-30, -82, 24, -82, 'rgba(60,110,70,.5)', 1, true);
      label(-39, -73, 'arbre-sanctuaire', 'rgba(140,220,150,.7)', 9);
    } },
  { r: [-20, -100, 20, -90], f: 'rgba(92,62,125,.3)', s: 'rgba(150,105,190,.55)',
    name: 'Clairière du Cœur', lvl: 10, on: () => rev(['clairiere'], ['clairiere']),
    details() { label(0, -87, '✦ la dernière Larme', 'rgba(255,217,122,.75)', 9); } }
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

  /* ---- régions : découvertes = pleines et nommées · sinon contour + ? ---- */
  for (const R of REGIONS) {
    const [x1, z1, x2, z2] = R.r;
    if (R.on()) {
      rect(x1, z1, x2, z2, R.f, R.s, R.dash);
      /* la salle instanciée où l'on se trouve est soulignée d'or */
      if (R.room && S.roomId === R.room) rect(x1, z1, x2, z2, 'rgba(255,215,120,.12)', 'rgba(255,215,120,.85)', false, 2);
      const cx = (x1 + x2) / 2;
      label(cx, R.nz !== undefined ? R.nz : (z1 + z2) / 2, R.name, 'rgba(215,205,175,.95)', 12);
      label(cx, (R.nz !== undefined ? R.nz : (z1 + z2) / 2) + 5.5, 'niv. ' + R.lvl, 'rgba(150,150,180,.65)', 9);
      if (R.details) R.details();
    } else {
      rect(x1, z1, x2, z2, null, 'rgba(140,140,165,.22)', true);
      label((x1 + x2) / 2, (z1 + z2) / 2 + 1.5, '?', 'rgba(160,160,195,.55)', 14);
    }
  }

  /* rose des vents */
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
     sont dessinés à l'ANCRE-carte de leur salle, pas à leurs coordonnées
     réelles, hors carte) */
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
    label((X0 + X1) / 2, 78, '— vous gravissez l\'Ascension de la Tour du Levant, au-delà de cette carte —', 'rgba(200,190,160,.85)', 11);
  } else {
    const anchor = S.roomId && ROOM_MAP[S.roomId] ? ROOM_MAP[S.roomId] : null;
    const px = sx(anchor ? anchor.x : player.pos.x), py = sy(anchor ? anchor.z : player.pos.z);
    if (anchor) {
      ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,215,120,.7)'; ctx.lineWidth = 1.5; ctx.stroke();
      label(anchor.x, anchor.z + 9, 'vous êtes dans ' + anchor.name, 'rgba(143,232,255,.9)', 10);
    }
    const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(fx, -fz));
    ctx.fillStyle = '#8fe8ff';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(-5, 6); ctx.lineTo(0, 3); ctx.lineTo(5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* légende */
  ctx.textAlign = 'left';
  ctx.font = '10px Verdana, sans-serif';
  ctx.fillStyle = 'rgba(185,195,225,.8)';
  ctx.fillText('🔥 bivouac (cliquer : voyage) · ✧ objectif · ▲ vous · « ? » : région à découvrir', 12, H - 10);
}

export function openMap() {
  if (!G.started || G.over || G.dialog || G.mapOpen) return;
  if (G.travelOpen) { G.travelOpen = false; $('travel').classList.add('hidden'); }
  G.mapOpen = true;
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
  cv.addEventListener('click', e => {
    if (!G.mapOpen) return;
    const r = cv.getBoundingClientRect();
    /* le canvas peut être affiché redimensionné (max-width CSS) */
    const mx = (e.clientX - r.left) * (cv.width / r.width);
    const my = (e.clientY - r.top) * (cv.height / r.height);
    let best = null, bd = 16;
    for (const h of hotspots) {
      const d = Math.hypot(h.x - mx, h.y - my);
      if (d < bd) { bd = d; best = h; }
    }
    if (!best) return;
    if (S.combatT > 0) { showMsg('Les ombres vous traquent : impossible de voyager en plein combat.', 3); return; }
    closeMap();
    travelTo(best.camp);
  });
  $('btn-mapclose').addEventListener('click', closeMap);
}
