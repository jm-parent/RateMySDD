# Design: Onglets de saisie et de résultat

**Date :** 2026-09-28  
**Statut :** Approuvé par l’utilisateur pour planification (2026-09-28)

## Contexte

RateMySDD affiche actuellement la saisie Markdown et son résultat dans deux vues
distinctes. Le passage d’une vue à l’autre dépend de boutons placés en bas du contenu.
L’utilisateur souhaite deux onglets toujours visibles en haut de l’espace d’audit afin de
passer directement de la saisie au résultat. La disposition choisie est la variante B :
les onglets sont attachés au panneau qui contient la saisie ou le résultat.

L’application conserve déjà dans son état en mémoire le brouillon, la source (collage ou
fichier), le nom du fichier, le résultat courant et l’écran actif. La nouvelle
navigation réutilisera cet état sans ajouter de stockage ni modifier le contrat d’audit.

## Décision de conception

L’espace de travail devient une carte unique comprenant, dans cet ordre :

1. Une barre d’onglets en haut de la carte.
2. Un seul panneau actif : saisie Markdown ou résultat d’audit.

Les onglets sont libellés **« Mettre le MD »** et **« Le résultat »**. La barre de compte
reste au-dessus de cet espace. Le titre de page reste commun au-dessus de la carte ;
le panneau de résultat conserve « Résultat de l’audit » comme titre `h2` de section.
La carte réutilise le style visuel de la variante B :
les onglets sont visuellement rattachés au contenu, plutôt que présentés comme une
navigation globale de page.

### Navigation et état

- L’onglet de saisie est sélectionné à l’ouverture de l’espace et après un échec d’audit.
- Un audit valide sélectionne automatiquement l’onglet de résultat.
- Sélectionner un onglet change uniquement la vue active ; cela ne lance ni ne répète
  une requête d’audit.
- Le Markdown, la source, le nom de fichier et le dernier résultat valide restent en
  mémoire lors d’un changement d’onglet.
- Une modification du Markdown, le remplacement ou le retrait d’un fichier invalide le
  résultat précédent. L’onglet de résultat reste visible mais est alors désactivé.
- L’onglet de résultat est également désactivé pendant un audit en cours. Il est activé
  lorsqu’un résultat valide correspondant au document courant peut être consulté.
- Une erreur d’audit est affichée dans le panneau de saisie ; le brouillon reste intact.
- Si une nouvelle tentative échoue sans modification du document, le dernier résultat
  valide de ce même document reste consultable après l’échec.
- Le comportement de confidentialité ne change pas : rechargement, déconnexion,
  expiration de session ou changement de compte effacent les données selon les règles
  déjà en place.

Les commandes de navigation en bas des deux vues (« Afficher le dernier résultat » et
« Modifier la spécification ») sont supprimées, car les onglets les remplacent.

### Accessibilité et focus

La barre suit le modèle accessible des onglets :

- un conteneur `tablist`, deux commandes `tab` et un `tabpanel` pour le contenu actif ;
- `aria-selected`, `aria-controls` et `aria-labelledby` relient l’onglet sélectionné à
  son panneau ; chaque onglet conserve une référence `aria-controls` vers son panneau ;
- le résultat indisponible est exposé comme désactivé et ne peut pas être activé ;
- les flèches gauche/droite changent l’onglet actif ; Début/Fin sélectionnent le premier
  ou le dernier onglet disponible ;
- lors d’un changement manuel d’onglet, le focus reste sur l’onglet sélectionné ;
- après la production d’un nouvel audit valide, le focus va une fois au titre du résultat,
  afin d’annoncer le nouveau contenu. La simple réouverture d’un résultat existant ne
  déplace pas le focus hors de la barre d’onglets.

Sur petit écran, les deux libellés restent visibles et activables sans débordement
horizontal ; le contenu du panneau conserve son comportement responsive existant.

## Structure de l’interface

`AuditPage` reste responsable de l’état et des transitions d’audit. Il rend une carte
stable avec la barre d’onglets, puis le panneau correspondant à la valeur d’écran déjà
présente dans `AuditPageState`. Les deux conteneurs `tabpanel` restent dans le DOM afin
que chaque onglet conserve une cible `aria-controls` valide ; le conteneur inactif est
masqué et son contenu d’écran n’est pas rendu. Le
composant de résultat continue de rendre le tableau et les actions de rapport, sans son
ancienne commande de retour.

Cette organisation conserve les responsabilités existantes :

- `App` garde la propriété de l’état volatil et de son cycle de vie d’authentification ;
- `AuditPage` gère l’audit, les onglets et le choix du panneau actif ;
- le panneau de saisie conserve le chargement de fichier, l’édition et les erreurs ;
- le panneau de résultat conserve le tableau et les actions de copie/téléchargement.

## Alternatives considérées

1. **Onglets accessibles dans le panneau — retenu.** Correspond à la disposition B,
   utilise le modèle clavier attendu d’onglets et s’appuie sur l’état d’écran existant.
2. **Boutons de navigation ordinaires.** Plus simples, mais moins conformes à
   l’interaction et à la sémantique attendues d’onglets.
3. **Garder les deux contenus d’écran montés et masquer l’inactif.** Préserverait l’état
   interne local de chaque composant, mais augmenterait la complexité et laisserait le
   contenu inactif dans le DOM. Le brouillon et les métadonnées de fichier étant déjà
   conservés dans l’état parent, ce coût n’apporte pas de bénéfice requis.

## Vérification prévue

Les tests d’interface vérifieront que :

- les deux onglets apparaissent dans la carte et que le résultat est désactivé avant un
  audit valide ;
- un audit valide ouvre le panneau de résultat et y place le focus après sa génération ;
- les changements manuels d’onglet n’émettent aucune nouvelle requête et préservent le
  Markdown ainsi que les métadonnées de fichier ;
- une modification invalide le résultat et désactive l’onglet correspondant ;
- les flèches, Début et Fin permettent une navigation clavier correcte, sans perte
  inattendue de focus ;
- les erreurs restent visibles dans la saisie et le panneau actif s’adapte aux tailles
  d’écran prises en charge.

Les tests serveur, le contrat JSON, le format du rapport et les règles de durée de session
ne changent pas.

## Portée exclue

Cette évolution n’ajoute ni routes d’URL, ni historique d’audits, ni persistance des
documents, ni nouvel appel serveur pour naviguer entre les panneaux. La spécification
fonctionnelle `specs/002-audit-result-subscreen/spec.md` devra être mise à jour avec les
règles de navigation par onglets et leurs critères d’acceptation lors de l’implémentation.
