import React, { useState, useEffect, useMemo } from 'react';
import {
  Student,
  AttendanceRecord,
  HolidayItem,
  UserProfile,
  MealDailyEntry,
  MealReportConfig,
} from '../types';
import {
  buildMealEntriesForDateRange,
  calculateMealTotals,
  exportMealReportToExcel,
  exportMealReportToCSV,
  loadMealConfig,
  saveMealConfig,
} from '../utils/mealFinanceUtils';
import { generateMealFinancialPDFReport } from '../utils/pdfGenerator';
import { PdfViewerModal } from './PdfViewerModal';
import { formatDateBR } from '../utils/dateUtils';
import {
  saveMealReportGlobalSettings,
  getMealReportGlobalSettings,
  saveMealReportToFirestore,
  getMealReportFromFirestore,
} from '../firebase';
import {
  Utensils,
  X,
  FileSpreadsheet,
  FileText,
  Printer,
  Save,
  RotateCcw,
  CheckCircle2,
  Calendar,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Building2,
  UserCheck,
  CalendarRange,
  Clock,
  Loader2,
  Cloud,
} from 'lucide-react';

interface MealReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  records: AttendanceRecord[];
  holidays: HolidayItem[];
  currentUser?: UserProfile | null;
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export const MealReportModal: React.FC<MealReportModalProps> = ({
  isOpen,
  onClose,
  students,
  records,
  holidays,
  currentUser,
}) => {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1); // 1-12

  const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  const daysInCurrentMonth = new Date(selectedYear, selectedMonth, 0).getDate();

  // Filtro de Período Personalizado / Quinzenal (De: Data Inicial até Data Final)
  const [startDate, setStartDate] = useState<string>(
    `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
  );
  const [endDate, setEndDate] = useState<string>(
    `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(daysInCurrentMonth).padStart(2, '0')}`
  );

  // Configuração e valores customizados por dia
  const [defaultUnitPrice, setDefaultUnitPrice] = useState<number>(9.0);
  const [contractCompany, setContractCompany] = useState<string>('Cantina & Nutrição Escolar');
  const [isLoadingFromFirestore, setIsLoadingFromFirestore] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [responsibleCoordinator, setResponsibleCoordinator] = useState<string>(
    currentUser?.role === 'coordenador' ? (currentUser.name || 'Fernando Veiga') : 'Fernando Veiga'
  );
  const [coordinatorRole, setCoordinatorRole] = useState<string>('Coordenação do Integral / DP GAVAR');
  const [responsibleFinancial, setResponsibleFinancial] = useState<string>('Departamento Financeiro');
  const [financialRole, setFinancialRole] = useState<string>('Conferência & Prestação de Contas');
  const [generalNotes, setGeneralNotes] = useState<string>('');

  // Overrides em memória: { "2026-08-01": { manualCount: 20, unitPrice: 15, notes: "", isManualOverride: true } }
  const [customEntries, setCustomEntries] = useState<
    Record<string, { manualCount?: number; unitPrice?: number; notes?: string; isManualOverride?: boolean }>
  >({});

  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // PDF Preview State
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

  // Atualiza as datas padrão quando o mês/ano selecionado muda
  useEffect(() => {
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    setStartDate(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`);
    setEndDate(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
  }, [selectedYear, selectedMonth]);

  // Carregar dados salvos ao trocar de mês (Lê do Firestore e fallback do storage local)
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    async function loadSettingsAndReport() {
      setIsLoadingFromFirestore(true);

      // 1. Leitura rápida do cache local para resposta imediata
      const localGlobal = localStorage.getItem('crescer_meal_global_settings');
      let cachedGlobal: { unitPrice?: number; providerName?: string; responsibleCoordinator?: string; coordinatorRole?: string; responsibleFinancial?: string; financialRole?: string } | null = null;
      if (localGlobal) {
        try {
          cachedGlobal = JSON.parse(localGlobal);
        } catch (e) {
          // ignore
        }
      }
      const localMonth = loadMealConfig(monthKey);

      const activeEnrolledCount =
        students.filter((s) => s.status !== 'inativo' && s.status !== 'cancelado').length ||
        students.length ||
        212;

      const sanitizeLoadedEntries = (
        rawEntries?: Record<string, { manualCount?: number; unitPrice?: number; notes?: string; isManualOverride?: boolean }>
      ) => {
        if (!rawEntries) return {};
        const sanitized: Record<string, { manualCount?: number; unitPrice?: number; notes?: string; isManualOverride?: boolean }> = {};
        Object.entries(rawEntries).forEach(([dateKey, val]) => {
          if (!val) return;
          const isLegacy =
            val.manualCount !== undefined &&
            (val.manualCount >= 180 ||
              val.manualCount === activeEnrolledCount ||
              val.manualCount === 211 ||
              val.manualCount === 212 ||
              val.manualCount === 213 ||
              val.manualCount === 214 ||
              val.manualCount === 215 ||
              val.manualCount === 231);

          sanitized[dateKey] = {
            ...val,
            manualCount: isLegacy ? undefined : val.manualCount,
            isManualOverride: isLegacy ? false : Boolean(val.isManualOverride),
          };
        });
        return sanitized;
      };

      // Aplica valores iniciais do cache
      const initialPrice = localMonth?.defaultUnitPrice ?? cachedGlobal?.unitPrice ?? 9.0;
      const initialProvider = localMonth?.providerName || localMonth?.contractCompany || cachedGlobal?.providerName || 'Cantina & Nutrição Escolar';

      setDefaultUnitPrice(initialPrice);
      setContractCompany(initialProvider);
      if (localMonth?.responsibleCoordinator) setResponsibleCoordinator(localMonth.responsibleCoordinator);
      if (localMonth?.coordinatorRole) setCoordinatorRole(localMonth.coordinatorRole);
      if (localMonth?.responsibleFinancial) setResponsibleFinancial(localMonth.responsibleFinancial);
      if (localMonth?.financialRole) setFinancialRole(localMonth.financialRole);
      if (localMonth?.generalNotes) setGeneralNotes(localMonth.generalNotes);
      if (localMonth?.entries) setCustomEntries(sanitizeLoadedEntries(localMonth.entries));

      // 2. Leitura definitiva no Firestore (settings/mealReport e mealReports/{monthKey})
      try {
        const [firestoreGlobal, firestoreMonth] = await Promise.all([
          getMealReportGlobalSettings(),
          getMealReportFromFirestore(monthKey),
        ]);

        if (!isMounted) return;

        // Configurações globais persistidas no Firestore
        const globalPrice = firestoreGlobal?.unitPrice ?? cachedGlobal?.unitPrice ?? 9.0;
        const globalProvider = firestoreGlobal?.providerName ?? cachedGlobal?.providerName ?? 'Cantina & Nutrição Escolar';

        if (firestoreMonth) {
          setDefaultUnitPrice(firestoreMonth.defaultUnitPrice !== undefined ? Number(firestoreMonth.defaultUnitPrice) : globalPrice);
          setContractCompany(firestoreMonth.providerName || firestoreMonth.contractCompany || globalProvider);
          if (firestoreMonth.responsibleCoordinator) setResponsibleCoordinator(firestoreMonth.responsibleCoordinator);
          if (firestoreMonth.coordinatorRole) setCoordinatorRole(firestoreMonth.coordinatorRole);
          if (firestoreMonth.responsibleFinancial) setResponsibleFinancial(firestoreMonth.responsibleFinancial);
          if (firestoreMonth.financialRole) setFinancialRole(firestoreMonth.financialRole);
          if (firestoreMonth.generalNotes) setGeneralNotes(firestoreMonth.generalNotes);
          if (firestoreMonth.entries) setCustomEntries(sanitizeLoadedEntries(firestoreMonth.entries));
        } else {
          // Sem relatório específico para o mês ainda: utiliza os padrões globais do Firestore
          setDefaultUnitPrice(globalPrice);
          setContractCompany(globalProvider);
          if (firestoreGlobal?.responsibleCoordinator) setResponsibleCoordinator(firestoreGlobal.responsibleCoordinator);
          if (firestoreGlobal?.coordinatorRole) setCoordinatorRole(firestoreGlobal.coordinatorRole);
          if (firestoreGlobal?.responsibleFinancial) setResponsibleFinancial(firestoreGlobal.responsibleFinancial);
          if (firestoreGlobal?.financialRole) setFinancialRole(firestoreGlobal.financialRole);
          if (!localMonth) {
            setCustomEntries({});
          }
        }
      } catch (err) {
        console.warn('Erro ao sincronizar relatório de refeições com Firestore:', err);
      } finally {
        if (isMounted) {
          setIsLoadingFromFirestore(false);
        }
      }
    }

    loadSettingsAndReport();

    return () => {
      isMounted = false;
    };
  }, [monthKey, isOpen, currentUser]);

  // Identificação do período ativo (ex: 1ª Quinzena, 2ª Quinzena, Mês Completo ou Personalizado)
  const periodInfo = useMemo(() => {
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const isFirstFortnight =
      startDate === `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01` &&
      endDate === `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-15`;

    const isSecondFortnight =
      startDate === `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-16` &&
      endDate === `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const isFullMonth =
      startDate === `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01` &&
      endDate === `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    let label = '';
    let shortTag = 'Personalizado';

    if (isFirstFortnight) {
      label = `1ª Quinzena (01/08 a 15/08) - ${MONTH_NAMES[selectedMonth - 1]} de ${selectedYear}`;
      shortTag = '1ª Quinzena';
    } else if (isSecondFortnight) {
      label = `2ª Quinzena (16/${String(selectedMonth).padStart(2, '0')} a ${lastDay}/${String(selectedMonth).padStart(2, '0')}) - ${MONTH_NAMES[selectedMonth - 1]} de ${selectedYear}`;
      shortTag = '2ª Quinzena';
    } else if (isFullMonth) {
      label = `${MONTH_NAMES[selectedMonth - 1]} de ${selectedYear} (Mês Completo)`;
      shortTag = 'Mês Completo';
    } else {
      label = `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`;
      shortTag = 'Período Personalizado';
    }

    return {
      label,
      shortTag,
      isFirstFortnight,
      isSecondFortnight,
      isFullMonth,
    };
  }, [startDate, endDate, selectedYear, selectedMonth]);

  // Montar lista de dias consolidada para o período selecionado
  const activeEntries = useMemo(() => {
    const configMock: MealReportConfig = {
      id: monthKey,
      monthKey,
      year: selectedYear,
      month: selectedMonth,
      startDate,
      endDate,
      defaultUnitPrice,
      entries: customEntries,
      contractCompany,
      responsibleCoordinator,
      coordinatorRole,
      responsibleFinancial,
      financialRole,
      generalNotes,
    };

    return buildMealEntriesForDateRange(
      startDate,
      endDate,
      students,
      records,
      holidays,
      configMock,
      defaultUnitPrice
    );
  }, [
    startDate,
    endDate,
    selectedYear,
    selectedMonth,
    students,
    records,
    holidays,
    customEntries,
    defaultUnitPrice,
    contractCompany,
    responsibleCoordinator,
    coordinatorRole,
    responsibleFinancial,
    financialRole,
    generalNotes,
    monthKey,
  ]);

  const totals = useMemo(() => calculateMealTotals(activeEntries), [activeEntries]);

  // Presets de Quinzena / Mês
  const handleSelectFirstFortnight = () => {
    setStartDate(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`);
    setEndDate(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-15`);
  };

  const handleSelectSecondFortnight = () => {
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    setStartDate(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-16`);
    setEndDate(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
  };

  const handleSelectFullMonth = () => {
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    setStartDate(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`);
    setEndDate(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
  };

  // Handlers de Edição Diária
  const handleUpdateDayCount = (dateStr: string, val: string) => {
    const num = val === '' ? 0 : Math.max(0, parseInt(val, 10) || 0);
    setCustomEntries((prev) => ({
      ...prev,
      [dateStr]: {
        ...prev[dateStr],
        manualCount: num,
        isManualOverride: true,
      },
    }));
  };

  const handleUpdateDayPrice = (dateStr: string, val: string) => {
    const clean = val.replace(',', '.');
    const num = clean === '' ? 0 : Math.max(0, parseFloat(clean) || 0);
    setCustomEntries((prev) => ({
      ...prev,
      [dateStr]: {
        ...prev[dateStr],
        unitPrice: num,
      },
    }));
  };

  const handleUpdateDayNotes = (dateStr: string, val: string) => {
    setCustomEntries((prev) => ({
      ...prev,
      [dateStr]: {
        ...prev[dateStr],
        notes: val,
      },
    }));
  };

  // Manipulador para alteração do valor unitário padrão com recálculo dinâmico
  const handleDefaultUnitPriceChange = (valStr: string) => {
    const clean = valStr.replace(',', '.');
    const num = clean === '' ? 0 : Math.max(0, parseFloat(clean) || 0);
    const oldPrice = defaultUnitPrice;
    setDefaultUnitPrice(num);

    // Recálculo automático: atualiza todos os dias que usavam o valor padrão anterior
    setCustomEntries((prev) => {
      const updated = { ...prev };
      let changed = false;
      Object.keys(updated).forEach((d) => {
        if (updated[d]?.unitPrice === undefined || updated[d]?.unitPrice === oldPrice) {
          updated[d] = {
            ...updated[d],
            unitPrice: num,
          };
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  };

  // Aplicar preço padrão a todos os dias do período (Recálculo instantâneo geral)
  const handleApplyPriceToAll = (priceOverride?: number) => {
    const priceToApply = priceOverride !== undefined ? priceOverride : defaultUnitPrice;
    const updated: Record<string, { manualCount?: number; unitPrice?: number; notes?: string; isManualOverride?: boolean }> = { ...customEntries };
    activeEntries.forEach((e) => {
      updated[e.date] = {
        ...updated[e.date],
        manualCount: e.manualCount,
        unitPrice: priceToApply,
        notes: e.notes || '',
        isManualOverride: e.isManualOverride,
      };
    });
    setCustomEntries(updated);
    showNotice(`Preço unitário R$ ${priceToApply.toFixed(2).replace('.', ',')} aplicado a todas as linhas do período.`);
  };

  // Restaurar valores calculados pela chamada do sistema
  const handleResetToSystem = () => {
    if (!window.confirm('Deseja restaurar as quantidades de alunos conforme os registros originais da chamada do sistema?')) {
      return;
    }
    const updated: Record<string, { manualCount?: number; unitPrice?: number; notes?: string; isManualOverride?: boolean }> = {};
    activeEntries.forEach((e) => {
      if (e.isSchoolDay) {
        updated[e.date] = {
          manualCount: e.systemCount,
          unitPrice: defaultUnitPrice,
          notes: e.holidayName || '',
          isManualOverride: false,
        };
      } else {
        updated[e.date] = {
          manualCount: 0,
          unitPrice: defaultUnitPrice,
          notes: e.holidayName || (e.dayOfWeek === 'sabado' || e.dayOfWeek === 'domingo' ? 'Final de Semana' : ''),
          isManualOverride: false,
        };
      }
    });
    setCustomEntries(updated);
    showNotice('Quantidades restauradas conforme a chamada do sistema.');
  };

  const showNotice = (msg: string) => {
    setSaveSuccessNotice(msg);
    setTimeout(() => setSaveSuccessNotice(null), 3500);
  };

  // Salvar no storage local e persistir definitivamente no Firestore
  const handleSave = async () => {
    setIsSaving(true);
    const cleanUnitPrice = Number(defaultUnitPrice) || 9.0;
    const cleanCompany = (contractCompany || 'Cantina & Nutrição Escolar').trim();

    const configToSave: MealReportConfig = {
      id: monthKey,
      monthKey,
      year: selectedYear,
      month: selectedMonth,
      startDate,
      endDate,
      defaultUnitPrice: cleanUnitPrice,
      entries: customEntries,
      contractCompany: cleanCompany,
      providerName: cleanCompany,
      responsibleCoordinator,
      coordinatorRole,
      responsibleFinancial,
      financialRole,
      generalNotes,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name || 'Coordenação',
    };

    try {
      // 1. Salvar no localStorage (backup e cache local instantâneo)
      saveMealConfig(configToSave);

      // 2. Persistir no Firestore: documento mensal (mealReports/{monthKey}) E configurações globais (settings/mealReport)
      await Promise.all([
        saveMealReportToFirestore(configToSave),
        saveMealReportGlobalSettings({
          unitPrice: cleanUnitPrice,
          providerName: cleanCompany,
          responsibleCoordinator,
          coordinatorRole,
          responsibleFinancial,
          financialRole,
          updatedBy: currentUser?.name || 'Coordenação',
        }),
      ]);

      showNotice('Configurações e fechamento de refeições salvos no banco de dados (Firestore) com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar relatório de refeições no Firestore:', error);
      showNotice('Salvo localmente com segurança.');
    } finally {
      setIsSaving(false);
    }
  };

  // Navegação de Mês
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((prev) => prev - 1);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((prev) => prev + 1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  // Exportar Excel (.xlsx com fórmulas ativas)
  const handleExportExcel = () => {
    const config: MealReportConfig = {
      id: monthKey,
      monthKey,
      year: selectedYear,
      month: selectedMonth,
      startDate,
      endDate,
      defaultUnitPrice,
      entries: customEntries,
      contractCompany,
      responsibleCoordinator,
      coordinatorRole,
      responsibleFinancial,
      financialRole,
      generalNotes,
    };
    exportMealReportToExcel(activeEntries, periodInfo.label, config);
    showNotice('Planilha Excel (.xlsx) baixada com fórmulas ativas!');
  };

  // Exportar CSV
  const handleExportCSV = () => {
    const config: MealReportConfig = {
      id: monthKey,
      monthKey,
      year: selectedYear,
      month: selectedMonth,
      startDate,
      endDate,
      defaultUnitPrice,
      entries: customEntries,
      contractCompany,
      responsibleCoordinator,
      coordinatorRole,
      responsibleFinancial,
      financialRole,
      generalNotes,
    };
    exportMealReportToCSV(activeEntries, periodInfo.label, config);
    showNotice('Arquivo CSV baixado com sucesso!');
  };

  // Gerar PDF Oficial com Assinatura Vertical e sem duplicidade
  const handleGeneratePDF = () => {
    const config = {
      monthKey,
      startDate,
      endDate,
      defaultUnitPrice,
      contractCompany,
      responsibleCoordinator,
      coordinatorRole,
      responsibleFinancial,
      financialRole,
      generalNotes,
    };

    const result = generateMealFinancialPDFReport(activeEntries, periodInfo.label, config, false);

    setPdfPreviewState({
      isOpen: true,
      doc: result.doc,
      dataUrl: result.dataUrl,
      blobUrl: result.blobUrl,
      filename: result.filename,
      title: `Relatório Financeiro de Refeições - ${periodInfo.shortTag}`,
      onDownload: result.download,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0 border-b border-indigo-900/50">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Utensils className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-black tracking-tight text-white">
                  Relatório Financeiro de Refeições (Almoço)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 uppercase tracking-wide">
                  {periodInfo.shortTag}
                </span>
                {isLoadingFromFirestore ? (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-amber-300 border border-amber-400/30">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Sincronizando Nuvem...</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30" title="Conectado ao Firestore">
                    <Cloud className="w-3 h-3" />
                    <span>Sync Nuvem Ativo</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-indigo-200/80">
                Filtro por período quinzenal, conferência diária, valores unitários e fechamento financeiro
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success Toast */}
        {saveSuccessNotice && (
          <div className="bg-emerald-600 text-white text-xs font-bold px-6 py-2.5 flex items-center justify-between shrink-0 animate-in slide-in-from-top duration-150">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{saveSuccessNotice}</span>
            </div>
            <button
              onClick={() => setSaveSuccessNotice(null)}
              className="p-1 hover:bg-emerald-700 rounded-lg text-emerald-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Subheader: Month Picker & Fortnightly Filters */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0 space-y-3">
          {/* Row 1: Month Selector & Fortnight Presets */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Month Navigation */}
            <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-2xl border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                title="Mês Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center space-x-2 px-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-black text-slate-800">
                  {MONTH_NAMES[selectedMonth - 1]} de {selectedYear}
                </span>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                title="Próximo Mês"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Fortnightly Filter Buttons */}
            <div className="flex items-center space-x-1.5 bg-slate-200/70 p-1 rounded-2xl">
              <button
                type="button"
                onClick={handleSelectFirstFortnight}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                  periodInfo.isFirstFortnight
                    ? 'bg-white text-indigo-900 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
                title="Filtrar de 01 a 15 do mês"
              >
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>1ª Quinzena (01 a 15)</span>
              </button>

              <button
                type="button"
                onClick={handleSelectSecondFortnight}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                  periodInfo.isSecondFortnight
                    ? 'bg-white text-indigo-900 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
                title="Filtrar do dia 16 até o fim do mês"
              >
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                <span>2ª Quinzena (16 a fim)</span>
              </button>

              <button
                type="button"
                onClick={handleSelectFullMonth}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  periodInfo.isFullMonth
                    ? 'bg-white text-slate-900 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
                title="Filtrar todo o mês"
              >
                Mês Completo
              </button>
            </div>

            {/* Price & Prestador */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Prestador */}
              <div className="flex items-center space-x-1.5 bg-white px-3 py-1.5 rounded-2xl border border-slate-200">
                <Building2 className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-500">Cantina/Prestador:</span>
                <input
                  type="text"
                  value={contractCompany}
                  onChange={(e) => setContractCompany(e.target.value)}
                  placeholder="Ex: Cantina Escolar"
                  className="text-xs font-semibold text-slate-800 bg-transparent border-b border-slate-300 focus:border-indigo-600 focus:outline-none px-1 w-36"
                />
              </div>

              {/* Valor Unitário Padrão */}
              <div className="flex items-center space-x-1.5 bg-white px-3 py-1.5 rounded-2xl border border-slate-200">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-500">Unitário Padrão:</span>
                <div className="flex items-center">
                  <span className="text-xs font-bold text-slate-400 mr-1">R$</span>
                  <input
                    type="number"
                    step="0.50"
                    min="0"
                    value={defaultUnitPrice}
                    onChange={(e) => handleDefaultUnitPriceChange(e.target.value)}
                    className="text-xs font-black text-slate-800 bg-transparent border-b border-slate-300 focus:border-emerald-600 focus:outline-none w-14 text-right"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleApplyPriceToAll(defaultUnitPrice)}
                  className="ml-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
                  title="Aplica este valor unitário a todos os dias do período e recalcula os totais"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Custom Date Range Pickers & Reset */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-200/60">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-2xl border border-slate-200">
                <CalendarRange className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-600">De:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                />
              </div>

              <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-slate-600">Até:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                />
              </div>

              <span className="text-xs font-bold text-indigo-900 bg-indigo-50 px-2.5 py-1 rounded-xl border border-indigo-200">
                {periodInfo.label}
              </span>
            </div>

            {/* Restaurar Chamada */}
            <button
              type="button"
              onClick={handleResetToSystem}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-2xl text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
              title="Recalcular com as presenças reais da chamada do sistema"
            >
              <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
              <span>Restaurar Chamada</span>
            </button>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
                Total Esperados (Ativos)
              </span>
              <div className="flex items-baseline space-x-1.5">
                <span className="text-xl font-black text-slate-800">{totals.totalEsperados}</span>
                <span className="text-xs font-medium text-slate-500">esperados</span>
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
                Total de Refeições
              </span>
              <div className="flex items-baseline space-x-1.5">
                <span className="text-xl font-black text-indigo-950">{totals.totalMeals}</span>
                <span className="text-xs font-medium text-slate-500">refeições</span>
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
                Dias com Almoço
              </span>
              <div className="flex items-baseline space-x-1.5">
                <span className="text-xl font-black text-slate-800">{totals.attendedDaysCount}</span>
                <span className="text-xs font-medium text-slate-500">de {totals.schoolDaysCount} letivos</span>
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
                Média Diária
              </span>
              <div className="flex items-baseline space-x-1.5">
                <span className="text-xl font-black text-slate-800">{totals.averageMealsPerDay}</span>
                <span className="text-xs font-medium text-slate-500">alunos/dia</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-teal-700 p-3 rounded-2xl text-white shadow-xs col-span-2 sm:col-span-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-100 block mb-0.5">
                Total do Período (R$)
              </span>
              <div className="flex items-baseline space-x-1">
                <span className="text-xs font-bold text-emerald-200">R$</span>
                <span className="text-xl font-black text-white">
                  {totals.totalAmount.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Table Area */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-3 w-28 text-center">Data</th>
                  <th className="py-3 px-3 w-32">Dia da Semana</th>
                  <th className="py-3 px-3 w-36 text-center" title="Total Esperados = Presenças + Faltas + Atestados + Pendentes">
                    Total Esperados (Ativos)
                  </th>
                  <th className="py-3 px-3 w-28 text-center" title="Presentes apurados automaticamente na chamada de rotina do dia">
                    Chamada (Auto)
                  </th>
                  <th className="py-3 px-3 w-36 text-center">
                    <span className="flex items-center justify-center space-x-1">
                      <Edit3 className="w-3 h-3 text-amber-400" />
                      <span>Alunos (Editável)</span>
                    </span>
                  </th>
                  <th className="py-3 px-3 w-32 text-right">Valor Unit. (R$)</th>
                  <th className="py-3 px-3 w-32 text-right">Total Diário</th>
                  <th className="py-3 px-3">Observações / Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeEntries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 font-medium">
                      Nenhum dia encontrado para o intervalo de datas selecionado.
                    </td>
                  </tr>
                ) : (
                  activeEntries.map((e) => {
                    const isWeekend = e.dayOfWeek === 'sabado' || e.dayOfWeek === 'domingo';
                    const isHoliday = !!e.holidayName;
                    const isZero = e.manualCount === 0;

                    return (
                      <tr
                        key={e.date}
                        className={`transition-colors hover:bg-slate-50/80 ${
                          isHoliday
                            ? 'bg-rose-50/50'
                            : isWeekend
                            ? 'bg-slate-50/40 text-slate-400'
                            : isZero
                            ? 'bg-amber-50/30'
                            : 'bg-white'
                        }`}
                      >
                        {/* Data */}
                        <td className="py-2 px-3 text-center font-black text-slate-800 whitespace-nowrap">
                          {formatDateBR(e.date)}
                        </td>

                        {/* Dia da Semana */}
                        <td className="py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">
                          {e.dayLabel}
                        </td>

                        {/* Total Esperados (Ativos) */}
                        <td className="py-2 px-3 text-center">
                          {e.isSchoolDay ? (
                            <div className="inline-flex flex-col items-center">
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-800 border border-slate-200"
                                title={`Total de Alunos Matriculados Ativos: ${e.totalEsperados && e.totalEsperados > 0 ? e.totalEsperados : (students.filter((s) => s.status !== 'inativo' && s.status !== 'cancelado').length || 212)}`}
                              >
                                {e.totalEsperados && e.totalEsperados > 0 ? e.totalEsperados : (students.filter((s) => s.status !== 'inativo' && s.status !== 'cancelado').length || 212)}
                              </span>
                              {(e.faltas || e.atestados) ? (
                                <span className="text-[9px] text-slate-400 mt-0.5 font-medium">
                                  {e.presentes ?? e.systemCount}P + {e.faltas ?? 0}F{e.atestados ? ` + ${e.atestados}A` : ''}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-slate-300 font-bold">-</span>
                          )}
                        </td>

                        {/* Chamada Sistema */}
                        <td className="py-2 px-3 text-center">
                          {e.isSchoolDay ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                              title="Presenças registradas na chamada oficial de Rotina"
                            >
                              {e.systemCount} al
                            </span>
                          ) : (
                            <span className="text-slate-300 font-bold">-</span>
                          )}
                        </td>

                        {/* Alunos Presentes (Editável) */}
                        <td className="py-2 px-3 text-center">
                          <div className="inline-flex items-center justify-center space-x-1">
                            <input
                              type="number"
                              min="0"
                              value={e.manualCount}
                              onChange={(ev) => handleUpdateDayCount(e.date, ev.target.value)}
                              className={`w-18 px-2 py-1 text-center font-black rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                                e.manualCount !== e.systemCount && e.isSchoolDay
                                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                                  : 'bg-white border-slate-200 text-slate-900'
                              }`}
                            />
                            <span className="text-[10px] text-slate-400 font-bold">un</span>
                          </div>
                        </td>

                        {/* Valor Unitário (Editável) */}
                        <td className="py-2 px-3 text-right">
                          <div className="inline-flex items-center justify-end space-x-1">
                            <span className="text-slate-400 text-[10px] font-bold">R$</span>
                            <input
                              type="number"
                              step="0.50"
                              min="0"
                              value={e.unitPrice}
                              onChange={(ev) => handleUpdateDayPrice(e.date, ev.target.value)}
                              className="w-18 px-2 py-1 text-right font-black rounded-lg border border-slate-200 text-xs bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </td>

                        {/* Total Diário */}
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <span
                            className={`font-black ${
                              e.total > 0 ? 'text-emerald-700 font-bold' : 'text-slate-300'
                            }`}
                          >
                            R${' '}
                            {e.total.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </td>

                        {/* Observações */}
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={e.notes || ''}
                            onChange={(ev) => handleUpdateDayNotes(e.date, ev.target.value)}
                            placeholder={
                              isHoliday
                                ? e.holidayName
                                : isWeekend
                                ? 'Final de semana'
                                : 'Ex: Reposição, Refeição extra...'
                            }
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-[11px] bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Totalizador de Rodapé */}
              <tfoot>
                <tr className="bg-slate-900 text-white font-black text-xs">
                  <td colSpan={2} className="py-3 px-4 text-left">
                    TOTAL DO PERÍODO ({totals.attendedDaysCount} dias faturados)
                  </td>
                  <td className="py-3 px-3 text-center text-slate-200 text-sm font-black whitespace-nowrap">
                    {totals.totalEsperados} al
                  </td>
                  <td className="py-3 px-3 text-center text-emerald-300 text-sm font-black whitespace-nowrap">
                    {totals.totalSystemMeals} al
                  </td>
                  <td className="py-3 px-3 text-center text-amber-300 text-sm font-black whitespace-nowrap">
                    {totals.totalMeals} un
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">-</td>
                  <td className="py-3 px-3 text-right text-emerald-300 text-sm font-black whitespace-nowrap">
                    R${' '}
                    {totals.totalAmount.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="py-3 px-3 text-slate-400 text-[11px] font-normal">
                    Fórmula Oficial: Total Esperados = Presenças + Faltas + Atestados
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Validation Fields & Signatures Layout Configuration */}
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Bloco 1: Coordenação */}
            <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200">
              <label className="block font-bold text-slate-800 flex items-center space-x-1.5">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                <span>Assinatura 1 - Coordenação do Integral</span>
              </label>
              <div>
                <span className="text-[10px] font-bold text-slate-500 block mb-0.5">Nome Completo:</span>
                <input
                  type="text"
                  value={responsibleCoordinator}
                  onChange={(e) => setResponsibleCoordinator(e.target.value)}
                  placeholder="Nome do Coordenador"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 block mb-0.5">Cargo / Função:</span>
                <input
                  type="text"
                  value={coordinatorRole}
                  onChange={(e) => setCoordinatorRole(e.target.value)}
                  placeholder="Ex: Coordenação do Integral / DP GAVAR"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                />
              </div>
            </div>

            {/* Bloco 2: Departamento Financeiro */}
            <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200">
              <label className="block font-bold text-slate-800 flex items-center space-x-1.5">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>Assinatura 2 - Departamento Financeiro</span>
              </label>
              <div>
                <span className="text-[10px] font-bold text-slate-500 block mb-0.5">Nome / Setor:</span>
                <input
                  type="text"
                  value={responsibleFinancial}
                  onChange={(e) => setResponsibleFinancial(e.target.value)}
                  placeholder="Ex: Departamento Financeiro"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 block mb-0.5">Cargo / Função:</span>
                <input
                  type="text"
                  value={financialRole}
                  onChange={(e) => setFinancialRole(e.target.value)}
                  placeholder="Ex: Conferência & Prestação de Contas"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 shrink-0 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className={`px-4 py-2.5 rounded-2xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all cursor-pointer flex items-center space-x-1.5 ${
                isSaving ? 'opacity-75 cursor-not-allowed' : ''
              }`}
              title="Salvar alterações manuais e configurações no Firestore"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Salvando na Nuvem...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Salvar Alterações</span>
                </>
              )}
            </button>

            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Edições e valores padrão persistidos na nuvem (Firestore)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Excel Export */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3.5 py-2.5 rounded-2xl text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 shadow-2xs transition-all cursor-pointer flex items-center space-x-1.5"
              title="Baixar planilha editável em Excel (.xlsx) com fórmulas nativas"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>Baixar Excel (.xlsx)</span>
            </button>

            {/* CSV Export */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-2.5 rounded-2xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-200 border border-slate-300 transition-all cursor-pointer flex items-center space-x-1.5"
              title="Baixar arquivo em formato CSV"
            >
              <FileText className="w-4 h-4 text-slate-600" />
              <span>CSV</span>
            </button>

            {/* PDF Report */}
            <button
              type="button"
              onClick={handleGeneratePDF}
              className="px-4 py-2.5 rounded-2xl text-xs font-black text-white bg-slate-900 hover:bg-slate-800 shadow-sm transition-all cursor-pointer flex items-center space-x-1.5"
              title="Gerar e Visualizar Relatório em PDF com assinaturas"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>Gerar PDF de Fechamento</span>
            </button>
          </div>
        </div>
      </div>

      {/* PDF Viewer Modal */}
      {pdfPreviewState.isOpen && (
        <PdfViewerModal
          isOpen={pdfPreviewState.isOpen}
          onClose={() => setPdfPreviewState((prev) => ({ ...prev, isOpen: false }))}
          doc={pdfPreviewState.doc}
          dataUrl={pdfPreviewState.dataUrl}
          pdfDataUrl={pdfPreviewState.dataUrl}
          blobUrl={pdfPreviewState.blobUrl}
          filename={pdfPreviewState.filename}
          title={pdfPreviewState.title}
          onDownload={pdfPreviewState.onDownload}
        />
      )}
    </div>
  );
};
