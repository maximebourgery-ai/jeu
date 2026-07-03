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

export const G = {
  started: false, paused: false, over: false, inv: false, dialog: false,
  hp: 100, maxHp: 100, mana: 100, maxMana: 100,
  powers: { bolt: true, dash: false, tk: false, shield: false, frost: false, heal: false },
  sel: 'bolt',
  cd: { bolt: 0, dash: 0, tk: 0, shield: 0, frost: 0, heal: 0 },
  crystals: 0, goldKey: false,
  items: ['Bâton de noviciat'],
  path: 'mage', herbs: 0, shadows: 0, orbes: 0, hasWings: false,
  xp: 0, level: 1, sp: 0, nodes: {}, treeOpen: false, openWorld: false,
  furyT: 0, hasteT: 0, comboN: 0, comboT: 0,
  upgrades: { boltAoE: false }, firstPerson: false,
  checkpoint: { x: 0, y: 0.2, z: 60 },
  shieldT: 0, time: 0, msgT: 0, vig: 0
};

/* ---- Les Voies : chaque classe redéfinit l'attaque principale (modulaire) ---- */
export const PATHS = {
  mage:     { name: 'Mage',     boltName: 'Trait astral',  icon: '✦', dmg: 16, pSpeed: 26, cost: 10, cool: 0.45, move: 1,    melee: false, dashCool: 1.1,  hpBonus: 0 },
  warrior:  { name: 'Guerrier', boltName: 'Frappe lourde', icon: '⚔', dmg: 34, pSpeed: 0,  cost: 6,  cool: 0.8,  move: 0.95, melee: true,  range: 2.8, dashCool: 1.3, hpBonus: 40 },
  assassin: { name: 'Assassin', boltName: 'Dague astrale', icon: '🗡', dmg: 11, pSpeed: 34, cost: 7,  cool: 0.26, move: 1.12, melee: false, dashCool: 0.55, hpBonus: 0 }
};
export function applyPath(id) {
  G.path = id;
  const P = PATHS[id];
  POWERS[0].name = P.boltName; POWERS[0].icon = P.icon; POWERS[0].cost = P.cost; POWERS[0].cool = P.cool;
  POWERS[1].cool = P.dashCool;
  G.maxHp = 100 + P.hpBonus; G.hp = G.maxHp;
}

/* ================================================================
   PROGRESSION — types d'ennemis, niveaux, zones
   ================================================================ */
export const ETYPES = {
  sentinel: { name: 'Sentinelle', hp: 30, dmg: 12, speed: 2.2, chase: 4.2, scale: 1,    color: 0x241a3a, eye: 0x8ff4ff, xp: 12 },
  wraith:   { name: 'Spectre',    hp: 18, dmg: 9,  speed: 3.4, chase: 6.4, scale: 0.85, color: 0x142e30, eye: 0x8fffc8, xp: 14 },
  brute:    { name: 'Colosse',    hp: 90, dmg: 24, speed: 1.5, chase: 3.2, scale: 1.55, color: 0x381228, eye: 0xffb86a, xp: 32 },
  caster:   { name: 'Tisseur',    hp: 26, dmg: 14, speed: 2.0, chase: 3.8, scale: 1,    color: 0x2e1440, eye: 0xff8a5a, xp: 24, ranged: true }
};
export const LVL_HALO = [0x6a4a9e, 0x4a6ade, 0x3ade8c, 0xdea23a, 0xde4a3a];
export const ZONES = [
  { id: 'jardins', name: 'Jardins',            x: 2,   z: 52,  y: 0,  r: 26, lvl: 1,  cap: 3, types: ['sentinel', 'sentinel', 'wraith'] },
  { id: 'hall',    name: 'Grand hall',         x: 0,   z: 16,  y: 0,  r: 15, lvl: 2,  cap: 3, types: ['sentinel', 'wraith'] },
  { id: 'tour',    name: 'Tour du Levant',     x: 45,  z: 48,  y: 0,  r: 13, lvl: 3,  cap: 3, types: ['wraith', 'caster'] },
  { id: 'cryptes', name: 'Cryptes',            x: 60,  z: 11,  y: -6, r: 15, lvl: 4,  cap: 5, types: ['sentinel', 'brute', 'caster'] },
  { id: 'trone',   name: 'Salle du trône',     x: 0,   z: -9,  y: 0,  r: 12, lvl: 5,  cap: 4, types: ['brute', 'caster', 'wraith'] },
  { id: 'ruines',  name: 'Ruines oubliées',    x: 0,   z: -35, y: 0,  r: 22, lvl: 6,  cap: 5, types: ['sentinel', 'wraith', 'caster'] },
  { id: 'ravin',   name: 'Ravin des Colosses', x: -28, z: -55, y: 0,  r: 20, lvl: 8,  cap: 6, types: ['brute', 'caster', 'wraith'] },
  { id: 'confins', name: 'Confins d\'Ombre',   x: 26,  z: -75, y: 0,  r: 22, lvl: 10, cap: 7, types: ['brute', 'caster', 'brute', 'wraith'] }
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
 ]
};

/* ---- Sorts / pouvoirs ---- */
export const POWERS = [
  { id: 'bolt',   icon: '✦', name: 'Trait astral',  cost: 10, cool: 0.45 },
  { id: 'dash',   icon: '⟫', name: 'Pas du vent',   cost: 14, cool: 1.1 },
  { id: 'tk',     icon: '☄', name: 'Main céleste',  cost: 0,  cool: 0.35 },
  { id: 'shield', icon: '◎', name: 'Égide',         cost: 30, cool: 6 },
  { id: 'frost',  icon: '❄', name: 'Souffle glacé', cost: 22, cool: 3.2 },
  { id: 'heal',   icon: '✚', name: 'Bénédiction',   cost: 38, cool: 9 }
];

/* ---- Coop écran scindé : joueur 2 (manette) ---- */
export const p2 = {
  path: 'mage', hp: 100, maxHp: 100, mana: 100, maxMana: 100, sel: 'bolt',
  cd: { bolt: 0, dash: 0, tk: 0, shield: 0, frost: 0, heal: 0 },
  yaw: 0, pitch: -0.22, shieldT: 0, invuln: 0, dashT: 0, stepT: 0, walkT: 0,
  grounded: false, airJumped: false, jumpQ: 0,
  input: { mx: 0, mz: 0, sprint: false, jumpHeld: false },
  pos: null, vel: null, dashDir: null, mesh: null, parts: null, wings: null, shieldMesh: null
};

/* ---- Joueur 1 ---- */
export const player = {
  pos: null, vel: null, grounded: false, mesh: null, parts: {},
  dashT: 0, dashDir: null, invuln: 0, stepT: 0, walkT: 0
};

/* ---- Histoire, quêtes, tutoriel ---- */
export const STORY = [
  'Il y a cent ans, le château d\'Ombreciel veillait sur la vallée. Trois Larmes d\'Aube — cristaux de première lumière — brûlaient en son cœur et tenaient la nuit à distance.',
  'Puis vint la Nuit sans lune. Les Larmes furent arrachées et dispersées. Les torches moururent une à une, et des sentinelles d\'ombre se levèrent dans les salles désertes.',
  'Vous êtes le dernier porteur de flamme de votre ordre. Ce soir, vous franchissez les grilles d\'Ombreciel. Ravivez l\'Aube... ou rejoignez les ombres.'
];
export const QUESTS = [
  { id: 'move',   text: 'Avancez avec les touches ZQSD (ou WASD).' },
  { id: 'look',   text: 'Orientez la caméra avec la souris. Si elle ne répond pas, maintenez le clic gauche en la déplaçant.' },
  { id: 'jump',   text: 'Sautez avec Espace, puis sprintez avec Shift.' },
  { id: 'lumen',  text: 'Rejoignez la petite lueur bleue près de la fontaine et parlez-lui (E).', pos: [2.5, 1, 44.5] },
  { id: 'garden', text: 'Repoussez les 2 sentinelles d\'ombre du jardin (clic gauche : Trait astral).' },
  { id: 'hall',   text: 'Franchissez le portail et entrez dans le grand hall.', pos: [0, 1, 15] },
  { id: 'lever',  text: 'Trouvez le mécanisme qui ouvre la bibliothèque.', pos: [13, 1, 25] },
  { id: 'dash',   text: 'Grimpez les étagères de la bibliothèque jusqu\'à l\'art qui y sommeille.', pos: [-34.3, 7.6, 16.5] },
  { id: 'tower',  text: 'Gagnez le sommet de la Tour du Levant, à l\'est des jardins.', pos: [45, 23.6, 48.5] },
  { id: 'plate',  text: 'Avec la Main céleste (touche 3), posez le bloc runique sur la plaque de l\'aile est.', pos: [25, 1, 16] },
  { id: 'crypt',  text: 'Descendez dans les cryptes : l\'Égide, la Clef d\'or et une Larme s\'y trouvent.', pos: [67, -5, 6] },
  { id: 'throne', text: 'Ouvrez la salle du trône avec la Clef d\'or, au nord du grand hall.', pos: [0, 1, 0.6] },
  { id: 'tears',  text: 'Réunissez les 3 Larmes d\'Aube. Lumen connaît peut-être des secrets...' }
];
export const HINTS = {
  garden: 'Les sentinelles craignent ton Trait astral. Vise du regard, frappe au clic gauche.',
  hall: 'Le portail du hall est grand ouvert, au nord des jardins. Les torches y brûlent encore.',
  lever: 'Cherche un levier de fer contre le mur est du grand hall.',
  dash: 'Dans la bibliothèque, les étagères font un escalier pour qui ose grimper.',
  tower: 'La Tour du Levant se dresse à l\'est des jardins. « Seul le vent franchit ce que la pierre refuse. »',
  plate: 'Saisis le bloc runique avec la Main céleste (touche 3, puis clic) et pose-le sur la plaque gravée.',
  crypt: 'Sous l\'aile est, les cryptes gardent l\'Égide, la Clef d\'or... et une Larme.',
  throne: 'La serrure d\'or attend sa clef, au nord du grand hall.',
  tears: 'Une Larme se cache aux jardins, derrière une haie plus sombre qui respire. Les autres : cryptes, et salle du trône.'
};
export const tut = { moved: 0, looked: 0, jumped: false, sprinted: false, lumenMet: false, gardenKills: 0 };

/* ---- Collections partagées du monde ---- */
export const keys = {};
export const colliders = [], doors = [], pickups = [], inter = [], enemies = [], projectiles = [],
             tkCubes = [], spinners = [], flames = [], parts = [];
export const pedestals = []; // cristaux de piédestal (retirés au chargement si déjà récoltés)
export const PLATE = { x: 25, z: 16, active: false, glow: null };
export const zoneSeen = {};

/* ---- Entrées partagées (manette / tactile / réseau) ---- */
export const gpMove = { x: 0, z: 0 };
export const tmMove = { x: 0, z: 0 };

export const STEP_HEIGHT = 0.62; // hauteur de rebord franchissable automatiquement (marche/mantle)
export const SAVE_KEY = 'ombreciel_save_v6';

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
  libDoor: null, basementDoor: null, throneDoor: null, beyondDoor: null, leverHandle: null,
  // caméra / entrées J1
  yaw: 0, pitch: -0.22, camKick: 0, jumpQueued: 0,
  plOK: true, mDown: false, dragDist: 0,
  // gamepad / tactile
  gpSprint: false, gpJumpHeld: false, gpPrev: {}, gpDisabled: false,
  tmJumpHeld: false, tmAttackHeld: false,
  // progression / narration
  questI: -1, storyIdx: 0, dlg: null, // dlg = {pages:[],i:0,after:fn}
  // coop
  COOP: false, P2PATH: 'mage',
  // directeur de renforts
  dirT: 10, curZone: null,
  // télékinésie
  tkHeld: null,
  // sauvegarde
  autosaveT: 0, BASE_PICKUPS: 0, STATIC_ENEMIES: 0,
  // manette smartphone (hôte)
  hostPeer: null, hostConn: null, hostConnTimer: null
};
