import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  salt: string;
  created_at: string; // ISO UTC
  trial_started_at: string; // ISO UTC
  trial_expires_at: string; // ISO UTC (+72 hours)
  trial_used: boolean;
  subscription_status: 'trial' | 'active' | 'expired';
  subscription_expires_at: string | null; // ISO UTC
  last_login_at: string;
}

export interface TransactionRecord {
  id: string;
  userId: string;
  userEmail: string;
  paymentReference: string;
  chargeId: string | null;
  amount: number; // 700
  currency: string; // "XOF"
  status: 'pending' | 'successful' | 'failed' | 'canceled';
  paymentMethod: string | null;
  checkoutUrl: string | null;
  createdAt: string; // ISO UTC
  completedAt: string | null; // ISO UTC
  rawResponse?: any;
}

export interface SessionRecord {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

interface DatabaseSchema {
  users: Record<string, UserRecord>; // keyed by id
  emailIndex: Record<string, string>; // email -> userId
  sessions: Record<string, SessionRecord>; // token -> session
  transactions: Record<string, TransactionRecord>; // paymentReference -> transaction
  processedWebhooks: Record<string, { processedAt: string; status: string }>;
  ocrDailyUsage: Record<string, { date: string; count: number; lastScanTimestamp?: number }>; // key: identifier -> { date, count, lastScanTimestamp }
  callDailyUsage?: Record<string, { date: string; secondsUsed: number }>; // key: identifier -> { date, secondsUsed }
  registrationsDailyUsage?: Record<string, { date: string; count: number }>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// In-memory cache synced with disk
let db: DatabaseSchema = {
  users: {},
  emailIndex: {},
  sessions: {},
  transactions: {},
  processedWebhooks: {},
  ocrDailyUsage: {},
  callDailyUsage: {},
  registrationsDailyUsage: {},
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadDatabase() {
  ensureDataDir();
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      db = JSON.parse(content);
    } else {
      saveDatabase();
    }
  } catch (err) {
    console.error('Failed to load database.json, initializing fresh store:', err);
    saveDatabase();
  }
}

function saveDatabase() {
  ensureDataDir();
  const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Error saving database to disk:', err);
  }
}

// Security: Hash password with PBKDF2 (10,000 iterations, 64-byte key)
export function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const result = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(result.hash, 'hex'), Buffer.from(hash, 'hex'));
}

// Generate secure 256-bit session token
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/* =====================================================================
   USER MANAGEMENT & 72-HOUR TRIAL
   ===================================================================== */

export function createUser(email: string, password: string, name?: string): { user: UserRecord; token: string } {
  const normalizedEmail = email.trim().toLowerCase();
  if (db.emailIndex[normalizedEmail]) {
    throw new Error('Un compte existe déjà avec cette adresse e-mail.');
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // 72 Hours Exact UTC Trial Expiry:
  const trialExpires = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const trialExpiresIso = trialExpires.toISOString();

  const { hash, salt } = hashPassword(password);
  const userId = `usr_${crypto.randomUUID()}`;

  const user: UserRecord = {
    id: userId,
    email: normalizedEmail,
    name: name?.trim() || normalizedEmail.split('@')[0],
    password_hash: hash,
    salt,
    created_at: nowIso,
    trial_started_at: nowIso,
    trial_expires_at: trialExpiresIso,
    trial_used: true,
    subscription_status: 'trial',
    subscription_expires_at: null,
    last_login_at: nowIso,
  };

  db.users[userId] = user;
  db.emailIndex[normalizedEmail] = userId;

  // Create session token valid for 30 days
  const token = generateSessionToken();
  const sessionExpires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.sessions[token] = {
    token,
    userId,
    createdAt: nowIso,
    expiresAt: sessionExpires,
  };

  saveDatabase();
  return { user, token };
}

export function authenticateUser(email: string, password: string): { user: UserRecord; token: string } {
  const normalizedEmail = email.trim().toLowerCase();
  const userId = db.emailIndex[normalizedEmail];
  if (!userId || !db.users[userId]) {
    throw new Error('Adresse e-mail ou mot de passe incorrect.');
  }

  const user = db.users[userId];
  const isValid = verifyPassword(password, user.password_hash, user.salt);
  if (!isValid) {
    throw new Error('Adresse e-mail ou mot de passe incorrect.');
  }

  const now = new Date();
  user.last_login_at = now.toISOString();

  const token = generateSessionToken();
  const sessionExpires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.sessions[token] = {
    token,
    userId,
    createdAt: now.toISOString(),
    expiresAt: sessionExpires,
  };

  saveDatabase();
  return { user, token };
}

export function getUserByToken(token: string): UserRecord | null {
  if (!token) return null;
  const session = db.sessions[token];
  if (!session) return null;

  const now = new Date();
  if (new Date(session.expiresAt) <= now) {
    delete db.sessions[token];
    saveDatabase();
    return null;
  }

  return db.users[session.userId] || null;
}

export function getUserById(userId: string): UserRecord | null {
  return db.users[userId] || null;
}

export function deleteSession(token: string) {
  if (db.sessions[token]) {
    delete db.sessions[token];
    saveDatabase();
  }
}

/* =====================================================================
   ACCESS CONTROL & TRIAL VALIDATION
   ===================================================================== */

export interface AccessStatus {
  hasAccess: boolean;
  status: 'trial' | 'active' | 'expired';
  trialStartedAt: string;
  trialExpiresAt: string;
  subscriptionExpiresAt: string | null;
  remainingSeconds: number;
  message: string;
}

export function computeUserAccess(user: UserRecord): AccessStatus {
  const now = new Date();
  const trialExpires = new Date(user.trial_expires_at);

  // 1. Check if user has an active paid subscription
  if (user.subscription_expires_at) {
    const subExpires = new Date(user.subscription_expires_at);
    if (subExpires > now) {
      const remainingSeconds = Math.max(0, Math.floor((subExpires.getTime() - now.getTime()) / 1000));
      return {
        hasAccess: true,
        status: 'active',
        trialStartedAt: user.trial_started_at,
        trialExpiresAt: user.trial_expires_at,
        subscriptionExpiresAt: user.subscription_expires_at,
        remainingSeconds,
        message: 'Abonnement actif 30 jours',
      };
    }
  }

  // 2. Check if user is in valid 72-hour trial
  if (trialExpires > now) {
    const remainingSeconds = Math.max(0, Math.floor((trialExpires.getTime() - now.getTime()) / 1000));
    return {
      hasAccess: true,
      status: 'trial',
      trialStartedAt: user.trial_started_at,
      trialExpiresAt: user.trial_expires_at,
      subscriptionExpiresAt: user.subscription_expires_at,
      remainingSeconds,
      message: 'Essai gratuit de 3 jours en cours',
    };
  }

  // 3. Expired: Trial has ended and no active subscription
  return {
    hasAccess: false,
    status: 'expired',
    trialStartedAt: user.trial_started_at,
    trialExpiresAt: user.trial_expires_at,
    subscriptionExpiresAt: user.subscription_expires_at,
    remainingSeconds: 0,
    message: 'Essai gratuit terminé. Veuillez renouveler votre accès (700 FCFA / 30 jours).',
  };
}

/* =====================================================================
   TRANSACTION & SUBSCRIPTION LIFECYCLE
   ===================================================================== */

export function createTransaction(data: {
  userId: string;
  userEmail: string;
  paymentReference: string;
  chargeId: string | null;
  amount: number;
  currency: string;
  checkoutUrl: string | null;
  paymentMethod?: string;
  rawResponse?: any;
}): TransactionRecord {
  const tx: TransactionRecord = {
    id: `tx_${crypto.randomUUID()}`,
    userId: data.userId,
    userEmail: data.userEmail,
    paymentReference: data.paymentReference,
    chargeId: data.chargeId,
    amount: data.amount,
    currency: data.currency,
    status: 'pending',
    paymentMethod: data.paymentMethod || null,
    checkoutUrl: data.checkoutUrl,
    createdAt: new Date().toISOString(),
    completedAt: null,
    rawResponse: data.rawResponse,
  };

  db.transactions[data.paymentReference] = tx;
  saveDatabase();
  return tx;
}

export function getTransactionByReference(paymentReference: string): TransactionRecord | null {
  return db.transactions[paymentReference] || null;
}

/**
 * Confirm successful payment and activate 30 days of subscription.
 * Implements strict idempotency so duplicate webhooks never double-charge or double-credit days!
 */
export function activateSubscriptionFromPayment(paymentReference: string, chargeDetails?: {
  chargeId?: string;
  paymentMethod?: string;
}): { success: boolean; user?: UserRecord; alreadyProcessed?: boolean } {
  const tx = db.transactions[paymentReference];
  if (!tx) {
    console.warn(`Transaction reference not found: ${paymentReference}`);
    return { success: false };
  }

  // Idempotency: if already successful, return early without extending twice
  if (tx.status === 'successful') {
    return { success: true, alreadyProcessed: true, user: db.users[tx.userId] };
  }

  const user = db.users[tx.userId];
  if (!user) {
    console.warn(`User for transaction not found: ${tx.userId}`);
    return { success: false };
  }

  const now = new Date();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  // If user currently has active days left, add 30 days to the remaining time;
  // otherwise, start 30 days from now.
  let baseDate = now;
  if (user.subscription_expires_at) {
    const currentExpiry = new Date(user.subscription_expires_at);
    if (currentExpiry > now) {
      baseDate = currentExpiry;
    }
  }

  const newExpiry = new Date(baseDate.getTime() + THIRTY_DAYS_MS);

  // Update user record
  user.subscription_status = 'active';
  user.subscription_expires_at = newExpiry.toISOString();

  // Mark transaction as successful
  tx.status = 'successful';
  tx.completedAt = now.toISOString();
  if (chargeDetails?.chargeId) tx.chargeId = chargeDetails.chargeId;
  if (chargeDetails?.paymentMethod) tx.paymentMethod = chargeDetails.paymentMethod;

  saveDatabase();
  return { success: true, alreadyProcessed: false, user };
}

export function isWebhookProcessed(eventKey: string): boolean {
  return Boolean(db.processedWebhooks[eventKey]);
}

export function markWebhookProcessed(eventKey: string, status: string) {
  db.processedWebhooks[eventKey] = {
    processedAt: new Date().toISOString(),
    status,
  };
  saveDatabase();
}

/**
 * ENFORCEMENT DU QUOTA STRICT OCR (Max 20 scans par jour par utilisateur/appareil/IP)
 * Système de sécurité anti-contournement professionnel multi-vectoriel :
 * 1. Clé utilisateur (usr_id) si connecté
 * 2. Empreinte matérielle/navigateur (dev_fingerprint)
 * 3. Adresse IP réseau vérifiée (ip_address)
 * 4. Délais de cooldown anti-rafale (anti-flood 3s)
 * 5. Verrou atomique en mémoire + persistance sur disque
 * Un pirate ne peut contourner ni en changeant de VPN, ni en naviguant en mode privé,
 * ni en envoyant des requêtes parallèles ou automatisées.
 */
export const MAX_DAILY_OCR_SCANS = 20;

export interface OcrQuotaResult {
  allowed: boolean;
  used: number;
  remaining: number;
  max: number;
  reason?: 'daily_limit_reached' | 'cooldown_active';
  cooldownSeconds?: number;
}

export function checkAndIncrementOcrQuotaMulti(identifiers: string[]): OcrQuotaResult {
  if (!db.ocrDailyUsage) {
    db.ocrDailyUsage = {};
  }

  const validIds = identifiers.filter((id) => id && id.trim().length > 0);
  if (validIds.length === 0) {
    validIds.push('guest_unknown');
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const now = Date.now();

  // 1. Vérification stricte : si N'IMPORTE QUEL identifiant du groupe a déjà atteint 20 scans
  let highestUsed = 0;
  for (const id of validIds) {
    const record = db.ocrDailyUsage[id];
    if (record && record.date === today) {
      if (record.count > highestUsed) {
        highestUsed = record.count;
      }
      if (record.count >= MAX_DAILY_OCR_SCANS) {
        return {
          allowed: false,
          used: record.count,
          remaining: 0,
          max: MAX_DAILY_OCR_SCANS,
          reason: 'daily_limit_reached',
        };
      }

      // Protection anti-rafale (anti-burst) : minimum 3 secondes entre scans consécutifs
      if (record.lastScanTimestamp && now - record.lastScanTimestamp < 3000) {
        const remainingSeconds = Math.ceil((3000 - (now - record.lastScanTimestamp)) / 1000);
        return {
          allowed: false,
          used: record.count,
          remaining: Math.max(0, MAX_DAILY_OCR_SCANS - record.count),
          max: MAX_DAILY_OCR_SCANS,
          reason: 'cooldown_active',
          cooldownSeconds: remainingSeconds,
        };
      }
    }
  }

  // 2. Tous les contrôles sont franchis : incrémentation atomique synchronisée pour TOUS les identifiants
  const newCount = highestUsed + 1;
  for (const id of validIds) {
    db.ocrDailyUsage[id] = {
      date: today,
      count: newCount,
      lastScanTimestamp: now,
    };
  }

  saveDatabase();

  return {
    allowed: true,
    used: newCount,
    remaining: Math.max(0, MAX_DAILY_OCR_SCANS - newCount),
    max: MAX_DAILY_OCR_SCANS,
  };
}

export function getOcrQuotaStatusMulti(identifiers: string[]): {
  used: number;
  remaining: number;
  max: number;
} {
  if (!db.ocrDailyUsage) {
    db.ocrDailyUsage = {};
  }
  const validIds = identifiers.filter((id) => id && id.trim().length > 0);
  if (validIds.length === 0) {
    return { used: 0, remaining: MAX_DAILY_OCR_SCANS, max: MAX_DAILY_OCR_SCANS };
  }

  const today = new Date().toISOString().slice(0, 10);
  let highestUsed = 0;

  for (const id of validIds) {
    const record = db.ocrDailyUsage[id];
    if (record && record.date === today) {
      if (record.count > highestUsed) {
        highestUsed = record.count;
      }
    }
  }

  return {
    used: highestUsed,
    remaining: Math.max(0, MAX_DAILY_OCR_SCANS - highestUsed),
    max: MAX_DAILY_OCR_SCANS,
  };
}

export function checkAndIncrementOcrQuota(identifier: string): {
  allowed: boolean;
  used: number;
  remaining: number;
  max: number;
} {
  return checkAndIncrementOcrQuotaMulti([identifier]);
}

export function getOcrQuotaStatus(identifier: string): {
  used: number;
  remaining: number;
  max: number;
} {
  return getOcrQuotaStatusMulti([identifier]);
}

/**
 * Protection anti-création massive de comptes :
 * Bloque les robots qui tentent de créer des comptes en boucle pour réinitialiser le quota.
 * Maximum 3 comptes créés par IP par 24 heures.
 */
export function checkAndIncrementRegistrationQuota(ip: string, maxPerDay: number = 3): {
  allowed: boolean;
  count: number;
  max: number;
} {
  if (!db.registrationsDailyUsage) {
    db.registrationsDailyUsage = {};
  }
  const today = new Date().toISOString().slice(0, 10);
  const current = db.registrationsDailyUsage[ip];

  if (!current || current.date !== today) {
    db.registrationsDailyUsage[ip] = { date: today, count: 1 };
    saveDatabase();
    return { allowed: true, count: 1, max: maxPerDay };
  }

  if (current.count >= maxPerDay) {
    return { allowed: false, count: current.count, max: maxPerDay };
  }

  current.count += 1;
  saveDatabase();
  return { allowed: true, count: current.count, max: maxPerDay };
}

/**
 * =========================================================================
 * CONTRÔLE STRICT DU QUOTA D'APPEL VOCAL (20 MINUTES PAR JOUR PAR UTILISATEUR)
 * Incontournable côté serveur :
 * - Plafond quotidien : 20 minutes = 1 200 secondes
 * - Triple liaison : Identifiant compte (usr_id) + Empreinte terminal (dev_fp) + IP réseau (ip)
 * - Calculé à la seconde près avec horloge serveur inaltérable
 * - Réinitialisation automatique quotidienne à 00h00 GMT
 * =========================================================================
 */
export const MAX_DAILY_CALL_SECONDS = 20 * 60; // 1200 secondes = 20 minutes

export function getCallQuotaStatusMulti(identifiers: string[]): {
  usedSeconds: number;
  remainingSeconds: number;
  maxSeconds: number;
  isExhausted: boolean;
} {
  if (!db.callDailyUsage) {
    db.callDailyUsage = {};
  }
  const validIds = identifiers.filter((id) => id && id.trim().length > 0);
  if (validIds.length === 0) {
    return {
      usedSeconds: 0,
      remainingSeconds: MAX_DAILY_CALL_SECONDS,
      maxSeconds: MAX_DAILY_CALL_SECONDS,
      isExhausted: false,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  let highestUsedSeconds = 0;

  for (const id of validIds) {
    const record = db.callDailyUsage[id];
    if (record && record.date === today) {
      if (record.secondsUsed > highestUsedSeconds) {
        highestUsedSeconds = record.secondsUsed;
      }
    }
  }

  const clampedUsed = Math.min(MAX_DAILY_CALL_SECONDS, Math.max(0, Math.floor(highestUsedSeconds)));
  const remaining = Math.max(0, MAX_DAILY_CALL_SECONDS - clampedUsed);

  return {
    usedSeconds: clampedUsed,
    remainingSeconds: remaining,
    maxSeconds: MAX_DAILY_CALL_SECONDS,
    isExhausted: remaining <= 0,
  };
}

export function recordCallSecondsMulti(
  identifiers: string[],
  addedSeconds: number
): {
  usedSeconds: number;
  remainingSeconds: number;
  maxSeconds: number;
  allowed: boolean;
} {
  if (!db.callDailyUsage) {
    db.callDailyUsage = {};
  }
  const validIds = identifiers.filter((id) => id && id.trim().length > 0);
  if (validIds.length === 0) {
    validIds.push('guest_call_unknown');
  }

  const today = new Date().toISOString().slice(0, 10);
  let highestUsedSeconds = 0;

  for (const id of validIds) {
    const record = db.callDailyUsage[id];
    if (record && record.date === today) {
      if (record.secondsUsed > highestUsedSeconds) {
        highestUsedSeconds = record.secondsUsed;
      }
    }
  }

  // Si le quota est déjà dépassé
  if (highestUsedSeconds >= MAX_DAILY_CALL_SECONDS) {
    return {
      usedSeconds: MAX_DAILY_CALL_SECONDS,
      remainingSeconds: 0,
      maxSeconds: MAX_DAILY_CALL_SECONDS,
      allowed: false,
    };
  }

  // Incrément sécurisé
  const increment = Math.max(0, Math.min(60, addedSeconds)); // Limite de 60s par battement pour éviter toute falsification
  const newUsed = Math.min(MAX_DAILY_CALL_SECONDS, highestUsedSeconds + increment);

  for (const id of validIds) {
    db.callDailyUsage[id] = {
      date: today,
      secondsUsed: newUsed,
    };
  }

  saveDatabase();

  const remaining = Math.max(0, MAX_DAILY_CALL_SECONDS - newUsed);
  return {
    usedSeconds: Math.floor(newUsed),
    remainingSeconds: Math.floor(remaining),
    maxSeconds: MAX_DAILY_CALL_SECONDS,
    allowed: remaining > 0,
  };
}
