/* ================================================================
   LES TOURS D'OMBRECIEL — v6 (architecture Vite modulaire)
   Point d'entrée : écran de chargement, initialisation, démarrage,
   boucle principale (avec bloom en solo, scissor en coop), et le
   mode dual jeu / manette smartphone (?controller=ID).
   ================================================================ */
import './style.css';
import { G, S, CTRL_ID, JOIN_CODE, PEERSRV, IS_TOUCH, IS_IOS, IS_STANDALONE, PATHS, STORY, keys, player, p2, tut, pickups, enemies, tm2Move, applyPath, loadSettings, p1Busy, p2Busy, worldFrozen } from './state.js';
import { A } from './Audio.js';
import { loadAssets } from './AssetManager.js';
import { $, showMsg, buildPowersUI, updateHUD } from './UI.js';
import { initScene, buildWorld, buildHerbs, buildExtraPatrols, updateDoors, updatePickups, updateParticles, bivouac, coopNetP2, mkAnvil, updateDeathDrop, updateAnvilProximity } from './World.js';
import { updateDayNight } from './DayNight.js';
import { buildPlayer, setupCoopP2, updatePlayer, updateP2, updateCamera, updateCamera2, refreshPlayerVisual } from './Player.js';
import { updateEnemies, updateDirector } from './Enemies.js';
import { castSpecific, updateProjectiles, updateTK, checkPlate, updateAimAssist } from './Powers.js';
import { updateFx } from './Animations.js';
import { updateBuffs } from './SkillTree.js';
import { applyQuest, updateTutorial } from './Quests.js';
import { initControls, lockPointer, setupTouch, tryFullscreenMobile, updateGamepad, initSettingsUI } from './Controls.js';
import { initMap } from './WorldMap.js';
import { openManettePanel, retryManette, startControllerMode, pushCtrlState, pushNetHud } from './Network.js';
import { startOnlineClientMode } from './NetPlay.js';
import { saveGame, hasSave, loadGame } from './SaveSystem.js';
import { buildTowerGate, updateTower } from './Tower.js';

/* ================================================================
   BOUCLE PRINCIPALE
   ================================================================ */
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(S.clock.getDelta(), 0.05);
  updateGamepad(dt);
  pushCtrlState(); // manettes smartphone : état des menus/sorts poussé sur changement
  pushNetHud(dt);  // joueur en ligne (2ᵉ PC) : HUD répliqué ~10 Hz (barres, objectif, dialogues...)
  /* v9 — INDÉPENDANCE DES JOUEURS : chaque porteur a SON propre état
     « occupé » (pause, dialogue, arbre des pouvoirs, Forge — voir
     p1Busy/p2Busy, state.js). L'un peut lire son sac, dialoguer ou
     consulter son arbre SANS geler l'autre : seul updatePlayer/updateP2
     du joueur concerné s'arrête. Le MONDE (ombres, portes, directeur...)
     ne se fige que si PLUS PERSONNE ne joue (solo occupé, ou coop occupé
     des DEUX côtés). */
  const canAct1 = G.started && !G.over && !p1Busy();
  const canAct2 = G.started && !G.over && !p2Busy();
  // ✦ tactile ou manette smartphone : toujours l'attaque de base (les sorts ont leurs boutons dédiés)
  if (S.tmBoltHeld && canAct1) castSpecific('bolt');
  /* Manette smartphone du JOUEUR 2 : appliquée APRÈS updateGamepad (qui
     remet p2.input à zéro chaque frame) — téléphone et manette physique
     se cumulent, joystick poussé à fond = sprint (comme l'écran tactile). */
  if (S.COOP && p2.mesh) {
    p2.input.mx += tm2Move.x; p2.input.mz += tm2Move.z;
    if (Math.hypot(tm2Move.x, tm2Move.z) > 0.92) p2.input.sprint = true;
    if (S.tm2JumpHeld) p2.input.jumpHeld = true;
    if (S.tm2BoltHeld && canAct2) castSpecific('bolt', p2);
  }
  /* Le monde SE FIGE aussi sac ouvert (Tab), arbre des pouvoirs ouvert (K)
     et Forge ouverte : on fabrique, on consomme et on apprend tranquille —
     aucune ombre ne frappe un joueur qui lit ses menus (voir worldFrozen). */
  if (G.started && !G.over && !worldFrozen()) {
    G.time += dt;
    updateDeathDrop(); // Corpse Run : Tombe d'Aube (matérialisation, expiration 5 min réelles, récupération)
    updateAnvilProximity(); // Guide du porteur : explique la Forge à la première approche
    updateDayNight(dt); // horloge d'Ombreciel : ciel, lumières, force des ombres
    updateAimAssist(dt); // visée aimantée (tactile & manette) avant les tirs
    if (canAct1) updatePlayer(dt);
    if (S.COOP && p2.mesh && canAct2) updateP2(dt);
    updateEnemies(dt);
    updateFx(dt);        // arcs de taillade, ondes de choc au sol
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
  if (coopNetP2()) {
    /* v9 — coop EN LIGNE (2 PC) : chacun voit SON écran plein, jamais
       scindé. Le J1 (l'hôte) est rendu ici normalement (bloom compris,
       comme en solo) ; le J2 est rendu À PART (canevas dédié, même
       qualité) et cette seconde image est celle diffusée au joueur
       distant — voir Network.startNetVideo / World.ensureP2Renderer.
       Le viewport/scissor plein écran est RÉAFFIRMÉ à chaque frame : sans
       ça, un scissor resté à moitié d'écran (rendu scindé LOCAL, juste
       avant qu'un joueur en ligne rejoigne) reste actif sur le renderer
       et laisse une bande verticale figée au milieu de l'image de l'hôte. */
    S.renderer.setScissorTest(false);
    S.renderer.setViewport(0, 0, innerWidth, innerHeight);
    S.composer.render();
    /* v9.2 (retour joueur : « ça bug énormément côté J2 ») — calculer DEUX
       scènes 3D complètes (bloom compris) à CHAQUE image double le coût GPU
       par rapport au solo. Sur une machine modeste, l'image de l'hôte
       elle-même se met à ramer — la capture qui en résulte est saccadée
       AVANT même d'être compressée en vidéo : ce n'est pas un problème
       réseau. Le rendu du J2 (jamais vu localement, seulement diffusé)
       est donc mis à jour une image sur deux : le GAMEPLAY (physique,
       combats) continue à pleine cadence pour tout le monde, seule
       l'image ENVOYÉE se rafraîchit deux fois moins souvent — invisible
       après compression vidéo, et ça rend au J1 la moitié du coût GPU
       qu'il avait perdu. */
    S.p2SkipFrame = !S.p2SkipFrame;
    if (S.p2SkipFrame) S.composer2.render();
  } else if (S.COOP) {
    /* Coop LOCALE (manette/téléphone sur LA MÊME machine, un seul écran
       physique) : rendu scissor multi-caméra d'origine (le bloom plein
       écran n'est pas compatible avec le découpage en deux viewports). */
    const w = innerWidth, h = innerHeight, hw = Math.floor(w / 2);
    S.renderer.setScissorTest(true);
    S.renderer.setViewport(0, 0, hw, h); S.renderer.setScissor(0, 0, hw, h);
    S.renderer.render(S.scene, S.camera);
    S.renderer.setViewport(hw, 0, w - hw, h); S.renderer.setScissor(hw, 0, w - hw, h);
    S.renderer.render(S.scene, S.cam2);
    S.renderer.setScissorTest(false);
  } else {
    /* Solo : EffectComposer (RenderPass + UnrealBloomPass + OutputPass).
       Même réaffirmation du viewport/scissor plein écran qu'en coop en
       ligne : un J2 qui quitte le rendu scindé local ne doit pas laisser
       de bande figée au milieu de l'écran du J1. */
    S.renderer.setScissorTest(false);
    S.renderer.setViewport(0, 0, innerWidth, innerHeight);
    S.composer.render();
  }
}

/* ---- Lancement d'une session (solo ou coop écran scindé) ---- */
function startPlaySetup() {
  if (IS_TOUCH) {
    $('touch').classList.remove('hidden');
    document.body.classList.add('touchmode'); // épure le HUD (voir style.css)
    tryFullscreenMobile();
  }
  if (S.COOP) setupCoopP2(); // (aussi appelé par la manette smartphone quand un téléphone réclame le J2 en pleine partie)
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
      refreshPlayerVisual(); // le corps 3D reflète la voie choisie dès le menu
      buildPowersUI();
    });
  });
  $('btn-manette').addEventListener('click', () => {
    openManettePanel();
  });
  /* QR depuis l'ÉCRAN D'ACCUEIL : on appaire les téléphones avant de jouer —
     chacun choisit son personnage (J1/J2) et sa voie depuis le téléphone. */
  $('btn-manette-title').addEventListener('click', () => {
    openManettePanel();
  });
  $('btn-qrretry').addEventListener('click', () => {
    retryManette();
  });
  /* v8.8 — REJOINDRE UNE PARTIE EN LIGNE (2ᵉ PC) : on saisit le code affiché
     sur l'écran de l'hôte (panneau 📱/🌐), la page devient le poste du
     joueur distant (vidéo + clavier/souris — voir NetPlay.js). */
  $('btn-join-title').addEventListener('click', () => {
    const raw = prompt('Code de la partie en ligne (affiché sur l\'écran de l\'hôte, bouton « Connecter des manettes ») :');
    if (!raw) return;
    const c = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!c) return;
    location.href = location.pathname + '?join=' + c + (PEERSRV ? '&peersrv=' + encodeURIComponent(PEERSRV) : '');
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
  /* v8.4 — écran de la VRAIE FIN (Avale-Lune + Couronne de l'Aube) */
  $('btn-truewin-again').addEventListener('click', () => location.reload());
  $('btn-truewin-explore').addEventListener('click', () => {
    $('truewin').classList.add('hidden');
    G.over = false;
    showMsg('Ombreciel est en paix : la lune veille à nouveau. Le monde est à vous, porteur d\'aube.', 5);
    if (!IS_TOUCH && !G.paused) lockPointer();
  });
}

/* ---------------- INIT ---------------- */
async function initGame() {
  if (IS_TOUCH) {
    document.body.classList.add('is-touch'); // bannière « paysage » (style.css)
    /* iPhone/iPad dans Safari : pas d'API plein écran — on suggère dès
       l'écran-titre l'installation « Sur l'écran d'accueil » (PWA). */
    if (IS_IOS && !IS_STANDALONE) $('ioshint').classList.remove('hidden');
  }
  loadSettings(); // réglages du joueur (sensibilités, luminosité) — localStorage
  const status = $('loading-status');
  await loadAssets(t => { if (status) status.textContent = t; });
  applyPath('mage');
  initScene();
  buildWorld();
  buildHerbs();
  buildTowerGate(); // portail de l'Ascension, sur la terrasse de la Tour du Levant
  /* Bivouac de la fontaine : le sanctuaire de départ, à l'abri des ombres,
     pour souffler, forger et dépenser ses points. Ajouté EN DERNIER pour ne
     pas décaler les index d'interactions des sauvegardes existantes. */
  bivouac(-3.5, 0, 57, 'la fontaine des Jardins', 'fontaine');
  /* v9 — l'enclume de départ, contre la VRAIE fontaine du sanctuaire (le
     bassin de pierre en (0, 0, 42), avec son offrande secrète) : le point
     de repère qu'un joueur associe naturellement à « la fontaine » — pas
     le feu de bivouac homonyme, planté 15 m plus loin près du spawn.
     À 5,7 m du bassin (hors de son emprise, r = 3,3), sur le chemin
     naturel vers Lumen (balise du tutoriel, à peine plus loin). */
  mkAnvil(-4.5, 0, 40.5); // v9 : la Forge de la fontaine
  /* Patrouilles v8.1 : ajoutées APRÈS tout le reste (comme le bivouac
     ci-dessus) pour préserver les index d'ennemis des sauvegardes. */
  buildExtraPatrols();
  S.BASE_PICKUPS = pickups.length;   // référence stable pour la sauvegarde
  S.STATIC_ENEMIES = enemies.length; // les renforts dynamiques ne sont pas sauvegardés
  updateDayNight(0); // pose l'éclairage/ciel du matin avant la première frame
  buildPlayer();
  buildPowersUI();
  applyQuest();
  if (hasSave()) $('btn-continue').classList.remove('hidden');
  initControls();
  setupTouch();
  wireMenus();
  initSettingsUI();
  initMap(); // carte d'Ombreciel (M) : consultation + téléportation vers les bivouacs
  $('loading').classList.add('hidden');
  /* Poignée de debug (serveur de dev uniquement) */
  if (import.meta.env.DEV) {
    const { inter, CAMPS, doors, tkCubes, zoneSeen, p1Busy, p2Busy, worldFrozen, tm2Move,
      rollEquipment, equipItem, unequipSlot, equipTotals, gearScore, armorReduction } = await import('./state.js');
    const { killEnemy } = await import('./Enemies.js');
    const { loadRoom, unloadRoom } = await import('./Rooms.js');
    const { travelTo, toggleInv } = await import('./UI.js');
    const { openMap, closeMap } = await import('./WorldMap.js');
    const { setupCoopP2 } = await import('./Player.js');
    const { tryInteractP2, coopNetP2, ensureP2Renderer, setCamAspects } = await import('./World.js');
    const { toggleTree } = await import('./SkillTree.js');
    const { openDialog } = await import('./Quests.js');
    window.__ombreciel = { G, S, keys, player, p2, tut, enemies, pickups, inter, CAMPS, doors,
      tkCubes, zoneSeen, killEnemy, loadRoom, unloadRoom, saveGame, loadGame, travelTo, openMap, closeMap,
      p1Busy, p2Busy, worldFrozen, setupCoopP2, toggleInv, toggleTree, openDialog, tryInteractP2, tm2Move,
      coopNetP2, ensureP2Renderer, setCamAspects,
      rollEquipment, equipItem, unequipSlot, equipTotals, gearScore, armorReduction };
  }
  loop();
}

if (CTRL_ID) {
  /* Cette page a été ouverte depuis le QR code : on devient la manette. */
  startControllerMode();
} else if (JOIN_CODE) {
  /* v8.8 — ?join=CODE : cette page devient le poste du joueur EN LIGNE
     (vidéo du jeu en streaming + clavier/souris, voir NetPlay.js). */
  startOnlineClientMode(JOIN_CODE);
} else {
  initGame();
}
