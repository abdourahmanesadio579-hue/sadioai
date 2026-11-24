import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RobotState, RobotTheme } from '../types/chat';
import { Sparkles, Cpu, Volume2, VolumeX, Eye, Zap, ShieldCheck, X } from 'lucide-react';

interface StandingRobotAvatarProps {
  state: RobotState;
  theme?: RobotTheme;
  onAvatarClick?: () => void;
  currentSpeechSnippet?: string;
  thinkingCountdown?: number | null;
  isThinking?: boolean;
  isBusySpeakingAnswer?: boolean;
  isStreaming?: boolean;
  streamingText?: string;
  isGreeting?: boolean;
  greetingText?: string;
  onReplayGreeting?: () => void;
  onDismissGreeting?: () => void;
  isVoicing?: boolean;
  mouthOpenLevel?: number;
}

export interface TextProsodyMetrics {
  speedFactor: number;
  amplitude: number;
}

export function analyzeProsodyFromText(text: string, isLiveStreamTail = false): TextProsodyMetrics {
  const trimmed = (text || '').trimEnd();
  if (!trimmed) {
    return { speedFactor: 1.0, amplitude: 0.65 };
  }

  // 1. Comma / pause detection at the active tip (strongest during live streaming) or high punctuation density
  const tailSlice = trimmed.slice(-6);
  const endsWithCommaPause = /[,;:—–(\[]$/.test(tailSlice.slice(-2));
  const endsWithSentencePause = /[.!?…]$/.test(tailSlice.slice(-1));

  if (isLiveStreamTail && endsWithCommaPause) {
    return { speedFactor: 0.42, amplitude: 0.26 };
  }
  if (isLiveStreamTail && endsWithSentencePause) {
    return { speedFactor: 0.34, amplitude: 0.18 };
  }

  // 2. Analyze words in the active tail window
  const windowText = trimmed.slice(-80);
  const words = windowText.match(/[A-Za-zÀ-ÿ]+/g) || [];
  const lastWord = words[words.length - 1] || '';
  const recentWords = words.slice(-4);
  const maxRecentLen = recentWords.reduce((m, w) => Math.max(m, w.length), 0);
  const avgRecentLen =
    recentWords.length > 0 ? recentWords.reduce((s, w) => s + w.length, 0) / recentWords.length : 0;

  // For TTS snippet playback (non-streaming), gently blend comma density slowing with long-word acceleration
  if (!isLiveStreamTail) {
    const commaCount = (windowText.match(/[,;:—–]/g) || []).length;
    if (endsWithCommaPause || (commaCount >= 2 && lastWord.length < 7)) {
      return { speedFactor: 0.52, amplitude: 0.36 };
    }
  }

  const effectiveLen = Math.max(lastWord.length, maxRecentLen * 0.9, avgRecentLen * 1.1);
  if (effectiveLen >= 7) {
    const longBoost = Math.min(1, (effectiveLen - 6) / 6);
    return {
      speedFactor: Number((1.15 + longBoost * 0.65).toFixed(2)),
      amplitude: Number((0.72 + longBoost * 0.14).toFixed(2)),
    };
  }

  return { speedFactor: 0.95, amplitude: 0.66 };
}

const themeColorMap = {
  cyan: {
    primary: '#06b6d4',
    secondary: '#38bdf8',
    glow: 'rgba(6, 182, 212, 0.45)',
    accent: '#22d3ee',
    bgBadge: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300',
    ringGradient: 'from-cyan-500 to-blue-600',
  },
  purple: {
    primary: '#a855f7',
    secondary: '#c084fc',
    glow: 'rgba(168, 85, 247, 0.45)',
    accent: '#e879f9',
    bgBadge: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
    ringGradient: 'from-purple-500 to-indigo-600',
  },
  amber: {
    primary: '#f59e0b',
    secondary: '#fbbf24',
    glow: 'rgba(245, 158, 11, 0.45)',
    accent: '#fcd34d',
    bgBadge: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    ringGradient: 'from-amber-500 to-orange-600',
  },
  emerald: {
    primary: '#10b981',
    secondary: '#34d399',
    glow: 'rgba(16, 185, 129, 0.45)',
    accent: '#6ee7b7',
    bgBadge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    ringGradient: 'from-emerald-500 to-teal-600',
  },
};

export const StandingRobotAvatar: React.FC<StandingRobotAvatarProps> = ({
  state,
  theme = 'cyan',
  onAvatarClick,
  currentSpeechSnippet,
  thinkingCountdown,
  isThinking,
  isBusySpeakingAnswer = false,
  isStreaming = false,
  streamingText = '',
  isGreeting = false,
  greetingText,
  onReplayGreeting,
  onDismissGreeting,
  isVoicing = false,
  mouthOpenLevel = 0,
}) => {
  const [blink, setBlink] = useState(false);
  const [isWaving, setIsWaving] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [prosodyMouthLevel, setProsodyMouthLevel] = useState(0);

  const colors = themeColorMap[theme] || themeColorMap.cyan;
  const isCurrentlyThinking = Boolean(isThinking) || state === 'thinking';
  const hasActiveStreamText = Boolean(isStreaming && streamingText && streamingText.trim().length > 0);
  const shouldDriveMouth = isVoicing || (state === 'speaking' && !isCurrentlyThinking) || hasActiveStreamText;

  // Dynamic prosody refs (updated without restarting the animation frame loop so phase never snaps)
  const targetSpeedRef = useRef<number>(1.0);
  const targetAmplitudeRef = useRef<number>(0.66);
  const lastStreamLenRef = useRef<number>(0);
  const lastStreamUpdateAtRef = useRef<number>(0);
  const isVoicingPropRef = useRef<boolean>(isVoicing);
  const statePropRef = useRef<RobotState>(state);
  const isStreamingPropRef = useRef<boolean>(Boolean(isStreaming));

  isVoicingPropRef.current = isVoicing;
  statePropRef.current = state;
  isStreamingPropRef.current = Boolean(isStreaming);

  useEffect(() => {
    if (isStreaming && streamingText) {
      if (streamingText.length !== lastStreamLenRef.current) {
        lastStreamLenRef.current = streamingText.length;
        lastStreamUpdateAtRef.current = performance.now();
      }
      const metrics = analyzeProsodyFromText(streamingText, true);
      targetSpeedRef.current = metrics.speedFactor;
      targetAmplitudeRef.current = metrics.amplitude;
    } else {
      lastStreamLenRef.current = 0;
      const metrics = analyzeProsodyFromText(currentSpeechSnippet || '', false);
      targetSpeedRef.current = metrics.speedFactor;
      targetAmplitudeRef.current = metrics.amplitude;
    }
  }, [isStreaming, streamingText, currentSpeechSnippet]);

  // Continuous phase-integrated prosody oscillator synchronized with TTS and streaming text
  useEffect(() => {
    if (!shouldDriveMouth) {
      setProsodyMouthLevel(0);
      return;
    }

    let rafId = 0;
    let prevNow = performance.now();
    let lastEmit = 0;
    let phase = 0;
    let smoothSpeed = targetSpeedRef.current;
    let smoothAmp = targetAmplitudeRef.current;
    let currentLevel = 0.14;

    const tick = (now: number) => {
      const dt = Math.min(0.08, Math.max(0.001, (now - prevNow) / 1000));
      prevNow = now;

      smoothSpeed += (targetSpeedRef.current - smoothSpeed) * 0.16;
      smoothAmp += (targetAmplitudeRef.current - smoothAmp) * 0.18;

      // Continuous phase accumulation guarantees smooth acceleration on long words and gentle slowing at commas
      phase += dt * 9.6 * smoothSpeed;

      // Fade out naturally if streaming pauses briefly without TTS voicing
      let activityDrive = 1.0;
      if (!isVoicingPropRef.current && statePropRef.current !== 'speaking' && isStreamingPropRef.current) {
        const silenceAgeMs = now - lastStreamUpdateAtRef.current;
        if (silenceAgeMs > 420) {
          activityDrive = Math.max(0, 1 - (silenceAgeMs - 420) / 550);
        }
      }

      const wave = 0.5 + 0.5 * Math.sin(phase);
      const cadenceMod = 0.58 + 0.42 * Math.sin(phase * 0.63 + 0.7);
      const targetLevel = (0.08 + smoothAmp * 0.72 * wave * cadenceMod) * activityDrive;
      currentLevel += (targetLevel - currentLevel) * 0.34;

      if (now - lastEmit >= 48) {
        lastEmit = now;
        setProsodyMouthLevel(currentLevel);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [shouldDriveMouth]);

  const effectiveMouthLevel =
    isVoicing && mouthOpenLevel > 0.02
      ? targetSpeedRef.current < 0.65
        ? prosodyMouthLevel * 0.7 + mouthOpenLevel * 0.3
        : mouthOpenLevel * 0.42 + prosodyMouthLevel * 0.58
      : prosodyMouthLevel;

  const isMouthAnimating = shouldDriveMouth && effectiveMouthLevel > 0.02;

  // Natural blinking effect
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 160);
    }, 3800);
    return () => clearInterval(blinkInterval);
  }, []);

  const isBusy = isCurrentlyThinking || Boolean(isBusySpeakingAnswer) || state === 'speaking' || isVoicing;

  const handleRobotClick = (e?: React.MouseEvent) => {
    const nativeSynthActive =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      (window.speechSynthesis.speaking || window.speechSynthesis.pending);

    if (isBusy || nativeSynthActive) {
      e?.stopPropagation();
      return;
    }
    setIsWaving(true);
    setClickCount((c) => c + 1);
    setTimeout(() => setIsWaving(false), 2400);
    onAvatarClick?.();
  };

  // Robust kinematic arm articulation angles (in degrees, strictly pivoting around exact SVG joint coordinates)
  const [leftShoulderAngle, setLeftShoulderAngle] = useState(0);
  const [leftForearmAngle, setLeftForearmAngle] = useState(0);
  const [rightShoulderAngle, setRightShoulderAngle] = useState(0);
  const [rightForearmAngle, setRightForearmAngle] = useState(0);

  const curLeftShoulder = useRef(0);
  const curLeftForearm = useRef(0);
  const curRightShoulder = useRef(0);
  const curRightForearm = useRef(0);

  useEffect(() => {
    let animId: number;
    const startTime = performance.now();

    const updateArms = (now: number) => {
      const elapsed = (now - startTime) / 1000;

      let targetLS = 0;
      let targetLF = 0;
      let targetRS = 0;
      let targetRF = 0;

      if (isWaving || isGreeting) {
        // Natural warm friendly waving / salute: shoulder lifts comfortably, forearm waves warmly
        const waveOsc = Math.sin(elapsed * 9);
        targetLS = -16;
        targetLF = -22 + waveOsc * 18;
        targetRS = 0;
        targetRF = 4;
      } else if (state === 'speaking') {
        // Natural conversational humanoid gestures
        const talkOsc1 = Math.sin(elapsed * 3.2);
        const talkOsc2 = Math.cos(elapsed * 2.6);
        targetLS = talkOsc1 * 2;
        targetLF = -6 + talkOsc1 * 6;
        targetRS = talkOsc2 * 2;
        targetRF = 6 + talkOsc2 * 7;
      } else if (isCurrentlyThinking) {
        // Analytical pose during thinking: right arm takes thoughtful angle, left arm rests
        const thinkPulse = Math.sin(elapsed * 2.5) * 1.5;
        targetLS = 0;
        targetLF = 0;
        targetRS = -4;
        targetRF = 16 + thinkPulse;
      } else {
        // Idle: subtle cybernetic ambient breathing
        const breath = Math.sin(elapsed * 1.4) * 1.2;
        targetLS = breath;
        targetLF = breath * 0.4;
        targetRS = -breath;
        targetRF = -breath * 0.4;
      }

      // Smooth interpolation (damping factor) to prevent sudden snapping
      const lerp = 0.18;
      curLeftShoulder.current += (targetLS - curLeftShoulder.current) * lerp;
      curLeftForearm.current += (targetLF - curLeftForearm.current) * lerp;
      curRightShoulder.current += (targetRS - curRightShoulder.current) * lerp;
      curRightForearm.current += (targetRF - curRightForearm.current) * lerp;

      setLeftShoulderAngle(curLeftShoulder.current);
      setLeftForearmAngle(curLeftForearm.current);
      setRightShoulderAngle(curRightShoulder.current);
      setRightForearmAngle(curRightForearm.current);

      animId = requestAnimationFrame(updateArms);
    };

    animId = requestAnimationFrame(updateArms);
    return () => cancelAnimationFrame(animId);
  }, [state, isWaving, isGreeting, isCurrentlyThinking]);

  const statusTextMap: Record<RobotState, string> = {
    idle: isGreeting ? '👋 SADIO vous salue chaleureusement !' : 'SADIO en veille active',
    listening: 'SADIO écoute vos capteurs audio...',
    thinking:
      thinkingCountdown && thinkingCountdown > 0
        ? `SADIO est en train de réfléchir (${thinkingCountdown}s)...`
        : 'SADIO est en train de réfléchir...',
    speaking: isGreeting ? '👋 SADIO vous souhaite la bienvenue !' : 'SADIO lit la réponse...',
  };

  return (
    <div className="relative flex flex-col items-center justify-between w-full h-full select-none p-1.5 sm:p-2 overflow-hidden">
      {/* Top Status Bar & Controls */}
      <div className="w-full flex items-center justify-between px-2 sm:px-3 py-1 z-20 gap-1.5">
        <div className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-mono font-medium border ${colors.bgBadge} backdrop-blur-md shrink min-w-0 max-w-[70%]`}>
          <span className="relative flex h-2 w-2 shrink-0">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75`}
              style={{ backgroundColor: colors.primary }}
            />
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ backgroundColor: colors.primary }}
            />
          </span>
          <span className="truncate">{isCurrentlyThinking ? (thinkingCountdown && thinkingCountdown > 0 ? `SADIO réfléchit (${thinkingCountdown}s)...` : 'SADIO est en train de réfléchir...') : statusTextMap[state]}</span>
        </div>


      </div>

      {/* HOLOGRAPHIC WARM WELCOME BALLOON - UNIQUEMENT LORS D'UNE SALUTATION DU ROBOT */}
      <AnimatePresence>
        {isGreeting && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            className="absolute z-40 left-2 right-2 sm:left-[55%] sm:right-auto top-10 sm:top-11 max-w-[calc(100%-16px)] sm:max-w-[280px] md:max-w-[320px] max-h-[75vh] overflow-y-auto no-scrollbar p-2.5 sm:p-3.5 rounded-2xl bg-slate-900/95 border-2 border-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.55)] backdrop-blur-xl pointer-events-auto"
          >
            {/* Thought pointer towards SADIO on desktop/tablets */}
            <div className="hidden sm:block absolute -left-2 top-5 w-3.5 h-3.5 bg-slate-900 border-l-2 border-b-2 border-cyan-400 rotate-45" />

            {/* Cyber thought connector dots from robot on desktop */}
            <div className="hidden sm:flex absolute -left-6 top-5 items-center gap-1 pointer-events-none">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping opacity-80" />
              <span className="w-2 h-2 rounded-full bg-cyan-400/90 shadow-[0_0_6px_#22d3ee]" />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="relative flex items-center justify-center shrink-0 w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/60 shadow-[0_0_12px_rgba(6,182,212,0.4)]">
                    <span className="text-base select-none">👋</span>
                    <span className="absolute -inset-0.5 rounded-xl bg-cyan-400/25 animate-ping pointer-events-none" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-xs sm:text-sm text-cyan-100 font-sans leading-tight truncate">
                      Bonjour et bienvenue !
                    </span>
                    <span className="text-[10px] text-cyan-300 font-mono truncate">
                      SADIO vous salue chaleureusement
                    </span>
                  </div>
                </div>
                {onDismissGreeting && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismissGreeting();
                    }}
                    aria-label="Fermer"
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <p className="text-[11px] sm:text-xs text-slate-200 leading-snug font-sans">
                {greetingText || "« Ravi de vous accueillir ! Je suis debout et prêt à répondre à toutes vos questions. »"}
              </p>

              {onReplayGreeting && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReplayGreeting();
                  }}
                  className="mt-1 w-full py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/30 transition-all active:scale-95 animate-pulse"
                >
                  <Volume2 className="w-4 h-4 shrink-0 text-white" />
                  <span>🔊 Activer la voix de SADIO</span>
                </button>
              )}
              <p className="text-[10px] text-slate-400 text-center font-mono leading-tight">
                Conseil mobile : montez le volume média & désactivez le mode silencieux
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Center Standing Robot Canvas & SVG */}
      <div
        data-robot-avatar="true"
        onClick={handleRobotClick}
        className={`relative flex-1 w-full max-w-[300px] xs:max-w-[340px] sm:max-w-[380px] md:max-w-[440px] lg:max-w-[480px] flex items-center justify-center group mt-0.5 ${
          isBusy ? 'cursor-default' : 'cursor-pointer'
        }`}
        title={
          isBusy
            ? isCurrentlyThinking
              ? 'SADIO est en pleine réflexion...'
              : 'SADIO est en train de vous répondre...'
            : 'Cliquez pour interagir avec le robot SADIO'
        }
      >
        {/* Subtle Ambient Backlight Glow */}
        <div
          className="absolute w-52 h-80 rounded-full blur-3xl opacity-35 transition-all duration-700 pointer-events-none"
          style={{
            backgroundColor: colors.primary,
            transform: state === 'thinking' ? 'scale(1.3)' : 'scale(1)',
          }}
        />

        {/* The Standing Robot Container */}
        <motion.div
          animate={{
            y: state === 'speaking' ? [0, -3, 0] : [0, -4, 0],
            rotate: isWaving ? [0, 2, -2, 0] : 0,
          }}
          transition={{
            y: {
              repeat: Infinity,
              duration: state === 'speaking' ? 2 : 4,
              ease: 'easeInOut',
            },
            rotate: { duration: 0.6 },
          }}
          className="relative w-full h-full flex flex-col items-center justify-center"
        >
          {/* Standing Robot Full Body SVG */}
          <svg
            viewBox="0 0 240 400"
            className="w-full h-auto max-h-[360px] xs:max-h-[400px] sm:max-h-[450px] md:max-h-[500px] lg:max-h-[540px] drop-shadow-[0_16px_32px_rgba(0,0,0,0.65)]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="bodyArmorLight" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f1f5f9" />
                <stop offset="40%" stopColor="#cbd5e1" />
                <stop offset="100%" stopColor="#94a3b8" />
              </linearGradient>

              <linearGradient id="bodyArmorDark" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#334155" />
                <stop offset="50%" stopColor="#1e293b" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>

              <linearGradient id="cyberChassis" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#475569" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>

              <linearGradient id="mouthCavityGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#05070e" />
                <stop offset="55%" stopColor="#140c18" />
                <stop offset="100%" stopColor="#090d16" />
              </linearGradient>

              <radialGradient id="tongueGrad" cx="50%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#9d4261" />
                <stop offset="65%" stopColor="#6b233d" />
                <stop offset="100%" stopColor="#3b1021" />
              </radialGradient>

              <linearGradient id="upperToothEnamel" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#cbd5e1" />
                <stop offset="28%" stopColor="#f1f5f9" />
                <stop offset="78%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#e2e8f0" />
              </linearGradient>

              <linearGradient id="lowerToothEnamel" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#dce4ef" />
                <stop offset="45%" stopColor="#eef2f7" />
                <stop offset="100%" stopColor="#94a3b8" />
              </linearGradient>

              <linearGradient id="upperLipCastShadow" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#060911" stopOpacity="0.62" />
                <stop offset="100%" stopColor="#060911" stopOpacity="0" />
              </linearGradient>

              <filter id="neonGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* --- HEAD & SENSORS --- */}
            <g id="head-group">
              {/* Antenna */}
              <line x1="120" y1="52" x2="120" y2="24" stroke="#64748b" strokeWidth="4" strokeLinecap="round" />
              <motion.circle
                cx="120"
                cy="20"
                r="6"
                fill={colors.primary}
                filter="url(#neonGlow)"
                animate={{
                  r: state === 'thinking' || state === 'listening' ? [5, 8, 5] : [5, 6, 5],
                  opacity: state === 'thinking' ? [0.6, 1, 0.6] : [0.8, 1, 0.8],
                }}
                transition={{ repeat: Infinity, duration: 1.2 }}
              />
              <circle cx="120" cy="20" r="2.5" fill="#ffffff" />

              {/* Antenna Wi-Fi Signals when listening */}
              {state === 'listening' && (
                <g stroke={colors.primary} strokeWidth="1.5" strokeLinecap="round" opacity="0.8">
                  <path d="M 112 14 A 10 10 0 0 1 128 14" />
                  <path d="M 106 8 A 18 18 0 0 1 134 8" />
                </g>
              )}

              {/* Ears / Side Sensory Modules */}
              <rect x="74" y="66" width="10" height="26" rx="4" fill="#334155" stroke="#475569" strokeWidth="1.5" />
              <rect x="76" y="72" width="3" height="14" rx="1.5" fill={colors.secondary} />
              
              <rect x="156" y="66" width="10" height="26" rx="4" fill="#334155" stroke="#475569" strokeWidth="1.5" />
              <rect x="161" y="72" width="3" height="14" rx="1.5" fill={colors.secondary} />

              {/* Head Outer Shell */}
              <rect
                x="80"
                y="48"
                width="80"
                height="62"
                rx="20"
                fill="url(#bodyArmorLight)"
                stroke="#64748b"
                strokeWidth="2"
              />
              {/* Brow detail plate */}
              <path d="M 88 56 Q 120 50 152 56 L 152 62 Q 120 56 88 62 Z" fill="#94a3b8" />

              {/* Black Glass Visor Face Screen */}
              <rect
                x="88"
                y="62"
                width="64"
                height="40"
                rx="14"
                fill="#090d16"
                stroke="#334155"
                strokeWidth="2"
              />

              {/* Glowing Cybernetic Eyes / Visor Display */}
              <g filter="url(#neonGlow)">
                {blink ? (
                  // Blinking slit
                  <g stroke={colors.primary} strokeWidth="2.5" strokeLinecap="round">
                    <line x1="97" y1="80" x2="111" y2="80" />
                    <line x1="129" y1="80" x2="143" y2="80" />
                  </g>
                ) : isWaving || isGreeting ? (
                  // Cheerful smiling arched eyes when waving or greeting warmly!
                  <g stroke={colors.primary} strokeWidth="3" strokeLinecap="round" fill="none">
                    <path d="M 97 82 Q 104 73 111 82" />
                    <path d="M 129 82 Q 136 73 143 82" />
                    <circle cx="104" cy="73" r="1.5" fill="#ffffff" />
                    <circle cx="136" cy="73" r="1.5" fill="#ffffff" />
                  </g>
                ) : state === 'thinking' ? (
                  // Spinning / Scanning rings in eyes
                  <g>
                    <circle cx="104" cy="80" r="7" stroke={colors.primary} strokeWidth="2" fill="none" />
                    <circle cx="136" cy="80" r="7" stroke={colors.primary} strokeWidth="2" fill="none" />
                    <circle cx="104" cy="80" r="3" fill="#ffffff" />
                    <circle cx="136" cy="80" r="3" fill="#ffffff" />
                  </g>
                ) : (
                  // Regular friendly cyber eyes
                  <g>
                    <circle cx="104" cy="80" r="6.5" fill={colors.primary} />
                    <circle cx="136" cy="80" r="6.5" fill={colors.primary} />
                    <circle cx="104" cy="79" r="2.8" fill="#ffffff" />
                    <circle cx="136" cy="79" r="2.8" fill="#ffffff" />
                    {/* Upper eyelid arch for friendly expression */}
                    <path d="M 97 76 Q 104 73 111 76" stroke="#0f172a" strokeWidth="1" fill="none" />
                    <path d="M 129 76 Q 136 73 143 76" stroke="#0f172a" strokeWidth="1" fill="none" />
                  </g>
                )}
              </g>

              {/* Natural Gentle Talking Mouth with Realistic Teeth Visible Only When Open */}
              {isMouthAnimating && effectiveMouthLevel > 0.02 ? (
                (() => {
                  const open = Math.min(1, Math.max(0, effectiveMouthLevel));
                  const leftXNum = 110.2 + open * 1.4;
                  const rightXNum = 129.8 - open * 1.4;
                  const leftX = leftXNum.toFixed(2);
                  const rightX = rightXNum.toFixed(2);
                  const leftCtrlX = (leftXNum + 4.3).toFixed(2);
                  const rightCtrlX = (rightXNum - 4.3).toFixed(2);
                  const cornerY = (92.4 + open * 0.4).toFixed(2);
                  const upperY = (92.4 - open * 1.35).toFixed(2);
                  const lowerY = (93.8 + open * 5.8).toFixed(2);
                  const mouthPath = `M ${leftX} ${cornerY} C ${leftCtrlX} ${upperY}, ${rightCtrlX} ${upperY}, ${rightX} ${cornerY} C ${rightCtrlX} ${lowerY}, ${leftCtrlX} ${lowerY}, ${leftX} ${cornerY} Z`;

                  // Teeth appear strictly when the mouth actually opens, fading smoothly from closed lips
                  const showUpperTeeth = open > 0.14;
                  const showLowerTeeth = open > 0.26;
                  const upperTeethOpacity = showUpperTeeth
                    ? Math.min(0.97, (open - 0.14) / 0.2)
                    : 0;
                  const lowerTeethOpacity = showLowerTeeth
                    ? Math.min(0.9, (open - 0.26) / 0.24)
                    : 0;
                  const upperJawDropY = (open - 0.14) * 0.35;
                  const lowerJawDropY = (open - 0.26) * 2.3;
                  const tongueY = (96.2 + open * 1.9).toFixed(2);
                  const shadowHeight = (1.6 + open * 0.6).toFixed(2);

                  return (
                    <g>
                      <defs>
                        <clipPath id="robotMouthClip">
                          <path d={mouthPath} />
                        </clipPath>
                      </defs>

                      {/* Depth-shaded oral cavity, tongue & sculpted teeth clipped strictly to the open lips */}
                      <g clipPath="url(#robotMouthClip)">
                        <path d={mouthPath} fill="url(#mouthCavityGrad)" />

                        {/* Subtle anatomical tongue visible inside wide mouth openings */}
                        {open > 0.18 && (
                          <g opacity={Math.min(0.85, (open - 0.18) * 1.35).toFixed(2)}>
                            <ellipse cx="120" cy={tongueY} rx="6.8" ry="2.5" fill="url(#tongueGrad)" />
                            <path
                              d={`M 116.8 ${(Number(tongueY) - 0.4).toFixed(2)} Q 120 ${(Number(tongueY) + 0.35).toFixed(2)} 123.2 ${(Number(tongueY) - 0.4).toFixed(2)}`}
                              stroke="#471327"
                              strokeWidth="0.45"
                              strokeLinecap="round"
                              fill="none"
                              opacity="0.6"
                            />
                          </g>
                        )}

                        {/* Realistic Upper Dental Arch (6 individual contoured teeth) */}
                        {showUpperTeeth && (
                          <g
                            opacity={upperTeethOpacity.toFixed(2)}
                            transform={`translate(0, ${upperJawDropY.toFixed(2)})`}
                          >
                            {/* Subtle upper gum shadow behind teeth */}
                            <path
                              d="M 111.5 89.2 Q 120 90.4 128.5 89.2 L 128.5 91.5 Q 120 92.1 111.5 91.5 Z"
                              fill="#5b2135"
                              opacity="0.7"
                            />
                            {/* Left canine */}
                            <path
                              d="M 112.4 89.6 L 114.55 89.6 L 114.5 92.3 Q 113.5 93.05 112.55 92.25 Z"
                              fill="url(#upperToothEnamel)"
                              stroke="#64748b"
                              strokeWidth="0.22"
                            />
                            {/* Left lateral incisor */}
                            <path
                              d="M 114.68 89.6 L 117.02 89.6 L 116.95 92.65 Q 115.85 93.2 114.75 92.65 Z"
                              fill="url(#upperToothEnamel)"
                              stroke="#64748b"
                              strokeWidth="0.22"
                            />
                            {/* Left central incisor */}
                            <path
                              d="M 117.14 89.6 L 119.92 89.6 L 119.86 92.95 Q 118.52 93.45 117.2 92.95 Z"
                              fill="url(#upperToothEnamel)"
                              stroke="#64748b"
                              strokeWidth="0.22"
                            />
                            {/* Right central incisor */}
                            <path
                              d="M 120.08 89.6 L 122.86 89.6 L 122.8 92.95 Q 121.48 93.45 120.14 92.95 Z"
                              fill="url(#upperToothEnamel)"
                              stroke="#64748b"
                              strokeWidth="0.22"
                            />
                            {/* Right lateral incisor */}
                            <path
                              d="M 122.98 89.6 L 125.32 89.6 L 125.25 92.65 Q 124.15 93.2 123.05 92.65 Z"
                              fill="url(#upperToothEnamel)"
                              stroke="#64748b"
                              strokeWidth="0.22"
                            />
                            {/* Right canine */}
                            <path
                              d="M 125.45 89.6 L 127.6 89.6 L 127.45 92.25 Q 126.5 93.05 125.5 92.3 Z"
                              fill="url(#upperToothEnamel)"
                              stroke="#64748b"
                              strokeWidth="0.22"
                            />
                            {/* Subtle enamel highlight across the front upper teeth */}
                            <path
                              d="M 115.2 91.4 Q 120 92.05 124.8 91.4"
                              stroke="#ffffff"
                              strokeWidth="0.55"
                              strokeLinecap="round"
                              fill="none"
                              opacity="0.7"
                            />
                          </g>
                        )}

                        {/* Realistic Lower Dental Arch (slightly narrower & softly shaded in jaw depth) */}
                        {showLowerTeeth && (
                          <g
                            opacity={lowerTeethOpacity.toFixed(2)}
                            transform={`translate(0, ${lowerJawDropY.toFixed(2)})`}
                          >
                            {/* Left lower canine */}
                            <path
                              d="M 113.4 95.3 Q 114.2 94.75 115.05 95.35 L 115.1 98.4 L 113.35 98.4 Z"
                              fill="url(#lowerToothEnamel)"
                              stroke="#475569"
                              strokeWidth="0.2"
                            />
                            {/* Left lower lateral */}
                            <path
                              d="M 115.18 95.15 Q 116.25 94.75 117.32 95.15 L 117.35 98.5 L 115.15 98.5 Z"
                              fill="url(#lowerToothEnamel)"
                              stroke="#475569"
                              strokeWidth="0.2"
                            />
                            {/* Left lower central */}
                            <path
                              d="M 117.44 95.05 Q 118.68 94.72 119.92 95.05 L 119.92 98.6 L 117.44 98.6 Z"
                              fill="url(#lowerToothEnamel)"
                              stroke="#475569"
                              strokeWidth="0.2"
                            />
                            {/* Right lower central */}
                            <path
                              d="M 120.08 95.05 Q 121.32 94.72 122.56 95.05 L 122.56 98.6 L 120.08 98.6 Z"
                              fill="url(#lowerToothEnamel)"
                              stroke="#475569"
                              strokeWidth="0.2"
                            />
                            {/* Right lower lateral */}
                            <path
                              d="M 122.68 95.15 Q 123.75 94.75 124.82 95.15 L 124.85 98.5 L 122.65 98.5 Z"
                              fill="url(#lowerToothEnamel)"
                              stroke="#475569"
                              strokeWidth="0.2"
                            />
                            {/* Right lower canine */}
                            <path
                              d="M 124.95 95.35 Q 125.8 94.75 126.6 95.3 L 126.65 98.4 L 124.9 98.4 Z"
                              fill="url(#lowerToothEnamel)"
                              stroke="#475569"
                              strokeWidth="0.2"
                            />
                          </g>
                        )}

                        {/* Soft upper-lip cast shadow inside top of mouth cavity */}
                        <rect
                          x="110"
                          y="89.5"
                          width="20"
                          height={shadowHeight}
                          fill="url(#upperLipCastShadow)"
                        />
                      </g>

                      {/* Gentle upper lip */}
                      <path
                        d={`M ${leftX} ${cornerY} C ${leftCtrlX} ${upperY}, ${rightCtrlX} ${upperY}, ${rightX} ${cornerY}`}
                        stroke={colors.primary}
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        fill="none"
                      />
                      {/* Gentle moving lower lip */}
                      <path
                        d={`M ${leftX} ${cornerY} C ${leftCtrlX} ${lowerY}, ${rightCtrlX} ${lowerY}, ${rightX} ${cornerY}`}
                        stroke={colors.secondary}
                        strokeWidth="1.85"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </g>
                  );
                })()
              ) : isWaving || isGreeting ? (
                // Cheerful warm smile mouth when waving / greeting
                <path
                  d="M 109 92.5 Q 120 99 131 92.5"
                  stroke={colors.primary}
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  fill="none"
                  filter="url(#neonGlow)"
                />
              ) : (
                // Subtle static smiling digital line when silent, in between sentences or thinking
                <path
                  d="M 110 93 Q 120 96.5 130 93"
                  stroke={colors.primary}
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  opacity="0.85"
                  filter="url(#neonGlow)"
                />
              )}
            </g>

            {/* --- NECK --- */}
            <g id="neck">
              <rect x="110" y="110" width="20" height="12" rx="3" fill="#334155" />
              <line x1="113" y1="114" x2="127" y2="114" stroke={colors.primary} strokeWidth="1.5" opacity="0.7" />
              <line x1="113" y1="118" x2="127" y2="118" stroke={colors.primary} strokeWidth="1.5" opacity="0.7" />
            </g>

            {/* --- TORSO & CHEST --- */}
            <g id="torso">
              {/* Upper Chest Armor */}
              <path
                d="M 78 122 L 162 122 L 152 186 L 88 186 Z"
                fill="url(#bodyArmorLight)"
                stroke="#64748b"
                strokeWidth="2"
              />

              {/* Dark Carbon Center Plate */}
              <path
                d="M 96 122 L 144 122 L 138 182 L 102 182 Z"
                fill="url(#bodyArmorDark)"
              />

              {/* Chest ARC Reactor / Core */}
              <circle cx="120" cy="152" r="16" fill="#090d16" stroke="#475569" strokeWidth="2" />
              <circle
                cx="120"
                cy="152"
                r="11"
                fill={colors.primary}
                opacity="0.3"
                filter="url(#neonGlow)"
              />
              <motion.circle
                cx="120"
                cy="152"
                r="8"
                fill={colors.secondary}
                filter="url(#neonGlow)"
                animate={{
                  r: state === 'thinking' ? [7, 10, 7] : [7, 8.5, 7],
                  opacity: state === 'thinking' ? [0.7, 1, 0.7] : [0.8, 1, 0.8],
                }}
                transition={{ repeat: Infinity, duration: state === 'thinking' ? 0.8 : 2 }}
              />
              <circle cx="120" cy="152" r="3" fill="#ffffff" />

              {/* Energy circuits radiating from core */}
              <line x1="104" y1="152" x2="98" y2="152" stroke={colors.primary} strokeWidth="2" opacity="0.8" />
              <line x1="136" y1="152" x2="142" y2="152" stroke={colors.primary} strokeWidth="2" opacity="0.8" />
              <line x1="120" y1="136" x2="120" y2="130" stroke={colors.primary} strokeWidth="2" opacity="0.8" />

              {/* Abdomen Spine & Segmented Actuators */}
              <g id="abdomen">
                <rect x="94" y="188" width="52" height="10" rx="3" fill="#334155" />
                <rect x="96" y="200" width="48" height="10" rx="3" fill="#1e293b" />
                <rect x="98" y="212" width="44" height="10" rx="3" fill="#334155" />

                {/* Vertical cyber conduit */}
                <line x1="120" y1="188" x2="120" y2="222" stroke={colors.primary} strokeWidth="2" opacity="0.6" />
              </g>

              {/* Pelvis / Hip Armor */}
              <path
                d="M 90 224 L 150 224 L 140 248 L 100 248 Z"
                fill="url(#bodyArmorLight)"
                stroke="#64748b"
                strokeWidth="1.5"
              />
              <rect x="110" y="228" width="20" height="14" rx="3" fill="#1e293b" />
              <circle cx="120" cy="235" r="3" fill={colors.primary} />
            </g>

            {/* --- ARMS (Robust Kinematic Articulation - Zero Disconnect) --- */}
            {/* Left Arm (Observer perspective: left) */}
            <g id="left-arm" transform={`rotate(${leftShoulderAngle.toFixed(2)}, 68, 134)`}>
              {/* Shoulder Pauldron (centered at 68, 134) */}
              <ellipse cx="68" cy="134" rx="14" ry="12" fill="url(#bodyArmorLight)" stroke="#64748b" strokeWidth="1.5" />
              <circle cx="68" cy="134" r="5" fill="#334155" />
              <circle cx="68" cy="134" r="2" fill={colors.primary} />
              
              {/* Bicep (seamlessly links shoulder 134 to elbow 174) */}
              <rect x="62" y="136" width="12" height="38" rx="5" fill="#334155" stroke="#475569" strokeWidth="1" />
              <line x1="68" y1="142" x2="68" y2="168" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3 3" />

              {/* Forearm & Hand pivoting around EXACT elbow center (68, 174) */}
              <g id="left-forearm" transform={`rotate(${leftForearmAngle.toFixed(2)}, 68, 174)`}>
                {/* Forearm Armor with rounded socket seamlessly overlapping the elbow */}
                <rect x="63" y="172" width="10" height="40" rx="4" fill="url(#bodyArmorLight)" stroke="#64748b" strokeWidth="1.5" />
                <line x1="68" y1="178" x2="68" y2="208" stroke={colors.primary} strokeWidth="1.5" opacity="0.8" />
                
                {/* Wrist & Hand / Articulated Fingers */}
                <rect x="62" y="212" width="12" height="4" rx="1.5" fill="#1e293b" />
                <path d="M 63 216 L 73 216 L 75 228 L 61 228 Z" fill="#334155" />
                <circle cx="68" cy="222" r="2" fill={colors.secondary} />

                {/* Elbow Joint Ball Bearing Cap - perfectly covers the joint */}
                <circle cx="68" cy="174" r="7" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
                <circle cx="68" cy="174" r="3" fill={colors.primary} />
              </g>
            </g>

            {/* Right Arm (Observer perspective: right) */}
            <g id="right-arm" transform={`rotate(${rightShoulderAngle.toFixed(2)}, 172, 134)`}>
              {/* Shoulder Pauldron (centered at 172, 134) */}
              <ellipse cx="172" cy="134" rx="14" ry="12" fill="url(#bodyArmorLight)" stroke="#64748b" strokeWidth="1.5" />
              <circle cx="172" cy="134" r="5" fill="#334155" />
              <circle cx="172" cy="134" r="2" fill={colors.primary} />

              {/* Bicep (seamlessly links shoulder 134 to elbow 174) */}
              <rect x="166" y="136" width="12" height="38" rx="5" fill="#334155" stroke="#475569" strokeWidth="1" />
              <line x1="172" y1="142" x2="172" y2="168" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3 3" />

              {/* Forearm & Hand pivoting around EXACT elbow center (172, 174) */}
              <g id="right-forearm" transform={`rotate(${rightForearmAngle.toFixed(2)}, 172, 174)`}>
                {/* Forearm Armor with rounded socket seamlessly overlapping the elbow */}
                <rect x="167" y="172" width="10" height="40" rx="4" fill="url(#bodyArmorLight)" stroke="#64748b" strokeWidth="1.5" />
                <line x1="172" y1="178" x2="172" y2="208" stroke={colors.primary} strokeWidth="1.5" opacity="0.8" />

                {/* Wrist & Hand / Articulated Fingers */}
                <rect x="166" y="212" width="12" height="4" rx="1.5" fill="#1e293b" />
                <path d="M 167 216 L 177 216 L 179 228 L 165 228 Z" fill="#334155" />
                <circle cx="172" cy="222" r="2" fill={colors.secondary} />

                {/* Elbow Joint Ball Bearing Cap - perfectly covers the joint */}
                <circle cx="172" cy="174" r="7" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
                <circle cx="172" cy="174" r="3" fill={colors.primary} />
              </g>
            </g>

            {/* --- LEGS & STABILIZER BOOTS (Standing firmly) --- */}
            {/* Left Leg */}
            <g id="left-leg">
              {/* Hip connector */}
              <circle cx="106" cy="252" r="7" fill="#334155" stroke="#475569" strokeWidth="1" />
              
              {/* Thigh */}
              <rect x="99" y="256" width="15" height="42" rx="5" fill="url(#bodyArmorLight)" stroke="#64748b" />
              <line x1="106.5" y1="262" x2="106.5" y2="292" stroke={colors.primary} strokeWidth="1.5" opacity="0.5" />

              {/* Knee Joint */}
              <circle cx="106.5" cy="302" r="7.5" fill="#1e293b" stroke="#64748b" strokeWidth="1.5" />
              <circle cx="106.5" cy="302" r="3.5" fill={colors.secondary} opacity="0.8" />

              {/* Shin / Calf */}
              <path
                d="M 98 310 L 115 310 L 117 356 L 96 356 Z"
                fill="url(#bodyArmorDark)"
                stroke="#64748b"
                strokeWidth="1.5"
              />
              <path d="M 102 314 L 111 314 L 112 344 L 101 344 Z" fill="url(#bodyArmorLight)" />

              {/* Ankle Joint */}
              <rect x="98" y="356" width="17" height="6" rx="2" fill="#334155" />

              {/* Robotic Foot / Magnetic Boot */}
              <path
                d="M 92 362 L 118 362 L 122 376 L 86 376 Z"
                fill="url(#bodyArmorLight)"
                stroke="#475569"
                strokeWidth="1.5"
              />
              {/* Sole Stabilizer */}
              <rect x="85" y="375" width="38" height="5" rx="1.5" fill="#0f172a" />
              <line x1="88" y1="378" x2="120" y2="378" stroke={colors.primary} strokeWidth="1.5" opacity="0.8" />
            </g>

            {/* Right Leg */}
            <g id="right-leg">
              {/* Hip connector */}
              <circle cx="134" cy="252" r="7" fill="#334155" stroke="#475569" strokeWidth="1" />

              {/* Thigh */}
              <rect x="126" y="256" width="15" height="42" rx="5" fill="url(#bodyArmorLight)" stroke="#64748b" />
              <line x1="133.5" y1="262" x2="133.5" y2="292" stroke={colors.primary} strokeWidth="1.5" opacity="0.5" />

              {/* Knee Joint */}
              <circle cx="133.5" cy="302" r="7.5" fill="#1e293b" stroke="#64748b" strokeWidth="1.5" />
              <circle cx="133.5" cy="302" r="3.5" fill={colors.secondary} opacity="0.8" />

              {/* Shin / Calf */}
              <path
                d="M 125 310 L 142 310 L 144 356 L 123 356 Z"
                fill="url(#bodyArmorDark)"
                stroke="#64748b"
                strokeWidth="1.5"
              />
              <path d="M 129 314 L 138 314 L 139 344 L 128 344 Z" fill="url(#bodyArmorLight)" />

              {/* Ankle Joint */}
              <rect x="125" y="356" width="17" height="6" rx="2" fill="#334155" />

              {/* Robotic Foot / Magnetic Boot */}
              <path
                d="M 122 362 L 148 362 L 154 376 L 118 376 Z"
                fill="url(#bodyArmorLight)"
                stroke="#475569"
                strokeWidth="1.5"
              />
              {/* Sole Stabilizer */}
              <rect x="117" y="375" width="38" height="5" rx="1.5" fill="#0f172a" />
              <line x1="120" y1="378" x2="152" y2="378" stroke={colors.primary} strokeWidth="1.5" opacity="0.8" />
            </g>

            {/* --- STANDING HOLOGRAPHIC PEDESTAL / PLATFORM --- */}
            <g id="holographic-pedestal" opacity="0.85">
              {/* Outer Glowing Ring */}
              <ellipse
                cx="120"
                cy="382"
                rx="90"
                ry="16"
                stroke={colors.primary}
                strokeWidth="1.5"
                strokeDasharray="8 6"
                filter="url(#neonGlow)"
              />
              
              {/* Inner Platform Solid Base */}
              <ellipse cx="120" cy="382" rx="72" ry="12" fill="#0a0f1d" stroke={colors.secondary} strokeWidth="2" />
              
              {/* Inner Concentric Energy Ring */}
              <ellipse cx="120" cy="382" rx="48" ry="7" stroke={colors.primary} strokeWidth="1" strokeDasharray="4 4" />

              {/* Center Beam Glow */}
              <ellipse cx="120" cy="382" rx="28" ry="4" fill={colors.primary} opacity="0.5" filter="url(#neonGlow)" />
            </g>
          </svg>
        </motion.div>
      </div>

      {/* Robot Base Info & Badge */}
      <div className="w-full text-center z-10 pt-1 pb-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-700/60 text-slate-300 text-xs shadow-inner">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold text-slate-100">SADIO</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400">Avatar Robot Intelligent</span>
        </div>
      </div>
    </div>
  );
};
