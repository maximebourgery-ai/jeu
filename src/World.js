/* ================================================================
   MONDE — scène, rendu (bloom), collisions, décor, objets, portes,
   particules, interactions, construction du château & Terres Perdues.
   ================================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  G, S, IS_TOUCH, POWERS, QUESTS, HINTS, tut, STEP_HEIGHT, LIGHT_SCALE,
  colliders, doors, pickups, inter, enemies, spinners, flames, parts,
  tkCubes, pedestals, PLATE, player, p2
} from './state.js';
import { assets, matFor, glow, modelClone, applyEnvironment } from './AssetManager.js';
import { A } from './Audio.js';
import { $, showMsg, refreshPowers } from './UI.js';
import { questReach, openDialog } from './Quests.js';
import { mkEnemy } from './Enemies.js';

/* ---------------- SCÈNE ---------------- */
export function initScene() {
  S.scene = new THREE.Scene();
  S.scene.fog = new THREE.FogExp2(0x0b1024, 0.0135);
  S.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 500);
  S.cam2 = new THREE.PerspectiveCamera(70, (innerWidth / 2) / innerHeight, 0.1, 500);
  S.renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH });
  S.renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.25 : 1.75));
  S.renderer.setSize(innerWidth, innerHeight);
  S.renderer.shadowMap.enabled = true;
  S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  S.renderer.outputColorSpace = THREE.SRGBColorSpace;
  S.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  S.renderer.toneMappingExposure = 1.05;
  document.body.insertBefore(S.renderer.domElement, document.body.firstChild);
  S.clock = new THREE.Clock();

  /* Post-processing : bloom (UnrealBloomPass) pour les effets magiques.
     Utilisé pour le rendu solo ; le mode coop écran scindé garde le rendu
     scissor multi-caméra direct (voir loop() dans main.js). */
  S.composer = new EffectComposer(S.renderer);
  S.renderPass = new RenderPass(S.scene, S.camera);
  S.bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.4, 0.85);
  S.composer.addPass(S.renderPass);
  S.composer.addPass(S.bloomPass);
  S.composer.addPass(new OutputPass());

  S.scene.add(new THREE.HemisphereLight(0x2a3c68, 0x0a0b14, 0.85));
  S.scene.add(new THREE.AmbientLight(0x181c30, 0.8));
  S.dirLight = new THREE.DirectionalLight(0x9fb4f0, 0.85);
  S.dirLight.position.set(70, 110, -50);
  S.dirLight.castShadow = true;
  S.dirLight.shadow.mapSize.set(2048, 2048);
  S.dirLight.shadow.camera.near = 20;
  S.dirLight.shadow.camera.far = 320;
  S.dirLight.shadow.camera.left = -95;
  S.dirLight.shadow.camera.right = 95;
  S.dirLight.shadow.camera.top = 95;
  S.dirLight.shadow.camera.bottom = -95;
  S.dirLight.shadow.bias = -0.0006;
  const tgt = new THREE.Object3D(); tgt.position.set(10, 0, 25);
  S.scene.add(tgt); S.dirLight.target = tgt;
  S.scene.add(S.dirLight);

  /* Environnement HDRI (RGBELoader + PMREM) si un .hdr est présent ;
     sinon, ciel nocturne d'origine (dégradé) + éclairage de base conservé. */
  const hasEnv = applyEnvironment(S.renderer, S.scene);
  if (!hasEnv) {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 16, 12),
      new THREE.MeshBasicMaterial({ map: assets.skyTex, side: THREE.BackSide, fog: false }));
    S.scene.add(sky);
  }
  // lune + halo
  const moon = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xe8f0ff, fog: false }));
  moon.position.set(120, 140, -180);
  moon.add(glow(0xbdd0ff, 70, 0.55));
  S.scene.add(moon);
  // étoiles
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(1500);
  for (let i = 0; i < 500; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.48;
    sp[i * 3] = Math.cos(th) * Math.sin(ph) * 360;
    sp[i * 3 + 1] = Math.cos(ph) * 360;
    sp[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * 360;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  S.scene.add(new THREE.Points(starGeo,
    new THREE.PointsMaterial({ color: 0xbcd0ff, size: 1.3, sizeAttenuation: false, fog: false })));

  // balise d'objectif
  S.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 44, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  S.beacon.position.y = 22; S.beacon.visible = false;
  S.scene.add(S.beacon);

  addEventListener('resize', () => {
    setCamAspects();
    S.renderer.setSize(innerWidth, innerHeight);
    S.composer.setSize(innerWidth, innerHeight);
  });
}
export function setCamAspects() {
  S.camera.aspect = (S.COOP ? innerWidth / 2 : innerWidth) / innerHeight;
  S.camera.updateProjectionMatrix();
  S.cam2.aspect = (innerWidth / 2) / innerHeight;
  S.cam2.updateProjectionMatrix();
}

/* ---------------- GÉOMÉTRIE & COLLISIONS ---------------- */
export function mkBox(w, h, d, x, y, z, kind, solid) {
  const mat = (typeof kind === 'string') ? matFor(kind, Math.max(w, d) / 3, (h > 1.2 ? h : Math.max(w, d)) / 3) : kind;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  S.scene.add(m);
  if (solid !== false) addCol(m);
  return m;
}
export function mkCyl(r1, r2, h, x, y, z, kind, solid, seg) {
  const mat = (typeof kind === 'string') ? matFor(kind, 2, Math.max(1, h / 3)) : kind;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg || 9), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  S.scene.add(m);
  if (solid !== false) addCol(m);
  return m;
}
export function addCol(m) {
  m.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(m);
  const c = { min: b.min.clone(), max: b.max.clone(), on: true };
  colliders.push(c);
  return c;
}
export function overlapP(pl, c) {
  const p = pl.pos, r = 0.42, h = 1.7;
  return c.on &&
    p.x + r > c.min.x && p.x - r < c.max.x &&
    p.y + h > c.min.y && p.y < c.max.y &&
    p.z + r > c.min.z && p.z - r < c.max.z;
}
export function slide(axis, delta) { slideP(player, axis, delta); }
export function slideP(pl, axis, delta) {
  if (delta === 0) return;
  const p = pl.pos, r = 0.42, h = 1.7;
  p[axis] += delta;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!overlapP(pl, c)) continue;
    if (axis === 'y') {
      if (delta < 0) { p.y = c.max.y; pl.vel.y = 0; pl.grounded = true; }
      else { p.y = c.min.y - h; pl.vel.y = Math.min(0, pl.vel.y); }
    } else {
      // Rattrapage de rebord : si le sommet de l'obstacle est à portée de pas
      // (à pied ou en plein saut) et qu'il y a de la place au-dessus, on grimpe dessus.
      const stepY = c.max.y;
      const canMantle = (stepY - p.y) <= STEP_HEIGHT && !pointSolid(p.x, stepY + 0.05, p.z) && !pointSolid(p.x, stepY + h * 0.6, p.z);
      if (canMantle) {
        p.y = stepY;
        pl.vel.y = Math.max(pl.vel.y, 0);
        pl.grounded = true;
      } else {
        p[axis] = delta > 0 ? c.min[axis] - r - 0.001 : c.max[axis] + r + 0.001;
      }
    }
  }
}
// Test rayon/boîte (slab method) : renvoie la distance du premier contact ou null
export function rayAABB(o, d, min, max) {
  let tmin = 0, tmax = 1e9;
  for (const ax of ['x', 'y', 'z']) {
    const inv = 1 / (d[ax] || 1e-9);
    let t1 = (min[ax] - o[ax]) * inv, t2 = (max[ax] - o[ax]) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin >= 0 ? tmin : null;
}
export function pointSolid(x, y, z) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.on && x > c.min.x && x < c.max.x && y > c.min.y && y < c.max.y && z > c.min.z && z < c.max.z) return true;
  }
  return false;
}

/* ---------------- PORTES ---------------- */
export function mkDoor(w, h, d, x, y, z, kind) {
  const m = mkBox(w, h, d, x, y, z, kind, true);
  const dr = { mesh: m, col: colliders[colliders.length - 1], open: false, baseY: m.position.y, lift: h - 0.35, t: 0 };
  doors.push(dr);
  return dr;
}
export function openDoor(dr) {
  if (dr.open) return;
  dr.open = true; dr.col.on = false; A.door();
}
export function updateDoors(dt) {
  for (const d of doors) {
    if (d.open && d.t < 1) {
      d.t = Math.min(1, d.t + dt * 0.45);
      d.mesh.position.y = d.baseY + d.t * d.lift;
    }
  }
}

/* ---------------- DÉCOR ---------------- */
export function torch(x, y, z, color, intensity, dist) {
  const g = new THREE.Group();
  /* Si un modèle torch.glb est fourni, il remplace le support en bois ;
     la flamme, le halo et la lumière restent gérés par le code (flicker). */
  const glb = modelClone('torch');
  const stick = glb || new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 6), matFor('woodF', 1, 1));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6),
    new THREE.MeshBasicMaterial({ color: color || 0xffc06a }));
  flame.position.y = 0.62;
  const halo = glow(color || 0xff9c4a, 2.6, 0.5);
  halo.position.y = 0.66;
  const light = new THREE.PointLight(color || 0xff8c3a, (intensity || 1.35) * LIGHT_SCALE, dist || 20, 2);
  light.position.y = 0.72;
  g.add(stick, flame, halo, light);
  g.position.set(x, y, z);
  S.scene.add(g);
  flames.push({ flame, light, halo, base: (intensity || 1.35) * LIGHT_SCALE, seed: Math.random() * 10 });
}
export function tree(x, z, s) {
  s = s || 1;
  const glb = modelClone('tree');
  if (glb) {
    glb.position.set(x, 0, z);
    glb.scale.setScalar(s);
    S.scene.add(glb);
    // collision identique à l'original (tronc), le visuel primitif est masqué
    const trunk = mkCyl(0.2 * s, 0.3 * s, 1.6 * s, x, 0, z, 'trunk', true, 7);
    trunk.visible = false;
    return;
  }
  mkCyl(0.2 * s, 0.3 * s, 1.6 * s, x, 0, z, 'trunk', true, 7);
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.5 * s, 2.6 * s, 8), matFor('leaf', 1, 1));
  c1.position.set(x, 2.5 * s, z); c1.castShadow = true; S.scene.add(c1);
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.1 * s, 2.1 * s, 8), matFor('leaf', 1, 1));
  c2.position.set(x, 3.6 * s, z); c2.castShadow = true; S.scene.add(c2);
}
export function pedestal(x, z, y, powerId, color, lore, questId) {
  mkBox(1.3, 1.1, 1.3, x, y, z, 'stoneR');
  const cry = new THREE.Mesh(new THREE.OctahedronGeometry(0.34),
    new THREE.MeshBasicMaterial({ color }));
  cry.position.set(x, y + 1.75, z);
  cry.add(glow(color, 2.4, 0.6));
  S.scene.add(cry); spinners.push(cry);
  pedestals.push({ powerId, cry });
  const pw = POWERS.find(p => p.id === powerId);
  addInter(x, y, z, 2.5, 'Recueillir « ' + pw.name + ' »', it => {
    it.on = false; S.scene.remove(cry);
    const idx = spinners.indexOf(cry); if (idx >= 0) spinners.splice(idx, 1);
    G.powers[powerId] = true; G.sel = powerId;
    A.power(); refreshPowers();
    spawnBurst(x, y + 1.6, z, color, 18);
    showMsg(lore, 5.5);
    if (questId) questReach(questId);
  });
}

/* ---------------- OBJETS À RAMASSER ---------------- */
export function addPickup(type, x, y, z) {
  let mesh;
  if (type === 'crystal') {
    mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.42),
      new THREE.MeshBasicMaterial({ color: 0xffd97a }));
    mesh.add(glow(0xffd97a, 3.4, 0.7));
    const l = new THREE.PointLight(0xffc86a, 0.9 * LIGHT_SCALE, 9, 2);
    mesh.add(l);
  } else if (type === 'key') {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 12), matFor('gold', 1, 1));
    const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), matFor('gold', 1, 1));
    tige.position.y = -0.35;
    g.add(ring, tige, glow(0xffd97a, 1.8, 0.5));
    mesh = g;
  } else if (type === 'mana') {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x5fc8ff }));
    mesh.add(glow(0x5fc8ff, 1.7, 0.6));
  } else if (type === 'heart') {
    mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.24),
      new THREE.MeshBasicMaterial({ color: 0xff5566 }));
    mesh.add(glow(0xff5566, 1.6, 0.55));
  } else if (type === 'herb') {
    mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0),
      new THREE.MeshBasicMaterial({ color: 0x6fe07a }));
    mesh.add(glow(0x6fe07a, 1.6, 0.5));
  } else if (type === 'shadow') {
    mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.24),
      new THREE.MeshBasicMaterial({ color: 0x9a6cff }));
    mesh.add(glow(0x7a4cdd, 1.8, 0.55));
  } else {
    mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.36),
      new THREE.MeshBasicMaterial({ color: 0xff8899 }));
    mesh.add(glow(0xff8899, 2.4, 0.6));
  }
  mesh.position.set(x, y + 0.9, z);
  S.scene.add(mesh);
  pickups.push({ mesh, type, y0: y + 0.9, taken: false });
}
export function updatePickups(dt) {
  for (const p of pickups) {
    if (p.taken) continue;
    p.mesh.rotation.y += dt * 1.8;
    p.mesh.position.y = p.y0 + Math.sin(G.time * 2.4 + p.y0) * 0.14;
    const byP1 = player.pos.distanceTo(p.mesh.position) < 1.6;
    const byP2 = S.COOP && p2.pos && p2.pos.distanceTo(p.mesh.position) < 1.6;
    if (byP1 || byP2) {
      const collector = byP1 ? player : p2;
      p.taken = true; S.scene.remove(p.mesh);
      if (p.type === 'crystal') {
        G.crystals++; A.power();
        spawnBurst(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0xffd97a, 20);
        showMsg('Larme d\'Aube recueillie — ' + G.crystals + ' / 3', 4);
        if (QUESTS[S.questI] && QUESTS[S.questI].id === 'tears')
          $('objective').textContent = '✧ Objectif — Réunissez les 3 Larmes d\'Aube (' + G.crystals + ' / 3). Lumen connaît peut-être des secrets...';
        if (G.crystals >= 3) setTimeout(winGame, 1400);
        G.checkpoint = { x: collector.pos.x, y: collector.pos.y, z: collector.pos.z };
      } else if (p.type === 'herb') {
        G.herbs++; A.pickup();
        showMsg('Herbe lunaire cueillie (☘ ' + G.herbs + '). H : potion de soin (2 herbes).', 2.2);
      } else if (p.type === 'shadow') {
        G.shadows++; A.pickup();
        showMsg('Essence d\'ombre absorbée (● ' + G.shadows + '). O : forger un orbe (3 essences).', 2.2);
      } else if (p.type === 'key') {
        G.goldKey = true; A.key();
        showMsg('Vous trouvez la Clef d\'or. Une serrure dorée l\'attend quelque part...', 4.5);
        questReach('crypt');
      } else if (p.type === 'mana') {
        if (byP1) G.mana = Math.min(G.maxMana, G.mana + 35);
        else p2.mana = Math.min(p2.maxMana, p2.mana + 35);
        A.pickup();
      } else if (p.type === 'heart') {
        if (byP1) G.hp = Math.min(G.maxHp, G.hp + 30);
        else p2.hp = Math.min(p2.maxHp, p2.hp + 30);
        A.pickup();
      } else {
        G.maxHp += 25; G.hp = G.maxHp; A.power();
        G.items.push('Fragment de vitalité (+25 PV max)');
        showMsg('Secret découvert : Fragment de vitalité ! Votre vie maximale augmente.', 4.5);
      }
    }
  }
}

/* ---------------- INTERACTIONS ---------------- */
export function addInter(x, y, z, r, label, fn) { inter.push({ x, y, z, r, label, fn, on: true }); }
export function nearInterP(pl) {
  for (const i of inter) {
    if (!i.on) continue;
    if (Math.hypot(pl.pos.x - i.x, pl.pos.z - i.z) < i.r && Math.abs(pl.pos.y - i.y) < 2.8) return i;
  }
  return null;
}
export function nearInter() {
  const a = nearInterP(player);
  if (a) return a;
  if (S.COOP && p2.pos) return nearInterP(p2);
  return null;
}
export function tryInteractP2() {
  if (!G.started || G.paused || G.inv || G.over || G.dialog) return;
  const it = nearInterP(p2);
  if (it) it.fn(it);
}
export function tryInteract() {
  if (!G.started || G.paused || G.inv || G.over || G.dialog) return;
  const it = nearInter();
  if (it) it.fn(it);
}

/* ---------------- PARTICULES ---------------- */
export function spawnBurst(x, y, z, color, n) {
  for (let i = 0; i < n; i++) {
    let p = parts.find(q => q.life <= 0);
    if (!p) {
      if (parts.length > 90) break;
      p = { mesh: new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13),
        new THREE.MeshBasicMaterial({ color: 0xffffff })), vel: new THREE.Vector3(), life: 0 };
      S.scene.add(p.mesh); parts.push(p);
    }
    p.mesh.material.color.setHex(color);
    p.mesh.position.set(x, y, z);
    p.mesh.visible = true;
    p.mesh.scale.setScalar(1);
    p.vel.set((Math.random() - 0.5) * 7, Math.random() * 5 + 1.5, (Math.random() - 0.5) * 7);
    p.life = 0.55 + Math.random() * 0.25;
  }
}
export function updateParticles(dt) {
  for (const p of parts) {
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.life -= dt;
    p.vel.y -= 11 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.scale.setScalar(Math.max(0.05, p.life * 1.6));
    if (p.life <= 0) p.mesh.visible = false;
  }
}

/* ---------------- CUBES RUNIQUES ---------------- */
export function mkTkCube(x, y, z) {
  const m = mkBox(1.1, 1.1, 1.1, x, y, z, 'rune', false);
  const col = { min: new THREE.Vector3(), max: new THREE.Vector3(), on: true };
  colliders.push(col);
  const c = { mesh: m, col, half: 0.55, vel: 0, held: false };
  tkCubes.push(c);
  syncCube(c);
  return c;
}
export function syncCube(c) {
  const p = c.mesh.position, h = c.half;
  c.col.min.set(p.x - h, p.y - h, p.z - h);
  c.col.max.set(p.x + h, p.y + h, p.z + h);
  c.col.on = !c.held;
}

/* ---------------- DÉGÂTS & VICTOIRE ---------------- */
export function winGame() {
  if (G.over) return;
  G.over = true;
  if (document.exitPointerLock) document.exitPointerLock();
  $('win').classList.remove('hidden');
}

/* ================================================================
   CONSTRUCTION DU MONDE
   ================================================================ */
export function buildWorld() {
  /* sol (4 dalles, trou pour l'escalier des cryptes x35..45 z6..12) */
  mkBox(220, 1, 106, 0, -1, -47, 'grass');
  mkBox(220, 1, 88, 0, -1, 56, 'grass');
  mkBox(135, 1, 6, -32.5, -1, 9, 'grass');
  mkBox(55, 1, 6, 72.5, -1, 9, 'grass');

  /* sols intérieurs décoratifs */
  mkBox(30, 0.07, 30, 0, 0.01, 15, 'slab', false);
  mkBox(20, 0.07, 20, -25, 0.01, 15, 'slabW', false);
  mkBox(20, 0.07, 20, 25, 0.01, 15, 'slab', false);
  mkBox(16, 0.07, 16, 0, 0.01, -8, 'slabR', false);
  mkBox(4, 0.06, 28, 0, 0.02, 45, 'path', false);
  mkBox(3.4, 0.05, 26, 0, 0.09, 16, 'cloth', false); // tapis du hall

  /* ----- GRAND HALL ----- */
  mkBox(13, 9, 1, -9.5, 0, 30.5, 'stone');
  mkBox(13, 9, 1, 9.5, 0, 30.5, 'stone');
  mkBox(6, 5, 1, 0, 4, 30.5, 'stone');
  mkBox(13, 9, 1, -8.5, 0, -0.5, 'stone');
  mkBox(13, 9, 1, 8.5, 0, -0.5, 'stone');
  mkBox(4, 5, 1, 0, 4, -0.5, 'stone');
  mkBox(1, 9, 14, -15.5, 0, 6, 'stone');
  mkBox(1, 9, 14, -15.5, 0, 24, 'stone');
  mkBox(1, 5, 4, -15.5, 4, 15, 'stone');
  mkBox(1, 9, 14, 15.5, 0, 6, 'stone');
  mkBox(1, 9, 14, 15.5, 0, 24, 'stone');
  mkBox(1, 5, 4, 15.5, 4, 15, 'stone');
  [[-16, 30.5], [16, 30.5], [-16, -0.5], [16, -0.5]].forEach(([tx, tz]) => {
    mkCyl(1.7, 2, 12, tx, 0, tz, 'stoneD', true, 9);
    const c = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.6, 9), matFor('slabR', 2, 2));
    c.position.set(tx, 13.3, tz); c.castShadow = true; S.scene.add(c);
  });
  [[-8, 10], [8, 10], [-8, 20], [8, 20]].forEach(([cx, cz]) => {
    mkCyl(0.7, 0.85, 9, cx, 0, cz, 'stoneR', true, 9);
  });
  // bannières
  [[-8, 10], [8, 10], [-8, 20], [8, 20]].forEach(([bx, bz]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.4, 0.06), matFor('cloth', 1, 1));
    b.position.set(bx, 6, bz + 0.8);
    b.castShadow = true; S.scene.add(b);
  });
  torch(-14.6, 2, 8); torch(-14.6, 2, 22); torch(14.6, 2, 8); torch(14.6, 2, 22);
  torch(-4.4, 2, 31.4); torch(4.4, 2, 31.4);

  // levier -> bibliothèque
  mkBox(0.8, 1, 0.8, 13, 0, 25, 'iron');
  S.leverHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), matFor('wood', 1, 1));
  S.leverHandle.position.set(13, 1.45, 25);
  S.leverHandle.rotation.x = -0.8;
  S.leverHandle.castShadow = true;
  S.scene.add(S.leverHandle);
  addInter(13, 0, 25, 2.3, 'Actionner le levier', it => {
    it.on = false; S.leverHandle.rotation.x = 0.8;
    A.lever(); openDoor(S.libDoor);
    showMsg('Un grondement traverse les murs : la porte de la bibliothèque s\'ouvre à l\'ouest.', 4);
    questReach('lever');
  });

  // porte du trône (verrouillée)
  S.throneDoor = mkDoor(4, 4, 1.2, 0, 0, -0.5, 'gold');
  addInter(0, 0, 1.6, 2.6, 'Ouvrir la porte scellée', it => {
    if (G.goldKey) {
      it.on = false; openDoor(S.throneDoor);
      showMsg('La Clef d\'or tourne dans la serrure... La salle du trône vous est ouverte.', 4);
      questReach('throne');
    } else {
      showMsg('Une serrure d\'or scelle cette porte. Il vous faut la clef.', 2.6);
    }
  });

  /* ----- BIBLIOTHÈQUE ----- */
  mkBox(1, 8, 22, -35.5, 0, 15, 'stone');
  mkBox(7, 8, 1, -31.5, 0, 4.5, 'stone');
  mkBox(10, 8, 1, -20, 0, 4.5, 'stone');
  mkBox(3, 4.5, 1, -26.5, 3.5, 4.5, 'stone');
  mkBox(20, 8, 1, -25, 0, 25.5, 'stone');
  S.libDoor = mkDoor(1.2, 4, 4.4, -15.5, 0, 15, 'woodD');
  mkBox(3, 3.4, 0.7, -26.5, 0, 4.85, 'woodF', false); // fausse étagère
  mkBox(1, 6, 6, -30.5, 0, 1.7, 'stone');
  mkBox(1, 6, 6, -23.5, 0, 1.7, 'stone');
  mkBox(8, 6, 1, -27, 0, -1.3, 'stone');
  addPickup('maxhp', -27, 0.2, 1.6);
  mkBox(3, 1.5, 1, -17.6, 0, 24.4, 'wood');
  mkBox(3, 3.1, 1, -21.4, 0, 24.4, 'wood');
  mkBox(3, 4.7, 1, -25.2, 0, 24.4, 'wood');
  mkBox(3, 6.2, 1, -29.2, 0, 24.4, 'wood');
  mkBox(2.2, 0.4, 10, -34.3, 6.6, 19.5, 'stoneD');
  pedestal(-34.3, 16.5, 7, 'dash', 0x9fe8ff,
    'Pas du vent appris ! (touche 2, puis clic) Un élan fulgurant qui franchit les gouffres.', 'dash');
  mkBox(1.2, 3, 7, -22, 0, 11, 'wood');
  mkBox(1.2, 3, 7, -27, 0, 11, 'wood');
  mkBox(1.2, 3, 7, -32, 0, 11, 'wood');
  torch(-25, 2, 15, 0xffa04a, 1.15, 17);
  addPickup('mana', -19, 0, 8);

  /* ----- AILE EST ----- */
  mkBox(20, 8, 1, 25, 0, 4.5, 'stone');
  mkBox(20, 8, 1, 25, 0, 25.5, 'stone');
  mkBox(1, 8, 2, 35.5, 0, 6, 'stone');
  mkBox(1, 8, 14, 35.5, 0, 18, 'stone');
  mkBox(1, 4, 4, 35.5, 4, 9, 'stone');
  mkBox(2.6, 0.12, 2.6, PLATE.x, 0.02, PLATE.z, 'stoneD', false);
  PLATE.glow = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 2.2),
    new THREE.MeshBasicMaterial({ color: 0x3a4880 }));
  PLATE.glow.position.set(PLATE.x, 0.14, PLATE.z);
  S.scene.add(PLATE.glow);
  mkTkCube(20, 0, 8);
  addInter(20, 0, 8, 2.2, 'Examiner le bloc runique', () => {
    if (G.powers.tk) showMsg('Le bloc vibre doucement. La Main céleste peut le porter (touche 3, puis clic).', 3.5);
    else showMsg('Un bloc gravé de runes, bien trop lourd pour vos bras. Seule une force céleste pourrait le soulever...', 4);
  });
  addInter(25, 0, 16, 2.4, 'Examiner la plaque gravée', () => {
    showMsg('« Que le poids des runes ouvre la voie des morts. » La plaque attend une charge.', 3.5);
  });
  torch(25, 2, 5.2, 0xffa04a, 1.15, 17);
  addPickup('heart', 31, 0, 22);
  S.basementDoor = mkDoor(1.2, 4, 4, 35.5, 0, 9, 'stoneD');

  /* ----- ESCALIER + CRYPTES ----- */
  /* Palier d'entrée : comble l'interstice x 35→36 entre le seuil de la
     porte et la première marche (le joueur y tombait dans le vide). */
  mkBox(1.6, 0.5, 4, 35.7, -1.1, 9, 'stoneD');
  for (let i = 0; i < 10; i++) {
    mkBox(1.0, 0.5, 4, 36.5 + i * 0.95, -0.6 * (i + 1) - 0.5, 9, 'stoneD');
  }
  mkBox(10, 7, 1, 40.5, -7, 6, 'stoneD');
  mkBox(10, 7, 1, 40.5, -7, 11.9, 'stoneD');
  /* Grille de fer au-dessus de la partie profonde de l'escalier uniquement :
     l'entrée (x<39.4) reste dégagée pour laisser passer le joueur (1.7 de haut).
     Avant : la grille couvrait tout l'escalier et bloquait la descente. */
  mkBox(6.1, 0.35, 4.4, 42.45, 0.02, 9, 'iron');
  mkBox(25, 1, 24, 57.5, -7, 12, 'slab');
  mkBox(25, 5, 1, 57.5, -6, -0.5, 'stoneD');
  mkBox(25, 5, 1, 57.5, -6, 24.5, 'stoneD');
  mkBox(1, 5, 26, 70.5, -6, 12, 'stoneD');
  mkBox(1, 5, 7, 44.5, -6, 3.5, 'stoneD');
  mkBox(1, 5, 13, 44.5, -6, 17.5, 'stoneD');
  mkBox(25, 0.3, 24, 57.5, -1.45, 12, 'woodF', false);
  [[52, 6], [52, 18], [62, 6], [62, 18]].forEach(([px, pz]) => {
    mkCyl(0.6, 0.75, 5, px, -6, pz, 'stoneR', true, 8);
  });
  torch(47, -4.4, 2, 0x66a8ff, 1.25, 18);
  torch(67, -4.4, 22, 0x66a8ff, 1.25, 18);
  pedestal(48, 20, -6, 'shield', 0x9fc8ff,
    'Égide apprise ! (touche 4, puis clic) Un voile de lumière qui absorbe les coups des ombres.');
  addPickup('key', 67, -6, 6);
  addPickup('crystal', 67, -6, 17);
  addPickup('heart', 50, -6, 4);
  pedestal(57, 4, -6, 'heal', 0x9fffc0, 'Bénédiction apprise ! (touche 6, puis clic) Une lumière chaude qui referme vos blessures.');
  addPickup('mana', 58, -6, 20);
  mkBox(1.2, 1.2, 1.2, 55, -6, 3, 'wood');
  mkBox(1.2, 1.2, 1.2, 56.3, -6, 3.4, 'wood');
  mkBox(1.2, 1.2, 1.2, 55.6, -4.8, 3.2, 'wood');

  /* ----- SALLE DU TRÔNE ----- */
  mkBox(6.5, 9, 1, -5.75, 0, -16.5, 'stone');
  mkBox(6.5, 9, 1, 5.75, 0, -16.5, 'stone');
  mkBox(18, 1.6, 1, 0, 7.4, -16.5, 'stone'); // linteau au-dessus du passage scellé
  mkBox(1, 9, 16, -8.5, 0, -8, 'stone');
  mkBox(1, 9, 16, 8.5, 0, -8, 'stone');
  mkBox(6, 0.5, 4, 0, 0, -12.8, 'stoneR');
  mkBox(4, 0.5, 2.6, 0, 0.5, -13.4, 'stoneR');
  mkBox(2, 3, 0.8, 0, 1, -14.6, 'stoneR');
  mkBox(0.5, 1.6, 0.8, -1.2, 1, -14.2, 'stoneR');
  mkBox(0.5, 1.6, 0.8, 1.2, 1, -14.2, 'stoneR');
  torch(0, 3.4, -15.8, 0xff6a3a, 1.35, 20);
  addPickup('crystal', 0, 1.9, -13.4);
  S.beyondDoor = mkDoor(2.6, 7.4, 1, 0, 0, -16.5, 'rune');
  addInter(0, 0, -16.9, 2.7, 'Franchir le passage scellé', it => {
    if (G.crystals >= 3) {
      it.on = false; openDoor(S.beyondDoor);
      showMsg('Les trois Larmes réunies font vibrer la pierre... un passage s\'ouvre vers les Terres Perdues.', 4.5);
    } else {
      showMsg('Ce passage ne cédera qu\'une fois les 3 Larmes d\'Aube réunies (' + G.crystals + ' / 3).', 3);
    }
  });
  buildOpenWorld();

  /* ----- TOUR DU LEVANT ----- */
  mkBox(10, 26, 1, 45, 0, 45.5, 'stone');
  mkBox(1, 26, 8, 49.5, 0, 50, 'stone');
  mkBox(1, 26, 8, 40.5, 0, 50, 'stone');
  mkBox(3.5, 26, 1, 41.75, 0, 54.5, 'stone');
  mkBox(3.5, 26, 1, 48.25, 0, 54.5, 'stone');
  mkBox(3, 22, 1, 45, 4, 54.5, 'stone');
  const plat = (x, y, z) => mkBox(2, 0.35, 2, x, y, z, 'stoneD');
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * 1.1 - i * 0.78;
    plat(45 + Math.cos(a) * 2.9, 1.4 + i * 1.35, 50 + Math.sin(a) * 2.9);
  }
  plat(47.6, 11.0, 52.9);
  for (let i = 0; i < 7; i++) {
    const a = 0.42 - i * 0.78;
    plat(45 + Math.cos(a) * 2.9, 12.4 + i * 1.35, 50 + Math.sin(a) * 2.9);
  }
  mkBox(8, 0.5, 6, 45, 22.6, 47.6, 'stone');
  pedestal(45, 48.5, 23.1, 'tk', 0xc8a8ff,
    'Main céleste apprise ! (touche 3, puis clic) Saisissez les blocs runiques par la pensée.', 'tower');
  addPickup('mana', 43, 23.1, 46.5);
  torch(45, 1, 56, 0xffa04a, 1.15, 16);
  addInter(45, 0, 52.5, 2.8, 'Lire la stèle de la tour', () => {
    showMsg('« Seul le vent franchit ce que la pierre refuse. » — Gravure ancienne', 3.5);
  });

  /* ----- JARDINS ----- */
  mkCyl(3, 3.3, 0.7, 0, 0, 42, 'stoneR', true, 14);
  const wa = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.1, 14),
    new THREE.MeshStandardMaterial({ color: 0x2a6a9e, roughness: 0.15, metalness: 0.4, emissive: 0x0a2038 }));
  wa.position.set(0, 0.72, 42); S.scene.add(wa);
  mkCyl(0.4, 0.55, 1.7, 0, 0.7, 42, 'stoneR', false, 8);
  [[-8, 38], [9, 40], [14, 52], [-14, 64], [8, 66], [20, 62], [-6, 70], [26, 45], [33, 58], [-34, 44], [55, 64], [36, 70]]
    .forEach(([tx, tz], i) => tree(tx, tz, 0.9 + ((i * 7) % 4) * 0.15));
  // haies (poche secrète x -25..-19, z 59..65)
  mkBox(6, 2.4, 1, -22, 0, 65, 'hedge');
  mkBox(1, 2.4, 7, -19, 0, 61.5, 'hedge');
  mkBox(1, 2.4, 7, -25, 0, 61.5, 'hedge');
  mkBox(6, 2.4, 1, -22, 0, 59, 'hedgeF', false); // FAUSSE haie
  addPickup('crystal', -22, 0, 62);
  pedestal(-16, 66, 0, 'frost', 0x9fe8ff, 'Souffle glacé appris ! (touche 5, puis clic) Un souffle qui gèle les ombres proches.');
  mkBox(14, 2.4, 1, -16, 0, 55, 'hedge');
  mkBox(1, 2.4, 10, -9.5, 0, 50.5, 'hedge');
  mkBox(10, 2.4, 1, -27, 0, 50, 'hedge');
  mkBox(1, 2.4, 13, -31, 0, 56, 'hedge');
  mkBox(8, 2.4, 1, -13, 0, 68, 'hedge');
  addInter(-22, 0, 57.5, 2.2, 'Observer la haie', () => {
    showMsg('Cette haie semble plus sombre que les autres... et l\'air y circule.', 3);
  });
  [[18, 36], [-20, 40], [30, 66]].forEach(([px, pz]) => {
    mkCyl(0.6, 0.7, 2.4, px, 0, pz, 'stoneR', true, 8);
  });
  // rochers et touffes d'herbe
  for (let i = 0; i < 26; i++) {
    const rx = -70 + ((i * 173) % 150), rz = 33 + ((i * 97) % 46);
    if (rx > 38 && rx < 57 && rz > 42 && rz < 58) continue;
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + ((i * 13) % 10) * 0.06, 0), matFor('stoneR', 1, 1));
    r.position.set(rx, 0.2, rz);
    r.rotation.set(i, i * 2, i * 3);
    r.castShadow = true; r.receiveShadow = true;
    S.scene.add(r);
  }
  for (let i = 0; i < 70; i++) {
    const gx = -75 + ((i * 211) % 160), gz = 32 + ((i * 131) % 52);
    if (gx > 38 && gx < 57 && gz > 42 && gz < 58) continue;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 4), matFor('leaf', 1, 1));
    t.position.set(gx, 0.27, gz);
    S.scene.add(t);
  }
  addPickup('mana', 10, 0, 50);
  addPickup('mana', -12, 0, 47);
  addPickup('mana', 45, 0, 58);
  addPickup('heart', -30, 0, 62);

  /* ----- LUMEN, l'esprit-guide ----- */
  S.lumen = new THREE.Group();
  const lcore = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xaad8ff }));
  S.lumen.add(lcore, glow(0x7fb8ff, 3.6, 0.85));
  const llight = new THREE.PointLight(0x6fa8ff, 1.4 * LIGHT_SCALE, 12, 2);
  S.lumen.add(llight);
  S.lumen.position.set(2.5, 1.5, 44.5);
  S.scene.add(S.lumen);
  addInter(2.5, 0, 44.5, 2.6, 'Parler à Lumen', () => {
    if (!tut.lumenMet) {
      tut.lumenMet = true;
      openDialog([
        'Enfin... un porteur de flamme. Je suis Lumen, dernier souffle du foyer d\'Ombreciel.',
        'Jadis, trois Larmes d\'Aube baignaient ce château de lumière. La Nuit sans lune les a arrachées : une aux jardins, une aux cryptes, une à la salle du trône.',
        'Depuis, les sentinelles d\'ombre rôdent. Elles craignent une seule chose : ton Trait astral. Vise-les du regard et frappe d\'un clic gauche.',
        'Chasse d\'abord les deux ombres qui souillent ces jardins. Puis entre au château. Reviens me voir si le doute te prend.'
      ], () => questReach('lumen'));
    } else {
      const q = QUESTS[S.questI];
      const h = q ? HINTS[q.id] : null;
      openDialog([h || 'L\'Aube est proche, porteur de flamme. Je le sens.']);
    }
  });

  /* ----- ENNEMIS ----- */
  /* Jardins — niveau 1 */
  mkEnemy(-10, 46, 0, [[-10, 46], [6, 46]], { tag: 'garden', type: 'sentinel', lvl: 1 });
  mkEnemy(16, 56, 0, [[16, 56], [16, 66], [26, 60]], { tag: 'garden', type: 'sentinel', lvl: 1 });
  mkEnemy(8, 60, 0, [[8, 60], [0, 64], [12, 64]], { type: 'wraith', lvl: 1 });
  /* Grand hall & ailes — niveau 2 */
  mkEnemy(0, 15, 0, [[-9, 9], [9, 9], [9, 23], [-9, 23]], { type: 'sentinel', lvl: 2 });
  mkEnemy(-25, 18, 0, [[-25, 18], [-19, 10]], { type: 'sentinel', lvl: 2 });
  mkEnemy(-22, 13, 0, [[-22, 13], [-26, 16]], { type: 'caster', lvl: 2 });
  mkEnemy(5, 20, 0, [[5, 20], [-3, 12], [7, 11]], { type: 'wraith', lvl: 2 });
  /* Cryptes — niveau 4 */
  mkEnemy(52, 12, -6, [[48, 4], [54, 20]], { type: 'sentinel', lvl: 4 });
  mkEnemy(60, 6, -6, [[58, 4], [66, 10]], { type: 'wraith', lvl: 4 });
  mkEnemy(62, 18, -6, [[56, 20], [68, 16]], { type: 'caster', lvl: 4 });
  mkEnemy(58, 12, -6, [[58, 12], [62, 8]], { type: 'brute', lvl: 4 });
  /* Salle du trône — niveau 5 */
  mkEnemy(-4, -8, 0, [[-5, -5], [-5, -12]], { type: 'brute', lvl: 5 });
  mkEnemy(4, -8, 0, [[5, -12], [5, -5]], { type: 'brute', lvl: 5 });
  mkEnemy(0, -12, 0, [[0, -12], [3, -9], [-3, -9]], { type: 'caster', lvl: 5 });
}

/* ================================================================
   LES TERRES PERDUES — extension à ciel ouvert, débloquée après les 3 Larmes.
   Le sol (dalles d'herbe posées au tout début de buildWorld) couvre déjà
   cette zone : on y ajoute juste du décor, des zones de niveau 6-10, et
   quelques repos de progression (PV max, mana, cœur).
   ================================================================ */
export function buildOpenWorld() {
  torch(-2.4, 3, -18, 0x8a5aff, 1.25, 18);
  torch(2.4, 3, -18, 0x8a5aff, 1.25, 18);
  addInter(0, 0, -19, 3, 'Contempler les Terres Perdues', () => {
    showMsg('Au-delà du seuil, la pierre redevient friche et sauvage. Nul porteur de flamme n\'est allé plus loin.', 4);
  });
  // Ruines et rochers — positions fixes pour un terrain lisible et sûr
  const RUINS = [
    [-11, -27, 3.2], [11, -29, 4], [-17, -38, 3.4], [16, -40, 3], [-7, -48, 4.6], [9, -50, 3.2],
    [-23, -58, 4], [21, -60, 3.6], [-31, -46, 3], [31, -49, 4.2], [-15, -68, 3], [17, -70, 4.4],
    [-33, -77, 3.6], [33, -79, 3], [-42, -63, 3.2], [42, -66, 3.8], [-6, -84, 4.8], [7, -86, 4]
  ];
  RUINS.forEach(([rx, rz, rh]) => mkCyl(0.55 + rh * 0.05, 0.72 + rh * 0.05, rh, rx, 0, rz, 'stoneD', true, 7));
  const ROCKS = [[-19, -32], [18, -34], [-27, -52], [26, -54], [-12, -62], [13, -64], [-24, -73], [24, -73]];
  ROCKS.forEach(([rx, rz], i) => {
    const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 + ((i * 13) % 5) * 0.18, 0), matFor('stoneR', 1, 1));
    rk.position.set(rx, 0.6, rz); rk.rotation.set(i, i * 1.7, i * 0.4); rk.castShadow = true; rk.receiveShadow = true;
    S.scene.add(rk); addCol(rk);
  });
  torch(-14, 2.2, -40, 0x9a6cff, 1.1, 17);
  torch(14, 2.2, -52, 0x66c8ff, 1.1, 17);
  torch(-20, 2.2, -68, 0xff6a3a, 1.1, 17);
  // Ressources de soutien pour l'exploration prolongée
  addPickup('mana', -9, 0, -33); addPickup('heart', 10, 0, -36);
  addPickup('mana', -24, 0, -56); addPickup('heart', 22, 0, -58);
  addPickup('mana', -14, 0, -72); addPickup('heart', 16, 0, -74);
  addPickup('maxhp', 0, 0, -84);
  addPickup('maxhp', -28, 0, -56);
  // Flèche des Confins — repère visuel marquant la limite explorée
  const spireMat = new THREE.MeshStandardMaterial({ color: 0x241a3a, roughness: 0.7, emissive: 0x140a24 });
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.2, 16, 8), spireMat);
  spire.position.set(0, 8, -90); spire.castShadow = true; S.scene.add(spire); addCol(spire);
  const spireGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshBasicMaterial({ color: 0xb08cff }));
  spireGem.position.set(0, 16.4, -90); spireGem.add(glow(0xb08cff, 3, 0.6));
  S.scene.add(spireGem); spinners.push(spireGem);
  addInter(0, 0, -86, 3.5, 'Lire les runes de la flèche', () => {
    showMsg('« Ici finit la carte des anciens. Ce qui suit n\'appartient qu\'à ceux qui osent. »', 4.5);
  });
}

/* ---------------- HERBES LUNAIRES (récolte dans les jardins) ---------------- */
export function buildHerbs() {
  [[6, 52], [-8, 48], [11, 41], [-13, 56], [19, 58], [-21, 45], [4, 36], [-4, 65], [27, 50], [-16, 38]]
    .forEach(p => addPickup('herb', p[0], 0, p[1]));
}
