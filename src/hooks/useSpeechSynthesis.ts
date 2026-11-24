import { useState, useEffect, useRef, useCallback } from 'react';
import { safeStorage } from '../utils/storage';
import { splitTextIntoSentences } from '../utils/sentenceSplitter';

// Check if cleaned text actually contains speakable letters or digits (prevents silent TTS crashes on punctuation-only chunks)
export function hasSpeakableContent(text: string): boolean {
  return Boolean(text && /[A-Za-zÀ-ÿ0-9]/.test(text));
}

// Clean markdown, symbols, emojis, and formatting to create crystal-clear spoken text without reading special characters
export function cleanTextForSpeech(text: string, lang: 'fr' | 'en' = 'fr'): string {
  if (!text) return '';

  let cleaned = text;
  const isEn = lang === 'en';

  // Normalize curly apostrophes and long dashes so TTS engines never pause mid-word ("l’école" -> "l'école")
  cleaned = cleaned.replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[—–]/g, ', ');

  // 1. Code blocks (closed or unclosed trailing fences) -> friendly spoken announcement
  cleaned = cleaned.replace(
    /```[a-zA-Z0-9_-]*[\s\S]*?```/g,
    isEn ? ' Here is the corresponding code shown in the message. ' : ' Voici le code correspondant affiché dans le message. '
  );
  cleaned = cleaned.replace(
    /```[a-zA-Z0-9_-]*[\s\S]*$/g,
    isEn ? ' Here is the corresponding code shown in the message. ' : ' Voici le code correspondant affiché dans le message. '
  );
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // 2. Markdown links [text](url) -> text, and raw URLs -> friendly spoken phrase
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  cleaned = cleaned.replace(/https?:\/\/[^\s)>\]]+/gi, isEn ? ' a web link ' : ' un lien web ');

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

  if (!hasSpeakableContent(cleaned)) return '';
  return cleaned;
}

const LONG_CLAUSE_DANGLING_WORDS = new Set([
  'à', 'de', 'du', 'des', 'le', 'la', 'les', 'un', 'une', 'en', 'au', 'aux',
  'et', 'ou', 'qui', 'que', 'pour', 'dans', 'sur', 'avec', 'par', 'sans', 'chez',
  'to', 'the', 'a', 'an', 'in', 'on', 'at', 'of', 'for', 'and', 'or', 'with', 'by',
]);

function splitOverlongSentence(sentence: string, maxLen = 165): string[] {
  if (sentence.length <= maxLen) return hasSpeakableContent(sentence) ? [sentence] : [];

  const parts: string[] = [];
  let rest = sentence.trim();

  while (rest.length > maxLen) {
    let splitIdx = -1;

    // 1. Prefer safe clause boundary (, ; :) between 65 and maxLen chars
    for (let i = Math.min(maxLen, rest.length - 1); i >= 65; i--) {
      const ch = rest[i];
      const nextCh = rest[i + 1];
      if ((ch === ';' || ch === ':' || ch === ',') && (!nextCh || /\s/.test(nextCh))) {
        const left = rest.slice(0, i + 1).trim();
        const lastWord = (left.slice(0, -1).trim().match(/([A-Za-zÀ-ÿ'’]+)$/)?.[1] || '').toLowerCase();
        if (!LONG_CLAUSE_DANGLING_WORDS.has(lastWord) && !/['’]$/.test(left.slice(0, -1).trim())) {
          splitIdx = i + 1;
          break;
        }
      }
    }

    // 2. Fallback: safe non-dangling word boundary between 65 and maxLen chars
    if (splitIdx === -1) {
      for (let i = Math.min(maxLen, rest.length - 1); i >= 65; i--) {
        if (/\s/.test(rest[i])) {
          const left = rest.slice(0, i).trim();
          const lastWord = (left.match(/([A-Za-zÀ-ÿ'’]+)$/)?.[1] || '').toLowerCase();
          if (left.length >= 45 && !LONG_CLAUSE_DANGLING_WORDS.has(lastWord) && !/['’]$/.test(left)) {
            splitIdx = i;
            break;
          }
        }
      }
    }

    // 3. Last resort: any whitespace before maxLen
    if (splitIdx === -1) {
      for (let i = Math.min(maxLen, rest.length - 1); i >= 24; i--) {
        if (/\s/.test(rest[i])) {
          splitIdx = i;
          break;
        }
      }
    }

    // 4. Unspaced token fallback (hard cut so no single utterance can exceed browser time limits)
    if (splitIdx === -1) {
      splitIdx = maxLen;
    }

    const head = rest.slice(0, splitIdx).trim();
    if (head && hasSpeakableContent(head)) parts.push(head);
    rest = rest.slice(splitIdx).trim();
  }

  if (rest && hasSpeakableContent(rest)) parts.push(rest);
  return parts;
}

// Group consecutive short sentences into natural passages (up to 155 chars -> ~7-9s max, immune to Chrome 15s cutoff while avoiding per-sentence pauses)
export function splitIntoSentences(text: string, maxChunkLength = 155): string[] {
  const rawSentences = splitTextIntoSentences(text);
  const sentences = rawSentences
    .flatMap((s) => splitOverlongSentence(s, Math.max(145, maxChunkLength + 10)))
    .filter((s) => hasSpeakableContent(s));

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

  if (currentPassage && hasSpeakableContent(currentPassage)) {
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

const LOW_QUALITY_OR_NOVELTY_VOICE_RE =
  /\b(espeak|espeak-ng|mbrola|festival|flite|pico|rhvoice|svox|compact|speech-dispatcher|albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|eddy|flo|fred|good news|grandma|grandpa|hysterical|jester|junior|kathy|organ|pipe organ|princess|ralph|reed|rocko|sandy|shelley|superstar|trinoids|vicki|whisper|wobble|zarvox|agnes|bruce)\b/i;

export function isLowQualitySyntheticVoice(voice: SpeechSynthesisVoice): boolean {
  const n = (voice.name || '').toLowerCase();
  const uri = (voice.voiceURI || '').toLowerCase();
  return (
    LOW_QUALITY_OR_NOVELTY_VOICE_RE.test(n) ||
    LOW_QUALITY_OR_NOVELTY_VOICE_RE.test(uri) ||
    uri.includes('eloquence') ||
    uri.includes('espeak')
  );
}

function scoreVoiceForLang(voice: SpeechSynthesisVoice, lang: 'fr' | 'en'): number {
  if (isLowQualitySyntheticVoice(voice)) return -10000;

  const n = (voice.name || '').toLowerCase();
  const l = (voice.lang || '').toLowerCase().replace('_', '-');
  let score = 0;

  // High-fidelity neural / enhanced / Siri / Online voices
  if (
    n.includes('natural') ||
    n.includes('neural') ||
    n.includes('enhanced') ||
    n.includes('premium') ||
    n.includes('wavenet') ||
    n.includes('siri') ||
    n.includes('online')
  ) {
    score += 400;
  }

  // Known clean human-sounding OS/browser voices
  if (lang === 'fr') {
    if (
      /\b(thomas|audrey|aurelie|aurélie|amelie|amélie|nicolas|hortense|paul|julie|denise|henri|vivienne|remy|rémy|celine|céline|lea|léa|eloise|éloïse|claire|chloe|chloé|alain|brigitte)\b/i.test(
        n
      )
    ) {
      score += 250;
    }
    if (l.startsWith('fr-fr')) score += 220;
    else if (l === 'fr' || l === 'fra' || l === 'fre') score += 180;
    else if (l.startsWith('fr-be') || l.startsWith('fr-ch')) score += 60;
    else if (l.startsWith('fr-ca')) score += 25;
  } else {
    if (
      /\b(samantha|daniel|alex|ava|allison|susan|zoe|karen|moira|tessa|serena|kate|oliver|arthur|martha|aria|jenny|guy|libby|sonia|ryan|david|zira|mark)\b/i.test(
        n
      ) ||
      n.includes('google us english') ||
      n.includes('google uk english')
    ) {
      score += 250;
    }
    if (l.startsWith('en-us') || l.startsWith('en-gb')) score += 220;
    else if (l === 'en' || l === 'eng') score += 180;
    else if (l.startsWith('en-ca') || l.startsWith('en-au') || l.startsWith('en-ie') || l.startsWith('en-nz')) score += 60;
    else if (l.startsWith('en-')) score += 15;
  }

  if (n.includes('google')) {
    score += 180;
  }

  // Prefer reliable on-device local voices once novelty/robotic voices are excluded
  if (voice.localService) {
    score += 120;
  }

  if (voice.default) {
    score += 5;
  }

  return score;
}

export function selectBestVoiceForLang(voices: SpeechSynthesisVoice[], lang: 'fr' | 'en'): {
  matchedVoices: SpeechSynthesisVoice[];
  bestVoice: SpeechSynthesisVoice | null;
} {
  const allMatched = voices.filter((v) => isVoiceMatchingLang(v, lang));
  if (allMatched.length === 0) {
    return { matchedVoices: [], bestVoice: null };
  }

  const cleanMatched = allMatched.filter((v) => !isLowQualitySyntheticVoice(v));
  const pool = cleanMatched.length > 0 ? cleanMatched : allMatched;
  const sortedPool = [...pool].sort((a, b) => scoreVoiceForLang(b, lang) - scoreVoiceForLang(a, lang));

  const savedVoiceName = safeStorage.getItem(`sadio_voice_name_v2_${lang}`);
  if (savedVoiceName) {
    const saved = cleanMatched.find((v) => v.name === savedVoiceName);
    if (saved) return { matchedVoices: sortedPool, bestVoice: saved };
  }

  return { matchedVoices: sortedPool, bestVoice: sortedPool[0] || null };
}

export function findFallbackVoice(
  voices: SpeechSynthesisVoice[],
  lang: 'fr' | 'en',
  excludeVoiceName?: string | null
): SpeechSynthesisVoice | null {
  const { matchedVoices } = selectBestVoiceForLang(voices, lang);
  if (matchedVoices.length === 0) return null;

  // Never fall back to a novelty or robotic voice if any clean voice exists
  const cleanVoices = matchedVoices.filter((v) => !isLowQualitySyntheticVoice(v));
  const pool = cleanVoices.length > 0 ? cleanVoices : matchedVoices;

  const alternatives = excludeVoiceName ? pool.filter((v) => v.name !== excludeVoiceName) : pool;
  if (alternatives.length > 0) {
    const localAlt = alternatives.find((v) => v.localService);
    return localAlt || alternatives[0];
  }

  return pool[0] || null;
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
  const voiceEnabledRef = useRef<boolean>(voiceEnabled);
  voiceEnabledRef.current = voiceEnabled;
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
      isVoiceMatchingLang((window as any).__sadio_best_french_voice, 'fr') &&
      !isLowQualitySyntheticVoice((window as any).__sadio_best_french_voice)
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

  interface QueuedChunk {
    text: string;
    dropRetryCount: number;
    forceDefaultVoice?: boolean;
    retriedInterrupt?: boolean;
    retriedLocal?: boolean;
  }

  interface ActiveUtteranceEntry {
    utterance: SpeechSynthesisUtterance;
    text: string;
    queuedAt: number;
    started: boolean;
    startedAt: number;
    useExplicitVoice: boolean;
    retriedLocal: boolean;
    retriedInterrupt: boolean;
    dropRetryCount: number;
    superseded: boolean;
  }

  const synthRef = useRef<SpeechSynthesis | null>(
    typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
  );
  const queueRef = useRef<QueuedChunk[]>([]);
  const pendingQueueLengthRef = useRef<number>(0);
  const inFlightCountRef = useRef<number>(0);
  const isCanceledRef = useRef<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);
  const isRetryingRef = useRef<boolean>(false);
  const isStreamingEndedRef = useRef<boolean>(true);
  const isAudioHeldRef = useRef<boolean>(false);
  const audioHoldTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const cancelCooldownTimerRef = useRef<number | null>(null);
  const lastCancelAtRef = useRef<number>(0);
  const onStartPlaybackRef = useRef<(() => void) | null>(null);
  const onQueueDrainedRef = useRef<(() => void) | null>(null);
  const onEndCallbackRef = useRef<(() => void) | null>(null);
  const activeEntriesRef = useRef<ActiveUtteranceEntry[]>([]);
  const speechSessionIdRef = useRef<number>(0);
  const forceDefaultVoiceRef = useRef<boolean>(false);
  const failedVoiceNameRef = useRef<string | null>(null);
  const watchdogTimerRef = useRef<number | null>(null);
  const currentAudioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const isVoicingRef = useRef<boolean>(false);
  const mouthOpenRef = useRef<number>(0);
  const lastWordBoundaryRef = useRef<number>(0);
  const speechAnimFrameRef = useRef<number | null>(null);

  const invalidateActiveEntries = useCallback(() => {
    for (const entry of activeEntriesRef.current) {
      entry.superseded = true;
    }
    activeEntriesRef.current = [];
  }, []);

  // Throttled (~20fps) natural syllable-cadence lip articulation loop
  useEffect(() => {
    isVoicingRef.current = isVoicing;
    let lastRenderAt = 0;

    if (isVoicing) {
      const step = (now: number) => {
        if (isVoicingRef.current) {
          const t = now * 0.001;
          const timeSinceWord = (now - lastWordBoundaryRef.current) / 1000;

          // Calm, natural human speech articulation cadence
          const wave = 0.5 + 0.5 * Math.sin(t * 9.5);
          const cadenceMod = 0.55 + 0.45 * Math.sin(t * 5.8 + 0.7);
          const microPause = Math.sin(t * 2.7) < -0.78 ? 0.18 : 1.0;
          const wordPulse = Math.max(0, 1 - timeSinceWord * 3.0) * 0.14;
          const targetOpen = Math.min(0.85, Math.max(0.1, (0.12 + 0.62 * wave * cadenceMod) * microPause + wordPulse));

          mouthOpenRef.current += (targetOpen - mouthOpenRef.current) * 0.34;
          if (now - lastRenderAt >= 50) {
            lastRenderAt = now;
            setMouthOpenLevel(mouthOpenRef.current);
          }

          speechAnimFrameRef.current = requestAnimationFrame(step);
        } else {
          mouthOpenRef.current += (0 - mouthOpenRef.current) * 0.5;
          if (mouthOpenRef.current < 0.01) {
            mouthOpenRef.current = 0;
            setMouthOpenLevel(0);
            speechAnimFrameRef.current = null;
          } else {
            if (now - lastRenderAt >= 48) {
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
    forceDefaultVoiceRef.current = false;
    failedVoiceNameRef.current = null;

    // Immediately drop any selected voice from the opposite language or low-quality voice before voices reload
    if (
      selectedVoiceRef.current &&
      (!isVoiceMatchingLang(selectedVoiceRef.current, currentLang) ||
        isLowQualitySyntheticVoice(selectedVoiceRef.current))
    ) {
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
          // Do not swap voice mid-speech if the current voice already matches the active language
          if (
            (!isPlayingRef.current && activeEntriesRef.current.length === 0) ||
            !selectedVoiceRef.current ||
            !isVoiceMatchingLang(selectedVoiceRef.current, currentLang)
          ) {
            selectedVoiceRef.current = bestVoice;
            setSelectedVoice(bestVoice);
          }
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
      };
    } else {
      setIsSupported(false);
    }
  }, [currentLang]);

  // Cancel any active speech strictly on hook unmount (never on language switch, which manages its own transition)
  useEffect(() => {
    return () => {
      invalidateActiveEntries();
      try {
        synthRef.current?.cancel();
      } catch {}
    };
  }, [invalidateActiveEntries]);

  const playNextInQueueRef = useRef<(() => void) | null>(null);

  // Fast watchdog & lossless auto-recovery engine (recovers silent drops & hangs without losing any queued chunk)
  useEffect(() => {
    let stallCount = 0;

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const synth = synthRef.current || (typeof window !== 'undefined' ? window.speechSynthesis : null);
        if (synth && synth.paused && !isPaused) {
          try {
            synth.resume();
          } catch {}
        }
        if (
          !isCanceledRef.current &&
          !isRetryingRef.current &&
          !isPaused &&
          synth &&
          !synth.speaking &&
          !synth.pending &&
          queueRef.current.length > 0
        ) {
          playNextInQueueRef.current?.();
        }
      }
    };

    if (isSpeaking && !isPaused) {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
      }

      watchdogTimerRef.current = window.setInterval(() => {
        if (isCanceledRef.current || isRetryingRef.current) return;

        const synth = synthRef.current || (typeof window !== 'undefined' ? window.speechSynthesis : null);
        if (!synth) return;

        // 1. If synthesizer was paused by OS/browser focus, resume immediately
        if (synth.paused) {
          try {
            synth.resume();
          } catch {}
        }

        const head = activeEntriesRef.current[0];
        if (!head) {
          if (queueRef.current.length > 0 || isStreamingEndedRef.current) {
            playNextInQueueRef.current?.();
          }
          return;
        }

        // If browser started speaking natively without firing onstart (common on some mobile WebViews),
        // promote head.started & activate lip movement so watchdog doesn't cancel active audio.
        if (!head.started && synth.speaking) {
          const tNow = performance.now();
          head.started = true;
          head.startedAt = tNow;
          lastWordBoundaryRef.current = tNow;
          isVoicingRef.current = true;
          setIsVoicing(true);
          setIsSpeaking(true);
          if (onStartPlaybackRef.current) {
            onStartPlaybackRef.current();
            onStartPlaybackRef.current = null;
          }
        }

        const now = performance.now();
        const elapsedSinceQueued = now - head.queuedAt;
        const elapsedSinceActive = now - (head.started ? head.startedAt : head.queuedAt);
        const activeVoiceIsExplicitRemote = head.utterance.voice?.localService === false;

        // 2. Detect frozen utterance (e.g. Chrome/Android hangs past max duration or stays stuck in synth.pending/speaking)
        const rate = Math.max(0.75, speechRateRef.current || 1.0);
        const maxExpectedMs = Math.max(12500, (head.text.length / (5.5 * rate)) * 1000 + 6000);
        const utteranceHung =
          isPlayingRef.current &&
          head.started &&
          elapsedSinceActive > maxExpectedMs;

        // 3. Detect stuck cold-start (even if synth.pending or synth.speaking stayed true without firing onstart)
        const coldStartGraceMs = activeVoiceIsExplicitRemote ? 2400 : 1500;
        const coldStartStuck =
          isPlayingRef.current &&
          !head.started &&
          elapsedSinceQueued > coldStartGraceMs;

        // 4. Detect silent mid-utterance drop where !synth.speaking && !synth.pending without onend
        const silentDrop =
          isPlayingRef.current &&
          head.started &&
          !synth.speaking &&
          !synth.pending;

        if (coldStartStuck || silentDrop || utteranceHung) {
          stallCount++;
          if (utteranceHung || coldStartStuck || stallCount >= 2) {
            stallCount = 0;
            console.warn(
              `⚡ [SADIO VOICE RECOVERY] ${utteranceHung ? 'Frozen utterance' : coldStartStuck ? 'Cold-start stuck' : 'Speech stalled silently'} ("${head.text.slice(0, 35)}..."). Recovering queue...`
            );

            const rescuedEntries = [...activeEntriesRef.current];
            invalidateActiveEntries();
            isPlayingRef.current = false;
            isRetryingRef.current = true;

            const shouldSwitchVoice =
              head.dropRetryCount >= 1 || (activeVoiceIsExplicitRemote && !head.started);
            if (shouldSwitchVoice) {
              const liveVoices = synth.getVoices();
              const altVoice = findFallbackVoice(
                liveVoices,
                currentLangRef.current,
                head.utterance.voice?.name || null
              );
              if (altVoice && altVoice.name !== head.utterance.voice?.name) {
                failedVoiceNameRef.current = head.utterance.voice?.name || null;
                forceDefaultVoiceRef.current = true;
              }
            }

            try {
              synth.cancel();
              lastCancelAtRef.current = performance.now();
              if (synth.paused) synth.resume();
            } catch {}

            // Rescue all follow-up pre-queued chunks so synth.cancel() never loses them
            const tailChunks: QueuedChunk[] = rescuedEntries.slice(1).map((e) => ({
              text: e.text,
              dropRetryCount: e.dropRetryCount,
              forceDefaultVoice: forceDefaultVoiceRef.current,
              retriedInterrupt: e.retriedInterrupt,
              retriedLocal: e.retriedLocal,
            }));

            // Retry head chunk if it never started OR stopped before ~85% of expected speech time
            const expectedSpeechMs = Math.max(1100, (head.text.length / (14 * rate)) * 1000);
            const droppedPrematurely = !head.started || (silentDrop && elapsedSinceActive < expectedSpeechMs * 0.85);
            if (droppedPrematurely && head.dropRetryCount < 3) {
              tailChunks.unshift({
                text: head.text,
                dropRetryCount: head.dropRetryCount + 1,
                forceDefaultVoice: shouldSwitchVoice && forceDefaultVoiceRef.current,
                retriedInterrupt: head.retriedInterrupt,
                retriedLocal: shouldSwitchVoice,
              });
            }

            if (tailChunks.length > 0) {
              queueRef.current.unshift(...tailChunks);
              pendingQueueLengthRef.current = queueRef.current.length;
              inFlightCountRef.current = queueRef.current.length;
            }

            if (queueRef.current.length === 0 && !isStreamingEndedRef.current) {
              onQueueDrainedRef.current?.();
            }

            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            const capturedSessionId = speechSessionIdRef.current;
            retryTimerRef.current = window.setTimeout(() => {
              retryTimerRef.current = null;
              isRetryingRef.current = false;
              if (!isCanceledRef.current && capturedSessionId === speechSessionIdRef.current) {
                playNextInQueueRef.current?.();
              }
            }, 75);
          }
        } else {
          stallCount = 0;
        }
      }, 300);
    } else if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (watchdogTimerRef.current) {
        clearInterval(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
  }, [isSpeaking, isPaused, invalidateActiveEntries]);

  const stop = useCallback(() => {
    speechSessionIdRef.current += 1;
    isCanceledRef.current = true;
    isPlayingRef.current = false;
    isRetryingRef.current = false;
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
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (cancelCooldownTimerRef.current) {
      clearTimeout(cancelCooldownTimerRef.current);
      cancelCooldownTimerRef.current = null;
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
    invalidateActiveEntries();
    if (synthRef.current) {
      try {
        if (synthRef.current.speaking || synthRef.current.pending || synthRef.current.paused) {
          synthRef.current.cancel();
          lastCancelAtRef.current = performance.now();
        }
        if (synthRef.current.paused) {
          synthRef.current.resume();
        }
      } catch {
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
    if (onEndCallbackRef.current) {
      onEndCallbackRef.current();
      onEndCallbackRef.current = null;
    }
  }, [invalidateActiveEntries]);

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

  // Gapless queue: starts with 1 utterance cleanly, then once onstart confirms active voicing,
  // pre-queues the next short chunk (max 2 in flight) for 0ms transitions without cold-start collisions.
  const playNextInQueue = useCallback(() => {
    playNextInQueueRef.current = playNextInQueue;
    if (isCanceledRef.current) {
      invalidateActiveEntries();
      isPlayingRef.current = false;
      isRetryingRef.current = false;
      isVoicingRef.current = false;
      setIsVoicing(false);
      setIsSpeaking(false);
      setCurrentSentence('');
      return;
    }

    if (isRetryingRef.current) {
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

    // Wait briefly if synth.cancel() just ran so Chromium's async cancel doesn't kill the new utterance
    const sinceCancel = performance.now() - lastCancelAtRef.current;
    if (activeEntriesRef.current.length === 0 && queueRef.current.length > 0 && sinceCancel < 70) {
      if (cancelCooldownTimerRef.current) clearTimeout(cancelCooldownTimerRef.current);
      cancelCooldownTimerRef.current = window.setTimeout(() => {
        cancelCooldownTimerRef.current = null;
        if (!isCanceledRef.current && sessionId === speechSessionIdRef.current) {
          playNextInQueue();
        }
      }, Math.ceil(70 - sinceCancel));
      return;
    }

    const activeLang = currentLangRef.current;
    const defaultLangCode = activeLang === 'en' ? 'en-US' : 'fr-FR';
    const liveVoices = synth.getVoices();

    let voiceToUse: SpeechSynthesisVoice | null = null;
    if (!forceDefaultVoiceRef.current) {
      if (
        isVoiceMatchingLang(selectedVoiceRef.current, activeLang) &&
        !isLowQualitySyntheticVoice(selectedVoiceRef.current!)
      ) {
        voiceToUse = selectedVoiceRef.current;
      } else {
        const { bestVoice: liveBestVoice } = selectBestVoiceForLang(liveVoices, activeLang);
        if (liveBestVoice) {
          selectedVoiceRef.current = liveBestVoice;
          voiceToUse = liveBestVoice;
        }
      }
    } else {
      voiceToUse =
        findFallbackVoice(liveVoices, activeLang, failedVoiceNameRef.current) ||
        (isVoiceMatchingLang(selectedVoiceRef.current, activeLang) ? selectedVoiceRef.current : null);
    }

    // Pre-buffer 1 follow-up utterance once the active head has actually started speaking
    // (eliminates cold-start pauses between sentences on desktop voices & local mobile voices)
    const isMobileBrowser =
      typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const headEntry = activeEntriesRef.current[0];
    const canPreBufferHead = Boolean(
      headEntry &&
      headEntry.started &&
      (!isMobileBrowser || headEntry.utterance.voice?.localService === true)
    );
    const maxInFlightNow = canPreBufferHead ? 2 : 1;

    while (
      !isCanceledRef.current &&
      !isRetryingRef.current &&
      sessionId === speechSessionIdRef.current &&
      activeEntriesRef.current.length < maxInFlightNow &&
      queueRef.current.length > 0
    ) {
      const nextChunk = queueRef.current.shift()!;
      pendingQueueLengthRef.current = queueRef.current.length;

      if (!hasSpeakableContent(nextChunk.text)) {
        continue;
      }

      const fallbackVoice = nextChunk.forceDefaultVoice
        ? findFallbackVoice(liveVoices, activeLang, failedVoiceNameRef.current)
        : null;
      const candidateVoice = (nextChunk.forceDefaultVoice ? fallbackVoice : null) || voiceToUse;
      const chosenVoice =
        candidateVoice && isVoiceMatchingLang(candidateVoice, activeLang) ? candidateVoice : null;
      const useExplicitVoice = Boolean(chosenVoice);

      const utterance = new SpeechSynthesisUtterance(nextChunk.text);
      if (chosenVoice) {
        utterance.voice = chosenVoice;
        utterance.lang = (chosenVoice.lang || defaultLangCode).replace('_', '-');
      } else {
        utterance.lang = defaultLangCode;
      }

      utterance.rate = speechRateRef.current || 1.0;
      utterance.pitch = speechPitchRef.current ?? 1.0;
      utterance.volume = 1.0;

      const now = performance.now();
      const entry: ActiveUtteranceEntry = {
        utterance,
        text: nextChunk.text,
        queuedAt: now,
        started: false,
        startedAt: now,
        useExplicitVoice,
        retriedLocal: Boolean(nextChunk.retriedLocal),
        retriedInterrupt: Boolean(nextChunk.retriedInterrupt),
        dropRetryCount: nextChunk.dropRetryCount,
        superseded: false,
      };

      activeEntriesRef.current.push(entry);
      inFlightCountRef.current = activeEntriesRef.current.length + queueRef.current.length;
      isPlayingRef.current = true;
      setIsSpeaking(true);

      if (activeEntriesRef.current.length === 1) {
        setCurrentSentence(entry.text);
      }

      if (typeof window !== 'undefined') {
        const win = window as any;
        win.__activeSpeechUtterances = win.__activeSpeechUtterances || [];
        win.__activeSpeechUtterances.push(utterance);
      }

      const removeEntryRef = (target: ActiveUtteranceEntry) => {
        activeEntriesRef.current = activeEntriesRef.current.filter((item) => item !== target);
        inFlightCountRef.current = activeEntriesRef.current.length + queueRef.current.length;
        if (typeof window !== 'undefined') {
          const win = window as any;
          if (Array.isArray(win.__activeSpeechUtterances)) {
            const idx = win.__activeSpeechUtterances.indexOf(target.utterance);
            if (idx !== -1) win.__activeSpeechUtterances.splice(idx, 1);
          }
        }
      };

      const scheduleQueueTopUp = (delayMs = 10) => {
        window.setTimeout(() => {
          if (isCanceledRef.current || sessionId !== speechSessionIdRef.current) return;
          if (queueRef.current.length === 0 && activeEntriesRef.current.length === 0 && !isStreamingEndedRef.current) {
            onQueueDrainedRef.current?.();
          }
          if (!isCanceledRef.current && !isRetryingRef.current && sessionId === speechSessionIdRef.current) {
            playNextInQueue();
          }
        }, delayMs);
      };

      utterance.onstart = () => {
        if (entry.superseded || isCanceledRef.current || sessionId !== speechSessionIdRef.current) return;
        const tNow = performance.now();
        entry.started = true;
        entry.startedAt = tNow;
        lastWordBoundaryRef.current = tNow;
        isVoicingRef.current = true;
        setIsVoicing(true);
        setIsSpeaking(true);
        setIsPaused(false);
        setSpeechError(null);
        setCurrentSentence(entry.text);
        if (onStartPlaybackRef.current) {
          onStartPlaybackRef.current();
          onStartPlaybackRef.current = null;
        }
        // Pre-buffer next utterance immediately after onstart for gapless transitions
        const isMobileClient =
          typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        if (
          activeEntriesRef.current[0] === entry &&
          activeEntriesRef.current.length < 2 &&
          queueRef.current.length > 0 &&
          (!isMobileClient || entry.utterance.voice?.localService === true)
        ) {
          scheduleQueueTopUp(0);
        }
      };

      utterance.onboundary = () => {
        if (entry.superseded || isCanceledRef.current || sessionId !== speechSessionIdRef.current) return;
        lastWordBoundaryRef.current = performance.now();
      };

      utterance.onend = () => {
        removeEntryRef(entry);
        if (entry.superseded || isCanceledRef.current || sessionId !== speechSessionIdRef.current) return;
        sentenceIndexRef.current++;
        setCurrentSentenceIndex(sentenceIndexRef.current);

        if (activeEntriesRef.current.length > 0) {
          const nextHead = activeEntriesRef.current[0];
          nextHead.queuedAt = performance.now();
          // Top up the look-ahead slot right away without interrupting the already-queued nextHead
          scheduleQueueTopUp(0);
        } else {
          if (queueRef.current.length === 0 && !isStreamingEndedRef.current) {
            onQueueDrainedRef.current?.();
          }
          // Dispatch immediately on the same tick to minimize inter-sentence gap
          if (!isCanceledRef.current && !isRetryingRef.current && sessionId === speechSessionIdRef.current) {
            playNextInQueueRef.current?.();
          }
        }
      };

      utterance.onerror = (e) => {
        if (entry.superseded || isCanceledRef.current || sessionId !== speechSessionIdRef.current) {
          removeEntryRef(entry);
          return;
        }
        console.warn('SpeechSynthesis error:', e.error);
        const wasHead = activeEntriesRef.current[0] === entry;
        removeEntryRef(entry);

        if (e.error === 'not-allowed') {
          isRetryingRef.current = false;
          isPlayingRef.current = false;
          isVoicingRef.current = false;
          setIsVoicing(false);
          setIsSpeaking(false);
          setSpeechError("🔊 Cliquez sur SADIO ou sur l'écran pour activer la voix du robot !");
          return;
        }

        const isInterruptErr = e.error === 'interrupted' || e.error === 'canceled';
        const isVoiceOrNetErr =
          e.error === 'network' ||
          e.error === 'synthesis-failed' ||
          e.error === 'synthesis-unavailable' ||
          e.error === 'voice-unavailable' ||
          e.error === 'language-unavailable' ||
          e.error === 'audio-hardware';

        if ((isInterruptErr && !entry.retriedInterrupt) || (isVoiceOrNetErr && (!entry.retriedLocal || entry.dropRetryCount < 2))) {
          let switchedToAlternative = false;
          if (isVoiceOrNetErr) {
            const altVoice = findFallbackVoice(
              synth.getVoices(),
              currentLangRef.current,
              entry.utterance.voice?.name || null
            );
            if (altVoice && altVoice.name !== entry.utterance.voice?.name) {
              failedVoiceNameRef.current = entry.utterance.voice?.name || null;
              forceDefaultVoiceRef.current = true;
              switchedToAlternative = true;
            }
          }

          // Preserve strict sentence order and mark cancelled followers superseded so their async onerror is ignored
          if (wasHead && activeEntriesRef.current.length > 0) {
            const followers = activeEntriesRef.current.map((f) => {
              f.superseded = true;
              return {
                text: f.text,
                dropRetryCount: f.dropRetryCount,
                forceDefaultVoice: switchedToAlternative || forceDefaultVoiceRef.current,
                retriedInterrupt: f.retriedInterrupt,
                retriedLocal: f.retriedLocal,
              };
            });
            activeEntriesRef.current = [];
            try {
              synth.cancel();
              lastCancelAtRef.current = performance.now();
            } catch {}
            queueRef.current.unshift(...followers);
          }

          queueRef.current.unshift({
            text: entry.text,
            dropRetryCount: entry.dropRetryCount + (isVoiceOrNetErr && entry.retriedLocal ? 1 : 0),
            forceDefaultVoice: switchedToAlternative,
            retriedInterrupt: entry.retriedInterrupt || isInterruptErr,
            retriedLocal: entry.retriedLocal || isVoiceOrNetErr,
          });
          pendingQueueLengthRef.current = queueRef.current.length;
          inFlightCountRef.current = activeEntriesRef.current.length + queueRef.current.length;

          isRetryingRef.current = true;
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          const backoffMs = isVoiceOrNetErr && entry.retriedLocal ? 220 : 70;
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            isRetryingRef.current = false;
            if (!isCanceledRef.current && sessionId === speechSessionIdRef.current) {
              playNextInQueue();
            }
          }, backoffMs);
          return;
        }

        scheduleQueueTopUp(15);
      };

      try {
        if (synth.paused) synth.resume();
        synth.speak(utterance);
      } catch {
        removeEntryRef(entry);
        scheduleQueueTopUp(15);
      }
    }

    if (!isRetryingRef.current && activeEntriesRef.current.length === 0 && queueRef.current.length === 0) {
      inFlightCountRef.current = 0;
      isPlayingRef.current = false;
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
  }, [invalidateActiveEntries]);

  // Real-time progressive streaming speech - INSTANT, starts speaking immediately!
  const startStreamingSpeech = useCallback(
    (onStartPlayback?: () => void, onQueueDrained?: () => void, overrideLang?: 'fr' | 'en') => {
      if (overrideLang) {
        currentLangRef.current = overrideLang;
      }
      if (!synthRef.current) return;
      unlockAudioContext();
      if (synthRef.current.paused) {
        try {
          synthRef.current.resume();
        } catch {}
      }
      speechSessionIdRef.current += 1;
      forceDefaultVoiceRef.current = false;
      failedVoiceNameRef.current = null;
      isCanceledRef.current = false;
      isRetryingRef.current = false;
      isStreamingEndedRef.current = false;
      isPlayingRef.current = false;
      isAudioHeldRef.current = false;
      queueRef.current = [];
      pendingQueueLengthRef.current = 0;
      inFlightCountRef.current = 0;
      invalidateActiveEntries();

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (cancelCooldownTimerRef.current) {
        clearTimeout(cancelCooldownTimerRef.current);
        cancelCooldownTimerRef.current = null;
      }

      try {
        if (synthRef.current.speaking || synthRef.current.paused || synthRef.current.pending) {
          synthRef.current.cancel();
          lastCancelAtRef.current = performance.now();
          if (synthRef.current.paused) synthRef.current.resume();
        }
      } catch {
        // ignore
      }

      if (audioHoldTimerRef.current) {
        clearTimeout(audioHoldTimerRef.current);
        audioHoldTimerRef.current = null;
      }

      onStartPlaybackRef.current = onStartPlayback || null;
      onQueueDrainedRef.current = onQueueDrained || null;
    },
    [invalidateActiveEntries]
  );

  const enqueueStreamingSentence = useCallback(
    (sentence: string) => {
      if (isCanceledRef.current || !synthRef.current || !voiceEnabledRef.current) return;

      const cleaned = cleanTextForSpeech(sentence, currentLangRef.current);
      if (!cleaned || !hasSpeakableContent(cleaned)) return;

      const pieces = splitIntoSentences(cleaned, 155);
      let added = 0;
      for (const piece of pieces) {
        if (hasSpeakableContent(piece)) {
          queueRef.current.push({ text: piece, dropRetryCount: 0 });
          added++;
        }
      }
      if (added === 0) return;

      pendingQueueLengthRef.current = queueRef.current.length;
      inFlightCountRef.current = activeEntriesRef.current.length + queueRef.current.length;

      setIsSpeaking(true);
      if (!isPlayingRef.current && onStartPlaybackRef.current) {
        onStartPlaybackRef.current();
        onStartPlaybackRef.current = null;
      }
      const isMobileBrowser =
        typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const head = activeEntriesRef.current[0];
      const canPreBufferHead = Boolean(
        head?.started && (!isMobileBrowser || head.utterance.voice?.localService === true)
      );
      const canQueueMore = activeEntriesRef.current.length === 0 || (canPreBufferHead && activeEntriesRef.current.length < 2);
      if (canQueueMore && !isRetryingRef.current) {
        playNextInQueue();
      }
    },
    [playNextInQueue]
  );

  const finishStreamingSpeech = useCallback(
    (remainingText?: string, onEnd?: () => void) => {
      isStreamingEndedRef.current = true;
      onQueueDrainedRef.current = null;
      onEndCallbackRef.current = onEnd || null;

      if (remainingText) {
        const cleaned = cleanTextForSpeech(remainingText, currentLangRef.current);
        if (cleaned && hasSpeakableContent(cleaned)) {
          const pieces = splitIntoSentences(cleaned, 155);
          for (const piece of pieces) {
            if (hasSpeakableContent(piece)) {
              const formatted = /[.!?…,:;]$/.test(piece) ? piece : `${piece}.`;
              queueRef.current.push({ text: formatted, dropRetryCount: 0 });
            }
          }
          pendingQueueLengthRef.current = queueRef.current.length;
          inFlightCountRef.current = activeEntriesRef.current.length + queueRef.current.length;
        }
      }

      if (queueRef.current.length > 0 && !isRetryingRef.current) {
        playNextInQueue();
      } else if (activeEntriesRef.current.length === 0 && !isPlayingRef.current && !isRetryingRef.current) {
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

  // Greeting playback: uses browser native SpeechSynthesis directly (synchronous on user gestures when idle)
  const speakGreeting = useCallback(
    (
      text: string,
      onEnd?: (didStart?: boolean) => void,
      overrideLang?: 'fr' | 'en',
      onStart?: () => void
    ) => {
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
        onEnd?.(false);
        return;
      }

      invalidateActiveEntries();
      let hadToCancel = false;
      try {
        if (synth.paused) synth.resume();
        if (synth.speaking || synth.pending) {
          hadToCancel = true;
          synth.cancel();
          lastCancelAtRef.current = performance.now();
        }
        if (synth.paused) synth.resume();
      } catch {}

      speechSessionIdRef.current += 1;
      forceDefaultVoiceRef.current = false;
      failedVoiceNameRef.current = null;
      const sessionId = speechSessionIdRef.current;
      isCanceledRef.current = false;
      isRetryingRef.current = false;
      isPlayingRef.current = true;
      isStreamingEndedRef.current = true;
      queueRef.current = [];
      pendingQueueLengthRef.current = 0;
      onEndCallbackRef.current = onEnd ? () => onEnd(false) : null;

      const defaultLangCode = activeLang === 'en' ? 'en-US' : 'fr-FR';
      const liveVoices = synth.getVoices();
      const { bestVoice: liveBestVoice } = selectBestVoiceForLang(liveVoices, activeLang);
      const rawVoiceToUse =
        isVoiceMatchingLang(selectedVoiceRef.current, activeLang) &&
        !isLowQualitySyntheticVoice(selectedVoiceRef.current!)
          ? selectedVoiceRef.current
          : liveBestVoice;
      const voiceToUse =
        rawVoiceToUse && isVoiceMatchingLang(rawVoiceToUse, activeLang) ? rawVoiceToUse : null;
      if (voiceToUse) {
        selectedVoiceRef.current = voiceToUse;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      if (voiceToUse) {
        utterance.voice = voiceToUse;
        utterance.lang = (voiceToUse.lang || defaultLangCode).replace('_', '-');
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

      const now = performance.now();
      const entry: ActiveUtteranceEntry = {
        utterance,
        text,
        queuedAt: now,
        started: false,
        startedAt: now,
        useExplicitVoice: Boolean(voiceToUse),
        retriedLocal: false,
        retriedInterrupt: false,
        dropRetryCount: 0,
        superseded: false,
      };

      if (typeof window !== 'undefined') {
        const win = window as any;
        win.__activeSpeechUtterances = win.__activeSpeechUtterances || [];
        win.__activeSpeechUtterances.push(utterance);
        win.__sadio_active_utterance = utterance;
      }
      activeEntriesRef.current = [entry];

      const cleanupGreetingUtterance = () => {
        activeEntriesRef.current = activeEntriesRef.current.filter((item) => item !== entry);
        if (typeof window !== 'undefined') {
          const win = window as any;
          win.__sadio_active_utterance = null;
          if (Array.isArray(win.__activeSpeechUtterances)) {
            const idx = win.__activeSpeechUtterances.indexOf(utterance);
            if (idx !== -1) win.__activeSpeechUtterances.splice(idx, 1);
          }
        }
      };

      let autoplayCheckTimer: number | null = null;
      let pendingStallTimer: number | null = null;
      const clearAutoplayTimer = () => {
        if (autoplayCheckTimer !== null) {
          clearTimeout(autoplayCheckTimer);
          autoplayCheckTimer = null;
        }
        if (pendingStallTimer !== null) {
          clearTimeout(pendingStallTimer);
          pendingStallTimer = null;
        }
      };

      utterance.onstart = () => {
        if (entry.superseded || isCanceledRef.current || sessionId !== speechSessionIdRef.current) return;
        clearAutoplayTimer();
        const tNow = performance.now();
        entry.started = true;
        entry.startedAt = tNow;
        isVoicingRef.current = true;
        setIsVoicing(true);
        setIsSpeaking(true);
        setIsPaused(false);
        setSpeechError(null);
        setCurrentSentence(text);
        lastWordBoundaryRef.current = tNow;
        onEndCallbackRef.current = onEnd ? () => onEnd(true) : null;
        onStart?.();
      };

      utterance.onboundary = () => {
        if (entry.superseded || isCanceledRef.current || sessionId !== speechSessionIdRef.current) return;
        lastWordBoundaryRef.current = performance.now();
      };

      utterance.onend = () => {
        clearAutoplayTimer();
        if (entry.superseded || sessionId !== speechSessionIdRef.current) return;
        cleanupGreetingUtterance();
        isVoicingRef.current = false;
        setIsVoicing(false);
        mouthOpenRef.current = 0;
        setMouthOpenLevel(0);
        isPlayingRef.current = false;
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentSentence('');
        onEndCallbackRef.current = null;
        onEnd?.(entry.started);
      };

      utterance.onerror = (e) => {
        clearAutoplayTimer();
        if (entry.superseded || sessionId !== speechSessionIdRef.current) {
          cleanupGreetingUtterance();
          return;
        }
        console.warn('SpeechSynthesis greeting error:', e.error);
        cleanupGreetingUtterance();
        isVoicingRef.current = false;
        setIsVoicing(false);
        mouthOpenRef.current = 0;
        setMouthOpenLevel(0);
        isPlayingRef.current = false;
        setIsSpeaking(false);
        setCurrentSentence('');
        onEndCallbackRef.current = null;

        if (e.error === 'not-allowed') {
          setSpeechError("🔊 Touchez SADIO ou l'écran pour activer la voix du robot !");
        }
        onEnd?.(false);
      };

      const invokeGreetingSpeak = () => {
        if (entry.superseded || isCanceledRef.current || sessionId !== speechSessionIdRef.current) return;
        try {
          if (synth.paused) synth.resume();
          synth.speak(utterance);
          if (synth.paused) synth.resume();
          // Detect silent autoplay blocks (e.g. page load without user gesture on Chrome/Safari)
          autoplayCheckTimer = window.setTimeout(() => {
            autoplayCheckTimer = null;
            if (
              !entry.started &&
              !entry.superseded &&
              !isCanceledRef.current &&
              sessionId === speechSessionIdRef.current &&
              !synth.speaking &&
              !synth.pending
            ) {
              clearAutoplayTimer();
              cleanupGreetingUtterance();
              isVoicingRef.current = false;
              setIsVoicing(false);
              isPlayingRef.current = false;
              setIsSpeaking(false);
              setCurrentSentence('');
              onEndCallbackRef.current = null;
              onEnd?.(false);
            }
          }, 700);
          // Fallback if browser holds utterance silently in synth.pending without starting
          pendingStallTimer = window.setTimeout(() => {
            pendingStallTimer = null;
            if (
              !entry.started &&
              !entry.superseded &&
              !isCanceledRef.current &&
              sessionId === speechSessionIdRef.current
            ) {
              try {
                synth.cancel();
                lastCancelAtRef.current = performance.now();
              } catch {}
              cleanupGreetingUtterance();
              isVoicingRef.current = false;
              setIsVoicing(false);
              isPlayingRef.current = false;
              setIsSpeaking(false);
              setCurrentSentence('');
              onEndCallbackRef.current = null;
              onEnd?.(false);
            }
          }, 2200);
        } catch (err) {
          console.error('Error invoking synth.speak for greeting:', err);
          clearAutoplayTimer();
          cleanupGreetingUtterance();
          isPlayingRef.current = false;
          setIsSpeaking(false);
          onEndCallbackRef.current = null;
          onEnd?.(false);
        }
      };

      // Speak synchronously inside user gesture when nothing was cancelled so Safari/mobile allow audio!
      // Also honor recent stopSpeech()/cancel() within 75ms so Chromium's async cancel doesn't swallow the new utterance.
      const justCanceled = hadToCancel || performance.now() - lastCancelAtRef.current < 75;
      if (justCanceled) {
        setTimeout(invokeGreetingSpeak, 65);
      } else {
        invokeGreetingSpeak();
      }
    },
    [unlockAudioContext, invalidateActiveEntries]
  );

  // Play full text at once (for "Écouter" button on message history)
  const speak = useCallback(
    (rawText: string, lang?: string, onEnd?: () => void, singleSentenceMode = false) => {
      const normalizedLang: 'fr' | 'en' | undefined =
        typeof lang === 'string' && lang.trim().length > 0
          ? lang.toLowerCase().startsWith('en')
            ? 'en'
            : 'fr'
          : undefined;
      if (normalizedLang) {
        currentLangRef.current = normalizedLang;
      }

      // If the text is the greeting, route immediately to speakGreeting
      if (
        rawText.includes("SADIO, votre avatar robot") ||
        rawText.includes("Sadio, votre avatar robot") ||
        rawText.includes("I am SADIO, your intelligent robot avatar") ||
        (typeof window !== 'undefined' && rawText === (window as any).__SADIO_GREETING_TEXT)
      ) {
        speakGreeting(rawText, onEnd, normalizedLang);
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
      invalidateActiveEntries();

      if (synthRef.current.paused) {
        try {
          synthRef.current.resume();
        } catch {}
      }

      if (synthRef.current.speaking || synthRef.current.pending) {
        try {
          synthRef.current.cancel();
          lastCancelAtRef.current = performance.now();
          if (synthRef.current.paused) synthRef.current.resume();
        } catch {
          // ignore
        }
      }
      speechSessionIdRef.current += 1;
      forceDefaultVoiceRef.current = false;
      failedVoiceNameRef.current = null;
      isCanceledRef.current = false;
      isRetryingRef.current = false;
      isPlayingRef.current = false;
      isStreamingEndedRef.current = true;
      queueRef.current = [];
      pendingQueueLengthRef.current = 0;

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      const cleaned = cleanTextForSpeech(rawText, currentLangRef.current);
      if (!cleaned || !hasSpeakableContent(cleaned)) {
        onEnd?.();
        return;
      }

      const chunksToSpeak = (
        singleSentenceMode ? splitTextIntoSentences(cleaned) : splitIntoSentences(cleaned, 155)
      ).filter((c) => hasSpeakableContent(c));

      if (chunksToSpeak.length === 0) {
        onEnd?.();
        return;
      }

      // Queue chunks cleanly (playNextInQueue automatically honors cancel cooldown if we just cancelled)
      sentenceIndexRef.current = 0;
      setCurrentSentenceIndex(0);
      isCanceledRef.current = false;
      isPlayingRef.current = false;
      isStreamingEndedRef.current = true;
      onEndCallbackRef.current = onEnd || null;
      queueRef.current = chunksToSpeak.map((text) => ({ text, dropRetryCount: 0 }));
      pendingQueueLengthRef.current = queueRef.current.length;
      setIsSpeaking(true);
      setIsPaused(false);
      setSpeechError(null);

      playNextInQueue();
    },
    [playNextInQueue, speakGreeting, invalidateActiveEntries]
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
    forceDefaultVoiceRef.current = false;
    failedVoiceNameRef.current = null;
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
    const activeLang = currentLangRef.current;
    const testMsg =
      activeLang === 'en'
        ? "Hello! I am SADIO, your intelligent robot avatar. My browser voice is now active, clear, and fluent."
        : "Bonjour ! Je suis SADIO, votre avatar robot intelligent. Ma voix du navigateur est désormais active, claire et fluide.";
    speakGreeting(testMsg, undefined, activeLang);
  }, [speakGreeting, unlockAudioContext]);

  const testSpecificVoice = useCallback((voice: SpeechSynthesisVoice) => {
    unlockAudioContext();
    if (!synthRef.current && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
    const synth = synthRef.current;
    if (!synth) return;
    try {
      synth.cancel();
      lastCancelAtRef.current = performance.now();
    } catch {}
    const activeLang = currentLangRef.current;
    const defaultLangCode = activeLang === 'en' ? 'en-US' : 'fr-FR';
    const testPhrase =
      activeLang === 'en'
        ? "Hello! I am testing the premium voice of SADIO."
        : "Bonjour ! Je teste la voix premium de SADIO.";
    const utterance = new SpeechSynthesisUtterance(testPhrase);
    utterance.voice = voice;
    utterance.lang = voice.lang || defaultLangCode;
    utterance.rate = speechRateRef.current || 1.0;
    utterance.pitch = speechPitchRef.current ?? 1.0;
    utterance.volume = 1.0;
    synth.speak(utterance);
  }, [unlockAudioContext]);

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
    speakGreeting,
    pause,
    resume,
    stop,
    testVoice,
    testSpecificVoice,
    unlockAudioContext,
  };
}
