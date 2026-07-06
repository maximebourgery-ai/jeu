/* ================================================================
   CONTRÔLES — clavier/souris (PointerLock), tactile (joystick virtuel
   + boutons), manette Xbox/PS (Gamepad API).
   La manette smartphone (PeerJS) est dans Network.js.
   ================================================================ */
import * as THREE from 'three';
import { G, S, IS_TOUCH, IS_IOS, IS_STANDALONE, POWERS, keys, p2, tut, gpMove, tmMove, enemies, settings, saveSettings } from './state.js';
/* v9 — le dialogue/l'arbre de CE joueur uniquement (voir state.js) : « myDialog »
   et « myTree » distinguent MON dialogue/arbre de celui de l'autre porteur,
   qui ne doit jamais me bloquer. who = 1 (clavier/tactile, ce module) ou 2
   (manette locale, qui pilote le J2 en coop — voir updateGamepad). */
const myDialog = who => G.dialog && S.dlgWho === who;
const myTree = who => G.treeOpen && S.treeFor === who;
import { updateDayNight } from './DayNight.js'; // (cycle sûr : appel différé, curseur de luminosité)
import { A } from './Audio.js';
import { $, showMsg, refreshPowers, toggleInv, closeTravel, updateTouchSlots, updatePadLegend } from './UI.js';
import { dlgNext } from './Quests.js';
import { craftAction } from './Crafting.js';
import { toggleTree } from './SkillTree.js';
import { tryInteract, tryInteractP2 } from './World.js';
import { castPower, castSpecific } from './Powers.js';
import { toggleMap, closeMap, mapPan, mapZoom, mapCenter } from './WorldMap.js';

/* ---------------- ENTRÉES (verrouillage souris + repli glisser) ---------------- */
export function lockPointer() {
  if (IS_TOUCH) return; // pas de verrouillage souris sur écran tactile
  if (!S.plOK || !S.renderer) return;
  try { S.renderer.domElement.requestPointerLock(); } catch (e) { S.plOK = false; }
}

/* Garde-fous anti-zoom pour iOS Safari, qui IGNORE user-scalable=no :
   sans eux, marteler le bouton d'attaque déclenche le zoom au double-tap
   et un pincement à deux doigts zoome la page — injouable sur iPhone.
   (touch-action:manipulation dans style.css couvre le cas nominal ; ceci
   rattrape les zones où le navigateur passe outre.) */
function initTouchZoomGuards() {
  if (!IS_TOUCH) return;
  // pincement (événements gesture* propres à Safari)
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t =>
    document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  // double-tap : deux fins de toucher rapprochées = zoom → on l'annule.
  // Les boutons/inputs sont épargnés (taper vite « Continuer » doit marcher :
  // eux sont déjà couverts par touch-action:manipulation).
  let lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    const now = performance.now();
    if (now - lastTouchEnd < 350 && !e.target.closest('button,input,label,.classbtn,.modebtn,.p2btn'))
      e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  // appui long : pas de menu contextuel / loupe de sélection en plein combat
  document.addEventListener('contextmenu', e => e.preventDefault());
}

export function initControls() {
  initTouchZoomGuards();
  document.addEventListener('pointerlockerror', () => {
    S.plOK = false;
    showMsg('Astuce : maintenez le clic gauche et déplacez la souris pour orienter la caméra.', 4);
  });
  addEventListener('keydown', e => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    keys[e.code] = true;
    if (e.code === 'Space' && G.started && !G.paused && !myDialog(1) && !G.over) S.jumpQueued = 0.14;
    if (!G.started || G.over) return;
    if (myDialog(1)) { if (e.code === 'KeyE' || e.code === 'Space') dlgNext(); return; }
    if (e.code === 'Escape' && !document.pointerLockElement) {
      if (G.mapOpen) { closeMap(); return; }
      if (G.travelOpen) { closeTravel(); return; }
      if (myTree(1)) { toggleTree(); return; }
      if (G.inv) { toggleInv(); return; }
      G.paused = !G.paused;
      $('pause').classList.toggle('hidden', !G.paused);
      return;
    }
    if (e.code === 'Tab' && !G.paused) toggleInv();
    if (/^Digit[1-8]$/.test(e.code)) {
      const p = POWERS[+e.code.slice(5) - 1];
      if (G.powers[p.id]) { G.sel = p.id; refreshPowers(); showMsg(p.name + ' préparé.', 1); }
      else showMsg('Vous ne maîtrisez pas encore cet art...', 1.4);
    }
    if (e.code === 'KeyE') tryInteract();
    if (!G.paused && !G.inv) {
      if (e.code === 'KeyH') craftAction('H');
      if (e.code === 'KeyO') craftAction('O');
      if (e.code === 'KeyC') craftAction('C');
      if (e.code === 'KeyV') {
        G.firstPerson = !G.firstPerson;
        showMsg(G.firstPerson ? 'Vue à la première personne.' : 'Vue à la troisième personne.', 1.4);
      }
      if (e.code === 'KeyK') toggleTree();
      if (e.code === 'KeyM') toggleMap(); // carte d'Ombreciel (téléportation vers les bivouacs)
    }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });

  addEventListener('mousemove', e => {
    const locked = !!document.pointerLockElement;
    if (locked || (S.mDown && G.started && !G.paused)) {
      const s = 0.0024 * settings.mouseSens;
      S.yaw -= e.movementX * s;
      S.pitch -= e.movementY * s * (settings.invertY ? -1 : 1);
      S.pitch = Math.max(-1.22, Math.min(0.85, S.pitch));
      tut.looked += Math.abs(e.movementX) * 0.0024 + Math.abs(e.movementY) * 0.0024;
      if (!locked) S.dragDist += Math.abs(e.movementX) + Math.abs(e.movementY);
    }
  });
  addEventListener('mousedown', e => {
    if (!G.started || G.over) return;
    if (myDialog(1)) { dlgNext(); return; }
    if (G.paused || G.inv || myTree(1) || G.travelOpen) return; // clics réservés aux boutons de ces panneaux
    if (IS_TOUCH) return; // sur mobile, l'attaque passe par le bouton tactile
    if (document.pointerLockElement) {
      if (e.button === 0 && !G.inv) castPower();
      return;
    }
    S.mDown = true; S.dragDist = 0;
    lockPointer();
  });
  addEventListener('mouseup', e => {
    if (!S.mDown) return;
    S.mDown = false;
    if (IS_TOUCH) return;
    if (!document.pointerLockElement && G.started && !G.paused && !G.inv && !myDialog(1) && !G.over && S.dragDist < 6) {
      castPower();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && G.started && !G.over && !myDialog(1) && !G.inv && !myTree(1) && !G.travelOpen && !G.mapOpen) {
      G.paused = true; $('pause').classList.remove('hidden');
    }
  });

  addEventListener('gamepadconnected', e => announcePad(e.gamepad));
  addEventListener('gamepaddisconnected', e => {
    padMaps.delete(padKey(e.gamepad));
    padSeen.delete(padKey(e.gamepad)); // reconnexion = nouvelle annonce (et recalibrage)
    if (gpPrimary === e.gamepad.index) gpPrimary = -1;
    showMsg('🎮 Manette déconnectée : ' + (e.gamepad.id || '').slice(0, 40), 3);
  });
  $('btn-travelclose').addEventListener('click', closeTravel);
  $('btn-invclose').addEventListener('click', () => { if (G.inv) toggleInv(); });
}

/* ================================================================
   MANETTE (Gamepad API — Xbox / PlayStation / Bluetooth génériques)
   Stick gauche : déplacement · Stick droit : caméra · Stick G. enfoncé : sprint
   A/Croix : saut · B/Rond : interagir · Start : pause
   X/Carré : TOUJOURS l'attaque de base (tenir pour l'attaque continue),
   même si un nouveau sort vient d'être débloqué/sélectionné.
   Y/LB/RB/LT/RT : 5 emplacements de sort assignables dans ⚙ Réglages
   (par défaut : Pas du vent, Main céleste, Égide, Souffle glacé, Bénédiction).
   Croix haut/bas : Nova d'Aurore / Astre d'Aube (arts de l'Outre-Ciel).

   Beaucoup de manettes Bluetooth s'annoncent avec mapping ≠ "standard" :
   axes du stick droit décalés, gâchettes exposées en axes (repos à -1),
   croix directionnelle en « chapeau » (un seul axe, repos hors [-1,1]).
   On APPREND donc la disposition à la connexion, à partir de la position
   de repos de chaque axe (auto-mapping), au lieu de supposer les index
   du mapping standard. Et si plusieurs périphériques sont exposés (faux
   pads, télécommandes…), la manette qui ENVOIE réellement des entrées
   devient la manette principale — pas bêtement pads[0].
   Sur écran tactile, les contrôles à l'écran s'effacent tant que la
   manette est utilisée, et reviennent après quelques secondes de repos.
   ================================================================ */
let gpPrimary = -1;        // index de la manette principale
let gpUiT = 0;             // temps restant d'effacement des contrôles tactiles
let gpUiHidden = false;
let gpLegendKey = '';      // dernière manette affichée dans la légende des boutons
const padMaps = new Map(); // clé index|id → disposition apprise
const padSeen = new Set(); // annonces de connexion déjà faites

function padKey(gp) { return gp.index + '|' + gp.id; }

/* Marque de la manette, devinée depuis son identifiant (nom + vendor id
   USB : 054c = Sony, 057e = Nintendo, 045e = Microsoft). Elle ne change
   RIEN aux positions (mapping standard = positionnel), seulement les
   libellés affichés dans la légende des boutons (UI.js). */
function padBrand(gp) {
  const id = (gp.id || '').toLowerCase();
  if (/054c|sony|dual\s*shock|dualshock|dualsense|playstation|\bps[2-5]?\b/.test(id)) return 'ps';
  if (/057e|nintendo|switch|joy-?con|pro controller/.test(id)) return 'nin';
  if (/045e|xbox|xinput/.test(id)) return 'xbox';
  return 'generic';
}

/* Nom court et lisible pour l'écran : sans les (Vendor: xxxx Product: xxxx). */
function padShortName(gp) {
  return (gp.id || 'Manette').replace(/\s*\(.*$/, '').slice(0, 34);
}

/* Apprend la disposition d'une manette à partir de ses axes AU REPOS :
   stick ≈ 0 · gâchette analogique ≈ -1 · chapeau (croix) hors [-1,1]. */
function getMap(gp) {
  let m = padMaps.get(padKey(gp));
  if (m) return m;
  m = { std: gp.mapping === 'standard', brand: padBrand(gp), base: Array.from(gp.axes), camX: 2, camY: 3, hat: -1, trig: [] };
  if (!m.std) {
    const sticks = [];
    for (let i = 2; i < m.base.length; i++) {
      const v = m.base[i];
      if (Math.abs(v) > 1.05) m.hat = i;
      else if (Math.abs(v + 1) < 0.12) m.trig.push(i);
      else if (Math.abs(v) < 0.4) sticks.push(i);
    }
    if (sticks.length >= 2) { m.camX = sticks[0]; m.camY = sticks[1]; }
  }
  padMaps.set(padKey(gp), m);
  return m;
}

function announcePad(gp) {
  if (!gp) return;
  getMap(gp); // calibre dès l'apparition, sticks au repos
  const key = padKey(gp);
  if (padSeen.has(key)) return;
  padSeen.add(key);
  showMsg('🎮 Manette détectée : ' + (gp.id || 'manette').slice(0, 40)
    + (gp.mapping === 'standard' ? '' : ' (mapping auto)'), 3.5);
}

/* Activité réelle = écart par rapport à la position de repos (une gâchette
   au repos à -1 ou un chapeau à 3.29 ne comptent pas comme « activité »). */
function padActive(gp, m, dzv) {
  for (const x of gp.buttons) if (x && x.pressed) return true;
  for (let i = 0; i < gp.axes.length; i++) {
    if (i === m.hat) continue;
    if (Math.abs(gp.axes[i] - (m.base[i] || 0)) > dzv) return true;
  }
  if (m.hat >= 0) {
    const v = gp.axes[m.hat];
    if (v >= -1.01 && v <= 1.01) return true; // une direction de croix est pressée
  }
  return false;
}

/* Croix « chapeau » : 8 directions réparties sur [-1,1], repos hors plage. */
function hatDirs(gp, m) {
  if (m.hat < 0) return { up: false, down: false, left: false, right: false };
  const v = gp.axes[m.hat];
  if (!(v >= -1.01 && v <= 1.01)) return { up: false, down: false, left: false, right: false };
  const d = Math.round((v + 1) * 3.5); // 0=haut,1=h-d,2=droite,3=b-d,4=bas,5=b-g,6=gauche,7=h-g
  return {
    up: d === 0 || d === 1 || d === 7, down: d >= 3 && d <= 5,
    left: d >= 5 && d <= 7, right: d >= 1 && d <= 3
  };
}

/* ================================================================
   NAVIGATION DES MENUS À LA MANETTE (retour joueur : « la manette
   fonctionne mais pas sur les menus »). Croix / stick gauche :
   surbrillance dorée · A : activer · B : refermer · Start : reprendre
   (pause). Couvre : écran-titre, histoire, pause, réglages (les
   curseurs s'ajustent à gauche/droite), sac-atelier, arbre des
   pouvoirs, matrice des bivouacs, game over, victoire. La CARTE a ses
   commandes propres : stick/croix = déplacer, RB/LB = zoom ±,
   A = centrer sur soi, B = fermer. Select/Back en jeu = carte.
   ================================================================ */
/* anti-répétition en TEMPS RÉEL (performance.now) : l'ancien décompte en
   temps de jeu (dt plafonné) avalait des appuis quand le framerate chute */
let navI = 0, navNextT = 0, navPanel = null;
const PANEL_DEFS = {
  title:    { sel: '#title .classbtn, #title .modebtn, #title .p2btn, #title > button' },
  story:    { sel: '#story button' },
  pause:    { sel: '#pause button', close: '#btn-resume' },
  settings: { sel: '#settings input, #settings button', close: '#btn-settings-close' },
  inv:      { sel: '#inv button', close: '#btn-invclose' },
  tree:     { sel: '#tree button', close: '#treeclose' },
  travel:   { sel: '#travel button', close: '#btn-travelclose' },
  gameover: { sel: '#golist button' },
  win:      { sel: '#win button' },
  truewin:  { sel: '#truewin button' }, // la vraie fin (v8.4)
  qr:       { sel: '#qrpanel button', close: '#btn-qrclose' } // appairage des manettes smartphone
};
/* v9 — INDÉPENDANCE : `who` (1 = J1 clavier/tactile, 2 = J2 manette locale
   ou en ligne) précise POUR QUI on demande le panneau actif. pause/arbre
   sont désormais propres à chacun (G.paused/p2.paused, S.treeFor) ; sac,
   carte et matrice des bivouacs restent des écrans du J1 uniquement — ils
   ne redirigent jamais les entrées du J2. Les écrans globaux (réglages,
   écran-titre, victoire...) bloquent tout le monde, comme avant. */
function activePanel(who) {
  const vis = id => { const el = $(id); return el && !el.classList.contains('hidden'); };
  const w = who === 2 ? 2 : 1;
  if (vis('qrpanel')) return 'qr'; // au-dessus de tout (écran-titre ou pause)
  if (vis('settings')) return 'settings';
  if ((w === 2 ? p2.paused : G.paused) && vis('pause')) return 'pause';
  if (w === 1) {
    if (G.mapOpen) return 'map';
    if (G.inv) return 'inv';
    if (G.travelOpen) return 'travel';
  }
  if (G.treeOpen && S.treeFor === w) return 'tree';
  if (G.dead && vis('gameover')) return 'gameover';
  if (vis('win')) return 'win';
  if (vis('truewin')) return 'truewin';
  if (vis('story')) return 'story';
  if (!G.started && vis('title')) return 'title';
  return null;
}
function navButtons(panel) {
  const def = PANEL_DEFS[panel];
  if (!def) return [];
  return [...document.querySelectorAll(def.sel)]
    .filter(el => el.offsetParent !== null && !el.disabled && !el.classList.contains('hidden'));
}
export function clearPadFocus() {
  document.querySelectorAll('.padfocus').forEach(el => el.classList.remove('padfocus'));
  navPanel = null;
}
function padMenus(panel, b, dirs, gp, dt) {
  const now = performance.now();
  /* --- la carte : déplacement continu + zoom, pas de liste de boutons --- */
  if (panel === 'map') {
    const px = deadzone(gp.axes[0] || 0, 0.3), py = deadzone(gp.axes[1] || 0, 0.3);
    if (px || py) mapPan(px * 560 * dt, py * 560 * dt);
    if (dirs.left()) mapPan(-380 * dt, 0);
    if (dirs.right()) mapPan(380 * dt, 0);
    if (dirs.up()) mapPan(0, -380 * dt);
    if (dirs.down()) mapPan(0, 380 * dt);
    if (b(5) && !S.gpPrev[5]) mapZoom(1.35);
    if (b(4) && !S.gpPrev[4]) mapZoom(1 / 1.35);
    if (b(0) && !S.gpPrev[0]) mapCenter();
    if ((b(1) && !S.gpPrev[1]) || (b(8) && !S.gpPrev[8]) || (b(9) && !S.gpPrev[9])) closeMap();
    return;
  }
  if (navPanel !== panel) {
    // on change de panneau : éteindre la surbrillance de l'ancien
    document.querySelectorAll('.padfocus').forEach(el => el.classList.remove('padfocus'));
    navPanel = panel; navI = 0; navNextT = now + 250;
  }
  const list = navButtons(panel);
  if (!list.length) return;
  if (navI >= list.length) navI = list.length - 1;
  const cur = list[navI];
  const sx = deadzone(gp.axes[0] || 0, 0.45), sy = deadzone(gp.axes[1] || 0, 0.45);
  const goPrev = dirs.up() || sy < 0, goNext = dirs.down() || sy > 0;
  const goLeft = dirs.left() || sx < 0, goRight = dirs.right() || sx > 0;
  const isRange = cur && cur.tagName === 'INPUT' && cur.type === 'range';
  if (now >= navNextT) {
    if (isRange && (goLeft || goRight)) {
      /* curseur de réglage : gauche/droite ajuste la valeur en place */
      const step = (parseFloat(cur.step) || 0.05) * (goRight ? 1 : -1);
      const min = parseFloat(cur.min) || 0, max = parseFloat(cur.max) || 1;
      cur.value = String(Math.min(max, Math.max(min, parseFloat(cur.value) + step)));
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      navNextT = now + 110;
    } else if (goPrev || goLeft) { navI = (navI - 1 + list.length) % list.length; navNextT = now + 190; }
    else if (goNext || goRight) { navI = (navI + 1) % list.length; navNextT = now + 190; }
  }
  list.forEach((el, i) => el.classList.toggle('padfocus', i === navI));
  const focused = list[navI];
  if (focused && focused.scrollIntoView) focused.scrollIntoView({ block: 'nearest' });
  if (b(0) && !S.gpPrev[0] && focused) {
    if (focused.tagName === 'INPUT' && focused.type === 'checkbox') focused.click();
    else focused.click(); // A : activer (boutons, voies, recettes...)
  }
  const def = PANEL_DEFS[panel];
  if (def.close) {
    const wantClose = (b(1) && !S.gpPrev[1]) || (b(9) && !S.gpPrev[9] && panel === 'pause');
    if (wantClose) {
      const c = document.querySelector(def.close);
      if (c) c.click();
    }
  }
}

/* ================================================================
   NAVIGATION À DISTANCE (manette smartphone, Network.js) : le téléphone
   envoie des impulsions ('up'/'down'/'left'/'right'/'ok'/'back'/'zoomin'/
   'zoomout') qui pilotent LA MÊME navigation de menus que la manette
   physique (surbrillance dorée, curseurs de réglage, carte). Renvoie true
   si un panneau était ouvert (l'impulsion a été consommée par le menu).
   ================================================================ */
export function remoteNav(d, who) {
  const panel = activePanel(who === 2 ? 2 : 1);
  if (!panel) return false;
  /* --- la carte : déplacement par crans + zoom + centrage --- */
  if (panel === 'map') {
    const st = 64;
    if (d === 'up') mapPan(0, -st);
    else if (d === 'down') mapPan(0, st);
    else if (d === 'left') mapPan(-st, 0);
    else if (d === 'right') mapPan(st, 0);
    else if (d === 'zoomin') mapZoom(1.35);
    else if (d === 'zoomout') mapZoom(1 / 1.35);
    else if (d === 'ok') mapCenter();
    else if (d === 'back') closeMap();
    return true;
  }
  if (navPanel !== panel) {
    document.querySelectorAll('.padfocus').forEach(el => el.classList.remove('padfocus'));
    navPanel = panel; navI = 0;
  }
  const list = navButtons(panel);
  if (!list.length) return true;
  if (navI >= list.length) navI = list.length - 1;
  const cur = list[navI];
  const isRange = cur && cur.tagName === 'INPUT' && cur.type === 'range';
  if (isRange && (d === 'left' || d === 'right')) {
    /* curseur de réglage : gauche/droite ajuste la valeur en place */
    const step = (parseFloat(cur.step) || 0.05) * (d === 'right' ? 1 : -1);
    const min = parseFloat(cur.min) || 0, max = parseFloat(cur.max) || 1;
    cur.value = String(Math.min(max, Math.max(min, parseFloat(cur.value) + step)));
    cur.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (d === 'up' || d === 'left') navI = (navI - 1 + list.length) % list.length;
  else if (d === 'down' || d === 'right') navI = (navI + 1) % list.length;
  else if (d === 'ok' && cur) cur.click();
  else if (d === 'back') {
    const def = PANEL_DEFS[panel];
    if (def && def.close) {
      const c = document.querySelector(def.close);
      if (c) c.click();
    }
  }
  const fresh = navButtons(panel); // le clic a pu changer le panneau
  fresh.forEach((el, i) => el.classList.toggle('padfocus', i === navI));
  const focused = fresh[navI];
  if (focused && focused.scrollIntoView) focused.scrollIntoView({ block: 'nearest' });
  return true;
}
/* Un panneau (menu) est-il ouvert POUR CE JOUEUR ? — exposé pour la
   manette smartphone / le joueur en ligne (who : 1 ou 2). */
export function anyPanelOpen(who) { return activePanel(who === 2 ? 2 : 1); }

/* Publie la manette principale vers la légende des boutons (UI.js) dès
   qu'elle change — connexion, déconnexion, bascule solo/coop, démarrage. */
function syncPadLegend(gp) {
  const key = gp && G.started ? padKey(gp) + (S.COOP ? '|p2' : '') : '';
  if (key === gpLegendKey) return;
  gpLegendKey = key;
  S.padBrand = key ? getMap(gp).brand : null;
  S.padName = key ? padShortName(gp) : '';
  document.body.classList.toggle('gp-on', !!key);
  updatePadLegend();
}

/* Efface / réaffiche les contrôles tactiles selon l'activité manette. */
function syncTouchUi() {
  if (!IS_TOUCH) return;
  const hide = gpUiT > 0;
  if (hide !== gpUiHidden) {
    gpUiHidden = hide;
    document.body.classList.toggle('gp-play', hide);
  }
}
/* Zone morte à rééchelonnage linéaire : au-delà du seuil, la valeur repart
   de 0 (pas de saut brusque façon |v|>seuil, qui donne cette sensation de
   viseur qui "accroche" dès qu'on touche le stick). */
function deadzone(v, z) {
  const av = Math.abs(v);
  if (av <= z) return 0;
  return Math.sign(v) * (av - z) / (1 - z);
}
/* Courbe de réponse de visée façon FPS moderne : précise sur les petits
   mouvements de stick, qui accélère sur les grands — la vitesse maximale
   de rotation ne change pas (courbe(1) = 1). */
function aimCurve(v) {
  return Math.sign(v) * Math.pow(Math.abs(v), 1.6);
}
/* Lance le sort assigné à l'emplacement manette i — Y/LB/RB/LT/RT,
   réglable dans ⚙ Réglages (les boutons tactiles, eux, portent chacun
   leur sort et suivent la même assignation via updateTouchSlots). */
function castSlot(i, pl) {
  const id = settings.slots[i];
  if (id && POWERS.some(p => p.id === id)) castSpecific(id, pl);
}
export function updateGamepad(dt) {
  if (S.gpDisabled) return;
  S.gpActiveT = Math.max(0, S.gpActiveT - dt); // la visée assistée suit l'activité manette
  gpUiT = Math.max(0, gpUiT - dt);
  let pads = [];
  try {
    pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
  } catch (e) {
    /* Certains environnements (iframes, aperçus d'applications) interdisent
       l'API Gamepad par politique de permissions : on la coupe proprement
       pour ne pas bloquer la boucle de jeu. */
    S.gpDisabled = true;
    return;
  }
  gpMove.x = 0; gpMove.z = 0; S.gpSprint = false; S.gpJumpHeld = false;
  p2.input.mx = 0; p2.input.mz = 0; p2.input.sprint = false; p2.input.jumpHeld = false;
  /* Filet de sécurité : certains navigateurs n'exposent une manette
     Bluetooth qu'après un premier appui, parfois SANS émettre
     gamepadconnected — l'annonce/calibrage se fait alors ici. */
  for (const p of pads) announcePad(p);
  /* Choix de la manette principale : celle déjà élue si toujours là,
     sinon (ou si elle est muette pendant qu'une autre parle) la manette
     qui montre une activité réelle prend la main. */
  let gp = pads.find(p => p.index === gpPrimary) || null;
  const actThr = Math.max(0.25, settings.deadzone);
  for (const p of pads) {
    if (gp && p.index === gp.index) continue;
    if (!padActive(p, getMap(p), actThr)) continue;
    if (gp && padActive(gp, getMap(gp), actThr)) continue; // la principale parle encore : elle garde la main
    if (gp && G.started) showMsg('🎮 ' + (p.id || 'Manette').slice(0, 32) + ' devient la manette principale.', 2.5);
    gp = p;
    break;
  }
  if (!gp) gp = pads[0] || null;
  syncPadLegend(gp);
  syncTouchUi();
  if (!gp) { gpPrimary = -1; return; }
  gpPrimary = gp.index;
  const m = getMap(gp);
  const dz = v => deadzone(v, settings.deadzone);
  /* Boutons : index standards + replis non standard appris (gâchettes en
     axes → LT/RT, Start parfois à l'index 11). */
  const b = i => {
    if (gp.buttons[i] && gp.buttons[i].pressed) return true;
    if (!m.std) {
      if (i === 6 && m.trig.length > 0) return gp.axes[m.trig[0]] > 0;
      if (i === 7 && m.trig.length > 1) return gp.axes[m.trig[1]] > 0;
      if (i === 9 && gp.buttons[11]) return gp.buttons[11].pressed;
    }
    return false;
  };
  const hat = hatDirs(gp, m);
  const padUp = () => b(12) || hat.up, padDown = () => b(13) || hat.down;
  const padLeft = () => b(14) || hat.left, padRight = () => b(15) || hat.right;
  const camX = dz(gp.axes[m.camX] || 0), camY = dz(gp.axes[m.camY] || 0);
  if (padActive(gp, m, settings.deadzone)) { S.gpActiveT = 2; gpUiT = 6; syncTouchUi(); }
  const snapPrev = () => {
    S.gpPrev = { 0: b(0), 1: b(1), 2: b(2), 3: b(3), 4: b(4), 5: b(5), 6: b(6), 7: b(7),
      8: b(8), 9: b(9), 12: padUp(), 13: padDown(), 14: padLeft(), 15: padRight() };
  };
  /* — MENUS : dès qu'un panneau (LE SIEN — v9) est ouvert, la manette
     navigue DEDANS et le gameplay ne reçoit plus rien. En coop, la manette
     pilote le J2 : le panneau du J1 (sac, carte, pause...) ne la concerne
     plus — le J2 continue de jouer pendant que le J1 gère son écran. */
  const gpWho = S.COOP ? 2 : 1;
  const panel = activePanel(gpWho);
  if (panel) {
    padMenus(panel, b, { up: padUp, down: padDown, left: padLeft, right: padRight }, gp, dt);
    snapPrev();
    return;
  }
  if (navPanel) clearPadFocus(); // on sort d'un menu : éteint la surbrillance
  // Pause (Start) — propre au J2 en coop (le J1 garde la sienne, Échap)
  if (b(9) && !S.gpPrev[9] && G.started && !G.over && !myDialog(gpWho)) {
    if (S.COOP) { p2.paused = !p2.paused; }
    else { G.paused = !G.paused; $('pause').classList.toggle('hidden', !G.paused); }
  }
  // Select / Back : la carte d'Ombreciel (écran du J1 uniquement)
  if (!S.COOP && b(8) && !S.gpPrev[8] && G.started && !G.over && !myDialog(1)) toggleMap();
  if (G.started && !G.over) {
    if (myDialog(gpWho)) {
      if ((b(0) || b(2)) && !S.gpPrev[0] && !S.gpPrev[2]) dlgNext();
    } else if (S.COOP ? !p2.paused : !G.paused) {
      if (S.COOP) {
        /* --- La manette contrôle le JOUEUR 2 : SES propres arts, jamais
           bloqués par le sac (Tab) ou la pause du JOUEUR 1 --- */
        p2.input.mx = dz(gp.axes[0]);
        p2.input.mz = -dz(gp.axes[1]);
        p2.yaw -= aimCurve(camX) * 2.6 * settings.padSens * dt;
        p2.pitch -= aimCurve(camY) * 1.8 * settings.padSens * dt * (settings.invertY ? -1 : 1);
        p2.pitch = Math.max(-1.22, Math.min(0.85, p2.pitch));
        p2.input.sprint = b(10);
        p2.input.jumpHeld = b(0);
        if (b(0) && !S.gpPrev[0]) p2.jumpQ = 0.14;                       // A : saut J2
        if (b(2)) castSpecific('bolt', p2);                              // X : attaque de base J2 (jamais un autre sort)
        if (b(1) && !S.gpPrev[1]) tryInteractP2();                       // B : interagir J2
        if (b(3) && !S.gpPrev[3]) castSlot(0, p2);                       // Y : emplacement 1 J2
        if (b(4) && !S.gpPrev[4]) castSlot(1, p2);                       // LB : emplacement 2 J2
        if (b(5) && !S.gpPrev[5]) castSlot(2, p2);                       // RB : emplacement 3 J2
        if (b(6) && !S.gpPrev[6]) castSlot(3, p2);                       // LT : emplacement 4 J2
        if (b(7) && !S.gpPrev[7]) castSlot(4, p2);                       // RT : emplacement 5 J2
        if (padUp() && !S.gpPrev[12]) castSpecific('nova', p2);          // Croix haut : Nova d'Aurore J2
        if (padDown() && !S.gpPrev[13]) castSpecific('meteor', p2);      // Croix bas : Astre d'Aube J2
      } else {
        /* --- Solo : la manette contrôle le JOUEUR 1 --- */
        gpMove.x = dz(gp.axes[0]);
        gpMove.z = -dz(gp.axes[1]);
        S.yaw -= aimCurve(camX) * 2.6 * settings.padSens * dt;
        S.pitch -= aimCurve(camY) * 1.8 * settings.padSens * dt * (settings.invertY ? -1 : 1);
        S.pitch = Math.max(-1.22, Math.min(0.85, S.pitch));
        if (Math.abs(gpMove.x) + Math.abs(gpMove.z) > 0.1) tut.moved += 0.08;
        if (Math.abs(camX) + Math.abs(camY) > 0.1) tut.looked += 0.04;
        S.gpSprint = b(10); // stick gauche enfoncé
        S.gpJumpHeld = b(0);
        if (b(0) && !S.gpPrev[0]) S.jumpQueued = 0.14;                  // A / Croix : saut
        if (b(2) && !G.inv) castSpecific('bolt');                       // X / Carré : attaque de base (tenir pour enchaîner) — jamais un autre sort
        if (b(1) && !S.gpPrev[1]) tryInteract();                        // B / Rond : interagir
        if (b(3) && !S.gpPrev[3] && !G.inv) castSlot(0);                // Y / Triangle : emplacement 1
        if (b(4) && !S.gpPrev[4] && !G.inv) castSlot(1);                // LB / L1 : emplacement 2
        if (b(5) && !S.gpPrev[5] && !G.inv) castSlot(2);                // RB / R1 : emplacement 3
        if (b(6) && !S.gpPrev[6] && !G.inv) castSlot(3);                // LT / L2 : emplacement 4
        if (b(7) && !S.gpPrev[7] && !G.inv) castSlot(4);                // RT / R2 : emplacement 5
        if (padUp() && !S.gpPrev[12] && !G.inv) castSpecific('nova');    // Croix haut : Nova d'Aurore
        if (padDown() && !S.gpPrev[13] && !G.inv) castSpecific('meteor');// Croix bas : Astre d'Aube
      }
    }
  }
  snapPrev();
}

/* ================================================================
   CONTRÔLES TACTILES (téléphone / tablette) — refonte gameplay :
   · Joystick virtuel à gauche (poussé à fond = sprint)
   · Glisser à droite = caméra · TOUCHER UN ENNEMI = le verrouiller
   · Bouton d'attaque : TOUJOURS l'attaque de base — maintenir pour
     enchaîner, GLISSER SANS LÂCHER pour affiner la visée (double-stick)
   · Un bouton dédié par sort appris ET assigné (⚙ Réglages), recharge visible
   · ▲ saut (maintenir = planer avec les ailes) · E agir · ⚒ artisanat
   ================================================================ */

/* Toucher un ennemi à l'écran = le verrouiller quelques secondes (la
   dague ◈ le suit). Un toucher dans le vide relâche le verrou manuel. */
function pickTapTarget(x, y) {
  if (!S.camera || !G.started) return;
  let best = null, bd = 64; // rayon de tolérance en pixels
  const v = new THREE.Vector3();
  for (const e of enemies) {
    if (e.dead) continue;
    if (S.camera.position.distanceTo(e.g.position) > 55) continue;
    v.set(e.g.position.x, e.g.position.y + 0.55 * e.s, e.g.position.z).project(S.camera);
    if (v.z > 1 || v.z < -1) continue;
    const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (1 - (v.y * 0.5 + 0.5)) * innerHeight;
    const d = Math.hypot(sx - x, sy - y);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) {
    S.aimManual = best; S.aimManualT = 6;
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
  } else if (S.aimManual) {
    S.aimManual = null; S.aimManualT = 0;
  }
}

export function setupTouch() {
  if (!IS_TOUCH) return;
  const joy = $('joy'), knob = $('joyknob'), look = $('lookzone');
  /* --- Joystick : un pointeur dédié, rayon 52 px --- */
  let joyId = null;
  function joyMove(e) {
    const r = joy.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy), max = 52;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    tmMove.x = dx / max;
    tmMove.z = -dy / max;
  }
  joy.addEventListener('pointerdown', e => {
    e.preventDefault(); joyId = e.pointerId;
    joy.setPointerCapture(e.pointerId); joyMove(e);
  });
  joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyMove(e); });
  const joyEnd = e => {
    if (e.pointerId !== joyId) return;
    joyId = null; tmMove.x = 0; tmMove.z = 0;
    knob.style.transform = 'translate(0,0)';
  };
  joy.addEventListener('pointerup', joyEnd);
  joy.addEventListener('pointercancel', joyEnd);
  /* --- Zone caméra : glisser pour orienter · tap bref = verrouiller
     l'ennemi touché (ou avancer un dialogue) --- */
  let lookId = null, lx = 0, ly = 0, lookMoved = 0, lookT0 = 0;
  look.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (myDialog(1)) { dlgNext(); return; }
    lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
    lookMoved = 0; lookT0 = performance.now();
    look.setPointerCapture(e.pointerId);
  });
  look.addEventListener('pointermove', e => {
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    lookMoved += Math.abs(dx) + Math.abs(dy);
    if (G.started && !G.paused && !myDialog(1)) {
      const s = 0.0052 * settings.mouseSens;
      S.yaw -= dx * s;
      S.pitch -= dy * s * (settings.invertY ? -1 : 1);
      S.pitch = Math.max(-1.22, Math.min(0.85, S.pitch));
      tut.looked += (Math.abs(dx) + Math.abs(dy)) * 0.0052;
    }
  });
  const lookEnd = e => {
    if (e.pointerId !== lookId) return;
    lookId = null;
    // tap bref et immobile = tentative de verrouillage de cible
    if (lookMoved < 12 && performance.now() - lookT0 < 350 && G.started && !G.paused && !myDialog(1))
      pickTapTarget(e.clientX, e.clientY);
  };
  look.addEventListener('pointerup', lookEnd);
  look.addEventListener('pointercancel', e => { if (e.pointerId === lookId) lookId = null; });
  /* --- Bouton d'attaque : maintenir = enchaîner les coups, glisser sans
     lâcher = affiner la visée pendant le tir (sensibilité réduite pour la
     précision — le double-stick des shooters mobiles) --- */
  const atk = $('t-attack');
  let atkId = null, ax = 0, ay = 0;
  atk.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    if (myDialog(1)) { dlgNext(); return; }
    atkId = e.pointerId; ax = e.clientX; ay = e.clientY;
    try { atk.setPointerCapture(e.pointerId); } catch (err) {}
    S.tmBoltHeld = true; // toujours l'attaque de base, jamais le dernier sort débloqué
    /* le coup part dès l'appui : un tap bref frappe aussi (le maintien,
       lui, enchaîne via la boucle principale — la recharge fait le tri) */
    if (G.started && !G.paused && !G.over && !G.inv && !myTree(1) && !G.travelOpen) castSpecific('bolt');
  });
  atk.addEventListener('pointermove', e => {
    if (e.pointerId !== atkId) return;
    const dx = e.clientX - ax, dy = e.clientY - ay;
    ax = e.clientX; ay = e.clientY;
    if (G.started && !G.paused && !myDialog(1)) {
      const s = 0.0036 * settings.mouseSens; // plus fin que le glisser-caméra : c'est de la visée
      S.yaw -= dx * s;
      S.pitch -= dy * s * (settings.invertY ? -1 : 1);
      S.pitch = Math.max(-1.22, Math.min(0.85, S.pitch));
    }
  });
  const atkEnd = e => { if (e.pointerId === atkId) { atkId = null; S.tmBoltHeld = false; } };
  atk.addEventListener('pointerup', atkEnd);
  atk.addEventListener('pointercancel', atkEnd);
  /* --- Boutons --- */
  const bind = (id, down, up) => {
    const el = $(id);
    el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); down(); });
    if (up) {
      el.addEventListener('pointerup', e => { e.preventDefault(); up(); });
      el.addEventListener('pointercancel', () => up());
    }
  };
  bind('t-jump', () => {
    if (myDialog(1)) { dlgNext(); return; }
    if (G.started && !G.paused && !G.over) S.jumpQueued = 0.14;
    S.tmJumpHeld = true;
  }, () => { S.tmJumpHeld = false; });
  bind('t-act', () => {
    if (myDialog(1)) { dlgNext(); return; }
    tryInteract();
  });
  /* Un bouton par sort : lancement direct, sans cycle — le pouce droit a
     toute la panoplie sous lui, comme sur manette. N'apparaissent que les
     sorts appris ET assignés dans ⚙ Réglages (voir updateTouchSlots, UI.js). */
  document.querySelectorAll('#spellbar .sbtn').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      if (myDialog(1)) { dlgNext(); return; }
      if (!G.started || G.paused || G.over || G.inv) return;
      castSpecific(btn.dataset.power);
      try { if (navigator.vibrate) navigator.vibrate(10); } catch (err) {}
    });
  });
  bind('t-craft', () => toggleInv()); // 🎒 : le sac-atelier (met le jeu en pause)
  bind('t-tree', () => toggleTree());
  bind('t-map', () => toggleMap());
  bind('t-pause', () => {
    if (!G.started || G.over || myDialog(1)) return;
    G.paused = !G.paused;
    $('pause').classList.toggle('hidden', !G.paused);
  });
}
/* ================================================================
   RÉGLAGES (menu pause) — sensibilité souris/tactile, sensibilité
   manette, zone morte, inversion d'axe Y, luminosité nocturne.
   Persistés en localStorage (voir state.js : settings/saveSettings).
   ================================================================ */
export function initSettingsUI() {
  const bindSlider = (id, key, onChange) => {
    const el = $(id), val = $(id + '-val');
    const show = () => { if (val) val.textContent = Number(settings[key]).toFixed(2); };
    el.value = settings[key];
    show();
    el.addEventListener('input', () => {
      settings[key] = parseFloat(el.value);
      show();
      if (onChange) onChange();
      saveSettings();
    });
  };
  bindSlider('set-mouse', 'mouseSens');
  bindSlider('set-pad', 'padSens');
  bindSlider('set-deadzone', 'deadzone');
  /* la luminosité passe par le cycle jour/nuit : réappliquer l'éclairage
     immédiatement (dt = 0) pour un aperçu en direct, même en pause */
  bindSlider('set-brightness', 'brightness', () => updateDayNight(0));
  const inv = $('set-invert');
  inv.checked = settings.invertY;
  inv.addEventListener('change', () => { settings.invertY = inv.checked; saveSettings(); });
  /* Assignation des 5 emplacements de sort (manette Y/LB/RB/LT/RT et
     colonne tactile). L'attaque de base reste sur X/✦, non assignable. */
  const assignable = POWERS.filter(p => p.id !== 'bolt');
  for (let i = 0; i < 5; i++) {
    const sel = $('slot-' + i);
    const none = document.createElement('option');
    none.value = ''; none.textContent = '— (vide)';
    sel.appendChild(none);
    for (const p of assignable) {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.icon + ' ' + p.name;
      sel.appendChild(o);
    }
    sel.value = settings.slots[i] || '';
    sel.addEventListener('change', () => {
      settings.slots[i] = sel.value || null;
      saveSettings();
      updateTouchSlots();
      updatePadLegend(); // la légende manette reflète la nouvelle assignation
    });
  }
  $('btn-settings').addEventListener('click', () => {
    $('pause').classList.add('hidden');
    $('settings').classList.remove('hidden');
  });
  $('btn-settings-close').addEventListener('click', () => {
    $('settings').classList.add('hidden');
    $('pause').classList.remove('hidden');
  });
}

/* Plein écran au lancement sur mobile (améliore la surface de jeu).
   Le verrouillage d'orientation n'est pas supporté partout (notamment
   iOS Safari) : on essaie sans bloquer si le navigateur refuse. */
export function tryFullscreenMobile() {
  if (!IS_TOUCH) return;
  if (IS_IOS) {
    /* iPhone : Safari n'expose AUCUNE API plein écran (requestFullscreen
       n'existe que sur <video>). Le seul vrai plein écran est la PWA
       « Sur l'écran d'accueil » — déjà actif si on y est (standalone). */
    if (!IS_STANDALONE)
      showMsg('📱 Plein écran iPhone : Partager ⬆ puis « Sur l\'écran d\'accueil ».', 5);
    return;
  }
  try {
    const el = document.documentElement;
    const p = el.requestFullscreen ? el.requestFullscreen() : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null);
    if (p && p.then) p.then(() => {
      try {
        if (screen.orientation && screen.orientation.lock)
          screen.orientation.lock('landscape').catch(() => {});
      } catch (e) {}
    }).catch(() => {});
  } catch (e) { /* plein écran interdit dans cet environnement : on continue en fenêtré */ }
}
