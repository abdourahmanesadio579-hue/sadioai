import React, { useState, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  FileText,
  Radio,
  Play,
  Square,
  Download,
} from 'lucide-react';
import { ChatMessageItem } from './ChatMessageItem';
import { exportTextAsAudioPodcast } from '../utils/audioPodcastExporter';

export interface FormattedReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  fullText: string;
  isSpeaking: boolean;
  onSpeak: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  domainLabel?: string;
}

export const FormattedReaderModal: React.FC<FormattedReaderModalProps> = ({
  isOpen,
  onClose,
  fullText,
  isSpeaking,
  onSpeak,
  onStop,
  isStreaming,
  domainLabel = 'Général',
}) => {
  const [copied, setCopied] = useState(false);

  const totalWords = useMemo(() => {
    const trimmed = fullText.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [fullText]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl bg-slate-900 border border-cyan-500/50 shadow-2xl overflow-hidden">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 bg-slate-950/95 border-b border-cyan-500/20 backdrop-blur-xl">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0 shadow-[0_0_12px_rgba(6,182,212,0.25)]">
              {isSpeaking ? (
                <Radio className="w-4 h-4 animate-pulse text-cyan-300" />
              ) : (
                <FileText className="w-4 h-4 text-cyan-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm sm:text-base text-white tracking-wide truncate">
                  Réponse de SADIO
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-cyan-500/30 shrink-0">
                  {domainLabel}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono truncate">
                {isSpeaking
                  ? 'Lecture vocale en cours • Affichage formaté'
                  : 'Affichage formaté • Cliquez sur « Écouter » pour lancer la lecture'}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold shadow mr-1">
              <FileText className="w-3.5 h-3.5" />
              <span>Formaté</span>
            </div>

            {/* Audio Listen / Stop */}
            {isSpeaking ? (
              <button
                type="button"
                onClick={onStop}
                className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 text-xs font-medium flex items-center gap-1.5 transition active:scale-95 shadow-sm"
                title="Arrêter la lecture"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span className="hidden xs:inline">Arrêter</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSpeak(fullText)}
                className="px-2.5 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30 text-xs font-medium flex items-center gap-1.5 transition active:scale-95 shadow-sm"
                title="Lancer la lecture vocale"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span className="hidden xs:inline">Écouter</span>
              </button>
            )}

            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-95"
              title="Copier le texte"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            {/* Download Podcast Audio Button */}
            <button
              type="button"
              onClick={() => exportTextAsAudioPodcast(fullText, domainLabel || 'SADIO')}
              className="p-1.5 rounded-xl text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition active:scale-95 flex items-center gap-1 px-2 text-xs font-medium bg-emerald-500/10 border border-emerald-500/30"
              title="Télécharger la réponse en podcast audio"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Podcast</span>
            </button>

            {/* Close modal */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95 ml-1"
              title="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body Content (Formatted View Only) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 text-slate-200 leading-relaxed font-sans select-text scroll-smooth">
          <div className="prose prose-invert max-w-none text-xs sm:text-sm">
            <ChatMessageItem
              message={{
                id: 'full-document-view',
                role: 'model',
                content: fullText,
                timestamp: Date.now(),
                domain: domainLabel,
              }}
              hideResponseText={false}
              isStreaming={isStreaming}
              onSpeak={onSpeak}
              onStopSpeak={onStop}
              isSpeakingThis={isSpeaking}
            />
          </div>
        </div>

        {/* Bottom Footer Info Bar */}
        <div className="px-4 py-2.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>Total : {totalWords} mots</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-sans transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default FormattedReaderModal;
