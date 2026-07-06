/* ================================================================
   v8.8 — JEU EN LIGNE SUR 2 ORDINATEURS (?join=CODE)
   Le second PC devient le POSTE DU JOUEUR DISTANT :
   · il reçoit la VIDÉO du jeu en streaming WebRTC (l'hôte capture son
     canvas + le son) et n'affiche QUE la moitié d'écran de son
     personnage (l'écran scindé est recadré côté client) ;
   · son CLAVIER + SA SOURIS pilotent son personnage via les mêmes
     messages que la manette smartphone (ZQSD/WASD, souris = caméra,
     clic = attaque, 1-8 = sorts, Espace = saut, E = agir, H = potion) ;
   · son HUD (PV, PM, XP, niveau, recharges, objectif, messages,
     dialogues) est répliqué par l'hôte (~10 Hz) et rendu LOCALEMENT,
     net et lisible, par-dessus la vidéo ;
   · SON arbre des pouvoirs (K) s'affiche sur SON écran : consultation
     et achats à distance (treereq / buynode / upgpower), sans mettre
     le jeu de l'hôte en pause.
   L'hôte reste 100 % autorité : physique, combats, XP, sauvegarde.
   ================================================================ */
import Peer from 'peerjs';
import { PATHS, POWERS, TREE_COMMON, TREES, PUPG } from './state.js';
import { peerOpts, ROOM_PREFIX } from './Network.js';

export function startOnlineClientMode(code) {
  code = String(code || '').trim().toUpperCase();
  document.title = 'Ombreciel — en ligne (' + code + ')';
  document.head.insertAdjacentHTML('beforeend',
    '<style>' +
    'html,body{margin:0;background:#000;color:#e8e0cc;font-family:Georgia,serif;overflow:hidden;height:100%}' +
    '#owrap{position:fixed;inset:0;overflow:hidden;background:#000}' +
    '#ovideo{position:absolute;background:#000}' +
    '#ohud{position:fixed;inset:0;pointer-events:none;z-index:4}' +
    '#obars{position:absolute;top:16px;left:16px;width:250px}' +
    '.obar{position:relative;height:15px;border:1px solid rgba(232,224,204,.5);border-radius:8px;margin-bottom:6px;background:rgba(0,0,0,.55);overflow:hidden}' +
    '.obar i{display:block;height:100%;border-radius:7px;transition:width .15s}' +
    '#ohp i{background:linear-gradient(90deg,#7a1420,#d13438)}' +
    '#omp i{background:linear-gradient(90deg,#1d3f8f,#4fa8e8)}' +
    '#oxp{height:9px}#oxp i{background:linear-gradient(90deg,#7a5a14,#ffd97a)}' +
    '.obar b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:Verdana,sans-serif;font-size:9px;font-weight:normal;color:#f4ecd6;text-shadow:0 1px 2px #000}' +
    '#olvl{font-size:12px;font-family:Verdana,sans-serif;color:#cfd8f2;text-shadow:0 1px 3px #000;margin-top:2px}' +
    '#olvl b{color:#ffb68a}' +
    '#oobj{position:absolute;top:106px;left:16px;max-width:270px;font-size:12px;color:#ffe6a8;text-shadow:0 1px 5px #000;background:rgba(6,8,18,.5);border-left:2px solid #ffd97a;padding:5px 9px;border-radius:0 7px 7px 0;line-height:1.35}' +
    '#omsg{position:absolute;bottom:112px;width:100%;text-align:center;font-size:16px;color:#f4ecd6;text-shadow:0 2px 8px #000;padding:0 60px}' +
    '#ostatus{position:absolute;top:12px;right:16px;font-size:11px;font-family:Verdana,sans-serif;color:#ffd97a;text-shadow:0 1px 3px #000;text-align:right}' +
    '#ospells{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);display:flex;gap:8px}' +
    '.osp{width:48px;height:48px;border:1px solid rgba(232,224,204,.35);border-radius:9px;background:rgba(8,10,20,.7);display:flex;align-items:center;justify-content:center;font-size:19px;position:relative;opacity:.2;color:#cfe6ff}' +
    '.osp.on{opacity:1}' +
    '.osp small{position:absolute;left:4px;top:2px;font-size:8px;font-family:Verdana,sans-serif;color:#8fa8d8}' +
    '.osp .ocd{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.68);border-radius:0 0 9px 9px;height:0}' +
    '#odlg{position:fixed;left:50%;bottom:86px;transform:translateX(-50%);width:min(680px,90vw);background:rgba(7,9,20,.94);border:1px solid rgba(150,180,255,.4);border-radius:12px;padding:16px 22px 12px;z-index:6;display:none}' +
    '#odlg .n{color:#8fc8ff;font-size:13px;letter-spacing:3px;margin-bottom:7px}' +
    '#odlg .x{font-size:16px;line-height:1.55;color:#e8e4d4;min-height:44px}' +
    '#odlg .h{margin-top:8px;font-size:10px;font-family:Verdana,sans-serif;color:#6a769a;text-align:right}' +
    '#oveil{position:fixed;inset:0;z-index:8;background:rgba(4,5,12,.75);display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px}' +
    '#oveil h2{color:#ffd97a;letter-spacing:4px;font-weight:normal;font-size:26px}' +
    '#oveil .s{color:#94a0c4;font-family:Verdana,sans-serif;font-size:12px;max-width:480px;line-height:1.7}' +
    '#oveil button,#osetup button,#otree button{pointer-events:auto;font-family:Georgia,serif;font-size:15px;letter-spacing:1px;color:#ffd97a;background:#1a2142;border:1px solid #ffd97a;border-radius:9px;padding:10px 26px;cursor:pointer}' +
    /* ---------- écran de configuration (avant de jouer) ---------- */
    '#osetup{position:fixed;inset:0;background:radial-gradient(ellipse at 50% 32%,#151b36 0%,#05060d 72%);overflow-y:auto;padding:26px 18px 40px;z-index:10;text-align:center}' +
    '#osetup h2{color:#8fc8ff;letter-spacing:3px;font-weight:normal;font-size:20px;margin-bottom:4px}' +
    '#osetup .nsub{color:#94a0c4;font-family:Verdana,sans-serif;font-size:12px;margin-bottom:14px}' +
    '.nsec{color:#ffd97a;letter-spacing:2px;font-size:13px;margin:16px 0 8px}' +
    '.nrow{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}' +
    '.nopt{background:rgba(10,13,28,.85);border:1px solid rgba(150,180,255,.3);border-radius:10px;color:#cfd8f2;padding:11px 16px;font-family:Georgia,serif;font-size:15px;min-width:130px;cursor:pointer}' +
    '.nopt.sel{border-color:#ffd97a;box-shadow:0 0 14px rgba(255,215,120,.4);color:#ffd97a}' +
    '.nopt.lockedpath{opacity:.35}' +
    '.nopt .ntaken{display:block;font-size:10px;font-family:Verdana,sans-serif;color:#ff9a7a;margin-top:3px}' +
    '.nopt small{display:block;font-size:10px;font-family:Verdana,sans-serif;color:#94a0c4;margin-top:3px}' +
    '#onote{font-size:10px;font-family:Verdana,sans-serif;color:#94a0c4;margin-top:10px;min-height:13px}' +
    '#ogo{margin-top:18px;font-size:17px!important;padding:12px 34px!important}' +
    '#osetupmsg{margin-top:10px;color:#ff9a7a;font-family:Verdana,sans-serif;font-size:11px;min-height:15px}' +
    /* ---------- arbre des pouvoirs local (K) ---------- */
    '#otree{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(760px,94vw);max-height:88vh;overflow-y:auto;background:rgba(5,7,15,.92);border:1px solid rgba(232,224,204,.2);border-radius:14px;padding:22px 26px;z-index:9;display:none;pointer-events:auto}' +
    '#otree h3{color:#ffd97a;font-weight:normal;letter-spacing:4px;font-size:15px;margin-bottom:6px}' +
    '#otree .pts{font-size:11px;font-family:Verdana,sans-serif;color:#7f8bb0;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(232,224,204,.1)}' +
    '#otree .pts b{color:#ffd97a;font-weight:normal}' +
    '#otree .br{color:#8fc8ff;font-size:11px;letter-spacing:3px;margin:14px 0 8px;text-transform:uppercase}' +
    '#otree .nds{display:flex;gap:9px;flex-wrap:wrap}' +
    '.ond{width:214px;background:rgba(255,255,255,.03);border:1px solid rgba(150,180,255,.14);border-radius:10px;padding:10px 11px;cursor:pointer;text-align:left}' +
    '.ond.owned{border-color:rgba(60,220,140,.5);background:rgba(60,220,140,.05);cursor:default}' +
    '.ond.locked{opacity:.35;cursor:default}' +
    '.ond.buyable{border-color:rgba(255,215,120,.45)}' +
    '.ond .tn{font-size:13px;color:#e8e0cc}' +
    '.ond.owned .tn{color:#9fffc8}' +
    '.ond .td{font-size:10px;font-family:Verdana,sans-serif;color:#8791b4;line-height:1.5;margin-top:4px}' +
    '.ond .tr{font-size:9px;font-family:Verdana,sans-serif;color:#5c6788;margin-top:6px;padding-top:5px;border-top:1px solid rgba(232,224,204,.07)}' +
    '.ond .stars{color:#8feaff;font-size:10px;letter-spacing:2px;margin-left:5px}' +
    '@media (max-width:900px){.ond{width:100%}}' +
    '</style>');
  document.body.innerHTML =
    '<div id="owrap"><video id="ovideo" autoplay playsinline></video></div>' +
    '<div id="ohud">' +
    '<div id="obars">' +
    '<div class="obar" id="ohp"><i></i><b></b></div>' +
    '<div class="obar" id="omp"><i></i><b></b></div>' +
    '<div class="obar" id="oxp"><i></i><b></b></div>' +
    '<div id="olvl"></div>' +
    '</div>' +
    '<div id="oobj"></div><div id="omsg"></div><div id="ostatus">Connexion...</div>' +
    '<div id="ospells"></div>' +
    '</div>' +
    '<div id="odlg"><div class="n"></div><div class="x"></div><div class="h">E ou clic pour continuer…</div></div>' +
    '<div id="otree"></div>' +
    '<div id="oveil"></div>' +
    '<div id="osetup">' +
    '<h2>🌐 PARTIE EN LIGNE — LES TOURS D\'OMBRECIEL</h2>' +
    '<div class="nsub" id="oconn">Connexion à la partie <b>' + code + '</b>...</div>' +
    '<div class="nsec">QUEL PERSONNAGE ?</div>' +
    '<div class="nrow" id="oplayers">' +
    '<button class="nopt" data-player="1">🔵 Joueur 1<small>le porteur principal (hôte)</small><span class="ntaken"></span></button>' +
    '<button class="nopt sel" data-player="2">🟣 Joueur 2<small>rejoint la partie de l\'hôte</small><span class="ntaken"></span></button>' +
    '</div>' +
    '<div class="nsec">QUELLE VOIE ?</div>' +
    '<div class="nrow" id="opaths"></div>' +
    '<div id="onote"></div>' +
    '<button id="ogo">🎮 REJOINDRE LA PARTIE</button>' +
    '<div id="osetupmsg"></div>' +
    '<div class="nsub" style="margin-top:18px">ZQSD/WASD bouger · souris caméra · clic attaquer · Espace saut · E agir · 1-8 sorts · K arbre · H potion · Échap menu</div>' +
    '</div>';
  const el = id => document.getElementById(id);
  const vid = el('ovideo');
  const setStatus = t => { el('ostatus').textContent = t; };
  const setupMsg = t => { el('osetupmsg').textContent = t || ''; };

  /* ---- état local ---- */
  const st = { player: 2, path: 'mage', joined: false, treeOpen: false };
  let welcome = null, hud = null, msgT = 0;

  /* ================= vidéo : recadrage sur SA moitié d'écran =================
     L'hôte diffuse tout son canvas. En coop écran scindé, seule la moitié du
     joueur distant est montrée ici, mise à l'échelle plein écran (J1 =
     gauche, J2 = droite). Hors coop : image entière. */
  function fitVideo() {
    if (!vid.videoWidth) return;
    const vw = innerWidth, vh = innerHeight;
    const half = !!(hud && hud.coop && hud.started);
    const srcW = half ? vid.videoWidth / 2 : vid.videoWidth, srcH = vid.videoHeight;
    const k = Math.min(vw / srcW, vh / srcH);
    const dw = srcW * k, dh = srcH * k;
    vid.style.width = (half ? dw * 2 : dw) + 'px';
    vid.style.height = dh + 'px';
    vid.style.left = ((vw - dw) / 2 - (half && st.player !== 1 ? dw : 0)) + 'px';
    vid.style.top = ((vh - dh) / 2) + 'px';
  }
  vid.addEventListener('loadedmetadata', fitVideo);
  addEventListener('resize', fitVideo);

  /* ================= HUD local (répliqué par l'hôte à ~10 Hz) ================= */
  const SPELL_KEYS = { bolt: '1', dash: '2', tk: '3', shield: '4', frost: '5', heal: '6', nova: '7', meteor: '8' };
  function buildSpells() {
    el('ospells').innerHTML = POWERS.map(p =>
      '<div class="osp" id="osp-' + p.id + '"><small>' + SPELL_KEYS[p.id] + '</small>' + p.icon + '<div class="ocd"></div></div>').join('');
  }
  buildSpells();
  function applyHud(d) {
    hud = d;
    const pct = (a, b) => Math.max(0, Math.min(100, a / (b || 1) * 100)) + '%';
    el('ohp').firstChild.style.width = pct(d.hp, d.mhp);
    el('ohp').querySelector('b').textContent = d.hp + ' / ' + d.mhp;
    el('omp').firstChild.style.width = pct(d.mp, d.mmp);
    el('omp').querySelector('b').textContent = d.mp + ' / ' + d.mmp;
    el('oxp').firstChild.style.width = pct(d.xp, d.need);
    el('oxp').querySelector('b').textContent = d.xp + ' / ' + d.need + ' XP';
    el('olvl').innerHTML = 'Niveau <b>' + d.lvl + '</b> — ' + (PATHS[d.path] ? PATHS[d.path].name : '')
      + (d.sp > 0 ? ' · <b>' + d.sp + ' point' + (d.sp > 1 ? 's' : '') + ' (K)</b>' : '')
      + (d.potions ? ' · 🧪' + d.potions + ' (H)' : '');
    el('oobj').textContent = d.obj || '';
    el('oobj').style.display = d.obj ? 'block' : 'none';
    if (d.msg) { el('omsg').textContent = d.msg; msgT = 1; }
    else if (msgT-- <= 0) el('omsg').textContent = '';
    /* dialogues : la page en cours, en clair sur CET écran */
    const dlg = el('odlg');
    dlg.style.display = d.dlg ? 'block' : 'none';
    if (d.dlg) { dlg.querySelector('.n').textContent = d.dlg.n; dlg.querySelector('.x').textContent = d.dlg.x; }
    /* recharges des sorts (voile qui descend) */
    POWERS.forEach(p => {
      const b = el('osp-' + p.id);
      if (!b) return;
      const cdv = (d.cd && d.cd[p.id]) || 0;
      b.querySelector('.ocd').style.height = (cdv > 0 ? Math.min(100, cdv / (p.cool || 1) * 100) : 0) + '%';
    });
    /* pause de l'hôte / fins de partie : voile local */
    syncVeil();
    fitVideo();
  }
  function syncVeil() {
    const v = el('oveil');
    const locked = !!document.pointerLockElement;
    let h = '';
    if (hud && hud.end) {
      h = '<h2>' + (hud.end === 'truewin' ? '☾ VOUS AVEZ TERMINÉ LE JEU' : '✦ L\'AUBE RENAÎT') + '</h2>'
        + '<div class="s">L\'écran de fin est affiché chez l\'hôte — c\'est lui qui choisit la suite (exploration libre ou recommencer).</div>';
    } else if (hud && hud.paused) {
      h = '<h2>II PAUSE</h2><div class="s">Le jeu est en pause.</div><button id="ov-resume">Reprendre</button>';
    } else if (st.joined && hud && hud.started && !locked) {
      h = '<h2>SOURIS LIBRE</h2><div class="s">Cliquez pour reprendre le contrôle de la caméra.<br/>ZQSD bouger · clic attaquer · 1-8 sorts · K arbre · Échap souris libre</div>'
        + '<button id="ov-lock">▶ Reprendre le contrôle</button> <button id="ov-pause">II Mettre le jeu en pause</button> <button id="ov-fs">⛶ Plein écran</button>';
    }
    if (v.dataset.h !== h) {
      v.dataset.h = h;
      v.innerHTML = h;
      const bind = (id, fn) => { const b = el(id); if (b) b.addEventListener('click', fn); };
      bind('ov-lock', lockMouse);
      bind('ov-resume', () => send({ t: 'pause' }));
      bind('ov-pause', () => send({ t: 'pause' }));
      bind('ov-fs', () => { try { document.documentElement.requestFullscreen(); } catch (e) {} });
    }
    v.style.display = h ? 'flex' : 'none';
  }

  /* ================= connexion PeerJS (reconnexion automatique) ================= */
  let conn = null, peer = null, tries = 0, videoAsked = false;
  const send = m => { if (conn) { try { conn.send(m); } catch (e) {} } };
  function connect() {
    peer = new Peer(undefined, peerOpts());
    peer.on('open', () => {
      conn = peer.connect(ROOM_PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        tries = 0; videoAsked = false;
        setStatus('✓ Connecté — partie ' + code);
        el('oconn').innerHTML = '✓ Connecté à la partie <b>' + code + '</b>';
        send({ t: 'hello' });
        if (st.joined) send({ t: 'join', player: st.player, path: st.path }); // reprise après coupure
      });
      conn.on('data', d => {
        if (!d || !d.t) return;
        if (d.t === 'welcome') { welcome = d; renderSetup(); }
        else if (d.t === 'joined') {
          st.joined = true; st.player = d.player;
          if (d.path) st.path = d.path;
          el('osetup').style.display = 'none';
          setStatus('✓ Joueur ' + st.player + ' — partie ' + code);
          if (!videoAsked) { videoAsked = true; send({ t: 'video' }); }
          syncVeil();
        }
        else if (d.t === 'deny' || d.t === 'released') {
          st.joined = false;
          el('osetup').style.display = 'block';
          setupMsg(d.reason || 'Personnage indisponible.');
        }
        else if (d.t === 'toast') { el('omsg').textContent = d.msg || ''; msgT = 30; }
        else if (d.t === 'hud') applyHud(d);
        else if (d.t === 'treedata') renderTree(d);
        else if (d.t === 'ui') {
          if (d.powers) POWERS.forEach(p => {
            const b = el('osp-' + p.id);
            if (b) b.classList.toggle('on', !!d.powers[p.id]);
          });
        }
      });
      conn.on('close', () => { setStatus('Déconnecté. Nouvelle tentative...'); retry(); });
      conn.on('error', () => { setStatus('Erreur de connexion. Nouvelle tentative...'); retry(); });
    });
    /* la vidéo du jeu arrive par un appel entrant de l'hôte */
    peer.on('call', call => {
      call.answer();
      call.on('stream', stream => {
        vid.srcObject = stream;
        vid.muted = false;
        vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}); });
      });
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
    peer.on('error', e => {
      if (e.type === 'peer-unavailable') {
        setStatus('Partie « ' + code + ' » introuvable.');
        el('oconn').innerHTML = '⚠ Partie <b>' + code + '</b> introuvable — vérifiez le code sur l\'écran de l\'hôte (bouton 📱/🌐), puis rechargez cette page.';
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

  /* ================= écran de configuration ================= */
  function lockedPathFor(playerN) {
    if (!welcome) return null;
    const info = playerN === 1 ? welcome.p1 : welcome.p2;
    return (info && info.locked && info.path) ? info.path : null;
  }
  function renderSetup() {
    el('oplayers').querySelectorAll('.nopt').forEach(b => {
      const n = +b.dataset.player;
      const taken = !!welcome && (n === 1 ? welcome.p1.taken : welcome.p2.taken) && !(st.joined && st.player === n);
      b.querySelector('.ntaken').textContent = taken ? '↺ tenu ailleurs — le choisir le reprend ici' : '';
      b.classList.toggle('sel', st.player === n);
    });
    const box = el('opaths');
    if (!box.childElementCount) {
      for (const id of Object.keys(PATHS)) {
        const b = document.createElement('button');
        b.className = 'nopt'; b.dataset.path = id;
        b.innerHTML = PATHS[id].icon + ' ' + PATHS[id].name;
        b.addEventListener('click', () => {
          if (lockedPathFor(st.player)) return;
          st.path = id; renderSetup();
        });
        box.appendChild(b);
      }
    }
    const lockP = lockedPathFor(st.player);
    if (lockP && PATHS[lockP]) st.path = lockP;
    box.querySelectorAll('.nopt').forEach(b => {
      b.classList.toggle('sel', b.dataset.path === st.path);
      b.classList.toggle('lockedpath', !!lockP && b.dataset.path !== lockP);
    });
    el('onote').textContent = lockP
      ? 'Partie en cours : la voie de ce personnage a déjà été choisie — elle est conservée pour la reconnexion.'
      : '';
  }
  el('oplayers').querySelectorAll('.nopt').forEach(b =>
    b.addEventListener('click', () => { st.player = +b.dataset.player; renderSetup(); }));
  el('ogo').addEventListener('click', () => {
    setupMsg('');
    if (!conn || !conn.open) { setupMsg('Pas encore connecté à la partie... (code ' + code + ')'); return; }
    send({ t: 'join', player: st.player, path: st.path });
  });
  renderSetup();

  /* ================= arbre des pouvoirs local (K) ================= */
  function renderTree(d) {
    if (!st.treeOpen) return;
    const t = el('otree');
    const branches = [TREE_COMMON].concat(TREES[d.path] || []);
    let h = '<h3>ARBRE DES POUVOIRS — JOUEUR ' + d.who + ' · ' + PATHS[d.path].name.toUpperCase() + '</h3>';
    h += '<div class="pts">Niveau <b>' + d.level + '</b> · Points de pouvoir : <b>' + d.sp + '</b> · XP ' + d.xp + ' / ' + d.need + '</div>';
    for (const b of branches) {
      h += '<div class="br">' + b.branch + '</div><div class="nds">';
      for (const n of b.nodes) {
        const owned = !!d.nodes[n.id];
        const locked = !owned && (d.level < n.req || (n.needs && !d.nodes[n.needs]));
        const buyable = !owned && !locked && d.sp > 0;
        h += '<div class="ond ' + (owned ? 'owned' : locked ? 'locked' : (buyable ? 'buyable' : '')) + '" data-node="' + n.id + '">'
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
      h += '<div class="ond ' + (!owned ? 'locked' : maxed ? 'owned' : (d.shards > 0 ? 'buyable' : '')) + '" data-upg="' + id + '">'
        + '<div class="tn">' + pw.icon + ' ' + (id === 'bolt' ? PATHS[d.path].boltName : pw.name)
        + '<span class="stars">' + stars + '</span></div>'
        + '<div class="td">' + U.desc + '</div>'
        + '<div class="tr">' + (!owned ? 'Art non encore appris' : maxed ? 'Rang maximal' : 'Forger le rang ' + (cur + 1) + ' · 1 Éclat') + '</div></div>';
    }
    h += '</div><div style="text-align:center;margin-top:14px"><button id="otreeclose">Fermer (K)</button></div>';
    t.innerHTML = h;
    t.style.display = 'block';
    t.querySelectorAll('.ond[data-node]').forEach(x => x.addEventListener('click', () => send({ t: 'buynode', id: x.dataset.node })));
    t.querySelectorAll('.ond[data-upg]').forEach(x => x.addEventListener('click', () => send({ t: 'upgpower', id: x.dataset.upg })));
    el('otreeclose').addEventListener('click', toggleLocalTree);
  }
  function toggleLocalTree() {
    st.treeOpen = !st.treeOpen;
    if (st.treeOpen) {
      if (document.exitPointerLock) document.exitPointerLock();
      send({ t: 'treereq' });
      el('otree').style.display = 'block';
      el('otree').innerHTML = '<h3>ARBRE DES POUVOIRS</h3><div class="pts">Chargement...</div>';
    } else {
      el('otree').style.display = 'none';
      lockMouse();
    }
  }

  /* ================= clavier + souris → messages manette ================= */
  function lockMouse() {
    if (!st.joined || st.treeOpen) return;
    try { document.body.requestPointerLock(); } catch (e) {}
  }
  document.addEventListener('pointerlockchange', syncVeil);
  el('owrap').addEventListener('click', () => { if (st.joined && !st.treeOpen) lockMouse(); });

  /* déplacement : ZQSD/WASD (codes physiques — AZERTY compris), envoyé 20 Hz */
  const keys = {};
  let lookDX = 0, lookDY = 0;
  addEventListener('keydown', e => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (keys[e.code]) return;
    keys[e.code] = true;
    if (!st.joined) return;
    if (e.code === 'KeyK') { toggleLocalTree(); return; }
    if (st.treeOpen) { if (e.code === 'Escape') toggleLocalTree(); return; }
    if (e.code === 'Space') send({ t: 'jumpdown' });
    else if (e.code === 'KeyE') send({ t: 'interact' });
    else if (e.code === 'KeyH') send({ t: 'potion' });
    else if (e.code === 'KeyP') send({ t: 'pause' });
    else if (e.code === 'Tab') send({ t: 'bag' });
    else if (e.code === 'KeyM') send({ t: 'map' });
    else if (/^Digit[1-8]$/.test(e.code)) {
      const p = POWERS[+e.code.slice(5) - 1];
      if (p) send({ t: 'cast', id: p.id });
    }
    /* navigation des menus de l'hôte (dialogues, pause...) au clavier */
    else if (e.code === 'ArrowUp') send({ t: 'nav', d: 'up' });
    else if (e.code === 'ArrowDown') send({ t: 'nav', d: 'down' });
    else if (e.code === 'ArrowLeft') send({ t: 'nav', d: 'left' });
    else if (e.code === 'ArrowRight') send({ t: 'nav', d: 'right' });
    else if (e.code === 'Enter') send({ t: 'nav', d: 'ok' });
    else if (e.code === 'Backspace') send({ t: 'nav', d: 'back' });
  });
  addEventListener('keyup', e => {
    keys[e.code] = false;
    if (!st.joined) return;
    if (e.code === 'Space') send({ t: 'jumpup' });
  });
  addEventListener('mousemove', e => {
    if (!document.pointerLockElement || !st.joined) return;
    /* mêmes unités que la manette smartphone (0.0052·padSens côté hôte) :
       la souris est plus fine, on la ramène à ~l'échelle souris de l'hôte */
    lookDX += e.movementX * 0.46;
    lookDY += e.movementY * 0.46;
  });
  addEventListener('mousedown', e => {
    if (!st.joined || st.treeOpen) return;
    if (!document.pointerLockElement) return;
    if (e.button === 0) send({ t: 'atkdown' });
  });
  addEventListener('mouseup', e => {
    if (e.button === 0) send({ t: 'atkup' });
  });
  addEventListener('contextmenu', e => e.preventDefault());
  /* boucle d'envoi : mouvement 20 Hz + caméra accumulée */
  setInterval(() => {
    if (!st.joined || !conn) return;
    let x = 0, z = 0;
    if (keys['KeyW']) z += 1;
    if (keys['KeyS']) z -= 1;
    if (keys['KeyD']) x += 1;
    if (keys['KeyA']) x -= 1;
    const l = Math.hypot(x, z);
    /* Shift = sprint (vecteur à fond, comme le joystick poussé au maximum) */
    const k = l ? ((keys['ShiftLeft'] || keys['ShiftRight']) ? 1 : 0.72) / l : 0;
    send({ t: 'move', x: x * k, z: z * k });
    if (lookDX || lookDY) {
      send({ t: 'look', dx: lookDX, dy: lookDY });
      lookDX = 0; lookDY = 0;
    }
  }, 50);
  addEventListener('beforeunload', () => { try { if (conn) conn.close(); } catch (e) {} });
}
