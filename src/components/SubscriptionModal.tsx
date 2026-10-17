import React, { useState } from 'react';
import { CreditCard, Check, ShieldCheck, X, AlertCircle, Sparkles, RefreshCw, ExternalLink } from 'lucide-react';
import { UserProfile, AccessStatus } from '../types/auth';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  access: AccessStatus | null;
  token: string | null;
  onPaymentSuccess?: () => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  isOpen,
  onClose,
  user,
  access,
  token,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCheckout = async () => {
    if (!token) {
      setError('Veuillez vous connecter avant de procéder au paiement.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/subscription/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Impossible d'initialiser le paiement Bictorys.");
      }

      if (data.checkoutUrl) {
        // Redirect to Bictorys checkout page (or sandbox checkout portal)
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error("Lien de paiement non reçu.");
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors du paiement.');
      setLoading(false);
    }
  };

  const isExpired = access?.status === 'expired';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6">
        {/* Close button (only if not strictly expired block) */}
        {!isExpired && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Title & Badge */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Abonnement SADIO AI • 30 Jours</span>
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            {isExpired ? 'Votre essai gratuit de 3 jours est terminé' : 'Prolongez votre accès à SADIO AI'}
          </h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {isExpired
              ? 'Pour continuer à poser des questions et recevoir des réponses complètes vocalisées, souscrivez pour 30 jours supplémentaires. Vos conversations passées sont toutes préservées.'
              : 'Paiement volontaire et direct, sans aucun prélèvement automatique récurrent.'}
          </p>
        </div>

        {/* Price Card */}
        <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-950 to-slate-900 border border-cyan-500/30 text-center space-y-2 relative overflow-hidden">
          <div className="text-xs uppercase font-bold tracking-wider text-slate-400">Tarif unique et sans engagement</div>
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
              700 FCFA
            </span>
            <span className="text-slate-400 text-sm font-medium">/ 30 jours</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Paiement direct sécurisé via <strong className="text-cyan-300">Bictorys</strong>
          </p>
        </div>

        {/* Features included */}
        <div className="space-y-2 text-xs">
          <div className="font-semibold text-slate-300">Ce qui est inclus dans votre abonnement :</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
            <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Réponses complètes illimitées</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Vocalisation fluide instantanée</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Tous les domaines de savoir</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Historique de vos échanges préservé</span>
            </div>
          </div>
        </div>

        {/* Payment Methods Available on Bictorys */}
        <div className="space-y-2">
          <div className="text-[11px] text-slate-400 font-medium">Moyens de paiement acceptés sur Bictorys :</div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-bold">
              Wave
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-300 font-bold">
              Orange Money
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold">
              Free Money
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 font-bold flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" />
              <span>Visa / Mastercard</span>
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Button */}
        <div className="space-y-2 pt-2">
          <button
            onClick={handleCheckout}
            disabled={loading}
            className="w-full py-3.5 rounded-2xl font-bold text-sm bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 shadow-xl shadow-cyan-500/25 transition active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                <span>Connexion sécurisée à Bictorys...</span>
              </>
            ) : (
              <>
                <span>Payer 700 FCFA pour 30 jours</span>
                <ExternalLink className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Paiement 100% sécurisé • Aucun prélèvement automatique</span>
          </div>
        </div>
      </div>
    </div>
  );
};
