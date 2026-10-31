/**
 * Utilitaires pour le traitement, la validation et l'optimisation des images
 * avant l'envoi au moteur Gemini Vision.
 */

export interface ProcessedImage {
  dataUrl: string;
  mimeType: string;
  base64: string;
  name: string;
  size: number;
  width: number;
  height: number;
}

const MAX_DIMENSION = 1600; // Résolution optimale pour Gemini Vision (haute précision OCR et détails)
const TARGET_QUALITY = 0.88;

/**
 * Valide et compresse une image côté client pour une transmission instantanée et fluide.
 * Rejette strictement les fichiers non-images.
 */
export async function processImageFile(file: File): Promise<ProcessedImage> {
  if (!file) {
    throw new Error('Aucun fichier sélectionné.');
  }

  // Vérification stricte : uniquement des fichiers images
  if (!file.type.startsWith('image/')) {
    throw new Error('Seules les images (JPEG, PNG, WEBP, GIF, HEIC) sont acceptées pour l\'analyse visuelle.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('Erreur lors de la lecture du fichier image.'));
    };

    reader.onload = () => {
      const img = new Image();

      img.onerror = () => {
        reject(new Error('Impossible de décoder le format de cette image. Assurez-vous qu\'il s\'agit d\'un fichier image valide.'));
      };

      img.onload = () => {
        try {
          let { width, height } = img;

          // Redimensionnement proportionnel si les dimensions dépassent MAX_DIMENSION
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width > height) {
              height = Math.round((height * MAX_DIMENSION) / width);
              width = MAX_DIMENSION;
            } else {
              width = Math.round((width * MAX_DIMENSION) / height);
              height = MAX_DIMENSION;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            // Repli direct sur l'original si canvas indisponible
            const rawDataUrl = reader.result as string;
            const commaIndex = rawDataUrl.indexOf(',');
            const base64 = commaIndex !== -1 ? rawDataUrl.slice(commaIndex + 1) : rawDataUrl;
            resolve({
              dataUrl: rawDataUrl,
              mimeType: file.type || 'image/jpeg',
              base64,
              name: file.name,
              size: file.size,
              width: img.width,
              height: img.height,
            });
            return;
          }

          // Rendu haute qualité
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Conservation du PNG si transparence ou JPEG optimisé
          const isPng = file.type === 'image/png';
          const exportMime = isPng ? 'image/png' : 'image/jpeg';
          const dataUrl = canvas.toDataURL(exportMime, TARGET_QUALITY);
          const commaIndex = dataUrl.indexOf(',');
          const base64 = commaIndex !== -1 ? dataUrl.slice(commaIndex + 1) : dataUrl;

          // Calcul approximatif de la taille en octets
          const estimatedSize = Math.round((base64.length * 3) / 4);

          resolve({
            dataUrl,
            mimeType: exportMime,
            base64,
            name: file.name,
            size: estimatedSize,
            width,
            height,
          });
        } catch (err: any) {
          reject(new Error(`Échec du traitement de l'image : ${err?.message || err}`));
        }
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Formate lisiblement la taille d'un fichier (Ko, Mo)
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 Ko';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
