/**
 * Audio Podcast Exporter
 * Downloads clean, high-fidelity spoken WAV audio files with zero background noise or synth tones.
 */

export async function exportTextAsAudioPodcast(text: string, title = 'SADIO_Podcast'): Promise<void> {
  if (!text || typeof window === 'undefined') return;

  const cleanedText = text
    .replace(/```[\s\S]*?```/g, ' [Section de code omise] ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[#*`_~[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanedText) return;

  const safeFilename = title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'SADIO_Podcast';

  // 1. Trigger live browser SpeechSynthesis to read the document out loud with the browser voice
  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanedText);
      const voices = window.speechSynthesis.getVoices();
      const frenchVoice = voices.find((v) => {
        const l = (v.lang || '').toLowerCase();
        return l.startsWith('fr') || l.includes('french') || l.includes('français');
      });
      if (frenchVoice) {
        utterance.voice = frenchVoice;
        utterance.lang = frenchVoice.lang || 'fr-FR';
      } else {
        utterance.lang = 'fr-FR';
      }
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore
    }
  }

  // 2. Fetch spoken WAV audio file from server TTS service and download directly
  try {
    const resp = await fetch('/api/tts-podcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanedText, title: safeFilename }),
    });

    if (resp.ok) {
      const blob = await resp.blob();
      if (blob.size > 200) {
        const wavBlob = new Blob([blob], { type: 'audio/wav' });
        const downloadUrl = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${safeFilename}_podcast.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 8000);
        return;
      }
    }
  } catch (err) {
    console.warn('Server TTS podcast endpoint error:', err);
  }
}
