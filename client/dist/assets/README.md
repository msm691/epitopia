# Assets graphiques (PNG)

Dépose ici tes images. Tant qu'un fichier est absent, le jeu utilise un repli
dessiné/emoji — donc tu peux ajouter les PNG **au fur et à mesure**, ils
apparaissent automatiquement (pas besoin de redémarrer le build en prod ; en dev
Vite recharge).

Le rendu est **isométrique** (losanges 2:1).

**Formats conseillés (PNG transparent) :**
- **terrain/** : tuile iso en losange, dessinée dans une zone `largeur × 0.75·largeur`
  (ex. 128×96). Le losange occupe la moitié haute ; la partie basse sert à donner
  un peu d'épaisseur/relief. Bords qui se raccordent proprement entre tuiles.
- **units/** & **city/** : sprites « billboard » (vus de 3/4), ancrés en bas-centre,
  dessinés au-dessus de la case. Silhouette claire sur fond transparent
  (ils sont posés sur un disque/ombre à la couleur du joueur).
- **resources/** : petites icônes (ex. 64×64).

## Arborescence attendue

```
assets/
  terrain/
    champ.png      # plaine
    foret.png      # forêt
    montagne.png   # montagne
    eau.png        # lac
    ocean.png      # océan
  units/
    guerrier.png   archer.png     cavalier.png   defenseur.png
    epeiste.png    catapulte.png  chevalier.png  geant.png
  resources/
    fruits.png   gibier.png   poisson.png   cereales.png
    minerai.png  bois.png     metal.png     luxe.png
  city/
    city.png       # bâtiment de ville (dessiné par-dessus le socle couleur joueur)
```

## Conseils
- Les **unités** et **villes** sont dessinées sur un disque à la **couleur du joueur** :
  privilégie des sprites au centre, sur fond transparent (silhouette claire).
- Les **terrains** remplissent toute la case : prévois des tuiles qui se juxtaposent
  proprement (bords neutres).
- Style cohérent (même palette / même éclairage) = rendu pro.
