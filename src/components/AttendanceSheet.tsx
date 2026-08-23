import React, { useState, useMemo, useEffect } from 'react';
import { Student, AttendanceRecord, ActivityType, TurmaType, AttendanceStatus, WeekInfo, UserProfile, ActivityItem, ScheduleBlock, HolidayItem } from '../types';
import { TURMAS_LIST, ACTIVITIES_LIST } from '../data/initialData';
import { ActivityBadge } from './ActivityBadge';
import { StatusBadge } from './StatusBadge';
import { EquipmentModal } from './EquipmentModal';
import { RoutineMonitorBanner } from './RoutineMonitorBanner';
import { getWeekDays, formatDateBR, isWeekend, isHolidayOrRecess } from '../utils/dateUtils';
import { generateTurmaPDFReport } from '../utils/pdfGenerator';
import { PdfViewerModal } from './PdfViewerModal';
import { Search, Filter, CheckCircle2, XCircle, Stethoscope, Shirt, Save, Check, RotateCcw, AlertTriangle, FileText, Download, UserCheck, ShieldCheck, GraduationCap, Clock, CalendarOff, Palmtree, Coffee } from 'lucide-react';
import { getRoleBadgeStyle, canMarkAttendance } from '../utils/authUtils';
import { sortTurmasPedagogical } from '../utils/turmaUtils';

interface AttendanceSheetProps {
  students: Student[];
  records: AttendanceRecord[];
  turmas?: string[];
  activitiesList?: ActivityItem[];
  schedules?: ScheduleBlock[];
  holidays?: HolidayItem[];
  currentWeek: WeekInfo;
  selectedDate: string; // YYYY-MM-DD
  currentUser?: UserProfile | null;
  onSaveRecord: (record: Omit<AttendanceRecord, 'id' | 'createdAt'>) => void;
  onBatchMarkPresent: (studentIds: string[], activity: ActivityType | 'TODAS', date: string) => void;
  onClearRecords: (studentIds: string[], activity: ActivityType | 'TODAS', date: string) => void;
}

export const AttendanceSheet: React.FC<AttendanceSheetProps> = ({
  students,
  records,
  turmas,
  activitiesList = ACTIVITIES_LIST,
  schedules = [],
  holidays = [],
  currentWeek,
  selectedDate,
  currentUser = null,
  onSaveRecord,
  onBatchMarkPresent,
  onClearRecords,
}) => {
  const roleStyle = currentUser ? getRoleBadgeStyle(currentUser.role) : null;
  const userCanMarkAttendance = canMarkAttendance(currentUser);

  // In Attendance Sheet (Chamada de Frequência), ONLY display activities that require roll call (requiresRollCall !== false)
  const rollCallActivities = useMemo(() => {
    const active = activitiesList.length > 0 ? activitiesList : ACTIVITIES_LIST;
    return active.filter((act) => act.requiresRollCall !== false);
  }, [activitiesList]);

  const isCoordenador = currentUser?.role === 'coordenador';
  const userAssignedActivities = useMemo(() => currentUser?.assignedActivities || [], [currentUser]);
  const userAssignedTurmas = useMemo(() => currentUser?.allowedClassIds || currentUser?.assignedTurmas || [], [currentUser]);

  // For Monitor/Professor: ONLY display their assigned modalities that require roll call. For Coordenador: display all roll call activities.
  const allowedActivities = useMemo(() => {
    if (isCoordenador) return rollCallActivities;
    return rollCallActivities.filter((act) => userAssignedActivities.includes(act.id));
  }, [rollCallActivities, isCoordenador, userAssignedActivities]);

  const allowedActivityIds = useMemo(() => allowedActivities.map((a) => a.id), [allowedActivities]);

  const activityMap = useMemo(() => {
    const map = new Map<string, ActivityItem>();
    const active = activitiesList.length > 0 ? activitiesList : ACTIVITIES_LIST;
    active.forEach((item) => {
      map.set(item.id, item);
      map.set(item.name, item);
    });
    return map;
  }, [activitiesList]);

  const allowedTurmas = useMemo(() => {
    const rawList = turmas && turmas.length > 0 ? turmas : TURMAS_LIST;
    const sorted = sortTurmasPedagogical(rawList);
    if (isCoordenador || !currentUser) return sorted;
    const userTurmaSet = new Set(userAssignedTurmas);
    return sorted.filter((t) => userTurmaSet.has(t));
  }, [turmas, isCoordenador, currentUser, userAssignedTurmas]);

  const turmasList = allowedTurmas;

  const [selectedActivity, setSelectedActivity] = useState<ActivityType | 'TODAS'>('TODAS');
  const [selectedTurma, setSelectedTurma] = useState<TurmaType | 'TODAS'>('TODAS');
  const [searchTerm, setSearchTerm] = useState('');

  // Keep selectedActivity aligned with allowed activities for non-coordenador
  useEffect(() => {
    if (!isCoordenador) {
      if (allowedActivities.length === 1) {
        setSelectedActivity(allowedActivities[0].id as ActivityType);
      } else if (allowedActivities.length > 1 && selectedActivity !== 'TODAS' && !allowedActivityIds.includes(selectedActivity)) {
        setSelectedActivity(allowedActivities[0].id as ActivityType);
      } else if (allowedActivities.length === 0) {
        setSelectedActivity('TODAS');
      }
    }
  }, [isCoordenador, allowedActivities, allowedActivityIds, selectedActivity]);

  // Keep selectedTurma aligned with allowed turmas for non-coordenador
  useEffect(() => {
    if (!isCoordenador) {
      if (allowedTurmas.length === 1) {
        setSelectedTurma(allowedTurmas[0] as TurmaType);
      } else if (allowedTurmas.length > 1 && selectedTurma !== 'TODAS' && !allowedTurmas.includes(selectedTurma)) {
        setSelectedTurma(allowedTurmas[0] as TurmaType);
      } else if (allowedTurmas.length === 0) {
        setSelectedTurma('TODAS');
      }
    }
  }, [isCoordenador, allowedTurmas, selectedTurma]);

  // Equipment modal state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    studentId: string;
    studentName: string;
    activity: ActivityType;
    date: string;
    initialDetails?: string;
  }>({
    isOpen: false,
    studentId: '',
    studentName: '',
    activity: 'Natação',
    date: selectedDate,
  });

  // PDF Preview State
  const [pdfPreviewState, setPdfPreviewState] = useState<{
    isOpen: boolean;
    blobUrl: string | null;
    filename: string;
    title: string;
    onDownload?: () => void;
  }>({
    isOpen: false,
    blobUrl: null,
    filename: '',
    title: '',
  });

  // Observations edit state map (studentId_activity_date -> string)
  const [obsMap, setObsMap] = useState<Record<string, string>>({});

  // Listen for navigation filter events from other tabs (like CurrentActivities)
  useEffect(() => {
    const handleFilterEvent = (e: CustomEvent<{ activity?: ActivityType; turma?: TurmaType; date?: string }>) => {
      if (e.detail) {
        if (e.detail.activity) {
          setSelectedActivity(e.detail.activity);
        }
        if (e.detail.turma) {
          setSelectedTurma(e.detail.turma);
        }
      }
    };

    window.addEventListener('app_select_attendance_filter', handleFilterEvent as EventListener);
    return () => {
      window.removeEventListener('app_select_attendance_filter', handleFilterEvent as EventListener);
    };
  }, []);

  const weekDays = useMemo(() => getWeekDays(currentWeek.startDate), [currentWeek.startDate]);

  // Filter students who are enrolled in the allowed activities and allowed turmas
  const filteredStudents = useMemo(() => {
    return (students || [])
      .filter((student) => {
        if (!student) return false;
        // Turma permission filter for professors/monitors
        if (!isCoordenador && !allowedTurmas.includes(student.turma)) {
          return false;
        }

        const studentActs = Array.isArray(student.activities) ? student.activities : [];

        // Activity filter - MUST match allowedActivityIds
        const matchesActivity =
          selectedActivity === 'TODAS'
            ? studentActs.some((act) => allowedActivityIds.includes(act as ActivityType))
            : studentActs.includes(selectedActivity) && allowedActivityIds.includes(selectedActivity as ActivityType);

        // Turma filter
        const matchesTurma = selectedTurma === 'TODAS' || student.turma === selectedTurma;

        // Search filter
        const matchesSearch =
          searchTerm.trim() === '' ||
          (student.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (student.turma || '').toLowerCase().includes(searchTerm.toLowerCase());

        return matchesActivity && matchesTurma && matchesSearch;
      })
      .sort((a, b) => {
        const turmaCompare = (a.turma || '').localeCompare(b.turma || '', 'pt-BR', { numeric: true });
        if (turmaCompare !== 0) return turmaCompare;
        return (a.name || '').localeCompare(b.name || '', 'pt-BR');
      });
  }, [students, selectedActivity, selectedTurma, searchTerm, allowedActivityIds, allowedTurmas, isCoordenador]);

  // Create a fast map for quick record lookup: `${studentId}_${activity}_${date}`
  const recordMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    (records || []).forEach((rec) => {
      if (rec && rec.weekNumber === currentWeek.weekNumber && rec.year === currentWeek.year) {
        const key = `${rec.studentId}_${rec.activity}_${rec.date}`;
        map.set(key, rec);
      }
    });
    return map;
  }, [records, currentWeek]);

function getCurrentHHMM(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

  // Calculate status statistics for current filter and date
  const stats = useMemo(() => {
    let presente = 0;
    let saidaAntecipada = 0;
    let falta = 0;
    let saude = 0;
    let semEquipamento = 0;
    let pendente = 0;

    filteredStudents.forEach((student) => {
      const studentActs = Array.isArray(student.activities) ? student.activities : [];
      const activitiesToCount =
        selectedActivity === 'TODAS'
          ? studentActs.filter((act) => allowedActivityIds.includes(act as ActivityType))
          : [selectedActivity];

      activitiesToCount.forEach((act) => {
        const key = `${student.id}_${act}_${selectedDate}`;
        const rec = recordMap.get(key);
        if (!rec) {
          pendente++;
        } else if (rec.status === 'presente') {
          presente++;
        } else if (rec.status === 'saida_antecipada') {
          saidaAntecipada++;
        } else if (rec.status === 'falta') {
          falta++;
        } else if (rec.status === 'saude') {
          saude++;
        } else if (rec.status === 'sem_equipamento') {
          semEquipamento++;
        }
      });
    });

    const total = presente + saidaAntecipada + falta + saude + semEquipamento + pendente;
    return { presente, saidaAntecipada, falta, saude, semEquipamento, pendente, total };
  }, [filteredStudents, selectedActivity, selectedDate, recordMap, allowedActivityIds]);

  // Handlers for status click
  const handleStatusClick = (
    student: Student,
    activity: ActivityType,
    date: string,
    status: AttendanceStatus,
    equipmentDetails?: string,
    obs?: string,
    exitTimeParam?: string
  ) => {
    if (status === 'sem_equipamento' && !equipmentDetails) {
      // Open modal to specify equipment
      const key = `${student.id}_${activity}_${date}`;
      const existingRec = recordMap.get(key);
      setModalState({
        isOpen: true,
        studentId: student.id,
        studentName: student.name,
        activity,
        date,
        initialDetails: existingRec?.equipmentMissingDetails || '',
      });
      return;
    }

    const key = `${student.id}_${activity}_${date}`;
    const existingRec = recordMap.get(key);
    const currentObs = obs !== undefined ? obs : obsMap[key] || existingRec?.observation || '';

    let exitTime = exitTimeParam;
    if (status === 'saida_antecipada' && !exitTime) {
      exitTime = existingRec?.exitTime || getCurrentHHMM();
    }

    onSaveRecord({
      studentId: student.id,
      activity,
      turma: student.turma,
      date,
      weekNumber: currentWeek.weekNumber,
      year: currentWeek.year,
      status,
      exitTime: status === 'saida_antecipada' ? exitTime : undefined,
      equipmentMissingDetails: equipmentDetails,
      observation: currentObs || undefined,
    });
  };

  const handleEquipmentModalSave = (details: string) => {
    const student = students.find((s) => s.id === modalState.studentId);
    if (student) {
      handleStatusClick(
        student,
        modalState.activity,
        modalState.date,
        'sem_equipamento',
        details
      );
    }
    setModalState((prev) => ({ ...prev, isOpen: false }));
  };

  const areAllMarkedPresent = useMemo(() => {
    if (filteredStudents.length === 0) return false;
    return filteredStudents.every((student) => {
      const studentActs = Array.isArray(student.activities) ? student.activities : [];
      const activitiesToCheck =
        selectedActivity === 'TODAS'
          ? studentActs.filter((act) => allowedActivityIds.includes(act as ActivityType))
          : [selectedActivity];
      if (activitiesToCheck.length === 0) return false;
      return activitiesToCheck.every((act) => {
        const key = `${student.id}_${act}_${selectedDate}`;
        const rec = recordMap.get(key);
        return rec?.status === 'presente';
      });
    });
  }, [filteredStudents, selectedActivity, selectedDate, recordMap, allowedActivityIds]);

  const handleBatchMarkAllPresent = () => {
    const studentIds = filteredStudents.map((s) => s.id);
    if (studentIds.length === 0) return;

    if (areAllMarkedPresent) {
      if (selectedActivity === 'TODAS') {
        allowedActivityIds.forEach((act) => {
          onClearRecords(studentIds, act, selectedDate);
        });
      } else {
        onClearRecords(studentIds, selectedActivity, selectedDate);
      }
      setObsMap((prev) => {
        const next = { ...prev };
        filteredStudents.forEach((student) => {
          const studentActs = Array.isArray(student.activities) ? student.activities : [];
          const acts =
            selectedActivity === 'TODAS'
              ? studentActs.filter((act) => allowedActivityIds.includes(act as ActivityType))
              : [selectedActivity];
          acts.forEach((act) => {
            delete next[`${student.id}_${act}_${selectedDate}`];
          });
        });
        return next;
      });
    } else {
      if (selectedActivity === 'TODAS') {
        allowedActivityIds.forEach((act) => {
          onBatchMarkPresent(studentIds, act, selectedDate);
        });
      } else {
        onBatchMarkPresent(studentIds, selectedActivity, selectedDate);
      }
    }
  };

  const handleClearSelected = () => {
    const studentIds = filteredStudents.map((s) => s.id);
    if (studentIds.length === 0) return;
    const actLabel = selectedActivity === 'TODAS' ? 'suas modalidades liberadas' : `a atividade "${selectedActivity}"`;
    if (window.confirm(`Tem certeza que deseja limpar as marcações de ${actLabel} no dia selecionado?`)) {
      if (selectedActivity === 'TODAS') {
        allowedActivityIds.forEach((act) => {
          onClearRecords(studentIds, act, selectedDate);
        });
      } else {
        onClearRecords(studentIds, selectedActivity, selectedDate);
      }

      // Clear local observation state for cleared records
      setObsMap((prev) => {
        const next = { ...prev };
        filteredStudents.forEach((student) => {
          const studentActs = Array.isArray(student.activities) ? student.activities : [];
          const acts =
            selectedActivity === 'TODAS'
              ? studentActs.filter((act) => allowedActivityIds.includes(act as ActivityType))
              : [selectedActivity];
          acts.forEach((act) => {
            delete next[`${student.id}_${act}_${selectedDate}`];
          });
        });
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      {!userCanMarkAttendance && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-amber-900 text-xs font-bold flex items-center space-x-2.5 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <span>Seu usuário está configurado no modo <strong>Somente Leitura</strong>. O lançamento de presença e marcação de ocorrências está desabilitado pela coordenação.</span>
        </div>
      )}

      {/* Routine & Monitor Guidance Banner (Atividade do Momento, Atalho de Chamada, Orientações e Cronograma) */}
      <RoutineMonitorBanner
        schedules={schedules}
        activitiesList={activitiesList}
        selectedTurma={selectedTurma}
        selectedDate={selectedDate}
        turmasList={turmasList}
        holidays={holidays}
        onSelectActivityAndTurma={(act, turma) => {
          if (act) setSelectedActivity(act);
          if (turma) setSelectedTurma(turma);
        }}
      />

      {/* Equipment Modal */}
      <EquipmentModal
        isOpen={modalState.isOpen}
        studentName={modalState.studentName}
        activity={modalState.activity}
        initialDetails={modalState.initialDetails}
        onSave={handleEquipmentModalSave}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Control Panel / Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        {/* Activity Chips Selector */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
              1. Selecione a Atividade Extracurricular:
            </label>
            {!isCoordenador && (
              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full flex items-center space-x-1">
                <span>Atividades Liberadas para Você: {allowedActivities.length}</span>
              </span>
            )}
          </div>

          {allowedActivities.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Nenhuma modalidade atribuída ao seu usuário.
                Solicite à Coordenação a liberação das suas modalidades no painel de <strong>Gerenciamento de Usuários</strong>.
              </span>
            </div>
          ) : !isCoordenador && allowedTurmas.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Nenhuma turma atribuída ao seu usuário.
                Solicite à Coordenação a liberação das suas turmas no painel de <strong>Gerenciamento de Usuários</strong>.
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(isCoordenador || allowedActivities.length > 1) && (
                <button
                  onClick={() => setSelectedActivity('TODAS')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    selectedActivity === 'TODAS'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {isCoordenador ? 'Todas Atividades' : 'Todas Minhas Modalidades'}
                </button>
              )}

              {allowedActivities.map((act) => {
                return (
                  <button
                    key={act.id}
                    onClick={() => setSelectedActivity(act.id)}
                    className={`transition-all cursor-pointer relative ${
                      selectedActivity === act.id
                        ? 'scale-105 shadow-sm ring-2 ring-indigo-500 ring-offset-1'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                  >
                    <ActivityBadge activity={act.id} size="md" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Filters Grid (Turma, Day of week, Search) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
          {/* Turma Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Turma / Ano Escolar:
            </label>
            <select
              value={selectedTurma}
              onChange={(e) => setSelectedTurma(e.target.value as TurmaType | 'TODAS')}
              className="w-full px-3 py-2 text-xs md:text-sm border border-slate-300 rounded-xl bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500"
            >
              {(isCoordenador || turmasList.length > 1) && (
                <option value="TODAS">
                  {isCoordenador ? `Todas as Turmas (${turmasList.length})` : `Todas Minhas Turmas (${turmasList.length})`}
                </option>
              )}
              {turmasList.map((turma) => (
                <option key={turma} value={turma}>
                  {turma}
                </option>
              ))}
            </select>
          </div>

          {/* Day of Week Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Dia da Chamada na Semana:
            </label>
            <div className="grid grid-cols-5 gap-1">
              {weekDays.map((day) => {
                const isSelected = selectedDate === day.dateStr;
                const dayHoliday = isHolidayOrRecess(day.dateStr, holidays);
                const isRecess = dayHoliday?.type === 'recesso';
                const isFeriado = dayHoliday?.type === 'feriado';

                return (
                  <button
                    key={day.dateStr}
                    type="button"
                    title={dayHoliday ? `${dayHoliday.name} (${isRecess ? 'Recesso Escolar' : 'Feriado Oficial'})` : undefined}
                    onClick={() => {
                      // Call parent update
                      const event = new CustomEvent('app_select_date', { detail: day.dateStr });
                      window.dispatchEvent(event);
                    }}
                    className={`px-1.5 py-1.5 text-center rounded-lg text-xs font-semibold transition-all cursor-pointer border relative ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                        : isRecess
                        ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-200'
                        : isFeriado
                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-center space-x-0.5">
                      <span>{day.dayShort.split(' ')[0]}</span>
                      {isRecess && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 inline-block" />}
                      {isFeriado && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 inline-block" />}
                    </div>
                    <div className="text-[10px] opacity-80">{day.dateStr.split('-')[2]}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Buscar por Nome do Aluno:
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Digite o nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs md:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Selected Date Holiday / Recess Notice Banner */}
        {(() => {
          const selectedDayHoliday = isHolidayOrRecess(selectedDate, holidays);
          if (!selectedDayHoliday) return null;

          if (selectedDayHoliday.type === 'recesso') {
            return (
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-indigo-950">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Coffee className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-black text-indigo-950 block">
                      Recesso Escolar: {selectedDayHoliday.name}
                    </span>
                    <span className="text-indigo-700 text-[11px]">
                      Atividades pedagógicas e chamadas do Programa Integral suspensas durante este período.
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-indigo-100 text-indigo-900 rounded-lg font-mono font-bold text-[11px] shrink-0 border border-indigo-200">
                  {formatDateBR(selectedDate)}
                </span>
              </div>
            );
          }

          return (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-rose-950">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <CalendarOff className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-black text-rose-900 block">
                    Feriado Oficial: {selectedDayHoliday.name}
                  </span>
                  <span className="text-rose-700 text-[11px]">
                    Não há registro de frequência obrigatório para esta data.
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-rose-200/80 text-rose-900 rounded-lg font-mono font-bold text-[11px] shrink-0 border border-rose-300">
                {formatDateBR(selectedDate)}
              </span>
            </div>
          );
        })()}

        {/* Batch Actions and Counters Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 bg-slate-50/70 p-3 rounded-xl">
          {/* Status summary pills */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <span className="text-slate-500 font-semibold">Resumo do Dia:</span>
            <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{stats.presente} Presentes</span>
            </span>
            <span className="px-2 py-1 rounded-md bg-orange-100 text-orange-900 border border-orange-200 flex items-center space-x-1">
              <Shirt className="w-3.5 h-3.5 text-orange-600" />
              <span>{stats.semEquipamento} Sem Equip.</span>
            </span>
            <span className="px-2 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-200 flex items-center space-x-1">
              <Stethoscope className="w-3.5 h-3.5 text-amber-600" />
              <span>{stats.saude} Saúde</span>
            </span>
            <span className="px-2 py-1 rounded-md bg-rose-100 text-rose-800 border border-rose-200 flex items-center space-x-1">
              <XCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>{stats.falta} Faltas</span>
            </span>
            {stats.pendente > 0 && (
              <span className="px-2 py-1 rounded-md bg-slate-200 text-slate-700 border border-slate-300">
                {stats.pendente} Não Registrados
              </span>
            )}
          </div>

          {/* Quick Buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {selectedTurma !== 'TODAS' && (
              <button
                onClick={() => {
                  const result = generateTurmaPDFReport(selectedTurma, currentWeek, students, records);
                  setPdfPreviewState({
                    isOpen: true,
                    blobUrl: result.blobUrl,
                    filename: result.filename,
                    title: `Relatório da Turma - ${selectedTurma}`,
                    onDownload: result.download,
                  });
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs"
                title="Visualizar e baixar relatório em PDF formatado desta turma"
              >
                <Download className="w-4 h-4 text-indigo-600" />
                <span>PDF da Turma</span>
              </button>
            )}

            <button
              onClick={handleBatchMarkAllPresent}
              disabled={filteredStudents.length === 0}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs ${
                areAllMarkedPresent
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={
                areAllMarkedPresent
                  ? 'Todos estão marcados como presentes. Clique para desmarcar todos.'
                  : 'Marcar todos os alunos visíveis como presentes'
              }
            >
              {areAllMarkedPresent ? (
                <>
                  <XCircle className="w-4 h-4" />
                  <span>Desmarcar Todos</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Marcar Todos Presentes</span>
                </>
              )}
            </button>

            <button
              onClick={handleClearSelected}
              disabled={filteredStudents.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center space-x-1"
              title="Limpar marcações deste dia"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Attendance Calling Roster Grid / Table */}
      {filteredStudents.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 space-y-3">
          <Filter className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-700">Nenhum aluno encontrado</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Nenhum aluno está cadastrado na atividade "{selectedActivity}" para a turma "{selectedTurma}" com o termo digitado.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold flex items-center space-x-2">
                <span>Lista de Chamada de Frequência</span>
                {selectedActivity !== 'TODAS' && <ActivityBadge activity={selectedActivity} size="sm" />}
              </h2>
              <p className="text-xs text-slate-400">
                {filteredStudents.length} aluno(s) listado(s) • Clique nos botões para registrar a presença ou justificativa de ausência.
              </p>
            </div>
            <div className="text-xs font-semibold bg-slate-800 text-indigo-300 px-3 py-1 rounded-lg border border-slate-700">
              Data: {selectedDate.split('-').reverse().join('/')}
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredStudents.map((student) => {
              // Determine activities to display for this student (ONLY allowed activities for Monitor/Professor)
              const activitiesToDisplay = student.activities.filter(
                (a) =>
                  allowedActivityIds.includes(a as ActivityType) &&
                  (selectedActivity === 'TODAS' || a === selectedActivity)
              );

              return (
                <div key={student.id} className="p-4 hover:bg-slate-50/80 transition-colors space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {/* Student Info */}
                    <div className="flex items-start space-x-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center shrink-0 border border-indigo-200">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-bold text-slate-900 text-sm md:text-base">
                            {student.name}
                          </h3>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-slate-500 mt-0.5">
                          <span className="font-medium px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700">
                            {student.turma}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Extracurricular Activities badges for this student */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {student.activities.map((act) => {
                        const isAllowed = allowedActivityIds.includes(act as ActivityType);
                        if (!isCoordenador && !isAllowed) return null; // Hide non-assigned activities for Monitor/Professor
                        const actMeta = activityMap.get(act);
                        return (
                          <span key={act} className="opacity-90">
                            <ActivityBadge
                              activity={act}
                              iconName={actMeta?.icon}
                              customIconUrl={actMeta?.customIconUrl}
                              customEquipment={actMeta?.defaultEquipment}
                              size="sm"
                            />
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Attendance Controls per Activity */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    {activitiesToDisplay.map((act) => {
                      const recKey = `${student.id}_${act}_${selectedDate}`;
                      const rec = recordMap.get(recKey);
                      const currentStatus = rec?.status;
                      const actMeta = activityMap.get(act);

                      return (
                        <div
                          key={act}
                          className={`p-3 rounded-xl border transition-all ${
                            currentStatus === 'presente'
                              ? 'bg-emerald-50/60 border-emerald-200'
                              : currentStatus === 'saida_antecipada'
                              ? 'bg-amber-50/90 border-amber-200'
                              : currentStatus === 'sem_equipamento'
                              ? 'bg-orange-50/80 border-orange-200'
                              : currentStatus === 'saude'
                              ? 'bg-amber-50/80 border-amber-200'
                              : currentStatus === 'falta'
                              ? 'bg-rose-50/80 border-rose-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                            <div className="flex items-center space-x-2">
                              <ActivityBadge
                                activity={act}
                                iconName={actMeta?.icon}
                                customIconUrl={actMeta?.customIconUrl}
                                customEquipment={actMeta?.defaultEquipment}
                                size="sm"
                              />
                              {rec && (
                                <StatusBadge
                                  status={rec.status}
                                  equipmentDetails={rec.equipmentMissingDetails}
                                  exitTime={rec.exitTime}
                                  size="sm"
                                />
                              )}
                            </div>

                            {/* Attendance Status Action Buttons */}
                            <div className="flex flex-wrap sm:flex-nowrap gap-1.5 w-full lg:w-auto">
                              {/* 1. PRESENTE */}
                              <button
                                type="button"
                                onClick={() => handleStatusClick(student, act, selectedDate, 'presente')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 border flex-1 sm:flex-none ${
                                  currentStatus === 'presente'
                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                    : 'bg-white hover:bg-emerald-50 text-emerald-800 border-slate-200 hover:border-emerald-300'
                                }`}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Presente</span>
                              </button>

                              {/* 2. SAÍDA ANTECIPADA */}
                              <button
                                type="button"
                                onClick={() => handleStatusClick(student, act, selectedDate, 'saida_antecipada')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 border flex-1 sm:flex-none ${
                                  currentStatus === 'saida_antecipada'
                                    ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                                    : 'bg-white hover:bg-amber-50 text-amber-900 border-slate-200 hover:border-amber-300'
                                }`}
                                title="Registrar saída antecipada com horário de saída"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>Saída Ant.</span>
                              </button>

                              {/* 3. SEM EQUIPAMENTO (Uniforme / Flauta) */}
                              <button
                                type="button"
                                onClick={() => handleStatusClick(student, act, selectedDate, 'sem_equipamento')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 border flex-1 sm:flex-none ${
                                  currentStatus === 'sem_equipamento'
                                    ? 'bg-orange-600 text-white border-orange-700 shadow-xs'
                                    : 'bg-white hover:bg-orange-50 text-orange-900 border-slate-200 hover:border-orange-300'
                                }`}
                                title="Ausência por falta de uniforme, flauta ou material"
                              >
                                <Shirt className="w-3.5 h-3.5" />
                                <span>Sem Equip.</span>
                              </button>

                              {/* 4. SAÚDE */}
                              <button
                                type="button"
                                onClick={() => handleStatusClick(student, act, selectedDate, 'saude')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 border flex-1 sm:flex-none ${
                                  currentStatus === 'saude'
                                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                                    : 'bg-white hover:bg-amber-50 text-amber-900 border-slate-200 hover:border-amber-300'
                                }`}
                                title="Ausência por motivo de saúde ou atestado médico"
                              >
                                <Stethoscope className="w-3.5 h-3.5" />
                                <span>Saúde</span>
                              </button>

                              {/* 5. FALTA */}
                              <button
                                type="button"
                                onClick={() => handleStatusClick(student, act, selectedDate, 'falta')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 border flex-1 sm:flex-none ${
                                  currentStatus === 'falta'
                                    ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                                    : 'bg-white hover:bg-rose-50 text-rose-800 border-slate-200 hover:border-rose-300'
                                }`}
                                title="Ausência por falta geral não justificada"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Falta</span>
                              </button>
                            </div>
                          </div>

                          {/* Inline Time Picker for Saída Antecipada */}
                          {currentStatus === 'saida_antecipada' && (
                            <div className="mt-2.5 pt-2 border-t border-amber-200 flex items-center space-x-2 bg-amber-50/90 px-3 py-1.5 rounded-lg border border-amber-200">
                              <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                              <span className="text-xs font-bold text-amber-900">Horário da Saída:</span>
                              <input
                                type="time"
                                value={rec?.exitTime || getCurrentHHMM()}
                                onChange={(e) => {
                                  handleStatusClick(
                                    student,
                                    act,
                                    selectedDate,
                                    'saida_antecipada',
                                    rec?.equipmentMissingDetails,
                                    rec?.observation,
                                    e.target.value
                                  );
                                }}
                                className="text-xs font-bold px-2 py-0.5 border border-amber-300 rounded bg-white text-amber-950 focus:ring-2 focus:ring-amber-500 outline-none"
                              />
                              <span className="text-[11px] text-amber-800 font-medium hidden sm:inline">
                                (Alteração de horário em tempo real)
                              </span>
                            </div>
                          )}

                          {/* Optional Observation input */}
                          <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center space-x-2">
                            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <input
                              type="text"
                              placeholder="Observação opcional (ex: Atestado médico entregue, aviso dos pais)..."
                              value={obsMap[recKey] !== undefined ? obsMap[recKey] : rec?.observation || ''}
                              onChange={(e) => {
                                setObsMap((prev) => ({ ...prev, [recKey]: e.target.value }));
                              }}
                              onBlur={(e) => {
                                if (currentStatus) {
                                  handleStatusClick(student, act, selectedDate, currentStatus, rec?.equipmentMissingDetails, e.target.value);
                                }
                              }}
                              className="w-full text-xs px-2.5 py-1 border border-slate-200 rounded-md bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* On-screen PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={pdfPreviewState.isOpen}
        onClose={() => setPdfPreviewState((prev) => ({ ...prev, isOpen: false }))}
        blobUrl={pdfPreviewState.blobUrl}
        filename={pdfPreviewState.filename}
        title={pdfPreviewState.title}
        onDownload={pdfPreviewState.onDownload}
      />
    </div>
  );
};
