import React from 'react';
import { Language } from '../utils/i18n';

interface LanguageSwitcherProps {
  language: Language;
  onChangeLanguage: (lang: Language) => void;
  compact?: boolean;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  language,
  onChangeLanguage,
}) => {
  return (
    <div
      role="group"
      aria-label="Sélection de langue / Language selector"
      data-no-auto-greet="true"
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center p-0.5 rounded-lg bg-slate-900/90 border border-slate-800 shadow-inner shrink-0"
    >
      {/* French Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onChangeLanguage('fr');
        }}
        title="Passer en Français (FR)"
        aria-pressed={language === 'fr'}
        className={`flex items-center gap-0.5 sm:gap-1 px-1 sm:px-2 py-0.5 sm:py-1 rounded font-semibold transition-all active:scale-95 text-[10px] sm:text-xs ${
          language === 'fr'
            ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/30 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
        }`}
      >
        <span className="text-[11px] sm:text-xs leading-none" role="img" aria-label="Drapeau Français">
          🇫🇷
        </span>
        <span className="font-mono uppercase">
          FR
        </span>
      </button>

      {/* Divider */}
      <div className="w-[1px] h-2.5 sm:h-3.5 bg-slate-800/80 mx-0.5 shrink-0" />

      {/* English Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onChangeLanguage('en');
        }}
        title="Switch to English (EN)"
        aria-pressed={language === 'en'}
        className={`flex items-center gap-0.5 sm:gap-1 px-1 sm:px-2 py-0.5 sm:py-1 rounded font-semibold transition-all active:scale-95 text-[10px] sm:text-xs ${
          language === 'en'
            ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/30 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
        }`}
      >
        <span className="text-[11px] sm:text-xs leading-none" role="img" aria-label="UK Flag">
          🇬🇧
        </span>
        <span className="font-mono uppercase">
          EN
        </span>
      </button>
    </div>
  );
};
