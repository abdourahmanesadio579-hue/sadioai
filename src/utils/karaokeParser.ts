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

// Extract natural sentences while preserving abbreviations (e.g. 3.14, Dr., M., etc.) and wrapped lines
export function splitTextIntoSentences(text: string): string[] {
  if (!text) return [];

  // Join soft line-wraps within the same paragraph (single \n not followed by bullet/heading/number)
  // so wrapped phrases like "Awa va à\nl'école." are never split mid-sentence.
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n(?!\s*(?:[-*+•]|\d+[.)]|#{1,6}\s))/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (!normalized) return [];

  const abbreviations = new Set([
    'm', 'mme', 'mlle', 'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr',
    'etc', 'cf', 'ex', 'fig', 'vol', 'art', 'ch', 'p', 'pp', 'st', 'ste',
    'av', 'bd', 'env', 'approx', 'vs', 'inc', 'ltd', 'co',
  ]);

  const sentences: string[] = [];
  let start = 0;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    // Paragraph or list line break inside normalized string
    if (ch === '\n') {
      const piece = normalized.slice(start, i).trim();
      if (piece) sentences.push(piece);
      start = i + 1;
      continue;
    }

    if (ch === '.' || ch === '!' || ch === '?' || ch === '…') {
      // Skip consecutive punctuation like ... or ?!
      let endPunct = i;
      while (
        endPunct + 1 < normalized.length &&
        (normalized[endPunct + 1] === '.' ||
          normalized[endPunct + 1] === '!' ||
          normalized[endPunct + 1] === '?' ||
          normalized[endPunct + 1] === '…')
      ) {
        endPunct++;
      }

      // Skip decimals like 3.14 or 10.5
      if (
        ch === '.' &&
        i > 0 &&
        /\d/.test(normalized[i - 1]) &&
        endPunct + 1 < normalized.length &&
        /\d/.test(normalized[endPunct + 1])
      ) {
        i = endPunct;
        continue;
      }

      // Skip list prefixes like "1." or "2." at the start of a sentence
      const beforePunct = normalized.slice(start, i).trim();
      if (ch === '.' && /^\d{1,3}$/.test(beforePunct)) {
        i = endPunct;
        continue;
      }

      // Skip known abbreviations like "M.", "Dr.", "etc."
      if (ch === '.' && endPunct === i) {
        const wordMatch = beforePunct.match(/([A-Za-zÀ-ÿ]+)$/);
        if (wordMatch && abbreviations.has(wordMatch[1].toLowerCase())) {
          continue;
        }
      }

      // Advance past optional closing quote/parenthesis
      let cut = endPunct + 1;
      while (cut < normalized.length && /["'»”’)\]]/.test(normalized[cut])) {
        cut++;
      }

      // Only split if at end of text or followed by whitespace (and NOT a lowercase mid-sentence continuation)
      if (cut >= normalized.length) {
        const piece = normalized.slice(start, cut).trim();
        if (piece) sentences.push(piece);
        start = cut;
        i = cut - 1;
      } else if (/\s/.test(normalized[cut])) {
        let nextNonSpace = cut;
        while (nextNonSpace < normalized.length && /\s/.test(normalized[nextNonSpace])) {
          nextNonSpace++;
        }
        const nextChar = normalized[nextNonSpace] || '';
        const isLowerContinuation = /[a-zà-öø-ÿ]/.test(nextChar);
        if (!isLowerContinuation) {
          const piece = normalized.slice(start, cut).trim();
          if (piece) sentences.push(piece);
          start = cut;
          i = cut - 1;
        } else {
          i = endPunct;
        }
      } else {
        i = endPunct;
      }
    }
  }

  const tail = normalized.slice(start).trim();
  if (tail) sentences.push(tail);

  return sentences;
}

// Universal parser for synchronized Karaoke reading
export function parseDocumentIntoKaraoke(fullText: string, lang: 'fr' | 'en' = 'fr'): ParsedKaraokeDocument {
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
      const spoken = cleanTextForSpeech(cleanRaw, lang);
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
