/* ================================================================
   MANETTE SMARTPHONE (PeerJS + QR Code)
   Le PC crée un pair et affiche un QR pointant vers cette même
   application avec ?controller=ID. Le téléphone qui scanne devient la
   manette. Nécessite un hébergement HTTPS (Netlify / GitHub Pages) —
   ne fonctionne pas en ouvrant le fichier en local (file://).

   PeerJS et le générateur de QR viennent désormais de npm (plus de
   <script> CDN chargé à la volée).
   ================================================================ */
import Peer from 'peerjs';
import QRCode from 'qrcode';
import { G, S, CTRL_ID, tmMove, settings } from './state.js';
import { $, showMsg } from './UI.js';
import { dlgNext } from './Quests.js';
import { tryInteract } from './World.js';
import { cyclePower, castSpecific } from './Powers.js';
import { toggleTree } from './SkillTree.js';

/* Serveurs STUN + TURN publics (Open Relay Project) : le TURN est ce qui
   manquait le plus souvent — sans lui, la connexion échoue dès que l'un des
   deux appareils est derrière un réseau mobile ou une box un peu stricte. */
const ICE_CONFIG = { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
] };

export function openManettePanel() {
  $('qrpanel').classList.remove('hidden');
  $('btn-qrretry').classList.add('hidden');
  if (location.protocol === 'file:') {
    $('qrstatus').textContent = '⚠ La manette smartphone nécessite un hébergement en ligne (Netlify, GitHub Pages...). Elle ne fonctionne pas depuis un fichier local.';
    return;
  }
  if (S.hostPeer && !S.hostPeer.destroyed) {
    $('qrstatus').textContent = S.hostConn ? '✓ Manette connectée !' : 'En attente du smartphone... (scannez le QR)';
    return;
  }
  $('qrstatus').textContent = 'Initialisation...';
  clearTimeout(S.hostConnTimer); // évite qu'un délai d'attente d'un pair précédent n'écrase ce nouveau statut
  S.hostPeer = new Peer(undefined, { config: ICE_CONFIG });
  S.hostPeer.on('open', id => {
    const url = location.origin + location.pathname + '?controller=' + id;
    $('qrlink').textContent = url;
    QRCode.toDataURL(url, { width: 180, margin: 1 }, (err, dataUrl) => {
      if (err) { $('qrstatus').textContent = 'Erreur de génération du QR code.'; return; }
      $('qrcode').innerHTML = '<img src="' + dataUrl + '" width="180" height="180" alt="QR manette"/>';
    });
    $('qrstatus').textContent = 'Scannez le QR code avec votre smartphone';
    clearTimeout(S.hostConnTimer);
    S.hostConnTimer = setTimeout(() => {
      if (!S.hostConn) $('qrstatus').textContent = 'Toujours en attente... Vérifiez que le smartphone a bien internet (pas seulement le QR scanné), et que le PC n\'est pas derrière un VPN.';
    }, 18000);
  });
  S.hostPeer.on('connection', conn => {
    S.hostConn = conn;
    clearTimeout(S.hostConnTimer);
    conn.on('open', () => {
      $('qrstatus').textContent = '✓ Manette connectée !';
      $('btn-qrretry').classList.add('hidden');
      showMsg('📱 Manette smartphone connectée !', 3);
    });
    conn.on('data', d => {
      if (!G.started || G.over) return;
      if (typeof d === 'string') {
        try { d = JSON.parse(d); } catch (e) { return; }
      }
      if (!d || !d.t) return;
      if (G.dialog) { if (d.t === 'atkdown' || d.t === 'interact' || d.t === 'jumpdown') dlgNext(); return; }
      if (d.t === 'move') { tmMove.x = d.x || 0; tmMove.z = d.z || 0; }
      else if (d.t === 'look' && !G.paused && !G.treeOpen) {
        const s = 0.0052 * settings.padSens;
        S.yaw -= (d.dx || 0) * s;
        S.pitch -= (d.dy || 0) * s * (settings.invertY ? -1 : 1);
        S.pitch = Math.max(-1.22, Math.min(0.85, S.pitch));
      }
      else if (d.t === 'jumpdown') { if (!G.paused) S.jumpQueued = 0.14; S.tmJumpHeld = true; }
      else if (d.t === 'jumpup') S.tmJumpHeld = false;
      else if (d.t === 'atkdown') { if (!G.paused && !G.inv && !G.treeOpen) S.tmAttackHeld = true; }
      else if (d.t === 'atkup') S.tmAttackHeld = false;
      else if (d.t === 'interact' && !G.paused) tryInteract();
      else if (d.t === 'spell' && !G.paused) cyclePower(1);
      else if (d.t === 'dash' && !G.paused && !G.treeOpen) castSpecific('dash');
      else if (d.t === 'tree') toggleTree();
      else if (d.t === 'pause' && !G.over && !G.dialog) {
        G.paused = !G.paused; $('pause').classList.toggle('hidden', !G.paused);
      }
    });
    conn.on('close', () => {
      S.hostConn = null; tmMove.x = 0; tmMove.z = 0; S.tmAttackHeld = false; S.tmJumpHeld = false;
      $('qrstatus').textContent = 'Manette déconnectée. Rescannez pour reconnecter.';
      showMsg('📱 Manette smartphone déconnectée.', 3);
    });
  });
  S.hostPeer.on('disconnected', () => {
    $('qrstatus').textContent = 'Connexion instable... reconnexion en cours.';
    try { S.hostPeer.reconnect(); } catch (e) {}
  });
  S.hostPeer.on('error', e => {
    $('qrstatus').textContent = 'Erreur : ' + e.type + '. Vérifiez la connexion internet des deux appareils, ou réessayez.';
    $('btn-qrretry').classList.remove('hidden');
  });
}
export function retryManette() {
  try { if (S.hostPeer) S.hostPeer.destroy(); } catch (e) {}
  S.hostPeer = null; S.hostConn = null;
  openManettePanel();
}

/* --- Interface manette côté smartphone (?controller=ID) : joystick, caméra
   tactile et actions — les mêmes gestes que les contrôles tactiles du jeu. --- */
export function startControllerMode() {
  document.head.insertAdjacentHTML('beforeend',
    '<style>' +
    '#nwrap{position:fixed;inset:0;background:#05060d;touch-action:none;overflow:hidden}' +
    '#nlook{position:absolute;top:0;right:0;width:58%;height:100%}' +
    '#njoy{position:absolute;left:26px;bottom:34px;width:132px;height:132px;border-radius:50%;' +
      'background:rgba(20,26,52,.4);border:2px solid rgba(150,180,255,.4)}' +
    '#njoyknob{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px;border-radius:50%;' +
      'background:rgba(140,170,255,.5);border:2px solid rgba(200,220,255,.65)}' +
    '.nbtn{position:absolute;border-radius:50%;border:2px solid rgba(150,180,255,.4);background:rgba(15,19,40,.6);' +
      'color:#e8e0cc;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;' +
      'text-shadow:0 0 8px rgba(120,180,255,.7);user-select:none}' +
    '.nbtn:active{background:rgba(70,90,160,.65)}' +
    '#n-atk{right:24px;bottom:38px;width:92px;height:92px;font-size:30px;border-color:rgba(255,170,110,.6)}' +
    '#n-jmp{right:130px;bottom:118px;width:66px;height:66px;font-size:22px}' +
    '#n-act{right:36px;bottom:150px;width:54px;height:54px;font-size:19px}' +
    '#n-dsh{right:152px;bottom:36px;width:56px;height:56px;font-size:19px}' +
    '#n-spl{left:24px;top:14px;width:48px;height:48px;font-size:16px}' +
    '#n-pau{right:14px;top:14px;width:44px;height:44px;font-size:14px}' +
    '#nstatus{position:fixed;top:70px;left:0;right:0;text-align:center;color:#ffd97a;font-size:13px;' +
      'font-family:Verdana,sans-serif;pointer-events:none;text-shadow:0 1px 3px #000;padding:0 20px}' +
    '</style>');
  document.body.innerHTML =
    '<div id="nwrap">' +
    '<div id="nlook"></div>' +
    '<div id="njoy"><div id="njoyknob"></div></div>' +
    '<div class="nbtn" id="n-atk">✦</div>' +
    '<div class="nbtn" id="n-jmp">▲</div>' +
    '<div class="nbtn" id="n-act">E</div>' +
    '<div class="nbtn" id="n-dsh">⟫</div>' +
    '<div class="nbtn" id="n-spl">⟳</div>' +
    '<div class="nbtn" id="n-pau">II</div>' +
    '<div id="nstatus">Connexion au jeu...</div>' +
    '</div>';
  const setStatus = t => { const el = document.getElementById('nstatus'); if (el) el.textContent = t; };
  let conn = null, peer = null, tries = 0;
  function connect() {
    peer = new Peer(undefined, { config: ICE_CONFIG });
    peer.on('open', () => {
      conn = peer.connect(CTRL_ID, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        tries = 0;
        setStatus('✓ Connecté — bon jeu !');
        if (navigator.vibrate) navigator.vibrate(20);
      });
      conn.on('close', () => {
        setStatus('Déconnecté. Nouvelle tentative...');
        retry();
      });
      conn.on('error', () => {
        setStatus('Erreur de connexion. Nouvelle tentative...');
        retry();
      });
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
    peer.on('error', e => {
      setStatus('Erreur PeerJS : ' + e.type + '. Nouvelle tentative...');
      retry();
    });
  }
  function retry() {
    if (tries >= 6) {
      setStatus('Impossible de se connecter. Vérifiez que le jeu est ouvert sur le PC, que les deux appareils ont internet, puis rechargez cette page.');
      return;
    }
    tries++;
    try { if (peer) peer.destroy(); } catch (e) {}
    setTimeout(connect, 1500);
  }
  connect();
  /* Joystick, glisser-caméra et boutons : mêmes gestes que les contrôles
     tactiles du jeu, envoyés en JSON au PC. Câblé UNE SEULE FOIS (le DOM
     ne change pas d'une reconnexion à l'autre) : `send` regarde toujours
     la connexion `conn` courante, jamais une connexion PeerJS périmée —
     sinon chaque reconnexion (Wi-Fi coupé, écran verrouillé...) empilerait
     des écouteurs et un setInterval en double, dupliquant chaque coup/
     interaction et faisant dériver le joystick. */
  wireControls(msg => { if (conn) { try { conn.send(msg); } catch (e) {} } });
  function wireControls(send) {
    const joy = document.getElementById('njoy'), knob = document.getElementById('njoyknob');
    let joyId = null, lastMx = 0, lastMz = 0;
    function joyMove(e) {
      const r = joy.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy), max = 58;
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      lastMx = dx / max; lastMz = -dy / max;
    }
    joy.addEventListener('pointerdown', e => { e.preventDefault(); joyId = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyMove(e); });
    const joyEnd = e => { if (e.pointerId !== joyId) return; joyId = null; lastMx = 0; lastMz = 0; knob.style.transform = 'translate(0,0)'; };
    joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);
    setInterval(() => send({ t: 'move', x: lastMx, z: lastMz }), 50);
    const look = document.getElementById('nlook');
    let lookId = null, lx = 0, ly = 0;
    look.addEventListener('pointerdown', e => { e.preventDefault(); lookId = e.pointerId; lx = e.clientX; ly = e.clientY; look.setPointerCapture(e.pointerId); });
    look.addEventListener('pointermove', e => {
      if (e.pointerId !== lookId) return;
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      send({ t: 'look', dx, dy });
    });
    const lookEnd = e => { if (e.pointerId === lookId) lookId = null; };
    look.addEventListener('pointerup', lookEnd); look.addEventListener('pointercancel', lookEnd);
    const bind = (id, downMsg, upMsg) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        send({ t: downMsg });
        if (navigator.vibrate) navigator.vibrate(12);
      });
      if (upMsg) el.addEventListener('pointerup', e => { e.preventDefault(); send({ t: upMsg }); });
      if (upMsg) el.addEventListener('pointercancel', () => send({ t: upMsg }));
    };
    bind('n-atk', 'atkdown', 'atkup');
    bind('n-jmp', 'jumpdown', 'jumpup');
    bind('n-act', 'interact');
    bind('n-dsh', 'dash');
    bind('n-spl', 'spell');
    bind('n-pau', 'pause');
  }
}
