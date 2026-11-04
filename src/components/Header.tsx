import React, { useState } from 'react';
import { PWAInstallButton } from './PWAInstallButton';
import { Bot, Settings, RotateCcw, Sparkles, User, LogOut, Clock } from 'lucide-react';
import { RobotTheme } from '../types/chat';
import { UserProfile, AccessStatus } from '../types/auth';

interface HeaderProps {
  onOpenSettings: () => void;
  onResetChat: () => void;
  theme: RobotTheme;
  user: UserProfile | null;
  access: AccessStatus | null;
  onOpenAuth: () => void;
  onOpenSubscription: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onResetChat,
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
    <header className="w-full max-w-full overflow-hidden border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-2 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between shrink-0 z-30 pt-safe relative gap-1">
      {/* Brand logo & title */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink min-w-0">
        <div className="relative shrink-0">
          <div className="w-6 sm:w-8 h-6 sm:h-8 rounded-lg sm:rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-[1.5px] shadow-sm sm:shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[6px] sm:rounded-[10px] flex items-center justify-center">
              <Bot className="w-3.5 sm:w-4.5 h-3.5 sm:h-4.5 text-cyan-400" />
            </div>
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-1.5 sm:w-2 h-1.5 sm:h-2 bg-emerald-400 border border-slate-950 rounded-full" />
        </div>

        <div className="min-w-0">
          <h1 className="font-bold text-xs sm:text-base text-white tracking-wide font-sans leading-none truncate">
            SADIO
          </h1>
          <p className="text-[10px] sm:text-[11px] text-slate-400 hidden md:block mt-0.5 truncate">
            Avatar Robot Cognitif • Réponses Universelles & Détaillées
          </p>
        </div>
      </div>

      {/* Action buttons, Subscription & Trial status */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Trial / Subscription Status Badge */}
        {!user ? (
          <button
            onClick={onOpenAuth}
            title="Essai gratuit de 3 jours disponible"
            className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl font-bold text-[10px] sm:text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-sm sm:shadow-md shadow-cyan-500/20 transition active:scale-95 flex items-center gap-1 shrink-0"
          >
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-950 shrink-0" />
            <span className="hidden sm:inline">Essai gratuit 3j</span>
            <span className="sm:hidden">Essai 3j</span>
          </button>
        ) : access?.status === 'trial' ? (
          <button
            onClick={onOpenSubscription}
            title="Essai gratuit de 3 jours actif. Cliquez pour voir l'offre d'abonnement 700 FCFA."
            className="px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] sm:text-[11px] font-semibold flex items-center gap-1 hover:bg-cyan-500/25 transition shrink-0"
          >
            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-400 shrink-0" />
            <span className="hidden md:inline">Essai :</span>
            <span>{formatRemainingTime(access.remainingSeconds || 0)}</span>
          </button>
        ) : access?.status === 'active' ? (
          <button
            onClick={onOpenSubscription}
            title="Abonnement actif 30 jours"
            className="px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] sm:text-[11px] font-semibold flex items-center gap-1 shrink-0"
          >
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">30j actif</span>
            <span className="sm:hidden">Actif</span>
          </button>
        ) : (
          <button
            onClick={onOpenSubscription}
            className="px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl font-bold text-[10px] sm:text-[11px] bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 shadow-md shadow-amber-500/20 transition active:scale-95 flex items-center gap-1 shrink-0 animate-pulse"
          >
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="hidden sm:inline">Payer 700 FCFA</span>
            <span className="sm:hidden">700 F</span>
          </button>
        )}

        {/* PWA Install Button shown on screens >= 640px (on mobile, accessible via Settings) */}
        <div className="hidden sm:flex shrink-0">
          <PWAInstallButton />
        </div>

        <button
          onClick={onResetChat}
          title="Nouvelle conversation"
          className="min-h-[30px] min-w-[30px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center p-1 sm:p-2 rounded-lg sm:rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition active:scale-95 shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        {/* User profile dropdown button */}
        {user ? (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              title={user.email}
              className="min-h-[30px] min-w-[30px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center p-1 sm:p-2 rounded-lg sm:rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 text-cyan-300 transition active:scale-95"
            >
              <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-10 sm:top-12 w-56 sm:w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 space-y-2.5 z-50 text-xs animate-fade-in">
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
          className="min-h-[30px] min-w-[30px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center p-1 sm:p-2 rounded-lg sm:rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 text-slate-400 hover:text-cyan-300 transition active:scale-95 shrink-0"
        >
          <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>
    </header>
  );
};
