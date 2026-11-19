import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StandingRobotAvatar } from './components/StandingRobotAvatar';
import { SettingsModal } from './components/SettingsModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { Header } from './components/Header';
import { AuthModal } from './components/AuthModal';
import { SubscriptionModal } from './components/SubscriptionModal';
import { DOMAINS } from './data/domains';
import { ChatMessage, DomainCategory, RobotState, RobotTheme } from './types/chat';
import { UserProfile, AccessStatus } from './types/auth';
import { useSpeechSynthesis, cleanTextForSpeech, splitIntoSentences } from './hooks/useSpeechSynthesis';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { safeStorage } from './utils/storage';
import {
  Send,
  Mic,
  MicOff,
  Sparkles,
  Volume2,
  Square,
  Play,
  Pause,
  Cpu,
  Copy,
  Check,
  X,
  Image as ImageIcon,
  FileText,
  Radio,
  Download,
} from 'lucide-react';
import { processImageFile, formatFileSize, ProcessedImage } from './utils/imageCompressor';
import { ChatMessageItem } from './components/ChatMessageItem';
import { KaraokeReaderModal } from './components/KaraokeReaderModal';
import { exportTextAsAudioPodcast } from './utils/audioPodcastExporter';
import {
  Language,
  getStoredLanguage,
  saveStoredLanguage,
  TRANSLATIONS,
} from './utils/i18n';

const THEME_KEY = 'robo_omni_theme_v2';
const HIDE_TEXT_KEY = 'robo_omni_hide_response_text_v1';

const SPEECH_ABBREVIATIONS = new Set([
  'm', 'mme', 'mlle', 'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr',
  'etc', 'cf', 'ex', 'fig', 'vol', 'art', 'ch', 'p', 'pp', 'st', 'ste',
  'av', 'bd', 'env', 'approx', 'vs', 'inc', 'ltd', 'co',
]);

const DANGLING_WORDS = new Set([
  'à', 'de', 'du', 'des', 'le', 'la', 'les', 'un', 'une', 'en', 'au', 'aux',
  'et', 'ou', 'qui', 'que', 'pour', 'dans', 'sur', 'avec', 'par', 'sans', 'chez',
  'to', 'the', 'a', 'an', 'in', 'on', 'at', 'of', 'for', 'and', 'or', 'with', 'by',
]);

function extractNextSpeechChunk(
  unparsed: string,
  isFirstChunk: boolean,
  speechCaughtUp: boolean,
  inFlightCount: number
): { rawChunk: string; consumedLength: number; isHardFallback: boolean } | null {
  if (!unparsed || unparsed.length < 12) return null;

  const searchLimit = Math.min(unparsed.length, 340);
  const boundaries: number[] = [];

  for (let i = 0; i < searchLimit; i++) {
    const ch = unparsed[i];

    // Paragraph break (\n\n+)
    if (ch === '\n' && unparsed[i + 1] === '\n') {
      let endIdx = i + 2;
      while (endIdx < unparsed.length && /\s/.test(unparsed[endIdx])) {
        endIdx++;
      }
      if (i >= 15) {
        boundaries.push(endIdx);
      }
      i = endIdx - 1;
      continue;
    }

    if (ch === '.' || ch === '!' || ch === '?' || ch === '…') {
      let endPunct = i;
      while (
        endPunct + 1 < unparsed.length &&
        (unparsed[endPunct + 1] === '.' ||
          unparsed[endPunct + 1] === '!' ||
          unparsed[endPunct + 1] === '?' ||
          unparsed[endPunct + 1] === '…')
      ) {
        endPunct++;
      }

      // Skip decimals like 3.14
      if (
        ch === '.' &&
        i > 0 &&
        /\d/.test(unparsed[i - 1]) &&
        endPunct + 1 < unparsed.length &&
        /\d/.test(unparsed[endPunct + 1])
      ) {
        i = endPunct;
        continue;
      }

      // Advance past optional closing quotes/parens
      let afterPunct = endPunct + 1;
      while (afterPunct < unparsed.length && /["'»”’)\]]/.test(unparsed[afterPunct])) {
        afterPunct++;
      }

      // Require trailing whitespace so we never cut mid-token or mid-ellipsis while streaming
      if (afterPunct >= unparsed.length || !/\s/.test(unparsed[afterPunct])) {
        i = endPunct;
        continue;
      }

      const preceding = unparsed.slice(0, i).trim();

      // Skip list prefixes like "1." or "2." at start of line/chunk
      if (ch === '.' && /(?:^|\n)\s*\d{1,3}$/.test(preceding)) {
        i = endPunct;
        continue;
      }

      // Skip known abbreviations like "M.", "Dr.", "etc."
      if (ch === '.' && endPunct === i) {
        const wordMatch = preceding.match(/([A-Za-zÀ-ÿ]+)$/);
        if (wordMatch && SPEECH_ABBREVIATIONS.has(wordMatch[1].toLowerCase())) {
          continue;
        }
      }

      let consumed = afterPunct;
      while (consumed < unparsed.length && /\s/.test(unparsed[consumed])) {
        consumed++;
      }

      // Wait before splitting an ellipsis ("...") if the next word hasn't arrived yet so we can detect lowercase continuations
      const isEllipsis = endPunct > i || ch === '…';
      const nextChar = unparsed[consumed] || '';
      if (isEllipsis && !nextChar) {
        i = endPunct;
        continue;
      }
      // If punctuation is followed by a lowercase word, do NOT split mid-sentence ("Awa va à... l'école")
      if (nextChar && /[a-zà-öø-ÿ]/.test(nextChar)) {
        i = endPunct;
        continue;
      }

      if (afterPunct >= 12) {
        boundaries.push(consumed);
      }
      i = endPunct;
    }
  }

  if (boundaries.length > 0) {
    // 1. Very first sentence: emit immediately at boundaries[0] for 0ms startup latency
    if (isFirstChunk) {
      const cut = boundaries[0];
      return { rawChunk: unparsed.slice(0, cut), consumedLength: cut, isHardFallback: false };
    }

    // Group as many complete sentences as fit cleanly under 220 chars
    let bestCut = boundaries[0];
    for (const b of boundaries) {
      if (b <= 220) {
        bestCut = b;
      } else {
        break;
      }
    }

    // 2. If playback caught up or nothing is currently playing/queued, flush immediately
    if (speechCaughtUp || inFlightCount === 0) {
      return {
        rawChunk: unparsed.slice(0, bestCut),
        consumedLength: bestCut,
        isHardFallback: false,
      };
    }

    // 3. While audio is actively speaking, batch consecutive short sentences into ~150-220 char passages
    // so the browser TTS engine reads across periods seamlessly with zero inter-sentence pauses.
    if (bestCut < 150 && unparsed.length < 210) {
      return null;
    }

    return {
      rawChunk: unparsed.slice(0, bestCut),
      consumedLength: bestCut,
      isHardFallback: false,
    };
  }

  // Only if a giant unpunctuated run-on exceeds 420 chars with ZERO sentence punctuation:
  // break at a safe clause boundary (never after 'à', 'de', "l'", etc.) and NEVER add a fake period.
  if (unparsed.length > 420) {
    for (let idx = 380; idx >= 180; idx--) {
      const ch = unparsed[idx];
      const nextCh = unparsed[idx + 1];
      if ((ch === ';' || ch === ':' || ch === ',' || ch === '\n') && (!nextCh || /\s/.test(nextCh))) {
        const left = unparsed.slice(0, idx).trim();
        const lastWord = (left.match(/([A-Za-zÀ-ÿ'’]+)$/)?.[1] || '').toLowerCase();
        if (!DANGLING_WORDS.has(lastWord) && !/['’]$/.test(left)) {
          let consumed = idx + 1;
          while (consumed < unparsed.length && /\s/.test(unparsed[consumed])) {
            consumed++;
          }
          return { rawChunk: unparsed.slice(0, idx + 1), consumedLength: consumed, isHardFallback: true };
        }
      }
    }

    // Extreme fallback: safe word boundary where left side doesn't end in dangling word/apostrophe
    for (let idx = 360; idx >= 180; idx--) {
      if (/\s/.test(unparsed[idx])) {
        const left = unparsed.slice(0, idx).trim();
        const lastWord = (left.match(/([A-Za-zÀ-ÿ'’]+)$/)?.[1] || '').toLowerCase();
        if (left.length >= 40 && !DANGLING_WORDS.has(lastWord) && !/['’]$/.test(left)) {
          let consumed = idx + 1;
          while (consumed < unparsed.length && /\s/.test(unparsed[consumed])) {
            consumed++;
          }
          return { rawChunk: left, consumedLength: consumed, isHardFallback: true };
        }
      }
    }
  }

  return null;
}

export default function App() {
  const [language, setLanguage] = useState<Language>(() => getStoredLanguage());
  const languageRef = useRef<Language>(language);
  languageRef.current = language;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const initialLang = getStoredLanguage();
    return [
      {
        id: 'init-msg-1',
        role: 'model',
        content: TRANSLATIONS[initialLang].greeting.content,
        timestamp: Date.now(),
        domain: 'Tous Domaines',
      },
    ];
  });
  const [input, setInput] = useState('');
  const [robotState, setRobotState] = useState<RobotState>('idle');
  const [currentDomain, setCurrentDomain] = useState<DomainCategory>(DOMAINS[0]);
  const [theme, setTheme] = useState<RobotTheme>(() => {
    return (safeStorage.getItem(THEME_KEY) as RobotTheme) || 'cyan';
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  // Response text display state (always true/visible by default so text displays when robot reads)
  const [hideResponseText, setHideResponseText] = useState<boolean>(() => {
    try {
      const saved = safeStorage.getItem(HIDE_TEXT_KEY);
      if (saved !== null) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return false;
  });

  const [chatErrorMessage, setChatErrorMessage] = useState<string | null>(null);
  const [isResponseCardDismissed, setIsResponseCardDismissed] = useState<boolean>(false);
  const [copiedResponse, setCopiedResponse] = useState<boolean>(false);

  // DeepSeek Primary Brain Key (Configurable directly from device)
  const [deepSeekKey, setDeepSeekKey] = useState<string>(() => {
    return safeStorage.getItem('sadio_deepseek_api_key') || '';
  });

  // Gemini Vision Image analysis state
  const [selectedImage, setSelectedImage] = useState<ProcessedImage | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);

  const toggleHideResponseText = () => {
    setHideResponseText((prev) => {
      const next = !prev;
      try {
        safeStorage.setItem(HIDE_TEXT_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // 5-second reflection delay state
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingSeconds, setThinkingSeconds] = useState<number | null>(null);
  const thinkingTimerRef = useRef<number | null>(null);
  const thinkingTimeoutRef = useRef<number | null>(null);

  // Warm Greeting on entrance state
  const [isGreeting, setIsGreeting] = useState(true);
  const greetingTriggeredRef = useRef(false);
  const greetingAudioPlayedRef = useRef(false);
  const isBusyThinkingOrRespondingRef = useRef(false);

  // Proposition 2: Bandeau de Sous-titres Cybernétiques (Style Cinéma / HUD)
  const [showFullTextModal, setShowFullTextModal] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentRequestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentAccumulatedTextRef = useRef<string>('');
  const messagesRef = useRef<ChatMessage[]>(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Authentication & 3-Day Free Trial State
  const [token, setToken] = useState<string | null>(() => {
    return safeStorage.getItem('sadio_auth_token');
  });
  const [user, setUser] = useState<UserProfile | null>(null);
  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [paymentBannerMessage, setPaymentBannerMessage] = useState<string | null>(null);

  // Free Discovery Demo question for new visitors (enables testing before registering)
  const [guestQuestionsUsed, setGuestQuestionsUsed] = useState<number>(() => {
    const saved = safeStorage.getItem('sadio_guest_questions_used');
    return saved ? parseInt(saved, 10) : 0;
  });

  // Load session from token
  useEffect(() => {
    const savedToken = safeStorage.getItem('sadio_auth_token');
    if (savedToken) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${savedToken}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.authenticated && data.user) {
            setUser(data.user);
            setAccess(data.access);
            setToken(savedToken);
          } else {
            safeStorage.removeItem('sadio_auth_token');
            setToken(null);
            setUser(null);
            setAccess(null);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Check server health and API key presence on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          console.log('🤖 [SADIO DIAGNOSTIC SERVEUR] État des clés IA sur le serveur :', {
            gemini: data.hasApiKey ? '✅ Active' : '❌ Absente',
            deepseek: data.hasDeepSeekKey ? `✅ Active sur le serveur (${data.deepSeekKeyMasked})` : '❌ Absente des variables Render',
          });
          if (data.hasApiKey === false && data.hasDeepSeekKey === false) {
            setChatErrorMessage(
              "⚠️ Aucune clé IA détectée sur le serveur. Veuillez configurer DEEPSEEK_API_KEY ou GEMINI_API_KEY dans votre tableau de bord Render.com."
            );
          }
        }
      })
      .catch(() => {});
  }, []);

  // Handle Bictorys payment return URL (?payment_status=success or ?payment_status=cancel)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('payment_status');

    if (status === 'success') {
      setPaymentBannerMessage('Paiement confirmé ! Votre abonnement de 30 jours à SADIO AI est désormais actif.');
      const savedToken = safeStorage.getItem('sadio_auth_token');
      if (savedToken) {
        fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${savedToken}` },
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.authenticated && data.user) {
              setUser(data.user);
              setAccess(data.access);
            }
          })
          .catch(() => {});
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (status === 'cancel') {
      setPaymentBannerMessage('La transaction a été annulée. Votre compte reste inchangé.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore
      }
    }
    safeStorage.removeItem('sadio_auth_token');
    setToken(null);
    setUser(null);
    setAccess(null);
    setIsAuthModalOpen(true);
  };

  // Enhanced Speech synthesis hook with real-time streaming
  const {
    voiceEnabled,
    setVoiceEnabled,
    isSpeaking,
    isPlayingRef: isSpeechPlayingRef,
    inFlightCountRef,
    isVoicing,
    mouthOpenLevel,
    isPaused,
    availableVoices,
    selectedVoice,
    setSelectedVoice,
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
    pause: pauseSpeech,
    resume: resumeSpeech,
    stop: stopSpeech,
    testVoice,
    testSpecificVoice,
    unlockAudioContext,
  } = useSpeechSynthesis(language);

  // Speech recognition for mic
  const { isListening, isSupported: isSpeechSupported, toggleListening } = useSpeechRecognition({
    onResult: (transcript) => {
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    },
    lang: TRANSLATIONS[language].speechRecognitionLang,
  });

  const handleLanguageChange = useCallback((newLang: Language) => {
    languageRef.current = newLang;
    setLanguage(newLang);
    saveStoredLanguage(newLang);

    // Prevent stale initial-gesture greeting from firing in the old language
    greetingTriggeredRef.current = true;
    greetingAudioPlayedRef.current = true;

    // Immediately stop any currently speaking voice in the previous language
    stopSpeech();

    // Update welcome message if still on initial welcome screen
    const isOnWelcomeOnly =
      messagesRef.current.length === 1 && messagesRef.current[0].id === 'init-msg-1';
    if (isOnWelcomeOnly) {
      setMessages((prev) => {
        if (prev.length === 1 && prev[0].id === 'init-msg-1') {
          const next = [
            {
              ...prev[0],
              content: TRANSLATIONS[newLang].greeting.content,
            },
          ];
          messagesRef.current = next;
          return next;
        }
        return prev;
      });
    }

    // If idle on the welcome screen with voice enabled, greet cleanly in the newly chosen language
    if (isOnWelcomeOnly && voiceEnabled && !isBusyThinkingOrRespondingRef.current) {
      unlockAudioContext();
      setIsGreeting(true);
      setRobotState('speaking');
      try {
        speakGreeting(
          TRANSLATIONS[newLang].greeting.spoken,
          () => {
            setRobotState('idle');
            setIsGreeting(false);
          },
          newLang
        );
      } catch {
        setRobotState('idle');
        setIsGreeting(false);
      }
    }
  }, [stopSpeech, voiceEnabled, unlockAudioContext, speakGreeting]);

  const handleToggleVoice = useCallback(() => {
    unlockAudioContext();
    const activeLang = languageRef.current;
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    if (!next) {
      stopSpeech();
    } else {
      speak(
        activeLang === 'en'
          ? "Voice enabled! I am SADIO, fully at your service."
          : "Voix activée ! Je suis SADIO, entièrement à votre écoute."
      );
    }
  }, [voiceEnabled, unlockAudioContext, setVoiceEnabled, stopSpeech, speak]);

  const triggerWarmGreeting = useCallback(
    (forcePlayAudio = true, overrideLang?: Language) => {
      // Si le robot est en train de réfléchir ou de répondre, ne jamais déclencher la salutation ni couper la réponse !
      if (isBusyThinkingOrRespondingRef.current) {
        return;
      }

      const activeLang = overrideLang || languageRef.current;
      setIsGreeting(true);
      greetingTriggeredRef.current = true;

      if (!voiceEnabled || !forcePlayAudio || typeof window === 'undefined' || !window.speechSynthesis) {
        setTimeout(() => {
          setIsGreeting(false);
          setRobotState('idle');
        }, 5000);
        return;
      }

      unlockAudioContext();
      setRobotState('speaking');

      try {
        speakGreeting(
          TRANSLATIONS[activeLang].greeting.spoken,
          () => {
            greetingAudioPlayedRef.current = true;
            setRobotState('idle');
            setIsGreeting(false);
          },
          activeLang
        );
      } catch {
        setRobotState('idle');
        setIsGreeting(false);
      }
    },
    [voiceEnabled, speakGreeting, unlockAudioContext]
  );

  const triggerWarmGreetingRef = useRef(triggerWarmGreeting);
  triggerWarmGreetingRef.current = triggerWarmGreeting;

  // Automatic warm greeting ONLY once on initial entrance (never re-fires on language switches)
  useEffect(() => {
    const autoGreetTimer = window.setTimeout(() => {
      if (!greetingTriggeredRef.current && !isBusyThinkingOrRespondingRef.current) {
        triggerWarmGreetingRef.current(true);
      }
    }, 80);

    // In emulators or mobile where autoplay is silenced by browser security,
    // first user touch/click triggers the greeting speech in the currently active language
    const handleImmediateGesture = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      if (target?.closest?.('[data-no-auto-greet="true"]')) {
        return;
      }
      if (isBusyThinkingOrRespondingRef.current) {
        return;
      }
      unlockAudioContext();
      if (!greetingAudioPlayedRef.current) {
        triggerWarmGreetingRef.current(true);
      }
    };

    window.addEventListener('pointerdown', handleImmediateGesture, { passive: true });
    window.addEventListener('touchstart', handleImmediateGesture, { passive: true });
    window.addEventListener('click', handleImmediateGesture, { passive: true });

    return () => {
      clearTimeout(autoGreetTimer);
      window.removeEventListener('pointerdown', handleImmediateGesture);
      window.removeEventListener('touchstart', handleImmediateGesture);
      window.removeEventListener('click', handleImmediateGesture);
    };
  }, [unlockAudioContext]);

  // Clean up any old chat history or old hide text flags in safeStorage so text displays cleanly
  useEffect(() => {
    safeStorage.removeItem('robo_omni_chat_history_v2');
    safeStorage.removeItem('robo_omni_chat_history');
    safeStorage.removeItem(HIDE_TEXT_KEY);
  }, []);

  useEffect(() => {
    safeStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const clearThinkingTimers = () => {
    if (thinkingTimerRef.current) {
      clearInterval(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearThinkingTimers();
    };
  }, []);

  // Immediate and total Stop handler: cancels audio, aborts network stream, resets thinking & idle states
  const handleStop = useCallback(() => {
    // 1. Invalidate ongoing request so any pending stream chunks or callbacks are safely ignored
    currentRequestIdRef.current += 1;

    // 2. Abort network fetch and streaming reader
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch (e) {
        // ignore
      }
      abortControllerRef.current = null;
    }

    // 3. Stop speech synthesis immediately
    stopSpeech();

    // 4. Handle conversation turns cleanly so history never merges consecutive user queries
    const partialText = currentAccumulatedTextRef.current.trim();
    if (partialText.length > 0) {
      const botMessageId = `bot-${Date.now()}`;
      const botMessage: ChatMessage = {
        id: botMessageId,
        role: 'model',
        content: partialText,
        timestamp: Date.now(),
        domain: currentDomain.label,
      };
      setMessages((prev) => {
        const next = [...prev, botMessage];
        messagesRef.current = next;
        return next;
      });
    } else {
      // If user stopped before any response arrived, remove orphan unanswered user turn to avoid prompt merging
      setMessages((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].role === 'user') {
          const next = prev.slice(0, -1);
          messagesRef.current = next;
          return next;
        }
        messagesRef.current = prev;
        return prev;
      });
    }
    currentAccumulatedTextRef.current = '';

    // 5. Reset thinking & streaming states completely
    clearThinkingTimers();
    setIsThinking(false);
    setThinkingSeconds(null);
    setIsStreaming(false);
    setSpeakingMessageId(null);
    setRobotState('idle');
    setStreamingContent('');
  }, [stopSpeech, currentDomain.label]);

  // Keep robotState in sync with speaking / listening / thinking
  useEffect(() => {
    if (isListening) {
      setRobotState('listening');
    } else if (isSpeaking) {
      setRobotState('speaking');
    } else if (isThinking) {
      setRobotState('thinking');
    } else if (!isStreaming && robotState !== 'idle' && !isGreeting) {
      setRobotState('idle');
    }
  }, [isListening, isSpeaking, isThinking, isStreaming, isGreeting]);



  // Synchronize busy state so any touch or click on the screen can immediately check if the robot is busy
  const isBusyThinkingOrResponding =
    isThinking ||
    isStreaming ||
    isSpeaking ||
    robotState === 'thinking' ||
    robotState === 'speaking';

  useEffect(() => {
    isBusyThinkingOrRespondingRef.current = isBusyThinkingOrResponding;
  }, [isBusyThinkingOrResponding]);

  const processSelectedFile = async (file: File) => {
    // Strict validation: images only
    if (!file.type.startsWith('image/')) {
      setChatErrorMessage(
        "Seules les images (PNG, JPG, WEBP, GIF, HEIC) sont acceptées pour l'analyse visuelle par SADIO."
      );
      return;
    }

    try {
      setIsProcessingImage(true);
      setChatErrorMessage(null);
      const processed = await processImageFile(file);
      setSelectedImage(processed);
      inputRef.current?.focus();
    } catch (err: any) {
      setChatErrorMessage(err?.message || "Erreur lors du traitement de l'image.");
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          await processSelectedFile(file);
          break;
        }
      }
    }
  };

  // Handle Send Message with INSTANT speech response & instant interrupt capability
  const handleSendMessage = async (textToSend?: string) => {
    const rawPrompt = (textToSend || input).trim();
    const imageToSend = selectedImage;

    // Must have prompt or image
    if (!rawPrompt && !imageToSend) return;

    const activeLang = languageRef.current;
    const prompt =
      rawPrompt ||
      (activeLang === 'en'
        ? 'Analyze this image completely, thoroughly, and in detail. Describe everything you observe, identify key elements, transcribe and interpret any visible text, and provide a clear, structured explanation in English.'
        : "Analyse cette image de manière complète, approfondie et détaillée. Décris tout ce que tu observes, identifie les éléments clés, retranscris et interprète les textes éventuels, et fournis une explication claire et structurée.");

    setChatErrorMessage(null);

    // If subscription is strictly expired for an authenticated user, prompt renewal
    if (token && access && !access.hasAccess) {
      setInput('');
      setSelectedImage(null);
      setIsSubscriptionModalOpen(true);
      const expiredMessage: ChatMessage = {
        id: `bot-exp-${Date.now()}`,
        role: 'model',
        content: `### ⏳ Votre essai gratuit de 3 jours est terminé\n\nPour continuer à échanger avec **SADIO** et profiter de ses explications universelles, souscrivez pour **700 FCFA (30 jours)** via Wave, Orange Money, Free Money ou Carte Bancaire.\n\nVos conversations passées restent précieusement conservées.`,
        timestamp: Date.now(),
        domain: 'Abonnement',
      };
      setMessages((prev) => [...prev, expiredMessage]);
      return;
    }

    // Immediately interrupt any previous answer, stream or speech:
    handleStop();

    // Début de la réponse : la phase de salutation est définitivement terminée
    setIsGreeting(false);
    greetingAudioPlayedRef.current = true;
    greetingTriggeredRef.current = true;
    isBusyThinkingOrRespondingRef.current = true;

    const requestId = ++currentRequestIdRef.current;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const tStart = performance.now();
    console.log(`⏱️ [SADIO LATENCE] [T0 = 0 ms] Déclenchement de la requête pour : "${(rawPrompt || "Analyse visuelle d'image").slice(0, 45)}..."`);

    setInput('');
    setSelectedImage(null);
    setIsResponseCardDismissed(false);
    setHideResponseText(false);
    setShowFullTextModal(false);
    inputRef.current?.blur();
    unlockAudioContext();

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      domain: imageToSend ? (activeLang === 'en' ? 'Image Vision' : "Vision d'Image") : currentDomain.label,
      image: imageToSend
        ? {
            dataUrl: imageToSend.dataUrl,
            mimeType: imageToSend.mimeType,
            name: imageToSend.name,
            size: imageToSend.size,
            base64: imageToSend.base64,
          }
        : undefined,
    };

    // Clean history from synchronous messagesRef so history is always pristine
    const currentHistory = messagesRef.current;
    const cleanHistory = currentHistory.filter(
      (m) => m.domain !== 'Erreur' && !m.id.startsWith('bot-err-')
    );
    const newMessages = [...cleanHistory, userMessage];
    messagesRef.current = newMessages;
    setMessages(newMessages);

    // Initial reactive state: cognitive processing while awaiting first stream tokens
    setIsThinking(true);
    setRobotState('thinking');
    setIsStreaming(true);
    setStreamingContent('');

    let accumulatedText = '';
    let spokenCharIndex = 0;

    const pumpStreamingSpeech = (forceFlush = false) => {
      if (!voiceEnabled || currentRequestIdRef.current !== requestId) return;
      while (true) {
        if (currentRequestIdRef.current !== requestId) break;
        const unparsed = accumulatedText.slice(spokenCharIndex);
        const extracted = extractNextSpeechChunk(
          unparsed,
          spokenCharIndex === 0,
          forceFlush || !isSpeechPlayingRef.current,
          inFlightCountRef.current
        );
        if (!extracted) break;

        spokenCharIndex += extracted.consumedLength;
        const cleanSentence = cleanTextForSpeech(extracted.rawChunk, activeLang).trim();
        if (cleanSentence.length > 0) {
          enqueueStreamingSentence(cleanSentence);
        }
      }
    };

    // Prime the speech engine immediately (0ms delay) so it is ready to speak the first word instantly
    if (voiceEnabled) {
      startStreamingSpeech(
        () => {
          if (currentRequestIdRef.current === requestId) {
            clearThinkingTimers();
            setIsThinking(false);
            setThinkingSeconds(null);
            setRobotState('speaking');
          }
        },
        () => {
          pumpStreamingSpeech(true);
        }
      );
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        headers['x-guest-demo'] = 'true';
      }
      if (deepSeekKey) {
        headers['x-deepseek-key'] = deepSeekKey;
      }

      const payload = {
        deepseekApiKey: deepSeekKey || undefined,
        language: activeLang,
        messages: newMessages.map((m) => ({
          role: m.role,
          content: m.content,
          image: m.image
            ? {
                dataUrl: m.image.dataUrl,
                mimeType: m.image.mimeType,
                name: m.image.name,
              }
            : undefined,
        })),
        customInstructions: `${TRANSLATIONS[activeLang].aiDirective}\n\n` + (
          imageToSend
            ? (activeLang === 'en'
                ? `The user submitted an image for detailed visual inspection. Analyze each visible element, subject, OCR text if any, explanation and summary strictly in English.`
                : `L'utilisateur a soumis une image pour analyse visuelle complète et détaillée. Analyse méticuleusement chaque élément visible, le sujet, le texte OCR éventuel, l'explication et la synthèse strictement en français.`)
            : (activeLang === 'en'
                ? `Domain: ${currentDomain.label}. Provide a complete, rigorous, and detailed response strictly in English.`
                : `Domaine : ${currentDomain.label}. Fournis une réponse complète, détaillée, sans aucune abréviation, de bout en bout, strictement en français.`)
        ),
      };

      const tPayloadReady = performance.now();
      console.log(
        `⏱️ [SADIO LATENCE] [T1 = +${(tPayloadReady - tStart).toFixed(0)} ms] Payload préparé :\n` +
        `   • Messages dans l'historique : ${newMessages.length}\n` +
        `   • Image attachée : ${imageToSend ? 'Oui' : 'Non'}\n` +
        `   • Clé DeepSeek : ${deepSeekKey ? 'Fournie localement via le navigateur' : 'Gérée automatiquement par le serveur (Render)'}`
      );

      const tFetchStart = performance.now();
      console.log(`⏱️ [SADIO LATENCE] [T2 = +${(tFetchStart - tStart).toFixed(0)} ms] Expédition requête POST /api/chat...`);

      let response: Response;
      try {
        response = await fetch('/api/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: abortController.signal,
        });
      } catch (networkErr) {
        console.warn('⚠️ [SADIO WAKEUP] Tentative initiale échouée (réveil du serveur Render après inactivité). Nouvelle tentative dans 3s...');
        setChatErrorMessage("⚠️ Réveil du serveur Render en cours (inactivité prolongée)... Patientez 3 secondes.");
        await new Promise((resolve) => setTimeout(resolve, 3000));
        setChatErrorMessage(null);

        response = await fetch('/api/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: abortController.signal,
        });
      }

      const tHeadersReceived = performance.now();
      const fetchTransitMs = (tHeadersReceived - tFetchStart).toFixed(0);
      const totalToHeadersMs = (tHeadersReceived - tStart).toFixed(0);
      console.log(
        `⏱️ [SADIO LATENCE] [T3 = +${totalToHeadersMs} ms] En-têtes HTTP reçus ! Code: ${response.status} ${response.statusText}\n` +
        `   • Temps aller-retour réseau + handshake : ${fetchTransitMs} ms`
      );

      if (currentRequestIdRef.current !== requestId) return;

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("⚠️ Erreur 404 (/api/chat introuvable) : Sur Render.com, vous devez déployer ce projet en tant que Web Service (Node) et non comme Static Site. Assurez-vous que votre service utilise 'npm start' ou 'tsx server.ts' comme commande de démarrage.");
        }
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          setIsAuthModalOpen(true);
        } else if (response.status === 403) {
          setIsSubscriptionModalOpen(true);
        }
        throw new Error(errorData.message || errorData.error || `Erreur serveur (${response.status})`);
      }

      if (!response.body) {
        throw new Error('Flux de réponse indisponible.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      const tReaderReady = performance.now();
      console.log(`⏱️ [SADIO LATENCE] [T4 = +${(tReaderReady - tStart).toFixed(0)} ms] Flux SSE ouvert. En attente du 1er paquet de tokens...`);

      let buffer = '';
      let firstTokenLogged = false;
      let tFirstToken = 0;
      let tokenChunkCount = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done || currentRequestIdRef.current !== requestId) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete trailing line

        for (const line of lines) {
          if (currentRequestIdRef.current !== requestId) break;

          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.brain) {
                console.log(`🧠 [SADIO CERVEAU ACTIF] Réponse générée par : ${String(data.brain).toUpperCase()} (${data.model || ''})`);
              }
              if (data.brainFailover) {
                console.warn(`⚠️ [SADIO FAILOVER DÉCLENCHÉ] Bascule serveur vers : ${String(data.target).toUpperCase()}`);
              }
              if (data.text) {
                if (!firstTokenLogged) {
                  firstTokenLogged = true;
                  tFirstToken = performance.now();
                  const ttftFromFetch = (tFirstToken - tFetchStart).toFixed(0);
                  const ttftFromStart = (tFirstToken - tStart).toFixed(0);
                  console.log(
                    `🚀 [SADIO LATENCE] [T5 = +${ttftFromStart} ms] PREMIER TOKEN REÇU (TTFT) !\n` +
                    `   ⏱️ Latence depuis expédition HTTP : ${ttftFromFetch} ms (TTFT)\n` +
                    `   ⏱️ Latence totale depuis le clic : ${ttftFromStart} ms\n` +
                    `   📝 Premier extrait : "${data.text.slice(0, 45).replace(/\n/g, ' ')}..."`
                  );
                }
                tokenChunkCount++;
                accumulatedText += data.text;
                currentAccumulatedTextRef.current = accumulatedText;
                if (currentRequestIdRef.current === requestId) {
                  setStreamingContent(accumulatedText);

                  // As soon as the first stream tokens arrive, end thinking indicator
                  if (isThinking) {
                    clearThinkingTimers();
                    setIsThinking(false);
                    setThinkingSeconds(null);
                  }

                  // Queue complete natural sentences/passages into speech queue
                  pumpStreamingSpeech(false);
                }
              }
              if (data.error && currentRequestIdRef.current === requestId) {
                accumulatedText += `\n\n${data.error}`;
                setStreamingContent(accumulatedText);
              }
            } catch (err) {
              // Ignore partial JSON
            }
          }
        }
      }

      if (currentRequestIdRef.current !== requestId) return;

      const tStreamEnd = performance.now();
      const streamSec = tFirstToken ? ((tStreamEnd - tFirstToken) / 1000).toFixed(2) : '0';
      const totalSec = ((tStreamEnd - tStart) / 1000).toFixed(2);
      console.log(
        `✅ [SADIO LATENCE] [T6 = +${(tStreamEnd - tStart).toFixed(0)} ms] Fin complète du flux de réponse !\n` +
        `   📊 Synthèse de performance :\n` +
        `   • TTFT (Temps au 1er token) : ${tFirstToken ? (tFirstToken - tFetchStart).toFixed(0) : 'N/A'} ms\n` +
        `   • Durée de génération active : ${streamSec} s\n` +
        `   • Longueur texte généré : ${accumulatedText.length} caractères (${tokenChunkCount} fragments)\n` +
        `   • Débit : ~${(accumulatedText.length / (parseFloat(streamSec) || 0.1)).toFixed(0)} car/s\n` +
        `   • Temps total de transaction : ${totalSec} s`
      );

      // Live response ended, finalize speaking state
      clearThinkingTimers();
      setIsThinking(false);
      setThinkingSeconds(null);
      setRobotState('speaking');

      const botMessageId = `bot-${Date.now()}`;
      const botMessage: ChatMessage = {
        id: botMessageId,
        role: 'model',
        content: accumulatedText || "Je n'ai pas pu formuler de réponse complète à cette question.",
        timestamp: Date.now(),
        domain: currentDomain.label,
      };

      setMessages((prev) => {
        const next = [...prev, botMessage];
        messagesRef.current = next;
        return next;
      });
      setStreamingContent('');
      currentAccumulatedTextRef.current = '';

      // If guest used their discovery demo question, persist count
      if (!token) {
        const nextCount = guestQuestionsUsed + 1;
        setGuestQuestionsUsed(nextCount);
        safeStorage.setItem('sadio_guest_questions_used', nextCount.toString());
      }


      // Enqueue any remaining sentences cleanly and finish speech
      if (voiceEnabled) {
        setSpeakingMessageId(botMessageId);
        const remaining = accumulatedText.slice(spokenCharIndex).trim();
        if (remaining) {
          const tailPassages = splitIntoSentences(remaining, 230);
          if (tailPassages.length > 0) {
            for (const tail of tailPassages) {
              const cleanedTail = cleanTextForSpeech(tail, activeLang).trim();
              if (cleanedTail.length >= 2) {
                enqueueStreamingSentence(cleanedTail);
              }
            }
          } else {
            const cleanedTail = cleanTextForSpeech(remaining, activeLang).trim();
            if (cleanedTail.length >= 2) {
              enqueueStreamingSentence(cleanedTail);
            }
          }
        }

        let callbackFired = false;
        const safetyTimer = setTimeout(() => {
          if (!callbackFired && currentRequestIdRef.current === requestId) {
            callbackFired = true;
            setSpeakingMessageId(null);
            setRobotState('idle');
          }
        }, 60000);

        finishStreamingSpeech(undefined, () => {
          if (!callbackFired && currentRequestIdRef.current === requestId) {
            callbackFired = true;
            clearTimeout(safetyTimer);
            setSpeakingMessageId(null);
            setRobotState('idle');
          }
        });
      } else {
        setTimeout(() => {
          if (currentRequestIdRef.current === requestId) {
            setRobotState('idle');
          }
        }, 1000);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Intentionally aborted by user or new prompt, don't show error
        return;
      }
      if (currentRequestIdRef.current !== requestId) return;

      const tError = performance.now();
      console.error(
        `❌ [SADIO LATENCE] [ERREUR à +${(tError - tStart).toFixed(0)} ms depuis l'envoi] :\n` +
        `   ${err instanceof Error ? err.message : String(err)}`
      );
      clearThinkingTimers();
      setIsThinking(false);
      setThinkingSeconds(null);

      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Une interruption réseau temporaire est survenue.';

      setChatErrorMessage(errorMsg);

      const errorBotMessage: ChatMessage = {
        id: `bot-err-${Date.now()}`,
        role: 'model',
        content: `### ⚠️ Message de SADIO\n\nMes relais de calcul ont rencontré une difficulté temporaire :\n\n> *${errorMsg}*\n\nVos questions précédentes sont intactes. Vous pouvez cliquer ci-dessous pour réessayer immédiatement.`,
        timestamp: Date.now(),
        domain: 'Erreur',
      };

      setMessages((prev) => [...prev, errorBotMessage]);
      setStreamingContent('');
      setRobotState('idle');
    } finally {
      if (currentRequestIdRef.current === requestId) {
        setIsStreaming(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearMessages = () => {
    handleStop();
    const activeLang = languageRef.current;
    const initMsg: ChatMessage = {
      id: 'init-msg-1',
      role: 'model',
      content: TRANSLATIONS[activeLang].greeting.content,
      timestamp: Date.now(),
      domain: 'Tous Domaines',
    };
    messagesRef.current = [initMsg];
    setMessages([initMsg]);
    triggerWarmGreeting(true, activeLang);
  };

  const handleAvatarInteractiveClick = () => {
    // Si le robot est en pleine réflexion ou en train de répondre, ignorer tout contact tactile
    if (isBusyThinkingOrRespondingRef.current) {
      return;
    }
    unlockAudioContext();
    triggerWarmGreeting(true);
  };

  // RENDER: Reusable Chat Input Bar
  const renderChatInput = (maxWidthClass = 'max-w-3xl') => (
    <div className="w-full p-2.5 sm:p-4 bg-slate-950/90 border-t border-slate-800/80 shrink-0 backdrop-blur-md pb-safe">
      <div className={`${maxWidthClass} mx-auto relative flex flex-col gap-1.5 sm:gap-2`}>
        <div className="relative flex flex-col rounded-2xl bg-slate-900/90 border border-slate-700/80 focus-within:border-cyan-500/80 focus-within:ring-2 focus-within:ring-cyan-500/20 shadow-xl transition-all overflow-hidden">
          {/* Selected image preview chip */}
          {selectedImage && (
            <div className="flex items-center gap-2.5 px-3 py-2 bg-slate-950/95 border-b border-cyan-500/30 animate-fade-in">
              <div className="relative group shrink-0">
                <img
                  src={selectedImage.dataUrl}
                  alt="Aperçu de l'image"
                  className="w-10 h-10 sm:w-11 sm:h-11 object-cover rounded-lg border border-cyan-500/50 shadow-md"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate">
                    {language === 'fr'
                      ? 'Image prête • Modèle recommandé : Gemini 2.0 Flash / 1.5 Flash'
                      : 'Image ready • Recommended model: Gemini 2.0 Flash / 1.5 Flash'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  {selectedImage.name || 'Image'} • {formatFileSize(selectedImage.size)} • {language === 'fr' ? 'Vision Haute Précision' : 'High Precision Vision'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0"
                title={TRANSLATIONS[language].input.removeImage}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="relative flex items-center w-full min-h-[44px]">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                selectedImage
                  ? TRANSLATIONS[language].input.placeholderImage
                  : TRANSLATIONS[language].input.placeholderNormal
              }
              rows={1}
              className="w-full resize-none bg-transparent py-2.5 sm:py-3 pl-3.5 sm:pl-4 pr-24 sm:pr-28 text-base sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none min-h-[44px] max-h-[140px]"
            />

            <div className="absolute right-1.5 sm:right-2 flex items-center gap-1">
              {/* Voice speech-to-text mic */}
              {isSpeechSupported && (
                <button
                  type="button"
                  onClick={toggleListening}
                  title={isListening ? TRANSLATIONS[language].input.stopMic : TRANSLATIONS[language].input.startMic}
                  className={`min-h-[38px] min-w-[38px] flex items-center justify-center p-2 rounded-xl transition-all active:scale-95 ${
                    isListening
                      ? 'bg-rose-500 text-white animate-pulse shadow-md shadow-rose-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}

              {/* If user hasn't typed anything and SADIO is thinking/streaming/speaking, show Stop button */}
              {!input.trim() && !selectedImage && (isStreaming || isThinking || isSpeaking) ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center p-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white shadow-md shadow-rose-600/25 transition-all active:scale-95 animate-pulse"
                  title={TRANSLATIONS[language].input.stop}
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={!input.trim() && !selectedImage}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center p-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-md shadow-cyan-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                  title={selectedImage ? (language === 'fr' ? "Lancer l'analyse de l'image" : "Analyze image") : TRANSLATIONS[language].input.send}
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const latestUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const latestBotMessage = [...messages].reverse().find((m) => m.role === 'model' && m.id !== 'init-msg-1');
  const activeAnswerText = isStreaming ? streamingContent : (latestBotMessage?.content || '');
  const hasAnswerToShow = Boolean(activeAnswerText && activeAnswerText.trim().length > 0 && !isResponseCardDismissed);

  // Proposition 2: Phrase active affichée dans le bandeau de sous-titres HUD cinéma
  const activeSubtitleText = useMemo(() => {
    if (isSpeaking && currentSentence) {
      return currentSentence;
    }
    if (isStreaming && streamingContent) {
      const sentences = streamingContent.split(/(?<=[.!?…\n])\s+/).filter(Boolean);
      return sentences[sentences.length - 1] || streamingContent.slice(-140);
    }
    if (latestBotMessage?.content) {
      const firstSentence = latestBotMessage.content.split(/(?<=[.!?…\n])\s+/).filter(Boolean)[0];
      return firstSentence || latestBotMessage.content.slice(0, 140);
    }
    return '';
  }, [isSpeaking, currentSentence, isStreaming, streamingContent, latestBotMessage?.content]);

  return (
    <div className="flex flex-col h-[100dvh] min-h-[100dvh] w-full bg-[#070b14] text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        onResetChat={handleClearMessages}
        theme={theme}
        user={user}
        access={access}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenSubscription={() => setIsSubscriptionModalOpen(true)}
        onLogout={handleLogout}
        voiceEnabled={voiceEnabled}
        onToggleVoice={handleToggleVoice}
        language={language}
        onChangeLanguage={handleLanguageChange}
      />

      {/* Payment return feedback banner */}
      {paymentBannerMessage && (
        <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-4 py-2 text-center text-xs text-emerald-300 font-semibold flex items-center justify-center gap-2">
          <span>{paymentBannerMessage}</span>
          <button
            onClick={() => setPaymentBannerMessage(null)}
            className="text-emerald-400 hover:text-white ml-2 text-sm"
          >
            ×
          </button>
        </div>
      )}

      {/* =========================================================================
          MAIN CENTERED APPLICATION STAGE - SADIO CLEARLY IN THE MIDDLE
          NO DISCUSSION HISTORY ON SCREEN
          ========================================================================= */}
      <div className="flex-1 flex flex-col items-center w-full max-w-4xl lg:max-w-5xl mx-auto overflow-hidden relative">

        {/* Chat Error Banner if server or API error occurs */}
        {chatErrorMessage && (
          <div className="w-full px-3 sm:px-4 pt-2 shrink-0 z-30">
            <div className="w-full max-w-lg mx-auto flex items-start gap-2.5 p-3 rounded-2xl bg-rose-950/95 border border-rose-500/60 text-rose-200 text-xs shadow-2xl backdrop-blur-md animate-fade-in">
              <span className="text-base shrink-0">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-rose-100">Message système de SADIO</p>
                <p className="text-[11px] text-rose-200/90 mt-0.5 leading-relaxed">{chatErrorMessage}</p>
                {chatErrorMessage.includes('GEMINI_API_KEY') && (
                  <div className="mt-2 p-2 rounded-lg bg-amber-950/60 border border-amber-500/40 text-[10px] text-amber-200 leading-normal">
                    👉 <strong>Action requise sur Render.com :</strong> Allez sur <span className="underline">dashboard.render.com</span> &gt; Cliquez sur votre service &gt; Onglet <strong>Environment</strong> &gt; Ajoutez la variable <strong>GEMINI_API_KEY</strong> avec votre clé Google AI Studio.
                  </div>
                )}
                {chatErrorMessage.includes('404') && (
                  <div className="mt-2 p-2 rounded-lg bg-indigo-950/75 border border-indigo-500/40 text-[10px] text-indigo-200 leading-normal">
                    🚀 <strong>Conseil hébergement (Render.com) :</strong> SADIO est une application Full-Stack (Node.js + React). Sur Render, votre service doit impérativement être créé en tant que <strong>Web Service</strong> (et non Static Site).<br/>
                    • Build Command : <code>npm install && npm run build</code><br/>
                    • Start Command : <code>npm start</code>
                  </div>
                )}
              </div>
              <button
                onClick={() => setChatErrorMessage(null)}
                className="text-rose-400 hover:text-white text-base px-1.5 py-0.5 rounded-lg hover:bg-rose-900/50 transition shrink-0"
                title="Fermer ce message"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Speech Error Banner if browser speech needs activation */}
        {speechError && (
          <div className="w-full px-4 pt-2 shrink-0 z-20">
            <button
              onClick={testVoice}
              className="w-full max-w-md mx-auto flex items-center justify-center gap-2 p-2 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-medium hover:bg-amber-500/30 transition text-center shadow-lg active:scale-95"
            >
              <Volume2 className="w-4 h-4 shrink-0 text-amber-300 animate-pulse" />
              <span>{speechError}</span>
            </button>
          </div>
        )}

        {/* CENTER HERO: THE STANDING ROBOT AVATAR SADIO - PROUDLY CENTERED, NEVER REDUCED */}
        <div className="flex-1 w-full flex flex-col items-center justify-center relative min-h-0 bg-gradient-to-b from-slate-950/90 via-slate-900/30 to-slate-950/90 px-2 sm:px-4 py-2 overflow-hidden">
          {/* Subtle Ambient Cyber Grid Glow Centered on Robot */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(circle at 50% 50%, #06b6d4 1.5px, transparent 1.5px)`,
              backgroundSize: '24px 24px',
            }}
          />

          {/* Full Standing Robot - Always Visible and Proudly Centered */}
          <div className="w-full h-full flex flex-col items-center justify-center relative">
            <StandingRobotAvatar
              state={robotState}
              theme={theme}
              onAvatarClick={handleAvatarInteractiveClick}
              isThinking={isThinking}
              thinkingCountdown={isThinking ? thinkingSeconds : null}
              isGreeting={Boolean(isGreeting && !isBusyThinkingOrRespondingRef.current)}
              greetingText="« Bonjour et bienvenue ! C'est un réel plaisir de vous accueillir. Je me tiens debout au centre de votre écran, entièrement prêt pour vos questions ! »"
              onReplayGreeting={() => triggerWarmGreeting(true)}
              isVoicing={isVoicing}
              mouthOpenLevel={mouthOpenLevel}
              currentSpeechSnippet={
                currentSentence
                  ? currentSentence.slice(0, 140)
                  : streamingContent
                  ? streamingContent.slice(-120)
                  : undefined
              }
            />
          </div>

          {/* 5-Second Thinking & Cognitive Countdown Banner */}
          {isThinking && (
            <div className="absolute bottom-3 sm:bottom-4 z-30 w-full max-w-md px-3 pointer-events-none">
              <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-950/95 border border-cyan-500/50 text-cyan-200 shadow-2xl backdrop-blur-md pointer-events-auto">
                <div className="flex items-center gap-2.5">
                  <div className="relative flex items-center justify-center shrink-0 w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40">
                    <Cpu className="w-4 h-4 text-cyan-400 animate-spin" />
                    <span className="absolute -inset-1 rounded-xl bg-cyan-400/20 animate-ping pointer-events-none" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white tracking-wide">
                        {language === 'fr' ? 'SADIO analyse votre question...' : 'SADIO is analyzing your question...'}
                      </span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/40">
                        {thinkingSeconds ?? 5}s
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {language === 'fr'
                        ? `Analyse cognitive • Début de la réponse vocale dans ${thinkingSeconds ?? 5}s`
                        : `Cognitive analysis • Voice response starting in ${thinkingSeconds ?? 5}s`}
                    </p>
                  </div>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden border border-slate-700/60">
                  <div
                    className="bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 h-full transition-all duration-1000 ease-linear rounded-full shadow-[0_0_10px_rgba(6,182,212,0.9)]"
                    style={{
                      width: `${Math.min(100, Math.max(0, ((5 - (thinkingSeconds ?? 5)) / 5) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* PROPOSITION 2 : BANDEAU DE SOUS-TITRES CYBERNÉTIQUES (STYLE CINÉMA / HUD) */}
          {hasAnswerToShow && activeSubtitleText && (
            <div className="absolute bottom-2.5 sm:bottom-3 inset-x-2 sm:inset-x-4 max-w-xl mx-auto z-30 animate-fade-in pointer-events-auto">
              <div className="relative rounded-2xl bg-slate-950/85 border border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.35)] backdrop-blur-md px-3.5 sm:px-4 py-2 sm:py-2.5 flex items-center gap-2.5 sm:gap-3 transition-all">
                {/* Glowing Audio Pulse Indicator */}
                <div className="relative flex items-center justify-center shrink-0 w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/50">
                  {isSpeaking ? (
                    <>
                      <Radio className="w-4 h-4 text-cyan-300 animate-pulse" />
                      <span className="absolute -inset-0.5 rounded-xl bg-cyan-400/25 animate-ping pointer-events-none" />
                    </>
                  ) : (
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                  )}
                </div>

                {/* Subtitle Content (1 to 2 lines max, smoothly transitioning like cinema subtitles) */}
                <div
                  onClick={() => setShowFullTextModal(true)}
                  className="flex-1 min-w-0 cursor-pointer"
                  title={language === 'fr' ? "Cliquer pour afficher la réponse complète" : "Click to view full answer"}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-cyan-400 flex items-center gap-1">
                      <span>SADIO</span>
                      <span className="text-slate-500">•</span>
                      <span>
                        {isSpeaking
                          ? (language === 'fr' ? 'Lecture vocale' : 'Speaking')
                          : isStreaming
                          ? (language === 'fr' ? 'Rédaction...' : 'Writing...')
                          : (language === 'fr' ? 'Sous-titre' : 'Subtitles')}
                      </span>
                    </span>
                  </div>
                  <p
                    key={activeSubtitleText}
                    className="text-xs sm:text-sm text-slate-100 font-sans font-medium leading-snug line-clamp-2 selection:bg-cyan-500/30 animate-fade-in"
                  >
                    « {activeSubtitleText.replace(/^["'«»\s]+|["'«»\s]+$/g, '')} »
                  </p>
                </div>

                {/* HUD Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Listen / Stop audio */}
                  {isSpeaking ? (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="p-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 transition active:scale-95 shadow-sm"
                      title={language === 'fr' ? "Arrêter la voix" : "Stop voice"}
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        unlockAudioContext();
                        speak(activeAnswerText);
                      }}
                      className="p-1.5 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30 transition active:scale-95 shadow-sm"
                      title={language === 'fr' ? "Écouter la voix de SADIO" : "Listen to SADIO's voice"}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* View Full Text Modal Button */}
                  <button
                    type="button"
                    onClick={() => setShowFullTextModal(true)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition active:scale-95"
                    title={language === 'fr' ? "Afficher la réponse complète" : "Show full answer"}
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>

                  {/* Copy Button */}
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(activeAnswerText);
                      setCopiedResponse(true);
                      setTimeout(() => setCopiedResponse(false), 2000);
                    }}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95"
                    title={language === 'fr' ? "Copier toute la réponse" : "Copy full answer"}
                  >
                    {copiedResponse ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>

                  {/* Export Audio Podcast Button */}
                  <button
                    type="button"
                    onClick={() => exportTextAsAudioPodcast(activeAnswerText, currentDomain.label || 'SADIO')}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition active:scale-95 flex items-center gap-1"
                    title="Télécharger la réponse en podcast audio"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                  </button>

                  {/* Dismiss HUD Bar Button */}
                  <button
                    type="button"
                    onClick={() => setIsResponseCardDismissed(true)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition active:scale-95"
                    title="Masquer le bandeau"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Full Text Modal avec Suivi Karaoké en temps réel (Proposition 1 intégrée) */}
          <KaraokeReaderModal
            isOpen={showFullTextModal && hasAnswerToShow}
            onClose={() => setShowFullTextModal(false)}
            fullText={activeAnswerText}
            isSpeaking={isSpeaking}
            currentSentence={currentSentence}
            currentSentenceIndex={currentSentenceIndex}
            currentWordIndex={currentWordIndex}
            currentSpokenWord={currentSpokenWord}
            currentCharIndex={currentCharIndex}
            onSpeak={(text) => {
              unlockAudioContext();
              speak(text, undefined, undefined, true);
            }}
            onSpeakFromSentence={(sentenceIdx) => {
              unlockAudioContext();
              speakFromSentenceIndex(sentenceIdx, activeAnswerText);
            }}
            onStop={handleStop}
            isStreaming={isStreaming}
            domainLabel={currentDomain.label}
          />

          {/* Re-open subtitle pill if user dismissed the HUD */}
          {isResponseCardDismissed && latestBotMessage && (
            <button
              onClick={() => setIsResponseCardDismissed(false)}
              className="absolute bottom-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/50 text-cyan-300 text-xs shadow-lg backdrop-blur-md hover:bg-cyan-500/20 transition active:scale-95 animate-fade-in"
            >
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              <span>Afficher les sous-titres</span>
            </button>
          )}
        </div>

        {/* Bottom Chat Input - Pure, clean input bar with no clutter or history */}
        {renderChatInput('max-w-3xl lg:max-w-4xl')}
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
        onChangeTheme={(t) => setTheme(t)}
        availableVoices={availableVoices}
        selectedVoice={selectedVoice}
        onSelectVoice={setSelectedVoice}
        messages={messages}
        onClearMessages={handleClearMessages}
        voiceEnabled={voiceEnabled}
        onToggleVoice={handleToggleVoice}
        onTestVoice={testVoice}
        onTestSpecificVoice={testSpecificVoice}
        language={language}
        onChangeLanguage={handleLanguageChange}
      />

      {/* PWA Offline Notification Indicator */}
      <OfflineIndicator />

      {/* 3-Day Free Trial & Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={(newToken, newUser, newAccess) => {
          setToken(newToken);
          setUser(newUser);
          setAccess(newAccess);
          safeStorage.setItem('sadio_auth_token', newToken);
        }}
      />

      {/* Bictorys Subscription Modal (700 FCFA / 30 Days) */}
      <SubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
        user={user}
        access={access}
        token={token}
      />
    </div>
  );
}
