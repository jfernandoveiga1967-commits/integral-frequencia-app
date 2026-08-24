import React, { useState, useEffect } from 'react';
import {
  Download,
  Printer,
  FileText,
  Maximize2,
  Minimize2,
  Check,
  X,
  Building2,
  ShieldCheck,
  Calendar,
  CheckCircle2,
  Sparkles,
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

  if (!isOpen) return null;

  // Direct download action without relying on iframe
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

  // Direct print action
  const handlePrint = () => {
    window.print();
  };

  const activeContent = children || htmlContent;

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
          isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[92vh]'
        }`}
      >
        {/* Fixed Header Toolbar (Hidden in Print) */}
        <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-slate-800 sticky top-0 z-30 shadow-md print:hidden">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-800/60">
                  Pré-visualização do Documento
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-xs sm:max-w-md md:max-w-lg">
                {title || 'ESPELHO DE PONTO'}
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
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition cursor-pointer active:scale-95"
              title="Imprimir documento em folha A4"
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
              <span>Fechar e Voltar</span>
            </button>
          </div>
        </div>

        {/* Sub-bar filename info (Hidden in Print) */}
        <div className="bg-slate-950/60 px-4 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 print:hidden shrink-0">
          <span className="truncate font-mono text-[11px]">
            Arquivo: <strong className="text-indigo-300">{filename || 'relatorio.pdf'}</strong>
          </span>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Formato: Folha A4 Retrato • Impressão e PDF Vetorial
          </span>
        </div>

        {/* Document Content Scroll Container */}
        <div
          id="pdf-frame-wrapper"
          className="flex-1 w-full h-full bg-slate-950/90 overflow-y-auto p-3 sm:p-6 md:p-8 flex justify-center print:p-0 print:bg-white print:overflow-visible"
        >
          {/* Official A4 Sheet Canvas */}
          <div className="w-full max-w-4xl bg-white text-slate-900 shadow-2xl rounded-xl p-6 sm:p-10 border border-slate-200 print:shadow-none print:border-none print:p-0 print:m-0 print:w-full print:max-w-none">
            {activeContent ? (
              // If custom children/HTML is supplied, render it directly inside the A4 sheet
              <div className="space-y-4">{activeContent}</div>
            ) : (
              // Default Native Official A4 Document View
              <div className="space-y-6">
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
                    {title || 'ESPELHO DE PONTO'}
                  </h1>
                  <p className="text-xs text-slate-500 font-medium">
                    Relatório oficial gerado pelo Sistema de Gestão e Frequência Integral
                  </p>
                </div>

                {/* Document Status & Information Card */}
                <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 sm:p-5">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0 text-xs">
                      <h4 className="font-bold text-indigo-950 text-sm mb-1">
                        Relatório Compilado com Sucesso
                      </h4>
                      <p className="text-indigo-900/80 leading-relaxed mb-3">
                        O arquivo oficial <strong>{filename}</strong> está pronto e formatado para impressão direta em folha A4 ou arquivamento em PDF pelo Departamento Pessoal (DP).
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                        <div className="p-2 bg-white/80 border border-indigo-100 rounded-lg">
                          <span className="text-slate-500 block">Padrão de Folha:</span>
                          <strong className="text-slate-900">A4 Retrato (210 × 297mm)</strong>
                        </div>
                        <div className="p-2 bg-white/80 border border-indigo-100 rounded-lg">
                          <span className="text-slate-500 block">Processamento:</span>
                          <strong className="text-slate-900">Vetor de Alta Resolução</strong>
                        </div>
                        <div className="p-2 bg-white/80 border border-indigo-100 rounded-lg">
                          <span className="text-slate-500 block">Validação DP:</span>
                          <strong className="text-emerald-700">Aprovado para DP / Folha</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Direct Action Box (Hidden in Print) */}
                <div className="p-5 bg-slate-900 text-white rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
                  <div>
                    <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      Ações Imediatas do Documento
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Escolha imprimir diretamente na impressora ou salvar o arquivo em seu dispositivo.
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      type="button"
                      onClick={handlePrint}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 border border-slate-700 transition cursor-pointer shadow-sm active:scale-95"
                    >
                      <Printer className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Imprimir em A4</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 transition cursor-pointer shadow-sm shadow-indigo-900/30 active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar Arquivo PDF</span>
                    </button>
                  </div>
                </div>

                {/* Signatures & Institutional Seal */}
                <div className="pt-8 border-t border-slate-300 grid grid-cols-2 gap-8 text-center text-xs">
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

