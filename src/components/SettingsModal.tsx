import React from 'react';
import { RobotTheme, ChatMessage } from '../types/chat';
import { X, Palette, Volume2, Trash2, ShieldCheck, Play, Check, RotateCcw, Sparkles, Cpu, Download, Phone, Globe } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { MAX_DAILY_CALL_SECONDS, formatCallTime } from '../utils/callQuota';
import { Language, TRANSLATIONS } from '../utils/i18n';

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
  usedCallSeconds?: number;
  voiceEnabled?: boolean;
  onToggleVoice?: () => void;
  onTestVoice?: () => void;
  onTestSpecificVoice?: (voice: SpeechSynthesisVoice) => void;
  language?: Language;
  onChangeLanguage?: (lang: Language) => void;
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
  usedCallSeconds = 0,
  voiceEnabled = true,
  onToggleVoice,
  onTestVoice,
  onTestSpecificVoice,
  language = 'fr',
  onChangeLanguage,
}) => {
  const [showClearConfirm, setShowClearConfirm] = React.useState(false);
  const [onlyPremium, setOnlyPremium] = React.useState(false);
  const t = TRANSLATIONS[language].settings;

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
          <h2 className="text-base font-bold text-white">{t.title}</h2>
        </div>

        <div className="space-y-5">
          {/* Language Selector */}
          {onChangeLanguage && (
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 mb-1">
                <Globe className="w-4 h-4 text-cyan-400" />
                <span>{t.languageSection}</span>
              </label>
              <p className="text-[11px] text-slate-400 mb-2.5">
                {t.languageDesc}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeLanguage('fr')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition active:scale-95 ${
                    language === 'fr'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-sm shadow-cyan-500/20'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="text-base">🇫🇷</span>
                  <span>{t.frenchLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeLanguage('en')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition active:scale-95 ${
                    language === 'en'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-sm shadow-cyan-500/20'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="text-base">🇬🇧</span>
                  <span>{t.englishLabel}</span>
                </button>
              </div>
            </div>
          )}

          {/* Theme Selector */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-2.5">
              <Palette className="w-4 h-4 text-cyan-400" />
              <span>{t.themeSection}</span>
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
            {/* Voice Switch & Test Voice */}
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${voiceEnabled ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-500'}`}>
                  <Volume2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs text-slate-200 font-medium">Lecture vocale de SADIO</div>
                  <div className="text-[10px] text-slate-400">
                    {voiceEnabled ? 'Activée (SADIO répond à voix haute)' : 'Coupée (mode silencieux)'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onTestVoice && (
                  <button
                    type="button"
                    onClick={onTestVoice}
                    className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[11px] font-semibold hover:bg-cyan-500/25 transition active:scale-95 flex items-center gap-1"
                  >
                    <Play className="w-3 h-3" />
                    Tester
                  </button>
                )}
                {onToggleVoice && (
                  <button
                    type="button"
                    onClick={onToggleVoice}
                    className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                      voiceEnabled ? 'bg-cyan-500' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white transition-transform ${
                        voiceEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>


            {/* Select Voice Dropdown - Filter premium / high quality voices */}
            {availableVoices.length > 0 && onSelectVoice && (() => {
              const premiumVoices = availableVoices.filter((v) => {
                const n = v.name.toLowerCase();
                return (
                  n.includes('google') ||
                  n.includes('enhanced') ||
                  n.includes('natural') ||
                  n.includes('network') ||
                  n.includes('neural') ||
                  n.includes('premium') ||
                  n.includes('wavenet') ||
                  n.includes('siri') ||
                  n.includes('thomas') ||
                  n.includes('audrey') ||
                  n.includes('aurélie') ||
                  n.includes('nicolas') ||
                  n.includes('hortense') ||
                  n.includes('paul') ||
                  n.includes('julie') ||
                  n.includes('online')
                );
              });

              const voicesToDisplay = onlyPremium ? (premiumVoices.length > 0 ? premiumVoices : availableVoices) : availableVoices;

              return (
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300 font-medium">Voix française de SADIO :</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-cyan-400 font-mono px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30">
                        {premiumVoices.length} premium / {availableVoices.length} total
                      </span>
                    </div>
                  </div>

                  {/* Filter Toggle Checkbox */}
                  <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                    <input
                      type="checkbox"
                      checked={onlyPremium}
                      onChange={(e) => setOnlyPremium(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-cyan-500/30 h-3.5 w-3.5"
                    />
                    <span className="text-[11px] text-cyan-300 font-medium select-none">
                      ✨ Afficher uniquement les voix premium / haute qualité
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    <select
                      value={selectedVoice?.name || ''}
                      onChange={(e) => {
                        const chosen = availableVoices.find((v) => v.name === e.target.value);
                        if (chosen) onSelectVoice(chosen);
                      }}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                    >
                      {voicesToDisplay.map((voice) => {
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

                    {onTestSpecificVoice && (
                      <button
                        type="button"
                        onClick={() => {
                          const targetVoice = selectedVoice || voicesToDisplay[0];
                          if (targetVoice) onTestSpecificVoice(targetVoice);
                        }}
                        className="px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-500/25 to-teal-500/25 border border-emerald-500/50 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/35 transition active:scale-95 flex items-center gap-1.5 shrink-0 shadow-sm"
                        title="Tester cette voix avant de la sélectionner définitivement"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Tester</span>
                      </button>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-400 leading-tight">
                    💡 Sélectionnez une voix dans la liste puis cliquez sur <strong>Tester</strong> pour écouter son timbre avant de valider.
                  </p>
                </div>
              );
            })()}

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

          {/* Architecture Moteur Bi-Cerveau : DeepSeek + Gemini (Géré côté serveur) */}
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-950/60 via-slate-900 to-cyan-950/40 border border-indigo-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center shrink-0">
                  <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Architecture Cognitive : Bi-Cerveau</span>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    ● Premier Cerveau : DeepSeek (Serveur) • Relais : Gemini
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-[11px] text-slate-300">
              <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex items-start gap-2">
                <span className="text-indigo-400 font-bold shrink-0">1.</span>
                <div>
                  <span className="font-semibold text-slate-100">DeepSeek (Prioritaire)</span>
                  <p className="text-[10px] text-slate-400">
                    Traite en priorité toutes vos questions textuelles avec un raisonnement approfondi.
                  </p>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex items-start gap-2">
                <span className="text-cyan-400 font-bold shrink-0">2.</span>
                <div>
                  <span className="font-semibold text-slate-100">Google Gemini (Vision & Repli)</span>
                  <p className="text-[10px] text-slate-400">
                    Analyse instantanément les images et prend le relais sans coupure en cas de latence réseau.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 italic">
              🔒 Sécurité totale : Les clés API sont hébergées et protégées sur votre serveur Render. Les visiteurs n'ont aucune clé à saisir.
            </p>
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

          {/* Quota d'Appel Mains Libres Quotidien */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-200">Quota d'Appel Vocal (20 min/jour)</span>
              </div>
              <span className="text-[11px] font-mono font-bold text-emerald-300">
                {formatCallTime(Math.max(0, MAX_DAILY_CALL_SECONDS - (usedCallSeconds || 0)))} restant
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (((usedCallSeconds || 0)) / MAX_DAILY_CALL_SECONDS) * 100)}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Consommé aujourd'hui : {formatCallTime(usedCallSeconds || 0)} / 20:00</span>
              <span className="text-slate-500 font-mono">Reset auto à 00h00 GMT</span>
            </div>
          </div>

          {/* Action: PWA Install */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Download className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-200">Application SADIO</div>
                <div className="text-[10px] text-slate-400 truncate">Installer sur l'écran d'accueil</div>
              </div>
            </div>
            <div className="shrink-0">
              <PWAInstallButton />
            </div>
          </div>

          {/* Action: Reset */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            {showClearConfirm ? (
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 space-y-2">
                <p className="text-xs text-cyan-200 font-medium text-center">
                  Réinitialiser SADIO et recommencer à zéro ?
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
                <span>Réinitialiser SADIO (Recommencer à zéro)</span>
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
