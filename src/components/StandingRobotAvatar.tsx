import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RobotState, RobotTheme } from '../types/chat';
import { Sparkles, Cpu, Volume2, VolumeX, Eye, Zap, ShieldCheck } from 'lucide-react';

interface StandingRobotAvatarProps {
  state: RobotState;
  theme?: RobotTheme;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  onAvatarClick?: () => void;
  onTestVoice?: () => void;
  currentSpeechSnippet?: string;
  thinkingCountdown?: number | null;
  isThinking?: boolean;
  isGreeting?: boolean;
  greetingText?: string;
  onReplayGreeting?: () => void;
  isVoicing?: boolean;
  mouthOpenLevel?: number;
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
  voiceEnabled,
  onToggleVoice,
  onAvatarClick,
  onTestVoice,
  currentSpeechSnippet,
  thinkingCountdown,
  isThinking,
  isGreeting = false,
  greetingText,
  onReplayGreeting,
  isVoicing = false,
  mouthOpenLevel = 0,
}) => {
  const [blink, setBlink] = useState(false);
  const [isWaving, setIsWaving] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  const colors = themeColorMap[theme] || themeColorMap.cyan;
  const isCurrentlyThinking = Boolean(isThinking) || state === 'thinking';

  // Natural blinking effect
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 160);
    }, 3800);
    return () => clearInterval(blinkInterval);
  }, []);

  const handleRobotClick = () => {
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
    idle: isGreeting ? '👋 Sadio vous salue chaleureusement !' : 'Sadio en veille active',
    listening: 'Sadio écoute vos capteurs audio...',
    thinking:
      thinkingCountdown && thinkingCountdown > 0
        ? `Sadio est en train de réfléchir (${thinkingCountdown}s)...`
        : 'Sadio est en train de réfléchir...',
    speaking: isGreeting ? '👋 Sadio vous souhaite la bienvenue !' : 'Sadio lit la réponse...',
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
          <span className="truncate">{isCurrentlyThinking ? (thinkingCountdown && thinkingCountdown > 0 ? `Sadio réfléchit (${thinkingCountdown}s)...` : 'Sadio est en train de réfléchir...') : statusTextMap[state]}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onTestVoice && (
            <button
              onClick={onTestVoice}
              title="Tester le son du robot"
              className="min-h-[36px] px-2.5 py-1 rounded-xl border border-cyan-500/40 bg-slate-900/90 hover:bg-slate-800 text-cyan-300 hover:text-white transition-all text-xs font-mono flex items-center gap-1.5 active:scale-95 shadow-sm shadow-cyan-500/10"
            >
              <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-[11px] font-medium">Tester voix</span>
            </button>
          )}

          <button
            onClick={onToggleVoice}
            title={voiceEnabled ? 'Désactiver la voix du robot' : 'Activer la voix parlée du robot'}
            className={`min-h-[36px] px-2.5 py-1 rounded-xl border transition-all text-xs flex items-center gap-1.5 font-mono active:scale-95 ${
              voiceEnabled
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {voiceEnabled ? <Volume2 className="w-3.5 h-3.5 shrink-0" /> : <VolumeX className="w-3.5 h-3.5 shrink-0" />}
            <span className="text-[11px] font-medium">{voiceEnabled ? 'Voix ON' : 'Voix OFF'}</span>
          </button>
        </div>
      </div>

      {/* HOLOGRAPHIC THOUGHT, SPEECH & WARM WELCOME BALLOON DIRECTLY BESIDE THE ROBOT */}
      <AnimatePresence>
        {(isCurrentlyThinking || state === 'speaking' || (isGreeting && !isCurrentlyThinking)) && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            className="absolute z-40 left-2 right-2 sm:left-[55%] sm:right-auto top-10 sm:top-11 max-w-[calc(100%-16px)] sm:max-w-[280px] md:max-w-[320px] p-2.5 sm:p-3.5 rounded-2xl bg-slate-900/95 border-2 border-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.55)] backdrop-blur-xl pointer-events-auto"
          >
            {/* Thought pointer towards Sadio on desktop/tablets */}
            <div className="hidden sm:block absolute -left-2 top-5 w-3.5 h-3.5 bg-slate-900 border-l-2 border-b-2 border-cyan-400 rotate-45" />

            {/* Cyber thought connector dots from robot on desktop */}
            <div className="hidden sm:flex absolute -left-6 top-5 items-center gap-1 pointer-events-none">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping opacity-80" />
              <span className="w-2 h-2 rounded-full bg-cyan-400/90 shadow-[0_0_6px_#22d3ee]" />
            </div>

            {isCurrentlyThinking ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="relative flex items-center justify-center shrink-0 w-7 h-7 rounded-xl bg-cyan-500/20 border border-cyan-400/60 shadow-[0_0_10px_rgba(6,182,212,0.4)]">
                    <Cpu className="w-4 h-4 text-cyan-300 animate-spin" />
                    <span className="absolute -inset-0.5 rounded-xl bg-cyan-400/25 animate-ping pointer-events-none" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-xs sm:text-sm text-cyan-100 tracking-wide font-sans leading-tight">
                      Sadio est en train de réfléchir...
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono mt-1 pt-1.5 border-t border-cyan-500/30">
                  <span className="text-cyan-400/90 flex items-center gap-1 text-[10px]">
                    <Sparkles className="w-3 h-3 text-cyan-400 animate-pulse" />
                    Calcul neuronal
                  </span>
                  <span className="font-bold text-cyan-300 bg-cyan-500/25 px-2 py-0.5 rounded-full border border-cyan-400/40 text-[10px]">
                    {thinkingCountdown && thinkingCountdown > 0 ? `${thinkingCountdown}s` : 'Instantané'}
                  </span>
                </div>

                {/* Instant responsive real-time neural activity bar */}
                <div className="w-full bg-slate-800/90 rounded-full h-1.5 mt-1 overflow-hidden border border-slate-700/60 relative">
                  <div className="bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 h-full w-full rounded-full shadow-[0_0_10px_rgba(6,182,212,0.9)] animate-pulse" />
                </div>
              </div>
            ) : isGreeting && state !== 'speaking' ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex items-center justify-center shrink-0 w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/60 shadow-[0_0_12px_rgba(6,182,212,0.4)]">
                    <span className="text-base select-none">👋</span>
                    <span className="absolute -inset-0.5 rounded-xl bg-cyan-400/25 animate-ping pointer-events-none" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-xs sm:text-sm text-cyan-100 font-sans leading-tight">
                      Bonjour et bienvenue !
                    </span>
                    <span className="text-[10px] text-cyan-300 font-mono">
                      Sadio vous salue chaleureusement
                    </span>
                  </div>
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
                    <span>🔊 Activer la voix de Sadio</span>
                  </button>
                )}
                <p className="text-[10px] text-slate-400 text-center font-mono leading-tight">
                  Conseil mobile : montez le volume média & désactivez le mode silencieux
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex items-center justify-center shrink-0 w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/50 shadow-[0_0_10px_rgba(6,182,212,0.4)]">
                    <Volume2 className="w-4 h-4 text-cyan-300 animate-pulse" />
                    <span className="absolute -inset-0.5 rounded-xl bg-cyan-400/25 animate-ping pointer-events-none" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-xs sm:text-sm text-cyan-100 font-sans leading-tight">
                      Sadio s’exprime à voix haute
                    </span>
                    <span className="text-[10px] text-cyan-300 font-mono">
                      Réponse vocale en cours...
                    </span>
                  </div>
                </div>

                {/* Vocal frequency equalizer synchronized to speech voicing */}
                <div className="flex items-center justify-center gap-1 py-1.5 px-3 bg-slate-950/80 rounded-xl border border-cyan-500/30">
                  {[...Array(11)].map((_, i) => {
                    const normMouth = mouthOpenLevel || 0;
                    const barHeight = isVoicing
                      ? Math.round(4 + normMouth * 16 * (0.65 + ((i * 3) % 4) * 0.12))
                      : 3;
                    return (
                      <span
                        key={i}
                        className="w-1 bg-cyan-400 rounded-full transition-all duration-75 shadow-[0_0_6px_#22d3ee]"
                        style={{
                          height: `${barHeight}px`,
                          opacity: isVoicing ? 1 : 0.35,
                        }}
                      />
                    );
                  })}
                </div>

                <div className="text-[10px] text-slate-300 text-center font-mono">
                  Écoutez la réponse vocale du robot
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Center Standing Robot Canvas & SVG */}
      <div
        onClick={handleRobotClick}
        className="relative flex-1 w-full max-w-[300px] xs:max-w-[340px] sm:max-w-[380px] md:max-w-[440px] lg:max-w-[480px] flex items-center justify-center cursor-pointer group mt-0.5"
        title="Cliquez pour interagir avec le robot Sadio"
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

              {/* Digital Voice Wave / Articulating Mouth Display Synchronized to Voice */}
              {isVoicing && mouthOpenLevel > 0.02 ? (
                <g filter="url(#neonGlow)">
                  {/* Glowing Dark Oral Acoustic Chamber */}
                  <path
                    d={`M 110 94 Q 120 ${93 - mouthOpenLevel * 2.8} 130 94 Q 120 ${95 + mouthOpenLevel * 5.2} 110 94 Z`}
                    fill="#040714"
                    stroke={colors.primary}
                    strokeWidth="1.2"
                  />
                  {/* Dynamic Equalizer Matrix inside mouth aperture */}
                  <line
                    x1="114"
                    y1={94 - mouthOpenLevel * 1.5}
                    x2="114"
                    y2={94 + mouthOpenLevel * 2.8}
                    stroke={colors.secondary}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <line
                    x1="117"
                    y1={94 - mouthOpenLevel * 2.2}
                    x2="117"
                    y2={94 + mouthOpenLevel * 3.8}
                    stroke={colors.accent}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <line
                    x1="120"
                    y1={94 - mouthOpenLevel * 2.6}
                    x2="120"
                    y2={94 + mouthOpenLevel * 4.6}
                    stroke="#ffffff"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <line
                    x1="123"
                    y1={94 - mouthOpenLevel * 2.2}
                    x2="123"
                    y2={94 + mouthOpenLevel * 3.8}
                    stroke={colors.accent}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <line
                    x1="126"
                    y1={94 - mouthOpenLevel * 1.5}
                    x2="126"
                    y2={94 + mouthOpenLevel * 2.8}
                    stroke={colors.secondary}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  {/* Upper articulating cyber lip */}
                  <path
                    d={`M 109 94 Q 120 ${93 - mouthOpenLevel * 3.0} 131 94`}
                    stroke={colors.primary}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    fill="none"
                  />
                  {/* Lower articulating cyber lip */}
                  <path
                    d={`M 109 94 Q 120 ${95 + mouthOpenLevel * 5.4} 131 94`}
                    stroke={colors.secondary}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    fill="none"
                  />
                </g>
              ) : isWaving || isGreeting ? (
                // Cheerful warm smile mouth when waving / greeting
                <path
                  d="M 110 93 Q 120 100 130 93"
                  stroke={colors.primary}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  fill="none"
                  filter="url(#neonGlow)"
                />
              ) : (
                // Subtle static smiling digital line when silent, in between sentences or thinking
                <path
                  d="M 112 94 Q 120 97 128 94"
                  stroke={colors.primary}
                  strokeWidth="1.8"
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
          <span className="font-semibold text-slate-100">Sadio</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400">Avatar Robot Intelligent</span>
        </div>
      </div>
    </div>
  );
};
