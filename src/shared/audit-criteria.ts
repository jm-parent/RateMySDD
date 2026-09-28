import { PILLARS } from './pillars.js';
import type { PillarId } from './pillars.js';

export const AUDIT_DOCUMENT_TYPES = ['spec', 'plan', 'tasks'] as const;
export type AuditDocumentType = (typeof AUDIT_DOCUMENT_TYPES)[number];

export interface AuditCriterion {
  id: PillarId;
  title: string;
  description: string;
  guidingQuestions: readonly string[];
}

const planCriteria: AuditCriterion[] = [
  {
    id: '01',
    title: 'Alignement et Couverture Fonctionnelle',
    description:
      'Vérifie que le plan répond explicitement à toutes les exigences et contraintes définies dans le spec.md sans omettre de cas critiques.',
    guidingQuestions: [],
  },
  {
    id: '02',
    title: 'Architecture & Design Technique',
    description:
      "Évalue la pertinence de l'architecture choisie (patterns, séparation des responsabilités, choix des technos, respect des standards de l'équipe/du projet).",
    guidingQuestions: [],
  },
  {
    id: '03',
    title: 'Stratégie de Données & Modélisation',
    description:
      "Analyse la conception des modèles de données, des schémas, des flux d'informations et des stratégies de persistance ou de migration.",
    guidingQuestions: [],
  },
  {
    id: '04',
    title: 'Sécurité, Conformité & Robustesse',
    description:
      'S’assure que les aspects de sécurité (authentification, gestion des secrets, validation des entrées) et de résilience (gestion des erreurs, limites) sont anticipés.',
    guidingQuestions: [],
  },
  {
    id: '05',
    title: 'Stratégie de Test & Validation',
    description:
      'Vérifie la présence d’une stratégie claire pour les tests unitaires, d’intégration et E2E, ainsi que les critères d’acceptation techniques.',
    guidingQuestions: [],
  },
  {
    id: '06',
    title: 'Faisabilité, Risques & Découpage',
    description:
      'Évalue l’identification des risques techniques, des dépendances bloquantes et la clarté du découpage macro du projet.',
    guidingQuestions: [],
  },
];

const taskCriteria: AuditCriterion[] = [
  {
    id: '01',
    title: 'Granularité & Taille des Tâches',
    description:
      'Vérifie que les tâches sont de taille raisonnable (réalisables en une unité de temps cohérente, ex: quelques heures à un jour max) et atomiques.',
    guidingQuestions: [],
  },
  {
    id: '02',
    title: 'Séquencement & Dépendances',
    description:
      "Analyse l'ordre logique d'exécution des tâches, l'absence de cycles de dépendances bloquants et la clarté du chemin critique.",
    guidingQuestions: [],
  },
  {
    id: '03',
    title: 'Clarté et Actionnabilité des Descriptions',
    description:
      'Évalue la précision des libellés et des descriptions de tâches (un développeur sait-il immédiatement quoi faire, où coder et quels sont les livrables attendus ?).',
    guidingQuestions: [],
  },
  {
    id: '04',
    title: 'Traçabilité avec le Plan',
    description:
      'S’assure que chaque composant technique ou brique architecturale définie dans le plan se retrouve effectivement couvert par un ensemble de tâches.',
    guidingQuestions: [],
  },
  {
    id: '05',
    title: 'Définition du Terminé (DoD) & Critères de Validation',
    description:
      'Vérifie que chaque tâche (ou lot de tâches) intègre des critères de succès explicites (tests passés, revue de code, documentation mise à jour).',
    guidingQuestions: [],
  },
  {
    id: '06',
    title: 'Gestion des Risques & Tâches Transverses',
    description:
      'Analyse la prise en compte des tâches d’infrastructure, de configuration CI/CD, de gestion de la dette technique ou des jalons de validation intermédiaire.',
    guidingQuestions: [],
  },
];

export const AUDIT_CRITERIA: Record<AuditDocumentType, readonly AuditCriterion[]> = {
  spec: PILLARS.map(({ id, title, guidingQuestions }) => ({
    id,
    title,
    description: guidingQuestions.join(' '),
    guidingQuestions,
  })),
  plan: planCriteria,
  tasks: taskCriteria,
};

export function criteriaForDocumentType(
  documentType: AuditDocumentType,
): readonly AuditCriterion[] {
  return AUDIT_CRITERIA[documentType];
}