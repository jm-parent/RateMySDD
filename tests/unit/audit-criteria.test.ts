import { describe, expect, it } from 'vitest';
import { AUDIT_CRITERIA } from '../../src/shared/audit-criteria.js';

describe('audit criteria', () => {
  it('defines six ordered criteria for each document type', () => {
    for (const criteria of Object.values(AUDIT_CRITERIA)) {
      expect(criteria).toHaveLength(6);
      expect(criteria.map(({ id }) => id)).toEqual([
        '01',
        '02',
        '03',
        '04',
        '05',
        '06',
      ]);
    }
  });

  it('keeps the plan and tasks criteria separate and correctly titled', () => {
    expect(AUDIT_CRITERIA.plan.map(({ title }) => title)).toEqual([
      'Alignement et Couverture Fonctionnelle',
      'Architecture & Design Technique',
      'Stratégie de Données & Modélisation',
      'Sécurité, Conformité & Robustesse',
      'Stratégie de Test & Validation',
      'Faisabilité, Risques & Découpage',
    ]);
    expect(AUDIT_CRITERIA.tasks.map(({ title }) => title)).toEqual([
      'Granularité & Taille des Tâches',
      'Séquencement & Dépendances',
      'Clarté et Actionnabilité des Descriptions',
      'Traçabilité avec le Plan',
      'Définition du Terminé (DoD) & Critères de Validation',
      'Gestion des Risques & Tâches Transverses',
    ]);
  });
});