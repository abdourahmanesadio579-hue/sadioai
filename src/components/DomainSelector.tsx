import React from 'react';
import { DOMAINS } from '../data/domains';
import { DomainCategory } from '../types/chat';
import { Globe, Atom, Code, Landmark, Binary, Compass, Activity, Lightbulb } from 'lucide-react';

interface DomainSelectorProps {
  selectedDomain: DomainCategory;
  onSelectDomain: (domain: DomainCategory) => void;
  variant?: 'scroll' | 'grid';
}

const iconMap: Record<string, React.ReactNode> = {
  Globe: <Globe className="w-3.5 h-3.5" />,
  Atom: <Atom className="w-3.5 h-3.5" />,
  Code: <Code className="w-3.5 h-3.5" />,
  Landmark: <Landmark className="w-3.5 h-3.5" />,
  Binary: <Binary className="w-3.5 h-3.5" />,
  Compass: <Compass className="w-3.5 h-3.5" />,
  Activity: <Activity className="w-3.5 h-3.5" />,
  Lightbulb: <Lightbulb className="w-3.5 h-3.5" />,
};

export const DomainSelector: React.FC<DomainSelectorProps> = ({
  selectedDomain,
  onSelectDomain,
  variant = 'scroll',
}) => {
  if (variant === 'grid') {
    return (
      <div className="grid grid-cols-2 gap-1.5 w-full p-1">
        {DOMAINS.map((domain) => {
          const isSelected = selectedDomain.id === domain.id;
          return (
            <button
              key={domain.id}
              onClick={() => onSelectDomain(domain)}
              className={`flex items-center gap-2 min-h-[38px] px-2.5 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 text-left ${
                isSelected
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/50 shadow-sm shadow-cyan-500/20 font-semibold'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <span className={`shrink-0 ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`}>
                {iconMap[domain.iconName]}
              </span>
              <span className="truncate">{domain.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto no-scrollbar py-1 touch-pan-x overscroll-x-contain">
      <div className="flex items-center gap-1.5 min-w-max px-2">
        {DOMAINS.map((domain) => {
          const isSelected = selectedDomain.id === domain.id;
          return (
            <button
              key={domain.id}
              onClick={() => onSelectDomain(domain)}
              className={`flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95 shrink-0 ${
                isSelected
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/50 shadow-sm shadow-cyan-500/20 font-semibold'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <span className={isSelected ? 'text-cyan-400' : 'text-slate-500'}>
                {iconMap[domain.iconName]}
              </span>
              <span>{domain.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
