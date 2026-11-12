import { cleanTextForSpeech } from '../hooks/useSpeechSynthesis';

export interface KaraokeWord {
  wordIndex: number;
  text: string;
  clean: string;
  charStart: number;
  charEnd: number;
  globalIndex: number;
}

export interface KaraokeSentence {
  sentenceIndex: number;
  paragraphIndex: number;
  rawText: string;
  spokenText: string;
  words: KaraokeWord[];
}

export interface ParsedKaraokeDocument {
  sentences: KaraokeSentence[];
  totalWords: number;
}

// Extract natural sentences while preserving abbreviations (e.g. 3.14, Dr., etc.)
export function splitTextIntoSentences(text: string): string[] {
  if (!text) return [];

  // Match sentence ending punctuation followed by whitespace or end of string,
  // without breaking inside numbers like 3.14 or common abbreviations
  const rawSentences = text.match(/[^.!?…\n]+(?:(?<!\d)[.!?…]+(?!\d)|$)/g);
  if (!rawSentences) return [text.trim()].filter(Boolean);

  return rawSentences
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Universal parser for synchronized Karaoke reading
export function parseDocumentIntoKaraoke(fullText: string): ParsedKaraokeDocument {
  if (!fullText || !fullText.trim()) {
    return { sentences: [], totalWords: 0 };
  }

  // Normalize line endings and break into paragraphs
  const rawParagraphs = fullText.split(/\n\s*\n+/);
  const parsedSentences: KaraokeSentence[] = [];
  let globalWordCounter = 0;

  rawParagraphs.forEach((para, paraIdx) => {
    const trimmedPara = para.trim();
    if (!trimmedPara) return;

    // Split paragraph into natural sentences
    const sentenceStrings = splitTextIntoSentences(trimmedPara);

    sentenceStrings.forEach((sRaw) => {
      const cleanRaw = sRaw.trim();
      if (!cleanRaw) return;

      // Spoken text is cleaned of symbols, markdown, and emojis
      const spoken = cleanTextForSpeech(cleanRaw);
      if (!spoken || spoken.length === 0) return;

      // Extract actual words and their exact character start & end offsets in spokenText
      const wordRegex = /[\wÀ-ÿ'-]+/gi;
      const words: KaraokeWord[] = [];
      let match: RegExpExecArray | null;

      while ((match = wordRegex.exec(spoken)) !== null) {
        const wordText = match[0];
        // Skip isolated single apostrophes or hyphens
        if (wordText === "'" || wordText === '-') continue;

        words.push({
          wordIndex: words.length,
          text: wordText,
          clean: wordText.toLowerCase().replace(/^[^\wÀ-ÿ]+|[^\wÀ-ÿ]+$/gi, ''),
          charStart: match.index,
          charEnd: match.index + wordText.length,
          globalIndex: globalWordCounter++,
        });
      }

      parsedSentences.push({
        sentenceIndex: parsedSentences.length,
        paragraphIndex: paraIdx,
        rawText: cleanRaw,
        spokenText: spoken,
        words,
      });
    });
  });

  return {
    sentences: parsedSentences,
    totalWords: globalWordCounter,
  };
}
