// High-precision zero-latency pub/sub event bus for real-time speech synchronization
// Bypasses React 18 component re-rendering tree to eliminate audio-visual lag

export interface KaraokeSyncData {
  isSpeaking: boolean;
  sentenceIndex: number;
  wordIndex: number;
  spokenWord: string;
  charIndex: number;
  sentenceText: string;
  timestamp: number;
}

type KaraokeSyncListener = (data: KaraokeSyncData) => void;

class KaraokeSyncBus {
  private listeners: Set<KaraokeSyncListener> = new Set();
  public latest: KaraokeSyncData = {
    isSpeaking: false,
    sentenceIndex: 0,
    wordIndex: -1,
    spokenWord: '',
    charIndex: 0,
    sentenceText: '',
    timestamp: 0,
  };

  public subscribe(listener: KaraokeSyncListener): () => void {
    this.listeners.add(listener);
    try {
      listener(this.latest);
    } catch {
      // ignore
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(data: Partial<KaraokeSyncData>): void {
    this.latest = {
      ...this.latest,
      ...data,
      timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    };
    for (const listener of this.listeners) {
      try {
        listener(this.latest);
      } catch {
        // ignore
      }
    }
  }

  public getSnapshot(): KaraokeSyncData {
    return this.latest;
  }
}

export const karaokeSyncBus = new KaraokeSyncBus();
