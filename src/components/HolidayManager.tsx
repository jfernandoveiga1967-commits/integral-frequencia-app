import React, { useState, useMemo } from 'react';
import {
  Calendar,
  CalendarDays,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Info,
  Search,
  RefreshCw,
  Coffee,
  CalendarOff,
  CalendarRange,
  Clock,
  X,
  AlertCircle,
} from 'lucide-react';
import { HolidayItem, HolidayType } from '../types';
import { INITIAL_HOLIDAYS } from '../data/initialData';
import {
  getDayNameFull,
  formatDateBR,
  calculateHolidayDuration,
  formatHolidayRange,
  formatHolidayRangeShort,
} from '../utils/dateUtils';

interface HolidayManagerProps {
  holidays: HolidayItem[];
  onSaveHoliday: (holiday: HolidayItem) => void;
  onDeleteHoliday: (holidayId: string) => void;
  onBatchSaveHolidays?: (holidays: HolidayItem[]) => void;
}

export const HolidayManager: React.FC<HolidayManagerProps> = ({
  holidays = [],
  onSaveHoliday,
  onDeleteHoliday,
  onBatchSaveHolidays,
}) => {
  const currentYear = new Date().getFullYear();

  // Filter and search state
  const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));
  const [selectedType, setSelectedType] = useState<'TODOS' | HolidayType>('TODOS');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<HolidayItem | null>(null);
  const [formDate, setFormDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formEndDate, setFormEndDate] = useState<string>('');
  const [isRangeMode, setIsRangeMode] = useState<boolean>(false);
  const [formName, setFormName] = useState<string>('');
  const [formType, setFormType] = useState<HolidayType>('recesso');
  const [formDescription, setFormDescription] = useState<string>('');

  // Delete Confirm State
  const [holidayToDelete, setHolidayToDelete] = useState<HolidayItem | null>(null);

  // Feedback Toast
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Available Years from data
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    years.add(String(currentYear));
    years.add(String(currentYear + 1));
    holidays.forEach((h) => {
      if (h.date && h.date.length >= 4) {
        years.add(h.date.substring(0, 4));
      }
      if (h.endDate && h.endDate.length >= 4) {
        years.add(h.endDate.substring(0, 4));
      }
    });
    return Array.from(years).sort();
  }, [holidays, currentYear]);

  // Filtered Holidays
  const filteredHolidays = useMemo(() => {
    return holidays
      .filter((h) => {
        if (!h || !h.date) return false;

        // Year filter (matches start date or end date)
        if (
          selectedYear !== 'TODOS' &&
          !h.date.startsWith(selectedYear) &&
          (!h.endDate || !h.endDate.startsWith(selectedYear))
        ) {
          return false;
        }

        // Type filter (normalize any legacy types)
        const normalizedType: HolidayType =
          h.type === 'feriado' ? 'feriado' : 'recesso';

        if (selectedType !== 'TODOS' && normalizedType !== selectedType) {
          return false;
        }

        // Search filter
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const matchName = (h.name || '').toLowerCase().includes(term);
          const matchDesc = (h.description || '').toLowerCase().includes(term);
          const matchDate =
            h.date.includes(term) ||
            formatDateBR(h.date).includes(term) ||
            (h.endDate ? h.endDate.includes(term) || formatDateBR(h.endDate).includes(term) : false);
          if (!matchName && !matchDesc && !matchDate) return false;
        }

        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [holidays, selectedYear, selectedType, searchTerm]);

  // Summary counts and total DAYS calculation
  const stats = useMemo(() => {
    const inYear = holidays.filter(
      (h) =>
        selectedYear === 'TODOS' ||
        h.date.startsWith(selectedYear) ||
        (h.endDate && h.endDate.startsWith(selectedYear))
    );

    let totalRecessoDays = 0;
    let totalRecessoSchoolDays = 0;
    let totalFeriadoDays = 0;
    let totalFeriadoSchoolDays = 0;
    let recessoPeriodsCount = 0;
    let feriadoDatesCount = 0;

    inYear.forEach((h) => {
      const dur = calculateHolidayDuration(h.date, h.endDate);
      const normalizedType: HolidayType =
        h.type === 'feriado' ? 'feriado' : 'recesso';

      if (normalizedType === 'recesso') {
        recessoPeriodsCount++;
        totalRecessoDays += dur.totalCalendarDays;
        totalRecessoSchoolDays += dur.schoolDaysCount;
      } else {
        feriadoDatesCount++;
        totalFeriadoDays += dur.totalCalendarDays;
        totalFeriadoSchoolDays += dur.schoolDaysCount;
      }
    });

    const totalDays = totalRecessoDays + totalFeriadoDays;
    const totalSchoolDays = totalRecessoSchoolDays + totalFeriadoSchoolDays;
    const totalEvents = inYear.length;

    return {
      totalEvents,
      totalDays,
      totalSchoolDays,
      totalRecessoDays,
      totalRecessoSchoolDays,
      recessoPeriodsCount,
      totalFeriadoDays,
      totalFeriadoSchoolDays,
      feriadoDatesCount,
    };
  }, [holidays, selectedYear]);

  // Form duration calculation in real-time
  const formDuration = useMemo(() => {
    if (!formDate) return { totalCalendarDays: 1, schoolDaysCount: 1, weekendDaysCount: 0 };
    return calculateHolidayDuration(formDate, isRangeMode && formEndDate ? formEndDate : formDate);
  }, [formDate, formEndDate, isRangeMode]);

  const handleOpenNewModal = (prefillType: HolidayType = 'recesso') => {
    setEditingHoliday(null);
    const defaultDate = `${selectedYear !== 'TODOS' ? selectedYear : currentYear}-01-01`;
    setFormDate(defaultDate);
    setFormEndDate('');
    setIsRangeMode(prefillType === 'recesso');
    setFormName('');
    setFormType(prefillType);
    setFormDescription('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (holiday: HolidayItem) => {
    setEditingHoliday(holiday);
    setFormDate(holiday.date);
    setFormEndDate(holiday.endDate || '');
    setIsRangeMode(Boolean(holiday.endDate && holiday.endDate !== holiday.date));
    setFormName(holiday.name);
    setFormType(holiday.type === 'feriado' ? 'feriado' : 'recesso');
    setFormDescription(holiday.description || '');
    setIsModalOpen(true);
  };

  const handleTypeChange = (type: HolidayType) => {
    setFormType(type);
    if (type === 'recesso' && !isRangeMode) {
      setIsRangeMode(true);
      if (formDate && !formEndDate) {
        const d = new Date(formDate);
        d.setDate(d.getDate() + 5);
        setFormEndDate(d.toISOString().split('T')[0]);
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDate || !formName.trim()) {
      showToast('Preencha a data inicial e o nome do período/feriado.', 'error');
      return;
    }

    if (isRangeMode && formEndDate && formEndDate < formDate) {
      showToast('A data final não pode ser anterior à data inicial.', 'error');
      return;
    }

    const effectiveEndDate = isRangeMode && formEndDate && formEndDate !== formDate ? formEndDate : undefined;
    const newId = editingHoliday ? editingHoliday.id : `hol_${formDate.replace(/-/g, '_')}_${Date.now()}`;

    const holidayObj: HolidayItem = {
      id: newId,
      date: formDate,
      endDate: effectiveEndDate,
      name: formName.trim(),
      type: formType,
      description: formDescription.trim() || undefined,
      createdAt: editingHoliday?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveHoliday(holidayObj);
    setIsModalOpen(false);
    showToast(
      editingHoliday
        ? 'Registro atualizado com sucesso!'
        : formType === 'recesso'
        ? 'Recesso Escolar cadastrado com sucesso!'
        : 'Feriado Oficial adicionado ao calendário!'
    );
  };

  const handleConfirmDelete = () => {
    if (!holidayToDelete) return;
    onDeleteHoliday(holidayToDelete.id);
    showToast(`"${holidayToDelete.name}" removido do calendário.`);
    setHolidayToDelete(null);
  };

  const handleLoadOfficialPreset = () => {
    if (
      window.confirm(
        'Deseja carregar o Calendário Padrão Oficial de Feriados e Recessos Escolares? Isso atualizará a lista com os feriados e recessos recomendados.'
      )
    ) {
      if (onBatchSaveHolidays) {
        onBatchSaveHolidays(INITIAL_HOLIDAYS);
      } else {
        INITIAL_HOLIDAYS.forEach((h) => onSaveHoliday(h));
      }
      showToast(`${INITIAL_HOLIDAYS.length} feriados e recessos escolares carregados com sucesso!`);
    }
  };

  const getTypeBadge = (type: HolidayType) => {
    if (type === 'recesso') {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-black bg-indigo-50 text-indigo-800 border border-indigo-200 shadow-2xs">
          <Coffee className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span>Recesso Escolar</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
        <CalendarOff className="w-3 h-3 text-rose-500 shrink-0" />
        <span>Feriado Oficial</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {toastMsg && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-center space-x-2 text-xs font-bold ${
            toastMsg.type === 'success'
              ? 'bg-slate-900 text-emerald-400 border-emerald-500/30'
              : 'bg-slate-900 text-rose-400 border-rose-500/30'
          }`}
        >
          {toastMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <XCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Control Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full text-indigo-700 text-xs font-bold uppercase tracking-wider mb-2">
              <CalendarRange className="w-4 h-4 text-indigo-600" />
              <span>CALENDÁRIO LETIVO & GESTÃO DE RECESSO ESCOLAR</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
              Gestão de Feriados e Recessos Escolares
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
              Cadastre <strong>Feriados Oficiais</strong> pontuais e períodos prolongados de{' '}
              <strong>Recesso Escolar por Intervalo de Datas</strong> (ex: 20/07 a 30/07). O sistema bloqueia
              automaticamente os alertas de chamada pendente, avisos sonoros de monitoras e o status &quot;Em
              Curso&quot; durante todo o período cadastrado.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleLoadOfficialPreset}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl border border-slate-200 transition-all cursor-pointer flex items-center space-x-2"
              title="Carregar calendário brasileiro padrão de feriados e recessos escolares"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Carregar Padrão Oficial</span>
            </button>

            <button
              onClick={() => handleOpenNewModal('recesso')}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-2xl shadow-sm shadow-indigo-600/20 transition-all cursor-pointer flex items-center space-x-2"
            >
              <Coffee className="w-4 h-4" />
              <span>Novo Recesso Escolar (Intervalo)</span>
            </button>

            <button
              onClick={() => handleOpenNewModal('feriado')}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-2xl shadow-sm shadow-rose-600/20 transition-all cursor-pointer flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Feriado Oficial</span>
            </button>
          </div>
        </div>

        {/* Informative Rule Card: Suspension of Activities & Alarms */}
        <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-4 text-xs text-indigo-950 flex items-start space-x-3">
          <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-indigo-950">
              Trava Automática e Suspensão de Atividades Durante Recessos e Feriados:
            </p>
            <p className="text-indigo-800 leading-relaxed">
              • <strong>Recesso Escolar por Intervalo (Ex: 20/07/2026 a 30/07/2026):</strong> Abrange todos os dias do
              período de forma contínua, suspendendo chamadas e rotinas.<br />
              • <strong>Suspensão de Alertas e Notificações:</strong> Nenhum alarme sonoro, aviso de chamada pendente ou
              notificação de rotina é emitido para as monitoras durante o período de recesso cadastrado.<br />
              • <strong>Cálculo Real de Dias:</strong> Os relatórios e contagens exibem a soma total de dias corridos e
              descontam com exatidão os dias úteis letivos da grade escolar.
            </p>
          </div>
        </div>

        {/* Stats Strip: Displaying TOTAL DAYS instead of just event count */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* Total Days */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Total Dias Não Letivos</span>
              <CalendarDays className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
              {stats.totalDays} {stats.totalDays === 1 ? 'Dia' : 'Dias'}
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              {stats.totalSchoolDays} dias úteis letivos suspensos • {stats.totalEvents} registros
            </p>
          </div>

          {/* Recesso Days */}
          <div className="bg-indigo-50/70 border border-indigo-200/90 rounded-2xl p-4">
            <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Coffee className="w-4 h-4 text-indigo-600" />
                <span>Dias de Recesso Escolar</span>
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-indigo-900 mt-1">
              {stats.totalRecessoDays} {stats.totalRecessoDays === 1 ? 'Dia de Recesso' : 'Dias de Recesso'}
            </div>
            <p className="text-xs text-indigo-700 font-medium mt-1">
              {stats.totalRecessoSchoolDays} dias úteis letivos • {stats.recessoPeriodsCount}{' '}
              {stats.recessoPeriodsCount === 1 ? 'período cadastrado' : 'períodos cadastrados'}
            </p>
          </div>

          {/* Feriados Days */}
          <div className="bg-rose-50/70 border border-rose-200/90 rounded-2xl p-4">
            <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CalendarOff className="w-4 h-4 text-rose-600" />
                <span>Dias de Feriados Oficiais</span>
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-rose-900 mt-1">
              {stats.totalFeriadoDays} {stats.totalFeriadoDays === 1 ? 'Dia de Feriado' : 'Dias de Feriados'}
            </div>
            <p className="text-xs text-rose-700 font-medium mt-1">
              {stats.feriadoDatesCount} {stats.feriadoDatesCount === 1 ? 'feriado oficial' : 'feriados oficiais'}
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
          {/* Year selector */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Filtrar por Ano:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500"
            >
              <option value="TODOS">Todos os Anos</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  Ano {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Tipo de Registro:</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as 'TODOS' | HolidayType)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500"
            >
              <option value="TODOS">Todos os Tipos</option>
              <option value="recesso">☕ Recesso Escolar</option>
              <option value="feriado">🚩 Feriado Oficial</option>
            </select>
          </div>

          {/* Search input */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Buscar por Nome / Data:</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Ex: Recesso de Julho, Carnaval, 20/07..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-800 placeholder-slate-400"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Holiday and Recess List Cards */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
            <CalendarDays className="w-4 h-4 text-indigo-600" />
            <span>Feriados e Recessos Cadastrados ({filteredHolidays.length})</span>
          </h3>
          <span className="text-xs text-slate-500 font-medium">Contagem por dias de suspensão</span>
        </div>

        {filteredHolidays.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 p-6 space-y-3">
            <CalendarOff className="w-12 h-12 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700">Nenhum evento encontrado</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Não há feriados ou períodos de recesso cadastrados para o filtro selecionado. Clique em &quot;Novo
              Recesso Escolar&quot; ou &quot;Novo Feriado&quot; para adicionar.
            </p>
            <button
              onClick={handleLoadOfficialPreset}
              className="px-4 py-2 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-xl hover:bg-indigo-100 transition-all cursor-pointer inline-flex items-center space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
              <span>Carregar Calendário Padrão Oficial</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredHolidays.map((h) => {
              const duration = calculateHolidayDuration(h.date, h.endDate);
              const todayStr = new Date().toISOString().split('T')[0];
              const effectiveEnd = h.endDate || h.date;
              const isPast = effectiveEnd < todayStr;
              const isCurrent = todayStr >= h.date && todayStr <= effectiveEnd;
              const isInterval = Boolean(h.endDate && h.endDate !== h.date);
              const normalizedType: HolidayType = h.type === 'feriado' ? 'feriado' : 'recesso';

              return (
                <div
                  key={h.id}
                  className={`border rounded-2xl p-4.5 transition-all flex flex-col justify-between space-y-3 relative overflow-hidden ${
                    isCurrent
                      ? 'bg-gradient-to-br from-indigo-50/95 via-purple-50/60 to-white border-indigo-400 shadow-md ring-2 ring-indigo-400/30'
                      : normalizedType === 'recesso'
                      ? 'bg-gradient-to-br from-indigo-50/30 via-white to-white border-indigo-200/90 hover:border-indigo-300 hover:shadow-sm'
                      : isPast
                      ? 'bg-slate-50/70 border-slate-200/80 opacity-85'
                      : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'
                  }`}
                >
                  {/* Current Active Indicator Pill */}
                  {isCurrent && (
                    <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[9px] font-black uppercase px-3 py-0.5 rounded-bl-xl tracking-wider shadow-xs">
                      Em Curso Hoje
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      {/* Top Badges Row */}
                      <div className="flex flex-wrap items-center gap-2">
                        {getTypeBadge(normalizedType)}

                        {/* Date Interval Badge */}
                        <div className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200/80">
                          <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                          <span>{formatHolidayRange(h)}</span>
                        </div>
                      </div>

                      {/* Title */}
                      <h4 className="text-sm sm:text-base font-black text-slate-900 tracking-tight pt-0.5 leading-snug">
                        {h.name}
                      </h4>

                      {/* PROMINENT CARD DAYS COUNT (e.g. 11 Dias de Recesso) */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span
                          className={`inline-flex items-center space-x-1.5 text-xs font-black px-3 py-1 rounded-xl border shadow-2xs ${
                            normalizedType === 'recesso'
                              ? 'bg-indigo-100/90 text-indigo-950 border-indigo-300'
                              : 'bg-rose-100/90 text-rose-950 border-rose-300'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>
                            {duration.totalCalendarDays}{' '}
                            {duration.totalCalendarDays === 1
                              ? normalizedType === 'recesso'
                                ? 'Dia de Recesso'
                                : 'Dia de Feriado'
                              : normalizedType === 'recesso'
                              ? 'Dias de Recesso'
                              : 'Dias de Feriado'}
                          </span>
                        </span>

                        <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-slate-600 bg-slate-100/90 px-2.5 py-1 rounded-xl border border-slate-200">
                          <span>
                            {duration.schoolDaysCount}{' '}
                            {duration.schoolDaysCount === 1
                              ? 'dia útil letivo suspenso'
                              : 'dias úteis letivos suspensos'}
                          </span>
                        </span>

                        {!isInterval && (
                          <span className="text-[11px] text-slate-500 font-medium italic">
                            ({getDayNameFull(h.date)})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center space-x-1 shrink-0 pt-1">
                      <button
                        onClick={() => handleOpenEditModal(h)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="Editar período"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setHolidayToDelete(h)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Excluir período"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {h.description && (
                    <div className="text-[11px] text-slate-600 bg-slate-50/90 p-2.5 rounded-xl border border-slate-100 leading-relaxed font-medium">
                      {h.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Add / Edit Recesso or Feriado */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`w-9 h-9 rounded-2xl flex items-center justify-center text-white ${
                    formType === 'recesso' ? 'bg-indigo-600 shadow-sm shadow-indigo-600/30' : 'bg-rose-600'
                  }`}
                >
                  {formType === 'recesso' ? <Coffee className="w-5 h-5" /> : <CalendarOff className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {editingHoliday
                      ? formType === 'recesso'
                        ? 'Editar Recesso Escolar'
                        : 'Editar Feriado Oficial'
                      : formType === 'recesso'
                      ? 'Cadastrar Recesso Escolar (Intervalo)'
                      : 'Cadastrar Feriado Oficial'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Configure a data inicial, final e os detalhes do período
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* Type Selection (Recesso Escolar vs Feriado Oficial) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Categoria do Evento:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleTypeChange('recesso')}
                    className={`py-3 px-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      formType === 'recesso'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-900 ring-2 ring-indigo-500/20 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Coffee className="w-4 h-4 text-indigo-600" />
                    <span>Recesso Escolar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTypeChange('feriado')}
                    className={`py-3 px-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      formType === 'feriado'
                        ? 'bg-rose-50 border-rose-500 text-rose-900 ring-2 ring-rose-500/20 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <CalendarOff className="w-4 h-4 text-rose-600" />
                    <span>Feriado Oficial</span>
                  </button>
                </div>
              </div>

              {/* Interval Toggle Mode */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <CalendarRange className="w-4 h-4 text-indigo-600" />
                    <span>Intervalo de Vários Dias (Data Inicial a Data Final)</span>
                  </span>
                  <p className="text-[11px] text-slate-500">
                    {formType === 'recesso'
                      ? 'Recomendado para recessos escolares prolongados (ex: 20/07 a 30/07).'
                      : 'Ative se o feriado abranger mais de 1 dia de emenda/ponte.'}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-2">
                  <input
                    type="checkbox"
                    checked={isRangeMode}
                    onChange={(e) => {
                      setIsRangeMode(e.target.checked);
                      if (e.target.checked && !formEndDate) {
                        setFormEndDate(formDate);
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Date Pickers (Data Inicial e Data Final) */}
              <div className={`grid ${isRangeMode ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-3`}>
                {/* Start Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isRangeMode ? 'Data Inicial do Período' : 'Data do Evento'}{' '}
                    <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800"
                  />
                  {formDate && (
                    <p className="text-[11px] font-medium text-indigo-600 mt-1">
                      Início: {getDayNameFull(formDate)}
                    </p>
                  )}
                </div>

                {/* End Date (Range mode) */}
                {isRangeMode && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Data Final do Período <span className="text-rose-500">*</span>:
                    </label>
                    <input
                      type="date"
                      required={isRangeMode}
                      min={formDate}
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800"
                    />
                    {formEndDate && (
                      <p className="text-[11px] font-medium text-indigo-600 mt-1">
                        Término: {getDayNameFull(formEndDate)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Dynamic Real-time duration breakdown pill */}
              {formDate && (
                <div className="p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-2 bg-indigo-50/80 border-indigo-200 text-indigo-950">
                  <div className="flex items-center space-x-2.5">
                    <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div>
                      <span className="font-extrabold block text-slate-900">
                        Total Calculado: {formDuration.totalCalendarDays}{' '}
                        {formDuration.totalCalendarDays === 1
                          ? formType === 'recesso'
                            ? 'Dia de Recesso'
                            : 'Dia de Feriado'
                          : formType === 'recesso'
                          ? 'Dias de Recesso Escolar'
                          : 'Dias de Feriado'}
                      </span>
                      <span className="text-[11px] text-slate-600">
                        {formDuration.schoolDaysCount}{' '}
                        {formDuration.schoolDaysCount === 1 ? 'dia útil letivo' : 'dias úteis letivos'} suspensos da
                        grade
                      </span>
                    </div>
                  </div>
                  {isRangeMode && formEndDate && (
                    <span className="text-[11px] font-mono font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs shrink-0">
                      {formatDateBR(formDate)} a {formatDateBR(formEndDate)}
                    </span>
                  )}
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome do Evento / Período <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    formType === 'recesso'
                      ? 'Ex: Recesso Escolar de Julho (20/07 a 30/07)'
                      : 'Ex: Independência do Brasil'
                  }
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-800 placeholder-slate-400 font-semibold"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observações / Orientações (Opcional):
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Período oficial de recesso escolar do Programa Integral. Atividades e chamadas suspensas."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-800 placeholder-slate-400"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer ${
                    formType === 'recesso'
                      ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/25'
                      : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25'
                  }`}
                >
                  {editingHoliday ? 'Salvar Alterações' : 'Confirmar Cadastro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {holidayToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-fade-in">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-rose-600">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-extrabold text-slate-800">Confirmar Exclusão</h3>
              <p className="text-xs text-slate-500">
                Tem certeza que deseja remover <strong>&quot;{holidayToDelete.name}&quot;</strong> (
                {formatHolidayRange(holidayToDelete)})?
              </p>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setHolidayToDelete(null)}
                className="flex-1 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md shadow-rose-600/20 transition-all cursor-pointer"
              >
                Sim, Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
