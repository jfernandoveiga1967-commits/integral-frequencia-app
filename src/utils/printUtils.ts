import type { jsPDF } from 'jspdf';

export interface PrintOptions {
  elementId?: string | null;
  htmlContent?: string;
  pageImages?: string[];
  title?: string;
  doc?: jsPDF | null;
  blobUrl?: string | null;
  dataUrl?: string | null;
}

/**
 * Detecta se a aplicação está sendo executada dentro de uma moldura iFrame
 * (ex: preview do Google AI Studio ou contêiner embutido).
 */
export function isRunningInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Obtém ou cria o contêiner dedicado para impressão direta no body da página
 */
function getOrCreatePrintContainer(): HTMLElement {
  let container = document.getElementById('app-print-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'app-print-container';
    container.className = 'print-container print-only';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Limpa o estado global de impressão do documento
 */
export function cleanupPrintState(): void {
  document.body.classList.remove('is-printing', 'has-print-container');
  document.documentElement.classList.remove('is-printing');
  document.body.removeAttribute('data-print-target');

  const container = document.getElementById('app-print-container');
  if (container) {
    container.innerHTML = '';
  }
}

/**
 * Abre uma nova janela/aba top-level dedicada para impressão.
 * Essencial quando o app está dentro de um iFrame (onde window.print()
 * é bloqueado pelo navegador por ausência da flag 'allow-modals').
 */
export function printViaNewWindow(contentHtml: string, title: string = 'Impressão — Colégio Crescer'): boolean {
  try {
    const printWin = window.open('', '_blank', 'width=950,height=950');
    if (!printWin || printWin.closed) {
      return false;
    }

    // Coleta todas as folhas de estilo e estilos inline da página atual
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('\n');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${styles}
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 10mm 12mm 10mm;
    }
    html, body {
      background: #ffffff !important;
      color: #0f172a !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      margin: 0 !important;
      padding: 0 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .print\\:hidden, .no-print, .print-hidden, [data-print="hidden"] {
      display: none !important;
    }
    .print-only {
      display: block !important;
      visibility: visible !important;
    }
    .page-container {
      width: 100%;
      max-width: 210mm;
      margin: 0 auto;
      padding: 10px;
      box-sizing: border-box;
    }
    @media print {
      .page-container {
        padding: 0;
        max-width: 100%;
      }
      .no-print-in-new-win {
        display: none !important;
      }
    }
    .top-print-bar {
      position: sticky;
      top: 0;
      background: #0f172a;
      color: white;
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      z-index: 10000;
      font-family: system-ui, sans-serif;
      margin-bottom: 15px;
      border-bottom: 1px solid #334155;
    }
    .btn-action {
      background: #4f46e5;
      color: white;
      border: none;
      padding: 9px 18px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .btn-action:hover {
      background: #4338ca;
    }
    .btn-close {
      background: #ef4444;
      color: white;
      border: none;
      padding: 9px 16px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      margin-left: 8px;
      transition: background 0.2s;
    }
    .btn-close:hover {
      background: #dc2626;
    }
  </style>
</head>
<body>
  <div class="top-print-bar no-print-in-new-win">
    <div>
      <div style="font-weight: 800; font-size: 14px; letter-spacing: -0.01em;">Colégio Crescer • Impressão Oficial</div>
      <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">A janela das impressoras do computador abrirá automaticamente.</div>
    </div>
    <div>
      <button class="btn-action" onclick="window.print()">
        <span>🖨️ Abrir Impressoras (Ctrl+P)</span>
      </button>
      <button class="btn-close" onclick="window.close()">Fechar Janela</button>
    </div>
  </div>
  <div class="page-container">
    ${contentHtml}
  </div>
  <script>
    window.focus();
    // Dispara a janela nativa de impressoras após montagem do DOM
    window.addEventListener('load', function() {
      setTimeout(function() {
        try {
          window.print();
        } catch (e) {
          console.error('Erro no print da janela:', e);
        }
      }, 250);
    });
    // Fallback de disparo caso o load já tenha sido executado
    setTimeout(function() {
      try {
        window.print();
      } catch (e) {}
    }, 500);
  <\/script>
</body>
</html>`;

    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    return true;
  } catch (err) {
    console.warn('Falha ao abrir nova janela de impressão:', err);
    return false;
  }
}

/**
 * Exibe assistente modal em tela caso o navegador bloqueie o pop-up e o print nativo no iFrame
 */
export function showPrintModalHelper(options: {
  title?: string;
  blobUrl?: string | null;
  doc?: jsPDF | null;
}): void {
  const existing = document.getElementById('print-blocked-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'print-blocked-modal';
  modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn font-sans';
  modal.innerHTML = `
    <div class="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scaleIn">
      <div class="px-6 py-5 bg-gradient-to-r from-indigo-700 to-slate-900 text-white flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="p-2.5 bg-white/20 rounded-xl">
            <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </div>
          <div>
            <h3 class="text-base font-black text-white">Assistente de Impressão</h3>
            <p class="text-xs text-indigo-200">Colégio Crescer • Diagnóstico de Dispositivo</p>
          </div>
        </div>
        <button id="close-print-modal-btn" class="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="p-6 space-y-4 text-slate-700 text-sm">
        <div class="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start space-x-3 text-amber-950 text-xs leading-relaxed">
          <div class="font-bold text-amber-600 text-lg shrink-0">⚠️</div>
          <div>
            <strong class="font-bold text-amber-900">Diagnóstico Preciso do Navegador:</strong>
            <p class="mt-1 text-amber-800/90">
              A aplicação está sendo executada dentro de uma moldura de visualização (<strong>iFrame</strong>). As políticas de segurança padrão do Chrome/Edge bloqueiam diálogos modais de sistema (<code class="bg-amber-100 px-1 py-0.5 rounded font-mono">window.print()</code>) executados de dentro de iFrames sem a permissão explícita <em>allow-modals</em>.
            </p>
          </div>
        </div>

        <p class="font-medium text-slate-800 text-xs">
          Para abrir a janela das impressoras do computador com 100% de sucesso, escolha uma das opções:
        </p>

        <div class="flex flex-col gap-2.5 pt-1">
          <a
            href="${window.location.href}"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-center space-x-2 w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-sm transition text-xs cursor-pointer text-center no-underline"
          >
            <span>🌐 1. Abrir Sistema em Nova Aba (Impressoras 100% Liberadas)</span>
          </a>

          ${
            options.blobUrl
              ? `<a
                  href="${options.blobUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center justify-center space-x-2 w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-sm transition text-xs cursor-pointer text-center no-underline"
                >
                  <span>📄 2. Abrir PDF Formatado para Impressão Direta (Ctrl+P)</span>
                </a>`
              : ''
          }
        </div>
      </div>
      <div class="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
        <button id="dismiss-print-modal-btn" class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer">
          Fechar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => {
    modal.remove();
  };

  modal.querySelector('#close-print-modal-btn')?.addEventListener('click', closeModal);
  modal.querySelector('#dismiss-print-modal-btn')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

/**
 * Dispara a impressão com dupla estratégia:
 * 1. Se em janela normal: ativa CSS @media print e dispara window.print() síncrono.
 * 2. Se em iFrame: abre uma nova aba top-level com o conteúdo e dispara o diálogo de impressoras do sistema.
 * 3. Se pop-up for bloqueado: exibe assistente em tela com links diretos.
 */
export function directPrint(options: PrintOptions = {}): void {
  const { elementId, htmlContent, pageImages, title, blobUrl, doc } = options;
  const inIframe = isRunningInIframe();

  const container = getOrCreatePrintContainer();
  let printableHtml = '';

  // 1. Imagens de páginas de alta resolução (ex: PdfViewerModal)
  if (pageImages && pageImages.length > 0) {
    printableHtml = pageImages
      .map(
        (imgSrc, index) =>
          `<div class="pdf-printable-page" style="page-break-after: ${
            index === pageImages.length - 1 ? 'avoid' : 'always'
          }; break-after: ${index === pageImages.length - 1 ? 'avoid' : 'page'}; width: 100%; margin: 0 0 10mm 0;">
            <img src="${imgSrc}" alt="Página ${index + 1}" style="width: 100%; height: auto; display: block; image-rendering: -webkit-optimize-contrast;" />
          </div>`
      )
      .join('');
  }
  // 2. Elemento do DOM por ID
  else if (elementId) {
    const targetElement = document.getElementById(elementId);
    if (targetElement) {
      printableHtml = targetElement.outerHTML;
      document.body.setAttribute('data-print-target', elementId);
    }
  }
  // 3. Conteúdo HTML customizado
  else if (htmlContent) {
    printableHtml = htmlContent;
  }

  // Se nenhum elemento específico foi encontrado, usa o contêiner principal da página
  if (!printableHtml) {
    const rootEl = document.getElementById('root');
    printableHtml = rootEl ? rootEl.outerHTML : document.body.innerHTML;
  }

  // Preenche o contêiner local para caso window.print() na mesma janela seja executado
  container.innerHTML = printableHtml;
  document.body.classList.add('is-printing', 'has-print-container');
  document.documentElement.classList.add('is-printing');

  // Limpeza posterior
  let cleaned = false;
  const doCleanup = () => {
    if (cleaned) return;
    cleaned = true;
    cleanupPrintState();
    window.removeEventListener('afterprint', doCleanup);
  };
  window.addEventListener('afterprint', doCleanup, { once: true });

  // Se estiver em um iFrame (onde window.print() na mesma janela é bloqueado pelo sandbox),
  // abrimos uma nova janela top-level onde window.print() abre a impressora do computador imediatamente.
  if (inIframe) {
    const opened = printViaNewWindow(printableHtml, title || 'Impressão — Colégio Crescer');
    if (!opened) {
      // Se o navegador bloqueou o pop-up, exibe o assistente em tela com a solução imediata
      showPrintModalHelper({ title, blobUrl, doc });
    }
  }

  // Dispara também window.print() na janela atual (caso não esteja em iFrame ou o container permita modals)
  try {
    window.focus();
    window.print();
  } catch (err) {
    console.warn('window.print() na mesma janela não disparou (comum em iFrames):', err);
  } finally {
    setTimeout(doCleanup, 600);
  }
}

/**
 * Atalho para impressão direta na mesma janela focando em um elemento ou na tela
 */
export function safeWindowPrint(elementId?: string | null, title?: string): void {
  directPrint({ elementId, title });
}

/**
 * Orquestrador principal de impressão
 */
export function triggerPrint(options: PrintOptions = {}): void {
  directPrint(options);
}
