import React, { useState, useEffect, useMemo } from 'react';
import {
  Student,
  UserProfile,
  TurmaType,
  StudentFinancialProfile,
  FinancialMetricSummary,
  FinancialPlanHour,
  FinancialPaymentStatus,
  FinancialExpense,
  ExpenseCategory,
  ExpenseStatus,
} from '../types';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  TrendingDown,
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
  Plus,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  BadgeDollarSign,
  Briefcase,
  Utensils,
  Wrench,
  BookOpen,
  Zap,
} from 'lucide-react';
import { formatCurrencyBR } from '../utils/pontoUtils';
import { formatDateBR } from '../utils/dateUtils';
import {
  BASE_PLAN_PRICES,
  EXPENSE_CATEGORIES_INFO,
  buildDefaultFinancialProfile,
  calculateFinancialMetrics,
  calculateModalidadesExtrasTotal,
  calculateValorTotalMensal,
  loadFinancialProfilesFromFirestore,
  saveFinancialProfileToFirestore,
  subscribeFinancialProfiles,
  loadFinancialExpensesFromFirestore,
  saveExpenseToFirestore,
  deleteExpenseFromFirestore,
  subscribeFinancialExpenses,
  syncExpensesFromModules,
} from '../services/financialService';
import { generateFinancialReportPDF } from '../utils/pdfGenerator';
import { PdfViewerModal } from './PdfViewerModal';
import { sortTurmasPedagogical } from '../utils/turmaUtils';
import { TURMAS_LIST } from '../data/initialData';

interface FinancialManagementProps {
  students: Student[];
  currentUser?: UserProfile | null;
  turmas?: string[];
  users?: UserProfile[];
}

export const FinancialManagement: React.FC<FinancialManagementProps> = ({
  students = [],
  currentUser = null,
  turmas = TURMAS_LIST,
  users = [],
}) => {
  // Filtro de Exercício / Ano Letivo (2026 | 2027)
  const [selectedAnoLetivo, setSelectedAnoLetivo] = useState<number>(2026);

  // Sub-abas internas: Receitas & Mensalidades vs Gestão de Despesas
  const [activeSubTab, setActiveSubTab] = useState<'receitas' | 'despesas'>('receitas');

  // Perfis financeiros carregados do Firestore / Cache
  const [financialProfiles, setFinancialProfiles] = useState<StudentFinancialProfile[]>([]);
  // Despesas operacionais carregadas do Firestore / Cache
  const [expenses, setExpenses] = useState<FinancialExpense[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filtros de Busca (Receitas)
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedTurma, setSelectedTurma] = useState<string>('TODAS');
  const [selectedStatus, setSelectedStatus] = useState<string>('TODOS');

  // Filtros de Busca (Despesas)
  const [expenseSearchTerm, setExpenseSearchTerm] = useState<string>('');
  const [selectedExpenseCategory, setSelectedExpenseCategory] = useState<string>('TODAS');
  const [selectedExpenseStatus, setSelectedExpenseStatus] = useState<string>('TODOS');

  // Modais de Receitas (Edição e Baixa)
  const [editingProfile, setEditingProfile] = useState<StudentFinancialProfile | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  const [payingProfile, setPayingProfile] = useState<StudentFinancialProfile | null>(null);
  const [paymentStatusOption, setPaymentStatusOption] = useState<FinancialPaymentStatus>('EM_DIA');
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Boleto');
  const [isSavingPayment, setIsSavingPayment] = useState<boolean>(false);

  // Modais de Despesas (Cadastro/Edição e Confirmação de Pagamento)
  const [expenseModalOpen, setExpenseModalOpen] = useState<boolean>(false);
  const [editingExpense, setEditingExpense] = useState<Partial<FinancialExpense> | null>(null);
  const [isSavingExpense, setIsSavingExpense] = useState<boolean>(false);

  const [expenseToDelete, setExpenseToDelete] = useState<FinancialExpense | null>(null);
  const [isDeletingExpense, setIsDeletingExpense] = useState<boolean>(false);

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

  // 1. Sincronização Silenciosa e Automática em segundo plano (background) ao carregar a aba ou alterar o ano letivo
  useEffect(() => {
    const runSilentSync = async () => {
      try {
        await syncExpensesFromModules(selectedAnoLetivo, students, users);
      } catch (err) {
        console.warn('Auto-sync silencioso em background:', err);
      }
    };
    runSilentSync();
  }, [selectedAnoLetivo, students.length, users.length]);

  // 2. Escuta em tempo real do Firestore: Perfis Financeiros e Despesas por Ano Letivo
  useEffect(() => {
    setIsLoading(true);
    const unsubProfiles = subscribeFinancialProfiles(selectedAnoLetivo, (remoteProfiles) => {
      setFinancialProfiles(remoteProfiles);
      setIsLoading(false);
    });

    const unsubExpenses = subscribeFinancialExpenses(selectedAnoLetivo, (remoteExpenses) => {
      setExpenses(remoteExpenses);
    });

    return () => {
      unsubProfiles();
      unsubExpenses();
    };
  }, [selectedAnoLetivo]);

  // 2. Consolidação de Receitas: Garante que todos os alunos cadastrados possuam perfil financeiro
  const resolvedProfiles = useMemo<StudentFinancialProfile[]>(() => {
    const yearStudents = students.filter((s) => (s.anoLetivo || 2026) === selectedAnoLetivo);

    const profileMap = new Map<string, StudentFinancialProfile>();
    financialProfiles.forEach((p) => {
      if (p.studentId) {
        profileMap.set(p.studentId, p);
      }
    });

    const list: StudentFinancialProfile[] = [];
    yearStudents.forEach((student) => {
      const existing = profileMap.get(student.id);
      const studentFinalVal =
        student.valorMensalidadeFinal !== undefined
          ? student.valorMensalidadeFinal
          : student.valorPlanoBase !== undefined
          ? Math.max(0, student.valorPlanoBase - (student.descontoBolsa || 0))
          : undefined;

      if (existing) {
        list.push({
          ...existing,
          studentName: student.name,
          turma: student.turma,
          studentStatus: student.status || 'ativo',
          planoContratual: student.planoContratual || existing.planoContratual,
          descontoBolsa: student.descontoBolsa !== undefined ? student.descontoBolsa : existing.descontoBolsa,
          valorMensalidadeBase:
            student.valorPlanoBase !== undefined ? student.valorPlanoBase : existing.valorMensalidadeBase,
          valorTotalMensal: studentFinalVal !== undefined ? studentFinalVal : existing.valorTotalMensal,
        });
      } else {
        const defaultProfile = buildDefaultFinancialProfile(student, selectedAnoLetivo);
        list.push(defaultProfile);
      }
    });

    return list.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || '', 'pt-BR'));
  }, [students, financialProfiles, selectedAnoLetivo]);

  // 3. Despesas ativas do ano letivo
  const currentExpenses = useMemo<FinancialExpense[]>(() => {
    return expenses.filter((e) => e.anoLetivo === selectedAnoLetivo);
  }, [expenses, selectedAnoLetivo]);

  // 4. Métricas Gerais Consolidadas (Receitas, Despesas e Saldo Líquido Operacional)
  const metrics = useMemo<FinancialMetricSummary>(() => {
    return calculateFinancialMetrics(resolvedProfiles, currentExpenses);
  }, [resolvedProfiles, currentExpenses]);

  // 5. Lista Filtrada de Receitas (Alunos)
  const filteredProfiles = useMemo<StudentFinancialProfile[]>(() => {
    return resolvedProfiles.filter((p) => {
      if (searchTerm.trim().length > 0) {
        const term = searchTerm.toLowerCase();
        const matchesName = (p.studentName || '').toLowerCase().includes(term);
        const matchesTurma = (p.turma || '').toLowerCase().includes(term);
        if (!matchesName && !matchesTurma) return false;
      }
      if (selectedTurma !== 'TODAS' && p.turma !== selectedTurma) {
        return false;
      }
      if (selectedStatus !== 'TODOS' && p.statusPagamento !== selectedStatus) {
        return false;
      }
      return true;
    });
  }, [resolvedProfiles, searchTerm, selectedTurma, selectedStatus]);

  // 6. Lista Filtrada de Despesas
  const filteredExpenses = useMemo<FinancialExpense[]>(() => {
    return currentExpenses.filter((e) => {
      if (expenseSearchTerm.trim().length > 0) {
        const term = expenseSearchTerm.toLowerCase();
        const matchDesc = (e.descricao || '').toLowerCase().includes(term);
        const matchForn = (e.fornecedorOuBeneficiario || '').toLowerCase().includes(term);
        if (!matchDesc && !matchForn) return false;
      }
      if (selectedExpenseCategory !== 'TODAS' && e.categoria !== selectedExpenseCategory) {
        return false;
      }
      if (selectedExpenseStatus !== 'TODOS' && e.status !== selectedExpenseStatus) {
        return false;
      }
      return true;
    });
  }, [currentExpenses, expenseSearchTerm, selectedExpenseCategory, selectedExpenseStatus]);

  // Turmas disponíveis
  const availableTurmas = useMemo(() => {
    const list = turmas && turmas.length > 0 ? turmas : TURMAS_LIST;
    return sortTurmasPedagogical(list);
  }, [turmas]);

  // -------------------------------------------------------------------------
  // HANDLERS: RECEITAS E CONTRATOS
  // -------------------------------------------------------------------------
  const handleOpenEditContract = (profile: StudentFinancialProfile) => {
    setEditingProfile({ ...profile });
  };

  const handleSaveContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;

    setIsSavingEdit(true);
    try {
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

  const handleOpenPayment = (profile: StudentFinancialProfile) => {
    setPayingProfile(profile);
    setPaymentStatusOption('EM_DIA');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentNotes(profile.observacoes || '');
    setPaymentMethod(profile.formaPagamentoPadrao || 'Boleto');
  };

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

      showToast(`Status financeiro de ${updated.studentName} atualizado!`, 'success');
      setPayingProfile(null);
    } catch (err) {
      console.error('Erro ao registrar baixa:', err);
      showToast('Falha ao registrar baixa no sistema.', 'error');
    } finally {
      setIsSavingPayment(false);
    }
  };

  // -------------------------------------------------------------------------
  // HANDLERS: GESTÃO DE DESPESAS OPERACIONAIS
  // -------------------------------------------------------------------------
  const handleOpenNewExpense = () => {
    setEditingExpense({
      anoLetivo: selectedAnoLetivo,
      categoria: 'FOLHA_PAGAMENTO',
      descricao: '',
      valor: 0,
      dataVencimento: new Date().toISOString().split('T')[0],
      status: 'PENDENTE',
      formaPagamento: 'Boleto',
      fornecedorOuBeneficiario: '',
      observacoes: '',
    });
    setExpenseModalOpen(true);
  };

  const handleOpenEditExpense = (expense: FinancialExpense) => {
    setEditingExpense({ ...expense });
    setExpenseModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense || !editingExpense.descricao || !editingExpense.valor) {
      showToast('Preencha os campos obrigatórios da despesa.', 'error');
      return;
    }

    setIsSavingExpense(true);
    try {
      const expenseToSave: FinancialExpense = {
        id: editingExpense.id || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        anoLetivo: editingExpense.anoLetivo || selectedAnoLetivo,
        categoria: (editingExpense.categoria as ExpenseCategory) || 'OUTROS',
        descricao: editingExpense.descricao.trim(),
        valor: Math.max(0, Number(editingExpense.valor)),
        dataVencimento: editingExpense.dataVencimento || new Date().toISOString().split('T')[0],
        dataPagamento: editingExpense.status === 'PAGO' ? editingExpense.dataPagamento || new Date().toISOString().split('T')[0] : undefined,
        status: (editingExpense.status as ExpenseStatus) || 'PENDENTE',
        formaPagamento: editingExpense.formaPagamento || 'Boleto',
        fornecedorOuBeneficiario: (editingExpense.fornecedorOuBeneficiario || '').trim(),
        observacoes: (editingExpense.observacoes || '').trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Coordenação',
      };

      await saveExpenseToFirestore(expenseToSave);

      setExpenses((prev) => {
        const idx = prev.findIndex((item) => item.id === expenseToSave.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = expenseToSave;
          return next;
        }
        return [expenseToSave, ...prev];
      });

      showToast(`Despesa "${expenseToSave.descricao}" salva com sucesso!`, 'success');
      setExpenseModalOpen(false);
      setEditingExpense(null);
    } catch (err) {
      console.error('Erro ao salvar despesa:', err);
      showToast('Falha ao salvar despesa no Firestore.', 'error');
    } finally {
      setIsSavingExpense(false);
    }
  };

  const handleQuickPayExpense = async (expense: FinancialExpense) => {
    const today = new Date().toISOString().split('T')[0];
    const updated: FinancialExpense = {
      ...expense,
      status: 'PAGO',
      dataPagamento: today,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name || 'Coordenação',
    };

    try {
      await saveExpenseToFirestore(updated);
      setExpenses((prev) => prev.map((e) => (e.id === expense.id ? updated : e)));
      showToast(`Pagamento da despesa "${expense.descricao}" confirmado!`, 'success');
    } catch (err) {
      console.error('Erro ao confirmar pagamento:', err);
      showToast('Falha ao registrar pagamento no Firestore.', 'error');
    }
  };

  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return;

    setIsDeletingExpense(true);
    try {
      await deleteExpenseFromFirestore(expenseToDelete.id);
      setExpenses((prev) => prev.filter((e) => e.id !== expenseToDelete.id));
      showToast('Despesa excluída com sucesso!', 'success');
      setExpenseToDelete(null);
    } catch (err) {
      console.error('Erro ao excluir despesa:', err);
      showToast('Falha ao excluir despesa.', 'error');
    } finally {
      setIsDeletingExpense(false);
    }
  };

  // -------------------------------------------------------------------------
  // EMISSÃO DO RELATÓRIO FINANCEIRO EM PDF CONSOLIDADO
  // -------------------------------------------------------------------------
  const handleGeneratePDF = () => {
    const result = generateFinancialReportPDF({
      profiles: filteredProfiles,
      expenses: filteredExpenses,
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
      title: `Demonstrativo Financeiro e Fluxo de Caixa — ${selectedAnoLetivo}`,
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
                Gestão Financeira & Fluxo de Caixa
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                Programa Integral
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Controle de mensalidades, custos operacionais, despesas e acompanhamento do saldo líquido do colégio.
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

          {/* Botão de Exportação de Relatório PDF Consolidado */}
          <button
            type="button"
            onClick={handleGeneratePDF}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition-all flex items-center space-x-1.5 cursor-pointer shadow-xs"
            title="Exportar demonstrativo financeiro consolidado de receitas e despesas em PDF"
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>📄 Relatório Financeiro (PDF)</span>
          </button>
        </div>
      </div>

      {/* Painel Atualizado de Indicadores (Dashboard de Fluxo de Caixa do Programa Integral) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Receita Prevista / Confirmada */}
        <div className="bg-white rounded-3xl p-5 border border-emerald-200/80 shadow-xs relative overflow-hidden bg-gradient-to-br from-white to-emerald-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
              1. Receitas do Mês
            </span>
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-emerald-700 tracking-tight">
              {formatCurrencyBR(metrics.receitaConfirmada)}
            </span>
            <span className="text-[11px] text-emerald-600 font-bold block mt-0.5">
              Confirmada / Em Dia
            </span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-emerald-100/70 flex items-center justify-between text-[11px] text-slate-500">
            <span>Prevista: <strong className="text-slate-800">{formatCurrencyBR(metrics.receitaPrevistaMensal)}</strong></span>
            <span className="text-emerald-700 font-semibold">{metrics.totalEmDia} quitadas</span>
          </div>
        </div>

        {/* Card 2: Total de Despesas do Mês */}
        <div className="bg-white rounded-3xl p-5 border border-rose-200/80 shadow-xs relative overflow-hidden bg-gradient-to-br from-white to-rose-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
              2. Despesas do Mês
            </span>
            <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-rose-700 tracking-tight">
              {formatCurrencyBR(metrics.totalDespesasMes)}
            </span>
            <span className="text-[11px] text-rose-600 font-bold block mt-0.5">
              Custos Operacionais ({currentExpenses.length})
            </span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-rose-100/70 flex items-center justify-between text-[11px] text-slate-500">
            <span>Pagas: <strong className="text-slate-800">{formatCurrencyBR(metrics.totalDespesasPagas)}</strong></span>
            <span className="text-amber-700 font-semibold">Pend: {formatCurrencyBR(metrics.totalDespesasPendentes)}</span>
          </div>
        </div>

        {/* Card 3: Saldo Líquido Operacional (Receitas - Despesas) */}
        <div
          className={`bg-white rounded-3xl p-5 border shadow-xs relative overflow-hidden ${
            metrics.saldoLiquidoOperacional >= 0
              ? 'border-indigo-200/80 bg-gradient-to-br from-white to-indigo-50/25'
              : 'border-rose-300 bg-gradient-to-br from-white to-rose-50/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
              3. Saldo Líquido
            </span>
            <div
              className={`p-2 rounded-xl ${
                metrics.saldoLiquidoOperacional >= 0
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-rose-100 text-rose-700'
              }`}
            >
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span
              className={`text-2xl font-black tracking-tight ${
                metrics.saldoLiquidoOperacional >= 0 ? 'text-indigo-900' : 'text-rose-700'
              }`}
            >
              {formatCurrencyBR(metrics.saldoLiquidoOperacional)}
            </span>
            <span
              className={`text-[11px] font-bold block mt-0.5 ${
                metrics.saldoLiquidoOperacional >= 0 ? 'text-indigo-600' : 'text-rose-600'
              }`}
            >
              {metrics.saldoLiquidoOperacional >= 0 ? 'Superávit Operacional' : 'Atenção: Déficit no Período'}
            </span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Receita Confirmada (-) Despesas</span>
            <span className="text-slate-400 font-mono text-[10px]">{selectedAnoLetivo}</span>
          </div>
        </div>

        {/* Card 4: Taxa de Adimplência */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              4. Taxa de Adimplência
            </span>
            <div className="p-2 bg-slate-100 text-slate-700 rounded-xl">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {metrics.taxaAdimplencia}%
            </span>
            <span className="text-xs text-slate-500 font-medium">
              dos contratos ativos
            </span>
          </div>
          <div className="mt-2.5 w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                metrics.taxaAdimplencia >= 85
                  ? 'bg-emerald-500'
                  : metrics.taxaAdimplencia >= 70
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, metrics.taxaAdimplencia))}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex justify-between">
            <span>{metrics.totalEmDia} adimplentes</span>
            <span className="text-rose-600 font-semibold">{metrics.totalAtrasados} em atraso</span>
          </div>
        </div>
      </div>

      {/* Seletores / Abas Internas na Gestão Financeira */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2 gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sub-aba 1: Receitas & Mensalidades */}
          <button
            type="button"
            onClick={() => setActiveSubTab('receitas')}
            className={`flex items-center justify-center space-x-2 px-5 py-2.5 min-w-[220px] h-11 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
              activeSubTab === 'receitas'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>📈 Receitas & Mensalidades ({filteredProfiles.length})</span>
          </button>

          {/* Sub-aba 2: Gestão de Despesas */}
          <button
            type="button"
            onClick={() => setActiveSubTab('despesas')}
            className={`flex items-center justify-center space-x-2 px-5 py-2.5 min-w-[220px] h-11 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
              activeSubTab === 'despesas'
                ? 'bg-rose-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            <span>📉 Gestão de Despesas ({currentExpenses.length})</span>
          </button>
        </div>

        {/* Botão Padronizado de Ação: [ ➕ Nova Despesa ] */}
        {activeSubTab === 'despesas' && (
          <button
            type="button"
            onClick={handleOpenNewExpense}
            className="flex items-center justify-center space-x-2 px-5 py-2.5 min-w-[220px] h-11 rounded-2xl text-xs font-black text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md hover:shadow-lg transition-all cursor-pointer border border-emerald-500/30"
            title="Cadastrar nova despesa ou custo operacional"
          >
            <Plus className="w-4 h-4" />
            <span>➕ Nova Despesa</span>
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* CONTEÚDO DA SUB-ABA: RECEITAS & MENSALIDADES                              */}
      {/* ========================================================================= */}
      {activeSubTab === 'receitas' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Barra de Filtros e Busca */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-3">
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

              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
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

                          <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                            {profile.turma || '-'}
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-lg text-[10.5px] font-bold border ${
                                profile.planoContratual
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : planoBadgeColor
                              }`}
                              title={profile.planoContratual || planoName}
                            >
                              {profile.planoContratual || planoName}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-right font-medium text-slate-600 whitespace-nowrap">
                            {formatCurrencyBR(profile.valorMensalidadeBase)}
                          </td>

                          <td className="py-3 px-3 text-right font-medium text-slate-600 whitespace-nowrap">
                            {profile.valorModalidadesExtras > 0 ? (
                              <span className="text-amber-700 font-semibold">
                                +{formatCurrencyBR(profile.valorModalidadesExtras)}
                              </span>
                            ) : (
                              <span className="text-slate-400">R$ 0,00</span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {profile.descontoPercentual > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {profile.descontoPercentual}% OFF
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-right font-extrabold text-slate-900 whitespace-nowrap text-sm">
                            {formatCurrencyBR(profile.valorTotalMensal)}
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap font-medium text-slate-600">
                            Dia {String(profile.diaVencimento).padStart(2, '0')}
                          </td>

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
                                onClick={() => handleOpenEditContract(profile)}
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONTEÚDO DA SUB-ABA: GESTÃO DE DESPESAS OPERACIONAIS                      */}
      {/* ========================================================================= */}
      {activeSubTab === 'despesas' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Barra de Filtros de Despesas */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={expenseSearchTerm}
                  onChange={(e) => setExpenseSearchTerm(e.target.value)}
                  placeholder="Buscar custo ou fornecedor..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all"
                />
                {expenseSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setExpenseSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                {/* Filtro por Categoria */}
                <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-2xl">
                  <span className="text-slate-500 text-xs font-semibold">Categoria:</span>
                  <select
                    value={selectedExpenseCategory}
                    onChange={(e) => setSelectedExpenseCategory(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer pr-1"
                  >
                    <option value="TODAS">Todas as Categorias ({currentExpenses.length})</option>
                    <option value="FOLHA_PAGAMENTO">Folha / Salários</option>
                    <option value="OFICINAS_TERCEIRIZADAS">Oficinas Terceirizadas</option>
                    <option value="OFICINAS_CULINARIA">Oficinas de Culinária</option>
                    <option value="ALIMENTACAO_HORTIFRUTI">Alimentação & Cantina</option>
                    <option value="MATERIAIS_DIDATICOS">Materiais Didáticos</option>
                    <option value="MANUTENCAO_INFRA">Manutenção & Infra</option>
                    <option value="OUTROS">Outros Custos</option>
                  </select>
                </div>

                {/* Filtro por Status */}
                <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-2xl">
                  <span className="text-slate-500 text-xs font-semibold">Status:</span>
                  <select
                    value={selectedExpenseStatus}
                    onChange={(e) => setSelectedExpenseStatus(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer pr-1"
                  >
                    <option value="TODOS">Todos ({currentExpenses.length})</option>
                    <option value="PAGO">Pago</option>
                    <option value="PENDENTE">Pendente</option>
                  </select>
                </div>

                <span className="text-xs text-slate-400 font-medium ml-auto md:ml-0">
                  {filteredExpenses.length} custo(s)
                </span>
              </div>
            </div>
          </div>

          {/* Tabela de Despesas e Saídas */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-900 text-white font-bold uppercase text-[10.5px] tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Categoria</th>
                    <th className="py-3.5 px-3">Descrição da Despesa</th>
                    <th className="py-3.5 px-3">Fornecedor / Beneficiário</th>
                    <th className="py-3.5 px-3 text-center">Vencimento</th>
                    <th className="py-3.5 px-3 text-right">Valor (R$)</th>
                    <th className="py-3.5 px-3 text-center">Forma</th>
                    <th className="py-3.5 px-3 text-center">Situação</th>
                    <th className="py-3.5 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <Info className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-sm">Nenhuma despesa localizada para os filtros selecionados.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((exp, idx) => {
                      const catInfo = EXPENSE_CATEGORIES_INFO[exp.categoria] || EXPENSE_CATEGORIES_INFO.OUTROS;

                      return (
                        <tr
                          key={exp.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'
                          }`}
                        >
                          {/* Categoria */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-xl text-[11px] font-bold border ${catInfo.bgClass} ${catInfo.textClass} ${catInfo.borderClass}`}
                            >
                              {catInfo.shortLabel}
                            </span>
                          </td>

                          {/* Descrição */}
                          <td className="py-3 px-3 font-bold text-slate-900">
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span>{exp.descricao}</span>
                                {(exp.isAutoGenerated || exp.autoSyncKey) && (
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
                                    <Zap className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                                    <span>⚡ Automático</span>
                                    {exp.origemModulo && (
                                      <>
                                        <span className="text-amber-400 font-bold">•</span>
                                        <span className="text-[9.5px] font-semibold text-amber-800">
                                          {exp.origemModulo === 'FOLHA_PONTO'
                                            ? 'Livro Ponto'
                                            : exp.origemModulo === 'CARDAPIO_REFEICOES'
                                            ? 'Cardápio / Refeições'
                                            : exp.origemModulo === 'OFICINAS_EXTRAS'
                                            ? 'Oficinas Extras'
                                            : 'Auto-Sync'}
                                        </span>
                                      </>
                                    )}
                                  </span>
                                )}
                              </div>
                              {exp.observacoes && (
                                <span className="block text-[10.5px] text-slate-400 font-normal mt-0.5 line-clamp-1">
                                  {exp.observacoes}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Fornecedor / Beneficiário */}
                          <td className="py-3 px-3 font-medium text-slate-700 whitespace-nowrap">
                            {exp.fornecedorOuBeneficiario || '-'}
                          </td>

                          {/* Vencimento */}
                          <td className="py-3 px-3 text-center whitespace-nowrap font-medium text-slate-600">
                            {formatDateBR(exp.dataVencimento)}
                          </td>

                          {/* Valor */}
                          <td className="py-3 px-3 text-right font-black text-rose-700 whitespace-nowrap text-sm">
                            {formatCurrencyBR(exp.valor)}
                          </td>

                          {/* Forma de Pagamento */}
                          <td className="py-3 px-3 text-center whitespace-nowrap text-slate-600">
                            {exp.formaPagamento || 'Boleto'}
                          </td>

                          {/* Situação */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {exp.status === 'PAGO' ? (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>Pago</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-[10.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                <span>Pendente</span>
                              </span>
                            )}
                          </td>

                          {/* Ações */}
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center space-x-1.5">
                              {exp.status === 'PENDENTE' && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickPayExpense(exp)}
                                  className="p-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-bold transition-all cursor-pointer flex items-center space-x-1"
                                  title="Confirmar pagamento e registrar quitação da despesa"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-[11px]">Pagar</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleOpenEditExpense(exp)}
                                className="p-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 font-semibold transition-all cursor-pointer flex items-center space-x-1"
                                title="Editar dados da despesa"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span className="text-[11px]">Editar</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setExpenseToDelete(exp)}
                                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors cursor-pointer"
                                title="Excluir despesa"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: NOVA / EDITAR DESPESA                                              */}
      {/* ========================================================================= */}
      {expenseModalOpen && editingExpense && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleSaveExpense}
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5 bg-white shrink-0">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                  <TrendingDown className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                    {editingExpense.id ? 'Editar Despesa Operacional' : 'Lançar Nova Despesa'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Exercício {editingExpense.anoLetivo || selectedAnoLetivo} — Programa Integral
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setExpenseModalOpen(false);
                  setEditingExpense(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Categoria */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Categoria da Despesa: <span className="text-rose-500">*</span>
                </label>
                <select
                  value={editingExpense.categoria || 'FOLHA_PAGAMENTO'}
                  onChange={(e) =>
                    setEditingExpense({
                      ...editingExpense,
                      categoria: e.target.value as ExpenseCategory,
                    })
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="FOLHA_PAGAMENTO">Folha de Pagamento & Encargos (Monitoras/Docentes)</option>
                  <option value="OFICINAS_TERCEIRIZADAS">Oficinas Terceirizadas (Natação, Balé, Judô, etc.)</option>
                  <option value="OFICINAS_CULINARIA">Oficinas de Culinária</option>
                  <option value="ALIMENTACAO_HORTIFRUTI">Alimentação, Cantina & Hortifruti</option>
                  <option value="MATERIAIS_DIDATICOS">Materiais Pedagógicos & Brinquedos</option>
                  <option value="MANUTENCAO_INFRA">Manutenção, Infra & Limpeza</option>
                  <option value="OUTROS">Outras Despesas Operacionais</option>
                </select>
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Descrição do Custo: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Aquisição de frutas e hortifrúti da semana..."
                  value={editingExpense.descricao || ''}
                  onChange={(e) =>
                    setEditingExpense({
                      ...editingExpense,
                      descricao: e.target.value,
                    })
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Fornecedor e Valor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Fornecedor / Beneficiário:
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Distribuidora Central Ltda"
                    value={editingExpense.fornecedorOuBeneficiario || ''}
                    onChange={(e) =>
                      setEditingExpense({
                        ...editingExpense,
                        fornecedorOuBeneficiario: e.target.value,
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Valor (R$): <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editingExpense.valor || ''}
                    onChange={(e) =>
                      setEditingExpense({
                        ...editingExpense,
                        valor: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* Vencimento e Forma de Pagamento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Data de Vencimento: <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={editingExpense.dataVencimento || new Date().toISOString().split('T')[0]}
                    onChange={(e) =>
                      setEditingExpense({
                        ...editingExpense,
                        dataVencimento: e.target.value,
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Forma de Pagamento:
                  </label>
                  <select
                    value={editingExpense.formaPagamento || 'Boleto'}
                    onChange={(e) =>
                      setEditingExpense({
                        ...editingExpense,
                        formaPagamento: e.target.value,
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="Boleto">Boleto Bancário</option>
                    <option value="PIX">PIX Instantâneo</option>
                    <option value="Transferência (Folha)">Transferência Bancária / Folha</option>
                    <option value="Cartão Corporativo">Cartão Corporativo</option>
                    <option value="Débito em Conta">Débito em Conta</option>
                  </select>
                </div>
              </div>

              {/* Status do Pagamento */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Situação do Lançamento:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingExpense({
                        ...editingExpense,
                        status: 'PAGO',
                        dataPagamento: editingExpense.dataPagamento || new Date().toISOString().split('T')[0],
                      })
                    }
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all ${
                      editingExpense.status === 'PAGO'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Pago (Liquidado)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditingExpense({
                        ...editingExpense,
                        status: 'PENDENTE',
                        dataPagamento: undefined,
                      })
                    }
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all ${
                      editingExpense.status === 'PENDENTE'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Pendente de Pagamento</span>
                  </button>
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Observações / Centro de Custo:
                </label>
                <textarea
                  rows={2}
                  value={editingExpense.observacoes || ''}
                  onChange={(e) =>
                    setEditingExpense({
                      ...editingExpense,
                      observacoes: e.target.value,
                    })
                  }
                  placeholder="Número de nota fiscal, justificativa pedagógica ou detalhes operacionais..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 p-4 bg-white flex justify-end space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setExpenseModalOpen(false);
                  setEditingExpense(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingExpense}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5"
              >
                {isSavingExpense ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Gravando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Salvar Despesa</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Exclusão de Despesa */}
      {expenseToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 border border-slate-200 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-2 bg-rose-50 rounded-2xl">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-slate-900 text-base">Excluir Despesa?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Tem certeza que deseja excluir o custo operacional{' '}
              <strong>"{expenseToDelete.descricao}"</strong> no valor de{' '}
              <strong>{formatCurrencyBR(expenseToDelete.valor)}</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setExpenseToDelete(null)}
                className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingExpense}
                onClick={handleDeleteExpense}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md cursor-pointer flex items-center space-x-1"
              >
                {isDeletingExpense ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Confirmar Exclusão</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAIS DE RECEITAS (EDITAR CONTRATO & BAIXA)                               */}
      {/* ========================================================================= */}
      {editingProfile && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleSaveContract}
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95"
          >
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

            <div className="p-5 overflow-y-auto space-y-4">
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

      {/* Modal: Baixa de Mensalidade */}
      {payingProfile && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleConfirmPayment}
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95"
          >
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
