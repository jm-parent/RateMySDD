# Phase 0 — Research : Sous-écran dédié au résultat d’audit

**Feature**: `002-audit-result-subscreen` | **Date**: 2026-09-25

Toutes les décisions sont fondées sur la spécification, la constitution et les composants et
contrats déjà présents dans le projet. Aucune technologie ni dépendance nouvelle n'est
nécessaire ; aucune inconnue ne reste à clarifier.

## R1 — Navigation entre saisie et résultat

- **Decision**: représenter l'écran courant par un état explicite `input` / `result` dans
  l'état d'audit déjà conservé par `App`. Rendre une seule vue à la fois dans le même onglet.
- **Rationale**: la SPA locale n'a qu'un parcours d'audit ; un état React satisfait le
  sous-écran sans ajouter de route, de rechargement ou de persistance. Il rend également
  testable l'invariant selon lequel la navigation ne déclenche aucun nouvel audit.
- **Alternatives considered**:
  - *Ajouter un nouvel onglet ou une fenêtre*: rompt la conservation en mémoire et augmente
    le risque de perdre ou de désynchroniser le document.
  - *Créer une route navigable distincte*: apporte gestion d'URL et historique sans valeur
    pour ce parcours mono-utilisateur.
  - *Afficher le tableau sous le formulaire et le masquer visuellement*: ne garantit pas
    l'isolement dans l'arbre accessible ; écarté au profit d'un rendu conditionnel.

## R2 — Conservation du résultat et invalidation

- **Decision**: conserver le document courant et son dernier `AuditResult` en mémoire React.
  Le retour et la réouverture changent seulement l'état de vue. Les handlers existants de
  modification du texte, chargement et retrait de fichier continuent d'invalider le résultat.
- **Rationale**: `AuditPage` possède déjà les champs `content`, `source`, `fileName`, `status`,
  `result` et `error`, et les changements de contenu effacent déjà le résultat. L'ajout d'un
  champ de vue s'insère dans ce modèle sans écrire le document dans un stockage persistant.
- **Alternatives considered**:
  - *Session Storage, local storage ou sauvegarde serveur*: permet la reprise après rechargement
    mais crée une conservation interdite par le périmètre et la constitution.
  - *Relancer l'analyse à chaque retour*: consomme une nouvelle requête Copilot et ne respecte
    pas le critère de navigation sans audit.

## R3 — Contrat de résultat et intégration d'audit

- **Decision**: conserver le corps de requête et le JSON de réponse de `POST /api/audits`,
  `AuditResultSchema`, le calcul serveur du score global, `AuditResultTable`, `ScoreLegend`,
  `ResultActions` et les formats de copie/téléchargement. Ajouter uniquement l'en-tête
  d'authentification `X-Session-Expires-At` aux réponses concernées (détaillé en R4).
- **Rationale**: les composants et contrats existants fournissent déjà les six piliers,
  métadonnées, barème et export Markdown demandés. Le sous-écran ne modifie ni le contenu de
  l'audit ni la forme JSON de son résultat Copilot ; l'en-tête sert à protéger la vue locale
  à l'échéance réelle de la session.
- **Alternatives considered**:
  - *Ajouter une API ou un format d'export JSON*: hors périmètre ; le résultat JSON reste
    l'échange existant entre le service et l'interface.
  - *Dupliquer le tableau ou le générateur de rapport*: risquerait de faire diverger les
    affichages et les exports.

## R4 — Expiration de session et identité propriétaire

- **Decision**: conserver en mémoire l'identifiant GitHub actuellement propriétaire de l'état
  d'audit. Une réauthentification avec le même `login` reprend l'état ; un `login` différent,
  une déconnexion explicite ou un rechargement l'efface. Les réponses authentifiées exposent
  `X-Session-Expires-At` en date RFC 3339 ; `GET /api/session` retourne aussi cette échéance,
  sans renouveler le délai d'inactivité. Le client programme un minuteur sur cette valeur pour
  masquer les vues à l'échéance exacte, et vérifie le statut à un intervalle maximal de
  60 secondes
  ainsi qu'au retour de visibilité afin de détecter une révocation anticipée. Au retour de
  visibilité, il compare d'abord l'échéance mémorisée à l'heure courante et masque
  synchroniquement les vues si elle est dépassée, avant d'attendre la réponse du serveur.
- **Rationale**: `App` masque déjà l'interface après une réponse 401 tout en gardant son état
  React. Une simple vérification toutes les 60 secondes laisserait toutefois jusqu'à une
  minute d'accès visuel après l'expiration et ne satisfait pas littéralement FR-020. Une
  échéance fournie par le serveur permet au client de verrouiller la vue au bon moment sans
  recopier localement le TTL serveur ; la vérification synchrone à la reprise couvre le
  bridage des minuteurs dans un onglet suspendu. Le contrôle périodique non renouvelant et le
  contrôle au retour de visibilité détectent aussi une révocation anticipée.
  L'[OWASP Session Management Cheat
  Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#idle-timeout)
  définit le délai d'inactivité à partir de la dernière requête HTTP et prévient que des
  requêtes périodiques peuvent maintenir une session active. Le `GET /api/session` de statut
  reste donc non renouvelant ; les routes protégées continuent à renouveler la session lors
  d'une action authentifiée et publient leur nouvelle échéance dans l'en-tête.
- La recommandation OWASP d'invalider aussi les données côté client à l'expiration est
  rapprochée de FR-020 : l'état courant reste uniquement en mémoire, caché derrière l'écran de
  connexion et lié au `login` d'origine pour permettre la reprise explicitement prévue. Il
  est effacé si l'identité change, en cas de déconnexion, de rechargement ou de fermeture ;
  aucune donnée n'est écrite dans un stockage persistant.
- **Alternatives considered**:
  - *Réagir uniquement au prochain 401*: une vue locale contenant le résultat pourrait rester
    visible indéfiniment sans appel réseau ; écarté.
  - *S'appuyer uniquement sur un polling non renouvelant à la minute*: laisse une fenêtre
    d'accès visuel après l'expiration ; insuffisant pour FR-020 et SC-004.
  - *Interroger périodiquement un endpoint qui renouvelle le TTL*: l'application empêcherait
    elle-même l'expiration de la session ; écarté.
  - *Dupliquer un TTL fixe dans le navigateur*: diverge si la configuration serveur change ;
    remplacé par l'échéance absolue fournie par le serveur.
  - *Effacer systématiquement l'état sur 401*: empêcherait la reprise du même document par
    le même auditeur après réauthentification, contrairement à la spécification ; l'état est
    donc verrouillé et limité à la mémoire jusqu'à la reconnexion.

## R5 — Accessibilité des transitions

- **Decision**: chaque vue rend son propre titre principal et sa région nommée ; après une
  transition, déplacer le focus vers le titre de la nouvelle vue. N'inclure dans le DOM que la
  vue active et conserver l'indicateur de focus clavier déjà présent.
- **Rationale**: un titre focalisé identifie le nouvel écran aux utilisateurs clavier et aux
  technologies d'assistance. Le [WAI-ARIA Authoring Practices Guide, Persistence of
  focus](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) recommande de déplacer
  le focus lorsqu'un élément actif est retiré du DOM ; la documentation React sur
  [l'accès au DOM avec les refs](https://react.dev/learn/manipulating-the-dom-with-refs)
  fournit le mécanisme existant (`useRef` puis `focus()`). Le rendu conditionnel empêche
  l'ancienne vue de rester navigable.
- **Alternatives considered**:
  - *Se fier uniquement au changement visuel*: l'écran courant peut ne pas être annoncé aux
    technologies d'assistance.
  - *Utiliser uniquement `aria-live`*: annonce le changement sans déplacer le focus vers le
    contenu principal ; conservé comme complément possible, pas comme mécanisme principal.

## R6 — Validation et absence de télémétrie

- **Decision**: utiliser Vitest pour les invariants d'état et les routes de session et
  Playwright pour les parcours complets en mode test avec le faux moteur existant. Les
  indicateurs métier sont évalués manuellement et de façon agrégée, en dehors du produit.
- **Rationale**: les tests E2E couvrent déjà l'authentification factice, l'audit, le tableau,
  la copie et le téléchargement. Le test ne doit pas consommer de quota Copilot réel ni
  introduire une collecte de document, de résultat ou de navigation.
- **Alternatives considered**:
  - *Mesure de l'adoption par télémétrie*: contraire à la règle de confidentialité et
    inutile au parcours local mono-utilisateur.
  - *Tests E2E avec Copilot réel*: non déterministes et consommateurs de quota ; le faux
    moteur existant est préférable.

## Sources

- [OWASP Session Management Cheat Sheet — Idle Timeout](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#idle-timeout)
- [W3C WAI-ARIA Authoring Practices Guide — Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
- [React — Manipulating the DOM with Refs](https://react.dev/learn/manipulating-the-dom-with-refs)
