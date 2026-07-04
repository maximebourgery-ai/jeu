# OMBRECIEL — Script complet du jeu (v7)

> Document de relecture : histoire, personnages, progression, énigmes, textes en jeu,
> zones, ennemis, pouvoirs et systèmes annexes. Tout est tiré du code actuel
> (`src/state.js`, `src/World.js`, `src/Quests.js`, `src/Crafting.js`, `index.html`).

---

## 1. Pitch

Un siècle après la **Nuit sans lune**, le château d'Ombreciel est envahi par les ombres.
Les trois **Larmes d'Aube** — cristaux de première lumière qui tenaient la nuit à distance —
ont été dispersées. Vous êtes **le dernier porteur de flamme** de votre ordre : ravivez
l'Aube en réunissant les trois Larmes… ou rejoignez les ombres.

---

## 2. Histoire

### 2.1 Introduction (3 écrans au lancement)

> **I.** Il y a cent ans, le château d'Ombreciel veillait sur la vallée. Trois Larmes
> d'Aube — cristaux de première lumière — brûlaient en son cœur et tenaient la nuit à
> distance.
>
> **II.** Puis vint la Nuit sans lune. Les Larmes furent arrachées : l'une fut traînée au
> fond des catacombes, par-delà l'Ossuaire et le Gouffre des Morts ; l'autre scellée dans
> la salle du trône ; la dernière emportée au cœur de la Forêt de Nuit, au-delà des
> Terres Perdues, là où les arbres eux-mêmes forment un labyrinthe.
>
> **III.** Vous êtes le dernier porteur de flamme de votre ordre. Les arts anciens —
> vent, main céleste, égide, givre, bénédiction — dorment encore dans la pierre
> d'Ombreciel. Sans eux, aucune porte ne cédera. Ravivez l'Aube... ou rejoignez les
> ombres.

### 2.2 Dialogue de Lumen (première rencontre, près de la fontaine)

> « Enfin... un porteur de flamme. Je suis Lumen, dernier souffle du foyer d'Ombreciel. »
>
> « Jadis, trois Larmes d'Aube baignaient ce château de lumière. La Nuit sans lune les a
> arrachées : une gît au fond des catacombes, une dans la salle du trône, la dernière au
> cœur de la Forêt de Nuit, par-delà les Terres Perdues. »
>
> « Les arts anciens dorment encore ici : vent, main céleste, égide, givre, bénédiction.
> Chaque porte d'Ombreciel n'obéit qu'à l'un d'eux — il te les faudra tous. »
>
> « Chasse d'abord les deux ombres qui souillent ces jardins : la herse se lèvera.
> Reviens me voir si le doute te prend. »

Ensuite, reparler à Lumen donne **l'indice de la quête en cours** (voir § 5).
S'il n'y a plus de quête : *« L'Aube est proche, porteur de flamme. Je le sens. »*

### 2.3 Épilogue (écran de victoire — les 3 Larmes réunies)

> **L'AUBE RENAÎT**
>
> Au cœur de la Clairière, la troisième Larme rejoint ses sœurs et l'aube déferle : sur
> les catacombes, sur le Gouffre des Morts, sur la Forêt de Nuit dont le labyrinthe se
> couvre de fleurs. Quelque part près de la fontaine, une petite lueur bleue vous
> murmure : « Merci, porteur de flamme. »
>
> Ombreciel est à vous, du sommet de la Tour du Levant au fond de l'Ossuaire. Les ombres
> qui restent, elles, n'ont plus nulle part où fuir.

---

## 3. Personnages

### 3.1 Le héros — les 4 Voies (classes jouables)

| Voie | Attaque principale | Style | Particularité |
|---|---|---|---|
| **Mage** ✦ | Trait astral (projectile, 16 dég.) | Distance équilibrée | Référence du jeu |
| **Guerrier** ⚔ | Frappe lourde (mêlée, 34 dég.) | Corps à corps lourd | +40 PV max, jauge de **rage** |
| **Assassin** 🗡 | Dague astrale (projectile rapide, 11 dég.) | Vif, cadence élevée | Le plus rapide (dash court, +12 % vitesse) |
| **Paladin** ✙ | Marteau d'aube (mêlée, 26 dég.) | Bastion de l'ordre | +70 PV max, portée de mêlée allongée (3,6 m) |

L'apparence est choisie séparément (sélecteur de personnage : « Silhouette de la voie »
par défaut + modèles 3D détectés dans `/assets/models`).

### 3.2 Lumen, l'esprit-guide
Petite lueur bleue flottant près de la fontaine des jardins. Dernier souffle du foyer
d'Ombreciel. Rôle : exposition de l'histoire, tutoriel, et **distributeur d'indices**
pour la quête en cours.

### 3.3 Les ennemis (les Ombres)

| Type | Nom | Profil | PV | Dégâts | XP |
|---|---|---|---|---|---|
| sentinel | **Ombre** | Basique, équilibrée (violet sombre, yeux cyan) | 30 | 12 | 12 |
| wraith | **Traqueur** | Ultra-rapide, fragile (silhouette verte, yeux acides) | 16 | 8 | 16 |
| brute | **Colosse** | Très lent, dévastateur (masse rouge sombre, yeux braise) | 110 | 30 | 36 |
| caster | **Tisseur** | Rare, attaque à distance (projectiles hostiles) | 26 | 14 | 24 |

Les archétypes se découvrent **un à un** : Ombre (jardins) → Traqueur → Tisseur
(bibliothèque) → Colosse (aile est, version « leçon d'esquive » aux dégâts plafonnés).

---

## 4. Progression complète (quêtes dans l'ordre)

La progression est **verrouillée par les pouvoirs** : aucun passage ne peut être
contourné (murs ≥ 4,8 m, salles intérieures plafonnées, brèches de 11,5 m).

### Acte 0 — Tutoriel (Jardins du Crépuscule)
1. **move** — Avancez avec ZQSD / WASD.
2. **look** — Orientez la caméra à la souris.
3. **jump** — Sautez (Espace) puis sprintez (Shift).
4. **lumen** — Rejoignez la lueur bleue près de la fontaine et parlez-lui (E).

### Acte 1 — Le château
5. **garden** — Repoussez les 2 Ombres des jardins → **la herse se lève**.
   *(Message : « Les jardins respirent à nouveau. Un grondement de chaînes : la herse du château se lève. »)*
6. **hall** — Franchissez la herse, entrez dans le grand hall.
7. **lever** — Trouvez le **levier de fer** (mur est du hall) → ouvre la **bibliothèque**.
8. **dash** — Dans la bibliothèque, grimpez l'escalier d'étagères (angle sud-ouest)
   jusqu'à la passerelle → piédestal du **Pas du vent** (touche 2).
9. **tower** — Avec le Pas du vent, franchissez le **pont brisé** du parvis est
   (brèche de 11,5 m) et grimpez la spirale intérieure de la **Tour du Levant** →
   piédestal de la **Main céleste** (touche 3) sur la terrasse.
10. **plate** — Avec la Main céleste, portez le **bloc runique** de l'armurerie sur la
    **plaque gravée** de l'aile est → la porte des **catacombes** coulisse.

### Acte 2 — Les catacombes (sous-sol, −8 m)
11. **crypt** — Descendez l'escalier ; traversez la salle des gardes (bivouac) puis
    l'**Ossuaire-labyrinthe** : sur l'unique bon chemin, le piédestal de la
    **Bénédiction** (touche 6), puis la **Clef d'or** au fond.
12. **gouffre** — Franchissez le **Gouffre des Morts** (brèche de 11,5 m) : saut sprinté
    + Pas du vent en plein vol → piédestal de l'**Égide** (touche 4) sur l'autre rive.
    *(Tomber n'est pas mortel : un escalier remonte du fond de la fosse.)*
13. **flamme** — Activez l'Égide **juste avant** de traverser le **rideau de flammes** →
    chambre de la **PREMIÈRE LARME**.

### Acte 3 — Le trône et au-delà
14. **throne** — Retour au hall : ouvrez la **porte à serrure d'or** (Clef d'or) au nord
    → salle du trône gardée par 2 Colosses → **DEUXIÈME LARME** sur le trône.
15. **lost** — Le **passage scellé** derrière le trône ne cède qu'aux porteurs de
    **2 Larmes** → les **Terres Perdues**.

### Acte 4 — Terres Perdues et Forêt de Nuit
16. **frost** — Dans les ruines, le piédestal du **Souffle glacé** (touche 5), gardé par
    des Colosses → éteignez les **ronces ardentes** qui ferment la Forêt de Nuit.
17. **grove** — Traversez le **labyrinthe** de la Forêt de Nuit (haies de 7,5 m,
    infranchissables). L'unique passage de la rangée médiane est un
    **arbre-sanctuaire flétri** : la **Bénédiction** le ranime et la haie s'écarte.
18. **tears** — Atteignez la **Clairière du Cœur** (niveau 10) et arrachez la
    **TROISIÈME LARME** à ses gardiens → **victoire** (écran « L'Aube renaît »).

---

## 5. Les énigmes en détail (avec leurs indices)

Chaque énigme a : un obstacle, une solution, un texte d'ambiance sur place, et un
indice donné par Lumen si on retourne le voir.

### 5.1 La herse des jardins
- **Obstacle** : la herse du château reste close.
- **Solution** : tuer les 2 Ombres marquées des jardins.
- **Sur place** : *« La herse restera close tant que des Ombres rôdent dans les jardins. »*
- **Indice Lumen** : *« Les Ombres craignent ton attaque. Vise du regard, frappe au clic gauche. La herse ne se lèvera qu'une fois les jardins purgés. »*

### 5.2 Le levier de la bibliothèque
- **Obstacle** : porte de la bibliothèque fermée (ouest du hall).
- **Solution** : actionner le levier de fer contre le mur est du hall.
- **Effet** : *« Un grondement traverse les murs : la porte de la bibliothèque s'ouvre à l'ouest. »*
- **Indice Lumen** : *« Cherche un levier de fer contre le mur est du grand hall. »*

### 5.3 L'escalier d'étagères (plate-forme)
- **Obstacle** : le Pas du vent est sur une passerelle à 6,7 m ; rayonnages-labyrinthe
  de 3,4 m infranchissables d'un saut.
- **Solution** : les étagères de l'angle sud-ouest forment un escalier (1,6 → 6,1 m).
- **Indice Lumen** : *« Dans la bibliothèque, les étagères de l'angle sud-ouest font un escalier vers la passerelle haute. »*

### 5.4 Le pont brisé (test du Pas du vent)
- **Obstacle** : brèche de 11,5 m vers la Tour du Levant (saut sprinté seul ≈ 9,4 m).
  La tour n'a **aucune porte au sol**.
- **Solution** : saut + Pas du vent en plein vol depuis la plateforme d'élan.
- **Borne sur place** : *« Seul le vent franchit ce que la pierre refuse. »*
- **Stèle de la tour** : *« La Tour du Levant ne s'ouvre qu'au ciel. Son seuil est un pont, sa clef est le vent. »*

### 5.5 Le bloc runique et la plaque gravée (télékinésie)
- **Obstacle** : la porte des catacombes est scellée par une plaque à pression.
- **Solution** : saisir le bloc runique de l'armurerie avec la Main céleste (touche 3 +
  clic) et le poser sur la plaque de la salle voisine.
- **Textes** : bloc — *« Un bloc gravé de runes, bien trop lourd pour vos bras. Seule une
  force céleste pourrait le soulever... »* ; plaque — *« Que le poids des runes ouvre la
  voie des morts. »* ; réussite — *« La plaque s'enfonce sous le bloc : la porte des
  catacombes coulisse dans la pierre. »*
- *(Astuce cachée : le bloc peut aussi servir d'escabeau, hauteur max prévue par le level design.)*

### 5.6 L'Ossuaire-labyrinthe
- **Obstacle** : labyrinthe sous plafond (murs de 5 m), la Clef d'or au fond.
- **Design** : la **Bénédiction est posée sur le SEUL chemin** menant à la Clef —
  impossible de rater le pouvoir nécessaire plus tard pour l'arbre-sanctuaire.
- **Fronton** : *« Ici dorment les gardiens d'Ombreciel. Que celui qui cherche la Clef longe le couchant. »* (= longer le mur ouest)
- **Indice Lumen** : *« Dans l'Ossuaire, longe le mur de l'ouest : la Bénédiction, puis la Clef d'or. »*

### 5.7 Le Gouffre des Morts
- **Obstacle** : fosse de 11,5 m sans pont, dans les deux sens.
- **Solution** : élan, saut, puis Pas du vent en plein vol.
- **Filet de sécurité** : la chute n'est pas mortelle, un escalier remonte du fond
  (où se cachent des bonus + un Colosse).
- **Sur place** : *« Le pont s'est effondré. Onze mètres de vide... Un saut sprinté, puis le Pas du vent en plein vol. »*

### 5.8 Le rideau de flammes (première Larme)
- **Obstacle** : porte de feu ; la traverser sans protection inflige des dégâts.
- **Solution** : activer l'**Égide** (touche 4) juste avant d'interagir.
- **Textes** : sans le pouvoir — *« Un rideau de feu scelle la chambre. Seul un voile de
  lumière pourrait l'écarter... »* ; échec — *« Les flammes vous repoussent ! Activez
  l'Égide (touche 4) JUSTE AVANT de traverser. »* ; réussite — *« L'Égide écarte les
  flammes : le rideau se lève dans un souffle de vapeur. »*
- **Épitaphe près de la Larme** : *« On l'a traînée ici pour qu'aucune aube ne la retrouve. »*

### 5.9 La serrure d'or (deuxième Larme)
- **Obstacle** : porte dorée au nord du hall.
- **Solution** : la Clef d'or de l'Ossuaire.
- **Textes** : *« Une serrure d'or scelle cette porte. La clef dort quelque part sous le
  château... »* → *« La Clef d'or tourne dans la serrure... La salle du trône vous est ouverte. »*

### 5.10 Le passage scellé (porte des Terres Perdues)
- **Obstacle** : porte runique derrière le trône.
- **Solution** : posséder **2 Larmes d'Aube**.
- **Texte** : *« Ce passage ne cédera qu'aux porteurs de deux Larmes d'Aube (x / 2). »* →
  *« Les deux Larmes réunies font vibrer la pierre... le passage s'ouvre vers les Terres Perdues. »*

### 5.11 Les ronces ardentes (entrée de la Forêt de Nuit)
- **Obstacle** : haie enflammée fermant la forêt.
- **Solution** : le **Souffle glacé** trouvé dans les ruines.
- **Textes** : *« Des ronces embrasées barrent la forêt. Elles ne craignent ni lame ni
  sort... sauf, peut-être, le givre. »* → *« Le Souffle glacé éteint les ronces : la
  Forêt de Nuit s'entrouvre en crissant. »*

### 5.12 L'arbre-sanctuaire flétri (cœur du labyrinthe)
- **Obstacle** : labyrinthe forestier (haies de 7,5 m) ; l'unique passage de la rangée
  médiane est bloqué par une haie morte liée à un arbre flétri.
- **Solution** : la **Bénédiction** (touche 6) ranime l'arbre — il reverdit à l'écran.
- **Textes** : *« L'arbre-sanctuaire est flétri, et la haie morte avec lui. Une
  Bénédiction dort dans l'Ossuaire des catacombes... »* → *« La Bénédiction ranime
  l'arbre-sanctuaire : la haie s'écarte devant sa sève neuve. »*

### 5.13 Secrets optionnels
- **Fausse haie** (labyrinthe de haies des jardins, zone optionnelle) : une haie
  traversable cache un Fragment de vitalité + un cœur.
  *Indice : « Cette haie semble plus sombre que les autres... et l'air y circule. »*
- **Fausse étagère** (mur nord de la bibliothèque) : alcôve secrète avec un Fragment
  de vitalité. *Indice : « Cette étagère ne porte aucune poussière... comme si on la
  déplaçait souvent. »*
- **Fond du Gouffre** : Fragment de vitalité + 2 essences d'ombre (gardés par un Colosse).
- **Fragments de vitalité** : +25 PV max chacun (aussi dans l'Ossuaire et la forêt).

---

## 6. Les zones (courbe de difficulté)

| # | Zone | Niveau | Ennemis dominants |
|---|---|---|---|
| 1 | Jardins du Crépuscule (départ) | 1 | Ombres du tutoriel, 1 Traqueur |
| 2 | Grand hall | 2 | Ombres, Traqueur |
| 3 | Bibliothèque | 2 | + premier Tisseur |
| 4 | Aile est | 3 | + premier Colosse (affaibli) |
| 5 | Parvis du Levant + Tour | 3 | Ombre, Traqueur, Tisseur |
| 6 | Salle des gardes (catacombes) | 4 | Colosse, Tisseur |
| 7 | Ossuaire | 5 | Traqueurs, Tisseur |
| 8 | Gouffre des Morts | 5 | Colosse (fosse) |
| 9 | Salle du trône | 6 | 2 Colosses + Tisseur |
| 10 | Ruines des Terres Perdues | 7 | 2 Colosses, Tisseur |
| 11 | Forêt de Nuit | 8 | Traqueurs en meute |
| 12 | Clairière du Cœur (final) | 10 | 2 Colosses + Tisseur + Traqueur |

Un « directeur de renforts » repeuple les zones (cap par zone) et affiche à l'entrée :
*« — [Zone] : les ombres y sont de niveau N — »*.

**Points de contrôle (bivouacs)** : salle des gardes, Terres Perdues, cœur de la forêt,
Clairière du Cœur — soin complet + point de renaissance. Ramasser une Larme fait aussi
checkpoint.

---

## 7. Les pouvoirs (ordre d'obtention)

| Touche | Pouvoir | Où | Rôle dans la progression |
|---|---|---|---|
| 1 | **Attaque de la voie** (Trait astral…) | dès le départ | combat, purge des jardins |
| 2 | **Pas du vent** (dash) | passerelle de la bibliothèque | pont brisé, Gouffre des Morts |
| 3 | **Main céleste** (télékinésie) | sommet de la Tour du Levant | bloc runique → plaque des catacombes |
| 6 | **Bénédiction** (soin) | Ossuaire (chemin obligatoire) | ranime l'arbre-sanctuaire |
| 4 | **Égide** (bouclier) | rive est du Gouffre | rideau de flammes |
| 5 | **Souffle glacé** (gel) | ruines des Terres Perdues | éteint les ronces ardentes |

Chaque piédestal joue un petit texte d'apprentissage, ex. : *« Pas du vent appris !
(touche 2, puis clic) Un élan fulgurant qui franchit les gouffres. »*

### Arbre des pouvoirs (K) — 4 arbres par voie + tronc commun
- **Commun (Essence)** : Vitalité (+40 PV), Sagesse (+40 PM), Célérité (−25 % récupération).
- **Mage** : Foudre (éclair enchaîné → Tempête astrale), Cataclysme (explosion → brûlure),
  Puissance (+60 % → rayon perforant), Transcendance : Ascension astrale.
- **Guerrier** : Séisme (onde 360° → étourdissement), Combo (3ᵉ coup ×2 → Fureur),
  Colosse (+70 % + vol de vie → Exécution sous 30 % PV), Transcendance : Corps de titan.
- **Assassin** : Corbeau/sniper (dégâts à distance ×2,5 → Tir fatal ×3), Lames (2 puis
  5 dagues), Venin (poison → Danse des ombres), Transcendance : Voile d'ombre.
- **Paladin** : Jugement (+55 % → Verdict, onde de lumière), Rempart (−25 % dégâts subis
  → Représailles), Lumière (portée +1,2 m → Consécration), Transcendance : Avatar de l'Aube.

---

## 8. Récolte & artisanat

| Ressource | Source | Recette |
|---|---|---|
| ☘ **Herbes lunaires** | jardins + forêt | **H** : potion de soin (2 herbes → +30 PV) |
| ● **Essences d'ombre** | lâchées par les Ombres / trouvées au sol | **O** : 3 essences → 1 **Orbe d'obscurité** |
| ◉ **Orbes d'obscurité** | artisanat | **C** : 2 orbes → **Transcendance** (attaque en zone) ; puis 3 orbes → **Ailes d'Ombreciel** (double saut + plané, Espace maintenu) |

Autres ramassables : cristaux de mana (+35 PM), cœurs (+30 PV), Fragments de vitalité
(+25 PV max), la **Clef d'or**, et bien sûr les **3 Larmes d'Aube**.

---

## 9. Systèmes annexes (pour mémoire)

- **Coop écran scindé** : un second porteur de flamme jouable au smartphone-manette
  (QR / `?controller=ID`), avec sa propre voie.
- **Sauvegarde** : automatique (`ombreciel_save_v7` — les sauvegardes v6 sont
  invalidées par la refonte des niveaux).
- **Anti-glitch** : saut max ≈ 2,85 m (+0,62 m de rebord, +1,1 m avec le bloc-escabeau) ;
  tous les murs de progression font ≥ 4,8 m, les intérieurs ont un plafond, les brèches
  au Pas du vent font 11,5 m.
- **Mort** : retour au dernier bivouac — *« Les ombres vous ont submergé... Vous rouvrez
  les yeux près du dernier feu de bivouac. »*

---

## 10. Résumé du fil rouge en une ligne par étape

Réveil aux jardins → Lumen raconte la Nuit sans lune → purger les jardins (herse) →
hall → levier → bibliothèque → **Pas du vent** → pont brisé → Tour du Levant →
**Main céleste** → bloc runique sur la plaque → catacombes → Ossuaire (**Bénédiction**
+ Clef d'or) → Gouffre des Morts → **Égide** → rideau de flammes → **Larme 1** →
serrure d'or → trône → **Larme 2** → passage scellé (2 Larmes) → Terres Perdues →
**Souffle glacé** → ronces ardentes → Forêt de Nuit (labyrinthe) → arbre-sanctuaire
ranimé → Clairière du Cœur → **Larme 3** → **L'Aube renaît**.
