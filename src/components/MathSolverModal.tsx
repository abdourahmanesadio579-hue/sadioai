import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Calculator,
  LineChart,
  Copy,
  Check,
  Share2,
  Send,
  Volume2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Sparkles,
  HelpCircle,
  Table,
  Layers,
  ChevronRight,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  parseAndSolve,
  MathResolutionResult,
  KeyPoint,
} from '../utils/mathSolver';

export interface MathSolverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyTextToInput: (text: string) => void;
  onSpeakText?: (text: string) => void;
  initialEquation?: string;
}

const PRESET_EXAMPLES = [
  { label: 'Second degré (carré parfait)', value: '2x² - 4x - 6 = 0', badge: 'Lycée' },
  { label: 'Second degré (radicaux √)', value: 'x² - 4x + 1 = 0', badge: 'Lycée' },
  { label: 'Racine double (Δ = 0)', value: 'x² - 6x + 9 = 0', badge: 'Lycée' },
  { label: 'Complexe (Δ < 0)', value: 'x² + 2x + 5 = 0', badge: 'Terminale' },
  { label: 'Équation bilatérale', value: '3x - 5 = 2x + 7', badge: 'Collège' },
  { label: 'Système 2x2 (sécant)', value: '2x + y = 7 ; x - y = 1', badge: 'Brevet/Bac' },
  { label: 'Fonction rationnelle (1/x)', value: 'f(x) = 1/x', badge: 'Asymptote' },
  { label: 'Onde sinusoïdale', value: 'f(x) = sin(x)', badge: 'Trigo' },
  { label: 'Exponentielle', value: 'f(x) = exp(x)', badge: 'Analyse' },
];

export const MathSolverModal: React.FC<MathSolverModalProps> = ({
  isOpen,
  onClose,
  onApplyTextToInput,
  onSpeakText,
  initialEquation = '2x² - 4x - 6 = 0',
}) => {
  const [expression, setExpression] = useState<string>(initialEquation);
  const [lastSolvedExpression, setLastSolvedExpression] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'steps' | 'graph' | 'table'>('steps');
  const [result, setResult] = useState<MathResolutionResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [showKeypad, setShowKeypad] = useState<boolean>(false);

  // Indique si l'équation saisie a été modifiée et attend d'être résolue
  const hasUnsolvedChanges =
    expression.trim().length > 0 &&
    expression.trim() !== lastSolvedExpression.trim();

  // Graph state: Scale & Pan
  const [scale, setScale] = useState<number>(35); // Pixels per unit
  const [offsetX, setOffsetX] = useState<number>(0); // Pan offset X
  const [offsetY, setOffsetY] = useState<number>(0); // Pan offset Y
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Résolution manuelle déclenchée par bouton ou Entrée
  const handleSolve = useCallback((exprToSolve: string) => {
    const trimmed = exprToSolve.trim();
    if (!trimmed) {
      setResult(null);
      setLastSolvedExpression('');
      return;
    }
    const res = parseAndSolve(trimmed);
    setResult(res);
    setLastSolvedExpression(trimmed);
  }, []);

  // Résolution initiale à l'ouverture du modal
  useEffect(() => {
    if (isOpen) {
      const initExpr = initialEquation || expression || '2x² - 4x - 6 = 0';
      setExpression(initExpr);
      handleSolve(initExpr);
    }
  }, [isOpen, initialEquation, handleSolve]);

  // Insertion de symboles depuis le pavé mathématique (ne résout pas automatiquement sur chaque clic)
  const insertSymbol = (sym: string) => {
    setExpression((prev) => prev + sym);
  };

  const clearInput = () => {
    setExpression('');
    setLastSolvedExpression('');
    setResult(null);
  };

  // -------------------------------------------------------------
  // MOTEUR DE RENDU DU GRAPHIQUE SUR CANVAS 2D (60 FPS, 0 F DATA)
  // -------------------------------------------------------------
  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Fond avec style cybernétique profond
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    const originX = width / 2 + offsetX;
    const originY = height / 2 + offsetY;

    // 1. Grille fine (secondaire)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();

    const gridSize = scale;
    const startX = (originX % gridSize) - gridSize;
    for (let x = startX; x < width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }

    const startY = (originY % gridSize) - gridSize;
    for (let y = startY; y < height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // 2. Axes principaux X et Y
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Axe X horizontal
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);

    // Axe Y vertical
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();

    // 3. Graduations et chiffres sur les axes
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Labels X
    const minUnitX = Math.floor(-originX / scale);
    const maxUnitX = Math.ceil((width - originX) / scale);
    for (let u = minUnitX; u <= maxUnitX; u++) {
      if (u === 0) continue;
      const px = originX + u * scale;
      ctx.fillText(`${u}`, px, originY + 4);
      ctx.beginPath();
      ctx.moveTo(px, originY - 3);
      ctx.lineTo(px, originY + 3);
      ctx.stroke();
    }

    // Labels Y
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const minUnitY = Math.floor(-(height - originY) / scale);
    const maxUnitY = Math.ceil(originY / scale);
    for (let u = minUnitY; u <= maxUnitY; u++) {
      if (u === 0) continue;
      const py = originY - u * scale;
      ctx.fillText(`${u}`, originX - 6, py);
      ctx.beginPath();
      ctx.moveTo(originX - 3, py);
      ctx.lineTo(originX + 3, py);
      ctx.stroke();
    }

    // Label de l'origine (0, 0)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('0', originX - 4, originY + 4);

    // 4. Tracé de la courbe f(x)
    // Helper de tracé propre d'une courbe avec détection de rupture d'asymptote
    const drawCurve = (
      fn: (x: number) => number | null,
      color: string,
      shadowColor: string,
      isDashed = false
    ) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = 8;
      if (isDashed) {
        ctx.setLineDash([6, 4]);
      }
      ctx.beginPath();

      let isDrawing = false;
      let prevMathY: number | null = null;
      const stepPixels = 1.5;

      for (let px = 0; px <= width; px += stepPixels) {
        const mathX = (px - originX) / scale;
        const mathY = fn(mathX);

        if (mathY !== null && !isNaN(mathY) && isFinite(mathY)) {
          const py = originY - mathY * scale;

          // Détection de saut d'asymptote (ex: tan(x), 1/x)
          let isAsymptote = false;
          if (prevMathY !== null) {
            const signChanged = (prevMathY < 0 && mathY > 0) || (prevMathY > 0 && mathY < 0);
            const jumpY = Math.abs(mathY - prevMathY);
            if (signChanged && jumpY > 15 / (scale / 35)) {
              isAsymptote = true;
            } else if (Math.abs(py - (originY - prevMathY * scale)) > height * 0.75) {
              isAsymptote = true;
            }
          }

          if (isAsymptote) {
            ctx.stroke();
            ctx.beginPath();
            isDrawing = false;
          }

          if (py >= -height * 1.5 && py <= height * 2.5) {
            if (!isDrawing) {
              ctx.moveTo(px, py);
              isDrawing = true;
            } else {
              ctx.lineTo(px, py);
            }
          } else {
            if (isDrawing) {
              ctx.stroke();
              ctx.beginPath();
              isDrawing = false;
            }
          }
          prevMathY = mathY;
        } else {
          if (isDrawing) {
            ctx.stroke();
            ctx.beginPath();
            isDrawing = false;
          }
          prevMathY = null;
        }
      }
      ctx.stroke();
      ctx.restore();
    };

    // 4. Tracé de la courbe principale f(x) ou Droite 1
    if (result && result.functionToEvaluate) {
      drawCurve(result.functionToEvaluate, '#06b6d4', 'rgba(6, 182, 212, 0.6)');
    }

    // Tracé de la fonction secondaire (ex: Droite 2 pour les systèmes 2x2)
    if (result && result.secondaryFunctionToEvaluate) {
      drawCurve(result.secondaryFunctionToEvaluate, '#c084fc', 'rgba(192, 132, 252, 0.6)', true);

      // Légende en haut à gauche
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(12, 12, 190, 52);
      ctx.fill();
      ctx.stroke();

      // Ligne 1 (Cyan)
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(20, 24, 18, 3);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('L₁ (Cyan) : Équation 1', 46, 28);

      // Ligne 2 (Violet)
      ctx.fillStyle = '#c084fc';
      ctx.fillRect(20, 44, 18, 3);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText('L₂ (Violet) : Équation 2', 46, 48);
      ctx.restore();
    }

    // 5. Tracé des points remarquables (Sommet, Racines, Intercept, Intersection)
    if (result && result.keyPoints && result.keyPoints.length > 0) {
      for (const kp of result.keyPoints) {
        const kpx = originX + kp.x * scale;
        const kpy = originY - kp.y * scale;

        if (kpx >= 0 && kpx <= width && kpy >= 0 && kpy <= height) {
          // Halo extérieur
          ctx.fillStyle = kp.color;
          ctx.beginPath();
          ctx.arc(kpx, kpy, 6, 0, Math.PI * 2);
          ctx.fill();

          // Point blanc intérieur
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(kpx, kpy, 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Étiquette du point
          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(kp.label, kpx + 8, kpy - 6);
        }
      }
    }
  }, [scale, offsetX, offsetY, result]);

  useEffect(() => {
    if (activeTab === 'graph') {
      drawGraph();
    }
  }, [activeTab, drawGraph]);

  // Gestion du redimensionnement fluide du canvas
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas && canvas.parentElement) {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = Math.max(320, Math.min(480, window.innerHeight * 0.45));
        drawGraph();
      }
    };
    if (activeTab === 'graph') {
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [activeTab, drawGraph]);

  // Zoom controls
  const handleZoomIn = () => setScale((s) => Math.min(150, s * 1.25));
  const handleZoomOut = () => setScale((s) => Math.max(10, s * 0.8));
  const handleResetView = () => {
    setScale(35);
    setOffsetX(0);
    setOffsetY(0);
  };

  const handleFitKeyPoints = () => {
    if (result?.keyPoints && result.keyPoints.length > 0) {
      const xs = result.keyPoints.map((k) => k.x).filter((x) => isFinite(x));
      const ys = result.keyPoints.map((k) => k.y).filter((y) => isFinite(y));
      if (xs.length > 0) {
        const avgX = xs.reduce((a, b) => a + b, 0) / xs.length;
        const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;
        setOffsetX(-avgX * scale);
        setOffsetY(avgY * scale);
        return;
      }
    }
    handleResetView();
  };

  // Pan / Drag de la courbe à la souris
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDraggingRef.current) {
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      setOffsetX((ox) => ox + dx);
      setOffsetY((oy) => oy + dy);
      drawGraph();
    }

    // Calcul des coordonnées du curseur
    const rect = canvas.getBoundingClientRect();
    const mousePxX = e.clientX - rect.left;
    const mousePxY = e.clientY - rect.top;

    const originX = canvas.width / 2 + offsetX;
    const originY = canvas.height / 2 + offsetY;

    const mathX = (mousePxX - originX) / scale;
    if (result && result.functionToEvaluate) {
      const mathY = result.functionToEvaluate(mathX);
      if (mathY !== null && !isNaN(mathY) && isFinite(mathY)) {
        setHoverCoord({ x: parseFloat(mathX.toFixed(2)), y: parseFloat(mathY.toFixed(2)) });
      } else {
        setHoverCoord({ x: parseFloat(mathX.toFixed(2)), y: 0 });
      }
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Support tactile complet pour mobile et tablettes
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      lastMousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current && e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastMousePosRef.current.x;
      const dy = e.touches[0].clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setOffsetX((ox) => ox + dx);
      setOffsetY((oy) => oy + dy);
      drawGraph();
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  // Téléchargement du graphique en PNG
  const handleDownloadGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `graphique-sadio-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Copie de la solution complète
  const handleCopySolution = () => {
    if (!result) return;
    let text = `📐 RÉSOLUTION MATHÉMATIQUE - SADIO\n`;
    text += `Équation : ${result.formattedExpression}\n\n`;
    for (const step of result.steps) {
      text += `👉 ${step.title}\n${step.description}\n`;
      if (step.formula) text += `${step.formula}\n`;
      if (step.result) text += `➔ Résultat : ${step.result}\n`;
      text += `\n`;
    }
    if (result.solutions.length > 0) {
      text += `🎯 SOLUTIONS FINALES :\n${result.solutions.join('\n')}\n`;
    }
    text += `\nRésolu instantanément sur SADIO (https://ais-pre-zzmly5mr6lsisyzxlfdjgp-471611362721.europe-west2.run.app)`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Partager sur WhatsApp
  const handleShareWhatsApp = () => {
    if (!result) return;
    let text = `📐 *Solution Mathématique avec SADIO* :\n*${result.formattedExpression}*\n\n`;
    if (result.solutions.length > 0) {
      text += `🎯 *Solutions :* ${result.solutions.join(' ; ')}\n\n`;
    }
    for (const step of result.steps.slice(0, 3)) {
      text += `• ${step.title} : ${step.result || step.formula || step.description}\n`;
    }
    text += `\nRésous tes équations gratuitement sur SADIO !`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Insérer dans le chat SADIO
  const handleSendToSadio = () => {
    if (!result) return;
    const query = `Explique-moi en détail les étapes de calcul pour cette équation : ${result.formattedExpression}. Peux-tu me donner un autre exercice similaire avec corrigé ?`;
    onApplyTextToInput(query);
    onClose();
  };

  // Vocalisation
  const handleSpeak = () => {
    if (!result || !onSpeakText) return;
    let spoken = `Voici la résolution pour ${result.formattedExpression}. `;
    for (const s of result.steps) {
      spoken += `${s.title}. ${s.description}. `;
      if (s.result) spoken += `Le résultat est ${s.result}. `;
    }
    if (result.solutions.length > 0) {
      spoken += `Les solutions sont ${result.solutions.join(', ')}.`;
    }
    onSpeakText(spoken);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl bg-slate-900 border border-cyan-500/50 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-6 py-3 bg-slate-950/95 border-b border-cyan-500/20 backdrop-blur-xl gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center text-cyan-400 shrink-0 shadow-md">
              <Calculator className="w-4 h-4 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-xs sm:text-base text-white flex flex-wrap items-center gap-1 sm:gap-2">
                <span className="truncate">Résolveur Maths & Traceur</span>
                <span className="text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-semibold flex items-center gap-1 shrink-0">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  <span>100% Local</span>
                </span>
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                Résolution pas à pas, discriminant Δ, tracé de paraboles et systèmes d'équations
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input Bar & Virtual Keypad Toggle */}
        <div className="p-3 sm:p-4 bg-slate-950/60 border-b border-slate-800 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 flex items-center">
              <input
                type="text"
                value={expression}
                onChange={(e) => {
                  setExpression(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSolve(expression);
                  }
                }}
                placeholder="Ex : 2x² - 4x - 6 = 0 ou f(x) = x³ - 3x"
                className={`w-full py-2.5 pl-3.5 ${
                  hasUnsolvedChanges ? 'pr-32 sm:pr-36' : expression ? 'pr-10' : 'pr-3.5'
                } rounded-xl bg-slate-900 border ${
                  hasUnsolvedChanges
                    ? 'border-cyan-400 ring-2 ring-cyan-400/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                    : 'border-slate-700 focus:border-cyan-400'
                } text-white font-mono text-sm placeholder:text-slate-500 outline-none transition-all`}
              />

              {/* Actions intégrées dans le champ */}
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {expression && (
                  <button
                    type="button"
                    onClick={clearInput}
                    className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
                    title="Effacer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Bouton Résoudre qui apparaît dans le champ dès qu'une équation est modifiée ou saisie */}
                {hasUnsolvedChanges && (
                  <button
                    type="button"
                    onClick={() => handleSolve(expression)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/30 transition transform active:scale-95 animate-fade-in"
                    title="Résoudre l'équation (ou appuyez sur Entrée)"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>Résoudre</span>
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowKeypad(!showKeypad)}
              className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shrink-0 ${
                showKeypad
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
                  : 'bg-slate-800 text-cyan-300 border-slate-700 hover:bg-slate-700'
              }`}
              title="Afficher le clavier mathématique"
            >
              <Calculator className="w-4 h-4" />
              <span className="hidden sm:inline">Pavé Maths</span>
            </button>
          </div>

          {/* Virtual Math Keypad */}
          {showKeypad && (
            <div className="p-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2 animate-fade-in">
              <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5 text-xs font-mono">
                {['x', 'x²', 'x³', '√', '(', ')', '+', '-', '=', 'sin', 'cos', 'tan', 'ln', 'e', 'π', '^', '/', '0'].map(
                  (sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => insertSymbol(sym === '√' ? 'sqrt(' : sym === 'sin' || sym === 'cos' || sym === 'tan' || sym === 'ln' ? `${sym}(` : sym)}
                      className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-slate-200 border border-slate-700/60 font-semibold transition active:scale-95"
                    >
                      {sym}
                    </button>
                  )
                )}
              </div>
              {hasUnsolvedChanges && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => handleSolve(expression)}
                    className="w-full sm:w-auto px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/25 flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>Résoudre l'équation saisie</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Preset Buttons Carousel */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
            <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>Exemples :</span>
            </span>
            {PRESET_EXAMPLES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setExpression(item.value);
                  handleSolve(item.value);
                }}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-cyan-200 border border-slate-700/60 transition flex items-center gap-1.5"
              >
                <span>{item.label}</span>
                <span className="text-[9px] px-1 rounded bg-slate-900 text-slate-400 font-mono">
                  {item.badge}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="px-4 sm:px-6 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('steps')}
              className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'steps'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Étapes détaillées</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('graph')}
              className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'graph'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <LineChart className="w-3.5 h-3.5" />
              <span>Courbe & Graphique</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('table')}
              className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'table'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Tableau de valeurs</span>
            </button>
          </div>

          {result && result.solutions.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Résolu : {result.solutions.join(' ; ')}</span>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* TAB 1: Résolution pas à pas */}
          {activeTab === 'steps' && result && (
            <div className="space-y-4">
              
              {/* Highlight Solution Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-cyan-950/30 to-slate-900 border border-emerald-500/40 shadow-lg">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                      {result.title}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">{result.formattedExpression}</span>
                  </div>
                </div>

                <div className="text-sm sm:text-base font-bold text-white font-mono flex items-center gap-2 flex-wrap">
                  <span className="text-emerald-400">Solutions :</span>
                  {result.solutions.length > 0 ? (
                    result.solutions.map((sol, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-xl bg-slate-900/90 border border-emerald-400/50 text-emerald-300 shadow-sm"
                      >
                        {sol}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-400 italic">Aucune racine réelle</span>
                  )}
                </div>

                {result.canonicalForm && (
                  <div className="mt-2 text-xs text-cyan-300 font-mono flex items-center gap-2">
                    <span className="text-slate-400">Forme canonique :</span>
                    <span className="font-bold">{result.canonicalForm}</span>
                  </div>
                )}
              </div>

              {/* Step by Step Cards */}
              <div className="space-y-3">
                {result.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-slate-700/80 transition space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs sm:text-sm text-cyan-200 flex items-center gap-2">
                        <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{step.title}</span>
                      </h4>
                      {step.type === 'success' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                          Résolu
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed pl-5">
                      {step.description}
                    </p>

                    {step.formula && (
                      <div className="ml-5 p-2.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs sm:text-sm text-slate-100 whitespace-pre-line overflow-x-auto">
                        {step.formula}
                      </div>
                    )}

                    {step.result && (
                      <div className="ml-5 flex items-center gap-2 text-xs font-mono font-bold text-emerald-300">
                        <span>➔</span>
                        <span>{step.result}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

            </div>
          )}

          {/* TAB 2: Traceur de Graphique Interactif Canvas */}
          {activeTab === 'graph' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <LineChart className="w-4 h-4 text-cyan-400" />
                  <span className="font-semibold">Courbe en temps réel</span>
                  {hoverCoord && (
                    <span className="font-mono text-cyan-300 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                      x: {hoverCoord.x} | y: {hoverCoord.y}
                    </span>
                  )}
                </div>

                {/* Graph Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                    title="Zoomer (+)"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                    title="Dézoomer (-)"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleResetView}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                    title="Recentrer la vue à l'origine (0, 0)"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  {result && result.keyPoints && result.keyPoints.length > 0 && (
                    <button
                      type="button"
                      onClick={handleFitKeyPoints}
                      className="p-1.5 rounded-lg bg-purple-950/70 hover:bg-purple-900 text-purple-300 border border-purple-500/40 transition"
                      title="Centrer sur les points remarquables (sommet/racines)"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDownloadGraph}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-cyan-300 border border-cyan-500/30 font-semibold transition flex items-center gap-1"
                    title="Exporter l'image de la courbe"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Image PNG</span>
                  </button>
                </div>
              </div>

              {/* Canvas Container */}
              <div className="relative w-full rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden shadow-2xl cursor-grab active:cursor-grabbing">
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  className="w-full h-80 sm:h-96 block touch-none"
                />

                <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-slate-900/80 border border-slate-800 text-[10px] text-slate-400 font-mono pointer-events-none">
                  Glissez pour déplacer • Boutons pour zoomer
                </div>
              </div>

              {/* Key points explanation badges */}
              {result && result.keyPoints && result.keyPoints.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-slate-400 font-medium">Points remarquables :</span>
                  {result.keyPoints.map((kp, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold"
                      style={{
                        borderColor: `${kp.color}60`,
                        backgroundColor: `${kp.color}15`,
                        color: kp.color,
                      }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: kp.color }} />
                      <span>{kp.label}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Tableau de Valeurs */}
          {activeTab === 'table' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200">Tableau de coordonnées (x et f(x))</span>
                <span className="font-mono text-[11px]">Calculé instantanément</span>
              </div>

              {result && result.tableOfValues && result.tableOfValues.length > 0 ? (
                <div className="rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-950 text-slate-300 border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-4 font-bold text-cyan-400">x (Abscisse)</th>
                        <th className="py-2.5 px-4 font-bold text-emerald-400">f(x) (Image)</th>
                        <th className="py-2.5 px-4 font-bold text-slate-400 hidden sm:table-cell">Coordonnées</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/60 text-slate-200">
                      {result.tableOfValues.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition">
                          <td className="py-2 px-4 font-semibold text-cyan-200">{row.x}</td>
                          <td className="py-2 px-4 font-semibold text-emerald-200">
                            {row.y !== null && !isNaN(row.y) ? (Number.isInteger(row.y) ? row.y : row.y.toFixed(3)) : 'Indéfini'}
                          </td>
                          <td className="py-2 px-4 text-slate-400 hidden sm:table-cell">
                            ({row.x} ; {row.y !== null ? (Number.isInteger(row.y) ? row.y : row.y.toFixed(2)) : '∅'})
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic text-center py-6">
                  Aucun tableau de valeur disponible pour cette équation.
                </p>
              )}
            </div>
          )}

        </div>

        {/* Modal Actions Footer */}
        <div className="px-3 sm:px-6 py-3 bg-slate-950/95 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {/* Copy Solution */}
            <button
              type="button"
              onClick={handleCopySolution}
              disabled={!result}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition active:scale-95 disabled:opacity-50"
              title="Copier la solution complète"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copié !' : 'Copier'}</span>
            </button>

            {/* Share on WhatsApp */}
            <button
              type="button"
              onClick={handleShareWhatsApp}
              disabled={!result}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition active:scale-95 disabled:opacity-50"
              title="Partager sur WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden xs:inline">WhatsApp</span>
            </button>

            {/* Speak Solution */}
            {onSpeakText && (
              <button
                type="button"
                onClick={handleSpeak}
                disabled={!result}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold transition active:scale-95 disabled:opacity-50"
                title="Écouter la solution avec la voix de SADIO"
              >
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden xs:inline">Écouter</span>
              </button>
            )}
          </div>

          {/* Main Action: Send to SADIO chat */}
          <button
            type="button"
            onClick={handleSendToSadio}
            disabled={!result}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition active:scale-95 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Demander des explications à SADIO</span>
          </button>
        </div>

      </div>
    </div>
  );
};
