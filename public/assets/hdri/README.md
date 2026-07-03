# Environnement HDRI

Déposez ici un fichier `environment.hdr` (équirectangulaire, Radiance HDR).

S'il est présent, il est chargé via `RGBELoader` + `PMREMGenerator` et
appliqué en `scene.environment` (éclairage d'image) et `scene.background`.

S'il est absent, le jeu garde son ciel nocturne et son éclairage
ambiant/directionnel d'origine — un simple avertissement est loggé en console.

Conseil : une HDRI de nuit étoilée / crépuscule froid respecte la direction
artistique du jeu (ambiance nocturne bleutée).
