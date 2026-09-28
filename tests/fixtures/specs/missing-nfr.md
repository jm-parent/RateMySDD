# Catalogue de livres

## Contexte et objectif

Une bibliothèque souhaite permettre à ses adhérents de consulter son catalogue en ligne
afin de réduire les appels téléphoniques au comptoir.

## Périmètre

Les adhérents et les bibliothécaires utilisent le service. La première version permet la
recherche et la consultation des fiches de livres. La réservation en ligne est exclue.

## Besoins fonctionnels

- Un adhérent peut rechercher un livre par titre, auteur ou ISBN.
- Les résultats indiquent si le livre est disponible en rayon.
- Un bibliothécaire peut mettre à jour les informations d'un livre.

## Données et intégrations

Chaque fiche comprend un identifiant, un titre, un auteur, un ISBN et un état de
disponibilité. Les bibliothécaires mettent à jour les fiches depuis l'interface interne.

## Critères d'acceptation

- Une recherche par ISBN retourne la fiche correspondante.
- Une recherche sans résultat affiche un message explicite.
