import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  FileText,
  Radio,
  Sparkles,
  Play,
  Square,
  Zap,
  Download,
} from 'lucide-react';
import { ChatMessageItem } from './ChatMessageItem';
import { parseDocumentIntoKaraoke } from '../utils/karaokeParser';
import { karaokeSyncBus, KaraokeSyncData } from '../utils/karaokeSync';
import { exportTextAsAudioPodcast } from '../utils/audioPodcastExporter';

export interface KaraokeReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  fullText: string;
  isSpeaking: boolean;
  currentSentence: string;
  currentSentenceIndex: number;
  currentWordIndex: number;
  currentSpokenWord: string;
  currentCharIndex?: number;
  onSpeak: (text: string) => void;
  onSpeakFromSentence?: (sentenceIndex: number) => void;
  onStop: () => void;
  isStreaming: boolean;
  domainLabel?: string;
}

const ACTIVE_WORD_CLASSES = [
  'bg-cyan-400',
  'text-slate-950',
  'font-black',
  'ring-2',
  'ring-cyan-200',
  'scale-110',
  'shadow-[0_0_20px_rgba(6,182,212,1)]',
  'animate-pulse',
  'z-20',
];

const PAST_WORD_CLASSES = ['text-cyan-200/90', 'font-medium'];

const ACTIVE_SENTENCE_CLASSES = [
  'bg-cyan-950/40',
  'border-l-4',
  'border-cyan-400',
  'pl-3.5',
  'shadow-[0_0_24px_rgba(6,182,212,0.18)]',
  'ring-1',
  'ring-cyan-500/30',
];

export const KaraokeReaderModal: React.FC<KaraokeReaderModalProps> = ({
  isOpen,
  onClose,
  fullText,
  isSpeaking,
  currentSentence,
  currentSentenceIndex,
  currentWordIndex,
  currentSpokenWord,
  onSpeak,
  onSpeakFromSentence,
  onStop,
  isStreaming,
  domainLabel = 'Général',
}) => {
  const [viewMode, setViewMode] = useState<'karaoke' | 'markdown'>('karaoke');
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [liveWordDisplay, setLiveWordDisplay] = useState<string>(currentSpokenWord || '');

  // High-speed direct DOM references for 0ms sub-frame rendering
  const wordElementsRef = useRef<Map<string, HTMLSpanElement>>(new Map());
  const sentenceElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const prevActiveKeyRef = useRef<string | null>(null);
  const prevActiveSentenceRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Direct synchronous audio bus subscriber to bypass React render scheduling latency
  const liveSyncRef = useRef<KaraokeSyncData>(karaokeSyncBus.getSnapshot());

  useEffect(() => {
    const unsubscribe = karaokeSyncBus.subscribe((data) => {
      liveSyncRef.current = data;
      if (data.spokenWord) {
        setLiveWordDisplay(data.spokenWord);
      }
    });
    return unsubscribe;
  }, []);

  // Sync state if props change directly
  useEffect(() => {
    if (currentSpokenWord) {
      setLiveWordDisplay(currentSpokenWord);
    }
  }, [currentSpokenWord]);

  // Parse text into structured sentences and words using unified parser
  const { sentences, totalWords } = useMemo(() => {
    return parseDocumentIntoKaraoke(fullText);
  }, [fullText]);

  // ULTRA-HIGH-PRECISION (requestAnimationFrame) SYNCHRONIZATION LOOP
  // Directly updates DOM nodes at display refresh rate (60Hz / 120Hz)
  // as currentSpokenWord and audio boundary change, eliminating any perceived audio-text lag
  useEffect(() => {
    if (!isOpen || viewMode !== 'karaoke') {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    let isRunning = true;

    const tick = () => {
      if (!isRunning) return;

      const busData = liveSyncRef.current;
      const isSpeakingActive = busData.isSpeaking || isSpeaking;
      const activeSIdx = isSpeakingActive
        ? busData.sentenceIndex >= 0
          ? busData.sentenceIndex
          : currentSentenceIndex
        : -1;

      const activeWIdx = isSpeakingActive
        ? busData.wordIndex >= 0
          ? busData.wordIndex
          : currentWordIndex
        : -1;

      const spokenWord = isSpeakingActive
        ? busData.spokenWord || currentSpokenWord
        : '';

      // Determine active word target key by index or direct currentSpokenWord matching
      let targetWordKey: string | null = null;

      if (isSpeakingActive && activeSIdx >= 0) {
        if (activeWIdx >= 0) {
          targetWordKey = `${activeSIdx}-${activeWIdx}`;
        }

        // If direct currentSpokenWord is available, cross-check for absolute acoustic alignment
        if (spokenWord && activeSIdx < sentences.length) {
          const sent = sentences[activeSIdx];
          if (sent && sent.words.length > 0) {
            const cleanSpoken = spokenWord.toLowerCase().replace(/^[^\wÀ-ÿ]+|[^\wÀ-ÿ]+$/gi, '');
            // Check if current targeted word matches, or find closest matching word in active sentence
            const targetedWord = sent.words[activeWIdx];
            if (targetedWord && targetedWord.clean === cleanSpoken) {
              targetWordKey = `${activeSIdx}-${targetedWord.wordIndex}`;
            } else {
              // Direct lookup by currentSpokenWord
              const directMatch = sent.words.find(
                (w) => w.clean === cleanSpoken && Math.abs(w.wordIndex - Math.max(0, activeWIdx)) <= 2
              );
              if (directMatch) {
                targetWordKey = `${activeSIdx}-${directMatch.wordIndex}`;
              }
            }
          }
        }
      }

      // 1. High-precision Sentence container update
      if (activeSIdx !== prevActiveSentenceRef.current) {
        if (prevActiveSentenceRef.current !== null && prevActiveSentenceRef.current >= 0) {
          const prevEl = sentenceElementsRef.current.get(prevActiveSentenceRef.current);
          if (prevEl) {
            prevEl.classList.remove(...ACTIVE_SENTENCE_CLASSES);
            prevEl.classList.add('opacity-90');
          }
        }

        if (activeSIdx >= 0) {
          const newEl = sentenceElementsRef.current.get(activeSIdx);
          if (newEl) {
            newEl.classList.add(...ACTIVE_SENTENCE_CLASSES);
            newEl.classList.remove('opacity-90');
          }
        }

        prevActiveSentenceRef.current = activeSIdx;
      }

      // 2. High-precision Word highlight update
      if (targetWordKey !== prevActiveKeyRef.current) {
        // Deactivate previous active word and mark as read
        if (prevActiveKeyRef.current) {
          const prevEl = wordElementsRef.current.get(prevActiveKeyRef.current);
          if (prevEl) {
            prevEl.classList.remove(...ACTIVE_WORD_CLASSES);
            prevEl.classList.add(...PAST_WORD_CLASSES);
          }
        }

        // Activate current spoken word with zero visual lag
        if (targetWordKey) {
          const newEl = wordElementsRef.current.get(targetWordKey);
          if (newEl) {
            newEl.classList.remove('text-slate-300', ...PAST_WORD_CLASSES);
            newEl.classList.add(...ACTIVE_WORD_CLASSES);

            // High-precision smooth viewport auto-scroll
            if (autoScroll) {
              newEl.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest',
              });
            }
          }
        }

        prevActiveKeyRef.current = targetWordKey;
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      isRunning = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [
    isOpen,
    viewMode,
    autoScroll,
    sentences,
    isSpeaking,
    currentSentenceIndex,
    currentWordIndex,
    currentSpokenWord,
  ]);

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
              <p className="text-[11px] text-slate-400 font-mono truncate flex items-center gap-1.5">
                {isSpeaking ? (
                  <>
                    <Zap className="w-3 h-3 text-cyan-400 animate-pulse" />
                    <span>Synchronisation haute précision (requestAnimationFrame 0ms)</span>
                  </>
                ) : (
                  <span>Document complet • Cliquez sur « Écouter » pour lancer la lecture</span>
                )}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* View Mode Switcher */}
            <div className="hidden sm:flex items-center bg-slate-800/80 p-0.5 rounded-xl border border-slate-700/60 text-xs mr-1">
              <button
                type="button"
                onClick={() => setViewMode('karaoke')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
                  viewMode === 'karaoke'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Karaoké</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('markdown')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
                  viewMode === 'markdown'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Formaté</span>
              </button>
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
                title="Lancer la lecture vocale avec suivi Karaoké"
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

        {/* Live Karaoke Status Ticker */}
        {viewMode === 'karaoke' && (
          <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2 min-w-0">
              {isSpeaking ? (
                <>
                  <span className="flex items-center gap-1 text-cyan-400 font-bold shrink-0">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping inline-block" />
                    <span>EN COURS :</span>
                  </span>
                  <span className="text-slate-300 truncate">
                    {liveWordDisplay ? (
                      <span className="px-2 py-0.5 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 font-bold transition-all">
                        « {liveWordDisplay} »
                      </span>
                    ) : (
                      'Lecture en cours...'
                    )}
                  </span>
                </>
              ) : (
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Mode Karaoké haute précision actif • Cliquez sur « Écouter »</span>
                </span>
              )}
            </div>

            {/* Auto scroll toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setAutoScroll(!autoScroll)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                  autoScroll
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
                title="Active ou désactive le défilement automatique vers le mot en cours"
              >
                Auto-scroll {autoScroll ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        )}

        {/* Body Content */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto p-4 sm:p-6 text-slate-200 leading-relaxed font-sans select-text scroll-smooth"
        >
          {viewMode === 'karaoke' ? (
            <div className="space-y-4 max-w-none">
              {sentences.map((sentence, sIdx) => {
                const isSentenceActive = isSpeaking && sIdx === currentSentenceIndex;
                const isSentencePast = isSpeaking && sIdx < currentSentenceIndex;

                const handleSentenceClick = () => {
                  if (onSpeakFromSentence) {
                    onSpeakFromSentence(sentence.sentenceIndex);
                  } else {
                    onSpeak(sentence.spokenText);
                  }
                };

                return (
                  <div
                    key={`sentence-${sentence.sentenceIndex}`}
                    ref={(el) => {
                      if (el) sentenceElementsRef.current.set(sIdx, el);
                      else sentenceElementsRef.current.delete(sIdx);
                    }}
                    onClick={handleSentenceClick}
                    className={`group relative p-3 rounded-2xl transition-all duration-150 cursor-pointer ${
                      isSentenceActive
                        ? 'bg-cyan-950/40 border-l-4 border-cyan-400 pl-3.5 shadow-[0_0_24px_rgba(6,182,212,0.18)] ring-1 ring-cyan-500/30'
                        : isSentencePast
                        ? 'hover:bg-slate-800/40 opacity-90'
                        : 'hover:bg-slate-800/30'
                    }`}
                    title="Cliquer pour faire lire cette phrase par SADIO"
                  >
                    <div className="text-sm sm:text-base leading-relaxed flex flex-wrap items-baseline">
                      {sentence.words.map((word, wIdx) => {
                        const wordKey = `${sIdx}-${word.wordIndex}`;
                        const isWordActive = isSentenceActive && word.wordIndex === currentWordIndex;
                        const isWordPast =
                          isSentencePast || (isSentenceActive && word.wordIndex < currentWordIndex);

                        // Punctuation and spacing trailing this word
                        const nextWord = sentence.words[wIdx + 1];
                        const trailing = nextWord
                          ? sentence.spokenText.slice(word.charEnd, nextWord.charStart)
                          : sentence.spokenText.slice(word.charEnd);

                        return (
                          <React.Fragment key={`w-${sentence.sentenceIndex}-${word.wordIndex}`}>
                            <span
                              ref={(el) => {
                                if (el) wordElementsRef.current.set(wordKey, el);
                                else wordElementsRef.current.delete(wordKey);
                              }}
                              className={`relative inline-block px-1 py-0.5 rounded transition-all duration-75 ${
                                isWordActive
                                  ? 'bg-cyan-400 text-slate-950 font-black ring-2 ring-cyan-200 scale-110 shadow-[0_0_20px_rgba(6,182,212,1)] animate-pulse z-20'
                                  : isWordPast
                                  ? 'text-cyan-200/90 font-medium'
                                  : 'text-slate-300 hover:text-white'
                              }`}
                            >
                              {word.text}
                            </span>
                            {trailing && (
                              <span
                                className={
                                  isWordPast
                                    ? 'text-cyan-300/70 whitespace-pre'
                                    : 'text-slate-400 whitespace-pre'
                                }
                              >
                                {trailing}
                              </span>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Markdown Formatted View */
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
          )}
        </div>

        {/* Bottom Footer Info Bar */}
        <div className="px-4 py-2.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>Total : {totalWords} mots • {sentences.length} phrases</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-slate-500">
              Cliquez sur une phrase pour la réécouter
            </span>
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
    </div>
  );
};

export default KaraokeReaderModal;
