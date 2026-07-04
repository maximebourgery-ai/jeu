/* ---------------- JOUEURS (J1 clavier/souris · J2 manette en coop) ---------------- */
import * as THREE from 'three';
import { G, S, PATHS, keys, gpMove, tmMove, player, p2, colliders, enemies, tut, LIGHT_SCALE } from './state.js';
import { A } from './Audio.js';
import { showMsg } from './UI.js';
import { slide, slideP, rayAABB, spawnBurst } from './World.js';
import { matFor, glow, modelClone, characterClone } from './AssetManager.js';
import { hasN } from './SkillTree.js';
import { tkToggle, gainRage } from './Powers.js';
import { damageEnemy } from './Enemies.js';

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
    ? { cloth: 0x6b2440, dark: 0x3d1626, glow: 0xff9a6a, glowLight: 0xff9a6a }
    : { cloth: 0x2c3376, dark: 0x1c2148, glow: 0x8fe8ff, glowLight: 0x7fa8ff };
}
export function mkClassBody(pathId, identity) {
  const T = classTint(identity);
  const g = new THREE.Group();
  /* Personnage choisi au menu titre (G.skin) : le héros incarne ce corps,
     en rôle « gentil » (couleurs d'origine + douce lueur d'âme). Le J2
     reçoit un voile pourpre léger pour rester identifiable en coop. */
  if (G.skin && G.skin !== 'silhouette') {
    const chr = characterClone('hero', 1.85, G.skin);
    if (chr) {
      if (identity === 'p2')
        for (const m of chr.userData.charMats)
          if (m.color) m.color.multiply(new THREE.Color(0xdfb8e8));
      g.add(chr);
      /* Si le fichier embarque une animation Mixamo, on la joue en boucle
         (sinon le personnage est déjà en pose de repos via characterClone). */
      let mixer = null;
      const clips = chr.userData.clips;
      if (clips && clips.length) {
        mixer = new THREE.AnimationMixer(chr.userData.charRoot);
        mixer.clipAction(clips[0]).play();
      }
      const plight = new THREE.PointLight(T.glowLight, 0.55 * LIGHT_SCALE, 7, 2);
      plight.position.y = 1.7;
      g.add(plight);
      const staffPart = new THREE.Object3D(), robePart = new THREE.Object3D();
      g.add(staffPart, robePart);
      return { g, parts: { staff: staffPart, robe: robePart }, mixer };
    }
  }
  /* Si un modèle player_<voie>.glb est fourni, il remplace la silhouette
     primitive ; les pièces animées (bâton/robe) deviennent des ancres vides
     pour que l'animation de marche reste sans effet de bord. */
  const glb = modelClone('player_' + pathId);
  if (glb) {
    g.add(glb);
    const plight = new THREE.PointLight(T.glowLight, 0.55 * LIGHT_SCALE, 7, 2); plight.position.y = 1.7;
    g.add(plight);
    const staffPart = new THREE.Object3D(), robePart = new THREE.Object3D();
    g.add(staffPart, robePart);
    return { g, parts: { staff: staffPart, robe: robePart } };
  }
  let staffPart, robePart;
  if (pathId === 'warrior') {
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.82, 0.36),
      new THREE.MeshStandardMaterial({ color: T.cloth, roughness: 0.6, metalness: 0.3 }));
    torso.position.y = 0.6; torso.castShadow = true;
    const pauldronMat = new THREE.MeshStandardMaterial({ color: T.dark, roughness: 0.35, metalness: 0.65 });
    const pl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), pauldronMat); pl.position.set(-0.37, 0.98, 0); pl.castShadow = true;
    const pr = pl.clone(); pr.position.x = 0.37;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.13, 9),
      new THREE.MeshStandardMaterial({ color: 0xd9a83c, roughness: 0.4, metalness: 0.6 }));
    belt.position.y = 0.84;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xd9b48a, roughness: 0.8 }));
    head.position.y = 1.34; head.castShadow = true;
    const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.29, 0.3, 9),
      new THREE.MeshStandardMaterial({ color: 0x585c66, roughness: 0.3, metalness: 0.75 }));
    helm.position.y = 1.54; helm.castShadow = true;
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.05),
      new THREE.MeshStandardMaterial({ color: T.glowLight, roughness: 0.5, emissive: T.glowLight, emissiveIntensity: 0.4 }));
    crest.position.y = 1.8;
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.3, 0.035),
      new THREE.MeshStandardMaterial({ color: 0xc7ccd6, roughness: 0.2, metalness: 0.85 }));
    sword.position.set(0.46, 0.9, 0.14); sword.rotation.z = -0.22; sword.castShadow = true;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.055, 0.055),
      new THREE.MeshStandardMaterial({ color: 0xd9a83c, roughness: 0.4, metalness: 0.6 }));
    guard.position.set(0.46, 0.29, 0.14); guard.rotation.z = -0.22;
    const plight = new THREE.PointLight(T.glowLight, 0.4 * LIGHT_SCALE, 6, 2); plight.position.y = 1.6;
    g.add(torso, pl, pr, belt, head, helm, crest, sword, guard, plight);
    staffPart = sword; robePart = torso;
  } else if (pathId === 'assassin') {
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.05, 9),
      new THREE.MeshStandardMaterial({ color: T.dark, roughness: 0.85 }));
    cloak.position.y = 0.58; cloak.castShadow = true;
    const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.1, 9),
      new THREE.MeshStandardMaterial({ color: T.cloth, roughness: 0.6 }));
    sash.position.y = 0.8;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xd9b48a, roughness: 0.8 }));
    head.position.y = 1.32; head.castShadow = true;
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.48, 9),
      new THREE.MeshStandardMaterial({ color: T.dark, roughness: 0.9 }));
    hood.position.y = 1.56; hood.castShadow = true;
    const dagMat = new THREE.MeshStandardMaterial({ color: 0xd8ffe8, roughness: 0.15, metalness: 0.8 });
    const dagL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.48, 0.02), dagMat);
    dagL.position.set(-0.34, 0.76, 0.12); dagL.rotation.z = 0.32;
    const dagR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.48, 0.02), dagMat.clone());
    dagR.position.set(0.34, 0.76, 0.12); dagR.rotation.z = -0.32;
    const eyeMat = new THREE.MeshBasicMaterial({ color: T.glow });
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), eyeMat); e1.position.set(-0.08, 1.34, 0.19);
    const e2 = e1.clone(); e2.position.x = 0.08;
    const plight = new THREE.PointLight(T.glow, 0.35 * LIGHT_SCALE, 5, 2); plight.position.y = 1.48;
    g.add(cloak, sash, head, hood, dagL, dagR, e1, e2, plight);
    staffPart = dagR; robePart = cloak;
  } else if (pathId === 'paladin') {
    /* Paladin : bastion cuirassé — armure claire, écu, marteau d'aube, anneau doré */
    const armorMat = new THREE.MeshStandardMaterial({ color: 0xb8bdc9, roughness: 0.3, metalness: 0.7 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.86, 0.4), armorMat);
    torso.position.y = 0.62; torso.castShadow = true;
    const tabard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.78, 0.05),
      new THREE.MeshStandardMaterial({ color: T.cloth, roughness: 0.8 }));
    tabard.position.set(0, 0.6, 0.22);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.37, 0.13, 9),
      new THREE.MeshStandardMaterial({ color: 0xd9a83c, roughness: 0.4, metalness: 0.6 }));
    belt.position.y = 0.86;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xd9b48a, roughness: 0.8 }));
    head.position.y = 1.36; head.castShadow = true;
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.27, 9, 9, 0, Math.PI * 2, 0, Math.PI * 0.55), armorMat);
    helm.position.y = 1.42; helm.castShadow = true;
    // anneau d'aube flottant au-dessus du casque
    const haloRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 18),
      new THREE.MeshStandardMaterial({ color: 0xffd97a, roughness: 0.3, metalness: 0.5,
        emissive: 0xd9a83c, emissiveIntensity: 0.8 }));
    haloRing.position.y = 1.86; haloRing.rotation.x = Math.PI / 2;
    // écu au bras gauche
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.06, 8), armorMat);
    shield.position.set(-0.46, 0.78, 0.1); shield.rotation.z = Math.PI / 2; shield.castShadow = true;
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9a83c, roughness: 0.35, metalness: 0.7 }));
    boss.position.set(-0.5, 0.78, 0.1);
    // marteau d'aube au bras droit
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 6), matFor('woodF', 1, 1));
    haft.position.set(0.48, 0.86, 0.14); haft.castShadow = true;
    const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.18), armorMat);
    hammerHead.position.set(0.48, 1.5, 0.14); hammerHead.castShadow = true;
    const plight = new THREE.PointLight(0xffd97a, 0.45 * LIGHT_SCALE, 6, 2); plight.position.y = 1.7;
    g.add(torso, tabard, belt, head, helm, haloRing, shield, boss, haft, hammerHead, plight);
    staffPart = haft; robePart = torso;
  } else {
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.15, 9),
      new THREE.MeshStandardMaterial({ color: T.cloth, roughness: 0.9 }));
    robe.position.y = 0.62; robe.castShadow = true;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.12, 9),
      new THREE.MeshStandardMaterial({ color: 0xd9a83c, roughness: 0.4, metalness: 0.6 }));
    belt.position.y = 0.85;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xd9b48a, roughness: 0.8 }));
    head.position.y = 1.36; head.castShadow = true;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.66, 9),
      new THREE.MeshStandardMaterial({ color: T.dark, roughness: 0.95 }));
    hat.position.y = 1.74; hat.castShadow = true;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.05, 10),
      new THREE.MeshStandardMaterial({ color: T.dark, roughness: 0.95 }));
    brim.position.y = 1.5;
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.5, 6), matFor('woodF', 1, 1));
    staff.position.set(0.42, 0.85, 0.12); staff.castShadow = true;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: T.glow }));
    tip.position.set(0.42, 1.66, 0.12);
    tip.add(glow(T.glow, 1.3, 0.6));
    const plight = new THREE.PointLight(T.glowLight, 0.55 * LIGHT_SCALE, 7, 2); plight.position.y = 1.7;
    g.add(robe, belt, head, hat, brim, staff, tip, plight);
    staffPart = staff; robePart = robe;
  }
  return { g, parts: { staff: staffPart, robe: robePart } };
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
  S.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  S.shieldMesh.visible = false;
  S.scene.add(S.shieldMesh);
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
  p2.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  p2.shieldMesh.visible = false;
  S.scene.add(p2.shieldMesh);
  if (G.hasWings) p2.wings = mkWings(g);
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
  if (p.pos.y < -40) {
    p.pos.set(G.checkpoint.x + 1.5, G.checkpoint.y, G.checkpoint.z);
    p.vel.set(0, 0, 0);
    hurtP2(20, null);
    showMsg('Le vide recrache le second porteur près du sanctuaire...', 3);
  }
  p.mesh.position.copy(p.pos);
  const bob = (p.grounded && ml > 0.05) ? Math.abs(Math.sin(p.walkT * 1.6)) * 0.06 : 0;
  p.mesh.position.y = p.pos.y + bob;
  p.parts.staff.rotation.x = Math.sin(p.walkT * 1.6) * 0.14 * (ml > 0.05 ? 1 : 0);
  p.parts.robe.rotation.z = Math.sin(p.walkT * 1.6) * 0.05 * (ml > 0.05 ? 1 : 0);
  if (ml > 0.05 || p.dashT > 0) {
    const ty = Math.atan2(vx, vz);
    p.mesh.rotation.y = lerpAngle(p.mesh.rotation.y, ty, 12 * dt);
  }
  if (p.wings) {
    const flap = p.grounded ? 0.5 : 0.9 + Math.sin(G.time * 10) * 0.35;
    p.wings[0].rotation.y = 0.6 * flap;
    p.wings[1].rotation.y = -0.6 * flap;
  }
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
/* Caméra du Joueur 2 (troisième personne, occlusion identique au J1) */
export function updateCamera2() {
  if (!p2.pos) return;
  const tx = p2.pos.x, ty = p2.pos.y + 1.6, tz = p2.pos.z;
  const dir = camDirVec2();
  let d = 5.4;
  const back = { x: -dir.x, y: -dir.y, z: -dir.z };
  const eye = { x: tx, y: ty, z: tz };
  let closest = d;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!c.on) continue;
    const t = rayAABB(eye, back, c.min, c.max);
    if (t !== null && t < closest) closest = t;
  }
  d = Math.max(1.4, Math.min(d, closest - 0.35));
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
  let speed = (sprint ? 9.5 : 5.8) * (PATHS[G.path].move || 1) * (G.hasteT > 0 ? 1.2 : 1);
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
  if (p.pos.y < -40) {
    p.pos.set(G.checkpoint.x, G.checkpoint.y, G.checkpoint.z); p.vel.set(0, 0, 0);
    hurt(20, null);
    showMsg('Le vide vous recrache près de la fontaine...', 3);
  }
  // mesh + animation de marche
  p.mesh.position.copy(p.pos);
  const bob = (p.grounded && ml > 0) ? Math.abs(Math.sin(p.walkT * 1.6)) * 0.06 : 0;
  p.mesh.position.y = p.pos.y + bob;
  p.parts.staff.rotation.x = Math.sin(p.walkT * 1.6) * 0.14 * (ml > 0 ? 1 : 0);
  p.parts.robe.rotation.z = Math.sin(p.walkT * 1.6) * 0.05 * (ml > 0 ? 1 : 0);
  if (ml > 0.01 || p.dashT > 0) {
    const ty = Math.atan2(vx, vz);
    p.mesh.rotation.y = lerpAngle(p.mesh.rotation.y, ty, 12 * dt);
  }
  if (p.mixer) p.mixer.update(dt);
  G.mana = Math.min(G.maxMana, G.mana + (hasN('g_wis') ? 10 : 6) * dt);
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

/* ---------------- CAMÉRA ---------------- */
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
  if (player.wings) {
    const flap = player.grounded ? 0.5 : 0.9 + Math.sin(G.time * 10) * 0.35;
    player.wings[0].rotation.y = 0.6 * flap;
    player.wings[1].rotation.y = -0.6 * flap;
  }
  if (G.firstPerson) {
    player.mesh.visible = false;
    S.camera.position.set(tx, player.pos.y + 1.55, tz);
    S.camera.lookAt(tx + dir.x, player.pos.y + 1.55 + dir.y, tz + dir.z);
    S.camKick = Math.max(0, S.camKick - 0.12);
    return;
  }
  player.mesh.visible = true;
  let d = 5.4 + S.camKick * 4; // léger recul de la caméra au lancement d'un sort
  // Auto-adaptation : si un mur/pilier se trouve entre le joueur et la caméra désirée, on rapproche la caméra
  const back = { x: -dir.x, y: -dir.y, z: -dir.z };
  const eye = { x: tx, y: ty, z: tz };
  let closest = d;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!c.on) continue;
    const t = rayAABB(eye, back, c.min, c.max);
    if (t !== null && t < closest) closest = t;
  }
  d = Math.max(1.4, Math.min(d, closest - 0.35));
  S.camera.position.set(tx - dir.x * d, ty - dir.y * d, tz - dir.z * d);
  if (S.camera.position.y < player.pos.y + 0.35) S.camera.position.y = player.pos.y + 0.35;
  S.camera.lookAt(tx, ty, tz);
  S.camKick = Math.max(0, S.camKick - 0.12);
}

/* ---------------- DÉGÂTS ---------------- */
export function hurt(d, src) {
  if (player.invuln > 0 || G.shieldT > 0) return;
  player.invuln = 0.5;
  if (G.path === 'paladin' && hasN('p_guard')) d = Math.round(d * 0.75); // Peau de pierre
  G.hp -= d; G.vig = 1;
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
    G.hp = Math.floor(G.maxHp * 0.6);
    G.mana = G.maxMana;
    player.pos.set(G.checkpoint.x, G.checkpoint.y, G.checkpoint.z); player.vel.set(0, 0, 0);
    if (S.tkHeld) tkToggle();
    A.die();
    showMsg('Les ombres vous ont submergé... Vous rouvrez les yeux près de la fontaine.', 4.5);
  }
}
export function hurtP2(d, src) {
  if (p2.invuln > 0 || p2.shieldT > 0) return;
  p2.invuln = 0.5;
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
    showMsg('Le second porteur de flamme a été submergé... Il se relève au sanctuaire.', 4);
  }
}
export function healSelf() {
  A.pickup();
  G.hp = Math.min(G.maxHp, G.hp + 40);
  spawnBurst(player.pos.x, player.pos.y + 1.2, player.pos.z, 0x9fffb0, 16);
}
