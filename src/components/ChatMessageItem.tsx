import React, { useState } from 'react';
import { ChatMessage } from '../types/chat';
import { Copy, Check, Volume2, Square, Bot, User, Sparkles, Eye, EyeOff, Radio } from 'lucide-react';

interface ChatMessageItemProps {
  message: ChatMessage;
  onSpeak?: (text: string) => void;
  onStopSpeak?: () => void;
  isSpeakingThis?: boolean;
  isStreaming?: boolean;
  hideResponseText?: boolean;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  onSpeak,
  onStopSpeak,
  isSpeakingThis = false,
  isStreaming = false,
  hideResponseText = true,
}) => {
  const isBot = message.role === 'model';
  const isErrorMessage = message.domain === 'Erreur' || message.id.startsWith('bot-err-');
  const isInitGreeting = message.id === 'init-msg-1';
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [showFullText, setShowFullText] = useState<boolean>(false);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  // Custom lightweight parser for markdown (headings, code blocks, lists, bold)
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeBuffer: string[] = [];
    let codeBlockIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLanguage = line.replace('```', '').trim() || 'code';
          codeBuffer = [];
        } else {
          inCodeBlock = false;
          const codeContent = codeBuffer.join('\n');
          const currentId = `code-${message.id}-${codeBlockIndex++}`;
          elements.push(
            <div key={currentId} className="my-3 rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950 font-mono text-xs">
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-slate-400">
                <span className="font-semibold text-[11px] uppercase tracking-wider text-cyan-400">
                  {codeLanguage}
                </span>
                <button
                  onClick={() => copyToClipboard(codeContent, currentId)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition"
                  title="Copier le code"
                >
                  {copiedCodeId === currentId ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copié</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copier</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3.5 overflow-x-auto text-slate-200 leading-relaxed font-mono">
                <code>{codeContent}</code>
              </pre>
            </div>
          );
        }
        continue;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        continue;
      }

      // Blockquote
      if (line.startsWith('> ')) {
        elements.push(
          <blockquote key={`bq-${i}`} className="border-l-2 border-cyan-500 pl-3 py-1 my-2 italic text-cyan-100 bg-cyan-950/20 rounded-r-lg">
            {formatInline(line.replace('> ', ''))}
          </blockquote>
        );
        continue;
      }

      // Headings
      if (line.startsWith('### ')) {
        elements.push(
          <h4 key={`h3-${i}`} className="text-sm font-bold text-cyan-300 mt-3 mb-1">
            {formatInline(line.replace('### ', ''))}
          </h4>
        );
        continue;
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h3 key={`h2-${i}`} className="text-base font-bold text-white mt-4 mb-1.5 border-b border-slate-800 pb-1">
            {formatInline(line.replace('## ', ''))}
          </h3>
        );
        continue;
      }
      if (line.startsWith('# ')) {
        elements.push(
          <h2 key={`h1-${i}`} className="text-lg font-bold text-white mt-4 mb-2">
            {formatInline(line.replace('# ', ''))}
          </h2>
        );
        continue;
      }

      // Bullet lists
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const bulletContent = line.trim().replace(/^[-*]\s+/, '');
        elements.push(
          <li key={`li-${i}`} className="ml-4 list-disc text-slate-200 my-0.5 leading-relaxed">
            {formatInline(bulletContent)}
          </li>
        );
        continue;
      }

      // Numbered lists
      const numberedMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
      if (numberedMatch) {
        elements.push(
          <div key={`num-${i}`} className="flex items-start gap-2 my-1 text-slate-200">
            <span className="font-semibold text-cyan-400 shrink-0 font-mono text-xs mt-0.5">
              {numberedMatch[1]}.
            </span>
            <div className="leading-relaxed">{formatInline(numberedMatch[2])}</div>
          </div>
        );
        continue;
      }

      // Empty line
      if (line.trim() === '') {
        elements.push(<div key={`sp-${i}`} className="h-2" />);
        continue;
      }

      // Regular paragraph
      elements.push(
        <p key={`p-${i}`} className="leading-relaxed text-slate-200 my-1 break-words overflow-hidden">
          {formatInline(line)}
        </p>
      );
    }

    // Unclosed code block safeguard during streaming
    if (inCodeBlock && codeBuffer.length > 0) {
      elements.push(
        <div key="unclosed-code" className="my-2 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 font-mono text-xs">
          <pre className="p-3 text-slate-200 leading-relaxed font-mono overflow-x-auto">
            <code>{codeBuffer.join('\n')}</code>
          </pre>
        </div>
      );
    }

    return elements;
  };

  // Inline formatting: **bold**, `code`, *italic*
  const formatInline = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*.*?\*\*|`.*?`|\*.*?\*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith('**') && token.endsWith('**')) {
        parts.push(
          <strong key={match.index} className="font-semibold text-white">
            {token.slice(2, -2)}
          </strong>
        );
      } else if (token.startsWith('`') && token.endsWith('`')) {
        parts.push(
          <code
            key={match.index}
            className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/60 font-mono text-[11px] text-cyan-300 break-all"
          >
            {token.slice(1, -1)}
          </code>
        );
      } else if (token.startsWith('*') && token.endsWith('*')) {
        parts.push(
          <em key={match.index} className="italic text-slate-300">
            {token.slice(1, -1)}
          </em>
        );
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <div className={`flex w-full gap-2 sm:gap-3 ${isBot ? 'justify-start' : 'justify-end'} my-2.5 sm:my-3 group`}>
      {/* Bot Icon */}
      {isBot && (
        <div className="shrink-0 w-7 sm:w-8 h-7 sm:h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20 mt-1">
          <Bot className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
        </div>
      )}

      {/* Message Bubble Container */}
      <div
        className={`relative max-w-[95%] sm:max-w-[85%] rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 shadow-lg transition-all ${
          isBot
            ? 'bg-slate-900/90 border border-slate-700/70 text-slate-100 rounded-tl-sm backdrop-blur-sm'
            : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-tr-sm shadow-cyan-600/15'
        }`}
      >
        {/* Header inside bubble for Bot */}
        {isBot && (
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Sadio</span>
              {message.domain && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] border font-mono ${
                    message.domain === 'Erreur'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {message.domain === 'Erreur' ? 'Signal réseau' : message.domain}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {isSpeakingThis ? (
                <button
                  onClick={onStopSpeak}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[11px] font-mono hover:bg-rose-500/30 transition animate-pulse"
                  title="Arrêter la lecture"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Arrêter la voix</span>
                </button>
              ) : (
                onSpeak && (
                  <button
                    onClick={() => onSpeak(message.content)}
                    className="flex items-center gap-1 p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 transition"
                    title="Écouter toute la réponse"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline text-[10px]">Écouter</span>
                  </button>
                )
              )}
              <button
                onClick={() => copyToClipboard(message.content, `msg-${message.id}`)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
                title="Copier le texte"
              >
                {copiedCodeId === `msg-${message.id}` ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {isBot && !isErrorMessage && !isInitGreeting && hideResponseText && !showFullText ? (
          <div className="py-1">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/70 border border-cyan-500/30">
              <div className="relative flex items-center justify-center shrink-0 w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400/40">
                <Radio className={`w-4 h-4 text-cyan-300 ${isSpeakingThis ? 'animate-pulse' : ''}`} />
                {isSpeakingThis && (
                  <span className="absolute -inset-0.5 rounded-lg bg-cyan-400/20 animate-ping pointer-events-none" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-cyan-200">
                    {isSpeakingThis ? 'Sadio vous répond à voix haute...' : 'Réponse vocale de Sadio'}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-semibold">
                    {isSpeakingThis ? 'Lecture en cours' : 'Vocal'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Texte masqué à l’écran. Écoutez le robot Sadio au centre.
                </p>
              </div>
            </div>

            {/* Vocal waves */}
            <div className="flex items-center justify-center gap-1 py-2 px-3 my-2 bg-slate-950/50 rounded-lg border border-slate-800">
              {[...Array(12)].map((_, i) => (
                <span
                  key={i}
                  className={`w-1 rounded-full transition-all ${
                    isSpeakingThis
                      ? 'bg-cyan-400 animate-pulse shadow-[0_0_6px_#22d3ee]'
                      : 'bg-slate-700 h-2'
                  }`}
                  style={{
                    height: isSpeakingThis ? `${6 + ((i * 4) % 18)}px` : '4px',
                    animationDuration: `${0.35 + (i % 5) * 0.12}s`,
                    animationDelay: `${i * 0.06}s`,
                  }}
                />
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              {isSpeakingThis ? (
                <button
                  onClick={onStopSpeak}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-medium hover:bg-rose-500/30 transition"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Arrêter la voix</span>
                </button>
              ) : (
                onSpeak && (
                  <button
                    onClick={() => onSpeak(message.content)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-medium hover:bg-cyan-500/30 transition active:scale-95 shadow-sm"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Réécouter la réponse</span>
                  </button>
                )
              )}

              <button
                onClick={() => setShowFullText(true)}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-300 transition py-1 px-1.5 rounded hover:bg-slate-800/60"
                title="Afficher la transcription écrite"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Afficher le texte</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-100 space-y-1">
            {isBot && !isErrorMessage && !isInitGreeting && hideResponseText && (
              <div className="flex items-center justify-end pb-1 mb-1 border-b border-slate-800">
                <button
                  onClick={() => setShowFullText(false)}
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-cyan-300 transition"
                  title="Masquer le texte de la réponse"
                >
                  <EyeOff className="w-3 h-3" />
                  <span>Masquer le texte</span>
                </button>
              </div>
            )}
            {renderFormattedContent(message.content)}
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-cyan-400 animate-pulse align-middle" />
            )}
          </div>
        )}

        {/* Footer timestamp */}
        <div className={`mt-1.5 text-[10px] text-right font-mono ${isBot ? 'text-slate-500' : 'text-cyan-100/70'}`}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* User Icon */}
      {!isBot && (
        <div className="shrink-0 w-7 sm:w-8 h-7 sm:h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 mt-1">
          <User className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-cyan-400" />
        </div>
      )}
    </div>
  );
};
