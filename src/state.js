/* ================================================================
   ÉTAT GLOBAL & CONSTANTES DE GAME DESIGN
   Toutes les valeurs (dégâts, vitesses, coûts, XP, zones...) sont
   reprises à l'identique du prototype d'origine.
   ================================================================ */

/* Mode manette smartphone : si l'URL contient ?controller=ID, l'application
   devient l'interface de la manette (voir Network.js / startControllerMode). */
export const CTRL_ID = new URLSearchParams(location.search).get('controller');
/* Mode tactile : détecté si l'appareil a un écran tactile "grossier" (téléphone/tablette). */
export const IS_TOUCH = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);
/* iOS (iPhone/iPod + iPadOS qui se déguise en Mac) : pas d'API plein écran,
   user-scalable=no ignoré, vibrations absentes — traité à part dans Controls. */
export const IS_IOS = /iP(hone|od|ad)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/* Déjà « installé » (PWA écran d'accueil ou plein écran natif) ? */
export const IS_STANDALONE = navigator.standalone === true ||
  (typeof matchMedia === 'function' &&
   (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches));

export const G = {
  started: false, paused: false, over: false, inv: false, dialog: false,
  /* v7.4 — dead : écran GAME OVER en cours (solo). mapOpen : carte du monde
     à l'écran. stars : Éclats d'Aube étoilée (secrets, 3 = Faveur des
     Étoiles, un vrai boost permanent — voir World.js / SkillTree.js). */
  dead: false, mapOpen: false, stars: 0,
  hp: 100, maxHp: 100, mana: 100, maxMana: 100,
  powers: { bolt: true, dash: false, tk: false, shield: false, frost: false, heal: false, nova: false, meteor: false },
  sel: 'bolt',
  cd: { bolt: 0, dash: 0, tk: 0, shield: 0, frost: 0, heal: 0, nova: 0, meteor: 0 },
  crystals: 0, goldKey: false,
  items: ['Bâton de noviciat'],
  path: 'mage', herbs: 0, shadows: 0, orbes: 0, hasWings: false,
  /* Butin différencié par archétype d'ombre (voir killEnemy, Enemies.js) :
     plumes (Traqueurs), os (Colosses), fils (Tisseurs) — et le Cœur de nuit,
     ressource RARE qui forge les plus gros boosts du jeu. */
  feathers: 0, bones: 0, threads: 0, nightHearts: 0,
  /* Consommables gardés dans le sac (fabriqués à l'avance, bus quand on veut) */
  potions: 0, buffSpeedT: 0,
  /* Boosts permanents forgés au sac (plafonnés, voir RECIPES/Crafting.js) */
  forgeHp: 0, forgeMana: 0, nightSeals: 0,
  /* Guide du porteur : chaque découverte (ressource, arbre, bivouac...) ouvre
     UNE FOIS une page d'explication qui met le jeu en pause (voir guide, Quests.js) */
  seen: {},
  xp: 0, level: 1, sp: 0, nodes: {}, treeOpen: false,
  furyT: 0, hasteT: 0, comboN: 0, comboT: 0,
  /* Enchaînement universel : chaque coup au but (toutes voies) empile le
     combo tant qu'on ne reste pas 2,2 s sans toucher — et encaisser un coup
     le brise. Bonus de dégâts +5 %/coup (plafonné à +40 %). */
  comboHits: 0, comboHitT: 0,
  /* Forge des Arts : 1 Éclat de puissance par niveau gagné, à dépenser pour
     forger des rangs d'amélioration de chaque sort (voir PUPG / SkillTree). */
  shards: 0, pupg: { bolt: 0, dash: 0, shield: 0, frost: 0, heal: 0 },
  rage: 0, maxRage: 100, // jauge de rage du Guerrier (voir Powers.js / UI.js)
  upgrades: { boltAoE: false, starBoost: false }, firstPerson: false,
  checkpoint: { x: 0, y: 0.2, z: 60 },
  shieldT: 0, time: 0, msgT: 0, vig: 0,
  /* v7.1 — Ascension de la Tour du Levant : clefs de palier, Maîtres d'Étage
     vaincus, raccourcis débloqués et Aura du Premier Foyer (Observatoire).
     L'ouverture des portails dépend de ces flags stricts (jamais de trigger
     physique) : « hasKilledBoss && hasFloorKey ». */
  tower: {
    keys: { copper: false, sap: false, ether: false, astre: false },
    bosses: { archiviste: false, racine: false, chevalier: false, berger: false, avale: false },
    shortcuts: { p2: false, p3: false, p4: false, p5: false, p6: false },
    aura: false,
    /* v8 — l'Outre-Ciel (étages 16-20) : les PNJ rencontrés (leurs dialogues
       déverrouillent la progression), les Éclats d'étoile de la quête d'Orin,
       le pont de constellations retissé et la Couronne de l'Aube (récompense
       du vrai final, par-delà l'Observatoire). */
    met: { maela: false, orin: false, veilleur: false },
    shards: 0, shardsTaken: [false, false, false],
    bridge: false, crown: false
  },
  camps: {},        // bivouacs découverts (matrice de voyage rapide)
  travelOpen: false, // matrice des Bivouacs à l'écran
  /* v7.3 — Horloge d'Ombreciel : heure du monde (0-24, sauvegardée). La
     partie commence à 9 h du matin : les premières quêtes se vivent de
     jour. Une journée complète dure 16 minutes réelles (voir DayNight.js). */
  hour: 9
};

/* ---- Les Voies : chaque classe redéfinit l'attaque principale (modulaire) ---- */
export const PATHS = {
  mage:     { name: 'Mage',     boltName: 'Trait astral',   icon: '✦', dmg: 16, pSpeed: 26, cost: 10, cool: 0.45, move: 1,    melee: false, dashCool: 1.1,  hpBonus: 0 },
  warrior:  { name: 'Guerrier', boltName: 'Frappe lourde',  icon: '⚔', dmg: 34, pSpeed: 0,  cost: 6,  cool: 0.8,  move: 0.95, melee: true,  range: 2.8, dashCool: 1.3, hpBonus: 40 },
  assassin: { name: 'Assassin', boltName: 'Dague astrale',  icon: '🗡', dmg: 11, pSpeed: 34, cost: 7,  cool: 0.26, move: 1.12, melee: false, dashCool: 0.55, hpBonus: 0 },
  /* Paladin : le bastion de l'ordre — le plus résistant des 4 voies (+70 PV),
     mêlée à portée allongée (3.6 > 2.8 du Guerrier) mais dégâts moindres. */
  paladin:  { name: 'Paladin',  boltName: 'Marteau d\'aube', icon: '✙', dmg: 26, pSpeed: 0,  cost: 7,  cool: 0.85, move: 0.9,  melee: true,  range: 3.6, dashCool: 1.5, hpBonus: 70 }
};
export function applyPath(id) {
  G.path = id;
  const P = PATHS[id];
  POWERS[0].name = P.boltName; POWERS[0].icon = P.icon; POWERS[0].cost = P.cost; POWERS[0].cool = P.cool;
  POWERS[1].cool = P.dashCool;
  G.maxHp = 100 + P.hpBonus; G.hp = G.maxHp;
  G.rage = 0; // la jauge de rage (Guerrier) repart de zéro à chaque changement de voie
}

/* ================================================================
   PROGRESSION — types d'ennemis, niveaux, zones
   ================================================================ */
/* 3 archétypes principaux bien lisibles + 1 type rare à distance :
   · sentinel → OMBRE     : basique, équilibrée (violet sombre, yeux cyan)
   · brute    → COLOSSE   : très lent, dévastateur (masse rouge sombre, yeux braise)
   · wraith   → TRAQUEUR  : ultra-rapide, fragile (silhouette fine verte, yeux acides)
   · caster   → TISSEUR   : rare, projectiles hostiles à distance (inchangé) */
/* v8.1 — PV de base relevés de ~50 % sur toute la ligne : plus aucune ombre
   « standard » ne tombe d'un seul coup à niveau égal (même le Traqueur, le
   plus fragile, encaisse désormais la Frappe lourde du Guerrier). Le
   tutoriel reste clément (stats dédiées des ombres 'garden', World.js).
   La courbe par niveau (mul/dmul dans Enemies.js) est inchangée. */
export const ETYPES = {
  sentinel: { name: 'Ombre',    hp: 52,  dmg: 14, speed: 2.2,  chase: 4.6, scale: 1,    color: 0x241a3a, eye: 0x8ff4ff, xp: 12 },
  wraith:   { name: 'Traqueur', hp: 36,  dmg: 9,  speed: 3.9,  chase: 7.8, scale: 0.78, color: 0x0f2e26, eye: 0x5affc8, xp: 16 },
  brute:    { name: 'Colosse',  hp: 165, dmg: 30, speed: 1.15, chase: 2.6, scale: 1.75, color: 0x3a0f20, eye: 0xffb86a, xp: 36 },
  caster:   { name: 'Tisseur',  hp: 46,  dmg: 15, speed: 2.0,  chase: 3.8, scale: 1,    color: 0x2e1440, eye: 0xff8a5a, xp: 24, ranged: true },
  /* v8 — l'Outre-Ciel (étages 16-20 de l'Ascension) : trois archétypes de fin
     de partie, plus forts que tout ce que le château connaît.
     · seraph   → SÉRAPHIN DÉCHU  : garde ailée du Berger, bordées à distance
     · echo     → ÉCHO DE L'AUBE  : la vitesse faite ombre, cœur incandescent
     · obsidian → TITAN D'OBSIDIENNE : muraille de roche en fusion, très lent */
  seraph:   { name: 'Séraphin déchu',     hp: 66,  dmg: 9,  speed: 2.4,  chase: 4.8, scale: 1.15, color: 0x3a2c14, eye: 0xffe9a8, xp: 60, ranged: true },
  echo:     { name: 'Écho de l\'Aube',    hp: 42,  dmg: 7,  speed: 4.4,  chase: 8.6, scale: 0.85, color: 0x2a2440, eye: 0xfff2b0, xp: 55 },
  obsidian: { name: 'Titan d\'obsidienne', hp: 185, dmg: 13, speed: 1.05, chase: 2.4, scale: 2.1,  color: 0x0c0a18, eye: 0xff5a2a, xp: 110 }
};
export const LVL_HALO = [0x6a4a9e, 0x4a6ade, 0x3ade8c, 0xdea23a, 0xde4a3a];
/* v8.1 — caps relevés d'un cran dans les zones du château (elles se vidaient
   trop vite : certaines salles étaient des couloirs sans opposition). */
export const ZONES = [
  { id: 'jardins',   name: 'Jardins du Crépuscule', x: 0,   z: 54,  y: 0,   r: 28, lvl: 1,  cap: 4, types: ['sentinel', 'sentinel', 'wraith'] },
  { id: 'parvis',    name: 'Parvis du Levant',      x: 55,  z: 60,  y: 0,   r: 18, lvl: 3,  cap: 4, types: ['sentinel', 'wraith'] },
  { id: 'hall',      name: 'Grand hall',            x: 0,   z: 16,  y: 0,   r: 16, lvl: 2,  cap: 4, types: ['sentinel', 'wraith'] },
  { id: 'biblio',    name: 'Bibliothèque',          x: -38, z: 15,  y: 0,   r: 17, lvl: 2,  cap: 4, types: ['sentinel', 'wraith', 'caster'] },
  { id: 'aile',      name: 'Aile est',              x: 38,  z: 15,  y: 0,   r: 17, lvl: 3,  cap: 4, types: ['sentinel', 'brute'] },
  { id: 'gardes',    name: 'Salle des gardes',      x: 82,  z: 10,  y: -8,  r: 14, lvl: 4,  cap: 5, types: ['sentinel', 'brute', 'caster'] },
  { id: 'ossuaire',  name: 'Ossuaire',              x: 84,  z: -18, y: -8,  r: 22, lvl: 5,  cap: 5, types: ['wraith', 'sentinel', 'caster'] },
  { id: 'gouffre',   name: 'Gouffre des Morts',     x: 105, z: 10,  y: -8,  r: 16, lvl: 5,  cap: 4, types: ['sentinel', 'caster'] },
  { id: 'trone',     name: 'Salle du trône',        x: 0,   z: -14, y: 0,   r: 15, lvl: 6,  cap: 5, types: ['brute', 'caster', 'wraith'] },
  { id: 'ruines',    name: 'Ruines des Terres Perdues', x: 0, z: -38, y: 0, r: 20, lvl: 7,  cap: 5, types: ['sentinel', 'brute', 'caster'] },
  { id: 'foret',     name: 'Forêt de Nuit',         x: 0,   z: -70, y: 0,   r: 30, lvl: 8,  cap: 6, types: ['wraith', 'sentinel', 'wraith', 'caster'] },
  { id: 'clairiere', name: 'Clairière du Cœur',     x: 0,   z: -95, y: 0,   r: 12, lvl: 10, cap: 4, types: ['brute', 'caster', 'wraith'] }
];

/* ---- Arbre des pouvoirs ---- */
export const TREE_COMMON = { branch: 'Essence (toutes voies)', nodes: [
  { id: 'g_vit',   icon: '♥', name: 'Vitalité', desc: '+40 PV max et soin immédiat.', req: 1 },
  { id: 'g_wis',   icon: '❂', name: 'Sagesse',  desc: '+40 PM max et régénération accélérée.', req: 1 },
  { id: 'g_haste', icon: '⌛', name: 'Célérité', desc: 'Récupération de tous les sorts -25 %.', req: 3 }
] };
export const TREES = {
 mage: [
  { branch: 'Voie de la Foudre', nodes: [
   { id: 'm_chain',  icon: '⚡', name: 'Éclair enchaîné',  desc: 'Le trait rebondit sur 2 ennemis proches (60 % des dégâts).', req: 2 },
   { id: 'm_storm',  icon: '☈', name: 'Tempête astrale',  desc: 'Rebondit sur 4 ennemis et les paralyse 1 s.', req: 5, needs: 'm_chain' }] },
  { branch: 'Voie du Cataclysme', nodes: [
   { id: 'm_aoe',    icon: '✺', name: 'Explosion astrale', desc: 'Le trait explose à l\'impact : dégâts de zone.', req: 2 },
   { id: 'm_cata',   icon: '☄', name: 'Cataclysme',        desc: 'Zone élargie et les ennemis brûlent 3 s.', req: 5, needs: 'm_aoe' }] },
  { branch: 'Voie de la Puissance', nodes: [
   { id: 'm_power',  icon: '✦', name: 'Trait majeur',      desc: '+60 % de dégâts.', req: 2 },
   { id: 'm_pierce', icon: '➹', name: 'Rayon perforant',   desc: 'Le trait transperce jusqu\'à 5 ennemis et file 35 % plus vite.', req: 5, needs: 'm_power' }] },
  { branch: 'Transcendance — Terres Perdues', nodes: [
   { id: 'm_ascend', icon: '☉', name: 'Ascension astrale', desc: '+25 % de dégâts supplémentaires, cumulable avec tout le reste.', req: 8 }] }
 ],
 warrior: [
  { branch: 'Voie du Séisme', nodes: [
   { id: 'w_shock',  icon: '◎', name: 'Onde de choc',      desc: 'Chaque frappe libère une onde à 360° (50 % des dégâts).', req: 2 },
   { id: 'w_quake',  icon: '⌗', name: 'Séisme',            desc: 'Onde élargie qui étourdit brièvement les ennemis.', req: 5, needs: 'w_shock' }] },
  { branch: 'Voie du Combo', nodes: [
   { id: 'w_combo',  icon: '⚔', name: 'Enchaînement',      desc: '3 coups enchaînés : le 3ᵉ inflige des dégâts doublés.', req: 2 },
   { id: 'w_fury',   icon: '♨', name: 'Fureur',            desc: 'Chaque coup au but accélère vos frappes pendant 2 s.', req: 5, needs: 'w_combo' }] },
  { branch: 'Voie du Colosse', nodes: [
   { id: 'w_might',  icon: '⛨', name: 'Force colossale',   desc: '+70 % de dégâts et vol de vie (15 % des dégâts infligés).', req: 2 },
   { id: 'w_exec',   icon: '☠', name: 'Exécution',         desc: 'Achève instantanément les ennemis sous 30 % de leurs PV.', req: 5, needs: 'w_might' }] },
  { branch: 'Transcendance — Terres Perdues', nodes: [
   { id: 'w_titan',  icon: '⛰', name: 'Corps de titan',    desc: '+30 PV définitifs et +15 % de dégâts supplémentaires.', req: 8 }] }
 ],
 assassin: [
  { branch: 'Voie du Corbeau — sniper', nodes: [
   { id: 'a_range',  icon: '◉', name: 'Œil du corbeau',    desc: 'Dagues 50 % plus rapides ; dégâts croissants avec la distance (jusqu\'à ×2,5).', req: 2 },
   { id: 'a_fatal',  icon: '✖', name: 'Tir fatal',         desc: 'Au-delà de 14 m : coup critique ×3.', req: 5, needs: 'a_range' }] },
  { branch: 'Voie des Lames', nodes: [
   { id: 'a_twin',   icon: '⚌', name: 'Lames jumelles',    desc: 'Lance 2 dagues à la fois.', req: 2 },
   { id: 'a_fan',    icon: '☰', name: 'Éventail mortel',   desc: 'Lance 5 dagues en cône.', req: 5, needs: 'a_twin' }] },
  { branch: 'Voie du Venin', nodes: [
   { id: 'a_poison', icon: '☘', name: 'Venin d\'ombre',    desc: 'Les dagues empoisonnent les ennemis pendant 3 s.', req: 2 },
   { id: 'a_dance',  icon: '❈', name: 'Danse des ombres',  desc: 'Chaque victime recharge le Pas du vent et vous accélère 3 s.', req: 5, needs: 'a_poison' }] },
  { branch: 'Transcendance — Terres Perdues', nodes: [
   { id: 'a_shadow', icon: '✺', name: 'Voile d\'ombre',    desc: 'Récupération de tous les arts encore 30 % plus rapide.', req: 8 }] }
 ],
 paladin: [
  { branch: 'Voie du Jugement', nodes: [
   { id: 'p_might',  icon: '✙', name: 'Jugement solaire',  desc: '+55 % de dégâts : le Marteau d\'aube pèse du poids de l\'ordre entier.', req: 2 },
   { id: 'p_smite',  icon: '❁', name: 'Verdict',           desc: 'Chaque frappe libère une onde de lumière à 360° (50 % des dégâts).', req: 5, needs: 'p_might' }] },
  { branch: 'Voie du Rempart', nodes: [
   { id: 'p_guard',  icon: '⛨', name: 'Peau de pierre',    desc: 'Les coups des ombres vous entament 25 % de moins.', req: 2 },
   { id: 'p_retal',  icon: '❖', name: 'Représailles',      desc: 'Chaque coup reçu embrase les ombres proches d\'un éclat d\'aube.', req: 5, needs: 'p_guard' }] },
  { branch: 'Voie de la Lumière', nodes: [
   { id: 'p_reach',  icon: '☨', name: 'Bras de l\'aurore', desc: 'Portée de mêlée encore allongée (+1,2 m).', req: 2 },
   { id: 'p_conse',  icon: '☀', name: 'Consécration',      desc: 'Les ennemis frappés brûlent de lumière pendant 3 s.', req: 5, needs: 'p_reach' }] },
  { branch: 'Transcendance — Terres Perdues', nodes: [
   { id: 'p_avatar', icon: '☉', name: 'Avatar de l\'Aube', desc: '+40 PV définitifs et +15 % de dégâts supplémentaires.', req: 8 }] }
 ]
};

/* ---- Sorts / pouvoirs ---- */
export const POWERS = [
  { id: 'bolt',   icon: '✦', name: 'Trait astral',  cost: 10, cool: 0.45 },
  { id: 'dash',   icon: '⟫', name: 'Pas du vent',   cost: 14, cool: 1.1 },
  { id: 'tk',     icon: '☄', name: 'Main céleste',  cost: 0,  cool: 0.35 },
  { id: 'shield', icon: '◎', name: 'Égide',         cost: 30, cool: 6 },
  { id: 'frost',  icon: '❄', name: 'Souffle glacé', cost: 22, cool: 3.2 },
  { id: 'heal',   icon: '✚', name: 'Bénédiction',   cost: 38, cool: 9 },
  /* v8 — les arts perdus de l'Outre-Ciel (étages 16-20 de l'Ascension) :
     deux sorts de démonstration de puissance, aux effets très lumineux. */
  { id: 'nova',   icon: '✹', name: 'Nova d\'Aurore', cost: 45, cool: 12 },
  { id: 'meteor', icon: '✵', name: 'Astre d\'Aube',  cost: 60, cool: 16 }
];

/* ---- Forge des Arts : rangs d'amélioration des sorts (Éclats de puissance).
   L'AUTRE façon de devenir puissant, en parallèle de l'arbre des pouvoirs :
   chaque niveau gagné forge 1 Éclat, chaque rang coûte 1 Éclat (5 rangs max
   par art → impossible de tout maximiser en une partie : il faut choisir). ---- */
export const PUPG = {
  bolt:   { max: 5, desc: '+10 % de dégâts de l\'attaque principale par rang.' },
  dash:   { max: 5, desc: 'Récupération du Pas du vent réduite de 7 % par rang.' },
  shield: { max: 5, desc: 'Égide : +0,8 s de protection par rang.' },
  frost:  { max: 5, desc: 'Souffle glacé : +18 % de dégâts et zone +0,5 m par rang.' },
  heal:   { max: 5, desc: 'Bénédiction : +12 PV rendus par rang.' }
};

/* ---- Coop écran scindé : joueur 2 (manette) ---- */
export const p2 = {
  path: 'mage', hp: 100, maxHp: 100, mana: 100, maxMana: 100, sel: 'bolt',
  cd: { bolt: 0, dash: 0, tk: 0, shield: 0, frost: 0, heal: 0, nova: 0, meteor: 0 },
  yaw: 0, pitch: -0.22, shieldT: 0, invuln: 0, dashT: 0, stepT: 0, walkT: 0,
  grounded: false, airJumped: false, jumpQ: 0,
  rage: 0, // jauge de rage du Guerrier quand le J2 incarne cette voie (voir Powers.js)
  input: { mx: 0, mz: 0, sprint: false, jumpHeld: false },
  pos: null, vel: null, dashDir: null, mesh: null, parts: null, wings: null, shieldMesh: null, mixer: null
};

/* ---- Joueur 1 ---- */
export const player = {
  pos: null, vel: null, grounded: false, mesh: null, parts: {}, mixer: null,
  dashT: 0, dashDir: null, invuln: 0, stepT: 0, walkT: 0
};

/* ---- Histoire, quêtes, tutoriel ---- */
export const STORY = [
  'Il y a cent ans, le château d\'Ombreciel veillait sur la vallée. Trois Larmes d\'Aube — cristaux de première lumière — brûlaient en son cœur et tenaient la nuit à distance.',
  'Puis vint la Nuit sans lune. Les Larmes furent arrachées : l\'une fut traînée au fond des catacombes, par-delà l\'Ossuaire et le Gouffre des Morts ; l\'autre scellée dans la salle du trône ; la dernière emportée au cœur de la Forêt de Nuit, au-delà des Terres Perdues, là où les arbres eux-mêmes forment un labyrinthe.',
  'Vous êtes le dernier porteur de flamme de votre ordre. Les arts anciens — vent, main céleste, égide, givre, bénédiction — dorment encore dans la pierre d\'Ombreciel. Sans eux, aucune porte ne cédera. Ravivez l\'Aube... ou rejoignez les ombres.'
];
export const QUESTS = [
  { id: 'move',    text: 'Avancez avec les touches ZQSD (ou WASD).' },
  { id: 'look',    text: 'Orientez la caméra avec la souris. Si elle ne répond pas, maintenez le clic gauche en la déplaçant.' },
  { id: 'jump',    text: 'Sautez avec Espace, puis sprintez avec Shift.' },
  { id: 'lumen',   text: 'Rejoignez la petite lueur bleue près de la fontaine et parlez-lui (E).', pos: [2.5, 1, 44.5] },
  { id: 'garden',  text: 'Repoussez les 2 Ombres des jardins : la herse du château se lèvera. (clic gauche : attaque)' },
  { id: 'hall',    text: 'Franchissez la herse et entrez dans le grand hall.', pos: [0, 1, 16] },
  { id: 'lever',   text: 'Percez l\'énigme des trois flammes du grand hall : la bibliothèque s\'ouvrira.', pos: [-4, 1, 28.5] },
  { id: 'dash',    text: 'Grimpez les étagères de la bibliothèque jusqu\'à la passerelle : le Pas du vent y sommeille.', pos: [-55, 8.4, 5] },
  { id: 'tower',   text: 'Avec le Pas du vent (touche 2), franchissez le pont brisé du parvis est et gagnez le sommet de la Tour du Levant.', pos: [58, 23.8, 46] },
  { id: 'plate',   text: 'Avec la Main céleste (touche 3), chargez les DEUX plaques gravées de l\'aile est. L\'armurerie cache deux blocs runiques...', pos: [48, 1, 16] },
  { id: 'crypt',   text: 'Descendez aux catacombes : la Bénédiction dort dans l\'Ossuaire, et la Clef d\'or ne paraîtra que si les feux des morts s\'éteignent.', pos: [86, -7, -30] },
  { id: 'gouffre', text: 'Franchissez le Gouffre des Morts d\'un Pas du vent : l\'Égide veille sur l\'autre rive.', pos: [113, -7, 10] },
  { id: 'flamme',  text: 'L\'Égide activée (touche 4), traversez le rideau de flammes : la première Larme est derrière.', pos: [123, -7, 10] },
  { id: 'throne',  text: 'Ouvrez la salle du trône avec la Clef d\'or, au nord du grand hall : la deuxième Larme y est gardée.', pos: [0, 1, 1] },
  { id: 'lost',    text: 'Avec deux Larmes en main, franchissez le passage scellé derrière le trône, vers les Terres Perdues.', pos: [0, 1, -26] },
  { id: 'frost',   text: 'Trouvez le Souffle glacé dans les ruines et éteignez les ronces ardentes qui ferment la Forêt de Nuit.', pos: [12, 1, -42] },
  { id: 'grove',   text: 'Traversez le labyrinthe de la Forêt de Nuit. Un arbre-sanctuaire flétri bloque la voie : la Bénédiction (touche 6) le ranimera.', pos: [-39, 1, -75] },
  { id: 'tears',   text: 'Atteignez la Clairière du Cœur et arrachez la dernière Larme d\'Aube à ses gardiens.', pos: [0, 2.6, -95] }
];
export const HINTS = {
  garden: 'Les Ombres craignent ton attaque. Vise du regard, frappe au clic gauche. La herse ne se lèvera qu\'une fois les jardins purgés.',
  hall: 'La herse du château est levée, au nord de la fontaine. Les torches du grand hall brûlent encore.',
  lever: 'Trois leviers ceignent le grand hall, et une plaque près de l\'entrée murmure leur ordre : suis la course du soleil — le Levant l\'éveille, Midi le porte, le Couchant l\'endort.',
  dash: 'Dans la bibliothèque, les étagères de l\'angle sud-ouest font un escalier vers la passerelle haute.',
  tower: 'Au parvis est des jardins, un escalier mène au pont brisé. « Seul le vent franchit ce que la pierre refuse. »',
  plate: 'Les DEUX plaques gravées veulent leur charge en même temps. Un bloc runique attend au sol de l\'armurerie... et l\'autre dort là où l\'on empile ce qu\'on veut oublier : lève les yeux vers les caisses.',
  crypt: 'Sous l\'aile est, l\'escalier des catacombes est ouvert. Dans l\'Ossuaire, longe le mur de l\'ouest jusqu\'à la Bénédiction. Quant à la Clef d\'or : « que s\'éteignent les trois feux des morts, et la châsse s\'ouvrira ».',
  gouffre: 'À l\'est de la salle des gardes, le Gouffre des Morts n\'a plus de pont. Prends ton élan : saut, puis Pas du vent en plein vol.',
  flamme: 'Le rideau de flammes ne brûle pas ce que l\'Égide protège. Active-la (touche 4) juste avant de traverser.',
  throne: 'La serrure d\'or attend sa clef, au nord du grand hall. Les Colosses gardent la deuxième Larme.',
  lost: 'Le passage scellé derrière le trône ne cède qu\'aux porteurs de deux Larmes.',
  frost: 'Dans les ruines des Terres Perdues, le Souffle glacé dort sur son piédestal. Les ronces ardentes de la forêt le craignent.',
  grove: 'La Forêt de Nuit est un labyrinthe : ses murs ne se franchissent pas. Cherche l\'arbre-sanctuaire flétri et rends-lui la vie (touche 6).',
  tears: 'Au bout du labyrinthe, la Clairière du Cœur. Ses gardiens sont de niveau 10 : reviens plus fort si la nuit te submerge.'
};
export const tut = { moved: 0, looked: 0, jumped: false, sprinted: false, lumenMet: false, gardenKills: 0 };

/* ---- Collections partagées du monde ---- */
export const keys = {};
export const colliders = [], doors = [], pickups = [], inter = [], enemies = [], projectiles = [],
             tkCubes = [], spinners = [], flames = [], parts = [];
export const pedestals = []; // cristaux de piédestal (retirés au chargement si déjà récoltés)
/* Matrice des Bivouacs : chaque feu s'enregistre ici ({id, label, x, y, z,
   travel}) ; ceux découverts (G.camps) deviennent des destinations de
   voyage rapide — interdit si le joueur est en combat (S.combatT > 0). */
export const CAMPS = [];
/* Plaques runiques : { x, z, y, glow, door, questId, active } — un bloc posé
   dessus (Main céleste) ouvre la porte associée (voir checkPlate, Powers.js). */
export const PLATES = [];
export const zoneSeen = {};

/* ---- Entrées partagées (manette / tactile / réseau) ---- */
export const gpMove = { x: 0, z: 0 };
export const tmMove = { x: 0, z: 0 };

export const STEP_HEIGHT = 0.62; // hauteur de rebord franchissable automatiquement (marche/mantle)
/* v8 : énigmes durcies, secrets, butin par archétype, sac-atelier, guide du
   porteur, bivouacs raréfiés — les index de pickups/interactions ont changé,
   les sauvegardes v7 seraient décalées : on repart. */
export const SAVE_KEY = 'ombreciel_save_v8';

/* ---- Réglages joueur (visée, luminosité) — persistés indépendamment de la
   sauvegarde de partie, façon menu Options d'un FPS (sensibilité, zone
   morte, inversion d'axe, luminosité nocturne). Repris de la session
   parallèle « visibility-aiming » et branchés sur le cycle jour/nuit. ---- */
export const SETTINGS_KEY = 'ombreciel_settings_v1';
export const settings = {
  mouseSens: 1,      // souris + glisser tactile
  padSens: 1,        // manette Xbox/PS + manette smartphone
  invertY: false,
  deadzone: 0.2,     // zone morte des sticks analogiques
  brightness: 1,     // luminosité NOCTURNE (le jour n'en a pas besoin)
  /* Sorts assignés aux 5 boutons dédiés (Y/LB/RB/LT/RT sur manette,
     colonne de boutons sur la manette tactile). null = emplacement vide.
     L'attaque de base (X/✦) n'est pas assignable : elle reste l'attaque. */
  slots: ['dash', 'tk', 'shield', 'frost', 'heal']
};
export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (raw) Object.assign(settings, raw);
  } catch (e) { /* réglages par défaut si stockage indisponible/corrompu */ }
  // réglages enregistrés avant l'ajout des slots (ou corrompus) : 5 emplacements requis
  if (!Array.isArray(settings.slots) || settings.slots.length !== 5)
    settings.slots = ['dash', 'tk', 'shield', 'frost', 'heal'];
}
export function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
}

/* Depuis three r155, l'éclairage "physiquement correct" est le seul mode :
   les intensités des PointLight/SpotLight doivent être multipliées par π
   pour retrouver le rendu de l'ancien mode legacy (three r128 d'origine). */
export const LIGHT_SCALE = Math.PI;

/* ---- État mutable partagé entre modules (équivalent des `let` globaux d'origine) ---- */
export const S = {
  // rendu
  scene: null, camera: null, cam2: null, renderer: null, clock: null,
  composer: null, renderPass: null, bloomPass: null,
  shieldMesh: null, dirLight: null, beacon: null, lumen: null,
  // portes / éléments nommés du monde
  libDoor: null, basementDoor: null, throneDoor: null, beyondDoor: null,
  gateDoor: null,
  // caméra / entrées J1
  yaw: 0, pitch: -0.22, camKick: 0, jumpQueued: 0,
  plOK: true, mDown: false, dragDist: 0,
  // gamepad / tactile
  gpSprint: false, gpJumpHeld: false, gpPrev: {}, gpDisabled: false,
  /* tmAttackHeld = manette smartphone (attaque du sort sélectionné, flux
     historique cycle+attaque) · tmBoltHeld = bouton ✦ tactile (toujours
     l'attaque de base, les autres sorts ayant leurs boutons dédiés) */
  tmJumpHeld: false, tmAttackHeld: false, tmBoltHeld: false,
  /* Visée assistée (tactile & manette) : cible douce choisie dans le cône
     de regard (aimTarget), cible verrouillée à la main d'un simple toucher
     sur l'ennemi (aimManual, expire après aimManualT secondes), activité
     manette récente (gpActiveT) et recentrage bref de la caméra vers la
     cible au moment d'un coup (faceT). La visée n'est jamais figée : le
     joueur peut toujours corriger au doigt, l'assist ne fait qu'aimanter. */
  aimTarget: null, aimManual: null, aimManualT: 0, gpActiveT: 0, faceT: 0,
  /* Cycle jour/nuit : nightK = noirceur (0 = plein jour, 1 = nuit noire) et
     nightMul = multiplicateur de dégâts des ombres (jusqu'à ×1,8 la nuit).
     Calculés chaque frame par DayNight.js, lus par Enemies.js. */
  nightK: 0, nightMul: 1,
  // références d'éclairage/ciel pilotées par le cycle (créées dans World.initScene)
  hemi: null, amb: null, sun: null, moon: null, stars: null, skyDay: null,
  // progression / narration
  questI: -1, storyIdx: 0, dlg: null, // dlg = {pages:[],i:0,after:fn}
  // coop
  COOP: false, P2PATH: 'mage',
  // directeur de renforts
  dirT: 10, curZone: null,
  /* combat : > 0 tant qu'une ombre en chasse est proche (verrouille le
     voyage rapide et le lock-on vertical de la caméra) */
  combatT: 0,
  // caméra : longueur courante du bras (spring arm — rétractation instantanée,
  // retour lissé) pour chaque joueur, et murs actuellement « dithérés »
  camD: 5.4, camD2: 5.4, dithered: new Set(),
  /* dernier appui au sol du J1 (rubber-banding coop : le J2 tombé y est
     ramené « au bord du dernier saut réussi par le Joueur 1 ») */
  lastSafe: { x: 0, y: 0.2, z: 60 },
  // Ascension de la Tour du Levant (paliers instanciés). onHeal / onNova :
  // crochets des Maîtres d'Étage vulnérables à un art précis (Bénédiction
  // pour la Racine Vengeresse, Nova d'Aurore pour l'Avale-Lune).
  inTower: false, palier: 0, onHeal: null, onNova: null,
  // télékinésie
  tkHeld: null,
  // sauvegarde
  autosaveT: 0, BASE_PICKUPS: 0, STATIC_ENEMIES: 0,
  // manette smartphone (hôte)
  hostPeer: null, hostConn: null, hostConnTimer: null
};
