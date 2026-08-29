import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure worker locally via Vite asset bundling - no external CDN or network dependency
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
} catch (e) {
  console.warn('Error setting pdfjs worker:', e);
}

export interface RenderedPdfPage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

export interface PdfRenderResult {
  numPages: number;
  pages: RenderedPdfPage[];
  error?: string;
}

/**
 * Converts ArrayBuffer, Uint8Array, Blob, Data URI, or URL to a list of rendered Canvas images.
 * Purely local processing inside the browser memory.
 */
export async function renderPdfToImages(
  source: ArrayBuffer | Uint8Array | Blob | string,
  scale: number = 2.0
): Promise<PdfRenderResult> {
  try {
    let uint8Data: Uint8Array | null = null;

    if (source instanceof Uint8Array) {
      uint8Data = source;
    } else if (source instanceof ArrayBuffer) {
      uint8Data = new Uint8Array(source);
    } else if (source instanceof Blob) {
      const buffer = await source.arrayBuffer();
      uint8Data = new Uint8Array(buffer);
    } else if (typeof source === 'string') {
      if (source.startsWith('data:')) {
        const base64Index = source.indexOf(';base64,');
        if (base64Index !== -1) {
          const base64 = source.substring(base64Index + 8);
          const binaryString = atob(base64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          uint8Data = bytes;
        }
      } else if (source.startsWith('blob:')) {
        const response = await fetch(source);
        const buffer = await response.arrayBuffer();
        uint8Data = new Uint8Array(buffer);
      }
    }

    const docParams = uint8Data
      ? { data: uint8Data, isEvalSupported: false }
      : { url: source as string, isEvalSupported: false };

    const loadingTask = pdfjsLib.getDocument(docParams);
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const pages: RenderedPdfPage[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) continue;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Fill white background before render
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await (page.render(renderContext as any) as any).promise;

      pages.push({
        pageNumber: pageNum,
        dataUrl: canvas.toDataURL('image/png', 0.95),
        width: viewport.width,
        height: viewport.height,
      });
    }

    return { numPages, pages };
  } catch (err: any) {
    console.error('Failed to render PDF to images with pdfjs:', err);
    return {
      numPages: 0,
      pages: [],
      error: err?.message || 'Falha ao renderizar PDF',
    };
  }
}
