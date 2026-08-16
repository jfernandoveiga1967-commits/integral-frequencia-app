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
} from 'lucide-react';
import { HolidayItem, HolidayType } from '../types';
import { INITIAL_HOLIDAYS } from '../data/initialData';
import { getDayNameFull, formatDateBR } from '../utils/dateUtils';

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
    });
    return Array.from(years).sort();
  }, [holidays, currentYear]);

  // Filtered Holidays
  const filteredHolidays = useMemo(() => {
    return holidays
      .filter((h) => {
        if (!h || !h.date) return false;

        // Year filter
        if (selectedYear !== 'TODOS' && !h.date.startsWith(selectedYear)) {
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
          const matchDate = h.date.includes(term) || formatDateBR(h.date).includes(term);
          if (!matchName && !matchDesc && !matchDate) return false;
        }

        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [holidays, selectedYear, selectedType, searchTerm]);

  // Summary counts
  const stats = useMemo(() => {
    const inYear = holidays.filter((h) => selectedYear === 'TODOS' || h.date.startsWith(selectedYear));
    const feriados = inYear.filter((h) => h.type === 'feriado').length;
    const recessos = inYear.filter((h) => h.type === 'recesso').length;
    const facultativos = inYear.filter((h) => h.type === 'ponto_facultativo').length;
    return { total: inYear.length, feriados, recessos, facultativos };
  }, [holidays, selectedYear]);

  const handleOpenNewModal = () => {
    setEditingHoliday(null);
    setFormDate(`${selectedYear !== 'TODOS' ? selectedYear : currentYear}-01-01`);
    setFormName('');
    setFormType('feriado');
    setFormDescription('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (holiday: HolidayItem) => {
    setEditingHoliday(holiday);
    setFormDate(holiday.date);
    setFormName(holiday.name);
    setFormType(holiday.type);
    setFormDescription(holiday.description || '');
    setIsModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDate || !formName.trim()) {
      showToast('Preencha a data e o nome do feriado/recesso.', 'error');
      return;
    }

    const newId = editingHoliday ? editingHoliday.id : `hol_${formDate.replace(/-/g, '_')}_${Date.now()}`;
    const holidayObj: HolidayItem = {
      id: newId,
      date: formDate,
      name: formName.trim(),
      type: formType,
      description: formDescription.trim() || undefined,
      createdAt: editingHoliday?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveHoliday(holidayObj);
    setIsModalOpen(false);
    showToast(editingHoliday ? 'Feriado atualizado com sucesso!' : 'Novo feriado cadastrado!');
  };

  const handleConfirmDelete = () => {
    if (!holidayToDelete) return;
    onDeleteHoliday(holidayToDelete.id);
    showToast(`"${holidayToDelete.name}" removido.`);
    setHolidayToDelete(null);
  };

  const handleLoadOfficialPreset = () => {
    if (
      window.confirm(
        'Deseja carregar o Calendário Padrão Oficial de Feriados e Recessos Escolares? Isso adicionará/atualizará as datas no sistema.'
      )
    ) {
      if (onBatchSaveHolidays) {
        onBatchSaveHolidays(INITIAL_HOLIDAYS);
      } else {
        INITIAL_HOLIDAYS.forEach((h) => onSaveHoliday(h));
      }
      showToast(`${INITIAL_HOLIDAYS.length} feriados e recessos carregados com sucesso!`);
    }
  };

  const getTypeBadge = (type: HolidayType) => {
    switch (type) {
      case 'feriado':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <CalendarOff className="w-3 h-3 text-rose-500" />
            <span>Feriado</span>
          </span>
        );
      case 'recesso':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Coffee className="w-3 h-3 text-indigo-500" />
            <span>Recesso Escolar</span>
          </span>
        );
      case 'ponto_facultativo':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Sun className="w-3 h-3 text-amber-500" />
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
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>CALENDÁRIO LETIVO & RECESSO ESCOLAR</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
              Gestão de Feriados e Recessos
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
              Cadastre e gerencie feriados e períodos de recesso escolar. O sistema suspende automaticamente contagens de
              chamada pendente, status em curso e alertas nesses dias, ajustando a frequência do relatório semanal.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleLoadOfficialPreset}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl border border-slate-200 transition-all cursor-pointer flex items-center space-x-2"
              title="Carregar feriados e recessos escolares brasileiros padrão"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Carregar Padrão Oficial</span>
            </button>

            <button
              onClick={handleOpenNewModal}
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
            <p className="font-bold">Como funciona a Trava Automática de Finais de Semana e Feriados:</p>
            <p className="text-indigo-800 leading-relaxed">
              • <strong>Finais de semana (Sábado e Domingo):</strong> Nenhuma atividade é marcada como &quot;Em Curso&quot; e a rotina exibe o aviso informativo de encerramento semanal.<br />
              • <strong>Feriados e Recessos cadastrados:</strong> Suspendem a contagem de chamadas pendentes, alarmes de monitoras e o status &quot;Em Curso&quot;, exibindo o card festivo com o nome da comemoração.<br />
              • <strong>Relatório Semanal:</strong> Considera apenas os <em>dias úteis letivos</em> para os cálculos de taxa de presença, descontando feriados automaticamente.
            </p>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Cadastrado</div>
            <div className="text-2xl font-black text-slate-800 mt-0.5">{stats.total}</div>
          </div>
          <div className="bg-rose-50/60 border border-rose-200/70 rounded-2xl p-3">
            <div className="text-[11px] font-bold text-rose-500 uppercase tracking-wider">Feriados</div>
            <div className="text-2xl font-black text-rose-700 mt-0.5">{stats.feriados}</div>
          </div>
          <div className="bg-indigo-50/60 border border-indigo-200/70 rounded-2xl p-3">
            <div className="text-[11px] font-bold text-indigo-500 uppercase tracking-wider">Recessos Escolares</div>
            <div className="text-2xl font-black text-indigo-700 mt-0.5">{stats.recessos}</div>
          </div>
          <div className="bg-amber-50/60 border border-amber-200/70 rounded-2xl p-3">
            <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Pontos Facultativos</div>
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
              <option value="feriado">Feriado Oficial</option>
              <option value="recesso">Recesso Escolar</option>
              <option value="ponto_facultativo">Ponto Facultativo</option>
            </select>
          </div>

          {/* Search input */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Buscar por Nome / Data:</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Ex: Carnaval, 07/09, Páscoa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-800 placeholder-slate-400"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Holiday List Cards */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
            <CalendarDays className="w-4 h-4 text-indigo-600" />
            <span>Feriados e Recessos Cadastrados ({filteredHolidays.length})</span>
          </h3>
          <span className="text-xs text-slate-500">Ordenados cronologicamente</span>
        </div>

        {filteredHolidays.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 p-6 space-y-3">
            <CalendarOff className="w-12 h-12 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700">Nenhum feriado ou recesso encontrado</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Não há datas comemorativas ou recessos cadastrados para o filtro atual. Clique em &quot;Novo Feriado / Recesso&quot; ou carregue o calendário oficial padrão.
            </p>
            <button
              onClick={handleLoadOfficialPreset}
              className="px-4 py-2 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-xl hover:bg-indigo-100 transition-all cursor-pointer inline-flex items-center space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
              <span>Carregar Calendário Oficial</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredHolidays.map((h) => {
              const dayName = getDayNameFull(h.date);
              const isPast = new Date(h.date) < new Date(new Date().toISOString().split('T')[0]);
              return (
                <div
                  key={h.id}
                  className={`border rounded-2xl p-4 transition-all flex flex-col justify-between space-y-3 ${
                    isPast
                      ? 'bg-slate-50/70 border-slate-200/80 opacity-90'
                      : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {getTypeBadge(h.type)}
                        <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                          {formatDateBR(h.date)}
                        </span>
                      </div>
                      <h4 className="text-sm font-black text-slate-800 tracking-tight pt-1">{h.name}</h4>
                      <p className="text-xs font-medium text-slate-500">{dayName}</p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={() => handleOpenEditModal(h)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setHolidayToDelete(h)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {h.description && (
                    <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      {h.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Add / Edit Holiday */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-extrabold text-slate-800">
                  {editingHoliday ? 'Editar Feriado / Recesso' : 'Cadastrar Feriado / Recesso'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Data do Feriado / Recesso <span className="text-rose-500">*</span>:
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
                    Dia da Semana: {getDayNameFull(formDate)}
                  </p>
                )}
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome da Comemoração / Recesso <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Independência do Brasil, Recesso de Páscoa..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-800 placeholder-slate-400"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Evento:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormType('feriado')}
                    className={`py-2 px-2 text-center rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      formType === 'feriado'
                        ? 'bg-rose-50 border-rose-400 text-rose-700 ring-2 ring-rose-400/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Feriado
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType('recesso')}
                    className={`py-2 px-2 text-center rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      formType === 'recesso'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700 ring-2 ring-indigo-400/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Recesso
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType('ponto_facultativo')}
                    className={`py-2 px-2 text-center rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      formType === 'ponto_facultativo'
                        ? 'bg-amber-50 border-amber-400 text-amber-700 ring-2 ring-amber-400/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Ponto Facult.
                  </button>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observações / Detalhes (Opcional):
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Não haverá aula nem atividades extracurriculares no Integral neste dia."
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
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  {editingHoliday ? 'Salvar Alterações' : 'Cadastrar Data'}
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
                Tem certeza que deseja remover o feriado <strong>&quot;{holidayToDelete.name}&quot;</strong> (
                {formatDateBR(holidayToDelete.date)})?
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
