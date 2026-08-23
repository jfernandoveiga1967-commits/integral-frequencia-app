import { LOGO_BASE64 as EMBEDDED_LOGO_BASE64 } from './pdfLogoData';

let cachedLogoDataUrl: string = EMBEDDED_LOGO_BASE64;

/**
 * Preload the official logo from public/logo-crescer.png or public/logo-web.png
 * and convert it dynamically to a base64 DataURL via HTML5 Canvas.
 */
export async function loadLogoDataUrl(): Promise<string> {
  if (typeof window === 'undefined') {
    return cachedLogoDataUrl;
  }

  // If already cached and valid, return it
  if (cachedLogoDataUrl && cachedLogoDataUrl.startsWith('data:image/png;base64,')) {
    // We already have the high-resolution logo loaded
    return cachedLogoDataUrl;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 900;
        canvas.height = img.naturalHeight || img.height || 452;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          if (dataUrl && dataUrl.length > 100) {
            cachedLogoDataUrl = dataUrl;
            resolve(dataUrl);
            return;
          }
        }
      } catch (err) {
        console.warn('Canvas conversion failed, using embedded logo base64:', err);
      }
      resolve(EMBEDDED_LOGO_BASE64);
    };

    img.onerror = () => {
      // Try fallback to /logo-web.png
      const fallbackImg = new Image();
      fallbackImg.crossOrigin = 'anonymous';
      fallbackImg.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = fallbackImg.naturalWidth || fallbackImg.width || 900;
          canvas.height = fallbackImg.naturalHeight || fallbackImg.height || 452;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(fallbackImg, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            if (dataUrl && dataUrl.length > 100) {
              cachedLogoDataUrl = dataUrl;
              resolve(dataUrl);
              return;
            }
          }
        } catch {
          // fallback
        }
        resolve(EMBEDDED_LOGO_BASE64);
      };
      fallbackImg.onerror = () => {
        resolve(EMBEDDED_LOGO_BASE64);
      };
      fallbackImg.src = '/logo-web.png';
    };

    img.src = '/logo-crescer.png';
  });
}

// Kick off eager preloading in browser environment
if (typeof window !== 'undefined') {
  loadLogoDataUrl().catch(() => {});
}

/**
 * Returns the logo DataURL synchronously (cached or embedded fallback)
 */
export function getLogoDataUrl(): string {
  return cachedLogoDataUrl || EMBEDDED_LOGO_BASE64;
}

export const LOGO_BASE64 = EMBEDDED_LOGO_BASE64;
export const LOGO_WIDTH_MM = 35;
export const LOGO_HEIGHT_MM = 17.58; // 35 * (452 / 900) - exact aspect ratio of 1.991
