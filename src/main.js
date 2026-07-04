/* ================================================================
   LES TOURS D'OMBRECIEL — v6 (architecture Vite modulaire)
   Point d'entrée : écran de chargement, initialisation, démarrage,
   boucle principale (avec bloom en solo, scissor en coop), et le
   mode dual jeu / manette smartphone (?controller=ID).
   ================================================================ */
import './style.css';
import { G, S, CTRL_ID, IS_TOUCH, PATHS, STORY, keys, player, p2, tut, pickups, enemies, applyPath } from './state.js';
import { A } from './Audio.js';
import { loadAssets } from './AssetManager.js';
import { $, showMsg, buildPowersUI, updateHUD } from './UI.js';
import { initScene, setCamAspects, buildWorld, buildHerbs, updateDoors, updatePickups, updateParticles } from './World.js';
import { buildPlayer, buildPlayer2, updatePlayer, updateP2, updateCamera, updateCamera2, addWingsToPlayer } from './Player.js';
import { updateEnemies, updateDirector } from './Enemies.js';
import { castPower, updateProjectiles, updateTK, checkPlate } from './Powers.js';
import { updateBuffs } from './SkillTree.js';
import { applyQuest, updateTutorial } from './Quests.js';
import { initControls, lockPointer, setupTouch, tryFullscreenMobile, updateGamepad } from './Controls.js';
import { openManettePanel, retryManette, startControllerMode } from './Network.js';
import { saveGame, hasSave, loadGame } from './SaveSystem.js';
import { buildTowerGate, updateTower } from './Tower.js';

/* ================================================================
   BOUCLE PRINCIPALE
   ================================================================ */
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(S.clock.getDelta(), 0.05);
  updateGamepad(dt);
  if (S.tmAttackHeld && G.started && !G.paused && !G.over && !G.dialog && !G.inv && !G.treeOpen && !G.travelOpen) castPower();
  if (G.started && !G.paused && !G.over && !G.dialog) {
    G.time += dt;
    updatePlayer(dt);
    if (S.COOP && p2.mesh) updateP2(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateTK(dt);
    updateDoors(dt);
    updatePickups(dt);
    updateParticles(dt);
    checkPlate();
    updateTower(dt); // Ascension de la Tour : dangers, FSM des Maîtres d'Étage
    updateTutorial();
    updateBuffs(dt);
    updateDirector(dt);
    S.autosaveT += dt;
    if (S.autosaveT > 25) { S.autosaveT = 0; saveGame(true); }
  }
  updateCamera();
  if (S.COOP && p2.mesh) updateCamera2();
  updateHUD(dt);
  if (S.COOP) {
    /* Coop : rendu scissor multi-caméra d'origine (le bloom plein écran
       n'est pas compatible avec le découpage en deux viewports). */
    const w = innerWidth, h = innerHeight, hw = Math.floor(w / 2);
    S.renderer.setScissorTest(true);
    S.renderer.setViewport(0, 0, hw, h); S.renderer.setScissor(0, 0, hw, h);
    S.renderer.render(S.scene, S.camera);
    S.renderer.setViewport(hw, 0, w - hw, h); S.renderer.setScissor(hw, 0, w - hw, h);
    S.renderer.render(S.scene, S.cam2);
    S.renderer.setScissorTest(false);
  } else {
    /* Solo : EffectComposer (RenderPass + UnrealBloomPass + OutputPass) */
    S.composer.render();
  }
}

/* ---- Lancement d'une session (solo ou coop écran scindé) ---- */
function startPlaySetup() {
  if (IS_TOUCH) {
    $('touch').classList.remove('hidden');
    tryFullscreenMobile();
  }
  if (S.COOP) {
    buildPlayer2();
    p2.path = S.P2PATH;
    p2.maxHp = 100 + (PATHS[p2.path].hpBonus || 0);
    p2.hp = p2.maxHp; p2.mana = p2.maxMana;
    p2.pos.set(player.pos.x + 1.6, player.pos.y + 0.05, player.pos.z + 0.8);
    p2.yaw = S.yaw; p2.mesh.position.copy(p2.pos);
    $('bars2').style.display = 'block';
    $('splitline').style.display = 'block';
    $('cross2').style.display = 'block';
    $('cross').style.left = '25%';
    $('crystals').style.top = '118px';
    if (G.hasWings) addWingsToPlayer();
    setCamAspects();
  }
  G.started = true;
  applyQuest();
  lockPointer();
}

/* ---------------- DÉMARRAGE (menus & boutons) ---------------- */
function wireMenus() {
  document.querySelectorAll('.modebtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modebtn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      S.COOP = btn.dataset.mode === 'coop';
      $('p2row').classList.toggle('hidden', !S.COOP);
    });
  });
  document.querySelectorAll('.p2btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.p2btn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      S.P2PATH = btn.dataset.p2path;
    });
  });
  $('btn-save').addEventListener('click', () => saveGame(false));
  $('btn-continue').addEventListener('click', () => {
    A.init();
    if (!loadGame()) {
      showMsg('Aucune sauvegarde lisible trouvée.', 3);
      return;
    }
    $('title').classList.add('hidden');
    startPlaySetup();
    setTimeout(() => showMsg('Partie restaurée. Bon retour à Ombreciel, ' + PATHS[G.path].name + '.', 4), 400);
  });
  document.querySelectorAll('.classbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.classbtn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      applyPath(btn.dataset.path);
      buildPowersUI();
    });
  });
  $('btn-manette').addEventListener('click', () => {
    openManettePanel();
  });
  $('btn-qrretry').addEventListener('click', () => {
    retryManette();
  });
  $('btn-qrclose').addEventListener('click', () => {
    $('qrpanel').classList.add('hidden');
  });
  $('btn-start').addEventListener('click', () => {
    A.init();
    $('title').classList.add('hidden');
    S.storyIdx = 0;
    $('story-text').textContent = STORY[0];
    $('story-page').textContent = 'I / III';
    $('story').classList.remove('hidden');
  });
  $('btn-next').addEventListener('click', () => {
    S.storyIdx++;
    if (S.storyIdx < STORY.length) {
      $('story-text').textContent = STORY[S.storyIdx];
      $('story-page').textContent = ['I', 'II', 'III'][S.storyIdx] + ' / III';
      A.talk();
    } else {
      $('story').classList.add('hidden');
      S.questI = 0;
      startPlaySetup();
      setTimeout(() => showMsg(S.COOP
        ? 'Bienvenue à Ombreciel, porteurs de flamme. J1 : clavier/souris · J2 : manette.'
        : 'Bienvenue à Ombreciel, ' + PATHS[G.path].name + '. Suivez l\'objectif en haut à gauche.', 4.5), 500);
    }
  });
  $('btn-resume').addEventListener('click', () => {
    $('pause').classList.add('hidden');
    G.paused = false;
    lockPointer();
  });
  $('btn-again').addEventListener('click', () => location.reload());
  $('btn-explore').addEventListener('click', () => {
    $('win').classList.add('hidden');
    G.over = false;
    showMsg('Un passage s\'est ouvert au fond de la salle du trône. Les Terres Perdues vous attendent, porteur de flamme.', 5);
    if (!IS_TOUCH && !G.paused) lockPointer();
  });
}

/* ---------------- INIT ---------------- */
async function initGame() {
  const status = $('loading-status');
  await loadAssets(t => { if (status) status.textContent = t; });
  applyPath('mage');
  initScene();
  buildWorld();
  buildHerbs();
  buildTowerGate(); // portail de l'Ascension, sur la terrasse de la Tour du Levant
  S.BASE_PICKUPS = pickups.length;   // référence stable pour la sauvegarde
  S.STATIC_ENEMIES = enemies.length; // les renforts dynamiques ne sont pas sauvegardés
  buildPlayer();
  buildPowersUI();
  applyQuest();
  if (hasSave()) $('btn-continue').classList.remove('hidden');
  initControls();
  setupTouch();
  wireMenus();
  $('loading').classList.add('hidden');
  /* Poignée de debug (serveur de dev uniquement) */
  if (import.meta.env.DEV) {
    const { inter, CAMPS } = await import('./state.js');
    const { killEnemy } = await import('./Enemies.js');
    window.__ombreciel = { G, S, keys, player, p2, tut, enemies, pickups, inter, CAMPS, killEnemy };
  }
  loop();
}

if (CTRL_ID) {
  /* Cette page a été ouverte depuis le QR code : on devient la manette. */
  startControllerMode();
} else {
  initGame();
}
