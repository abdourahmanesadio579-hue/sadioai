export interface UserProfile {
  id: string;
  email: string;
  name: string;
  trialStartedAt: string;
  trialExpiresAt: string;
  subscriptionStatus: 'trial' | 'active' | 'expired';
  subscriptionExpiresAt: string | null;
}

export interface AccessStatus {
  hasAccess: boolean;
  status: 'trial' | 'active' | 'expired' | 'unauthenticated';
  trialStartedAt?: string;
  trialExpiresAt?: string;
  subscriptionExpiresAt?: string | null;
  remainingSeconds?: number;
  message: string;
}
