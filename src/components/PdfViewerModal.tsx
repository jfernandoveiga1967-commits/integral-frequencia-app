import React, { useState, useEffect, useMemo } from 'react';
import {
  Download,
  Printer,
  ExternalLink,
  FileText,
  Maximize2,
  Minimize2,
  Check,
  ArrowLeft,
  RefreshCw,
  Eye,
} from 'lucide-react';
import type { jsPDF } from 'jspdf';

export interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  doc?: jsPDF | null;
  pdfDataUrl?: string | null;
  dataUrl?: string | null;
  dataUri?: string | null;
  pdfBlobUrl?: string | null;
  blobUrl?: string | null;
  blob?: Blob | null;
  filename: string;
  title: string;
  onDownload?: () => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  isOpen,
  onClose,
  doc,
  pdfDataUrl,
  dataUrl,
  dataUri,
  pdfBlobUrl,
  blobUrl,
  blob,
  filename,
  title,
  onDownload,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);

  // Generate robust display URL whenever modal opens
  useEffect(() => {
    if (!isOpen) {
      if (activeUrl && activeUrl.startsWith('blob:')) {
        URL.revokeObjectURL(activeUrl);
      }
      setActiveUrl(null);
      return;
    }

    try {
      if (doc) {
        const b = doc.output('blob');
        const url = URL.createObjectURL(b);
        setActiveUrl(url);
        return () => {
          URL.revokeObjectURL(url);
        };
      }

      if (blob) {
        const url = URL.createObjectURL(blob);
        setActiveUrl(url);
        return () => {
          URL.revokeObjectURL(url);
        };
      }

      const rawSource = pdfDataUrl || dataUrl || dataUri || pdfBlobUrl || blobUrl;
      if (rawSource) {
        if (rawSource.startsWith('data:application/pdf;base64,')) {
          try {
            const base64Data = rawSource.split(',')[1];
            const binaryString = atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const b = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(b);
            setActiveUrl(url);
            return () => {
              URL.revokeObjectURL(url);
            };
          } catch (e) {
            console.warn('Failed converting base64 to blob, using raw URL:', e);
            setActiveUrl(rawSource);
          }
        } else {
          setActiveUrl(rawSource);
        }
      }
    } catch (err) {
      console.error('Error generating PDF preview URL:', err);
    }
  }, [isOpen, doc, blob, pdfDataUrl, dataUrl, dataUri, pdfBlobUrl, blobUrl]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    } else if (doc) {
      doc.save(filename || 'relatorio.pdf');
    } else if (activeUrl) {
      const link = document.createElement('a');
      link.href = activeUrl;
      link.download = filename || 'relatorio.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  const handlePrint = () => {
    if (doc) {
      doc.autoPrint();
      const printBlob = doc.output('blob');
      const printUrl = URL.createObjectURL(printBlob);
      const win = window.open(printUrl, '_blank');
      if (win) {
        win.focus();
        return;
      }
    }

    if (activeUrl) {
      const win = window.open(activeUrl, '_blank');
      if (win) {
        win.focus();
        win.print();
        return;
      }
    }

    window.print();
  };

  const handleOpenNewTab = () => {
    if (doc) {
      const b = doc.output('blob');
      const tempUrl = URL.createObjectURL(b);
      window.open(tempUrl, '_blank');
      return;
    }
    if (activeUrl) {
      window.open(activeUrl, '_blank');
    }
  };

  return (
    <div
      id="pdf-viewer-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="pdf-viewer-modal-container"
        className={`bg-slate-900 rounded-2xl shadow-2xl flex flex-col transition-all duration-300 border border-slate-700 overflow-hidden ${
          isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-6xl h-[92vh]'
        }`}
      >
        {/* Fixed Header Toolbar */}
        <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-slate-800 sticky top-0 z-20 shadow-md">
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

          {/* Action buttons bar */}
          <div className="flex items-center flex-wrap gap-2 shrink-0">
            {/* Download PDF Button */}
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

            {/* Print Button */}
            <button
              type="button"
              id="btn-pdf-modal-print"
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
              title="Imprimir documento oficial"
            >
              <Printer className="w-4 h-4 text-slate-300" />
              <span>Imprimir</span>
            </button>

            {/* Open in New Tab Button */}
            <button
              type="button"
              id="btn-pdf-modal-newtab"
              onClick={handleOpenNewTab}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer"
              title="Abrir em Nova Aba"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Nova Aba</span>
            </button>

            {/* Fullscreen Button */}
            <button
              type="button"
              id="btn-pdf-modal-fullscreen"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-xl text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition hidden sm:flex cursor-pointer"
              title={isFullscreen ? 'Restaurar' : 'Tela Cheia'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close / Return Button */}
            <button
              type="button"
              id="btn-pdf-modal-close"
              onClick={onClose}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-rose-600 border border-slate-700 transition cursor-pointer"
              title="Fechar visualização e voltar"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Fechar / Voltar</span>
            </button>
          </div>
        </div>

        {/* Sub-bar filename info */}
        <div className="bg-slate-950/60 px-4 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="truncate font-mono text-[11px]">
            Arquivo: <strong className="text-indigo-300">{filename}</strong>
          </span>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Visualizador de Documento Oficial • Colégio Crescer
          </span>
        </div>

        {/* PDF Frame Container */}
        <div
          id="pdf-frame-wrapper"
          className="flex-1 w-full h-full bg-slate-950/90 relative flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden"
        >
          {activeUrl ? (
            <object
              data={`${activeUrl}#toolbar=1&navpanes=0&view=FitH`}
              type="application/pdf"
              className="w-full h-full rounded-xl bg-white shadow-2xl border border-slate-700"
            >
              {/* Fallback iframe for browsers without native object plugin support */}
              <iframe
                src={`${activeUrl}#toolbar=1&navpanes=0&view=FitH`}
                className="w-full h-full rounded-xl bg-white shadow-2xl border border-slate-700"
                title={title || 'Visualização do PDF'}
              >
                <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-900 text-white rounded-xl">
                  <FileText className="w-16 h-16 text-indigo-400 mb-4" />
                  <h3 className="text-lg font-bold mb-2">Relatório PDF Gerado com Sucesso!</h3>
                  <p className="text-sm text-slate-400 mb-6 max-w-md">
                    Seu navegador não oferece suporte à visualização embutida direta. Você pode baixar o arquivo ou visualizá-lo em uma nova guia.
                  </p>
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center space-x-2 transition"
                    >
                      <Download className="w-4 h-4" />
                      <span>Baixar PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenNewTab}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold rounded-xl text-xs flex items-center space-x-2 transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Abrir em Nova Guia</span>
                    </button>
                  </div>
                </div>
              </iframe>
            </object>
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-400 mb-3" />
              <p className="text-sm font-semibold">Preparando documento...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const PDFPreviewModal = PdfViewerModal;
