<!--
Sync Impact Report
==================
Version change: (template, non versionné) → 1.0.0
Modified principles (placeholders → titres définitifs):
  - [PRINCIPLE_1_NAME] → I. Audit de spécification pour l'utilisateur Copilot authentifié
  - [PRINCIPLE_2_NAME] → II. Règle d'or des 6 piliers (NON NÉGOCIABLE)
  - [PRINCIPLE_3_NAME] → III. Format de sortie normalisé
  - [PRINCIPLE_4_NAME] → IV. Authentification sécurisée
  - [PRINCIPLE_5_NAME] → V. Confidentialité des données transmises à l'IA
Added sections:
  - Contraintes de traitement des documents (ex-[SECTION_2_NAME])
  - Workflow de développement et barrières qualité (ex-[SECTION_3_NAME])
  - Governance (renseignée)
Removed sections: aucune
Templates: non modifiés (lecture de la constitution à l'exécution, cf. Scope Guard)
Follow-up TODOs: aucun
-->

# RateMySDD Constitution

## Core Principles

### I. Audit de spécification pour l'utilisateur Copilot authentifié

RateMySDD est une application web qui permet à un utilisateur connecté avec son compte
GitHub Copilot d'auditer un document de spécification rédigé en Markdown.

- L'audit MUST être accessible uniquement à un utilisateur authentifié via son compte Copilot ;
  aucune analyse anonyme n'est autorisée.
- Le document MUST pouvoir être fourni de deux manières : upload d'un fichier `.md` ou
  collage direct du contenu Markdown dans l'interface.
- Les deux modes d'entrée MUST produire un résultat d'audit strictement équivalent pour un
  même contenu.
- Toute fonctionnalité ajoutée MUST servir directement cette finalité d'audit ; les
  fonctionnalités hors périmètre MUST être justifiées dans le plan concerné.

**Rationale** : une vision unique et étroite garantit un produit simple, testable et dont la
valeur (améliorer la qualité des spécifications) reste mesurable.

### II. Règle d'or des 6 piliers (NON NÉGOCIABLE)

Toute évaluation MUST structurer ses retours selon exactement six piliers, dans cet ordre,
sans en omettre, fusionner ni en ajouter :

1. **Contexte & Objectif** — Quel problème résout-on ? Quelle valeur métier est attendue ?
   Quels indicateurs permettront de mesurer le succès ?
2. **Périmètre** — Qui sont les utilisateurs finaux ? Quels sont leurs parcours clés ?
   Quels besoins sont prioritaires ?
3. **Besoins Fonctionnels** — Ce que le système doit faire, comportements attendus,
   règles métier précises.
4. **Données & Intégrations** — Données d'entrée et de sortie, sources, référentiels et
   interfaces, droits d'accès et confidentialité.
5. **Critères d'Acceptation** — Scénarios nominaux et cas d'erreur, résultats attendus
   observables et testables, conditions de validation métier.
6. **Exigences Non Fonctionnelles** — Performance, sécurité, disponibilité, traçabilité,
   conformité, maintenabilité, contraintes techniques et d'exploitation.

- Un pilier absent du document audité MUST tout de même apparaître dans le résultat, avec
  une note minimale et une description explicitant l'absence.
- Les prompts envoyés à l'IA MUST imposer ces six piliers et leurs questions directrices ;
  toute réponse de l'IA ne respectant pas cette structure MUST être rejetée ou corrigée
  avant affichage.

**Rationale** : un référentiel fixe rend les audits comparables entre documents et dans le
temps, et empêche l'IA de produire des retours non structurés ou partiels.

### III. Format de sortie normalisé

Le résultat d'un audit MUST être présenté sous la forme d'un tableau synthétique comportant
une ligne par pilier (six lignes) et, pour chaque pilier, les trois colonnes suivantes :

- **Note** : valeur sur une échelle unique, documentée et identique pour les six piliers ;
- **Description** : constat factuel de ce que le document couvre (ou ne couvre pas) pour
  ce pilier ;
- **Points d'amélioration** : recommandations concrètes et actionnables ; si aucune n'est
  nécessaire, la cellule MUST l'indiquer explicitement.

- La réponse de l'IA MUST être obtenue sous une forme structurée (ex. JSON validé par un
  schéma) puis rendue en tableau ; le rendu MUST NOT dépendre d'un parsing libre de texte.
- Les lignes et colonnes du rendu final MUST NOT être vides ni tronquées.

**Rationale** : un format constant permet une lecture rapide, la comparaison entre audits et
la validation automatique de la sortie.

### IV. Authentification sécurisée

- L'authentification MUST reposer sur le flux OAuth officiel GitHub / Copilot ; l'application
  MUST NOT collecter ni stocker de mot de passe.
- Les scopes demandés MUST être limités au strict nécessaire (moindre privilège) et
  documentés.
- Les jetons d'accès MUST être conservés côté serveur ou dans des cookies `HttpOnly`,
  `Secure`, `SameSite`, et MUST NOT être exposés au JavaScript client, aux logs ou aux URL.
- Les sessions MUST expirer, être révocables par déconnexion, et être protégées contre le
  CSRF.
- Les secrets (client secret OAuth, clés) MUST être injectés par configuration
  d'environnement ou coffre de secrets, jamais versionnés.

**Rationale** : l'application agit au nom de l'utilisateur sur son compte Copilot ; une fuite
de jeton compromettrait directement son identité et ses droits.

### V. Confidentialité des données transmises à l'IA

- Le contenu des documents audités MUST être considéré comme confidentiel par défaut.
- Seul le contenu strictement nécessaire à l'audit MUST être transmis à l'IA, uniquement via
  le service Copilot de l'utilisateur authentifié, et exclusivement sur des canaux chiffrés
  (TLS).
- Les documents et résultats MUST NOT être persistés au-delà de la durée de traitement, sauf
  consentement explicite de l'utilisateur ; toute persistance MUST être documentée et
  supprimable par l'utilisateur.
- Le contenu des documents MUST NOT apparaître dans les logs, traces, métriques ou messages
  d'erreur ; seules des métadonnées non sensibles (taille, durée, statut) sont autorisées.
- Les données d'un utilisateur MUST NOT être accessibles à un autre utilisateur.
- L'utilisateur MUST être informé, avant l'envoi, que son document sera transmis à l'IA.

**Rationale** : les spécifications contiennent souvent des informations stratégiques ou
personnelles ; la confiance des utilisateurs conditionne l'adoption de l'outil.

## Contraintes de traitement des documents

- Seuls les contenus Markdown (`.md` ou texte collé) sont acceptés ; le type, l'encodage
  (UTF-8) et une taille maximale documentée MUST être validés côté serveur.
- Le rendu de tout contenu Markdown ou de toute sortie de l'IA MUST être assaini pour
  prévenir les injections (XSS, HTML/JS arbitraire).
- Le document audité MUST être traité comme une donnée et non comme une instruction : les
  prompts MUST isoler le contenu utilisateur pour limiter les injections de prompt.
- Les erreurs (authentification, taille, indisponibilité de l'IA, réponse non conforme)
  MUST produire un message clair à l'utilisateur sans exposer de détails internes.

## Workflow de développement et barrières qualité

- Chaque plan d'implémentation (`/speckit-plan`) MUST contenir une vérification de
  conformité (Constitution Check) couvrant les principes I à V.
- Des tests automatisés MUST vérifier : la présence et l'ordre des six piliers, la présence
  des trois colonnes par pilier, et le rejet des réponses IA non conformes au schéma.
- Des tests MUST vérifier qu'aucune route d'audit n'est accessible sans authentification et
  qu'aucun contenu de document n'est écrit dans les logs.
- Toute modification touchant l'authentification, la gestion des jetons ou l'envoi de
  données à l'IA MUST faire l'objet d'une revue de sécurité avant fusion.
- Les dépendances MUST être maintenues à jour et analysées pour les vulnérabilités connues.

## Governance

- Cette constitution prévaut sur toute autre pratique ou convention du projet. En cas de
  conflit, la constitution s'applique.
- Toute modification MUST être proposée par écrit, justifiée, relue et approuvée, et
  s'accompagner d'un plan de migration si des artefacts existants sont impactés.
- Versionnement sémantique :
  - MAJOR : suppression ou redéfinition incompatible d'un principe (ex. modification des
    six piliers ou du format de sortie) ;
  - MINOR : ajout d'un principe ou d'une section, ou extension matérielle d'une règle ;
  - PATCH : clarification, reformulation ou correction sans impact sémantique.
- Chaque revue de code et chaque plan MUST vérifier la conformité aux principes ; toute
  dérogation MUST être justifiée dans la section « Complexity Tracking » du plan.
- Une revue de conformité globale SHOULD être menée à chaque version majeure du produit.

**Version**: 1.0.0 | **Ratified**: 2026-09-24 | **Last Amended**: 2026-09-24
