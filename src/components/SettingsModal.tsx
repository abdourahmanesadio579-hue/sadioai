import React from 'react';
import { RobotTheme, ChatMessage } from '../types/chat';
import { X, Palette, Volume2, Trash2, ShieldCheck, Play, Check, RotateCcw } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: RobotTheme;
  onChangeTheme: (theme: RobotTheme) => void;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  hideResponseText: boolean;
  onToggleHideResponseText: () => void;
  availableVoices?: SpeechSynthesisVoice[];
  selectedVoice?: SpeechSynthesisVoice | null;
  onSelectVoice?: (voice: SpeechSynthesisVoice) => void;
  onTestVoice?: () => void;
  messages: ChatMessage[];
  onClearMessages: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  theme,
  onChangeTheme,
  voiceEnabled,
  onToggleVoice,
  hideResponseText,
  onToggleHideResponseText,
  availableVoices = [],
  selectedVoice = null,
  onSelectVoice,
  onTestVoice,
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
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Volume2 className="w-4 h-4 text-cyan-400" />
              <span>Synthèse Vocale du Robot</span>
            </label>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <div>
                <div className="text-xs font-medium text-slate-200">Lecture vocale automatique</div>
                <div className="text-[10px] text-slate-400">Le robot lit ses réponses à voix haute</div>
              </div>
              <button
                onClick={onToggleVoice}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  voiceEnabled ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    voiceEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Hide Response Text / Pure Vocal Mode Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <div>
                <div className="text-xs font-medium text-slate-200">Mode Vocal Pur (Masquer le texte)</div>
                <div className="text-[10px] text-slate-400">Le robot répond vocalement sans afficher le texte de la réponse à l’écran</div>
              </div>
              <button
                onClick={onToggleHideResponseText}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  hideResponseText ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    hideResponseText ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Test Voice Button */}
            {onTestVoice && (
              <button
                onClick={onTestVoice}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-medium transition"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Tester la voix du robot maintenant (Son de test)</span>
              </button>
            )}

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
                  {availableVoices.map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 leading-tight">
                  💡 Vous pouvez choisir ici une autre voix française si celle par défaut vous semble robotique ou étrange.
                </p>
              </div>
            )}
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
