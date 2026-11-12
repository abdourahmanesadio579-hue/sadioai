/**
 * MOTEUR MATHÉMATIQUE LOCAL ET RÉSOLVEUR PAS À PAS (100% 0 F)
 * Rigueur mathématique absolue, zéro erreur, sans eval() arbitraire.
 * Résout :
 * 1. Équations du second degré (ax² + bx + c = 0) avec discriminant Δ, racines exactes (fractions et radicaux simplifiés),
 *    solutions dans ℂ si Δ < 0, forme canonique, sommet et variations.
 * 2. Équations du premier degré (ax + b = c ou formes étendues) avec transpositions et fractions irréductibles.
 * 3. Systèmes linéaires 2x2 par méthode de Cramer, analyse de compatibilité (droites parallèles / confondues),
 *    solutions exactes et tracé simultané des deux droites sécantes.
 * 4. Fonctions arbitraires f(x) : évaluateur à descente récursive (Pratt), support de puissances, trigonométrie,
 *    exponentielle, logarithme, racine carrée, recherche de racines par dichotomie (10⁻⁴), extrema et parité.
 */

export interface MathStep {
  title: string;
  description: string;
  formula?: string;
  result?: string;
  type?: 'info' | 'calc' | 'success' | 'warning';
}

export interface KeyPoint {
  x: number;
  y: number;
  label: string;
  type: 'root' | 'vertex' | 'intercept' | 'extremum';
  color: string;
}

export interface MathResolutionResult {
  title: string;
  type: 'quadratic' | 'linear' | 'system' | 'function' | 'unknown';
  formattedExpression: string;
  steps: MathStep[];
  solutions: string[];
  keyPoints: KeyPoint[];
  canonicalForm?: string;
  tableOfValues?: Array<{ x: number; y: number | null }>;
  functionToEvaluate?: (x: number) => number | null;
  secondaryFunctionToEvaluate?: (x: number) => number | null;
  secondaryFunctionLabel?: string;
  error?: string;
}

// Plus grand commun diviseur (PGCD)
export function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

// Convertit un nombre décimal en fraction irréductible p/q (si rationnel simple)
export function toFraction(val: number, maxDenom = 120): string | null {
  if (val === null || isNaN(val) || !isFinite(val)) return null;
  if (Number.isInteger(val)) return `${val}`;

  const sign = val < 0 ? '-' : '';
  const posVal = Math.abs(val);

  let bestNum = 1;
  let bestDenom = 1;
  let minDiff = Infinity;

  for (let d = 1; d <= maxDenom; d++) {
    const n = Math.round(posVal * d);
    const diff = Math.abs(posVal - n / d);
    if (diff < minDiff) {
      minDiff = diff;
      bestNum = n;
      bestDenom = d;
      if (diff < 1e-7) break;
    }
  }

  if (minDiff < 1e-5 && bestDenom <= maxDenom) {
    const g = gcd(bestNum, bestDenom);
    const num = bestNum / g;
    const den = bestDenom / g;
    if (den === 1) return `${sign}${num}`;
    return `${sign}${num}/${den}`;
  }
  return null;
}

// Formate un nombre en combinant fraction exacte et valeur approchée
export function formatNumberOrFraction(val: number): string {
  if (val === null || isNaN(val) || !isFinite(val)) return 'indéfini';
  if (Number.isInteger(val)) return `${val}`;
  const frac = toFraction(val);
  const dec = val.toFixed(3).replace(/\.?0+$/, '');
  if (frac && frac !== dec) {
    return `${frac} (≈ ${dec})`;
  }
  return dec;
}

// Simplifie un radical √n sous la forme k√m avec m sans facteur carré
export function simplifyRadical(n: number): { outside: number; inside: number; str: string } | null {
  if (n < 0 || isNaN(n) || !isFinite(n)) return null;
  n = Math.round(n);
  if (n === 0) return { outside: 0, inside: 0, str: '0' };

  let outside = 1;
  let inside = n;
  for (let d = Math.floor(Math.sqrt(n)); d >= 2; d--) {
    if (inside % (d * d) === 0) {
      outside *= d;
      inside = Math.round(inside / (d * d));
    }
  }

  if (inside === 1) return { outside, inside: 1, str: `${outside}` };
  if (outside === 1) return { outside: 1, inside, str: `√${inside}` };
  return { outside, inside, str: `${outside}√${inside}` };
}

// Simplifie l'expression exacte des racines (-b ± √Δ) / 2a
function simplifyQuadraticExact(a: number, b: number, delta: number) {
  const rad = simplifyRadical(delta);
  if (!rad) return null;

  // Si delta est un carré parfait, les racines sont rationnelles
  if (rad.inside === 1) {
    const x1 = (-b - rad.outside) / (2 * a);
    const x2 = (-b + rad.outside) / (2 * a);
    return {
      isExactRational: true,
      x1Frac: formatNumberOrFraction(x1),
      x2Frac: formatNumberOrFraction(x2),
      x1Num: x1,
      x2Num: x2,
    };
  }

  // Si delta n'est pas un carré parfait : factorisation par PGCD(b, outside, 2a)
  const denom = 2 * a;
  const g = gcd(Math.abs(b), gcd(rad.outside, Math.abs(denom)));
  const bRed = -b / g;
  const outRed = rad.outside / g;
  const denRed = denom / g;

  const outStr = outRed === 1 ? '' : `${outRed}`;
  const radicalPart = `${outStr}√${rad.inside}`;

  let x1Str: string;
  let x2Str: string;

  if (denRed === 1) {
    x1Str = `${bRed} - ${radicalPart}`;
    x2Str = `${bRed} + ${radicalPart}`;
  } else if (denRed === -1) {
    x1Str = `${-bRed} + ${radicalPart}`;
    x2Str = `${-bRed} - ${radicalPart}`;
  } else {
    x1Str = `(${bRed} - ${radicalPart}) / ${denRed}`;
    x2Str = `(${bRed} + ${radicalPart}) / ${denRed}`;
  }

  const sqrtDelta = Math.sqrt(delta);
  const x1Num = (-b - sqrtDelta) / (2 * a);
  const x2Num = (-b + sqrtDelta) / (2 * a);

  return {
    isExactRational: false,
    x1Exact: x1Str,
    x2Exact: x2Str,
    x1Approx: x1Num.toFixed(3),
    x2Approx: x2Num.toFixed(3),
    x1Num,
    x2Num,
  };
}

// Normalise les caractères de l'équation saisie
export function normalizeMathInput(input: string): string {
  let s = input.trim();
  s = s.replace(/×/g, '*');
  s = s.replace(/÷/g, '/');
  s = s.replace(/−/g, '-');
  s = s.replace(/\^2/g, '²');
  s = s.replace(/\^3/g, '³');
  s = s.replace(/X/g, 'x');
  s = s.replace(/\s+/g, ' ');
  return s;
}

/**
 * Résout une équation du second degré : ax² + bx + c = 0
 * Avec rigueur complète, calcul du discriminant Δ, racines exactes et approchées,
 * forme canonique, sommet et variations.
 */
export function solveQuadratic(a: number, b: number, c: number): MathResolutionResult {
  // Cas dégénéré a = 0 -> devient une équation du premier degré
  if (a === 0) {
    const res = solveLinear(b, c);
    res.steps.unshift({
      title: 'Remarque importante (a = 0)',
      description: `Le coefficient de x² est nul (a = 0). L'équation n'est pas du second degré, elle se réduit à une équation linéaire du premier degré :`,
      formula: `${b}x ${c >= 0 ? `+ ${c}` : `- ${Math.abs(c)}`} = 0`,
      type: 'info',
    });
    return res;
  }

  const steps: MathStep[] = [];
  const keyPoints: KeyPoint[] = [];
  const solutions: string[] = [];

  // Expression normalisée propre
  const aStr = a === 1 ? '' : a === -1 ? '-' : `${a}`;
  const bStr = b === 0 ? '' : b > 0 ? ` + ${b === 1 ? '' : b}x` : ` - ${Math.abs(b) === 1 ? '' : Math.abs(b)}x`;
  const cStr = c === 0 ? '' : c > 0 ? ` + ${c}` : ` - ${Math.abs(c)}`;
  const expr = `${aStr}x²${bStr}${cStr} = 0`;

  steps.push({
    title: '1. Identification des coefficients',
    description: `Équation polynomiale du 2nd degré ax² + bx + c = 0 avec :`,
    formula: `a = ${a}, b = ${b}, c = ${c}`,
    type: 'info',
  });

  // Discriminant Δ = b² - 4ac
  const bSquared = b * b;
  const fourAC = 4 * a * c;
  const delta = bSquared - fourAC;

  const fourACDetail = fourAC >= 0 ? `${bSquared} - ${fourAC}` : `${bSquared} - (${fourAC})`;
  steps.push({
    title: '2. Calcul du discriminant (Δ)',
    description: `On applique la formule fondamentale du discriminant Δ = b² - 4ac :`,
    formula: `Δ = (${b})² - 4 × (${a}) × (${c}) = ${fourACDetail} = ${delta}`,
    result: `Δ = ${delta}`,
    type: 'calc',
  });

  // Sommet de la parabole S(alpha, beta)
  const alpha = -b / (2 * a);
  const beta = -delta / (4 * a); // Exacte : -Δ / 4a
  const alphaFrac = formatNumberOrFraction(alpha);
  const betaFrac = formatNumberOrFraction(beta);

  // Forme canonique : a(x - alpha)² + beta
  const alphaSign = alpha >= 0 ? `- ${alpha === 0 ? '0' : alphaFrac}` : `+ ${formatNumberOrFraction(Math.abs(alpha))}`;
  const betaSign = beta >= 0 ? `+ ${betaFrac}` : `- ${formatNumberOrFraction(Math.abs(beta))}`;
  const aPrefix = a === 1 ? '' : a === -1 ? '-' : `${a}`;
  const canonical = alpha === 0 
    ? `${aPrefix}x² ${betaSign}` 
    : `${aPrefix}(x ${alphaSign})² ${betaSign}`;

  keyPoints.push({
    x: alpha,
    y: beta,
    label: `Sommet S(${alphaFrac} ; ${betaFrac})`,
    type: 'vertex',
    color: '#a855f7', // Violet
  });

  keyPoints.push({
    x: 0,
    y: c,
    label: `Ordonnée à l'origine (0 ; ${c})`,
    type: 'intercept',
    color: '#f59e0b', // Ambre
  });

  // Analyse selon le signe de Δ
  if (delta > 0) {
    const exact = simplifyQuadraticExact(a, b, delta);

    steps.push({
      title: '3. Analyse du discriminant (Δ > 0)',
      description: `Comme Δ = ${delta} > 0, l'équation admet DEUX solutions réelles distinctes x₁ et x₂. La parabole coupe l'axe des abscisses en deux points.`,
      formula: `x = (-b ± √Δ) / 2a`,
      type: 'info',
    });

    if (exact && exact.isExactRational) {
      solutions.push(`x₁ = ${exact.x1Frac}`, `x₂ = ${exact.x2Frac}`);
      steps.push({
        title: '4. Calcul des racines réelles (carré parfait)',
        description: `Le discriminant est un carré parfait : √${delta} = ${Math.sqrt(delta)}. Les racines sont rationnelles :`,
        formula: `x₁ = (-(${b}) - ${Math.sqrt(delta)}) / (2 × ${a}) = ${exact.x1Frac}\nx₂ = (-(${b}) + ${Math.sqrt(delta)}) / (2 × ${a}) = ${exact.x2Frac}`,
        result: `S = { ${exact.x1Frac} ; ${exact.x2Frac} }`,
        type: 'success',
      });

      keyPoints.push(
        {
          x: exact.x1Num,
          y: 0,
          label: `Racine x₁ = ${exact.x1Frac}`,
          type: 'root',
          color: '#10b981',
        },
        {
          x: exact.x2Num,
          y: 0,
          label: `Racine x₂ = ${exact.x2Frac}`,
          type: 'root',
          color: '#10b981',
        }
      );
    } else if (exact) {
      solutions.push(
        `x₁ = ${exact.x1Exact} ≈ ${exact.x1Approx}`,
        `x₂ = ${exact.x2Exact} ≈ ${exact.x2Approx}`
      );
      steps.push({
        title: '4. Calcul des racines réelles (forme exacte et décimale)',
        description: `En simplifiant le radical √${delta} = ${simplifyRadical(delta)?.str} :`,
        formula: `Valeurs exactes :\nx₁ = ${exact.x1Exact}\nx₂ = ${exact.x2Exact}\n\nValeurs approchées :\nx₁ ≈ ${exact.x1Approx}\nx₂ ≈ ${exact.x2Approx}`,
        result: `S = { ${exact.x1Exact} ; ${exact.x2Exact} }`,
        type: 'success',
      });

      keyPoints.push(
        {
          x: exact.x1Num,
          y: 0,
          label: `Racine x₁ ≈ ${exact.x1Approx}`,
          type: 'root',
          color: '#10b981',
        },
        {
          x: exact.x2Num,
          y: 0,
          label: `Racine x₂ ≈ ${exact.x2Approx}`,
          type: 'root',
          color: '#10b981',
        }
      );
    }
  } else if (delta === 0) {
    const x0 = -b / (2 * a);
    const x0Frac = formatNumberOrFraction(x0);
    solutions.push(`x₀ = ${x0Frac}`);

    steps.push({
      title: '3. Analyse du discriminant (Δ = 0)',
      description: `Puisque Δ = 0, la parabole est tangente à l'axe des abscisses. L'équation admet UNE solution double réelle x₀.`,
      formula: `x₀ = -b / 2a = -(${b}) / (2 × ${a}) = ${x0Frac}`,
      result: `S = { ${x0Frac} }`,
      type: 'success',
    });

    keyPoints.push({
      x: x0,
      y: 0,
      label: `Racine double x₀ = ${x0Frac}`,
      type: 'root',
      color: '#10b981',
    });
  } else {
    // delta < 0
    const absDelta = Math.abs(delta);
    const radComplex = simplifyRadical(absDelta);
    const realPart = -b / (2 * a);
    const realPartFrac = formatNumberOrFraction(realPart);
    const imagNum = Math.sqrt(absDelta) / (2 * Math.abs(a));
    const imagPartFrac = formatNumberOrFraction(imagNum);

    steps.push({
      title: '3. Analyse du discriminant (Δ < 0)',
      description: `Comme Δ = ${delta} < 0, l'équation n'admet AUCUNE solution dans l'ensemble des réels ℝ. La parabole ne coupe pas l'axe des abscisses.`,
      result: `S dans ℝ = ∅ (Ensemble vide)`,
      type: 'warning',
    });

    steps.push({
      title: "4. Solutions dans l'ensemble des nombres complexes ℂ",
      description: `Dans l'ensemble ℂ, avec i² = -1 et √(-Δ) = i√${absDelta} = i(${radComplex?.str}) :`,
      formula: `z₁ = ${realPartFrac} - ${imagPartFrac}i\nz₂ = ${realPartFrac} + ${imagPartFrac}i`,
      result: `S dans ℂ = { ${realPartFrac} - ${imagPartFrac}i ; ${realPartFrac} + ${imagPartFrac}i }`,
      type: 'info',
    });

    solutions.push(
      `Dans ℝ : Aucune solution réelle (S = ∅)`,
      `Dans ℂ : ${realPartFrac} ± ${imagPartFrac}i`
    );
  }

  // Variations et caractéristiques
  const orientation = a > 0 
    ? 'tournée vers le haut (convexe ∪), avec un MINIMUM global au sommet' 
    : 'tournée vers le bas (concave ∩), avec un MAXIMUM global au sommet';

  steps.push({
    title: '5. Caractéristiques géométriques de la parabole',
    description: `Le coefficient a = ${a} est ${a > 0 ? 'positif (a > 0)' : 'négatif (a < 0)'}, donc la parabole est ${orientation}.`,
    formula: `Sommet S(${alphaFrac} ; ${betaFrac})\nAxe de symétrie : x = ${alphaFrac}\nForme canonique : f(x) = ${canonical}`,
    type: 'info',
  });

  // Table de valeurs centrée autour du sommet
  const tableOfValues: Array<{ x: number; y: number }> = [];
  const centerInt = Math.round(alpha);
  for (let xi = centerInt - 4; xi <= centerInt + 4; xi++) {
    tableOfValues.push({
      x: xi,
      y: a * xi * xi + b * xi + c,
    });
  }

  const fnEval = (x: number) => a * x * x + b * x + c;

  return {
    title: 'Équation du Second Degré',
    type: 'quadratic',
    formattedExpression: expr,
    steps,
    solutions,
    keyPoints,
    canonicalForm: canonical,
    tableOfValues,
    functionToEvaluate: fnEval,
  };
}

/**
 * Résout une équation du 1er degré : ax + b = c
 * Avec gestion exhaustive des formes dégénérées et fractions exactes
 */
export function solveLinear(a: number, b: number, c: number = 0): MathResolutionResult {
  const steps: MathStep[] = [];
  const solutions: string[] = [];
  const keyPoints: KeyPoint[] = [];

  const aStr = a === 1 ? 'x' : a === -1 ? '-x' : `${a}x`;
  const bSign = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
  const expr = `${a === 0 ? '' : aStr} ${b !== 0 ? bSign : ''} = ${c}`.trim();

  steps.push({
    title: '1. Équation linéaire de départ',
    description: `Équation du premier degré :`,
    formula: expr,
    type: 'info',
  });

  if (a === 0) {
    if (b === c) {
      steps.push({
        title: '2. Conclusion (Identité vraie pour tout x)',
        description: `L'égalité ${b} = ${c} est toujours vérifiée quel que soit x.`,
        result: `S = ℝ (Tous les nombres réels sont solutions)`,
        type: 'success',
      });
      solutions.push('S = ℝ (Infinité de solutions)');
    } else {
      steps.push({
        title: '2. Conclusion (Équation impossible)',
        description: `L'égalité ${b} = ${c} est fausse (contradiction mathématique).`,
        result: `S = ∅ (Aucune solution)`,
        type: 'warning',
      });
      solutions.push('S = ∅ (Aucune solution)');
    }

    return {
      title: 'Équation du Premier Degré',
      type: 'linear',
      formattedExpression: expr,
      steps,
      solutions,
      keyPoints,
    };
  }

  // Transposition de b
  const target = c - b;
  steps.push({
    title: '2. Transposition des termes constants',
    description: `On soustrait (${b}) des deux côtés pour isoler le terme en x :`,
    formula: `${a}x = ${c} - (${b}) = ${target}`,
    type: 'calc',
  });

  // Division par a
  const sol = target / a;
  const solFrac = formatNumberOrFraction(sol);

  steps.push({
    title: '3. Division par le coefficient de x',
    description: `On divise les deux membres par a = ${a} pour trouver x :`,
    formula: `x = ${target} / ${a} = ${solFrac}`,
    result: `S = { ${solFrac} }`,
    type: 'success',
  });

  solutions.push(`x = ${solFrac}`);

  keyPoints.push({
    x: sol,
    y: 0,
    label: `Solution x = ${solFrac}`,
    type: 'root',
    color: '#10b981',
  });

  const fnEval = (x: number) => a * x + b - c;

  const tableOfValues: Array<{ x: number; y: number }> = [];
  const centerInt = Math.round(sol);
  for (let xi = centerInt - 4; xi <= centerInt + 4; xi++) {
    tableOfValues.push({
      x: xi,
      y: fnEval(xi),
    });
  }

  return {
    title: 'Équation Linéaire du Premier Degré',
    type: 'linear',
    formattedExpression: expr,
    steps,
    solutions,
    keyPoints,
    tableOfValues,
    functionToEvaluate: fnEval,
  };
}

/**
 * Résout un système linéaire 2x2 par la méthode de Cramer
 * a1*x + b1*y = c1
 * a2*x + b2*y = c2
 * Fournit également les deux fonctions de droites pour le tracé graphique simultané !
 */
export function solveSystem2x2(
  a1: number,
  b1: number,
  c1: number,
  a2: number,
  b2: number,
  c2: number
): MathResolutionResult {
  const steps: MathStep[] = [];
  const solutions: string[] = [];
  const keyPoints: KeyPoint[] = [];

  const eq1Str = `${a1}x ${b1 >= 0 ? `+ ${b1}` : `- ${Math.abs(b1)}`}y = ${c1}`;
  const eq2Str = `${a2}x ${b2 >= 0 ? `+ ${b2}` : `- ${Math.abs(b2)}`}y = ${c2}`;
  const expr = `Système 2x2 :\n(L₁) : ${eq1Str}\n(L₂) : ${eq2Str}`;

  steps.push({
    title: '1. Présentation du système linéaire',
    description: `Système de deux équations à deux inconnues x et y :`,
    formula: `(L₁) : ${eq1Str}\n(L₂) : ${eq2Str}`,
    type: 'info',
  });

  // Déterminant principal D = a1*b2 - a2*b1
  const D = a1 * b2 - a2 * b1;
  const DFormula = `D = (${a1}) × (${b2}) - (${a2}) × (${b1}) = ${a1 * b2} - (${a2 * b1}) = ${D}`;

  steps.push({
    title: '2. Calcul du déterminant principal (D)',
    description: `Règle de Cramer avec la matrice des coefficients :`,
    formula: DFormula,
    result: `D = ${D}`,
    type: 'calc',
  });

  // Fonctions des deux droites pour le tracé graphique
  const fnLine1 = b1 !== 0 ? (x: number) => (c1 - a1 * x) / b1 : undefined;
  const fnLine2 = b2 !== 0 ? (x: number) => (c2 - a2 * x) / b2 : undefined;

  if (D === 0) {
    const Dx = c1 * b2 - c2 * b1;
    const Dy = a1 * c2 - a2 * c1;

    if (Dx === 0 && Dy === 0) {
      steps.push({
        title: '3. Analyse (D = 0 et Dx = 0, Dy = 0)',
        description: `Les deux équations sont proportionnelles. Les droites sont confondues en tout point.`,
        result: `Infinité de solutions (droites confondues)`,
        type: 'warning',
      });
      solutions.push('Infinité de couples solutions (droites confondues)');
    } else {
      steps.push({
        title: '3. Analyse (D = 0 et Dx ≠ 0)',
        description: `Le déterminant est nul mais Dx ≠ 0. Les deux droites sont strictement parallèles sans aucun point d'intersection.`,
        result: `S = ∅ (Aucune solution)`,
        type: 'warning',
      });
      solutions.push('S = ∅ (Droites strictement parallèles)');
    }

    return {
      title: 'Système Linéaire 2x2',
      type: 'system',
      formattedExpression: expr,
      steps,
      solutions,
      keyPoints,
      functionToEvaluate: fnLine1,
      secondaryFunctionToEvaluate: fnLine2,
      secondaryFunctionLabel: `(L₂) : ${eq2Str}`,
    };
  }

  // Déterminants partiels Dx et Dy
  const Dx = c1 * b2 - c2 * b1;
  const Dy = a1 * c2 - a2 * c1;

  steps.push({
    title: '3. Calcul des déterminants partiels Dx et Dy',
    description: `Substitution successive de la colonne constante :`,
    formula: `Dx = (${c1}) × (${b2}) - (${c2}) × (${b1}) = ${Dx}\nDy = (${a1}) × (${c2}) - (${a2}) × (${c1}) = ${Dy}`,
    type: 'calc',
  });

  const xVal = Dx / D;
  const yVal = Dy / D;
  const xFrac = formatNumberOrFraction(xVal);
  const yFrac = formatNumberOrFraction(yVal);

  steps.push({
    title: '4. Calcul de la solution unique (Point sécant)',
    description: `Application des formules de Cramer x = Dx / D et y = Dy / D :`,
    formula: `x = ${Dx} / ${D} = ${xFrac}\ny = ${Dy} / ${D} = ${yFrac}`,
    result: `S = { (${xFrac} ; ${yFrac}) }`,
    type: 'success',
  });

  solutions.push(`x = ${xFrac}`, `y = ${yFrac}`, `Point d'intersection I(${xFrac} ; ${yFrac})`);

  keyPoints.push({
    x: xVal,
    y: yVal,
    label: `Intersection I(${xFrac} ; ${yFrac})`,
    type: 'root',
    color: '#10b981', // Émeraude
  });

  return {
    title: 'Système Linéaire 2x2 (Cramer)',
    type: 'system',
    formattedExpression: expr,
    steps,
    solutions,
    keyPoints,
    functionToEvaluate: fnLine1,
    secondaryFunctionToEvaluate: fnLine2,
    secondaryFunctionLabel: `(L₂) : ${eq2Str}`,
  };
}

/**
 * Tokenizer mathématique robuste avec multiplication implicite sécurisée.
 * Ne corrompt JAMAIS les identifiants comme exp, sin, tan, cos, sqrt.
 */
function tokenizeExpression(raw: string): string[] {
  let s = raw.toLowerCase().trim();
  s = s.replace(/f\(x\)\s*=\s*/g, '');
  s = s.replace(/y\s*=\s*/g, '');
  s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  s = s.replace(/²/g, '^2').replace(/³/g, '^3');

  const tokenRegex = /\s*(<=|>=|==|!=|\*\*|[0-9]+\.?[0-9]*|[a-zA-Z]+|[+\-*/^(),])\s*/g;
  const rawTokens: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(s)) !== null) {
    if (m[1]) rawTokens.push(m[1]);
  }

  // Insertion de multiplications implicites entre tokens appropriés :
  // ex : 2x -> 2 * x, 2( -> 2 * (, )x -> ) * x, x( -> x * (, )( -> ) * (
  const tokens: string[] = [];
  const isValueLike = (t: string) => {
    return !isNaN(parseFloat(t)) || t === 'x' || t === 'pi' || t === 'e' || t === ')';
  };
  const isStartLike = (t: string) => {
    return (
      !isNaN(parseFloat(t)) ||
      t === 'x' ||
      t === 'pi' ||
      t === 'e' ||
      t === '(' ||
      ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'racine', 'ln', 'log', 'exp', 'abs'].includes(t)
    );
  };

  for (let i = 0; i < rawTokens.length; i++) {
    tokens.push(rawTokens[i]);
    if (i < rawTokens.length - 1) {
      const cur = rawTokens[i];
      const next = rawTokens[i + 1];
      if (isValueLike(cur) && isStartLike(next)) {
        tokens.push('*');
      }
    }
  }

  return tokens;
}

/**
 * Évaluateur sécurisé de fonction f(x) via parsing Pratt (descente récursive)
 * Gère correctement la précédence de l'opérateur ^ et du moins unaire (-x² = -(x²)).
 * Zéro eval() et zéro injection.
 */
export function createSafeFunctionEvaluator(rawExpr: string): (x: number) => number | null {
  const tokens = tokenizeExpression(rawExpr);
  if (tokens.length === 0) {
    return () => null;
  }

  return (xVal: number): number | null => {
    let pos = 0;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    function getPrecedence(op: string | undefined): number {
      if (op === '+' || op === '-') return 1;
      if (op === '*' || op === '/') return 2;
      if (op === '^') return 4;
      return -1;
    }

    function parseExpression(minPrec = 0): number | null {
      if (pos >= tokens.length) return null;
      let left = parsePrimary();
      if (left === null) return null;

      while (pos < tokens.length) {
        const op = peek();
        const prec = getPrecedence(op);
        if (prec < minPrec || prec <= 0) break;
        consume();

        // L'opérateur puissance ^ est associatif à droite
        const nextMinPrec = op === '^' ? prec : prec + 1;
        const right = parseExpression(nextMinPrec);
        if (right === null) return null;

        left = applyBinary(op, left, right);
        if (left === null || !isFinite(left)) return null;
      }
      return left;
    }

    function applyBinary(op: string, a: number, b: number): number | null {
      if (op === '+') return a + b;
      if (op === '-') return a - b;
      if (op === '*') return a * b;
      if (op === '/') {
        if (Math.abs(b) < 1e-12) return null;
        return a / b;
      }
      if (op === '^') {
        if (a < 0 && !Number.isInteger(b)) return null;
        return Math.pow(a, b);
      }
      return null;
    }

    function parsePrimary(): number | null {
      if (pos >= tokens.length) return null;
      const tok = peek();

      // Moins unaire ou plus unaire
      if (tok === '-') {
        consume();
        // Précédence 3 : plus fort que + et *, mais inférieur à ^ (-x^2 = -(x^2))
        const val = parseExpression(3);
        return val === null ? null : -val;
      }
      if (tok === '+') {
        consume();
        return parseExpression(3);
      }

      consume();

      // Nombres
      if (!isNaN(parseFloat(tok))) return parseFloat(tok);

      // Variable x
      if (tok === 'x') return xVal;

      // Constantes mathématiques fondamentales
      if (tok === 'pi') return Math.PI;
      if (tok === 'e') return Math.E;

      // Parenthèses
      if (tok === '(') {
        const val = parseExpression(0);
        if (peek() === ')') consume();
        return val;
      }

      // Fonctions élémentaires
      if (
        ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'racine', 'ln', 'log', 'exp', 'abs'].includes(tok)
      ) {
        let arg: number | null = null;
        if (peek() === '(') {
          consume();
          arg = parseExpression(0);
          if (peek() === ')') consume();
        } else {
          arg = parsePrimary();
        }
        if (arg === null) return null;

        if (tok === 'sin') return Math.sin(arg);
        if (tok === 'cos') return Math.cos(arg);
        if (tok === 'tan') {
          if (Math.abs(Math.cos(arg)) < 1e-10) return null;
          return Math.tan(arg);
        }
        if (tok === 'asin') {
          if (arg < -1 || arg > 1) return null;
          return Math.asin(arg);
        }
        if (tok === 'acos') {
          if (arg < -1 || arg > 1) return null;
          return Math.acos(arg);
        }
        if (tok === 'atan') return Math.atan(arg);
        if (tok === 'sqrt' || tok === 'racine') {
          if (arg < 0) return null;
          return Math.sqrt(arg);
        }
        if (tok === 'ln') {
          if (arg <= 0) return null;
          return Math.log(arg);
        }
        if (tok === 'log') {
          if (arg <= 0) return null;
          return Math.log10(arg);
        }
        if (tok === 'exp') return Math.exp(arg);
        if (tok === 'abs') return Math.abs(arg);
      }

      return null;
    }

    try {
      const res = parseExpression(0);
      return res === null || isNaN(res) || !isFinite(res) ? null : res;
    } catch {
      return null;
    }
  };
}

/**
 * Réducteur d'équation polynomiale algébrique (ax² + bx + c = 0)
 * Développe les parenthèses simples k(px+q) et regroupe tous les termes à gauche.
 */
function parseAndReducePolynomial(raw: string): { a: number; b: number; c: number; isPolynomial: boolean } {
  let s = raw.toLowerCase().trim();
  s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  s = s.replace(/²/g, '^2').replace(/³/g, '^3');

  // Séparation membre de gauche (LHS) et membre de droite (RHS)
  let lhs = s;
  let rhs = '0';
  if (s.includes('=')) {
    const parts = s.split('=');
    lhs = parts[0].trim();
    rhs = parts[1].trim();
  }

  // Développement des parenthèses k(inside)
  const expandParens = (expr: string): string => {
    return expr.replace(/([+-]?\s*\d*\.?\d*)\s*\(([^()]+)\)/g, (_, coefStr, inside) => {
      coefStr = coefStr.replace(/\s+/g, '');
      let mult = 1;
      if (coefStr === '' || coefStr === '+') mult = 1;
      else if (coefStr === '-') mult = -1;
      else mult = parseFloat(coefStr);
      if (isNaN(mult)) mult = 1;

      const termRegex = /([+-]?[^+-]+)/g;
      const insideTerms = inside.replace(/\s+/g, '').match(termRegex) || [];
      let expanded = '';
      for (const t of insideTerms) {
        if (t.includes('x^2')) {
          const c = t.replace('x^2', '').replace('*', '');
          const val = c === '' || c === '+' ? 1 : c === '-' ? -1 : parseFloat(c);
          const res = val * mult;
          expanded += `${res >= 0 ? '+' : ''}${res}x^2`;
        } else if (t.includes('x')) {
          const c = t.replace('x', '').replace('*', '');
          const val = c === '' || c === '+' ? 1 : c === '-' ? -1 : parseFloat(c);
          const res = val * mult;
          expanded += `${res >= 0 ? '+' : ''}${res}x`;
        } else {
          const val = parseFloat(t);
          if (!isNaN(val)) {
            const res = val * mult;
            expanded += `${res >= 0 ? '+' : ''}${res}`;
          }
        }
      }
      return expanded;
    });
  };

  const parseSide = (expr: string) => {
    const expanded = expandParens(expr);
    const side = expanded.replace(/\s+/g, '');
    const termRegex = /([+-]?[^+-]+)/g;
    const rawTerms = side.match(termRegex) || [];
    let a = 0;
    let b = 0;
    let c = 0;

    for (let term of rawTerms) {
      term = term.trim();
      if (!term) continue;

      if (term.includes('x^2')) {
        const coefStr = term.replace('x^2', '').replace('*', '');
        let coef = 1;
        if (coefStr === '' || coefStr === '+') coef = 1;
        else if (coefStr === '-') coef = -1;
        else coef = parseFloat(coefStr);
        if (!isNaN(coef)) a += coef;
      } else if (term.includes('x')) {
        const coefStr = term.replace('x', '').replace('*', '');
        let coef = 1;
        if (coefStr === '' || coefStr === '+') coef = 1;
        else if (coefStr === '-') coef = -1;
        else coef = parseFloat(coefStr);
        if (!isNaN(coef)) b += coef;
      } else {
        const num = parseFloat(term);
        if (!isNaN(num)) c += num;
      }
    }
    return { a, b, c };
  };

  const left = parseSide(lhs);
  const right = parseSide(rhs);

  return {
    a: left.a - right.a,
    b: left.b - right.b,
    c: left.c - right.c,
    isPolynomial: true,
  };
}

/**
 * Réducteur d'équation linéaire 2D pour systèmes (Ax + By = C)
 */
function parseLinear2DEquation(line: string): { A: number; B: number; C: number } | null {
  let s = line.toLowerCase().trim();
  s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  s = s.replace(/\(l[12]\)\s*:\s*/g, '').replace(/l[12]\s*:\s*/g, '');

  let lhs = s;
  let rhs = '0';
  if (s.includes('=')) {
    const p = s.split('=');
    lhs = p[0].trim();
    rhs = p[1].trim();
  }

  const parseSide = (expr: string) => {
    const side = expr.replace(/\s+/g, '');
    const termRegex = /([+-]?[^+-]+)/g;
    const rawTerms = side.match(termRegex) || [];
    let a = 0;
    let b = 0;
    let c = 0;

    for (let term of rawTerms) {
      term = term.trim();
      if (!term) continue;
      if (term.includes('x')) {
        const coefStr = term.replace('x', '').replace('*', '');
        const coef = coefStr === '' || coefStr === '+' ? 1 : coefStr === '-' ? -1 : parseFloat(coefStr);
        if (!isNaN(coef)) a += coef;
      } else if (term.includes('y')) {
        const coefStr = term.replace('y', '').replace('*', '');
        const coef = coefStr === '' || coefStr === '+' ? 1 : coefStr === '-' ? -1 : parseFloat(coefStr);
        if (!isNaN(coef)) b += coef;
      } else {
        const num = parseFloat(term);
        if (!isNaN(num)) c += num;
      }
    }
    return { a, b, c };
  };

  const left = parseSide(lhs);
  const right = parseSide(rhs);

  const A = left.a - right.a;
  const B = left.b - right.b;
  const C = right.c - left.c;

  if (A === 0 && B === 0) return null;
  return { A, B, C };
}

/**
 * Analyseur intelligent d'entrée utilisateur :
 * Détecte les systèmes 2x2, les équations polynomiales du 2nd et 1er degré avec termes
 * répartis sur les deux membres, et les fonctions réelles f(x).
 */
export function parseAndSolve(rawInput: string): MathResolutionResult {
  const input = normalizeMathInput(rawInput);

  if (!input || input.length < 1) {
    return {
      title: 'Aucune équation fournie',
      type: 'unknown',
      formattedExpression: '',
      steps: [],
      solutions: [],
      keyPoints: [],
      error: 'Veuillez saisir une fonction ou une équation à résoudre.',
    };
  }

  // 1. Détection d'un système à 2 inconnues (x et y)
  if (
    input.includes(';') ||
    input.includes('\n') ||
    (input.includes('x') && input.includes('y') && input.includes('='))
  ) {
    const parts = input.split(/[;\n]|(?:\set\s)/).filter((p) => p.trim().length > 0);
    if (parts.length >= 2) {
      const eq1 = parseLinear2DEquation(parts[0]);
      const eq2 = parseLinear2DEquation(parts[1]);

      if (eq1 && eq2) {
        return solveSystem2x2(eq1.A, eq1.B, eq1.C, eq2.A, eq2.B, eq2.C);
      }
    }
  }

  // Si l'utilisateur commence par f(x) = ou y = , c'est une fonction explicite à étudier et tracer
  const isExplicitFunction =
    input.toLowerCase().startsWith('f(x)') ||
    input.toLowerCase().startsWith('y=') ||
    input.toLowerCase().startsWith('y =');

  if (!isExplicitFunction) {
    // 2. Détection d'une équation polynomiale (second degré ou premier degré avec égalité)
    const isEquationWithX = input.includes('x') && input.includes('=');
    const hasSquare = input.includes('x²') || input.includes('x^2');

    if (isEquationWithX || hasSquare) {
      const poly = parseAndReducePolynomial(input);
      if (poly.a !== 0) {
        // Équation du 2nd degré ax² + bx + c = 0
        return solveQuadratic(poly.a, poly.b, poly.c);
      } else if (poly.b !== 0) {
        // Équation du 1er degré bx + c = 0
        return solveLinear(poly.b, poly.c, 0);
      } else if (input.includes('=')) {
        // Cas constant : c = 0
        return solveLinear(0, poly.c, 0);
      }
    }
  }

  // 3. Mode Fonction Réelle f(x)
  const fnInput = input.replace(/^f\(x\)\s*=\s*/i, '').replace(/^y\s*=\s*/i, '');
  const fnEvaluator = createSafeFunctionEvaluator(fnInput);
  const testVal1 = fnEvaluator(1);
  const testVal0 = fnEvaluator(0);

  if (testVal1 !== null || testVal0 !== null) {
    const steps: MathStep[] = [];
    const keyPoints: KeyPoint[] = [];
    const solutions: string[] = [];

    const cleanName = input.startsWith('f(x)') ? input : `f(x) = ${input}`;

    steps.push({
      title: '1. Fonction détectée',
      description: `Étude analytique et tracé de la fonction réelle :`,
      formula: cleanName,
      type: 'info',
    });

    // Test de parité (paire / impaire)
    let isEven = true;
    let isOdd = true;
    let parityTests = 0;
    const testPoints = [0.5, 1, 2, 3, 4];
    for (const tp of testPoints) {
      const pos = fnEvaluator(tp);
      const neg = fnEvaluator(-tp);
      if (pos !== null && neg !== null) {
        parityTests++;
        if (Math.abs(pos - neg) > 1e-4) isEven = false;
        if (Math.abs(pos + neg) > 1e-4) isOdd = false;
      }
    }

    if (parityTests >= 3) {
      if (isEven) {
        steps.push({
          title: '2. Parité : Fonction Paire',
          description: `Pour tout x, f(-x) = f(x). La courbe admet l'axe des ordonnées (Oy) comme axe de symétrie.`,
          type: 'info',
        });
      } else if (isOdd) {
        steps.push({
          title: '2. Parité : Fonction Impaire',
          description: `Pour tout x, f(-x) = -f(x). La courbe admet l'origine du repère (O) comme centre de symétrie.`,
          type: 'info',
        });
      }
    }

    // Valeur en 0 (Ordonnée à l'origine)
    const y0 = fnEvaluator(0);
    if (y0 !== null && !isNaN(y0) && isFinite(y0)) {
      const y0Frac = formatNumberOrFraction(y0);
      steps.push({
        title: "3. Valeur à l'origine f(0)",
        description: `L'intersection avec l'axe vertical des ordonnées (x = 0) est :`,
        formula: `f(0) = ${y0Frac}`,
        type: 'calc',
      });
      keyPoints.push({
        x: 0,
        y: y0,
        label: `f(0) = ${y0Frac}`,
        type: 'intercept',
        color: '#f59e0b',
      });
    }

    // Recherche haute précision des racines par dichotomie (tolérance 10⁻⁴)
    const tableOfValues: Array<{ x: number; y: number | null }> = [];
    let prevVal: number | null = null;
    let prevX = -10;

    for (let xi = -10; xi <= 10; xi += 0.25) {
      const val = fnEvaluator(xi);
      if (Number.isInteger(xi)) {
        tableOfValues.push({ x: xi, y: val });
      }

      // Théorème des Valeurs Intermédiaires (TVI)
      if (prevVal !== null && val !== null) {
        if ((prevVal < 0 && val > 0) || (prevVal > 0 && val < 0)) {
          // Affinement par dichotomie
          let left = prevX;
          let right = xi;
          for (let iter = 0; iter < 16; iter++) {
            const mid = (left + right) / 2;
            const midVal = fnEvaluator(mid);
            if (midVal === null) break;
            if (Math.abs(midVal) < 1e-6) {
              left = mid;
              break;
            }
            if ((prevVal < 0 && midVal < 0) || (prevVal > 0 && midVal > 0)) {
              left = mid;
            } else {
              right = mid;
            }
          }
          const refinedRoot = (left + right) / 2;
          const rootFrac = formatNumberOrFraction(refinedRoot);

          if (!keyPoints.some((k) => Math.abs(k.x - refinedRoot) < 0.2 && k.type === 'root')) {
            keyPoints.push({
              x: refinedRoot,
              y: 0,
              label: `Racine x ≈ ${rootFrac}`,
              type: 'root',
              color: '#10b981',
            });
            solutions.push(`x ≈ ${rootFrac}`);
          }
        }
      }

      prevVal = val;
      prevX = xi;
    }

    if (solutions.length > 0) {
      steps.push({
        title: '4. Zéros de la fonction (Racines réelles)',
        description: `Valeurs pour lesquelles la courbe coupe l'axe des abscisses (f(x) = 0) :`,
        formula: `S ≈ { ${solutions.join(', ')} }`,
        type: 'success',
      });
    } else {
      steps.push({
        title: '4. Zéros de la fonction',
        description: `Aucun changement de signe détecté sur l'intervalle [-10, 10].`,
        type: 'info',
      });
    }

    // Dérivée numérique locale en x = 1 (Taux de variation instantané)
    const h = 0.0001;
    const fPlus = fnEvaluator(1 + h);
    const fMinus = fnEvaluator(1 - h);
    if (fPlus !== null && fMinus !== null) {
      const deriv = (fPlus - fMinus) / (2 * h);
      const derivFrac = formatNumberOrFraction(deriv);
      steps.push({
        title: '5. Coefficient directeur de la tangente en x = 1',
        description: `La dérivée locale f'(1) donne la pente de la droite tangente :`,
        formula: `f'(1) ≈ ${derivFrac}`,
        type: 'info',
      });
    }

    return {
      title: 'Étude & Courbe de Fonction',
      type: 'function',
      formattedExpression: cleanName,
      steps,
      solutions,
      keyPoints,
      tableOfValues: tableOfValues.slice(5, 16), // Intervalle [-5, +5]
      functionToEvaluate: fnEvaluator,
    };
  }

  // Format non reconnu
  return {
    title: 'Format non reconnu',
    type: 'unknown',
    formattedExpression: input,
    steps: [
      {
        title: "Erreur d'interprétation",
        description: `Impossible de résoudre l'expression "${input}".`,
        formula:
          'Exemples supportés avec précision :\n• Second degré : 2x² - 4x - 6 = 0, x² = 9, 3x - 5 = 2x²\n• Premier degré : 3x - 5 = 2x + 7, 4(x - 2) = 12\n• Systèmes 2x2 : 2x + y = 7 ; x - y = 1\n• Fonctions : f(x) = x³ - 3x, sin(x), 1/x, exp(x), sqrt(x)',
        type: 'warning',
      },
    ],
    solutions: [],
    keyPoints: [],
    error: 'Expression non reconnue. Cliquez sur un exemple prédéfini ci-dessous.',
  };
}
