import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Bot, RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React tree:', error, errorInfo);
  }

  private handleReload = () => {
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#070b14] text-slate-100 flex flex-col items-center justify-center p-4 select-none">
          <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl text-center space-y-4 backdrop-blur-xl">
            <div className="inline-flex p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Bot className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white tracking-wide">
                Initialisation de Sadio AI
              </h2>
              <p className="text-xs text-slate-400">
                Une interruption est survenue lors du chargement des composants graphiques ou audio.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-left font-mono text-[11px] text-amber-300/80 break-words max-h-24 overflow-y-auto">
                <div className="flex items-center gap-1.5 text-amber-400 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-semibold">Détail technique :</span>
                </div>
                {this.state.error.message || 'Erreur inattendue'}
              </div>
            )}

            <button
              onClick={this.handleReload}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 transition active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Redémarrer Sadio AI</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
