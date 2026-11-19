import { useState, useEffect, useRef, useCallback } from 'react';
import { safeStorage } from '../utils/storage';
import { parseDocumentIntoKaraoke, splitTextIntoSentences } from '../utils/karaokeParser';
import { karaokeSyncBus } from '../utils/karaokeSync';

// Clean markdown, symbols, emojis, and formatting to create crystal-clear spoken text without reading special characters
export function cleanTextForSpeech(text: string, lang: 'fr' | 'en' = 'fr'): string {
  if (!text) return '';

  let cleaned = text;
  const isEn = lang === 'en';

  // Normalize curly apostrophes and long dashes so TTS engines never pause mid-word ("l’école" -> "l'école")
  cleaned = cleaned.replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[—–]/g, ', ');

  // 1. Code blocks -> friendly spoken announcement
  cleaned = cleaned.replace(
    /```[a-zA-Z]*[\s\S]*?```/g,
    isEn ? ' Here is the corresponding code shown in the message. ' : ' Voici le code correspondant affiché dans le message. '
  );
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // 2. Links [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 3. Strip all emojis and pictographs so mobile synthesizers don't read them out loud
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
  cleaned = cleaned.replace(/(\w+)\^2\b/g, isEn ? '$1 squared' : '$1 au carré');
  cleaned = cleaned.replace(/(\w+)\^3\b/g, isEn ? '$1 cubed' : '$1 au cube');
  cleaned = cleaned.replace(/(\w+)\^(\w+)/g, isEn ? '$1 to the power of $2' : '$1 puissance $2');
  cleaned = cleaned.replace(/(\d+)\s*\*\s*(\d+)/g, isEn ? '$1 times $2' : '$1 fois $2');
  cleaned = cleaned.replace(/(\d+)\s*\/\s*(\d+)/g, isEn ? '$1 over $2' : '$1 sur $2');
  cleaned = cleaned.replace(/&/g, isEn ? ' and ' : ' et ');
  cleaned = cleaned.replace(/%/g, isEn ? ' percent ' : ' pour cent ');

  // 5. Common unit abbreviations for natural spoken output
  cleaned = cleaned.replace(/(\d+)\s*km\b/gi, isEn ? '$1 kilometers' : '$1 kilomètres');
  cleaned = cleaned.replace(/(\d+)\s*kg\b/gi, isEn ? '$1 kilograms' : '$1 kilogrammes');
  cleaned = cleaned.replace(/(\d+)\s*cm\b/gi, isEn ? '$1 centimeters' : '$1 centimètres');
  cleaned = cleaned.replace(/(\d+)\s*mm\b/gi, isEn ? '$1 millimeters' : '$1 millimètres');
  cleaned = cleaned.replace(/(\d+)\s*ms\b/gi, isEn ? '$1 milliseconds' : '$1 millisecondes');

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

  // 9. Bullet lists and numbering (both at line start and after collapsed line wraps)
  cleaned = cleaned.replace(/^[\s]*[-*+•]\s+/gm, ' ');
  cleaned = cleaned.replace(/(?:^|\s)[-•]\s+/g, ' ');
  cleaned = cleaned.replace(/^[\s]*(\d+)\.\s+/gm, '$1. ');

  // 10. Horizontal rules and table pipes
  cleaned = cleaned.replace(/---+|===+/g, ' ');
  cleaned = cleaned.replace(/\|/g, ' ');

  // 11. Arrow symbols
  cleaned = cleaned.replace(/->|→|⇒/g, isEn ? ' leads to ' : ' mène à ');
  cleaned = cleaned.replace(/<-|←|⇐/g, isEn ? ' comes from ' : ' provient de ');

  // 12. Quotation marks and parentheses: replace with natural pauses rather than spoken punctuation
  cleaned = cleaned.replace(/[«»"“”„]/g, ' ');
  cleaned = cleaned.replace(/\s*\(\s*/g, ', ');
  cleaned = cleaned.replace(/\s*\)\s*/g, ', ');

  // 13. ELIMINATE ALL REMAINING SPECIAL SYMBOLS that speech synthesizers enounce out loud
  cleaned = cleaned.replace(/[*#_~^\\{}[\]<>`|@=]/g, ' ');

  // 13b. Replace mid-sentence ellipses followed by lowercase ("Awa va à... l'école") with comma pause so TTS doesn't stop
  cleaned = cleaned.replace(/(?:\.\.\.|…)\s+(?=[a-zà-öø-ÿ])/g, ', ');

  // 14. Normalize spaces and punctuation for natural speech cadence (preserve decimals/times like 3.14 or 14:30)
  cleaned = cleaned
    .replace(/\s*([,;!?])\s*/g, '$1 ')
    .replace(/(?<!\d)\s*([.:])\s*(?!\d)/g, '$1 ')
    .replace(/([,;:])\s*\.\s*/g, '$1 ')
    .replace(/([,.;:!?]){2,}/g, '$1')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned;
}

// Group consecutive sentences into natural passages (up to maxChunkLength) so TTS flows continuously without inter-sentence stalls
export function splitIntoSentences(text: string, maxChunkLength = 230): string[] {
  const sentences = splitTextIntoSentences(text);
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

let sharedAudioCtx: AudioContext | null = null;
let audioHardwarePrimed = false;

// Unlock audio context once using a singleton without interrupting active SpeechSynthesis playback
export function unlockAudioContext(): void {
  try {
    const synthSpeaking =
      typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking;

    if (!synthSpeaking) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
          sharedAudioCtx = new AudioContextClass();
        }
        if (sharedAudioCtx.state === 'suspended') {
          sharedAudioCtx.resume().catch(() => {});
        }
        if (!audioHardwarePrimed) {
          // 1-sample silent buffer primes iOS Safari & Android audio output hardware cleanly once
          const buffer = sharedAudioCtx.createBuffer(1, 1, 22050);
          const source = sharedAudioCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(sharedAudioCtx.destination);
          source.start(0);
          audioHardwarePrimed = true;
        }
      }
    }
  } catch (e) {
    // AudioContext unlock optional
  }

  // Resume speech synthesis only if actually paused
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





function isVoiceMatchingLang(voice: SpeechSynthesisVoice | null | undefined, lang: 'fr' | 'en'): boolean {
  if (!voice) return false;
  const vLang = (voice.lang || '').toLowerCase().replace('_', '-');
  const vName = (voice.name || '').toLowerCase();

  if (lang === 'en') {
    if (vLang.startsWith('en') || vLang === 'eng') return true;
    return !vLang && vName.includes('english');
  }

  // French ('fr')
  if (
    vLang.startsWith('en') ||
    vLang.startsWith('es') ||
    vLang.startsWith('de') ||
    vLang.startsWith('it') ||
    vLang.startsWith('pt') ||
    vLang.startsWith('zh') ||
    vLang.startsWith('ja') ||
    vLang.startsWith('ar')
  ) {
    return false;
  }
  if (vLang.startsWith('fr') || vLang.startsWith('fra') || vLang.startsWith('fre')) {
    return true;
  }
  return !vLang && (vName.includes('français') || vName.includes('francais') || vName.includes('french'));
}

function isLowQualitySyntheticVoice(voice: SpeechSynthesisVoice): boolean {
  const n = (voice.name || '').toLowerCase();
  const uri = (voice.voiceURI || '').toLowerCase();
  return (
    n.includes('espeak') ||
    uri.includes('espeak') ||
    n.includes('mbrola') ||
    n.includes('festival') ||
    n.includes('compact')
  );
}

function selectBestVoiceForLang(voices: SpeechSynthesisVoice[], lang: 'fr' | 'en'): {
  matchedVoices: SpeechSynthesisVoice[];
  bestVoice: SpeechSynthesisVoice | null;
} {
  const matchedVoices = voices.filter((v) => isVoiceMatchingLang(v, lang));
  if (matchedVoices.length === 0) {
    return { matchedVoices: [], bestVoice: null };
  }

  const savedVoiceName = safeStorage.getItem(`sadio_voice_name_v2_${lang}`);
  if (savedVoiceName) {
    const saved = matchedVoices.find((v) => v.name === savedVoiceName);
    if (saved) return { matchedVoices, bestVoice: saved };
  }

  if (lang === 'en') {
    const enUsVoices = matchedVoices.filter((v) => {
      const l = (v.lang || '').toLowerCase().replace('_', '-');
      return l.startsWith('en-us') || l.startsWith('en-gb') || l === 'en';
    });
    const pool = enUsVoices.length > 0 ? enUsVoices : matchedVoices;
    const localPool = pool.filter((v) => v.localService && !isLowQualitySyntheticVoice(v));

    const bestVoice =
      localPool.find((v) => {
        const n = v.name.toLowerCase();
        return (
          n.includes('natural') ||
          n.includes('enhanced') ||
          n.includes('premium') ||
          n.includes('siri') ||
          n.includes('samantha') ||
          n.includes('daniel') ||
          n.includes('alex') ||
          n.includes('aria') ||
          n.includes('jenny') ||
          n.includes('guy') ||
          n.includes('local')
        );
      }) ||
      localPool[0] ||
      pool.find((v) => {
        const n = v.name.toLowerCase();
        return n.includes('natural') || n.includes('neural') || n.includes('google us english') || n.includes('google uk');
      }) ||
      pool[0];

    return { matchedVoices, bestVoice };
  }

  const frFrVoices = matchedVoices.filter((v) => {
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    return l.startsWith('fr-fr') || l === 'fr';
  });
  const voicesToSearch = frFrVoices.length > 0 ? frFrVoices : matchedVoices;
  // Prefer instant on-device (localService) voices over remote network voices (which buffer mid-sentence & between sentences)
  const localQualityVoices = voicesToSearch.filter((v) => v.localService && !isLowQualitySyntheticVoice(v));

  const bestVoice =
    localQualityVoices.find((v) => {
      const n = v.name.toLowerCase();
      return (
        n.includes('enhanced') ||
        n.includes('premium') ||
        n.includes('natural') ||
        n.includes('neural') ||
        n.includes('siri') ||
        n.includes('thomas') ||
        n.includes('audrey') ||
        n.includes('aurelie') ||
        n.includes('aurélie') ||
        n.includes('amelie') ||
        n.includes('amélie') ||
        n.includes('nicolas') ||
        n.includes('hortense') ||
        n.includes('paul') ||
        n.includes('julie') ||
        n.includes('denise') ||
        n.includes('henri') ||
        n.includes('vivienne') ||
        n.includes('local')
      );
    }) ||
    localQualityVoices[0] ||
    voicesToSearch.find((v) => {
      const n = v.name.toLowerCase();
      return (
        !isLowQualitySyntheticVoice(v) &&
        (n.includes('natural') ||
          n.includes('neural') ||
          n.includes('wavenet') ||
          n.includes('google français') ||
          n.includes('google francais') ||
          (n.includes('google') && n.includes('fr')))
      );
    }) ||
    voicesToSearch.find((v) => !isLowQualitySyntheticVoice(v)) ||
    frFrVoices[0] ||
    matchedVoices[0];

  return { matchedVoices, bestVoice };
}

export function useSpeechSynthesis(currentLang: 'fr' | 'en' = 'fr') {
  const currentLangRef = useRef<'fr' | 'en'>(currentLang);
  currentLangRef.current = currentLang;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoicing, setIsVoicing] = useState(false);
  const [mouthOpenLevel, setMouthOpenLevel] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>(() => {
    if (typeof window !== 'undefined' && Array.isArray((window as any).__sadio_available_voices)) {
      return (window as any).__sadio_available_voices;
    }
    return [];
  });
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(() => {
    if (
      currentLang === 'fr' &&
      typeof window !== 'undefined' &&
      isVoiceMatchingLang((window as any).__sadio_best_french_voice, 'fr')
    ) {
      return (window as any).__sadio_best_french_voice;
    }
    return null;
  });
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(selectedVoice);
  selectedVoiceRef.current = selectedVoice;
  const [currentSentence, setCurrentSentence] = useState<string>('');
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const sentenceIndexRef = useRef<number>(0);
  const [currentSpokenWord, setCurrentSpokenWord] = useState<string>('');
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(-1);
  const [currentCharIndex, setCurrentCharIndex] = useState<number>(0);
  const wordFallbackTimerRef = useRef<number | null>(null);
  const boundaryFiredRef = useRef<boolean>(false);
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
        if (!isNaN(parsed) && parsed >= 0.7 && parsed <= 1.3) return parsed;
      }
      return 1.0;
    } catch {
      return 1.0;
    }
  });
  const speechPitchRef = useRef<number>(speechPitch);

  const synthRef = useRef<SpeechSynthesis | null>(
    typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
  );
  const queueRef = useRef<string[]>([]);
  const pendingQueueLengthRef = useRef<number>(0);
  const inFlightCountRef = useRef<number>(0);
  const isCanceledRef = useRef<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);
  const isStreamingEndedRef = useRef<boolean>(true);
  const isAudioHeldRef = useRef<boolean>(false);
  const audioHoldTimerRef = useRef<number | null>(null);
  const onStartPlaybackRef = useRef<(() => void) | null>(null);
  const onQueueDrainedRef = useRef<(() => void) | null>(null);
  const onEndCallbackRef = useRef<(() => void) | null>(null);
  const activeUtterancesRef = useRef<SpeechSynthesisUtterance[]>([]);
  const speechSessionIdRef = useRef<number>(0);
  const utteranceStartedRef = useRef<boolean>(false);
  const utteranceQueuedAtRef = useRef<number>(0);
  const watchdogTimerRef = useRef<number | null>(null);
  const currentAudioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const isVoicingRef = useRef<boolean>(false);
  const mouthOpenRef = useRef<number>(0);
  const lastWordBoundaryRef = useRef<number>(0);
  const speechAnimFrameRef = useRef<number | null>(null);

  // Throttled (~18fps) lip and vocal articulation animation loop to prevent 60fps full-App re-renders during speech
  useEffect(() => {
    isVoicingRef.current = isVoicing;
    let lastRenderAt = 0;

    if (isVoicing) {
      const step = (now: number) => {
        if (isVoicingRef.current) {
          const timeSinceWord = (now - lastWordBoundaryRef.current) / 1000;
          const syllableOsc = Math.sin(now * 0.024);
          const secondaryOsc = Math.cos(now * 0.015);

          const wordPulse = Math.max(0, 1 - timeSinceWord * 3.5);
          const rawTarget = 0.35 + 0.35 * Math.abs(syllableOsc) + 0.2 * Math.abs(secondaryOsc) + 0.15 * wordPulse;
          const targetOpen = Math.min(1, Math.max(0.12, rawTarget));

          mouthOpenRef.current += (targetOpen - mouthOpenRef.current) * 0.35;
          if (now - lastRenderAt >= 55) {
            lastRenderAt = now;
            setMouthOpenLevel(mouthOpenRef.current);
          }

          speechAnimFrameRef.current = requestAnimationFrame(step);
        } else {
          mouthOpenRef.current += (0 - mouthOpenRef.current) * 0.45;
          if (mouthOpenRef.current < 0.01) {
            mouthOpenRef.current = 0;
            setMouthOpenLevel(0);
            speechAnimFrameRef.current = null;
          } else {
            if (now - lastRenderAt >= 55) {
              lastRenderAt = now;
              setMouthOpenLevel(mouthOpenRef.current);
            }
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

  // Initialize and load voices strictly matching the active language
  useEffect(() => {
    currentLangRef.current = currentLang;

    // Immediately drop any selected voice from the opposite language before voices reload
    if (selectedVoiceRef.current && !isVoiceMatchingLang(selectedVoiceRef.current, currentLang)) {
      selectedVoiceRef.current = null;
      setSelectedVoice(null);
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const synth = window.speechSynthesis;
      synthRef.current = synth;
      setIsSupported(true);

      const updateVoices = () => {
        const voices = synth.getVoices();
        if (voices.length > 0) {
          const { matchedVoices, bestVoice } = selectBestVoiceForLang(voices, currentLang);
          setAvailableVoices(matchedVoices);
          selectedVoiceRef.current = bestVoice;
          setSelectedVoice(bestVoice);
        }
      };

      updateVoices();
      synth.onvoiceschanged = updateVoices;

      const t1 = setTimeout(updateVoices, 30);
      const t2 = setTimeout(updateVoices, 100);
      const t3 = setTimeout(updateVoices, 250);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        synth.cancel();
      };
    } else {
      setIsSupported(false);
    }
  }, [currentLang]);

  const playNextInQueueRef = useRef<(() => void) | null>(null);

  // Fast watchdog & auto-recovery engine (only recovers silent stalls; never injects pauses into local/mobile audio)
  useEffect(() => {
    let stallCount = 0;
    if (isSpeaking && !isPaused) {
      const isMobileUa =
        typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

      watchdogTimerRef.current = window.setInterval(() => {
        const synth = synthRef.current || (typeof window !== 'undefined' ? window.speechSynthesis : null);
        if (!synth) return;

        // 1. If synthesizer was paused by browser OS/audio focus, resume immediately
        if (synth.paused) {
          try {
            synth.resume();
          } catch {}
        }

        const elapsedSinceQueued = performance.now() - utteranceQueuedAtRef.current;
        const activeVoiceIsRemote = activeUtterancesRef.current[0]?.voice?.localService === false;

        // 2. Desktop Chrome 15s keep-alive guard: ONLY for remote network voices on desktop (>13.5s)
        if (
          !isMobileUa &&
          activeVoiceIsRemote &&
          utteranceStartedRef.current &&
          synth.speaking &&
          !synth.paused &&
          elapsedSinceQueued > 13500
        ) {
          try {
            synth.pause();
            synth.resume();
            utteranceQueuedAtRef.current = performance.now();
          } catch {}
        }

        // 3. If synthesizer silently stopped speaking without firing onend (Chrome/iOS bug)
        const coldStartGraceMs = activeVoiceIsRemote ? 4800 : 2600;
        if (isPlayingRef.current && !synth.speaking && !synth.pending) {
          if (utteranceStartedRef.current || elapsedSinceQueued > coldStartGraceMs) {
            stallCount++;
            if (stallCount >= 2) {
              stallCount = 0;
              console.warn('⚡ [SADIO VOICE RECOVERY] Speech stalled silently. Auto-recovering playback queue...');
              try {
                synth.cancel();
                if (synth.paused) synth.resume();
              } catch {}
              activeUtterancesRef.current = [];
              isPlayingRef.current = false;
              utteranceStartedRef.current = false;
              playNextInQueueRef.current?.();
            }
          }
        } else {
          stallCount = 0;
        }
      }, 450);
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
    speechSessionIdRef.current += 1;
    isCanceledRef.current = true;
    isPlayingRef.current = false;
    utteranceStartedRef.current = false;
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
    if (currentAudioPlayerRef.current) {
      try {
        currentAudioPlayerRef.current.pause();
        currentAudioPlayerRef.current = null;
      } catch {}
    }
    queueRef.current = [];
    pendingQueueLengthRef.current = 0;
    inFlightCountRef.current = 0;
    onQueueDrainedRef.current = null;
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
    if (wordFallbackTimerRef.current) {
      clearInterval(wordFallbackTimerRef.current);
      wordFallbackTimerRef.current = null;
    }
    sentenceIndexRef.current = 0;
    setCurrentSentenceIndex(0);
    setCurrentCharIndex(0);
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentSentence('');
    setCurrentSpokenWord('');
    setCurrentWordIndex(-1);
    setSpeechError(null);
    karaokeSyncBus.emit({
      isSpeaking: false,
      sentenceIndex: 0,
      wordIndex: -1,
      spokenWord: '',
      charIndex: 0,
      sentenceText: '',
    });
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

  // Gapless pre-buffering queue: keeps up to 2 utterances in flight (1 speaking + 1 pre-buffered)
  // so cloud/Google TTS fetches the next sentence while the current one is speaking -> 0ms pause!
  const playNextInQueue = useCallback(() => {
    playNextInQueueRef.current = playNextInQueue;
    if (isCanceledRef.current) {
      activeUtterancesRef.current = [];
      isPlayingRef.current = false;
      isVoicingRef.current = false;
      setIsVoicing(false);
      setIsSpeaking(false);
      setCurrentSentence('');
      return;
    }

    if (currentAudioPlayerRef.current) {
      try {
        currentAudioPlayerRef.current.pause();
        currentAudioPlayerRef.current = null;
      } catch {}
    }

    if (!synthRef.current && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
    const synth = synthRef.current;
    if (!synth) return;

    const sessionId = speechSessionIdRef.current;
    const activeLang = currentLangRef.current;
    const defaultLangCode = activeLang === 'en' ? 'en-US' : 'fr-FR';

    let voiceToUse: SpeechSynthesisVoice | null = null;
    if (isVoiceMatchingLang(selectedVoiceRef.current, activeLang)) {
      voiceToUse = selectedVoiceRef.current;
    } else {
      const liveVoices = synth.getVoices();
      const { bestVoice: liveBestVoice } = selectBestVoiceForLang(liveVoices, activeLang);
      if (liveBestVoice) {
        selectedVoiceRef.current = liveBestVoice;
        voiceToUse = liveBestVoice;
      }
    }

    const MAX_IN_FLIGHT = 1;

    while (
      !isCanceledRef.current &&
      sessionId === speechSessionIdRef.current &&
      activeUtterancesRef.current.length < MAX_IN_FLIGHT &&
      queueRef.current.length > 0
    ) {
      const nextText = queueRef.current.shift()!;
      pendingQueueLengthRef.current = queueRef.current.length;
      const utterance = new SpeechSynthesisUtterance(nextText);

      if (voiceToUse) {
        utterance.voice = voiceToUse;
        utterance.lang = voiceToUse.lang || defaultLangCode;
      } else {
        utterance.lang = defaultLangCode;
      }

      utterance.rate = speechRateRef.current || 1.0;
      utterance.pitch = speechPitchRef.current ?? 1.0;
      utterance.volume = 1.0;

      if (activeUtterancesRef.current.length === 0) {
        utteranceStartedRef.current = false;
        utteranceQueuedAtRef.current = performance.now();
        setCurrentSentence(nextText);
      }

      activeUtterancesRef.current.push(utterance);
      inFlightCountRef.current = activeUtterancesRef.current.length + queueRef.current.length;
      isPlayingRef.current = true;
      setIsSpeaking(true);

      // Prevent V8 Garbage Collection from destroying active or queued utterances
      if (typeof window !== 'undefined') {
        const win = window as any;
        win.__activeSpeechUtterances = win.__activeSpeechUtterances || [];
        win.__activeSpeechUtterances.push(utterance);
      }

      const removeUtteranceRef = (target: SpeechSynthesisUtterance) => {
        activeUtterancesRef.current = activeUtterancesRef.current.filter((u) => u !== target);
        inFlightCountRef.current = activeUtterancesRef.current.length + queueRef.current.length;
        if (typeof window !== 'undefined') {
          const win = window as any;
          if (Array.isArray(win.__activeSpeechUtterances)) {
            const idx = win.__activeSpeechUtterances.indexOf(target);
            if (idx !== -1) win.__activeSpeechUtterances.splice(idx, 1);
          }
        }
      };

      utterance.onstart = () => {
        if (isCanceledRef.current || sessionId !== speechSessionIdRef.current) return;
        utteranceStartedRef.current = true;
        utteranceQueuedAtRef.current = performance.now();
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

      utterance.onend = () => {
        removeUtteranceRef(utterance);
        if (isCanceledRef.current || sessionId !== speechSessionIdRef.current) return;
        sentenceIndexRef.current++;
        setCurrentSentenceIndex(sentenceIndexRef.current);
        utteranceStartedRef.current = false;
        utteranceQueuedAtRef.current = performance.now();
        // Ask streaming buffer for any held sentences right before continuing
        if (queueRef.current.length === 0 && !isStreamingEndedRef.current) {
          onQueueDrainedRef.current?.();
        }
        window.setTimeout(() => {
          if (!isCanceledRef.current && sessionId === speechSessionIdRef.current) {
            playNextInQueue();
          }
        }, 10);
      };

      utterance.onerror = (e) => {
        console.warn('SpeechSynthesis error:', e.error);
        removeUtteranceRef(utterance);
        if (isCanceledRef.current || sessionId !== speechSessionIdRef.current) return;

        // If network/cloud voice failed, retry once with local system language voice
        if (
          (e.error === 'network' || e.error === 'synthesis-failed' || e.error === 'audio-hardware') &&
          !(utterance as any).__retriedLocal
        ) {
          try {
            const fallbackUtterance = new SpeechSynthesisUtterance(nextText);
            (fallbackUtterance as any).__retriedLocal = true;
            fallbackUtterance.lang = defaultLangCode;
            fallbackUtterance.rate = speechRateRef.current || 1.0;
            fallbackUtterance.pitch = speechPitchRef.current ?? 1.0;
            activeUtterancesRef.current.unshift(fallbackUtterance);
            inFlightCountRef.current = activeUtterancesRef.current.length + queueRef.current.length;
            utteranceStartedRef.current = false;
            utteranceQueuedAtRef.current = performance.now();
            fallbackUtterance.onstart = () => {
              if (isCanceledRef.current || sessionId !== speechSessionIdRef.current) return;
              utteranceStartedRef.current = true;
              utteranceQueuedAtRef.current = performance.now();
            };
            fallbackUtterance.onend = () => {
              removeUtteranceRef(fallbackUtterance);
              if (isCanceledRef.current || sessionId !== speechSessionIdRef.current) return;
              sentenceIndexRef.current++;
              setCurrentSentenceIndex(sentenceIndexRef.current);
              utteranceStartedRef.current = false;
              utteranceQueuedAtRef.current = performance.now();
              window.setTimeout(() => {
                if (!isCanceledRef.current && sessionId === speechSessionIdRef.current) {
                  playNextInQueue();
                }
              }, 10);
            };
            fallbackUtterance.onerror = () => {
              removeUtteranceRef(fallbackUtterance);
              if (isCanceledRef.current || sessionId !== speechSessionIdRef.current) return;
              window.setTimeout(() => {
                if (!isCanceledRef.current && sessionId === speechSessionIdRef.current) {
                  playNextInQueue();
                }
              }, 10);
            };
            synth.speak(fallbackUtterance);
            return;
          } catch {}
        }

        if (activeUtterancesRef.current.length === 0) {
          utteranceStartedRef.current = false;
        }
        window.setTimeout(() => {
          if (!isCanceledRef.current && sessionId === speechSessionIdRef.current) {
            playNextInQueue();
          }
        }, 10);
      };

      try {
        if (synth.paused) synth.resume();
        synth.speak(utterance);
      } catch {
        removeUtteranceRef(utterance);
      }
    }

    if (activeUtterancesRef.current.length === 0 && queueRef.current.length === 0) {
      inFlightCountRef.current = 0;
      isPlayingRef.current = false;
      utteranceStartedRef.current = false;
      isVoicingRef.current = false;
      setIsVoicing(false);
      if (isStreamingEndedRef.current) {
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentSentence('');
        setCurrentSpokenWord('');
        setCurrentWordIndex(-1);
        setCurrentCharIndex(0);
        if (onEndCallbackRef.current) {
          onEndCallbackRef.current();
          onEndCallbackRef.current = null;
        }
      }
    }
  }, [selectedVoice, currentLang]);

  // Real-time progressive streaming speech - INSTANT, starts speaking immediately!
  const startStreamingSpeech = useCallback(
    (onStartPlayback?: () => void, onQueueDrained?: () => void) => {
      if (!synthRef.current) return;
      unlockAudioContext();
      if (synthRef.current.paused) {
        synthRef.current.resume();
      }
      speechSessionIdRef.current += 1;
      isCanceledRef.current = false;
      isStreamingEndedRef.current = false;
      isPlayingRef.current = false;
      utteranceStartedRef.current = false;
      isAudioHeldRef.current = false;
      queueRef.current = [];
      pendingQueueLengthRef.current = 0;
      inFlightCountRef.current = 0;
      activeUtterancesRef.current = [];

      try {
        if (synthRef.current.speaking || synthRef.current.paused || synthRef.current.pending) {
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
      onQueueDrainedRef.current = onQueueDrained || null;
    },
    []
  );

  const enqueueStreamingSentence = useCallback(
    (sentence: string) => {
      if (isCanceledRef.current || !synthRef.current || !voiceEnabled) return;

      const cleaned = cleanTextForSpeech(sentence, currentLangRef.current);
      if (!cleaned || cleaned.length < 2) return;

      queueRef.current.push(cleaned);
      pendingQueueLengthRef.current = queueRef.current.length;
      inFlightCountRef.current = activeUtterancesRef.current.length + queueRef.current.length;

      setIsSpeaking(true);
      if (!isPlayingRef.current && onStartPlaybackRef.current) {
        onStartPlaybackRef.current();
        onStartPlaybackRef.current = null;
      }
      playNextInQueue();
    },
    [voiceEnabled, playNextInQueue]
  );

  const finishStreamingSpeech = useCallback(
    (remainingText?: string, onEnd?: () => void) => {
      isStreamingEndedRef.current = true;
      onQueueDrainedRef.current = null;
      onEndCallbackRef.current = onEnd || null;

      if (remainingText) {
        const cleaned = cleanTextForSpeech(remainingText, currentLangRef.current);
        if (cleaned && cleaned.length >= 2) {
          const formatted = /[.!?…,:;]$/.test(cleaned) ? cleaned : `${cleaned}.`;
          queueRef.current.push(formatted);
          pendingQueueLengthRef.current = queueRef.current.length;
          inFlightCountRef.current = activeUtterancesRef.current.length + queueRef.current.length;
        }
      }

      if (queueRef.current.length > 0) {
        playNextInQueue();
      } else if (activeUtterancesRef.current.length === 0 && !isPlayingRef.current) {
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

  // Greeting playback: uses browser native SpeechSynthesis directly
  const speakGreeting = useCallback(
    (text: string, onEnd?: () => void, overrideLang?: 'fr' | 'en') => {
      if (overrideLang) {
        currentLangRef.current = overrideLang;
      }
      const activeLang = overrideLang || currentLangRef.current;

      unlockAudioContext();

      if (currentAudioPlayerRef.current) {
        try {
          currentAudioPlayerRef.current.pause();
          currentAudioPlayerRef.current = null;
        } catch {}
      }

      if (!synthRef.current && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        synthRef.current = window.speechSynthesis;
      }
      const synth = synthRef.current;
      if (!synth) {
        onEnd?.();
        return;
      }

      try {
        if (synth.paused) synth.resume();
        synth.cancel();
        if (synth.paused) synth.resume();
      } catch {}

      speechSessionIdRef.current += 1;
      const sessionId = speechSessionIdRef.current;
      isCanceledRef.current = false;
      isPlayingRef.current = true;
      isStreamingEndedRef.current = true;
      queueRef.current = [];
      pendingQueueLengthRef.current = 0;
      activeUtterancesRef.current = [];

      const defaultLangCode = activeLang === 'en' ? 'en-US' : 'fr-FR';
      const liveVoices = synth.getVoices();
      const { bestVoice: liveBestVoice } = selectBestVoiceForLang(liveVoices, activeLang);
      const voiceToUse = isVoiceMatchingLang(selectedVoiceRef.current, activeLang)
        ? selectedVoiceRef.current
        : liveBestVoice;

      const utterance = new SpeechSynthesisUtterance(text);
      if (voiceToUse) {
        utterance.voice = voiceToUse;
        utterance.lang = voiceToUse.lang || defaultLangCode;
      } else {
        utterance.lang = defaultLangCode;
      }

      utterance.rate = speechRateRef.current || 1.0;
      utterance.pitch = speechPitchRef.current ?? 1.0;
      utterance.volume = 1.0;

      setCurrentSentence(text);
      setIsSpeaking(true);
      setIsPaused(false);
      setSpeechError(null);

      if (typeof window !== 'undefined') {
        const win = window as any;
        win.__activeSpeechUtterances = win.__activeSpeechUtterances || [];
        win.__activeSpeechUtterances.push(utterance);
        win.__sadio_active_utterance = utterance;
      }
      activeUtterancesRef.current = [utterance];

      utterance.onstart = () => {
        if (isCanceledRef.current || sessionId !== speechSessionIdRef.current) return;
        isVoicingRef.current = true;
        setIsVoicing(true);
        setIsSpeaking(true);
        setIsPaused(false);
        setSpeechError(null);
        setCurrentSentence(text);
        lastWordBoundaryRef.current = performance.now();
      };

      utterance.onend = () => {
        if (sessionId !== speechSessionIdRef.current) return;
        activeUtterancesRef.current = [];
        if (typeof window !== 'undefined') {
          (window as any).__sadio_active_utterance = null;
        }
        isVoicingRef.current = false;
        setIsVoicing(false);
        mouthOpenRef.current = 0;
        setMouthOpenLevel(0);
        isPlayingRef.current = false;
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentSentence('');
        onEnd?.();
      };

      utterance.onerror = (e) => {
        if (sessionId !== speechSessionIdRef.current) return;
        console.warn('SpeechSynthesis greeting error:', e.error);
        activeUtterancesRef.current = [];
        if (typeof window !== 'undefined') {
          (window as any).__sadio_active_utterance = null;
        }
        isVoicingRef.current = false;
        setIsVoicing(false);
        mouthOpenRef.current = 0;
        setMouthOpenLevel(0);
        isPlayingRef.current = false;
        setIsSpeaking(false);
        setCurrentSentence('');

        if (e.error === 'not-allowed') {
          setSpeechError("🔊 Cliquez sur SADIO ou sur l'écran pour activer la voix du robot !");
        }
        onEnd?.();
      };

      setTimeout(() => {
        if (isCanceledRef.current || sessionId !== speechSessionIdRef.current) return;
        try {
          if (synth.paused) synth.resume();
          synth.speak(utterance);
          if (synth.paused) synth.resume();
        } catch (err) {
          console.error('Error invoking synth.speak for greeting:', err);
          onEnd?.();
        }
      }, 30);
    },
    [unlockAudioContext, selectedVoice, currentLang]
  );

  // Play full text at once (for "Écouter" button on message history)
  const speak = useCallback(
    (rawText: string, _lang?: string, onEnd?: () => void, singleSentenceMode = false) => {
      // If the text is the greeting, route immediately to speakGreeting
      if (
        rawText.includes("SADIO, votre avatar robot") ||
        rawText.includes("Sadio, votre avatar robot") ||
        rawText.includes("I am SADIO, your intelligent robot avatar") ||
        (typeof window !== 'undefined' && rawText === (window as any).__SADIO_GREETING_TEXT)
      ) {
        speakGreeting(rawText, onEnd);
        return;
      }

      if (!synthRef.current && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        synthRef.current = window.speechSynthesis;
      }
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
          synthRef.current.resume();
        } catch {
          // ignore
        }
      }
      speechSessionIdRef.current += 1;
      isCanceledRef.current = false;
      isPlayingRef.current = false;
      utteranceStartedRef.current = false;
      isStreamingEndedRef.current = true;
      queueRef.current = [];
      pendingQueueLengthRef.current = 0;
      activeUtterancesRef.current = [];

      const parsed = parseDocumentIntoKaraoke(rawText, currentLangRef.current);
      if (parsed.sentences.length === 0) {
        onEnd?.();
        return;
      }

      let chunksToSpeak: string[];
      if (singleSentenceMode) {
        chunksToSpeak = parsed.sentences.map((s) => s.spokenText);
      } else {
        // Group consecutive sentences into ~230-char passages so TTS reads across periods seamlessly with 0ms inter-sentence pause
        chunksToSpeak = [];
        let currentPassage = '';
        for (const s of parsed.sentences) {
          const piece = s.spokenText;
          if (!currentPassage) {
            currentPassage = piece;
          } else if (currentPassage.length + 1 + piece.length <= 230) {
            currentPassage += ' ' + piece;
          } else {
            chunksToSpeak.push(currentPassage);
            currentPassage = piece;
          }
        }
        if (currentPassage) chunksToSpeak.push(currentPassage);
      }

      // Direct synchronous execution within the user gesture chain
      sentenceIndexRef.current = 0;
      setCurrentSentenceIndex(0);
      isCanceledRef.current = false;
      isPlayingRef.current = false;
      isStreamingEndedRef.current = true;
      onEndCallbackRef.current = onEnd || null;
      queueRef.current = chunksToSpeak;
      pendingQueueLengthRef.current = chunksToSpeak.length;
      setIsSpeaking(true);
      setIsPaused(false);
      setSpeechError(null);

      playNextInQueue();
    },
    [playNextInQueue, speakGreeting]
  );

  const speakFromSentenceIndex = useCallback(
    (index: number, rawText: string) => {
      const parsed = parseDocumentIntoKaraoke(rawText, currentLangRef.current);
      if (index < 0 || index >= parsed.sentences.length) return;

      unlockAudioContext();
      if (synthRef.current?.speaking || synthRef.current?.pending) {
        try {
          synthRef.current.cancel();
          synthRef.current.resume();
        } catch {
          // ignore
        }
      }

      speechSessionIdRef.current += 1;
      sentenceIndexRef.current = index;
      setCurrentSentenceIndex(index);
      queueRef.current = parsed.sentences.slice(index).map((s) => s.spokenText);
      pendingQueueLengthRef.current = queueRef.current.length;
      activeUtterancesRef.current = [];
      utteranceStartedRef.current = false;
      isCanceledRef.current = false;
      isPlayingRef.current = false;
      isStreamingEndedRef.current = true;
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
    const activeLang = currentLangRef.current;
    selectedVoiceRef.current = voice;
    setSelectedVoice(voice);
    if (voice) {
      safeStorage.setItem(`sadio_voice_name_v2_${activeLang}`, voice.name);
      safeStorage.setItem(`sadio_voice_lang_v2_${activeLang}`, voice.lang);
    } else {
      safeStorage.removeItem(`sadio_voice_name_v2_${activeLang}`);
      safeStorage.removeItem(`sadio_voice_lang_v2_${activeLang}`);
      safeStorage.removeItem(`sadio_voice_name_${activeLang}`);
    }
  }, []);

  const testVoice = useCallback(() => {
    unlockAudioContext();
    const testMsg =
      currentLang === 'en'
        ? "Hello! I am SADIO, your intelligent robot avatar. My browser voice is now active, clear, and fluent."
        : "Bonjour ! Je suis SADIO, votre avatar robot intelligent. Ma voix du navigateur est désormais active, claire et fluide.";
    speakGreeting(testMsg);
  }, [speakGreeting, unlockAudioContext, currentLang]);

  const testSpecificVoice = useCallback((voice: SpeechSynthesisVoice) => {
    unlockAudioContext();
    if (!synthRef.current && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
    const synth = synthRef.current;
    if (!synth) return;
    try {
      synth.cancel();
    } catch {}
    const defaultLangCode = currentLang === 'en' ? 'en-US' : 'fr-FR';
    const testPhrase =
      currentLang === 'en'
        ? "Hello! I am testing the premium voice of SADIO."
        : "Bonjour ! Je teste la voix premium de SADIO.";
    const utterance = new SpeechSynthesisUtterance(testPhrase);
    utterance.voice = voice;
    utterance.lang = voice.lang || defaultLangCode;
    utterance.rate = speechRateRef.current || 1.0;
    utterance.pitch = speechPitchRef.current ?? 1.0;
    utterance.volume = 1.0;
    synth.speak(utterance);
  }, [unlockAudioContext, currentLang]);

  return {
    isSpeaking,
    isPlayingRef,
    pendingQueueLengthRef,
    inFlightCountRef,
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
    currentSentenceIndex,
    currentCharIndex,
    currentSpokenWord,
    currentWordIndex,
    speechError,
    startStreamingSpeech,
    enqueueStreamingSentence,
    finishStreamingSpeech,
    speak,
    speakFromSentenceIndex,
    speakGreeting,
    pause,
    resume,
    stop,
    testVoice,
    testSpecificVoice,
    unlockAudioContext,
  };
}
