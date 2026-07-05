/* ================================================================
   CARTE D'OMBRECIEL (touche M / bouton 🗺) — v7.4
   Une carte stylisée du monde, dessinée sur canvas : les zones déjà
   visitées, les feux de bivouac découverts (cliquer un feu = s'y
   téléporter, aux mêmes conditions que la matrice des Bivouacs :
   jamais en plein combat), la position du porteur de flamme et
   l'objectif en cours. Les zones jamais approchées restent muettes —
   la carte se complète en explorant.
   ================================================================ */
import { G, S, IS_TOUCH, QUESTS, ZONES, CAMPS, zoneSeen, player } from './state.js';
import { $, showMsg, travelTo } from './UI.js';
import { lockPointer } from './Controls.js'; // cycle sûr : appel différé

/* Emprise du monde (x : ouest→est, z : nord→sud — le nord est en HAUT) */
const X0 = -66, X1 = 132, Z0 = -102, Z1 = 82;
let ctx = null, W = 0, H = 0, mapTimer = null;
/* zones cliquables (recalculées à chaque dessin) : { x, y, camp } en px */
let hotspots = [];

const sx = x => (x - X0) / (X1 - X0) * W;
const sy = z => (z - Z0) / (Z1 - Z0) * H;

function rect(x1, z1, x2, z2, fill, stroke, dash) {
  ctx.save();
  if (dash) ctx.setLineDash([5, 4]);
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(sx(x1), sy(z1), sx(x2) - sx(x1), sy(z2) - sy(z1)); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.strokeRect(sx(x1), sy(z1), sx(x2) - sx(x1), sy(z2) - sy(z1)); }
  ctx.restore();
}
function label(x, z, txt, color, size) {
  ctx.fillStyle = color || '#8fa0c8';
  ctx.font = (size || 11) + 'px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(txt, sx(x), sy(z));
}

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

  /* enceinte du monde */
  rect(-62, -100, 74, 80, null, 'rgba(160,150,120,.5)');
  /* traits fixes du monde de surface (toujours dessinés : c'est un plan
     d'ensemble, les NOMS de zones, eux, n'apparaissent qu'une fois vues) */
  rect(-59.5, 31.75, 74, 33, 'rgba(140,130,105,.28)');              // façade du château
  rect(-17.5, 0, 17.5, 31, 'rgba(120,115,150,.18)', 'rgba(160,150,120,.35)'); // grand hall
  rect(-58, 0, -18, 31, 'rgba(120,115,150,.14)', 'rgba(160,150,120,.3)');     // bibliothèque
  rect(18, 0, 57.5, 31, 'rgba(120,115,150,.14)', 'rgba(160,150,120,.3)');     // aile est
  rect(-16.5, -28, 16.5, 0, 'rgba(150,120,90,.16)', 'rgba(160,150,120,.3)');  // salle du trône
  rect(51, 43, 65, 57, 'rgba(150,140,110,.22)', 'rgba(200,180,130,.4)');      // Tour du Levant
  rect(-60, -90, 60, -48, 'rgba(30,70,45,.2)', 'rgba(60,110,70,.35)');        // Forêt de Nuit
  rect(-20, -100, 20, -90, 'rgba(90,60,120,.18)', 'rgba(130,90,170,.35)');    // Clairière
  /* sous-sol (catacombes / Ossuaire / Gouffre) : pointillés, teinte froide */
  rect(64, -36, 128, 20, 'rgba(40,60,100,.14)', 'rgba(100,140,220,.35)', true);
  label(96, 26, 'sous-sol · catacombes', 'rgba(120,150,220,.7)', 10);

  /* rose des vents */
  ctx.fillStyle = 'rgba(220,205,160,.8)';
  ctx.font = '13px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', W - 26, 24);
  ctx.beginPath();
  ctx.moveTo(W - 26, 30); ctx.lineTo(W - 31, 44); ctx.lineTo(W - 26, 40); ctx.lineTo(W - 21, 44);
  ctx.closePath(); ctx.fill();

  /* noms des zones DÉCOUVERTES (les zones de niveau 1-2 du départ sont
     toujours nommées ; les autres attendent la première visite) */
  for (const z of ZONES) {
    if (!(z.lvl <= 2 || zoneSeen[z.id])) continue;
    label(z.x, z.z + (z.y < 0 ? 4 : 0), z.name, z.y < 0 ? 'rgba(130,160,230,.85)' : 'rgba(200,190,160,.9)');
    label(z.x, z.z + 5.5, 'niv. ' + z.lvl, 'rgba(140,140,170,.6)', 9);
  }

  /* objectif en cours (✧ doré) */
  const q = QUESTS[S.questI];
  if (q && q.pos) {
    ctx.fillStyle = '#ffd97a';
    ctx.font = '16px Georgia, serif';
    ctx.fillText('✧', sx(q.pos[0]), sy(q.pos[2]) + 5);
  }

  /* feux de bivouac découverts : cliquables (téléportation) */
  for (const c of CAMPS) {
    if (!c.travel || !G.camps[c.id]) continue;
    const px = sx(c.x), py = sy(c.z);
    ctx.font = '15px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🔥', px, py + 5);
    ctx.fillStyle = 'rgba(255,210,140,.9)';
    ctx.font = '10px Verdana, sans-serif';
    ctx.fillText(c.label, px, py + 17);
    hotspots.push({ x: px, y: py, camp: c });
  }

  /* le porteur de flamme : flèche orientée selon la caméra */
  if (!S.inTower) {
    const px = sx(player.pos.x), py = sy(player.pos.z);
    const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(fx, -fz));
    ctx.fillStyle = '#8fe8ff';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(-5, 6); ctx.lineTo(0, 3); ctx.lineTo(5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  } else {
    label((X0 + X1) / 2, 76, '— vous gravissez l\'Ascension de la Tour du Levant, au-delà de cette carte —', 'rgba(200,190,160,.8)', 11);
  }
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
