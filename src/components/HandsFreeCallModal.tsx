import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Radio,
  Sparkles,
  Clock,
  AlertTriangle,
  Volume2,
  FileText,
  Zap,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { MAX_DAILY_CALL_SECONDS, formatCallTime, getDeviceFingerprint } from '../utils/callQuota';
import { safeStorage } from '../utils/storage';
import { Language } from '../utils/i18n';

export interface HandsFreeCallModalProps {
  isActive: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => Promise<void> | void;
  isSpeaking: boolean;
  isThinking: boolean;
  isStreaming: boolean;
  currentSentence: string;
  onStopSpeech: () => void;
  onOpenDocumentModal: () => void;
  totalUsedSeconds: number;
  onTickUsedSeconds: (newTotalSeconds: number) => void;
  language?: Language;
}

function playChime(type: 'start' | 'listen' | 'end') {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'start') {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === 'listen') {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'end') {
      osc.frequency.setValueAtTime(784, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(392, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch {
    // audio feedback optional
  }
}

export const HandsFreeCallModal: React.FC<HandsFreeCallModalProps> = ({
  isActive,
  onClose,
  onSendMessage,
  isSpeaking,
  isThinking,
  isStreaming,
  currentSentence,
  onStopSpeech,
  onOpenDocumentModal,
  totalUsedSeconds,
  onTickUsedSeconds,
  language = 'fr',
}) => {
  // Session duration for the current active phone call
  const [sessionDuration, setSessionDuration] = useState<number>(0);
  // Cumulative daily used seconds (initialized with totalUsedSeconds)
  const [localUsedSeconds, setLocalUsedSeconds] = useState<number>(totalUsedSeconds);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [isRecognizing, setIsRecognizing] = useState<boolean>(false);
  const [speechPhase, setSpeechPhase] = useState<'listening' | 'thinking' | 'speaking' | 'limit-reached'>('listening');

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const callTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const wasSpeakingRef = useRef<boolean>(false);
  const isTerminatedRef = useRef<boolean>(false);

  // Keep refs to avoid interval tear-down when props change during active call
  const totalUsedRef = useRef<number>(totalUsedSeconds);
  const onTickRef = useRef(onTickUsedSeconds);
  onTickRef.current = onTickUsedSeconds;

  // Sync ref and state when modal is not active or when totalUsedSeconds changes outside
  useEffect(() => {
    if (!isActive) {
      totalUsedRef.current = totalUsedSeconds;
      setLocalUsedSeconds(totalUsedSeconds);
    }
  }, [totalUsedSeconds, isActive]);

  const remainingSeconds = Math.max(0, MAX_DAILY_CALL_SECONDS - localUsedSeconds);

  // 1. Initialisation de la session d'appel serveur et battement de cœur régulier (Heartbeat)
  useEffect(() => {
    if (!isActive) {
      setSessionDuration(0);
      setLiveTranscript('');
      isTerminatedRef.current = false;
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (sessionTokenRef.current) {
        fetch('/api/call/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken: sessionTokenRef.current }),
        }).catch(() => {});
        sessionTokenRef.current = null;
      }
      return;
    }

    const startCallSession = async () => {
      try {
        const token = safeStorage.getItem('sadio_auth_token');
        const fp = getDeviceFingerprint();
        const headers: Record<string, string> = {
          'x-device-fingerprint': fp,
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch('/api/call/start', {
          method: 'POST',
          headers,
        });

        // Cas quota épuisé côté serveur (infranchissable)
        if (!res.ok) {
          isTerminatedRef.current = true;
          setSpeechPhase('limit-reached');
          playChime('end');
          setLocalUsedSeconds(MAX_DAILY_CALL_SECONDS);
          totalUsedRef.current = MAX_DAILY_CALL_SECONDS;
          if (onTickRef.current) {
            onTickRef.current(MAX_DAILY_CALL_SECONDS);
          }
          return;
        }

        const data = await res.json();
        sessionTokenRef.current = data.sessionToken;
        totalUsedRef.current = data.usedSeconds;
        setLocalUsedSeconds(data.usedSeconds);
        if (onTickRef.current) {
          onTickRef.current(data.usedSeconds);
        }

        playChime('start');
        isTerminatedRef.current = false;
        setSessionDuration(0);
        setSpeechPhase('listening');

        // Compteur visuel d'affichage fluide (1s)
        callTimerRef.current = window.setInterval(() => {
          setSessionDuration((s) => s + 1);

          totalUsedRef.current = Math.min(MAX_DAILY_CALL_SECONDS, totalUsedRef.current + 1);
          const nextUsed = totalUsedRef.current;
          setLocalUsedSeconds(nextUsed);

          if (onTickRef.current) {
            onTickRef.current(nextUsed);
          }

          if (nextUsed >= MAX_DAILY_CALL_SECONDS) {
            isTerminatedRef.current = true;
            setSpeechPhase('limit-reached');
            playChime('end');
            if (callTimerRef.current) {
              clearInterval(callTimerRef.current);
              callTimerRef.current = null;
            }
          }
        }, 1000);

        // Battement de cœur serveur (Heartbeat toutes les 4s) avec horloge inaltérable
        heartbeatTimerRef.current = window.setInterval(async () => {
          if (!sessionTokenRef.current || isTerminatedRef.current) return;
          try {
            const hbRes = await fetch('/api/call/heartbeat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionToken: sessionTokenRef.current }),
            });

            if (!hbRes.ok) {
              // Quota atteint côté serveur ou session fermée
              isTerminatedRef.current = true;
              setSpeechPhase('limit-reached');
              playChime('end');
              setLocalUsedSeconds(MAX_DAILY_CALL_SECONDS);
              totalUsedRef.current = MAX_DAILY_CALL_SECONDS;
              if (callTimerRef.current) {
                clearInterval(callTimerRef.current);
                callTimerRef.current = null;
              }
              if (heartbeatTimerRef.current) {
                clearInterval(heartbeatTimerRef.current);
                heartbeatTimerRef.current = null;
              }
              return;
            }

            const hbData = await hbRes.json();
            if (typeof hbData.usedSeconds === 'number') {
              totalUsedRef.current = hbData.usedSeconds;
              setLocalUsedSeconds(hbData.usedSeconds);
              if (onTickRef.current) {
                onTickRef.current(hbData.usedSeconds);
              }
            }

            if (hbData.isExhausted || hbData.remainingSeconds <= 0) {
              isTerminatedRef.current = true;
              setSpeechPhase('limit-reached');
              playChime('end');
            }
          } catch (hbErr) {
            console.warn('Heartbeat error:', hbErr);
          }
        }, 4000);

      } catch (err) {
        console.warn('Erreur lors du démarrage de la session d\'appel:', err);
      }
    };

    startCallSession();

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (sessionTokenRef.current) {
        fetch('/api/call/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken: sessionTokenRef.current }),
        }).catch(() => {});
        sessionTokenRef.current = null;
      }
    };
  }, [isActive]);

  // Handle call limit timeout auto-close
  useEffect(() => {
    if (localUsedSeconds >= MAX_DAILY_CALL_SECONDS && isActive) {
      const timeout = setTimeout(() => {
        onClose();
      }, 5500);
      return () => clearTimeout(timeout);
    }
  }, [localUsedSeconds, isActive, onClose]);

  // 2. Speech Recognition instance setup
  const stopNativeRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsRecognizing(false);
  }, []);

  const startNativeRecognition = useCallback(() => {
    if (isMicMuted || isTerminatedRef.current || isSpeaking || isThinking || isStreaming) {
      return;
    }

    stopNativeRecognition();

    const win = window as any;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language === 'en' ? 'en-US' : 'fr-FR';

      recognition.onstart = () => {
        setIsRecognizing(true);
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0].transcript;
          if (res.isFinal) {
            final += text;
          } else {
            interim += text;
          }
        }

        const currentSaid = (final || interim).trim();
        if (currentSaid) {
          setLiveTranscript(currentSaid);

          // Reset silence detection timer: if user pauses for 1.6s, auto-send the sentence!
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          silenceTimerRef.current = window.setTimeout(() => {
            if (currentSaid.length >= 2 && !isSpeaking && !isThinking && !isStreaming) {
              setSpeechPhase('thinking');
              setLiveTranscript('');
              stopNativeRecognition();
              onSendMessage(currentSaid);
            }
          }, 1600);
        }
      };

      recognition.onerror = (e: any) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('Speech recognition notice:', e.error);
        }
        setIsRecognizing(false);
      };

      recognition.onend = () => {
        setIsRecognizing(false);
        // If still in listening phase and not speaking, restart cleanly
        if (
          isActive &&
          !isMicMuted &&
          !isTerminatedRef.current &&
          !isSpeaking &&
          !isThinking &&
          !isStreaming
        ) {
          setTimeout(() => {
            if (
              isActive &&
              !isSpeaking &&
              !isThinking &&
              !isStreaming &&
              !isTerminatedRef.current
            ) {
              startNativeRecognition();
            }
          }, 200);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn('Could not start recognition:', err);
      setIsRecognizing(false);
    }
  }, [
    isActive,
    isMicMuted,
    isSpeaking,
    isThinking,
    isStreaming,
    onSendMessage,
    stopNativeRecognition,
  ]);

  // 3. Coordinate Turn-taking State Machine
  useEffect(() => {
    if (!isActive || isTerminatedRef.current) {
      stopNativeRecognition();
      return;
    }

    if (isThinking) {
      setSpeechPhase('thinking');
      stopNativeRecognition();
      return;
    }

    if (isSpeaking || isStreaming) {
      setSpeechPhase('speaking');
      wasSpeakingRef.current = true;
      stopNativeRecognition();
      return;
    }

    // SADIO finished speaking -> Switch back to listening automatically!
    if (!isSpeaking && !isStreaming && !isThinking) {
      if (wasSpeakingRef.current) {
        wasSpeakingRef.current = false;
        playChime('listen');
      }

      setSpeechPhase('listening');
      setLiveTranscript('');
      const timer = setTimeout(() => {
        startNativeRecognition();
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [
    isActive,
    isSpeaking,
    isStreaming,
    isThinking,
    startNativeRecognition,
    stopNativeRecognition,
  ]);

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      stopNativeRecognition();
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };
  }, [stopNativeRecognition]);

  if (!isActive) return null;

  const handleHangUp = () => {
    playChime('end');
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    stopNativeRecognition();
    onStopSpeech();
    if (onTickRef.current) {
      onTickRef.current(totalUsedRef.current);
    }
    onClose();
  };

  const toggleMute = () => {
    if (isMicMuted) {
      setIsMicMuted(false);
      startNativeRecognition();
    } else {
      setIsMicMuted(true);
      stopNativeRecognition();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/90 backdrop-blur-xl animate-fade-in pointer-events-auto">
      <div className="relative w-full max-w-lg max-h-[92vh] flex flex-col rounded-3xl bg-slate-900/95 border border-cyan-500/50 shadow-[0_0_50px_rgba(6,182,212,0.35)] overflow-hidden">
        
        {/* Top Call Status Bar */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-950/95 border-b border-cyan-500/20">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-2xl bg-cyan-500/20 border border-cyan-400/50 shadow-[0_0_15px_rgba(6,182,212,0.4)]">
              <Radio className="w-4 h-4 text-cyan-300 animate-pulse" />
              <span className="absolute -inset-1 rounded-2xl bg-cyan-400/20 animate-ping pointer-events-none" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white tracking-wide">
                  Appel Vocal avec SADIO
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                  Mains Libres
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                <span>
                  Cet appel : <strong className="text-white">{formatCallTime(sessionDuration)}</strong> • Cumulé : <strong className="text-white">{formatCallTime(localUsedSeconds)}</strong> / 20:00
                </span>
              </p>
            </div>
          </div>

          {/* Remaining Time Badge (Starts at 20-2=18 min if 2 min used!) */}
          <div className="text-right">
            <div
              className={`text-xs font-mono font-bold px-2.5 py-1 rounded-xl border ${
                remainingSeconds <= 120
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse'
                  : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 shadow-sm'
              }`}
            >
              Reste {formatCallTime(remainingSeconds)}
            </div>
          </div>
        </div>

        {/* 20-minute Cumulative Progress Bar */}
        <div className="w-full bg-slate-950 h-1.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ease-linear rounded-r-full shadow-sm ${
              remainingSeconds <= 120
                ? 'bg-rose-500 shadow-rose-500/50 animate-pulse'
                : 'bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 shadow-cyan-400/50'
            }`}
            style={{ width: `${Math.min(100, (localUsedSeconds / MAX_DAILY_CALL_SECONDS) * 100)}%` }}
          />
        </div>

        {/* Call Body: Interactive Cybernetic Visualizer */}
        <div className="p-5 sm:p-6 flex flex-col items-center justify-center text-center space-y-4 overflow-y-auto">
          
          {/* Central Pulsing Animated Avatar Reactor */}
          <div className="relative flex items-center justify-center my-2">
            {/* Outer animated rings */}
            <div
              className={`absolute w-32 h-32 rounded-full border transition-all duration-500 ${
                speechPhase === 'listening'
                  ? 'border-emerald-500/40 animate-ping'
                  : speechPhase === 'speaking'
                  ? 'border-cyan-400/40 animate-pulse'
                  : speechPhase === 'limit-reached'
                  ? 'border-rose-500/40'
                  : 'border-blue-500/30'
              }`}
            />
            <div
              className={`absolute w-24 h-24 rounded-full border transition-all duration-300 ${
                speechPhase === 'listening'
                  ? 'border-emerald-400/60 bg-emerald-500/10'
                  : speechPhase === 'speaking'
                  ? 'border-cyan-400/60 bg-cyan-500/10'
                  : speechPhase === 'limit-reached'
                  ? 'border-rose-400/40 bg-rose-500/10'
                  : 'border-blue-400/40 bg-blue-500/10'
              }`}
            />

            {/* Core Icon Button */}
            <div
              className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 ${
                speechPhase === 'listening'
                  ? 'bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-emerald-500/40 scale-105'
                  : speechPhase === 'speaking'
                  ? 'bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-cyan-500/50'
                  : speechPhase === 'limit-reached'
                  ? 'bg-rose-600 text-white shadow-rose-600/50'
                  : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white'
              }`}
            >
              {speechPhase === 'listening' ? (
                <Mic className="w-8 h-8 animate-bounce" />
              ) : speechPhase === 'speaking' ? (
                <Volume2 className="w-8 h-8 animate-pulse" />
              ) : speechPhase === 'limit-reached' ? (
                <AlertTriangle className="w-8 h-8" />
              ) : (
                <Sparkles className="w-8 h-8 animate-spin" />
              )}
            </div>
          </div>

          {/* Phase Status Banner */}
          <div className="space-y-1.5 max-w-sm">
            <div className="flex items-center justify-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  speechPhase === 'listening'
                    ? 'bg-emerald-400 animate-ping'
                    : speechPhase === 'speaking'
                    ? 'bg-cyan-400 animate-pulse'
                    : speechPhase === 'limit-reached'
                    ? 'bg-rose-500'
                    : 'bg-blue-400 animate-spin'
                }`}
              />
              <h3 className="text-base sm:text-lg font-bold text-white tracking-wide">
                {speechPhase === 'listening'
                  ? isMicMuted
                    ? 'Micro en sourdine'
                    : 'SADIO vous écoute...'
                  : speechPhase === 'speaking'
                  ? 'SADIO vous répond'
                  : speechPhase === 'limit-reached'
                  ? 'Quota quotidien de 20 min atteint'
                  : 'SADIO réfléchit...'}
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-400">
              {speechPhase === 'listening'
                ? 'Parlez librement sans toucher votre écran. La fin de votre phrase est détectée automatiquement.'
                : speechPhase === 'speaking'
                ? 'Le micro est temporairement coupé pour éliminer tout écho.'
                : speechPhase === 'limit-reached'
                ? "Vous avez utilisé l'intégralité de vos 20 minutes d'appel pour aujourd'hui. Votre quota sera réinitialisé demain."
                : 'Analyse neuronale de votre question...'}
            </p>
          </div>

          {/* Live Audio / Transcript Visualizer Bubble */}
          <div className="w-full min-h-[64px] max-h-28 overflow-y-auto p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs sm:text-sm text-left">
            {speechPhase === 'listening' && liveTranscript ? (
              <p className="text-emerald-300 font-sans leading-relaxed animate-fade-in">
                <span className="text-emerald-500 font-mono text-[11px] block mb-1">
                  Vous dites :
                </span>
                « {liveTranscript} »
              </p>
            ) : speechPhase === 'speaking' && currentSentence ? (
              <p className="text-cyan-200 font-sans leading-relaxed animate-fade-in line-clamp-3">
                <span className="text-cyan-400 font-mono text-[11px] block mb-1">
                  SADIO dit :
                </span>
                « {currentSentence} »
              </p>
            ) : (
              <p className="text-slate-500 italic text-center py-2 flex items-center justify-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>Conversation continue active • Dites ce que vous voulez</span>
              </p>
            )}
          </div>

          {/* Quota Exhausted Locked Card */}
          {speechPhase === 'limit-reached' && (
            <div className="w-full px-4 py-3 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex flex-col items-center justify-center gap-1.5 shadow-xl animate-fade-in">
              <div className="flex items-center gap-2 font-bold text-rose-200">
                <Lock className="w-4 h-4 text-rose-400" />
                <span>Quota quotidien strict atteint (20 minutes d'appel max)</span>
              </div>
              <p className="text-[11px] text-rose-300/80 max-w-sm text-center">
                Pour préserver la gratuité et prévenir les abus de bande passante, chaque utilisateur bénéficie de 20 min d'appel par tranche de 24h.
              </p>
              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-1">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>Réinitialisation automatique cette nuit à 00h00 GMT</span>
              </div>
            </div>
          )}

          {/* Warning banner when under 2 minutes */}
          {remainingSeconds <= 120 && remainingSeconds > 0 && speechPhase !== 'limit-reached' && (
            <div className="w-full px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-center gap-2 animate-pulse">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Attention : Il vous reste moins de 2 minutes de quota aujourd'hui ({formatCallTime(remainingSeconds)}).</span>
            </div>
          )}

        </div>

        {/* Bottom Control Actions Bar */}
        <div className="px-6 py-4 bg-slate-950/95 border-t border-slate-800 flex items-center justify-around gap-4">
          
          {/* Mute Mic Toggle */}
          <button
            type="button"
            onClick={toggleMute}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition active:scale-95 ${
              isMicMuted
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
            title={isMicMuted ? 'Réactiver le micro' : 'Couper le micro'}
          >
            {isMicMuted ? <MicOff className="w-5 h-5 text-rose-400" /> : <Mic className="w-5 h-5" />}
            <span className="text-[10px] font-medium">{isMicMuted ? 'Muet' : 'Micro'}</span>
          </button>

          {/* Prominent Red Hang Up Button */}
          <button
            type="button"
            onClick={handleHangUp}
            className="flex items-center justify-center w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-xl shadow-rose-600/40 transition-all hover:scale-105 active:scale-95"
            title="Raccrocher et terminer l'appel"
          >
            <PhoneOff className="w-6 h-6" />
          </button>

          {/* View Full Document Text Modal */}
          <button
            type="button"
            onClick={onOpenDocumentModal}
            className="flex flex-col items-center gap-1.5 p-3 rounded-2xl text-slate-400 hover:text-cyan-300 hover:bg-slate-800/60 transition active:scale-95"
            title="Consulter le texte complet"
          >
            <FileText className="w-5 h-5" />
            <span className="text-[10px] font-medium">Document</span>
          </button>

        </div>

      </div>
    </div>
  );
};

export default HandsFreeCallModal;
