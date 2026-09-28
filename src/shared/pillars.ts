export const PILLAR_IDS = ['01', '02', '03', '04', '05', '06'] as const;

export type PillarId = (typeof PILLAR_IDS)[number];

export const PILLARS = [
  {
    id: '01',
    title: 'Contexte & Objectif',
    guidingQuestions: [
      'Quel problème résout-on ?',
      'Quelle valeur métier est attendue ?',
      'Quels indicateurs permettront de mesurer le succès ?',
    ],
  },
  {
    id: '02',
    title: 'Périmètre',
    guidingQuestions: [
      'Qui sont les utilisateurs finaux ?',
      'Quels sont leurs parcours clés ?',
      'Quels besoins sont prioritaires ?',
    ],
  },
  {
    id: '03',
    title: 'Besoins Fonctionnels',
    guidingQuestions: [
      'Ce que le système doit faire',
      'Comportements attendus',
      'Règles métier précises',
    ],
  },
  {
    id: '04',
    title: 'Données & Intégrations',
    guidingQuestions: [
      "Données d'entrée et de sortie",
      'Sources, référentiels et interfaces',
      "Droits d'accès et confidentialité",
    ],
  },
  {
    id: '05',
    title: "Critères d'Acceptation",
    guidingQuestions: [
      'Scénarios nominaux et cas d’erreur',
      'Résultats attendus, observables et testables',
      'Conditions de validation métier',
    ],
  },
  {
    id: '06',
    title: 'Exigences Non Fonctionnelles',
    guidingQuestions: [
      'Performance, sécurité, disponibilité',
      'Traçabilité, conformité et maintenabilité',
      "Contraintes techniques et d'exploitation",
    ],
  },
] as const;
