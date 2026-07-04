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

Convention : le modèle doit être centré sur l'origine, posé sur y=0,
et occuper environ 1,7 unité de haut pour les personnages (1 unité = 1 mètre).
Les effets magiques (halos, yeux lumineux, lumières) sont ajoutés par le code.

## Personnage partagé — `character_2.fbx`

Fichier fourni : un humanoïde Mixamo (« Warrok W Kurniawan », créature
monstrueuse, textures intégrées). Il sert de corps à **tous les méchants**
qui n'ont pas de modèle `enemy_<type>` dédié : `characterClone(role)` dans
`AssetManager.js` le normalise (hauteur, pieds au sol — peu importe l'échelle
du FBX) puis le décline par rôle :

| Rôle (méchant) | Adaptation |
|----------------|------------|
| `sentinel` (Ombre)    | teinte violet nocturne, lueur froide |
| `wraith` (Traqueur)   | silhouette amincie, semi-translucide, lueur spectrale verte |
| `brute` (Colosse)     | gabarit ×1,75, teinte braise rougeoyante |
| `caster` (Tisseur)    | teinte pourpre magique saturée |

Un rôle `hero` (gentils : couleurs d'origine, douce lueur d'âme) est aussi
défini si le modèle doit servir un allié. Les héros jouables gardent leurs
silhouettes de classe (Mage/Guerrier/Assassin/Paladin) — remplaçables en
déposant `player_<voie>.glb` ou `.fbx`.
