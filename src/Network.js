/* ================================================================
   MANETTE SMARTPHONE (PeerJS + QR Code)
   Le PC crée un pair et affiche un QR pointant vers cette même
   application avec ?controller=ID. Chaque téléphone qui scanne devient
   UNE manette : plusieurs téléphones peuvent scanner le même QR, chacun
   choisit SON personnage (Joueur 1 / Joueur 2) et SA voie (classe) —
   réclamer le Joueur 2 active le mode 2 joueurs (écran scindé), même en
   cours de partie. Nécessite un hébergement HTTPS (Netlify / GitHub
   Pages) — ne fonctionne pas en ouvrant le fichier en local (file://).

   La manette embarque TOUTES les commandes du jeu : joystick (à fond =
   sprint), caméra, attaque, saut, interaction, les 7 sorts, le sac 🎒,
   l'arbre des pouvoirs ✥ (améliorations), la carte 🗺, la potion 🧪, la
   pause — et un pavé de navigation qui apparaît dès qu'un menu est
   ouvert sur l'écran (écran-titre compris : on peut tout paramétrer et
   lancer la partie depuis le téléphone).
   ================================================================ */
import Peer from 'peerjs';
import QRCode from 'qrcode';
import { G, S, CTRL_ID, PEERSRV, PATHS, POWERS, tmMove, tm2Move, p2, settings, applyPath } from './state.js';
import { A } from './Audio.js';
import { $, showMsg, toggleInv, buildPowersUI } from './UI.js';
import { dlgNext } from './Quests.js';
import { tryInteract, tryInteractP2 } from './World.js';
import { castSpecific } from './Powers.js';
import { remoteNav, anyPanelOpen } from './Controls.js';
import { toggleTree, buyNode, upgradePower, xpNeed } from './SkillTree.js';
import { toggleMap, mapPan } from './WorldMap.js';
import { craftAction } from './Crafting.js';
import { refreshPlayerVisual, setupCoopP2 } from './Player.js';

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
/* v8.8 — options PeerJS partagées (hôte, manettes, joueur en ligne).
   ?peersrv=hote:port bascule sur un serveur de signalement personnel. */
export function peerOpts() {
  const o = { config: ICE_CONFIG };
  if (PEERSRV) {
    const [h, p] = PEERSRV.split(':');
    o.host = h; o.port = +p || 9000; o.path = '/'; o.secure = false;
  }
  return o;
}
/* Code de partie : 4 caractères sans ambiguïté (pas de I/O/0/1) — il devient
   l'identifiant PeerJS de l'hôte ('ombreciel-CODE'), affiché à l'écran et
   saisi tel quel par le joueur distant (« Rejoindre une partie en ligne »). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeRoomCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return c;
}
export const ROOM_PREFIX = 'ombreciel-';

/* ================================================================
   CÔTÉ HÔTE (le PC qui affiche le jeu)
   ================================================================ */
function sendTo(c, obj) { try { c.conn.send(obj); } catch (e) {} }
function broadcast(obj) { for (const c of S.ctrlConns) sendTo(c, obj); }

/* Photo de l'état des manettes envoyée aux téléphones : qui tient quel
   personnage, quelles voies existent, partie lancée ou non. */
function welcomeMsg() {
  return {
    t: 'welcome', started: G.started, coop: S.COOP,
    paths: Object.keys(PATHS).map(id => ({ id, name: PATHS[id].name, icon: PATHS[id].icon })),
    /* locked : la voie de ce personnage est FIGÉE (partie lancée, classe déjà
       choisie) — le téléphone qui rescanne la reprend sans la redemander. */
    p1: { taken: S.ctrlConns.some(o => o.player === 1), path: G.path, locked: G.started },
    p2: { taken: S.ctrlConns.some(o => o.player === 2), path: (S.COOP && p2.mesh) ? p2.path : S.P2PATH,
          locked: !!(G.started && S.COOP && p2.mesh) },
    powers: G.powers
  };
}
function broadcastWelcome() { broadcast(welcomeMsg()); }

/* Ligne d'état du panneau QR : combien de téléphones, qui tient qui. */
function updateQrStatus() {
  const el = $('qrstatus'); if (!el) return;
  const n = S.ctrlConns.length;
  if (!n) { el.textContent = 'Scannez le QR code avec votre smartphone'; return; }
  /* 📱 = manette smartphone · 🌐 = joueur en ligne (2ᵉ PC, v8.8) */
  const who = p => { const c = S.ctrlConns.find(o => o.player === p); return c ? (c.net ? '🌐' : '📱') : '—'; };
  el.textContent = '✓ ' + n + ' connexion' + (n > 1 ? 's' : '')
    + ' · J1 ' + who(1) + ' · J2 ' + who(2)
    + ' — téléphone (QR) ou PC (code), il reste de la place.';
}

/* Un téléphone réclame un personnage (et sa voie). Un personnage ne peut
   être tenu que par UN téléphone à la fois ; réclamer le Joueur 2 bascule
   en 2 joueurs — à l'écran-titre comme EN PLEINE PARTIE (le J2 apparaît
   aussitôt à côté du J1, écran scindé).
   v8.7 — RECONNEXION : si le personnage est déjà tenu par une autre
   connexion (souvent un téléphone planté qui a rescanné le QR), la manette
   est RÉATTRIBUÉE au téléphone qui réclame — plus jamais de « déjà assigné »
   qui bloque tout. L'ancienne connexion est libérée et prévenue. */
function doJoin(c, d) {
  const n = d.player === 2 ? 2 : 1;
  const holder = S.ctrlConns.find(o => o !== c && o.player === n);
  if (holder) {
    holder.player = null;
    sendTo(holder, { t: 'released', reason: 'Un autre téléphone a repris le Joueur ' + n + '. Choisissez un personnage pour rejouer.' });
    /* on relâche les entrées que tenait l'ancien téléphone */
    if (n === 2) { tm2Move.x = 0; tm2Move.z = 0; S.tm2BoltHeld = false; S.tm2JumpHeld = false; }
    else { tmMove.x = 0; tmMove.z = 0; S.tmBoltHeld = false; S.tmJumpHeld = false; }
  }
  const path = PATHS[d.path] ? d.path : null;
  c.player = n;
  if (n === 1) {
    if (path && !G.started) {
      applyPath(path);
      document.querySelectorAll('.classbtn').forEach(b => b.classList.toggle('sel', b.dataset.path === path));
      refreshPlayerVisual(); // le corps 3D reflète la voie choisie dès le menu
      buildPowersUI();
    } else if (path && G.started && path !== G.path) {
      sendTo(c, { t: 'toast', msg: 'Partie en cours : la voie du Joueur 1 reste ' + PATHS[G.path].name + '.' });
    }
  } else {
    if (path && !(G.started && p2.mesh)) {
      S.P2PATH = path;
      document.querySelectorAll('.p2btn').forEach(b => b.classList.toggle('sel', b.dataset.p2path === path));
    } else if (path && G.started && p2.mesh && path !== p2.path) {
      sendTo(c, { t: 'toast', msg: 'Partie en cours : la voie du Joueur 2 reste ' + PATHS[p2.path].name + '.' });
    }
    if (!S.COOP) {
      /* écran-titre : coche « 2 JOUEURS » et dévoile la rangée de voie du J2 */
      S.COOP = true;
      document.querySelectorAll('.modebtn').forEach(b => b.classList.toggle('sel', b.dataset.mode === 'coop'));
      const row = $('p2row'); if (row) row.classList.remove('hidden');
    }
    if (G.started && !p2.mesh) setupCoopP2(); // entrée en jeu immédiate du J2
  }
  sendTo(c, { t: 'joined', player: n, path: n === 1 ? G.path : ((S.COOP && p2.mesh) ? p2.path : S.P2PATH) });
  broadcastWelcome();
  updateQrStatus();
  const pn = n === 1 ? G.path : ((S.COOP && p2.mesh) ? p2.path : S.P2PATH);
  showMsg('📱 Un téléphone contrôle le Joueur ' + n + ' (' + PATHS[pn].name + ').', 3.5);
}

/* ================================================================
   v8.8 — JOUEUR EN LIGNE (2ᵉ PC) : mêmes messages que la manette
   smartphone, PLUS la vidéo du jeu en retour (canvas + son capturés en
   MediaStream, envoyés par un appel PeerJS) et un HUD répliqué (barres,
   objectif, dialogues, recharges — pushNetHud) rendu localement sur
   l'écran distant. L'arbre des pouvoirs du joueur distant est consulté
   et acheté À DISTANCE (treereq/buynode/upgpower) — son écran l'affiche
   sans mettre le jeu de l'hôte en pause.
   ================================================================ */
let netStream = null;
function startNetVideo(c) {
  if (!S.renderer || !S.hostPeer) return;
  if (!A.ctx) A.init(); // le son du jeu part avec la vidéo
  if (!netStream) {
    try {
      netStream = S.renderer.domElement.captureStream(30);
      const as = A.stream();
      if (as) for (const tr of as.getAudioTracks()) netStream.addTrack(tr);
    } catch (e) { sendTo(c, { t: 'toast', msg: 'Vidéo indisponible sur cet hôte (' + e + ').' }); return; }
  }
  try {
    if (c.call) c.call.close();
    c.call = S.hostPeer.call(c.conn.peer, netStream);
  } catch (e) {}
}
function sendTree(c) {
  const isP2 = c.player !== 1;
  const prog = isP2 ? p2 : G;
  sendTo(c, { t: 'treedata', who: isP2 ? 2 : 1, path: isP2 ? p2.path : G.path,
    level: prog.level, sp: prog.sp, xp: Math.round(prog.xp), need: xpNeed(prog.level),
    shards: prog.shards, nodes: prog.nodes, pupg: prog.pupg, powers: G.powers });
}
/* HUD répliqué du joueur en ligne : ~10 envois/s, uniquement s'il y en a un */
let hudAcc = 0;
export function pushNetHud(dt) {
  if (!S.ctrlConns.some(o => o.net)) return;
  hudAcc += dt;
  if (hudAcc < 0.1) return;
  hudAcc = 0;
  const vis = id => { const el = $(id); return el && !el.classList.contains('hidden'); };
  for (const c of S.ctrlConns) {
    if (!c.net) continue;
    const isP2 = c.player !== 1;
    const pr = isP2 ? p2 : G;
    const cd = {};
    for (const k in pr.cd) if (pr.cd[k] > 0.05) cd[k] = +pr.cd[k].toFixed(2);
    sendTo(c, { t: 'hud',
      hp: Math.round(pr.hp), mhp: pr.maxHp, mp: Math.round(pr.mana), mmp: pr.maxMana,
      xp: Math.round(pr.xp), need: xpNeed(pr.level), lvl: pr.level, sp: pr.sp,
      cd, potions: G.potions, pl: c.player || 2, path: isP2 ? p2.path : G.path,
      obj: ($('objective') || { textContent: '' }).textContent,
      msg: G.msgT > 0 ? $('msg').textContent : '',
      dlg: G.dialog ? { n: $('dlg-name').textContent, x: $('dlg-text').textContent } : null,
      paused: G.paused, coop: S.COOP && !!p2.mesh, started: G.started, over: G.over,
      end: vis('truewin') ? 'truewin' : vis('win') ? 'win' : null
    });
  }
}

/* Toutes les commandes envoyées par un téléphone, routées vers SON joueur. */
function handleCtrlMsg(c, d) {
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch (e) { return; }
  }
  if (!d || !d.t) return;
  if (d.t === 'hello') { sendTo(c, welcomeMsg()); return; }
  if (d.t === 'join') { doJoin(c, d); return; }
  /* --- messages propres au joueur en ligne (2ᵉ PC) --- */
  if (d.t === 'video') { c.net = true; startNetVideo(c); return; }
  if (c.net) {
    if (d.t === 'tree' || d.t === 'treereq') { sendTree(c); return; } // son arbre, sur SON écran
    if (d.t === 'buynode') { buyNode(String(d.id), c.player === 1 ? 1 : 2); sendTree(c); return; }
    if (d.t === 'upgpower') { upgradePower(String(d.id), c.player === 1 ? 1 : 2); sendTree(c); return; }
    if (d.t === 'bag' || d.t === 'map') {
      sendTo(c, { t: 'toast', msg: (d.t === 'bag' ? 'Le sac-atelier' : 'La carte') + ' se consulte sur l\'écran de l\'hôte pour l\'instant.' });
      return;
    }
  }
  /* pavé de navigation : pilote les menus (écran-titre, pause, sac, carte...) */
  if (d.t === 'nav') { remoteNav(String(d.d)); return; }
  /* Aiguillage : ce téléphone parle POUR SON personnage — jamais pour
     l'autre. Si le J2 n'est pas (encore) en jeu, ses entrées de gameplay
     sont ignorées plutôt que de retomber sur le J1. */
  const isP2 = c.player === 2;
  const p2live = S.COOP && !!p2.mesh;
  if (G.dialog) { if (d.t === 'atkdown' || d.t === 'interact' || d.t === 'jumpdown') dlgNext(); return; }
  if (d.t === 'move') {
    /* carte ouverte : le joystick la fait défiler (comme le stick manette) */
    if (G.mapOpen) { mapPan((d.x || 0) * 26, -(d.z || 0) * 26); return; }
    if (!G.started || G.over) return;
    const mv = isP2 ? tm2Move : tmMove;
    mv.x = d.x || 0; mv.z = d.z || 0;
    return;
  }
  if (!G.started || G.over) return; // le reste est du gameplay pur
  if (d.t === 'look' && !G.paused && !anyPanelOpen()) {
    const s = 0.0052 * settings.padSens;
    if (isP2) {
      if (!p2live) return;
      p2.yaw -= (d.dx || 0) * s;
      p2.pitch -= (d.dy || 0) * s * (settings.invertY ? -1 : 1);
      p2.pitch = Math.max(-1.22, Math.min(0.85, p2.pitch));
    } else {
      S.yaw -= (d.dx || 0) * s;
      S.pitch -= (d.dy || 0) * s * (settings.invertY ? -1 : 1);
      S.pitch = Math.max(-1.22, Math.min(0.85, S.pitch));
    }
  }
  else if (d.t === 'jumpdown') {
    if (isP2) { if (!G.paused && p2live) p2.jumpQ = 0.14; S.tm2JumpHeld = true; }
    else { if (!G.paused) S.jumpQueued = 0.14; S.tmJumpHeld = true; }
  }
  else if (d.t === 'jumpup') { if (isP2) S.tm2JumpHeld = false; else S.tmJumpHeld = false; }
  else if (d.t === 'atkdown') {
    // toujours l'attaque de base (maintenir = enchaîner) — les sorts ont leurs boutons
    if (isP2) S.tm2BoltHeld = true; else S.tmBoltHeld = true;
  }
  else if (d.t === 'atkup') { if (isP2) S.tm2BoltHeld = false; else S.tmBoltHeld = false; }
  else if (d.t === 'interact' && !G.paused) { if (isP2) { if (p2live) tryInteractP2(); } else tryInteract(); }
  else if (d.t === 'cast' && !G.paused && !G.inv && !G.treeOpen &&
           POWERS.some(p => p.id === d.id)) {
    if (isP2) { if (p2live) castSpecific(d.id, p2); }
    else castSpecific(d.id);
  }
  else if (d.t === 'bag') toggleInv();       // 🎒 sac-atelier (fige le jeu)
  /* ✥ arbre des pouvoirs : celui DU JOUEUR qui appuie — le téléphone du J2
     ouvre l'arbre du J2 (ses points, ses nœuds, ses Éclats), v8.7 */
  else if (d.t === 'tree') toggleTree(isP2 && p2live ? 2 : 1);
  else if (d.t === 'map') {                  // 🗺 carte d'Ombreciel
    if (!G.paused && !G.inv && !G.treeOpen && !G.travelOpen) toggleMap();
  }
  else if (d.t === 'potion') { if (!G.paused) craftAction('H'); } // 🧪 boire une potion
  else if (d.t === 'pause' && !G.dialog) {
    G.paused = !G.paused; $('pause').classList.toggle('hidden', !G.paused);
  }
}

/* Un téléphone se déconnecte : on libère son personnage et ses entrées. */
function dropCtrl(c) {
  const i = S.ctrlConns.indexOf(c);
  if (i < 0) return;
  S.ctrlConns.splice(i, 1);
  try { if (c.call) c.call.close(); } catch (e) {} // referme le flux vidéo du joueur en ligne
  if (c.player === 2) { tm2Move.x = 0; tm2Move.z = 0; S.tm2BoltHeld = false; S.tm2JumpHeld = false; }
  else if (c.player === 1) { tmMove.x = 0; tmMove.z = 0; S.tmBoltHeld = false; S.tmJumpHeld = false; }
  updateQrStatus();
  broadcastWelcome();
  showMsg('📱 Manette smartphone déconnectée' + (c.player ? ' (Joueur ' + c.player + ')' : '') + '.', 3);
}

/* Poussé chaque frame par la boucle principale (main.js) : préviens les
   téléphones quand un menu s'ouvre/se ferme, qu'un sort est appris, que la
   partie démarre... N'envoie QUE si quelque chose a changé. */
let lastUiJson = '';
export function pushCtrlState() {
  if (!S.ctrlConns.length) return;
  const msg = {
    t: 'ui', panel: anyPanelOpen() || '', started: G.started, paused: G.paused,
    dialog: !!G.dialog, powers: G.powers,
    icons: { 1: PATHS[G.path].icon, 2: (S.COOP && p2.mesh) ? PATHS[p2.path].icon : PATHS[S.P2PATH].icon }
  };
  const j = JSON.stringify(msg);
  if (j === lastUiJson) return;
  lastUiJson = j;
  broadcast(msg);
}

export function openManettePanel() {
  $('qrpanel').classList.remove('hidden');
  $('btn-qrretry').classList.add('hidden');
  if (location.protocol === 'file:') {
    $('qrstatus').textContent = '⚠ La manette smartphone nécessite un hébergement en ligne (Netlify, GitHub Pages...). Elle ne fonctionne pas depuis un fichier local.';
    return;
  }
  if (S.hostPeer && !S.hostPeer.destroyed) {
    if (S.ctrlConns.length) updateQrStatus();
    else $('qrstatus').textContent = 'En attente du smartphone... (scannez le QR)';
    return;
  }
  $('qrstatus').textContent = 'Initialisation...';
  clearTimeout(S.hostConnTimer); // évite qu'un délai d'attente d'un pair précédent n'écrase ce nouveau statut
  /* v8.8 — l'identifiant du pair EST le code de partie ('ombreciel-CODE') :
     le même pair sert les manettes smartphone (QR) ET le joueur en ligne
     (saisie du code sur l'autre PC). Code déjà pris → on en retire un autre. */
  const code = makeRoomCode();
  S.hostPeer = new Peer(ROOM_PREFIX + code, peerOpts());
  S.hostPeer.on('open', id => {
    const url = location.origin + location.pathname + '?controller=' + id;
    $('qrlink').textContent = url;
    QRCode.toDataURL(url, { width: 180, margin: 1 }, (err, dataUrl) => {
      if (err) { $('qrstatus').textContent = 'Erreur de génération du QR code.'; return; }
      $('qrcode').innerHTML = '<img src="' + dataUrl + '" width="180" height="180" alt="QR manette"/>';
    });
    const rc = $('roomcode');
    if (rc) rc.innerHTML = '🌐 Code de partie en ligne : <b>' + code + '</b><small>Sur l\'autre PC : ouvrez le jeu → « Rejoindre une partie en ligne » → entrez ce code.</small>';
    $('qrstatus').textContent = 'Scannez le QR code avec votre smartphone';
    clearTimeout(S.hostConnTimer);
    S.hostConnTimer = setTimeout(() => {
      if (!S.ctrlConns.length) $('qrstatus').textContent = 'Toujours en attente... Vérifiez que le smartphone a bien internet (pas seulement le QR scanné), et que le PC n\'est pas derrière un VPN.';
    }, 18000);
  });
  S.hostPeer.on('connection', conn => {
    clearTimeout(S.hostConnTimer);
    const c = { conn, player: null };
    conn.on('open', () => {
      S.ctrlConns.push(c);
      updateQrStatus();
      $('btn-qrretry').classList.add('hidden');
      sendTo(c, welcomeMsg());
      showMsg('📱 Manette smartphone connectée ! Choisissez personnage et voie sur le téléphone.', 3.5);
    });
    conn.on('data', d => handleCtrlMsg(c, d));
    conn.on('close', () => dropCtrl(c));
    conn.on('error', () => dropCtrl(c));
  });
  S.hostPeer.on('disconnected', () => {
    $('qrstatus').textContent = 'Connexion instable... reconnexion en cours.';
    try { S.hostPeer.reconnect(); } catch (e) {}
  });
  S.hostPeer.on('error', e => {
    /* code de partie déjà pris sur le réseau : on en retire un autre */
    if (e.type === 'unavailable-id') { retryManette(); return; }
    $('qrstatus').textContent = 'Erreur : ' + e.type + '. Vérifiez la connexion internet des deux appareils, ou réessayez.';
    $('btn-qrretry').classList.remove('hidden');
  });
}
export function retryManette() {
  try { if (S.hostPeer) S.hostPeer.destroy(); } catch (e) {}
  S.hostPeer = null; S.ctrlConns.length = 0;
  openManettePanel();
}

/* ================================================================
   CÔTÉ TÉLÉPHONE (?controller=ID) — deux écrans :
   · CONFIGURATION : choisir son personnage (J1/J2) et sa voie, puis
     « Prendre la manette » (on peut y revenir avec ⚙).
   · MANETTE : joystick (à fond = sprint), caméra tactile, attaque, saut,
     interagir, les 7 sorts, sac, pouvoirs, carte, potion, pause — et un
     pavé de navigation qui surgit dès qu'un menu est ouvert sur l'écran.
   ================================================================ */
export function startControllerMode() {
  document.head.insertAdjacentHTML('beforeend',
    '<style>' +
    'html,body{margin:0;background:#05060d;color:#e8e0cc;font-family:Georgia,serif;overflow:hidden}' +
    '#nwrap{position:fixed;inset:0;touch-action:none;overflow:hidden}' +
    '#nstatus{position:fixed;left:10px;bottom:6px;right:10px;text-align:center;color:#ffd97a;font-size:11px;' +
      'font-family:Verdana,sans-serif;pointer-events:none;text-shadow:0 1px 3px #000;z-index:9}' +
    /* ---------- écran de configuration ---------- */
    '#nsetup{position:fixed;inset:0;background:#05060d;overflow-y:auto;padding:14px 16px 40px;z-index:5;text-align:center}' +
    '#nsetup h2{color:#8fc8ff;letter-spacing:2px;font-weight:normal;font-size:17px;margin:4px 0 2px}' +
    '#nsetup .nsub{color:#94a0c4;font-family:Verdana,sans-serif;font-size:11px;margin-bottom:10px}' +
    '.nsec{color:#ffd97a;letter-spacing:2px;font-size:12px;margin:12px 0 6px}' +
    '.nrow{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}' +
    '.nopt{background:rgba(10,13,28,.85);border:1px solid rgba(150,180,255,.3);border-radius:10px;color:#cfd8f2;' +
      'padding:10px 14px;font-family:Georgia,serif;font-size:14px;min-width:120px;position:relative}' +
    '.nopt.sel{border-color:#ffd97a;box-shadow:0 0 14px rgba(255,215,120,.4);color:#ffd97a}' +
    '.nopt .ntaken{display:block;font-size:10px;font-family:Verdana,sans-serif;color:#ff9a7a;margin-top:3px}' +
    '.nopt small{display:block;font-size:10px;font-family:Verdana,sans-serif;color:#94a0c4;margin-top:3px}' +
    /* voie figée (reconnexion en pleine partie) : les autres voies s'estompent */
    '.nopt.lockedpath{opacity:.35}' +
    '#npathnote{font-size:10px;font-family:Verdana,sans-serif;color:#94a0c4;margin-top:8px;min-height:13px}' +
    '#n-go{margin-top:16px;background:#1a2142;color:#ffd97a;border:1px solid #ffd97a;border-radius:10px;' +
      'padding:12px 30px;font-family:Georgia,serif;font-size:16px;letter-spacing:1px}' +
    '#nsetupmsg{margin-top:10px;color:#ff9a7a;font-family:Verdana,sans-serif;font-size:11px;min-height:15px}' +
    /* ---------- écran manette ---------- */
    '#npad{position:fixed;inset:0;display:none}' +
    '#nlook{position:absolute;top:0;right:0;width:58%;height:100%}' +
    '#njoy{position:absolute;left:22px;bottom:30px;width:132px;height:132px;border-radius:50%;' +
      'background:rgba(20,26,52,.4);border:2px solid rgba(150,180,255,.4)}' +
    '#njoyknob{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px;border-radius:50%;' +
      'background:rgba(140,170,255,.5);border:2px solid rgba(200,220,255,.65)}' +
    '#njoyhint{position:absolute;left:26px;bottom:8px;width:124px;text-align:center;color:#5f6b8c;' +
      'font-size:9px;font-family:Verdana,sans-serif;pointer-events:none}' +
    '.nbtn{position:absolute;border-radius:50%;border:2px solid rgba(150,180,255,.4);background:rgba(15,19,40,.6);' +
      'color:#e8e0cc;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;' +
      'text-shadow:0 0 8px rgba(120,180,255,.7);user-select:none;-webkit-user-select:none;z-index:3}' +
    '.nbtn:active{background:rgba(70,90,160,.65)}' +
    '.nbtn.locked{opacity:.32}' +
    '#n-atk{right:22px;bottom:34px;width:92px;height:92px;font-size:30px;border-color:rgba(255,170,110,.6)}' +
    '#n-jmp{right:126px;bottom:112px;width:64px;height:64px;font-size:22px}' +
    '#n-act{right:34px;bottom:144px;width:54px;height:54px;font-size:19px;border-color:rgba(140,255,180,.5)}' +
    /* rangée du haut : sorts (droite) + pause · rangée 2 : sac, pouvoirs, carte, potion, config */
    '.nspell{top:10px;width:44px;height:44px;font-size:17px}' +
    '#ns-dash{right:64px}#ns-tk{right:114px}#ns-shield{right:164px}#ns-frost{right:214px}' +
    '#ns-heal{right:264px}#ns-nova{right:314px}#ns-meteor{right:364px}' +
    '#n-pau{right:12px;top:10px;width:44px;height:44px;font-size:14px}' +
    '.nmenu{top:62px;width:44px;height:44px;font-size:17px;border-color:rgba(255,215,120,.45)}' +
    '#n-bag{right:12px}#n-tree{right:64px}#n-map{right:116px}#n-potion{right:168px}#n-setup{right:220px}' +
    '#nbadge{position:absolute;left:12px;top:10px;z-index:3;background:rgba(15,19,40,.7);border:1px solid rgba(255,215,120,.5);' +
      'border-radius:9px;padding:6px 12px;color:#ffd97a;font-size:13px;pointer-events:none}' +
    /* ---------- pavé de navigation des menus ---------- */
    '#nnav{position:fixed;inset:0;background:rgba(5,6,13,.86);z-index:6;display:none;align-items:center;justify-content:center}' +
    '#nnav .nvbox{text-align:center}' +
    '#nnav .nvtitle{color:#8fc8ff;letter-spacing:1px;font-size:13px;margin-bottom:10px;font-family:Verdana,sans-serif}' +
    '#nnav .nvgrid{display:grid;grid-template-columns:64px 64px 64px;grid-gap:8px;justify-content:center;margin-bottom:12px}' +
    '.nvb{width:64px;height:56px;border-radius:12px;border:2px solid rgba(150,180,255,.45);background:rgba(15,19,40,.8);' +
      'color:#e8e0cc;font-size:20px;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none}' +
    '.nvb:active{background:rgba(70,90,160,.65)}' +
    '.nvb.nvok{border-color:#ffd97a;color:#ffd97a}' +
    '#nnav .nvrow{display:flex;gap:10px;justify-content:center}' +
    '.nvb.wide{width:100px;font-size:14px}' +
    '#nnav .nvzoom{display:none;margin-top:10px}' +
    '#nnav.map .nvzoom{display:flex;gap:10px;justify-content:center}' +
    '</style>');
  document.body.innerHTML =
    '<div id="nwrap">' +
    /* ---- écran de configuration ---- */
    '<div id="nsetup">' +
    '<h2>✦ MANETTE — LES TOURS D\'OMBRECIEL</h2>' +
    '<div class="nsub" id="nconn">Connexion au jeu...</div>' +
    '<div class="nsec">QUEL PERSONNAGE ?</div>' +
    '<div class="nrow" id="nplayers">' +
    '<button class="nopt sel" data-player="1">🔵 Joueur 1<small>le porteur principal</small><span class="ntaken hidden"></span></button>' +
    '<button class="nopt" data-player="2">🟣 Joueur 2<small>active le mode 2 joueurs (écran scindé)</small><span class="ntaken hidden"></span></button>' +
    '</div>' +
    '<div class="nsec">QUELLE VOIE ?</div>' +
    '<div class="nrow" id="npaths"></div>' +
    '<div id="npathnote"></div>' +
    '<button id="n-go">🎮 PRENDRE LA MANETTE</button>' +
    '<div id="nsetupmsg"></div>' +
    '</div>' +
    /* ---- écran manette ---- */
    '<div id="npad">' +
    '<div id="nlook"></div>' +
    '<div id="njoy"><div id="njoyknob"></div></div>' +
    '<div id="njoyhint">joystick à fond = sprint</div>' +
    '<div id="nbadge">J1</div>' +
    '<div class="nbtn" id="n-atk">✦</div>' +
    '<div class="nbtn" id="n-jmp">▲</div>' +
    '<div class="nbtn" id="n-act">E</div>' +
    '<div class="nbtn nspell" id="ns-dash" title="Pas du vent">⟫</div>' +
    '<div class="nbtn nspell" id="ns-tk" title="Main céleste">☄</div>' +
    '<div class="nbtn nspell" id="ns-shield" title="Égide">◎</div>' +
    '<div class="nbtn nspell" id="ns-frost" title="Souffle glacé">❄</div>' +
    '<div class="nbtn nspell" id="ns-heal" title="Bénédiction">✚</div>' +
    '<div class="nbtn nspell" id="ns-nova" title="Nova d\'Aurore">✹</div>' +
    '<div class="nbtn nspell" id="ns-meteor" title="Astre d\'Aube">✵</div>' +
    '<div class="nbtn" id="n-pau">II</div>' +
    '<div class="nbtn nmenu" id="n-bag" title="Sac &amp; atelier">🎒</div>' +
    '<div class="nbtn nmenu" id="n-tree" title="Arbre des pouvoirs">✥</div>' +
    '<div class="nbtn nmenu" id="n-map" title="Carte">🗺</div>' +
    '<div class="nbtn nmenu" id="n-potion" title="Boire une potion">🧪</div>' +
    '<div class="nbtn nmenu" id="n-setup" title="Personnage / voie">⚙</div>' +
    '</div>' +
    /* ---- pavé de navigation (menus ouverts sur l'écran du jeu) ---- */
    '<div id="nnav"><div class="nvbox">' +
    '<div class="nvtitle" id="nnavtitle">Un menu est ouvert sur l\'écran — naviguez ici</div>' +
    '<div class="nvgrid">' +
    '<span></span><div class="nvb" data-nav="up">▲</div><span></span>' +
    '<div class="nvb" data-nav="left">◀</div><div class="nvb nvok" data-nav="ok">OK</div><div class="nvb" data-nav="right">▶</div>' +
    '<span></span><div class="nvb" data-nav="down">▼</div><span></span>' +
    '</div>' +
    '<div class="nvrow"><div class="nvb wide" data-nav="back">↩ Retour</div></div>' +
    '<div class="nvzoom"><div class="nvb" data-nav="zoomin">＋</div><div class="nvb" data-nav="zoomout">−</div></div>' +
    '</div></div>' +
    '<div id="nstatus">Connexion au jeu...</div>' +
    '</div>';
  const el = id => document.getElementById(id);
  const setStatus = t => { const e = el('nstatus'); if (e) e.textContent = t; };
  const setConn = t => { const e = el('nconn'); if (e) e.textContent = t; };
  const setupMsg = t => { const e = el('nsetupmsg'); if (e) e.textContent = t || ''; };
  const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };

  /* ---- état local du téléphone ---- */
  const st = { player: 1, path: 'mage', joined: false, screen: 'setup', panel: '' };
  let welcome = null;

  function showScreen(name) {
    st.screen = name;
    el('nsetup').style.display = name === 'setup' ? 'block' : 'none';
    el('npad').style.display = name === 'pad' ? 'block' : 'none';
    syncNavOverlay();
  }
  function syncNavOverlay() {
    const nav = el('nnav');
    const show = st.screen === 'pad' && !!st.panel;
    nav.style.display = show ? 'flex' : 'none';
    nav.classList.toggle('map', st.panel === 'map');
    if (show) el('nnavtitle').textContent = st.panel === 'map'
      ? 'Carte : ▲▼◀▶ déplacer · ＋/− zoom · OK centrer · ↩ fermer'
      : 'Un menu est ouvert sur l\'écran — ▲▼ choisir · OK valider · ↩ fermer';
  }
  /* la voie du personnage choisi est-elle déjà FIGÉE côté jeu ? (partie en
     cours : on reprend la classe saisie au début, sans la redemander) */
  function lockedPathFor(playerN) {
    if (!welcome) return null;
    const info = playerN === 1 ? welcome.p1 : welcome.p2;
    return (info && info.locked && info.path) ? info.path : null;
  }
  function renderSetup() {
    /* personnages : marque « tenu » (par UN AUTRE téléphone) — le choisir le
       REPREND (reconnexion après plantage : plus aucun blocage, v8.7) */
    el('nplayers').querySelectorAll('.nopt').forEach(b => {
      const n = +b.dataset.player;
      const taken = !!welcome && (n === 1 ? welcome.p1.taken : welcome.p2.taken) && !(st.joined && st.player === n);
      b.querySelector('.ntaken').textContent = taken ? '↺ tenu par un autre téléphone — le choisir le reprend ici' : '';
      b.classList.toggle('sel', st.player === n);
    });
    /* voies : le téléphone charge la même application que le jeu — PATHS
       est déjà là, l'écran est complet avant même la connexion */
    const box = el('npaths');
    if (!box.childElementCount) {
      for (const id of Object.keys(PATHS)) {
        const b = document.createElement('button');
        b.className = 'nopt'; b.dataset.path = id;
        b.innerHTML = PATHS[id].icon + ' ' + PATHS[id].name;
        b.addEventListener('click', () => {
          if (lockedPathFor(st.player)) { buzz(30); return; } // voie figée : reconnexion
          st.path = id; buzz(8); renderSetup();
        });
        box.appendChild(b);
      }
    }
    /* reconnexion en pleine partie : la voie déjà assignée est reprise telle
       quelle — pas de re-choix de classe (elle a été saisie au début du jeu) */
    const lockP = lockedPathFor(st.player);
    if (lockP && PATHS[lockP]) st.path = lockP;
    box.querySelectorAll('.nopt').forEach(b => {
      b.classList.toggle('sel', b.dataset.path === st.path);
      b.classList.toggle('lockedpath', !!lockP && b.dataset.path !== lockP);
    });
    const note = el('npathnote');
    if (note) note.textContent = lockP
      ? 'Partie en cours : la voie de ce personnage a déjà été choisie — elle est conservée pour la reconnexion.'
      : '';
    if (welcome) setConn(welcome.started
      ? '✓ Connecté — partie en cours' + (welcome.coop ? ' (2 joueurs)' : '')
      : '✓ Connecté — le jeu est à l\'écran-titre : tout se choisit d\'ici !');
  }
  function applyUi(d) {
    st.panel = d.panel || '';
    syncNavOverlay();
    /* sorts appris : les boutons verrouillés s'estompent (le jeu re-vérifie) */
    if (d.powers) for (const id of ['dash', 'tk', 'shield', 'frost', 'heal', 'nova', 'meteor']) {
      const b = el('ns-' + id);
      if (b) b.classList.toggle('locked', !d.powers[id]);
    }
    if (d.icons) { const a = el('n-atk'); if (a) a.textContent = d.icons[st.player] || '✦'; }
    if (st.screen === 'pad') {
      setStatus(d.dialog ? '💬 Dialogue : ✦ ou E pour continuer' :
        d.paused ? 'II Jeu en pause' :
        !d.started ? 'Écran-titre : le pavé de navigation pilote les menus' :
        '✓ Joueur ' + st.player + ' — bon jeu !');
    }
  }

  /* ---- connexion PeerJS (reconnexion automatique) ---- */
  let conn = null, peer = null, tries = 0;
  const send = msg => { if (conn) { try { conn.send(msg); } catch (e) {} } };
  function connect() {
    peer = new Peer(undefined, { config: ICE_CONFIG });
    peer.on('open', () => {
      conn = peer.connect(CTRL_ID, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        tries = 0;
        setStatus('✓ Connecté'); setConn('✓ Connecté');
        buzz(20);
        send({ t: 'hello' });
        /* reconnexion : on reprend son personnage automatiquement */
        if (st.joined) send({ t: 'join', player: st.player, path: st.path });
      });
      conn.on('data', d => {
        if (!d || !d.t) return;
        if (d.t === 'welcome') { welcome = d; renderSetup(); if (d.powers) applyUi({ panel: st.panel, powers: d.powers, started: d.started }); }
        else if (d.t === 'joined') {
          st.joined = true; st.player = d.player;
          if (d.path) st.path = d.path;
          el('nbadge').textContent = (st.player === 1 ? '🔵 J1' : '🟣 J2') + ' · ' + st.path.toUpperCase();
          setupMsg('');
          showScreen('pad');
          setStatus('✓ Joueur ' + st.player + ' — bon jeu !');
          buzz(30);
        }
        else if (d.t === 'deny') { st.joined = false; setupMsg(d.reason || 'Personnage indisponible.'); showScreen('setup'); buzz(60); }
        /* v8.7 : un autre téléphone a repris ce personnage (rescan du QR) —
           cette manette retourne à l'écran de choix, sans rien bloquer */
        else if (d.t === 'released') { st.joined = false; setupMsg(d.reason || 'Personnage repris par un autre téléphone.'); showScreen('setup'); buzz(60); }
        else if (d.t === 'toast') { setupMsg(d.msg); setStatus(d.msg); }
        else if (d.t === 'ui') applyUi(d);
      });
      conn.on('close', () => { setStatus('Déconnecté. Nouvelle tentative...'); retry(); });
      conn.on('error', () => { setStatus('Erreur de connexion. Nouvelle tentative...'); retry(); });
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

  /* ---- écran de configuration : choix personnage + « Prendre la manette » ---- */
  el('nplayers').querySelectorAll('.nopt').forEach(b =>
    b.addEventListener('click', () => { st.player = +b.dataset.player; buzz(8); renderSetup(); }));
  el('n-go').addEventListener('click', () => {
    setupMsg('');
    if (!conn) { setupMsg('Pas encore connecté au jeu...'); return; }
    send({ t: 'join', player: st.player, path: st.path });
    buzz(15);
  });

  /* ---- écran manette : joystick, caméra et boutons. Câblé UNE SEULE FOIS
     (le DOM ne change pas d'une reconnexion à l'autre) : `send` regarde
     toujours la connexion `conn` courante, jamais une connexion périmée —
     sinon chaque reconnexion empilerait écouteurs et setInterval. ---- */
  const joy = el('njoy'), knob = el('njoyknob');
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
  setInterval(() => { if (st.screen === 'pad') send({ t: 'move', x: lastMx, z: lastMz }); }, 50);
  const look = el('nlook');
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
    const b = el(id);
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      send({ t: downMsg });
      buzz(12);
    });
    if (upMsg) b.addEventListener('pointerup', e => { e.preventDefault(); send({ t: upMsg }); });
    if (upMsg) b.addEventListener('pointercancel', () => send({ t: upMsg }));
  };
  bind('n-atk', 'atkdown', 'atkup');
  bind('n-jmp', 'jumpdown', 'jumpup');
  bind('n-act', 'interact');
  /* Un bouton par sort, comme la manette Xbox et l'écran tactile du jeu
     (l'hôte vérifie que le sort est appris avant de le lancer). */
  for (const id of ['dash', 'tk', 'shield', 'frost', 'heal', 'nova', 'meteor']) {
    el('ns-' + id).addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      send({ t: 'cast', id });
      buzz(12);
    });
  }
  bind('n-pau', 'pause');
  bind('n-bag', 'bag');       // 🎒 sac & atelier
  bind('n-tree', 'tree');     // ✥ arbre des pouvoirs (améliorations)
  bind('n-map', 'map');       // 🗺 carte d'Ombreciel
  bind('n-potion', 'potion'); // 🧪 potion lunaire
  el('n-setup').addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    send({ t: 'hello' }); // rafraîchit l'état des personnages avant d'afficher
    showScreen('setup');
    buzz(10);
  });
  /* pavé de navigation : impulsion immédiate + répétition tant qu'on maintient */
  document.querySelectorAll('#nnav .nvb').forEach(b => {
    let rep = null;
    const fire = () => { send({ t: 'nav', d: b.dataset.nav }); buzz(8); };
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      fire();
      clearInterval(rep);
      rep = setInterval(fire, 170);
    });
    const stop = () => clearInterval(rep);
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('pointerleave', stop);
  });
  renderSetup(); // les voies s'affichent tout de suite (PATHS est local)
  showScreen('setup');
}
