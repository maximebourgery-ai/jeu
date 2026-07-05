# OMBRECIEL — Script complet du jeu (v8)

> Document de relecture : histoire, personnages, progression, énigmes, textes en jeu,
> zones, ennemis, pouvoirs et systèmes annexes. Tout est tiré du code actuel
> (`src/state.js`, `src/World.js`, `src/Tower.js`, `src/Quests.js`, `src/Crafting.js`, `index.html`).
> La v7.1 intègre le Game Design Document « Narratif & Technique » : l'Ascension de la
> Tour du Levant (15 étages) et les spécifications techniques (§ 11).

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
| sentinel | **Ombre** | Basique, équilibrée (violet sombre, yeux cyan) | 34 | 14 | 12 |
| wraith | **Traqueur** | Ultra-rapide, fragile (silhouette verte, yeux acides) | 19 | 9 | 16 |
| brute | **Colosse** | Très lent, dévastateur (masse rouge sombre, yeux braise) | 118 | 30 | 36 |
| caster | **Tisseur** | Rare, attaque à distance (projectiles hostiles) | 30 | 15 | 24 |

*(v7.4 : stats de base relevées de ~10-15 % — le début du jeu pardonne un peu
moins. Les ombres du tutoriel des jardins restent bridées : 27 PV / 9 dégâts.)*

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

## 4 bis. L'épreuve ultime — l'Ascension de la Tour du Levant (15 étages)

Accessible depuis la **terrasse de la Tour du Levant** (portail doré) une fois les
**six arts anciens** maîtrisés. Quinze étages thématiques répartis en **4 paliers
instanciés**, séparés par d'immenses **portails runiques** ; un vestibule-sas
distribue les paliers et leurs **raccourcis** (débloqués en battant chaque Maître).

| Palier | Étages | Thème | Zone notable | Boss (Maître d'Étage) | Récompense |
|---|---|---|---|---|---|
| I — Les Archives Vertigineuses | 1-4 | savoir oublié, encre et magie | rayonnages-labyrinthe, parchemins en lévitation | **L'Archiviste Corrompu** — Tisseur géant : tempêtes de parchemins (bordées radiales) + Traqueurs d'encre invoqués | **Clef de Cuivre** |
| II — La Serre des Ombres | 5-9 | nature corrompue, verticalité, lierre et poison | **la Salle de l'Alchimiste** (hub d'artisanat secondaire : potion / orbe / transcendance + bivouac) | **La Racine Vengeresse** — abomination liée à un arbre-sanctuaire corrompu ; sa sève absorbe les coups, seule la **Bénédiction** (touche 6) prononcée tout près la rend vulnérable ; racines-harpons télégraphiées | **Clef de Sève** |
| III — Le Donjon de Fer | 10-14 | pièges mortels, lave froide, armures vides | **la Fosse Mécanique** — labyrinthe de rideaux de flammes permanents : l'**Égide** ou rien | **Le Chevalier de l'Éclipse** — armure lourde ; FSM stricte IDLE / CHASE / ATTACK_AOE / STUNNED ; étourdi uniquement par l'impact d'un **bloc runique porté par la Main céleste** ; altère l'arène (colonnes de feu par cycles) | **Clef d'Éther** |
| IV — Le Sommet | 15 | calme, astres et révélations | **l'Observatoire de l'Aube** (télescope, autel aux trois serrures) | — | **l'Aura du Premier Foyer** |

**L'Observatoire de l'Aube** : insérer les 3 Clefs confère l'**Aura du Premier Foyer**
(+15 % de dégâts toutes voies, régénération lente, halo doré). Lumen y révèle **le
lourd secret du jeu** : les ombres ne sont pas des envahisseuses — ce sont les
premiers porteurs de flamme, dévorés par la lumière trop pure des Larmes d'Aube,
sacrifiés pour sauver le monde. *« Chaque ombre que tu affrontes fut une aube,
avant toi. »*

---

## 4 ter. L'OUTRE-CIEL — la suite du scénario (v8, étages 16-20)

> **Le fil rouge du v8** : l'Aura du Premier Foyer rend leur **voix** aux ombres.
> La première à parler, **Maëla**, révèle la vraie cause de la Nuit sans lune :
> une lumière trop pure projette une ombre à sa mesure — **l'Avale-Lune**,
> l'ombre des Larmes elles-mêmes, qui a gobé la lune il y a cent ans et la
> digère encore. Rendre la lune au ciel est le **vrai final** du jeu.

### Les 5 nouveaux étages (2 paliers instanciés)

| Palier | Étages | Thème | Progression | Boss | Récompense |
|---|---|---|---|---|---|
| V — **L'Outre-Ciel** | 16-18 | îles flottantes par-delà le firmament, troupeau d'étoiles, vide mortel (Kill Z → entrée du palier) | étage 16 : piédestal de la **Nova d'Aurore** (touche 7) + Orin ; étage 17 : chapelet d'îles au Pas du vent, 3 **Éclats d'étoile** à retrouver, bivouac « le Belvédère des étoiles » ; étage 18 : accessible uniquement par le **pont de constellations** retissé par Orin | **Le Berger des Étoiles** — Séraphin géant : bordées d'étoiles filantes, **pluie d'étoiles** télégraphiée (colonnes de lumière), invoque des Échos de l'Aube | **Clef d'Astre** |
| VI — **Le Cœur de la Nuit sans lune** | 19-20 | l'instant du désastre figé : lune à demi avalée au plafond, débris en suspension, mares de **nuit liquide** | étage 19 : piédestal de l'**Astre d'Aube** (touche 8) gardé par deux Titans, bivouac « la Veille du Bout de la Nuit », **porte de la Dernière Nuit** ouverte par le Veilleur ; étage 20 : l'arène finale | **L'Avale-Lune** — voile de nuit qui absorbe 90 % des dégâts : seule la **Nova d'Aurore prononcée tout contre elle** le déchire 7 s (×1,4 dégâts) ; voile dévorant radial, **crocs de nuit** télégraphiés, gueulée de zone à active frames, enragée sous 50 % PV | **la Couronne de l'Aube** (+10 % dégâts, régénération d'esprit, diadème de lumière) + le **vrai épilogue** (la lune rendue au ciel) |

### Les PNJ (on leur parle pour découvrir l'histoire ET progresser)

| PNJ | Où | Rôle narratif | Verrou de progression |
|---|---|---|---|
| **Maëla, l'Ombre Souvenante** | Observatoire (étage 15), agenouillée près de l'autel — muette tant que l'Aura ne brûle pas | première ombre à retrouver sa voix ; révèle l'Avale-Lune, le Berger, et l'existence des deux arts perdus | son dialogue **nomme le porteur au Seuil de l'Outre-Ciel** (le portail du Palier V reste clos sans elle) |
| **Orin, le cartographe céleste** | île d'entrée de l'Outre-Ciel (étage 16), fantôme d'astronome | cartographe mort sur place ; humour de spectre ; indique où sont les Éclats | **quête des 3 Éclats d'étoile** → il retisse le **pont de constellations** vers l'île du Berger (étage 18) |
| **Le Veilleur sans Nom** | devant la porte de la Dernière Nuit (étage 19) — frère du Chevalier de l'Éclipse | garde amnésique ; enseigne la mécanique du voile (Nova tout contre, frapper quand il « saigne de lumière ») | son dialogue **lève la porte de la Dernière Nuit** (étage 20) |

### Les 2 nouveaux pouvoirs (effets très lumineux)

| Touche | Pouvoir | Où | Effets |
|---|---|---|---|
| 7 | **Nova d'Aurore** (45 PM, 12 s) | piédestal de l'étage 16 | colonne de lumière, **triple anneau d'aube** en cascade, 360°, étourdit 1,3 s + brûlure dorée — **le seul art qui déchire le voile de l'Avale-Lune** |
| 8 | **Astre d'Aube** (60 PM, 16 s) | piédestal de l'étage 19 | télégraphe au sol, **comète** qui plonge sur le point visé (lumière portée + sillage doré), explosion de zone (85 dég. + brûlure + étourdissement) et **colonne d'aurore** à l'impact |

*(Manette : croix haut = Nova, croix bas = Astre. Tactile : deux nouveaux
boutons dans l'arc de sorts. Clavier : touches 7 et 8.)*

### Les 3 nouveaux ennemis (niveaux 14-16)

| Type | Nom | Profil |
|---|---|---|
| seraph | **Séraphin déchu** | garde ailée du Berger — ailes de lumière fanée, anneau brisé, bordées à distance |
| echo | **Écho de l'Aube** | la vitesse faite ombre — cœur incandescent, double traînée, plus rapide qu'un Traqueur |
| obsidian | **Titan d'obsidienne** | muraille de roche en fusion — très lent, dévastateur, éclats incandescents aux épaules |

### L'épilogue vrai (Couronne reçue)

> Le voile de la Dernière Nuit se déchire d'un bord à l'autre du ciel — la lune
> en tombe, immense, intacte. Partout, les ombres s'arrêtent et lèvent leurs
> yeux clairs vers la première vraie nuit depuis cent ans. *« Il reste des
> ombres, oui — mais plus une seule qui soit orpheline du ciel. »*

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

### 5.2 bis (v7.4) Les énigmes DURCIES

La v7.4 complexifie l'accès aux pouvoirs et aux objectifs-clefs :

- **L'énigme des trois flammes** (remplace le levier unique) : trois leviers
  ceignent le grand hall — **Levant** (mur est), **Midi** (côté entrée, au sud),
  **Couchant** (mur ouest). Il faut les actionner **dans l'ordre de la course du
  soleil** (Levant → Midi → Couchant). Une erreur réarme tout dans un claquement
  sec. L'indice est gravé sur une plaque près de l'entrée du hall :
  *« Trois flammes gardent le savoir. Le Levant l'éveille, Midi la porte, le
  Couchant l'endort. Suis la course du soleil, et le savoir s'ouvrira. »*
  Chaque levier abaissé allume une flamme-témoin dorée (1/3, 2/3...).
- **Les plaques jumelles** (catacombes) : la porte exige désormais **DEUX
  plaques chargées EN MÊME TEMPS**. Le premier bloc runique est au sol de
  l'armurerie ; le second dort **tout en haut de la pile de caisses** (il faut
  lever les yeux). Retirer une charge relâche sa plaque. Alternative coop :
  un bloc sur une plaque + les deux porteurs réunis sur l'autre.
- **Les feux des morts** (Ossuaire) : la Clef d'or n'est plus posée au détour
  d'un couloir — elle dort dans une **châsse de pierre scellée**. Il faut
  trouver et **étouffer les trois braseros violets** dispersés dans le
  labyrinthe pour que la châsse s'ouvre. Le fronton l'annonce : *« ...et que
  s'éteignent les trois feux des morts : alors la châsse s'ouvrira. »*

### 5.13 Secrets optionnels
- **Fausse haie** (labyrinthe de haies des jardins, zone optionnelle) : une haie
  traversable cache un Fragment de vitalité + un cœur.
  *Indice : « Cette haie semble plus sombre que les autres... et l'air y circule. »*
- **Fausse étagère** (mur nord de la bibliothèque) : alcôve secrète avec un Fragment
  de vitalité. *Indice : « Cette étagère ne porte aucune poussière... comme si on la
  déplaçait souvent. »*
- **Fond du Gouffre** : Fragment de vitalité + 2 essences d'ombre (gardés par un Colosse).
- **Fragments de vitalité** : +25 PV max chacun (aussi dans l'Ossuaire et la forêt).
- **Les Éclats d'Aube étoilée** (v7.4 — 3 secrets à VRAI boost) : réunir les
  trois confère la **Faveur des Étoiles** : **+15 % de dégâts permanents
  (toutes voies) et +20 PM max**.
  1. **L'offrande de la fontaine** (Jardins) : sonder le bassin avec une
     essence d'ombre en poche — *« Une part d'ombre pour une part d'étoile. »*
  2. **Les décombres du pont** (fond du Gouffre des Morts, gardé par un
     Colosse) : fouiller les dalles brisées de l'ancien pont.
  3. **L'arbre aux lucioles** (couloir perdu de la Forêt de Nuit) : un arbre
     éteint que seule la **Bénédiction** ranime — les lucioles rendent l'Éclat.
- **Les Confins d'Ombre** (friches optionnelles) : deux champs en friche flanquent la
  salle du trône, accessibles uniquement en longeant la lisière de la Forêt de Nuit
  (bande étroite au sud des ruines) puis en contournant les murs des Terres Perdues.
  Une torche violette à l'angle des ruines signale l'entrée d'ouest.
  - **Champ d'ouest — le Sanctuaire de l'Arbre** : bâtisse à dômes oubliée (+ un cœur).
    *« Avant le château, avant les Larmes, un arbre veillait déjà sur la vallée. Son
    sanctuaire tient encore debout — la Nuit n'ose pas y entrer. »*
  - **Champ d'est — la Flèche des Confins** : aiguille de pierre runique (+ mana).
    *« Ici finit la carte des anciens. Ce qui suit n'appartient qu'à ceux qui osent. »*

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

### 7 bis. Le combat (v7.4) — balistique, critiques, combos, Forge des Arts

- **Vraie balistique** : les projectiles (Trait astral, dagues) **retombent en vol**
  (gravité 5,2 pour le Mage, 3,4 pour les dagues plus tendues de l'Assassin). À la
  souris, il faut viser au-dessus d'une cible lointaine et gérer sa distance ; la
  visée aimantée (tactile/manette) compense automatiquement la chute.
- **Coups critiques contextuels** — la *façon* de toucher décide, le meilleur
  multiplicateur s'applique seul (jamais de cumul) :
  · **En pleine tête** (tout projectile au-dessus des épaules) : ×1,6 ;
  · **Dans le dos** (mêlée, toutes voies — l'ennemi vous tourne le dos) : ×1,75 ;
  · **Dans le dos** (Assassin, à distance) : ×2,5 · **Tir fatal** (Assassin, >14 m) : ×3.
- **Enchaînement (combo)** : chaque coup au but empile le compteur **COMBO ×N**
  (+5 % de dégâts par coup, plafonné à +40 %) ; 2,2 s sans toucher — ou un seul
  coup encaissé — le brise. Le 3ᵉ coup du Guerrier (nœud Enchaînement) reste ×2.
- **Lisibilité** : nom + **niveau au-dessus de la tête** des ennemis, **PV en
  chiffres** sous leur barre, **chiffres de dégâts flottants** au point d'impact
  (dorés et grossis sur critique, avec étiquette « DANS LE DOS ! », « EN PLEINE
  TÊTE ! »...), « +N XP » à chaque ombre vaincue.
- **Effets par voie** : double croissant de taillade du Guerrier, pilier d'aube du
  Paladin sur chaque cible frappée, dagues effilées orientées dans le sens du vol
  pour l'Assassin, flash d'impact et explosion/onde au sol pour le Mage.
- **Variété des ombres** : chaque ombre standard naît avec sa propre carrure (±15 %,
  les grandes sont plus coriaces) ; les renforts peuvent naître **Alpha** (couronne
  d'épines, halo doré, ×2,2 PV, ×1,35 dégâts, ×2,5 XP).
- **Forge des Arts (K)** : chaque niveau gagné forge **1 Éclat de puissance**, à
  dépenser dans le panneau de l'arbre pour monter chaque sort en rangs (5 max) :
  attaque +10 %/rang, Pas du vent −7 % de récupération/rang, Égide +0,8 s/rang,
  Souffle glacé +18 % et zone élargie/rang, Bénédiction +12 PV/rang. L'AUTRE façon
  de devenir puissant, en parallèle de l'arbre des pouvoirs.

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
- **Mort (v7.4)** : en solo, un **écran GAME OVER** (« VOUS ÊTES TOMBÉ ») s'affiche ;
  pendant ~4 secondes les ombres « se referment » (aucun choix possible), puis le
  porteur **choisit à quel feu de bivouac découvert** il rouvre les yeux (60 % des
  PV, pleine mana, 1,5 s d'invulnérabilité au réveil). En coop, la renaissance
  immédiate au dernier bivouac est conservée (l'écran scindé continue de vivre
  pour l'autre porteur).
- **Carte d'Ombreciel (v7.4, touche M / bouton 🗺)** : carte stylisée du monde
  (canvas) — traits fixes du château, **noms des zones dévoilés en explorant**,
  sous-sol en pointillés, position et orientation du porteur, objectif ✧, et
  **feux de bivouac découverts cliquables = téléportation** (interdite en plein
  combat, comme la matrice des Bivouacs).
- **Décor 3D** : vraies textures Poly Haven (plancher `plank_flooring_04`, briques
  `slumped_mortar_brick`) ; arbres variés — chêne mort (scan) et érable feuillu alternés
  déterministiquement selon la position, orientation stable — ; bosquets denses
  (`trees_1`) en lisière des Confins ; Sanctuaire de l'Arbre (bâtisse à dômes, collision
  pleine) et Flèche des Confins comme repères des friches optionnelles.

---

## 11. Spécifications techniques (v7.1)

- **Level streaming de la Tour** : 4 paliers **instanciés** — un seul existe en mémoire
  à la fois ; franchir un sas décharge l'étage précédent et charge le suivant sans
  écran de chargement. Sas en « S » entre les paliers (aucune ligne de vue). Les
  collections du monde (colliders, portes, objets, ennemis) retrouvent exactement leur
  état d'avant l'instance : les index de sauvegarde restent stables.
- **Flags stricts** : l'ouverture des portails dépend de `hasKilledBoss && hasFloorKey`
  (jamais de trigger physique).
- **Anti-glitch** : murs de progression ≥ 4,8 m, brèches au Pas du vent de 11,5 m,
  colliders systématiques aux plafonds intérieurs (Tour comprise) ; **Kill Z-volume** :
  toute chute dans le vide téléporte au dernier feu de bivouac (dans la Tour : à
  l'entrée du palier courant) — jamais de crash ni de chute infinie.
- **Caméra 3ᵉ personne** : *spring arm* dynamique (rétractation instantanée au contact
  d'un mur, retour lissé anti-mal-de-mer) ; **dithering** — les murs occultant encore la
  caméra passent à 20 % d'opacité (matériau cloné par mesh, jamais le matériau
  partagé) ; **lock-on axe Z** — en combat rapproché, la verticalité extrême du regard
  est bridée en douceur.
- **Boss & IA** : FSM stricte du Chevalier de l'Éclipse (IDLE / CHASE / ATTACK_AOE /
  STUNNED, transition STUNNED conditionnée à l'impact du « projectile Main céleste ») ;
  **hitboxes asymétriques** — hurtbox sur les os exposés du dos (×1,6), armure de face
  (×0,35), ×2 étourdi ; la hitbox de dégâts du boss n'existe que pendant les **active
  frames** de son animation d'attaque.
- **Sauvegarde (`ombreciel_save_v7`)** : enregistre l'avancée de la Tour (clefs de
  palier, Maîtres vaincus, raccourcis, Aura) et les bivouacs découverts ; **auto-save
  forcée** au ramassage de chaque clef ; une sauvegarde faite dans l'instance ramène
  à la terrasse au chargement (l'instance n'existe plus, la progression si).
- **Voyage rapide** : interface de **matrice des Bivouacs** au repos à un feu —
  **interdit si le joueur est en combat** (une ombre en chasse à portée).
- **Coop** : si le Joueur 2 chute, un **rubber-banding** le téléporte au bord du dernier
  appui au sol du Joueur 1 (avec pénalité) ; **énigme à poids synchronisée** — Joueur 1
  + Joueur 2 réunis sur la plaque gravée pèsent le poids d'un Colosse (alternative
  coop au bloc runique).

### 11 bis. Refonte du gameplay mobile (v7.2)

- **Un bouton par sort** sous le pouce droit (plus de cycle ⟳) : arc de 5 boutons
  autour du bouton d'attaque, chacun avec **voile de recharge** qui descend et
  **grisage** si la mana manque ; les boutons n'apparaissent qu'une fois l'art appris.
  L'icône du bouton d'attaque reflète l'arme de la voie (✦ ⚔ 🗡 ✙). La rangée de
  sorts « clavier » du bas est masquée en mode tactile (doublon).
- **Visée jamais figée** (tactile & manette) : un **aimant doux** choisit la meilleure
  cible dans le cône de regard (± 18° pour accrocher, ± 31° d'hystérésis pour garder,
  46 m max, ligne de vue vérifiée) — marqueur **◈ orange** au-dessus de la cible ;
  **toucher un ennemi à l'écran le verrouille 6 s** (marqueur doré, toucher le vide
  relâche) ; **glisser le bouton d'attaque sans le lâcher affine la visée pendant le
  tir** (double-stick, sensibilité réduite pour la précision) ; chaque coup **recentre
  brièvement la caméra** vers la cible sans jamais voler le contrôle. À la souris
  (pointer lock) : visée libre 100 % manuelle, rien ne change.
- **La mêlée pardonne** : Frappe lourde et Marteau d'aube partent vers la cible
  aimantée même si le réticule est à côté.
- **Animations d'attaque par voie** (bras armé monté sur pivot d'épaule,
  `Animations.js`) : estocade du bâton + pointe qui flamboie (Mage), taillade épaule +
  torsion (Guerrier), jets de dagues alternés droite/gauche (Assassin), marteau levé
  haut puis abattu (Paladin) ; **traînées de coups** (arc lumineux orienté dans la
  direction du coup) et **anneaux d'onde de choc au sol** (Verdict, Fureur, Souffle
  glacé, Onde de choc).
- **Pas du vent directionnel** : suit le joystick tactile / stick manette (plus
  seulement le clavier).
- **Divers tactile** : un tap bref sur le bouton d'attaque frappe immédiatement (le
  coup part au `pointerdown`), retour haptique léger (vibration) au lancement d'un
  sort et au verrouillage d'une cible, zones adaptées aux encoches
  (`env(safe-area-inset-*)`).

### 11 ter. L'Horloge d'Ombreciel — cycle jour/nuit & sanctuaires (v7.3)

- **Horloge du monde** (`DayNight.js`) : `G.hour` (0-24, **sauvegardée**) avance en
  continu — une journée complète dure **16 minutes réelles** (1 h du monde = 40 s).
  La partie **commence à 9 h du matin** : les premières quêtes se vivent de jour.
  Aube 6 h → 8 h, crépuscule 20 h → 22 h (fondus doux). Affichée au HUD (`#clock`,
  ☀ doré le jour / ☾ bleuté la nuit), bascule annoncée à l'écran.
- **On VOIT le cycle** : ciel de jour (bleu, horizon doré) fondu sur le ciel de nuit
  étoilé, **soleil qui parcourt la voûte** d'est en ouest (la lumière directionnelle
  le suit), lune et étoiles ravivées la nuit, brouillard, lumières hémisphérique/
  ambiante et exposition interpolés en continu.
- **La nuit est dangereuse** (via `S.nightK` / `S.nightMul`) : dégâts des ombres
  jusqu'à **×1,8**, vitesse de chasse +18 %, renforts du directeur plus fréquents
  (-40 % d'intervalle) et plus coriaces (+40 % PV), lueur de braise sanguine sur les
  ombres — mais leur chute rapporte **+50 % d'expérience** (risque → récompense).
- **Sanctuaires des bivouacs** : dans un rayon de **9 m** autour de chaque feu
  (cercle doré visible au sol), les ombres **refusent d'entrer et refluent**, le
  directeur n'invoque jamais rien, et le porteur de flamme se **régénère** (+2,5
  PV/s) — le havre idéal pour forger ses potions, dépenser ses points de pouvoir et
  laisser passer la nuit. Nouveau **bivouac de la fontaine** dans les Jardins : la
  zone de départ est un sanctuaire. Les Maîtres d'Étage (FSM) ignorent les
  sanctuaires.
- **Unification du code** (dette des sessions parallèles) : `rayHitDist` partagé
  par les deux réticules, `applyDash` J1/J2, `healSelf(pl)` J1/J2, `occludeDist` et
  `flapWings` partagés par les deux caméras. La branche `game-review-deploy`
  (fusion alternative avec textures lourdes, sans la Tour) est **obsolète** : tout
  ce qu'elle contenait d'utile est déjà dans cette lignée, le reste a été supplanté
  par le rendu 100 % procédural.
- **Fusion de la session « visibility-aiming »** : menu **⚙ Réglages** (pause) —
  sensibilité souris/tactile, sensibilité manette, zone morte du stick, inversion
  d'axe Y, luminosité nocturne — persistés en `localStorage`
  (`ombreciel_settings_v1`). Visée manette : **zone morte rééchelonnée** (fini le
  saut au seuil) et **courbe de réponse** façon FPS moderne (précision fine, même
  vitesse max). Lumière personnelle du joueur agrandie (les 4 voies). Sa nuit
  éclaircie devient la **palette nocturne de base** du cycle jour/nuit, et son
  curseur « luminosité nocturne » module cette palette (le plein jour n'en a pas
  besoin). Ses boutons de sorts tactiles (colonne fixe sans état) ont été
  **supplantés** par la barre de sorts de la refonte mobile (recharge visible,
  grisage mana, apparition à l'apprentissage).

---

## 10. Résumé du fil rouge en une ligne par étape

Réveil aux jardins → Lumen raconte la Nuit sans lune → purger les jardins (herse) →
hall → levier → bibliothèque → **Pas du vent** → pont brisé → Tour du Levant →
**Main céleste** → bloc runique sur la plaque → catacombes → Ossuaire (**Bénédiction**
+ Clef d'or) → Gouffre des Morts → **Égide** → rideau de flammes → **Larme 1** →
serrure d'or → trône → **Larme 2** → passage scellé (2 Larmes) → Terres Perdues →
**Souffle glacé** → ronces ardentes → Forêt de Nuit (labyrinthe) → arbre-sanctuaire
ranimé → Clairière du Cœur → **Larme 3** → **L'Aube renaît**.
