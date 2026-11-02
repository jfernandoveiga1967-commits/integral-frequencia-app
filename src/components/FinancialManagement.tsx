import React, { useState, useEffect, useMemo } from 'react';
import {
  Student,
  UserProfile,
  TurmaType,
  StudentFinancialProfile,
  FinancialMetricSummary,
  FinancialPlanHour,
  FinancialPaymentStatus,
} from '../types';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  FileText,
  Edit3,
  Check,
  X,
  RotateCcw,
  Calendar,
  Layers,
  Sparkles,
  ShieldCheck,
  ChevronDown,
  Info,
  Loader2,
  Wallet,
  Building,
  Receipt,
  UserCheck,
} from 'lucide-react';
import { formatCurrencyBR } from '../utils/pontoUtils';
import {
  BASE_PLAN_PRICES,
  buildDefaultFinancialProfile,
  calculateFinancialMetrics,
  calculateModalidadesExtrasTotal,
  calculateValorTotalMensal,
  loadFinancialProfilesFromFirestore,
  saveFinancialProfileToFirestore,
  subscribeFinancialProfiles,
} from '../services/financialService';
import { generateFinancialReportPDF } from '../utils/pdfGenerator';
import { PdfViewerModal } from './PdfViewerModal';
import { sortTurmasPedagogical } from '../utils/turmaUtils';
import { TURMAS_LIST } from '../data/initialData';

interface FinancialManagementProps {
  students: Student[];
  currentUser?: UserProfile | null;
  turmas?: string[];
}

export const FinancialManagement: React.FC<FinancialManagementProps> = ({
  students = [],
  currentUser = null,
  turmas = TURMAS_LIST,
}) => {
  // Filtro de Exercício / Ano Letivo (2026 | 2027)
  const [selectedAnoLetivo, setSelectedAnoLetivo] = useState<number>(2026);

  // Perfis financeiros carregados do Firestore / Cache
  const [financialProfiles, setFinancialProfiles] = useState<StudentFinancialProfile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filtros de Busca
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedTurma, setSelectedTurma] = useState<string>('TODAS');
  const [selectedStatus, setSelectedStatus] = useState<string>('TODOS');

  // Modais de Edição e Baixa
  const [editingProfile, setEditingProfile] = useState<StudentFinancialProfile | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  const [payingProfile, setPayingProfile] = useState<StudentFinancialProfile | null>(null);
  const [paymentStatusOption, setPaymentStatusOption] = useState<FinancialPaymentStatus>('EM_DIA');
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Boleto');
  const [isSavingPayment, setIsSavingPayment] = useState<boolean>(false);

  // Estado do Visualizador de PDF
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

  // Notificações Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // 1. Escuta em tempo real do Firestore por Ano Letivo
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeFinancialProfiles(selectedAnoLetivo, (remoteProfiles) => {
      setFinancialProfiles(remoteProfiles);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [selectedAnoLetivo]);

  // 2. Consolidação: Garante que todos os alunos cadastrados no ano letivo possuam um perfil financeiro
  const resolvedProfiles = useMemo<StudentFinancialProfile[]>(() => {
    // Filtra alunos que pertencem ao ano letivo selecionado (ou assume 2026 se indefinido)
    const yearStudents = students.filter((s) => (s.anoLetivo || 2026) === selectedAnoLetivo);

    // Mapeia perfis existentes
    const profileMap = new Map<string, StudentFinancialProfile>();
    financialProfiles.forEach((p) => {
      if (p.studentId) {
        profileMap.set(p.studentId, p);
      }
    });

    // Para cada aluno cadastrado, se não tiver perfil no Firestore, gera o padrão calculado
    const list: StudentFinancialProfile[] = [];
    yearStudents.forEach((student) => {
      const existing = profileMap.get(student.id);
      if (existing) {
        list.push({
          ...existing,
          studentName: student.name,
          turma: student.turma,
        });
      } else {
        const defaultProfile = buildDefaultFinancialProfile(student, selectedAnoLetivo);
        list.push(defaultProfile);
      }
    });

    // Ordenação alfabética pelo nome do aluno
    return list.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || '', 'pt-BR'));
  }, [students, financialProfiles, selectedAnoLetivo]);

  // 3. Métricas Gerais Calculadas para o Dashboard
  const metrics = useMemo<FinancialMetricSummary>(() => {
    return calculateFinancialMetrics(resolvedProfiles);
  }, [resolvedProfiles]);

  // 4. Lista Filtrada por Busca, Turma e Status
  const filteredProfiles = useMemo<StudentFinancialProfile[]>(() => {
    return resolvedProfiles.filter((p) => {
      // Filtro de Busca
      if (searchTerm.trim().length > 0) {
        const term = searchTerm.toLowerCase();
        const matchesName = (p.studentName || '').toLowerCase().includes(term);
        const matchesTurma = (p.turma || '').toLowerCase().includes(term);
        if (!matchesName && !matchesTurma) return false;
      }

      // Filtro por Turma
      if (selectedTurma !== 'TODAS' && p.turma !== selectedTurma) {
        return false;
      }

      // Filtro por Status
      if (selectedStatus !== 'TODOS' && p.statusPagamento !== selectedStatus) {
        return false;
      }

      return true;
    });
  }, [resolvedProfiles, searchTerm, selectedTurma, selectedStatus]);

  // Turmas ordenadas para os seletores
  const availableTurmas = useMemo(() => {
    const list = turmas && turmas.length > 0 ? turmas : TURMAS_LIST;
    return sortTurmasPedagogical(list);
  }, [turmas]);

  // Abertura do Modal de Edição de Contrato
  const handleOpenEdit = (profile: StudentFinancialProfile) => {
    setEditingProfile({ ...profile });
  };

  // Salvar Edição de Contrato
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;

    setIsSavingEdit(true);
    try {
      // Recalcula o valor total mensal
      const total = calculateValorTotalMensal(
        editingProfile.valorMensalidadeBase,
        editingProfile.valorModalidadesExtras,
        editingProfile.descontoPercentual
      );

      const updated: StudentFinancialProfile = {
        ...editingProfile,
        valorTotalMensal: total,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Coordenação',
      };

      await saveFinancialProfileToFirestore(updated);

      // Atualiza estado local imediatamente
      setFinancialProfiles((prev) => {
        const idx = prev.findIndex((p) => p.studentId === updated.studentId && p.anoLetivo === updated.anoLetivo);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [...prev, updated];
      });

      showToast(`Contrato de ${updated.studentName} atualizado com sucesso!`, 'success');
      setEditingProfile(null);
    } catch (err) {
      console.error('Erro ao salvar contrato:', err);
      showToast('Falha ao salvar contrato no servidor.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Abertura do Modal de Baixa de Pagamento
  const handleOpenPayment = (profile: StudentFinancialProfile) => {
    setPayingProfile(profile);
    setPaymentStatusOption(profile.statusPagamento === 'EM_DIA' ? 'EM_DIA' : 'EM_DIA');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentNotes(profile.observacoes || '');
    setPaymentMethod(profile.formaPagamentoPadrao || 'Boleto');
  };

  // Confirmar Baixa / Registro de Pagamento
  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingProfile) return;

    setIsSavingPayment(true);
    try {
      const updated: StudentFinancialProfile = {
        ...payingProfile,
        statusPagamento: paymentStatusOption,
        dataUltimoPagamento: paymentStatusOption === 'EM_DIA' ? paymentDate : payingProfile.dataUltimoPagamento,
        formaPagamentoPadrao: paymentMethod,
        observacoes: paymentNotes,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Coordenação',
      };

      await saveFinancialProfileToFirestore(updated);

      setFinancialProfiles((prev) => {
        const idx = prev.findIndex((p) => p.studentId === updated.studentId && p.anoLetivo === updated.anoLetivo);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [...prev, updated];
      });

      showToast(`Status financeiro de ${updated.studentName} alterado para "${paymentStatusOption.replace('_', ' ')}"!`, 'success');
      setPayingProfile(null);
    } catch (err) {
      console.error('Erro ao registrar baixa:', err);
      showToast('Falha ao registrar baixa no sistema.', 'error');
    } finally {
      setIsSavingPayment(false);
    }
  };

  // Emissão do Demonstrativo Financeiro em PDF
  const handleGeneratePDF = () => {
    const result = generateFinancialReportPDF({
      profiles: filteredProfiles,
      metrics,
      schoolYear: selectedAnoLetivo,
      monthRef: `Exercício ${selectedAnoLetivo}`,
      turmaFilter: selectedTurma === 'TODAS' ? 'Todas as Turmas' : selectedTurma,
      statusFilter: selectedStatus === 'TODOS' ? 'Todos os Status' : selectedStatus.replace('_', ' '),
    });

    setPdfPreviewState({
      isOpen: true,
      doc: result.doc,
      dataUrl: result.dataUrl || result.dataUri,
      blobUrl: result.blobUrl,
      filename: result.filename,
      title: `Demonstrativo Financeiro do Integral — ${selectedAnoLetivo}`,
      onDownload: result.download,
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-2 text-xs font-bold text-white transition-all animate-in slide-in-from-bottom-3 ${
            toastMessage.type === 'success' ? 'bg-emerald-600 border border-emerald-500' : 'bg-rose-600 border border-rose-500'
          }`}
        >
          {toastMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Principal da Aba Financeira */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl text-indigo-600 shadow-2xs">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Gestão Financeira e Contratos
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                Programa Integral
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Controle de planos de horas, mensalidades base, oficinas extras e acompanhamento de adimplência.
            </p>
          </div>
        </div>

        {/* Seletor de Exercício / Ano Letivo & Ações Rápidas */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Seletor 2026 / 2027 */}
          <div className="flex items-center p-1 bg-slate-100 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setSelectedAnoLetivo(2026)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedAnoLetivo === 2026
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ano Letivo 2026
            </button>
            <button
              type="button"
              onClick={() => setSelectedAnoLetivo(2027)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedAnoLetivo === 2027
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ano Letivo 2027
            </button>
          </div>

          {/* Botão de Exportação de Relatório PDF */}
          <button
            type="button"
            onClick={handleGeneratePDF}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition-all flex items-center space-x-1.5 cursor-pointer shadow-xs"
            title="Exportar demonstrativo financeiro e quadro analítico em PDF"
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>📄 Relatório Financeiro (PDF)</span>
          </button>
        </div>
      </div>

      {/* Painel de Indicadores Financeiros (4 Cards no Topo) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Receita Prevista Mensal */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Receita Prevista Mensal
            </span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {formatCurrencyBR(metrics.receitaPrevistaMensal)}
            </span>
          </div>
          <div className="mt-2 flex items-center space-x-1.5 text-[11px] text-slate-500">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>{metrics.totalContratos} contratos cadastrados ({selectedAnoLetivo})</span>
          </div>
        </div>

        {/* Card 2: Receita Confirmada / Em Dia */}
        <div className="bg-white rounded-3xl p-5 border border-emerald-200/80 shadow-xs relative overflow-hidden bg-gradient-to-br from-white to-emerald-50/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
              Receita Confirmada / Em Dia
            </span>
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-2xl font-black text-emerald-700 tracking-tight">
              {formatCurrencyBR(metrics.receitaConfirmada)}
            </span>
          </div>
          <div className="mt-2 flex items-center space-x-1.5 text-[11px] text-emerald-700 font-semibold">
            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>{metrics.totalEmDia} mensalidades quitadas</span>
          </div>
        </div>

        {/* Card 3: Total em Atraso / Inadimplência */}
        <div className="bg-white rounded-3xl p-5 border border-rose-200/80 shadow-xs relative overflow-hidden bg-gradient-to-br from-white to-rose-50/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
              Total em Atraso (Inadimplência)
            </span>
            <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-2xl font-black text-rose-700 tracking-tight">
              {formatCurrencyBR(metrics.totalEmAtraso)}
            </span>
          </div>
          <div className="mt-2 flex items-center space-x-1.5 text-[11px] text-rose-600 font-semibold">
            <Clock className="w-3.5 h-3.5 text-rose-500" />
            <span>{metrics.totalAtrasados} pendências em aberto</span>
          </div>
        </div>

        {/* Card 4: Taxa de Adimplência */}
        <div className="bg-white rounded-3xl p-5 border border-indigo-200/80 shadow-xs relative overflow-hidden bg-gradient-to-br from-white to-indigo-50/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
              Taxa de Adimplência
            </span>
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-indigo-700 tracking-tight">
              {metrics.taxaAdimplencia}%
            </span>
            <span className="text-xs text-indigo-600/80 font-medium">
              da receita ativa
            </span>
          </div>
          {/* Barra de Progresso */}
          <div className="mt-2.5 w-full bg-indigo-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, metrics.taxaAdimplencia))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Campo de Busca por Aluno */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar aluno por nome..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtros por Turma e Status */}
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            {/* Filtro por Turma */}
            <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-2xl">
              <span className="text-slate-500 text-xs font-semibold">Turma:</span>
              <select
                value={selectedTurma}
                onChange={(e) => setSelectedTurma(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer pr-1"
              >
                <option value="TODAS">Todas as Turmas ({resolvedProfiles.length})</option>
                {availableTurmas.map((t) => {
                  const count = resolvedProfiles.filter((p) => p.turma === t).length;
                  return (
                    <option key={t} value={t}>
                      {t} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Filtro por Status */}
            <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-2xl">
              <span className="text-slate-500 text-xs font-semibold">Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer pr-1"
              >
                <option value="TODOS">Todos ({resolvedProfiles.length})</option>
                <option value="EM_DIA">Em Dia ({metrics.totalEmDia})</option>
                <option value="PENDENTE">Pendente ({metrics.totalPendentes})</option>
                <option value="EM_ATRASO">Em Atraso ({metrics.totalAtrasados})</option>
                <option value="ISENTO">Isento ({metrics.totalIsentos})</option>
              </select>
            </div>

            {/* Contador de Registros Exibidos */}
            <span className="text-xs text-slate-400 font-medium ml-auto md:ml-0">
              {filteredProfiles.length} aluno(s)
            </span>
          </div>
        </div>
      </div>

      {/* Tabela de Contratos e Mensalidades */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-900 text-white font-bold uppercase text-[10.5px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Estudante</th>
                <th className="py-3.5 px-3">Turma</th>
                <th className="py-3.5 px-3">Plano Contratual</th>
                <th className="py-3.5 px-3 text-right">Mensalidade Base</th>
                <th className="py-3.5 px-3 text-right">Oficinas Extras</th>
                <th className="py-3.5 px-3 text-center">Desconto</th>
                <th className="py-3.5 px-3 text-right">Valor Total</th>
                <th className="py-3.5 px-3 text-center">Vencimento</th>
                <th className="py-3.5 px-3 text-center">Situação</th>
                <th className="py-3.5 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Info className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-sm">Nenhum contrato localizado para os filtros selecionados.</p>
                    <p className="text-xs text-slate-400 mt-1">Verifique o termo de busca ou altere o ano letivo.</p>
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((profile, idx) => {
                  const planoBadgeColor =
                    profile.planoHora === 'INTEGRAL_8H'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : profile.planoHora === 'PARCIAL_4H'
                      ? 'bg-sky-50 text-sky-700 border-sky-200'
                      : profile.planoHora === 'EXTENDIDO_12H'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200';

                  const planoName =
                    profile.planoHora === 'INTEGRAL_8H'
                      ? 'Integral (8h)'
                      : profile.planoHora === 'PARCIAL_4H'
                      ? 'Parcial (4h)'
                      : profile.planoHora === 'EXTENDIDO_12H'
                      ? 'Estendido (12h)'
                      : 'Personalizado';

                  return (
                    <tr
                      key={profile.studentId}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'
                      }`}
                    >
                      {/* Estudante */}
                      <td className="py-3 px-4 font-bold text-slate-900">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 text-xs sm:text-[13px]">
                            {profile.studentName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            Matrícula: {profile.studentId}
                          </span>
                        </div>
                      </td>

                      {/* Turma */}
                      <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                        {profile.turma || '-'}
                      </td>

                      {/* Plano Contratual */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-lg text-[10.5px] font-bold border ${planoBadgeColor}`}
                        >
                          {planoName}
                        </span>
                      </td>

                      {/* Mensalidade Base */}
                      <td className="py-3 px-3 text-right font-medium text-slate-600 whitespace-nowrap">
                        {formatCurrencyBR(profile.valorMensalidadeBase)}
                      </td>

                      {/* Oficinas Extras */}
                      <td className="py-3 px-3 text-right font-medium text-slate-600 whitespace-nowrap">
                        {profile.valorModalidadesExtras > 0 ? (
                          <span className="text-amber-700 font-semibold">
                            +{formatCurrencyBR(profile.valorModalidadesExtras)}
                          </span>
                        ) : (
                          <span className="text-slate-400">R$ 0,00</span>
                        )}
                      </td>

                      {/* Desconto */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {profile.descontoPercentual > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {profile.descontoPercentual}% OFF
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Valor Total Líquido */}
                      <td className="py-3 px-3 text-right font-extrabold text-slate-900 whitespace-nowrap text-sm">
                        {formatCurrencyBR(profile.valorTotalMensal)}
                      </td>

                      {/* Vencimento */}
                      <td className="py-3 px-3 text-center whitespace-nowrap font-medium text-slate-600">
                        Dia {String(profile.diaVencimento).padStart(2, '0')}
                      </td>

                      {/* Situação de Pagamento */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {profile.statusPagamento === 'EM_DIA' && (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>Em Dia</span>
                          </span>
                        )}
                        {profile.statusPagamento === 'PENDENTE' && (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-[10.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span>Pendente</span>
                          </span>
                        )}
                        {profile.statusPagamento === 'EM_ATRASO' && (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            <span>Em Atraso</span>
                          </span>
                        )}
                        {profile.statusPagamento === 'ISENTO' && (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-[10.5px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            <span>Isento</span>
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenPayment(profile)}
                            className="p-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-bold transition-all cursor-pointer flex items-center space-x-1"
                            title="Registrar pagamento ou alterar situação do mês"
                          >
                            <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-[11px]">Baixa</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(profile)}
                            className="p-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 font-semibold transition-all cursor-pointer flex items-center space-x-1"
                            title="Editar contrato, plano, desconto e mensalidade"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span className="text-[11px]">Editar</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Editar Contrato do Aluno */}
      {editingProfile && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleSaveEdit}
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5 bg-white shrink-0">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                    Editar Contrato Financeiro
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {editingProfile.studentName} ({editingProfile.turma})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingProfile(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Plano de Horas Contratual */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Plano de Horas Contratual:
                </label>
                <select
                  value={editingProfile.planoHora}
                  onChange={(e) => {
                    const newPlano = e.target.value as FinancialPlanHour;
                    const suggestedBase = BASE_PLAN_PRICES[newPlano] || editingProfile.valorMensalidadeBase;
                    setEditingProfile({
                      ...editingProfile,
                      planoHora: newPlano,
                      valorMensalidadeBase: suggestedBase,
                    });
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="PARCIAL_4H">Parcial (4 Horas) — Sugestão: R$ 1.150,00</option>
                  <option value="INTEGRAL_8H">Integral (8 Horas) — Sugestão: R$ 1.850,00</option>
                  <option value="EXTENDIDO_12H">Estendido (12 Horas) — Sugestão: R$ 2.450,00</option>
                  <option value="CUSTOMIZADO">Personalizado / Customizado</option>
                </select>
              </div>

              {/* Valores: Base e Modalidades Extras */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Mensalidade Base (R$):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingProfile.valorMensalidadeBase}
                    onChange={(e) =>
                      setEditingProfile({
                        ...editingProfile,
                        valorMensalidadeBase: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Oficinas Extras (R$):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingProfile.valorModalidadesExtras}
                    onChange={(e) =>
                      setEditingProfile({
                        ...editingProfile,
                        valorModalidadesExtras: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Desconto Percentual & Dia de Vencimento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Desconto Concedido (%):
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={editingProfile.descontoPercentual}
                    onChange={(e) =>
                      setEditingProfile({
                        ...editingProfile,
                        descontoPercentual: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)),
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Dia de Vencimento:
                  </label>
                  <select
                    value={editingProfile.diaVencimento}
                    onChange={(e) =>
                      setEditingProfile({
                        ...editingProfile,
                        diaVencimento: parseInt(e.target.value) || 10,
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={5}>Dia 05 de cada mês</option>
                    <option value={10}>Dia 10 de cada mês (Padrão)</option>
                    <option value={15}>Dia 15 de cada mês</option>
                    <option value={20}>Dia 20 de cada mês</option>
                    <option value={25}>Dia 25 de cada mês</option>
                  </select>
                </div>
              </div>

              {/* Forma de Pagamento */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Forma de Cobrança / Pagamento:
                </label>
                <select
                  value={editingProfile.formaPagamentoPadrao || 'Boleto'}
                  onChange={(e) =>
                    setEditingProfile({
                      ...editingProfile,
                      formaPagamentoPadrao: e.target.value,
                    })
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Boleto">Boleto Bancário</option>
                  <option value="PIX">Chave PIX / QR Code</option>
                  <option value="Cartão">Cartão de Crédito Recorrente</option>
                  <option value="Transferência">Transferência / Débito em Conta</option>
                </select>
              </div>

              {/* Caixa de Resumo do Valor Total Calculado */}
              <div className="p-4 bg-slate-900 text-white rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
                    Valor Total Mensal Calculado
                  </span>
                  <span className="text-xl font-black text-emerald-400">
                    {formatCurrencyBR(
                      calculateValorTotalMensal(
                        editingProfile.valorMensalidadeBase,
                        editingProfile.valorModalidadesExtras,
                        editingProfile.descontoPercentual
                      )
                    )}
                  </span>
                </div>
                <div className="text-right text-[11px] text-slate-300">
                  <p>Base: {formatCurrencyBR(editingProfile.valorMensalidadeBase)}</p>
                  <p>Extras: +{formatCurrencyBR(editingProfile.valorModalidadesExtras)}</p>
                  {editingProfile.descontoPercentual > 0 && (
                    <p className="text-emerald-300">Desc: -{editingProfile.descontoPercentual}%</p>
                  )}
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Observações Financeiras / Condições Especiais:
                </label>
                <textarea
                  rows={2}
                  value={editingProfile.observacoes || ''}
                  onChange={(e) =>
                    setEditingProfile({
                      ...editingProfile,
                      observacoes: e.target.value,
                    })
                  }
                  placeholder="Ex: Irmãos matriculados no colégio, convênio corporativo, etc."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-100 p-4 bg-white flex justify-end space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditingProfile(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingEdit}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5"
              >
                {isSavingEdit ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Salvar Contrato</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 2: Registrar Pagamento / Baixa */}
      {payingProfile && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleConfirmPayment}
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5 bg-white">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                    Baixa de Pagamento
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {payingProfile.studentName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPayingProfile(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-emerald-800 uppercase block">
                    Valor da Mensalidade
                  </span>
                  <span className="text-lg font-black text-emerald-900">
                    {formatCurrencyBR(payingProfile.valorTotalMensal)}
                  </span>
                </div>
                <div className="text-right text-[11px] text-emerald-700 font-medium">
                  <p>Vencimento: Dia {String(payingProfile.diaVencimento).padStart(2, '0')}</p>
                  <p>Ano: {payingProfile.anoLetivo}</p>
                </div>
              </div>

              {/* Status de Pagamento */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Selecione a Nova Situação:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentStatusOption('EM_DIA')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all ${
                      paymentStatusOption === 'EM_DIA'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Em Dia</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentStatusOption('PENDENTE')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all ${
                      paymentStatusOption === 'PENDENTE'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Pendente</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentStatusOption('EM_ATRASO')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all ${
                      paymentStatusOption === 'EM_ATRASO'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Em Atraso</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentStatusOption('ISENTO')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all ${
                      paymentStatusOption === 'ISENTO'
                        ? 'bg-slate-700 text-white border-slate-700 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Isento</span>
                  </button>
                </div>
              </div>

              {/* Data da Baixa / Pagamento */}
              {paymentStatusOption === 'EM_DIA' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Data do Pagamento Efetivo:
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              {/* Forma de Pagamento */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Forma do Recebimento:
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Boleto">Boleto Bancário</option>
                  <option value="PIX">PIX / Transferência Instantânea</option>
                  <option value="Cartão">Cartão de Crédito / Débito</option>
                  <option value="Dinheiro">Dinheiro na Recepção</option>
                </select>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Observações / Número do Comprovante:
                </label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Ex: Pago via PIX autenticação #92837..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 p-4 bg-white flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setPayingProfile(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingPayment}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5"
              >
                {isSavingPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Gravando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirmar Baixa</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Visualizador de PDF */}
      {pdfPreviewState.isOpen && (
        <PdfViewerModal
          isOpen={pdfPreviewState.isOpen}
          onClose={() => setPdfPreviewState((prev) => ({ ...prev, isOpen: false }))}
          doc={pdfPreviewState.doc}
          dataUrl={pdfPreviewState.dataUrl}
          blobUrl={pdfPreviewState.blobUrl}
          filename={pdfPreviewState.filename}
          title={pdfPreviewState.title}
          onDownload={pdfPreviewState.onDownload}
        />
      )}
    </div>
  );
};
