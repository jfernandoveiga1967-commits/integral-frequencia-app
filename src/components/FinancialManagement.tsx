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
  PlanoContratualType,
  getTabelaPlanosPorAno,
} from '../types';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  AlertCircle,
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
  saveExpense,
  updateFinancialExpense,
  deleteExpenseFromFirestore,
  subscribeFinancialExpenses,
  syncExpensesFromModules,
  isObsoleteOrDuplicateExpense,
  loadLocalFinancialExpenses,
  forceRewriteSanitizedExpensesToFirestore,
  calculateDREMonthlyMatrix,
  DREMonthlySummary,
  MONTH_NAMES_DRE,
} from '../services/financialService';
import { saveStudentToFirestore } from '../firebase';
import { loadStudents, saveStudents } from '../utils/storageUtils';
import { generateFinancialReportPDF, generateDREMonthlyReportPDF } from '../utils/pdfGenerator';
import { PdfViewerModal } from './PdfViewerModal';
import { sortTurmasPedagogical } from '../utils/turmaUtils';
import { TURMAS_LIST } from '../data/initialData';

interface FinancialManagementProps {
  students: Student[];
  currentUser?: UserProfile | null;
  turmas?: string[];
  users?: UserProfile[];
  onUpdateStudents?: (students: Student[]) => void;
}

export const FinancialManagement: React.FC<FinancialManagementProps> = ({
  students = [],
  currentUser = null,
  turmas = TURMAS_LIST,
  users = [],
  onUpdateStudents,
}) => {
  // Filtro de Exercício / Ano Letivo (2026 | 2027)
  const [selectedAnoLetivo, setSelectedAnoLetivo] = useState<number>(2026);

  // Sub-abas internas: Receitas & Mensalidades vs Gestão de Despesas vs DRE Operacional
  const [activeSubTab, setActiveSubTab] = useState<'receitas' | 'despesas' | 'dre'>('receitas');

  // Filtro de Mês Individual no DRE ('ALL' | 1..12)
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>('ALL');
  // Modo de exibição da matriz: isolar a coluna do mês selecionado ou manter todas com destaque
  const [isolateMonthColumn, setIsolateMonthColumn] = useState<boolean>(false);

  // Perfis financeiros carregados do Firestore / Cache
  const [financialProfiles, setFinancialProfiles] = useState<StudentFinancialProfile[]>([]);
  // Despesas operacionais carregadas do Firestore / Cache (inicialização imediata higienizada)
  const [expenses, setExpenses] = useState<FinancialExpense[]>(() => loadLocalFinancialExpenses());

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
        await forceRewriteSanitizedExpensesToFirestore(selectedAnoLetivo);
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

  // Contagens por Ano Letivo para os seletores
  const countStudents2026 = useMemo(
    () => (students || []).filter((s) => s.anoLetivo === 2026).length,
    [students]
  );
  const countStudents2027 = useMemo(
    () => (students || []).filter((s) => s.anoLetivo === 2027).length,
    [students]
  );

  // 2. Consolidação de Receitas 100% Dinâmica com os Planos Contratuais dos Alunos
  const resolvedProfiles = useMemo<StudentFinancialProfile[]>(() => {
    // Isolamento estrito por ano letivo selecionado
    const yearStudents = (students || []).filter((s) => s.anoLetivo === selectedAnoLetivo);

    const profileMap = new Map<string, StudentFinancialProfile>();
    financialProfiles.forEach((p) => {
      if (p.studentId && p.anoLetivo === selectedAnoLetivo) {
        profileMap.set(p.studentId, p);
      }
    });

    const list: StudentFinancialProfile[] = [];
    const activeTabela = getTabelaPlanosPorAno(selectedAnoLetivo);
    const fallbackBase = selectedAnoLetivo === 2027 ? 1250 : 1120;

    yearStudents.forEach((student) => {
      const existing = profileMap.get(student.id);
      const isAvulso = student.tipoContrato === 'avulso';
      const planoContratual =
        student.planoContratual ||
        existing?.planoContratual ||
        (isAvulso ? 'Diária Integral' : 'Integral Semana (18:30h)');
      const planoInfo = activeTabela[planoContratual as keyof typeof activeTabela];

      const baseVal =
        student.valorPlanoBase !== undefined && student.valorPlanoBase > 0
          ? student.valorPlanoBase
          : existing?.valorMensalidadeBase !== undefined && existing.valorMensalidadeBase > 0
          ? existing.valorMensalidadeBase
          : planoInfo?.valorBase ?? fallbackBase;

      const extras =
        student.valorModalidadesExtras !== undefined
          ? student.valorModalidadesExtras
          : existing?.valorModalidadesExtras !== undefined
          ? existing.valorModalidadesExtras
          : student.valorOficinas !== undefined
          ? student.valorOficinas
          : student.oficinasExtras !== undefined
          ? student.oficinasExtras
          : student.valorExtras !== undefined
          ? student.valorExtras
          : calculateModalidadesExtrasTotal(student.activities || []);

      const descontoBolsa =
        student.descontoBolsa !== undefined
          ? Number(student.descontoBolsa) || 0
          : existing?.descontoBolsa !== undefined
          ? Number(existing.descontoBolsa) || 0
          : 0;

      const finalVal =
        extras === 0
          ? Math.max(0, baseVal - descontoBolsa)
          : student.valorMensalidadeFinal !== undefined && student.valorMensalidadeFinal > 0
          ? student.valorMensalidadeFinal
          : existing?.valorTotalMensal !== undefined && existing.valorTotalMensal > 0
          ? existing.valorTotalMensal
          : Math.max(0, baseVal + extras - descontoBolsa);

      const isIsento = descontoBolsa >= (baseVal + extras) && (baseVal + extras) > 0;
      const statusPagamento = existing?.statusPagamento || (isIsento ? 'ISENTO' : 'EM_DIA');

      list.push({
        id: existing?.id || `${selectedAnoLetivo}_${student.id}`,
        studentId: student.id,
        studentName: student.name,
        turma: student.turma,
        anoLetivo: selectedAnoLetivo,
        planoHora: isAvulso ? 'PARCIAL_4H' : 'INTEGRAL_8H',
        valorMensalidadeBase: baseVal,
        valorModalidadesExtras: extras,
        oficinasExtras: extras,
        valorOficinas: extras,
        valorExtras: extras,
        descontoPercentual: baseVal > 0 ? Math.round((descontoBolsa / baseVal) * 100) : 0,
        valorTotalMensal: finalVal,
        diaVencimento: existing?.diaVencimento || 10,
        statusPagamento,
        mesReferencia: existing?.mesReferencia || `${selectedAnoLetivo}-08`,
        dataUltimoPagamento: existing?.dataUltimoPagamento,
        formaPagamentoPadrao: existing?.formaPagamentoPadrao || 'Boleto',
        observacoes: existing?.observacoes || `Plano Contratual: ${planoContratual}`,
        studentStatus: student.status || 'ativo',
        planoContratual,
        descontoBolsa,
        updatedAt: existing?.updatedAt || new Date().toISOString(),
        updatedBy: existing?.updatedBy || 'Sincronização Contratual Dinâmica',
      });
    });

    return list.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || '', 'pt-BR'));
  }, [students, financialProfiles, selectedAnoLetivo]);

  // 3. Despesas ativas do ano letivo (filtrando estritamente despesas válidas, sem duplicatas ou repasses de oficinas)
  const currentExpenses = useMemo<FinancialExpense[]>(() => {
    return expenses.filter(
      (e) => e.anoLetivo === selectedAnoLetivo && !isObsoleteOrDuplicateExpense(e)
    );
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
      const base = Number(editingProfile.valorMensalidadeBase) || 0;
      const extras = Number(editingProfile.valorModalidadesExtras) || 0;
      const pct = Number(editingProfile.descontoPercentual) || 0;
      const bolsa = Number(editingProfile.descontoBolsa) || 0;

      // Calcular o total mensal com rigor matemático:
      let total = 0;
      if (bolsa > 0) {
        total = Math.max(0, (base + extras) - bolsa);
      } else if (pct > 0) {
        total = Math.max(0, calculateValorTotalMensal(base, extras, pct));
      } else {
        total = Math.max(0, base + extras);
      }
      total = Math.round(total * 100) / 100;

      const isIsento = total === 0;
      const statusPagamento: FinancialPaymentStatus = isIsento
        ? 'ISENTO'
        : editingProfile.statusPagamento === 'ISENTO'
        ? 'EM_DIA'
        : editingProfile.statusPagamento || 'EM_DIA';

      const updated: StudentFinancialProfile = {
        ...editingProfile,
        valorMensalidadeBase: base,
        valorModalidadesExtras: extras,
        descontoPercentual: pct,
        descontoBolsa: bolsa,
        valorTotalMensal: total,
        statusPagamento,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Coordenação',
      };

      await saveFinancialProfileToFirestore(updated);

      // Sincronização Bidirecional com o cadastro de Alunos (Student)
      const targetStudent = students.find((s) => s.id === updated.studentId);
      if (targetStudent) {
        const updatedStudent: Student = {
          ...targetStudent,
          planoContratual: updated.planoContratual as PlanoContratualType,
          valorPlanoBase: base,
          descontoBolsa: bolsa,
          valorMensalidadeFinal: total,
          valorModalidadesExtras: extras,
          oficinasExtras: extras,
          valorOficinas: extras,
          valorExtras: extras,
        };

        try {
          await saveStudentToFirestore(updatedStudent);
        } catch (studentErr) {
          console.warn('Erro ao atualizar aluno no Firestore:', studentErr);
        }

        const allCurrentStudents = loadStudents();
        const updatedList = allCurrentStudents.map((s) =>
          s.id === updatedStudent.id ? updatedStudent : s
        );
        saveStudents(updatedList);
        if (onUpdateStudents) {
          onUpdateStudents(updatedList);
        }
      }

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
      fornecedor: '',
      observacoes: '',
    });
    setExpenseModalOpen(true);
  };

  const handleOpenEditExpense = (expense: FinancialExpense) => {
    const forn = expense.fornecedor || expense.fornecedorOuBeneficiario || '';
    setEditingExpense({
      ...expense,
      fornecedor: forn,
      fornecedorOuBeneficiario: forn,
    });
    setExpenseModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense || !editingExpense.descricao || !editingExpense.valor) {
      showToast('Preencha os campos obrigatórios da despesa (Descrição e Valor).', 'error');
      return;
    }

    setIsSavingExpense(true);
    try {
      const fornecedorVal = (
        editingExpense.fornecedor ||
        editingExpense.fornecedorOuBeneficiario ||
        ''
      ).trim();

      const expenseToSave: FinancialExpense = {
        id: editingExpense.id || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        anoLetivo: editingExpense.anoLetivo || selectedAnoLetivo,
        categoria: (editingExpense.categoria as ExpenseCategory) || 'OUTROS',
        descricao: editingExpense.descricao.trim(),
        valor: Math.max(0, Number(editingExpense.valor)),
        dataVencimento: editingExpense.dataVencimento || new Date().toISOString().split('T')[0],
        dataPagamento:
          editingExpense.status === 'PAGO'
            ? editingExpense.dataPagamento || new Date().toISOString().split('T')[0]
            : undefined,
        status: (editingExpense.status as ExpenseStatus) || 'PENDENTE',
        formaPagamento: editingExpense.formaPagamento || 'Boleto',
        fornecedorOuBeneficiario: fornecedorVal,
        fornecedor: fornecedorVal,
        observacoes: (editingExpense.observacoes || '').trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Coordenação',
        isAutoGenerated: editingExpense.isAutoGenerated ?? false,
        origemModulo: editingExpense.origemModulo || 'MANUAL',
        autoSyncKey: editingExpense.autoSyncKey,
      };

      if (editingExpense.id) {
        await updateFinancialExpense(editingExpense.id, expenseToSave);
      } else {
        await saveExpense(expenseToSave);
      }

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
      await updateFinancialExpense(expense.id, updated);
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

  // -------------------------------------------------------------------------
  // MATRIZ MÊS A MÊS DO DRE (JANEIRO A DEZEMBRO + TOTAL ANUAL)
  // -------------------------------------------------------------------------
  const monthlyDRE = useMemo(() => {
    return calculateDREMonthlyMatrix(metrics, selectedAnoLetivo);
  }, [metrics, selectedAnoLetivo]);

  // Apuração ativa do DRE conforme a competência selecionada ('ALL' ou 1..12)
  const activeDREData = useMemo(() => {
    if (selectedMonth === 'ALL') {
      return {
        isMonthly: false,
        monthIndex: null as number | null,
        label: 'Ano Completo (Consolidado)',
        shortLabel: `Exercício ${selectedAnoLetivo}`,
        receitaLiquida: metrics.receitaPrevistaMensal,
        faturamentoBruto: metrics.faturamentoBrutoReal,
        descontoBolsas: metrics.totalDescontoBolsas,
        custosOperacionais: metrics.totalCustosOperacionaisReais ?? metrics.totalDespesasMes,
        custoFolha: metrics.custoFolhaReal || 0,
        custoAlimentacao: metrics.custoAlimentacaoReal || 0,
        resultadoLiquido: metrics.resultadoOperacionalLiquidoReal ?? metrics.saldoLiquidoOperacional,
        margemPercentual: metrics.margemOperacionalLiquida ?? 0,
      };
    }
    const m = monthlyDRE.months.find((item) => item.monthIndex === selectedMonth);
    if (m) {
      return {
        isMonthly: true,
        monthIndex: m.monthIndex,
        label: `Mês de ${m.monthFullName}`,
        shortLabel: m.monthFullName,
        receitaLiquida: m.receitaLiquida,
        faturamentoBruto: m.receitaBruta,
        descontoBolsas: m.descontoBolsas,
        custosOperacionais: m.custosOperacionais,
        custoFolha: m.custoFolha,
        custoAlimentacao: m.custoAlimentacao,
        resultadoLiquido: m.resultadoLiquido,
        margemPercentual: m.margemPercentual,
      };
    }
    return {
      isMonthly: false,
      monthIndex: null as number | null,
      label: 'Ano Completo (Consolidado)',
      shortLabel: `Exercício ${selectedAnoLetivo}`,
      receitaLiquida: metrics.receitaPrevistaMensal,
      faturamentoBruto: metrics.faturamentoBrutoReal,
      descontoBolsas: metrics.totalDescontoBolsas,
      custosOperacionais: metrics.totalCustosOperacionaisReais ?? metrics.totalDespesasMes,
      custoFolha: metrics.custoFolhaReal || 0,
      custoAlimentacao: metrics.custoAlimentacaoReal || 0,
      resultadoLiquido: metrics.resultadoOperacionalLiquidoReal ?? metrics.saldoLiquidoOperacional,
      margemPercentual: metrics.margemOperacionalLiquida ?? 0,
    };
  }, [selectedMonth, monthlyDRE, metrics, selectedAnoLetivo]);

  const handleGenerateDREMonthlyPDF = () => {
    const result = generateDREMonthlyReportPDF({
      schoolYear: selectedAnoLetivo,
      metrics,
      monthlyDRE,
      selectedMonth,
      profilesCount: resolvedProfiles.length,
    });

    const monthTitle =
      selectedMonth !== 'ALL'
        ? ` — ${monthlyDRE.months.find((m) => m.monthIndex === selectedMonth)?.monthFullName || `Mês ${selectedMonth}`}`
        : ' (Jan-Dez)';

    setPdfPreviewState({
      isOpen: true,
      doc: result.doc,
      dataUrl: result.dataUrl || result.dataUri,
      blobUrl: result.blobUrl,
      filename: result.filename,
      title: `DRE Mensal Consolidado${monthTitle} — Exercício ${selectedAnoLetivo}`,
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
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                selectedAnoLetivo === 2026
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Ano Letivo 2026</span>
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                selectedAnoLetivo === 2026 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {countStudents2026}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedAnoLetivo(2027)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                selectedAnoLetivo === 2027
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Ano Letivo 2027</span>
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                selectedAnoLetivo === 2027 ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-200 text-slate-600'
              }`}>
                {countStudents2027}
              </span>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Receita Contratual Líquida (Mês ou Ano) */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-emerald-200/80 shadow-xs relative overflow-hidden bg-gradient-to-br from-white to-emerald-50/20 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-1.5 min-w-0">
                <span className="text-[11px] sm:text-xs font-bold text-emerald-800 uppercase tracking-wider truncate">
                  1. Receita Contratual Líquida
                </span>
                {activeDREData.isMonthly && (
                  <span className="px-1.5 py-0.2 rounded-md text-[9.5px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                    {activeDREData.shortLabel}
                  </span>
                )}
              </div>
              <div className="p-1.5 sm:p-2 bg-emerald-100 text-emerald-700 rounded-xl shrink-0">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 min-w-0">
              <span className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight truncate block">
                {formatCurrencyBR(activeDREData.receitaLiquida)}
              </span>
              <span className="text-[10.5px] sm:text-[11px] text-emerald-600 font-bold block mt-0.5 truncate">
                {activeDREData.isMonthly
                  ? `Competência: ${activeDREData.label}`
                  : 'Prevista (Soma dos Planos Ativos)'}
              </span>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-emerald-100/70 flex flex-wrap items-center justify-between gap-1 text-[10.5px] sm:text-[11px] text-slate-500">
            <span className="truncate">Bruto: <strong className="text-slate-800">{formatCurrencyBR(activeDREData.faturamentoBruto)}</strong></span>
            <span className="text-purple-700 font-semibold truncate">Bolsas: -{formatCurrencyBR(activeDREData.descontoBolsas)}</span>
          </div>
        </div>

        {/* Card 2: Custos Operacionais Reais (Mês ou Ano) */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-rose-200/80 shadow-xs relative overflow-hidden bg-gradient-to-br from-white to-rose-50/20 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-1.5 min-w-0">
                <span className="text-[11px] sm:text-xs font-bold text-rose-800 uppercase tracking-wider truncate">
                  2. Custos Operacionais Reais
                </span>
                {activeDREData.isMonthly && (
                  <span className="px-1.5 py-0.2 rounded-md text-[9.5px] font-black bg-rose-100 text-rose-800 border border-rose-300 shrink-0">
                    {activeDREData.shortLabel}
                  </span>
                )}
              </div>
              <div className="p-1.5 sm:p-2 bg-rose-100 text-rose-700 rounded-xl shrink-0">
                <ArrowDownRight className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 min-w-0">
              <span className="text-xl sm:text-2xl font-black text-rose-700 tracking-tight truncate block">
                {formatCurrencyBR(activeDREData.custosOperacionais)}
              </span>
              <span className="text-[10.5px] sm:text-[11px] text-rose-600 font-bold block mt-0.5 truncate">
                Folha: {formatCurrencyBR(activeDREData.custoFolha)} • Alim: {formatCurrencyBR(activeDREData.custoAlimentacao)}
              </span>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-rose-100/70 flex flex-wrap items-center justify-between gap-1 text-[10.5px] sm:text-[11px] text-slate-500">
            <span className="truncate">Ponto: <strong className="text-slate-800">{formatCurrencyBR(activeDREData.custoFolha)}</strong></span>
            <span className="text-emerald-700 font-semibold truncate">Refeições: {formatCurrencyBR(activeDREData.custoAlimentacao)}</span>
          </div>
        </div>

        {/* Card 3: Resultado Operacional Líquido Real = Receita Líquida - Custos Reais */}
        <div
          className={`bg-white rounded-3xl p-4 sm:p-5 border shadow-xs relative overflow-hidden min-w-0 flex flex-col justify-between ${
            activeDREData.resultadoLiquido >= 0
              ? 'border-indigo-200/80 bg-gradient-to-br from-white to-indigo-50/25'
              : 'border-rose-300 bg-gradient-to-br from-white to-rose-50/40'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-1.5 min-w-0">
                <span className="text-[11px] sm:text-xs font-bold text-indigo-900 uppercase tracking-wider truncate">
                  3. Resultado Líquido Real
                </span>
                {activeDREData.isMonthly && (
                  <span className="px-1.5 py-0.2 rounded-md text-[9.5px] font-black bg-indigo-100 text-indigo-800 border border-indigo-300 shrink-0">
                    {activeDREData.shortLabel}
                  </span>
                )}
              </div>
              <div
                className={`p-1.5 sm:p-2 rounded-xl shrink-0 ${
                  activeDREData.resultadoLiquido >= 0
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 min-w-0">
              <span
                className={`text-xl sm:text-2xl font-black tracking-tight truncate block ${
                  activeDREData.resultadoLiquido >= 0
                    ? 'text-indigo-900'
                    : 'text-rose-700'
                }`}
              >
                {formatCurrencyBR(activeDREData.resultadoLiquido)}
              </span>
              <span
                className={`text-[10.5px] sm:text-[11px] font-bold block mt-0.5 truncate ${
                  activeDREData.resultadoLiquido >= 0
                    ? 'text-indigo-600'
                    : 'text-rose-600'
                }`}
              >
                {activeDREData.resultadoLiquido >= 0
                  ? `Superávit Real (${activeDREData.margemPercentual}% Margem)`
                  : `Atenção: Déficit (${activeDREData.margemPercentual}% Margem)`}
              </span>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1 text-[10.5px] sm:text-[11px] text-slate-500">
            <span className="truncate">Receita (-) Custos</span>
            <span className="text-slate-400 font-mono text-[10px] shrink-0">
              {activeDREData.isMonthly ? `${activeDREData.shortLabel} / ${selectedAnoLetivo}` : `Exercício ${selectedAnoLetivo}`}
            </span>
          </div>
        </div>

        {/* Card 4: Ticket Médio por Aluno & Base Pagante */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs relative overflow-hidden bg-gradient-to-br from-white to-slate-50/50 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider truncate">
                4. Ticket Médio & Pagantes
              </span>
              <div className="p-1.5 sm:p-2 bg-indigo-100 text-indigo-700 rounded-xl shrink-0">
                <Percent className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 min-w-0 flex items-baseline space-x-1.5">
              <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
                {formatCurrencyBR(metrics.ticketMedioPorAluno)}
              </span>
              <span className="text-[11px] text-slate-500 font-medium shrink-0">
                / pagante
              </span>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1 text-[10.5px] sm:text-[11px] text-slate-500">
            <span className="truncate"><strong>{metrics.totalAlunosPagantes}</strong> pagantes</span>
            <span className="text-slate-600 font-medium truncate">{metrics.totalIsentos} isentos</span>
          </div>
        </div>
      </div>

      {/* Painel de Auditoria e Discriminação de Receitas Contratuais Reais */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 rounded-3xl p-4 sm:p-6 text-white shadow-lg border border-indigo-800/60 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-radial from-indigo-500/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-5">
          <div className="space-y-1.5 max-w-xl min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[10.5px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                100% Base Real de Contratos • Sem Mocks
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Exercício {selectedAnoLetivo}
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
              Discriminação da Receita Contratual Prevista
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Os valores apresentados são calculados varrendo os <strong>{resolvedProfiles.length} alunos cadastrados</strong> de {selectedAnoLetivo}, somando os planos contratuais e oficinas extras individuais e deduzindo as bolsas de estudo concedidas.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 bg-slate-950/60 p-2.5 sm:p-3.5 rounded-2xl border border-white/10 backdrop-blur-xs w-full lg:w-auto">
            <div className="p-2 sm:p-2.5 bg-white/5 rounded-xl min-w-0 overflow-hidden">
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium block truncate">Faturamento Bruto</span>
              <span className="text-xs sm:text-sm lg:text-base font-black text-white truncate block">
                {formatCurrencyBR(metrics.faturamentoBrutoReal)}
              </span>
            </div>
            <div className="p-2 sm:p-2.5 bg-white/5 rounded-xl min-w-0 overflow-hidden">
              <span className="text-[10px] sm:text-[11px] text-purple-300 font-medium block truncate">Bolsas Concedidas</span>
              <span className="text-xs sm:text-sm lg:text-base font-black text-purple-400 truncate block">
                -{formatCurrencyBR(metrics.totalDescontoBolsas)}
              </span>
            </div>
            <div className="p-2 sm:p-2.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl min-w-0 overflow-hidden">
              <span className="text-[10px] sm:text-[11px] text-emerald-300 font-medium block truncate">Receita Líquida</span>
              <span className="text-xs sm:text-sm lg:text-base font-black text-emerald-400 truncate block">
                {formatCurrencyBR(metrics.receitaPrevistaMensal)}
              </span>
            </div>
            <div className="p-2 sm:p-2.5 bg-indigo-950/40 border border-indigo-500/30 rounded-xl min-w-0 overflow-hidden">
              <span className="text-[10px] sm:text-[11px] text-indigo-300 font-medium block truncate">Ticket Médio</span>
              <span className="text-xs sm:text-sm lg:text-base font-black text-indigo-300 truncate block">
                {formatCurrencyBR(metrics.ticketMedioPorAluno)}
              </span>
            </div>
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
            className={`flex items-center justify-center space-x-2 px-5 py-2.5 min-w-[200px] h-11 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
              activeSubTab === 'despesas'
                ? 'bg-rose-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            <span>📉 Gestão de Despesas ({currentExpenses.length})</span>
          </button>

          {/* Sub-aba 3: DRE Operacional Realista */}
          <button
            type="button"
            onClick={() => setActiveSubTab('dre')}
            className={`flex items-center justify-center space-x-2 px-5 py-2.5 min-w-[200px] h-11 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
              activeSubTab === 'dre'
                ? 'bg-emerald-700 text-white shadow-md'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>📑 DRE Operacional Realista ({selectedAnoLetivo})</span>
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
                            {(profile.descontoBolsa && profile.descontoBolsa > 0) ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200" title={`Bolsa / Desconto de ${formatCurrencyBR(profile.descontoBolsa)}`}>
                                -{formatCurrencyBR(profile.descontoBolsa)}
                              </span>
                            ) : profile.descontoPercentual > 0 ? (
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
          {/* Painel de Auditoria dos Custos Operacionais Reais (Livro Ponto & Cardápio) */}
          <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-rose-900 rounded-3xl p-4 sm:p-6 text-white shadow-lg border border-rose-800/60 relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-5">
              <div className="space-y-1.5 max-w-xl min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[10.5px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    Custos 100% Reais • Sem Mocks
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    Exercício {selectedAnoLetivo}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Custos Operacionais Reais & DRE
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Os custos operacionais são conectados dinamicamente às fontes oficiais: a folha dos colaboradores ativos no <strong>Livro Ponto</strong> e o fornecimento de refeições aos alunos da Rotina pelo módulo <strong>Cardápio & Nutrição</strong>.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 bg-slate-950/60 p-2.5 sm:p-3.5 rounded-2xl border border-white/10 backdrop-blur-xs w-full lg:w-auto">
                <div className="p-2 sm:p-2.5 bg-white/5 rounded-xl min-w-0 overflow-hidden">
                  <span className="text-[10px] sm:text-[11px] text-indigo-300 font-medium block truncate">Folha (Livro Ponto)</span>
                  <span className="text-xs sm:text-sm lg:text-base font-black text-indigo-300 truncate block">
                    {formatCurrencyBR(metrics.custoFolhaReal || 0)}
                  </span>
                </div>
                <div className="p-2 sm:p-2.5 bg-white/5 rounded-xl min-w-0 overflow-hidden">
                  <span className="text-[10px] sm:text-[11px] text-emerald-300 font-medium block truncate">Alimentação (Refeições)</span>
                  <span className="text-xs sm:text-sm lg:text-base font-black text-emerald-300 truncate block">
                    {formatCurrencyBR(metrics.custoAlimentacaoReal || 0)}
                  </span>
                </div>
                <div className="p-2 sm:p-2.5 bg-rose-950/40 border border-rose-500/30 rounded-xl min-w-0 overflow-hidden">
                  <span className="text-[10px] sm:text-[11px] text-rose-300 font-medium block truncate">Total Custos Reais</span>
                  <span className="text-xs sm:text-sm lg:text-base font-black text-rose-400 truncate block">
                    {formatCurrencyBR(metrics.totalCustosOperacionaisReais ?? metrics.totalDespesasMes)}
                  </span>
                </div>
                <div className="p-2 sm:p-2.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl min-w-0 overflow-hidden">
                  <span className="text-[10px] sm:text-[11px] text-emerald-300 font-medium block truncate">Resultado Líquido</span>
                  <span className="text-xs sm:text-sm lg:text-base font-black text-emerald-400 truncate block">
                    {formatCurrencyBR(metrics.resultadoOperacionalLiquidoReal || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>

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
                            {exp.fornecedor || exp.fornecedorOuBeneficiario || '-'}
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
      {/* CONTEÚDO DA SUB-ABA: DRE OPERACIONAL REALISTA                             */}
      {/* ========================================================================= */}
      {activeSubTab === 'dre' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* Header Executivo do DRE */}
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 rounded-3xl p-5 sm:p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-[10.5px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    DRE Realista Auditado • Exercício {selectedAnoLetivo}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    Conexão Direta: Livro Ponto + Cardápio
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  Demonstração do Resultado do Exercício (DRE)
                </h3>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  Demonstração transparente integrando exclusivamente os contratos ativos dos alunos de {selectedAnoLetivo}, o custo consolidado da folha de pagamento do Livro Ponto e o faturamento de alimentação do Cardápio Escolar.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {/* Seletor Suspenso de Mês Individual / Ano Completo */}
                <div className="flex items-center space-x-1.5 bg-slate-900/90 border border-indigo-400/40 rounded-2xl px-3 py-2 shadow-inner">
                  <Filter className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                  <label htmlFor="dre-month-selector" className="text-[11px] font-bold text-slate-300 shrink-0">
                    Competência:
                  </label>
                  <select
                    id="dre-month-selector"
                    value={selectedMonth}
                    onChange={(e) => {
                      const val = e.target.value === 'ALL' ? 'ALL' : Number(e.target.value);
                      setSelectedMonth(val);
                      if (val === 'ALL') {
                        setIsolateMonthColumn(false);
                      }
                    }}
                    className="bg-transparent text-xs font-black text-white outline-none cursor-pointer pr-1"
                  >
                    <option value="ALL" className="bg-slate-900 text-white font-bold">
                      📅 Ano Completo / Todos os Meses
                    </option>
                    {MONTH_NAMES_DRE.map((m, idx) => (
                      <option key={idx + 1} value={idx + 1} className="bg-slate-900 text-white font-medium">
                        Mês {String(idx + 1).padStart(2, '0')} — {m.full}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateDREMonthlyPDF}
                  className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md flex items-center space-x-2 cursor-pointer transition-all"
                  title="Exportar Demonstrativo do Resultado do Exercício mês a mês em PDF oficial timbrado"
                >
                  <FileText className="w-4 h-4 text-emerald-200" />
                  <span>📄 Exportar DRE Mensal (PDF)</span>
                </button>
                <button
                  type="button"
                  onClick={handleGeneratePDF}
                  className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md flex items-center space-x-2 cursor-pointer transition-all"
                  title="Imprimir relatório financeiro detalhado de contratos e despesas"
                >
                  <FileText className="w-4 h-4" />
                  <span>Imprimir Demonstrativo / DRE</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card de Apuração Isolada do Mês Selecionado */}
          {selectedMonth !== 'ALL' && activeDREData.isMonthly && (
            <div className="bg-gradient-to-r from-indigo-50 via-white to-purple-50 rounded-3xl p-5 border-2 border-indigo-300 shadow-sm space-y-3 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100 pb-2.5">
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 rounded-lg bg-indigo-600 text-white">
                    <Calendar className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-black text-indigo-950">
                      Apuração Isolada da Competência — {activeDREData.label} de {selectedAnoLetivo}
                    </h4>
                    <p className="text-xs text-indigo-700 font-medium">
                      Valores discriminados estritamente para o mês de {activeDREData.shortLabel}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsolateMonthColumn((prev) => !prev)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all flex items-center space-x-1 cursor-pointer shadow-xs"
                    title={isolateMonthColumn ? 'Exibir todas as colunas de janeiro a dezembro' : 'Isolar apenas a coluna deste mês na matriz'}
                  >
                    <span>{isolateMonthColumn ? '👁️ Ver Matriz Completa' : '🎯 Isolar Coluna do Mês'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonth('ALL');
                      setIsolateMonthColumn(false);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 transition-all flex items-center space-x-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Ver Ano Completo</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-white rounded-2xl border border-indigo-100 shadow-2xs min-w-0">
                  <span className="text-[10.5px] font-bold text-slate-500 block truncate">Receita Bruta</span>
                  <span className="text-sm sm:text-base font-black text-slate-900 block mt-0.5 font-mono truncate">
                    {formatCurrencyBR(activeDREData.faturamentoBruto)}
                  </span>
                  <span className="text-[10px] text-purple-700 font-medium block truncate">
                    Bolsas: -{formatCurrencyBR(activeDREData.descontoBolsas)}
                  </span>
                </div>

                <div className="p-3 bg-white rounded-2xl border border-emerald-200 shadow-2xs min-w-0">
                  <span className="text-[10.5px] font-bold text-emerald-800 block truncate">Receita Líquida (ROL)</span>
                  <span className="text-sm sm:text-base font-black text-emerald-700 block mt-0.5 font-mono truncate">
                    {formatCurrencyBR(activeDREData.receitaLiquida)}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-semibold block truncate">100% Contratos Ativos</span>
                </div>

                <div className="p-3 bg-white rounded-2xl border border-rose-200 shadow-2xs min-w-0">
                  <span className="text-[10.5px] font-bold text-rose-800 block truncate">Custos Operacionais</span>
                  <span className="text-sm sm:text-base font-black text-rose-700 block mt-0.5 font-mono truncate">
                    -{formatCurrencyBR(activeDREData.custosOperacionais)}
                  </span>
                  <span className="text-[10px] text-rose-600 font-medium block truncate">
                    Folha: {formatCurrencyBR(activeDREData.custoFolha)} • Alim: {formatCurrencyBR(activeDREData.custoAlimentacao)}
                  </span>
                </div>

                <div className={`p-3 bg-white rounded-2xl border shadow-2xs min-w-0 ${activeDREData.resultadoLiquido >= 0 ? 'border-indigo-300 bg-indigo-50/20' : 'border-rose-300 bg-rose-50/20'}`}>
                  <span className="text-[10.5px] font-bold text-indigo-900 block truncate">Resultado Líquido</span>
                  <span className={`text-sm sm:text-base font-black block mt-0.5 font-mono truncate ${activeDREData.resultadoLiquido >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
                    {formatCurrencyBR(activeDREData.resultadoLiquido)}
                  </span>
                  <span className="text-[10px] font-bold text-slate-600 block truncate">
                    Margem: {activeDREData.margemPercentual}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Matriz Mensal Detalhada do DRE (Janeiro a Dezembro + Total Anual) */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
                    <Calendar className="w-4 h-4" />
                  </span>
                  <h4 className="text-sm font-black text-slate-900 tracking-tight">
                    {selectedMonth !== 'ALL' && isolateMonthColumn
                      ? `Apuração Isolada da Competência (${activeDREData.shortLabel}) — Exercício ${selectedAnoLetivo}`
                      : `Visão Discriminada Mês a Mês (Janeiro a Dezembro) — Exercício ${selectedAnoLetivo}`}
                  </h4>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  {selectedMonth !== 'ALL' && isolateMonthColumn
                    ? `Exibindo isoladamente a coluna do mês de ${activeDREData.shortLabel} e a representatividade sobre a ROL`
                    : 'Projeção e competência mensal calculadas a partir dos contratos ativos e custos oficiais integrados'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {selectedMonth !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setIsolateMonthColumn((prev) => !prev)}
                    className="px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-all cursor-pointer"
                  >
                    {isolateMonthColumn ? '👁️ Ver Todas as Colunas' : `🎯 Isolar Coluna (${activeDREData.shortLabel})`}
                  </button>
                )}
                <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {selectedMonth !== 'ALL' && isolateMonthColumn ? `Competência ${activeDREData.shortLabel}` : '12 Meses + Fechamento'}
                </span>
                <button
                  type="button"
                  onClick={handleGenerateDREMonthlyPDF}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs transition-all"
                  title="Exportar esta matriz mês a mês em PDF timbrado"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>Exportar Matriz PDF</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider">
                    <th className="py-3 px-4 sticky left-0 bg-slate-900 z-10 min-w-[250px] shadow-sm">
                      Linha Contábil / Indicador
                    </th>
                    {(selectedMonth !== 'ALL' && isolateMonthColumn
                      ? monthlyDRE.months.filter((m) => m.monthIndex === selectedMonth)
                      : monthlyDRE.months
                    ).map((m) => {
                      const isSelected = selectedMonth !== 'ALL' && m.monthIndex === selectedMonth;
                      return (
                        <th
                          key={m.monthIndex}
                          className={`py-3 px-3 text-right min-w-[95px] font-mono transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 text-white font-black ring-2 ring-indigo-400'
                              : 'text-slate-200'
                          }`}
                        >
                          <div className="flex flex-col items-end">
                            {isSelected && (
                              <span className="text-[8.5px] uppercase tracking-wider text-indigo-200 font-extrabold">
                                Competência
                              </span>
                            )}
                            <span>{m.monthName}</span>
                          </div>
                        </th>
                      );
                    })}
                    {selectedMonth !== 'ALL' && isolateMonthColumn && (
                      <th className="py-3 px-3 text-right min-w-[90px] font-mono bg-indigo-900 text-indigo-200 font-bold">
                        % da ROL
                      </th>
                    )}
                    <th className="py-3 px-4 text-right min-w-[125px] bg-slate-950 font-mono text-emerald-400">
                      Total Anual
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {/* Linha 1: Receita Operacional Bruta */}
                  <tr className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 sticky left-0 bg-white z-10 font-bold text-slate-900 border-r border-slate-100 shadow-2xs">
                      1. Receita Operacional Bruta
                    </td>
                    {(selectedMonth !== 'ALL' && isolateMonthColumn
                      ? monthlyDRE.months.filter((m) => m.monthIndex === selectedMonth)
                      : monthlyDRE.months
                    ).map((m) => {
                      const isSelected = selectedMonth !== 'ALL' && m.monthIndex === selectedMonth;
                      return (
                        <td
                          key={m.monthIndex}
                          className={`py-3 px-3 text-right font-mono text-slate-700 ${
                            isSelected ? 'bg-indigo-50/80 font-black border-x-2 border-indigo-300' : ''
                          }`}
                        >
                          {formatCurrencyBR(m.receitaBruta)}
                        </td>
                      );
                    })}
                    {selectedMonth !== 'ALL' && isolateMonthColumn && (
                      <td className="py-3 px-3 text-right font-mono font-medium text-slate-500 bg-indigo-50/30">
                        {activeDREData.receitaLiquida > 0
                          ? `${Math.round((activeDREData.faturamentoBruto / activeDREData.receitaLiquida) * 1000) / 10}%`
                          : '-'}
                      </td>
                    )}
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 bg-slate-50/60">
                      {formatCurrencyBR(monthlyDRE.totalAnual.receitaBruta)}
                    </td>
                  </tr>

                  {/* Linha 2: (-) Bolsas e Descontos */}
                  <tr className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 sticky left-0 bg-white z-10 font-medium text-purple-800 border-r border-slate-100 shadow-2xs pl-6">
                      2. (-) Bolsas & Descontos
                    </td>
                    {(selectedMonth !== 'ALL' && isolateMonthColumn
                      ? monthlyDRE.months.filter((m) => m.monthIndex === selectedMonth)
                      : monthlyDRE.months
                    ).map((m) => {
                      const isSelected = selectedMonth !== 'ALL' && m.monthIndex === selectedMonth;
                      return (
                        <td
                          key={m.monthIndex}
                          className={`py-3 px-3 text-right font-mono text-purple-700 ${
                            isSelected ? 'bg-indigo-50/80 font-black border-x-2 border-indigo-300' : ''
                          }`}
                        >
                          -{formatCurrencyBR(m.descontoBolsas)}
                        </td>
                      );
                    })}
                    {selectedMonth !== 'ALL' && isolateMonthColumn && (
                      <td className="py-3 px-3 text-right font-mono font-medium text-purple-600 bg-indigo-50/30">
                        -{activeDREData.receitaLiquida > 0
                          ? `${Math.round((activeDREData.descontoBolsas / activeDREData.receitaLiquida) * 1000) / 10}%`
                          : '-'}
                      </td>
                    )}
                    <td className="py-3 px-4 text-right font-mono font-bold text-purple-800 bg-slate-50/60">
                      -{formatCurrencyBR(monthlyDRE.totalAnual.descontoBolsas)}
                    </td>
                  </tr>

                  {/* Linha 3: (=) Receita Operacional Líquida (ROL) */}
                  <tr className="bg-emerald-50/50 hover:bg-emerald-50 font-bold text-emerald-950 border-y border-emerald-200/80">
                    <td className="py-3 px-4 sticky left-0 bg-emerald-50/95 z-10 text-emerald-900 border-r border-emerald-200 shadow-2xs font-black">
                      3. (=) Receita Contratual Líquida (ROL)
                    </td>
                    {(selectedMonth !== 'ALL' && isolateMonthColumn
                      ? monthlyDRE.months.filter((m) => m.monthIndex === selectedMonth)
                      : monthlyDRE.months
                    ).map((m) => {
                      const isSelected = selectedMonth !== 'ALL' && m.monthIndex === selectedMonth;
                      return (
                        <td
                          key={m.monthIndex}
                          className={`py-3 px-3 text-right font-mono font-bold text-emerald-700 ${
                            isSelected ? 'bg-emerald-100/80 font-black border-x-2 border-emerald-400' : ''
                          }`}
                        >
                          {formatCurrencyBR(m.receitaLiquida)}
                        </td>
                      );
                    })}
                    {selectedMonth !== 'ALL' && isolateMonthColumn && (
                      <td className="py-3 px-3 text-right font-mono font-black text-emerald-700 bg-emerald-50/80">
                        100.0%
                      </td>
                    )}
                    <td className="py-3 px-4 text-right font-mono font-black text-emerald-800 bg-emerald-100/60">
                      {formatCurrencyBR(monthlyDRE.totalAnual.receitaLiquida)}
                    </td>
                  </tr>

                  {/* Linha 4.1: Folha de Pagamento */}
                  <tr className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 sticky left-0 bg-white z-10 text-slate-700 border-r border-slate-100 shadow-2xs pl-6">
                      <div className="flex items-center space-x-1.5">
                        <span>4.1 Folha & Equipe</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Ponto
                        </span>
                      </div>
                    </td>
                    {(selectedMonth !== 'ALL' && isolateMonthColumn
                      ? monthlyDRE.months.filter((m) => m.monthIndex === selectedMonth)
                      : monthlyDRE.months
                    ).map((m) => {
                      const isSelected = selectedMonth !== 'ALL' && m.monthIndex === selectedMonth;
                      return (
                        <td
                          key={m.monthIndex}
                          className={`py-2.5 px-3 text-right font-mono text-rose-700 ${
                            isSelected ? 'bg-indigo-50/80 font-black border-x-2 border-indigo-300' : ''
                          }`}
                        >
                          -{formatCurrencyBR(m.custoFolha)}
                        </td>
                      );
                    })}
                    {selectedMonth !== 'ALL' && isolateMonthColumn && (
                      <td className="py-2.5 px-3 text-right font-mono font-medium text-rose-600 bg-indigo-50/30">
                        -{activeDREData.receitaLiquida > 0
                          ? `${Math.round((activeDREData.custoFolha / activeDREData.receitaLiquida) * 1000) / 10}%`
                          : '-'}
                      </td>
                    )}
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-rose-700 bg-slate-50/60">
                      -{formatCurrencyBR(monthlyDRE.totalAnual.custoFolha)}
                    </td>
                  </tr>

                  {/* Linha 4.2: Alimentação Escolar */}
                  <tr className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 sticky left-0 bg-white z-10 text-slate-700 border-r border-slate-100 shadow-2xs pl-6">
                      <div className="flex items-center space-x-1.5">
                        <span>4.2 Alimentação Escolar</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Cardápio
                        </span>
                      </div>
                    </td>
                    {(selectedMonth !== 'ALL' && isolateMonthColumn
                      ? monthlyDRE.months.filter((m) => m.monthIndex === selectedMonth)
                      : monthlyDRE.months
                    ).map((m) => {
                      const isSelected = selectedMonth !== 'ALL' && m.monthIndex === selectedMonth;
                      return (
                        <td
                          key={m.monthIndex}
                          className={`py-2.5 px-3 text-right font-mono text-rose-700 ${
                            isSelected ? 'bg-indigo-50/80 font-black border-x-2 border-indigo-300' : ''
                          }`}
                        >
                          -{formatCurrencyBR(m.custoAlimentacao)}
                        </td>
                      );
                    })}
                    {selectedMonth !== 'ALL' && isolateMonthColumn && (
                      <td className="py-2.5 px-3 text-right font-mono font-medium text-rose-600 bg-indigo-50/30">
                        -{activeDREData.receitaLiquida > 0
                          ? `${Math.round((activeDREData.custoAlimentacao / activeDREData.receitaLiquida) * 1000) / 10}%`
                          : '-'}
                      </td>
                    )}
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-rose-700 bg-slate-50/60">
                      -{formatCurrencyBR(monthlyDRE.totalAnual.custoAlimentacao)}
                    </td>
                  </tr>

                  {/* Linha 4: Total Custos Operacionais */}
                  <tr className="bg-rose-50/40 hover:bg-rose-50/70 font-bold text-rose-950 border-t border-rose-200/60">
                    <td className="py-3 px-4 sticky left-0 bg-rose-50/95 z-10 text-rose-900 border-r border-rose-200 shadow-2xs font-black">
                      4. (=) Total Custos Operacionais
                    </td>
                    {(selectedMonth !== 'ALL' && isolateMonthColumn
                      ? monthlyDRE.months.filter((m) => m.monthIndex === selectedMonth)
                      : monthlyDRE.months
                    ).map((m) => {
                      const isSelected = selectedMonth !== 'ALL' && m.monthIndex === selectedMonth;
                      return (
                        <td
                          key={m.monthIndex}
                          className={`py-3 px-3 text-right font-mono font-bold text-rose-700 ${
                            isSelected ? 'bg-rose-100/80 font-black border-x-2 border-rose-400' : ''
                          }`}
                        >
                          -{formatCurrencyBR(m.custosOperacionais)}
                        </td>
                      );
                    })}
                    {selectedMonth !== 'ALL' && isolateMonthColumn && (
                      <td className="py-3 px-3 text-right font-mono font-black text-rose-700 bg-rose-50/80">
                        -{activeDREData.receitaLiquida > 0
                          ? `${Math.round((activeDREData.custosOperacionais / activeDREData.receitaLiquida) * 1000) / 10}%`
                          : '-'}
                      </td>
                    )}
                    <td className="py-3 px-4 text-right font-mono font-black text-rose-800 bg-rose-100/60">
                      -{formatCurrencyBR(monthlyDRE.totalAnual.custosOperacionais)}
                    </td>
                  </tr>

                  {/* Linha 5: Resultado Operacional Líquido */}
                  <tr
                    className={`font-black text-sm border-t-2 ${
                      activeDREData.resultadoLiquido >= 0
                        ? 'bg-gradient-to-r from-emerald-50/80 via-teal-50/80 to-emerald-100/60 text-emerald-950 border-emerald-500'
                        : 'bg-rose-50/90 text-rose-950 border-rose-500'
                    }`}
                  >
                    <td
                      className={`py-3.5 px-4 sticky left-0 z-10 border-r shadow-2xs ${
                        activeDREData.resultadoLiquido >= 0
                          ? 'bg-emerald-100/90 text-emerald-950 border-emerald-300'
                          : 'bg-rose-100/90 text-rose-950 border-rose-300'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <span>5. (=) Resultado Líquido do Mês</span>
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-white/70">
                          {activeDREData.resultadoLiquido >= 0 ? 'Superávit' : 'Déficit'}
                        </span>
                      </div>
                    </td>
                    {(selectedMonth !== 'ALL' && isolateMonthColumn
                      ? monthlyDRE.months.filter((m) => m.monthIndex === selectedMonth)
                      : monthlyDRE.months
                    ).map((m) => {
                      const isSelected = selectedMonth !== 'ALL' && m.monthIndex === selectedMonth;
                      return (
                        <td
                          key={m.monthIndex}
                          className={`py-3.5 px-3 text-right font-mono font-black ${
                            m.resultadoLiquido >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          } ${isSelected ? 'bg-indigo-100/90 ring-2 ring-indigo-500 font-black' : ''}`}
                        >
                          {formatCurrencyBR(m.resultadoLiquido)}
                        </td>
                      );
                    })}
                    {selectedMonth !== 'ALL' && isolateMonthColumn && (
                      <td
                        className={`py-3.5 px-3 text-right font-mono font-black ${
                          activeDREData.resultadoLiquido >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        } bg-indigo-50/80`}
                      >
                        {activeDREData.margemPercentual}%
                      </td>
                    )}
                    <td
                      className={`py-3.5 px-4 text-right font-mono font-black text-base ${
                        monthlyDRE.totalAnual.resultadoLiquido >= 0
                          ? 'text-emerald-800 bg-emerald-200/50'
                          : 'text-rose-800 bg-rose-200/50'
                      }`}
                    >
                      {formatCurrencyBR(monthlyDRE.totalAnual.resultadoLiquido)}
                    </td>
                  </tr>

                  {/* Linha 6: Margem Operacional */}
                  <tr className="bg-slate-50/60 font-semibold text-[11px] text-slate-600">
                    <td className="py-2.5 px-4 sticky left-0 bg-slate-50 z-10 font-bold text-slate-700 border-r border-slate-200 shadow-2xs">
                      6. Margem Operacional Líquida (%)
                    </td>
                    {(selectedMonth !== 'ALL' && isolateMonthColumn
                      ? monthlyDRE.months.filter((m) => m.monthIndex === selectedMonth)
                      : monthlyDRE.months
                    ).map((m) => {
                      const isSelected = selectedMonth !== 'ALL' && m.monthIndex === selectedMonth;
                      return (
                        <td
                          key={m.monthIndex}
                          className={`py-2.5 px-3 text-right font-mono font-bold ${
                            m.margemPercentual >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          } ${isSelected ? 'bg-indigo-100/80 font-black border-x-2 border-indigo-400' : ''}`}
                        >
                          {m.margemPercentual}%
                        </td>
                      );
                    })}
                    {selectedMonth !== 'ALL' && isolateMonthColumn && (
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-bold ${
                          activeDREData.margemPercentual >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        } bg-indigo-50/50`}
                      >
                        {activeDREData.margemPercentual}%
                      </td>
                    )}
                    <td
                      className={`py-2.5 px-4 text-right font-mono font-extrabold bg-slate-100 text-slate-900 ${
                        monthlyDRE.totalAnual.margemPercentual >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {monthlyDRE.totalAnual.margemPercentual}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabela Estruturada do DRE (Síntese Analítica) */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div>
                <h4 className="text-sm font-black text-slate-900">
                  Estrutura Contábil e Operacional de Resultados — {selectedAnoLetivo}
                </h4>
                <p className="text-xs text-slate-500 font-medium">
                  {activeDREData.isMonthly
                    ? `Apuração estrita da ${activeDREData.label} calculada em tempo real a partir das bases ativas`
                    : 'Valores mensais médios calculados em tempo real a partir das bases ativas'}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-slate-200 text-slate-700">
                  {activeDREData.isMonthly ? activeDREData.label : `Ano Letivo: ${selectedAnoLetivo}`}
                </span>
              </div>
            </div>

            <div className="divide-y divide-slate-100 font-sans text-xs">
              {/* 1. RECEITA OPERACIONAL BRUTA */}
              <div className="p-4 bg-slate-50/70 flex items-center justify-between font-black text-slate-900 text-sm">
                <div className="flex items-center space-x-2">
                  <span className="text-emerald-600 font-mono">1.</span>
                  <span>
                    RECEITA OPERACIONAL BRUTA ({activeDREData.isMonthly ? activeDREData.shortLabel : `Contratos de ${selectedAnoLetivo}`})
                  </span>
                </div>
                <span className="text-emerald-700 font-mono text-base">
                  {formatCurrencyBR(activeDREData.faturamentoBruto)}
                </span>
              </div>

              {/* Sub-item: Mensalidades Contratadas */}
              <div className="py-2.5 px-6 flex items-center justify-between text-slate-600 pl-10 text-xs">
                <span>(+) Faturamento Bruto dos Contratos ({resolvedProfiles.length} alunos cadastrados)</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {formatCurrencyBR(activeDREData.faturamentoBruto)}
                </span>
              </div>

              {/* 2. DEDUÇÕES DA RECEITA */}
              <div className="p-4 bg-slate-50/40 flex items-center justify-between font-bold text-slate-800">
                <div className="flex items-center space-x-2">
                  <span className="text-purple-600 font-mono">2.</span>
                  <span>(-) DEDUÇÕES DA RECEITA BRUTA</span>
                </div>
                <span className="text-purple-700 font-mono">
                  -{formatCurrencyBR(activeDREData.descontoBolsas)}
                </span>
              </div>

              {/* Sub-item: Bolsas e Descontos */}
              <div className="py-2.5 px-6 flex items-center justify-between text-slate-600 pl-10 text-xs">
                <span>(-) Bolsas de Estudo e Descontos Concedidos ({metrics.totalIsentos} alunos 100% isentos)</span>
                <span className="font-semibold text-purple-700 font-mono">
                  -{formatCurrencyBR(activeDREData.descontoBolsas)}
                </span>
              </div>

              {/* 3. RECEITA OPERACIONAL LÍQUIDA (ROL) */}
              <div className="p-4 bg-emerald-50/50 flex items-center justify-between font-black text-emerald-950 text-sm border-y border-emerald-100">
                <div className="flex items-center space-x-2">
                  <span className="text-emerald-700 font-mono">3.</span>
                  <span>(=) RECEITA OPERACIONAL LÍQUIDA (ROL)</span>
                </div>
                <span className="text-emerald-700 font-mono text-base">
                  {formatCurrencyBR(activeDREData.receitaLiquida)}
                </span>
              </div>

              {/* 4. CUSTOS OPERACIONAIS REAIS (DIRETOS) */}
              <div className="p-4 bg-slate-50/70 flex items-center justify-between font-black text-slate-900 text-sm">
                <div className="flex items-center space-x-2">
                  <span className="text-rose-600 font-mono">4.</span>
                  <span>(-) CUSTOS OPERACIONAIS REAIS (Livro Ponto + Cardápio)</span>
                </div>
                <span className="text-rose-700 font-mono text-base">
                  -{formatCurrencyBR(activeDREData.custosOperacionais)}
                </span>
              </div>

              {/* Sub-item: Folha de Pagamento */}
              <div className="py-3 px-6 flex items-center justify-between text-slate-700 pl-10 hover:bg-slate-50">
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-1.5 font-bold text-slate-900">
                    <span>4.1 Folha de Pagamento & Equipe (Livro Ponto)</span>
                    <span className="px-2 py-0.5 rounded-full text-[9.5px] bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Livro Ponto Real
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 block">
                    Banca contratual, ajuda de custo, horas extras e adicionais apurados dos colaboradores ativos
                  </span>
                </div>
                <span className="font-bold text-rose-700 font-mono text-xs">
                  -{formatCurrencyBR(activeDREData.custoFolha)}
                </span>
              </div>

              {/* Sub-item: Alimentação Escolar */}
              <div className="py-3 px-6 flex items-center justify-between text-slate-700 pl-10 hover:bg-slate-50">
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-1.5 font-bold text-slate-900">
                    <span>4.2 Alimentação Escolar & Insumos (Refeições)</span>
                    <span className="px-2 py-0.5 rounded-full text-[9.5px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Cardápio & Refeições
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 block">
                    Alunos na Rotina × 22 dias letivos no mês × custo por refeição registrado no Cardápio
                  </span>
                </div>
                <span className="font-bold text-rose-700 font-mono text-xs">
                  -{formatCurrencyBR(activeDREData.custoAlimentacao)}
                </span>
              </div>

              {/* 5. RESULTADO OPERACIONAL LÍQUIDO REAL */}
              <div
                className={`p-5 flex items-center justify-between text-base font-black ${
                  activeDREData.resultadoLiquido >= 0
                    ? 'bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100/60 text-emerald-950 border-t-2 border-emerald-500'
                    : 'bg-rose-50 text-rose-950 border-t-2 border-rose-500'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-lg">5.</span>
                    <span className="text-base sm:text-lg">(=) RESULTADO OPERACIONAL LÍQUIDO REAL</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-600 block pl-6">
                    Receita Líquida dos Alunos (-) Custos Operacionais Reais (Folha + Alimentação)
                  </span>
                </div>
                <div className="text-right">
                  <span
                    className={`font-mono text-xl sm:text-2xl font-black block ${
                      activeDREData.resultadoLiquido >= 0
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {formatCurrencyBR(activeDREData.resultadoLiquido)}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">
                    Margem Operacional Líquida: <strong className="text-slate-900">{activeDREData.margemPercentual}%</strong>
                  </span>
                </div>
              </div>
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
                    value={editingExpense.fornecedor || editingExpense.fornecedorOuBeneficiario || ''}
                    onChange={(e) =>
                      setEditingExpense({
                        ...editingExpense,
                        fornecedorOuBeneficiario: e.target.value,
                        fornecedor: e.target.value,
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

            {(() => {
              const modalAnoLetivo = editingProfile.anoLetivo || selectedAnoLetivo;
              const tabelaPlanosModal = getTabelaPlanosPorAno(modalAnoLetivo);
              const currentSelectedPlano = (editingProfile.planoContratual as PlanoContratualType) ||
                (editingProfile.planoHora === 'PARCIAL_4H' ? 'Diária Integral' : 'Integral Semana (18:30h)');

              const base = Number(editingProfile.valorMensalidadeBase) || 0;
              const extras = Number(editingProfile.valorModalidadesExtras) || 0;
              const pct = Number(editingProfile.descontoPercentual) || 0;
              const bolsa = Number(editingProfile.descontoBolsa) || 0;

              let currentCalculatedTotal = 0;
              if (bolsa > 0) {
                currentCalculatedTotal = Math.max(0, (base + extras) - bolsa);
              } else if (pct > 0) {
                currentCalculatedTotal = Math.max(0, calculateValorTotalMensal(base, extras, pct));
              } else {
                currentCalculatedTotal = Math.max(0, base + extras);
              }
              currentCalculatedTotal = Math.round(currentCalculatedTotal * 100) / 100;

              return (
                <div className="p-5 overflow-y-auto space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-700">
                        Plano de Horas Contratual (Tabela Oficial {modalAnoLetivo}):
                      </label>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Exercício {modalAnoLetivo}
                      </span>
                    </div>
                    <select
                      value={currentSelectedPlano}
                      onChange={(e) => {
                        const newPlano = e.target.value as PlanoContratualType;
                        const planInfo = tabelaPlanosModal[newPlano];
                        const newBase = newPlano === 'Personalizado'
                          ? editingProfile.valorMensalidadeBase
                          : (planInfo?.valorBase ?? editingProfile.valorMensalidadeBase);
                        const newPlanoHora: FinancialPlanHour =
                          newPlano === 'Diária Integral' ? 'PARCIAL_4H' :
                          newPlano === 'Personalizado' ? 'CUSTOMIZADO' : 'INTEGRAL_8H';

                        let newTot = 0;
                        if (bolsa > 0) {
                          newTot = Math.max(0, (newBase + extras) - bolsa);
                        } else if (pct > 0) {
                          newTot = Math.max(0, calculateValorTotalMensal(newBase, extras, pct));
                        } else {
                          newTot = Math.max(0, newBase + extras);
                        }

                        setEditingProfile({
                          ...editingProfile,
                          planoContratual: newPlano,
                          planoHora: newPlanoHora,
                          valorMensalidadeBase: newBase,
                          valorTotalMensal: Math.round(newTot * 100) / 100,
                        });
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {Object.entries(tabelaPlanosModal).map(([nomePlano, info]) => (
                        <option key={nomePlano} value={nomePlano}>
                          {nomePlano === 'Personalizado'
                            ? 'Personalizado / Valor Negociado'
                            : `${nomePlano} — ${formatCurrencyBR(info.valorBase)}`}
                        </option>
                      ))}
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
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          let newTot = 0;
                          if (bolsa > 0) {
                            newTot = Math.max(0, (val + extras) - bolsa);
                          } else if (pct > 0) {
                            newTot = Math.max(0, calculateValorTotalMensal(val, extras, pct));
                          } else {
                            newTot = Math.max(0, val + extras);
                          }
                          setEditingProfile({
                            ...editingProfile,
                            valorMensalidadeBase: val,
                            valorTotalMensal: Math.round(newTot * 100) / 100,
                          });
                        }}
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
                        onChange={(e) => {
                          const valExtras = parseFloat(e.target.value) || 0;
                          let newTot = 0;
                          if (bolsa > 0) {
                            newTot = Math.max(0, (base + valExtras) - bolsa);
                          } else if (pct > 0) {
                            newTot = Math.max(0, calculateValorTotalMensal(base, valExtras, pct));
                          } else {
                            newTot = Math.max(0, base + valExtras);
                          }
                          setEditingProfile({
                            ...editingProfile,
                            valorModalidadesExtras: valExtras,
                            valorTotalMensal: Math.round(newTot * 100) / 100,
                          });
                        }}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Bolsa / Desconto em R$:
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editingProfile.descontoBolsa ?? 0}
                        onChange={(e) => {
                          const valBolsa = Math.max(0, parseFloat(e.target.value) || 0);
                          const subtotal = base + extras;
                          const calculatedPct = subtotal > 0 ? Math.min(100, Math.round((valBolsa / subtotal) * 100)) : 0;
                          const newTot = Math.max(0, subtotal - valBolsa);
                          setEditingProfile({
                            ...editingProfile,
                            descontoBolsa: valBolsa,
                            descontoPercentual: calculatedPct,
                            valorTotalMensal: Math.round(newTot * 100) / 100,
                          });
                        }}
                        placeholder="R$ 0,00"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

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
                        onChange={(e) => {
                          const valPct = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                          const subtotal = base + extras;
                          const calculatedBolsa = Math.round(((subtotal * valPct) / 100) * 100) / 100;
                          const newTot = Math.max(0, subtotal - calculatedBolsa);
                          setEditingProfile({
                            ...editingProfile,
                            descontoPercentual: valPct,
                            descontoBolsa: calculatedBolsa,
                            valorTotalMensal: Math.round(newTot * 100) / 100,
                          });
                        }}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  </div>

                  <div className="p-4 bg-slate-900 text-white rounded-2xl flex items-center justify-between shadow-inner">
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
                        Valor Total Mensal Calculado ({modalAnoLetivo})
                      </span>
                      <span className="text-xl font-black text-emerald-400">
                        {formatCurrencyBR(currentCalculatedTotal)}
                      </span>
                    </div>
                    <div className="text-right text-[11px] text-slate-300 space-y-0.5">
                      <p>
                        Base: <span className="font-semibold text-white">{formatCurrencyBR(base)}</span>
                      </p>
                      <p>
                        Extras: <span className="font-semibold text-white">+{formatCurrencyBR(extras)}</span>
                      </p>
                      {bolsa > 0 ? (
                        <p className="text-emerald-300 font-bold">
                          Bolsa/Desc: -{formatCurrencyBR(bolsa)} ({pct}%)
                        </p>
                      ) : pct > 0 ? (
                        <p className="text-emerald-300 font-bold">Desc: -{pct}%</p>
                      ) : null}
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
              );
            })()}

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
