import React, { useState } from 'react';
import { PWAInstallButton } from './PWAInstallButton';
import { Bot, Settings, RotateCcw, EyeOff, Eye, Sparkles, User, LogOut, Clock } from 'lucide-react';
import { RobotTheme } from '../types/chat';
import { UserProfile, AccessStatus } from '../types/auth';

interface HeaderProps {
  onOpenSettings: () => void;
  onResetChat: () => void;
  theme: RobotTheme;
  hideResponseText: boolean;
  onToggleHideResponseText: () => void;
  user: UserProfile | null;
  access: AccessStatus | null;
  onOpenAuth: () => void;
  onOpenSubscription: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onResetChat,
  hideResponseText,
  onToggleHideResponseText,
  user,
  access,
  onOpenAuth,
  onOpenSubscription,
  onLogout,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Format trial time remaining
  const formatRemainingTime = (seconds: number) => {
    if (seconds <= 0) return 'Expiré';
    const hours = Math.floor(seconds / 3600);
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      return `${days}j ${remHours}h`;
    }
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <header className="w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between shrink-0 z-30 pt-safe relative">
      {/* Brand logo & title */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="relative">
          <div className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-[1.5px] shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Bot className="w-4.5 sm:w-5 h-4.5 sm:h-5 text-cyan-400" />
            </div>
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-slate-950 rounded-full" />
        </div>

        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="font-bold text-sm sm:text-base text-white tracking-wide font-sans leading-none">
              Sadio
            </h1>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-semibold leading-none">
              PWA
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-400 hidden xs:block mt-0.5">
            Avatar Robot Cognitif • Réponses Universelles & Détaillées
          </p>
        </div>
      </div>

      {/* Action buttons, Subscription & Trial status */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Trial / Subscription Status Badge */}
        {!user ? (
          <button
            onClick={onOpenAuth}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl font-bold text-[11px] sm:text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-md shadow-cyan-500/20 transition active:scale-95 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-slate-950" />
            <span>Essai gratuit 3j</span>
          </button>
        ) : access?.status === 'trial' ? (
          <button
            onClick={onOpenSubscription}
            title="Essai gratuit de 3 jours actif. Cliquez pour voir l'offre d'abonnement 700 FCFA."
            className="px-2 sm:px-2.5 py-1 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[11px] font-semibold flex items-center gap-1.5 hover:bg-cyan-500/25 transition"
          >
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Essai :</span>
            <span>{formatRemainingTime(access.remainingSeconds || 0)}</span>
          </button>
        ) : access?.status === 'active' ? (
          <button
            onClick={onOpenSubscription}
            title="Abonnement actif 30 jours"
            className="px-2 sm:px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>30 jours actif</span>
          </button>
        ) : (
          <button
            onClick={onOpenSubscription}
            className="px-2.5 py-1.5 rounded-xl font-bold text-[11px] bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 shadow-md shadow-amber-500/20 transition active:scale-95 flex items-center gap-1.5 animate-pulse"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Payer 700 FCFA</span>
          </button>
        )}

        <PWAInstallButton />

        <button
          onClick={onToggleHideResponseText}
          title={
            hideResponseText
              ? 'Mode Vocal Pur actif : Le texte des réponses est masqué à l’écran. Cliquer pour afficher le texte.'
              : 'Texte des réponses affiché. Cliquer pour masquer le texte.'
          }
          className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 transition active:scale-95 ${
            hideResponseText
              ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
              : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          {hideResponseText ? <EyeOff className="w-4 h-4 text-cyan-400" /> : <Eye className="w-4 h-4" />}
          <span className="hidden sm:inline font-medium">
            {hideResponseText ? 'Texte masqué' : 'Texte visible'}
          </span>
        </button>

        <button
          onClick={onResetChat}
          title="Nouvelle conversation"
          className="min-h-[38px] min-w-[38px] flex items-center justify-center p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition active:scale-95"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* User profile dropdown button */}
        {user ? (
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              title={user.email}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 text-cyan-300 transition active:scale-95"
            >
              <User className="w-4 h-4" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-12 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 space-y-2.5 z-50 text-xs animate-fade-in">
                <div className="border-b border-slate-800/80 pb-2">
                  <div className="font-bold text-white truncate">{user.name || 'Utilisateur SADIO AI'}</div>
                  <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
                </div>

                <div className="space-y-1 text-[11px] text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Statut :</span>
                    <span className="font-semibold text-cyan-300">
                      {access?.status === 'trial' ? 'Essai gratuit 3 jours' : access?.status === 'active' ? 'Abonnement actif' : 'Expiré'}
                    </span>
                  </div>
                  {access?.trialExpiresAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Fin essai :</span>
                      <span>{new Date(access.trialExpiresAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                <div className="pt-1 border-t border-slate-800/80 flex flex-col gap-1">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onOpenSubscription();
                    }}
                    className="w-full py-1.5 px-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-left font-semibold flex items-center gap-2 transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Abonnement 700 FCFA</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="w-full py-1.5 px-2 rounded-lg hover:bg-rose-500/10 text-rose-400 text-left font-semibold flex items-center gap-2 transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Se déconnecter</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <button
          onClick={onOpenSettings}
          title="Paramètres"
          className="min-h-[38px] min-w-[38px] flex items-center justify-center p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 text-slate-400 hover:text-cyan-300 transition active:scale-95"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
