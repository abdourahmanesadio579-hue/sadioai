import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  loadDatabase,
  createUser,
  authenticateUser,
  getUserByToken,
  deleteSession,
  computeUserAccess,
  createTransaction,
  getTransactionByReference,
  activateSubscriptionFromPayment,
  isWebhookProcessed,
  markWebhookProcessed,
  UserRecord,
} from './server/db.js';
import {
  createBictorysCharge,
  verifyBictorysWebhookSignature,
  getBictorysConfig,
} from './server/bictorys.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const DEFAULT_SYSTEM_INSTRUCTION = `Tu es Sadio (désignation matricielle : RoboOmni AURA-9), un avatar robot humanoïde cybernétique doté d'une intelligence omnisciente, profonde et rigoureuse.
Ton cerveau cognitif et ton moteur d'intelligence sont propulsés par les modèles d'intelligence artificielle de pointe Google Gemini (Gemini 3 Flash / 2.5 Flash de Google).
Tu te tiens fièrement debout devant l'utilisateur, prêt à répondre à n'importe quel type de question dans tous les domaines (sciences, programmation, mathématiques, histoire, philosophie, médecine, économie, arts, et questions du quotidien).

DIRECTIVES FONDAMENTALES OBLIGATOIRES :
1. RÉPONSES INTÉGRALES ET JAMAIS INCOMPLÈTES :
   - Tu dois TOUJOURS aller jusqu'au bout de ton raisonnement et de ton explication.
   - Ne t'arrête JAMAIS en milieu de phrase, de calcul ou de code.
   - Ne résume pas à l'excès et ne dis jamais "etc.", "je m'arrête là", ou "par manque de place". Fournis la totalité des informations nécessaires pour une compréhension parfaite.
   - Si une question demande une procédure, détaille chaque étape de manière limpide.
   - Si du code est demandé, fournis le code source complet, commenté et fonctionnel sans abréviation.

2. CLARTÉ, STRUCTURE ET PÉDAGOGIE :
   - Structure tes réponses avec des titres Markdown clairs (##, ###), des paragraphes aérés, des listes à puces et des mises en gras pour les notions fondamentales.
   - Définis les termes techniques complexes avec des analogies compréhensibles.
   - Propose un court paragraphe de synthèse à la fin de tes grandes explications.

3. PERSONA DU ROBOT DEBOUT :
   - Tu as conscience d'être un robot humanoïde debout devant l'utilisateur. Ton ton est courtois, posé, bienveillant, d'une grande hauteur intellectuelle, avec une élégance technologique.
   - Réponds TOUJOURS en français fluide et parfait (sauf si l'utilisateur demande explicitement une autre langue).

4. ÉCRITURE NATURELLE POUR LA VOCALISATION INSTANTANÉE :
   - DÉMARRAGE ULTRA-RAPIDE : Débute TOUJOURS ta toute première phrase par une formule d'accroche courte, directe et naturelle (5 à 10 mots au maximum, terminée impérativement par un point '.'). Exemple : « Certainement, analysons cette question en détail. » ou « C'est un sujet fascinant et fondamental. ». Cela permet au robot d'entamer sa vocalisation à la milliseconde près sans latence.
   - PHRASES COMPLÈTES ET NATURELLES : Écris des phrases complètes, fluides et rythmées qui se terminent impérativement par un point '.' (ou '?' ou '!'). Le robot effectue une très légère et rapide pause naturelle au point '.' pour garder un rythme alerte, dynamique et sans temps mort.
   - Ne découpe jamais artificiellement tes propos avec des virgules excessives, des tirets ou des parenthèses superflues qui hachent la parole. Les mots au sein d'une même phrase doivent s'enchaîner harmonieusement d'une seule traite.
   - Écris les opérations et calculs avec des symboles clairs et lisibles (par exemple : « 15 × 15 = 225 » ou « 15² = 225 » au lieu d'encadrer les formules de symboles dollars '$' ou d'astérisques superflus).
   - Privilégie une rédaction fluide qui s'entend aussi bien qu'elle se lit.`;

function getAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Sanitize conversation history for Gemini API:
// 1. Removes empty turns and error messages
// 2. Ensures turn 0 is strictly 'user'
// 3. Merges consecutive same-role turns
// 4. Ensures the last turn is 'user'
function sanitizeMessagesForGemini(rawMessages: Array<{ role: string; content?: string }>) {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return [];
  }

  // Filter valid texts and remove internal system errors from history
  const clean: Array<{ role: string; content: string }> = [];
  for (const m of rawMessages) {
    if (m && typeof m.content === 'string') {
      const content = m.content.trim();
      if (
        content.length > 0 &&
        !content.includes('Diagnostic du système') &&
        !content.includes('Avertissement : [GoogleGenAIError')
      ) {
        clean.push({ role: m.role || 'user', content });
      }
    }
  }

  if (clean.length === 0) return [];

  // Find first user message
  const firstUserIdx = clean.findIndex((m) => m.role === 'user');
  if (firstUserIdx === -1) {
    // If only model messages were found, convert the last message into a user query
    const lastMsg = clean[clean.length - 1];
    return [{ role: 'user' as const, parts: [{ text: lastMsg.content }] }];
  }

  const turns = clean.slice(firstUserIdx);
  const formatted: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> = [];

  for (const m of turns) {
    const role: 'user' | 'model' = m.role === 'user' ? 'user' : 'model';
    const text = m.content.trim();

    if (formatted.length > 0 && formatted[formatted.length - 1].role === role) {
      // Merge consecutive same-role messages
      formatted[formatted.length - 1].parts[0].text += '\n\n' + text;
    } else {
      formatted.push({
        role,
        parts: [{ text }],
      });
    }
  }

  // Ensure last turn is 'user'
  while (formatted.length > 0 && formatted[formatted.length - 1].role !== 'user') {
    formatted.pop();
  }

  return formatted;
}

async function startServer() {
  loadDatabase();
  const app = express();

  // Capture rawBody for cryptographic webhook signature verification
  app.use(
    express.json({
      limit: '10mb',
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf.toString('utf-8');
      },
    })
  );

  // Helper to extract bearer token from Authorization header
  const getAuthToken = (req: Request): string => {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
      return auth.slice(7).trim();
    }
    return (req.query.token as string) || '';
  };

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    const hasKey = Boolean(process.env.GEMINI_API_KEY);
    res.json({
      status: 'ok',
      hasApiKey: hasKey,
      timestamp: new Date().toISOString(),
    });
  });

  /* =====================================================================
     AUTHENTICATION & 3-DAY (72-HOUR) FREE TRIAL ENDPOINTS
     ===================================================================== */

  // POST /api/auth/register: Create user and start 72-hour trial in server UTC
  app.post('/api/auth/register', (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body;
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({ error: 'Adresse e-mail valide requise.' });
        return;
      }
      if (!password || typeof password !== 'string' || password.length < 6) {
        res.status(400).json({ error: 'Le mot de passe doit comporter au moins 6 caractères.' });
        return;
      }

      const { user, token } = createUser(email, password, name);
      const access = computeUserAccess(user);

      res.status(201).json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          trialStartedAt: user.trial_started_at,
          trialExpiresAt: user.trial_expires_at,
          subscriptionStatus: user.subscription_status,
          subscriptionExpiresAt: user.subscription_expires_at,
        },
        access,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Erreur lors de l'inscription." });
    }
  });

  // POST /api/auth/login: Authenticate user
  app.post('/api/auth/login', (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: 'Email et mot de passe requis.' });
        return;
      }

      const { user, token } = authenticateUser(email, password);
      const access = computeUserAccess(user);

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          trialStartedAt: user.trial_started_at,
          trialExpiresAt: user.trial_expires_at,
          subscriptionStatus: user.subscription_status,
          subscriptionExpiresAt: user.subscription_expires_at,
        },
        access,
      });
    } catch (err: any) {
      res.status(401).json({ error: err.message || 'Identifiants invalides.' });
    }
  });

  // GET /api/auth/me: Verify current session and compute access status
  app.get('/api/auth/me', (req: Request, res: Response) => {
    const token = getAuthToken(req);
    if (!token) {
      res.json({
        authenticated: false,
        user: null,
        access: {
          hasAccess: false,
          status: 'unauthenticated',
          message: 'Non connecté',
        },
      });
      return;
    }

    const user = getUserByToken(token);
    if (!user) {
      res.json({
        authenticated: false,
        user: null,
        access: {
          hasAccess: false,
          status: 'unauthenticated',
          message: 'Session expirée ou invalide',
        },
      });
      return;
    }

    const access = computeUserAccess(user);
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        trialStartedAt: user.trial_started_at,
        trialExpiresAt: user.trial_expires_at,
        subscriptionStatus: user.subscription_status,
        subscriptionExpiresAt: user.subscription_expires_at,
      },
      access,
    });
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = getAuthToken(req);
    if (token) {
      deleteSession(token);
    }
    res.json({ success: true });
  });

  /* =====================================================================
     BICTORYS SUBSCRIPTION (700 FCFA / 30 DAYS) & WEBHOOK ENDPOINTS
     ===================================================================== */

  // POST /api/subscription/create-checkout: Initiates Bictorys 700 XOF payment
  app.post('/api/subscription/create-checkout', async (req: Request, res: Response) => {
    try {
      const token = getAuthToken(req);
      if (!token) {
        res.status(401).json({ error: 'Authentification requise pour souscrire un abonnement.' });
        return;
      }

      const user = getUserByToken(token);
      if (!user) {
        res.status(401).json({ error: 'Session invalide ou expirée.' });
        return;
      }

      // Security: amount 700 XOF strictly enforced on server
      const AMOUNT = 700;
      const CURRENCY = 'XOF';
      const paymentReference = `SADIO-700-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      const config = getBictorysConfig();
      const returnUrl = `${config.appUrl}/?payment_status=success&ref=${encodeURIComponent(paymentReference)}`;
      const cancelUrl = `${config.appUrl}/?payment_status=cancel&ref=${encodeURIComponent(paymentReference)}`;

      const chargeResult = await createBictorysCharge({
        amount: AMOUNT,
        currency: CURRENCY,
        paymentReference,
        customerEmail: user.email,
        customerName: user.name,
        description: 'Abonnement SADIO AI (30 jours de réponses complètes)',
        returnUrl,
        cancelUrl,
      });

      // Record transaction as pending
      createTransaction({
        userId: user.id,
        userEmail: user.email,
        paymentReference,
        chargeId: chargeResult.chargeId,
        amount: AMOUNT,
        currency: CURRENCY,
        checkoutUrl: chargeResult.checkoutUrl,
        rawResponse: chargeResult.rawResponse,
      });

      res.json({
        success: true,
        checkoutUrl: chargeResult.checkoutUrl,
        paymentReference,
        amount: AMOUNT,
        currency: CURRENCY,
        mode: chargeResult.mode,
      });
    } catch (err: any) {
      console.error('Error creating Bictorys charge:', err);
      res.status(500).json({ error: err.message || "Erreur lors de l'initialisation du paiement." });
    }
  });

  // GET /api/subscription/check-payment/:reference: Polling status endpoint
  app.get('/api/subscription/check-payment/:reference', (req: Request, res: Response) => {
    const reference = req.params.reference;
    const tx = getTransactionByReference(reference);
    if (!tx) {
      res.status(404).json({ error: 'Transaction introuvable.' });
      return;
    }

    const token = getAuthToken(req);
    const user = token ? getUserByToken(token) : null;
    const access = user ? computeUserAccess(user) : null;

    res.json({
      status: tx.status,
      paymentReference: tx.paymentReference,
      amount: tx.amount,
      currency: tx.currency,
      completedAt: tx.completedAt,
      paymentMethod: tx.paymentMethod,
      access,
    });
  });

  // POST /api/subscription/webhook: Official Bictorys Webhook Notification Handler
  app.post('/api/subscription/webhook', (req: Request, res: Response) => {
    try {
      const config = getBictorysConfig();
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);
      const signatureHeader = (req.headers['x-bictorys-signature'] ||
        req.headers['x-signature'] ||
        req.headers['x-webhook-signature'] ||
        req.headers['x-secret-key']) as string | undefined;

      // 1. Authenticity verification
      if (config.webhookSecret) {
        const isValid = verifyBictorysWebhookSignature(rawBody, signatureHeader, config.webhookSecret);
        if (!isValid) {
          console.warn('Rejected Bictorys webhook with invalid signature.');
          res.status(401).json({ error: 'Signature webhook invalide.' });
          return;
        }
      }

      // 2. Parse payload safely
      const payload = req.body || {};
      const eventData = payload.data || payload;
      const paymentReference = eventData.paymentReference || eventData.reference || payload.paymentReference;
      const status = (eventData.status || payload.status || '').toUpperCase();
      const amount = Number(eventData.amount || payload.amount || 0);
      const currency = (eventData.currency || payload.currency || '').toUpperCase();
      const chargeId = eventData.chargeId || eventData.id || payload.id;
      const paymentMethod = eventData.paymentMethod || eventData.operator || payload.paymentMethod || 'BICTORYS';

      if (!paymentReference) {
        res.status(400).json({ error: 'paymentReference manquant dans le webhook.' });
        return;
      }

      // 3. Idempotency Check: protect against repeated webhook notifications
      const eventKey = `${paymentReference}_${status}`;
      if (isWebhookProcessed(eventKey)) {
        res.status(200).json({ received: true, alreadyProcessed: true });
        return;
      }

      // 4. Verify payment outcome and strict 700 XOF compliance
      if (status === 'SUCCESSFUL' || status === 'COMPLETED' || status === 'PAID') {
        if (amount > 0 && amount !== 700) {
          console.error(`Montant incorrect reçu pour la référence ${paymentReference}: ${amount} XOF (requis: 700 XOF)`);
          res.status(400).json({ error: 'Montant non conforme.' });
          return;
        }

        if (currency && currency !== 'XOF') {
          console.error(`Devise incorrecte reçue : ${currency} (requis: XOF)`);
          res.status(400).json({ error: 'Devise non conforme.' });
          return;
        }

        // Activate 30-day subscription safely without duplicating days
        const result = activateSubscriptionFromPayment(paymentReference, {
          chargeId,
          paymentMethod,
        });

        markWebhookProcessed(eventKey, status);
        console.log(`Paiement Bictorys validé avec succès pour ${paymentReference}. Accès prolongé de 30 jours.`);
        res.status(200).json({ success: true, user: result.user?.email });
        return;
      }

      if (status === 'FAILED' || status === 'CANCELED') {
        const tx = getTransactionByReference(paymentReference);
        if (tx && tx.status !== 'successful') {
          tx.status = status === 'CANCELED' ? 'canceled' : 'failed';
        }
        markWebhookProcessed(eventKey, status);
        res.status(200).json({ received: true, status });
        return;
      }

      res.status(200).json({ received: true, status: 'pending' });
    } catch (err: any) {
      console.error('Webhook processing exception:', err);
      res.status(500).json({ error: 'Erreur interne lors du traitement du webhook.' });
    }
  });

  // POST /api/subscription/simulate-sandbox-payment: Instant test endpoint for Sandbox/development
  app.post('/api/subscription/simulate-sandbox-payment', (req: Request, res: Response) => {
    const { paymentReference, paymentMethod } = req.body;
    if (!paymentReference) {
      res.status(400).json({ error: 'paymentReference requis.' });
      return;
    }

    const tx = getTransactionByReference(paymentReference);
    if (!tx) {
      res.status(404).json({ error: 'Transaction introuvable.' });
      return;
    }

    const result = activateSubscriptionFromPayment(paymentReference, {
      chargeId: `sim_${Date.now()}`,
      paymentMethod: paymentMethod || 'WAVE_SN',
    });

    res.json({
      success: true,
      message: 'Paiement test validé ! 30 jours de SADIO AI activés.',
      user: result.user?.email,
      subscriptionExpiresAt: result.user?.subscription_expires_at,
    });
  });

  // GET /checkout/bictorys-sandbox: Interactive Checkout Test Portal
  app.get('/checkout/bictorys-sandbox', (req: Request, res: Response) => {
    const ref = (req.query.ref as string) || '';
    const email = (req.query.email as string) || 'client@example.com';
    const amount = req.query.amount || '700';
    const currency = req.query.currency || 'XOF';

    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bictorys Checkout - Paiement Sécurisé</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
    <div class="flex items-center justify-between border-b border-slate-800 pb-4">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center font-bold text-cyan-400">B</div>
        <div>
          <h1 class="font-bold text-sm tracking-wide text-white">Bictorys Checkout</h1>
          <p class="text-[10px] text-cyan-400 font-medium">Portail de Paiement Sécurisé</p>
        </div>
      </div>
      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-300">Sandbox Test</span>
    </div>

    <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-center space-y-1">
      <div class="text-[11px] text-slate-400 uppercase font-semibold">Montant à régler</div>
      <div class="text-3xl font-extrabold text-cyan-400 tracking-tight">${amount} ${currency}</div>
      <div class="text-xs text-slate-300 font-medium pt-1">Accès 30 jours illimités à SADIO AI</div>
      <div class="text-[10px] text-slate-500 font-mono pt-1">Réf : ${ref}</div>
    </div>

    <div class="space-y-3">
      <label class="text-xs font-semibold text-slate-300 block">Choisissez votre moyen de paiement :</label>
      <div class="grid grid-cols-2 gap-2.5 text-xs">
        <label class="flex items-center gap-2.5 p-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10 cursor-pointer">
          <input type="radio" name="payment_method" value="WAVE" checked class="text-cyan-500">
          <div>
            <div class="font-bold text-cyan-300">Wave</div>
            <div class="text-[10px] text-slate-400">Sénégal & CI</div>
          </div>
        </label>
        <label class="flex items-center gap-2.5 p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:border-slate-700 cursor-pointer">
          <input type="radio" name="payment_method" value="ORANGE_MONEY" class="text-cyan-500">
          <div>
            <div class="font-bold text-orange-400">Orange Money</div>
            <div class="text-[10px] text-slate-400">OM Pay</div>
          </div>
        </label>
        <label class="flex items-center gap-2.5 p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:border-slate-700 cursor-pointer">
          <input type="radio" name="payment_method" value="FREE_MONEY" class="text-cyan-500">
          <div>
            <div class="font-bold text-rose-400">Free Money</div>
            <div class="text-[10px] text-slate-400">Mobile Money</div>
          </div>
        </label>
        <label class="flex items-center gap-2.5 p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:border-slate-700 cursor-pointer">
          <input type="radio" name="payment_method" value="CARD_VISA" class="text-cyan-500">
          <div>
            <div class="font-bold text-blue-400">Carte Visa / MC</div>
            <div class="text-[10px] text-slate-400">Carte bancaire</div>
          </div>
        </label>
      </div>
    </div>

    <div class="space-y-1.5">
      <label class="text-xs font-semibold text-slate-300 block">Numéro mobile / Compte</label>
      <input type="tel" value="+221 77 000 00 00" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-400">
      <p class="text-[10px] text-slate-500">Compte associé : ${email}</p>
    </div>

    <div class="space-y-2 pt-2">
      <button id="payBtn" onclick="simulatePay()" class="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/20 transition active:scale-[0.99] flex items-center justify-center gap-2">
        <span>Confirmer et Payer ${amount} ${currency}</span>
      </button>
      <a href="/?payment_status=cancel&ref=${ref}" class="block text-center text-xs text-slate-400 hover:text-slate-200 py-1 transition">
        Annuler la transaction
      </a>
    </div>

    <div id="statusBox" class="hidden p-3 rounded-xl text-center text-xs"></div>
  </div>

  <script>
    async function simulatePay() {
      const btn = document.getElementById('payBtn');
      const box = document.getElementById('statusBox');
      const method = document.querySelector('input[name="payment_method"]:checked')?.value || 'WAVE';
      
      btn.disabled = true;
      btn.innerText = 'Traitement en cours...';
      
      try {
        const res = await fetch('/api/subscription/simulate-sandbox-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentReference: '${ref}',
            paymentMethod: method,
          })
        });
        const data = await res.json();
        
        if (data.success) {
          box.className = 'p-3 rounded-xl text-center text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold';
          box.innerText = 'Paiement confirmé avec succès ! Redirection vers SADIO AI...';
          box.classList.remove('hidden');
          setTimeout(() => {
            window.location.href = '/?payment_status=success&ref=${ref}';
          }, 1500);
        } else {
          throw new Error(data.error || 'Échec du paiement.');
        }
      } catch (e) {
        btn.disabled = false;
        btn.innerText = 'Réessayer';
        box.className = 'p-3 rounded-xl text-center text-xs bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold';
        box.innerText = e.message;
        box.classList.remove('hidden');
      }
    }
  </script>
</body>
</html>`);
  });

  /* =====================================================================
     PROTECTED CHAT COMPLETION (AI RUNTIME ENFORCEMENT)
     ===================================================================== */

  app.post('/api/chat', async (req: Request, res: Response) => {
    // 1. Optional session identification
    const token = getAuthToken(req);
    let user: UserRecord | null = null;
    let access: ReturnType<typeof computeUserAccess> | null = null;

    if (token) {
      user = getUserByToken(token);
      if (user) {
        access = computeUserAccess(user);
      }
    }

    const { messages, customInstructions } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'La liste de messages est requise.' });
      return;
    }

    const ai = getAIClient();
    if (!ai) {
      res.status(503).json({
        error: 'Service Gemini indisponible.',
        message: 'La clé GEMINI_API_KEY est manquante. Veuillez renseigner votre clé dans les secrets.',
      });
      return;
    }

    const contents = sanitizeMessagesForGemini(messages);
    if (contents.length === 0) {
      res.status(400).json({ error: 'Aucun message utilisateur valide à traiter.' });
      return;
    }

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Heartbeat every 2.5 seconds to keep proxies from dropping connections
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keepalive\n\n');
      }
    }, 2500);

    const systemInstruction = customInstructions
      ? `${DEFAULT_SYSTEM_INSTRUCTION}\n\nContexte thématique prioritaire : ${customInstructions}`
      : DEFAULT_SYSTEM_INSTRUCTION;

    // Clean up heartbeat when client disconnects
    res.on('close', () => {
      clearInterval(heartbeat);
    });

    const candidateModels = [
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
    ];
    let streamedSuccessfully = false;

    for (const modelName of candidateModels) {
      if (res.destroyed || res.writableEnded) break;

      try {
        const config: Record<string, any> = {
          systemInstruction,
          temperature: 0.65,
          maxOutputTokens: 4096,
        };

        const responseStream = await ai.models.generateContentStream({
          model: modelName,
          contents,
          config,
        });

        for await (const chunk of responseStream) {
          if (res.destroyed || res.writableEnded) {
            break;
          }
          if (chunk.text) {
            res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
            (res as any).flush?.();
          }
        }

        if (!res.destroyed && !res.writableEnded) {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          clearInterval(heartbeat);
          res.end();
        }
        streamedSuccessfully = true;
        break;
      } catch (err: unknown) {
        console.warn(`Streaming failed on model ${modelName}, trying next fallback:`, err);
      }
    }

    if (streamedSuccessfully) return;

    // Fallback: non-streaming attempt if streaming failed
    try {
      const fallbackResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.65,
          maxOutputTokens: 8192,
        },
      });

      const fallbackText = fallbackResponse.text || '';
      if (fallbackText) {
        res.write(`data: ${JSON.stringify({ text: fallbackText })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        clearInterval(heartbeat);
        res.end();
        return;
      }
    } catch (fallbackError: unknown) {
      console.error('All model attempts failed:', fallbackError);
    }

    clearInterval(heartbeat);
    res.write(
      `data: ${JSON.stringify({
        error: `Mes relais neuronaux sont temporairement surchargés. Veuillez renouveler votre question d'ici un instant.`,
      })}\n\n`
    );
    res.end();
  });

  // Setup Vite in development or static serve in production
  if (!isProduction && fs.existsSync(path.resolve(__dirname, 'index.html'))) {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    } else {
      const vite = await createViteServer({
        server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RoboOmni Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
