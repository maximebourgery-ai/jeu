/* ================================================================
   POUVOIRS — sorts, projectiles, mêlée, dash, télékinésie
   ================================================================ */
import * as THREE from 'three';
import { G, S, IS_TOUCH, LIGHT_SCALE, PATHS, POWERS, keys, gpMove, tmMove, player, p2, colliders, enemies, projectiles, tkCubes, PLATES } from './state.js';
import { playAttack, slashArc, groundRing, lightPillar } from './Animations.js';
import { A } from './Audio.js';
import { showMsg, refreshPowers } from './UI.js';
import { spawnBurst, pointSolid, rayAABB, openDoor, syncCube } from './World.js';
import { glow } from './AssetManager.js';
import { coolMul, classAtk, hasN } from './SkillTree.js';
import { camDirVec, camDirVec2, hurt, hurtP2, healSelf } from './Player.js';
import { damageEnemy, chainLightning } from './Enemies.js';
import { questReach } from './Quests.js';

/* ================================================================
   VISÉE ASSISTÉE (tactile & manette) — la visée n'est plus rivée au
   réticule central : un aimant doux choisit la meilleure cible dans le
   cône de regard, le joueur peut la verrouiller d'un simple toucher sur
   l'ennemi, et chaque coup recentre brièvement la caméra dessus. À la
   souris (pointer lock), rien ne change : visée libre 100 % manuelle.
   ================================================================ */
export function assistOn() {
  return IS_TOUCH || S.gpActiveT > 0;
}
export function assistTarget() {
  return (assistOn() && S.aimTarget && !S.aimTarget.dead) ? S.aimTarget : null;
}
/* Ligne de vue dégagée entre la caméra et l'ennemi (pas de mur entre les deux) */
function hasLOS(o, e) {
  const to = new THREE.Vector3().subVectors(e.g.position, o);
  const d = to.length();
  if (d < 0.001) return true;
  to.multiplyScalar(1 / d);
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!c.on) continue;
    const t = rayAABB(o, to, c.min, c.max);
    if (t !== null && t < d - 0.6) return false;
  }
  return true;
}
export function updateAimAssist(dt) {
  if (S.aimManualT > 0) S.aimManualT -= dt;
  if (!assistOn() || !S.camera) { S.aimTarget = null; return; }
  const o = S.camera.position, dir = camDirVec();
  /* Cible verrouillée à la main (toucher sur l'ennemi) : prioritaire tant
     qu'elle est vivante, pas trop loin et que le verrou n'a pas expiré. */
  const man = S.aimManual;
  if (man && !man.dead && S.aimManualT > 0 &&
      o.distanceTo(man.g.position) < 55 && hasLOS(o, man)) {
    S.aimTarget = man;
    return;
  }
  if (man && (man.dead || S.aimManualT <= 0)) S.aimManual = null;
  /* Sélection douce : meilleur compromis angle/distance dans le cône de
     regard. Hystérésis : la cible en cours bénéficie d'un cône élargi pour
     ne pas "sauter" d'un ennemi à l'autre au moindre tremblement. */
  const keep = S.aimTarget && !S.aimTarget.dead ? S.aimTarget : null;
  let best = null, bestScore = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const to = new THREE.Vector3().subVectors(e.g.position, o);
    const d = to.length();
    if (d > 46 || d < 0.001) continue;
    to.multiplyScalar(1 / d);
    const ang = Math.acos(Math.max(-1, Math.min(1, to.dot(dir))));
    const lim = (e === keep) ? 0.55 : 0.32; // ± 18° pour accrocher, ± 31° pour garder
    if (ang > lim) continue;
    if (!hasLOS(o, e)) continue;
    const score = ang * 2 + d * 0.02 - (e === keep ? 0.25 : 0);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  S.aimTarget = best;
}

/* Distance touchée par un rayon (murs + ennemis), max 60 m — cœur partagé
   des deux réticules (J1 / J2 en coop), autrefois dupliqué ligne à ligne. */
function rayHitDist(o, dir) {
  let best = 60;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!c.on) continue;
    const t = rayAABB(o, dir, c.min, c.max);
    if (t !== null && t < best) best = t;
  }
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.g.position.x - o.x, dy = e.g.position.y - o.y, dz = e.g.position.z - o.z;
    const t = dx * dir.x + dy * dir.y + dz * dir.z;
    if (t < 0 || t > best) continue;
    const px = o.x + dir.x * t, py = o.y + dir.y * t, pz = o.z + dir.z * t;
    if (Math.hypot(px - e.g.position.x, py - e.g.position.y, pz - e.g.position.z) < 0.9 * e.s + 0.4) best = t;
  }
  return best;
}
/* Point visé par le réticule central (ce que la caméra "voit" vraiment).
   Avec l'assist (tactile/manette), c'est le torse de la cible aimantée. */
export function aimPoint() {
  const t = assistTarget();
  if (t) return new THREE.Vector3(t.g.position.x, t.g.position.y + 0.55 * t.s, t.g.position.z);
  const dir = camDirVec(), o = S.camera.position;
  return o.clone().addScaledVector(dir, rayHitDist(o, dir));
}
export function aimPoint2() {
  const dir = camDirVec2(), o = S.cam2.position;
  return o.clone().addScaledVector(dir, rayHitDist(o, dir));
}

export function castPower() {
  if (G.treeOpen || G.travelOpen) return;
  const pw = POWERS.find(q => q.id === G.sel);
  if (!G.powers[pw.id] || G.cd[pw.id] > 0) return;
  if (pw.id === 'tk') { tkToggle(); G.cd.tk = pw.cool; return; }
  if (G.mana < pw.cost) { showMsg('Énergie insuffisante...', 1.2); return; }
  G.mana -= pw.cost;
  let cool = pw.cool * coolMul();
  if (pw.id === 'bolt' && G.furyT > 0) cool *= 0.6;
  G.cd[pw.id] = cool;
  if (pw.id === 'bolt') {
    const P = classAtk(G.path);
    if (assistTarget()) S.faceT = 0.28; // la caméra colle brièvement à la cible aimantée
    if (P.melee) meleeStrike(P); else fireBolt(P);
  }
  else if (pw.id === 'dash') doDash();
  else if (pw.id === 'shield') { G.shieldT = 4; A.shield(); }
  else if (pw.id === 'frost') frostNova();
  else if (pw.id === 'heal') healSelf();
  else if (pw.id === 'nova') dawnNova();
  else if (pw.id === 'meteor') castMeteor();
}
/* Lance un sort précis sans toucher à la sélection courante (manette Xbox/PS
   avec un bouton dédié par sort, et bouton dédié de la manette smartphone) :
   on arme temporairement le sort visé, on lance, puis on restaure l'arme
   précédente — la sélection affichée en jeu (touches 1-6) n'est jamais
   perturbée par ces raccourcis directs. */
export function castSpecific(id, pl) {
  if (pl === p2) {
    const prev = p2.sel; p2.sel = id; castPowerP2(); p2.sel = prev;
  } else {
    const prev = G.sel; G.sel = id; castPower(); G.sel = prev;
  }
}
export function frostNova(pl) {
  pl = pl || player;
  A.shield();
  spawnBurst(pl.pos.x, pl.pos.y + 1, pl.pos.z, 0xbfe8ff, 20);
  groundRing(pl.pos.x, pl.pos.y, pl.pos.z, 0xbfe8ff, 6.5); // onde de givre lisible au sol
  if (pl === player) S.camKick = 0.14;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.g.position.x - pl.pos.x, dz = e.g.position.z - pl.pos.z;
    if (Math.hypot(dx, dz) < 6.5) damageEnemy(e, 14, { x: pl.pos.x, z: pl.pos.z });
  }
}
/* ---- Sorts du Joueur 2 (manette, coop) ---- */
export function castPowerP2() {
  const pw = POWERS.find(q => q.id === p2.sel);
  if (!G.powers[pw.id] || p2.cd[pw.id] > 0) return;
  if (pw.id === 'tk') {
    showMsg('La Main céleste ne répond qu\'au premier porteur de flamme.', 1.6);
    p2.cd.tk = 1; return;
  }
  if (pw.id === 'bolt') {
    const B = PATHS[p2.path], P = classAtk(p2.path);
    if (p2.mana < B.cost) { return; }
    p2.mana -= B.cost; p2.cd.bolt = B.cool * coolMul();
    if (P.melee) meleeStrike(P, p2, camDirVec2());
    else fireBolt(P, p2, camDirVec2(), aimPoint2());
    return;
  }
  if (p2.mana < pw.cost) return;
  p2.mana -= pw.cost;
  p2.cd[pw.id] = (pw.id === 'dash') ? PATHS[p2.path].dashCool : pw.cool;
  if (pw.id === 'dash') doDashP2();
  else if (pw.id === 'shield') { p2.shieldT = 4; A.shield(); }
  else if (pw.id === 'frost') frostNova(p2);
  else if (pw.id === 'heal') healSelf(p2); // code unifié J1/J2 (Racine Vengeresse comprise)
  else if (pw.id === 'nova') dawnNova(p2); // le voile de l'Avale-Lune cède aux deux porteurs
  else if (pw.id === 'meteor') castMeteor(p2);
}
/* ---- Nova d'Aurore (touche 7) : le lever de soleil fait arme ----
   Colonne de lumière, triple anneau d'aube, brûlure dorée et étourdissement
   à 360° — et le seul art qui déchire le voile de l'Avale-Lune (S.onNova). */
export function dawnNova(pl) {
  pl = pl || player;
  A.power(); A.impact();
  if (pl === player) S.camKick = 0.4;
  const x = pl.pos.x, y = pl.pos.y, z = pl.pos.z;
  lightPillar(x, y, z, 0xffd97a, 2.2, 9, 0.8);
  groundRing(x, y, z, 0xffd97a, 10.5);
  setTimeout(() => groundRing(x, y, z, 0xfff2b0, 8), 120);
  setTimeout(() => groundRing(x, y, z, 0xffb05a, 12.5), 260);
  spawnBurst(x, y + 1.2, z, 0xfff2b0, 30);
  spawnBurst(x, y + 0.3, z, 0xffd97a, 22);
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.g.position.x - x, dz = e.g.position.z - z;
    const d = Math.hypot(dx, dz);
    if (d < 10.5 && Math.abs(e.g.position.y - (y + 1)) < 4.5) {
      damageEnemy(e, Math.round(46 * (1 - d / 22)), { x: dx, z: dz });
      if (!e.dead) {
        e.stunT = Math.max(e.stunT || 0, 1.3);
        e.dotT = 2.5; e.dotDps = 8; e.dotCol = 0xffd97a; // brûlure d'aube
      }
    }
  }
  if (S.onNova) S.onNova(pl);
}
/* ---- Astre d'Aube (touche 8) : arrache une étoile au ciel ----
   Télégraphe au sol, comète qui plonge sur le point visé (lumière portée
   + sillage doré), explosion de zone qui embrase et dresse une colonne
   d'aurore visible à l'autre bout du château. */
export function castMeteor(pl) {
  pl = pl || player;
  const t = (pl === player) ? aimPoint() : aimPoint2();
  A.alert();
  if (pl === player) S.camKick = 0.22;
  groundRing(t.x, t.y, t.z, 0xffe9a8, 6.5); // télégraphe : l'astre tombe ICI
  const start = new THREE.Vector3(t.x + 6, t.y + 26, t.z - 4);
  const dir = t.clone().sub(start).normalize();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0),
    new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffb05a, emissiveIntensity: 1.6, roughness: 0.3 }));
  core.add(glow(0xffd97a, 4.2, 0.85));
  core.add(new THREE.PointLight(0xffc86a, 2.2 * LIGHT_SCALE, 26, 2));
  core.position.copy(start);
  S.scene.add(core);
  projectiles.push({ mesh: core, vel: dir.multiplyScalar(30), life: 3,
    dmg: 85, aoe: true, aoeR: 6.5, burn: true, pillar: true, stun: 1, spinP: 7,
    trailCol: 0xffd97a, ox: start.x, oy: start.y, oz: start.z });
}
/* Élan du Pas du vent : direction du déplacement en cours, sinon droit
   devant — cœur partagé J1/J2 (autrefois dupliqué). */
function applyDash(pl, yaw, mx, mz) {
  A.dash();
  const f = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const r = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  let dx = f.x * mz + r.x * mx, dz = f.z * mz + r.z * mx;
  const l = Math.hypot(dx, dz);
  if (l < 0.01) { dx = f.x; dz = f.z; }
  else { dx /= l; dz /= l; }
  pl.dashDir.set(dx, 0, dz);
  pl.dashT = 0.16;
  pl.invuln = Math.max(pl.invuln, 0.3);
  pl.vel.y = Math.max(pl.vel.y, 0.5);
  spawnBurst(pl.pos.x, pl.pos.y + 0.8, pl.pos.z, 0x9fe8ff, 8);
}
export function doDashP2() {
  applyDash(p2, p2.yaw, p2.input.mx, p2.input.mz);
}
/* ---- Jauge de rage du Guerrier (J1 et J2 en coop) ----
   Se remplit en infligeant des coups de mêlée (+12 par frappe au but,
   +3 par ennemi supplémentaire touché) et, pour J1, en subissant des
   dégâts (+50 % des dégâts reçus, voir hurt() dans Player.js). À pleine
   jauge, la PROCHAINE frappe de mêlée déclenche automatiquement une onde
   dévastatrice à 360° (déclenchement naturel : aucun bouton en plus,
   compatible clavier/manette/tactile), puis la jauge se vide. */
export function gainRage(n, pl) {
  pl = pl || player;
  const path = pl === player ? G.path : p2.path;
  if (path !== 'warrior') return;
  if (pl === player) G.rage = Math.min(G.maxRage, G.rage + n);
  else p2.rage = Math.min(G.maxRage, p2.rage + n);
}
export function rageBurst(P, pl) {
  if (pl === player) G.rage = 0; else p2.rage = 0;
  A.impact(); A.dash();
  S.camKick = 0.35;
  showMsg('FUREUR DÉCHAÎNÉE !', 1.2);
  spawnBurst(pl.pos.x, pl.pos.y + 0.4, pl.pos.z, 0xff5a2a, 30);
  spawnBurst(pl.pos.x, pl.pos.y + 1.3, pl.pos.z, 0xffaa3a, 18);
  groundRing(pl.pos.x, pl.pos.y, pl.pos.z, 0xff5a2a, 7); // onde dévastatrice visible
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.g.position.x - pl.pos.x, dz = e.g.position.z - pl.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 7 && Math.abs(e.g.position.y - (pl.pos.y + 1)) < 3.5) {
      damageEnemy(e, Math.round(P.dmg * 2), { x: dx, z: dz });
      if (!e.dead) e.stunT = Math.max(e.stunT || 0, 0.8);
    }
  }
}
/* Frappe lourde du Guerrier / Marteau d'aube du Paladin : arc de mêlée devant le lanceur.
   Avec l'assist, le coup part vers la cible aimantée même si le réticule est
   à côté — la mêlée tactile pardonne, elle ne réclame pas une visée au pixel. */
export function meleeStrike(P, pl, f) {
  pl = pl || player;
  if (!f) {
    f = camDirVec();
    const t = assistTarget();
    if (t && pl === player) {
      const dx = t.g.position.x - pl.pos.x, dz = t.g.position.z - pl.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      f = new THREE.Vector3(dx / l, 0, dz / l);
    }
  }
  const path = pl === player ? G.path : p2.path;
  playAttack(pl, path);
  A.impact();
  if (pl === player) S.camKick = 0.2;
  const arcCol = path === 'paladin' ? 0xffd97a : 0xffaa3a;
  slashArc(pl.pos.x + f.x * 1.1, pl.pos.y + 1.05, pl.pos.z + f.z * 1.1, f, arcCol, P.aoe ? P.range + 1.4 : P.range);
  spawnBurst(pl.pos.x + f.x * 1.5, pl.pos.y + 1.1, pl.pos.z + f.z * 1.5, 0xffaa00, 18);
  const rageReady = pl === player
    ? (G.path === 'warrior' && G.rage >= G.maxRage)
    : (p2.path === 'warrior' && p2.rage >= G.maxRage);
  const R = P.aoe ? P.range + 1.4 : P.range; // transcendance : arc élargi
  let dmg = P.dmg, finisher = false;
  if (P.combo && pl === player) {
    G.comboN++; G.comboT = 1.8;
    if (G.comboN >= 3) { dmg *= 2; finisher = true; G.comboN = 0; }
  }
  let touched = 0, dealt = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.g.position.x - pl.pos.x, dz = e.g.position.z - pl.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < R && Math.abs(e.g.position.y - (pl.pos.y + 1)) < 2.8) {
      const dot = (dx * f.x + dz * f.z) / (d || 1);
      if (dot > 0.3 || d < 1.3) {
        damageEnemy(e, Math.round(dmg), { x: dx, z: dz }); touched++; dealt += dmg;
        if (P.holyburn && !e.dead) { e.dotT = 3; e.dotDps = 7; e.dotCol = 0xffd97a; } // Consécration
        if (P.exec && !e.dead && e.hp / e.maxHp < P.exec) {
          spawnBurst(e.g.position.x, e.g.position.y + 0.5, e.g.position.z, 0xff3a3a, 20);
          showMsg('EXÉCUTION !', 0.9);
          damageEnemy(e, e.hp + 1, { x: dx, z: dz });
        }
      }
    }
  }
  if (finisher && touched) {
    S.camKick = 0.36; A.impact();
    spawnBurst(pl.pos.x + f.x * 1.8, pl.pos.y + 1.1, pl.pos.z + f.z * 1.8, 0xff5a2a, 32);
  }
  if (rageReady) rageBurst(P, pl);
  else if (touched) gainRage(12 + 3 * (touched - 1), pl);
  if (touched && hasN('w_fury')) G.furyT = 2;
  if (touched && P.lifesteal) {
    if (pl === player) G.hp = Math.min(G.maxHp, G.hp + dealt * P.lifesteal);
    else p2.hp = Math.min(p2.maxHp, p2.hp + dealt * P.lifesteal);
  }
  if (P.shock) {
    spawnBurst(pl.pos.x, pl.pos.y + 0.3, pl.pos.z, 0xd9a83c, 22);
    groundRing(pl.pos.x, pl.pos.y, pl.pos.z, path === 'paladin' ? 0xffd97a : 0xd9a83c, P.shock);
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.g.position.x - pl.pos.x, dz = e.g.position.z - pl.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < P.shock && Math.abs(e.g.position.y - (pl.pos.y + 1)) < 3.2) {
        damageEnemy(e, Math.round(P.dmg * 0.5), { x: dx, z: dz });
        if (P.quake && !e.dead) e.stunT = Math.max(e.stunT || 0, 0.7);
      }
    }
  }
  if (touched === 0) A.burst(0.1, 900, 'bandpass', 0.08);
}
export function fireBolt(P, pl, dirO, target) {
  P = P || classAtk(G.path);
  pl = pl || player;
  playAttack(pl, pl === player ? G.path : p2.path); // geste de lancer (estocade / jet de dague)
  A.bolt();
  target = target || aimPoint();
  const originDir = dirO || camDirVec(); // pour le point de départ visuel (au bout du bâton)
  const start = new THREE.Vector3(
    pl.pos.x + originDir.x * 0.9,
    pl.pos.y + 1.45 + originDir.y * 0.9,
    pl.pos.z + originDir.z * 0.9);
  const baseDir = target.clone().sub(start).normalize();
  const isAss = (pl === player ? G.path : p2.path) === 'assassin';
  const col = P.pierce ? 0xffe9a8 : (isAss ? 0xd8ffe8 : 0x8feaff);
  const count = P.count || 1;
  const spreadTot = count > 1 ? (count === 2 ? 0.1 : 0.42) : 0;
  for (let i = 0; i < count; i++) {
    const dir = baseDir.clone();
    if (count > 1) {
      const a = -spreadTot / 2 + spreadTot * (i / (count - 1));
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = dir.x * ca - dir.z * sa, nz = dir.x * sa + dir.z * ca;
      dir.x = nx; dir.z = nz;
    }
    const m = new THREE.Mesh(new THREE.SphereGeometry(isAss ? 0.11 : 0.15, 8, 8),
      new THREE.MeshBasicMaterial({ color: col }));
    m.add(glow(col, 2.1, 0.8));
    m.position.copy(start);
    S.scene.add(m);
    projectiles.push({ mesh: m, vel: dir.multiplyScalar(P.pSpeed || 26),
      life: P.pierce ? 3.2 : 2.2, dmg: P.dmg,
      aoe: !!P.aoe, aoeR: P.aoeR || 3.4, burn: !!P.burn,
      pierce: !!P.pierce, hits: 0, chain: P.chain || 0, stun: P.stun || 0,
      sniper: !!P.sniper, fatal: !!P.fatal, poison: !!P.poison, backstab: !!P.backstab,
      trailCol: col, ox: start.x, oy: start.y, oz: start.z });
  }
  // Éclair de lancement + recul caméra pour donner du poids au sort
  spawnBurst(start.x, start.y, start.z, 0xbfeaff, 10);
  if (pl === player) S.camKick = 0.12;
}
export function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.life -= dt;
    pr.mesh.position.addScaledVector(pr.vel, dt);
    if (pr.hostile) {
      pr.mesh.rotation.x += dt * (pr.spin || 6); pr.mesh.rotation.y += dt * (pr.spin || 6) * 0.7;
      if (Math.random() < 0.4) spawnBurst(pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z, 0xff3a5a, 1);
    } else if (pr.trailCol && Math.random() < 0.55) {
      // sillage lumineux : rend les traits/dagues astraux plus lisibles et plus « cool » en vol
      spawnBurst(pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z, pr.trailCol, 1);
    }
    if (pr.spinP) { // comète de l'Astre d'Aube : elle tournoie en tombant
      pr.mesh.rotation.x += dt * pr.spinP;
      pr.mesh.rotation.z += dt * pr.spinP * 0.6;
    }
    const pos = pr.mesh.position;
    let hit = pr.life <= 0;
    if (!hit && pointSolid(pos.x, pos.y, pos.z)) {
      hit = true;
      spawnBurst(pos.x, pos.y, pos.z, 0x6ab8dd, 6);
      A.burst(0.08, 1400, 'bandpass', 0.08);
    }
    if (!hit && pr.hostile) {
      const near = (pp) => Math.hypot(pos.x - pp.x, pos.z - pp.z) < 0.65 && Math.abs(pos.y - (pp.y + 1.1)) < 1.3;
      if (near(player.pos)) {
        if (G.shieldT > 0) { spawnBurst(pos.x, pos.y, pos.z, 0x66c8ff, 7); A.impact(); }
        else hurt(pr.dmg, pos);
        hit = true;
      } else if (S.COOP && p2.pos && near(p2.pos)) {
        if (p2.shieldT > 0) { spawnBurst(pos.x, pos.y, pos.z, 0x66c8ff, 7); A.impact(); }
        else hurtP2(pr.dmg, pos);
        hit = true;
      }
    } else if (!hit) {
      for (const e of enemies) {
        if (e.dead) continue;
        if (pr.hitset && pr.hitset.has(e)) continue;
        if (pos.distanceTo(e.g.position) < 0.9 * e.s + 0.28) {
          let dmg = pr.dmg || 16;
          const dist = Math.hypot(pos.x - (pr.ox || pos.x), pos.y - (pr.oy || pos.y), pos.z - (pr.oz || pos.z));
          if (pr.sniper) dmg *= Math.min(2.5, 1 + dist * 0.08);
          /* Critiques de l'Assassin — règle de non-cumul : le multiplicateur
             le plus élevé entre Tir fatal (×3, >14 m) et Dans le dos (×2,5,
             l'ennemi tourne le dos au tireur : dot regard·vers-tireur < -0.5)
             s'applique seul. La montée en dégâts avec la distance (a_range,
             jusqu'à ×2,5) reste indépendante, comme avant. */
          let crit = 1;
          if (pr.fatal && dist > 14) crit = 3;
          if (pr.backstab) {
            const ry = e.g.rotation.y;
            const tox = (pr.ox || pos.x) - e.g.position.x, toz = (pr.oz || pos.z) - e.g.position.z;
            const tl = Math.hypot(tox, toz) || 1;
            const facing = Math.sin(ry) * tox / tl + Math.cos(ry) * toz / tl;
            if (facing < -0.5 && crit < 2.5) {
              crit = 2.5;
              spawnBurst(pos.x, pos.y, pos.z, 0xd8ffe8, 20);
              showMsg('DANS LE DOS ×2,5 !', 0.9);
            }
          }
          if (crit > 1) dmg *= crit;
          if (crit >= 3) {
            spawnBurst(pos.x, pos.y, pos.z, 0xff3a6a, 26);
            showMsg('TIR FATAL ×3 !', 0.9);
          }
          damageEnemy(e, Math.round(dmg), pr.vel);
          if (!e.dead) {
            if (pr.stun) e.stunT = Math.max(e.stunT || 0, pr.stun);
            if (pr.poison) { e.dotT = 3; e.dotDps = 6; e.dotCol = 0x7ade5a; }
          }
          if (pr.chain) chainLightning(e, pr.dmg || 16, pr.chain, pr.stun > 0);
          if (pr.pierce) {
            pr.hitset = pr.hitset || new Set();
            pr.hitset.add(e);
            pr.hits = (pr.hits || 0) + 1;
            if (pr.hits >= 5) hit = true;
          } else hit = true;
          break;
        }
      }
    }
    if (hit) {
      if (pr.aoe && !pr.hostile) { // Explosion de zone à l'impact
        spawnBurst(pos.x, pos.y, pos.z, 0xffd97a, 22);
        A.impact();
        if (pr.pillar) { // Astre d'Aube : l'impact dresse une colonne d'aurore
          lightPillar(pos.x, pos.y - 0.6, pos.z, 0xffd97a, 3, 13, 0.9);
          groundRing(pos.x, pos.y - 0.5, pos.z, 0xfff2b0, 9);
          spawnBurst(pos.x, pos.y + 0.5, pos.z, 0xfff2b0, 26);
          S.camKick = Math.max(S.camKick, 0.3);
        }
        for (const e of enemies) {
          if (e.dead) continue;
          const d = pos.distanceTo(e.g.position);
          if (d < (pr.aoeR || 3.4)) {
            damageEnemy(e, Math.round((pr.dmg || 16) * 0.6), { x: e.g.position.x - pos.x, z: e.g.position.z - pos.z });
            if (pr.burn && !e.dead) { e.dotT = 3; e.dotDps = 7; e.dotCol = 0xff9a3a; }
            if (pr.stun && !e.dead) e.stunT = Math.max(e.stunT || 0, pr.stun);
          }
        }
      }
      S.scene.remove(pr.mesh); projectiles.splice(i, 1);
    }
  }
}
export function doDash() {
  let mx = 0, mz = 0;
  if (keys['KeyW']) mz += 1;
  if (keys['KeyS']) mz -= 1;
  if (keys['KeyD']) mx += 1;
  if (keys['KeyA']) mx -= 1;
  // joystick tactile et stick manette : le Pas du vent suit la direction
  // du déplacement en cours (sinon il file toujours droit devant)
  mx += gpMove.x + tmMove.x; mz += gpMove.z + tmMove.z;
  applyDash(player, S.yaw, mx, mz);
}
/* --- télékinésie --- */
export function tkToggle() {
  if (S.tkHeld) { S.tkHeld.held = false; S.tkHeld = null; showMsg('Le bloc retombe.', 1.2); return; }
  const dir = camDirVec();
  const hx = player.pos.x, hy = player.pos.y + 1.6, hz = player.pos.z;
  let best = null, bd = 13;
  for (const c of tkCubes) {
    const tox = c.mesh.position.x - hx, toy = c.mesh.position.y - hy, toz = c.mesh.position.z - hz;
    const dist = Math.sqrt(tox * tox + toy * toy + toz * toz);
    if (dist < bd) {
      const dot = (tox * dir.x + toy * dir.y + toz * dir.z) / (dist || 1);
      if (dot > 0.72) { best = c; bd = dist; }
    }
  }
  if (best) {
    S.tkHeld = best; best.held = true; best.vel = 0;
    A.shield();
    showMsg('La Main céleste enserre le bloc. Cliquez à nouveau pour le déposer.', 2.2);
  } else showMsg('Aucun bloc runique dans votre regard.', 1.4);
}
export function updateTK(dt) {
  for (const c of tkCubes) {
    if (c.held) {
      G.mana = Math.max(0, G.mana - 4 * dt);
      if (G.mana <= 0.5) { tkToggle(); showMsg('Votre énergie faiblit, le bloc échappe à votre emprise...', 2); }
      else {
        const dir = camDirVec();
        const t = new THREE.Vector3(
          player.pos.x + dir.x * 4.2,
          player.pos.y + 1.5 + dir.y * 4.2,
          player.pos.z + dir.z * 4.2);
        if (t.y < c.half + 0.05) t.y = c.half + 0.05;
        c.mesh.position.lerp(t, Math.min(1, 8 * dt));
        c.mesh.rotation.y += dt * 1.4;
      }
    } else {
      c.vel -= 25 * dt;
      let ny = c.mesh.position.y + c.vel * dt;
      const h = c.half, cp = c.mesh.position;
      let rest = -100;
      for (const col of colliders) {
        if (!col.on || col === c.col) continue;
        if (cp.x + h > col.min.x && cp.x - h < col.max.x && cp.z + h > col.min.z && cp.z - h < col.max.z) {
          if (col.max.y <= cp.y - h + 0.25 && col.max.y > rest) rest = col.max.y;
        }
      }
      if (ny - h < rest) { ny = rest + h; c.vel = 0; }
      cp.y = ny;
    }
    syncCube(c);
  }
}
export function checkPlate() {
  for (const P of PLATES) {
    if (P.active || P.door.open) continue;
    for (const c of tkCubes) {
      const cp = c.mesh.position;
      if (Math.abs(cp.x - P.x) < 1.3 && Math.abs(cp.z - P.z) < 1.3 && cp.y - c.half < P.y + 0.6) {
        openDoor(P.door);
        P.active = true;
        P.glow.material.color.setHex(0x4ae08a);
        showMsg(P.msg || 'La plaque s\'enfonce sous le bloc : une porte coulisse dans la pierre.', 4);
        if (P.questId) questReach(P.questId);
      }
    }
    /* Énigme à poids synchronisée (coop) : Joueur 1 + Joueur 2 réunis sur la
       plaque pèsent le poids d'un Colosse — l'alternative au bloc runique. */
    if (!P.active && S.COOP && p2.pos) {
      const on = pl => Math.abs(pl.pos.x - P.x) < 1.3 && Math.abs(pl.pos.z - P.z) < 1.3 && Math.abs(pl.pos.y - P.y) < 1.4;
      if (on(player) && on(p2)) {
        openDoor(P.door);
        P.active = true;
        P.glow.material.color.setHex(0x4ae08a);
        showMsg('Le poids des deux porteurs réunis vaut celui d\'un Colosse : la plaque s\'enfonce !', 4);
        if (P.questId) questReach(P.questId);
      }
    }
  }
}
/* ---- Cycle du sort (tactile) ---- */
export function cyclePower(dir) {
  const owned = POWERS.filter(p => G.powers[p.id]);
  if (owned.length < 2) return;
  let i = owned.findIndex(p => p.id === G.sel);
  i = (i + dir + owned.length) % owned.length;
  G.sel = owned[i].id; refreshPowers();
  showMsg(owned[i].name + ' préparé.', 1);
}
