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
  const [defaultUnitPrice, setDefaultUnitPrice] = useState<number>(15.0);
  const [contractCompany, setContractCompany] = useState<string>('Cantina & Nutrição Escolar');
  const [responsibleCoordinator, setResponsibleCoordinator] = useState<string>(
    currentUser?.role === 'coordenador' ? (currentUser.name || 'Fernando Veiga') : 'Fernando Veiga'
  );
  const [coordinatorRole, setCoordinatorRole] = useState<string>('Coordenação do Integral / DP GAVAR');
  const [responsibleFinancial, setResponsibleFinancial] = useState<string>('Departamento Financeiro');
  const [financialRole, setFinancialRole] = useState<string>('Conferência & Prestação de Contas');
  const [generalNotes, setGeneralNotes] = useState<string>('');

  // Overrides em memória: { "2026-08-01": { manualCount: 20, unitPrice: 15, notes: "" } }
  const [customEntries, setCustomEntries] = useState<
    Record<string, { manualCount?: number; unitPrice?: number; notes?: string }>
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

  // Carregar dados salvos ao trocar de mês
  useEffect(() => {
    if (!isOpen) return;

    const saved = loadMealConfig(monthKey);
    if (saved) {
      setDefaultUnitPrice(saved.defaultUnitPrice ?? 15.0);
      setContractCompany(saved.contractCompany || 'Cantina & Nutrição Escolar');
      setResponsibleCoordinator(saved.responsibleCoordinator || (currentUser?.name || 'Fernando Veiga'));
      setCoordinatorRole(saved.coordinatorRole || 'Coordenação do Integral / DP GAVAR');
      setResponsibleFinancial(saved.responsibleFinancial || 'Departamento Financeiro');
      setFinancialRole(saved.financialRole || 'Conferência & Prestação de Contas');
      setGeneralNotes(saved.generalNotes || '');
      setCustomEntries(saved.entries || {});
    } else {
      setCustomEntries({});
    }
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

  // Aplicar preço padrão a todos os dias do período
  const handleApplyPriceToAll = () => {
    const updated: Record<string, { manualCount?: number; unitPrice?: number; notes?: string }> = { ...customEntries };
    activeEntries.forEach((e) => {
      updated[e.date] = {
        ...updated[e.date],
        unitPrice: defaultUnitPrice,
      };
    });
    setCustomEntries(updated);
    showNotice(`Preço unitário R$ ${defaultUnitPrice.toFixed(2)} aplicado ao período.`);
  };

  // Restaurar valores calculados pela chamada do sistema
  const handleResetToSystem = () => {
    if (!window.confirm('Deseja restaurar as quantidades de alunos conforme os registros originais da chamada do sistema?')) {
      return;
    }
    const updated: Record<string, { manualCount?: number; unitPrice?: number; notes?: string }> = {};
    activeEntries.forEach((e) => {
      if (e.isSchoolDay) {
        updated[e.date] = {
          manualCount: e.systemCount,
          unitPrice: defaultUnitPrice,
          notes: e.holidayName || '',
        };
      } else {
        updated[e.date] = {
          manualCount: 0,
          unitPrice: defaultUnitPrice,
          notes: e.holidayName || (e.dayOfWeek === 'sabado' || e.dayOfWeek === 'domingo' ? 'Final de Semana' : ''),
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

  // Salvar no storage
  const handleSave = () => {
    const configToSave: MealReportConfig = {
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
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name || 'Coordenação',
    };

    saveMealConfig(configToSave);
    showNotice('Relatório de refeições salvo com sucesso!');
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
                    onChange={(e) => setDefaultUnitPrice(parseFloat(e.target.value) || 0)}
                    className="text-xs font-black text-slate-800 bg-transparent border-b border-slate-300 focus:border-emerald-600 focus:outline-none w-14 text-right"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyPriceToAll}
                  className="ml-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
                  title="Aplica este valor unitário a todos os dias do período"
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
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

            <div className="bg-gradient-to-br from-emerald-500 to-teal-700 p-3 rounded-2xl text-white shadow-xs">
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
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
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

                        {/* Chamada Sistema */}
                        <td className="py-2 px-3 text-center">
                          {e.isSchoolDay ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700"
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
                  <td colSpan={3} className="py-3 px-4 text-left">
                    TOTAL DO PERÍODO ({totals.attendedDaysCount} dias faturados)
                  </td>
                  <td className="py-3 px-3 text-center text-amber-300 text-sm font-black">
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
                    Exportação em Excel inclui fórmulas ativas =D*E e =SOMA
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
              onClick={handleSave}
              className="px-4 py-2.5 rounded-2xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all cursor-pointer flex items-center space-x-1.5"
              title="Salvar alterações manuais feitas para este mês"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Alterações</span>
            </button>

            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Edições manuais salvas para prestação de contas
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
