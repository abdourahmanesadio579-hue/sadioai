import { useState, useEffect, useRef, useCallback } from 'react';
import { safeStorage } from '../utils/storage';

// Clean markdown, symbols, emojis, and formatting to create crystal-clear spoken French without reading special characters
export function cleanTextForSpeech(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Code blocks -> friendly spoken announcement
  cleaned = cleaned.replace(/```[a-zA-Z]*[\s\S]*?```/g, ' Voici le code correspondant affiché dans le message. ');
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // 2. Links [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 3. Strip all emojis and pictographs so mobile synthesizers don't read them out loud
  // (Prevents phones from saying "Main qui fait un signe de la main", "Visage souriant", "Robot", "Étincelles")
  cleaned = cleaned
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/[\u{1F700}-\u{1F77F}]/gu, '')
    .replace(/[\u{1F780}-\u{1F7FF}]/gu, '')
    .replace(/[\u{1F800}-\u{1F8FF}]/gu, '')
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '');
  try {
    cleaned = cleaned.replace(/\p{Extended_Pictographic}/gu, '');
  } catch {
    // fallback above
  }

  // 4. Mathematical expressions & powers before removing symbols
  cleaned = cleaned.replace(/(\w+)\^2\b/g, '$1 au carré');
  cleaned = cleaned.replace(/(\w+)\^3\b/g, '$1 au cube');
  cleaned = cleaned.replace(/(\w+)\^(\w+)/g, '$1 puissance $2');
  cleaned = cleaned.replace(/(\d+)\s*\*\s*(\d+)/g, '$1 fois $2');
  cleaned = cleaned.replace(/(\d+)\s*\/\s*(\d+)/g, '$1 sur $2');
  cleaned = cleaned.replace(/&/g, ' et ');
  cleaned = cleaned.replace(/%/g, ' pour cent ');

  // 5. Common unit abbreviations for natural spoken French
  cleaned = cleaned.replace(/(\d+)\s*km\b/gi, '$1 kilomètres');
  cleaned = cleaned.replace(/(\d+)\s*kg\b/gi, '$1 kilogrammes');
  cleaned = cleaned.replace(/(\d+)\s*cm\b/gi, '$1 centimètres');
  cleaned = cleaned.replace(/(\d+)\s*mm\b/gi, '$1 millimètres');
  cleaned = cleaned.replace(/(\d+)\s*ms\b/gi, '$1 millisecondes');

  // 6. Currency vs LaTeX math dollar/euro signs ($15 or 15$)
  cleaned = cleaned.replace(/\$\s*(\d+(?:[.,]\d+)?)/g, '$1 dollars');
  cleaned = cleaned.replace(/(\d+(?:[.,]\d+)?)\s*\$/g, '$1 dollars');
  cleaned = cleaned.replace(/€\s*(\d+(?:[.,]\d+)?)/g, '$1 euros');
  cleaned = cleaned.replace(/(\d+(?:[.,]\d+)?)\s*€/g, '$1 euros');
  cleaned = cleaned.replace(/[$€]/g, '');

  // 7. Headings (#, ##, ###)
  cleaned = cleaned.replace(/#{1,6}\s*(.*)/g, '$1. ');

  // 8. Bold, italics, and strikethrough markdown
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
  cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1');
  cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1');

  // 9. Bullet lists and numbering
  cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, ' ');
  cleaned = cleaned.replace(/^[\s]*(\d+)\.\s+/gm, '$1. ');

  // 10. Horizontal rules and table pipes
  cleaned = cleaned.replace(/---+|===+/g, ' ');
  cleaned = cleaned.replace(/\|/g, ' ');

  // 11. Arrow symbols
  cleaned = cleaned.replace(/->|→|⇒/g, ' mène à ');
  cleaned = cleaned.replace(/<-|←|⇐/g, ' provient de ');

  // 12. Quotation marks and parentheses: replace with natural pauses rather than spoken punctuation
  // (Prevents synthesizer from saying "guillemet", "parenthèse ouvrante", etc.)
  cleaned = cleaned.replace(/[«»"“”„]/g, ' ');
  cleaned = cleaned.replace(/\s*\(\s*/g, ', ');
  cleaned = cleaned.replace(/\s*\)\s*/g, ', ');

  // 13. ELIMINATE ALL REMAINING SPECIAL SYMBOLS that speech synthesizers enounce out loud
  // Specifically: * (astérisque), # (dièse), _ (souligné), ~ (tilde), ^ (chapeau),
  // \ (antislash), { } [ ] < > ` | @ =
  cleaned = cleaned.replace(/[*#_~^\\{}[\]<>`|@=]/g, ' ');

  // 11. Normalize spaces and punctuation for natural speech cadence
  cleaned = cleaned
    .replace(/\s*([,.;:!?])\s*/g, '$1 ')
    .replace(/([,.;:!?]){2,}/g, '$1')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned;
}

// Split text into natural, melodic French sentences with human cadence
export function splitIntoSentences(text: string, maxChunkLength = 140): string[] {
  // Avoid splitting inside numbers like 3.14 or abbreviations
  const rawSentences = text.match(/[^.!?…\n]+(?:(?<!\d)[.!?…]+(?!\d)|$)/g);
  if (!rawSentences) return [text.trim()];

  const sentences = rawSentences
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length <= 1) return sentences;

  const passages: string[] = [];
  let currentPassage = '';

  for (const sentence of sentences) {
    if (!currentPassage) {
      currentPassage = sentence;
    } else if (currentPassage.length + 1 + sentence.length <= maxChunkLength) {
      currentPassage += ' ' + sentence;
    } else {
      passages.push(currentPassage);
      currentPassage = sentence;
    }
  }

  if (currentPassage) {
    passages.push(currentPassage);
  }

  return passages;
}

// Unlock audio context and prime speech synthesis pipeline silently without acoustic artifacts
export function unlockAudioContext(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      // 1-sample silent buffer primes iOS Safari & Android audio output hardware cleanly without any beep sound
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    }
  } catch (e) {
    // AudioContext unlock optional
  }

  // Resume speech synthesis if paused
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }
  } catch (e) {
    // ignore
  }
}

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoicing, setIsVoicing] = useState(false);
  const [mouthOpenLevel, setMouthOpenLevel] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [currentSentence, setCurrentSentence] = useState<string>('');
  const [speechError, setSpeechError] = useState<string | null>(null);

  // Natural French rhythm (1.0x standard tempo for optimal acoustic fidelity and zero resampling distortion)
  const [speechRate, setSpeechRateState] = useState<number>(() => {
    try {
      const saved = safeStorage.getItem('sadio_speech_rate_v2');
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0.75 && parsed <= 1.3) return parsed;
      }
      return 1.0;
    } catch {
      return 1.0;
    }
  });
  const speechRateRef = useRef<number>(speechRate);

  const [speechPitch, setSpeechPitchState] = useState<number>(() => {
    try {
      const saved = safeStorage.getItem('sadio_speech_pitch_v2');
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0.8 && parsed <= 1.2) return parsed;
      }
      return 1.0;
    } catch {
      return 1.0;
    }
  });
  const speechPitchRef = useRef<number>(speechPitch);

  const synthRef = useRef<SpeechSynthesis | null>(null);
  const queueRef = useRef<string[]>([]);
  const isCanceledRef = useRef<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);
  const isStreamingEndedRef = useRef<boolean>(true);
  const isAudioHeldRef = useRef<boolean>(false);
  const audioHoldTimerRef = useRef<number | null>(null);
  const onStartPlaybackRef = useRef<(() => void) | null>(null);
  const onEndCallbackRef = useRef<(() => void) | null>(null);
  const activeUtterancesRef = useRef<SpeechSynthesisUtterance[]>([]);
  const watchdogTimerRef = useRef<number | null>(null);

  const isVoicingRef = useRef<boolean>(false);
  const mouthOpenRef = useRef<number>(0);
  const lastWordBoundaryRef = useRef<number>(0);
  const speechAnimFrameRef = useRef<number | null>(null);

  // High-precision lip and vocal articulation animation loop synchronized to utterance voicing
  useEffect(() => {
    isVoicingRef.current = isVoicing;

    if (isVoicing) {
      const step = (now: number) => {
        if (isVoicingRef.current) {
          // Conversational syllable cadence (~4.2 Hz) modulated by word boundaries
          const timeSinceWord = (now - lastWordBoundaryRef.current) / 1000;
          const syllableOsc = Math.sin(now * 0.024);
          const secondaryOsc = Math.cos(now * 0.015);

          // Dynamic opening on words, alternating vowels and consonants
          const wordPulse = Math.max(0, 1 - timeSinceWord * 3.5);
          const rawTarget = 0.35 + 0.35 * Math.abs(syllableOsc) + 0.2 * Math.abs(secondaryOsc) + 0.15 * wordPulse;
          const targetOpen = Math.min(1, Math.max(0.12, rawTarget));

          mouthOpenRef.current += (targetOpen - mouthOpenRef.current) * 0.35;
          setMouthOpenLevel(mouthOpenRef.current);

          speechAnimFrameRef.current = requestAnimationFrame(step);
        } else {
          // Rapid organic closure when voice pauses or stops
          mouthOpenRef.current += (0 - mouthOpenRef.current) * 0.45;
          if (mouthOpenRef.current < 0.01) {
            mouthOpenRef.current = 0;
            setMouthOpenLevel(0);
            speechAnimFrameRef.current = null;
          } else {
            setMouthOpenLevel(mouthOpenRef.current);
            speechAnimFrameRef.current = requestAnimationFrame(step);
          }
        }
      };

      speechAnimFrameRef.current = requestAnimationFrame(step);
    } else {
      mouthOpenRef.current = 0;
      setMouthOpenLevel(0);
      if (speechAnimFrameRef.current) {
        cancelAnimationFrame(speechAnimFrameRef.current);
        speechAnimFrameRef.current = null;
      }
    }

    return () => {
      if (speechAnimFrameRef.current) {
        cancelAnimationFrame(speechAnimFrameRef.current);
        speechAnimFrameRef.current = null;
      }
    };
  }, [isVoicing]);

  // Initialize and load voices
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const synth = window.speechSynthesis;
      synthRef.current = synth;
      setIsSupported(true);

      const updateVoices = () => {
        const voices = synth.getVoices();
        if (voices.length > 0) {
          // Strictly detect genuine French voices (fr-FR, fr_FR, fra, fre, French, Français)
          // Exclude foreign language voices that merely contain "french" in their name (e.g. English voices with French accent)
          const genuineFrenchVoices = voices.filter((v) => {
            const lang = (v.lang || '').toLowerCase().replace('_', '-');
            if (
              lang.startsWith('en') ||
              lang.startsWith('es') ||
              lang.startsWith('de') ||
              lang.startsWith('it') ||
              lang.startsWith('pt') ||
              lang.startsWith('zh') ||
              lang.startsWith('ja') ||
              lang.startsWith('ar')
            ) {
              return false;
            }
            if (lang.startsWith('fr') || lang.startsWith('fra') || lang.startsWith('fre')) {
              return true;
            }
            const name = (v.name || '').toLowerCase();
            return !lang && (name.includes('français') || name.includes('francais'));
          });

          // Only expose genuine French voices to availableVoices
          setAvailableVoices(genuineFrenchVoices.length > 0 ? genuineFrenchVoices : []);

          let bestVoice: SpeechSynthesisVoice | null = null;

          // Check if user previously saved a preferred voice in Settings
          const savedVoiceName = safeStorage.getItem('sadio_voice_name_v2');
          if (savedVoiceName && genuineFrenchVoices.length > 0) {
            bestVoice = genuineFrenchVoices.find((v) => v.name === savedVoiceName) || null;
          }

          if (!bestVoice && genuineFrenchVoices.length > 0) {
            // Priority to Standard France French (fr-FR) over Canadian (fr-CA) or regional dialects
            const frFrVoices = genuineFrenchVoices.filter((v) => {
              const lang = (v.lang || '').toLowerCase().replace('_', '-');
              return lang.startsWith('fr-fr') || lang === 'fr';
            });
            const voicesToSearch = frFrVoices.length > 0 ? frFrVoices : genuineFrenchVoices;

            // Rank 1: High definition Google French (Android/Chrome flagship) & Apple Enhanced/Natural/Premium (iOS)
            bestVoice =
              voicesToSearch.find((v) => {
                const n = v.name.toLowerCase();
                return (
                  n.includes('google français') ||
                  n.includes('google francais') ||
                  (n.includes('google') && n.includes('fr')) ||
                  n.includes('network') || // High-definition Android Google neural network voice (e.g. fr-fr-x-fra-network)
                  n.includes('enhanced') || // High-definition Apple iOS neural voice
                  n.includes('premium') ||
                  n.includes('natural') ||
                  n.includes('neural') ||
                  n.includes('wavenet') ||
                  n.includes('siri')
                );
              }) ||
              // Rank 2: High quality named human France voices (Thomas, Audrey, Aurélie, Nicolas) without "(compact)" or "(local)"
              voicesToSearch.find((v) => {
                const n = v.name.toLowerCase();
                const isNamed =
                  n.includes('thomas') ||
                  n.includes('audrey') ||
                  n.includes('aurelie') ||
                  n.includes('aurélie') ||
                  n.includes('nicolas') ||
                  n.includes('hortense') ||
                  n.includes('paul') ||
                  n.includes('julie');
                return isNamed && !n.includes('compact') && !n.includes('local');
              }) ||
              // Rank 3: Any non-compact fr-FR voice
              voicesToSearch.find((v) => {
                const n = v.name.toLowerCase();
                return !n.includes('compact') && !n.includes('local');
              }) ||
              // Rank 4: Standard fr-FR voice
              frFrVoices[0] ||
              // Rank 5: Any French voice
              genuineFrenchVoices[0];
          }

          // If no French voice was reported by getVoices(), leave as null so the OS TTS engine
          // synthesizes using its default French model based on utterance.lang = 'fr-FR'.
          setSelectedVoice(bestVoice);
        }
      };

      updateVoices();
      synth.onvoiceschanged = updateVoices;

      const timer = setTimeout(updateVoices, 300);

      return () => {
        clearTimeout(timer);
        synth.cancel();
      };
    } else {
      setIsSupported(false);
    }
  }, []);

  // Periodic watchdog to unpause Chrome SpeechSynthesis if it stalls
  useEffect(() => {
    if (isSpeaking && !isPaused) {
      watchdogTimerRef.current = window.setInterval(() => {
        if (synthRef.current && synthRef.current.paused) {
          synthRef.current.resume();
        }
      }, 3000);
    } else if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }

    return () => {
      if (watchdogTimerRef.current) {
        clearInterval(watchdogTimerRef.current);
      }
    };
  }, [isSpeaking, isPaused]);

  const stop = useCallback(() => {
    isCanceledRef.current = true;
    isPlayingRef.current = false;
    isStreamingEndedRef.current = true;
    isAudioHeldRef.current = false;
    isVoicingRef.current = false;
    setIsVoicing(false);
    mouthOpenRef.current = 0;
    setMouthOpenLevel(0);
    if (audioHoldTimerRef.current) {
      clearTimeout(audioHoldTimerRef.current);
      audioHoldTimerRef.current = null;
    }
    queueRef.current = [];
    activeUtterancesRef.current = [];
    if (synthRef.current) {
      synthRef.current.cancel();
      try {
        if (synthRef.current.paused) {
          synthRef.current.resume();
        }
      } catch (e) {
        // ignore
      }
    }
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentSentence('');
    setSpeechError(null);
    if (onEndCallbackRef.current) {
      onEndCallbackRef.current();
      onEndCallbackRef.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    if (synthRef.current && isSpeaking && !isPaused) {
      synthRef.current.pause();
      isVoicingRef.current = false;
      setIsVoicing(false);
      setIsPaused(true);
    }
  }, [isSpeaking, isPaused]);

  const resume = useCallback(() => {
    if (synthRef.current && isPaused) {
      synthRef.current.resume();
      isVoicingRef.current = true;
      setIsVoicing(true);
      lastWordBoundaryRef.current = performance.now();
      setIsPaused(false);
    }
  }, [isPaused]);

  // Play next sentence from queue cleanly one utterance at a time
  const playNextInQueue = useCallback(() => {
    if (isCanceledRef.current || !synthRef.current) {
      isPlayingRef.current = false;
      isVoicingRef.current = false;
      setIsVoicing(false);
      setIsSpeaking(false);
      setCurrentSentence('');
      return;
    }

    // Strictly process one utterance at a time to prevent audio glitching and bizarre voice overlaps on mobile
    if (activeUtterancesRef.current.length > 0) {
      return;
    }

    if (queueRef.current.length === 0) {
      isPlayingRef.current = false;
      isVoicingRef.current = false;
      setIsVoicing(false);
      if (isStreamingEndedRef.current) {
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentSentence('');
        if (onEndCallbackRef.current) {
          onEndCallbackRef.current();
          onEndCallbackRef.current = null;
        }
      }
      return;
    }

    const nextText = queueRef.current.shift()!;
    isPlayingRef.current = true;
    setCurrentSentence(nextText);
    setIsSpeaking(true);

    if (synthRef.current.paused) {
      synthRef.current.resume();
    }

    const utterance = new SpeechSynthesisUtterance(nextText);
    utterance.lang = selectedVoice?.lang || 'fr-FR';
    utterance.rate = speechRateRef.current || 1.0;
    utterance.pitch = speechPitchRef.current || 1.0;
    utterance.volume = 1.0;

    // Only assign selectedVoice if it is a validated French voice
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    // Strong window reference to prevent mobile garbage collector from reaping active utterance
    if (typeof window !== 'undefined') {
      const win = window as any;
      win.__activeSpeechUtterances = win.__activeSpeechUtterances || [];
      win.__activeSpeechUtterances.push(utterance);
    }

    activeUtterancesRef.current = [utterance];

    utterance.onstart = () => {
      isVoicingRef.current = true;
      setIsVoicing(true);
      setIsSpeaking(true);
      setIsPaused(false);
      setSpeechError(null);
      setCurrentSentence(nextText);
      lastWordBoundaryRef.current = performance.now();
      if (onStartPlaybackRef.current) {
        onStartPlaybackRef.current();
        onStartPlaybackRef.current = null;
      }
    };

    utterance.onboundary = (e) => {
      if (e.name === 'word') {
        lastWordBoundaryRef.current = performance.now();
      }
    };

    utterance.onend = () => {
      activeUtterancesRef.current = [];
      if (typeof window !== 'undefined') {
        const win = window as any;
        if (win.__activeSpeechUtterances) {
          win.__activeSpeechUtterances = win.__activeSpeechUtterances.filter(
            (u: any) => u !== utterance
          );
        }
      }

      if (queueRef.current.length === 0) {
        isVoicingRef.current = false;
        setIsVoicing(false);
        mouthOpenRef.current = 0;
        setMouthOpenLevel(0);
      }

      // Immediately play next queued sentence
      if (!isCanceledRef.current) {
        playNextInQueue();
      }

      if (queueRef.current.length === 0 && isStreamingEndedRef.current) {
        isPlayingRef.current = false;
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentSentence('');
        if (onEndCallbackRef.current) {
          onEndCallbackRef.current();
          onEndCallbackRef.current = null;
        }
      }
    };

    utterance.onpause = () => {
      isVoicingRef.current = false;
      setIsVoicing(false);
      setIsPaused(true);
    };

    utterance.onresume = () => {
      isVoicingRef.current = true;
      setIsVoicing(true);
      setIsPaused(false);
      lastWordBoundaryRef.current = performance.now();
    };

    utterance.onerror = (e) => {
      activeUtterancesRef.current = [];
      if (typeof window !== 'undefined') {
        const win = window as any;
        if (win.__activeSpeechUtterances) {
          win.__activeSpeechUtterances = win.__activeSpeechUtterances.filter(
            (u: any) => u !== utterance
          );
        }
      }
      if (queueRef.current.length === 0) {
        isVoicingRef.current = false;
        setIsVoicing(false);
        mouthOpenRef.current = 0;
        setMouthOpenLevel(0);
      }
      console.warn('SpeechSynthesis error event:', e);

      if (e.error === 'not-allowed') {
        setSpeechError("L'audio a été bloqué par le navigateur. Cliquez sur l'écran pour autoriser le son.");
        isPlayingRef.current = false;
        setIsSpeaking(false);
        setCurrentSentence('');
      } else if (e.error !== 'interrupted' && e.error !== 'canceled') {
        playNextInQueue();
      } else {
        isPlayingRef.current = false;
      }
    };

    try {
      if (synthRef.current.paused) {
        synthRef.current.resume();
      }
      synthRef.current.speak(utterance);
      if (synthRef.current.paused) {
        synthRef.current.resume();
      }
    } catch (err) {
      console.error('Error invoking synth.speak:', err);
    }
  }, [selectedVoice]);

  // Real-time progressive streaming speech - INSTANT, starts speaking immediately!
  const startStreamingSpeech = useCallback(
    (onStartPlayback?: () => void) => {
      if (!synthRef.current) return;
      unlockAudioContext();
      if (synthRef.current.paused) {
        synthRef.current.resume();
      }
      isCanceledRef.current = false;
      isStreamingEndedRef.current = false;
      isPlayingRef.current = false;
      isAudioHeldRef.current = false;
      queueRef.current = [];
      activeUtterancesRef.current = [];

      try {
        if (synthRef.current.speaking || synthRef.current.paused) {
          synthRef.current.cancel();
          synthRef.current.resume();
        }
      } catch (e) {
        // ignore
      }

      if (audioHoldTimerRef.current) {
        clearTimeout(audioHoldTimerRef.current);
        audioHoldTimerRef.current = null;
      }

      onStartPlaybackRef.current = onStartPlayback || null;
    },
    [playNextInQueue]
  );

  const enqueueStreamingSentence = useCallback(
    (sentence: string) => {
      if (isCanceledRef.current || !synthRef.current || !voiceEnabled) return;

      const cleaned = cleanTextForSpeech(sentence);
      if (!cleaned || cleaned.length < 2) return;

      // Ensure each sentence or clause has clean punctuation for natural vocal cadence
      const formatted = /[.!?…,:;]$/.test(cleaned) ? cleaned : `${cleaned}.`;
      queueRef.current.push(formatted);

      setIsSpeaking(true);
      if (!isPlayingRef.current && onStartPlaybackRef.current) {
        onStartPlaybackRef.current();
        onStartPlaybackRef.current = null;
      }
      // Trigger playNextInQueue so that the browser native speech queue pre-buffers the next sentence
      playNextInQueue();
    },
    [voiceEnabled, playNextInQueue]
  );

  const finishStreamingSpeech = useCallback(
    (remainingText?: string, onEnd?: () => void) => {
      isStreamingEndedRef.current = true;
      onEndCallbackRef.current = onEnd || null;

      if (remainingText) {
        const cleaned = cleanTextForSpeech(remainingText);
        if (cleaned && cleaned.length >= 2) {
          const formatted = /[.!?…,:;]$/.test(cleaned) ? cleaned : `${cleaned}.`;
          queueRef.current.push(formatted);
        }
      }

      if (!isPlayingRef.current && queueRef.current.length > 0) {
        playNextInQueue();
      } else if (!isPlayingRef.current && queueRef.current.length === 0) {
        setIsSpeaking(false);
        setCurrentSentence('');
        if (onEndCallbackRef.current) {
          onEndCallbackRef.current();
          onEndCallbackRef.current = null;
        }
      }
    },
    [playNextInQueue]
  );

  // Play full text at once (for "Écouter" button on message history)
  const speak = useCallback(
    (rawText: string, _lang = 'fr-FR', onEnd?: () => void) => {
      if (!synthRef.current) {
        onEnd?.();
        return;
      }

      unlockAudioContext();

      if (synthRef.current.paused) {
        synthRef.current.resume();
      }

      if (synthRef.current.speaking || synthRef.current.pending) {
        try {
          synthRef.current.cancel();
        } catch {
          // ignore
        }
      }
      isCanceledRef.current = false;
      isPlayingRef.current = false;
      isStreamingEndedRef.current = true;
      queueRef.current = [];
      activeUtterancesRef.current = [];

      const cleaned = cleanTextForSpeech(rawText);
      if (!cleaned) {
        onEnd?.();
        return;
      }

      const sentences = splitIntoSentences(cleaned);
      if (sentences.length === 0) {
        onEnd?.();
        return;
      }

      // Direct synchronous execution within the user gesture chain (no setTimeout to prevent iOS Safari from blocking playback)
      isCanceledRef.current = false;
      isPlayingRef.current = false;
      isStreamingEndedRef.current = true;
      onEndCallbackRef.current = onEnd || null;
      queueRef.current = [...sentences];
      setIsSpeaking(true);
      setIsPaused(false);
      setSpeechError(null);

      playNextInQueue();
    },
    [playNextInQueue]
  );

  const setSpeechRate = useCallback((newRate: number) => {
    const rate = Math.max(0.75, Math.min(1.3, newRate));
    speechRateRef.current = rate;
    setSpeechRateState(rate);
    safeStorage.setItem('sadio_speech_rate_v2', rate.toString());
  }, []);

  const setSpeechPitch = useCallback((newPitch: number) => {
    const pitch = Math.max(0.8, Math.min(1.2, newPitch));
    speechPitchRef.current = pitch;
    setSpeechPitchState(pitch);
    safeStorage.setItem('sadio_speech_pitch_v2', pitch.toString());
  }, []);

  const setSelectedVoiceAndPersist = useCallback((voice: SpeechSynthesisVoice | null) => {
    setSelectedVoice(voice);
    if (voice) {
      safeStorage.setItem('sadio_voice_name_v2', voice.name);
      safeStorage.setItem('sadio_voice_lang_v2', voice.lang);
    } else {
      safeStorage.removeItem('sadio_voice_name_v2');
      safeStorage.removeItem('sadio_voice_lang_v2');
    }
  }, []);

  const testVoice = useCallback(() => {
    unlockAudioContext();
    speak("Bonjour ! Je suis Sadio. Ma voix est désormais claire, fluide et naturelle.");
  }, [speak]);

  return {
    isSpeaking,
    isVoicing,
    mouthOpenLevel,
    isPaused,
    isSupported,
    voiceEnabled,
    setVoiceEnabled,
    speechRate,
    setSpeechRate,
    speechPitch,
    setSpeechPitch,
    availableVoices,
    selectedVoice,
    setSelectedVoice: setSelectedVoiceAndPersist,
    currentSentence,
    speechError,
    startStreamingSpeech,
    enqueueStreamingSentence,
    finishStreamingSpeech,
    speak,
    pause,
    resume,
    stop,
    testVoice,
    unlockAudioContext,
  };
}
