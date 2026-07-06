/* ================================================================
   ENNEMIS — spectres d'ombre, IA, directeur de renforts par zone
   ================================================================ */
import * as THREE from 'three';
import { G, S, ETYPES, LVL_HALO, ZONES, enemies, projectiles, player, p2, tut, zoneSeen,
  gearScore, GEAR_THRESHOLDS } from './state.js';
import { A } from './Audio.js';
import { showMsg, dmgText } from './UI.js';
import { slashArc, groundRing, impactFlash } from './Animations.js';
import { spawnBurst, addPickup, pointSolid, openDoor, safeZoneAt } from './World.js';
import { glow, overchargeMat } from './AssetManager.js';
import { gearLootFrom } from './Crafting.js';
import { gainXP, gainXP2, hasN } from './SkillTree.js';

/* ================================================================
   v9 — MENACE ADAPTATIVE : le monde répond au Gear Score du joueur.
   · Niveau 0 : IA d'origine.
   · Niveau 1 (GS ≥ GEAR_THRESHOLDS.threat) : les archétypes s'éveillent —
     Traqueur EVADE, Ombre BLOCK, Colosse à l'onde élargie/rapide — et
     s'auréolent d'une « Surcharge de Lumière » (wireframe + vapeur).
   · Niveau 2 (GS ≥ GEAR_THRESHOLDS.legend) : le directeur de renforts
     remplace la moitié des patrouilles basiques par des Tisseurs d'élite,
     même dans les zones de début de jeu.
   ================================================================ */
export function calculateEnemyThreatLevel() {
  // v9.1 — chaque porteur a SON équipement : le monde réagit au MIEUX équipé des deux
  const gs = Math.max(gearScore(1), S.COOP && p2.mesh ? gearScore(2) : 0);
  if (gs >= GEAR_THRESHOLDS.legend) return 2;
  if (gs >= GEAR_THRESHOLDS.threat) return 1;
  return 0;
}
let threatLvl = 0; // recalculé une fois par image (updateEnemies)
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
    if (opt.dyn && lvl >= 2 && Math.random() < 0.18) elite = true;
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
  const wFac = { brute: 1.3, wraith: 0.68, caster: 0.85, seraph: 0.9, echo: 0.6, obsidian: 1.45 }[tk] || 1;
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
  } else if (tk === 'seraph') {
    // Séraphin déchu : deux ailes de lumière fanée + anneau brisé au-dessus du capuchon
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const wl = new THREE.Mesh(new THREE.ConeGeometry(0.16 * s, 1.1 * s, 5), wingMat);
    wl.position.set(0.5 * s, 0.6 * s, -0.15 * s); wl.rotation.z = -1.15;
    const wr = wl.clone(); wr.position.x = -0.5 * s; wr.rotation.z = 1.15;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3 * s, 0.045 * s, 6, 14),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    ring.position.y = 1.22 * s; ring.rotation.x = Math.PI / 2.3;
    ring.add(glow(0xffe9a8, 1.7 * s, 0.5));
    g.add(wl, wr, ring);
  } else if (tk === 'echo') {
    // Écho de l'Aube : cœur incandescent visible et double traînée — la vitesse faite ombre
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 * s),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    core.position.y = 0.35 * s;
    core.add(glow(0xfff2b0, 1.8 * s, 0.7));
    const t1 = new THREE.Mesh(new THREE.ConeGeometry(0.1 * s, 1 * s, 5), cloakMat);
    t1.position.set(0.16 * s, -0.15 * s, -0.5 * s); t1.rotation.x = 1.2;
    const t2 = t1.clone(); t2.position.x = -0.16 * s;
    g.add(core, t1, t2);
    cloak.rotation.x = 0.22;
  } else if (tk === 'obsidian') {
    // Titan d'obsidienne : poings colossaux + éclats de roche en fusion sur les épaules
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.26 * s, 7, 7), cloakMat);
    fist.position.set(0.7 * s, 0.12 * s, 0.15 * s); fist.castShadow = true;
    const fist2 = fist.clone(); fist2.position.x = -0.7 * s;
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x1a1226, roughness: 0.6,
      emissive: 0xff5a2a, emissiveIntensity: 0.55 });
    const s1 = new THREE.Mesh(new THREE.ConeGeometry(0.12 * s, 0.5 * s, 5), spikeMat);
    s1.position.set(0.34 * s, 0.62 * s, 0); s1.rotation.z = -0.5;
    const s2 = s1.clone(); s2.position.x = -0.34 * s; s2.rotation.z = 0.5;
    const s3 = s1.clone(); s3.position.set(0, 0.52 * s, -0.3 * s); s3.rotation.set(-0.6, 0, 0);
    g.add(fist, fist2, s1, s2, s3);
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
     (les ombres tardives sont des sacs à PV redoutables) et les dégâts
     suivent une pente relevée (v8.3 : 0,26/niv au lieu de 0,22 — retour
     joueur : les ombres ne mordaient pas assez fort en fin de partie). */
  const mul = 1 + 0.4 * (lvl - 1), dmul = 1 + 0.26 * (lvl - 1);
  /* v8.7 — GRANDE PASSE DE DIFFICULTÉ : +10 % de PV et de dégâts sur TOUTES
     les ombres (boss compris), et EN COOP LOCAL ×1,6 supplémentaire — à deux
     porteurs de flamme, la nuit mord deux fois plus fort. Les ombres déjà en
     place quand le J2 rejoint reçoivent le même boost (setupCoopP2). */
  const diffK = 1.1 * (S.COOP ? 1.6 : 1);
  /* opt.hpMul : les renforts invoqués la nuit sont plus coriaces (directeur) */
  const hp0 = Math.round((opt.hp || T.hp * mul * (opt.hpMul || 1) * sizeK * (elite ? 2.2 : 1)) * diffK);
  const en = {
    g, cloakMat, charMats, mixer, spinG, floorY, wps, wi: 0, state: 'patrol',
    hp: hp0, maxHp: hp0, dmg: Math.round((opt.dmg || T.dmg * dmul * (elite ? 1.5 : 1)) * diffK),
    speed: opt.speed || T.speed, chaseSpeed: opt.chase || T.chase,
    atk: 0, hitT: 0, dead: false, s, tag: opt.tag || '', elite,
    spawn: { x, z }, alerted: false,
    /* v8.3 — arsenal des lourds : charge dévastatrice (chargeT) et jet de
       roche à distance (rockT) — voir CHARGE / stepCharge plus bas */
    charge: null, chargeT: 2 + Math.random() * 2, rockT: 2 + Math.random() * 2,
    /* v8.4 — anti perma-stun : stunRes = fenêtre de RÉSISTANCE après chaque
       étourdissement subi (voir applyStun) · slowT = ralentissement (Séisme,
       Souffle glacé) — le contrôle qui remplace l'étourdissement en chaîne */
    stunRes: 0, slowT: 0,
    /* v8.5 — powT : recharge du POUVOIR SIGNATURE de l'archétype (Pas
       d'ombre, Bordée d'ailes, Représailles de magma... voir updateEnemies) */
    powT: 3 + Math.random() * 3,
    lvl: lvl, ranged: !!T.ranged, shot: 1.2, windup: false, mAtk: null, stunT: 0, dotT: 0, dotDps: 0, dotCol: 0, dyn: !!opt.dyn,
    xp: Math.round((T.xp || 12) * (1 + 0.5 * (lvl - 1)) * (elite ? 2.5 : 1)),
    tKey: opt.type || 'sentinel', tName: elite ? T.name + ' Alpha' : T.name
  };
  enemies.push(en);
  return en;
}
/* ================================================================
   v8.4 — ÉTOURDISSEMENT À RENDEMENT DÉCROISSANT (anti « stun-lock »)
   Retour joueur : les sorts qui étourdissent (Tempête astrale, Nova,
   Astre...) figeaient les ombres EN PERMANENCE — le jeu se gagnait sans
   qu'elles puissent bouger. Désormais :
   · toute ombre fraîchement étourdie devient RÉSISTANTE quelques
     secondes (stunRes) : impossible de ré-enchaîner un étourdissement ;
   · les Maîtres d'Étage (e.fsm) sont TOTALEMENT INSENSIBLES aux stuns
     du porteur — seuls leurs étourdissements SCRIPTÉS fonctionnent
     (bloc runique du Chevalier, Bénédiction sur la Racine, Nova sur
     l'Avale-Lune : ils posent boss.stunT directement, sans passer ici).
   Toutes les sources de stun DU JOUEUR passent par ce point d'entrée.
   ================================================================ */
export function applyStun(e, dur) {
  if (e.dead || !dur) return;
  if (e.fsm || e.stunRes > 0) {
    // l'ombre RÉSISTE (boss, ou fraîchement étourdie) : petit éclat gris
    spawnBurst(e.g.position.x, e.g.position.y + 0.8, e.g.position.z, 0x8891b0, 3);
    return;
  }
  e.stunT = Math.max(e.stunT || 0, dur);
  e.stunRes = dur + 4; // fenêtre de résistance : ~4 s sans nouveau stun possible
}
/* Flash d'état sur le personnage partagé : hex=null restaure la lueur
   de base du rôle (méchant) mémorisée dans le matériau. */
function setCharEmissive(e, hex) {
  if (!e.charMats) return;
  for (const m of e.charMats)
    m.emissive.setHex(hex === null ? m.userData.baseEmissive : hex);
}

/* ================================================================
   ATTAQUE DE MÊLÉE TÉLÉGRAPHIÉE — fini les dégâts « au contact »
   invisibles : chaque coup se déroule en trois temps LISIBLES.
   · PRÉPARATION : l'ombre se cambre en arrière, crépite de rouge et
     clignote — c'est la fenêtre pour s'écarter ou dasher.
   · FRAPPE : bond physique en avant (murs respectés) + arc de coup
     lumineux ; les dégâts n'existent que sur cette « frame active »,
     et seulement si la cible est encore devant l'ombre.
   · RÉCUPÉRATION : l'ombre reste plantée, exposée à la contre-attaque.
   Les lourds (Colosse, Titan) préviennent longtemps et frappent large ;
   les rapides (Traqueur, Écho) mordent vite mais pour peu de dégâts.
   ================================================================ */
/* v8.3 : temps de recharge resserrés sur toute la ligne (les ombres
   enchaînent) et bonds allongés des lourds — le Colosse et le Titan
   RATTRAPENT enfin ce qu'ils visent au lieu de frapper dans le vide. */
const MELEE = {
  sentinel: { wind: 0.5,  strike: 0.16, rec: 0.45, reach: 2.2, lunge: 2.6, cool: 1.15, col: 0xb08cff },
  wraith:   { wind: 0.3,  strike: 0.12, rec: 0.35, reach: 2.0, lunge: 3.6, cool: 0.85, col: 0x5affc8 },
  brute:    { wind: 0.75, strike: 0.2,  rec: 0.65, reach: 2.8, lunge: 2.8, cool: 1.9,  col: 0xff8a4a, ring: true },
  caster:   { wind: 0.5,  strike: 0.16, rec: 0.5,  reach: 2.2, lunge: 2.2, cool: 1.35, col: 0xff8a5a },
  seraph:   { wind: 0.45, strike: 0.16, rec: 0.5,  reach: 2.2, lunge: 2.4, cool: 1.25, col: 0xffe9a8 },
  echo:     { wind: 0.26, strike: 0.12, rec: 0.3,  reach: 2.0, lunge: 4.0, cool: 0.8,  col: 0xfff2b0 },
  obsidian: { wind: 0.85, strike: 0.22, rec: 0.75, reach: 3.2, lunge: 2.6, cool: 2.1,  col: 0xff5a2a, ring: true }
};
function meleeProf(e) {
  const base = MELEE[e.tKey] || MELEE.sentinel;
  /* v9 — Colosse sous menace adaptative : onde au sol ÉLARGIE (+1 m de
     portée, l'anneau visuel suit) et récupération réduite de 40 %. */
  if (threatLvl >= 1 && e.tKey === 'brute' && !e.fsm)
    return Object.assign({}, base, { reach: base.reach + 1.0, cool: base.cool * 0.6 });
  return base;
}
function startMelee(e) {
  e.mAtk = { P: meleeProf(e), ph: 'wind', t: 0, hitDone: false, dx: 0, dz: 0 };
  // télégraphe immédiat : éclat rouge + grondement sourd dès la préparation
  spawnBurst(e.g.position.x, e.g.position.y + 0.8, e.g.position.z, 0xff5a3a, 8);
  A.burst(0.12, 300, 'lowpass', 0.06);
}
function stepMelee(e, dt, tp, tgt2) {
  const m = e.mAtk, P = m.P;
  m.t += dt;
  if (m.ph === 'wind') {
    // l'ombre se cambre en arrière et suit sa cible du regard — le coup se lit
    const k = Math.min(1, m.t / P.wind);
    e.g.rotation.x = -0.4 * k;
    e.g.rotation.y = Math.atan2(tp.x - e.g.position.x, tp.z - e.g.position.z);
    if (Math.random() < dt * 12)
      spawnBurst(e.g.position.x, e.g.position.y + 0.8, e.g.position.z, 0xff5a3a, 2);
    if (m.t >= P.wind) {
      m.ph = 'strike'; m.t = 0;
      /* direction FIGÉE au départ du coup : un pas de côté suffit à esquiver */
      const dx = tp.x - e.g.position.x, dz = tp.z - e.g.position.z;
      const l = Math.hypot(dx, dz) || 1;
      m.dx = dx / l; m.dz = dz / l;
      e.g.rotation.y = Math.atan2(m.dx, m.dz);
      slashArc(e.g.position.x + m.dx * 0.9, e.floorY + 1.15, e.g.position.z + m.dz * 0.9,
        { x: m.dx, z: m.dz }, P.col, P.reach);
      if (P.ring) groundRing(e.g.position.x, e.floorY, e.g.position.z, P.col, P.reach + 0.8);
      A.impact();
    }
  } else if (m.ph === 'strike') {
    e.g.rotation.x = 0.35;
    // bond en avant — murs respectés (glissement le long des parois)
    const step = (P.lunge / P.strike) * dt;
    const ey = e.floorY + 1.0;
    const nx = e.g.position.x + m.dx * step, nz = e.g.position.z + m.dz * step;
    if (!pointSolid(nx, ey, e.g.position.z)) e.g.position.x = nx;
    if (!pointSolid(e.g.position.x, ey, nz)) e.g.position.z = nz;
    if (!m.hitDone && m.t >= P.strike * 0.5) {
      m.hitDone = true;
      /* FRAME ACTIVE : les dégâts n'existent qu'ici — sortir de l'arc
         pendant la préparation (ou dasher : invuln) esquive le coup */
      const dx = tp.x - e.g.position.x, dz = tp.z - e.g.position.z;
      const d = Math.hypot(dx, dz);
      const front = d < 0.6 || (dx * m.dx + dz * m.dz) / (d || 1) > 0.1;
      if (d < P.reach + 0.4 && Math.abs(tp.y - e.floorY) < 3 && front) {
        const shielded = tgt2 ? p2.shieldT > 0 : G.shieldT > 0;
        const dmgN = Math.round(e.dmg * S.nightMul); // la nuit, les coups pèsent (S.nightMul)
        if (shielded) {
          A.impact();
          spawnBurst(tp.x, tp.y + 1.1, tp.z, 0x66c8ff, 7);
        } else {
          impactFlash(tp.x, tp.y + 1.0, tp.z, 0xff4a3a, 1.1);
          if (tgt2) hurtP2(dmgN, e.g.position); else hurt(dmgN, e.g.position);
        }
      } else {
        A.burst(0.1, 700, 'bandpass', 0.05); // le coup fend l'air : esquivé !
      }
      /* v8.5 — ONDE TELLURIQUE (pouvoir signature du Colosse) : son poing
         fissure le sol à 360° — même dans le dos, il faut SAUTER l'onde
         (elle rase le sol) ou porter l'Égide. */
      if (e.tKey === 'brute' && !e.fsm) {
        groundRing(e.g.position.x, e.floorY, e.g.position.z, 0xff8a4a, 4.2);
        A.burst(0.16, 260, 'lowpass', 0.12);
        const shockHit = (pl, isP2) => {
          const dd = Math.hypot(pl.pos.x - e.g.position.x, pl.pos.z - e.g.position.z);
          if (dd > 4.2) return;
          if (pl.pos.y - e.floorY > 1.05) return; // en l'air : l'onde passe dessous
          const dmgS = Math.round(e.dmg * 0.45 * S.nightMul);
          if (isP2) hurtP2(dmgS, e.g.position); else hurt(dmgS, e.g.position);
        };
        // l'onde touche les DEUX porteurs, pas seulement la cible visée
        shockHit(player, false);
        if (S.COOP && p2.pos) shockHit(p2, true);
      }
    }
    if (m.t >= P.strike) { m.ph = 'rec'; m.t = 0; }
  } else { // récupération : l'ombre se redresse lentement, punissable
    e.g.rotation.x = 0.35 * (1 - Math.min(1, m.t / P.rec));
    if (m.t >= P.rec) {
      e.g.rotation.x = 0;
      /* v8.5 — DOUBLE MORSURE (pouvoir signature du Traqueur) : si la proie
         est encore à portée, une seconde morsure part aussitôt (une seule,
         préparation raccourcie — l'esquive reste possible). */
      if (!m.chained && e.tKey === 'wraith' && !e.fsm) {
        const d2 = Math.hypot(tp.x - e.g.position.x, tp.z - e.g.position.z);
        if (d2 < P.reach + 1.4 && Math.abs(tp.y - e.floorY) < 3) {
          startMelee(e);
          e.mAtk.chained = true;
          e.mAtk.P = Object.assign({}, meleeProf(e), { wind: P.wind * 0.55 });
          return;
        }
      }
      e.mAtk = null; e.atk = P.cool;
    }
  }
}

/* ================================================================
   v8.3 — CHARGE DÉVASTATRICE & JET DE ROCHE des lourds
   Le Colosse et le Titan d'obsidienne ont désormais un « double
   pouvoir » : de loin, ils ARRACHENT UN BLOC et le lancent (voir le
   jet dans updateEnemies) ; à mi-distance, ils CHARGENT — préparation
   télégraphiée (anneau au sol, crépitement), puis ruée rectiligne qui
   percute pour de très lourds dégâts + projection. Comme la mêlée, la
   charge se lit et s'esquive (un pas de côté, un Pas du vent) — mais
   rester dans la ligne coûte très cher.
   ================================================================ */
const CHARGE = {
  brute:    { wind: 0.55, speed: 16, range: 12, dmgMul: 1.25, cool: 5.5, col: 0xff8a4a, rock: true },
  obsidian: { wind: 0.65, speed: 15, range: 13, dmgMul: 1.3,  cool: 6,   col: 0xff5a2a, rock: true },
  /* v8.5 — RUÉE D'ÉCHO : le pouvoir signature de l'Écho de l'Aube — un
     dash-attaque fulgurant, préparation très courte, dégâts contenus */
  echo:     { wind: 0.35, speed: 18, range: 10, dmgMul: 0.9,  cool: 7,   col: 0xfff2b0 }
};
/* v8.4 — les Maîtres d'Étage chargent AUSSI : chaque boss reçoit son propre
   profil de ruée via e.chargeProf (posé dans Tower.js). Pour les ombres
   ordinaires, le profil vient de la table CHARGE (lourds uniquement). */
export function chargeProfOf(e) {
  return e.chargeProf || (!e.fsm && CHARGE[e.tKey]) || null;
}
function startCharge(e) {
  const P = chargeProfOf(e);
  e.charge = { P, ph: 'wind', t: 0, dx: 0, dz: 0, traveled: 0, hitDone: false };
  // télégraphe appuyé : anneau au sol + gerbe — la ruée s'annonce de loin
  groundRing(e.g.position.x, e.floorY, e.g.position.z, P.col, 3.2);
  spawnBurst(e.g.position.x, e.g.position.y + 0.8, e.g.position.z, P.col, 12);
  A.alert();
}
function stepCharge(e, dt, tp, tgt2) {
  const c = e.charge, P = c.P;
  c.t += dt;
  if (c.ph === 'wind') {
    // le lourd se ramasse sur lui-même, rivé sur sa cible
    e.g.rotation.y = Math.atan2(tp.x - e.g.position.x, tp.z - e.g.position.z);
    e.g.rotation.x = -0.3 * Math.min(1, c.t / P.wind);
    if (Math.random() < dt * 14)
      spawnBurst(e.g.position.x, e.g.position.y + 0.6, e.g.position.z, P.col, 2);
    if (c.t >= P.wind) {
      /* direction FIGÉE au départ de la ruée : l'esquive latérale marche */
      c.ph = 'rush'; c.t = 0;
      const dx = tp.x - e.g.position.x, dz = tp.z - e.g.position.z;
      const l = Math.hypot(dx, dz) || 1;
      c.dx = dx / l; c.dz = dz / l;
      e.g.rotation.x = 0.3;
      A.dash();
    }
  } else if (c.ph === 'rush') {
    const step = P.speed * dt;
    const ey = e.floorY + 1.0;
    const nx = e.g.position.x + c.dx * step, nz = e.g.position.z + c.dz * step;
    let moved = false;
    if (!pointSolid(nx, ey, e.g.position.z)) { e.g.position.x = nx; moved = true; }
    if (!pointSolid(e.g.position.x, ey, nz)) { e.g.position.z = nz; moved = true; }
    c.traveled += step;
    if (Math.random() < dt * 22)
      spawnBurst(e.g.position.x, e.g.position.y + 0.3, e.g.position.z, P.col, 2);
    if (!c.hitDone) {
      const d = Math.hypot(tp.x - e.g.position.x, tp.z - e.g.position.z);
      if (d < 1.8 && Math.abs(tp.y - e.floorY) < 3) {
        // PERCUTÉ : très lourds dégâts + l'impact se voit et s'entend
        c.hitDone = true;
        impactFlash(tp.x, tp.y + 1, tp.z, P.col, 1.6);
        groundRing(tp.x, tp.y, tp.z, P.col, 3.4);
        A.impact();
        const dmgN = Math.round(e.dmg * P.dmgMul * S.nightMul);
        if (tgt2) hurtP2(dmgN, e.g.position); else hurt(dmgN, e.g.position);
        c.ph = 'rec'; c.t = 0;
      }
    }
    // mur percuté ou course terminée : la bête s'arrête, sonnée un instant
    if (c.ph === 'rush' && (!moved || c.traveled >= P.range + 2)) { c.ph = 'rec'; c.t = 0; }
  } else { // récupération : le mastodonte reprend son souffle, punissable
    e.g.rotation.x = 0.3 * (1 - Math.min(1, c.t / 0.7));
    if (c.t >= 0.7) { e.g.rotation.x = 0; e.charge = null; e.chargeT = P.cool; }
  }
}
/* v8.5 — couronne de projectiles hostiles (Bordée d'ailes du Séraphin,
   Représailles de magma du Titan) : version légère du radialBurst des boss */
function radialHostile(e, n, dmgMul, speed, color, size) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(size || 0.2, 0),
      new THREE.MeshStandardMaterial({ color: 0x2a0a1a, emissive: color, emissiveIntensity: 1.3, roughness: 0.4 }));
    core.add(glow(color, 2, 0.7));
    core.position.set(e.g.position.x, e.g.position.y + 0.7, e.g.position.z);
    S.scene.add(core);
    projectiles.push({ mesh: core, vel: new THREE.Vector3(Math.cos(a), -0.03, Math.sin(a)).multiplyScalar(speed),
      life: 2.4, dmg: Math.round(e.dmg * dmgMul * S.nightMul), hostile: true, spin: 8 });
  }
  A.hostileBolt();
}
export function updateEnemies(dt) {
  S.combatT = Math.max(0, S.combatT - dt);
  /* période de grâce post-chargement : les ombres restent à leurs postes
     quelques secondes, le temps que le joueur se repère dans la salle */
  S.graceT = Math.max(0, S.graceT - dt);
  threatLvl = calculateEnemyThreatLevel(); // v9 : une lecture par image
  for (const e of enemies) {
    if (e.dead) continue;
    /* isPlayerInCombat : une ombre en chasse à portée verrouille le voyage
       rapide (matrice des Bivouacs) et le lock-on vertical de la caméra. */
    if (e.state === 'chase' &&
        Math.hypot(player.pos.x - e.g.position.x, player.pos.z - e.g.position.z) < 16 &&
        Math.abs(player.pos.y - e.floorY) < 5) S.combatT = 0.8;
    e.atk -= dt; e.hitT -= dt; e.chargeT -= dt; e.rockT -= dt; e.powT -= dt;
    if (e.stunRes > 0) e.stunRes -= dt;
    /* v8.5 — REPRÉSAILLES DE MAGMA (pouvoir signature du Titan) : blessé en
       plein combat, il crache une couronne d'éclats en fusion — le harceler
       au corps à corps sans bouclier coûte cher */
    if (e.tKey === 'obsidian' && !e.fsm && !e.dead && e.state === 'chase' &&
        e.hitT > 0 && e.powT <= 0 && e.stunT <= 0) {
      e.powT = 7;
      spawnBurst(e.g.position.x, e.g.position.y + 0.8, e.g.position.z, 0xff5a2a, 16);
      radialHostile(e, 6, 0.5, 9, 0xff5a2a, 0.24);
    }
    if (e.slowT > 0) {
      e.slowT -= dt;
      // le ralentissement se voit : givre/poussière qui s'échappe des pas
      if (Math.random() < dt * 5)
        spawnBurst(e.g.position.x, e.g.position.y - 0.4, e.g.position.z, 0xbfd8e8, 2);
    }
    if (e.mixer && e.stunT <= 0) e.mixer.update(dt);
    if (e.dotT > 0) {
      e.dotT -= dt; e.hp -= e.dotDps * dt;
      if (Math.random() < dt * 6) spawnBurst(e.g.position.x, e.g.position.y + 0.4, e.g.position.z, e.dotCol || 0x7ade5a, 2);
      if (e.hp <= 0) { killEnemy(e); continue; }
    }
    if (e.stunT > 0) {
      e.stunT -= dt;
      // l'étourdissement INTERROMPT l'attaque en préparation (contre-jeu)
      if (e.mAtk) { e.mAtk = null; e.g.rotation.x = 0; }
      if (e.charge) { e.charge = null; e.g.rotation.x = 0; e.chargeT = 2.5; }
      e.cloakMat.emissive.setHex(0x1a3a6a);
      setCharEmissive(e, 0x1a3a6a);
      e.g.position.y = e.floorY + 0.95;
      continue;
    }
    if (e.blockT > 0) e.blockT -= dt; // fenêtre de BLOCAGE de l'Ombre adaptative
    /* ---- v9 : « SURCHARGE DE LUMIÈRE » ----
       Les archétypes dont l'IA s'éveille (Traqueur, Colosse, Ombre) face à
       un Gear Score critique portent une coquille wireframe émissive et
       exhalent une vapeur claire : la difficulté adaptative SE VOIT. */
    const overWant = threatLvl >= 1 && !e.fsm &&
      (e.tKey === 'wraith' || e.tKey === 'brute' || e.tKey === 'sentinel');
    if (overWant && !e.overG) {
      e.overG = new THREE.Mesh(new THREE.ConeGeometry(0.62 * e.s, 1.78 * e.s, 6), overchargeMat());
      e.overG.position.y = 0.06 * e.s;
      e.g.add(e.overG);
    } else if (!overWant && e.overG) {
      e.g.remove(e.overG);
      e.overG = null;
    }
    if (e.overG) {
      e.overG.rotation.y += dt * 0.8; // l'énergie craquelée rampe sur la coquille
      if (Math.random() < dt * 1.8)
        spawnBurst(e.g.position.x + (Math.random() - 0.5) * 0.6, e.g.position.y + 0.9 + Math.random() * 0.7,
          e.g.position.z + (Math.random() - 0.5) * 0.6, 0xbfe8ff, 1); // vapeur de surcharge
    }
    /* ---- v9 : EVADE du Traqueur ----
       Sous menace adaptative, le Traqueur ESQUIVE latéralement le premier
       projectile du joueur qui file sur lui (une fois par aggro). */
    if (e.evadeT > 0) {
      e.evadeT -= dt;
      const ey = e.floorY + 1.0;
      const nx = e.g.position.x + e.evX * 9 * dt, nz = e.g.position.z + e.evZ * 9 * dt;
      if (!pointSolid(nx, ey, e.g.position.z)) e.g.position.x = nx;
      if (!pointSolid(e.g.position.x, ey, nz)) e.g.position.z = nz;
      e.g.position.y = e.floorY + 0.95;
      continue; // le pas de côté remplace le déplacement normal de l'image
    }
    if (threatLvl >= 1 && e.tKey === 'wraith' && !e.fsm && e.state === 'chase' && !e.mAtk && !e.evaded) {
      for (const pr of projectiles) {
        if (pr.hostile || !pr.owner) continue; // seuls les tirs des porteurs de flamme
        const dx = e.g.position.x - pr.mesh.position.x, dz = e.g.position.z - pr.mesh.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 6 || d < 0.001) continue;
        const vl = Math.hypot(pr.vel.x, pr.vel.z) || 1;
        if ((pr.vel.x * dx + pr.vel.z * dz) / (vl * d) < 0.85) continue; // pas dirigé sur lui
        e.evaded = true; e.evadeT = 0.26;
        const side = Math.random() < 0.5 ? 1 : -1;
        e.evX = -pr.vel.z / vl * side;
        e.evZ = pr.vel.x / vl * side;
        spawnBurst(e.g.position.x, e.g.position.y + 0.6, e.g.position.z, 0x5affc8, 8);
        break;
      }
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

    if (e.charge) {
      /* charge dévastatrice en cours (préparation → ruée → récupération) :
         comme la mêlée, elle pilote seule position et posture */
      stepCharge(e, dt, tp, tgt2);
    } else if (e.mAtk) {
      /* attaque de mêlée en cours (préparation → bond → récupération) :
         elle pilote seule position et posture, pas de déplacement normal */
      stepMelee(e, dt, tp, tgt2);
    } else if (e.state === 'patrol') {
      /* S.graceT : période de grâce post-écran de chargement — pas d'aggro */
      if (distP < 11 && sameLevel && !tSafe && S.graceT <= 0) {
        e.state = 'chase';
        if (!e.alerted) { e.alerted = true; A.alert(); }
      }
      const w = e.wps[e.wi];
      if (Math.hypot(w[0] - e.g.position.x, w[1] - e.g.position.z) < 0.6) e.wi = (e.wi + 1) % e.wps.length;
      else { tx = w[0]; tz = w[1]; }
    } else if (e.state === 'chase') {
      // la nuit, les ombres pressent le pas (+18 % au plus noir de la nuit)
      sp = e.chaseSpeed * (1 + 0.18 * S.nightK);
      if (e.ranged && !e.fsm && distP < 17 && sameLevel) {
        e.shot -= dt;
        /* télégraphe du tir ALLONGÉ (0,55 s) et continu : l'ombre crépite
           de rouge tant qu'elle charge — on a le temps de rompre la ligne */
        if (e.shot <= 0.55 && !e.windup) {
          e.windup = true;
          spawnBurst(e.g.position.x, e.g.position.y + 0.6, e.g.position.z, 0xff2a4a, 6);
        }
        if (e.windup && Math.random() < dt * 16)
          spawnBurst(e.g.position.x, e.g.position.y + 0.7, e.g.position.z, 0xff2a4a, 2);
        if (e.shot <= 0) {
          e.shot = 1.9; e.windup = false;
          fireHostile(e, tp);
          /* v8.5 — VOLÉE TRIPLE (pouvoir signature du Tisseur) : deux traits
             de flanc encadrent le premier — rompre la ligne ne suffit plus,
             il faut vraiment bouger */
          if (e.tKey === 'caster') {
            const l = distP || 1, ppx = -dz / l, ppz = dx / l; // perpendiculaire
            fireHostile(e, { x: tp.x + ppx * 2.2, y: tp.y, z: tp.z + ppz * 2.2 });
            fireHostile(e, { x: tp.x - ppx * 2.2, y: tp.y, z: tp.z - ppz * 2.2 });
          }
        }
      }
      /* v8.5 — PAS D'OMBRE (pouvoir signature de l'Ombre) : elle se dissout
         et rejaillit au contact de sa proie, prête à mordre */
      if (e.tKey === 'sentinel' && !e.fsm && e.tag !== 'garden' && e.powT <= 0 && sameLevel && distP > 4.5 && distP < 12) {
        e.powT = 8;
        spawnBurst(e.g.position.x, e.g.position.y + 0.8, e.g.position.z, 0x6a4a9e, 14);
        const aw = Math.atan2(e.g.position.x - px, e.g.position.z - pz); // elle ressort du même côté
        const bx2 = px + Math.sin(aw) * 1.7, bz2 = pz + Math.cos(aw) * 1.7;
        if (!pointSolid(bx2, e.floorY + 1, bz2)) {
          e.g.position.x = bx2; e.g.position.z = bz2;
          spawnBurst(bx2, e.floorY + 1, bz2, 0x6a4a9e, 14);
          A.dash();
          e.atk = Math.min(e.atk, 0.2); // la morsure suit aussitôt
        }
      }
      /* v8.5 — BORDÉE D'AILES (pouvoir signature du Séraphin déchu) : une
         couronne de plumes-projectiles s'abat en cercle autour de lui */
      if (e.tKey === 'seraph' && !e.fsm && e.powT <= 0 && sameLevel && distP < 14) {
        e.powT = 9;
        spawnBurst(e.g.position.x, e.g.position.y + 1.1, e.g.position.z, 0xffe9a8, 14);
        radialHostile(e, 7, 0.7, 9.5, 0xffe9a8, 0.18);
      }
      /* v8.3 — double pouvoir des lourds : hors de portée de charge, le
         Colosse/Titan ARRACHE UN BLOC du sol et le lance (projectile lourd) */
      const CH = chargeProfOf(e);
      if (CH && CH.rock && !e.fsm && sameLevel && distP > CH.range && distP < 18 && e.rockT <= 0) {
        e.rockT = 4.5;
        spawnBurst(e.g.position.x, e.g.position.y + 1, e.g.position.z, CH.col, 10);
        fireHostile(e, tp, { speed: 11, size: 0.36, dmgMul: 0.7, color: CH.col });
      }
      if (!e.fsm && (distP > 22 || (!sameLevel && distP > 8))) e.state = 'return';
      /* à mi-distance et prêt : la CHARGE télégraphiée s'arme (lourds ET
         Maîtres d'Étage à profil — leur ruée traverse l'arène) */
      else if (CH && e.chargeT <= 0 && sameLevel && distP > 4 && distP < CH.range) startCharge(e);
      /* à portée de coup et prêt : la mêlée télégraphiée s'arme (les Maîtres
         d'Étage — e.fsm — gardent leur propre FSM d'attaque, voir Tower.js) */
      else if (e.atk <= 0 && !e.fsm && sameLevel && distP < meleeProf(e).reach) startMelee(e);
      else if (distP > (e.ranged ? 7 : 1.7)) { tx = px; tz = pz; }
    } else {
      const rd = Math.hypot(e.spawn.x - e.g.position.x, e.spawn.z - e.g.position.z);
      if (rd < 0.8) { e.state = 'patrol'; e.alerted = false; e.evaded = false; e.hp = Math.min(e.maxHp, e.hp + 12); }
      else { tx = e.spawn.x; tz = e.spawn.z; }
      if (distP < 8 && sameLevel && !tSafe && S.graceT <= 0) e.state = 'chase';
    }
    if (tx !== null) {
      if (e.slowT > 0) sp *= 0.5; // Séisme / Souffle glacé : jambes prises
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
    /* télégraphe : le manteau CLIGNOTE rouge pendant toute préparation
       d'attaque (mêlée en wind-up, tir de Tisseur ou charge des lourds) */
    const tele = ((e.mAtk && e.mAtk.ph === 'wind') || e.windup ||
      (e.charge && e.charge.ph === 'wind')) && Math.sin(G.time * 26) > 0;
    // v9 : la fenêtre de BLOCAGE de l'Ombre adaptative teinte le voile d'acier bleu
    e.cloakMat.emissive.setHex(e.hitT > 0 ? 0x992233 : e.blockT > 0 ? 0x2a5a8a : tele ? 0x8a1a1a : baseEm);
    setCharEmissive(e, e.hitT > 0 ? 0x992233 : tele ? 0x8a1a1a : null);
  }
}
export function damageEnemy(e, d, knock, opts) {
  if (e.dead) return;
  /* v9 — BLOCK de l'Ombre adaptative : sous menace (Gear Score critique),
     l'Ombre de base a 25 % de chance d'ANNULER une attaque FRONTALE — le
     coup de face rebondit sur son voile (contourner ou frapper le dos). */
  if (threatLvl >= 1 && e.tKey === 'sentinel' && !e.fsm && e.stunT <= 0 && knock &&
      Math.random() < 0.25) {
    const l = Math.hypot(knock.x, knock.z) || 1;
    const fx = Math.sin(e.g.rotation.y), fz = Math.cos(e.g.rotation.y);
    if ((knock.x / l) * fx + (knock.z / l) * fz < -0.3) { // poussée contraire au regard = coup de face
      e.blockT = 0.5;
      dmgText(e.g.position.x, e.g.position.y + 0.9 * e.s, e.g.position.z, 'BLOQUÉ !', 'label');
      spawnBurst(e.g.position.x, e.g.position.y + 0.8, e.g.position.z, 0x9fdcff, 10);
      A.impact();
      return;
    }
  }
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
  /* ---- Butin par archétype : chaque famille d'ombre lâche SA ressource,
     qui alimente une voie de build différente (voir RECIPES, Crafting.js).
     · Ombre (sentinel)  → essence d'ombre (orbes, transcendances)
     · Traqueur (wraith) → plume spectrale (élixir de vitesse)
     · Colosse (brute)   → os de Colosse (+PV max) + cœur de soin
     · Tisseur (caster)  → fil d'éther (+PM max)
     Et pour toutes : une chance, RARE, de Cœur de nuit (+10 % dégâts
     permanents au sac) — d'autant plus probable que l'ombre est haut niveau. */
  const lx = e.g.position.x, lz = e.g.position.z, fy = e.floorY;
  const drop = (t, dx, dz) => addPickup(t, lx + dx, fy, lz + dz);
  if (e.tKey === 'wraith') {
    drop('feather', 0.5, 0.2);
    if (Math.random() < 0.5) drop('mana', -0.5, 0.4);
  } else if (e.tKey === 'brute') {
    drop('bone', 0.6, 0.3);
    drop('heart', -0.6, 0.2);
    if (Math.random() < 0.5) drop('shadow', 0, -0.7);
  } else if (e.tKey === 'caster') {
    drop('thread', 0.5, 0.3);
    drop('mana', -0.5, 0.3);
  } else if (e.tKey === 'echo') {
    /* v8 — l'Outre-Ciel : la vitesse faite ombre lâche la ressource de vitesse */
    drop('feather', 0.5, 0.2);
    drop('mana', -0.5, 0.4);
  } else if (e.tKey === 'seraph') {
    /* v8 — garde ailée à distance : fils d'éther (build sorcier) */
    drop('thread', 0.5, 0.3);
    drop('mana', -0.5, 0.3);
    if (Math.random() < 0.5) drop('shadow', 0, -0.7);
  } else if (e.tKey === 'obsidian') {
    /* v8 — muraille de roche : os (build bastion), généreux vu ses 130 PV */
    drop('bone', 0.6, 0.3);
    drop('bone', -0.6, -0.3);
    drop('heart', -0.6, 0.2);
  } else {
    drop('mana', 0, 0.4);
    if (Math.random() < 0.7) drop('shadow', 0.7, 0.3);
  }
  /* les Maîtres d'Étage (Tour) lâchent TOUJOURS un Cœur de nuit : la récompense est garantie */
  if (e.fsm || Math.random() < 0.03 + 0.01 * (e.lvl || 1)) drop('nightheart', 0, -0.9);
  /* v9 — butin d'ÉQUIPEMENT (rangé au sac de forge) : chance selon le
     niveau, garanti et de haute rareté pour les Maîtres d'Étage */
  gearLootFrom(e.lvl || 1, !!e.fsm);
  S.scene.remove(e.g);
  // la nuit paie mieux : +50 % d'expérience au plus noir (risque → récompense)
  const xpGain = Math.round((e.xp || 12) * (1 + 0.5 * S.nightK));
  gainXP(xpGain, e.lvl);
  /* v8.7 — coop : la chute profite aux DEUX porteurs (XP plein pour chacun),
     et chacun monte ses niveaux de son côté (voir gainXP2, SkillTree.js) */
  if (S.COOP && p2.mesh) gainXP2(xpGain, e.lvl);
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

/* ---- Projectile hostile : tir des Tisseurs / Séraphins, et (v8.3, via
   opt) bloc de roche des lourds — opt = { speed, size, color, dmgMul } ---- */
export function fireHostile(e, tp, opt) {
  opt = opt || {};
  A.hostileBolt();
  const col = opt.color || 0xff2a4a;
  const start = new THREE.Vector3(e.g.position.x, e.g.position.y + 0.6, e.g.position.z);
  const tgt = new THREE.Vector3(tp.x, tp.y + 1.1, tp.z);
  const dir = tgt.sub(start).normalize();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(opt.size || 0.22, 0),
    new THREE.MeshStandardMaterial({ color: 0x3a0a1a, emissive: col, emissiveIntensity: 1.4, roughness: 0.4 }));
  core.add(glow(col, 2.4, 0.85));
  core.position.copy(start); S.scene.add(core);
  projectiles.push({ mesh: core, vel: dir.multiplyScalar(opt.speed || (13 + e.lvl * 1.3)), life: 2.6,
    dmg: Math.round(e.dmg * (opt.dmgMul || 1) * S.nightMul), hostile: true, spin: 6 + Math.random() * 4 });
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
    if (stun && !best.dead) applyStun(best, 0.5);
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
    /* une zone de salle instanciée n'existe que si SA salle est chargée ;
       une zone du monde ouvert exige de ne pas être dans une salle */
    if ((z.room || null) !== (S.roomId || null)) continue;
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
  /* Rythme des renforts calé sur les 18 quêtes de la refonte : calme au
     début, pressant en fin de partie. La nuit, le flot s'accélère.
     v9.2 (retour joueur : « ça respawn beaucoup trop vite ») — plancher et
     base relevés (7→10 s / 21→24 s) et accélération nocturne adoucie
     (-40 %→-25 %) : les ombres reviennent toujours, mais laissent de
     vraies pauses entre deux vagues. */
  S.dirT = Math.max(10, 24 - S.questI) * (1 - 0.25 * S.nightK);
  /* Purge des renforts morts (tableau `enemies` sinon jamais réduit : une
     longue partie accumulerait des centaines d'entrées mortes, ralentissant
     peu à peu chaque boucle qui parcourt `enemies`). On ne touche jamais aux
     ombres « statiques » du monde (index < S.STATIC_ENEMIES — la sauvegarde
     en dépend) ni à rien pendant une instance (Tour OU salle du château) :
     leur level streaming (Tower.js / Rooms.js) suppose que rien d'autre ne
     modifie ce tableau entre beginBuild() et le déchargement. */
  if (!S.inTower && !S.roomId) {
    for (let i = enemies.length - 1; i >= S.STATIC_ENEMIES; i--) {
      if (enemies[i].dead) enemies.splice(i, 1);
    }
  }
  if (!z || S.questI < 6) return; // aucun renfort avant l'ouverture de la bibliothèque
  if (S.graceT > 0) return; // période de grâce post-chargement : pas d'invocation
  if (safeZoneAt(player.pos)) return; // jamais d'invocation quand le joueur est au sanctuaire d'un feu
  let alive = 0; for (const e of enemies) if (!e.dead) alive++;
  /* v8.7 — coop local : ×1,7 d'ombres (plafond global ET caps de zone) —
     deux porteurs de flamme attirent bien plus de nuit sur eux */
  const coopN = S.COOP ? 1.7 : 1;
  if (alive >= Math.round(30 * coopN)) return; // plafond global relevé avec les caps de zone (v8.1)
  const cap = Math.round((z.cap + Math.floor(S.questI / 5)) * coopN);
  if (aliveIn(z) >= cap) return;
  let want = S.COOP ? 2 : 1; // en coop, le flot arrive par paires
  for (let t = 0; t < (S.COOP ? 12 : 8); t++) {
    const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * 6;
    const x = player.pos.x + Math.cos(a) * d, zz = player.pos.z + Math.sin(a) * d;
    if (Math.hypot(x - z.x, zz - z.z) > z.r) continue;
    if (pointSolid(x, z.y + 1.2, zz)) continue;
    let type = z.types[Math.floor(Math.random() * z.types.length)];
    /* v9 — Gear Score frôlant le Légendaire : le directeur remplace une
       patrouille basique sur deux par un TISSEUR d'élite, même dans les
       zones de début de jeu — le monde répond à votre lumière. */
    if (calculateEnemyThreatLevel() >= 2 && Math.random() < 0.5) type = 'caster';
    /* +1 niveau de renforts seulement après le passage scellé (fin de partie) */
    const lvl = z.lvl + (S.questI >= 14 ? 1 : 0);
    /* renforts nocturnes : +40 % de PV au plus noir de la nuit */
    const e = mkEnemy(x, zz, z.y, [[x, zz], [x + 3, zz], [x, zz + 3]],
      { type: type, lvl: lvl, dyn: true, hpMul: 1 + 0.4 * S.nightK });
    e.state = 'chase'; e.alerted = true;
    spawnBurst(x, z.y + 1, zz, 0x6a4a9e, 14);
    A.alert();
    want--;
    if (want <= 0 || aliveIn(z) >= cap) break;
  }
}
