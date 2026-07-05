/* ================================================================
   CONTRÔLES — clavier/souris (PointerLock), tactile (joystick virtuel
   + boutons), manette Xbox/PS (Gamepad API).
   La manette smartphone (PeerJS) est dans Network.js.
   ================================================================ */
import * as THREE from 'three';
import { G, S, IS_TOUCH, POWERS, keys, p2, tut, gpMove, tmMove, enemies, settings, saveSettings } from './state.js';
import { updateDayNight } from './DayNight.js'; // (cycle sûr : appel différé, curseur de luminosité)
import { A } from './Audio.js';
import { $, showMsg, refreshPowers, refreshInv, closeTravel, updateTouchSlots } from './UI.js';
import { dlgNext } from './Quests.js';
import { craftAction } from './Crafting.js';
import { toggleTree } from './SkillTree.js';
import { tryInteract, tryInteractP2 } from './World.js';
import { castPower, castSpecific } from './Powers.js';

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
   X/Carré : TOUJOURS l'attaque de base (tenir pour l'attaque continue),
   même si un nouveau sort vient d'être débloqué/sélectionné.
   Y/LB/RB/LT/RT : 5 emplacements de sort assignables dans ⚙ Réglages
   (par défaut : Pas du vent, Main céleste, Égide, Souffle glacé, Bénédiction).
   ================================================================ */
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
  const dz = v => deadzone(v, settings.deadzone);
  const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
  if (gp.buttons.some(x => x && x.pressed) || gp.axes.some(a => Math.abs(a) > settings.deadzone)) S.gpActiveT = 2;
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
        p2.yaw -= aimCurve(dz(gp.axes[2] || 0)) * 2.6 * settings.padSens * dt;
        p2.pitch -= aimCurve(dz(gp.axes[3] || 0)) * 1.8 * settings.padSens * dt * (settings.invertY ? -1 : 1);
        p2.pitch = Math.max(-1.22, Math.min(0.85, p2.pitch));
        p2.input.sprint = b(10);
        p2.input.jumpHeld = b(0);
        if (b(0) && !S.gpPrev[0]) p2.jumpQ = 0.14;                       // A : saut J2
        if (b(2) && !G.inv) castSpecific('bolt', p2);                    // X : attaque de base J2 (jamais un autre sort)
        if (b(1) && !S.gpPrev[1]) tryInteractP2();                       // B : interagir J2
        if (b(3) && !S.gpPrev[3] && !G.inv) castSlot(0, p2);             // Y : emplacement 1 J2
        if (b(4) && !S.gpPrev[4] && !G.inv) castSlot(1, p2);             // LB : emplacement 2 J2
        if (b(5) && !S.gpPrev[5] && !G.inv) castSlot(2, p2);             // RB : emplacement 3 J2
        if (b(6) && !S.gpPrev[6] && !G.inv) castSlot(3, p2);             // LT : emplacement 4 J2
        if (b(7) && !S.gpPrev[7] && !G.inv) castSlot(4, p2);             // RT : emplacement 5 J2
      } else {
        /* --- Solo : la manette contrôle le JOUEUR 1 --- */
        gpMove.x = dz(gp.axes[0]);
        gpMove.z = -dz(gp.axes[1]);
        S.yaw -= aimCurve(dz(gp.axes[2] || 0)) * 2.6 * settings.padSens * dt;
        S.pitch -= aimCurve(dz(gp.axes[3] || 0)) * 1.8 * settings.padSens * dt * (settings.invertY ? -1 : 1);
        S.pitch = Math.max(-1.22, Math.min(0.85, S.pitch));
        if (Math.abs(gpMove.x) + Math.abs(gpMove.z) > 0.1) tut.moved += 0.08;
        if (Math.abs(dz(gp.axes[2] || 0)) + Math.abs(dz(gp.axes[3] || 0)) > 0.1) tut.looked += 0.04;
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
      }
    }
  }
  S.gpPrev = { 0: b(0), 1: b(1), 2: b(2), 3: b(3), 4: b(4), 5: b(5), 6: b(6), 7: b(7), 9: b(9) };
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
    if (G.dialog) { dlgNext(); return; }
    lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
    lookMoved = 0; lookT0 = performance.now();
    look.setPointerCapture(e.pointerId);
  });
  look.addEventListener('pointermove', e => {
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    lookMoved += Math.abs(dx) + Math.abs(dy);
    if (G.started && !G.paused && !G.dialog) {
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
    if (lookMoved < 12 && performance.now() - lookT0 < 350 && G.started && !G.paused && !G.dialog)
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
    if (G.dialog) { dlgNext(); return; }
    atkId = e.pointerId; ax = e.clientX; ay = e.clientY;
    try { atk.setPointerCapture(e.pointerId); } catch (err) {}
    S.tmBoltHeld = true; // toujours l'attaque de base, jamais le dernier sort débloqué
    /* le coup part dès l'appui : un tap bref frappe aussi (le maintien,
       lui, enchaîne via la boucle principale — la recharge fait le tri) */
    if (G.started && !G.paused && !G.over && !G.inv && !G.treeOpen && !G.travelOpen) castSpecific('bolt');
  });
  atk.addEventListener('pointermove', e => {
    if (e.pointerId !== atkId) return;
    const dx = e.clientX - ax, dy = e.clientY - ay;
    ax = e.clientX; ay = e.clientY;
    if (G.started && !G.paused && !G.dialog) {
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
    if (G.dialog) { dlgNext(); return; }
    if (G.started && !G.paused && !G.over) S.jumpQueued = 0.14;
    S.tmJumpHeld = true;
  }, () => { S.tmJumpHeld = false; });
  bind('t-act', () => {
    if (G.dialog) { dlgNext(); return; }
    tryInteract();
  });
  /* Un bouton par sort : lancement direct, sans cycle — le pouce droit a
     toute la panoplie sous lui, comme sur manette. N'apparaissent que les
     sorts appris ET assignés dans ⚙ Réglages (voir updateTouchSlots, UI.js). */
  document.querySelectorAll('#spellbar .sbtn').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      if (G.dialog) { dlgNext(); return; }
      if (!G.started || G.paused || G.over || G.inv) return;
      castSpecific(btn.dataset.power);
      try { if (navigator.vibrate) navigator.vibrate(10); } catch (err) {}
    });
  });
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
