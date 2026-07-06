/* ================================================================
   v9.2 — JOUEUR EN LIGNE (2ᵉ PC) : SA PROPRE COPIE DU MOTEUR 3D
   Jusqu'à la v9.1, l'hôte calculait ET diffusait une VIDÉO du jeu au
   second PC : coûteux en GPU (deux scènes 3D complètes par image) ET
   sujet aux saccades du moindre aléa réseau. Ici, ce PC construit
   EXACTEMENT LE MÊME MONDE (mêmes fonctions, mêmes assets, même code
   que l'hôte) et ne reçoit que l'ÉTAT du jeu — positions, PV, portes,
   butin (quelques Ko/s) — à ~16 images/seconde (Network.pushWorldSnap).
   Chaque machine calcule sa PROPRE image avec son PROPRE GPU.

   L'hôte reste 100 % autorité (physique, combats, XP, sauvegarde) :
   · SON PROPRE personnage est simulé LOCALEMENT (les MÊMES fonctions
     updatePlayer/updateP2 que l'hôte, avec l'entrée LOCALE, immédiate)
     puis recalé en douceur sur la position que l'hôte confirme —
     prédiction + réconciliation, comme la plupart des jeux multijoueurs
     en temps réel. La caméra, elle, tourne à la souris SANS AUCUNE
     latence (jamais soumise au réseau).
   · L'AUTRE porteur et les ombres n'ont pas d'entrée locale : leur
     position/rotation/PV sont simplement interpolées d'après les
     dernières données reçues de l'hôte.
   · L'arbre des pouvoirs et la Forge restent gérés par messages dédiés
     (treereq/forgereq...), un panneau local séparé — inchangés depuis
     la version précédente, indépendants du rendu.
   ================================================================ */
import Peer from 'peerjs';
import {
  G, S, PATHS, POWERS, TREE_COMMON, TREES, PUPG, RARITIES, RARITY_ORDER, SLOT_DEFS, SAVE_KEY,
  keys, player, p2, enemies, doors, pickups, applyPath, loadSettings
} from './state.js';
import { RES, FORGE_COST, FUSE_COSTS } from './Crafting.js';
import { $, showMsg, buildPowersUI, updateHUD } from './UI.js';
import { loadAssets } from './AssetManager.js';
import {
  initScene, buildWorld, buildHerbs, buildExtraPatrols, bivouac, mkAnvil, openDoor,
  updateDoors, updatePickups, updateParticles
} from './World.js';
import { updateDayNight } from './DayNight.js';
import { buildPlayer, buildPlayer2, updatePlayer, updateP2, updateCamera, updateCamera2, lerpAngle } from './Player.js';
import { mkEnemy } from './Enemies.js';
import { updateFx } from './Animations.js';
import { buildTowerGate } from './Tower.js';
import { peerOpts, ROOM_PREFIX } from './Network.js';

export function startNetClient(code) {
  code = String(code || '').trim().toUpperCase();
  document.title = 'Ombreciel — en ligne (' + code + ')';
  S.isNetClient = true;
  // pas de rendu tant que la partie n'est pas rejointe : le vrai titre/chargement restent masqués
  const titleEl = $('title'); if (titleEl) titleEl.classList.add('hidden');
  const loadingEl = $('loading'); if (loadingEl) loadingEl.classList.add('hidden');

  const st = { player: 2, path: 'mage', joined: false, treeOpen: false, forgeOpen: false };
  let welcome = null;
  let myWho = 2;
  let conn = null, peer = null, tries = 0, videoAskedNoop = false;
  let latestSnap = null, hourSynced = false, booted = false;

  /* ================= écran de configuration (avant de jouer) =================
     Repris quasiment tel quel de l'ancienne version vidéo : choix du
     personnage (J1/J2) et de la voie, avant que la partie 3D ne démarre. */
  document.head.insertAdjacentHTML('beforeend',
    '<style>' +
    '#nsetup{position:fixed;inset:0;background:radial-gradient(ellipse at 50% 32%,#151b36 0%,#05060d 72%);overflow-y:auto;padding:26px 18px 40px;z-index:50;text-align:center;color:#e8e0cc;font-family:Georgia,serif}' +
    '#nsetup h2{color:#8fc8ff;letter-spacing:3px;font-weight:normal;font-size:20px;margin-bottom:4px}' +
    '#nsetup .nsub{color:#94a0c4;font-family:Verdana,sans-serif;font-size:12px;margin-bottom:14px}' +
    '#nsetup .nsec{color:#ffd97a;letter-spacing:2px;font-size:13px;margin:16px 0 8px}' +
    '#nsetup .nrow{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}' +
    '#nsetup .nopt{background:rgba(10,13,28,.85);border:1px solid rgba(150,180,255,.3);border-radius:10px;color:#cfd8f2;padding:11px 16px;font-family:Georgia,serif;font-size:15px;min-width:130px;cursor:pointer}' +
    '#nsetup .nopt.sel{border-color:#ffd97a;box-shadow:0 0 14px rgba(255,215,120,.4);color:#ffd97a}' +
    '#nsetup .nopt.lockedpath{opacity:.35}' +
    '#nsetup .nopt .ntaken{display:block;font-size:10px;font-family:Verdana,sans-serif;color:#ff9a7a;margin-top:3px}' +
    '#nsetup .nopt small{display:block;font-size:10px;font-family:Verdana,sans-serif;color:#94a0c4;margin-top:3px}' +
    '#nsetup #nnote{font-size:10px;font-family:Verdana,sans-serif;color:#94a0c4;margin-top:10px;min-height:13px}' +
    '#nsetup #ngo{margin-top:18px;font-size:17px;padding:12px 34px;font-family:Georgia,serif;color:#ffd97a;background:#1a2142;border:1px solid #ffd97a;border-radius:9px;cursor:pointer}' +
    '#nsetup #nmsg{margin-top:10px;color:#ff9a7a;font-family:Verdana,sans-serif;font-size:11px;min-height:15px}' +
    '#nstatus{position:fixed;top:12px;right:16px;z-index:51;font-size:11px;font-family:Verdana,sans-serif;color:#ffd97a;text-shadow:0 1px 3px #000;text-align:right}' +
    /* ---- panneaux Arbre / Forge du joueur en ligne (réseau dédié) ---- */
    '#ntree,#nforge{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(760px,94vw);max-height:88vh;overflow-y:auto;background:rgba(5,7,15,.95);border:1px solid rgba(232,224,204,.2);border-radius:14px;padding:22px 26px;z-index:52;display:none;color:#e8e0cc;font-family:Georgia,serif}' +
    '#ntree h3,#nforge h3{color:#ffd97a;font-weight:normal;letter-spacing:4px;font-size:15px;margin-bottom:6px}' +
    '#ntree .pts,#nforge .ftop{font-size:11px;font-family:Verdana,sans-serif;color:#7f8bb0;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(232,224,204,.1)}' +
    '#ntree .pts b,#nforge .ftop b{color:#ffd97a;font-weight:normal}' +
    '#ntree .br,#nforge .br{color:#8fc8ff;font-size:11px;letter-spacing:3px;margin:14px 0 8px;text-transform:uppercase}' +
    '#nforgehelp{background:rgba(255,217,122,.08);border:1px solid rgba(255,217,122,.3);border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:11px;font-family:Verdana,sans-serif;line-height:1.6}' +
    '#nforgehelp b{color:#ffd97a}' +
    '#ntree .nds,#nforge .gearrow,#nforge .gearlist{display:flex;gap:9px;flex-wrap:wrap}' +
    '.nnd{width:214px;background:rgba(255,255,255,.03);border:1px solid rgba(150,180,255,.14);border-radius:10px;padding:10px 11px;cursor:pointer;text-align:left}' +
    '.nnd.owned{border-color:rgba(60,220,140,.5);background:rgba(60,220,140,.05);cursor:default}' +
    '.nnd.locked{opacity:.35;cursor:default}' +
    '.nnd.buyable{border-color:rgba(255,215,120,.45)}' +
    '.nnd .tn{font-size:13px;color:#e8e0cc}.nnd.owned .tn{color:#9fffc8}' +
    '.nnd .td{font-size:10px;font-family:Verdana,sans-serif;color:#8791b4;line-height:1.5;margin-top:4px}' +
    '.nnd .tr{font-size:9px;font-family:Verdana,sans-serif;color:#5c6788;margin-top:6px;padding-top:5px;border-top:1px solid rgba(232,224,204,.07)}' +
    '.nnd .stars{color:#8feaff;font-size:10px;letter-spacing:2px;margin-left:5px}' +
    '.ngearslot{width:214px}.ngsl{font-size:11px;letter-spacing:2px;color:#8fa0c8;margin-bottom:4px}' +
    '.ngearempty{font-size:11px;font-family:Verdana,sans-serif;color:#5c6788;font-style:italic;padding:10px 4px}' +
    '.ngearcard{width:214px;background:rgba(255,255,255,.03);border:1px solid rgba(150,180,255,.14);border-radius:10px;padding:10px 11px;text-align:left}' +
    '.ngearcard .gn{font-size:13px}.ngearcard .gn em{font-style:normal;font-size:9px;font-family:Verdana,sans-serif;opacity:.8;margin-left:4px}' +
    '.ngearcard .gs{font-size:10px;font-family:Verdana,sans-serif;color:#8791b4;line-height:1.5;margin-top:4px}' +
    '.ngcmp{font-size:9.5px;font-family:Verdana,sans-serif;margin-bottom:5px}' +
    '.ngcmp.up{color:#7ade8c}.ngcmp.eq{color:#8fa0c8}.ngcmp.dn{color:#c89ab0}' +
    '.ngearcard button,.nforgebtn{margin-top:7px;font-family:Georgia,serif;font-size:12px;color:#ffd97a;background:#1a2142;border:1px solid rgba(255,217,122,.5);border-radius:7px;padding:5px 10px;cursor:pointer}' +
    '.nforgebtn{width:214px;text-align:left}' +
    '.nforgebtn small{display:block;font-size:9px;font-family:Verdana,sans-serif;color:#8791b4;margin-top:3px}' +
    '@media (max-width:900px){.ngearslot,.ngearcard,.nforgebtn,.nnd{width:100%}}' +
    '</style>');
  document.body.insertAdjacentHTML('beforeend',
    '<div id="nstatus">Connexion...</div>' +
    '<div id="nsetup">' +
    '<h2>🌐 PARTIE EN LIGNE — LES TOURS D\'OMBRECIEL</h2>' +
    '<div class="nsub" id="nconn">Connexion à la partie <b>' + code + '</b>...</div>' +
    '<div class="nsec">QUEL PERSONNAGE ?</div>' +
    '<div class="nrow" id="nplayers">' +
    '<button class="nopt" data-player="1">🔵 Joueur 1<small>le porteur principal (hôte)</small><span class="ntaken"></span></button>' +
    '<button class="nopt sel" data-player="2">🟣 Joueur 2<small>rejoint la partie de l\'hôte</small><span class="ntaken"></span></button>' +
    '</div>' +
    '<div class="nsec">QUELLE VOIE ?</div>' +
    '<div class="nrow" id="npaths"></div>' +
    '<div id="nnote"></div>' +
    '<button id="ngo">🎮 REJOINDRE LA PARTIE</button>' +
    '<div id="nmsg"></div>' +
    '<div class="nsub" style="margin-top:18px">ZQSD/WASD bouger · souris caméra · clic attaquer · Espace saut · E agir · 1-8 sorts · K arbre · H potion · Échap menu</div>' +
    '</div>' +
    '<div id="ntree"></div><div id="nforge"></div>');
  const el = id => document.getElementById(id);
  const setStatus = t => { el('nstatus').textContent = t; };
  const setupMsg = t => { el('nmsg').textContent = t || ''; };

  function lockedPathFor(playerN) {
    if (!welcome) return null;
    const info = playerN === 1 ? welcome.p1 : welcome.p2;
    return (info && info.locked && info.path) ? info.path : null;
  }
  function renderSetup() {
    el('nplayers').querySelectorAll('.nopt').forEach(b => {
      const n = +b.dataset.player;
      const taken = !!welcome && (n === 1 ? welcome.p1.taken : welcome.p2.taken) && !(st.joined && st.player === n);
      b.querySelector('.ntaken').textContent = taken ? '↺ tenu ailleurs — le choisir le reprend ici' : '';
      b.classList.toggle('sel', st.player === n);
    });
    const box = el('npaths');
    if (!box.childElementCount) {
      for (const id of Object.keys(PATHS)) {
        const b = document.createElement('button');
        b.className = 'nopt'; b.dataset.path = id;
        b.innerHTML = PATHS[id].icon + ' ' + PATHS[id].name;
        b.addEventListener('click', () => { if (lockedPathFor(st.player)) return; st.path = id; renderSetup(); });
        box.appendChild(b);
      }
    }
    const lockP = lockedPathFor(st.player);
    if (lockP && PATHS[lockP]) st.path = lockP;
    box.querySelectorAll('.nopt').forEach(b => {
      b.classList.toggle('sel', b.dataset.path === st.path);
      b.classList.toggle('lockedpath', !!lockP && b.dataset.path !== lockP);
    });
    el('nnote').textContent = lockP
      ? 'Partie en cours : la voie de ce personnage a déjà été choisie — elle est conservée pour la reconnexion.'
      : '';
  }
  el('nplayers').querySelectorAll('.nopt').forEach(b =>
    b.addEventListener('click', () => { st.player = +b.dataset.player; renderSetup(); }));
  el('ngo').addEventListener('click', () => {
    setupMsg('');
    if (!conn || !conn.open) { setupMsg('Pas encore connecté à la partie... (code ' + code + ')'); return; }
    send({ t: 'join', player: st.player, path: st.path });
  });

  /* ================= connexion PeerJS (reconnexion automatique) ================= */
  function send(m) { if (conn) { try { conn.send(m); } catch (e) {} } }
  function connect() {
    peer = new Peer(undefined, peerOpts());
    peer.on('open', () => {
      conn = peer.connect(ROOM_PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        tries = 0;
        setStatus('✓ Connecté — partie ' + code);
        el('nconn').innerHTML = '✓ Connecté à la partie <b>' + code + '</b>';
        send({ t: 'hello' });
        if (st.joined) send({ t: 'join', player: st.player, path: st.path }); // reprise après coupure
      });
      conn.on('data', d => handleHostMsg(d));
      conn.on('close', () => { setStatus('Déconnecté. Nouvelle tentative...'); retry(); });
      conn.on('error', () => { setStatus('Erreur de connexion. Nouvelle tentative...'); retry(); });
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
    peer.on('error', e => {
      if (e.type === 'peer-unavailable') {
        setStatus('Partie « ' + code + ' » introuvable.');
        el('nconn').innerHTML = '⚠ Partie <b>' + code + '</b> introuvable — vérifiez le code sur l\'écran de l\'hôte (bouton 📱/🌐), puis rechargez cette page.';
        return;
      }
      setStatus('Erreur PeerJS : ' + e.type + '. Nouvelle tentative...');
      retry();
    });
  }
  function retry() {
    if (tries >= 8) { setStatus('Connexion impossible. Rechargez la page pour réessayer.'); return; }
    tries++;
    try { if (peer) peer.destroy(); } catch (e) {}
    setTimeout(connect, 1600);
  }
  connect();
  renderSetup();

  /* ================= messages de l'hôte ================= */
  function handleHostMsg(d) {
    if (!d || !d.t) return;
    if (d.t === 'welcome') { welcome = d; renderSetup(); return; }
    if (d.t === 'joined') {
      st.joined = true; st.player = d.player; if (d.path) st.path = d.path;
      myWho = st.player;
      el('nsetup').style.display = 'none';
      setStatus('✓ Joueur ' + st.player + ' — partie ' + code);
      if (!videoAskedNoop) { videoAskedNoop = true; send({ t: 'startsync' }); }
      bootGame();
      return;
    }
    if (d.t === 'deny' || d.t === 'released') {
      st.joined = false;
      el('nsetup').style.display = 'block';
      setupMsg(d.reason || 'Personnage indisponible.');
      return;
    }
    if (d.t === 'toast') { if (booted) showMsg(d.msg || '', 3); return; }
    if (d.t === 'hud') { applyHud(d); return; }
    if (d.t === 'worldsnap') { applyWorldSnap(d); return; }
    if (d.t === 'treedata') { renderTreeOverlay(d); return; }
    if (d.t === 'forgedata') { renderForgeOverlay(d); return; }
    if (d.t === 'yoursave') { try { localStorage.setItem(SAVE_KEY, JSON.stringify(d.save)); } catch (e) {} return; }
  }

  /* ================= HUD répliqué (barres, objectif, dialogue, pause) =================
     Écrit directement dans G/p2 + le DOM RÉEL du jeu (mêmes ids que l'hôte) :
     updateHUD (appelée chaque image dans clientLoop) fait le reste. */
  let lastDlgOpen = false;
  function applyHud(d) {
    G.cd = G.cd || {};
    if (myWho === 2) Object.assign(p2.cd, d.cd || {});
    else Object.assign(G.cd, d.cd || {});
    G.potions = d.potions;
    const obj = $('objective'); if (obj) { obj.textContent = d.obj || ''; obj.style.display = d.obj ? 'block' : 'none'; }
    if (d.msg) showMsg(d.msg, 1.2);
    const dlgPanel = $('dialog');
    if (d.dlg) {
      if (dlgPanel) dlgPanel.classList.remove('hidden');
      const n = $('dlg-name'), x = $('dlg-text');
      if (n) n.textContent = d.dlg.n; if (x) x.textContent = d.dlg.x;
      G.dialog = true; lastDlgOpen = true;
    } else if (lastDlgOpen) {
      if (dlgPanel) dlgPanel.classList.add('hidden');
      G.dialog = false; lastDlgOpen = false;
    }
    if (myWho === 2) p2.paused = !!d.paused; else G.paused = !!d.paused;
    const winEl = $('win'), trueWinEl = $('truewin');
    if (d.end === 'win' && winEl) winEl.classList.remove('hidden');
    if (d.end === 'truewin' && trueWinEl) trueWinEl.classList.remove('hidden');
  }

  /* ================= état du monde répliqué (~16 Hz) ================= */
  const enemyByIdx = []; // meshes matérialisés côté client, alignés sur l'index de l'hôte
  function materializeEnemy(i, e) {
    const wps = [[e.x, e.z]];
    const m = mkEnemy(e.x, e.z, e.y, wps, { type: e.k, lvl: e.l, scale: e.s, hp: e.mhp });
    m.hp = e.hp; m.maxHp = e.mhp;
    m.g.position.set(e.x, e.y, e.z);
    m.g.rotation.y = e.ry;
    enemyByIdx[i] = m;
  }
  function applyWorldSnap(d) {
    latestSnap = d;
    trySpawnPlayers(d);
    if (!hourSynced) { G.hour = d.hour; hourSynced = true; }
    /* d.p1 → G (barre PRINCIPALE), d.p2 → p2 (barre « JOUEUR 2 ») — comme
       chez l'hôte : si je joue le J2, mes propres stats apparaissent tout
       naturellement dans SA rangée (voir aussi le correctif du spell-bar,
       plus bas, pour K.cd/G.sel qui doivent lire p2.cd/p2.sel si myWho=2). */
    if (d.p1) { G.path = d.p1.path; G.hp = d.p1.hp; G.maxHp = d.p1.mhp; G.mana = d.p1.mp; G.maxMana = d.p1.mmp;
      G.xp = d.p1.xp; G.level = d.p1.level; G.sp = d.p1.sp; }
    if (d.p2) { p2.path = d.p2.path; p2.hp = d.p2.hp; p2.maxHp = d.p2.mhp; p2.mana = d.p2.mp; p2.maxMana = d.p2.mmp;
      p2.xp = d.p2.xp; p2.level = d.p2.level; p2.sp = d.p2.sp; }
    // ombres : matérialise les nouvelles, met à jour/efface les autres (indices alignés sur l'hôte)
    for (let i = 0; i < d.enemies.length; i++) {
      const e = d.enemies[i];
      if (!e) {
        const m = enemyByIdx[i];
        if (m && !m.dead) { m.dead = true; if (S.scene) S.scene.remove(m.g); }
        continue;
      }
      if (!enemyByIdx[i]) materializeEnemy(i, e);
      const m = enemyByIdx[i];
      m.hp = e.hp; m.maxHp = e.mhp;
      m.netTarget = e; // position appliquée avec lissage dans clientLoop
    }
    for (let i = d.enemies.length; i < enemyByIdx.length; i++) {
      const m = enemyByIdx[i];
      if (m && !m.dead) { m.dead = true; if (S.scene) S.scene.remove(m.g); }
    }
    // portes / butin : réapplique sans risque (openDoor est idempotent, .taken aussi vérifié)
    d.doors.forEach((o, i) => { if (o && doors[i]) openDoor(doors[i]); });
    d.pickups.forEach((t, i) => { const p = pickups[i]; if (t && p && !p.taken) { p.taken = true; if (S.scene) S.scene.remove(p.mesh); } });
  }

  /* ================= Arbre des pouvoirs / Forge (réseau dédié) =================
     Identiques à l'ancienne version : le sac de forge et les ressources
     restent un pot commun, la Forge/l'arbre affichent et modifient SON
     PROPRE équipement/nœuds — indépendants du rendu 3D. */
  function renderTreeOverlay(d) {
    if (!st.treeOpen) return;
    const t = el('ntree');
    const branches = [TREE_COMMON].concat(TREES[d.path] || []);
    let h = '<h3>ARBRE DES POUVOIRS — JOUEUR ' + d.who + ' · ' + PATHS[d.path].name.toUpperCase() + '</h3>';
    h += '<div class="pts">Niveau <b>' + d.level + '</b> · Points de pouvoir : <b>' + d.sp + '</b> · XP ' + d.xp + ' / ' + d.need + '</div>';
    for (const b of branches) {
      h += '<div class="br">' + b.branch + '</div><div class="nds">';
      for (const n of b.nodes) {
        const owned = !!d.nodes[n.id];
        const locked = !owned && (d.level < n.req || (n.needs && !d.nodes[n.needs]));
        const buyable = !owned && !locked && d.sp > 0;
        h += '<div class="nnd ' + (owned ? 'owned' : locked ? 'locked' : (buyable ? 'buyable' : '')) + '" data-node="' + n.id + '">'
          + '<div class="tn">' + n.icon + ' ' + n.name + (owned ? ' ✓' : '') + '</div>'
          + '<div class="td">' + n.desc + '</div>'
          + '<div class="tr">' + (owned ? 'Acquis' : ('Niv. ' + n.req + (n.needs ? ' · voie liée' : '') + ' · 1 point')) + '</div></div>';
      }
      h += '</div>';
    }
    h += '<div class="br">⚒ FORGE DES ARTS — Éclats : <b style="color:#ffd97a">' + d.shards + '</b></div><div class="nds">';
    for (const id in PUPG) {
      const U = PUPG[id], pw = POWERS.find(p => p.id === id);
      const cur = d.pupg[id] || 0, owned = !!d.powers[id], maxed = cur >= U.max;
      const stars = '◆'.repeat(cur) + '◇'.repeat(U.max - cur);
      h += '<div class="nnd ' + (!owned ? 'locked' : maxed ? 'owned' : (d.shards > 0 ? 'buyable' : '')) + '" data-upg="' + id + '">'
        + '<div class="tn">' + pw.icon + ' ' + (id === 'bolt' ? PATHS[d.path].boltName : pw.name)
        + '<span class="stars">' + stars + '</span></div>'
        + '<div class="td">' + U.desc + '</div>'
        + '<div class="tr">' + (!owned ? 'Art non encore appris' : maxed ? 'Rang maximal' : 'Forger le rang ' + (cur + 1) + ' · 1 Éclat') + '</div></div>';
    }
    h += '</div><div style="text-align:center;margin-top:14px"><button id="ntreeclose">Fermer (K)</button></div>';
    t.innerHTML = h;
    t.querySelectorAll('.nnd[data-node]').forEach(x => x.addEventListener('click', () => send({ t: 'buynode', id: x.dataset.node })));
    t.querySelectorAll('.nnd[data-upg]').forEach(x => x.addEventListener('click', () => send({ t: 'upgpower', id: x.dataset.upg })));
    el('ntreeclose').addEventListener('click', toggleLocalTree);
  }
  function toggleLocalTree() {
    st.treeOpen = !st.treeOpen;
    if (st.treeOpen) {
      if (document.exitPointerLock) document.exitPointerLock();
      send({ t: 'treereq' });
      el('ntree').style.display = 'block';
      el('ntree').innerHTML = '<h3>ARBRE DES POUVOIRS</h3><div class="pts">Chargement...</div>';
    } else {
      el('ntree').style.display = 'none';
      lockMouse();
    }
  }
  function gearCardHtml(it, action, curIt) {
    const R = RARITIES[it.rarity];
    const stats = Object.keys(it.stats)
      .map(k => ({ dmg: '⚔', armor: '🛡', hp: '♥', mana: '❂', speed: '➶' }[k] + ' +' + it.stats[k] + (k === 'speed' ? ' %' : '')))
      .join(' · ');
    let cmp = '';
    if (curIt !== undefined) {
      const curTier = curIt ? RARITY_ORDER.indexOf(curIt.rarity) : -1;
      const tier = RARITY_ORDER.indexOf(it.rarity);
      cmp = tier > curTier ? '<div class="ngcmp up">↑ meilleur que ce que vous portez' + (curIt ? '' : ' (emplacement vide)') + '</div>'
        : tier === curTier ? '<div class="ngcmp eq">≈ même palier que ce que vous portez</div>'
        : '<div class="ngcmp dn">↓ moins bon que ce que vous portez</div>';
    }
    return '<div class="ngearcard" style="border-color:' + R.css + '">'
      + '<div class="gn" style="color:' + R.css + '">' + it.icon + ' ' + it.name + ' <em>' + R.name + '</em></div>'
      + '<div class="gs">' + stats + '</div>' + cmp + action + '</div>';
  }
  function forgeCostText(res, cost) {
    return Object.keys(cost).map(k => RES[k].icon + ' ' + (res[k] || 0) + '/' + cost[k]).join(' · ');
  }
  function renderForgeOverlay(d) {
    if (!st.forgeOpen) return;
    const t = el('nforge');
    let h = '<h3>⚒ LA FORGE D\'OMBRECIEL — JOUEUR ' + d.who + '</h3>';
    h += '<div id="nforgehelp">Comment ça marche : <b>1.</b> Tuez des ombres pour du butin, ou FAÇONNEZ une pièce Commune '
      + 'ci-dessous contre des ressources. <b>2.</b> ÉQUIPEZ une pièce du sac sur vous. <b>3.</b> Avec 3 pièces de la '
      + 'MÊME rareté, FUSIONNEZ-les en une seule, plus puissante. Le sac et les ressources sont COMMUNS aux deux '
      + 'porteurs ; l\'équipement que vous portez est SEULEMENT le vôtre.</div>';
    h += '<div class="ftop">Score d\'équipement : <b>' + d.score + '</b> / 450 · Voie : <b>' + PATHS[d.path].name + '</b></div>';
    h += '<div class="br">1. ÉQUIPEMENT PORTÉ</div><div class="gearrow">';
    for (const slot of ['weapon', 'armor', 'accessory']) {
      const it = d.equipment[slot];
      h += '<div class="ngearslot"><div class="ngsl">' + SLOT_DEFS[slot].name + '</div>'
        + (it ? gearCardHtml(it, '<button data-unequip="' + slot + '">Retirer</button>')
              : '<div class="ngearempty">— vide —</div>')
        + '</div>';
    }
    h += '</div>';
    h += '<div class="br">2. SAC DE FORGE — ' + d.gearBag.length + '</div><div class="gearlist">';
    if (!d.gearBag.length) h += '<div class="ngearempty">Le sac est vide : façonnez une pièce, ou arrachez-en aux ombres.</div>';
    d.gearBag.forEach((it, i) => { h += gearCardHtml(it, '<button data-equip="' + i + '">Équiper</button>', d.equipment[it.slot]); });
    h += '</div>';
    h += '<div class="br">3. FAÇONNER — pièce Commune adaptée au ' + PATHS[d.path].name + '</div><div class="gearrow">';
    for (const slot of ['weapon', 'armor', 'accessory'])
      h += '<button class="nforgebtn" data-forge="' + slot + '">⚒ ' + SLOT_DEFS[slot].name
        + '<small>' + forgeCostText(d.res, FORGE_COST) + '</small></button>';
    h += '</div>';
    h += '<div class="br">4. FUSION</div><div class="gearrow">';
    for (let i = 0; i < RARITY_ORDER.length - 1; i++) {
      const rar = RARITY_ORDER[i], next = RARITY_ORDER[i + 1];
      const n = d.gearBag.filter(x => x.rarity === rar).length;
      h += '<button class="nforgebtn" data-fuse="' + rar + '" style="border-color:' + RARITIES[next].css + '">'
        + '3× ' + RARITIES[rar].name + ' (' + Math.min(n, 3) + '/3) → <b style="color:' + RARITIES[next].css + '">'
        + RARITIES[next].name + '</b><small>' + forgeCostText(d.res, FUSE_COSTS[next]) + '</small></button>';
    }
    h += '</div><div style="text-align:center;margin-top:14px"><button id="nforgeclose">Refermer (Échap)</button></div>';
    t.innerHTML = h;
    t.style.display = 'block';
    t.querySelectorAll('[data-forge]').forEach(b => b.addEventListener('click', () => send({ t: 'forgecraft', slot: b.dataset.forge })));
    t.querySelectorAll('[data-fuse]').forEach(b => b.addEventListener('click', () => send({ t: 'forgefuse', rarity: b.dataset.fuse })));
    t.querySelectorAll('[data-equip]').forEach(b => b.addEventListener('click', () => send({ t: 'forgeequip', idx: +b.dataset.equip })));
    t.querySelectorAll('[data-unequip]').forEach(b => b.addEventListener('click', () => send({ t: 'forgeunequip', slot: b.dataset.unequip })));
    el('nforgeclose').addEventListener('click', closeLocalForge);
  }
  function closeLocalForge() { st.forgeOpen = false; el('nforge').style.display = 'none'; lockMouse(); }

  /* ================= entrée locale (clavier + souris) =================
     Immédiate pour la caméra (jamais de latence réseau sur le regard) et
     pour SON PROPRE mouvement (prédiction — voir clientLoop). Envoyée en
     parallèle à l'hôte, qui reste autorité pour la physique/les combats. */
  let lookDX = 0, lookDY = 0;
  function lockMouse() {
    if (!st.joined || st.treeOpen || st.forgeOpen) return;
    try { document.body.requestPointerLock(); } catch (e) {}
  }
  function setupLocalInput() {
    addEventListener('keydown', e => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (keys[e.code]) return;
      keys[e.code] = true;
      if (st.forgeOpen) { if (e.code === 'Escape') closeLocalForge(); return; }
      if (e.code === 'KeyK') { toggleLocalTree(); return; }
      if (st.treeOpen) { if (e.code === 'Escape') toggleLocalTree(); return; }
      if (e.code === 'Space') { if (myWho === 2) p2.jumpQ = 0.14; else S.jumpQueued = 0.14; send({ t: 'jumpdown' }); }
      else if (e.code === 'KeyE') send({ t: 'interact' });
      else if (e.code === 'KeyH') send({ t: 'potion' });
      else if (e.code === 'Escape') send({ t: 'pause' });
      else if (/^Digit[1-8]$/.test(e.code)) {
        const p = POWERS[+e.code.slice(5) - 1];
        if (p) send({ t: 'cast', id: p.id });
      }
    });
    addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space') send({ t: 'jumpup' }); });
    addEventListener('mousemove', e => {
      if (!document.pointerLockElement) return;
      const s = 0.0024 * 1; // même échelle que la souris locale de l'hôte
      if (myWho === 2) {
        p2.yaw -= e.movementX * s; p2.pitch -= e.movementY * s;
        p2.pitch = Math.max(-1.22, Math.min(0.85, p2.pitch));
      } else {
        S.yaw -= e.movementX * s; S.pitch -= e.movementY * s;
        S.pitch = Math.max(-1.22, Math.min(0.85, S.pitch));
      }
      lookDX += e.movementX * 0.46; lookDY += e.movementY * 0.46; // pour l'hôte (mêmes unités que la manette)
    });
    addEventListener('mousedown', e => {
      if (st.treeOpen || st.forgeOpen) return;
      if (!document.pointerLockElement) { lockMouse(); return; }
      if (e.button === 0) send({ t: 'atkdown' });
    });
    addEventListener('mouseup', e => { if (e.button === 0) send({ t: 'atkup' }); });
    addEventListener('contextmenu', e => e.preventDefault());
    document.body.addEventListener('click', () => { if (!st.treeOpen && !st.forgeOpen) lockMouse(); });
    setInterval(() => {
      if (!conn) return;
      const x = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
      const z = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
      const l = Math.hypot(x, z);
      const k = l ? ((keys['ShiftLeft'] || keys['ShiftRight']) ? 1 : 0.72) / l : 0;
      send({ t: 'move', x: x * k, z: z * k });
      if (lookDX || lookDY) { send({ t: 'look', dx: lookDX, dy: lookDY }); lookDX = 0; lookDY = 0; }
    }, 50);
  }

  /* ================= amorçage du moteur 3D local =================
     Le monde (géométrie, indépendante de la Voie) se construit tout de
     suite ; les DEUX personnages n'apparaissent qu'à la réception du
     PREMIER instantané (trySpawnPlayers) — pour être bâtis d'emblée avec
     la bonne apparence de Voie (mage/guerrier/...), jamais reconstruits. */
  let worldReady = false, playersSpawned = false;
  async function bootGame() {
    if (booted) return;
    booted = true;
    loadSettings();
    const status = $('loading-status');
    const loadingEl2 = $('loading'); if (loadingEl2) loadingEl2.classList.remove('hidden');
    if (status) status.textContent = 'Synchronisation avec l\'hôte...';
    await loadAssets(t => { if (status) status.textContent = t; });
    initScene();
    buildWorld();
    buildHerbs();
    buildTowerGate();
    bivouac(-3.5, 0, 57, 'la fontaine des Jardins', 'fontaine');
    mkAnvil(-4.5, 0, 40.5);
    buildExtraPatrols();
    S.COOP = true;
    worldReady = true;
    setupLocalInput();
    requestAnimationFrame(clientLoop);
    if (latestSnap) trySpawnPlayers(latestSnap); // le 1er instantané est peut-être déjà arrivé pendant le chargement
  }
  function trySpawnPlayers(d) {
    if (playersSpawned || !worldReady) return;
    applyPath(d.p1 ? d.p1.path : 'mage');
    buildPlayer();
    p2.path = d.p2 ? d.p2.path : 'mage';
    buildPlayer2();
    buildPowersUI();
    const loadingEl2 = $('loading'); if (loadingEl2) loadingEl2.classList.add('hidden');
    G.started = true;
    playersSpawned = true;
  }

  /* ================= boucle du client : prédiction + interpolation + rendu ================= */
  function reconcile(pos, target, dt, snapK) {
    const dx = target.x - pos.x, dy = target.y - pos.y, dz = target.z - pos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 4) { pos.set(target.x, target.y, target.z); return; } // téléportation (portail, mort...) : on saute
    const k = Math.min(1, dt * (snapK || 2));
    pos.set(pos.x + dx * k, pos.y + dy * k, pos.z + dz * k);
  }
  function interpOther(obj, target, dt) {
    if (!obj.pos || !obj.mesh) return;
    const k = Math.min(1, dt * 10);
    obj.pos.set(obj.pos.x + (target.x - obj.pos.x) * k, obj.pos.y + (target.y - obj.pos.y) * k, obj.pos.z + (target.z - obj.pos.z) * k);
    obj.mesh.position.copy(obj.pos);
    obj.mesh.rotation.y = lerpAngle(obj.mesh.rotation.y, target.ry, k);
  }
  function updateReplicatedEnemies(dt) {
    for (const e of enemyByIdx) {
      if (!e || e.dead || !e.netTarget) continue;
      const t = e.netTarget, k = Math.min(1, dt * 10);
      e.g.position.set(e.g.position.x + (t.x - e.g.position.x) * k, e.g.position.y + (t.y - e.g.position.y) * k, e.g.position.z + (t.z - e.g.position.z) * k);
      e.g.rotation.y = lerpAngle(e.g.rotation.y, t.ry, k);
    }
  }
  function clientLoop() {
    requestAnimationFrame(clientLoop);
    const dt = Math.min(S.clock.getDelta(), 0.05);
    if (!playersSpawned) return; // en attente du 1er instantané (trySpawnPlayers) : rien à animer/rendre encore
    updateDayNight(dt); // le cycle avance localement (synchronisé une fois, voir hourSynced)
    updateFx(dt);
    updateDoors(dt);       // anime la levée des portes déjà ouvertes (openDoor, applyWorldSnap)
    updatePickups(dt);     // balancement/rotation des objets au sol
    updateParticles(dt);
    updateReplicatedEnemies(dt);
    const canAct = G.started && !G.over && !st.treeOpen && !st.forgeOpen && !G.dialog;
    if (myWho === 2) {
      p2.input.mx = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
      p2.input.mz = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
      p2.input.sprint = !!(keys['ShiftLeft'] || keys['ShiftRight']);
      p2.input.jumpHeld = !!keys['Space'];
      if (canAct && !p2.paused) updateP2(dt);
      if (latestSnap && latestSnap.p2) reconcile(p2.pos, latestSnap.p2, dt);
      if (latestSnap && latestSnap.p1 && player.mesh) interpOther(player, latestSnap.p1, dt);
      updateCamera2();
      S.camera.position.copy(S.cam2.position);
      S.camera.quaternion.copy(S.cam2.quaternion);
    } else {
      if (canAct && !G.paused) updatePlayer(dt);
      if (latestSnap && latestSnap.p1) reconcile(player.pos, latestSnap.p1, dt);
      if (latestSnap && latestSnap.p2 && p2.mesh) interpOther(p2, latestSnap.p2, dt);
      updateCamera();
    }
    updateHUD(dt);
    /* v9.2 — la barre de sorts (#pw-x) est câblée (UI.js) pour lire G.cd,
       le cooldown du J1 : si JE suis le J2, mes propres recharges sont
       dans p2.cd (voir applyHud) — on corrige les voiles juste après. */
    if (myWho === 2) {
      POWERS.forEach(p => {
        const b = $('pw-' + p.id); const cd = b && b.querySelector('.cd');
        if (cd) cd.style.height = (p2.cd[p.id] > 0 ? p2.cd[p.id] / p.cool * 100 : 0) + '%';
      });
    }
    S.renderer.setScissorTest(false);
    S.renderer.setViewport(0, 0, innerWidth, innerHeight);
    S.composer.render();
  }
  addEventListener('resize', () => {
    if (!S.renderer) return;
    S.camera.aspect = innerWidth / innerHeight;
    S.camera.updateProjectionMatrix();
    S.renderer.setSize(innerWidth, innerHeight);
    S.composer.setSize(innerWidth, innerHeight);
  });
}
