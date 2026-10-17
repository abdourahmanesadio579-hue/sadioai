import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StandingRobotAvatar } from './components/StandingRobotAvatar';
import { SettingsModal } from './components/SettingsModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { Header } from './components/Header';
import { AuthModal } from './components/AuthModal';
import { SubscriptionModal } from './components/SubscriptionModal';
import { DOMAINS } from './data/domains';
import { ChatMessage, DomainCategory, RobotState, RobotTheme } from './types/chat';
import { UserProfile, AccessStatus } from './types/auth';
import { useSpeechSynthesis, cleanTextForSpeech } from './hooks/useSpeechSynthesis';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
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
} from 'lucide-react';

const GREETING_SPOKEN_TEXT =
  "Bonjour et bienvenue ! Je suis Sadio, votre avatar intelligent. C'est un réel plaisir de vous accueillir ! Je me tiens debout au centre de votre écran, entièrement prêt à explorer tous les domaines avec vous. Comment puis-je vous aider aujourd'hui ?";

const INITIAL_BOT_MESSAGE: ChatMessage = {
  id: 'init-msg-1',
  role: 'model',
  content: `👋 **Bonjour et bienvenue ! C'est un réel et sincère plaisir de vous accueillir.**

Je suis **Sadio**, votre avatar robot intelligent. Je me tiens debout au centre de votre écran, entièrement dédié à vous accompagner et à répondre à toutes vos interrogations avec précision, rigueur et exhaustivité.

Posez votre question ci-dessous ou cliquez sur le micro pour me parler directement !`,
  timestamp: Date.now(),
  domain: 'Tous Domaines',
};

const THEME_KEY = 'robo_omni_theme_v2';
const HIDE_TEXT_KEY = 'robo_omni_hide_response_text_v1';

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_BOT_MESSAGE]);
  const [input, setInput] = useState('');
  const [robotState, setRobotState] = useState<RobotState>('idle');
  const [currentDomain, setCurrentDomain] = useState<DomainCategory>(DOMAINS[0]);
  const [theme, setTheme] = useState<RobotTheme>(() => {
    return (localStorage.getItem(THEME_KEY) as RobotTheme) || 'cyan';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  // Pure Voice Mode: Hide response text on screen (Defaults to true as requested by user!)
  const [hideResponseText, setHideResponseText] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(HIDE_TEXT_KEY);
      if (saved !== null) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return true;
  });

  const toggleHideResponseText = () => {
    setHideResponseText((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(HIDE_TEXT_KEY, JSON.stringify(next));
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
    try {
      return localStorage.getItem('sadio_auth_token');
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<UserProfile | null>(null);
  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [paymentBannerMessage, setPaymentBannerMessage] = useState<string | null>(null);

  // Load session or show welcome 3-day trial modal
  useEffect(() => {
    const savedToken = localStorage.getItem('sadio_auth_token');
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
            localStorage.removeItem('sadio_auth_token');
            setToken(null);
            setUser(null);
            setAccess(null);
            setIsAuthModalOpen(true);
          }
        })
        .catch(() => {});
    } else {
      // First visit: show 3-day free trial signup modal
      setIsAuthModalOpen(true);
    }
  }, []);

  // Handle Bictorys payment return URL (?payment_status=success or ?payment_status=cancel)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('payment_status');

    if (status === 'success') {
      setPaymentBannerMessage('Paiement confirmé ! Votre abonnement de 30 jours à SADIO AI est désormais actif.');
      const savedToken = localStorage.getItem('sadio_auth_token');
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
    localStorage.removeItem('sadio_auth_token');
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
    isVoicing,
    mouthOpenLevel,
    isPaused,
    availableVoices,
    selectedVoice,
    setSelectedVoice,
    currentSentence,
    speechError,
    startStreamingSpeech,
    enqueueStreamingSentence,
    finishStreamingSpeech,
    speak,
    pause: pauseSpeech,
    resume: resumeSpeech,
    stop: stopSpeech,
    testVoice,
    unlockAudioContext,
  } = useSpeechSynthesis();

  // Speech recognition for mic
  const { isListening, isSupported: isSpeechSupported, toggleListening } = useSpeechRecognition({
    onResult: (transcript) => {
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    },
  });

  const triggerWarmGreeting = useCallback(
    (forcePlayAudio = true) => {
      setIsGreeting(true);
      greetingTriggeredRef.current = true;

      if (voiceEnabled && forcePlayAudio) {
        setRobotState('speaking');
        speak(GREETING_SPOKEN_TEXT, 'fr-FR', () => {
          setRobotState('idle');
          setTimeout(() => {
            setIsGreeting(false);
          }, 3500);
        });
      } else {
        setTimeout(() => {
          setIsGreeting(false);
          setRobotState('idle');
        }, 5000);
      }
    },
    [voiceEnabled, speak]
  );

  // Automatic warm greeting upon entering the app + gesture unlock fallback
  useEffect(() => {
    // 1. Auto greet when entering
    const autoGreetTimer = window.setTimeout(() => {
      if (!greetingTriggeredRef.current) {
        triggerWarmGreeting(true);
      }
    }, 700);

    // 2. Gesture listener in case the browser blocked audio autoplay on first cold load
    const handleFirstGesture = () => {
      if (!greetingTriggeredRef.current) {
        triggerWarmGreeting(true);
      }
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };

    window.addEventListener('pointerdown', handleFirstGesture, { once: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true });

    return () => {
      clearTimeout(autoGreetTimer);
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
  }, [triggerWarmGreeting]);

  // Clean up any old chat history in localStorage so nothing persists
  useEffect(() => {
    try {
      localStorage.removeItem('robo_omni_chat_history_v2');
      localStorage.removeItem('robo_omni_chat_history');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
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

  // Handle Send Message with INSTANT speech response & instant interrupt capability
  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || input).trim();
    if (!prompt) return;

    // 0. Check authentication before sending
    if (!token) {
      setInput('');
      setIsAuthModalOpen(true);
      const guestMessage: ChatMessage = {
        id: `bot-auth-${Date.now()}`,
        role: 'model',
        content: `### 🎁 Activez vos 3 jours d'essai gratuit !\n\nPour poser vos questions à **Sadio** et obtenir des réponses complètes et vocalisées, veuillez activer votre essai gratuit de 3 jours.\n\nL'inscription prend 10 secondes, ne nécessite **aucune carte bancaire** et il n'y a **aucun prélèvement automatique**.`,
        timestamp: Date.now(),
        domain: 'Essai Gratuit',
      };
      setMessages((prev) => [...prev, guestMessage]);
      return;
    }

    if (access && !access.hasAccess) {
      setInput('');
      setIsSubscriptionModalOpen(true);
      const expiredMessage: ChatMessage = {
        id: `bot-exp-${Date.now()}`,
        role: 'model',
        content: `### ⏳ Votre essai gratuit de 3 jours est terminé\n\nPour continuer à échanger avec **Sadio** et profiter de ses explications universelles, souscrivez pour **700 FCFA (30 jours)** via Wave, Orange Money, Free Money ou Carte Bancaire.\n\nVos conversations passées restent précieusement conservées.`,
        timestamp: Date.now(),
        domain: 'Abonnement',
      };
      setMessages((prev) => [...prev, expiredMessage]);
      return;
    }

    // Immediately interrupt any previous answer, stream or speech:
    handleStop();

    const requestId = ++currentRequestIdRef.current;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setInput('');
    unlockAudioContext();

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      domain: currentDomain.label,
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

    // Prime the speech engine immediately (0ms delay) so it is ready to speak the first word instantly
    if (voiceEnabled) {
      startStreamingSpeech(() => {
        if (currentRequestIdRef.current === requestId) {
          clearThinkingTimers();
          setIsThinking(false);
          setThinkingSeconds(null);
          setRobotState('speaking');
        }
      });
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          customInstructions: `Domaine : ${currentDomain.label}. Fournis une réponse complète, détaillée, sans aucune abréviation, de bout en bout.`,
        }),
        signal: abortController.signal,
      });

      if (currentRequestIdRef.current !== requestId) return;

      if (!response.ok) {
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
      let accumulatedText = '';
      let buffer = '';
      let spokenCharIndex = 0;

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
              if (data.text) {
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

                  // Queue full sentences into speech queue
                  if (voiceEnabled) {
                    while (true) {
                      if (currentRequestIdRef.current !== requestId) break;
                      const unparsed = accumulatedText.slice(spokenCharIndex);
                      if (!unparsed || unparsed.trim().length < 2) break;

                      let sentenceMatch: RegExpMatchArray | null = null;

                      if (spokenCharIndex === 0) {
                        // 1. FAST ONSET: Start speaking on the first short sentence or clause (~30-80 chars)
                        sentenceMatch = unparsed.match(/^([\s\S]{15,90}?(?:(?<!\d)[.!?…]+(?!\d)|\n\n+))(?:\s+|$)/);
                        if (!sentenceMatch && unparsed.length >= 35) {
                          const firstClauseMatch = unparsed.match(/^([\s\S]{15,75}?(?:[,:;]|\n))\s*/);
                          if (firstClauseMatch && firstClauseMatch[1].trim().length >= 10) {
                            sentenceMatch = firstClauseMatch;
                          }
                        }
                      } else {
                        // 2. CONTINUOUS SPEECH: Group sentences into passages of 160-320 chars so that
                        // periods (.) remain INSIDE the spoken passage with a light, natural breath pause (~180ms)
                        // rather than halting the audio pipeline at every single period.
                        if (unparsed.length >= 160) {
                          sentenceMatch = unparsed.match(/^([\s\S]{140,320}?(?:(?<!\d)[.!?…]+(?!\d)|\n\n+))(?:\s+|$)/);
                        } else if (unparsed.includes('\n\n')) {
                          sentenceMatch = unparsed.match(/^([\s\S]+?\n\n+)(?:\s+|$)/);
                        } else if (!isSpeaking) {
                          // If speech has caught up and audio is waiting, speak any completed sentence immediately
                          sentenceMatch = unparsed.match(/^([\s\S]*?(?:(?<!\d)[.!?…]+(?!\d)|\n\n+))(?:\s+|$)/);
                        }
                      }

                      if (sentenceMatch && sentenceMatch[1].trim().length >= 2) {
                        const matchedChunk = sentenceMatch[1];
                        const rawLength = sentenceMatch[0].length;
                        spokenCharIndex += rawLength;

                        let cleanSentence = cleanTextForSpeech(matchedChunk).trim();
                        if (cleanSentence.length > 0) {
                          if (!/[.!?…,:;]$/.test(cleanSentence)) {
                            cleanSentence += '.';
                          }
                          enqueueStreamingSentence(cleanSentence);
                        }
                      } else {
                        // 3. Fallback for very long continuous text without punctuation
                        if (unparsed.length > 220) {
                          const fallbackMatch = unparsed.match(/^([\s\S]{100,220}?\s+)/);
                          if (fallbackMatch && fallbackMatch[1].trim().length >= 30) {
                            spokenCharIndex += fallbackMatch[0].length;
                            let fallbackSentence = cleanTextForSpeech(fallbackMatch[1]).trim();
                            if (fallbackSentence.length > 0) {
                              if (!/[.!?…]$/.test(fallbackSentence)) {
                                fallbackSentence += '.';
                              }
                              enqueueStreamingSentence(fallbackSentence);
                            }
                            continue;
                          }
                        }
                        break;
                      }
                    }
                  }
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

      // Enqueue any remaining sentence and finish speech
      if (voiceEnabled) {
        setSpeakingMessageId(botMessageId);
        const remaining = accumulatedText.slice(spokenCharIndex).trim();
        let finalSentence = cleanTextForSpeech(remaining).trim();
        if (finalSentence.length > 0 && !/[.!?…]$/.test(finalSentence)) {
          finalSentence += '.';
        }
        finishStreamingSpeech(finalSentence, () => {
          if (currentRequestIdRef.current === requestId) {
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

      console.error('Chat error:', err);
      clearThinkingTimers();
      setIsThinking(false);
      setThinkingSeconds(null);

      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Une interruption réseau temporaire est survenue.';

      const errorBotMessage: ChatMessage = {
        id: `bot-err-${Date.now()}`,
        role: 'model',
        content: `### ⚠️ Message de Sadio\n\nMes relais de calcul ont rencontré une difficulté temporaire :\n\n> *${errorMsg}*\n\nVos questions précédentes sont intactes. Vous pouvez cliquer ci-dessous pour réessayer immédiatement.`,
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
    setMessages([INITIAL_BOT_MESSAGE]);
    triggerWarmGreeting(true);
  };

  const handleAvatarInteractiveClick = () => {
    if (robotState === 'idle' || isGreeting) {
      triggerWarmGreeting(true);
    }
  };

  // RENDER: Reusable Chat Input Bar
  const renderChatInput = (maxWidthClass = 'max-w-3xl') => (
    <div className="w-full p-2.5 sm:p-4 bg-slate-950/90 border-t border-slate-800/80 shrink-0 backdrop-blur-md pb-safe">
      <div className={`${maxWidthClass} mx-auto relative flex flex-col gap-1.5 sm:gap-2`}>
        <div className="relative flex items-center rounded-2xl bg-slate-900/90 border border-slate-700/80 focus-within:border-cyan-500/80 focus-within:ring-2 focus-within:ring-cyan-500/20 shadow-xl transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Posez votre question à Sadio (vocal ou texte)..."
            rows={1}
            className="w-full resize-none bg-transparent py-2.5 sm:py-3 pl-3.5 sm:pl-4 pr-24 text-base sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none min-h-[44px] max-h-[140px]"
          />

          <div className="absolute right-1.5 sm:right-2 flex items-center gap-1">
            {/* Voice speech-to-text mic */}
            {isSpeechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                title={isListening ? 'Arrêter la dictée vocale' : 'Parler au robot (Microphone)'}
                className={`min-h-[38px] min-w-[38px] flex items-center justify-center p-2 rounded-xl transition-all active:scale-95 ${
                  isListening
                    ? 'bg-rose-500 text-white animate-pulse shadow-md shadow-rose-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}

            {/* If user hasn't typed anything and Sadio is thinking/streaming/speaking, show Stop button */}
            {!input.trim() && (isStreaming || isThinking || isSpeaking) ? (
              <button
                type="button"
                onClick={handleStop}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center p-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white shadow-md shadow-rose-600/25 transition-all active:scale-95 animate-pulse"
                title="Arrêter la réponse et la lecture"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!input.trim()}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center p-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-md shadow-cyan-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                title="Envoyer la question"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-1.5 sm:px-2 text-[10px] sm:text-[11px] text-slate-500">
          <span className="flex items-center gap-1 truncate">
            <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
            <span className="truncate">Avatar robot debout • Réponses exhaustives & complètes</span>
          </span>
          <span className="font-mono text-[10px] text-slate-400 shrink-0 hidden sm:inline">
            [Entrée] pour envoyer
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-[100dvh] min-h-[100dvh] w-full bg-[#070b14] text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        onResetChat={handleClearMessages}
        theme={theme}
        hideResponseText={hideResponseText}
        onToggleHideResponseText={toggleHideResponseText}
        user={user}
        access={access}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenSubscription={() => setIsSubscriptionModalOpen(true)}
        onLogout={handleLogout}
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
              voiceEnabled={voiceEnabled}
              onToggleVoice={() => {
                if (voiceEnabled) stopSpeech();
                setVoiceEnabled(!voiceEnabled);
              }}
              onAvatarClick={handleAvatarInteractiveClick}
              onTestVoice={testVoice}
              isThinking={isThinking}
              thinkingCountdown={isThinking ? thinkingSeconds : null}
              isGreeting={isGreeting}
              greetingText="« Bonjour et bienvenue ! C'est un réel plaisir de vous accueillir. Je me tiens debout au centre de votre écran, entièrement prêt pour vos questions ! »"
              onReplayGreeting={() => triggerWarmGreeting(true)}
              isVoicing={isVoicing}
              mouthOpenLevel={mouthOpenLevel}
              currentSpeechSnippet={
                hideResponseText
                  ? undefined
                  : (currentSentence
                  ? currentSentence.slice(0, 120)
                  : streamingContent
                  ? streamingContent.slice(-100)
                  : undefined)
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
                        Sadio analyse votre question...
                      </span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/40">
                        {thinkingSeconds ?? 5}s
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Analyse cognitive • Début de la réponse vocale dans {thinkingSeconds ?? 5}s
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

          {/* Floating Audio Speech Controller when Sadio is speaking aloud */}
          {isSpeaking && !isThinking && (
            <div className="absolute bottom-3 sm:bottom-4 z-30 flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/95 border border-cyan-500/50 shadow-2xl backdrop-blur-md text-xs animate-fade-in">
              <span className="flex h-2.5 w-2.5 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
              </span>
              <span className="text-cyan-300 font-medium truncate max-w-[170px] xs:max-w-[220px] sm:max-w-xs md:max-w-md text-[11px]">
                {hideResponseText ? 'Sadio vous répond à voix haute...' : (currentSentence || 'Lecture de la réponse en cours...')}
              </span>

              {/* Play / Pause & Stop Controls */}
              <div className="flex items-center gap-1 border-l border-slate-700 pl-2 shrink-0">
                {isPaused ? (
                  <button
                    onClick={resumeSpeech}
                    className="p-1 rounded text-cyan-400 hover:text-white transition"
                    title="Reprendre la lecture"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    onClick={pauseSpeech}
                    className="p-1 rounded text-cyan-400 hover:text-white transition"
                    title="Mettre en pause"
                  >
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}
                <button
                  onClick={handleStop}
                  className="p-1 rounded text-rose-400 hover:text-rose-300 transition"
                  title="Arrêter la réponse et la lecture"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>
            </div>
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
        voiceEnabled={voiceEnabled}
        onToggleVoice={() => {
          if (voiceEnabled) stopSpeech();
          setVoiceEnabled(!voiceEnabled);
        }}
        hideResponseText={hideResponseText}
        onToggleHideResponseText={toggleHideResponseText}
        availableVoices={availableVoices}
        selectedVoice={selectedVoice}
        onSelectVoice={setSelectedVoice}
        onTestVoice={testVoice}
        messages={messages}
        onClearMessages={handleClearMessages}
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
          try {
            localStorage.setItem('sadio_auth_token', newToken);
          } catch {
            // ignore
          }
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
