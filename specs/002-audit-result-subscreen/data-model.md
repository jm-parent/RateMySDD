# Phase 1 — Data Model : Sous-écran dédié au résultat d’audit

**Feature**: `002-audit-result-subscreen` | **Date**: 2026-09-25

Aucune donnée métier n'est ajoutée au stockage persistant. Les transitions et les données
restent dans l'état React de `App`; l'authentification demeure dans la session serveur en
mémoire. Le corps et le JSON de réponse de `POST /api/audits` restent inchangés ; les
réponses authentifiées exposent une échéance de session dans un en-tête HTTP.

## AuditPageState (état d'interface volatile)

| Champ | Type | Règles |
|-------|------|--------|
| `screen` | `"input" \| "result"` | vue visible ; une seule vue est rendue à la fois |
| `content` | string | texte Markdown en cours ; maximum existant de 204 800 octets UTF-8 |
| `source` | `"paste" \| "file"` | mode d'entrée courant |
| `fileName` | string \| null | nom du `.md` courant ; `null` pour le texte collé |
| `status` | `"idle" \| "running" \| "done" \| "error"` | état du dernier appel d'audit |
| `result` | `AuditResult` \| null | dernier résultat valide associé au document inchangé |
| `error` | string \| null | message compréhensible affiché sur la vue de saisie |

L'état est une extension du type actuellement défini dans `src/web/components/AuditPage.tsx`.
Il ne contient ni copie persistante du document, ni historique de navigation.

## Propriétaire d'état (identité authentifiée)

| Champ | Type | Règles |
|-------|------|--------|
| `login` courant | string \| null | identité déjà exposée par la session ; conservée en mémoire pour comparer une réauthentification |
| état d'authentification | `User` \| null | seul un utilisateur connecté avec accès Copilot peut voir l'application d'audit |
| échéance de session | string RFC 3339 \| null | valeur serveur de `X-Session-Expires-At` ; pilote le verrouillage client et n'est jamais persistée |

L'identité précédente est conservée uniquement en mémoire pendant l'écran de connexion après
expiration. Même identité : reprise de l'état d'audit ; identité différente : remise à
l'état initial. La déconnexion, le rechargement ou la fermeture de l'application supprime cet
état. Le minuteur utilise l'échéance absolue communiquée par le serveur, sans recopier le TTL
dans le navigateur ; les réponses authentifiées suivantes mettent cette échéance à jour.

## AuditResult (contrat existant, non modifié)

Un résultat valide est la réponse partagée `AuditResult` : métadonnées d'audit, score global,
niveau global, nom du modèle et exactement six évaluations ordonnées selon `PILLARS`. Chaque
évaluation contient son identifiant, son titre, sa note, son niveau, sa description et au
moins un point d'amélioration.

Le détail des types, limites et valeurs est défini par
`src/shared/schemas.ts` et `specs/001-markdown-spec-audit/contracts/openapi.yaml`. Le résultat
reste associé au contenu, à la source et au nom de fichier qui ont produit l'audit. Les
handlers de modification du contenu, de chargement et de retrait de fichier l'invalident.

## Transitions d'état

| État courant | Événement | État suivant |
|--------------|-----------|--------------|
| `input / idle` | lancement d'audit valide | `input / running` |
| `input / running` | résultat conforme reçu | `result / done` avec le nouvel `AuditResult` |
| `input / running` | erreur ou réponse non conforme | `input / error`, document conservé |
| `result / done` | commande de modification | `input / done`, même document et résultat |
| `input / done` | réouverture du dernier résultat valide | `result / done`, aucune requête d'audit |
| toute vue avec résultat | modification du texte, remplacement ou retrait du fichier | `input / idle`, résultat supprimé |
| toute session authentifiée | réponse authentifiée contenant `X-Session-Expires-At` | échéance en mémoire et minuteur client mis à jour |
| toute vue authentifiée | échéance du minuteur ou échéance dépassée au retour de visibilité | écran de connexion visible, état conservé uniquement en mémoire |
| toute vue authentifiée | statut non authentifié ou 401 | écran de connexion visible, état conservé uniquement en mémoire |
| toute vue authentifiée | contrôle de statut authentifié | échéance serveur mise à jour ; le `GET /api/session` ne renouvelle pas la session |
| écran de connexion | authentification avec le même `login` | vue d'audit précédente restaurée |
| écran de connexion | authentification avec un autre `login` | état initial `input / idle`, sans document ni résultat précédent |
| toute vue authentifiée | déconnexion explicite | état initial avant retour à l'écran de connexion |
| toute vue | rechargement ou fermeture | état perdu, aucune récupération possible |

Un résultat précédent peut rester valide en mémoire après l'échec d'une nouvelle tentative
uniquement si le document n'a pas changé ; il n'est jamais présenté comme le résultat d'un
document modifié. Aucun état d'audit n'est partagé entre deux identités.
