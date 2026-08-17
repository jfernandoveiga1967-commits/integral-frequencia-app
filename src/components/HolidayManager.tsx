import React, { useState, useMemo } from 'react';
import {
  Calendar,
  CalendarDays,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Sparkles,
  Info,
  Search,
  Filter,
  RefreshCw,
  Sun,
  Coffee,
  AlertTriangle,
  X,
  Check,
  CalendarOff,
  CalendarRange,
  Palmtree,
  ArrowRight,
  Clock,
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
  const [formType, setFormType] = useState<HolidayType>('feriado');
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

        // Type filter
        if (selectedType !== 'TODOS' && h.type !== selectedType) {
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

  // Summary counts
  const stats = useMemo(() => {
    const inYear = holidays.filter(
      (h) =>
        selectedYear === 'TODOS' ||
        h.date.startsWith(selectedYear) ||
        (h.endDate && h.endDate.startsWith(selectedYear))
    );
    const feriados = inYear.filter((h) => h.type === 'feriado').length;
    const recessos = inYear.filter((h) => h.type === 'recesso').length;
    const ferias = inYear.filter((h) => h.type === 'ferias').length;
    const facultativos = inYear.filter((h) => h.type === 'ponto_facultativo').length;
    return { total: inYear.length, feriados, recessos, ferias, facultativos };
  }, [holidays, selectedYear]);

  // Form duration calculation in real-time
  const formDuration = useMemo(() => {
    if (!formDate) return { totalCalendarDays: 1, schoolDaysCount: 1, weekendDaysCount: 0 };
    return calculateHolidayDuration(formDate, isRangeMode && formEndDate ? formEndDate : formDate);
  }, [formDate, formEndDate, isRangeMode]);

  const handleOpenNewModal = (prefillType: HolidayType = 'feriado') => {
    setEditingHoliday(null);
    const defaultDate = `${selectedYear !== 'TODOS' ? selectedYear : currentYear}-01-01`;
    setFormDate(defaultDate);
    setFormEndDate('');
    setIsRangeMode(prefillType === 'ferias');
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
    setFormType(holiday.type);
    setFormDescription(holiday.description || '');
    setIsModalOpen(true);
  };

  const handleTypeChange = (type: HolidayType) => {
    setFormType(type);
    if (type === 'ferias' && !isRangeMode) {
      setIsRangeMode(true);
      // default end date 7 days later
      if (formDate && !formEndDate) {
        const d = new Date(formDate);
        d.setDate(d.getDate() + 7);
        setFormEndDate(d.toISOString().split('T')[0]);
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDate || !formName.trim()) {
      showToast('Preencha a data inicial e o nome do evento.', 'error');
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
        ? 'Período/Feriado atualizado com sucesso!'
        : formType === 'ferias'
        ? 'Férias Escolares cadastradas com sucesso!'
        : 'Novo registro adicionado ao calendário!'
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
        'Deseja carregar o Calendário Padrão Oficial de Feriados, Férias e Recessos Escolares? Isso adicionará as datas e intervalos pré-configurados no sistema.'
      )
    ) {
      if (onBatchSaveHolidays) {
        onBatchSaveHolidays(INITIAL_HOLIDAYS);
      } else {
        INITIAL_HOLIDAYS.forEach((h) => onSaveHoliday(h));
      }
      showToast(`${INITIAL_HOLIDAYS.length} feriados, férias e recessos carregados com sucesso!`);
    }
  };

  const getTypeBadge = (type: HolidayType) => {
    switch (type) {
      case 'ferias':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-black bg-purple-100 text-purple-800 border border-purple-300 shadow-2xs">
            <Palmtree className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            <span>Férias Escolares</span>
          </span>
        );
      case 'recesso':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Coffee className="w-3 h-3 text-indigo-500 shrink-0" />
            <span>Recesso Escolar</span>
          </span>
        );
      case 'feriado':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <CalendarOff className="w-3 h-3 text-rose-500 shrink-0" />
            <span>Feriado Oficial</span>
          </span>
        );
      case 'ponto_facultativo':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Sun className="w-3 h-3 text-amber-500 shrink-0" />
            <span>Ponto Facultativo</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
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
              <span>CALENDÁRIO LETIVO, FÉRIAS & RECESSO ESCOLAR</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
              Gestão de Feriados, Férias e Recessos
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
              Cadastre feriados pontuais e períodos prolongados de <strong>Férias Escolares</strong> ou recessos. O
              sistema bloqueia chamadas pendentes, alarmes e o status &quot;Em Curso&quot; durante todo o período
              selecionado, ajustando automaticamente a contagem de dias úteis letivos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleLoadOfficialPreset}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl border border-slate-200 transition-all cursor-pointer flex items-center space-x-2"
              title="Carregar feriados, férias e recessos escolares brasileiros padrão"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Carregar Padrão Oficial</span>
            </button>

            <button
              onClick={() => handleOpenNewModal('ferias')}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-2xl shadow-sm transition-all cursor-pointer flex items-center space-x-2"
            >
              <Palmtree className="w-4 h-4" />
              <span>Cadastrar Férias</span>
            </button>

            <button
              onClick={() => handleOpenNewModal('feriado')}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-2xl shadow-sm transition-all cursor-pointer flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Feriado / Recesso</span>
            </button>
          </div>
        </div>

        {/* Info Rules Card */}
        <div className="bg-indigo-50/70 border border-indigo-200/70 rounded-2xl p-4 text-xs text-indigo-950 flex items-start space-x-3">
          <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Como funciona a Trava Automática de Férias e Feriados no Sistema:</p>
            <p className="text-indigo-800 leading-relaxed">
              • <strong>Férias Escolares e Recessos por Intervalo (Ex: 20/07 a 30/07):</strong> Suspendem
              automaticamente as chamadas de todas as turmas durante o intervalo de datas completo.<br />
              • <strong>Bloqueio de Notificações:</strong> Nenhum alarme sonoro ou notificação web de rotina é disparado
              durante o período de férias/recesso.<br />
              • <strong>Relatórios e Frequência:</strong> O cálculo de dias úteis letivos no Relatório Semanal desconta
              automaticamente os dias correspondentes aos feriados e recessos cadastrados.
            </p>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Eventos</div>
            <div className="text-2xl font-black text-slate-800 mt-0.5">{stats.total}</div>
          </div>
          <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-3">
            <div className="text-[11px] font-bold text-purple-600 uppercase tracking-wider flex items-center gap-1">
              <Palmtree className="w-3 h-3" />
              <span>Férias</span>
            </div>
            <div className="text-2xl font-black text-purple-800 mt-0.5">{stats.ferias}</div>
          </div>
          <div className="bg-rose-50/60 border border-rose-200/70 rounded-2xl p-3">
            <div className="text-[11px] font-bold text-rose-500 uppercase tracking-wider">Feriados</div>
            <div className="text-2xl font-black text-rose-700 mt-0.5">{stats.feriados}</div>
          </div>
          <div className="bg-indigo-50/60 border border-indigo-200/70 rounded-2xl p-3">
            <div className="text-[11px] font-bold text-indigo-500 uppercase tracking-wider">Recessos</div>
            <div className="text-2xl font-black text-indigo-700 mt-0.5">{stats.recessos}</div>
          </div>
          <div className="bg-amber-50/60 border border-amber-200/70 rounded-2xl p-3">
            <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Pontos Facult.</div>
            <div className="text-2xl font-black text-amber-800 mt-0.5">{stats.facultativos}</div>
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
            <label className="block text-xs font-bold text-slate-600 mb-1">Tipo de Evento:</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as 'TODOS' | HolidayType)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500"
            >
              <option value="TODOS">Todos os Tipos</option>
              <option value="ferias">🌴 Férias Escolares</option>
              <option value="feriado">🚩 Feriado Oficial</option>
              <option value="recesso">☕ Recesso Escolar</option>
              <option value="ponto_facultativo">☀️ Ponto Facultativo</option>
            </select>
          </div>

          {/* Search input */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Buscar por Nome / Data:</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Ex: Férias de Julho, Carnaval, 20/07..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-800 placeholder-slate-400"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Holiday & Vacation List Cards */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
            <CalendarDays className="w-4 h-4 text-indigo-600" />
            <span>Feriados, Férias e Recessos Cadastrados ({filteredHolidays.length})</span>
          </h3>
          <span className="text-xs text-slate-500 font-medium">Cronograma de não-letivos</span>
        </div>

        {filteredHolidays.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 p-6 space-y-3">
            <CalendarOff className="w-12 h-12 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700">Nenhum evento encontrado</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Não há datas comemorativas ou períodos de férias cadastrados para o filtro selecionado. Clique em
              &quot;Cadastrar Férias&quot; ou &quot;Novo Feriado&quot; para adicionar.
            </p>
            <button
              onClick={handleLoadOfficialPreset}
              className="px-4 py-2 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-xl hover:bg-indigo-100 transition-all cursor-pointer inline-flex items-center space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
              <span>Carregar Calendário Oficial Padrão</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredHolidays.map((h) => {
              const isInterval = Boolean(h.endDate && h.endDate !== h.date);
              const duration = calculateHolidayDuration(h.date, h.endDate);
              const todayStr = new Date().toISOString().split('T')[0];
              const effectiveEnd = h.endDate || h.date;
              const isPast = effectiveEnd < todayStr;
              const isCurrent = todayStr >= h.date && todayStr <= effectiveEnd;

              return (
                <div
                  key={h.id}
                  className={`border rounded-2xl p-4.5 transition-all flex flex-col justify-between space-y-3 relative overflow-hidden ${
                    isCurrent
                      ? 'bg-gradient-to-br from-purple-50/90 via-indigo-50/60 to-white border-purple-300 shadow-md ring-2 ring-purple-400/30'
                      : h.type === 'ferias'
                      ? 'bg-gradient-to-br from-purple-50/40 via-white to-white border-purple-200/90 hover:border-purple-300 hover:shadow-sm'
                      : isPast
                      ? 'bg-slate-50/70 border-slate-200/80 opacity-85'
                      : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'
                  }`}
                >
                  {/* Current Active Indicator Pill */}
                  {isCurrent && (
                    <div className="absolute top-0 right-0 bg-purple-600 text-white text-[9px] font-black uppercase px-3 py-0.5 rounded-bl-xl tracking-wider shadow-xs">
                      Em Curso Hoje
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      {/* Top Badges Row */}
                      <div className="flex flex-wrap items-center gap-2">
                        {getTypeBadge(h.type)}

                        {/* Date Range Badge */}
                        <div className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200/80">
                          <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                          <span>{formatHolidayRange(h)}</span>
                        </div>
                      </div>

                      {/* Title */}
                      <h4 className="text-sm sm:text-base font-black text-slate-900 tracking-tight pt-0.5 leading-snug">
                        {h.name}
                      </h4>

                      {/* Calculated Duration Highlight Card */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span
                          className={`inline-flex items-center space-x-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg border ${
                            h.type === 'ferias'
                              ? 'bg-purple-100 text-purple-900 border-purple-200'
                              : 'bg-indigo-50 text-indigo-900 border-indigo-200'
                          }`}
                        >
                          <Clock className="w-3 h-3 text-purple-600 shrink-0" />
                          <span>
                            {duration.totalCalendarDays}{' '}
                            {duration.totalCalendarDays === 1 ? 'dia corrido' : 'dias corridos'}
                          </span>
                        </span>

                        <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-slate-600 bg-slate-100/90 px-2.5 py-0.5 rounded-lg border border-slate-200">
                          <span>
                            {duration.schoolDaysCount}{' '}
                            {duration.schoolDaysCount === 1 ? 'dia útil letivo' : 'dias úteis letivos'}
                          </span>
                        </span>

                        {!isInterval && (
                          <span className="text-[11px] text-slate-400 font-medium italic">
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

      {/* Modal Add / Edit Holiday / Vacation */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`w-9 h-9 rounded-2xl flex items-center justify-center text-white ${
                    formType === 'ferias' ? 'bg-purple-600 shadow-sm shadow-purple-600/30' : 'bg-indigo-600'
                  }`}
                >
                  {formType === 'ferias' ? <Palmtree className="w-5 h-5" /> : <CalendarRange className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {editingHoliday
                      ? formType === 'ferias'
                        ? 'Editar Férias Escolares'
                        : 'Editar Feriado / Recesso'
                      : formType === 'ferias'
                      ? 'Cadastrar Férias Escolares'
                      : 'Cadastrar Feriado / Recesso'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Configure as datas e os detalhes do período</p>
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
              {/* Type Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Tipo de Evento:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTypeChange('ferias')}
                    className={`py-2 px-2 text-center rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      formType === 'ferias'
                        ? 'bg-purple-50 border-purple-400 text-purple-800 ring-2 ring-purple-400/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Palmtree className="w-4 h-4 text-purple-600" />
                    <span>Férias</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeChange('feriado')}
                    className={`py-2 px-2 text-center rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      formType === 'feriado'
                        ? 'bg-rose-50 border-rose-400 text-rose-700 ring-2 ring-rose-400/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <CalendarOff className="w-4 h-4 text-rose-600" />
                    <span>Feriado</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeChange('recesso')}
                    className={`py-2 px-2 text-center rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      formType === 'recesso'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700 ring-2 ring-indigo-400/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Coffee className="w-4 h-4 text-indigo-600" />
                    <span>Recesso</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeChange('ponto_facultativo')}
                    className={`py-2 px-2 text-center rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      formType === 'ponto_facultativo'
                        ? 'bg-amber-50 border-amber-400 text-amber-700 ring-2 ring-amber-400/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Sun className="w-4 h-4 text-amber-600" />
                    <span>Ponto Fac.</span>
                  </button>
                </div>
              </div>

              {/* Range Toggle Mode */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <CalendarRange className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Definir Intervalo de Vários Dias (Data Inicial a Final)</span>
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Ative para períodos contínuos de férias ou recessos prolongados.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
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

              {/* Date Inputs */}
              <div className={`grid ${isRangeMode ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-3`}>
                {/* Start Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isRangeMode ? 'Data Inicial do Período' : 'Data do Feriado / Evento'}{' '}
                    <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800"
                  />
                  {formDate && !isRangeMode && (
                    <p className="text-[11px] font-medium text-indigo-600 mt-1">
                      Dia da semana: {getDayNameFull(formDate)}
                    </p>
                  )}
                </div>

                {/* End Date (if in range mode) */}
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
                        Até: {getDayNameFull(formEndDate)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Real-time duration breakdown pill */}
              {formDate && (
                <div
                  className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-2 ${
                    formType === 'ferias'
                      ? 'bg-purple-50/80 border-purple-200 text-purple-950'
                      : 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-purple-600 shrink-0" />
                    <div>
                      <span className="font-extrabold block">
                        Cálculo do Período: {formDuration.totalCalendarDays}{' '}
                        {formDuration.totalCalendarDays === 1 ? 'dia' : 'dias corridos'}
                      </span>
                      <span className="text-[11px] text-slate-600">
                        {formDuration.schoolDaysCount}{' '}
                        {formDuration.schoolDaysCount === 1 ? 'dia útil letivo' : 'dias úteis letivos'} descontados da
                        grade
                      </span>
                    </div>
                  </div>
                  {isRangeMode && formEndDate && (
                    <span className="text-[11px] font-mono font-bold bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-2xs">
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
                    formType === 'ferias'
                      ? 'Ex: Férias Escolares de Julho'
                      : formType === 'recesso'
                      ? 'Ex: Recesso de Carnaval e Cinzas'
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
                  placeholder="Ex: Período oficial de férias escolares do Programa Integral. Atividades suspensas."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-800 placeholder-slate-400"
                />
              </div>

              {/* Actions */}
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
                    formType === 'ferias'
                      ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/25'
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/25'
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
