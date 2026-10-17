import React from 'react';
import { DomainCategory } from '../types/chat';
import { ArrowUpRight, Sparkles } from 'lucide-react';

interface SuggestedTopicsProps {
  currentDomain: DomainCategory;
  onSelectPrompt: (prompt: string) => void;
}

export const SuggestedTopics: React.FC<SuggestedTopicsProps> = ({
  currentDomain,
  onSelectPrompt,
}) => {
  return (
    <div className="w-full my-4 px-2">
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2.5 font-mono">
        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
        <span>Suggestions de questions pour tester l’intelligence du robot :</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {currentDomain.sampleQuestions.map((question, idx) => (
          <button
            key={idx}
            onClick={() => onSelectPrompt(question)}
            className="flex items-start justify-between text-left p-3 rounded-xl bg-slate-900/70 hover:bg-slate-800/90 border border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-white transition group shadow-sm"
          >
            <span className="text-xs leading-relaxed line-clamp-3 pr-2">{question}</span>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition shrink-0 mt-0.5" />
          </button>
        ))}
      </div>
    </div>
  );
};
