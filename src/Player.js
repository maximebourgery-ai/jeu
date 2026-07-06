/* ---------------- JOUEURS (J1 clavier/souris · J2 manette en coop) ---------------- */
import * as THREE from 'three';
import { G, S, PATHS, keys, gpMove, tmMove, player, p2, colliders, enemies, tut, LIGHT_SCALE, armorReduction, equipTotals } from './state.js';
import { A } from './Audio.js';
import { $, showMsg, gameOver } from './UI.js';
import { slide, slideP, rayAABB, spawnBurst, setCamAspects, safeZoneAt, dropEquipmentOnDeath } from './World.js';
import { matFor, glow } from './AssetManager.js';
import { hasN } from './SkillTree.js';
import { tkToggle, gainRage } from './Powers.js';
import { damageEnemy } from './Enemies.js';
import { animateArms, lightPillar } from './Animations.js';

export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}
/* Silhouette distincte par voie (Mage / Guerrier / Assassin), teinte d'identité
   (bleu = J1, pourpre = J2) préservée pour la lisibilité en coop. */
export function classTint(identity) {
  return identity === 'p2'
    ? { cloth: 0x6b2440, dark: 0x3d1626, glow: 0xff9a6a, glowLight: 0xff9a6a, trim: 0xc86a4a }
    : { cloth: 0x2c3376, dark: 0x1c2148, glow: 0x8fe8ff, glowLight: 0x7fa8ff, trim: 0x5a78d8 };
}
/* ---- petits constructeurs partagés du corps (zéro asset : pure géométrie) ---- */
const SKIN = 0xd9b48a, GOLD = 0xd9a83c;
function sMat(color, rough, metal, emissive, ei) {
  const m = new THREE.MeshStandardMaterial({ color,
    roughness: rough !== undefined ? rough : 0.8, metalness: metal || 0 });
  if (emissive !== undefined) {
    m.emissive = new THREE.Color(emissive);
    m.emissiveIntensity = ei !== undefined ? ei : 0.6;
  }
  return m;
}
function bx(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}
/* Jambes articulées : pivot à la hanche — la foulée alternée est animée
   chaque frame dans Animations.js via parts.legL / parts.legR. */
function mkLegs(g, mat, bootMat, spread) {
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * (spread || 0.14), 0.5, 0);
    hip.add(bx(0.15, 0.42, 0.16, mat, 0, -0.24, 0));
    hip.add(bx(0.17, 0.12, 0.24, bootMat, 0, -0.46, 0.03));
    g.add(hip); legs.push(hip);
  }
  return legs;
}
/* Cape d'épaules : plane double-face qui flotte avec l'allure (parts.cape) */
function mkCape(g, color, w, h, y) {
  const cape = new THREE.Group(); cape.position.set(0, y, -0.17);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 3),
    new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }));
  m.position.y = -h / 2; m.castShadow = true;
  cape.add(m); cape.rotation.x = 0.2;
  g.add(cape);
  return cape;
}
/* Tête + yeux lumineux : le regard des porteurs de flamme luit de leur art */
function mkHeadEyes(g, r, y, eyeCol) {
  const head = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), sMat(SKIN, 0.85));
  head.position.y = y; head.castShadow = true;
  const eyeMat = new THREE.MeshBasicMaterial({ color: eyeCol });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), eyeMat);
  e1.position.set(-0.085, y + 0.02, r * 0.86);
  const e2 = e1.clone(); e2.position.x = 0.085;
  g.add(head, e1, e2);
  return head;
}
export function mkClassBody(pathId, identity) {
  const T = classTint(identity);
  const g = new THREE.Group();
  // Aura du Premier Foyer : halo doré permanent des vainqueurs de l'Ascension
  if (G.tower && G.tower.aura && identity !== 'p2') {
    const h = glow(0xffd97a, 2.6, 0.35);
    h.position.y = 1.1;
    g.add(h);
  }
  // Couronne de l'Aube (v8) : le diadème de lumière des libérateurs de la lune
  if (G.tower && G.tower.crown && identity !== 'p2') {
    const c = glow(0xfff2c8, 1.6, 0.5);
    c.position.y = 2.05;
    g.add(c);
  }
  /* Chaque voie porte son arme dans un groupe-pivot ancré à l'épaule
     droite (parts.arm) : les gestes d'attaque procéduraux (Animations.js)
     font tourner ce pivot — le coup part de l'épaule, comme un vrai bras.
     L'Assassin a un second pivot à gauche (parts.armL) pour alterner. */
  let staffPart, robePart, armLPart = null, tipPart = null,
      legLPart = null, legRPart = null, capePart = null;
  const spinParts = [];
  const goldMat = sMat(GOLD, 0.35, 0.7, 0x30220a, 1);
  if (pathId === 'warrior') {
    /* GUERRIER : cuirasse sombre, cape, heaume cornu, espadon runique */
    const armor = sMat(T.dark, 0.4, 0.6);
    const steel = sMat(0x8b909e, 0.3, 0.8);
    [legLPart, legRPart] = mkLegs(g, armor, steel, 0.16);
    const torso = bx(0.6, 0.78, 0.38, sMat(T.cloth, 0.6, 0.3), 0, 0.88, 0);
    // plastron d'acier + veine runique verticale qui luit de la teinte d'identité
    const plastron = bx(0.5, 0.46, 0.07, steel, 0, 1.0, 0.21);
    const vein = bx(0.05, 0.4, 0.02, sMat(T.glowLight, 0.5, 0, T.glowLight, 1.2), 0, 1.0, 0.255);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.12, 10), goldMat);
    belt.position.y = 0.56;
    // pauldrons à pointes
    const plG = new THREE.Group(), prG = new THREE.Group();
    for (const [grp, sx] of [[plG, -1], [prG, 1]]) {
      grp.position.set(sx * 0.4, 1.24, 0);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.21, 9, 9), steel); dome.castShadow = true;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 6), steel);
      spike.position.set(sx * 0.1, 0.18, 0); spike.rotation.z = -sx * 0.5;
      grp.add(dome, spike); g.add(grp);
    }
    mkHeadEyes(g, 0.23, 1.62, T.glow);
    const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.28, 10), steel);
    helm.position.y = 1.8; helm.castShadow = true;
    const nasal = bx(0.06, 0.2, 0.04, steel, 0, 1.66, 0.24);
    // cornes du heaume + cimier lumineux
    const hornMat = sMat(0xcfd4de, 0.45, 0.5);
    const hl = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 6), hornMat);
    hl.position.set(-0.26, 1.94, 0); hl.rotation.z = 0.7; hl.castShadow = true;
    const hr = hl.clone(); hr.position.x = 0.26; hr.rotation.z = -0.7;
    const crest = bx(0.05, 0.24, 0.05, sMat(T.glowLight, 0.5, 0, T.glowLight, 0.9), 0, 2.02, 0);
    capePart = mkCape(g, T.dark, 0.74, 1.1, 1.38);
    // bras-garde gauche (bouclier de chair : bracer + poing)
    const armF = new THREE.Group(); armF.position.set(-0.46, 1.24, 0.06);
    armF.add(bx(0.15, 0.4, 0.16, armor, 0, -0.2, 0));
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), steel);
    fist.position.set(0, -0.44, 0.02); armF.add(fist); g.add(armF);
    /* Espadon : lame effilée, gouttière runique, garde d'or, pommeau —
       porté par le pivot d'épaule droit (gestes d'attaque procéduraux) */
    const arm = new THREE.Group(); arm.position.set(0.46, 1.24, 0.1);
    arm.add(bx(0.15, 0.38, 0.16, armor, 0, -0.18, 0));
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.24, 6), sMat(0x3a2c1c, 0.9));
    grip.position.y = -0.52;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), goldMat);
    pommel.position.y = -0.66;
    const guard = bx(0.32, 0.055, 0.08, goldMat, 0, -0.38, 0);
    const blade = bx(0.11, 1.2, 0.032, sMat(0xd4d9e4, 0.18, 0.9), 0, 0.26, 0);
    const fuller = bx(0.028, 1.04, 0.038, sMat(T.glowLight, 0.4, 0, T.glowLight, 1.4), 0, 0.24, 0);
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.18, 4), sMat(0xd4d9e4, 0.18, 0.9));
    point.position.y = 0.94; point.rotation.y = Math.PI / 4;
    const swordGlow = glow(T.glowLight, 0.8, 0.45); swordGlow.position.y = 0.5;
    arm.add(grip, pommel, guard, blade, fuller, point, swordGlow);
    const plight = new THREE.PointLight(T.glowLight, 0.6 * LIGHT_SCALE, 7.5, 2); plight.position.y = 1.6;
    g.add(torso, plastron, vein, belt, helm, nasal, hl, hr, crest, arm, plight);
    staffPart = arm; robePart = torso;
  } else if (pathId === 'assassin') {
    /* ASSASSIN : veste ajustée, sangles, écharpe flottante, dagues jumelles */
    const dark = sMat(T.dark, 0.85);
    const leather = sMat(0x241a12, 0.9);
    [legLPart, legRPart] = mkLegs(g, dark, leather, 0.12);
    const torso = bx(0.42, 0.6, 0.26, dark, 0, 0.92, 0);
    // sangles croisées + ceinture à pochettes : la panoplie du rôdeur
    const strap1 = bx(0.045, 0.62, 0.28, sMat(T.trim, 0.7), 0, 0.94, 0); strap1.rotation.z = 0.5;
    const strap2 = strap1.clone(); strap2.rotation.z = -0.5;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.09, 9), leather);
    belt.position.y = 0.62;
    for (let i = -1; i <= 1; i++) g.add(bx(0.09, 0.11, 0.05, leather, i * 0.14, 0.6, 0.24));
    // couteaux de lancer au baudrier (petites lames au repos)
    for (let i = 0; i < 2; i++)
      g.add(bx(0.025, 0.16, 0.015, sMat(0xd8ffe8, 0.2, 0.8), -0.08 + i * 0.16, 0.9 + i * 0.12, -0.16));
    mkHeadEyes(g, 0.2, 1.42, T.glow);
    // masque bas + capuche effilée : seul le regard perce l'ombre
    const mask = bx(0.24, 0.1, 0.1, dark, 0, 1.36, 0.13);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 9), dark);
    hood.position.y = 1.64; hood.rotation.x = 0.12; hood.castShadow = true;
    capePart = mkCape(g, T.cloth, 0.4, 0.85, 1.4); // écharpe flottante
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 10), sMat(T.cloth, 0.9));
    scarf.position.y = 1.26; scarf.rotation.x = Math.PI / 2;
    /* Dague jumelle : lame, garde, manche — un pivot par épaule pour
       l'alternance droite/gauche des jets (Animations.js) */
    const mkDagger = (sx) => {
      const armG = new THREE.Group(); armG.position.set(sx * 0.32, 1.14, 0.1);
      armG.add(bx(0.11, 0.34, 0.12, dark, 0, -0.16, 0));
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 6), leather);
      grip.position.y = -0.42;
      const guard = bx(0.13, 0.03, 0.05, goldMat, 0, -0.34, 0);
      const blade = bx(0.05, 0.4, 0.018, sMat(0xd8ffe8, 0.12, 0.85), 0, -0.12, 0);
      const tipG = glow(T.glow, 0.45, 0.6); tipG.position.y = 0.1;
      armG.add(grip, guard, blade, tipG); g.add(armG);
      return armG;
    };
    armLPart = mkDagger(-1);
    const armR = mkDagger(1);
    const plight = new THREE.PointLight(T.glow, 0.55 * LIGHT_SCALE, 6.5, 2); plight.position.y = 1.48;
    g.add(torso, strap1, strap2, belt, mask, hood, scarf, plight);
    staffPart = armR; robePart = torso;
  } else if (pathId === 'paladin') {
    /* PALADIN : bastion d'or et d'acier clair — écu solaire, marteau runique,
       halo et lucioles d'aube en orbite */
    const armorMat = sMat(0xb8bdc9, 0.3, 0.7);
    [legLPart, legRPart] = mkLegs(g, armorMat, sMat(0x9298a8, 0.35, 0.7), 0.17);
    const torso = bx(0.62, 0.8, 0.42, armorMat, 0, 0.9, 0);
    const tabard = bx(0.32, 0.74, 0.05, sMat(T.cloth, 0.8), 0, 0.72, 0.23);
    // emblème solaire du tabard : anneau + cœur d'or incandescents
    const emblem = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 14),
      sMat(GOLD, 0.3, 0.5, 0xd9a83c, 1.2));
    emblem.position.set(0, 0.98, 0.27);
    const emCore = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd97a }));
    emCore.position.set(0, 0.98, 0.27);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.37, 0.12, 10), goldMat);
    belt.position.y = 0.56;
    // pauldrons cerclés d'or
    for (const sx of [-1, 1]) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 10), armorMat);
      dome.position.set(sx * 0.42, 1.26, 0); dome.castShadow = true;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 14), goldMat);
      rim.position.set(sx * 0.42, 1.2, 0); rim.rotation.x = Math.PI / 2;
      g.add(dome, rim);
    }
    mkHeadEyes(g, 0.235, 1.62, 0xffd97a);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), armorMat);
    helm.position.y = 1.68; helm.castShadow = true;
    // ailes du heaume : deux plumes d'or dressées
    const wingMat = sMat(GOLD, 0.4, 0.5, 0x30220a, 0.8);
    const wl = bx(0.03, 0.26, 0.14, wingMat, -0.27, 1.86, 0); wl.rotation.z = 0.35;
    const wr = bx(0.03, 0.26, 0.14, wingMat, 0.27, 1.86, 0); wr.rotation.z = -0.35;
    // halo d'aube + lucioles en orbite lente (parts.spin)
    const haloRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 18),
      sMat(0xffd97a, 0.3, 0.5, 0xd9a83c, 1.1));
    haloRing.position.y = 2.12; haloRing.rotation.x = Math.PI / 2;
    const motes = new THREE.Group(); motes.position.y = 2.12; motes.userData.spinV = 1.6;
    for (let i = 0; i < 3; i++) {
      const mote = glow(0xffd97a, 0.22, 0.45);
      const a = i / 3 * Math.PI * 2;
      mote.position.set(Math.cos(a) * 0.34, 0, Math.sin(a) * 0.34);
      motes.add(mote);
    }
    g.add(motes); spinParts.push(motes);
    capePart = mkCape(g, T.cloth, 0.78, 1.15, 1.4);
    // écu solaire au bras gauche : croix d'aube incandescente
    const shieldG = new THREE.Group(); shieldG.position.set(-0.5, 1.0, 0.1);
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.07, 10), armorMat);
    shield.rotation.z = Math.PI / 2; shield.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 16), goldMat);
    rim.rotation.y = Math.PI / 2;
    const crMat = sMat(0xffd97a, 0.4, 0.3, 0xd9a83c, 1.3);
    const cr1 = bx(0.045, 0.4, 0.03, crMat, -0.05, 0, 0);
    const cr2 = bx(0.045, 0.22, 0.03, crMat, -0.05, 0, 0); cr2.rotation.x = Math.PI / 2;
    shieldG.add(shield, rim, cr1, cr2); g.add(shieldG);
    /* Marteau d'aube : manche long, tête d'acier aux coiffes d'or, anneau
       runique incandescent — le pivot d'épaule anime le geste « smash » */
    const arm = new THREE.Group(); arm.position.set(0.5, 1.26, 0.1);
    arm.add(bx(0.16, 0.4, 0.17, armorMat, 0, -0.2, 0));
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.25, 7), matFor('woodF'));
    haft.position.y = -0.16; haft.castShadow = true;
    const hammerHead = bx(0.36, 0.2, 0.2, sMat(0x9aa0ae, 0.25, 0.8), 0, 0.46, 0);
    const cap1 = bx(0.06, 0.24, 0.24, goldMat, -0.2, 0.46, 0);
    const cap2 = bx(0.06, 0.24, 0.24, goldMat, 0.2, 0.46, 0);
    const runeBand = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 6, 12),
      sMat(0xffd97a, 0.4, 0, 0xffd97a, 1.5));
    runeBand.position.y = 0.46; runeBand.rotation.y = Math.PI / 2;
    const hGlow = glow(0xffd97a, 0.55, 0.35); hGlow.position.y = 0.46;
    arm.add(haft, hammerHead, cap1, cap2, runeBand, hGlow);
    const plight = new THREE.PointLight(0xffd97a, 0.65 * LIGHT_SCALE, 7.5, 2); plight.position.y = 1.7;
    g.add(torso, tabard, emblem, emCore, belt, helm, wl, wr, haloRing, arm, plight);
    staffPart = arm; robePart = torso;
  } else {
    /* MAGE : robe étagée au liseré runique, grimoire, chapeau étoilé,
       bâton de cristal et runes en orbite */
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.44, 1.2, 10), sMat(T.cloth, 0.9));
    robe.position.y = 0.66; robe.castShadow = true;
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.5, 10), sMat(T.dark, 0.95));
    skirt.position.y = 0.26; skirt.castShadow = true;
    // liseré runique : anneau qui luit doucement de la teinte d'identité
    const runeBand = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.35, 0.06, 10),
      sMat(T.dark, 0.6, 0, T.glow, 0.35));
    runeBand.position.y = 0.94;
    const mantle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.44, 0.3, 9), sMat(T.dark, 0.9));
    mantle.position.y = 1.16; mantle.castShadow = true;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.12, 9), goldMat);
    belt.position.y = 0.85;
    mkHeadEyes(g, 0.235, 1.4, T.glow);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.68, 10), sMat(T.dark, 0.95));
    hat.position.y = 1.82; hat.castShadow = true;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, 0.05, 12), sMat(T.dark, 0.95));
    brim.position.y = 1.56;
    const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.34, 0.07, 10), goldMat);
    hatBand.position.y = 1.62;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.06),
      new THREE.MeshBasicMaterial({ color: T.glow }));
    star.position.y = 2.2; star.add(glow(T.glow, 0.5, 0.6));
    // grimoire ouvert dans la main gauche, sceau lumineux sur la couverture
    const armF = new THREE.Group(); armF.position.set(-0.4, 1.12, 0.14);
    armF.add(bx(0.09, 0.36, 0.1, sMat(T.cloth, 0.9), 0, -0.16, 0));
    const book = bx(0.22, 0.3, 0.06, sMat(0x4a2c1a, 0.85), 0, -0.4, 0.06);
    book.rotation.x = -0.5;
    const seal = bx(0.1, 0.1, 0.015, sMat(T.glow, 0.5, 0, T.glow, 1.3), 0, -0.38, 0.1);
    seal.rotation.x = -0.5;
    armF.add(book, seal); g.add(armF);
    /* Bâton : fût, anneaux d'or, griffes et cristal octaédrique — la pointe
       (parts.tip) flamboie au départ de chaque trait (Animations.js) */
    const arm = new THREE.Group(); arm.position.set(0.42, 1.12, 0.12);
    arm.add(bx(0.09, 0.36, 0.1, sMat(T.cloth, 0.9), 0, -0.14, 0));
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.55, 7), matFor('woodF'));
    staff.position.y = -0.21; staff.castShadow = true;
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 10), goldMat);
    ring1.position.y = 0.34;
    const ring2 = ring1.clone(); ring2.position.y = 0.08;
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.16, 5), goldMat);
      const a = i / 3 * Math.PI * 2;
      claw.position.set(Math.cos(a) * 0.07, 0.52, Math.sin(a) * 0.07);
      claw.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      arm.add(claw);
    }
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.11),
      new THREE.MeshBasicMaterial({ color: T.glow }));
    tip.position.set(0, 0.64, 0);
    tip.add(glow(T.glow, 1.5, 0.65));
    arm.add(staff, ring1, ring2, tip);
    // runes d'étude en orbite autour du mage (parts.spin)
    const orbit = new THREE.Group(); orbit.position.y = 1.05; orbit.userData.spinV = 1.1;
    for (let i = 0; i < 3; i++) {
      const rune = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05),
        new THREE.MeshBasicMaterial({ color: T.glow }));
      const a = i / 3 * Math.PI * 2;
      rune.position.set(Math.cos(a) * 0.58, Math.sin(a * 2) * 0.12, Math.sin(a) * 0.58);
      orbit.add(rune);
    }
    g.add(orbit); spinParts.push(orbit);
    const plight = new THREE.PointLight(T.glowLight, 0.75 * LIGHT_SCALE, 8.5, 2); plight.position.y = 1.7;
    g.add(robe, skirt, runeBand, mantle, belt, hat, brim, hatBand, star, arm, plight);
    staffPart = arm; robePart = robe; tipPart = tip;
  }
  return { g, parts: {
    arm: staffPart, armL: armLPart, robe: robePart, tip: tipPart,
    legL: legLPart, legR: legRPart, cape: capePart, spin: spinParts.length ? spinParts : null
  } };
}
export function buildPlayer() {
  player.pos = new THREE.Vector3(0, 0.2, 60);
  player.vel = new THREE.Vector3();
  player.dashDir = new THREE.Vector3();
  const { g, parts, mixer } = mkClassBody(G.path, 'p1');
  g.position.copy(player.pos);
  S.scene.add(g);
  player.mesh = g;
  player.parts = parts;
  player.mixer = mixer || null;
  S.shieldMesh = mkShieldBubble();
  S.scene.add(S.shieldMesh);
}
/* Bulle d'Égide : sphère d'énergie + treillis hexagonal en surimpression
   (icosaèdre fil de fer) — le bouclier a une vraie « peau » magique. */
function mkShieldBubble() {
  const b = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  b.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.32, 1),
    new THREE.MeshBasicMaterial({ color: 0x9fdcff, wireframe: true, transparent: true,
      opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })));
  b.visible = false;
  return b;
}
/* Reconstruit le modèle 3D du J1 pour refléter sa voie (ex. après chargement d'une sauvegarde) */
export function refreshPlayerVisual() {
  if (!player.mesh) return;
  const hadWings = !!player.wings;
  S.scene.remove(player.mesh);
  const { g, parts, mixer } = mkClassBody(G.path, 'p1');
  g.position.copy(player.pos);
  S.scene.add(g);
  player.mesh = g; player.parts = parts; player.mixer = mixer || null; player.wings = null;
  if (hadWings) player.wings = mkWings(g);
}
/* Ailes d'Ombreciel : deux voiles translucides fixés au dos */
export function mkWings(mesh) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x8fc8ff, transparent: true, opacity: 0.4,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const shape = new THREE.PlaneGeometry(0.9, 1.3);
  const wl = new THREE.Mesh(shape, mat), wr = new THREE.Mesh(shape, mat.clone());
  wl.position.set(-0.5, 1.15, 0.28); wl.rotation.set(0.15, 0.6, 0.5);
  wr.position.set(0.5, 1.15, 0.28); wr.rotation.set(0.15, -0.6, -0.5);
  mesh.add(wl, wr);
  return [wl, wr];
}
export function addWingsToPlayer() {
  if (!player.wings) player.wings = mkWings(player.mesh);
  if (S.COOP && p2.mesh && !p2.wings) p2.wings = mkWings(p2.mesh);
}
/* Joueur 2 : silhouette selon sa voie, teinte pourpre pour le distinguer */
export function buildPlayer2() {
  if (p2.mesh) return;
  p2.pos = new THREE.Vector3(2, 0.2, 61);
  p2.vel = new THREE.Vector3();
  p2.dashDir = new THREE.Vector3();
  const { g, parts, mixer } = mkClassBody(p2.path, 'p2');
  g.position.copy(p2.pos);
  S.scene.add(g);
  p2.mesh = g;
  p2.parts = parts;
  p2.mixer = mixer || null;
  p2.shieldMesh = mkShieldBubble();
  S.scene.add(p2.shieldMesh);
  if (G.hasWings) p2.wings = mkWings(g);
}
/* Fait ENTRER le Joueur 2 dans la partie (écran scindé) : au lancement d'une
   partie coop, ou EN COURS DE PARTIE quand un téléphone réclame le J2 via la
   manette smartphone. Corps 3D selon sa voie (S.P2PATH), position près du J1,
   HUD coop (barres, ligne de partage, viseurs) et caméras recalculées. */
export function setupCoopP2() {
  S.COOP = true;
  const firstEntry = !p2.mesh; // première entrée en jeu du J2 (et pas une resynchronisation)
  p2.path = S.P2PATH; // AVANT buildPlayer2 : le corps 3D reflète la voie choisie
  buildPlayer2();
  /* v8.7 — les stats du J2 dérivent de SA progression (niveaux gagnés +
     nœuds d'arbre), recalculées ici pour survivre à une reconnexion ou au
     chargement d'une sauvegarde coop. */
  p2.maxHp = 100 + (PATHS[p2.path].hpBonus || 0) + 8 * ((p2.level || 1) - 1)
    + (p2.nodes.g_vit ? 40 : 0) + (p2.nodes.w_titan ? 30 : 0) + (p2.nodes.p_avatar ? 40 : 0);
  p2.maxMana = 100 + 6 * ((p2.level || 1) - 1) + (p2.nodes.g_wis ? 40 : 0);
  p2.hp = p2.maxHp; p2.mana = p2.maxMana;
  p2.pos.set(player.pos.x + 1.6, player.pos.y + 0.05, player.pos.z + 0.8);
  p2.yaw = S.yaw; p2.mesh.position.copy(p2.pos);
  $('bars2').style.display = 'block';
  $('splitline').style.display = 'block';
  $('cross2').style.display = 'block';
  $('cross').style.left = '25%';
  $('crystals').style.top = '146px';
  $('clock').style.top = '182px'; // sous les barres (PV/PM/XP/niveau) du J2 en coop
  if (G.hasWings) addWingsToPlayer();
  /* v8.7 — DIFFICULTÉ COOP : à deux porteurs, les ombres déjà en place se
     renforcent aussitôt (+60 % PV/dégâts) — celles qui naîtront ensuite
     reçoivent le même traitement à la source (mkEnemy, Enemies.js). */
  if (firstEntry) {
    for (const e of enemies) {
      if (e.dead) continue;
      e.hp = Math.round(e.hp * 1.6);
      e.maxHp = Math.round(e.maxHp * 1.6);
      e.dmg = Math.round(e.dmg * 1.6);
    }
  }
  setCamAspects();
}
/* Physique et animation du Joueur 2 (mêmes règles que le J1) */
export function updateP2(dt) {
  const p = p2;
  const f = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
  const r = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
  let vx = f.x * p.input.mz + r.x * p.input.mx, vz = f.z * p.input.mz + r.z * p.input.mx;
  const ml = Math.hypot(vx, vz);
  if (ml > 1) { vx /= ml; vz /= ml; }
  let speed = (p.input.sprint ? 9.5 : 5.8) * (PATHS[p.path].move || 1);
  // v9.1 — célérité de SON PROPRE équipement (plafonnée à +25 %, comme le J1)
  speed *= 1 + Math.min(25, equipTotals(2).speed) / 100;
  if (p.dashT > 0) {
    p.dashT -= dt;
    vx = p.dashDir.x; vz = p.dashDir.z;
    speed = 22;
  }
  p.coyoteT = Math.max(0, (p.coyoteT || 0) - dt);
  if (p.grounded) { p.coyoteT = 0.14; p.airJumped = false; }
  p.jumpQ = Math.max(0, p.jumpQ - dt);
  if (p.jumpQ > 0 && (p.grounded || p.coyoteT > 0)) {
    p.vel.y = 11.4; p.grounded = false; p.coyoteT = 0; p.jumpQ = 0; A.jump();
  } else if (p.jumpQ > 0 && G.hasWings && !p.airJumped) {
    p.airJumped = true; p.vel.y = 10.2; p.jumpQ = 0; A.jump();
    spawnBurst(p.pos.x, p.pos.y + 0.6, p.pos.z, 0x8fc8ff, 10);
  }
  if (G.hasWings && !p.grounded && p.vel.y < 0 && p.input.jumpHeld) {
    p.vel.y = Math.max(p.vel.y, -3.2);
  }
  p.vel.y -= 23 * dt;
  if (p.vel.y < -30) p.vel.y = -30;
  p.grounded = false;
  slideP(p, 'y', p.vel.y * dt);
  slideP(p, 'x', vx * speed * dt);
  slideP(p, 'z', vz * speed * dt);
  if (p.grounded && ml > 0.05) {
    p.stepT += speed * dt;
    if (p.stepT > 2.4) { p.stepT = 0; A.step(); }
    p.walkT += speed * dt;
  }
  /* Rubber-banding coop : si le J2 chute dans le vide, il est ramené au
     bord du dernier saut réussi par le J1 (dernier appui au sol), avec une
     pénalité — la partie n'attend jamais un joueur au fond d'un gouffre. */
  if (p.pos.y < -40) {
    p.pos.set(S.lastSafe.x + 0.8, S.lastSafe.y + 0.1, S.lastSafe.z + 0.8);
    p.vel.set(0, 0, 0);
    hurtP2(15, null);
    showMsg('Le lien des porteurs de flamme ramène le second au bord du dernier saut du premier...', 3);
  }
  p.mesh.position.copy(p.pos);
  const bob = (p.grounded && ml > 0.05) ? Math.abs(Math.sin(p.walkT * 1.6)) * 0.06 : 0;
  p.mesh.position.y = p.pos.y + bob;
  animateArms(p, dt, ml > 0.05);
  if (ml > 0.05 || p.dashT > 0) {
    const ty = Math.atan2(vx, vz);
    p.mesh.rotation.y = lerpAngle(p.mesh.rotation.y, ty, 12 * dt);
  }
  flapWings(p);
  if (p.mixer) p.mixer.update(dt);
  p2.mana = Math.min(p2.maxMana, p2.mana + 6 * dt);
  for (const k in p2.cd) p2.cd[k] = Math.max(0, p2.cd[k] - dt);
  if (p.invuln > 0) p.invuln -= dt;
  if (p.shieldT > 0) {
    p.shieldT -= dt;
    p.shieldMesh.visible = true;
    p.shieldMesh.position.set(p.pos.x, p.pos.y + 1, p.pos.z);
    p.shieldMesh.rotation.y += dt * 0.8;
    p.shieldMesh.material.opacity = 0.1 + 0.08 * Math.sin(G.time * 6);
  } else p.shieldMesh.visible = false;
}
/* Distance caméra maximale avant le premier mur (partagée J1/J2 — code unifié) */
function occludeDist(eye, back, want) {
  let closest = want;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!c.on) continue;
    const t = rayAABB(eye, back, c.min, c.max);
    if (t !== null && t < closest) closest = t;
  }
  /* plancher abaissé (0,9 contre 1,4) : dans les couloirs étroits, la caméra
     préfère se rapprocher du dos du héros plutôt que rester DANS la paroi */
  return Math.max(0.9, Math.min(want, closest - 0.3));
}
/* Battement d'ailes (partagé J1/J2 — code unifié) */
function flapWings(pl) {
  if (!pl.wings) return;
  const flap = pl.grounded ? 0.5 : 0.9 + Math.sin(G.time * 10) * 0.35;
  pl.wings[0].rotation.y = 0.6 * flap;
  pl.wings[1].rotation.y = -0.6 * flap;
}
/* Caméra du Joueur 2 (troisième personne, occlusion identique au J1) */
export function updateCamera2() {
  if (!p2.pos) return;
  const tx = p2.pos.x, ty = p2.pos.y + 1.6, tz = p2.pos.z;
  const dir = camDirVec2();
  const back = { x: -dir.x, y: -dir.y, z: -dir.z };
  let d = occludeDist({ x: tx, y: ty, z: tz }, back, 4.55);
  // spring arm du J2 : même rétraction instantanée + retour lissé que le J1
  if (d < S.camD2) S.camD2 = d;
  else S.camD2 = S.camD2 + (d - S.camD2) * 0.1;
  d = S.camD2;
  S.cam2.position.set(tx - dir.x * d, ty - dir.y * d, tz - dir.z * d);
  if (S.cam2.position.y < p2.pos.y + 0.35) S.cam2.position.y = p2.pos.y + 0.35;
  S.cam2.lookAt(tx, ty, tz);
}
export function updatePlayer(dt) {
  const p = player;
  const f = { x: -Math.sin(S.yaw), z: -Math.cos(S.yaw) };
  const r = { x: Math.cos(S.yaw), z: -Math.sin(S.yaw) };
  let mx = 0, mz = 0;
  if (keys['KeyW']) mz += 1;
  if (keys['KeyS']) mz -= 1;
  if (keys['KeyD']) mx += 1;
  if (keys['KeyA']) mx -= 1;
  mx += gpMove.x + tmMove.x; mz += gpMove.z + tmMove.z; // stick manette + joystick tactile
  let vx = f.x * mz + r.x * mx, vz = f.z * mz + r.z * mx;
  const ml = Math.hypot(vx, vz);
  if (ml > 1) { vx /= ml; vz /= ml; }
  const tmSprint = Math.hypot(tmMove.x, tmMove.z) > 0.92; // joystick poussé à fond = sprint
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'] || S.gpSprint || tmSprint;
  // Danse des ombres (hasteT) et Élixir du Traqueur (buffSpeedT) ne se cumulent pas
  let speed = (sprint ? 9.5 : 5.8) * (PATHS[G.path].move || 1) * (G.hasteT > 0 || G.buffSpeedT > 0 ? 1.2 : 1);
  // v9 — célérité d'équipement (stat `speed`, en %) : plafonnée à +25 %
  speed *= 1 + Math.min(25, equipTotals().speed) / 100;
  if (p.dashT > 0) {
    p.dashT -= dt;
    vx = p.dashDir.x; vz = p.dashDir.z;
    speed = 22;
  }
  p.coyoteT = Math.max(0, (p.coyoteT || 0) - dt);
  if (p.grounded) { p.coyoteT = 0.14; p.airJumped = false; }
  S.jumpQueued = Math.max(0, S.jumpQueued - dt);
  if (S.jumpQueued > 0 && (p.grounded || p.coyoteT > 0)) {
    p.vel.y = 11.4; p.grounded = false; p.coyoteT = 0; S.jumpQueued = 0; A.jump(); tut.jumped = true;
  } else if (S.jumpQueued > 0 && G.hasWings && !p.airJumped) {
    // Ailes d'Ombreciel : double saut
    p.airJumped = true; p.vel.y = 10.2; S.jumpQueued = 0; A.jump();
    spawnBurst(p.pos.x, p.pos.y + 0.6, p.pos.z, 0x8fc8ff, 10);
  }
  // Ailes : plané en maintenant Espace pendant la chute
  if (G.hasWings && !p.grounded && p.vel.y < 0 && (keys['Space'] || S.gpJumpHeld || S.tmJumpHeld)) {
    p.vel.y = Math.max(p.vel.y, -3.2);
  }
  if (sprint && ml > 0) tut.sprinted = true;
  p.vel.y -= 23 * dt;
  if (p.vel.y < -30) p.vel.y = -30;
  p.grounded = false;
  slide('y', p.vel.y * dt);
  slide('x', vx * speed * dt);
  slide('z', vz * speed * dt);
  if (ml > 0) tut.moved += speed * dt;
  if (p.grounded && ml > 0) {
    p.stepT += speed * dt;
    if (p.stepT > 2.4) { p.stepT = 0; A.step(); }
    p.walkT += speed * dt;
  }
  /* dernier appui au sol du J1 : point d'ancrage du rubber-banding coop */
  if (p.grounded) { S.lastSafe.x = p.pos.x; S.lastSafe.y = p.pos.y; S.lastSafe.z = p.pos.z; }
  /* Kill Z-volume : le vide téléporte le joueur fautif au dernier feu de
     bivouac (jamais de chute infinie ni de crash). Dans la Tour, le point
     de contrôle est l'entrée du palier courant. */
  if (p.pos.y < -40) {
    p.pos.set(G.checkpoint.x, G.checkpoint.y, G.checkpoint.z); p.vel.set(0, 0, 0);
    hurt(20, null);
    showMsg('Le vide vous recrache près du dernier bivouac...', 3);
  }
  // mesh + animation de marche
  p.mesh.position.copy(p.pos);
  const bob = (p.grounded && ml > 0) ? Math.abs(Math.sin(p.walkT * 1.6)) * 0.06 : 0;
  p.mesh.position.y = p.pos.y + bob;
  animateArms(p, dt, ml > 0);
  /* Recentrage doux vers la cible verrouillée au moment d'un coup (tactile/
     manette) : la caméra "colle" brièvement à l'ennemi sans jamais voler
     le contrôle — le glissement du pouce garde toujours le dernier mot. */
  if (S.faceT > 0) {
    S.faceT -= dt;
    const t = S.aimTarget;
    if (t && !t.dead) {
      const dx = t.g.position.x - p.pos.x, dz = t.g.position.z - p.pos.z;
      const want = Math.atan2(-dx, -dz);
      S.yaw = lerpAngle(S.yaw, want, 7 * dt);
      const dh = Math.hypot(dx, dz) || 1;
      const wantP = Math.atan2((t.g.position.y + 0.6 * t.s) - (p.pos.y + 1.6), dh);
      S.pitch += (Math.max(-1.22, Math.min(0.85, wantP)) - S.pitch) * Math.min(1, 5 * dt);
    }
  }
  if (ml > 0.01 || p.dashT > 0) {
    const ty = Math.atan2(vx, vz);
    p.mesh.rotation.y = lerpAngle(p.mesh.rotation.y, ty, 12 * dt);
  }
  if (p.mixer) p.mixer.update(dt);
  tickPoison(dt); // le venin des Maîtres d'Étage ronge la chair (J1 + J2)
  G.mana = Math.min(G.maxMana, G.mana + (hasN('g_wis') ? 10 : 6) * dt);
  // Aura du Premier Foyer (Observatoire de l'Aube) : le foyer répare la chair
  // (v8.3 : régénération adoucie — le porteur ne doit plus être immortel)
  if (G.tower.aura) G.hp = Math.min(G.maxHp, G.hp + 0.7 * dt);
  // Couronne de l'Aube (v8) : le foyer veille aussi sur l'esprit
  if (G.tower.crown) {
    G.hp = Math.min(G.maxHp, G.hp + 0.45 * dt);
    G.mana = Math.min(G.maxMana, G.mana + 2 * dt);
  }
  /* v8.4 : plus AUCUNE régénération passive près des feux — la braise du
     bivouac soigne une fois (World.js), le camping au coin du feu est mort */
  for (const k in G.cd) G.cd[k] = Math.max(0, G.cd[k] - dt);
  if (p.invuln > 0) p.invuln -= dt;
  if (G.shieldT > 0) {
    G.shieldT -= dt;
    S.shieldMesh.visible = true;
    S.shieldMesh.position.set(p.pos.x, p.pos.y + 1, p.pos.z);
    S.shieldMesh.rotation.y += dt * 0.8;
    S.shieldMesh.material.opacity = 0.1 + 0.08 * Math.sin(G.time * 6);
  } else S.shieldMesh.visible = false;
}

/* ---------------- CAMÉRA ----------------
   · Spring arm dynamique : rétractation INSTANTANÉE au contact d'un mur,
     retour lissé (damping) pour éviter le mal de mer.
   · Dithering : les murs qui occultent encore la caméra passent à 20 %
     d'opacité (matériau cloné par mesh — jamais le matériau partagé).
   · Lock-on axe Z : en combat rapproché, la verticalité extrême est
     bridée pour ne pas perdre ses repères face aux Traqueurs bondissants. */
/* 7 % (contre 20 %) : un mur occultant devient un voile à peine visible —
   fini la grande nappe beige quand la caméra recule contre une paroi. */
const DITHER_OPACITY = 0.07;
function setDither(mesh, on) {
  if (!mesh) return;
  if (on) {
    if (!mesh.userData.baseMat) {
      mesh.userData.baseMat = mesh.material;
      const m = mesh.material.clone();
      m.transparent = true; m.opacity = DITHER_OPACITY; m.depthWrite = false;
      mesh.userData.ditherMat = m;
    }
    mesh.material = mesh.userData.ditherMat;
  } else if (mesh.userData.baseMat) {
    mesh.material = mesh.userData.baseMat;
  }
}
/* Passe à 20 % les murs coupant le segment tête du joueur → caméra. */
function ditherOccluders(eye, back, d) {
  const now = new Set();
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!c.on || !c.mesh) continue;
    const t = rayAABB(eye, back, c.min, c.max);
    if (t !== null && t < d + 0.3) now.add(c.mesh);
  }
  for (const m of S.dithered) if (!now.has(m)) setDither(m, false);
  for (const m of now) if (!S.dithered.has(m)) setDither(m, true);
  S.dithered = now;
}
export function camDirVec() {
  const cp = Math.cos(S.pitch);
  return new THREE.Vector3(-Math.sin(S.yaw) * cp, Math.sin(S.pitch), -Math.cos(S.yaw) * cp);
}
export function camDirVec2() {
  const cp = Math.cos(p2.pitch);
  return new THREE.Vector3(-Math.sin(p2.yaw) * cp, Math.sin(p2.pitch), -Math.cos(p2.yaw) * cp);
}
export function updateCamera() {
  if (!player.pos) return;
  const tx = player.pos.x, ty = player.pos.y + 1.6, tz = player.pos.z;
  const dir = camDirVec();
  flapWings(player);
  if (G.firstPerson) {
    player.mesh.visible = false;
    S.camera.position.set(tx, player.pos.y + 1.55, tz);
    S.camera.lookAt(tx + dir.x, player.pos.y + 1.55 + dir.y, tz + dir.z);
    S.camKick = Math.max(0, S.camKick - 0.12);
    return;
  }
  player.mesh.visible = true;
  /* Lock-on axe Z : en combat rapproché (S.combatT), la plage de tangage est
     bridée en douceur — plus de plongées/contre-plongées désorientantes. */
  if (S.combatT > 0) {
    if (S.pitch < -0.95) S.pitch += Math.min(0.05, -0.95 - S.pitch);
    if (S.pitch > 0.55) S.pitch -= Math.min(0.05, S.pitch - 0.55);
  }
  // Spring arm : si un mur/pilier coupe le bras désiré, rétractation instantanée
  // (léger recul de la caméra au lancement d'un sort via camKick)
  const back = { x: -dir.x, y: -dir.y, z: -dir.z };
  const eye = { x: tx, y: ty, z: tz };
  /* Caméra rapprochée (4.55 contre 5.4 avant) : le personnage et ses
     nouveaux détails remplissent l'écran, sans gêner la lecture du combat. */
  let d = occludeDist(eye, back, 4.55 + S.camKick * 4);
  /* damping : rétraction immédiate, mais retour lissé (anti mal de mer) */
  if (d < S.camD) S.camD = d;
  else S.camD = S.camD + (d - S.camD) * 0.1;
  d = S.camD;
  S.camera.position.set(tx - dir.x * d, ty - dir.y * d, tz - dir.z * d);
  if (S.camera.position.y < player.pos.y + 0.35) S.camera.position.y = player.pos.y + 0.35;
  S.camera.lookAt(tx, ty, tz);
  S.camKick = Math.max(0, S.camKick - 0.12);
  // dithering : ce qui occulte ENCORE la caméra (marches, linteaux...) devient translucide
  ditherOccluders(eye, back, d);
}

/* ---------------- DÉGÂTS ---------------- */
/* Poison / corruption : certains coups des Maîtres d'Étage (venin de la
   Racine, crocs de l'Avale-Lune) et les mares (poison, nuit liquide)
   laissent un venin qui ronge la chair pendant t secondes. L'Égide bloque
   l'application ; le venin ne porte jamais le coup fatal (1 PV plancher) —
   il force à boire une potion ou fuir, pas à mourir sans se battre. */
export function applyPoison(pl, t, dps) {
  if (pl === p2) {
    if (p2.shieldT > 0) return;
    if (p2.poisonT <= 0) spawnBurst(p2.pos.x, p2.pos.y + 1, p2.pos.z, 0x7ade5a, 10);
    p2.poisonT = Math.max(p2.poisonT, t); p2.poisonDps = dps;
  } else {
    if (G.shieldT > 0) return;
    if (S.poisonT <= 0) {
      spawnBurst(player.pos.x, player.pos.y + 1, player.pos.z, 0x7ade5a, 10);
      showMsg('EMPOISONNÉ ! Le venin ronge votre chair...', 2.4);
    }
    S.poisonT = Math.max(S.poisonT, t); S.poisonDps = dps;
  }
}
function tickPoison(dt) {
  if (S.poisonT > 0) {
    S.poisonT -= dt;
    G.hp = Math.max(1, G.hp - S.poisonDps * dt);
    G.vig = Math.max(G.vig, 0.4);
    if (Math.random() < dt * 7)
      spawnBurst(player.pos.x + (Math.random() - 0.5) * 0.7, player.pos.y + 0.6 + Math.random(),
        player.pos.z + (Math.random() - 0.5) * 0.7, 0x7ade5a, 1);
  }
  if (S.COOP && p2.pos && p2.poisonT > 0) {
    p2.poisonT -= dt;
    p2.hp = Math.max(1, p2.hp - p2.poisonDps * dt);
    if (Math.random() < dt * 7)
      spawnBurst(p2.pos.x, p2.pos.y + 0.8 + Math.random(), p2.pos.z, 0x7ade5a, 1);
  }
}
export function hurt(d, src) {
  if (player.invuln > 0 || G.shieldT > 0) return;
  player.invuln = 0.5;
  if (G.path === 'paladin' && hasN('p_guard')) d = Math.round(d * 0.75); // Peau de pierre
  /* v9 — armure d'équipement à RENDEMENTS DÉCROISSANTS : réduction =
     armure / (armure + 100), plafonnée à 75 % (voir armorReduction,
     state.js). Chaque coup inflige toujours au moins 1 point. */
  d = Math.max(1, Math.round(d * (1 - armorReduction())));
  G.hp -= d; G.vig = 1;
  G.comboHits = 0; G.comboHitT = 0; // encaisser un coup brise l'enchaînement
  gainRage(d * 0.5); // Guerrier : la douleur nourrit la rage (+50 % des dégâts subis)
  if (G.path === 'paladin' && hasN('p_retal') && src) {
    // Représailles : un éclat d'aube blesse les ombres proches
    spawnBurst(player.pos.x, player.pos.y + 1, player.pos.z, 0xffd97a, 12);
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.g.position.x - player.pos.x, dz = e.g.position.z - player.pos.z;
      if (Math.hypot(dx, dz) < 3.5 && Math.abs(e.g.position.y - (player.pos.y + 1)) < 3)
        damageEnemy(e, 8, { x: dx, z: dz });
    }
  }
  A.hurt();
  if (src) {
    const kx = player.pos.x - src.x, kz = player.pos.z - src.z;
    const l = Math.hypot(kx, kz) || 1;
    slide('x', kx / l * 0.7);
    slide('z', kz / l * 0.7);
    player.vel.y = 4; player.grounded = false;
  }
  if (G.hp <= 0) {
    if (S.tkHeld) tkToggle();
    A.die();
    if (S.COOP) {
      /* Coop : renaissance immédiate (l'écran scindé continue de vivre
         pour l'autre porteur de flamme — pas d'écran de mort bloquant). */
      G.hp = Math.floor(G.maxHp * 0.6);
      G.mana = G.maxMana;
      player.pos.set(G.checkpoint.x, G.checkpoint.y, G.checkpoint.z); player.vel.set(0, 0, 0);
      showMsg('Les ombres vous ont submergé... Vous rouvrez les yeux près du dernier feu de bivouac.', 4.5);
    } else {
      /* Solo : CORPSE RUN — l'équipement porté tombe dans une Tombe d'Aube
         aux coordonnées du trépas (5 min réelles pour le récupérer), PUIS
         écran GAME OVER — latence, choix du feu de renaissance. */
      dropEquipmentOnDeath();
      gameOver();
    }
  }
}
export function hurtP2(d, src) {
  if (p2.invuln > 0 || p2.shieldT > 0) return;
  p2.invuln = 0.5;
  // v9.1 — armure de SON PROPRE équipement, même rendements décroissants que le J1
  d = Math.max(1, Math.round(d * (1 - armorReduction(2))));
  p2.hp -= d; G.vig = 1;
  A.hurt();
  if (src) {
    const kx = p2.pos.x - src.x, kz = p2.pos.z - src.z;
    const l = Math.hypot(kx, kz) || 1;
    slideP(p2, 'x', kx / l * 0.7);
    slideP(p2, 'z', kz / l * 0.7);
    p2.vel.y = 4; p2.grounded = false;
  }
  if (p2.hp <= 0) {
    p2.hp = Math.floor(p2.maxHp * 0.6);
    p2.mana = p2.maxMana;
    p2.pos.set(G.checkpoint.x + 1.5, G.checkpoint.y, G.checkpoint.z);
    p2.vel.set(0, 0, 0);
    A.die();
    showMsg('Le second porteur de flamme a été submergé... Il se relève au dernier bivouac.', 4);
  }
}
/* Bénédiction, pour l'un ou l'autre porteur de flamme (code unifié J1/J2) */
export function healSelf(pl) {
  pl = pl || player;
  A.pickup();
  // Forge des Arts : rangs de Bénédiction DU LANCEUR (J1 et J2 forgent chacun les leurs)
  const heal = 40 + 12 * ((pl === p2 ? p2 : G).pupg.heal || 0);
  if (pl === p2) { p2.hp = Math.min(p2.maxHp, p2.hp + heal); p2.poisonT = 0; }
  else { G.hp = Math.min(G.maxHp, G.hp + heal); S.poisonT = 0; } // la Bénédiction purge le venin
  spawnBurst(pl.pos.x, pl.pos.y + 1.2, pl.pos.z, 0x9fffb0, 16);
  lightPillar(pl.pos.x, pl.pos.y - 0.8, pl.pos.z, 0x9fffb0); // colonne de vie
  // la Racine Vengeresse (Tour, étage 9) est vulnérable à la Bénédiction,
  // quel que soit le porteur de flamme qui la lance
  if (S.onHeal) S.onHeal();
}
