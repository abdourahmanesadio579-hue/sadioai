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
