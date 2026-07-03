# Modèles 3D (.glb)

Déposez ici des modèles glTF binaires (`.glb`). L'AssetManager tente de
charger les fichiers suivants ; si un fichier est absent, la géométrie
primitive d'origine (cônes/boîtes/cylindres) est utilisée à la place :

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

Convention : le modèle doit être centré sur l'origine, posé sur y=0,
et occuper environ 1,7 unité de haut pour les personnages (1 unité = 1 mètre).
Les effets magiques (halos, yeux lumineux, lumières) sont ajoutés par le code.
