# Feature Specification: Sous-écran dédié au résultat d’audit

**Feature Branch**: `002-audit-result-subscreen`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: « Enrichir la spécification avec les formats de données, les interfaces et services externes, la confidentialité, le problème métier, des indicateurs de succès et la valeur organisationnelle. »

## Problème métier et valeur attendue

### Problème métier initial

Dans le parcours initial sur un seul écran, la saisie ou le chargement du document et la
consultation du résultat se trouvent dans le même espace. Lorsque le tableau apparaît sous le
formulaire, l'auditeur doit faire défiler la page et distinguer mentalement le document soumis
du résultat affiché. Après une modification, il peut confondre un ancien résultat avec la
version courante de la spécification ou abandonner avant d'exploiter le rapport.

Cette confusion augmente les manipulations et peut retarder ou fausser la transmission des
retours aux équipes. Le niveau actuel de cet impact n'a pas encore été mesuré ; il constitue
une hypothèse à vérifier pendant le pilote.

### Valeur attendue pour l'organisation

Un écran de résultat séparé doit rendre le parcours de revue plus lisible et plus sûr : moins
de risque d'associer un diagnostic à un document modifié, moins de retours à refaire ou à
reformater manuellement, et une grille de retour uniforme pour les équipes produit,
développement et qualité. La valeur recherchée dépasse donc la présentation visuelle : elle
vise à favoriser l'achèvement et l'utilisation des audits et à réduire les frictions dans le
cycle de revue. La fonctionnalité n'ajoute ni historique d'audits ni partage collaboratif.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consulter le résultat dans un sous-écran dédié (Priority: P1)

Après avoir lancé un audit, l'auditeur consulte son résultat dans un écran distinct de celui
où il saisit ou charge sa spécification. Il peut revenir à sa saisie pour corriger le document,
puis consulter un résultat actualisé après un nouvel audit.

**Why this priority**: séparer le diagnostic de la saisie évite la confusion entre le document
courant et son résultat, facilite l'exploitation du rapport et réduit les risques de révision
inutile.

**Independent Test**: avec un compte de test connecté, saisir ou charger une spécification et
lancer l'audit ; vérifier qu'un écran de résultat distinct s'affiche après un audit valide,
puis revenir à la saisie et vérifier que le document est inchangé.

**Acceptance Scenarios**:

1. **Given** un utilisateur connecté qui a fourni une spécification valide, **When** un audit
   se termine avec un résultat conforme, **Then** l'application affiche un sous-écran de
   résultat distinct et masque l'écran de saisie.
2. **Given** le sous-écran de résultat, **When** l'utilisateur consulte l'audit, **Then** le
  score global, la date de l'analyse, le modèle utilisé et le tableau complet des six piliers
  restent visibles dans leur ordre canonique, avec les notes, descriptions et points
  d'amélioration ; les actions de copie et de téléchargement restent accessibles et le barème
  de notation n'est pas affiché.
3. **Given** la carte d'audit avec la barre d'onglets, **When** l'utilisateur sélectionne l'onglet « Mettre le MD », **Then** le panneau de saisie réapparaît avec le même texte, la même source et, le cas échéant, le même nom de fichier, sans lancer un nouvel audit.
4. **Given** un document dont le résultat précédent est consultable, **When** l'utilisateur
   modifie le document, **Then** le résultat précédent est retiré et ne peut pas être présenté
   comme correspondant au contenu modifié ; après un nouvel audit valide, le nouveau résultat
   est affiché dans le sous-écran.
5. **Given** qu'il n'existe pas de résultat valide pour le document courant (absence d'historique) ou qu'un audit est en cours, **When** l'utilisateur tente d'accéder au résultat, **Then** l'onglet « Le résultat » est visible mais désactivé ; l'utilisateur reste sur le panneau d'entrée qui affiche l'état d'avancement ou un message d'erreur, et son brouillon est préservé. En revanche, si un nouvel audit échoue alors que le document n'a pas été modifié et qu'un dernier résultat valide existe pour ce même document, **Then** ce dernier résultat reste consultable via l'onglet « Le résultat » malgré l'échec de la tentative de ré-audit.
6. **Given** un résultat valide, **When** l'utilisateur copie ou télécharge le rapport,
   **Then** le rapport Markdown contient les six piliers, le score et les métadonnées prévues,
   sans reproduire le texte source de la spécification.
7. **Given** une session expirée ou déconnectée, **When** une personne non authentifiée tente
   d'accéder à l'un des écrans, **Then** le document et le résultat ne sont pas consultables
   avant une authentification valide.
8. **Given** un résultat d'audit global, **When** le score est d'au moins 85, **Then** l'étape
  suivante est déverrouillée et sélectionnée automatiquement ; sous 85, l'utilisateur reste
  sur l'étape courante et l'étape suivante demeure verrouillée.

### Edge Cases

- Un fichier autre qu'un unique `.md`, un contenu vide, un encodage autre qu'UTF-8 ou un
  document de plus de 204 800 octets est refusé avant l'analyse ; aucun sous-écran de résultat
  n'est affiché.
- Si la session expire pendant un audit, l'utilisateur est invité à se reconnecter ; aucun
  résultat incomplet n'est affiché. Après reconnexion avec le même compte GitHub, la saisie
  peut être reprise depuis la mémoire courante.
- Si la reconnexion utilise un autre compte, la saisie et le résultat de l'identité précédente
  sont effacés avant tout nouvel accès.
- Si l'utilisateur revient à la saisie sans modifier le document, il peut rouvrir le dernier
  résultat valide sans soumettre un nouvel audit.
- Si l'utilisateur modifie le texte, remplace ou retire le fichier, le résultat antérieur est
  invalidé jusqu'à la réussite d'un nouvel audit.
- Après l'actualisation de la page, la fermeture de l'application ou une déconnexion explicite,
  le document et le résultat ne sont pas récupérables ; cette navigation n'ajoute ni sauvegarde
  ni historique.
- Une réponse d'IA non conforme à la structure des six piliers est rejetée ou corrigée avant
  tout affichage ; aucun résultat partiel n'est présenté.
- Les commandes d'onglet (« Mettre le MD » et « Le résultat ») restent utilisables au clavier : les flèches gauche/droite et les touches Début/Fin changent l'onglet actif, et les technologies d'assistance identifient l'onglet et le panneau courant.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Après un audit terminé avec un résultat valide, le système MUST afficher ce
  résultat dans un écran dédié, distinct de l'écran de saisie.
- **FR-002**: Sur l'écran de résultat, le système MUST afficher le score global et le tableau
  complet conforme au format existant : exactement les six piliers dans l'ordre prévu, chacun
  avec sa note, sa description et ses points d'amélioration, ainsi que la date de l'analyse et
  le modèle utilisé. Le barème MUST NOT être affiché ; la copie Markdown et le téléchargement
  du rapport MUST rester disponibles.
- **FR-003**: L'écran de saisie MUST être masqué pendant la consultation du résultat ; le
  tableau MUST NOT être simplement ajouté sous le formulaire sur ce même écran.
- **FR-004**: L'espace d'audit MUST afficher en permanence un onglet « Mettre le MD » et un onglet « Le résultat » au-dessus du panneau actif, dans la même carte. L'onglet de résultat MUST rester visible mais MUST être désactivé s'il n'existe pas de résultat valide pour le document courant ou si un audit est en cours.
- **FR-005**: Lors du retour à la saisie, le système MUST préserver en mémoire le contenu, la
  source (collage ou fichier) et, le cas échéant, le nom du fichier. Ce retour MUST NOT
  déclencher une nouvelle analyse.
- **FR-006**: Tant que le document n'est pas modifié, le système MUST permettre d'ouvrir à nouveau le dernier résultat valide au moyen de l'onglet « Le résultat », sans relancer l'audit. Dès que l'utilisateur modifie le texte, charge ou retire un fichier, le résultat précédent MUST être invalidé et l'onglet de résultat MUST rester désactivé jusqu'à la réussite d'un nouvel audit valide.
- **FR-007**: Le système MUST conserver l'utilisateur sur l'écran de saisie pendant le
  traitement et en cas d'échec ; il MUST afficher l'avancement ou une erreur compréhensible,
  préserver la saisie et ne présenter l'écran de résultat qu'après validation complète du
  résultat.
- **FR-008**: Les deux écrans MUST rester soumis à la connexion Copilot et aux règles de
  session existantes ; l'accès au résultat MUST NOT permettre de contourner l'authentification.
- **FR-009**: Le système MUST NOT enregistrer le document, le résultat ou un historique
  d'audits au-delà de la session d'utilisation courante ; la navigation ne crée aucune
  sauvegarde persistante.
- **FR-010**: Les onglets MUST suivre le modèle accessible `tablist`/`tab`/`tabpanel`, identifier leur panneau avec `aria-controls` et `aria-labelledby`, et rester utilisables au clavier avec les flèches gauche/droite et les touches Début/Fin. Un changement manuel MUST conserver le focus sur l'onglet actif ; après un nouvel audit valide, le focus MUST aller au titre du résultat.
- **FR-011**: Le système MUST accepter du Markdown collé ou un seul fichier `.md` encodé en
  UTF-8 ; le contenu MUST être non vide et ne pas dépasser 204 800 octets. Un fichier d'un
  autre type, un encodage invalide et tout contenu dépassant la limite MUST être refusés avant
  l'envoi à Copilot.
- **FR-012**: Le contenu MUST être transmis au service GitHub Copilot associé au compte de
  l'auditeur uniquement après sa demande explicite d'analyse et l'affichage préalable d'un
  avis indiquant cette transmission.
- **FR-013**: La réponse structurée de l'IA MUST contenir exactement les six piliers dans
  l'ordre canonique. Chaque pilier MUST avoir un identifiant, une note entière de 0 à 100,
  une description non vide et au moins un point d'amélioration non vide ; une réponse
  incomplète ou non conforme MUST être rejetée ou corrigée avant affichage. Si aucune
  amélioration n'est nécessaire, le point d'amélioration MUST l'indiquer explicitement.
- **FR-014**: Le service d'audit MUST fournir à l'interface un résultat JSON normalisé
  comprenant la date, la source, le nom du document, le score global, son niveau, le modèle
  utilisé et les six piliers enrichis de leur titre et de leur niveau. Le contrat détaillé
  figure dans la section « Formats des données et échanges ».
- **FR-015**: Le score global MUST être égal à la moyenne des six notes, arrondie à l'entier le
  plus proche ; son niveau MUST suivre le barème commun des notes individuelles.
- **FR-016**: La copie et le téléchargement MUST produire le même rapport Markdown, avec le
  nommage et les éléments décrits dans la section « Formats des données et échanges ». Le
  rapport MUST NOT inclure le contenu source du document.
- **FR-017**: Seul l'auditeur authentifié avec son compte GitHub Copilot courant MUST pouvoir
  soumettre un document, consulter sa saisie ou consulter le résultat correspondant. Une
  instance locale n'offre pas d'accès partagé aux membres de l'organisation.
- **FR-018**: Le document et le résultat MUST rester en mémoire volatile pendant l'utilisation
  courante ; ils MUST NOT être écrits dans une base persistante, un stockage navigateur
  persistant, un historique, des journaux, des traces, des métriques ou des messages d'erreur.
- **FR-019**: Tout artefact temporaire nécessaire au traitement MUST être supprimé après
  chaque audit, qu'il réussisse ou échoue, ainsi qu'à l'arrêt et au redémarrage de
  l'application. Le document source et le rapport MUST NOT être conservés comme fichiers de
  travail.
- **FR-020**: À l'expiration ou à la révocation de la session, les écrans MUST être protégés.
  Une reconnexion avec le même compte peut restaurer la saisie et le résultat encore valide
  uniquement depuis la mémoire courante ; une identité différente, une déconnexion explicite,
  un rechargement de page ou la fermeture de l'application MUST effacer la saisie et le
  résultat.
- **FR-021**: Un score global d'au moins 85 MUST valider l'étape d'audit et déverrouiller
  l'étape suivante ; un score inférieur à 85 MUST laisser l'étape suivante verrouillée.

### Formats des données et échanges

#### Entrée Markdown

Le contenu soumis est transmis au service d'audit sous forme de texte Markdown, accompagné de
sa source et, pour un fichier, de son nom :

```json
{
  "content": "# Objectif\nDécrire le besoin à auditer.",
  "source": "file",
  "fileName": "specification.md"
}
```

- `content` contient le texte Markdown décodé, jamais les octets binaires du fichier.
- `source` vaut `paste` pour un collage ou `file` pour un fichier chargé.
- `fileName` est le nom du fichier `.md` (255 caractères maximum) ; il vaut `null` pour un
  collage.
- Un seul document est traité par audit. La limite de 204 800 octets s'applique au contenu
  UTF-8 transmis.

#### Réponse structurée de l'IA

La sortie brute de l'IA est un objet JSON contenant uniquement `pillars` : un tableau de six
éléments ordonnés identifiés de `01` à `06`. Chaque élément contient `pillarId`, `score`
(entier de 0 à 100), `description` (1 à 2 000 caractères) et `improvements` (au moins une
chaîne de 1 à 500 caractères). Cette sortie ne contient pas le score global, le titre du
pilier, son niveau ni les métadonnées du document ; le service d'audit valide cette sortie et
complète le résultat destiné à l'interface.

#### Résultat JSON normalisé pour l'interface

Le résultat applicatif expose la structure suivante. Les valeurs ci-dessous sont illustratives ;
les six identifiants et les six titres sont normatifs et doivent toujours rester dans cet ordre.

```json
{
  "auditedAt": "2026-09-25T12:00:00.000Z",
  "documentName": "Texte collé",
  "source": "paste",
  "fileName": null,
  "globalScore": 80,
  "globalBand": "bon",
  "pillars": [
    {
      "pillarId": "01",
      "title": "Contexte & Objectif",
      "score": 80,
      "band": "bon",
      "description": "Le problème et l'objectif sont identifiés.",
      "improvements": ["Quantifier la valeur attendue."]
    },
    {
      "pillarId": "02",
      "title": "Périmètre",
      "score": 80,
      "band": "bon",
      "description": "Les limites du besoin sont décrites.",
      "improvements": ["Préciser les exclusions."]
    },
    {
      "pillarId": "03",
      "title": "Besoins Fonctionnels",
      "score": 80,
      "band": "bon",
      "description": "Les comportements attendus sont présents.",
      "improvements": ["Ajouter les règles métier manquantes."]
    },
    {
      "pillarId": "04",
      "title": "Données & Intégrations",
      "score": 80,
      "band": "bon",
      "description": "Les données et services concernés sont indiqués.",
      "improvements": ["Décrire les droits d'accès."]
    },
    {
      "pillarId": "05",
      "title": "Critères d'Acceptation",
      "score": 80,
      "band": "bon",
      "description": "Les résultats attendus peuvent être vérifiés.",
      "improvements": ["Ajouter un scénario d'erreur."]
    },
    {
      "pillarId": "06",
      "title": "Exigences Non Fonctionnelles",
      "score": 80,
      "band": "bon",
      "description": "Les contraintes de qualité sont abordées.",
      "improvements": ["Chiffrer les objectifs de performance."]
    }
  ],
  "model": "modèle Copilot configuré"
}
```

- `auditedAt` est une date ISO 8601 ; `documentName` est le nom du fichier sans extension ou
  « Texte collé » ; `fileName` vaut `null` pour un collage.
- `globalScore` est la moyenne arrondie des six scores. Le barème des niveaux est : 0 absent,
  1–24 très insuffisant, 25–49 insuffisant, 50–69 acceptable, 70–89 bon et 90–100 excellent.
- Chaque entrée de `pillars` comporte les propriétés `pillarId`, `title`, `score`, `band`,
  `description` et `improvements`. Les objets non conformes ou qui ne contiennent pas les six
  piliers ne sont pas affichés.
- Le JSON est le format de réponse entre le service d'audit et l'interface ; un téléchargement
  JSON n'est pas proposé dans cette évolution.

#### Rapport exporté en Markdown

La copie dans le presse-papiers et le téléchargement utilisent le même contenu Markdown. Le
fichier suit le nom `audit-<slug>-<AAAAMMJJ-HHMM>.md` et contient le nom du document, la date,
la source, le score global, le tableau des six piliers et le barème. Il n'inclut pas le texte
source audité. Le contrat détaillé est également décrit dans
`specs/001-markdown-spec-audit/contracts/report-format.md`.

### Interfaces et services externes

- **Authentification GitHub** : le flux OAuth Device Flow sert à identifier l'auditeur et à
  vérifier son accès Copilot. L'application ne demande ni ne reçoit le mot de passe GitHub.
- **Service GitHub Copilot** : après confirmation de l'auditeur, le contenu Markdown et les
  consignes d'évaluation sont transmis au service Copilot avec l'autorisation de son compte.
  Aucun autre fournisseur d'IA ni service tiers de stockage n'est utilisé pour l'audit.
- **Service d'audit local** : il reçoit la requête JSON décrite ci-dessus, vérifie
  l'authentification, la taille et la structure, appelle Copilot puis retourne le JSON
  normalisé à l'interface. En cas d'erreur, il retourne un code et un message compréhensible,
  sans contenu de document ni jeton.
- **Traitement et stockage temporaire** : le document et le résultat ne sont gardés qu'en
  mémoire pendant le parcours courant. Le traitement Copilot peut créer un état de session
  temporaire, désactivé pour l'historique et supprimé après l'audit ; l'application ne dispose
  d'aucun stockage documentaire persistant.

### Confidentialité et droits d'accès

- Le document et son résultat sont confidentiels et soumis aux mêmes droits d'accès. Ils sont
  accessibles uniquement à l'auditeur authentifié qui les a soumis, dans son instance locale ;
  aucun autre membre de l'organisation ne peut consulter la saisie ou le rapport depuis
  l'application.
- L'identifiant de session est protégé dans un cookie `HttpOnly` ; le jeton GitHub reste côté
  serveur et n'est jamais rendu au JavaScript de l'interface, placé dans une URL ou écrit dans
  un journal.
- Seul le contenu nécessaire à l'audit est transmis à GitHub Copilot, après action explicite
  et information préalable. RateMySDD ne conserve pas le document ou le résultat après la
  session d'utilisation ; le traitement et les éventuelles règles de conservation côté
  fournisseur restent régis par les conditions applicables à GitHub Copilot.
- Les échanges avec les services GitHub et GitHub Copilot MUST être chiffrés en transit.
- Aucun contenu de document, extrait de résultat, jeton, nom de fichier ou identifiant de
  compte n'est enregistré dans les journaux, traces, erreurs ou télémétrie de l'application.
- Les indicateurs de succès sont mesurés hors application au moyen de décomptes et de durées
  agrégés. Cette mesure ne collecte aucun document, résultat, score, nom, jeton, historique
  de navigation ou identifiant personnel.

### Key Entities

- **Auditeur authentifié** : utilisateur unique de l'instance locale, identifié par son compte
  GitHub et autorisé à utiliser Copilot.
- **Écran courant** : état de consultation de l'utilisateur, soit la saisie, soit le résultat.
- **Document courant** : texte Markdown ou fichier chargé avec sa source et son nom éventuel,
  conservés uniquement en mémoire pour la navigation et l'audit courant.
- **Dernier résultat valide** : résultat JSON normalisé associé au document courant ; il cesse
  d'être consultable dès que ce document est modifié ou remplacé.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Dans 100 % des scénarios d'audit réussi, le tableau complet apparaît dans un
  écran dédié et n'est pas affiché sous le formulaire de saisie.
- **SC-002**: Dans 100 % des tests de navigation retour, le texte, la source et le nom de
  fichier éventuel sont identiques avant et après le retour, et aucun audit supplémentaire
  n'est déclenché par la navigation.
- **SC-003**: Dans 100 % des tests où le document est modifié, le résultat précédent est
  indisponible jusqu'à la réussite d'un nouvel audit.
- **SC-004**: Dans 100 % des tests de session expirée, déconnectée ou remplacée par une autre
  identité, aucun utilisateur non autorisé ne peut consulter le document ou le résultat.
- **SC-005**: Lors d'un pilote, au moins 80 % des tâches d'audit valides prévues pour une revue
  métier aboutissent à la copie ou au téléchargement du rapport ; ce taux mesure l'adoption
  du parcours de résultat.
- **SC-006**: Lors du même pilote, le taux d'audits abandonnés diminue d'au moins 20 % en
  valeur relative par rapport au taux de référence du parcours précédent. Si le taux de
  référence est nul, le taux du pilote MUST également être nul.
- **SC-007**: Après utilisation du parcours, la satisfaction moyenne de l'auditeur est d'au
  moins 4 sur 5 sur une question portant sur la clarté du résultat et la facilité de retour à
  la saisie.
- **SC-008**: Dans au moins 90 % d'une série d'au moins dix tâches de test avec des utilisateurs
  représentatifs, l'utilisateur peut revenir du résultat à la saisie puis retrouver le
  dernier résultat inchangé sans aide et sans relancer l'audit.

### Méthode de mesure métier

Les seuils SC-005 à SC-007 sont des hypothèses initiales, à confirmer ou ajuster après une
mesure de référence. Le pilote compare quatre semaines de parcours initial et quatre semaines
de parcours avec sous-écran, avec au moins dix tâches d'audit comparables par période. Une
tâche admissible est une tâche prévue pour une revue métier, et non un test technique.
L'adoption est le nombre de tâches admissibles qui aboutissent à la copie ou au téléchargement
du rapport divisé par le nombre de tâches admissibles avec un audit valide. Un audit est dit
abandonné si la tâche a été commencée mais qu'aucun résultat valide n'a été copié ou téléchargé
avant la fin de la session de travail ; la réduction relative est calculée par rapport au taux
de référence, et si ce taux vaut zéro le taux du pilote doit rester à zéro. La satisfaction
est recueillie au moyen d'une question notée de 1 à 5 après chaque tâche de test et sa moyenne
est calculée pour le pilote. Un relevé manuel ne conserve que les nombres de tâches, les
décomptes agrégés, les notes de satisfaction et les durées ; aucune mesure n'est intégrée à
l'application. Si le volume minimal n'est pas atteint, les cibles restent non validées plutôt
que d'activer une collecte automatique.

## Assumptions

- Le « sous-écran » est un écran distinct au sein de l'application et du même onglet, et non
  une fenêtre surgissante, un nouvel onglet ou une application séparée.
- L'application reste locale et mono-utilisateur ; elle n'ajoute ni partage collaboratif,
  ni historique, ni téléchargement JSON.
- Les entrées acceptées restent le Markdown collé ou un unique fichier `.md` UTF-8 limité à
  204 800 octets. Le JSON normalisé est destiné à l'interface ; la copie et le téléchargement
  destinés à l'utilisateur restent au format Markdown.
- L'écran dédié ne modifie ni l'authentification, ni la grille des six piliers, ni le barème
  ou la méthode de calcul du score ; il précise les contrats et les règles de confidentialité
  de l'expérience existante.
- Les seuils d'adoption, d'abandon et de satisfaction sont des objectifs de pilote proposés,
  non des résultats déjà mesurés. Leur mesure manuelle et agrégée ne doit pas introduire de
  conservation du contenu audité.
