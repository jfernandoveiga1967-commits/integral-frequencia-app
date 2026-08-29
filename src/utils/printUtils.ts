import type { jsPDF } from 'jspdf';

export interface PrintOptions {
  doc?: jsPDF | null;
  blobUrl?: string | null;
  dataUrl?: string | null;
  elementId?: string | null;
  pageImages?: string[];
}

/**
 * Ensures global @media print styles exist in the document head
 * so that modal toolbars, headers, and backgrounds are cleanly hidden during printing,
 * while the document content / PDF pages fill the printed A4 sheet in high quality.
 */
function ensurePrintStyles(): void {
  const styleId = 'pdf-print-global-style';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.innerHTML = `
    @media print {
      @page {
        size: A4 portrait;
        margin: 8mm 8mm 8mm 8mm;
      }
      
      html, body {
        background: #ffffff !important;
        color: #000000 !important;
        height: auto !important;
        min-height: 100% !important;
        overflow: visible !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* Hide everything by default except the active modal and printable container */
      body * {
        visibility: hidden;
      }

      #pdf-viewer-modal-backdrop,
      #pdf-viewer-modal-backdrop *,
      #pdf-printable-area,
      #pdf-printable-area *,
      .pdf-printable-page,
      .pdf-printable-page * {
        visibility: visible;
      }

      /* Reset modal backdrop in print */
      #pdf-viewer-modal-backdrop {
        position: static !important;
        inset: auto !important;
        background: transparent !important;
        padding: 0 !important;
        margin: 0 !important;
        width: 100% !important;
        height: auto !important;
        overflow: visible !important;
        display: block !important;
      }

      #pdf-viewer-modal-container {
        position: static !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        width: 100% !important;
        max-width: none !important;
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      #pdf-frame-wrapper {
        background: transparent !important;
        padding: 0 !important;
        margin: 0 !important;
        height: auto !important;
        overflow: visible !important;
        display: block !important;
      }

      /* Hide modal UI elements */
      .print-hidden,
      [data-print-hidden="true"],
      header,
      nav,
      aside {
        display: none !important;
      }

      /* Ensure each page breaks neatly */
      .pdf-printable-page {
        page-break-after: always;
        break-after: page;
        margin: 0 0 10mm 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
        border: none !important;
        width: 100% !important;
        max-width: 100% !important;
        display: block !important;
      }

      .pdf-printable-page:last-child {
        page-break-after: avoid;
        break-after: avoid;
        margin-bottom: 0 !important;
      }

      .pdf-printable-page img {
        width: 100% !important;
        height: auto !important;
        max-width: 100% !important;
        display: block !important;
        image-rendering: -webkit-optimize-contrast;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Directs printing reliably to the computer's native printer dialog box.
 */
export function triggerPrint(options: PrintOptions = {}): void {
  const { doc, pageImages, elementId } = options;

  ensurePrintStyles();

  // If pageImages are available or element exists, print via safeWindowPrint
  safeWindowPrint(elementId || 'pdf-viewer-modal-container');
}

/**
 * Invokes window.print() safely by unlocking body styles so the browser print dialog
 * is never frozen by modal backdrops or overflow:hidden
 */
export function safeWindowPrint(elementId?: string | null): void {
  ensurePrintStyles();

  const originalOverflow = document.body.style.overflow;
  const originalHeight = document.body.style.height;
  const originalPosition = document.body.style.position;

  // Temporarily unlock body
  document.body.style.overflow = 'visible';
  document.body.style.height = 'auto';
  document.body.style.position = 'static';

  if (elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      el.focus();
    }
  }

  // Use requestAnimationFrame & timeout to give the browser layout engine time to recalculate styles
  requestAnimationFrame(() => {
    setTimeout(() => {
      try {
        window.focus();
        window.print();
      } catch (err) {
        console.error('Erro ao invocar window.print():', err);
      } finally {
        // Restore styles after print dialog has closed/handled
        setTimeout(() => {
          document.body.style.overflow = originalOverflow;
          document.body.style.height = originalHeight;
          document.body.style.position = originalPosition;
        }, 1200);
      }
    }, 150);
  });
}
