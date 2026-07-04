# Environnement HDRI

Déposez ici un fichier `environment.hdr` (équirectangulaire, Radiance HDR)
**ou** `environment.exr` (équirectangulaire, OpenEXR).

L'AssetManager essaie d'abord `environment.hdr` (via `RGBELoader`), puis
`environment.exr` (via `EXRLoader`). Le premier trouvé est passé au
`PMREMGenerator` et appliqué en `scene.environment` (éclairage d'image)
et `scene.background`.

Si aucun des deux n'est présent, le jeu garde son ciel nocturne et son
éclairage ambiant/directionnel d'origine — un simple avertissement est
loggé en console.

Conseil : une HDRI de nuit étoilée / crépuscule froid respecte la direction
artistique du jeu (ambiance nocturne bleutée).
