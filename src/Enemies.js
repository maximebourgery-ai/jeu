/* ================================================================
   ENNEMIS — spectres d'ombre, IA, directeur de renforts par zone
   ================================================================ */
import * as THREE from 'three';
import { G, S, ETYPES, LVL_HALO, ZONES, enemies, projectiles, player, p2, tut, zoneSeen } from './state.js';
import { A } from './Audio.js';
import { showMsg, dmgText } from './UI.js';
import { spawnBurst, addPickup, pointSolid, openDoor, safeZoneAt } from './World.js';
import { glow } from './AssetManager.js';
import { groundRing, impactFlash } from './Animations.js';
import { gainXP, hasN } from './SkillTree.js';
import { hurt, hurtP2 } from './Player.js';
import { questReach } from './Quests.js';

export function mkEnemy(x, z, floorY, wps, opt) {
  opt = opt || {};
  const T = ETYPES[opt.type || 'sentinel'] || ETYPES.sentinel;
  const lvl = opt.lvl || 1;
  /* Variété des silhouettes : chaque ombre « standard » naît avec sa propre
     carrure (±15 %, les grandes sont plus coriaces) et les renforts peuvent
     naître ALPHA — géants dorés, 2× plus durs, 2,5× plus généreux en XP.
     Les boss et ennemis calibrés à la main (opt.hp / opt.scale) sont exclus. */
  let sizeK = 1, elite = false;
  if (!opt.hp && !opt.scale) {
    sizeK = 0.85 + Math.random() * 0.3;
    if (opt.dyn && lvl >= 2 && Math.random() < 0.14) elite = true;
  }
  const s = (opt.scale || T.scale || 1) * sizeK * (elite ? 1.35 : 1);
  const g = new THREE.Group();
  const cloakMat = new THREE.MeshStandardMaterial({
    color: opt.color || T.color, roughness: 1, emissive: 0x0d0820 });
  /* Silhouettes procédurales différenciées par archétype (aucun modèle
     externe) : Colosse = masse large + poings · Traqueur = fuseau effilé,
     penché · Tisseur = cloche fine + éclat rituel en lévitation · Ombre =
     base. Halo de niveau conservé dans tous les cas. */
  const charMats = null, mixer = null;
  const tk = opt.type || 'sentinel';
  const eyeCol = T.eye || 0x8ff4ff;
  const wFac = tk === 'brute' ? 1.3 : (tk === 'wraith' ? 0.68 : (tk === 'caster' ? 0.85 : 1));
  /* Cape déchirée à deux couches : le voile extérieur, décalé et tourné,
     casse la silhouette de cône parfait — l'ombre a l'air en lambeaux. */
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.55 * s * wFac, 1.5 * s, 8), cloakMat);
  cloak.castShadow = true;
  const cloak2 = new THREE.Mesh(new THREE.ConeGeometry(0.64 * s * wFac, 1.15 * s, 7), cloakMat);
  cloak2.position.y = -0.22 * s; cloak2.rotation.y = 0.45;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.28 * s * (tk === 'wraith' ? 0.82 : 1), 8, 8), cloakMat);
  hood.position.y = 0.72 * s;
  hood.castShadow = true;
  const eyeMat = new THREE.MeshBasicMaterial({ color: eyeCol });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 6, 6), eyeMat);
  e1.position.set(-0.11 * s, 0.74 * s, 0.22 * s);
  const e2 = e1.clone(); e2.position.x = 0.11 * s;
  // lueur du regard : le danger se lit de loin, même dans la nuit noire
  const gaze = glow(eyeCol, 0.8 * s, 0.35); gaze.position.set(0, 0.74 * s, 0.24 * s);
  // cœur d'ombre : éclat spectral qui bat sous le voile, au centre de la masse
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11 * s, 0), eyeMat.clone());
  core.position.y = 0.28 * s;
  core.add(glow(eyeCol, 1.1 * s, 0.3));
  const wisp1 = new THREE.Mesh(new THREE.ConeGeometry(0.14 * s, 0.5 * s, 5), cloakMat);
  wisp1.position.set(0.3 * s, -0.85 * s, 0.1 * s);
  const wisp2 = wisp1.clone(); wisp2.position.set(-0.28 * s, -0.9 * s, -0.12 * s);
  g.add(cloak, cloak2, hood, e1, e2, gaze, core, wisp1, wisp2);
  let spinG = null;
  if (tk === 'brute') {
    // Colosse : épaules monstrueuses, poings massifs, échine hérissée
    for (const sx of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.3 * s, 7, 7), cloakMat);
      shoulder.position.set(sx * 0.5 * s, 0.5 * s, 0); shoulder.castShadow = true;
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 7, 7), cloakMat);
      fist.position.set(sx * 0.62 * s, 0.15 * s, 0.15 * s); fist.castShadow = true;
      // jointures luisantes : les poings sont l'arme, ils doivent se lire
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 5, 5), eyeMat);
      knuckle.position.set(sx * 0.62 * s, 0.22 * s, 0.28 * s);
      g.add(shoulder, fist, knuckle);
    }
    for (let i = 0; i < 3; i++) {
      const spine = new THREE.Mesh(new THREE.ConeGeometry(0.08 * s, 0.4 * s, 5), cloakMat);
      spine.position.set(0, (0.75 - i * 0.28) * s, -0.32 * s);
      spine.rotation.x = -0.7;
      g.add(spine);
    }
  } else if (tk === 'wraith') {
    // Traqueur : penché, griffes effilées, double traînée d'ombre
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12 * s, 0.9 * s, 5), cloakMat);
    tail.position.set(0, -0.2 * s, -0.45 * s); tail.rotation.x = 1.1;
    const tail2 = new THREE.Mesh(new THREE.ConeGeometry(0.08 * s, 0.7 * s, 5), cloakMat);
    tail2.position.set(0.14 * s, -0.3 * s, -0.5 * s); tail2.rotation.x = 1.25;
    g.add(tail, tail2);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025 * s, 0.22 * s, 4), eyeMat);
      claw.position.set(sx * (0.3 + i * 0.07) * s, 0.15 * s, 0.3 * s);
      claw.rotation.x = 1.3;
      g.add(claw);
    }
    cloak.rotation.x = 0.18;
  } else if (tk === 'caster') {
    // Tisseur : éclat rituel en lévitation + anneau de runes en rotation lente
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 * s), eyeMat);
    shard.position.set(0, 1.05 * s, 0.3 * s);
    shard.add(glow(eyeCol, 1.1 * s, 0.6));
    g.add(shard);
    spinG = new THREE.Group(); spinG.position.y = 0.5 * s;
    for (let i = 0; i < 4; i++) {
      const rune = new THREE.Mesh(new THREE.TetrahedronGeometry(0.07 * s), eyeMat.clone());
      const a = i / 4 * Math.PI * 2;
      rune.position.set(Math.cos(a) * 0.68 * s, 0, Math.sin(a) * 0.68 * s);
      spinG.add(rune);
    }
    g.add(spinG);
  } else {
    // Ombre : deux cornes voûtées — la sentinelle de base a un vrai visage
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.3 * s, 5), cloakMat);
      horn.position.set(sx * 0.16 * s, 0.95 * s, 0);
      horn.rotation.z = -sx * 0.55;
      g.add(horn);
    }
  }
  if (elite) {
    // Couronne d'épines de l'Alpha : la menace se lit de loin
    for (let i = 0; i < 3; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.36 * s, 5), cloakMat);
      spike.position.set((i - 1) * 0.17 * s, 0.95 * s, 0);
      spike.rotation.z = (1 - i) * 0.5;
      g.add(spike);
    }
    g.add(glow(0xffd97a, 2.8 * s, 0.35));
  }
  const halo = glow(LVL_HALO[Math.min(lvl - 1, LVL_HALO.length - 1)], 2.2 * s, 0.3);
  g.add(halo);
  g.position.set(x, floorY + 0.95, z);
  S.scene.add(g);
  /* Courbe de difficulté : les PV grimpent fort avec le niveau de zone
     (les ombres tardives sont des sacs à PV redoutables) mais les dégâts
     montent un peu moins vite qu'avant (0,22/niv au lieu de 0,25) pour
     que la fin de partie reste dure sans one-shots injustes. */
  const mul = 1 + 0.4 * (lvl - 1), dmul = 1 + 0.22 * (lvl - 1);
  /* opt.hpMul : les renforts invoqués la nuit sont plus coriaces (directeur) */
  const hp0 = opt.hp || Math.round(T.hp * mul * (opt.hpMul || 1) * sizeK * (elite ? 2.2 : 1));
  const en = {
    g, cloakMat, charMats, mixer, spinG, floorY, wps, wi: 0, state: 'patrol',
    hp: hp0, maxHp: hp0, dmg: opt.dmg || Math.round(T.dmg * dmul * (elite ? 1.35 : 1)),
    speed: opt.speed || T.speed, chaseSpeed: opt.chase || T.chase,
    atk: 0, hitT: 0, dead: false, s, tag: opt.tag || '', elite,
    spawn: { x, z }, alerted: false,
    lvl: lvl, ranged: !!T.ranged, shot: 1.2, windup: false, stunT: 0, dotT: 0, dotDps: 0, dotCol: 0, dyn: !!opt.dyn,
    xp: Math.round((T.xp || 12) * (1 + 0.5 * (lvl - 1)) * (elite ? 2.5 : 1)),
    tKey: opt.type || 'sentinel', tName: elite ? T.name + ' Alpha' : T.name
  };
  enemies.push(en);
  return en;
}
/* Flash d'état sur le personnage partagé : hex=null restaure la lueur
   de base du rôle (méchant) mémorisée dans le matériau. */
function setCharEmissive(e, hex) {
  if (!e.charMats) return;
  for (const m of e.charMats)
    m.emissive.setHex(hex === null ? m.userData.baseEmissive : hex);
}
export function updateEnemies(dt) {
  S.combatT = Math.max(0, S.combatT - dt);
  for (const e of enemies) {
    if (e.dead) continue;
    /* isPlayerInCombat : une ombre en chasse à portée verrouille le voyage
       rapide (matrice des Bivouacs) et le lock-on vertical de la caméra. */
    if (e.state === 'chase' &&
        Math.hypot(player.pos.x - e.g.position.x, player.pos.z - e.g.position.z) < 16 &&
        Math.abs(player.pos.y - e.floorY) < 5) S.combatT = 0.8;
    e.atk -= dt; e.hitT -= dt;
    if (e.mixer && e.stunT <= 0) e.mixer.update(dt);
    if (e.dotT > 0) {
      e.dotT -= dt; e.hp -= e.dotDps * dt;
      if (Math.random() < dt * 6) spawnBurst(e.g.position.x, e.g.position.y + 0.4, e.g.position.z, e.dotCol || 0x7ade5a, 2);
      if (e.hp <= 0) { killEnemy(e); continue; }
    }
    if (e.stunT > 0) {
      e.stunT -= dt;
      e.cloakMat.emissive.setHex(0x1a3a6a);
      setCharEmissive(e, 0x1a3a6a);
      e.g.position.y = e.floorY + 0.95;
      continue;
    }
    // Coop : la sentinelle poursuit le porteur de flamme le plus proche
    let tp = player.pos, tgt2 = false;
    if (S.COOP && p2.pos) {
      const d1 = Math.hypot(player.pos.x - e.g.position.x, player.pos.z - e.g.position.z);
      const d2 = Math.hypot(p2.pos.x - e.g.position.x, p2.pos.z - e.g.position.z);
      if (d2 < d1) { tp = p2.pos; tgt2 = true; }
    }
    const px = tp.x, pz = tp.z;
    const dx = px - e.g.position.x, dz = pz - e.g.position.z;
    const distP = Math.hypot(dx, dz);
    const sameLevel = Math.abs(tp.y - e.floorY) < 3.5;
    let tx = null, tz = null, sp = e.speed;
    /* Sanctuaire : la cible est près d'un feu de bivouac → les ombres
       renoncent et refluent (jamais les Maîtres d'Étage, qui ont leur FSM). */
    const tSafe = !e.fsm && safeZoneAt(tp);
    if (tSafe && e.state === 'chase') e.state = 'return';

    if (e.state === 'patrol') {
      if (distP < 9 && sameLevel && !tSafe) {
        e.state = 'chase';
        if (!e.alerted) { e.alerted = true; A.alert(); }
      }
      const w = e.wps[e.wi];
      if (Math.hypot(w[0] - e.g.position.x, w[1] - e.g.position.z) < 0.6) e.wi = (e.wi + 1) % e.wps.length;
      else { tx = w[0]; tz = w[1]; }
    } else if (e.state === 'chase') {
      // la nuit, les ombres pressent le pas (+18 % au plus noir de la nuit)
      sp = e.chaseSpeed * (1 + 0.18 * S.nightK);
      if (e.ranged && !e.fsm && distP < 15 && sameLevel) {
        e.shot -= dt;
        if (e.shot <= 0.35 && !e.windup) {
          e.windup = true;
          spawnBurst(e.g.position.x, e.g.position.y + 0.6, e.g.position.z, 0xff2a4a, 6);
        }
        if (e.shot <= 0) { e.shot = 2.4; e.windup = false; fireHostile(e, tp); }
      }
      if (!e.fsm && (distP > 16 || (!sameLevel && distP > 7))) e.state = 'return';
      else if (distP > (e.ranged ? 7 : 1.7)) { tx = px; tz = pz; }
      else if (e.atk <= 0 && !e.fsm) {
        /* (les Maîtres d'Étage — e.fsm — n'infligent leurs dégâts de contact
           que pendant les « active frames » de leur attaque, voir Tower.js) */
        e.atk = 1.3;
        const shielded = tgt2 ? p2.shieldT > 0 : G.shieldT > 0;
        // la nuit, les coups des ombres pèsent jusqu'à ×1,8 (S.nightMul)
        const dmgN = Math.round(e.dmg * S.nightMul);
        if (shielded) {
          A.impact();
          spawnBurst(tp.x, tp.y + 1.1, tp.z, 0x66c8ff, 7);
        } else if (tgt2) hurtP2(dmgN, e.g.position);
        else hurt(dmgN, e.g.position);
      }
    } else {
      const rd = Math.hypot(e.spawn.x - e.g.position.x, e.spawn.z - e.g.position.z);
      if (rd < 0.8) { e.state = 'patrol'; e.alerted = false; e.hp = Math.min(e.maxHp, e.hp + 12); }
      else { tx = e.spawn.x; tz = e.spawn.z; }
      if (distP < 6 && sameLevel && !tSafe) e.state = 'chase';
    }
    if (tx !== null) {
      const mdx = tx - e.g.position.x, mdz = tz - e.g.position.z;
      const l = Math.hypot(mdx, mdz) || 1;
      /* Les ombres respectent les murs : chaque axe n'est appliqué que si la
         destination est libre (sinon glissement le long de la paroi). Vital
         dans l'Ossuaire et la Forêt de Nuit, sinon elles traverseraient les
         murs des labyrinthes. */
      const ey = e.floorY + 1.0;
      const nx = e.g.position.x + mdx / l * sp * dt;
      const nz = e.g.position.z + mdz / l * sp * dt;
      if (!pointSolid(nx, ey, e.g.position.z)) e.g.position.x = nx;
      if (!pointSolid(e.g.position.x, ey, nz)) e.g.position.z = nz;
      e.g.rotation.y = Math.atan2(mdx, mdz);
    }
    e.g.position.y = e.floorY + 0.95 + Math.sin(G.time * 3 + e.spawn.x) * 0.12;
    // anneau de runes du Tisseur : rotation rituelle permanente
    if (e.spinG) e.spinG.rotation.y += dt * 1.7;
    // la nuit, les ombres luisent d'une braise sanguine : le danger se voit
    const baseEm = S.nightK > 0.5 ? 0x2a0a18 : 0x0d0820;
    e.cloakMat.emissive.setHex(e.hitT > 0 ? 0x992233 : baseEm);
    setCharEmissive(e, e.hitT > 0 ? 0x992233 : null);
  }
}
export function damageEnemy(e, d, knock, opts) {
  if (e.dead) return;
  /* Hitboxes asymétriques des Maîtres d'Étage : le boss peut moduler les
     dégâts selon son état (armure de face, os exposés dans le dos, fenêtre
     de vulnérabilité...) — voir les contrôleurs FSM dans Tower.js. */
  if (e.onDamaged) d = e.onDamaged(d, knock);
  e.hp -= d; e.hitT = 0.15;
  /* Chiffres de dégâts : petit nombre au point d'impact, doré et grossi sur
     critique, avec son étiquette (« DANS LE DOS ! », « EN PLEINE TÊTE ! »). */
  const crit = opts && opts.crit;
  dmgText(e.g.position.x, e.g.position.y + 0.9 * e.s, e.g.position.z,
    Math.round(d), crit ? 'crit' : '');
  if (opts && opts.label)
    dmgText(e.g.position.x, e.g.position.y + 1.35 * e.s, e.g.position.z, opts.label, 'label');
  if (e.state !== 'chase') e.state = 'chase';
  A.impact();
  spawnBurst(e.g.position.x, e.g.position.y, e.g.position.z, 0xb08cff, crit ? 20 : 12);
  if (knock) {
    const l = Math.hypot(knock.x, knock.z) || 1;
    const kx = e.g.position.x + knock.x / l * 0.4, kz = e.g.position.z + knock.z / l * 0.4;
    // le recul ne projette pas les ombres à travers les murs des labyrinthes
    if (!pointSolid(kx, e.floorY + 1.0, kz)) { e.g.position.x = kx; e.g.position.z = kz; }
  }
  if (e.hp <= 0) killEnemy(e);
}
export function killEnemy(e) {
  if (e.dead) return;
  e.dead = true; A.die();
  // l'ombre se dissipe : éclat spectral + onde au sol proportionnés à sa taille
  spawnBurst(e.g.position.x, e.g.position.y, e.g.position.z, 0x7ef2ff, 18);
  impactFlash(e.g.position.x, e.g.position.y + 0.3 * e.s, e.g.position.z, 0xb08cff, 1.4 * e.s);
  groundRing(e.g.position.x, e.floorY, e.g.position.z, 0x8a6ade, 2.4 * e.s);
  addPickup('mana', e.g.position.x, e.floorY, e.g.position.z);
  addPickup('shadow', e.g.position.x + 0.7, e.floorY, e.g.position.z + 0.4);
  S.scene.remove(e.g);
  // la nuit paie mieux : +50 % d'expérience au plus noir (risque → récompense)
  const xpGain = Math.round((e.xp || 12) * (1 + 0.5 * S.nightK));
  gainXP(xpGain);
  dmgText(e.g.position.x, e.g.position.y + 1.4 * e.s, e.g.position.z, '+' + xpGain + ' XP', 'xp');
  if (e.onKilled) e.onKilled(e); // Maîtres d'Étage : clef, portail, raccourci
  if (hasN('a_dance')) {
    G.cd.dash = Math.max(0, G.cd.dash - 0.8);
    G.hasteT = 3;
    spawnBurst(player.pos.x, player.pos.y + 0.6, player.pos.z, 0x9fe8ff, 6);
  }
  if (e.tag === 'garden') {
    tut.gardenKills++;
    if (tut.gardenKills >= 2) {
      questReach('garden');
      if (S.gateDoor && !S.gateDoor.open) openDoor(S.gateDoor);
      showMsg('Les jardins respirent à nouveau. Un grondement de chaînes : la herse du château se lève.', 4);
    }
  }
}

/* ---- Projectile hostile des Tisseurs ---- */
export function fireHostile(e, tp) {
  A.hostileBolt();
  const start = new THREE.Vector3(e.g.position.x, e.g.position.y + 0.6, e.g.position.z);
  const tgt = new THREE.Vector3(tp.x, tp.y + 1.1, tp.z);
  const dir = tgt.sub(start).normalize();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0),
    new THREE.MeshStandardMaterial({ color: 0x3a0a1a, emissive: 0xff2a4a, emissiveIntensity: 1.4, roughness: 0.4 }));
  core.add(glow(0xff2a4a, 2.4, 0.85));
  core.position.copy(start); S.scene.add(core);
  projectiles.push({ mesh: core, vel: dir.multiplyScalar(13 + e.lvl * 1.3), life: 2.6,
    dmg: Math.round(e.dmg * S.nightMul), hostile: true, spin: 6 + Math.random() * 4 });
}
/* ---- Chaîne d'éclairs (Mage) ---- */
export function chainLightning(from, dmg, n, stun) {
  let src = from.g.position.clone();
  const hitset = new Set([from]);
  for (let k = 0; k < n; k++) {
    let best = null, bd = 7.5;
    for (const e of enemies) {
      if (e.dead || hitset.has(e)) continue;
      const d = src.distanceTo(e.g.position);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) break;
    hitset.add(best);
    lightningFX(src, best.g.position);
    damageEnemy(best, Math.round(dmg * 0.6), null);
    if (stun && !best.dead) best.stunT = Math.max(best.stunT || 0, 1);
    src = best.g.position.clone();
  }
}
export function lightningFX(a, b) {
  const pts = [], seg = 5;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, j = (i > 0 && i < seg) ? 0.7 : 0;
    pts.push(new THREE.Vector3(
      a.x + (b.x - a.x) * t + (Math.random() - 0.5) * j,
      a.y + (b.y - a.y) * t + (Math.random() - 0.5) * j,
      a.z + (b.z - a.z) * t + (Math.random() - 0.5) * j));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9fdcff }));
  S.scene.add(line);
  setTimeout(() => { S.scene.remove(line); geo.dispose(); }, 110);
  A.burst(0.07, 2200, 'highpass', 0.06);
}

/* ---- Directeur de renforts : les ombres affluent zone par zone ---- */
export function zoneAt(pos) {
  for (const z of ZONES) {
    if (Math.abs(pos.y - z.y) < 4.5 && Math.hypot(pos.x - z.x, pos.z - z.z) < z.r) return z;
  }
  return null;
}
export function aliveIn(z) {
  let n = 0;
  for (const e of enemies)
    if (!e.dead && Math.abs(e.floorY - z.y) < 4.5 && Math.hypot(e.g.position.x - z.x, e.g.position.z - z.z) < z.r + 6) n++;
  return n;
}
export function updateDirector(dt) {
  const z = zoneAt(player.pos);
  if (z && z !== S.curZone) {
    S.curZone = z;
    if (!zoneSeen[z.id] && z.lvl > 1) {
      zoneSeen[z.id] = true;
      showMsg('— ' + z.name + ' : les ombres y sont de niveau ' + z.lvl + ' —', 3);
    }
  }
  S.dirT -= dt;
  if (S.dirT > 0) return;
  /* Rythme des renforts calé sur les 18 quêtes de la refonte : très calme
     au début (20 s+ vers la quête du levier), soutenu en fin de partie (9 s).
     La nuit, le flot s'accélère (jusqu'à -40 % d'intervalle). */
  S.dirT = Math.max(9, 26 - S.questI) * (1 - 0.4 * S.nightK);
  /* Purge des renforts morts (tableau `enemies` sinon jamais réduit : une
     longue partie accumulerait des centaines d'entrées mortes, ralentissant
     peu à peu chaque boucle qui parcourt `enemies`). On ne touche jamais aux
     ombres « statiques » du monde (index < S.STATIC_ENEMIES — la sauvegarde
     en dépend) ni à rien pendant une instance de la Tour, dont le level
     streaming (voir Tower.js) suppose que rien d'autre ne modifie ce
     tableau entre beginBuild() et unloadPalier(). */
  if (!S.inTower) {
    for (let i = enemies.length - 1; i >= S.STATIC_ENEMIES; i--) {
      if (enemies[i].dead) enemies.splice(i, 1);
    }
  }
  if (!z || S.questI < 6) return; // aucun renfort avant l'ouverture de la bibliothèque
  if (safeZoneAt(player.pos)) return; // jamais d'invocation quand le joueur est au sanctuaire d'un feu
  let alive = 0; for (const e of enemies) if (!e.dead) alive++;
  if (alive >= 26) return;
  const cap = z.cap + Math.floor(S.questI / 5);
  if (aliveIn(z) >= cap) return;
  for (let t = 0; t < 8; t++) {
    const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * 6;
    const x = player.pos.x + Math.cos(a) * d, zz = player.pos.z + Math.sin(a) * d;
    if (Math.hypot(x - z.x, zz - z.z) > z.r) continue;
    if (pointSolid(x, z.y + 1.2, zz)) continue;
    const type = z.types[Math.floor(Math.random() * z.types.length)];
    /* +1 niveau de renforts seulement après le passage scellé (fin de partie) */
    const lvl = z.lvl + (S.questI >= 14 ? 1 : 0);
    /* renforts nocturnes : +40 % de PV au plus noir de la nuit */
    const e = mkEnemy(x, zz, z.y, [[x, zz], [x + 3, zz], [x, zz + 3]],
      { type: type, lvl: lvl, dyn: true, hpMul: 1 + 0.4 * S.nightK });
    e.state = 'chase'; e.alerted = true;
    spawnBurst(x, z.y + 1, zz, 0x6a4a9e, 14);
    A.alert();
    break;
  }
}
