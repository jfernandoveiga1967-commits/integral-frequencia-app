import type { jsPDF } from 'jspdf';

export interface PrintOptions {
  doc?: jsPDF | null;
  blobUrl?: string | null;
  dataUrl?: string | null;
  elementId?: string | null;
  pageImages?: string[];
  htmlContent?: string;
  title?: string;
}

/**
 * Imprime um conteúdo HTML completo utilizando um <iframe> oculto no próprio DOM.
 * Essa estratégia NÃO abre novas janelas ou abas, evitando 100% dos bloqueadores de pop-up
 * dos navegadores modernos e em ambientes encapsulados como iframes/WebViews.
 * 
 * Aguarda o disparo automático do evento onload e a carga completa de imagens/logotipos
 * antes de invocar o comando print().
 */
export function printHtmlViaHiddenIframe(htmlContent: string, title: string = 'Relatório'): Promise<void> {
  return new Promise((resolve) => {
    // Remove qualquer iframe de impressão residual anterior
    const existingIframe = document.getElementById('app-print-hidden-iframe');
    if (existingIframe) {
      existingIframe.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'app-print-hidden-iframe';
    iframe.title = title;
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) {
      safeWindowPrint();
      resolve();
      return;
    }

    let isPrinted = false;
    const executePrint = () => {
      if (isPrinted) return;
      isPrinted = true;

      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Falha na impressão via iframe, usando fallback direto de janela:', err);
        safeWindowPrint();
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            iframe.remove();
          }
          resolve();
        }, 1500);
      }
    };

    // Escreve o documento HTML completo
    doc.open();
    doc.write(htmlContent);
    doc.close();

    // Aguarda o carregamento de imagens (como logotipo do Colégio)
    const images = Array.from(doc.images || []);
    if (images.length === 0) {
      setTimeout(executePrint, 250);
    } else {
      let loadedCount = 0;
      const totalImages = images.length;

      const checkImagesDone = () => {
        loadedCount++;
        if (loadedCount >= totalImages) {
          setTimeout(executePrint, 200);
        }
      };

      images.forEach((img) => {
        if (img.complete) {
          checkImagesDone();
        } else {
          img.onload = checkImagesDone;
          img.onerror = checkImagesDone;
        }
      });

      // Timeout de segurança caso alguma imagem externa demore
      setTimeout(executePrint, 2000);
    }
  });
}

/**
 * Imprime um arquivo PDF gerado (Blob URL) utilizando um <iframe> oculto no próprio DOM.
 * Não aciona pop-ups externos e aguarda o evento onload para o disparo.
 */
export function printBlobViaHiddenIframe(blobUrl: string): Promise<void> {
  return new Promise((resolve) => {
    const existingIframe = document.getElementById('app-print-hidden-iframe');
    if (existingIframe) {
      existingIframe.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'app-print-hidden-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.src = blobUrl;

    document.body.appendChild(iframe);

    let isPrinted = false;
    const executePrint = () => {
      if (isPrinted) return;
      isPrinted = true;

      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Falha na impressão do blob via iframe, acionando fallback:', err);
        safeWindowPrint();
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            iframe.remove();
          }
          resolve();
        }, 1500);
      }
    };

    iframe.onload = () => {
      setTimeout(executePrint, 350);
    };

    // Timeout de segurança
    setTimeout(executePrint, 2500);
  });
}

/**
 * Dispara o diálogo nativo de impressão (window.print()) diretamente na tela atual,
 * desbloqueando overflows para evitar cortes de página e ativando os estilos @media print.
 * Não utiliza window.open() e portanto é 100% imune a bloqueadores de pop-up.
 */
export function safeWindowPrint(elementId?: string | null): void {
  const originalOverflow = document.body.style.overflow;
  const originalHeight = document.body.style.height;
  const originalPosition = document.body.style.position;

  // Desbloqueia temporariamente o body para cálculo de altura do layout de impressão
  document.body.style.overflow = 'visible';
  document.body.style.height = 'auto';
  document.body.style.position = 'static';

  if (elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      el.focus();
    }
  }

  requestAnimationFrame(() => {
    setTimeout(() => {
      try {
        window.focus();
        window.print();
      } catch (err) {
        console.error('Erro ao invocar window.print():', err);
      } finally {
        setTimeout(() => {
          document.body.style.overflow = originalOverflow;
          document.body.style.height = originalHeight;
          document.body.style.position = originalPosition;
        }, 1000);
      }
    }, 150);
  });
}

/**
 * Orquestrador inteligente de impressão que roteia a ação para a melhor estratégia:
 * 1. Se fornecido Blob URL de PDF -> imprime via iframe oculto com onload.
 * 2. Se fornecido documento jsPDF -> extrai blob e imprime via iframe oculto com onload.
 * 3. Se fornecido htmlContent -> injeta no iframe oculto, aguarda imagens e dispara print.
 * 4. Caso contrário -> executa safeWindowPrint() direto na janela com estilos @media print ativos.
 */
export function triggerPrint(options: PrintOptions = {}): void {
  const { doc, blobUrl, htmlContent, title, elementId } = options;

  if (blobUrl) {
    printBlobViaHiddenIframe(blobUrl).catch(() => {
      safeWindowPrint(elementId);
    });
    return;
  }

  if (doc) {
    try {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      printBlobViaHiddenIframe(url).finally(() => {
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      });
      return;
    } catch (e) {
      console.warn('Falha ao converter jsPDF para blob de impressão, fallback para window.print:', e);
    }
  }

  if (htmlContent) {
    printHtmlViaHiddenIframe(htmlContent, title).catch(() => {
      safeWindowPrint(elementId);
    });
    return;
  }

  safeWindowPrint(elementId);
}
