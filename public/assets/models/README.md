# Modèles 3D (.glb / .fbx)

Déposez ici des modèles glTF binaires (`.glb`) ou FBX (`.fbx`, textures
intégrées supportées — l'extension `.glb` est essayée d'abord). L'AssetManager
tente de charger les fichiers suivants ; si un fichier est absent, la
géométrie primitive d'origine (cônes/boîtes/cylindres) est utilisée à la place :

```
player_mage.glb        silhouette du Mage (J1/J2)
player_warrior.glb     silhouette du Guerrier
player_assassin.glb    silhouette de l'Assassin
enemy_sentinel.glb     Sentinelle d'ombre
enemy_wraith.glb       Spectre
enemy_brute.glb        Colosse
enemy_caster.glb       Tisseur
tree.glb               arbres des jardins
torch.glb              support de torche (la flamme/halo/lumière restent procéduraux)
```

## Décor fourni (normalisé : pieds à y=0, centré, dimensions en mètres)

| Fichier | Contenu | Usage en jeu |
|---------|---------|--------------|
| `tree.glb`       | arbre mort tortueux (scan, 18k tris) | arbres des jardins et de la friche (`tree()`) |
| `maple_tree.glb` | érable feuillu (~4,6 m) | mêlé aux arbres 1 fois sur 3 (`tree()`) |
| `trees_1.glb`    | grand arbre mort aux racines massives (~10,5 m) | « bosquets » en lisière des Terres Perdues |
| `mosque.glb`     | bâtisse à dômes (scan, simplifié 500k→152k tris) | « Sanctuaire de l'Arbre », repère des Confins d'Ombre (collision pleine + interaction) |

Optimisations appliquées : simplification meshoptimizer, textures ≤ 1k WebP,
matériaux unlit convertis en lit (pour réagir aux torches et à la nuit),
spec/gloss converti en metal/rough (three r182 ne lit plus cette extension).
NB : `tree_1.glb` (téléversé) était un doublon exact de `tree.glb`
(même géométrie, texture moins fine) — non retenu.

Convention : le modèle doit être centré sur l'origine, posé sur y=0,
et occuper environ 1,7 unité de haut pour les personnages (1 unité = 1 mètre).
Les effets magiques (halos, yeux lumineux, lumières) sont ajoutés par le code.

## Personnages — `character_*.glb`

Humanoïdes Mixamo (textures intégrées, converties en WebP 1k) déclinés par
rôle via `characterClone(role, hauteur, id)` dans `AssetManager.js`
(normalisation : hauteur en mètres, pieds au sol, centrage — peu importe
l'échelle du fichier ; pose de repos automatique si le fichier est en T-pose ;
un vrai clip d'animation embarqué est joué en boucle) :

| Fichier | Nom en jeu | Origine |
|---------|-----------|---------|
| `character_2.glb` | Warrok     | « Warrok W Kurniawan » (créature monstrueuse) |
| `character_3.glb` | Voltigeuse | « Ch03 » (athlète aux couettes bleues) |
| `character_8.glb` | Rôdeur     | « Ch45 » (silhouette furtive sombre) |

· **Gentils** : le sélecteur « Personnage » du menu titre permet d'incarner
  n'importe lequel (rôle `hero` : couleurs d'origine + douce lueur d'âme ;
  le J2 reçoit un voile pourpre en coop). La « Silhouette de la voie »
  d'origine (Mage/Guerrier/Assassin/Paladin) reste le choix par défaut.
· **Méchants** : les créatures d'ombre utilisent `character_2` avec une
  teinte/lueur maléfique par archétype :

| Rôle (méchant) | Adaptation |
|----------------|------------|
| `sentinel` (Ombre)    | teinte violet nocturne, lueur froide |
| `wraith` (Traqueur)   | silhouette amincie, semi-translucide, lueur spectrale verte |
| `brute` (Colosse)     | gabarit ×1,75, teinte braise rougeoyante |
| `caster` (Tisseur)    | teinte pourpre magique saturée |

Pour ajouter un personnage jouable : déposer `character_<n>.glb` (ou `.fbx`
≥ 7.0) et l'inscrire dans `CHARACTER_DEFS` (AssetManager.js). Les modèles
`player_<voie>.glb/.fbx` restent prioritaires sur la silhouette d'une voie.
