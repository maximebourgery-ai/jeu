/* ================================================================
   CONTRÔLES — clavier/souris (PointerLock), tactile (joystick virtuel
   + boutons), manette Xbox/PS (Gamepad API).
   La manette smartphone (PeerJS) est dans Network.js.
   ================================================================ */
import { G, S, IS_TOUCH, POWERS, keys, p2, tut, gpMove, tmMove } from './state.js';
import { A } from './Audio.js';
import { $, showMsg, refreshPowers, refreshInv, closeTravel } from './UI.js';
import { dlgNext } from './Quests.js';
import { craftAction } from './Crafting.js';
import { toggleTree } from './SkillTree.js';
import { tryInteract, tryInteractP2 } from './World.js';
import { castPower, castPowerP2, cyclePower, castSpecific } from './Powers.js';

/* ---------------- ENTRÉES (verrouillage souris + repli glisser) ---------------- */
export function lockPointer() {
  if (IS_TOUCH) return; // pas de verrouillage souris sur écran tactile
  if (!S.plOK || !S.renderer) return;
  try { S.renderer.domElement.requestPointerLock(); } catch (e) { S.plOK = false; }
}

export function initControls() {
  document.addEventListener('pointerlockerror', () => {
    S.plOK = false;
    showMsg('Astuce : maintenez le clic gauche et déplacez la souris pour orienter la caméra.', 4);
  });
  addEventListener('keydown', e => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    keys[e.code] = true;
    if (e.code === 'Space' && G.started && !G.paused && !G.dialog && !G.over) S.jumpQueued = 0.14;
    if (!G.started || G.over) return;
    if (G.dialog) { if (e.code === 'KeyE' || e.code === 'Space') dlgNext(); return; }
    if (e.code === 'Escape' && !document.pointerLockElement) {
      if (G.travelOpen) { closeTravel(); return; }
      if (G.treeOpen) { toggleTree(); return; }
      G.paused = !G.paused;
      $('pause').classList.toggle('hidden', !G.paused);
      return;
    }
    if (e.code === 'Tab' && !G.paused) { G.inv = !G.inv; refreshInv(); $('inv').classList.toggle('hidden', !G.inv); }
    if (/^Digit[1-6]$/.test(e.code)) {
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
    }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });

  addEventListener('mousemove', e => {
    const locked = !!document.pointerLockElement;
    if (locked || (S.mDown && G.started && !G.paused)) {
      S.yaw -= e.movementX * 0.0024;
      S.pitch -= e.movementY * 0.0024;
      S.pitch = Math.max(-1.22, Math.min(0.85, S.pitch));
      tut.looked += Math.abs(e.movementX) * 0.0024 + Math.abs(e.movementY) * 0.0024;
      if (!locked) S.dragDist += Math.abs(e.movementX) + Math.abs(e.movementY);
    }
  });
  addEventListener('mousedown', e => {
    if (!G.started || G.over) return;
    if (G.dialog) { dlgNext(); return; }
    if (G.paused || G.treeOpen || G.travelOpen) return;
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
    if (!document.pointerLockElement && G.started && !G.paused && !G.inv && !G.dialog && !G.over && S.dragDist < 6) {
      castPower();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && G.started && !G.over && !G.dialog && !G.treeOpen && !G.travelOpen) {
      G.paused = true; $('pause').classList.remove('hidden');
    }
  });

  addEventListener('gamepadconnected', e => {
    showMsg('🎮 Manette détectée : ' + e.gamepad.id.slice(0, 40), 3);
  });
  $('btn-travelclose').addEventListener('click', closeTravel);
}

/* ================================================================
   MANETTE (Gamepad API — Xbox / PlayStation)
   Stick gauche : déplacement · Stick droit : caméra · Stick G. enfoncé : sprint
   A/Croix : saut · B/Rond : interagir · Start : pause
   Un bouton dédié par sort (plus besoin de cycler avant de lancer) :
     X/Carré      : sort 1 — Trait astral (tenir pour l'attaque continue)
     Y/Triangle   : sort 2 — Pas du vent
     LB/L1        : sort 3 — Main céleste
     RB/R1        : sort 4 — Égide
     LT/L2        : sort 5 — Souffle glacé
     RT/R2        : sort 6 — Bénédiction
   ================================================================ */
export function updateGamepad(dt) {
  if (S.gpDisabled) return;
  let pads = [];
  try {
    pads = navigator.getGamepads ? navigator.getGamepads() : [];
  } catch (e) {
    /* Certains environnements (iframes, aperçus d'applications) interdisent
       l'API Gamepad par politique de permissions : on la coupe proprement
       pour ne pas bloquer la boucle de jeu. */
    S.gpDisabled = true;
    return;
  }
  const gp = pads[0] || pads[1] || pads[2] || pads[3];
  gpMove.x = 0; gpMove.z = 0; S.gpSprint = false; S.gpJumpHeld = false;
  p2.input.mx = 0; p2.input.mz = 0; p2.input.sprint = false; p2.input.jumpHeld = false;
  if (!gp) return;
  const dz = v => Math.abs(v) > 0.18 ? v : 0;
  const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
  // Pause (Start)
  if (b(9) && !S.gpPrev[9] && G.started && !G.over && !G.dialog) {
    G.paused = !G.paused;
    $('pause').classList.toggle('hidden', !G.paused);
  }
  if (G.started && !G.over) {
    if (G.dialog) {
      if ((b(0) || b(2)) && !S.gpPrev[0] && !S.gpPrev[2]) dlgNext();
    } else if (!G.paused) {
      if (S.COOP) {
        /* --- La manette contrôle le JOUEUR 2 --- */
        p2.input.mx = dz(gp.axes[0]);
        p2.input.mz = -dz(gp.axes[1]);
        p2.yaw -= dz(gp.axes[2] || 0) * 2.6 * dt;
        p2.pitch -= dz(gp.axes[3] || 0) * 1.8 * dt;
        p2.pitch = Math.max(-1.22, Math.min(0.85, p2.pitch));
        p2.input.sprint = b(10);
        p2.input.jumpHeld = b(0);
        if (b(0) && !S.gpPrev[0]) p2.jumpQ = 0.14;                       // A : saut J2
        if (b(2) && !G.inv) castPowerP2();                               // X : sort 1 (attaque) J2
        if (b(1) && !S.gpPrev[1]) tryInteractP2();                       // B : interagir J2
        if (b(3) && !S.gpPrev[3] && !G.inv) castSpecific('dash', p2);    // Y : sort 2 J2
        if (b(4) && !S.gpPrev[4] && !G.inv) castSpecific('tk', p2);      // LB : sort 3 J2
        if (b(5) && !S.gpPrev[5] && !G.inv) castSpecific('shield', p2);  // RB : sort 4 J2
        if (b(6) && !S.gpPrev[6] && !G.inv) castSpecific('frost', p2);   // LT : sort 5 J2
        if (b(7) && !S.gpPrev[7] && !G.inv) castSpecific('heal', p2);    // RT : sort 6 J2
      } else {
        /* --- Solo : la manette contrôle le JOUEUR 1 --- */
        gpMove.x = dz(gp.axes[0]);
        gpMove.z = -dz(gp.axes[1]);
        S.yaw -= dz(gp.axes[2] || 0) * 2.6 * dt;
        S.pitch -= dz(gp.axes[3] || 0) * 1.8 * dt;
        S.pitch = Math.max(-1.22, Math.min(0.85, S.pitch));
        if (Math.abs(gpMove.x) + Math.abs(gpMove.z) > 0.1) tut.moved += 0.08;
        if (Math.abs(dz(gp.axes[2] || 0)) + Math.abs(dz(gp.axes[3] || 0)) > 0.1) tut.looked += 0.04;
        S.gpSprint = b(10); // stick gauche enfoncé
        S.gpJumpHeld = b(0);
        if (b(0) && !S.gpPrev[0]) S.jumpQueued = 0.14;                  // A / Croix : saut
        if (b(2) && !G.inv) castPower();                                // X / Carré : sort 1 (attaque, tenir pour enchaîner)
        if (b(1) && !S.gpPrev[1]) tryInteract();                        // B / Rond : interagir
        if (b(3) && !S.gpPrev[3] && !G.inv) castSpecific('dash');       // Y / Triangle : sort 2
        if (b(4) && !S.gpPrev[4] && !G.inv) castSpecific('tk');         // LB / L1 : sort 3
        if (b(5) && !S.gpPrev[5] && !G.inv) castSpecific('shield');     // RB / R1 : sort 4
        if (b(6) && !S.gpPrev[6] && !G.inv) castSpecific('frost');      // LT / L2 : sort 5
        if (b(7) && !S.gpPrev[7] && !G.inv) castSpecific('heal');       // RT / R2 : sort 6
      }
    }
  }
  S.gpPrev = { 0: b(0), 1: b(1), 2: b(2), 3: b(3), 4: b(4), 5: b(5), 6: b(6), 7: b(7), 9: b(9) };
}

/* ================================================================
   CONTRÔLES TACTILES (téléphone / tablette)
   Joystick virtuel à gauche · glisser à droite = caméra ·
   boutons : ✦ attaque (maintien possible) · ▲ saut (maintenir = planer
   avec les ailes) · E agir · ⟳ changer de sort · ⚒ artisanat · II pause
   ================================================================ */
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
  /* --- Zone caméra : glisser pour orienter, tap pour avancer un dialogue --- */
  let lookId = null, lx = 0, ly = 0;
  look.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (G.dialog) { dlgNext(); return; }
    lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
    look.setPointerCapture(e.pointerId);
  });
  look.addEventListener('pointermove', e => {
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    if (G.started && !G.paused && !G.dialog) {
      S.yaw -= dx * 0.0052;
      S.pitch -= dy * 0.0052;
      S.pitch = Math.max(-1.22, Math.min(0.85, S.pitch));
      tut.looked += (Math.abs(dx) + Math.abs(dy)) * 0.0052;
    }
  });
  const lookEnd = e => { if (e.pointerId === lookId) lookId = null; };
  look.addEventListener('pointerup', lookEnd);
  look.addEventListener('pointercancel', lookEnd);
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
    if (G.dialog) { dlgNext(); return; }
    if (G.started && !G.paused && !G.over) S.jumpQueued = 0.14;
    S.tmJumpHeld = true;
  }, () => { S.tmJumpHeld = false; });
  bind('t-attack', () => {
    if (G.dialog) { dlgNext(); return; }
    S.tmAttackHeld = true;
  }, () => { S.tmAttackHeld = false; });
  bind('t-act', () => {
    if (G.dialog) { dlgNext(); return; }
    tryInteract();
  });
  bind('t-spell', () => cyclePower(1));
  bind('t-craft', () => $('craftpanel').classList.toggle('hidden'));
  bind('t-tree', () => toggleTree());
  bind('cr-h', () => craftAction('H'));
  bind('cr-o', () => craftAction('O'));
  bind('cr-c', () => craftAction('C'));
  bind('t-pause', () => {
    if (!G.started || G.over || G.dialog) return;
    G.paused = !G.paused;
    $('pause').classList.toggle('hidden', !G.paused);
  });
}
/* Plein écran au lancement sur mobile (améliore la surface de jeu).
   Le verrouillage d'orientation n'est pas supporté partout (notamment
   iOS Safari) : on essaie sans bloquer si le navigateur refuse. */
export function tryFullscreenMobile() {
  if (!IS_TOUCH) return;
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
