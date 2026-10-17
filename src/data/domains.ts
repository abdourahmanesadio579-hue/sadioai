import { DomainCategory } from '../types/chat';

export const DOMAINS: DomainCategory[] = [
  {
    id: 'general',
    label: 'Tous Domaines',
    iconName: 'Globe',
    description: 'Posez n’importe quelle question sans aucune limite de sujet.',
    color: 'cyan',
    sampleQuestions: [
      'Explique-moi les principes de la relativité générale d’Einstein avec des exemples concrets.',
      'Comment fonctionne un ordinateur quantique par rapport à un ordinateur classique ?',
      'Quelle est la différence fondamentale entre existentialisme et stoïcisme ?',
    ],
  },
  {
    id: 'science',
    label: 'Sciences & Univers',
    iconName: 'Atom',
    description: 'Physique, astrophysique, chimie, mécanique quantique et cosmologie.',
    color: 'purple',
    sampleQuestions: [
      'Que se passe-t-il exactement à l’horizon des événements d’un trou noir ?',
      'Comment la photosynthèse convertit-elle la lumière photonique en énergie chimique ?',
      'Explique la théorie des cordes et le problème des dimensions supplémentaires.',
    ],
  },
  {
    id: 'coding',
    label: 'Code & Informatique',
    iconName: 'Code',
    description: 'Algorithmique, architecture logicielle, TypeScript, Python, IA & DevOps.',
    color: 'emerald',
    sampleQuestions: [
      'Écris une implémentation complète d’un algorithme A* (pathfinding) en TypeScript avec commentaires détaillés.',
      'Comment concevoir une architecture microservices hautement résiliente avec du caching distribué ?',
      'Explique le fonctionnement du mécanisme d’attention Transformer (Attention is all you need).',
    ],
  },
  {
    id: 'history',
    label: 'Histoire & Géopolitique',
    iconName: 'Landmark',
    description: 'Grandes civilisations, tournants historiques, traités et stratégie mondiale.',
    color: 'amber',
    sampleQuestions: [
      'Quelles sont les causes profondes et sous-estimées de la chute de l’Empire romain d’Occident ?',
      'Analyse l’impact géopolitique de la Route de la Soie sur le commerce et les échanges culturels médiévaux.',
      'Comment la révolution industrielle du XIXe siècle a-t-elle transformé la structure démographique urbaine ?',
    ],
  },
  {
    id: 'math',
    label: 'Mathématiques & Logique',
    iconName: 'Binary',
    description: 'Théorie des nombres, calcul différentiel, géométrie et paradoxes logiques.',
    color: 'cyan',
    sampleQuestions: [
      'Explique le théorème d’incomplétude de Gödel et ses implications sur les fondements des mathématiques.',
      'Démontre pourquoi le nombre Pi est transcendant et ce que cela implique pour la quadrature du cercle.',
      'Qu’est-ce que l’hypothèse de Riemann et pourquoi est-elle considérée comme l’un des plus grands mystères ?',
    ],
  },
  {
    id: 'philosophy',
    label: 'Philosophie & Éthique',
    iconName: 'Compass',
    description: 'Épistémologie, morale, conscience humaine et dilemmes éthiques de l’IA.',
    color: 'purple',
    sampleQuestions: [
      'Peut-on concevoir une conscience artificielle dotée d’une véritable expérience subjective (qualia) ?',
      'Compare la conception de la justice selon John Rawls et Robert Nozick.',
      'Quelle réponse la philosophie contemporaine apporte-t-elle au problème du libre arbitre et du déterminisme ?',
    ],
  },
  {
    id: 'health',
    label: 'Biologie & Santé',
    iconName: 'Activity',
    description: 'Génétique, neurosciences, immunologie et mécanismes cellulaires.',
    color: 'emerald',
    sampleQuestions: [
      'Comment le système immunitaire adaptatif garde-t-il la mémoire d’un agent pathogène ?',
      'Explique le fonctionnement des neurotransmetteurs (dopamine, sérotonine) dans la plasticité cérébrale.',
      'Comment la technologie CRISPR-Cas9 permet-elle d’éditer précisément l’ADN ?',
    ],
  },
  {
    id: 'practical',
    label: 'Vie Pratique & Conseil',
    iconName: 'Lightbulb',
    description: 'Méthodes d’apprentissage rapide, gestion de projet, prise de décision.',
    color: 'amber',
    sampleQuestions: [
      'Donne-moi une méthode scientifique et structurée pour apprendre une nouvelle langue en 6 mois.',
      'Comment construire un plan financier d’investissement diversifié et équilibré ?',
      'Quelles sont les meilleures techniques cognitives pour surmonter la procrastination chronique ?',
    ],
  },
];
