import React from 'react';
import { RobotTheme, ChatMessage } from '../types/chat';
import { X, Palette, Volume2, Trash2, ShieldCheck, Play, Check, RotateCcw, Sparkles, Cpu } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: RobotTheme;
  onChangeTheme: (theme: RobotTheme) => void;
  availableVoices?: SpeechSynthesisVoice[];
  selectedVoice?: SpeechSynthesisVoice | null;
  onSelectVoice?: (voice: SpeechSynthesisVoice) => void;
  speechRate?: number;
  onChangeSpeechRate?: (rate: number) => void;
  messages: ChatMessage[];
  onClearMessages: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  theme,
  onChangeTheme,
  availableVoices = [],
  selectedVoice = null,
  onSelectVoice,
  speechRate = 1.0,
  onChangeSpeechRate,
  onClearMessages,
}) => {
  const [showClearConfirm, setShowClearConfirm] = React.useState(false);

  if (!isOpen) return null;

  const themes: { id: RobotTheme; name: string; color: string; desc: string }[] = [
    { id: 'cyan', name: 'Cyber Azure', color: '#06b6d4', desc: 'Néon classique & vision quantique' },
    { id: 'purple', name: 'Quantum Violet', color: '#a855f7', desc: 'Synthwave & plasma profond' },
    { id: 'amber', name: 'Solar Mech', color: '#f59e0b', desc: 'Châssis titan & réacteur solaire' },
    { id: 'emerald', name: 'Bio-Matrix', color: '#10b981', desc: 'Noyau synaptique émeraude' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 p-6 shadow-2xl text-slate-100 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-slate-800">
          <ShieldCheck className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-bold text-white">Paramètres de Sadio</h2>
        </div>

        <div className="space-y-5">
          {/* Theme Selector */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-2.5">
              <Palette className="w-4 h-4 text-cyan-400" />
              <span>Châssis & Thème Lumineux du Robot</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onChangeTheme(t.id)}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                    theme === t.id
                      ? 'bg-slate-800 border-cyan-400 shadow-sm shadow-cyan-400/20'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: t.color }}
                  />
                  <div className="overflow-hidden">
                    <div className="text-xs font-semibold text-slate-200">{t.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Voice Switch & Voice Selector */}
          <div className="space-y-2.5">


            {/* Select Voice Dropdown - Strictly French voices */}
            {availableVoices.length > 0 && onSelectVoice && (
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300 font-medium">Voix française de Sadio :</span>
                  <span className="text-[10px] text-cyan-400 font-mono">
                    {selectedVoice ? 'Française' : 'Par défaut'}
                  </span>
                </div>
                <select
                  value={selectedVoice?.name || ''}
                  onChange={(e) => {
                    const chosen = availableVoices.find((v) => v.name === e.target.value);
                    if (chosen) onSelectVoice(chosen);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                >
                  {availableVoices.map((voice) => {
                    const isGoogle = voice.name.toLowerCase().includes('google');
                    const isEnhanced =
                      voice.name.toLowerCase().includes('enhanced') ||
                      voice.name.toLowerCase().includes('natural') ||
                      voice.name.toLowerCase().includes('network') ||
                      voice.name.toLowerCase().includes('neural');
                    const badge = isGoogle ? '⭐ ' : isEnhanced ? '✨ ' : '';
                    return (
                      <option key={voice.name} value={voice.name}>
                        {badge}{voice.name} ({voice.lang})
                      </option>
                    );
                  })}
                </select>
                <p className="text-[10px] text-slate-400 leading-tight">
                  💡 Astuce mobile : Privilégiez les voix <strong>⭐ Google</strong> ou <strong>✨ Naturelle / Haute fidélité</strong> pour un timbre vocal fluide, naturel et sans effet robotique.
                </p>
              </div>
            )}

            {/* Speed / Débit de parole Selector */}
            {onChangeSpeechRate && (
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300 font-medium">Vitesse de parole :</span>
                  <span className="text-[10px] text-cyan-400 font-mono font-bold">
                    {Math.round((speechRate || 1.0) * 100)}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { rate: 0.9, label: 'Calme & posée' },
                    { rate: 1.0, label: 'Naturelle (Recommandée)' },
                    { rate: 1.1, label: 'Dynamique' },
                  ].map((s) => (
                    <button
                      key={s.rate}
                      type="button"
                      onClick={() => onChangeSpeechRate(s.rate)}
                      className={`py-2 px-1.5 rounded-xl text-[11px] font-medium border text-center transition-all ${
                        Math.abs((speechRate || 1.0) - s.rate) < 0.04
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold shadow-sm shadow-cyan-500/20'
                          : 'bg-slate-900/80 border-slate-700/70 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Moteur & Modèle Recommandé pour l'Analyse d'Image */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-950/40 via-slate-900 to-indigo-950/30 border border-cyan-500/30 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-white block">Moteur d'Analyse Visuelle</span>
                <span className="text-[10px] text-cyan-300 font-mono">Modèle recommandé : Gemini 2.0 Flash / 1.5 Flash</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Pour l'analyse d'images via le bouton <strong>[+]</strong>, <strong>Gemini 2.0 Flash / 1.5 Flash</strong> est le modèle multimodal idéal recommandé :
            </p>
            <ul className="text-[10px] text-slate-400 space-y-1 list-disc pl-4">
              <li><strong className="text-slate-200">Ultra-rapide</strong> : Latence minimale pour une réponse et vocalisation quasi-immédiate.</li>
              <li><strong className="text-slate-200">Précision totale</strong> : Transcription OCR fidèle, description détaillée des scènes et diagnostics.</li>
              <li><strong className="text-slate-200">Économique</strong> : Tarif ultra-accessible (~0,10 $ / 1M tokens) permettant des milliers d'analyses d'images à coût minime.</li>
            </ul>
          </div>

          {/* Action: Reset */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            {showClearConfirm ? (
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 space-y-2">
                <p className="text-xs text-cyan-200 font-medium text-center">
                  Réinitialiser Sadio et recommencer à zéro ?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      onClearMessages();
                      setShowClearConfirm(false);
                      onClose();
                    }}
                    className="min-h-[38px] py-1.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition"
                  >
                    Oui, réinitialiser
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="min-h-[38px] py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full min-h-[42px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white text-xs font-medium transition active:scale-95"
              >
                <RotateCcw className="w-4 h-4 text-cyan-400" />
                <span>Réinitialiser Sadio (Recommencer à zéro)</span>
              </button>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-5 w-full min-h-[44px] rounded-xl bg-cyan-600 hover:bg-cyan-500 py-2.5 text-xs font-semibold text-white transition shadow-md shadow-cyan-600/20 active:scale-95"
        >
          Fermer
        </button>
      </div>
    </div>
  );
};
