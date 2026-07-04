# Textures PBR

Déposez ici les jeux de textures PBR. L'AssetManager cherche, pour chaque
famille de matériau, les fichiers suivants (extensions essayées dans
l'ordre : `.jpg`, `.png`, puis `.exr` via `EXRLoader`) :

```
<famille>_color.jpg       (albedo / couleur — obligatoire pour activer la famille)
<famille>_normal.jpg      (optionnel)
<famille>_roughness.jpg   (optionnel — .exr supporté, ex. brick_roughness.exr)
<famille>_metalness.jpg   (optionnel)
```

Espaces colorimétriques : les maps `_color` sont chargées en sRGB ; les maps
de données (`_normal`, `_roughness`, `_metalness`) restent en espace linéaire
(les `.exr` sont linéaires par nature).

Familles reconnues (utilisées par les matériaux du jeu) :

| Famille | Utilisée par |
|---------|--------------|
| `brick` | murs du château (`stone`, `stoneD`) |
| `stone` | roche brute, piliers, runes (`stoneR`, `rune`) |
| `slab`  | dalles de sol (`slab`, `slabW`, `slabR`, `path`) |
| `wood`  | bois, étagères, troncs (`wood`, `woodD`, `woodF`, `trunk`) |
| `grass` | sol des jardins (`grass`) |
| `iron`  | fer, grilles, mécanismes (`iron`) |
| `roof`  | toits de tuiles des tours (`roof`) |

Jeux fournis (source [Poly Haven](https://polyhaven.com), CC0, 2k) :

- `stone_*` — aerial_rocks_02 (roche brute)
- `slab_*`  — chipped_concrete (dalles ébréchées)
- `iron_*`  — box_profile_metal_sheet (tôle nervurée, avec `iron_metalness`)
- `roof_*`  — clay_roof_tiles_02 (tuiles de terre cuite)
- `wood_*`  — plancher en planches **généré procéduralement** (stand-in :
  le `.blend` de plank_flooring_04 ne contenait pas les images — re-téléverser
  le zip Poly Haven complet pour le remplacer, en renommant les maps
  `wood_color.jpg` / `wood_normal.png` / `wood_roughness.jpg`)

Les maps `_normal` sont converties d'EXR en PNG 1k et les `_roughness` /
`_metalness` en JPG pour limiter le poids au chargement.

Optionnel : `glow.png` (sprite de halo lumineux, dégradé radial blanc→transparent).

Si un fichier manque, le jeu retombe automatiquement sur une couleur unie
équivalente au rendu procédural d'origine — rien ne casse.
