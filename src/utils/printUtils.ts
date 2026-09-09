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
 * Utilitário de Impressão Direta na Mesma Janela com CSS @media print
 * 
 * Método Direto e Síncrono:
 * 1. Adiciona as classes CSS globais 'is-printing' e 'has-print-container' no body.
 * 2. Popula o contêiner visível '#app-print-container' exclusivamente com o documento selecionado.
 * 3. Dispara window.print() imediatamente e de forma síncrona dentro da chamada de clique.
 * 4. Utiliza as regras de CSS @media print em src/index.css para ocultar todos os menus,
 *    barras laterais, botões e cabeçalhos do app, mantendo visível apenas a área do documento.
 */

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
 * Dispara a impressão imediatamente de forma síncrona na mesma janela.
 * Preserva o evento de clique do usuário sem atrasos, sem requisições e sem abrir janelas pop-up.
 */
export function directPrint(options: PrintOptions = {}): void {
  const { elementId, htmlContent, pageImages } = options;

  const container = getOrCreatePrintContainer();
  let hasSpecificContent = false;

  // 1. Se imagens de páginas foram passadas (ex: PdfViewerModal com Canvas de alta resolução)
  if (pageImages && pageImages.length > 0) {
    container.innerHTML = pageImages
      .map(
        (imgSrc, index) =>
          `<div class="pdf-printable-page" style="page-break-after: ${
            index === pageImages.length - 1 ? 'avoid' : 'always'
          }; break-after: ${index === pageImages.length - 1 ? 'avoid' : 'page'}; width: 100%; margin: 0 0 10mm 0;">
            <img src="${imgSrc}" alt="Página ${index + 1}" style="width: 100%; height: auto; display: block; image-rendering: -webkit-optimize-contrast;" />
          </div>`
      )
      .join('');
    hasSpecificContent = true;
  }
  // 2. Se foi passado um ID de elemento do DOM (ex: 'timesheet-official-sheet', 'daily-attendance-sheet')
  else if (elementId) {
    const targetElement = document.getElementById(elementId);
    if (targetElement) {
      container.innerHTML = targetElement.outerHTML;
      hasSpecificContent = true;
      document.body.setAttribute('data-print-target', elementId);
    }
  }
  // 3. Se foi passado conteúdo HTML customizado
  else if (htmlContent) {
    container.innerHTML = htmlContent;
    hasSpecificContent = true;
  }

  // Adiciona as classes CSS globais no body e html de forma síncrona
  document.body.classList.add('is-printing');
  document.documentElement.classList.add('is-printing');
  if (hasSpecificContent) {
    document.body.classList.add('has-print-container');
  }

  // Prepara limpeza posterior através do evento nativo afterprint
  let cleaned = false;
  const doCleanup = () => {
    if (cleaned) return;
    cleaned = true;
    cleanupPrintState();
    window.removeEventListener('afterprint', doCleanup);
  };

  window.addEventListener('afterprint', doCleanup, { once: true });

  // Dispara window.print() IMEDIATAMENTE dentro da mesma chamada síncrona do clique do usuário!
  try {
    window.focus();
    window.print();
  } catch (err) {
    console.error('Erro ao invocar window.print():', err);
  } finally {
    // Garante restauração do estado após o fechamento da janela de impressão
    setTimeout(doCleanup, 600);
  }
}

/**
 * Atalho para impressão direta na mesma janela focando em um elemento ou na tela
 */
export function safeWindowPrint(elementId?: string | null, _title?: string): void {
  directPrint({ elementId });
}

/**
 * Orquestrador principal de impressão direta na mesma janela
 */
export function triggerPrint(options: PrintOptions = {}): void {
  directPrint(options);
}
