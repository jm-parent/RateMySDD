# Contrat : format du rapport d'audit (`.md`)

Généré dans le navigateur par la fonction partagée `renderReportMarkdown(result)` et utilisé
à l'identique pour **« Copier le résultat »** (FR-022) et **« Télécharger le rapport »**
(FR-022a).

## Nom du fichier

`audit-<slug>-<AAAAMMJJ-HHMM>.md`

- `<slug>` : `documentName` en minuscules, accents retirés, tout caractère hors `[a-z0-9]`
  remplacé par `-`, tirets consécutifs fusionnés, tirets en bordure retirés, tronqué à
  60 caractères. Texte collé → `texte-colle`. Slug vide → `document`.
- `<AAAAMMJJ-HHMM>` : `auditedAt` en heure locale du poste.
- Exemples : `spec-paiement.md` audité le 24/09/2026 à 14 h 05 →
  `audit-spec-paiement-20260924-1405.md` ; texte collé → `audit-texte-colle-20260924-1405.md`.

Le rapport précise le type d’artefact audité (`Spécification`, `Plan` ou `Tâches`).

## Contenu (normatif)

Les cellules sont échappées : `|` → `\|`, retours à la ligne → `<br>` ; les points
d'amélioration sont joints par `<br>• `, précédés de `• `.

```markdown
# Rapport d'audit — {documentName}

- **Date de l'audit** : {JJ/MM/AAAA HH:MM}
- **Type de document** : {Spécification | Plan | Tâches}
- **Source** : {Fichier `{fileName}` | Texte collé}
- **Score global** : **{globalScore}/100** ({bandLabel})

| # | Critère | Note | Description | Points d'amélioration |
|---|--------|------|-------------|-----------------------|
| 01 | {criterionTitle} | {score}/100 ({band}) | {description} | • {improvement 1}<br>• {improvement 2} |
| 02 | {criterionTitle} | … | … | … |
| 03 | {criterionTitle} | … | … | … |
| 04 | {criterionTitle} | … | … | … |
| 05 | {criterionTitle} | … | … | … |
| 06 | {criterionTitle} | … | … | … |

## Barème

| Note | Niveau |
|------|--------|
| 0 | absent |
| 1–24 | très insuffisant |
| 25–49 | insuffisant |
| 50–69 | acceptable |
| 70–89 | bon |
| 90–100 | excellent |

_Score global = moyenne simple des 6 critères, arrondie à l'entier le plus proche._
_Rapport généré par RateMySDD via GitHub Copilot._
```

## Invariants testables

- Exactement 6 lignes de critères, dans l'ordre `01` → `06`, avec les libellés canoniques du type audité.
- Aucune cellule vide ; le tableau reste valide même si un texte contient `|` ou des sauts de
  ligne.
- Le rapport ne contient **pas** le texte du document audité ni de son document de référence.
