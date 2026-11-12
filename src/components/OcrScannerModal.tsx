import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  ScanText,
  Upload,
  Camera,
  Copy,
  Check,
  Sparkles,
  Volume2,
  RefreshCw,
  FileText,
  Send,
  Zap,
  Lock,
  ShieldAlert,
  LineChart,
} from 'lucide-react';
import { createWorker } from 'tesseract.js';
import { safeStorage } from '../utils/storage';

export interface OcrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyTextToInput: (extractedText: string) => void;
  onSpeakText?: (text: string) => void;
  onSolveMath?: (equation: string) => void;
}

// Helper pour générer une empreinte de terminal stable et persistante
function getDeviceFingerprint(): string {
  let fp = safeStorage.getItem('sadio_ocr_device_fp');
  if (!fp) {
    const entropy = [
      typeof navigator !== 'undefined' ? navigator.userAgent : '',
      typeof navigator !== 'undefined' ? navigator.language : '',
      typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '',
      typeof screen !== 'undefined' ? screen.colorDepth : '',
      new Date().getTimezoneOffset(),
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2,
    ].join('###');
    let hash = 0;
    for (let i = 0; i < entropy.length; i++) {
      hash = (hash << 5) - hash + entropy.charCodeAt(i);
      hash |= 0;
    }
    const rand = Math.random().toString(36).substring(2, 10);
    fp = `fp_${Math.abs(hash).toString(16)}_${rand}`;
    safeStorage.setItem('sadio_ocr_device_fp', fp);
  }
  return fp;
}

export const OcrScannerModal: React.FC<OcrScannerModalProps> = ({
  isOpen,
  onClose,
  onApplyTextToInput,
  onSpeakText,
  onSolveMath,
}) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'fra' | 'eng'>('fra');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Strict 20 scans/day quota enforcement
  const [quotaRemaining, setQuotaRemaining] = useState<number | null>(null);
  const [quotaUsed, setQuotaUsed] = useState<number>(0);
  const [quotaMax, setQuotaMax] = useState<number>(20);
  const [isLoadingQuota, setIsLoadingQuota] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch current daily quota from server
  const fetchQuota = useCallback(async () => {
    try {
      setIsLoadingQuota(true);
      const token = safeStorage.getItem('sadio_auth_token');
      const fp = getDeviceFingerprint();
      const headers: Record<string, string> = {
        'x-device-fingerprint': fp,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch('/api/ocr/quota', { headers });
      if (response.ok) {
        const data = await response.json();
        setQuotaRemaining(typeof data.remaining === 'number' ? data.remaining : 20);
        setQuotaUsed(typeof data.used === 'number' ? data.used : 0);
        setQuotaMax(typeof data.max === 'number' ? data.max : 20);
      }
    } catch (err) {
      console.warn('Erreur lors de la récupération du quota OCR:', err);
    } finally {
      setIsLoadingQuota(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchQuota();
    }
  }, [isOpen, fetchQuota]);

  const processImageWithOcr = useCallback(
    async (imageDataUrl: string, lang: 'fra' | 'eng') => {
      // 0. VÉRIFICATION DU QUOTA STRICT
      if (quotaRemaining !== null && quotaRemaining <= 0) {
        setErrorMessage(
          "Limite quotidienne atteinte : vous avez déjà effectué 20 scans aujourd'hui. Pour éviter les abus et préserver le service, revenez demain à minuit !"
        );
        return;
      }

      setIsProcessing(true);
      setProgress(15);
      setProgressStatus("Analyse visuelle haute précision (Vision AI)...");
      setErrorMessage(null);

      // 1. TENTATIVE N°1 : Moteur Vision AI Haute Précision (/api/ocr)
      // Vérification et incrémentation stricte côté serveur (Max 20/jour, infranchissable)
      try {
        const fp = getDeviceFingerprint();
        const mimeType = imageDataUrl.match(/data:([^;]+);/)?.[1] || 'image/jpeg';
        const token = safeStorage.getItem('sadio_auth_token');

        // Récupération préalable du jeton cryptographique de défi (anti-rejeu et anti-bots)
        let challengeToken = '';
        try {
          const chalRes = await fetch(`/api/ocr/challenge?fp=${encodeURIComponent(fp)}`);
          if (chalRes.ok) {
            const chalData = await chalRes.json();
            challengeToken = chalData.challengeToken || '';
          }
        } catch (cErr) {
          console.warn('Impossible de récupérer le jeton de défi:', cErr);
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-device-fingerprint': fp,
        };
        if (challengeToken) {
          headers['x-ocr-challenge'] = challengeToken;
        }
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch('/api/ocr', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            imageBase64: imageDataUrl,
            mimeType,
            language: lang,
            challengeToken,
          }),
        });

        // Cas Quota dépassé (429 Too Many Requests)
        if (response.status === 429) {
          const quotaErr = await response.json().catch(() => ({}));
          if (quotaErr.isCooldown) {
            setErrorMessage(quotaErr.error || "Veuillez patienter quelques secondes entre deux scans consécutifs.");
            setIsProcessing(false);
            return;
          }

          setQuotaRemaining(0);
          setQuotaUsed(quotaMax);
          setErrorMessage(
            quotaErr.error ||
              "Quota quotidien strict de 20 scans atteint pour aujourd'hui. Réinitialisation automatique à 00h00 GMT !"
          );
          setIsProcessing(false);
          // Blocage total : interdiction absolue de contourner
          return;
        }

        if (response.ok) {
          const data = await response.json();
          if (data.quota) {
            setQuotaRemaining(data.quota.remaining);
            setQuotaUsed(data.quota.used);
            setQuotaMax(data.quota.max || 20);
          }
          if (data.success && data.text && data.text.trim().length > 0) {
            setExtractedText(data.text.trim());
            setProgress(100);
            setProgressStatus('Extraction haute fidélité réussie (Vision AI) !');
            setIsProcessing(false);
            return;
          }
        } else {
          const errData = await response.json().catch(() => ({}));
          setErrorMessage(errData.error || "Erreur lors de l'extraction par le serveur.");
        }
      } catch (cloudErr) {
        console.warn('Vision OCR attempt failed, checking fallback:', cloudErr);
      }

      // Si quota dépassé ou erreur fatale, ne pas lancer le scan
      if (quotaRemaining !== null && quotaRemaining <= 0) {
        setIsProcessing(false);
        return;
      }

      // 2. Moteur OCR Local (Tesseract.js de secours uniquement en cas de coupure réseau complète)
      setProgress(40);
      setProgressStatus("Moteur optique local de secours...");

      try {
        const worker = await createWorker(lang, 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              const currentP = 40 + Math.round((m.progress || 0) * 55);
              setProgress(currentP);
              setProgressStatus(`Reconnaissance optique locale... ${currentP}%`);
            } else if (m.status === 'loading language traineddata') {
              setProgressStatus('Chargement du dictionnaire...');
            }
          },
        });

        const ret = await worker.recognize(imageDataUrl);
        const resultText = (ret.data.text || '').trim();

        await worker.terminate();

        if (!resultText) {
          setErrorMessage(
            "Aucun texte net n'a été détecté. Assurez-vous que l'image est bien éclairée et que les lettres sont lisibles."
          );
        } else {
          setExtractedText(resultText);
          setProgress(100);
          setProgressStatus('Extraction locale terminée !');
        }
      } catch (err: any) {
        console.error('OCR Processing error:', err);
        setErrorMessage(
          err?.message || "Erreur lors de l'extraction optique. Veuillez réessayer avec une image plus nette."
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [quotaRemaining, quotaMax]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (quotaRemaining !== null && quotaRemaining <= 0) {
      setErrorMessage(
        "Quota quotidien atteint (20 scans max). Réinitialisation automatique à minuit !"
      );
      e.target.value = '';
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Veuillez sélectionner un fichier image valide (JPG, PNG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      setExtractedText('');
      processImageWithOcr(result, selectedLanguage);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCopy = () => {
    if (!extractedText) return;
    navigator.clipboard.writeText(extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToSadio = () => {
    if (!extractedText) return;
    onApplyTextToInput(extractedText);
    onClose();
  };

  const handleSpeak = () => {
    if (!extractedText || !onSpeakText) return;
    onSpeakText(extractedText);
  };

  const handleRetryWithLang = (newLang: 'fra' | 'eng') => {
    setSelectedLanguage(newLang);
    if (imagePreview) {
      processImageWithOcr(imagePreview, newLang);
    }
  };

  const handleReset = () => {
    setImagePreview(null);
    setExtractedText('');
    setProgress(0);
    setProgressStatus('');
    setErrorMessage(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl bg-slate-900 border border-cyan-500/50 shadow-2xl overflow-hidden">
        
        {/* Hidden File Inputs for Gallery and Native Camera */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-3 sm:px-6 py-3 bg-slate-950/95 border-b border-cyan-500/20 backdrop-blur-xl gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center text-cyan-400 shrink-0 shadow-md">
              <ScanText className="w-4 h-4 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-xs sm:text-base text-white flex flex-wrap items-center gap-1 sm:gap-2">
                <span className="truncate">Scanner de Texte (OCR)</span>
                <span className="text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono font-semibold flex items-center gap-1 shrink-0">
                  <Zap className="w-3 h-3 text-cyan-400" />
                  <span>Vision AI (Max 20/j)</span>
                </span>
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                Extrayez instantanément le texte d'un livre, cours, document ou reçu papier
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

        {/* Daily Quota Tracker Bar */}
        <div
          className={`px-4 sm:px-6 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs transition-colors ${
            quotaRemaining === 0
              ? 'bg-rose-950/50 border-rose-500/40 text-rose-200'
              : quotaRemaining !== null && quotaRemaining <= 5
              ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
              : 'bg-slate-950/70 border-slate-800 text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {quotaRemaining === 0 ? (
              <Lock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold">
                {quotaRemaining === 0
                  ? 'Quota du jour atteint :'
                  : "Scans restants aujourd'hui :"}
              </span>
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded-md ${
                  quotaRemaining === 0
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : quotaRemaining !== null && quotaRemaining <= 5
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                }`}
              >
                {isLoadingQuota ? '...' : `${quotaRemaining ?? 20} / ${quotaMax}`}
              </span>
              <span className="text-[11px] text-slate-400">
                (Limite : 20/jour • Réinitialisation à 00h00 GMT)
              </span>
            </div>
          </div>

          {/* Visual Mini Progress Bar */}
          <div className="w-24 sm:w-32 bg-slate-800 rounded-full h-1.5 overflow-hidden border border-slate-700/60 shrink-0">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                quotaRemaining === 0
                  ? 'bg-rose-500'
                  : quotaRemaining !== null && quotaRemaining <= 5
                  ? 'bg-amber-400'
                  : 'bg-gradient-to-r from-cyan-400 to-blue-500'
              }`}
              style={{
                width: `${Math.min(
                  100,
                  Math.max(0, ((quotaRemaining ?? 20) / quotaMax) * 100)
                )}%`,
              }}
            />
          </div>
        </div>

        {/* Language Selection & Top Controls */}
        <div className="px-4 sm:px-6 py-2 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Langue du texte :</span>
            <div className="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700">
              <button
                type="button"
                onClick={() => handleRetryWithLang('fra')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  selectedLanguage === 'fra'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                🇫🇷 Français
              </button>
              <button
                type="button"
                onClick={() => handleRetryWithLang('eng')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  selectedLanguage === 'eng'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                🇬🇧 English
              </button>
            </div>
          </div>

          {imagePreview && (
            <button
              onClick={handleReset}
              className="text-[11px] text-slate-400 hover:text-cyan-300 flex items-center gap-1 transition"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Changer d'image</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* State 1: No image selected yet -> Big Action Cards */}
          {!imagePreview && (
            <div className="py-6 sm:py-8 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-300 mb-4 shadow-lg shadow-cyan-500/10">
                <ScanText className="w-8 h-8" />
              </div>

              <h4 className="text-base sm:text-lg font-bold text-white mb-1">
                Photographiez ou importez votre document
              </h4>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
                Reconnaissance de texte haute précision pour vos cours, devoirs, factures et documents manuscrits ou imprimés.
              </p>

              {/* Si quota épuisé : Affichage du blocage d'abus infranchissable */}
              {quotaRemaining === 0 ? (
                <div className="w-full max-w-md p-5 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-center space-y-2.5 shadow-xl">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300 shadow-md">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h5 className="font-bold text-rose-200 text-sm sm:text-base">
                    Limite quotidienne atteinte (20 scans / 20)
                  </h5>
                  <p className="text-xs text-rose-300/80 leading-relaxed">
                    Pour garantir la gratuité et prévenir les abus de requêtes, chaque utilisateur est limité à <strong>20 scans par jour</strong>.
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-mono">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    <span>Réinitialisation automatique cette nuit à minuit (00h00 GMT)</span>
                  </div>
                </div>
              ) : (
                /* Boutons de scan actifs */
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md">
                  {/* Take Photo with Camera */}
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-xl shadow-cyan-500/20 transition active:scale-95"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Prendre une photo (Caméra)</span>
                  </button>

                  {/* Pick from Gallery / Files */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-sm transition active:scale-95"
                  >
                    <Upload className="w-4 h-4 text-cyan-400" />
                    <span>Choisir depuis la galerie</span>
                  </button>
                </div>
              )}

              <div className="mt-6 flex items-center gap-4 text-[11px] text-slate-500 font-mono">
                <span>✓ Feuilles de cours</span>
                <span>•</span>
                <span>✓ Livres & Devoirs</span>
                <span>•</span>
                <span>✓ Factures & Reçus</span>
              </div>
            </div>
          )}

          {/* State 2: Image Selected -> Preview & Extraction */}
          {imagePreview && (
            <div className="space-y-4">
              
              {/* Image thumbnail + Progress Bar if running */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                <img
                  src={imagePreview}
                  alt="Document scanné"
                  className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-xl border border-cyan-500/40 shrink-0"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-cyan-200 truncate">
                      {isProcessing ? progressStatus : 'Extraction terminée'}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {isProcessing ? `${progress}%` : 'Prêt'}
                    </span>
                  </div>

                  {isProcessing ? (
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                      <div
                        className="bg-gradient-to-r from-cyan-400 to-blue-500 h-full transition-all duration-200 rounded-full shadow-[0_0_8px_#06b6d4]"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 truncate">
                      {extractedText.length} caractères extraits avec succès.
                    </p>
                  )}
                </div>
              </div>

              {/* Error Alert if any */}
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs">
                  {errorMessage}
                </div>
              )}

              {/* Extracted Text Area */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-medium flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Texte extrait (modifiable) :</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    Cliquez dans le texte pour ajuster si besoin
                  </span>
                </div>

                <textarea
                  value={extractedText}
                  onChange={(e) => setExtractedText(e.target.value)}
                  placeholder={isProcessing ? "Reconnaissance du texte en cours..." : "Le texte scanné apparaîtra ici."}
                  rows={8}
                  disabled={isProcessing}
                  className="w-full p-3.5 rounded-2xl bg-slate-950 border border-slate-700/80 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 text-slate-100 text-xs sm:text-sm font-sans leading-relaxed resize-none selection:bg-cyan-500/30"
                />
              </div>

            </div>
          )}

        </div>

        {/* Modal Actions Footer */}
        {imagePreview && (
          <div className="px-3 sm:px-6 py-3 bg-slate-950/95 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {/* Copy Text Button */}
              <button
                type="button"
                onClick={handleCopy}
                disabled={!extractedText || isProcessing}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition active:scale-95 disabled:opacity-50"
                title="Copier le texte extrait"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copié !' : 'Copier'}</span>
              </button>

              {/* Speak Text with SADIO voice */}
              {onSpeakText && (
                <button
                  type="button"
                  onClick={handleSpeak}
                  disabled={!extractedText || isProcessing}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold transition active:scale-95 disabled:opacity-50"
                  title="Faire lire le texte par SADIO"
                >
                  <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden xs:inline">Écouter</span>
                </button>
              )}

              {/* Solve with Math Solver if applicable */}
              {onSolveMath && (
                <button
                  type="button"
                  onClick={() => {
                    if (extractedText) {
                      onSolveMath(extractedText);
                    }
                  }}
                  disabled={!extractedText || isProcessing}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl border border-purple-500/40 bg-purple-500/15 hover:bg-purple-500/25 text-purple-200 text-xs font-semibold transition active:scale-95 disabled:opacity-50"
                  title="Résoudre l'équation ou tracer la courbe dans le solveur mathématique (0 F)"
                >
                  <LineChart className="w-3.5 h-3.5 text-purple-400" />
                  <span>Résoudre Maths</span>
                </button>
              )}
            </div>

            {/* Main Action: Send directly to SADIO chat input */}
            <button
              type="button"
              onClick={handleSendToSadio}
              disabled={!extractedText || isProcessing}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition active:scale-95 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Insérer dans la discussion avec SADIO</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
