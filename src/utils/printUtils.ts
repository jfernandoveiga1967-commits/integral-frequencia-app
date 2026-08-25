import type { jsPDF } from 'jspdf';

export interface PrintOptions {
  doc?: jsPDF | null;
  blobUrl?: string | null;
  dataUrl?: string | null;
  elementId?: string | null;
}

/**
 * Directs printing directly to the computer's native printer dialog box.
 * Handles:
 * 1. Generated jsPDF instances via dedicated hidden iframe with PDF object
 * 2. Unlocks scroll / overflow styles temporarily so native window.print() doesn't freeze
 * 3. Fallback support across all desktop/mobile browsers and iframe sandboxes
 */
export function triggerPrint(options: PrintOptions = {}): void {
  const { doc, blobUrl, dataUrl, elementId } = options;

  // 1. If we have a jsPDF document or a PDF blob/data URL, printing the PDF blob via an iframe
  // sends the exact vector PDF directly to the native printer box!
  let effectiveBlobUrl = blobUrl;
  if (!effectiveBlobUrl && doc) {
    try {
      const blob = doc.output('blob');
      effectiveBlobUrl = URL.createObjectURL(blob);
    } catch (e) {
      console.warn('Could not generate blob for printing:', e);
    }
  }

  if (effectiveBlobUrl || dataUrl) {
    const url = effectiveBlobUrl || dataUrl!;
    try {
      // Remove any existing print iframes
      const existing = document.getElementById('native-print-frame');
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'native-print-frame';
      iframe.setAttribute(
        'style',
        'position:fixed;top:0;left:0;width:1px;height:1px;border:none;opacity:0;pointer-events:none;z-index:-999;'
      );
      iframe.src = url;

      document.body.appendChild(iframe);

      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            console.warn('Iframe print restricted, triggering window.print fallback:', err);
            safeWindowPrint(elementId);
          }
        }, 200);
      };

      // Auto-cleanup iframe after printing
      setTimeout(() => {
        try {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        } catch {}
      }, 60000);

      return;
    } catch (err) {
      console.error('Error in PDF print handler:', err);
    }
  }

  // 2. Standard HTML Print with body overflow unlock to avoid freezing
  safeWindowPrint(elementId);
}

/**
 * Invokes window.print() safely by unlocking body styles so the browser print dialog
 * is never frozen by modal backdrops or overflow:hidden
 */
export function safeWindowPrint(elementId?: string | null): void {
  const originalOverflow = document.body.style.overflow;
  const originalHeight = document.body.style.height;

  // Temporarily unlock
  document.body.style.overflow = 'visible';
  document.body.style.height = 'auto';

  // If specific elementId requested, we can focus it
  if (elementId) {
    const el = document.getElementById(elementId);
    el?.focus();
  }

  requestAnimationFrame(() => {
    setTimeout(() => {
      try {
        window.focus();
        window.print();
      } catch (err) {
        console.error('Error invoking window.print():', err);
      } finally {
        // Restore styles after print dialog is handled
        setTimeout(() => {
          document.body.style.overflow = originalOverflow;
          document.body.style.height = originalHeight;
        }, 1000);
      }
    }, 100);
  });
}
