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
  rage: 0, maxRage: 100, // jauge de rage du Guerrier (voir Powers.js / UI.js)
  upgrades: { boltAoE: false }, firstPerson: false,
  checkpoint: { x: 0, y: 0.2, z: 60 },
  shieldT: 0, time: 0, msgT: 0, vig: 0,
  /* v7.1 — Ascension de la Tour du Levant : clefs de palier, Maîtres d'Étage
     vaincus, raccourcis débloqués et Aura du Premier Foyer (Observatoire).
     L'ouverture des portails dépend de ces flags stricts (jamais de trigger
     physique) : « hasKilledBoss && hasFloorKey ». */
  tower: {
    keys: { copper: false, sap: false, ether: false },
    bosses: { archiviste: false, racine: false, chevalier: false },
    shortcuts: { p2: false, p3: false, p4: false },
    aura: false
  },
  camps: {},        // bivouacs découverts (matrice de voyage rapide)
  travelOpen: false // matrice des Bivouacs à l'écran
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
export const ETYPES = {
  sentinel: { name: 'Ombre',    hp: 30,  dmg: 12, speed: 2.2,  chase: 4.4, scale: 1,    color: 0x241a3a, eye: 0x8ff4ff, xp: 12 },
  wraith:   { name: 'Traqueur', hp: 16,  dmg: 8,  speed: 3.9,  chase: 7.6, scale: 0.78, color: 0x0f2e26, eye: 0x5affc8, xp: 16 },
  brute:    { name: 'Colosse',  hp: 110, dmg: 30, speed: 1.15, chase: 2.6, scale: 1.75, color: 0x3a0f20, eye: 0xffb86a, xp: 36 },
  caster:   { name: 'Tisseur',  hp: 26,  dmg: 14, speed: 2.0,  chase: 3.8, scale: 1,    color: 0x2e1440, eye: 0xff8a5a, xp: 24, ranged: true }
};
export const LVL_HALO = [0x6a4a9e, 0x4a6ade, 0x3ade8c, 0xdea23a, 0xde4a3a];
export const ZONES = [
  { id: 'jardins',   name: 'Jardins du Crépuscule', x: 0,   z: 54,  y: 0,   r: 28, lvl: 1,  cap: 3, types: ['sentinel', 'sentinel', 'wraith'] },
  { id: 'parvis',    name: 'Parvis du Levant',      x: 55,  z: 60,  y: 0,   r: 18, lvl: 3,  cap: 3, types: ['sentinel', 'wraith'] },
  { id: 'hall',      name: 'Grand hall',            x: 0,   z: 16,  y: 0,   r: 16, lvl: 2,  cap: 3, types: ['sentinel', 'wraith'] },
  { id: 'biblio',    name: 'Bibliothèque',          x: -38, z: 15,  y: 0,   r: 17, lvl: 2,  cap: 3, types: ['sentinel', 'wraith', 'caster'] },
  { id: 'aile',      name: 'Aile est',              x: 38,  z: 15,  y: 0,   r: 17, lvl: 3,  cap: 3, types: ['sentinel', 'brute'] },
  { id: 'gardes',    name: 'Salle des gardes',      x: 82,  z: 10,  y: -8,  r: 14, lvl: 4,  cap: 4, types: ['sentinel', 'brute', 'caster'] },
  { id: 'ossuaire',  name: 'Ossuaire',              x: 84,  z: -18, y: -8,  r: 22, lvl: 5,  cap: 5, types: ['wraith', 'sentinel', 'caster'] },
  { id: 'gouffre',   name: 'Gouffre des Morts',     x: 105, z: 10,  y: -8,  r: 16, lvl: 5,  cap: 3, types: ['sentinel', 'caster'] },
  { id: 'trone',     name: 'Salle du trône',        x: 0,   z: -14, y: 0,   r: 15, lvl: 6,  cap: 4, types: ['brute', 'caster', 'wraith'] },
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
  { id: 'heal',   icon: '✚', name: 'Bénédiction',   cost: 38, cool: 9 }
];

/* ---- Coop écran scindé : joueur 2 (manette) ---- */
export const p2 = {
  path: 'mage', hp: 100, maxHp: 100, mana: 100, maxMana: 100, sel: 'bolt',
  cd: { bolt: 0, dash: 0, tk: 0, shield: 0, frost: 0, heal: 0 },
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
  { id: 'lever',   text: 'Trouvez le mécanisme qui ouvre la bibliothèque.', pos: [15, 1, 27] },
  { id: 'dash',    text: 'Grimpez les étagères de la bibliothèque jusqu\'à la passerelle : le Pas du vent y sommeille.', pos: [-55, 8.4, 5] },
  { id: 'tower',   text: 'Avec le Pas du vent (touche 2), franchissez le pont brisé du parvis est et gagnez le sommet de la Tour du Levant.', pos: [58, 23.8, 46] },
  { id: 'plate',   text: 'Avec la Main céleste (touche 3), posez le bloc runique de l\'armurerie sur la plaque gravée de l\'aile est.', pos: [48, 1, 16] },
  { id: 'crypt',   text: 'Descendez aux catacombes : la Clef d\'or et la Bénédiction sont perdues dans l\'Ossuaire.', pos: [86, -7, -30] },
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
  lever: 'Cherche un levier de fer contre le mur est du grand hall.',
  dash: 'Dans la bibliothèque, les étagères de l\'angle sud-ouest font un escalier vers la passerelle haute.',
  tower: 'Au parvis est des jardins, un escalier mène au pont brisé. « Seul le vent franchit ce que la pierre refuse. »',
  plate: 'Saisis le bloc runique de l\'armurerie avec la Main céleste (touche 3, puis clic) et pose-le sur la plaque gravée, dans la salle voisine.',
  crypt: 'Sous l\'aile est, l\'escalier des catacombes est ouvert. Dans l\'Ossuaire, longe le mur de l\'ouest : la Bénédiction, puis la Clef d\'or.',
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
/* v7 : refonte totale des niveaux (le monde, les portes et les objets ont
   changé de place — les sauvegardes v6 seraient incohérentes, on repart). */
export const SAVE_KEY = 'ombreciel_save_v7';

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
  gateDoor: null, leverHandle: null,
  // caméra / entrées J1
  yaw: 0, pitch: -0.22, camKick: 0, jumpQueued: 0,
  plOK: true, mDown: false, dragDist: 0,
  // gamepad / tactile
  gpSprint: false, gpJumpHeld: false, gpPrev: {}, gpDisabled: false,
  tmJumpHeld: false, tmAttackHeld: false,
  /* Visée assistée (tactile & manette) : cible douce choisie dans le cône
     de regard (aimTarget), cible verrouillée à la main d'un simple toucher
     sur l'ennemi (aimManual, expire après aimManualT secondes), activité
     manette récente (gpActiveT) et recentrage bref de la caméra vers la
     cible au moment d'un coup (faceT). La visée n'est jamais figée : le
     joueur peut toujours corriger au doigt, l'assist ne fait qu'aimanter. */
  aimTarget: null, aimManual: null, aimManualT: 0, gpActiveT: 0, faceT: 0,
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
  // Ascension de la Tour du Levant (paliers instanciés)
  inTower: false, palier: 0, onHeal: null,
  // télékinésie
  tkHeld: null,
  // sauvegarde
  autosaveT: 0, BASE_PICKUPS: 0, STATIC_ENEMIES: 0,
  // manette smartphone (hôte)
  hostPeer: null, hostConn: null, hostConnTimer: null
};
