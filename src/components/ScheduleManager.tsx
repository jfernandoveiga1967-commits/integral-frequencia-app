import React, { useState, useMemo } from 'react';
import {
  CalendarDays,
  Clock,
  Plus,
  Trash2,
  Edit2,
  MapPin,
  FileText,
  Sparkles,
  Info,
  Check,
  CheckCircle2,
  AlertCircle,
  Filter,
  Copy,
  ChevronDown,
  Layers,
  Utensils,
  BookOpen,
  Waves,
  X,
  Calendar,
} from 'lucide-react';
import { ScheduleBlock, DayOfWeek, TurmaType, ActivityItem, ActivityType } from '../types';
import { ActivityBadge } from './ActivityBadge';

interface ScheduleManagerProps {
  turmas: TurmaType[];
  activitiesList: ActivityItem[];
  schedules: ScheduleBlock[];
  onSaveScheduleBlock: (block: ScheduleBlock) => void;
  onDeleteScheduleBlock: (id: string) => void;
  onBatchSaveSchedules?: (blocks: ScheduleBlock[]) => void;
}

const DAYS_OF_WEEK: { id: DayOfWeek; label: string; short: string }[] = [
  { id: 'segunda', label: 'Segunda-feira', short: 'SEG' },
  { id: 'terca', label: 'Terça-feira', short: 'TER' },
  { id: 'quarta', label: 'Quarta-feira', short: 'QUA' },
  { id: 'quinta', label: 'Quinta-feira', short: 'QUI' },
  { id: 'sexta', label: 'Sexta-feira', short: 'SEX' },
];

const COMMON_LOCATIONS = [
  'Piscina',
  'Refeitório',
  'Quadra Coberta',
  'Campo de Futebol',
  'Sala de Balé / Dança',
  'Tatame / Judô',
  'Sala de Música',
  'Sala de Estudos / Lição',
  'Parquinho / Pátio',
  'Ateliê de Artes',
];

const TIME_PRESETS = [
  { label: 'Almoço (11:30 - 12:30)', start: '11:30', end: '12:30' },
  { label: '1º Horário (13:30 - 14:20)', start: '13:30', end: '14:20' },
  { label: '2º Horário (14:30 - 15:20)', start: '14:30', end: '15:20' },
  { label: 'Lanche da Tarde (15:30 - 16:00)', start: '15:30', end: '16:00' },
  { label: '3º Horário (16:00 - 17:00)', start: '16:00', end: '17:00' },
  { label: 'Lição / Acolhida (17:00 - 17:45)', start: '17:00', end: '17:45' },
];

export const ScheduleManager: React.FC<ScheduleManagerProps> = ({
  turmas,
  activitiesList,
  schedules,
  onSaveScheduleBlock,
  onDeleteScheduleBlock,
  onBatchSaveSchedules,
}) => {
  const [selectedTurma, setSelectedTurma] = useState<TurmaType>(turmas[0] || '1º Ano A');
  const [selectedDayFilter, setSelectedDayFilter] = useState<'ALL' | DayOfWeek>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null);
  const [blockToDelete, setBlockToDelete] = useState<ScheduleBlock | null>(null);

  // Form State
  const [formTurma, setFormTurma] = useState<TurmaType>(turmas[0] || '');
  const [formDayOfWeek, setFormDayOfWeek] = useState<DayOfWeek>('segunda');
  const [formStartTime, setFormStartTime] = useState('13:30');
  const [formEndTime, setFormEndTime] = useState('14:20');
  const [formActivityId, setFormActivityId] = useState<ActivityType>(activitiesList[0]?.id || 'Rotina');
  const [formLocation, setFormLocation] = useState('');
  const [formGuidelines, setFormGuidelines] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Toast feedback
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Filter schedules for the selected turma
  const currentTurmaSchedules = useMemo(() => {
    return schedules.filter((s) => s.turma === selectedTurma);
  }, [schedules, selectedTurma]);

  // Group schedules by day of the week and sort by startTime
  const schedulesByDay = useMemo(() => {
    const grouped: Record<DayOfWeek, ScheduleBlock[]> = {
      segunda: [],
      terca: [],
      quarta: [],
      quinta: [],
      sexta: [],
    };

    currentTurmaSchedules.forEach((item) => {
      if (grouped[item.dayOfWeek]) {
        grouped[item.dayOfWeek].push(item);
      }
    });

    // Sort each day chronologically
    Object.keys(grouped).forEach((day) => {
      grouped[day as DayOfWeek].sort((a, b) => a.startTime.localeCompare(b.startTime));
    });

    return grouped;
  }, [currentTurmaSchedules]);

  // Open Modal for New Block
  const handleOpenNewBlock = (defaultDay?: DayOfWeek) => {
    setEditingBlock(null);
    setFormTurma(selectedTurma);
    setFormDayOfWeek(defaultDay || 'segunda');
    setFormStartTime('13:30');
    setFormEndTime('14:20');
    setFormActivityId(activitiesList[0]?.id || 'Rotina');
    setFormLocation('');
    setFormGuidelines('');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open Modal for Editing Block
  const handleOpenEditBlock = (block: ScheduleBlock) => {
    setEditingBlock(block);
    setFormTurma(block.turma);
    setFormDayOfWeek(block.dayOfWeek);
    setFormStartTime(block.startTime);
    setFormEndTime(block.endTime);
    setFormActivityId(block.activityId);
    setFormLocation(block.location || '');
    setFormGuidelines(block.guidelines || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Handle Form Submit
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTurma) {
      setFormError('Selecione uma turma válida.');
      return;
    }
    if (!formStartTime || !formEndTime) {
      setFormError('Informe os horários de início e término.');
      return;
    }
    if (formStartTime >= formEndTime) {
      setFormError('O horário de término deve ser posterior ao horário de início.');
      return;
    }
    if (!formActivityId) {
      setFormError('Selecione uma atividade para o horário.');
      return;
    }

    const blockToSave: ScheduleBlock = {
      id: editingBlock ? editingBlock.id : `sch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      turma: formTurma,
      dayOfWeek: formDayOfWeek,
      startTime: formStartTime,
      endTime: formEndTime,
      activityId: formActivityId,
      location: formLocation.trim() || undefined,
      guidelines: formGuidelines.trim() || undefined,
      createdAt: editingBlock?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveScheduleBlock(blockToSave);
    setIsModalOpen(false);
    showToast(
      editingBlock ? 'Horário atualizado com sucesso!' : 'Novo horário cadastrado na grade!',
      'success'
    );
  };

  // Handle Delete Confirmation
  const confirmDeleteBlock = () => {
    if (!blockToDelete) return;
    onDeleteScheduleBlock(blockToDelete.id);
    setBlockToDelete(null);
    showToast('Bloco de horário removido da grade.', 'success');
  };

  // Find Activity Details
  const getActivityDetails = (actId: string) => {
    return activitiesList.find((a) => a.id === actId);
  };

  // Calculate total blocks for a turma
  const totalBlocksForTurma = (t: TurmaType) => {
    return schedules.filter((s) => s.turma === t).length;
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMsg && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-center space-x-3 text-xs font-bold transition-all animate-bounce ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
              : 'bg-rose-950 text-rose-300 border-rose-800'
          }`}
        >
          {toastMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-sm">
              <CalendarDays className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full border border-indigo-200">
                  Planejamento e Rotina
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {currentTurmaSchedules.length} blocos cadastrados para {selectedTurma}
                </span>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mt-1">
                Grade Horária Semanal
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Monte e organize os horários de Segunda a Sexta-feira para cada turma, com modalidades, salas e instruções.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleOpenNewBlock()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-md shadow-indigo-500/20 transition-all cursor-pointer flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Horário na Grade</span>
            </button>
          </div>
        </div>

        {/* Turmas Selector Strip */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              Selecione a Turma para Visualizar:
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {turmas.map((t) => {
              const isSelected = selectedTurma === t;
              const blockCount = totalBlocksForTurma(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedTurma(t)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-2 border ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-indigo-500/20'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                >
                  <span>{t}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {blockCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Week Timetable Columns (Segunda a Sexta) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {DAYS_OF_WEEK.map((day) => {
          const dayBlocks = schedulesByDay[day.id];
          return (
            <div
              key={day.id}
              className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm flex flex-col min-h-[420px] transition-all hover:border-indigo-200"
            >
              {/* Day Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-700 font-extrabold text-xs flex items-center justify-center border border-indigo-100">
                    {day.short}
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-800 leading-tight">
                      {day.label}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-bold">
                      {dayBlocks.length} {dayBlocks.length === 1 ? 'atividade' : 'atividades'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenNewBlock(day.id)}
                  title={`Adicionar horário em ${day.label}`}
                  className="w-7 h-7 rounded-xl bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Schedule Blocks for this Day */}
              <div className="space-y-3 flex-1 flex flex-col">
                {dayBlocks.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-4 text-center rounded-2xl border-2 border-dashed border-slate-100 bg-slate-50/50">
                    <Clock className="w-6 h-6 text-slate-300 mb-1" />
                    <p className="text-[11px] font-bold text-slate-400">
                      Nenhum horário cadastrado
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenNewBlock(day.id)}
                      className="mt-2 text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-xl transition-colors cursor-pointer"
                    >
                      + Cadastrar
                    </button>
                  </div>
                ) : (
                  dayBlocks.map((block) => {
                    const actDetails = getActivityDetails(block.activityId);
                    const isRollCall = actDetails?.requiresRollCall !== false;

                    return (
                      <div
                        key={block.id}
                        className="group relative bg-slate-50 hover:bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-2.5"
                      >
                        {/* Time & Type Pill */}
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center space-x-1.5 bg-slate-900 text-white px-2 py-0.5 rounded-lg text-[10px] font-extrabold tracking-wide">
                            <Clock className="w-3 h-3 text-indigo-400" />
                            <span>
                              {block.startTime} - {block.endTime}
                            </span>
                          </div>

                          {isRollCall ? (
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Chamada
                            </span>
                          ) : (
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                              Rotina
                            </span>
                          )}
                        </div>

                        {/* Activity Badge */}
                        <div>
                          <ActivityBadge
                            activity={block.activityId}
                            iconName={actDetails?.icon}
                            size="sm"
                          />
                        </div>

                        {/* Location (Optional) */}
                        {block.location && (
                          <div className="flex items-center space-x-1.5 text-[11px] text-slate-600 font-semibold bg-white/80 px-2 py-1 rounded-lg border border-slate-100">
                            <MapPin className="w-3 h-3 text-indigo-500 shrink-0" />
                            <span className="truncate">{block.location}</span>
                          </div>
                        )}

                        {/* Guidelines (Optional) */}
                        {block.guidelines && (
                          <div className="text-[11px] text-slate-600 bg-amber-50/70 border border-amber-200/60 rounded-xl p-2 font-medium leading-tight">
                            <div className="flex items-center space-x-1 text-[9px] font-extrabold uppercase text-amber-800 mb-0.5">
                              <Info className="w-2.5 h-2.5" />
                              <span>Orientações:</span>
                            </div>
                            <p className="line-clamp-2">{block.guidelines}</p>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end space-x-1 pt-1 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => handleOpenEditBlock(block)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                            title="Editar este horário"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setBlockToDelete(block)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Excluir este horário"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Cadastro / Edição de Bloco */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base leading-tight">
                    {editingBlock ? 'Editar Horário da Grade' : 'Novo Horário na Grade'}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Defina o dia, horário, modalidade e orientações para a turma.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleFormSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Turma */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Turma:
                </label>
                <select
                  value={formTurma}
                  onChange={(e) => setFormTurma(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {turmas.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Dia da Semana */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Dia da Semana:
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {DAYS_OF_WEEK.map((d) => {
                    const isSelected = formDayOfWeek === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setFormDayOfWeek(d.id)}
                        className={`py-2 px-1 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex flex-col items-center justify-center border ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-500/20'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-[10px] opacity-75">{d.short}</span>
                        <span className="text-[11px] truncate">{d.label.split('-')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Horário de Início e Término */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Horário da Atividade:
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-0.5">Início:</span>
                    <input
                      type="time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-0.5">Término:</span>
                    <input
                      type="time"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Quick Preset Buttons */}
                <div className="mt-2">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">
                    Horários Comuns (Clique para preencher):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {TIME_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setFormStartTime(preset.start);
                          setFormEndTime(preset.end);
                        }}
                        className="text-[10px] font-semibold bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 px-2 py-1 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 4. Atividade (Dropdown listando TODAS as cadastradas) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Atividade / Modalidade:
                </label>
                <select
                  value={formActivityId}
                  onChange={(e) => setFormActivityId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {activitiesList.map((act) => (
                    <option key={act.id} value={act.id}>
                      {act.name} {act.requiresRollCall !== false ? '• (Exige Chamada)' : '• (Rotina / Grade)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Local / Sala (Opcional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Local / Sala (Opcional):
                </label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="Ex: Piscina Aquecida, Sala de Dança, Refeitório..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {COMMON_LOCATIONS.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setFormLocation(loc)}
                      className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. Orientações para a Monitora (Opcional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Orientações para a Monitora / Professor (Opcional):
                </label>
                <textarea
                  value={formGuidelines}
                  onChange={(e) => setFormGuidelines(e.target.value)}
                  rows={2}
                  placeholder="Ex: Conferir toucas antes de entrar na piscina; levar garrafas de água; separar material de leitura..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md shadow-indigo-500/20 transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingBlock ? 'Salvar Alterações' : 'Salvar na Grade'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {blockToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Excluir Horário da Grade?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Deseja remover o horário de <strong>{blockToDelete.activityId}</strong> ({blockToDelete.startTime} - {blockToDelete.endTime}) da turma <strong>{blockToDelete.turma}</strong>?
              </p>
            </div>
            <div className="flex items-center justify-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setBlockToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteBlock}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/20 cursor-pointer"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
