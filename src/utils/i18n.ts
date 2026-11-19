import { safeStorage } from './storage';

export type Language = 'fr' | 'en';

export const LANGUAGE_STORAGE_KEY = 'sadio_language_pref_v1';

export function getStoredLanguage(): Language {
  try {
    const saved = safeStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'fr' || saved === 'en') {
      return saved;
    }
  } catch {
    // fallback
  }
  return 'fr';
}

export function saveStoredLanguage(lang: Language): void {
  safeStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}

export const TRANSLATIONS = {
  fr: {
    code: 'fr',
    speechRecognitionLang: 'fr-FR',
    speechSynthesisLang: 'fr-FR',
    header: {
      tagline: 'Avatar Robot Cognitif • Réponses Universelles & Détaillées',
      trial3d: 'Essai gratuit 3j',
      trial3dShort: 'Essai 3j',
      trialRemaining: 'Essai :',
      active30d: '30j actif',
      activeShort: 'Actif',
      pay700: 'Payer 700 FCFA',
      pay700Short: '700 F',
      newChat: 'Nouvelle conversation',
      settings: 'Paramètres',
      userStatus: 'Statut :',
      trialActive: 'Essai gratuit 3 jours',
      subscriptionActive: 'Abonnement actif',
      expired: 'Expiré',
      trialEnds: 'Fin essai :',
      subscribeCfa: 'Abonnement 700 FCFA',
      logout: 'Se déconnecter',
      switchToEn: 'Passer en anglais',
      switchToFr: 'Passer en français',
    },
    greeting: {
      spoken:
        "Bonjour ! Je suis SADIO, votre avatar robot intelligent. Comment puis-je vous aider aujourd'hui ?",
      content: `👋 **Bonjour et bienvenue ! C'est un réel et sincère plaisir de vous accueillir.**

Je suis **SADIO**, votre avatar robot intelligent. Je me tiens debout au centre de votre écran, entièrement dédié à vous accompagner et à répondre à toutes vos interrogations avec précision, rigueur et exhaustivité.

Posez votre question ci-dessous ou cliquez sur le micro pour me parler directement !`,
    },
    input: {
      placeholderNormal: 'Posez votre question à SADIO (vocal ou texte)...',
      placeholderImage: "Question sur l'image ou [Entrée] pour analyse complète...",
      send: 'Envoyer la question',
      stop: 'Arrêter la réponse et la lecture',
      startMic: 'Parler au robot (Microphone)',
      stopMic: 'Arrêter la dictée vocale',
      imageReady: 'Image prête • Vision Haute Précision',
      removeImage: 'Retirer cette image',
    },
    response: {
      listening: 'En écoute...',
      thinking: 'SADIO réfléchit et prépare votre réponse...',
      listen: 'Écouter',
      pause: 'Pause',
      resume: 'Reprendre',
      copy: 'Copier',
      copied: 'Copié !',
      karaoke: 'Karaoké',
      podcast: 'Podcast MP3',
      exportingPodcast: 'Création podcast...',
      dismiss: 'Fermer',
      subtitles: 'Sous-titres en direct',
      openSubtitlesModal: 'Ouvrir en plein écran',
    },
    settings: {
      title: 'Paramètres de SADIO',
      languageSection: 'Langue de discussion & interface',
      languageDesc: 'Choisissez la langue pour les menus, les réponses de l’IA et la voix',
      frenchLabel: 'Français (FR)',
      englishLabel: 'English (EN)',
      themeSection: 'Châssis & Thème Lumineux du Robot',
      voiceSection: 'Voix & Synthèse Vocale',
      voiceSpeed: 'Vitesse de lecture vocale',
      speechRateNormal: 'Normale (1.0x)',
      clearChat: 'Effacer l’historique de discussion',
      clearConfirm: 'Confirmer la réinitialisation ?',
      yesClear: 'Oui, effacer',
      cancel: 'Annuler',
    },
    aiDirective:
      '[DIRECTIVE STRICTE DE LANGUE : FRANÇAIS] Tu dois obligatoirement répondre en français avec clarté, rigueur, exhaustivité et précision.',
  },
  en: {
    code: 'en',
    speechRecognitionLang: 'en-US',
    speechSynthesisLang: 'en-US',
    header: {
      tagline: 'Cognitive Robot Avatar • Universal & Comprehensive Answers',
      trial3d: '3-day free trial',
      trial3dShort: '3d Trial',
      trialRemaining: 'Trial:',
      active30d: '30d active',
      activeShort: 'Active',
      pay700: 'Pay 700 FCFA',
      pay700Short: '700 F',
      newChat: 'New conversation',
      settings: 'Settings',
      userStatus: 'Status:',
      trialActive: '3-day free trial',
      subscriptionActive: 'Active subscription',
      expired: 'Expired',
      trialEnds: 'Trial ends:',
      subscribeCfa: 'Subscription 700 FCFA',
      logout: 'Sign out',
      switchToEn: 'Switch to English',
      switchToFr: 'Switch to French',
    },
    greeting: {
      spoken:
        'Hello! I am SADIO, your intelligent robot avatar. How can I assist you today?',
      content: `👋 **Hello and welcome! It is a sincere pleasure to assist you.**

I am **SADIO**, your intelligent cognitive robot avatar. Standing at the center of your screen, I am fully dedicated to guiding you and answering all your questions with precision, depth, and clarity.

Ask your question below or click the microphone to speak with me directly!`,
    },
    input: {
      placeholderNormal: 'Ask SADIO a question (voice or text)...',
      placeholderImage: 'Question about the image or [Enter] for complete analysis...',
      send: 'Send question',
      stop: 'Stop answer & voice',
      startMic: 'Speak to robot (Microphone)',
      stopMic: 'Stop voice dictation',
      imageReady: 'Image ready • High Precision Vision',
      removeImage: 'Remove this image',
    },
    response: {
      listening: 'Listening...',
      thinking: 'SADIO is thinking and preparing your response...',
      listen: 'Listen',
      pause: 'Pause',
      resume: 'Resume',
      copy: 'Copy',
      copied: 'Copied!',
      karaoke: 'Karaoke',
      podcast: 'MP3 Podcast',
      exportingPodcast: 'Generating podcast...',
      dismiss: 'Dismiss',
      subtitles: 'Live subtitles',
      openSubtitlesModal: 'Open full screen',
    },
    settings: {
      title: 'SADIO Settings',
      languageSection: 'Discussion & Interface Language',
      languageDesc: 'Select language for menus, AI answers and voice articulation',
      frenchLabel: 'Français (FR)',
      englishLabel: 'English (EN)',
      themeSection: 'Robot Chassis & Glow Theme',
      voiceSection: 'Voice & Speech Synthesis',
      voiceSpeed: 'Speech Reading Speed',
      speechRateNormal: 'Normal (1.0x)',
      clearChat: 'Clear conversation history',
      clearConfirm: 'Confirm conversation reset?',
      yesClear: 'Yes, clear',
      cancel: 'Cancel',
    },
    aiDirective:
      '[STRICT LANGUAGE DIRECTIVE: ENGLISH] You MUST strictly reply in English. All explanations, reasoning, calculations, examples, and answers must be in fluent English.',
  },
} as const;
