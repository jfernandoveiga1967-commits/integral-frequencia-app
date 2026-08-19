import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  MapPin,
  FileText,
  Users,
  CheckCircle2,
  AlertCircle,
  Radio,
  Search,
  Filter,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Play,
  Check,
  RotateCcw,
  Calendar,
  Layers,
  ChevronRight,
  ClipboardCheck,
  Palmtree,
  SlidersHorizontal,
  X,
  Stethoscope,
  Shirt,
  LogOut,
  Eye,
  CalendarOff,
  MessageSquare,
  Phone,
} from 'lucide-react';
import {
  Student,
  AttendanceRecord,
  TurmaType,
  ActivityType,
  ActivityItem,
  ScheduleBlock,
  HolidayItem,
  WeekInfo,
  UserProfile,
  DayOfWeek,
  AttendanceStatus,
} from '../types';
import { ActivityBadge, renderActivityIconOrImage } from './ActivityBadge';
import { StatusBadge } from './StatusBadge';
import { WhatsAppNotifyModal } from './WhatsAppNotifyModal';
import {
  getDayOfWeekFromDate,
  getDayOfWeekLabel,
  isWeekend,
  isHolidayOrRecess,
  formatDateBR,
  toISODateString,
} from '../utils/dateUtils';
import { canMarkAttendance, isCoordenador } from '../utils/authUtils';

interface CurrentActivitiesProps {
  students: Student[];
  records: AttendanceRecord[];
  turmas: string[];
  activitiesList: ActivityItem[];
  schedules: ScheduleBlock[];
  holidays?: HolidayItem[];
  currentWeek: WeekInfo;
  selectedDate: string;
  currentUser: UserProfile | null;
  users?: UserProfile[];
  onSaveRecord: (record: Omit<AttendanceRecord, 'id' | 'createdAt'>) => void;
  onBatchMarkPresent: (studentIds: string[], activity: ActivityType | 'TODAS', date: string) => void;
  onClearRecords: (studentIds: string[], activity: ActivityType | 'TODAS', date: string) => void;
  onNavigateToAttendance: (activity?: ActivityType, turma?: TurmaType, date?: string) => void;
  onUpdateUserPhone?: (userId: string, newPhone: string) => void;
}

export const CurrentActivities: React.FC<CurrentActivitiesProps> = ({
  students,
  records,
  turmas,
  activitiesList,
  schedules,
  holidays = [],
  currentWeek,
  selectedDate,
  currentUser,
  users = [],
  onSaveRecord,
  onBatchMarkPresent,
  onClearRecords,
  onNavigateToAttendance,
  onUpdateUserPhone,
}) => {
  // Real-time system clock state
  const [systemTime, setSystemTime] = useState<string>(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [systemSeconds, setSystemSeconds] = useState<number>(() => new Date().getSeconds());

  // Simulation mode states
  const [isSimulatingTime, setIsSimulatingTime] = useState<boolean>(false);
  const [simulatedTime, setSimulatedTime] = useState<string>('14:30');
  const [simulatedDay, setSimulatedDay] = useState<DayOfWeek>('segunda');

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'TODAS' | 'EM_ANDAMENTO' | 'EXIGE_CHAMADA' | 'CHAMADA_PENDENTE' | 'SEM_ATIVIDADE'>('TODAS');
  const [selectedActivityFilter, setSelectedActivityFilter] = useState<string>('TODAS');

  // Quick Roll Call modal state
  const [quickRollCallModal, setQuickRollCallModal] = useState<{
    isOpen: boolean;
    turma: string;
    activityId: string;
    block: ScheduleBlock;
  } | null>(null);

  // WhatsApp Notify modal state
  const [whatsAppModalData, setWhatsAppModalData] = useState<{
    isOpen: boolean;
    turmaName: string;
    activityName: string;
    startTime: string;
    endTime: string;
    location?: string;
    guidelines?: string;
  } | null>(null);

  // Update real-time clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      setSystemTime(`${hh}:${mm}`);
      setSystemSeconds(d.getSeconds());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute effective day and time
  const realDayOfWeek = useMemo<DayOfWeek | null>(() => {
    return getDayOfWeekFromDate(new Date());
  }, []);

  const selectedDateDayOfWeek = useMemo<DayOfWeek | null>(() => {
    return getDayOfWeekFromDate(selectedDate);
  }, [selectedDate]);

  const effectiveDayOfWeek: DayOfWeek = isSimulatingTime
    ? simulatedDay
    : (selectedDateDayOfWeek || realDayOfWeek || 'segunda');

  const effectiveCurrentTime: string = isSimulatingTime ? simulatedTime : systemTime;

  // Check if selected date is weekend or holiday in real mode
  const isWeekendDay = useMemo(() => isWeekend(selectedDate), [selectedDate]);
  const holidayInfo = useMemo(() => isHolidayOrRecess(selectedDate, holidays), [selectedDate, holidays]);

  const userCanMark = canMarkAttendance(currentUser);
  const isCoord = isCoordenador(currentUser);

  // Map of activity ID -> ActivityItem
  const activityMap = useMemo(() => {
    const map = new Map<string, ActivityItem>();
    activitiesList.forEach((act) => {
      map.set(act.id, act);
      map.set(act.name, act);
    });
    return map;
  }, [activitiesList]);

  // Allowed turmas for user
  const allowedTurmas = useMemo(() => {
    const sorted = [...turmas].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    if (isCoord || !currentUser) return sorted;
    const userTurmas = new Set(currentUser.allowedClassIds || currentUser.assignedTurmas || []);
    return sorted.filter((t) => userTurmas.has(t));
  }, [turmas, isCoord, currentUser]);

  // Compute activity state per turma
  const turmaStatuses = useMemo(() => {
    return allowedTurmas.map((turmaName) => {
      // All blocks for this turma on this day
      const turmaBlocks = schedules
        .filter((s) => s.turma === turmaName && s.dayOfWeek === effectiveDayOfWeek)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      // Active block
      const activeBlock = turmaBlocks.find(
        (b) => effectiveCurrentTime >= b.startTime && effectiveCurrentTime < b.endTime
      ) || null;

      // Next upcoming block
      const nextBlock = turmaBlocks.find(
        (b) => effectiveCurrentTime < b.startTime
      ) || null;

      // Past blocks today
      const pastBlocks = turmaBlocks.filter(
        (b) => effectiveCurrentTime >= b.endTime
      );

      // Roll call details if active block requires roll call
      let rollCallInfo = null;
      if (activeBlock) {
        const actObj = activityMap.get(activeBlock.activityId);
        const requiresRollCall = actObj ? actObj.requiresRollCall !== false : true;

        // Enrolled students in this turma for this activity
        const enrolledStudents = students.filter(
          (s) => s.turma === turmaName && (s.activities || []).includes(activeBlock.activityId)
        );

        // Attendance records today for this turma & activity
        const recordsToday = records.filter(
          (r) =>
            r.date === selectedDate &&
            r.turma === turmaName &&
            r.activity === activeBlock.activityId
        );

        const recordStudentIds = new Set(recordsToday.map((r) => r.studentId));
        const recordedCount = enrolledStudents.filter((s) => recordStudentIds.has(s.id)).length;
        const totalEnrolled = enrolledStudents.length;

        const presents = recordsToday.filter((r) => r.status === 'presente').length;
        const faltas = recordsToday.filter((r) => r.status === 'falta').length;
        const saude = recordsToday.filter((r) => r.status === 'saude').length;
        const semEquip = recordsToday.filter((r) => r.status === 'sem_equipamento').length;
        const saidaAnt = recordsToday.filter((r) => r.status === 'saida_antecipada').length;

        let statusType: 'concluida' | 'parcial' | 'pendente' | 'sem_alunos' = 'pendente';
        if (totalEnrolled === 0) {
          statusType = 'sem_alunos';
        } else if (recordedCount >= totalEnrolled) {
          statusType = 'concluida';
        } else if (recordedCount > 0) {
          statusType = 'parcial';
        } else {
          statusType = 'pendente';
        }

        rollCallInfo = {
          requiresRollCall,
          enrolledStudents,
          totalEnrolled,
          recordedCount,
          statusType,
          presents,
          faltas,
          saude,
          semEquip,
          saidaAnt,
        };
      }

      return {
        turmaName,
        turmaBlocks,
        activeBlock,
        nextBlock,
        pastBlocks,
        rollCallInfo,
      };
    });
  }, [
    allowedTurmas,
    schedules,
    effectiveDayOfWeek,
    effectiveCurrentTime,
    activityMap,
    students,
    records,
    selectedDate,
  ]);

  // Overall Statistics
  const stats = useMemo(() => {
    const totalTurmas = turmaStatuses.length;
    const inActivity = turmaStatuses.filter((ts) => ts.activeBlock !== null).length;
    const pendingRollCalls = turmaStatuses.filter(
      (ts) => ts.rollCallInfo && ts.rollCallInfo.requiresRollCall && ts.rollCallInfo.statusType === 'pendente' && ts.rollCallInfo.totalEnrolled > 0
    ).length;
    const completedRollCalls = turmaStatuses.filter(
      (ts) => ts.rollCallInfo && ts.rollCallInfo.requiresRollCall && ts.rollCallInfo.statusType === 'concluida' && ts.rollCallInfo.totalEnrolled > 0
    ).length;
    const totalStudentsInActivePeriods = turmaStatuses.reduce((acc, ts) => {
      if (ts.rollCallInfo && ts.rollCallInfo.requiresRollCall) {
        return acc + ts.rollCallInfo.totalEnrolled;
      }
      return acc;
    }, 0);

    return {
      totalTurmas,
      inActivity,
      pendingRollCalls,
      completedRollCalls,
      totalStudentsInActivePeriods,
    };
  }, [turmaStatuses]);

  // Filtered list of turmas
  const filteredTurmas = useMemo(() => {
    return turmaStatuses.filter((item) => {
      // Search term
      const matchesSearch =
        searchTerm.trim() === '' ||
        item.turmaName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.activeBlock &&
          (item.activeBlock.activityId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.activeBlock.location || '').toLowerCase().includes(searchTerm.toLowerCase()))) ||
        (item.nextBlock &&
          item.nextBlock.activityId.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      // Activity filter
      if (selectedActivityFilter !== 'TODAS') {
        if (!item.activeBlock || item.activeBlock.activityId !== selectedActivityFilter) {
          return false;
        }
      }

      // Status filter
      if (statusFilter === 'EM_ANDAMENTO') {
        return item.activeBlock !== null;
      }
      if (statusFilter === 'EXIGE_CHAMADA') {
        return item.rollCallInfo && item.rollCallInfo.requiresRollCall;
      }
      if (statusFilter === 'CHAMADA_PENDENTE') {
        return (
          item.rollCallInfo &&
          item.rollCallInfo.requiresRollCall &&
          item.rollCallInfo.statusType === 'pendente' &&
          item.rollCallInfo.totalEnrolled > 0
        );
      }
      if (statusFilter === 'SEM_ATIVIDADE') {
        return item.activeBlock === null;
      }

      return true;
    });
  }, [turmaStatuses, searchTerm, selectedActivityFilter, statusFilter]);

  // Quick Roll Call Student helpers
  const quickModalStudents = useMemo(() => {
    if (!quickRollCallModal) return [];
    return students.filter(
      (s) =>
        s.turma === quickRollCallModal.turma &&
        (s.activities || []).includes(quickRollCallModal.activityId)
    );
  }, [quickRollCallModal, students]);

  const quickModalRecordsMap = useMemo(() => {
    if (!quickRollCallModal) return new Map<string, AttendanceRecord>();
    const map = new Map<string, AttendanceRecord>();
    records
      .filter(
        (r) =>
          r.date === selectedDate &&
          r.turma === quickRollCallModal.turma &&
          r.activity === quickRollCallModal.activityId
      )
      .forEach((r) => map.set(r.studentId, r));
    return map;
  }, [quickRollCallModal, records, selectedDate]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Panoramic Control & Live Clock Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Title & Live Status */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                <span>MONITORAMENTO EM TEMPO REAL</span>
              </span>

              {isSimulatingTime ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  <span>Modo Simulação Ativo</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Sincronizado com o Relógio</span>
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center space-x-2">
              <span>Atividades do Momento nas Turmas</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Visão panorâmica instantânea de todas as salas, modalidades em andamento no Colégio Crescer e status de chamada.
            </p>
          </div>

          {/* Big Clock Display & Simulation Switcher */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-slate-950/60 p-3.5 sm:p-4 rounded-2xl border border-slate-800 backdrop-blur-xs">
            <div className="flex items-center space-x-3 pr-0 sm:pr-4 border-b sm:border-b-0 sm:border-r border-slate-800 pb-3 sm:pb-0">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
                <Clock className="w-6 h-6 animate-spin-slow" />
              </div>
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-300">
                  {isSimulatingTime ? 'Horário Simulado' : 'Horário Atual'}
                </div>
                <div className="text-2xl sm:text-3xl font-black tracking-tight text-white font-mono flex items-baseline space-x-1">
                  <span>{effectiveCurrentTime}</span>
                  {!isSimulatingTime && (
                    <span className="text-xs text-slate-400 font-normal">
                      :{String(systemSeconds).padStart(2, '0')}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 font-semibold">
                  {getDayOfWeekLabel(effectiveDayOfWeek)}
                </div>
              </div>
            </div>

            {/* Simulation Controls */}
            <div className="flex flex-col justify-center space-y-1.5">
              <button
                type="button"
                onClick={() => setIsSimulatingTime(!isSimulatingTime)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center space-x-1.5 cursor-pointer border ${
                  isSimulatingTime
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>{isSimulatingTime ? 'Voltar ao Tempo Real' : 'Simular Horário / Dia'}</span>
              </button>

              {isSimulatingTime && (
                <div className="flex items-center space-x-1.5">
                  <input
                    type="time"
                    value={simulatedTime}
                    onChange={(e) => setSimulatedTime(e.target.value)}
                    className="px-2 py-1 bg-slate-900 border border-amber-500/40 rounded-lg text-xs font-mono font-bold text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <select
                    value={simulatedDay}
                    onChange={(e) => setSimulatedDay(e.target.value as DayOfWeek)}
                    className="px-2 py-1 bg-slate-900 border border-amber-500/40 rounded-lg text-xs font-bold text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  >
                    <option value="segunda">Segunda</option>
                    <option value="terca">Terça</option>
                    <option value="quarta">Quarta</option>
                    <option value="quinta">Quinta</option>
                    <option value="sexta">Sexta</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Simulation Presets if simulation active */}
        {isSimulatingTime && (
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-amber-300">Atalhos de Horário:</span>
            {[
              { label: '13:30 (Acolhimento)', time: '13:35' },
              { label: '14:20 (1ª Aula)', time: '14:25' },
              { label: '15:10 (Lanche)', time: '15:15' },
              { label: '16:00 (2ª Aula)', time: '16:05' },
              { label: '16:50 (Extracurricular)', time: '16:55' },
              { label: '17:30 (Saída)', time: '17:35' },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setSimulatedTime(preset.time)}
                className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}

        {/* Weekend or Holiday notice in real mode */}
        {!isSimulatingTime && (isWeekendDay || holidayInfo) && (
          <div className="mt-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200 text-xs">
            <div className="flex items-center space-x-2.5">
              {holidayInfo ? (
                <Palmtree className="w-5 h-5 text-amber-400 shrink-0" />
              ) : (
                <CalendarOff className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <span>
                {holidayInfo
                  ? `Hoje é período de ${holidayInfo.name} (${holidayInfo.type === 'feriado' ? 'Feriado' : 'Recesso'}). A grade regular não possui aulas programadas.`
                  : 'Hoje é final de semana (sábado/domingo). Use a simulação de horário acima para visualizar a grade semanal.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsSimulatingTime(true);
                setSimulatedDay('segunda');
                setSimulatedTime('14:30');
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs hover:bg-amber-400 transition-colors shrink-0 cursor-pointer shadow-sm"
            >
              Simular Grade de Segunda-feira
            </button>
          </div>
        )}

        {/* Quick Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-5 pt-5 border-t border-slate-800">
          <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/80">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total de Turmas</div>
            <div className="text-xl sm:text-2xl font-black text-white mt-0.5">{stats.totalTurmas}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Cadastradas no sistema</div>
          </div>

          <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/80">
            <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">Em Atividade Agora</div>
            <div className="text-xl sm:text-2xl font-black text-indigo-300 mt-0.5">{stats.inActivity}</div>
            <div className="text-[10px] text-indigo-400/80 mt-0.5">Com horário em curso</div>
          </div>

          <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/80">
            <div className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">Chamadas Pendentes</div>
            <div className="text-xl sm:text-2xl font-black text-rose-300 mt-0.5">{stats.pendingRollCalls}</div>
            <div className="text-[10px] text-rose-400/80 mt-0.5">Aguardando registro</div>
          </div>

          <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/80">
            <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Alunos Ativos</div>
            <div className="text-xl sm:text-2xl font-black text-emerald-300 mt-0.5">
              {stats.totalStudentsInActivePeriods}
            </div>
            <div className="text-[10px] text-emerald-400/80 mt-0.5">Em aulas extracurriculares</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por turma, modalidade, sala ou professor..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Activity Dropdown */}
          <div className="w-full md:w-64">
            <select
              value={selectedActivityFilter}
              onChange={(e) => setSelectedActivityFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="TODAS">Todas as Atividades</option>
              {activitiesList.map((act) => (
                <option key={act.id} value={act.id}>
                  {act.name} {act.requiresRollCall !== false ? '(Chamada)' : '(Grade)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-400 mr-1 flex items-center space-x-1">
            <Filter className="w-3 h-3" />
            <span>Filtrar:</span>
          </span>

          {[
            { id: 'TODAS', label: `Todas (${turmaStatuses.length})` },
            { id: 'EM_ANDAMENTO', label: `Em Andamento (${stats.inActivity})` },
            { id: 'EXIGE_CHAMADA', label: 'Exige Chamada' },
            {
              id: 'CHAMADA_PENDENTE',
              label: `Chamada Pendente (${stats.pendingRollCalls})`,
              badgeColor: 'text-rose-600',
            },
            { id: 'SEM_ATIVIDADE', label: 'Sem Atividade Agora' },
          ].map((f) => {
            const isSelected = statusFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id as any)}
                className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of Class Cards */}
      {filteredTurmas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-800">Nenhuma turma encontrada</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Nenhuma turma corresponde aos filtros selecionados no horário de {effectiveCurrentTime}.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('TODAS');
              setSelectedActivityFilter('TODAS');
            }}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Limpar Filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredTurmas.map((item) => {
            const { turmaName, activeBlock, nextBlock, rollCallInfo } = item;
            const actDetails = activeBlock ? activityMap.get(activeBlock.activityId) : null;
            const nextActDetails = nextBlock ? activityMap.get(nextBlock.activityId) : null;

            const isClassActive = activeBlock !== null;

            return (
              <div
                key={turmaName}
                className={`rounded-3xl border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-md ${
                  isClassActive
                    ? 'bg-white border-indigo-200 ring-1 ring-indigo-500/20'
                    : 'bg-slate-50/70 border-slate-200 opacity-90 hover:opacity-100'
                }`}
              >
                {/* Card Top: Turma Header */}
                <div
                  className={`p-4 sm:p-5 border-b flex items-center justify-between ${
                    isClassActive
                      ? 'bg-gradient-to-r from-indigo-900 to-slate-900 text-white border-slate-800'
                      : 'bg-slate-100/80 text-slate-800 border-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-xs ${
                        isClassActive
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-sm sm:text-base leading-tight truncate">
                        {turmaName}
                      </h3>
                      <p
                        className={`text-[11px] font-semibold ${
                          isClassActive ? 'text-indigo-300' : 'text-slate-500'
                        }`}
                      >
                        {item.turmaBlocks.length} horários cadastrados na grade
                      </p>
                    </div>
                  </div>

                  {/* Active vs Idle Tag */}
                  {isClassActive ? (
                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Em Andamento</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-200/80 text-slate-600 border border-slate-300/80 shrink-0">
                      <span>Sem Atividade</span>
                    </span>
                  )}
                </div>

                {/* Card Body: Active Activity or Idle Message */}
                <div className="p-4 sm:p-5 space-y-4 flex-1">
                  {isClassActive && activeBlock ? (
                    <div className="space-y-3">
                      {/* Activity Name & Icon */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-inner">
                            {renderActivityIconOrImage(
                              actDetails?.icon,
                              actDetails?.customIconUrl,
                              'w-5 h-5',
                              activeBlock.activityId
                            )}
                          </div>
                          <div>
                            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                              Atividade do Momento
                            </div>
                            <div className="text-base font-black text-slate-900 leading-tight">
                              {activeBlock.activityId}
                            </div>
                          </div>
                        </div>

                        {/* Time interval chip */}
                        <div className="text-right">
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Clock className="w-3 h-3 text-indigo-500" />
                            <span>
                              {activeBlock.startTime} às {activeBlock.endTime}
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* Location & Guidelines */}
                      <div className="space-y-1.5 bg-slate-50 rounded-2xl p-3 border border-slate-100 text-xs">
                        <div className="flex items-center space-x-2 text-slate-700 font-semibold">
                          <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="text-slate-500">Local / Sala:</span>
                          <span className="font-bold text-slate-900">
                            {activeBlock.location || 'Local da Turma'}
                          </span>
                        </div>

                        {activeBlock.guidelines && (
                          <div className="flex items-start space-x-2 text-slate-600 pt-1 border-t border-slate-200/60 text-[11px] leading-relaxed">
                            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <span className="italic">{activeBlock.guidelines}</span>
                          </div>
                        )}
                      </div>

                      {/* Roll Call Status Section */}
                      {rollCallInfo && (
                        <div className="pt-2">
                          {rollCallInfo.requiresRollCall ? (
                            <div className="rounded-2xl border p-3 space-y-2.5 transition-all bg-white shadow-xs border-slate-200">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  {rollCallInfo.statusType === 'concluida' ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                  ) : rollCallInfo.statusType === 'parcial' ? (
                                    <AlertCircle className="w-4 h-4 text-amber-500" />
                                  ) : (
                                    <AlertCircle className="w-4 h-4 text-rose-500" />
                                  )}
                                  <span className="text-xs font-black text-slate-800">
                                    {rollCallInfo.statusType === 'concluida'
                                      ? 'Chamada Concluída'
                                      : rollCallInfo.statusType === 'parcial'
                                      ? 'Chamada Parcial'
                                      : 'Chamada Pendente'}
                                  </span>
                                </div>

                                <span
                                  className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full border ${
                                    rollCallInfo.statusType === 'concluida'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : rollCallInfo.statusType === 'parcial'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                  }`}
                                >
                                  {rollCallInfo.recordedCount} / {rollCallInfo.totalEnrolled} Alunos
                                </span>
                              </div>

                              {/* Progress bar */}
                              {rollCallInfo.totalEnrolled > 0 && (
                                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      rollCallInfo.statusType === 'concluida'
                                        ? 'bg-emerald-500'
                                        : rollCallInfo.statusType === 'parcial'
                                        ? 'bg-amber-500'
                                        : 'bg-rose-500'
                                    }`}
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        (rollCallInfo.recordedCount / rollCallInfo.totalEnrolled) * 100
                                      )}%`,
                                    }}
                                  />
                                </div>
                              )}

                              {/* Action buttons */}
                              <div className="flex items-center space-x-2 pt-1">
                                {userCanMark && rollCallInfo.totalEnrolled > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setQuickRollCallModal({
                                        isOpen: true,
                                        turma: turmaName,
                                        activityId: activeBlock.activityId,
                                        block: activeBlock,
                                      })
                                    }
                                    className="flex-1 py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                                  >
                                    <ClipboardCheck className="w-3.5 h-3.5" />
                                    <span>
                                      {rollCallInfo.statusType === 'concluida'
                                        ? 'Revisar Presença'
                                        : 'Fazer Chamada'}
                                    </span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    setWhatsAppModalData({
                                      isOpen: true,
                                      turmaName,
                                      activityName: activeBlock.activityId,
                                      startTime: activeBlock.startTime,
                                      endTime: activeBlock.endTime,
                                      location: activeBlock.location,
                                      guidelines: activeBlock.guidelines,
                                    })
                                  }
                                  className="py-1.5 px-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1"
                                  title="Avisar Monitora via WhatsApp"
                                >
                                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="hidden sm:inline">Avisar</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    onNavigateToAttendance(activeBlock.activityId, turmaName, selectedDate)
                                  }
                                  title="Abrir na Ficha de Chamada Completa"
                                  className="py-1.5 px-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold transition-colors cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-slate-100/70 rounded-xl p-2.5 border border-slate-200 text-slate-500 text-[11px] font-semibold flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                <span>Atividade de Grade Geral / Rotina Coletiva</span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setWhatsAppModalData({
                                    isOpen: true,
                                    turmaName,
                                    activityName: activeBlock.activityId,
                                    startTime: activeBlock.startTime,
                                    endTime: activeBlock.endTime,
                                    location: activeBlock.location,
                                    guidelines: activeBlock.guidelines,
                                  })
                                }
                                className="py-1 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold transition-colors cursor-pointer flex items-center space-x-1 shrink-0"
                                title="Avisar Monitora via WhatsApp"
                              >
                                <MessageSquare className="w-3 h-3 text-emerald-600" />
                                <span>Avisar Monitora</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Idle state */
                    <div className="py-6 px-4 text-center space-y-2 bg-white rounded-2xl border border-slate-200/80">
                      <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                        <Clock className="w-5 h-5 text-slate-400" />
                      </div>
                      <div className="text-xs font-bold text-slate-700">Sem atividade no momento</div>
                      <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                        A turma está em intervalo ou aguardando o próximo horário da grade curricular.
                      </p>
                    </div>
                  )}

                  {/* Next upcoming activity block */}
                  <div className="pt-2 border-t border-slate-200/80">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center space-x-1">
                      <ArrowRight className="w-3 h-3" />
                      <span>Próxima Atividade:</span>
                    </div>

                    {nextBlock ? (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100/90 border border-slate-200 text-xs">
                        <div className="flex items-center space-x-2 min-w-0">
                          <div className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                            {renderActivityIconOrImage(
                              nextActDetails?.icon,
                              nextActDetails?.customIconUrl,
                              'w-3.5 h-3.5',
                              nextBlock.activityId
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="font-extrabold text-slate-800 truncate block">
                              {nextBlock.activityId}
                            </span>
                            {nextBlock.location && (
                              <span className="text-[10px] text-slate-500 font-semibold truncate block">
                                {nextBlock.location}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0">
                          <span className="font-bold text-indigo-700 text-[11px] bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                            {nextBlock.startTime} às {nextBlock.endTime}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setWhatsAppModalData({
                                isOpen: true,
                                turmaName,
                                activityName: nextBlock.activityId,
                                startTime: nextBlock.startTime,
                                endTime: nextBlock.endTime,
                                location: nextBlock.location,
                                guidelines: nextBlock.guidelines,
                              })
                            }
                            className="p-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
                            title="Avisar Monitora da Próxima Atividade via WhatsApp"
                          >
                            <MessageSquare className="w-3 h-3 text-emerald-600" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 italic py-1">
                        Grade de horários do dia finalizada para esta turma.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Roll Call In-Place Modal */}
      {quickRollCallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-300">
                    Chamada Rápida • {quickRollCallModal.turma}
                  </div>
                  <h3 className="font-extrabold text-base text-white truncate">
                    {quickRollCallModal.activityId} ({quickRollCallModal.block.startTime} às{' '}
                    {quickRollCallModal.block.endTime})
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setQuickRollCallModal(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-xs font-extrabold text-slate-800">
                    {quickModalStudents.length} Alunos Matriculados
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    Data: {formatDateBR(selectedDate)}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      const studentIds = quickModalStudents.map((s) => s.id);
                      onBatchMarkPresent(
                        studentIds,
                        quickRollCallModal.activityId as ActivityType,
                        selectedDate
                      );
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition-colors shadow-xs flex items-center space-x-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Marcar Todos Presentes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const studentIds = quickModalStudents.map((s) => s.id);
                      onClearRecords(
                        studentIds,
                        quickRollCallModal.activityId as ActivityType,
                        selectedDate
                      );
                    }}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-200 text-slate-600 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Limpar
                  </button>
                </div>
              </div>

              {/* Student list */}
              {quickModalStudents.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Nenhum aluno matriculado nesta turma para a modalidade{' '}
                  <strong>{quickRollCallModal.activityId}</strong>.
                </div>
              ) : (
                <div className="space-y-2">
                  {quickModalStudents.map((student) => {
                    const currentRec = quickModalRecordsMap.get(student.id);
                    const currentStatus = currentRec?.status;

                    return (
                      <div
                        key={student.id}
                        className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                          currentStatus === 'presente'
                            ? 'bg-emerald-50/50 border-emerald-200'
                            : currentStatus === 'falta'
                            ? 'bg-rose-50/50 border-rose-200'
                            : currentStatus === 'saude'
                            ? 'bg-purple-50/50 border-purple-200'
                            : currentStatus === 'sem_equipamento'
                            ? 'bg-amber-50/50 border-amber-200'
                            : currentStatus === 'saida_antecipada'
                            ? 'bg-blue-50/50 border-blue-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {student.name}
                          </div>
                          <div className="text-[10px] text-slate-500 font-semibold">
                            Turma: {student.turma}
                          </div>
                        </div>

                        {/* Status buttons */}
                        <div className="flex flex-wrap items-center gap-1 shrink-0">
                          {[
                            {
                              id: 'presente' as AttendanceStatus,
                              label: 'Presente',
                              activeBg: 'bg-emerald-600 text-white border-emerald-600',
                              inactiveBg: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
                            },
                            {
                              id: 'falta' as AttendanceStatus,
                              label: 'Falta',
                              activeBg: 'bg-rose-600 text-white border-rose-600',
                              inactiveBg: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
                            },
                            {
                              id: 'saude' as AttendanceStatus,
                              label: 'Saúde',
                              activeBg: 'bg-purple-600 text-white border-purple-600',
                              inactiveBg: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
                            },
                            {
                              id: 'sem_equipamento' as AttendanceStatus,
                              label: 'S/ Equip',
                              activeBg: 'bg-amber-600 text-white border-amber-600',
                              inactiveBg: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
                            },
                            {
                              id: 'saida_antecipada' as AttendanceStatus,
                              label: 'Saída',
                              activeBg: 'bg-blue-600 text-white border-blue-600',
                              inactiveBg: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
                            },
                          ].map((st) => {
                            const isAct = currentStatus === st.id;
                            return (
                              <button
                                key={st.id}
                                type="button"
                                onClick={() => {
                                  onSaveRecord({
                                    studentId: student.id,
                                    activity: quickRollCallModal.activityId as ActivityType,
                                    turma: student.turma,
                                    date: selectedDate,
                                    weekNumber: currentWeek.weekNumber,
                                    year: currentWeek.year,
                                    status: st.id,
                                  });
                                }}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                                  isAct ? st.activeBg : st.inactiveBg
                                }`}
                              >
                                {st.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const act = quickRollCallModal.activityId;
                  const trm = quickRollCallModal.turma;
                  setQuickRollCallModal(null);
                  onNavigateToAttendance(act as ActivityType, trm, selectedDate);
                }}
                className="text-xs font-extrabold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer"
              >
                <span>Abrir na Ficha de Chamada Completa</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setQuickRollCallModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs transition-colors cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Monitor Notification Modal */}
      {whatsAppModalData && whatsAppModalData.isOpen && (
        <WhatsAppNotifyModal
          isOpen={whatsAppModalData.isOpen}
          onClose={() => setWhatsAppModalData(null)}
          users={users}
          currentUser={currentUser}
          turmaName={whatsAppModalData.turmaName}
          activityName={whatsAppModalData.activityName}
          startTime={whatsAppModalData.startTime}
          endTime={whatsAppModalData.endTime}
          location={whatsAppModalData.location}
          guidelines={whatsAppModalData.guidelines}
          onUpdateUserPhone={onUpdateUserPhone}
        />
      )}
    </div>
  );
};
