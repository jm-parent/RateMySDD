# Design: Confirmation de copie et titre centré dans l’en-tête

**Date :** 2026-09-28  
**Statut :** Approuvé par l’utilisateur pour planification (2026-09-28)

## Contexte

L’écran de connexion propose déjà de copier le code GitHub Device Flow. Le composant
`LoginScreen` suit déjà le résultat de la copie dans `copyStatus`, mais ce texte est
uniquement rendu dans une région masquée aux lecteurs d’écran. L’utilisateur souhaite
une confirmation visible après avoir copié le code.

Dans l’application authentifiée, `UserBar` place le compte à gauche et la déconnexion
à droite, tandis que le titre principal se trouve actuellement au-dessus de l’espace
d’audit. L’utilisateur souhaite que « RateMySDD — Audit de spécifications » soit
centré horizontalement entre ces deux éléments.

## Décisions de conception

### Retour visible de la copie

- Garder le bouton « Copier le code » et afficher le résultat sous forme de toast flottant.
- Réutiliser l’état `copyStatus` et les textes existants :
  - « Code copié. » après une copie réussie ;
  - « La copie automatique est indisponible. » si le presse-papiers refuse la copie.
- Afficher le toast de succès en bas à droite, le maintenir 3 secondes, puis le faire
  disparaître par fondu sur 350 ms. Le toast d’erreur reste visible jusqu’à un nouvel
  essai de copie ou à la création d’un nouveau code.
- Effacer le statut au début d’un nouvel essai et lorsque `beginLogin` génère un nouveau
  code.
- Annoncer le résultat dans une région `role="status"` avec `aria-live="polite"` ; le toast
  visuel est masqué aux lecteurs d’écran pour éviter une annonce en double. Respecter
  `prefers-reduced-motion` en supprimant les animations.

### Titre dans l’en-tête authentifié

- Dans la vue d’audit authentifiée, placer dans `UserBar`, dans cet ordre, l’identité du
  compte GitHub, le titre principal et le bouton « Se déconnecter ».
- Garder le titre comme unique `h1` de cette vue. La page de connexion garde son propre
  titre dans sa carte ; la vue « Accès GitHub Copilot requis » reste inchangée.
- Employer une grille CSS à trois colonnes avec des colonnes latérales symétriques et
  une colonne centrale réductible. Le titre reste centré par rapport à la largeur de
  l’en-tête même si la largeur du nom de compte diffère de celle du bouton.
- Sur petit écran, réduire la taille du titre et autoriser son retour à la ligne dans la
  colonne centrale. Les trois zones restent sur la même rangée ; le titre ne chevauche
  pas l’identité ni la déconnexion.
- Conserver l’accessibilité du titre : il reste le `h1` associé à la région d’audit et
  conserve le focus initial à l’arrivée dans l’application authentifiée. L’écran de
  résultat garde son titre de section `h2` et son comportement de focus après un nouvel
  audit valide.
- Le message d’erreur de déconnexion reste annoncé comme une alerte et ne doit pas
  déplacer ni chevaucher les trois zones de l’en-tête.

## Architecture et portée

- `LoginScreen` garde la logique de copie existante, annonce `copyStatus` dans une région
  accessible et rend le résultat dans un toast visuel distinct.
- `App` transmet le titre uniquement à l’en-tête de la vue d’audit authentifiée.
- `UserBar` rend l’identité, le titre facultatif et la déconnexion dans la grille.
- `AuditPage` retire son titre dupliqué ; sa région reste accessible au moyen du titre
  principal commun.
- `styles.css` définit l’état du retour de copie et la grille responsive de l’en-tête.
- L’authentification OAuth, les routes API, les permissions de session, le contenu Markdown
  et le résultat d’audit ne changent pas. Aucune dépendance n’est ajoutée.

## Vérification prévue

- Vérifier que « Code copié. » apparaît dans le toast et est annoncé comme statut, reste
  visible 3 secondes puis disparaît par fondu sur 350 ms.
- Vérifier que l’échec du presse-papiers reste visible au-delà de 3 secondes et que le
  statut est effacé au prochain essai ou à la création d’un nouveau code.
- Vérifier dans l’en-tête authentifié l’ordre accessible compte, `h1`, déconnexion, et
  l’absence d’un deuxième titre principal dans `AuditPage`.
- Vérifier le centrage géométrique du titre sur grand écran, puis à une largeur mobile
  que les trois zones restent sur une rangée, que le titre peut revenir à la ligne et
  qu’aucun débordement horizontal n’est créé.
- Vérifier que le titre principal conserve son focus initial, que le titre du résultat
  reste un `h2` et que la déconnexion continue de fonctionner.
- Exécuter les tests unitaires et E2E concernés, puis lint, typecheck et build.

## Alternatives considérées

1. **Grille à trois colonnes — retenue.** Centre le titre sans dépendre des largeurs
   différentes du compte et du bouton, et permet au titre de se réduire et de revenir à
   la ligne sur mobile.
2. **Disposition Flex.** Simple, mais `justify-content: space-between` ne garantit pas
   le centrage mathématique du titre lorsque les deux côtés ont des largeurs différentes.
3. **Titre centré en position absolue.** Centre précisément le titre, mais peut le faire
   chevaucher le compte ou le bouton à petite largeur.
4. **Toast de copie temporaire ou remplacement du libellé du bouton.** Le toast est retenu
  à la demande de l’utilisateur ; remplacer le libellé du bouton n’est pas retenu, car le
  retour doit rester distinct de l’action.

## Portée exclue

Cette évolution n’ajoute pas de stockage, de nouvel appel serveur, de changement
d’authentification ou de modification des résultats d’audit.
