import { safeStorage } from './storage';

export const MAX_DAILY_CALL_SECONDS = 20 * 60; // 20 minutes = 1200 secondes
const CALL_QUOTA_STORAGE_KEY = 'sadio_daily_call_quota_v1';

export interface DailyCallQuotaData {
  date: string; // 'YYYY-MM-DD'
  usedSeconds: number;
}

export function getDeviceFingerprint(): string {
  let fp = safeStorage.getItem('sadio_ocr_device_fp');
  if (!fp) {
    const entropy = [
      typeof navigator !== 'undefined' ? navigator.userAgent : '',
      typeof navigator !== 'undefined' ? navigator.language : '',
      typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '',
      typeof screen !== 'undefined' ? screen.colorDepth : '',
      new Date().getTimezoneOffset(),
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2,
    ].join('###');
    let hash = 0;
    for (let i = 0; i < entropy.length; i++) {
      hash = (hash << 5) - hash + entropy.charCodeAt(i);
      hash |= 0;
    }
    const rand = Math.random().toString(36).substring(2, 10);
    fp = `fp_${Math.abs(hash).toString(16)}_${rand}`;
    safeStorage.setItem('sadio_ocr_device_fp', fp);
  }
  return fp;
}

export function getLocalTodayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getStoredCallQuota(): DailyCallQuotaData {
  const today = getLocalTodayKey();
  try {
    const raw = safeStorage.getItem(CALL_QUOTA_STORAGE_KEY);
    if (raw) {
      const parsed: DailyCallQuotaData = JSON.parse(raw);
      if (parsed && parsed.date === today && typeof parsed.usedSeconds === 'number') {
        return {
          date: today,
          usedSeconds: Math.min(MAX_DAILY_CALL_SECONDS, Math.max(0, parsed.usedSeconds)),
        };
      }
    }
  } catch (err) {
    console.warn('[callQuota] Failed to read stored quota:', err);
  }

  const initialData: DailyCallQuotaData = {
    date: today,
    usedSeconds: 0,
  };
  return initialData;
}

export function saveStoredCallQuota(usedSeconds: number): void {
  const today = getLocalTodayKey();
  const data: DailyCallQuotaData = {
    date: today,
    usedSeconds: Math.min(MAX_DAILY_CALL_SECONDS, Math.max(0, usedSeconds)),
  };
  try {
    safeStorage.setItem(CALL_QUOTA_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('[callQuota] Failed to save quota:', err);
  }
}

export async function fetchServerCallQuota(): Promise<{
  usedSeconds: number;
  remainingSeconds: number;
  maxSeconds: number;
  isExhausted: boolean;
}> {
  try {
    const token = safeStorage.getItem('sadio_auth_token');
    const fp = getDeviceFingerprint();
    const headers: Record<string, string> = {
      'x-device-fingerprint': fp,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch('/api/call/quota', { headers });
    if (res.ok) {
      const data = await res.json();
      saveStoredCallQuota(data.usedSeconds);
      return data;
    }
  } catch (err) {
    console.warn('[callQuota] Failed to query server call quota:', err);
  }

  const local = getStoredCallQuota();
  return {
    usedSeconds: local.usedSeconds,
    remainingSeconds: Math.max(0, MAX_DAILY_CALL_SECONDS - local.usedSeconds),
    maxSeconds: MAX_DAILY_CALL_SECONDS,
    isExhausted: local.usedSeconds >= MAX_DAILY_CALL_SECONDS,
  };
}

export function formatCallTime(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
