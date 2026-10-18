import { useState, useEffect, useRef, useCallback } from 'react';
import { safeStorage } from '../utils/storage';

// Clean markdown and formatting to create crystal-clear spoken French without reading special characters
export function cleanTextForSpeech(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Code blocks -> friendly spoken announcement
  cleaned = cleaned.replace(/```[a-zA-Z]*[\s\S]*?```/g, ' Voici le code correspondant affiché dans le message. ');
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // 2. Links [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 3. Mathematical expressions & powers before removing symbols
  cleaned = cleaned.replace(/(\w+)\^2\b/g, '$1 au carré');
  cleaned = cleaned.replace(/(\w+)\^3\b/g, '$1 au cube');
  cleaned = cleaned.replace(/(\w+)\^(\w+)/g, '$1 puissance $2');
  cleaned = cleaned.replace(/(\d+)\s*\*\s*(\d+)/g, '$1 fois $2');
  cleaned = cleaned.replace(/(\d+)\s*\/\s*(\d+)/g, '$1 sur $2');
  cleaned = cleaned.replace(/&/g, ' et ');
  cleaned = cleaned.replace(/%/g, ' pour cent ');

  // 4. Currency vs LaTeX math dollar signs ($15^2 = 225$ or $100)
  cleaned = cleaned.replace(/\$\s*(\d+(?:[.,]\d+)?)/g, '$1 dollars');
  cleaned = cleaned.replace(/(\d+(?:[.,]\d+)?)\s*\$/g, '$1 dollars');
  // Strip all remaining dollar signs used as math/formula delimiters
  cleaned = cleaned.replace(/\$/g, '');

  // 5. Headings (#, ##, ###)
  cleaned = cleaned.replace(/#{1,6}\s*(.*)/g, '$1. ');

  // 6. Bold, italics, and strikethrough markdown
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
  cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1');
  cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1');

  // 7. Bullet lists and numbering
  cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, ' ');
  cleaned = cleaned.replace(/^[\s]*(\d+)\.\s+/gm, '$1. ');

  // 8. Horizontal rules and table pipes
  cleaned = cleaned.replace(/---+|===+/g, ' ');
  cleaned = cleaned.replace(/\|/g, ' ');

  // 9. Arrow symbols
  cleaned = cleaned.replace(/->|→|⇒/g, ' mène à ');
  cleaned = cleaned.replace(/<-|←|⇐/g, ' provient de ');

  // 10. ELIMINATE ALL REMAINING SPECIAL SYMBOLS that speech synthesizers enounce out loud
  // Specifically: * (astérisque), $ (dollar), # (dièse), _ (souligné), ~ (tilde), ^ (chapeau),
  // \ (antislash), { } [ ] < > ` | @
  cleaned = cleaned.replace(/[*#_~^\\{}[\]<>`|@]/g, ' ');

  // 11. Normalize spaces and punctuation for natural speech cadence
  cleaned = cleaned
    .replace(/\s*([,.;:!?])\s*/g, '$1 ')
    .replace(/([,.;:!?]){2,}/g, '$1')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned;
}

// Split text into natural, cohesive speech passages (up to ~320 chars) keeping sentences intact.
// Periods (.) inside a passage produce only a light, natural breath pause (~180ms)
// instead of causing the browser audio engine to halt and create a long silence.
export function splitIntoSentences(text: string, maxChunkLength = 320): string[] {
  // Avoid splitting inside numbers like 3.14 or abbreviations
  const rawSentences = text.match(/[^.!?…]+(?:(?<!\d)[.!?…]+(?!\d)|$)/g);
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

// Play a subtle cybernetic audio beep via Web Audio API and prime speech synthesis pipeline synchronously
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
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    }
  } catch (e) {
    // AudioContext unlock optional
  }

  // Prime speech synthesis synchronously within this user gesture on mobile browsers
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      const prime = new SpeechSynthesisUtterance(' ');
      prime.volume = 0.01;
      prime.rate = 1.0;
      prime.lang = 'fr-FR';
      window.speechSynthesis.speak(prime);
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

  // Speech rate set to 1.0x standard rate
  const [speechRate] = useState<number>(1.0);
  const speechRateRef = useRef<number>(1.0);

  useEffect(() => {
    safeStorage.removeItem('robo_omni_speech_rate');
  }, []);

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
          setAvailableVoices(voices);

          // Find French voices
          const frenchVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('fr'));

          // Choose the most natural sounding voice available
          const bestVoice =
            frenchVoices.find(
              (v) =>
                v.name.includes('Google') ||
                v.name.includes('Natural') ||
                v.name.includes('Premium')
            ) ||
            frenchVoices.find(
              (v) =>
                v.name.includes('Thomas') ||
                v.name.includes('Amélie') ||
                v.name.includes('Audrey') ||
                v.name.includes('Céline')
            ) ||
            frenchVoices[0] ||
            voices.find((v) => v.default) ||
            voices[0] ||
            null;

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

  // Play next sentence from queue with native pipeline pre-buffering
  const playNextInQueue = useCallback(() => {
    if (isCanceledRef.current || !synthRef.current) {
      isPlayingRef.current = false;
      isVoicingRef.current = false;
      setIsVoicing(false);
      setIsSpeaking(false);
      setCurrentSentence('');
      return;
    }

    // Keep up to 2 utterances active in the browser's speech synthesis queue (1 currently playing + 1 pre-buffered)
    // This allows the browser audio engine to transition without any teardown delay, producing only a light, natural pause at '.'
    while (queueRef.current.length > 0 && activeUtterancesRef.current.length < 2) {
      const nextText = queueRef.current.shift()!;
      isPlayingRef.current = true;
      setCurrentSentence(nextText);
      setIsSpeaking(true);

      if (synthRef.current.paused) {
        synthRef.current.resume();
      }

      const utterance = new SpeechSynthesisUtterance(nextText);
      utterance.lang = selectedVoice?.lang || 'fr-FR';
      utterance.rate = speechRateRef.current;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      // Strong window reference to prevent mobile garbage collector from reaping active utterance
      if (typeof window !== 'undefined') {
        const win = window as any;
        win.__activeSpeechUtterances = win.__activeSpeechUtterances || [];
        win.__activeSpeechUtterances.push(utterance);
      }

      activeUtterancesRef.current.push(utterance);

      let didStart = false;
      let freezeWatchdog: ReturnType<typeof setTimeout> | null = null;

      utterance.onstart = () => {
        didStart = true;
        if (freezeWatchdog) {
          clearTimeout(freezeWatchdog);
          freezeWatchdog = null;
        }
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
        if (freezeWatchdog) {
          clearTimeout(freezeWatchdog);
          freezeWatchdog = null;
        }
        activeUtterancesRef.current = activeUtterancesRef.current.filter((u) => u !== utterance);
        if (typeof window !== 'undefined') {
          const win = window as any;
          if (win.__activeSpeechUtterances) {
            win.__activeSpeechUtterances = win.__activeSpeechUtterances.filter(
              (u: any) => u !== utterance
            );
          }
        }

        if (activeUtterancesRef.current.length === 0 && queueRef.current.length === 0) {
          isVoicingRef.current = false;
          setIsVoicing(false);
          mouthOpenRef.current = 0;
          setMouthOpenLevel(0);
        }

        // Pipelining: immediately feed the next utterance from queue
        if (!isCanceledRef.current) {
          playNextInQueue();
        }

        if (activeUtterancesRef.current.length === 0 && queueRef.current.length === 0 && isStreamingEndedRef.current) {
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
        if (freezeWatchdog) {
          clearTimeout(freezeWatchdog);
          freezeWatchdog = null;
        }
        activeUtterancesRef.current = activeUtterancesRef.current.filter((u) => u !== utterance);
        if (typeof window !== 'undefined') {
          const win = window as any;
          if (win.__activeSpeechUtterances) {
            win.__activeSpeechUtterances = win.__activeSpeechUtterances.filter(
              (u: any) => u !== utterance
            );
          }
        }
        if (activeUtterancesRef.current.length === 0) {
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
        freezeWatchdog = setTimeout(() => {
          if (!didStart && synthRef.current && isPlayingRef.current) {
            try {
              synthRef.current.pause();
              synthRef.current.resume();
            } catch {
              // ignore
            }
          }
        }, 120);
      } catch (err) {
        if (freezeWatchdog) clearTimeout(freezeWatchdog);
        console.error('Error invoking synth.speak:', err);
      }
    }

    if (activeUtterancesRef.current.length === 0 && queueRef.current.length === 0) {
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

      // Prime speech synthesis synchronously within this user gesture to keep audio unlocked on mobile
      try {
        const prime = new SpeechSynthesisUtterance(' ');
        prime.volume = 0.01;
        prime.rate = 1.0;
        prime.lang = selectedVoice?.lang || 'fr-FR';
        synthRef.current.speak(prime);
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

      isCanceledRef.current = true;
      isPlayingRef.current = false;
      isStreamingEndedRef.current = true;
      queueRef.current = [];
      activeUtterancesRef.current = [];
      synthRef.current.cancel();

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

  const setSpeechRate = useCallback((_newRate: number) => {
    speechRateRef.current = 1.0;
  }, []);

  const testVoice = useCallback(() => {
    unlockAudioContext();
    speak("Bonjour ! Je suis Sadio. Votre voix et vos haut-parleurs sont parfaitement activés !");
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
    availableVoices,
    selectedVoice,
    setSelectedVoice,
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
