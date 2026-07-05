/* ================================================================
   ANIMATIONS — gestes d'attaque procéduraux du bras armé (une
   signature par voie), traînées de coups (arcs lumineux), anneaux
   d'onde de choc au sol. Aucune dépendance vers Player/Powers :
   ce module est appelé par eux (jamais l'inverse).
   ================================================================ */
import * as THREE from 'three';
import { S } from './state.js';

/* Cadence et geste par voie : chaque classe a sa signature de coup.
   · Mage     : estocade du bâton, pointe qui flamboie
   · Guerrier : taillade ample de l'épée (épaule + torsion)
   · Assassin : jets de dagues alternés, secs et rapides
   · Paladin  : marteau levé haut puis abattu, lourd et solennel */
const ATK = {
  mage:     { dur: 0.26, kind: 'thrust' },
  warrior:  { dur: 0.30, kind: 'slash'  },
  assassin: { dur: 0.16, kind: 'throw'  },
  paladin:  { dur: 0.36, kind: 'smash'  }
};

export function playAttack(pl, pathId) {
  const a = ATK[pathId] || ATK.mage;
  pl.atkT = a.dur; pl.atkDur = a.dur; pl.atkKind = a.kind;
  pl.atkAlt = !pl.atkAlt; // Assassin : alterne dague droite / dague gauche
}

/* Pose du bras armé, chaque frame : balancement de marche quand on se
   déplace, geste d'attaque par-dessus quand un coup part. */
export function animateArms(pl, dt, moving) {
  const P = pl.parts;
  if (!P || !P.arm) return;
  const sway = Math.sin(pl.walkT * 1.6) * 0.14 * (moving ? 1 : 0);
  let ax = sway, az = 0, alx = -sway * 0.6;
  if (pl.atkT > 0) {
    pl.atkT -= dt;
    const k = 1 - Math.max(0, pl.atkT) / pl.atkDur; // progression 0 → 1
    const s = Math.sin(Math.min(1, k) * Math.PI);   // aller-retour lissé
    if (pl.atkKind === 'thrust') {
      ax = -1.35 * s; // le bâton pointe l'ennemi puis revient
    } else if (pl.atkKind === 'slash') {
      // armé en arrière puis fauchage : l'épée traverse l'écran
      ax = -0.45 - 1.75 * s;
      az = -0.95 * s;
    } else if (pl.atkKind === 'smash') {
      // le marteau monte très haut puis s'abat (courbe asymétrique)
      const up = Math.min(1, k * 1.6), down = Math.max(0, (k - 0.62) / 0.38);
      ax = -2.35 * Math.sin(up * Math.PI * 0.5) + 2.9 * down * down;
    } else if (pl.atkKind === 'throw') {
      const flick = -2.1 * s;
      if (pl.atkAlt && P.armL) { alx = flick; } else { ax = flick; }
    }
  }
  P.arm.rotation.x = ax;
  P.arm.rotation.z = az;
  if (P.armL) P.armL.rotation.x = alx;
  if (P.robe) P.robe.rotation.z = Math.sin(pl.walkT * 1.6) * 0.05 * (moving ? 1 : 0);
  // pointe du bâton du Mage : elle flamboie au départ du trait
  if (P.tip) {
    if (pl.atkT > 0) {
      const k = 1 - Math.max(0, pl.atkT) / pl.atkDur;
      P.tip.scale.setScalar(1 + 0.9 * Math.sin(Math.min(1, k) * Math.PI));
    } else P.tip.scale.setScalar(1);
  }
}

/* ---------------- EFFETS DE COUPS (arcs, anneaux) ---------------- */
const fx = [];

/* Traînée de taillade : arc lumineux balayé devant le combattant,
   orienté vers la direction du coup — rend la mêlée lisible et physique. */
export function slashArc(x, y, z, dir, color, r) {
  if (!S.scene) return;
  const geo = new THREE.RingGeometry(Math.max(0.4, r * 0.45), r, 22, 1, -0.95, 1.9);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.order = 'YXZ';
  m.rotation.y = Math.atan2(-dir.z, dir.x); // l'arc s'ouvre dans la direction du coup
  m.rotation.x = -Math.PI / 2 + 0.3;        // léger relevé vers la caméra
  m.position.set(x, y, z);
  m.scale.setScalar(0.55);
  S.scene.add(m);
  fx.push({ m, t: 0, life: 0.2, kind: 'arc' });
}

/* Flash d'impact : sphère additive qui gonfle et s'éteint en un éclair —
   le « punch » visuel du coup au but, coloré par voie, plus large sur
   coup critique. Bon marché : une sphère low-poly, pas de lumière. */
export function impactFlash(x, y, z, color, r) {
  if (!S.scene) return;
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 10),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.set(x, y, z);
  m.scale.setScalar(0.12);
  S.scene.add(m);
  fx.push({ m, t: 0, life: 0.16, kind: 'flash', rMax: r || 0.8 });
}

/* Anneau d'onde de choc au sol (Verdict du Paladin, Fureur, Souffle glacé...) */
export function groundRing(x, y, z, color, rMax) {
  if (!S.scene) return;
  const geo = new THREE.RingGeometry(0.72, 1, 28);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y + 0.12, z);
  m.scale.setScalar(0.4);
  S.scene.add(m);
  fx.push({ m, t: 0, life: 0.34, kind: 'ring', rMax });
}

/* Colonne de lumière (Marteau d'aube du Paladin, Nova d'Aurore, Astre d'Aube,
   voile déchiré...) : un fût additif qui jaillit du sol, tourne lentement et
   se dissout — la super-puissance se voit à l'autre bout de la salle. */
export function lightPillar(x, y, z, color, r = 0.5, h = 4.6, life = 0.45) {
  if (!S.scene) return;
  const geo = new THREE.CylinderGeometry(r * 0.55, r, h, 18, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y + h / 2, z);
  m.scale.set(0.25, 0.05, 0.25);
  S.scene.add(m);
  fx.push({ m, t: 0, life: life || 0.7, kind: 'pillar' });
}

export function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.t += dt;
    const k = f.t / f.life;
    if (k >= 1) {
      S.scene.remove(f.m);
      f.m.geometry.dispose();
      f.m.material.dispose();
      fx.splice(i, 1);
      continue;
    }
    if (f.kind === 'arc') {
      f.m.scale.setScalar(0.55 + 0.75 * k);
      f.m.material.opacity = 0.85 * (1 - k * k);
    } else if (f.kind === 'flash') {
      f.m.scale.setScalar(0.12 + (f.rMax || 0.8) * k);
      f.m.material.opacity = 0.9 * (1 - k);
    } else if (f.kind === 'pillar') {
      const grow = Math.min(1, k * 3); // jaillit vite, s'éteint lentement
      f.m.scale.set(0.25 + 0.75 * grow, 0.05 + 0.95 * grow, 0.25 + 0.75 * grow);
      f.m.rotation.y += dt * 2.4;
      f.m.material.opacity = 0.7 * (1 - k * k);
    } else { // ring
      f.m.scale.setScalar(0.4 + (f.rMax || 5) * k);
      f.m.material.opacity = 0.75 * (1 - k);
    }
  }
}
