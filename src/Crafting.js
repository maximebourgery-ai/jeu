/* ================================================================
   ARTISANAT — l'atelier du sac (Tab, jeu en pause)
   Chaque archétype d'ombre lâche SA ressource : essences (Ombres),
   plumes (Traqueurs), os (Colosses), fils (Tisseurs) — et le rare
   Cœur de nuit. Chaque ressource alimente une voie de build :
   soin, dégâts de zone, vitesse, PV max, PM max, puissance brute.
   Les touches H / O / C restent des raccourcis en jeu.
   ================================================================ */
import { G, S, PATHS, player, p2 } from './state.js';
import { A } from './Audio.js';
import { showMsg, refreshInv } from './UI.js';
import { spawnBurst } from './World.js';
import { addWingsToPlayer } from './Player.js';

/* Icône + nom lisible de chaque ressource (partagé avec le sac, UI.js) */
export const RES = {
  herbs:      { icon: '☘', name: 'Herbe lunaire',    src: 'cueillies dans les jardins et la forêt' },
  shadows:    { icon: '●', name: 'Essence d\'ombre', src: 'lâchées par les Ombres ordinaires' },
  orbes:      { icon: '◉', name: 'Orbe d\'obscurité', src: 'forgés à partir de 3 essences' },
  feathers:   { icon: '➶', name: 'Plume spectrale',  src: 'lâchées par les Traqueurs (verts, rapides)' },
  bones:      { icon: '☗', name: 'Os de Colosse',    src: 'lâchés par les Colosses (rouges, massifs)' },
  threads:    { icon: '∾', name: 'Fil d\'éther',     src: 'lâchés par les Tisseurs (lanceurs de sorts)' },
  nightHearts:{ icon: '♦', name: 'Cœur de nuit',     src: 'RARE — parfois arraché à une ombre vaincue' }
};

/* ---- Les recettes : coût en ressources → effet ----
   perm: booste définitivement (plafonné par max) · use: consommable stocké */
export const RECIPES = [
  { id: 'potion', icon: '🧪', name: 'Potion lunaire', cost: { herbs: 2 },
    desc: '+50 PV. Gardée dans le sac : buvez-la QUAND VOUS VOULEZ (bouton ci-dessous ou touche H en jeu).' },
  { id: 'orbe', icon: '◉', name: 'Orbe d\'obscurité', cost: { shadows: 3 },
    desc: 'Condense 3 essences en un orbe — la matière première des éveils et transcendances ci-dessous.' },
  { id: 'eveil', icon: '✧', name: 'Éveil d\'obscurité', cost: { orbes: 2 }, max: 5,
    desc: '+6 % de DÉGÂTS PERMANENTS par éveil (jusqu\'à 5). La voie de puissance des orbes : montez en force avant les grandes transcendances.' },
  { id: 'vent', icon: '➶', name: 'Élixir du Traqueur', cost: { feathers: 2, herbs: 1 },
    desc: '+20 % de vitesse de déplacement pendant 120 s. La hargne des Traqueurs coule dans vos jambes.' },
  { id: 'vigueur', icon: '⛨', name: 'Philtre de Colosse', cost: { bones: 2, herbs: 1 }, max: 5,
    desc: '+15 PV max PERMANENTS (jusqu\'à 5 philtres). Le build du bastion : encaissez comme un Colosse.' },
  { id: 'ether', icon: '❂', name: 'Élixir d\'Éther', cost: { threads: 2, herbs: 1 }, max: 5,
    desc: '+15 PM max PERMANENTS (jusqu\'à 5 élixirs). Le build du sorcier : enchaînez les sorts sans souffler.' },
  { id: 'sceau', icon: '♦', name: 'Sceau du Cœur de nuit', cost: { nightHearts: 1 }, max: 3,
    desc: '+10 % de DÉGÂTS PERMANENTS par sceau (jusqu\'à 3). Le boost le plus puissant du jeu — les Cœurs sont rares.' },
  { id: 'transcend', icon: '✺', name: 'Transcendance — attaque de zone', cost: { orbes: 2 },
    desc: 'Votre attaque de base frappe désormais EN ZONE autour de l\'impact. Définitif.' },
  { id: 'ailes', icon: '⋀', name: 'Ailes d\'Ombreciel', cost: { orbes: 3 },
    desc: 'Double saut, et maintenez Espace pour planer. Définitif — change votre façon d\'explorer.' }
];

/* Nombre déjà forgé d'une recette permanente (pour les plafonds) */
export function craftCount(id) {
  if (id === 'vigueur') return G.forgeHp;
  if (id === 'ether') return G.forgeMana;
  if (id === 'sceau') return G.nightSeals;
  if (id === 'eveil') return G.orbAwaken;
  if (id === 'transcend') return G.upgrades.boltAoE ? 1 : 0;
  if (id === 'ailes') return G.hasWings ? 1 : 0;
  return 0;
}
export function canCraft(r) {
  if ((r.id === 'transcend' || r.id === 'ailes') && craftCount(r.id) >= 1) return false;
  if (r.max && craftCount(r.id) >= r.max) return false;
  for (const k in r.cost) if ((G[k] || 0) < r.cost[k]) return false;
  return true;
}
export function costText(r) {
  return Object.keys(r.cost).map(k => RES[k].icon + ' ' + G[k] + '/' + r.cost[k]).join(' · ');
}

function pay(r) { for (const k in r.cost) G[k] -= r.cost[k]; }

export function craftRecipe(id) {
  if (!G.started || G.over) return;
  const r = RECIPES.find(q => q.id === id);
  if (!r) return;
  if ((r.id === 'transcend' || r.id === 'ailes') && craftCount(r.id) >= 1) { showMsg('Cette transcendance est déjà vôtre.', 2); return; }
  if (r.max && craftCount(r.id) >= r.max) { showMsg(r.name + ' : plafond atteint (' + r.max + '). Votre corps n\'en supporterait pas plus.', 2.5); return; }
  for (const k in r.cost) {
    if ((G[k] || 0) < r.cost[k]) {
      showMsg('Il manque des ressources : ' + costText(r) + ' — ' + RES[k].name + ' (' + RES[k].src + ').', 3.5);
      return;
    }
  }
  pay(r);
  const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
  if (id === 'potion') {
    G.potions++;
    A.pickup();
    showMsg('🧪 Potion lunaire rangée dans le sac (' + G.potions + '). Buvez-la avec H, quand VOUS le déciderez.', 3);
  } else if (id === 'orbe') {
    G.orbes++; A.power();
    spawnBurst(px, py + 1.4, pz, 0xb08cff, 18);
    showMsg('Trois essences fusionnent : Orbe d\'obscurité forgé (◉ ' + G.orbes + ').', 3);
  } else if (id === 'eveil') {
    G.orbAwaken++;
    A.power(); spawnBurst(px, py + 1.4, pz, 0xb08cff, 22);
    G.items.push('Éveil d\'obscurité ' + G.orbAwaken + '/5 (+6 % dégâts)');
    showMsg('✧ ÉVEIL D\'OBSCURITÉ (' + G.orbAwaken + '/5) : les orbes nourrissent votre flamme — +6 % de dégâts, pour toujours.', 3.5);
  } else if (id === 'vent') {
    G.buffSpeedT = 120; A.power();
    spawnBurst(px, py + 1.2, pz, 0x9fe8ff, 16);
    showMsg('➶ Élixir du Traqueur : +20 % de vitesse pendant 2 minutes !', 3);
  } else if (id === 'vigueur') {
    G.forgeHp++; G.maxHp += 15; G.hp = Math.min(G.maxHp, G.hp + 15);
    A.power(); spawnBurst(px, py + 1.2, pz, 0xff8a5a, 18);
    G.items.push('Philtre de Colosse ' + G.forgeHp + '/5 (+15 PV max)');
    showMsg('⛨ Philtre de Colosse (' + G.forgeHp + '/5) : +15 PV max, pour toujours.', 3);
  } else if (id === 'ether') {
    G.forgeMana++; G.maxMana += 15; G.mana = G.maxMana;
    A.power(); spawnBurst(px, py + 1.2, pz, 0x5fc8ff, 18);
    G.items.push('Élixir d\'Éther ' + G.forgeMana + '/5 (+15 PM max)');
    showMsg('❂ Élixir d\'Éther (' + G.forgeMana + '/5) : +15 PM max, pour toujours.', 3);
  } else if (id === 'sceau') {
    G.nightSeals++;
    A.power(); spawnBurst(px, py + 1.4, pz, 0xff3a5a, 26);
    G.items.push('Sceau du Cœur de nuit ' + G.nightSeals + '/3 (+10 % dégâts)');
    showMsg('♦ SCEAU DU CŒUR DE NUIT (' + G.nightSeals + '/3) : vos dégâts augmentent de 10 %, définitivement !', 4);
  } else if (id === 'transcend') {
    G.upgrades.boltAoE = true; A.power();
    G.items.push('Transcendance — ' + PATHS[G.path].boltName + ' (zone d\'effet)');
    spawnBurst(px, py + 1.4, pz, 0xffd97a, 24);
    showMsg('TRANSCENDANCE : votre ' + PATHS[G.path].boltName + ' frappe désormais en zone !', 4);
  } else if (id === 'ailes') {
    G.hasWings = true; A.power();
    G.items.push('Ailes d\'Ombreciel (double saut + plané)');
    addWingsToPlayer();
    spawnBurst(px, py + 1.6, pz, 0x8fc8ff, 26);
    showMsg('Des AILES d\'ombre se déploient : double saut, et maintenez Espace pour planer !', 4.5);
  }
  if (G.inv) refreshInv(); // le sac est ouvert : rafraîchir compteurs et boutons
}

/* Boire une potion du sac (bouton du sac ou touche H) */
export function usePotion() {
  if (!G.started || G.over) return;
  if (G.potions <= 0) {
    if (G.herbs >= 2) { craftRecipe('potion'); return; } // confort : H fabrique s'il y a de quoi
    showMsg('Aucune potion dans le sac. Il faut 2 herbes lunaires (☘ ' + G.herbs + '/2) pour en fabriquer une (Tab).', 3);
    return;
  }
  G.potions--;
  G.hp = Math.min(G.maxHp, G.hp + 50); A.pickup();
  if (S.COOP && p2.mesh) p2.hp = Math.min(p2.maxHp, p2.hp + 50);
  spawnBurst(player.pos.x, player.pos.y + 1.2, player.pos.z, 0x9fffb0, 14);
  showMsg('Vous buvez une Potion lunaire : +50 PV' + (S.COOP ? ' pour les deux porteurs' : '') + ' (🧪 reste ' + G.potions + ').', 2.5);
  if (G.inv) refreshInv();
}

/* Raccourcis clavier historiques : H potion · O orbe · C transcender.
   `who` (1|2) : le dialogue de L'AUTRE joueur ne doit pas m'empêcher de
   boire/fabriquer — seul MON propre dialogue le fait (v9). */
export function craftAction(k, who) {
  if (!G.started || G.over) return;
  if (G.dialog && S.dlgWho === (who === 2 ? 2 : 1)) return;
  if (k === 'H') usePotion();
  else if (k === 'O') craftRecipe('orbe');
  else if (k === 'C') {
    if (!G.upgrades.boltAoE) craftRecipe('transcend');
    else if (!G.hasWings) craftRecipe('ailes');
    else showMsg('Vous avez atteint la transcendance ultime.', 2);
  }
}
