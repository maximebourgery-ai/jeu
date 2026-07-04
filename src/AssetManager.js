/* ================================================================
   ASSET MANAGER — v8 : 100 % procédural, aucun fichier à charger.
   Le jeu mise sur la simplicité et le gameplay plutôt que sur des
   textures/modèles externes : matériaux en couleur plate (tons calibrés
   à la main par famille), sprite de halo et ciel générés en mémoire,
   silhouettes des personnages/ennemis entièrement en géométrie
   procédurale (voir Player.js / Enemies.js). Zéro requête réseau,
   zéro dépendance à un asset manquant : le jeu démarre instantanément,
   partout, à l'identique.
   ================================================================ */
import * as THREE from 'three';

/* Teintes plates par famille de matériau (remplace les anciennes textures
   PBR) : calibrées pour un rendu propre et lisible, cohérent d'une pièce
   à l'autre du château. */
const FAMILY_FALLBACK = {
  brick: 0x565a6e,
  stone: 0x4f5266,
  slab:  0x50546a,
  wood:  0x4c3624,
  grass: 0x1c3e26,
  iron:  0x2a2d38,
  roof:  0x7a4434
};

/* Définition des matériaux du jeu : une teinte plate par usage. */
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

export const assets = { glowTex: null, skyTex: null };

/* ---------- fallbacks générés en mémoire (DataTexture, pas de fichier) ---------- */
function makeGlowTexture() {
  const s = 64, data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (x + 0.5) / s - 0.5, dy = (y + 0.5) / s - 0.5;
    const d = Math.min(1, Math.hypot(dx, dy) * 2);
    let a;
    if (d <= 0.25) a = 1 - 2 * d;
    else a = 0.5 * (1 - (d - 0.25) / 0.75);
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
  const stops = [
    [0.0, 0x070a1a],
    [0.42, 0x111a3e],
    [0.58, 0x16204a],
    [1.0, 0x070a18]
  ];
  const H = 256, data = new Uint8Array(H * 4);
  const cA = new THREE.Color(), cB = new THREE.Color();
  for (let j = 0; j < H; j++) {
    const v = j / (H - 1);
    const tPos = 1 - v;
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

/* ---------- initialisation (instantanée, aucun réseau) ---------- */
export async function loadAssets(onStatus) {
  if (onStatus) onStatus('Éveil des Larmes d\'Aube…');
  assets.glowTex = makeGlowTexture();
  assets.skyTex = makeSkyTexture();
}

/* ---------- matériaux (couleur plate par famille, mis en cache par kind) ---------- */
export function matFor(kind) {
  if (matCache[kind]) return matCache[kind];
  const def = MATDEF[kind];
  const color = def.tex
    ? new THREE.Color(def.color || 0xffffff).multiply(new THREE.Color(FAMILY_FALLBACK[def.tex] || 0x808080))
    : new THREE.Color(def.color || 0xffffff);
  const params = {
    color,
    roughness: def.rough !== undefined ? def.rough : 0.95,
    metalness: def.metal || 0
  };
  const m = new THREE.MeshStandardMaterial(params);
  if (def.emissive) m.emissive = new THREE.Color(def.emissive);
  matCache[kind] = m;
  return m;
}

/* ---------- sprite de halo lumineux (utilisé pour tous les effets glow/magie) ---------- */
export function glow(color, scale, opacity) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: assets.glowTex, color, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
    opacity: opacity !== undefined ? opacity : 0.7
  }));
  sp.scale.set(scale, scale, 1);
  return sp;
}
