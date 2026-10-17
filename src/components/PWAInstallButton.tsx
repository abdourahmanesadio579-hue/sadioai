import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share2, PlusSquare, X, CheckCircle2 } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return (
      <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Application installée</span>
      </div>
    );
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium text-xs shadow-md shadow-cyan-500/20 transition-all active:scale-95"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Installer l’App</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-medium text-xs transition-all active:scale-95"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Installer sur iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100 relative">
              <button
                onClick={() => setShowIOSGuide(false)}
                className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Installer RoboOmni</h3>
                  <p className="text-xs text-slate-400">Accès hors-ligne & plein écran sur iOS</p>
                </div>
              </div>

              <div className="space-y-3 text-sm text-slate-300">
                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <Share2 className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    1. Appuyez sur l’icône <strong>Partager</strong> en bas de Safari.
                  </span>
                </div>
                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <PlusSquare className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    2. Faites défiler et touchez <strong>Sur l’écran d’accueil</strong>.
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-cyan-600 hover:bg-cyan-500 py-2.5 text-xs font-semibold text-white transition shadow-md shadow-cyan-600/20"
              >
                Compris
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback generic install button if neither fired yet
  const [showGenericGuide, setShowGenericGuide] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowGenericGuide(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-700/80 bg-slate-850 hover:bg-slate-800 text-slate-300 font-mono text-xs transition active:scale-95"
        title="Installer l'application sur votre appareil"
      >
        <Download className="w-3.5 h-3.5 text-cyan-400" />
        <span className="hidden sm:inline">Installer l'App</span>
        <span className="sm:hidden">App</span>
      </button>

      {showGenericGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 sm:p-6 shadow-2xl text-slate-100 relative">
            <button
              onClick={() => setShowGenericGuide(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Installation PWA</h3>
                <p className="text-xs text-slate-400">Compatible tous appareils (Mobile & PC)</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300">
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                <strong className="text-cyan-300 block mb-1">Sur Ordinateur (Chrome / Edge) :</strong>
                Cliquez sur l'icône d'installation dans la barre d'adresse ou ouvrez le menu (⋮) puis <em>"Installer RoboOmni"</em>.
              </div>
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                <strong className="text-cyan-300 block mb-1">Sur Mobile (Android / iOS) :</strong>
                Ouvrez le menu de votre navigateur puis sélectionnez <em>"Ajouter à l'écran d'accueil"</em> ou <em>"Installer l'application"</em>.
              </div>
            </div>

            <button
              onClick={() => setShowGenericGuide(false)}
              className="mt-5 w-full rounded-xl bg-cyan-600 hover:bg-cyan-500 py-2.5 text-xs font-semibold text-white transition shadow-md shadow-cyan-600/20"
            >
              Compris
            </button>
          </div>
        </div>
      )}
    </>
  );
};
