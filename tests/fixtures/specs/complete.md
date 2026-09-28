# Gestion des abonnements

## 1. Contexte et objectif

Les équipes support traitent actuellement les demandes d'abonnement par courriel, ce qui
entraîne des délais et des erreurs de facturation. L'objectif est de permettre aux clients
de souscrire et de gérer leur abonnement en autonomie. Le succès sera mesuré par une
réduction de 30 % des demandes manuelles en trois mois et un taux de souscription réussie
supérieur à 98 %.

## 2. Périmètre

Les utilisateurs concernés sont les clients authentifiés et les agents du support. La
première version couvre la consultation des offres, la souscription, le changement d'offre,
la résiliation et la consultation de l'historique des factures. Les remboursements et les
offres réservées aux entreprises sont exclus de cette version.

## 3. Besoins fonctionnels

- Un client peut comparer les offres disponibles et consulter leur prix TTC.
- Une souscription exige une offre active et un moyen de paiement valide.
- Le système confirme la souscription après l'autorisation du paiement.
- Un client peut changer d'offre ; le nouveau tarif prend effet au prochain cycle.
- Une résiliation programmée reste active jusqu'à la fin de la période payée.
- Un agent support peut rechercher un abonnement par identifiant client, sans consulter
  les données complètes du moyen de paiement.

## 4. Données et intégrations

Le service conserve l'identifiant client, l'offre, les dates de cycle et l'état du paiement.
Les données de carte bancaire sont collectées directement par le prestataire de paiement
PayGate et ne transitent jamais par RateMySDD. Une API REST authentifiée permet de lire les
offres ; les événements de paiement sont reçus par webhook signé. Les accès des agents sont
limités à leur rôle et journalisés sans numéro de carte.

## 5. Critères d'acceptation

- Étant donné un client authentifié et un paiement autorisé, lorsque le client confirme une
  souscription, alors l'abonnement devient actif et une confirmation est affichée.
- Étant donné un paiement refusé, lorsque le client tente de souscrire, alors aucun
  abonnement n'est activé et une explication lui est présentée.
- Étant donné une résiliation demandée, lorsque le cycle payé n'est pas terminé, alors
  l'accès reste actif jusqu'à la date de fin affichée.

## 6. Exigences non fonctionnelles

- Le parcours de souscription doit répondre en moins de deux secondes au 95e percentile,
  hors délai du prestataire de paiement.
- Toutes les communications doivent utiliser TLS 1.2 ou supérieur.
- Le service doit atteindre 99,9 % de disponibilité mensuelle.
- Les données de paiement ne doivent pas être conservées dans les journaux applicatifs.
