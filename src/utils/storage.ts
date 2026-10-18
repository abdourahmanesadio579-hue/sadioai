/**
 * Safe LocalStorage wrapper to prevent crashes in private browsing,
 * restricted mobile WebViews (WhatsApp, Instagram, etc.), or when storage is disabled.
 */

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      return window.localStorage.getItem(key);
    } catch (e) {
      console.warn(`[safeStorage] Failed to read key "${key}":`, e);
      return null;
    }
  },

  setItem(key: string, value: string): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn(`[safeStorage] Failed to set key "${key}":`, e);
      return false;
    }
  },

  removeItem(key: string): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      window.localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn(`[safeStorage] Failed to remove key "${key}":`, e);
      return false;
    }
  },
};
