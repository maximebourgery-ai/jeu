# Textures PBR

Déposez ici les jeux de textures PBR. L'AssetManager cherche, pour chaque
famille de matériau, les fichiers suivants (extension `.jpg` ou `.png`) :

```
<famille>_color.jpg       (albedo / couleur — obligatoire pour activer la famille)
<famille>_normal.jpg      (optionnel)
<famille>_roughness.jpg   (optionnel)
<famille>_metalness.jpg   (optionnel)
```

Familles reconnues (utilisées par les matériaux du jeu) :

| Famille | Utilisée par |
|---------|--------------|
| `brick` | murs du château (`stone`, `stoneD`) |
| `stone` | roche brute, piliers, runes (`stoneR`, `rune`) |
| `slab`  | dalles de sol (`slab`, `slabW`, `slabR`, `path`) |
| `wood`  | bois, étagères, troncs (`wood`, `woodD`, `woodF`, `trunk`) |
| `grass` | sol des jardins (`grass`) |
| `iron`  | fer, grilles, mécanismes (`iron`) |

Optionnel : `glow.png` (sprite de halo lumineux, dégradé radial blanc→transparent).

Si un fichier manque, le jeu retombe automatiquement sur une couleur unie
équivalente au rendu procédural d'origine — rien ne casse.
