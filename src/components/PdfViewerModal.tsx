import React, { useState } from 'react';
import {
  Download,
  Printer,
  ExternalLink,
  FileText,
  Maximize2,
  Minimize2,
  Check,
  ArrowLeft,
} from 'lucide-react';

export interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfDataUrl?: string | null;
  dataUrl?: string | null;
  dataUri?: string | null;
  pdfBlobUrl?: string | null;
  blobUrl?: string | null;
  filename: string;
  title: string;
  onDownload?: () => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  isOpen,
  onClose,
  pdfDataUrl,
  dataUrl,
  dataUri,
  pdfBlobUrl,
  blobUrl,
  filename,
  title,
  onDownload,
}) => {
  const activePdfSource = pdfDataUrl || dataUrl || dataUri || pdfBlobUrl || blobUrl;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  if (!isOpen || !activePdfSource) return null;

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    } else {
      const link = document.createElement('a');
      link.href = activePdfSource;
      link.download = filename || 'documento.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  const handlePrint = () => {
    try {
      // Create hidden iframe for direct native browser print dialog
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = activePdfSource;
      document.body.appendChild(iframe);
      
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (err) {
          console.warn('Direct print failed, opening print window:', err);
          window.print();
        }
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 2000);
      };
    } catch (err) {
      console.warn('Print initiation error:', err);
      window.print();
    }
  };

  const handleOpenNewTab = () => {
    if (!activePdfSource) return;
    if (activePdfSource.startsWith('data:')) {
      try {
        const arr = activePdfSource.split(',');
        const mimeMatch = arr[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const tempUrl = URL.createObjectURL(blob);
        window.open(tempUrl, '_blank');
        return;
      } catch (e) {
        console.warn('Blob conversion failed:', e);
      }
    }
    window.open(activePdfSource, '_blank');
  };

  return (
    <div
      id="pdf-viewer-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="pdf-viewer-modal-container"
        className={`bg-white rounded-2xl shadow-2xl flex flex-col transition-all duration-300 border border-slate-200 overflow-hidden ${
          isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-6xl h-[90vh]'
        }`}
      >
        {/* Fixed Control Header Bar */}
        <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-slate-800 sticky top-0 z-10">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-800/60">
                  Pré-visualização do Relatório
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-xs sm:max-w-md md:max-w-lg">
                {title || 'Pré-visualização da Grade'}
              </h2>
            </div>
          </div>

          {/* Action buttons bar: [Baixar PDF], [Imprimir], [Fechar / Voltar] */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              id="btn-pdf-modal-download"
              onClick={handleDownload}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                downloaded
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-indigo-500/25'
              }`}
              title="Baixar arquivo PDF formatado"
            >
              {downloaded ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              <span>{downloaded ? 'Baixado!' : 'Baixar PDF'}</span>
            </button>

            <button
              type="button"
              id="btn-pdf-modal-print"
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
              title="Abrir caixa de diálogo de impressão nativa"
            >
              <Printer className="w-4 h-4 text-slate-300" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              id="btn-pdf-modal-newtab"
              onClick={handleOpenNewTab}
              className="p-1.5 rounded-xl text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer"
              title="Abrir em Nova Aba"
            >
              <ExternalLink className="w-4 h-4" />
            </button>

            <button
              type="button"
              id="btn-pdf-modal-fullscreen"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-xl text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition hidden sm:flex cursor-pointer"
              title={isFullscreen ? 'Restaurar' : 'Tela Cheia'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              id="btn-pdf-modal-close"
              onClick={onClose}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-rose-600 border border-slate-700 transition cursor-pointer"
              title="Fechar visualização e voltar para a Grade Semanal"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Fechar / Voltar</span>
            </button>
          </div>
        </div>

        {/* Sub-bar filename info */}
        <div className="bg-slate-100 px-4 py-1.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span className="truncate font-mono text-[11px] text-slate-600">
            Arquivo: <strong className="text-slate-800">{filename}</strong>
          </span>
          <span className="text-[11px] text-indigo-700 font-semibold hidden sm:inline">
            Confira a pré-visualização antes de baixar ou imprimir
          </span>
        </div>

        {/* PDF Object Viewer with Chrome security-safe Base64 Data URL */}
        <div className="flex-1 w-full h-full bg-slate-200 relative overflow-hidden flex flex-col items-center justify-center">
          <object
            id="pdf-preview-object"
            data={activePdfSource}
            type="application/pdf"
            width="100%"
            height="100%"
            className="w-full h-full border-0"
            title="Pré-visualização da Grade"
          >
            {/* Fallback iframe inside object to support maximum browser compatibility */}
            <iframe
              id="pdf-preview-iframe"
              src={activePdfSource}
              className="w-full h-full border-0"
              title="Pré-visualização da Grade"
            >
              <div className="flex flex-col items-center justify-center p-8 text-center h-full bg-white">
                <FileText className="w-16 h-16 text-indigo-500 mb-4" />
                <h3 className="text-lg font-bold text-slate-800 mb-2">
                  Pré-visualização do Documento PDF
                </h3>
                <p className="text-sm text-slate-600 mb-6 max-w-md">
                  Seu navegador não oferece suporte à visualização direta embutida deste arquivo PDF.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700 transition flex items-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Baixar Arquivo PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenNewTab}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-sm hover:bg-slate-200 border border-slate-300 transition flex items-center space-x-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Abrir em Nova Aba</span>
                  </button>
                </div>
              </div>
            </iframe>
          </object>
        </div>
      </div>
    </div>
  );
};

export const PDFPreviewModal = PdfViewerModal;
