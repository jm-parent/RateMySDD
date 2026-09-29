# Design : Seuil de validation et métadonnées du résultat

**Date :** 2026-09-29

**Statut :** Approuvé par l'utilisateur pour mise en œuvre (2026-09-29)

## Contexte

L'accès à l'étape suivante nécessite actuellement un score strictement supérieur à 90.
L'écran de résultat affiche aussi un barème de notation alors que le tableau des six
piliers présente déjà leurs notes, résumés et pistes d'amélioration. Le résultat contient
la date de l'audit et le modèle utilisé, mais ces informations ne sont pas affichées.

## Décisions

- Un score global de 85 ou plus valide l'étape et déverrouille l'étape suivante. Un score
  inférieur à 85 conserve l'étape courante et affiche son résultat.
- Le seuil est identique dans l'auto-navigation après audit, le déverrouillage manuel des
  étapes et leur état visuel « Validé ».
- Le barème est retiré de l'écran de résultat.
- À son emplacement, l'écran affiche la date de l'analyse et le nom du modèle retourné par
  le service. La date est présentée dans un format localisé.
- Le tableau existant des six piliers est conservé sans duplication. Il continue d'afficher
  les notes, résumés, détails et améliorations.
- Le coût en crédits n'est pas affiché : le moteur ne fournit aucune mesure de consommation
  permettant de l'établir sans estimation non fiable.

## Impact et vérification

Les règles de seuil dans le workflow, l'auto-navigation et l'indicateur de progression
doivent être alignées. Les tests couvrent les cas 84 et 85, l'affichage de la date et du
modèle, l'absence du barème et la présence des six lignes du tableau. La spécification
fonctionnelle existante est mise à jour pour refléter ces décisions.

Le contrat du résultat JSON, l'appel au moteur, le rapport téléchargeable, la confidentialité
et le stockage ne changent pas.

## Portée exclue

Cette évolution ne collecte pas l'usage de jetons ou de crédits et n'ajoute pas d'estimation
financière. Elle ne modifie ni les notes individuelles, ni leur barème de calcul, ni le
contenu du tableau des piliers.