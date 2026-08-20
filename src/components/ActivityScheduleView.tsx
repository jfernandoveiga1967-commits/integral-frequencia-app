import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Calendar,
  Clock,
  MapPin,
  Users,
  Search,
  Filter,
  Download,
  Printer,
  ChevronRight,
  Plus,
  Info,
  CheckCircle2,
  FileText,
  Layers,
  GraduationCap,
  MessageSquare,
  Phone,
  ArrowRight,
  ShieldCheck,
  Edit2,
  CalendarDays,
} from 'lucide-react';
import {
  ScheduleBlock,
  DayOfWeek,
  TurmaType,
  ActivityItem,
  ActivityType,
  UserProfile,
} from '../types';
import { ActivityBadge, renderActivityIconOrImage } from './ActivityBadge';
import { sortTurmasPedagogical } from '../utils/turmaUtils';
import { generateActivitySchedulePDF } from '../utils/pdfGenerator';
import { formatPhoneDisplay, generateWhatsAppUrl } from '../utils/whatsappUtils';
import { isCoordenador } from '../utils/authUtils';

interface ActivityScheduleViewProps {
  activitiesList: ActivityItem[];
  schedules: ScheduleBlock[];
  turmas: TurmaType[];
  users?: UserProfile[];
  currentUser?: UserProfile | null;
  onOpenNewBlock?: (activityId?: string) => void;
  onEditBlock?: (block: ScheduleBlock) => void;
  onSwitchToTurmaView?: (turma?: TurmaType) => void;
}

const DAYS_OF_WEEK_MAP: { id: DayOfWeek; label: string; short: string; order: number; color: string; badgeBg: string }[] = [
  { id: 'segunda', label: 'Segunda-feira', short: 'SEG', order: 1, color: 'text-indigo-700 border-indigo-200 bg-indigo-50', badgeBg: 'bg-indigo-600' },
  { id: 'terca', label: 'Terça-feira', short: 'TER', order: 2, color: 'text-sky-700 border-sky-200 bg-sky-50', badgeBg: 'bg-sky-600' },
  { id: 'quarta', label: 'Quarta-feira', short: 'QUA', order: 3, color: 'text-emerald-700 border-emerald-200 bg-emerald-50', badgeBg: 'bg-emerald-600' },
  { id: 'quinta', label: 'Quinta-feira', short: 'QUI', order: 4, color: 'text-amber-700 border-amber-200 bg-amber-50', badgeBg: 'bg-amber-600' },
  { id: 'sexta', label: 'Sexta-feira', short: 'SEX', order: 5, color: 'text-purple-700 border-purple-200 bg-purple-50', badgeBg: 'bg-purple-600' },
];

export const ActivityScheduleView: React.FC<ActivityScheduleViewProps> = ({
  activitiesList,
  schedules,
  turmas,
  users = [],
  currentUser = null,
  onOpenNewBlock,
  onEditBlock,
  onSwitchToTurmaView,
}) => {
  const isCoord = isCoordenador(currentUser);

  // Selected Activity State (default to first activity with schedules or first in list)
  const [selectedActivityId, setSelectedActivityId] = useState<string>(() => {
    // Find first activity that has at least one schedule block
    for (const act of activitiesList) {
      const hasBlock = schedules.some((s) => s.activityId === act.id);
      if (hasBlock) return act.id;
    }
    return activitiesList[0]?.id || 'Natação';
  });

  // Filter / Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDayFilter, setSelectedDayFilter] = useState<'TODOS' | DayOfWeek>('TODOS');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Activity object
  const currentActivity = useMemo(() => {
    return (
      activitiesList.find((a) => a.id === selectedActivityId) || {
        id: selectedActivityId,
        name: selectedActivityId,
        icon: 'Sparkles',
        description: 'Atividade extracurricular integrada à rotina do Integral.',
        defaultEquipment: 'Material padrão',
        requiresRollCall: true,
      }
    );
  }, [activitiesList, selectedActivityId]);

  // Responsible teacher(s) for the current activity
  const responsibleTeachers = useMemo(() => {
    const list = users.filter((u) => {
      const matchAssigned = u.assignedActivities?.some(
        (act) => act.trim().toLowerCase() === selectedActivityId.trim().toLowerCase()
      );
      const matchSpecialty = u.specialtyActivity?.trim().toLowerCase() === selectedActivityId.trim().toLowerCase();
      return matchAssigned || matchSpecialty;
    });
    return list;
  }, [users, selectedActivityId]);

  const teacherNameString = useMemo(() => {
    if (responsibleTeachers.length > 0) {
      return responsibleTeachers.map((t) => t.name).join(', ');
    }
    return 'Docente Especialista / Coordenação';
  }, [responsibleTeachers]);

  // Consolidated & Sorted list of schedule blocks for the selected activity
  const filteredBlocks = useMemo(() => {
    const matched = schedules.filter((s) => {
      const isAct =
        s.activityId?.trim().toLowerCase() === selectedActivityId.trim().toLowerCase() ||
        s.activityId === selectedActivityId;
      if (!isAct) return false;

      if (selectedDayFilter !== 'TODOS' && s.dayOfWeek !== selectedDayFilter) {
        return false;
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchTurma = s.turma?.toLowerCase().includes(term);
        const matchLoc = s.location?.toLowerCase().includes(term);
        const matchNotes = s.guidelines?.toLowerCase().includes(term);
        if (!matchTurma && !matchLoc && !matchNotes) {
          return false;
        }
      }

      return true;
    });

    // Strictly sort by Day of the week (order 1..5) then by Start Time, then End Time, then Turma
    return matched.sort((a, b) => {
      const dayA = DAYS_OF_WEEK_MAP.find((d) => d.id === a.dayOfWeek)?.order || 99;
      const dayB = DAYS_OF_WEEK_MAP.find((d) => d.id === b.dayOfWeek)?.order || 99;
      if (dayA !== dayB) return dayA - dayB;

      const timeComp = a.startTime.localeCompare(b.startTime);
      if (timeComp !== 0) return timeComp;

      const endComp = a.endTime.localeCompare(b.endTime);
      if (endComp !== 0) return endComp;

      return (a.turma || '').localeCompare(b.turma || '', 'pt-BR', { numeric: true });
    });
  }, [schedules, selectedActivityId, selectedDayFilter, searchTerm]);

  // Statistics
  const uniqueTurmasInActivity = useMemo(() => {
    const allForAct = schedules.filter(
      (s) =>
        s.activityId?.trim().toLowerCase() === selectedActivityId.trim().toLowerCase() ||
        s.activityId === selectedActivityId
    );
    const set = new Set(allForAct.map((b) => b.turma));
    return sortTurmasPedagogical(Array.from(set));
  }, [schedules, selectedActivityId]);

  const totalWeeklyClasses = useMemo(() => {
    return schedules.filter(
      (s) =>
        s.activityId?.trim().toLowerCase() === selectedActivityId.trim().toLowerCase() ||
        s.activityId === selectedActivityId
    ).length;
  }, [schedules, selectedActivityId]);

  // Helper to find teacher for a specific block
  const getBlockTeacher = (block: ScheduleBlock): { name: string; phone?: string; avatarColor?: string } => {
    // 1. Try to find teacher assigned to both this activity AND this turma
    const specific = users.find(
      (u) =>
        (u.assignedActivities?.includes(block.activityId) || u.specialtyActivity === block.activityId) &&
        (u.assignedTurmas?.includes(block.turma) || u.allowedClassIds?.includes(block.turma))
    );
    if (specific) {
      return { name: specific.name, phone: specific.phone, avatarColor: specific.avatarColor };
    }

    // 2. Try any specialist of this activity
    if (responsibleTeachers.length > 0) {
      return {
        name: responsibleTeachers[0].name,
        phone: responsibleTeachers[0].phone,
        avatarColor: responsibleTeachers[0].avatarColor,
      };
    }

    return { name: 'Professor(a) da Modalidade' };
  };

  // Direct PDF Download Handler
  const handleDownloadPDF = () => {
    try {
      generateActivitySchedulePDF({
        activityName: currentActivity.name || currentActivity.id,
        schedules,
        activitiesList,
        users,
        schoolYear: new Date().getFullYear(),
        teacherName: teacherNameString,
      });
      showToast(`PDF oficial da Grade de ${currentActivity.name} gerado com sucesso!`, 'success');
    } catch (err) {
      console.error('Error generating activity schedule PDF:', err);
      showToast('Ocorreu um erro ao gerar o PDF. Verifique os dados e tente novamente.', 'error');
    }
  };

  // Browser Print Handler (@media print)
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {toastMsg && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-center space-x-3 text-xs font-bold transition-all animate-bounce print:hidden ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
              : 'bg-rose-950 text-rose-300 border-rose-800'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. SCREEN-ONLY CONTROLS & HEADER (Hidden on print) */}
      {/* ========================================================================= */}
      <div className="print:hidden space-y-6">
        {/* Main Header & Actions */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-sm">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full border border-indigo-200">
                    Quadro Geral Especialista
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    {totalWeeklyClasses} horários cadastrados para {currentActivity.name}
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mt-1">
                  Grade Geral por Atividade / Modalidade
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Consulte e imprima todos os horários e turmas de cada modalidade com docentes responsáveis e salas.
                </p>
              </div>
            </div>

            {/* Actions: Print / PDF & Add Block */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                id="btn-print-activity-schedule"
                onClick={handlePrint}
                title="Imprimir visualização formatada para papel / Salvar PDF do navegador"
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-md shadow-slate-900/10 transition-all cursor-pointer flex items-center space-x-2"
              >
                <Printer className="w-4 h-4 text-slate-200" />
                <span>Imprimir / Gerar PDF</span>
              </button>

              <button
                type="button"
                id="btn-download-pdf-activity-schedule"
                onClick={handleDownloadPDF}
                title="Baixar arquivo PDF com cabeçalho oficial do Colégio Crescer"
                className="px-4 py-2.5 bg-white hover:bg-slate-50 text-indigo-700 font-extrabold text-xs sm:text-sm rounded-2xl border border-indigo-200 shadow-xs transition-all cursor-pointer flex items-center space-x-2"
              >
                <Download className="w-4 h-4 text-indigo-600" />
                <span>Baixar PDF Oficial</span>
              </button>

              {isCoord && onOpenNewBlock && (
                <button
                  type="button"
                  onClick={() => onOpenNewBlock(selectedActivityId)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-md shadow-indigo-500/20 transition-all cursor-pointer flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Horário</span>
                </button>
              )}
            </div>
          </div>

          {/* Activity / Modality Selector Strip */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                Selecione a Modalidade / Oficina:
              </span>
              <span className="text-[11px] text-slate-400 font-semibold hidden sm:inline">
                {activitiesList.length} modalidades disponíveis
              </span>
            </div>

            <div className="flex items-center gap-2.5 overflow-x-auto pb-2 no-scrollbar">
              {activitiesList.map((act) => {
                const isSelected = selectedActivityId === act.id;
                const classCount = schedules.filter(
                  (s) =>
                    s.activityId?.trim().toLowerCase() === act.id.trim().toLowerCase() ||
                    s.activityId === act.id
                ).length;

                return (
                  <button
                    key={act.id}
                    id={`select-activity-${act.id.replace(/\s+/g, '-').toLowerCase()}`}
                    type="button"
                    onClick={() => setSelectedActivityId(act.id)}
                    className={`px-3.5 py-2 rounded-2xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-2.5 border shrink-0 ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-500/20 scale-[1.02]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="shrink-0">
                      {renderActivityIconOrImage(act.icon, act.customIconUrl, isSelected ? 'w-4 h-4 text-white' : 'w-4 h-4 text-indigo-600')}
                    </div>
                    <span>{act.name || act.id}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : classCount > 0
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {classCount} {classCount === 1 ? 'aula' : 'aulas'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Highlighted Activity Overview Bento Card */}
        <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white rounded-3xl p-6 shadow-xl border border-indigo-800/40 relative overflow-hidden">
          {/* Subtle decorative background pattern */}
          <div className="absolute right-0 top-0 translate-x-12 -translate-y-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            {/* Left: Activity Info & Specialist */}
            <div className="flex items-start sm:items-center space-x-4 min-w-0 flex-1">
              <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shrink-0 shadow-inner">
                {renderActivityIconOrImage(currentActivity.icon, currentActivity.customIconUrl, 'w-9 h-9 text-amber-300')}
              </div>

              <div className="min-w-0 space-y-1.5 flex-1">
                <div className="flex items-center flex-wrap gap-2">
                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    {currentActivity.name || currentActivity.id}
                  </h3>
                  {currentActivity.requiresRollCall !== false ? (
                    <span className="text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-400/30">
                      ✓ Exige Chamada
                    </span>
                  ) : (
                    <span className="text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-400/30">
                      Grade / Rotina Geral
                    </span>
                  )}
                  {currentActivity.isCustom && (
                    <span className="text-[10px] font-extrabold uppercase bg-purple-500/20 text-purple-300 px-2.5 py-0.5 rounded-full border border-purple-400/30">
                      Personalizada
                    </span>
                  )}
                </div>

                <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
                  <span className="flex items-center space-x-1.5">
                    <GraduationCap className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="font-semibold text-slate-200">
                      Professor(a) Especialista:
                    </span>
                    <span className="font-bold text-white">
                      {teacherNameString}
                    </span>
                  </span>

                  <span className="flex items-center space-x-1.5 text-slate-300">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>Ano Letivo {new Date().getFullYear()}</span>
                  </span>
                </div>

                {currentActivity.defaultEquipment && (
                  <p className="text-xs text-indigo-200/90 font-medium">
                    <span className="font-bold text-indigo-100">Equipamento Padrão: </span>
                    {currentActivity.defaultEquipment}
                  </p>
                )}
              </div>
            </div>

            {/* Right: Quick Metrics Counters */}
            <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
              <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-3 text-center min-w-[95px]">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-200 block">
                  Aulas / Sem
                </span>
                <span className="text-2xl font-black text-white">
                  {totalWeeklyClasses}
                </span>
              </div>

              <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-3 text-center min-w-[95px]">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-200 block">
                  Turmas
                </span>
                <span className="text-2xl font-black text-white">
                  {uniqueTurmasInActivity.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Bar: Day of Week Pills & Search Input */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Day of Week Selector */}
          <div className="flex items-center flex-wrap gap-1.5 w-full md:w-auto">
            <span className="text-xs font-extrabold text-slate-500 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              Dia:
            </span>

            <button
              type="button"
              onClick={() => setSelectedDayFilter('TODOS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                selectedDayFilter === 'TODOS'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Todos os Dias ({totalWeeklyClasses})
            </button>

            {DAYS_OF_WEEK_MAP.map((d) => {
              const count = schedules.filter(
                (s) =>
                  (s.activityId?.trim().toLowerCase() === selectedActivityId.trim().toLowerCase() ||
                    s.activityId === selectedActivityId) &&
                  s.dayOfWeek === d.id
              ).length;
              const isSelected = selectedDayFilter === d.id;

              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDayFilter(d.id)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer border flex items-center space-x-1.5 ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs ring-2 ring-indigo-500/20'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>{d.short}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                      isSelected ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar turma, sala..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9.5 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CONSOLIDATED TABLE ON SCREEN */}
        {/* ========================================================================= */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          {filteredBlocks.length === 0 ? (
            <div className="p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto">
                <CalendarDays className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-slate-900">
                  Nenhum horário cadastrado para {currentActivity.name}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {selectedDayFilter !== 'TODOS' || searchTerm
                    ? 'Nenhum resultado corresponde aos filtros selecionados. Tente limpar os filtros.'
                    : 'Esta modalidade ainda não foi incluída na grade semanal de nenhuma turma.'}
                </p>
              </div>
              {isCoord && onOpenNewBlock && (
                <button
                  type="button"
                  onClick={() => onOpenNewBlock(selectedActivityId)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-2xl shadow-md transition-all inline-flex items-center space-x-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Cadastrar Primeiro Horário de {currentActivity.name}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[11px] font-extrabold uppercase tracking-wider">
                    <th className="py-3.5 px-4 rounded-tl-3xl">Dia da Semana</th>
                    <th className="py-3.5 px-4">Horário (Início - Fim)</th>
                    <th className="py-3.5 px-4">Turma</th>
                    <th className="py-3.5 px-4">Local / Sala</th>
                    <th className="py-3.5 px-4">Professor(a) / Monitor(a)</th>
                    <th className="py-3.5 px-4">Orientações Pedagógicas</th>
                    <th className="py-3.5 px-4 text-right rounded-tr-3xl">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredBlocks.map((block) => {
                    const dayConfig =
                      DAYS_OF_WEEK_MAP.find((d) => d.id === block.dayOfWeek) || DAYS_OF_WEEK_MAP[0];
                    const teacherInfo = getBlockTeacher(block);

                    return (
                      <tr
                        key={block.id}
                        className="hover:bg-indigo-50/40 transition-colors group"
                      >
                        {/* Dia da Semana */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-xs font-extrabold border ${dayConfig.color}`}
                          >
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            <span>{dayConfig.label}</span>
                          </span>
                        </td>

                        {/* Horário */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="text-xs font-extrabold text-slate-900">
                              {block.startTime} às {block.endTime}
                            </span>
                          </div>
                        </td>

                        {/* Turma */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onSwitchToTurmaView && onSwitchToTurmaView(block.turma)}
                            title="Ver grade completa desta turma"
                            className="inline-flex items-center space-x-1.5 text-xs font-extrabold text-indigo-700 hover:text-indigo-900 bg-indigo-50/80 hover:bg-indigo-100 px-2.5 py-1 rounded-xl border border-indigo-200 transition-all cursor-pointer"
                          >
                            <span>{block.turma}</span>
                            <ArrowRight className="w-3 h-3 text-indigo-500 opacity-60 group-hover:opacity-100" />
                          </button>
                        </td>

                        {/* Local / Sala */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-1.5 text-slate-700">
                            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <span className="font-semibold">
                              {block.location || 'Sala Padrão'}
                            </span>
                          </div>
                        </td>

                        {/* Professor / Monitor */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <div
                              className={`w-7 h-7 rounded-lg ${
                                teacherInfo.avatarColor || 'bg-indigo-600'
                              } text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs`}
                            >
                              {teacherInfo.name ? teacherInfo.name.charAt(0).toUpperCase() : 'P'}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-slate-900 block truncate">
                                {teacherInfo.name}
                              </span>
                              {teacherInfo.phone && (
                                <span className="text-[10px] text-emerald-700 font-bold">
                                  {formatPhoneDisplay(teacherInfo.phone)}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Orientações Pedagógicas */}
                        <td className="py-3.5 px-4 max-w-xs">
                          <span className="text-xs text-slate-600 line-clamp-2" title={block.guidelines}>
                            {block.guidelines || currentActivity.defaultEquipment || '-'}
                          </span>
                        </td>

                        {/* Ações */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-1.5">
                            {teacherInfo.phone && (
                              <a
                                href={generateWhatsAppUrl(
                                  teacherInfo.phone,
                                  `Olá, ${teacherInfo.name}!\nInformamos o horário de ${currentActivity.name} (${block.turma}) em ${dayConfig.label} das ${block.startTime} às ${block.endTime} no local: ${block.location || 'Espaço padrão'}.`
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-all cursor-pointer"
                                title="Enviar mensagem no WhatsApp"
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                              </a>
                            )}

                            {isCoord && onEditBlock && (
                              <button
                                type="button"
                                onClick={() => onEditBlock(block)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 transition-all cursor-pointer"
                                title="Editar este horário"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. PRINT-ONLY CONTAINER (@media print) */}
      {/* Clean, official printable sheet formatted specifically for physical printing */}
      {/* ========================================================================= */}
      <div className="hidden print:block text-black bg-white p-2">
        {/* Printable Header Banner */}
        <div className="border-b-2 border-slate-900 pb-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black tracking-widest text-indigo-700 uppercase block">
                COLÉGIO CRESCER • PROGRAMA INTEGRAL
              </span>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight mt-0.5">
                Grade de Horários - {currentActivity.name || currentActivity.id}
              </h1>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                Quadro Geral Consolidado de Turmas, Espaços e Docentes da Modalidade
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-900 block">
                Ano Letivo {new Date().getFullYear()}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                Emitido em: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          {/* Printable Info Box */}
          <div className="mt-3 p-2.5 bg-slate-50 border border-slate-300 rounded-lg flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-slate-900">Professor(a) Especialista Responsável: </span>
              <span className="font-semibold text-slate-800">{teacherNameString}</span>
            </div>
            <div className="space-x-4 font-bold text-slate-800">
              <span>Total de Aulas Semanais: {totalWeeklyClasses}</span>
              <span>Turmas Atendidas: {uniqueTurmasInActivity.length}</span>
            </div>
          </div>
        </div>

        {/* Printable Clean Table */}
        <table className="w-full text-left border-collapse border border-slate-400 text-xs">
          <thead>
            <tr className="bg-slate-200 text-slate-900 font-bold border-b border-slate-400">
              <th className="p-2 border-r border-slate-400">Dia da Semana</th>
              <th className="p-2 border-r border-slate-400">Horário</th>
              <th className="p-2 border-r border-slate-400">Turma</th>
              <th className="p-2 border-r border-slate-400">Local / Sala</th>
              <th className="p-2 border-r border-slate-400">Professor(a) / Monitor(a)</th>
              <th className="p-2">Orientações / Material</th>
            </tr>
          </thead>
          <tbody>
            {filteredBlocks.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-slate-500">
                  Nenhum horário cadastrado para esta modalidade na grade semanal.
                </td>
              </tr>
            ) : (
              filteredBlocks.map((block, idx) => {
                const dayConfig =
                  DAYS_OF_WEEK_MAP.find((d) => d.id === block.dayOfWeek) || DAYS_OF_WEEK_MAP[0];
                const teacherInfo = getBlockTeacher(block);

                return (
                  <tr
                    key={block.id}
                    className={`border-b border-slate-300 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                  >
                    <td className="p-2 border-r border-slate-300 font-bold">
                      {dayConfig.label}
                    </td>
                    <td className="p-2 border-r border-slate-300 font-semibold whitespace-nowrap">
                      {block.startTime} às {block.endTime}
                    </td>
                    <td className="p-2 border-r border-slate-300 font-bold">
                      {block.turma}
                    </td>
                    <td className="p-2 border-r border-slate-300">
                      {block.location || 'Sala Padrão'}
                    </td>
                    <td className="p-2 border-r border-slate-300">
                      {teacherInfo.name}
                    </td>
                    <td className="p-2">
                      {block.guidelines || currentActivity.defaultEquipment || '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Printable Signatures */}
        <div className="mt-12 pt-6 flex justify-around text-center text-xs text-slate-700">
          <div className="w-64 border-t border-slate-400 pt-2">
            <span className="font-bold block">
              Professor(a) Especialista ({currentActivity.name || currentActivity.id})
            </span>
            <span className="text-[10px] text-slate-500">{teacherNameString}</span>
          </div>
          <div className="w-64 border-t border-slate-400 pt-2">
            <span className="font-bold block">Coordenação do Programa Integral</span>
            <span className="text-[10px] text-slate-500">Colégio Crescer</span>
          </div>
        </div>
      </div>
    </div>
  );
};
