/* ================================================================
   CYCLE JOUR / NUIT — l'Horloge d'Ombreciel.
   · G.hour (0-24, sauvegardée) avance en continu : une journée complète
     dure 16 minutes réelles (1 h du monde = 40 s). La partie commence à
     9 h : les premières quêtes se vivent en plein jour.
   · Aube 6 h → 8 h, crépuscule 20 h → 22 h (fondus doux).
   · Le VISUEL suit : ciel de jour fondu sur le ciel de nuit, soleil qui
     parcourt la voûte, lune/étoiles la nuit, brouillard, lumières,
     exposition — on VOIT immédiatement si c'est le jour ou la nuit.
   · Le GAMEPLAY suit : la nuit, les ombres frappent plus fort (jusqu'à
     ×1,8), accélèrent, les renforts affluent — mais leur chute rapporte
     plus d'expérience (voir Enemies.js, via S.nightK / S.nightMul).
   · L'horloge du HUD (#clock) affiche l'heure et l'astre du moment.
   ================================================================ */
import * as THREE from 'three';
import { G, S } from './state.js';
import { $, showMsg } from './UI.js';

const HOURS_PER_SEC = 24 / (16 * 60); // journée complète en 16 minutes réelles

/* 0 = nuit noire, 1 = plein jour, transitions douces à l'aube et au crépuscule */
export function dayFactor(h) {
  if (h >= 8 && h < 20) return 1;
  if (h >= 6 && h < 8) return (h - 6) / 2;        // aube
  if (h >= 20 && h < 22) return 1 - (h - 20) / 2; // crépuscule
  return 0;
}

/* Palettes jour / nuit (la nuit = l'ambiance d'origine du jeu) */
const NIGHT = {
  fog: new THREE.Color(0x0b1024), fogD: 0.0135,
  hemiSky: new THREE.Color(0x2a3c68), hemiGnd: new THREE.Color(0x0a0b14), hemiI: 0.85,
  amb: new THREE.Color(0x181c30), ambI: 0.8,
  dir: new THREE.Color(0x9fb4f0), dirI: 0.85,
  expo: 1.05
};
const DAY = {
  fog: new THREE.Color(0x93a8cf), fogD: 0.0085,
  hemiSky: new THREE.Color(0xbdd2f5), hemiGnd: new THREE.Color(0x55606e), hemiI: 1.15,
  amb: new THREE.Color(0x707c96), ambI: 0.9,
  dir: new THREE.Color(0xffe9c0), dirI: 2.0,
  expo: 1.12
};
const _c = new THREE.Color();
const lerpC = (a, b, f) => _c.copy(a).lerp(b, f);

let lastPhase = null; // 'day' | 'night' — pour n'annoncer chaque bascule qu'une fois

export function updateDayNight(dt) {
  G.hour = (G.hour + dt * HOURS_PER_SEC) % 24;
  const f = dayFactor(G.hour);
  // gameplay : noirceur et multiplicateur de dégâts des ombres
  S.nightK = 1 - f;
  S.nightMul = 1 + 0.8 * S.nightK;

  /* ---- Visuel ---- */
  if (S.scene && S.scene.fog) {
    S.scene.fog.color.copy(lerpC(NIGHT.fog, DAY.fog, f));
    S.scene.fog.density = NIGHT.fogD + (DAY.fogD - NIGHT.fogD) * f;
  }
  if (S.hemi) {
    S.hemi.color.copy(lerpC(NIGHT.hemiSky, DAY.hemiSky, f));
    S.hemi.groundColor.copy(lerpC(NIGHT.hemiGnd, DAY.hemiGnd, f));
    S.hemi.intensity = NIGHT.hemiI + (DAY.hemiI - NIGHT.hemiI) * f;
  }
  if (S.amb) {
    S.amb.color.copy(lerpC(NIGHT.amb, DAY.amb, f));
    S.amb.intensity = NIGHT.ambI + (DAY.ambI - NIGHT.ambI) * f;
  }
  if (S.dirLight) {
    S.dirLight.color.copy(lerpC(NIGHT.dir, DAY.dir, f));
    S.dirLight.intensity = NIGHT.dirI + (DAY.dirI - NIGHT.dirI) * f;
  }
  if (S.renderer) S.renderer.toneMappingExposure = NIGHT.expo + (DAY.expo - NIGHT.expo) * f;
  if (S.skyDay) S.skyDay.material.opacity = f;
  if (S.stars) S.stars.material.opacity = 0.9 * (1 - f);
  if (S.moon) S.moon.visible = f < 0.85;
  if (S.sun) {
    /* le soleil se lève à l'est (6 h) et se couche à l'ouest (22 h) */
    const a = Math.max(0, Math.min(1, (G.hour - 6) / 16)) * Math.PI;
    S.sun.position.set(-Math.cos(a) * 250, Math.sin(a) * 185 + 4, -130);
    S.sun.material.opacity = f;
    S.sun.children[0].material.opacity = 0.55 * f;
    S.sun.visible = f > 0.02;
    /* la lumière directionnelle suit le soleil de jour, la lune la nuit */
    if (S.dirLight) {
      const nx = 70, ny = 110, nz = -50; // position "lune" d'origine
      const dx = S.sun.position.x * 0.45, dy = Math.max(45, S.sun.position.y * 0.75), dz = S.sun.position.z * 0.6;
      S.dirLight.position.set(nx + (dx - nx) * f, ny + (dy - ny) * f, nz + (dz - nz) * f);
    }
  }

  /* ---- Horloge du HUD + annonces de bascule ---- */
  const clock = $('clock');
  if (clock) {
    const hh = Math.floor(G.hour), mm = Math.floor((G.hour - hh) * 60);
    clock.textContent = (f > 0.5 ? '☀ ' : '☾ ') + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    clock.classList.toggle('night', f <= 0.5);
  }
  const phase = f > 0.5 ? 'day' : 'night';
  if (lastPhase && phase !== lastPhase && G.started) {
    if (phase === 'night')
      showMsg('☾ La nuit tombe sur Ombreciel... Les ombres s\'enhardissent : restez près des feux de bivouac.', 5);
    else
      showMsg('☀ Le jour se lève. Les ombres se terrent — le moment idéal pour explorer.', 4.5);
  }
  lastPhase = phase;
}
