import { useCallback, useEffect, useRef } from 'react';

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
  removeEventListener?: (type: 'release', listener: () => void) => void;
}

// Valid 16x16 H.264 Baseline 2s silent MP4 loop (prevents mobile OS sleep when native WakeLock is unavailable/blocked)
const SILENT_NOSLEEP_MP4_DATA_URL =
  'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMrbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAlV0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHNbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABeG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAThzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAe/+EAFmdCwB7ZHsBEAAADAAQAAAMACDxYuSABAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAApAAAAKQAAAABhzdHRzAAAAAAAAAAEAAAACAABAAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAACAAAAAQAAABxzdHN6AAAAAAAAAAAAAAACAAAChgAAAAoAAAAUc3RjbwAAAAAAAAABAAADWwAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNTguNzYuMTAwAAAACGZyZWUAAAKYbWRhdAAAAnAGBf//bNxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjMgcjMwNjAgNWRiNmFhNiAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjEgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0wIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDE6MHgxMTEgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTAgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50PTI1MCBrZXlpbnRfbWluPTEgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAOZYiEBb///w9FAAFPf4AAAAAGQZo4CvqA';

/**
 * Dual-layer Screen Wake Lock hook:
 * 1. Primary: W3C Screen Wake Lock API (navigator.wakeLock.request('screen'))
 * 2. Fallback: Muted 1x1 inline looping <video> for mobile browsers / iOS / iframes where WakeLock is denied or unsupported
 * Automatically activates when SADIO is speaking, streaming, thinking, or listening, and releases immediately on idle.
 */
export function useScreenWakeLock(active: boolean) {
  const activeRef = useRef<boolean>(active);
  activeRef.current = active;

  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const acquiringRef = useRef<boolean>(false);
  const lastManualRequestAtRef = useRef<number>(0);
  const fallbackVideoRef = useRef<HTMLVideoElement | null>(null);

  const ensureFallbackVideo = useCallback((): HTMLVideoElement | null => {
    if (typeof document === 'undefined') return null;
    if (fallbackVideoRef.current) return fallbackVideoRef.current;

    try {
      const video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('muted', '');
      video.setAttribute('loop', '');
      video.setAttribute('aria-hidden', 'true');
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.disablePictureInPicture = true;
      video.disableRemotePlayback = true;
      video.preload = 'auto';
      video.src = SILENT_NOSLEEP_MP4_DATA_URL;
      video.style.position = 'fixed';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.bottom = '0';
      video.style.right = '0';
      video.style.opacity = '0.001';
      video.style.pointerEvents = 'none';
      video.style.zIndex = '-1';
      document.body.appendChild(video);
      fallbackVideoRef.current = video;
      return video;
    } catch {
      return null;
    }
  }, []);

  const startFallbackVideo = useCallback(() => {
    const video = ensureFallbackVideo();
    if (!video) return;
    try {
      video.muted = true;
      if (video.paused) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            // Browser rejected non-gesture video play; will retry on next gesture/requestWakeLock
          });
        }
      }
    } catch {
      // Ignore video playback error
    }
  }, [ensureFallbackVideo]);

  const stopFallbackVideo = useCallback(() => {
    const video = fallbackVideoRef.current;
    if (!video) return;
    try {
      if (!video.paused) {
        video.pause();
      }
    } catch {
      // ignore
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    stopFallbackVideo();
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    if (sentinel) {
      try {
        if (!sentinel.released) {
          await sentinel.release();
        }
      } catch {
        // Ignore release errors when browser already reclaimed lock
      }
    }
    try {
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
      }
    } catch {
      // Ignore MediaSession errors
    }
  }, [stopFallbackVideo]);

  const requestWakeLock = useCallback(async () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    lastManualRequestAtRef.current = performance.now();

    try {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    } catch {
      // Ignore MediaSession errors
    }

    const wakeLockApi = (navigator as unknown as {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
    }).wakeLock;

    // On mobile browsers lacking WakeLock API, immediately engage the muted video keep-awake loop
    if (!wakeLockApi || typeof wakeLockApi.request !== 'function') {
      startFallbackVideo();
      return;
    }

    if (sentinelRef.current && !sentinelRef.current.released) {
      return;
    }
    if (acquiringRef.current) return;

    // Prime muted video synchronously inside user gesture in case wakeLock.request rejects asynchronously (e.g. iOS/iframe)
    startFallbackVideo();

    acquiringRef.current = true;
    try {
      const sentinel = await wakeLockApi.request('screen');

      const withinGestureGrace = performance.now() - lastManualRequestAtRef.current < 800;
      if (!activeRef.current && !withinGestureGrace) {
        stopFallbackVideo();
        try {
          await sentinel.release();
        } catch {
          // ignore
        }
        return;
      }

      sentinelRef.current = sentinel;
      // Native wake lock succeeded, pause the fallback video immediately
      stopFallbackVideo();

      const handleRelease = () => {
        if (sentinelRef.current === sentinel) {
          sentinelRef.current = null;
        }
        if (
          activeRef.current &&
          typeof document !== 'undefined' &&
          document.visibilityState === 'visible'
        ) {
          window.setTimeout(() => {
            if (activeRef.current) {
              void requestWakeLock();
            }
          }, 250);
        }
      };

      sentinel.addEventListener?.('release', handleRelease);
    } catch {
      // WakeLock API rejected (e.g. iframe policy, iOS PWA, or battery saver) -> keep silent video active!
      if (!activeRef.current && performance.now() - lastManualRequestAtRef.current >= 800) {
        stopFallbackVideo();
      }
    } finally {
      acquiringRef.current = false;
    }
  }, [startFallbackVideo, stopFallbackVideo]);

  useEffect(() => {
    if (active) {
      void requestWakeLock();
    } else {
      void releaseWakeLock();
    }
  }, [active, requestWakeLock, releaseWakeLock]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (activeRef.current) {
          void requestWakeLock();
        }
      } else if (!activeRef.current) {
        void releaseWakeLock();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      void releaseWakeLock();
      if (fallbackVideoRef.current) {
        try {
          fallbackVideoRef.current.remove();
        } catch {
          // ignore
        }
        fallbackVideoRef.current = null;
      }
    };
  }, [requestWakeLock, releaseWakeLock]);

  return { requestWakeLock, releaseWakeLock };
}
