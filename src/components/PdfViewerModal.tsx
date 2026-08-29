import React, { useState, useEffect } from 'react';
import {
  Download,
  Printer,
  FileText,
  Maximize2,
  Minimize2,
  Check,
  X,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import type { jsPDF } from 'jspdf';
import { triggerPrint } from '../utils/printUtils';
import { renderPdfToImages, RenderedPdfPage } from '../utils/pdfRenderUtils';

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
  children?: React.ReactNode;
  htmlContent?: React.ReactNode;
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
  children,
  htmlContent,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [renderedPages, setRenderedPages] = useState<RenderedPdfPage[]>([]);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const activeContent = children || htmlContent;

  // Lock background scroll when modal is open and handle ESC key
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  // Load and render PDF pages via PDF.js when modal opens or document changes
  useEffect(() => {
    if (!isOpen || activeContent) {
      setRenderedPages([]);
      setIsLoadingPdf(false);
      setRenderError(null);
      return;
    }

    let isMounted = true;

    async function loadPages() {
      setIsLoadingPdf(true);
      setRenderError(null);

      try {
        let source: ArrayBuffer | Uint8Array | Blob | string | null = null;

        if (doc) {
          source = doc.output('arraybuffer');
        } else if (blob) {
          source = blob;
        } else if (blobUrl || pdfBlobUrl) {
          source = blobUrl || pdfBlobUrl!;
        } else if (dataUrl || dataUri || pdfDataUrl) {
          source = dataUrl || dataUri || pdfDataUrl!;
        }

        if (!source) {
          if (isMounted) {
            setIsLoadingPdf(false);
          }
          return;
        }

        const result = await renderPdfToImages(source, 2.0); // 2.0x scale for crisp high-DPI rendering

        if (isMounted) {
          if (result.pages.length > 0) {
            setRenderedPages(result.pages);
            setRenderError(null);
          } else if (result.error) {
            setRenderError(result.error);
          }
          setIsLoadingPdf(false);
        }
      } catch (err: any) {
        console.error('Erro ao renderizar pré-visualização do PDF:', err);
        if (isMounted) {
          setRenderError(err?.message || 'Não foi possível carregar as páginas do PDF');
          setIsLoadingPdf(false);
        }
      }
    }

    loadPages();

    return () => {
      isMounted = false;
    };
  }, [isOpen, doc, blob, blobUrl, pdfBlobUrl, dataUrl, dataUri, pdfDataUrl, activeContent]);

  if (!isOpen) return null;

  // Direct download action
  const handleDownload = () => {
    try {
      if (onDownload) {
        onDownload();
      } else if (doc) {
        doc.save(filename || 'relatorio.pdf');
      } else {
        const sourceUrl = blobUrl || pdfBlobUrl || dataUrl || dataUri || pdfDataUrl;
        if (sourceUrl) {
          const link = document.createElement('a');
          link.href = sourceUrl;
          link.download = filename || 'relatorio.pdf';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename || 'relatorio.pdf';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        }
      }
    } catch (err) {
      console.error('Erro ao baixar documento PDF:', err);
    }
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3500);
  };

  // Direct print action to native printer dialog
  const handlePrint = () => {
    triggerPrint({
      doc,
      blobUrl: blobUrl || pdfBlobUrl,
      dataUrl: dataUrl || dataUri || pdfDataUrl,
      elementId: 'pdf-printable-area',
      pageImages: renderedPages.map((p) => p.dataUrl),
    });
  };

  return (
    <div
      id="pdf-viewer-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto animate-fadeIn print:p-0 print:bg-white print:static print:inset-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="pdf-viewer-modal-container"
        className={`bg-slate-900 rounded-2xl shadow-2xl flex flex-col transition-all duration-300 border border-slate-700 overflow-hidden print:border-none print:shadow-none print:rounded-none print:w-full print:max-w-none print:bg-transparent ${
          isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[94vh]'
        }`}
      >
        {/* Fixed Header Toolbar (Hidden in Print) */}
        <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-slate-800 sticky top-0 z-30 shadow-md print-hidden">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-800/60">
                  Pré-visualização Oficial
                </span>
                {renderedPages.length > 0 && (
                  <span className="text-[10px] font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                    {renderedPages.length} {renderedPages.length === 1 ? 'página' : 'páginas'}
                  </span>
                )}
              </div>
              <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-xs sm:max-w-md md:max-w-lg">
                {title || 'RELATÓRIO EM PDF'}
              </h2>
            </div>
          </div>

          {/* Action buttons bar */}
          <div className="flex items-center flex-wrap gap-2 shrink-0">
            {/* Zoom Controls */}
            {renderedPages.length > 0 && (
              <div className="hidden sm:flex items-center bg-slate-800/90 rounded-xl border border-slate-700 p-0.5 space-x-0.5 text-xs text-slate-300">
                <button
                  type="button"
                  onClick={() => setZoomLevel((prev) => Math.max(50, prev - 15))}
                  className="p-1.5 hover:text-white hover:bg-slate-700 rounded-lg cursor-pointer transition"
                  title="Diminuir Zoom"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-mono text-[11px] font-bold text-slate-200">
                  {zoomLevel}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomLevel((prev) => Math.min(180, prev + 15))}
                  className="p-1.5 hover:text-white hover:bg-slate-700 rounded-lg cursor-pointer transition"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel(100)}
                  className="p-1.5 hover:text-white hover:bg-slate-700 rounded-lg cursor-pointer transition"
                  title="Restaurar Zoom (100%)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Download PDF Button */}
            <button
              type="button"
              id="btn-pdf-modal-download"
              onClick={handleDownload}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                downloaded
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-indigo-500/25 active:scale-95'
              }`}
              title="Baixar arquivo PDF formatado oficial"
            >
              {downloaded ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
              <span>{downloaded ? 'Baixado' : 'Baixar PDF'}</span>
            </button>

            {/* Print Button */}
            <button
              type="button"
              id="btn-pdf-modal-print"
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition cursor-pointer active:scale-95 hover:border-slate-500"
              title="Abrir tela de impressão no computador (Folha A4)"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              <span>Imprimir</span>
            </button>

            {/* Fullscreen Button */}
            <button
              type="button"
              id="btn-pdf-modal-fullscreen"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-xl text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition hidden sm:flex cursor-pointer"
              title={isFullscreen ? 'Restaurar Tamanho' : 'Expandir Tela Cheia'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            {/* Close / Return Button */}
            <button
              type="button"
              id="btn-pdf-modal-close"
              onClick={onClose}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 border border-rose-500 shadow-sm transition cursor-pointer active:scale-95"
              title="Fechar visualização e voltar ao painel"
            >
              <X className="w-3.5 h-3.5" />
              <span>Fechar</span>
            </button>
          </div>
        </div>

        {/* Sub-bar filename info (Hidden in Print) */}
        <div className="bg-slate-950/70 px-4 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 print-hidden shrink-0">
          <span className="truncate font-mono text-[11px]">
            Arquivo: <strong className="text-indigo-300">{filename || 'relatorio.pdf'}</strong>
          </span>
          <div className="flex items-center space-x-3 text-[11px] text-slate-400">
            <span className="hidden sm:inline">
              Formato: Folha A4 • Impressão e PDF Vetorial Autenticado
            </span>
          </div>
        </div>

        {/* Document Content Scroll Container */}
        <div
          id="pdf-frame-wrapper"
          className="flex-1 w-full h-full bg-slate-950/90 overflow-y-auto p-2 sm:p-4 md:p-6 flex flex-col items-center print:p-0 print:bg-white print:overflow-visible"
        >
          {/* Printable Area Wrapper */}
          <div
            id="pdf-printable-area"
            className="w-full flex flex-col items-center space-y-6 print:space-y-0 print:w-full print:m-0"
            style={{
              maxWidth: activeContent ? '100%' : `${Math.min(100, Math.max(60, zoomLevel))}%`,
              transition: 'max-width 0.2s ease-in-out',
            }}
          >
            {activeContent ? (
              // If custom children/HTML is supplied, render it directly inside the A4 sheet
              <div className="w-full max-w-5xl bg-white text-slate-900 shadow-2xl rounded-xl border border-slate-200 overflow-hidden p-6 sm:p-8 space-y-4 print:shadow-none print:border-none print:p-0 print:m-0 print:w-full print:max-w-none pdf-printable-page">
                {activeContent}
              </div>
            ) : isLoadingPdf ? (
              // Loading Spinner State
              <div className="w-full max-w-3xl h-[65vh] bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col items-center justify-center space-y-4 p-8 text-center animate-pulse">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Loader2 className="w-7 h-7 animate-spin" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Renderizando páginas do documento...
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Processando relatório com alta fidelidade visual para exibição e impressão
                  </p>
                </div>
              </div>
            ) : renderedPages.length > 0 ? (
              // Render High-DPI Native Canvas Pages
              renderedPages.map((page) => (
                <div
                  key={page.pageNumber}
                  className="pdf-printable-page w-full max-w-4xl bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200 transition-shadow hover:shadow-indigo-500/10 relative print:shadow-none print:border-none print:rounded-none"
                >
                  <img
                    src={page.dataUrl}
                    alt={`Página ${page.pageNumber} de ${renderedPages.length}`}
                    className="w-full h-auto block select-none"
                    loading="eager"
                  />
                  {renderedPages.length > 1 && (
                    <div className="bg-slate-100 text-slate-600 text-[10px] font-bold px-3 py-1 text-right border-t border-slate-200 print-hidden">
                      Página {page.pageNumber} de {renderedPages.length}
                    </div>
                  )}
                </div>
              ))
            ) : renderError ? (
              // In-Modal Embedded PDF Fallback
              <div className="w-full h-[78vh] bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-700 flex flex-col pdf-printable-page">
                <iframe
                  src={blobUrl || pdfBlobUrl || dataUrl || dataUri || pdfDataUrl || ''}
                  className="w-full h-full border-0"
                  title={filename || 'Relatório PDF'}
                />
              </div>
            ) : (
              // Default Native Official A4 Document View
              <div className="w-full max-w-5xl bg-white text-slate-900 shadow-2xl rounded-xl border border-slate-200 overflow-hidden p-6 sm:p-10 space-y-6 print:shadow-none print:border-none print:p-0 print:m-0 print:w-full print:max-w-none pdf-printable-page">
                {/* Official Institutional Header */}
                <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center space-x-3 text-left">
                    <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
                      IC
                    </div>
                    <div>
                      <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-900">
                        INSTITUTO EDUCACIONAL CRESCER • COLÉGIO CRESCER
                      </h2>
                      <p className="text-xs text-slate-600 font-semibold">
                        Programa de Atividades Complementares e Educação Integral (GADAL)
                      </p>
                    </div>
                  </div>

                  <div className="text-right sm:text-right shrink-0">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                      Documento Oficial Autenticado
                    </span>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Emissão: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                {/* Document Main Title */}
                <div className="text-center py-2 bg-slate-50 border border-slate-200 rounded-xl">
                  <h1 className="text-base sm:text-lg font-black uppercase tracking-wider text-slate-900">
                    {title || 'RELATÓRIO OFICIAL'}
                  </h1>
                  <p className="text-xs text-slate-500 font-medium">
                    Relatório oficial gerado pelo Sistema de Gestão e Frequência Integral
                  </p>
                </div>

                {/* Signatures & Institutional Seal */}
                <div className="pt-16 border-t border-slate-300 grid grid-cols-2 gap-8 text-center text-xs">
                  <div>
                    <div className="border-b border-slate-900 pb-1 w-full"></div>
                    <span className="text-[11px] font-bold text-slate-800 block mt-1.5 uppercase">
                      Departamento Pessoal • GADAL
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Instituto Educacional Crescer
                    </span>
                  </div>

                  <div>
                    <div className="border-b border-slate-900 pb-1 w-full"></div>
                    <span className="text-[11px] font-bold text-slate-800 block mt-1.5 uppercase">
                      Coordenação Pedagógica do Integral
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Colégio Crescer
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const PDFPreviewModal = PdfViewerModal;
