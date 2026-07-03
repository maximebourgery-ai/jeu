/* ---------------- ARTISANAT (H potion / O orbe / C transcendance) ---------------- */
import { G, S, PATHS, player, p2 } from './state.js';
import { A } from './Audio.js';
import { showMsg } from './UI.js';
import { spawnBurst } from './World.js';
import { addWingsToPlayer } from './Player.js';

export function craftAction(k) {
  if (!G.started || G.over || G.dialog) return;
  if (k === 'H') {
    if (G.herbs >= 2) {
      G.herbs -= 2; G.hp = Math.min(G.maxHp, G.hp + 30); A.pickup();
      if (S.COOP && p2.mesh) p2.hp = Math.min(p2.maxHp, p2.hp + 30);
      spawnBurst(player.pos.x, player.pos.y + 1.2, player.pos.z, 0x9fffb0, 14);
      showMsg('Vous broyez 2 herbes lunaires : +30 PV' + (S.COOP ? ' pour les deux porteurs' : '') + '.', 2.5);
    } else showMsg('Il vous faut 2 herbes lunaires (☘ ' + G.herbs + '/2). Cherchez dans les jardins...', 2.5);
  } else if (k === 'O') {
    if (G.shadows >= 3) {
      G.shadows -= 3; G.orbes++; A.power();
      spawnBurst(player.pos.x, player.pos.y + 1.4, player.pos.z, 0xb08cff, 18);
      showMsg('Trois essences d\'ombre fusionnent : Orbe d\'obscurité forgé (◉ ' + G.orbes + ').', 3);
    } else showMsg('Il vous faut 3 essences d\'ombre (● ' + G.shadows + '/3). Terrassez des sentinelles...', 2.5);
  } else if (k === 'C') {
    if (!G.upgrades.boltAoE) {
      if (G.orbes >= 2) {
        G.orbes -= 2; G.upgrades.boltAoE = true; A.power();
        G.items.push('Transcendance — ' + PATHS[G.path].boltName + ' (zone d\'effet)');
        spawnBurst(player.pos.x, player.pos.y + 1.4, player.pos.z, 0xffd97a, 24);
        showMsg('TRANSCENDANCE : votre ' + PATHS[G.path].boltName + ' frappe désormais en zone !', 4);
      } else showMsg('La transcendance exige 2 orbes d\'obscurité (◉ ' + G.orbes + '/2).', 2.5);
    } else if (!G.hasWings) {
      if (G.orbes >= 3) {
        G.orbes -= 3; G.hasWings = true; A.power();
        G.items.push('Ailes d\'Ombreciel (double saut + plané)');
        addWingsToPlayer();
        spawnBurst(player.pos.x, player.pos.y + 1.6, player.pos.z, 0x8fc8ff, 26);
        showMsg('Des AILES d\'ombre se déploient : double saut, et maintenez Espace pour planer !', 4.5);
      } else showMsg('Les Ailes d\'Ombreciel exigent 3 orbes (◉ ' + G.orbes + '/3).', 2.5);
    } else showMsg('Vous avez atteint la transcendance ultime.', 2);
  }
}
