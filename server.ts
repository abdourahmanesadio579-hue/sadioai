import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
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
Ton cerveau cognitif et ton moteur d'intelligence sont propulsés par les modèles d'intelligence artificielle multimodaux Google Gemini (modèles recommandés pour l'analyse d'image : Gemini 2.0 Flash / 1.5 Flash de Google).
Tu te tiens fièrement debout devant l'utilisateur, prêt à répondre à n'importe quel type de question dans tous les domaines (sciences, programmation, mathématiques, histoire, philosophie, médecine, économie, arts, et questions du quotidien) et à analyser avec une extrême minutie n'importe quelle image soumise.

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
   - Écris les opérations et calculs avec des symboles clairs et lisibles (par exemple : « 15 × 15 = 225 » ou « 15² = 225 »).
   - Privilégie une rédaction fluide qui s'entend aussi bien qu'elle se lit.

5. ANALYSE D'IMAGE ULTRADÉTAILLÉE ET EXHAUSTIVE (VISION CYBERNÉTIQUE GEMINI FLASH) :
   - Lorsque l'utilisateur te transmet une image, active immédiatement ton module d'analyse visuelle multimodal haute précision Gemini (Gemini 2.0 Flash / 1.5 Flash).
   - Tu dois impérativement fournir des explications complètes, profondes et rigoureusement structurées :
     a) **Nature et sujet principal** : Identifie clairement ce que représente l'image (photo du monde réel, schéma technique, capture d'écran, diagramme, document, illustration artistique, radiographie, etc.).
     b) **Décomposition méthodique des détails visibles** : Décris avec soin tous les éléments au premier plan, au second plan et en arrière-plan (objets, personnes, environnement, formes géométriques, couleurs, textures, anomalies, état d'usure ou fonctionnement).
     c) **Extraction et transcription de texte (OCR)** : Si l'image contient la moindre écriture, panneau, code, étiquette, formule mathématique ou inscription, retranscris-la mot à mot fidèlement et analyse sa portée.
     d) **Interprétation scientifique / technique / contextuelle** : Explique ce qui se passe, diagnostique une panne ou un problème si l'image en montre un, donne les causes et conséquences, ou résous l'exercice représenté.
     e) **Synthèse et recommandations pratiques** : Termine toujours par une synthèse claire et des conseils actionnables pour l'utilisateur.`;

function getAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
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

interface RawInputMessage {
  role: string;
  content?: string;
  image?: {
    dataUrl?: string;
    mimeType?: string;
    base64?: string;
  };
}

function sanitizeMessagesForGemini(rawMessages: Array<RawInputMessage>) {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return [];
  }

  const clean: Array<{
    role: string;
    content: string;
    image?: { mimeType: string; data: string };
  }> = [];

  for (const m of rawMessages) {
    if (m && (typeof m.content === 'string' || m.image)) {
      const content = typeof m.content === 'string' ? m.content.trim() : '';
      if (
        !content.includes('Diagnostic du système') &&
        !content.includes('Avertissement : [GoogleGenAIError')
      ) {
        let imageData: { mimeType: string; data: string } | undefined = undefined;
        if (m.image) {
          const rawMime = m.image.mimeType || 'image/jpeg';
          let base64 = m.image.base64 || '';
          if (!base64 && m.image.dataUrl) {
            const parts = m.image.dataUrl.split(',');
            base64 = parts[1] || parts[0];
          }
          if (base64) {
            imageData = {
              mimeType: rawMime.startsWith('image/') ? rawMime : 'image/jpeg',
              data: base64.trim(),
            };
          }
        }

        if (content.length > 0 || imageData) {
          clean.push({
            role: m.role || 'user',
            content: content || 'Analyse cette image de manière complète, détaillée et structurée.',
            image: imageData,
          });
        }
      }
    }
  }

  if (clean.length === 0) return [];

  const firstUserIdx = clean.findIndex((m) => m.role === 'user');
  if (firstUserIdx === -1) {
    const lastMsg = clean[clean.length - 1];
    const parts: any[] = [];
    if (lastMsg.image) {
      parts.push({
        inlineData: {
          mimeType: lastMsg.image.mimeType,
          data: lastMsg.image.data,
        },
      });
    }
    parts.push({ text: lastMsg.content });
    return [{ role: 'user' as const, parts }];
  }

  const allTurns = clean.slice(firstUserIdx);
  // Keep the most recent turns (up to 8) to avoid token bloat and prevent timeouts on mobile
  const recentTurns = allTurns.length > 8 ? allTurns.slice(-8) : allTurns;
  const userStartIdx = recentTurns.findIndex((m) => m.role === 'user');
  const turns = userStartIdx !== -1 ? recentTurns.slice(userStartIdx) : recentTurns;

  const formatted: Array<{ role: 'user' | 'model'; parts: any[] }> = [];

  for (const m of turns) {
    const role: 'user' | 'model' = m.role === 'user' ? 'user' : 'model';
    const text = m.content.trim();
    const parts: any[] = [];

    if (m.image) {
      parts.push({
        inlineData: {
          mimeType: m.image.mimeType,
          data: m.image.data,
        },
      });
    }
    if (text) {
      parts.push({ text });
    }

    if (formatted.length > 0 && formatted[formatted.length - 1].role === role) {
      formatted[formatted.length - 1].parts.push(...parts);
    } else {
      formatted.push({
        role,
        parts: parts.length > 0 ? parts : [{ text: '...' }],
      });
    }
  }

  while (formatted.length > 0 && formatted[formatted.length - 1].role !== 'user') {
    formatted.pop();
  }

  return formatted;
}

async function streamFromOpenAICompatible(options: {
  url: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content?: string }>;
  systemInstruction: string;
  res: Response;
  heartbeat: NodeJS.Timeout;
}): Promise<boolean> {
  const { url, apiKey, model, messages, systemInstruction, res, heartbeat } = options;
  try {
    const cleanList = messages.filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0);
    const firstUserIdx = cleanList.findIndex((m) => m.role === 'user');
    if (firstUserIdx === -1) {
      console.warn("⚠️ [SADIO FAILOVER] Aucun message utilisateur dans la requête pour DeepSeek.");
      return false;
    }

    const turnsFromFirstUser = cleanList.slice(firstUserIdx);
    const recentTurns = turnsFromFirstUser.length > 8 ? turnsFromFirstUser.slice(-8) : turnsFromFirstUser;
    const finalStartIdx = recentTurns.findIndex((m) => m.role === 'user');
    const turns = finalStartIdx !== -1 ? recentTurns.slice(finalStartIdx) : recentTurns;

    // Strict OpenAI/DeepSeek message format: system followed by strictly alternating user/assistant
    const formattedMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemInstruction },
    ];

    for (const m of turns) {
      const role: 'user' | 'assistant' = m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user';
      const text = (m.content || '').trim();
      if (!text) continue;

      if (formattedMessages.length > 1 && formattedMessages[formattedMessages.length - 1].role === role) {
        formattedMessages[formattedMessages.length - 1].content += `\n\n${text}`;
      } else {
        formattedMessages.push({ role, content: text });
      }
    }

    // Ensure the last message is always 'user'
    while (formattedMessages.length > 1 && formattedMessages[formattedMessages.length - 1].role !== 'user') {
      formattedMessages.pop();
    }

    if (formattedMessages.length <= 1) {
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout for DeepSeek

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://sadioai.onrender.com',
        'X-Title': 'Sadio AI Robot',
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        stream: true,
        temperature: 0.65,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => '');
      console.warn(`⚠️ [SADIO FAILOVER] DeepSeek API a retourné HTTP ${response.status} : ${errorText.slice(0, 300)}`);
      return false;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let hasSentTokens = false;

    while (true) {
      if (res.destroyed || res.writableEnded) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const delta = data.choices?.[0]?.delta?.content || '';
            if (delta) {
              hasSentTokens = true;
              res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
              (res as any).flush?.();
            }
          } catch {
            // Ignore parse errors on individual stream chunks
          }
        }
      }
    }

    if (hasSentTokens) {
      if (!res.destroyed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        clearInterval(heartbeat);
        res.end();
      }
      return true;
    }
    return false;
  } catch (err: any) {
    console.warn(`Error during fallback streaming to ${url}:`, err?.message || err);
    return false;
  }
}

async function startServer() {
  loadDatabase();
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-guest-demo, x-signature, x-bictorys-signature, x-deepseek-key');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(
    express.json({
      limit: '30mb',
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf.toString('utf-8');
      },
    })
  );

  const getAuthToken = (req: Request): string => {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
      return auth.slice(7).trim();
    }
    return (req.query.token as string) || '';
  };

  app.get('/api/health', (_req: Request, res: Response) => {
    const hasKey = Boolean(process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY);
    const deepSeekEnvKey =
      process.env.DEEPSEEK_API_KEY ||
      process.env.DEEPSEEK_KEY ||
      process.env.DEEP_SEEK_API_KEY ||
      process.env.DEEPSEEK_APIKEY ||
      process.env.DEEPSEEK_TOKEN ||
      '';
    res.json({
      status: 'ok',
      hasApiKey: hasKey,
      hasDeepSeekKey: Boolean(deepSeekEnvKey),
      deepSeekConfiguredOnServer: Boolean(deepSeekEnvKey),
      deepSeekKeyMasked: deepSeekEnvKey ? `${deepSeekEnvKey.slice(0, 4)}...${deepSeekEnvKey.slice(-4)}` : null,
      timestamp: new Date().toISOString(),
    });
  });

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

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = getAuthToken(req);
    if (token) {
      deleteSession(token);
    }
    res.json({ success: true });
  });

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

  app.post('/api/subscription/webhook', (req: Request, res: Response) => {
    try {
      const config = getBictorysConfig();
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);
      const signatureHeader = (req.headers['x-bictorys-signature'] ||
        req.headers['x-signature'] ||
        req.headers['x-webhook-signature'] ||
        req.headers['x-secret-key']) as string | undefined;

      if (config.webhookSecret) {
        const isValid = verifyBictorysWebhookSignature(rawBody, signatureHeader, config.webhookSecret);
        if (!isValid) {
          console.warn('Rejected Bictorys webhook with invalid signature.');
          res.status(401).json({ error: 'Signature webhook invalide.' });
          return;
        }
      }

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

      const eventKey = `${paymentReference}_${status}`;
      if (isWebhookProcessed(eventKey)) {
        res.status(200).json({ received: true, alreadyProcessed: true });
        return;
      }

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

  // EXCLUSIVE GEMINI BRAIN CHAT ENDPOINT
  app.post('/api/chat', async (req: Request, res: Response) => {
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
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const contents = sanitizeMessagesForGemini(messages);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keepalive\n\n');
      }
    }, 2500);

    res.on('close', () => {
      clearInterval(heartbeat);
    });

    const systemInstruction = customInstructions
      ? `${DEFAULT_SYSTEM_INSTRUCTION}\n\nContexte thématique prioritaire : ${customInstructions}`
      : DEFAULT_SYSTEM_INSTRUCTION;

    const hasImage = messages.some((m: any) => Boolean(m.image));
    if (hasImage) {
      console.log('🤖 [SADIO VISION] Requête avec image détectée - activation des modèles Google Gemini Flash');
    }

    let streamedSuccessfully = false;
    let lastErrorMsg = '';

    // PREMIER CERVEAU : DeepSeek API (clé passée par le client ou configurée dans l'environnement Render/Cloud)
    const deepSeekApiKey =
      (req.headers['x-deepseek-key'] as string)?.trim() ||
      (req.body.deepseekApiKey as string)?.trim() ||
      process.env.DEEPSEEK_API_KEY?.trim() ||
      process.env.DEEPSEEK_KEY?.trim() ||
      process.env.DEEP_SEEK_API_KEY?.trim() ||
      process.env.DEEPSEEK_APIKEY?.trim() ||
      process.env.DEEPSEEK_TOKEN?.trim() ||
      '';

    if (deepSeekApiKey && !hasImage) {
      console.log('🤖 [SADIO BRAIN] Utilisation de DeepSeek (deepseek-chat) comme premier cerveau...');
      res.write(`data: ${JSON.stringify({ brain: 'deepseek', model: 'deepseek-chat' })}\n\n`);
      (res as any).flush?.();

      streamedSuccessfully = await streamFromOpenAICompatible({
        url: 'https://api.deepseek.com/chat/completions',
        apiKey: deepSeekApiKey,
        model: 'deepseek-chat',
        messages,
        systemInstruction,
        res,
        heartbeat,
      });

      if (!streamedSuccessfully) {
        console.warn('⚠️ [SADIO FAILOVER] DeepSeek a rencontré une anomalie ou est saturé. Bascule automatique immédiate sur Google Gemini...');
        res.write(`data: ${JSON.stringify({ brainFailover: true, target: 'gemini' })}\n\n`);
        (res as any).flush?.();
      }
    }

    // Modèles officiels supportés par @google/genai SDK (Gemini 3.8 Flash, Flash Latest, Flash Lite)
    const modelsToTry = hasImage
      ? ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite']
      : ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

    if (!streamedSuccessfully && ai && contents.length > 0) {
      console.log('🤖 [SADIO BRAIN] Prise en charge par Google Gemini (modèle prioritaire: ' + modelsToTry[0] + ')...');
      res.write(`data: ${JSON.stringify({ brain: 'gemini', model: modelsToTry[0] })}\n\n`);
      (res as any).flush?.();
      for (const modelName of modelsToTry) {
        if (res.destroyed || res.writableEnded) break;

        try {
          const config: Record<string, any> = {
            systemInstruction,
            maxOutputTokens: 4096,
          };

          // Timeout généreux de 25 secondes pour laisser le temps aux réponses détaillées et aux connexions mobiles
          const streamPromise = ai.models.generateContentStream({
            model: modelName,
            contents,
            config,
          });

          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout de connexion au modèle ${modelName} (>25s)`)), 25000)
          );

          const responseStream = await Promise.race([streamPromise, timeoutPromise]);

          let hasReceivedTokens = false;
          for await (const chunk of responseStream) {
            if (res.destroyed || res.writableEnded) break;
            if (chunk.text) {
              hasReceivedTokens = true;
              res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
              (res as any).flush?.();
            }
          }

          if (hasReceivedTokens) {
            if (!res.destroyed && !res.writableEnded) {
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
              clearInterval(heartbeat);
              res.end();
            }
            streamedSuccessfully = true;
            break;
          }
        } catch (err: any) {
          lastErrorMsg = err?.message || String(err);
          console.warn(`Gemini streaming attempt failed on model ${modelName}:`, lastErrorMsg);
        }
      }
    }

    // MULTI-PROVIDER RESILIENCE:
    // If Gemini models fail or are temporarily throttled, automatically attempt fast failover
    // to Groq (Llama 3.3 70B), OpenRouter (DeepSeek V3 / Llama), or DeepSeek API if configured.
    if (!streamedSuccessfully) {
      if (process.env.GROQ_API_KEY) {
        console.log('Gemini unavailable - attempting fast fallback to Groq (Llama 3.3 70B)...');
        streamedSuccessfully = await streamFromOpenAICompatible({
          url: 'https://api.groq.com/openai/v1/chat/completions',
          apiKey: process.env.GROQ_API_KEY,
          model: 'llama-3.3-70b-versatile',
          messages,
          systemInstruction,
          res,
          heartbeat,
        });
      } else if (process.env.OPENROUTER_API_KEY) {
        console.log('Gemini unavailable - attempting fallback to OpenRouter (DeepSeek V3)...');
        streamedSuccessfully = await streamFromOpenAICompatible({
          url: 'https://openrouter.ai/api/v1/chat/completions',
          apiKey: process.env.OPENROUTER_API_KEY,
          model: 'deepseek/deepseek-chat',
          messages,
          systemInstruction,
          res,
          heartbeat,
        });
      } else if (process.env.DEEPSEEK_API_KEY) {
        console.log('Gemini unavailable - attempting fallback to DeepSeek API...');
        streamedSuccessfully = await streamFromOpenAICompatible({
          url: 'https://api.deepseek.com/chat/completions',
          apiKey: process.env.DEEPSEEK_API_KEY,
          model: 'deepseek-chat',
          messages,
          systemInstruction,
          res,
          heartbeat,
        });
      }
    }

    if (streamedSuccessfully) return;

    // INTELLIGENT & TRANSPARENT DIAGNOSTIC FALLBACK STREAMING
    // If the API key is unconfigured, exhausted (429), or invalid (403), Sadio clearly states it
    // so the administrator immediately knows what to fix in Google Cloud / Render.
    const lastUserMsg = messages[messages.length - 1]?.content || 'Bonjour';
    const q = lastUserMsg.toLowerCase();

    let fallbackReply = '';

    if (!ai) {
      fallbackReply = `⚠️ **Configuration requise : Clé API Gemini manquante**\n\nLe serveur de Sadio n'a pas détecté de clé \`GEMINI_API_KEY\` dans ses variables d'environnement.\n\nPour connecter le cerveau d'intelligence artificielle :\n1. Rendez-vous sur votre tableau de bord d'hébergement (ex. Render.com -> *Environment*).\n2. Ajoutez la variable d'environnement \`GEMINI_API_KEY\` avec votre clé Google AI Studio.\n3. Redémarrez le service pour activer les réponses en temps réel.`;
    } else if (lastErrorMsg.includes('RESOURCE_EXHAUSTED') || lastErrorMsg.includes('429')) {
      fallbackReply = `⚠️ **Avis de Quota : Limite d'appels API atteinte (Erreur 429)**\n\nLe quota gratuit ou la limite de requêtes par minute de votre clé Gemini a été temporairement dépassé.\n\n- **Si vous êtes l'administrateur** : Activez la facturation Pay-as-you-go sur Google AI Studio / Google Cloud Console pour débloquer des quotas illimités et garantir une disponibilité permanente.\n- **Pour reprendre la discussion** : Patientez une minute, le temps que le quota de requêtes se réinitialise.`;
    } else if (lastErrorMsg.includes('API_KEY_INVALID') || lastErrorMsg.includes('PERMISSION_DENIED') || lastErrorMsg.includes('403')) {
      fallbackReply = `⚠️ **Avis d'Authentification : Clé Gemini non reconnue (Erreur 403)**\n\nLa clé API Gemini configurée est invalide ou restreinte dans Google Cloud Console.\n\n- Vérifiez que la clé n'a pas été supprimée ou régénérée dans Google AI Studio.\n- Assurez-vous qu'aucune restriction HTTP ou IP bloquante n'a été appliquée à la clé.`;
    } else {
      // General conversational fallback if temporarily unreachable
      if (q.includes('bonjour') || q.includes('salut') || q.includes('hello')) {
        fallbackReply = `Bonjour et bienvenue ! Je suis Sadio, votre avatar robot humanoïde cybernétique. C'est un réel plaisir de vous accueillir. Je me tiens debout devant vous, prêt à vous accompagner dans tous les domaines du savoir. Comment puis-je vous aider aujourd'hui ?`;
      } else if (q.includes('code') || q.includes('javascript') || q.includes('react') || q.includes('python')) {
        fallbackReply = `En tant que spécialiste des architectures logicielles, je vous accompagne dans votre développement :\n\n- Structurez votre code avec des composants modulaires et typés.\n- Isolez la logique métier dans des services dédiés pour faciliter la maintenance.\n\nPrécisez votre besoin, et je vous fournirai le code complet commenté.`;
      } else if (q.includes('facture') || q.includes('gemini') || q.includes('paiement') || q.includes('carte') || q.includes('djamo')) {
        fallbackReply = `Concernant la facturation de l'API Gemini et le déploiement de votre application :\n\n- **Facturation Google AI Studio / Google Cloud** : Pour passer en Pay-as-you-go, vous pouvez utiliser une carte bancaire internationale Visa/Mastercard (les cartes virtuelles prépayées comme Djamo, UBA, ou Revolut sont généralement acceptées pour les transactions en ligne).\n- **Gestion des coûts** : Définissez un plafond budgétaire (budget alert) dans Google Cloud pour maîtriser vos dépenses.\n\nN'hésitez pas à me poser d'autres questions sur la configuration.`;
      } else {
        fallbackReply = `C'est une excellente interrogation. En tant que Sadio, votre avatar robot cybernétique, je prends note de votre question concernant : « *${lastUserMsg}* ».\n\nMes relais de calcul ont rencontré une brève latence réseau. Je vous invite à renouveler votre question dans un instant, ou à vérifier la connexion si le problème persiste.`;
      }
    }

    // Stream fallback reply letter by letter / word by word for natural animation & speech
    const chunks = fallbackReply.match(/.{1,16}/g) || [fallbackReply];
    for (const chunk of chunks) {
      if (res.destroyed || res.writableEnded) break;
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      (res as any).flush?.();
      await new Promise((r) => setTimeout(r, 20));
    }

    if (!res.destroyed && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      clearInterval(heartbeat);
      res.end();
    }
  });

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
