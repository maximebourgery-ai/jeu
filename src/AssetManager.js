/* ================================================================
   ASSET MANAGER
   Remplace intégralement l'ancien système de textures procédurales
   (cTex / speck / initTextures / TEX / initMats / matFor).

   · Textures PBR par famille de matériau (color / normal / roughness /
     metalness) via THREE.TextureLoader (.jpg / .png) ou EXRLoader (.exr),
     depuis /assets/textures/.
   · Modèles .glb via GLTFLoader depuis /assets/models/.
   · HDRI via RGBELoader (.hdr) ou EXRLoader (.exr) + PMREMGenerator,
     depuis /assets/hdri/ (environment.hdr essayé d'abord, puis .exr).

   TOUT est optionnel : si un fichier est absent (404), on retombe
   gracieusement sur une couleur unie équivalente au rendu procédural
   d'origine (fallback calibré ci-dessous), sur les géométries
   primitives d'origine, et sur l'éclairage de base. Le jeu tourne
   donc "out of the box" sans aucun asset.
   ================================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

/* Familles de textures PBR attendues dans /assets/textures/ */
const TEXTURE_FAMILIES = ['brick', 'stone', 'slab', 'wood', 'grass', 'iron', 'roof'];
/* Modèles .glb (ou .fbx) attendus dans /assets/models/ */
const MODEL_NAMES = [
  'player_mage', 'player_warrior', 'player_assassin', 'player_paladin',
  'enemy_sentinel', 'enemy_wraith', 'enemy_brute', 'enemy_caster',
  'tree', 'torch'
];
/* Personnages humanoïdes (textures intégrées) : chargés dans un registre.
   · Les créatures d'ombre (méchants) utilisent VILLAIN_CHARACTER.
   · Le joueur peut incarner n'importe lequel via le sélecteur du menu
     titre (characterClone(role='hero', charId)).
   Fournis en .glb (convertis des FBX Mixamo d'origine) ; un .fbx (≥ 7.0)
   déposé au même nom est accepté en secours. */
const CHARACTER_DEFS = [
  { id: 'character_2', name: 'Warrok' },      // colosse monstrueux
  { id: 'character_3', name: 'Voltigeuse' },  // athlète aux couettes bleues
  { id: 'character_8', name: 'Rôdeur' }       // silhouette furtive sombre
];
const VILLAIN_CHARACTER = 'character_2';
/* HDRI : environment.hdr (RGBELoader) essayé d'abord, puis environment.exr
   (EXRLoader). Aucun des deux : fallback gracieux (ciel dégradé d'origine). */
const HDRI_URLS = ['/assets/hdri/environment.hdr', '/assets/hdri/environment.exr'];

/* Couleur moyenne des anciennes textures procédurales : sert de teinte de
   repli quand la map PBR correspondante n'est pas fournie. */
const FAMILY_FALLBACK = {
  brick: 0x565a6e, // briques rgb(86,90,110) sur fond #3a3e50
  stone: 0x4f5266, // pierre #4a4e62 mouchetée
  slab:  0x50546a, // dalles rgb(80,84,104) sur fond #484c60
  wood:  0x4c3624, // planches rgb(76,54,36) sur fond #4a3524
  grass: 0x1c3e26, // brins rgb(26,62,38) sur fond #20402a
  iron:  0x2a2d38, // fer #2a2d38
  roof:  0x7a4434  // tuiles de terre cuite
};

/* Définition des matériaux du jeu — identique à l'ancien MATDEF, mais la
   texture est désormais une famille PBR chargée par l'AssetManager. */
const MATDEF = {
  stone:  { tex: 'brick', color: 0xffffff, rough: 0.95 },
  stoneD: { tex: 'brick', color: 0x9aa0b8, rough: 0.97 },
  stoneR: { tex: 'stone', color: 0xb0a8c8, rough: 0.96 },
  slab:   { tex: 'slab',  color: 0xffffff, rough: 0.94 },
  slabW:  { tex: 'slab',  color: 0xcbb8d8, rough: 0.94 },
  slabR:  { tex: 'slab',  color: 0xd8a8b0, rough: 0.94 },
  wood:   { tex: 'wood',  color: 0xffffff, rough: 0.9 },
  woodD:  { tex: 'wood',  color: 0xb09880, rough: 0.92 },
  woodF:  { tex: 'wood',  color: 0x706050, rough: 0.95 },
  grass:  { tex: 'grass', color: 0xffffff, rough: 1 },
  path:   { tex: 'slab',  color: 0x9aa2c0, rough: 0.96 },
  iron:   { tex: 'iron',  color: 0xffffff, rough: 0.6, metal: 0.5 },
  roof:   { tex: 'roof',  color: 0xffffff, rough: 0.92 },
  hedge:  { color: 0x1c5230, rough: 1 },
  hedgeF: { color: 0x143c22, rough: 1 },
  leaf:   { color: 0x175226, rough: 1 },
  trunk:  { tex: 'wood',  color: 0x8a7460, rough: 1 },
  gold:   { color: 0xd9a83c, rough: 0.35, metal: 0.75, emissive: 0x30220a },
  rune:   { tex: 'stone', color: 0x8a78d8, rough: 0.7, emissive: 0x241a66 },
  cloth:  { color: 0x7a1f2a, rough: 1 }
};

const matCache = {};

export const assets = {
  ready: false,
  textures: {},   // famille -> {map, normalMap, roughnessMap, metalnessMap} (maps éventuellement nulles)
  models: {},     // nom -> THREE.Group (scène du glb/fbx), ou absent
  characters: {}, // id -> { scene, clips, height, minY, cx, cz, name } — personnages jouables/ennemis
  envTexture: null, // texture équirectangulaire HDR brute (background)
  envMap: null,     // radiance PMREM (scene.environment)
  glowTex: null,    // sprite de halo (fichier ou fallback DataTexture)
  skyTex: null      // dégradé du ciel nocturne (fallback sans HDRI)
};

/* ---------- chargeurs tolérants (résolvent null au lieu de rejeter) ---------- */
const texLoader = new THREE.TextureLoader();
function loadTexture(url, srgb) {
  return new Promise(res => {
    texLoader.load(url, t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      res(t);
    }, undefined, () => res(null));
  });
}
/* Chargeur EXR tolérant : utilisé pour les maps de données (roughness,
   metalness, normal) fournies en OpenEXR. Les données EXR sont linéaires
   par nature (EXRLoader pose LinearSRGBColorSpace), ce qui est exactement
   l'espace attendu pour ces maps — on ne touche pas au colorSpace. */
const exrLoader = new EXRLoader();
function loadEXRTexture(url) {
  return new Promise(async res => {
    if (!(await binaryExists(url))) return res(null);
    exrLoader.load(url, t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      res(t);
    }, undefined, () => res(null));
  });
}
async function loadTextureAnyExt(base, srgb) {
  return (await loadTexture(base + '.jpg', srgb))
    || (await loadTexture(base + '.png', srgb))
    || (await loadEXRTexture(base + '.exr'));
}
/* Vérifie qu'un fichier binaire existe vraiment : les serveurs SPA (dont le
   serveur de dev Vite) renvoient index.html (200, text/html) pour les chemins
   inconnus, ce qui ferait planter les parseurs .glb / .hdr. */
async function binaryExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    return !ct.includes('text/html');
  } catch (e) { return false; }
}
async function loadModel(url) {
  if (!(await binaryExists(url))) return null;
  return new Promise(res => {
    new GLTFLoader().load(url, gltf => res(gltf.scene || null), undefined, () => res(null));
  });
}
/* Chargeur FBX tolérant (personnages Mixamo & co, textures intégrées).
   Le groupe renvoyé garde ses .animations éventuelles. */
async function loadFBX(url) {
  if (!(await binaryExists(url))) return null;
  return new Promise(res => {
    new FBXLoader().load(url, g => res(g || null), undefined, err => {
      console.warn('[AssetManager] FBX illisible : ' + url, err);
      res(null);
    });
  });
}
/* Comme loadModel/loadFBX mais conserve aussi les clips d'animation
   ({scene, animations}) — utilisé pour le personnage partagé. */
async function loadRigged(url) {
  if (url.toLowerCase().endsWith('.fbx')) {
    const g = await loadFBX(url);
    return g ? { scene: g, animations: g.animations || [] } : null;
  }
  if (!(await binaryExists(url))) return null;
  return new Promise(res => {
    new GLTFLoader().load(url,
      gltf => res(gltf.scene ? { scene: gltf.scene, animations: gltf.animations || [] } : null),
      undefined, () => res(null));
  });
}
async function loadHDR(url) {
  if (!(await binaryExists(url))) return null;
  const loader = url.toLowerCase().endsWith('.exr') ? new EXRLoader() : new RGBELoader();
  return new Promise(res => {
    loader.load(url, t => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      res(t);
    }, undefined, () => res(null));
  });
}
async function loadEnvironmentAny(urls) {
  for (const url of urls) {
    const t = await loadHDR(url);
    if (t) return t;
  }
  return null;
}

/* ---------- fallbacks générés en mémoire (DataTexture, pas de canvas 2D) ---------- */
function makeGlowTexture() {
  // Équivalent du dégradé radial blanc -> transparent d'origine
  const s = 64, data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (x + 0.5) / s - 0.5, dy = (y + 0.5) / s - 0.5;
    const d = Math.min(1, Math.hypot(dx, dy) * 2);
    let a;
    if (d <= 0.25) a = 1 - 2 * d;          // 1 -> 0.5 sur [0, 0.25]
    else a = 0.5 * (1 - (d - 0.25) / 0.75); // 0.5 -> 0 sur [0.25, 1]
    const i = (y * s + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(Math.max(0, a) * 255);
  }
  const t = new THREE.DataTexture(data, s, s);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
function makeSkyTexture() {
  // Dégradé vertical du ciel nocturne d'origine (#070a1a → #111a3e → #16204a → #070a18)
  const stops = [
    [0.0, 0x070a1a],
    [0.42, 0x111a3e],
    [0.58, 0x16204a],
    [1.0, 0x070a18]
  ];
  const H = 256, data = new Uint8Array(H * 4);
  const cA = new THREE.Color(), cB = new THREE.Color();
  for (let j = 0; j < H; j++) {
    const v = j / (H - 1);      // v=0 bas, v=1 haut (DataTexture: flipY=false)
    const tPos = 1 - v;         // position dans le dégradé "haut vers bas" d'origine
    let k = 0;
    while (k < stops.length - 2 && tPos > stops[k + 1][0]) k++;
    const [p0, h0] = stops[k], [p1, h1] = stops[k + 1];
    const f = Math.min(1, Math.max(0, (tPos - p0) / Math.max(1e-6, p1 - p0)));
    cA.setHex(h0); cB.setHex(h1); cA.lerp(cB, f);
    const i = j * 4;
    data[i] = Math.round(cA.r * 255);
    data[i + 1] = Math.round(cA.g * 255);
    data[i + 2] = Math.round(cA.b * 255);
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, 1, H);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/* ---------- chargement global (attendu par l'écran de chargement) ---------- */
async function loadFamily(fam) {
  const base = '/assets/textures/' + fam;
  const [map, normalMap, roughnessMap, metalnessMap] = await Promise.all([
    loadTextureAnyExt(base + '_color', true),
    loadTextureAnyExt(base + '_normal', false),
    loadTextureAnyExt(base + '_roughness', false),
    loadTextureAnyExt(base + '_metalness', false)
  ]);
  assets.textures[fam] = { map, normalMap, roughnessMap, metalnessMap };
  if (!map) console.info('[AssetManager] Pas de texture PBR « ' + fam + ' » — couleur unie de repli utilisée.');
}
export async function loadAssets(onStatus) {
  const status = t => { if (onStatus) onStatus(t); };
  status('Tissage des matériaux…');
  await Promise.all(TEXTURE_FAMILIES.map(loadFamily));

  status('Invocation des silhouettes…');
  await Promise.all([
    ...MODEL_NAMES.map(async name => {
      const m = (await loadModel('/assets/models/' + name + '.glb'))
        || (await loadFBX('/assets/models/' + name + '.fbx'));
      if (m) {
        m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        assets.models[name] = m;
      }
    }),
    ...CHARACTER_DEFS.map(async def => {
      const base = '/assets/models/' + def.id;
      const r = (await loadRigged(base + '.glb')) || (await loadRigged(base + '.fbx'));
      if (!r) {
        console.info('[AssetManager] Personnage « ' + def.id + ' » absent.');
        return;
      }
      const c = r.scene;
      c.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      /* Mesure une fois pour toutes : sert à normaliser la taille et à poser
         les pieds au sol quel que soit le repère d'origine du fichier (souvent en cm). */
      const box = new THREE.Box3().setFromObject(c);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      assets.characters[def.id] = {
        scene: c, clips: r.animations, name: def.name,
        height: size.y || 1, minY: box.min.y, cx: center.x, cz: center.z
      };
    })
  ]);

  status('Lecture du ciel…');
  assets.envTexture = await loadEnvironmentAny(HDRI_URLS);
  if (!assets.envTexture)
    console.warn('[AssetManager] Aucun HDRI trouvé (' + HDRI_URLS.join(' / ') + ') — éclairage ambiant/directionnel de base conservé.');

  assets.glowTex = (await loadTexture('/assets/textures/glow.png', true)) || makeGlowTexture();
  assets.skyTex = makeSkyTexture();
  assets.ready = true;
  status('L\'Aube s\'éveille…');
}

/* Applique l'HDRI en environnement + fond de scène. Renvoie true si un HDRI
   a bien été chargé (sinon la scène garde son ciel/éclairage de repli). */
export function applyEnvironment(renderer, scene) {
  if (!assets.envTexture) return false;
  const pmrem = new THREE.PMREMGenerator(renderer);
  assets.envMap = pmrem.fromEquirectangular(assets.envTexture).texture;
  pmrem.dispose();
  scene.environment = assets.envMap;
  scene.background = assets.envTexture;
  return true;
}

/* ---------- matériaux (remplace matFor / MATDEF / matCache d'origine) ---------- */
export function matFor(kind, ru, rv) {
  ru = Math.max(1, Math.min(14, Math.round(ru)));
  rv = Math.max(1, Math.min(14, Math.round(rv)));
  const key = kind + '_' + ru + '_' + rv;
  if (matCache[key]) return matCache[key];
  const def = MATDEF[kind];
  const fam = def.tex ? assets.textures[def.tex] : null;
  const params = {
    color: def.color || 0xffffff,
    roughness: def.rough !== undefined ? def.rough : 0.95,
    metalness: def.metal || 0
  };
  if (fam && fam.map) {
    // Textures PBR fournies : on les clone pour appliquer la répétition UV.
    const cloneMap = t => {
      if (!t) return null;
      const c = t.clone();
      c.needsUpdate = true;
      c.repeat.set(ru, rv);
      return c;
    };
    params.map = cloneMap(fam.map);
    if (fam.normalMap) params.normalMap = cloneMap(fam.normalMap);
    if (fam.roughnessMap) params.roughnessMap = cloneMap(fam.roughnessMap);
    if (fam.metalnessMap) params.metalnessMap = cloneMap(fam.metalnessMap);
  } else if (def.tex) {
    // Repli : couleur unie = teinte du matériau × couleur moyenne de
    // l'ancienne texture procédurale (rendu équivalent, sans motif).
    const c = new THREE.Color(def.color || 0xffffff)
      .multiply(new THREE.Color(FAMILY_FALLBACK[def.tex] || 0x808080));
    params.color = c.getHex();
  }
  /* MeshPhysicalMaterial (superset de MeshStandardMaterial, mêmes params) :
     rendu PBR complet pour toutes les familles. La famille « brick » (murs
     du château, seules vraies textures fournies) reçoit un sheen très léger
     qui adoucit les rasances sur la pierre/mortier — volontairement subtil. */
  const m = new THREE.MeshPhysicalMaterial(params);
  if (def.tex === 'brick' && fam && fam.map) {
    m.sheen = 0.18;
    m.sheenRoughness = 0.9;
    m.sheenColor = new THREE.Color(0x8a8fa8); // reflet froid pierre/mortier
  }
  if (def.emissive) m.emissive = new THREE.Color(def.emissive);
  matCache[key] = m;
  return m;
}

/* ---------- sprite de halo lumineux (ex-fonction glow, ex-TEX.glow) ---------- */
export function glow(color, scale, opacity) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: assets.glowTex, color, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
    opacity: opacity !== undefined ? opacity : 0.7
  }));
  sp.scale.set(scale, scale, 1);
  return sp;
}

/* ---------- modèles glb/fbx (clone prêt à poser, ou null si absent) ---------- */
export function modelClone(name) {
  const m = assets.models[name];
  return m ? skeletonClone(m) : null; // clone sûr même pour les meshes skinnés
}

/* ---------- personnage partagé décliné par rôle ----------
   Le même modèle sert tous les rôles du jeu ; chaque camp reçoit sa
   lecture visuelle :
   · Méchants (créatures d'ombre) — teinte assombrie et lueur maléfique
     propre à chaque archétype (les couleurs reprennent ETYPES/state.js) :
       sentinel « Ombre »    : violet nocturne, regard froid
       wraith   « Traqueur » : silhouette amincie, spectrale (semi-translucide)
       brute    « Colosse »  : masse rougeoyante de braise
       caster   « Tisseur »  : pourpre magique saturé
   · Gentils (héros/alliés) — rôle « hero » : couleurs d'origine préservées,
     simple lueur d'âme froide (utilisé si un modèle de voie manque). */
const CHARACTER_ROLES = {
  sentinel: { tint: 0x8f84c8, emissive: 0x1a1040, glowInt: 0.6 },
  wraith:   { tint: 0x74c4a8, emissive: 0x0a2e22, glowInt: 0.55, slim: 0.82, ghost: 0.8 },
  brute:    { tint: 0xc08a70, emissive: 0x33090f, glowInt: 0.7 },
  caster:   { tint: 0xa678d4, emissive: 0x2a0a42, glowInt: 0.8 },
  hero:     { tint: 0xffffff, emissive: 0x0a1226, glowInt: 0.3 }
};
/* Liste des personnages effectivement chargés (pour le sélecteur du menu). */
export function characterList() {
  return CHARACTER_DEFS.filter(d => assets.characters[d.id])
    .map(d => ({ id: d.id, name: d.name }));
}
/* Pose de repos : les personnages Mixamo « sans animation » sont figés en
   T-pose (bras à l'horizontale). On oriente chaque bras vers le bas en
   visant le vecteur épaule→coude, quelle que soit l'orientation locale des
   os du rig (les axes varient d'un export à l'autre). */
function relaxPose(root) {
  const pairs = [];
  root.traverse(o => {
    if (!o.isBone || !/(Left|Right)Arm$/.test(o.name)) return;
    const fore = o.children.find(c => c.isBone && /ForeArm$/.test(c.name));
    if (fore) pairs.push([o, fore]);
  });
  root.updateWorldMatrix(true, true);
  const q = new THREE.Quaternion(), qP = new THREE.Quaternion();
  const bp = new THREE.Vector3(), cp = new THREE.Vector3();
  for (const [bone, fore] of pairs) {
    bone.getWorldPosition(bp); fore.getWorldPosition(cp);
    const cur = cp.sub(bp);
    if (cur.lengthSq() < 1e-8) continue;
    cur.normalize();
    if (cur.y < -0.55) continue; // bras déjà baissé : rig non T-pose, ne pas toucher
    // vers le bas, légèrement écarté du corps, un rien vers l'avant
    const target = new THREE.Vector3(Math.sign(cur.x || 1) * 0.33, -0.92, 0.1).normalize();
    q.setFromUnitVectors(cur, target);
    bone.parent.getWorldQuaternion(qP);
    bone.quaternion.premultiply(qP.clone().invert().multiply(q).multiply(qP));
    bone.updateWorldMatrix(false, true);
  }
}
export function characterClone(role, targetH, charId) {
  const src = assets.characters[charId || VILLAIN_CHARACTER];
  if (!src) return null;
  const cfg = CHARACTER_ROLES[role] || CHARACTER_ROLES.sentinel;
  const inner = skeletonClone(src.scene);
  /* Les exports Mixamo « sans animation » embarquent parfois un clip d'une
     seule frame (la T-pose, durée 0) : seul un clip d'une vraie durée compte
     comme animation ; sinon on applique la pose de repos. */
  const clips = src.clips.filter(c => c.duration > 0.25);
  if (!clips.length) relaxPose(inner);
  const mats = [];
  inner.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const clones = list.map(m => {
      const c = m.clone(); // matériaux propres à ce clone : teinte + flash de coup indépendants
      if (c.color) c.color.multiply(new THREE.Color(cfg.tint));
      if (c.emissive !== undefined) {
        c.emissive = new THREE.Color(cfg.emissive);
        c.emissiveIntensity = cfg.glowInt;
      }
      if (cfg.ghost) { c.transparent = true; c.opacity = cfg.ghost; }
      c.userData.baseEmissive = cfg.emissive;
      mats.push(c);
      return c;
    });
    o.material = Array.isArray(o.material) ? clones : clones[0];
  });
  /* Normalisation : hauteur cible en mètres, pieds posés sur l'origine du
     groupe, centré en X/Z. */
  const k = (targetH || 2.05) / src.height;
  inner.scale.setScalar(k);
  if (cfg.slim) inner.scale.x = inner.scale.z = k * cfg.slim;
  inner.position.set(-src.cx * k, -src.minY * k, -src.cz * k);
  const g = new THREE.Group();
  g.add(inner);
  g.userData.charMats = mats;  // pour flash de coup / étourdissement
  g.userData.charRoot = inner; // racine animable (AnimationMixer)
  g.userData.clips = clips;    // clips exploitables éventuels
  return g;
}
