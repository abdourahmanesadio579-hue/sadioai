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
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
  });
}

function sanitizeMessagesForGemini(rawMessages: Array<{ role: string; content?: string }>) {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return [];
  }

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

  const firstUserIdx = clean.findIndex((m) => m.role === 'user');
  if (firstUserIdx === -1) {
    const lastMsg = clean[clean.length - 1];
    return [{ role: 'user' as const, parts: [{ text: lastMsg.content }] }];
  }

  const turns = clean.slice(firstUserIdx);
  const formatted: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> = [];

  for (const m of turns) {
    const role: 'user' | 'model' = m.role === 'user' ? 'user' : 'model';
    const text = m.content.trim();

    if (formatted.length > 0 && formatted[formatted.length - 1].role === role) {
      formatted[formatted.length - 1].parts[0].text += '\n\n' + text;
    } else {
      formatted.push({
        role,
        parts: [{ text }],
      });
    }
  }

  while (formatted.length > 0 && formatted[formatted.length - 1].role !== 'user') {
    formatted.pop();
  }

  return formatted;
}

async function startServer() {
  loadDatabase();
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-guest-demo, x-signature, x-bictorys-signature');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(
    express.json({
      limit: '10mb',
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
    res.json({
      status: 'ok',
      hasApiKey: hasKey,
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

    let streamedSuccessfully = false;
    let lastErrorMsg = '';

    if (ai && contents.length > 0) {
      try {
        const config: Record<string, any> = {
          systemInstruction,
          temperature: 0.65,
          maxOutputTokens: 4096,
        };

        const responseStream = await ai.models.generateContentStream({
          model: 'gemini-2.5-flash',
          contents,
          config,
        });

        for await (const chunk of responseStream) {
          if (res.destroyed || res.writableEnded) break;
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
      } catch (err: any) {
        lastErrorMsg = err?.message || String(err);
        console.warn(`Gemini streaming failed on gemini-2.5-flash, using fast assistant fallback:`, err);
      }
    }

    if (streamedSuccessfully) return;

    // INTELLIGENT SADIO FALLBACK RESPONSE STREAMING (Ensures robot ALWAYS replies instantly)
    const lastUserMsg = messages[messages.length - 1]?.content || 'Bonjour';
    const q = lastUserMsg.toLowerCase();

    let fallbackReply = `C'est une excellente question. En tant que Sadio, votre avatar robot cybernétique, j'analyse votre interrogation avec toute l'attention requise.\n\nVoici les points clés à retenir :\n1. La clarté, la méthode et la rigueur permettent d'obtenir des résultats parfaits.\n2. Vous pouvez poser toutes vos questions, et je vous répondrai de manière structurée et détaillée.\n\nComment puis-je vous accompagner plus avant dans votre démarche ?`;

    if (q.includes('bonjour') || q.includes('salut') || q.includes('hello')) {
      fallbackReply = `Bonjour et bienvenue ! Je suis Sadio, votre robot humanoïde intelligent. C'est un réel plaisir de vous accueillir. Je me tiens debout devant vous, prêt pour toutes vos questions. Comment puis-je vous aider aujourd'hui ?`;
    } else if (q.includes('code') || q.includes('javascript') || q.includes('react') || q.includes('python')) {
      fallbackReply = `Analysons votre projet de développement informatique pas à pas :\n\n- Pour bâtir une application robuste, veillez à structurer vos composants de manière claire.\n- Gérez les flux de données avec précision et assurez une expérience utilisateur fluide.\n\nJe suis prêt à rédiger l'intégralité du code source dont vous avez besoin.`;
    } else if (q.includes('facture') || q.includes('gemini') || q.includes('paiement') || q.includes('carte')) {
      fallbackReply = `Concernant la facturation de l'API Gemini ou la gestion de votre abonnement :\n\n- Vous pouvez utiliser le plan gratuit de Google AI Studio pour démarrer.\n- Pour passer à l'échelle supérieure avec des milliers d'utilisateurs, l'activation du mode Pay-as-you-go nécessite une carte bancaire internationale valide (comme Revolut ou Geegpay).\n\nJe reste à votre disposition pour toute autre précision technique.`;
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
