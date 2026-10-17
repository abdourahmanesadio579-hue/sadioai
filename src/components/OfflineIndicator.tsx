import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 left-4 sm:left-6 z-50 flex items-center gap-2.5 rounded-xl bg-amber-600/95 border border-amber-400 px-3.5 py-2 text-xs font-medium text-white shadow-2xl backdrop-blur-md animate-bounce">
      <WifiOff className="w-4 h-4 text-white shrink-0" />
      <span>Mode hors-ligne — Consultation des messages sauvegardés.</span>
    </div>
  );
};
