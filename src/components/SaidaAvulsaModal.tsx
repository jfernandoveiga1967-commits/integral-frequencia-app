import React, { useState, useEffect } from 'react';
import {
  Car,
  FileText,
  X,
  Check,
  User,
  CreditCard,
  Heart,
  HelpCircle,
  Calendar,
  Clock,
  Printer,
  ShieldCheck,
  AlertCircle,
  FileCheck,
} from 'lucide-react';
import { Student, UserProfile } from '../types';
import { generateTermoSaidaAvulsaPDF, TermoSaidaAvulsaData } from '../utils/pdfGenerator';
import { PdfViewerModal } from './PdfViewerModal';
import { formatDateBR } from '../utils/dateUtils';

export interface SaidaAvulsaModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  currentUser?: UserProfile | null;
  onGenerated?: (result: any) => void;
}

export const SaidaAvulsaModal: React.FC<SaidaAvulsaModalProps> = ({
  isOpen,
  onClose,
  student,
  currentUser,
  onGenerated,
}) => {
  const getTodayISO = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getCurrentTimeHHMM = () => {
    const d = new Date();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const [nomeRetirante, setNomeRetirante] = useState<string>('');
  const [documentoRetirante, setDocumentoRetirante] = useState<string>('');
  const [parentesco, setParentesco] = useState<string>('Pai / Mãe');
  const [parentescoCustom, setParentescoCustom] = useState<string>('');
  const [motivoSaida, setMotivoSaida] = useState<string>('Liberação Antecipada');
  const [motivoCustom, setMotivoCustom] = useState<string>('');
  const [dataSaida, setDataSaida] = useState<string>(getTodayISO);
  const [horarioSaida, setHorarioSaida] = useState<string>(getCurrentTimeHHMM);
  const [observacoes, setObservacoes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Estado para visualização interna do PDF gerado
  const [pdfPreviewState, setPdfPreviewState] = useState<{
    isOpen: boolean;
    doc?: any;
    dataUrl: string | null;
    blobUrl: string | null;
    filename: string;
    title: string;
    onDownload?: () => void;
  }>({
    isOpen: false,
    doc: null,
    dataUrl: null,
    blobUrl: null,
    filename: '',
    title: '',
  });

  // Atualiza data e hora sempre que o modal abre
  useEffect(() => {
    if (isOpen) {
      setDataSaida(getTodayISO());
      setHorarioSaida(getCurrentTimeHHMM());
      setFormError(null);
      // Sugestão de retirante baseado na logística se já houver condutor
      if (student?.tipoSaida === 'TRANSPORTE_ESCOLAR' && student.nomeCondutor) {
        setNomeRetirante(student.nomeCondutor);
        setParentesco('Transporte Escolar Credenciado');
      } else {
        setNomeRetirante('');
        setParentesco('Pai / Mãe');
      }
      setDocumentoRetirante('');
      setMotivoSaida('Liberação Antecipada');
      setObservacoes('');
    }
  }, [isOpen, student]);

  if (!isOpen || !student) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanNome = nomeRetirante.trim();
    const cleanDoc = documentoRetirante.trim();

    if (!cleanNome) {
      setFormError('Por favor, informe o nome completo de quem está retirando o aluno.');
      return;
    }

    if (!cleanDoc) {
      setFormError('Por favor, informe o documento (RG ou CPF) da pessoa que está retirando.');
      return;
    }

    const finalParentesco = parentesco === 'Outro' ? parentescoCustom.trim() || 'Outro Autorizado' : parentesco;
    const finalMotivo = motivoSaida === 'Outros' ? motivoCustom.trim() || 'Outro Motivo' : motivoSaida;

    const dataPayload: TermoSaidaAvulsaData = {
      student,
      nomeRetirante: cleanNome,
      documentoRetirante: cleanDoc,
      parentesco: finalParentesco,
      motivoSaida: finalMotivo,
      dataSaida: dataSaida || getTodayISO(),
      horarioSaida: horarioSaida || getCurrentTimeHHMM(),
      observacoes: observacoes.trim(),
      responsavelLiberacao: currentUser?.name
        ? `${currentUser.name} (${currentUser.cargoLabel || 'Coordenação'})`
        : 'Coordenação Geral do Programa Integral',
    };

    try {
      const result = generateTermoSaidaAvulsaPDF(dataPayload, false);

      if (onGenerated) {
        onGenerated(result);
        onClose();
      } else {
        // Abre o visualizador interno diretamente
        setPdfPreviewState({
          isOpen: true,
          doc: result.doc,
          dataUrl: result.dataUrl || result.dataUri,
          blobUrl: result.blobUrl,
          filename: result.filename,
          title: `Termo de Saída Avulsa — ${student.name}`,
          onDownload: result.download,
        });
      }
    } catch (err) {
      console.error('Erro ao gerar termo de saída avulsa em PDF:', err);
      setFormError('Ocorreu um erro ao gerar o documento PDF. Tente novamente.');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5 bg-white shrink-0">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-amber-50 text-amber-700 rounded-2xl border border-amber-200">
                <Car className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                  Termo de Liberação Excepcional
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Ficha de Saída de Balcão & Portaria • Emissão de PDF Oficial
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
            {/* Card de Identificação do Aluno */}
            <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-black uppercase text-indigo-700 tracking-wider block">
                  Estudante
                </span>
                <span className="text-sm font-black text-slate-900 block">
                  {student.name}
                </span>
                <span className="text-xs text-indigo-900 font-semibold">
                  Turma: {student.turma} {student.anoLetivo ? `• Ano ${student.anoLetivo}` : ''}
                </span>
              </div>
              <div className="text-right text-[11px] font-semibold text-slate-600">
                <span className="block text-slate-500 text-[10px]">Logística Padrão:</span>
                <span className="font-bold text-slate-800">
                  {student.tipoSaida === 'TRANSPORTE_ESCOLAR'
                    ? `🚌 Van: ${student.nomeCondutor || 'Credenciada'}`
                    : '🚗 Pais / Responsáveis'}
                </span>
              </div>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Nome do Retirante */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center space-x-1.5">
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span>Nome de Quem Está Retirando o Aluno:</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={nomeRetirante}
                onChange={(e) => setNomeRetirante(e.target.value)}
                placeholder="Ex: Carlos Alberto da Silva"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>

            {/* Documento e Parentesco */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center space-x-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                  <span>Documento (RG ou CPF):</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={documentoRetirante}
                  onChange={(e) => setDocumentoRetirante(e.target.value)}
                  placeholder="Ex: 12.345.678-9 ou CPF"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center space-x-1.5">
                  <Heart className="w-3.5 h-3.5 text-slate-500" />
                  <span>Parentesco / Vínculo:</span>
                  <span className="text-rose-500">*</span>
                </label>
                <select
                  value={parentesco}
                  onChange={(e) => setParentesco(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                >
                  <option value="Pai / Mãe">Pai / Mãe</option>
                  <option value="Avô / Avó">Avô / Avó</option>
                  <option value="Tio / Tia">Tio / Tia</option>
                  <option value="Irmão / Irmã">Irmão / Irmã (Maior de Idade)</option>
                  <option value="Padrinho / Madrinha">Padrinho / Madrinha</option>
                  <option value="Transporte Escolar Credenciado">Transporte Escolar Credenciado</option>
                  <option value="Pessoa Autorizada pelos Pais">Pessoa Autorizada pelos Pais</option>
                  <option value="Outro">Outro Vínculo...</option>
                </select>
                {parentesco === 'Outro' && (
                  <input
                    type="text"
                    value={parentescoCustom}
                    onChange={(e) => setParentescoCustom(e.target.value)}
                    placeholder="Especifique o parentesco/vínculo..."
                    className="w-full p-2 mt-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                )}
              </div>
            </div>

            {/* Motivo da Saída */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center space-x-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                <span>Motivo Declarado da Saída:</span>
                <span className="text-rose-500">*</span>
              </label>
              <select
                value={motivoSaida}
                onChange={(e) => setMotivoSaida(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              >
                <option value="Liberação Antecipada">Liberação Antecipada</option>
                <option value="Consulta Médica / Odontológica">Consulta Médica / Odontológica</option>
                <option value="Motivo Familiar">Motivo Familiar / Viagem</option>
                <option value="Mal-estar / Febre / Saúde">Mal-estar / Febre / Saúde</option>
                <option value="Compromisso Externo">Compromisso Externo</option>
                <option value="Retirada por Terceiro Autorizado">Retirada por Terceiro Autorizado</option>
                <option value="Outros">Outros...</option>
              </select>
              {motivoSaida === 'Outros' && (
                <input
                  type="text"
                  value={motivoCustom}
                  onChange={(e) => setMotivoCustom(e.target.value)}
                  placeholder="Especifique o motivo detalhado..."
                  className="w-full p-2 mt-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
                />
              )}
            </div>

            {/* Data e Horário da Saída */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center space-x-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Data da Saída:</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={dataSaida}
                  onChange={(e) => setDataSaida(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Horário Efetivo:</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={horarioSaida}
                  onChange={(e) => setHorarioSaida(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Observações Opcionais */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Observações de Portaria / Justificativa Complementar:
              </label>
              <textarea
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex: Autorizado previamente pelos pais via WhatsApp / agenda escolar..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Nota de Segurança Legal */}
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-relaxed flex items-start space-x-2">
              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                Este termo gera um documento oficial contendo dados do aluno, retirante e campos para assinatura física ou conferência da coordenação, assegurando a guarda e rastreabilidade da liberação.
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 p-4 bg-white flex items-center justify-end space-x-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-xs font-black text-white bg-amber-600 hover:bg-amber-700 shadow-md hover:shadow-lg transition-all rounded-xl cursor-pointer flex items-center space-x-2"
            >
              <Printer className="w-4 h-4 text-amber-200" />
              <span>📄 Imprimir Termo de Saída (PDF)</span>
            </button>
          </div>
        </form>
      </div>

      {/* Visualizador de PDF Embutido para Impressão Rápida */}
      {pdfPreviewState.isOpen && (
        <PdfViewerModal
          isOpen={pdfPreviewState.isOpen}
          onClose={() => {
            setPdfPreviewState((prev) => ({ ...prev, isOpen: false }));
            onClose();
          }}
          doc={pdfPreviewState.doc}
          dataUrl={pdfPreviewState.dataUrl}
          blobUrl={pdfPreviewState.blobUrl}
          filename={pdfPreviewState.filename}
          title={pdfPreviewState.title}
          onDownload={pdfPreviewState.onDownload}
        />
      )}
    </>
  );
};
