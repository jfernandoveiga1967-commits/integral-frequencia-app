import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Student, AttendanceRecord, ActivityType, TurmaType, AttendanceStatus, AttendanceFilterStatus, WeekInfo, UserProfile, ActivityItem, ScheduleBlock, HolidayItem } from '../types';
import { TURMAS_LIST, ACTIVITIES_LIST, OFFICIAL_ROLL_CALL_MODALITIES } from '../data/initialData';
import { ActivityBadge } from './ActivityBadge';
import { StatusBadge } from './StatusBadge';
import { EquipmentModal } from './EquipmentModal';
import { RoutineMonitorBanner } from './RoutineMonitorBanner';
import { getWeekDays, formatDateBR, isWeekend, isHolidayOrRecess, isStudentScheduledForDate, isStudentActiveOnDate, formatDiasFrequencia, getStudentDepartureTimeForDate, formatHorarioSaida, toISODateString } from '../utils/dateUtils';
import { isStudentInReforcoVigency } from '../utils/semanarioUtils';
import { generateTurmaPDFReport, generateAttendanceDailyPDFReport } from '../utils/pdfGenerator';
import { PdfViewerModal } from './PdfViewerModal';
import { safeWindowPrint, triggerPrint, directPrint } from '../utils/printUtils';
import { Search, Filter, CheckCircle2, XCircle, Shirt, Save, Check, RotateCcw, AlertTriangle, FileText, Download, UserCheck, ShieldCheck, GraduationCap, Clock, Calendar, CalendarOff, Palmtree, Coffee, Printer, Loader2, Users, BookMarked } from 'lucide-react';
import { getRoleBadgeStyle, canMarkAttendance } from '../utils/authUtils';
import { sortTurmasPedagogical } from '../utils/turmaUtils';
import { useConfirmedAction } from '../hooks/useConfirmedAction';
import { SaveStatusBanner } from './SaveStatusBanner';
import { playDepartureAlertSound } from '../utils/notificationUtils';
import { StudentAttendanceItem } from './StudentAttendanceItem';
import { subscribeAttendanceByDate, getCurrentHHMM } from '../services/attendanceService';

export type { AttendanceFilterStatus };

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
  isLoadingStudents?: boolean;
  selectedTurma?: string;
  onSelectTurma?: (turma: TurmaType | 'TODAS') => void;
  onSelectDate?: (date: string) => void;
  onSaveRecord: (record: Omit<AttendanceRecord, 'id' | 'createdAt'>) => Promise<void> | void;
  onBatchMarkPresent: (studentIds: string[], activity: ActivityType | 'TODAS', date: string) => Promise<void> | void;
  onClearRecords: (studentIds: string[], activity: ActivityType | 'TODAS', date: string) => Promise<void> | void;
  onFinalizeCall?: (date: string) => Promise<void> | void;
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
  isLoadingStudents = false,
  selectedTurma: externalSelectedTurma,
  onSelectTurma,
  onSelectDate,
  onSaveRecord,
  onBatchMarkPresent,
  onClearRecords,
  onFinalizeCall,
}) => {
  const roleStyle = currentUser ? getRoleBadgeStyle(currentUser.role) : null;
  const userCanMarkAttendance = canMarkAttendance(currentUser);

  // Na Chamada de Frequência, exibir EXCLUSIVAMENTE as 8 modalidades oficiais especialistas de chamada: Rotina, Balé, Dança, Flauta, Futebol, Ginástica, Judô e Natação
  const rollCallActivities = useMemo<ActivityItem[]>(() => {
    const active = activitiesList.length > 0 ? activitiesList : ACTIVITIES_LIST;
    return OFFICIAL_ROLL_CALL_MODALITIES.map((name) => {
      const existing = active.find((a) => a.id === name || a.name === name);
      if (existing) return existing;
      return {
        id: name,
        name: name,
        icon:
          name === 'Rotina'
            ? 'Clock'
            : name === 'Reforço'
            ? 'BookMarked'
            : name === 'Natação'
            ? 'Waves'
            : name === 'Futebol'
            ? 'Trophy'
            : name === 'Judô'
            ? 'Award'
            : name === 'Balé'
            ? 'Sparkles'
            : name === 'Dança'
            ? 'Music'
            : name === 'Flauta'
            ? 'Music2'
            : 'Activity',
        description: name === 'Rotina' ? 'Rotina diária e chamada geral da turma' : `Modalidade especialista de ${name}`,
        defaultEquipment: '',
        requiresRollCall: true,
      };
    });
  }, [activitiesList]);

  const isCoordenador = currentUser?.role === 'coordenador';
  const userAssignedActivities = useMemo(() => {
    if (!currentUser) return [];
    let list: string[] = [];
    if (Array.isArray(currentUser.assignedActivities)) {
      list = currentUser.assignedActivities.filter((a) => typeof a === 'string' && a.trim().length > 0);
    }
    if (list.length === 0 && currentUser.specialtyActivity) {
      if (Array.isArray(currentUser.specialtyActivity)) {
        list = (currentUser.specialtyActivity as any[]).filter((a) => typeof a === 'string' && a.trim().length > 0);
      } else if (typeof currentUser.specialtyActivity === 'string' && currentUser.specialtyActivity.trim()) {
        list = [currentUser.specialtyActivity.trim()];
      }
    }
    return list;
  }, [currentUser]);

  const userAssignedTurmas = useMemo(() => {
    if (!currentUser) return [];
    if (Array.isArray(currentUser.allowedClassIds) && currentUser.allowedClassIds.length > 0) {
      return currentUser.allowedClassIds.filter((t) => typeof t === 'string' && t.trim().length > 0);
    }
    if (Array.isArray(currentUser.assignedTurmas) && currentUser.assignedTurmas.length > 0) {
      return currentUser.assignedTurmas.filter((t) => typeof t === 'string' && t.trim().length > 0);
    }
    return [];
  }, [currentUser]);

  const normalizeStr = (s?: string) =>
    (s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  // Para Monitor/Professor: rigorosamente as modalidades atribuídas ao perfil do usuário no Gerenciamento de Usuários (Judô, Balé, Futebol, Culinária, Natação, etc.).
  // Para Coordenador: todas as modalidades oficiais especialistas de chamada.
  const allowedActivities = useMemo(() => {
    if (isCoordenador) return rollCallActivities;
    if (userAssignedActivities.length === 0) return [];

    const active = activitiesList.length > 0 ? activitiesList : ACTIVITIES_LIST;
    const result: ActivityItem[] = [];

    userAssignedActivities.forEach((actName) => {
      const normTarget = normalizeStr(actName);
      const found =
        rollCallActivities.find((a) => normalizeStr(a.id) === normTarget || normalizeStr(a.name) === normTarget) ||
        active.find((a) => normalizeStr(a.id) === normTarget || normalizeStr(a.name) === normTarget);

      if (found) {
        if (!result.some((r) => normalizeStr(r.id) === normalizeStr(found.id))) {
          result.push(found);
        }
      } else {
        result.push({
          id: actName as ActivityType,
          name: actName,
          icon:
            normTarget.includes('culinaria')
              ? 'Utensils'
              : normTarget.includes('judo')
              ? 'Award'
              : normTarget.includes('bale')
              ? 'Sparkles'
              : normTarget.includes('futebol')
              ? 'Trophy'
              : normTarget.includes('natacao')
              ? 'Waves'
              : 'Activity',
          description: `Modalidade de ${actName}`,
          defaultEquipment: '',
          requiresRollCall: true,
        });
      }
    });

    return result;
  }, [rollCallActivities, activitiesList, isCoordenador, userAssignedActivities]);

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
    const userTurmaSet = new Set(userAssignedTurmas.map((t) => normalizeStr(t)));
    return sorted.filter((t) => userTurmaSet.has(normalizeStr(t)));
  }, [turmas, isCoordenador, currentUser, userAssignedTurmas]);

  const turmasList = allowedTurmas;

  // Contagem auxiliar de alunos ativos matriculados em uma modalidade para a turma selecionada
  const countStudentsForActivityInTurma = useCallback(
    (actId: string, turmaName: string) => {
      if (!students || students.length === 0) return 0;
      const turmaList = turmaName === 'TODAS'
        ? students
        : students.filter((s) => s.turma === turmaName);
      
      const activeList = turmaList.filter(
        (s) => s.status !== 'inativo' && s.status !== 'cancelado'
      );

      if (actId === 'Rotina') {
        return activeList.length;
      }
      if (normalizeStr(actId) === normalizeStr('Reforço')) {
        return activeList.filter(
          (s) =>
            s.modalidadesEspeciais?.some((m) => normalizeStr(m) === normalizeStr('Reforço')) ||
            (Array.isArray(s.activities) && s.activities.some((act) => normalizeStr(act) === normalizeStr('Reforço')))
        ).length;
      }
      return activeList.filter(
        (s) => Array.isArray(s.activities) && s.activities.includes(actId)
      ).length;
    },
    [students]
  );

  const [selectedActivity, setSelectedActivity] = useState<ActivityType>(() => {
    if (!isCoordenador && userAssignedActivities.length > 0) {
      return userAssignedActivities[0] as ActivityType;
    }
    return 'Rotina';
  });
  const [selectedTurma, setSelectedTurma] = useState<TurmaType | 'TODAS'>(() => {
    if (externalSelectedTurma) {
      return externalSelectedTurma as TurmaType | 'TODAS';
    }
    return 'TODAS';
  });
  const [searchTerm, setSearchTerm] = useState('');

  // Estado de filtro de status interativo acionado pelos cards do Resumo do Dia
  const [filterStatus, setFilterStatus] = useState<AttendanceFilterStatus>('TODOS');
  const rosterListRef = React.useRef<HTMLDivElement>(null);

  // Registros recuperados do Firestore específicos para selectedDate (inclusive retroativos)
  const [dateFirestoreRecords, setDateFirestoreRecords] = useState<AttendanceRecord[]>([]);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isLoadingDateRecords, setIsLoadingDateRecords] = useState<boolean>(false);

  // Snapshot em tempo real para a data selecionada: recupera e recalcula chamadas retroativas
  useEffect(() => {
    let isSubscribed = true;
    setIsLoadingDateRecords(true);

    const unsub = subscribeAttendanceByDate(
      selectedDate,
      (recordsFromFirestore) => {
        if (!isSubscribed) return;
        setDateFirestoreRecords(recordsFromFirestore);
        setIsLoadingDateRecords(false);
      },
      (err) => {
        console.warn('Erro ao carregar registros do Firestore para a data selecionada:', selectedDate, err);
        if (isSubscribed) setIsLoadingDateRecords(false);
      }
    );

    return () => {
      isSubscribed = false;
      unsub();
    };
  }, [selectedDate]);

  // Reseta o filtro de status caso o usuário alterne de turma, modalidade ou data
  useEffect(() => {
    setFilterStatus('TODOS');
  }, [selectedTurma, selectedActivity, selectedDate]);

  // Mantém sincronizado caso o valor externo mude
  useEffect(() => {
    if (externalSelectedTurma && externalSelectedTurma !== selectedTurma) {
      setSelectedTurma(externalSelectedTurma as TurmaType | 'TODAS');
    }
  }, [externalSelectedTurma]);

  const handleTurmaChange = (newTurma: TurmaType | 'TODAS') => {
    setSelectedTurma(newTurma);
    onSelectTurma?.(newTurma);
    window.dispatchEvent(new CustomEvent('app_turma_filter_change', { detail: { turma: newTurma } }));
  };

  const todayStr = useMemo(() => toISODateString(new Date()), []);

  const handleDateChange = useCallback(
    (newDate: string) => {
      if (!newDate) return;
      onSelectDate?.(newDate);
      window.dispatchEvent(new CustomEvent('app_select_date', { detail: newDate }));
    },
    [onSelectDate]
  );

  // Sincroniza a modalidade selecionada conforme permissões do usuário
  useEffect(() => {
    if (!isCoordenador) {
      if (allowedActivities.length > 0) {
        const isCurrentAllowed = allowedActivities.some(
          (a) =>
            normalizeStr(a.id) === normalizeStr(selectedActivity) ||
            normalizeStr(a.name) === normalizeStr(selectedActivity)
        );
        if (!isCurrentAllowed) {
          setSelectedActivity(allowedActivities[0].id as ActivityType);
        }
      }
    } else {
      if (!OFFICIAL_ROLL_CALL_MODALITIES.includes(selectedActivity)) {
        setSelectedActivity('Rotina');
      }
    }
  }, [isCoordenador, allowedActivities.length, allowedActivityIds.join(','), selectedActivity]);

  // Ajuste inteligente e automático da modalidade inicial ao abrir ou trocar de turma:
  // Se a modalidade selecionada atualmente não possuir alunos matriculados nesta turma específica,
  // seleciona automaticamente a primeira modalidade dentre as permitidas que REALMENTE tenha alunos.
  useEffect(() => {
    if (isCoordenador || selectedTurma === 'TODAS' || students.length === 0) {
      return;
    }

    const currentCount = countStudentsForActivityInTurma(selectedActivity, selectedTurma);
    if (currentCount > 0) {
      return;
    }

    const firstWithStudents = allowedActivities.find(
      (act) => countStudentsForActivityInTurma(act.id, selectedTurma) > 0
    );

    if (firstWithStudents && firstWithStudents.id !== selectedActivity) {
      setSelectedActivity(firstWithStudents.id as ActivityType);
    }
  }, [
    selectedTurma,
    students,
    allowedActivities,
    selectedActivity,
    isCoordenador,
    countStudentsForActivityInTurma,
  ]);

  // Verifica se a turma selecionada possui ao menos um aluno matriculado em qualquer modalidade da professora
  const hasAnyModalityStudentsInTurma = useMemo(() => {
    if (selectedTurma === 'TODAS' || isCoordenador || students.length === 0) {
      return true;
    }
    return allowedActivities.some(
      (act) => countStudentsForActivityInTurma(act.id, selectedTurma) > 0
    );
  }, [selectedTurma, isCoordenador, students.length, allowedActivities, countStudentsForActivityInTurma]);

  // Keep selectedTurma aligned with allowed turmas for non-coordenador
  useEffect(() => {
    if (!isCoordenador) {
      if (allowedTurmas.length === 1) {
        if (selectedTurma !== allowedTurmas[0]) {
          setSelectedTurma(allowedTurmas[0] as TurmaType);
        }
      } else if (allowedTurmas.length > 1 && selectedTurma !== 'TODAS' && !allowedTurmas.includes(selectedTurma)) {
        setSelectedTurma(allowedTurmas[0] as TurmaType);
      } else if (allowedTurmas.length === 0 && selectedTurma !== 'TODAS') {
        setSelectedTurma('TODAS');
      }
    }
  }, [isCoordenador, allowedTurmas.length, allowedTurmas.join(','), selectedTurma]);

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

  // Prevent background scroll when modal or preview is active
  useEffect(() => {
    if (modalState.isOpen || pdfPreviewState.isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [modalState.isOpen, pdfPreviewState.isOpen]);

  // Confirmed action for batch operations (Marcar Todos Presentes / Limpar Marcações)
  const batchAction = useConfirmedAction();

  // Non-blocking batch sync tracker for individual rapid clicks
  const [individualSyncState, setIndividualSyncState] = useState<{
    pendingCount: number;
    totalInBatch: number;
    syncedCount: number;
    isComplete: boolean;
    error: { message: string; retry?: () => Promise<any> | void } | null;
  }>({
    pendingCount: 0,
    totalInBatch: 0,
    syncedCount: 0,
    isComplete: false,
    error: null,
  });

  const autoClearSyncTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (autoClearSyncTimerRef.current) {
        clearTimeout(autoClearSyncTimerRef.current);
      }
    };
  }, []);

  // Listen for navigation filter events from other tabs (like CurrentActivities)
  useEffect(() => {
    const handleFilterEvent = (e: CustomEvent<{ activity?: ActivityType; turma?: TurmaType; date?: string }>) => {
      if (e.detail) {
        if (e.detail.activity) {
          setSelectedActivity(e.detail.activity);
        }
        if (e.detail.turma) {
          handleTurmaChange(e.detail.turma);
        }
      }
    };

    window.addEventListener('app_select_attendance_filter', handleFilterEvent as EventListener);
    return () => {
      window.removeEventListener('app_select_attendance_filter', handleFilterEvent as EventListener);
    };
  }, []);

  const weekDays = useMemo(() => getWeekDays(currentWeek.startDate), [currentWeek.startDate]);

  // Filter students who are enrolled in the allowed activities, allowed turmas, and scheduled for the current selectedDate
  const filteredStudents = useMemo(() => {
    return (students || [])
      .filter((student) => {
        if (!student) return false;
        // Turma permission filter for professors/monitors
        if (!isCoordenador && !allowedTurmas.includes(student.turma)) {
          return false;
        }

        // Active student check on the selected date (hides inactive/cancelled students from daily roll call)
        if (!isStudentActiveOnDate(student, selectedDate)) {
          return false;
        }

        // Partial / Flexible attendance schedule filter:
        // Only include students who are scheduled to attend on the selectedDate!
        if (!isStudentScheduledForDate(student, selectedDate)) {
          return false;
        }

        const studentActs = Array.isArray(student.activities) ? student.activities : [];

        // Activity filter - MUST match allowedActivityIds
        if (!isCoordenador) {
          const isActAllowed = allowedActivities.some(
            (a) =>
              normalizeStr(a.id) === normalizeStr(selectedActivity) ||
              normalizeStr(a.name) === normalizeStr(selectedActivity)
          );
          if (!isActAllowed) {
            return false;
          }
        } else if (!allowedActivityIds.includes(selectedActivity)) {
          return false;
        }

        const isReforco = normalizeStr(selectedActivity) === normalizeStr('Reforço');
        const matchesActivity =
          selectedActivity === 'Rotina'
            ? true
            : isReforco
            ? isStudentInReforcoVigency(student, selectedDate)
            : studentActs.some(
                (act) => normalizeStr(act) === normalizeStr(selectedActivity)
              );

        // Turma filter (quando 'Reforço' estiver selecionado com 'TODAS', agrupa todos os alunos da modalidade de todas as turmas)
        const matchesTurma = selectedTurma === 'TODAS' || student.turma === selectedTurma;

        // Search filter
        const matchesSearch =
          searchTerm.trim() === '' ||
          (student.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (student.turma || '').toLowerCase().includes(searchTerm.toLowerCase());

        return matchesActivity && matchesTurma && matchesSearch;
      })
      .sort((a, b) => {
        // Alunos de Reforço com vigência ativa no TOPO da lista
        const aIsReforco = isStudentInReforcoVigency(a, selectedDate);
        const bIsReforco = isStudentInReforcoVigency(b, selectedDate);
        if (aIsReforco && !bIsReforco) return -1;
        if (!aIsReforco && bIsReforco) return 1;

        const turmaCompare = (a.turma || '').localeCompare(b.turma || '', 'pt-BR', { numeric: true });
        if (turmaCompare !== 0) return turmaCompare;
        return (a.name || '').localeCompare(b.name || '', 'pt-BR');
      });
  }, [students, selectedDate, selectedActivity, selectedTurma, searchTerm, allowedActivityIds, allowedTurmas, isCoordenador]);

  // Mapa de busca rápida integrando o estado global e o snapshot do Firestore da data selecionada
  const recordMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    const pool = [...(records || []), ...(dateFirestoreRecords || [])];
    pool.forEach((rec) => {
      if (rec && rec.studentId && rec.date) {
        const act = (rec.activity || (rec as any).modalidade || 'Rotina').trim();
        // Mapeamento multi-chave com suporte para chave composta attendance/${date}_${studentId}
        map.set(`${rec.studentId}_${act}_${rec.date}`, rec);
        map.set(`${rec.studentId}_${act.toLowerCase()}_${rec.date}`, rec);
        map.set(`${rec.date}_${rec.studentId}`, rec);
        map.set(`${rec.studentId}_${rec.date}`, rec);
        map.set(`${rec.date}_${rec.studentId}_${act}`, rec);
      }
    });
    return map;
  }, [records, dateFirestoreRecords]);

  // Identifica o status atual de chamada do aluno para o filtro do Resumo do Dia
  const getStudentAttendanceStatus = useCallback(
    (student: Student): Exclude<AttendanceFilterStatus, 'TODOS'> => {
      if (selectedActivity !== 'TODAS') {
        const rec =
          recordMap.get(`${student.id}_${selectedActivity}_${selectedDate}`) ||
          recordMap.get(`${student.id}_${selectedActivity.toLowerCase()}_${selectedDate}`) ||
          recordMap.get(`${selectedDate}_${student.id}`) ||
          recordMap.get(`${student.id}_${selectedDate}`);

        if (!rec || !rec.status) return 'PENDENTE';
        const st = String(rec.status).toLowerCase().trim();
        if (st === 'saida_antecipada') return 'SAIDA_ANTECIPADA';
        if (st === 'presente' || st === 'concluido' || st === 'concluído') return 'PRESENTE';
        if (st === 'sem_equipamento') return 'SEM_EQUIPAMENTO';
        if (st === 'falta') return 'FALTA';
        return 'PENDENTE';
      }

      // Se modalidade for 'TODAS', verifica as modalidades permitidas do aluno
      const isReforco = isStudentInReforcoVigency(student, selectedDate);
      const studentAllActs = [
        ...(student.activities || []),
        ...(isReforco ? ['Reforço'] : []),
      ];
      const uniqueActs = Array.from(new Set(studentAllActs)).filter((a) =>
        allowedActivityIds.includes(a as ActivityType)
      );

      if (uniqueActs.length === 0) return 'PENDENTE';

      for (const act of uniqueActs) {
        const rec =
          recordMap.get(`${student.id}_${act}_${selectedDate}`) ||
          recordMap.get(`${student.id}_${act.toLowerCase()}_${selectedDate}`) ||
          recordMap.get(`${selectedDate}_${student.id}`) ||
          recordMap.get(`${student.id}_${selectedDate}`);

        if (rec?.status) {
          const st = String(rec.status).toLowerCase().trim();
          if (st === 'saida_antecipada') return 'SAIDA_ANTECIPADA';
          if (st === 'presente' || st === 'concluido' || st === 'concluído') return 'PRESENTE';
          if (st === 'sem_equipamento') return 'SEM_EQUIPAMENTO';
          if (st === 'falta') return 'FALTA';
        }
      }
      return 'PENDENTE';
    },
    [selectedActivity, selectedDate, recordMap, allowedActivityIds]
  );

  // Calculate status statistics for current filter and date
  const stats = useMemo(() => {
    // Validação nos Diários de Classe:
    // Garanta que chamadas só possam contar nas estatísticas se pertencerem a dias letivos já ocorridos ou ao dia atual.
    if (selectedDate > todayStr) {
      return {
        presente: 0,
        saidaAntecipada: 0,
        falta: 0,
        semEquipamento: 0,
        pendente: filteredStudents.length,
        total: filteredStudents.length,
      };
    }

    let presente = 0;
    let saidaAntecipada = 0;
    let falta = 0;
    let semEquipamento = 0;
    let pendente = 0;

    filteredStudents.forEach((student) => {
      const status = getStudentAttendanceStatus(student);
      if (status === 'PRESENTE') {
        presente++;
      } else if (status === 'SAIDA_ANTECIPADA') {
        saidaAntecipada++;
      } else if (status === 'SEM_EQUIPAMENTO') {
        semEquipamento++;
      } else if (status === 'FALTA') {
        falta++;
      } else {
        pendente++;
      }
    });

    const total = presente + saidaAntecipada + falta + semEquipamento + pendente;
    return { presente, saidaAntecipada, falta, semEquipamento, pendente, total };
  }, [filteredStudents, selectedDate, todayStr, getStudentAttendanceStatus]);

  // Array de alunos visíveis na lista de frequência após aplicação do filtro interativo de status
  const displayedStudents = useMemo(() => {
    if (filterStatus === 'TODOS') return filteredStudents;
    return filteredStudents.filter((student) => getStudentAttendanceStatus(student) === filterStatus);
  }, [filteredStudents, filterStatus, getStudentAttendanceStatus]);

  // Alterna o filtro de status selecionado e executa scroll suave até o topo da lista de chamada
  const handleToggleStatusFilter = useCallback(
    (targetStatus: AttendanceFilterStatus) => {
      setFilterStatus((prev) => (prev === targetStatus ? 'TODOS' : targetStatus));
      setTimeout(() => {
        if (rosterListRef.current) {
          rosterListRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          document.getElementById('daily-attendance-sheet')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    },
    []
  );

  // Refs para manter callbacks estáveis sem recriar funções a cada alteração de registro
  const recordMapRef = React.useRef(recordMap);
  recordMapRef.current = recordMap;

  const onSaveRecordRef = React.useRef(onSaveRecord);
  onSaveRecordRef.current = onSaveRecord;

  const currentUserRef = React.useRef(currentUser);
  currentUserRef.current = currentUser;

  const currentWeekRef = React.useRef(currentWeek);
  currentWeekRef.current = currentWeek;

  // Handlers for status click memoizado com useCallback
  const onStatusChange = useCallback(
    async (
      student: Student,
      activity: ActivityType,
      date: string,
      status: AttendanceStatus,
      equipmentDetails?: string,
      obs?: string,
      exitTimeParam?: string
    ) => {
      const activeRecordMap = recordMapRef.current;
      const activeSaveRecord = onSaveRecordRef.current;
      const activeUser = currentUserRef.current;
      const activeWeek = currentWeekRef.current;

      if (status === 'sem_equipamento' && !equipmentDetails) {
        // Open modal to specify equipment
        const key = `${student.id}_${activity}_${date}`;
        const existingRec = activeRecordMap.get(key);
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
      const existingRec = activeRecordMap.get(key);
      const currentObs = obs !== undefined ? obs : existingRec?.observation || '';

      let exitTime = exitTimeParam;
      if (status === 'saida_antecipada' && !exitTime) {
        exitTime = existingRec?.exitTime || getCurrentHHMM();
      }

      if (status === 'saida_antecipada') {
        playDepartureAlertSound();
      }

      const recordPayload = {
        studentId: student.id,
        activity,
        turma: student.turma,
        date,
        weekNumber: activeWeek.weekNumber,
        year: activeWeek.year,
        status,
        exitTime: status === 'saida_antecipada' ? exitTime : undefined,
        equipmentMissingDetails: equipmentDetails,
        observation: currentObs || undefined,
        instructorId: activeUser?.id || activeUser?.uid || undefined,
        instructorName: activeUser?.name || undefined,
      };

      // Limpa timer anterior de conclusão suave
      if (autoClearSyncTimerRef.current) {
        clearTimeout(autoClearSyncTimerRef.current);
        autoClearSyncTimerRef.current = null;
      }

      // Registra início da sincronização de forma não bloqueante
      setIndividualSyncState((prev) => ({
        ...prev,
        pendingCount: prev.pendingCount + 1,
        totalInBatch: prev.pendingCount === 0 ? 1 : prev.totalInBatch + 1,
        syncedCount: prev.pendingCount === 0 ? 0 : prev.syncedCount,
        isComplete: false,
        error: null,
      }));

      try {
        await activeSaveRecord(recordPayload);
        setLastSavedTime(getCurrentHHMM());

        setIndividualSyncState((prev) => {
          const nextPending = Math.max(0, prev.pendingCount - 1);
          const nextSynced = prev.syncedCount + 1;
          const isAllDone = nextPending === 0;

          if (isAllDone) {
            if (autoClearSyncTimerRef.current) clearTimeout(autoClearSyncTimerRef.current);
            autoClearSyncTimerRef.current = setTimeout(() => {
              setIndividualSyncState({
                pendingCount: 0,
                totalInBatch: 0,
                syncedCount: 0,
                isComplete: false,
                error: null,
              });
            }, 3500);
          }

          return {
            ...prev,
            pendingCount: nextPending,
            syncedCount: nextSynced,
            isComplete: isAllDone,
          };
        });
      } catch (err: any) {
        console.error('Erro ao confirmar presença no Firestore:', err);
        setIndividualSyncState((prev) => ({
          ...prev,
          pendingCount: Math.max(0, prev.pendingCount - 1),
          error: {
            message: err?.message || 'Falha ao confirmar presença deste aluno no servidor.',
            retry: () => onStatusChange(student, activity, date, status, equipmentDetails, obs, exitTimeParam),
          },
        }));
      }
    },
    []
  );

  // Alias para retrocompatibilidade
  const handleStatusClick = onStatusChange;

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
    const target = filterStatus !== 'TODOS' ? displayedStudents : filteredStudents;
    if (target.length === 0) return false;
    return target.every((student) => {
      const key = `${student.id}_${selectedActivity}_${selectedDate}`;
      const rec = recordMap.get(key);
      return rec?.status === 'presente';
    });
  }, [filterStatus, displayedStudents, filteredStudents, selectedActivity, selectedDate, recordMap]);

  const handleBatchMarkAllPresent = async () => {
    const target = filterStatus !== 'TODOS' ? displayedStudents : filteredStudents;
    const studentIds = target.map((s) => s.id);
    if (studentIds.length === 0) return;

    if (areAllMarkedPresent) {
      await batchAction.execute(
        async () => {
          await onClearRecords(studentIds, selectedActivity, selectedDate);
        },
        {
          pendingMessage: `Desmarcando presença de ${studentIds.length} alunos no Firestore...`,
          successMessage: `Presenças desmarcadas e sincronizadas no Firestore com sucesso!`,
          errorMessage: 'Falha ao desmarcar chamada no servidor.',
        }
      );
    } else {
      await batchAction.execute(
        async () => {
          await onBatchMarkPresent(studentIds, selectedActivity, selectedDate);
          setLastSavedTime(getCurrentHHMM());
        },
        {
          pendingMessage: `Gravando chamada de ${studentIds.length} alunos no Firestore...`,
          successMessage: `Chamada de ${studentIds.length} alunos gravada e confirmada no Firestore!`,
          errorMessage: 'Falha ao gravar chamada em lote no servidor.',
        }
      );
    }
  };

  const handleClearSelected = async () => {
    // Identifica todos os alunos da turma selecionada (ou do filtro atual se TODAS)
    const targetStudents =
      searchTerm.trim() !== ''
        ? filteredStudents
        : selectedTurma === 'TODAS'
        ? filteredStudents
        : students.filter((s) => s.turma === selectedTurma);

    const studentIds = Array.from(new Set(targetStudents.map((s) => s.id)));
    if (studentIds.length === 0) return;

    const turmaLabel =
      selectedTurma === 'TODAS'
        ? 'todas as turmas'
        : `turma "${selectedTurma}"`;

    const confirmMsg = `Tem certeza que deseja limpar todas as marcações de frequência (presença, faltas, saídas antecipadas e sem equipamento) da ${turmaLabel} no dia ${formatDateBR(
      selectedDate
    )}?\n\nTodas as marcações da turma serão totalmente removidas e o status de cada aluno retornará para "Pendente".`;

    if (window.confirm(confirmMsg)) {
      await batchAction.execute(
        async () => {
          // Limpa integralmente no estado e no Firestore todas as modalidades ('TODAS')
          await onClearRecords(studentIds, 'TODAS', selectedDate);
        },
        {
          pendingMessage: `Removendo todas as marcações da ${turmaLabel} no Firestore...`,
          successMessage: `Todas as marcações removidas com sucesso! Alunos retornados para Pendente.`,
          errorMessage: 'Falha ao remover marcações no servidor.',
          onSuccess: () => {
            // Dispara evento global para recálculo instantâneo dos contadores no cabeçalho
            window.dispatchEvent(
              new CustomEvent('app_attendance_cleared', {
                detail: { studentIds, selectedDate, selectedTurma },
              })
            );
          },
        }
      );
    }
  };

  const [isFinalizingCall, setIsFinalizingCall] = useState(false);

  const handleFinalizeCurrentCall = async () => {
    if (!onFinalizeCall) return;
    if (stats.pendente > 0) {
      const confirmed = window.confirm(
        `Existem ${stats.pendente} alunos com chamada pendente nesta data. Deseja encerrar a chamada agora, convertendo as pendências em Falta e consolidando os relatórios no Firestore?`
      );
      if (!confirmed) return;
    }
    setIsFinalizingCall(true);
    await batchAction.execute(
      async () => {
        await onFinalizeCall(selectedDate);
      },
      {
        pendingMessage: 'Encerrando e consolidando chamada no Firestore...',
        successMessage: 'Chamada finalizada e relatório consolidado com sucesso no Firestore!',
        errorMessage: 'Falha ao consolidar chamada no Firestore.',
      }
    );
    setIsFinalizingCall(false);
  };

  // Exporta relatório geral diário com TODOS os alunos cadastrados (botão do painel superior)
  const handleExportGeneralDailyPDF = (saveImmediately = false) => {
    try {
      const result = generateAttendanceDailyPDFReport({
        date: selectedDate,
        activityName: 'TODAS',
        turma: selectedTurma,
        students: students,
        records,
        teacherName: currentUser?.name,
        documentTitle: 'RELATÓRIO GERAL DE FREQUÊNCIA DIÁRIA',
        onlyProvidedStudents: false,
        saveImmediately,
      });

      setPdfPreviewState({
        isOpen: true,
        doc: result.doc,
        dataUrl: result.dataUrl || result.dataUri,
        blobUrl: result.blobUrl,
        filename: result.filename,
        title: `Relatório Geral de Frequência Diária — (${formatDateBR(selectedDate)})`,
        onDownload: result.download,
      });
    } catch (e) {
      console.error('Erro ao gerar relatório geral diário:', e);
      alert('Ocorreu um erro ao gerar o PDF da chamada geral.');
    }
  };

  // Imprime espelho de frequência diária geral (botão do painel superior)
  const handlePrintAttendanceDaily = () => {
    try {
      const pdf = generateAttendanceDailyPDFReport({
        date: selectedDate,
        activityName: 'TODAS',
        turma: selectedTurma,
        students: students,
        records,
        teacherName: currentUser?.name,
        documentTitle: 'RELATÓRIO GERAL DE FREQUÊNCIA DIÁRIA',
        onlyProvidedStudents: false,
        saveImmediately: false,
      });

      directPrint({
        elementId: 'daily-attendance-sheet',
        title: `Relatório Geral de Frequência Diária — (${formatDateBR(selectedDate)})`,
        blobUrl: pdf.blobUrl,
        doc: pdf.doc,
      });
    } catch (e) {
      safeWindowPrint('daily-attendance-sheet', `Relatório Geral de Frequência Diária — (${formatDateBR(selectedDate)})`);
    }
  };

  // Exporta PDF contendo EXCLUSIVAMENTE os alunos da lista filtrada no momento (botão do cabeçalho da Lista de Chamada)
  const handleExportFilteredDailyPDF = (saveImmediately = false) => {
    try {
      const targetStudents = displayedStudents.length > 0 ? displayedStudents : filteredStudents;
      const actTitle = selectedActivity && selectedActivity !== 'TODAS'
        ? `LISTA DE CHAMADA — ${selectedActivity.toUpperCase()}`
        : 'LISTA DE CHAMADA & FREQUÊNCIA DIÁRIA';

      const result = generateAttendanceDailyPDFReport({
        date: selectedDate,
        activityName: selectedActivity,
        turma: selectedTurma,
        students: targetStudents,
        records,
        teacherName: currentUser?.name,
        documentTitle: actTitle,
        onlyProvidedStudents: true,
        saveImmediately,
      });

      setPdfPreviewState({
        isOpen: true,
        doc: result.doc,
        dataUrl: result.dataUrl || result.dataUri,
        blobUrl: result.blobUrl,
        filename: result.filename,
        title: `${actTitle} (${formatDateBR(selectedDate)})`,
        onDownload: result.download,
      });
    } catch (e) {
      console.error('Erro ao gerar relatório filtrado da chamada:', e);
      alert('Ocorreu um erro ao gerar o PDF da lista de chamada filtrada.');
    }
  };

  // Imprime lista de chamada filtrada (botão "Imprimir" no cabeçalho da Lista de Chamada)
  const handlePrintFilteredAttendanceDaily = () => {
    try {
      const targetStudents = displayedStudents.length > 0 ? displayedStudents : filteredStudents;
      const actTitle = selectedActivity && selectedActivity !== 'TODAS'
        ? `LISTA DE CHAMADA — ${selectedActivity.toUpperCase()}`
        : 'LISTA DE CHAMADA & FREQUÊNCIA DIÁRIA';

      const pdf = generateAttendanceDailyPDFReport({
        date: selectedDate,
        activityName: selectedActivity,
        turma: selectedTurma,
        students: targetStudents,
        records,
        teacherName: currentUser?.name,
        documentTitle: actTitle,
        onlyProvidedStudents: true,
        saveImmediately: false,
      });

      directPrint({
        elementId: 'daily-attendance-sheet',
        title: `${actTitle} (${formatDateBR(selectedDate)})`,
        blobUrl: pdf.blobUrl,
        doc: pdf.doc,
      });
    } catch (e) {
      const actTitle = selectedActivity && selectedActivity !== 'TODAS'
        ? `LISTA DE CHAMADA — ${selectedActivity.toUpperCase()}`
        : 'LISTA DE CHAMADA & FREQUÊNCIA DIÁRIA';
      safeWindowPrint('daily-attendance-sheet', `${actTitle} (${formatDateBR(selectedDate)})`);
    }
  };

  // Fallback alias para compatibilidade
  const handleExportDailyPDF = handleExportFilteredDailyPDF;

  return (
    <div className="space-y-6">
      {!userCanMarkAttendance && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-amber-900 text-xs font-bold flex items-center space-x-2.5 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <span>Seu usuário está configurado no modo <strong>Somente Leitura</strong>. O lançamento de presença e marcação de ocorrências está desabilitado pela coordenação.</span>
        </div>
      )}

      {/* Routine & Monitor Guidance Banner (Atividade do Momento, Atalho de Chamada, Orientações e Cronograma) */}
      <div className="print:hidden no-print">
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
      </div>

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
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 print:hidden no-print">
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
              {allowedActivities.map((act) => {
                const isSelected = selectedActivity === act.id;
                const studentCount = selectedTurma !== 'TODAS'
                  ? countStudentsForActivityInTurma(act.id, selectedTurma)
                  : undefined;
                const hasStudents = studentCount === undefined || studentCount > 0;

                return (
                  <button
                    key={act.id}
                    onClick={() => setSelectedActivity(act.id)}
                    className={`transition-all cursor-pointer relative rounded-xl ${
                      isSelected
                        ? 'scale-105 shadow-sm ring-2 ring-indigo-500 ring-offset-2'
                        : hasStudents
                        ? 'opacity-80 hover:opacity-100 hover:scale-102'
                        : 'opacity-40 hover:opacity-75'
                    }`}
                  >
                    <ActivityBadge activity={act.id} size="md" iconName={act.icon} customIconUrl={act.customIconUrl} />
                    {studentCount !== undefined && (
                      <span
                        className={`absolute -top-1.5 -right-1.5 text-[9px] font-black px-1.5 py-0.2 rounded-full border shadow-2xs ${
                          hasStudents
                            ? 'bg-indigo-600 text-white border-white'
                            : 'bg-slate-200 text-slate-500 border-slate-300'
                        }`}
                        title={`${studentCount} aluno(s) matriculado(s) em ${act.name} no ${selectedTurma}`}
                      >
                        {studentCount}
                      </span>
                    )}
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
              onChange={(e) => handleTurmaChange(e.target.value as TurmaType | 'TODAS')}
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

          {/* Day of Week Selector with Interactive Date Picker */}
          <div>
            <div className="flex items-center justify-between mb-1 gap-2">
              <label className="block text-xs font-semibold text-slate-600">
                Dia da Chamada na Semana:
              </label>
              <div className="flex items-center space-x-1.5 bg-white border border-slate-300 rounded-lg px-2 py-0.5 shadow-2xs focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
                <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="text-[11px] font-bold text-slate-500">Data:</span>
                <input
                  type="date"
                  value={selectedDate}
                  max={todayStr}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    if (newDate) {
                      handleDateChange(newDate);
                    }
                  }}
                  className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                  title="Escolha qualquer data letiva anterior para visualizar e editar chamadas passadas"
                />
              </div>
            </div>
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
                      handleDateChange(day.dateStr);
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
          {/* Status summary pills / Interactive Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <span className="text-slate-500 font-semibold flex items-center space-x-1 mr-0.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Resumo do Dia:</span>
            </span>

            {/* 1. Presentes */}
            <button
              type="button"
              onClick={() => handleToggleStatusFilter('PRESENTE')}
              className={`px-2.5 py-1 rounded-lg border flex items-center space-x-1.5 font-bold transition-all cursor-pointer ${
                filterStatus === 'PRESENTE'
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-500 ring-offset-1 scale-105'
                  : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300/80 hover:scale-102 shadow-2xs'
              }`}
              title={
                filterStatus === 'PRESENTE'
                  ? 'Filtro ativo: exibindo apenas Presentes. Clique para ver todos.'
                  : 'Clique para filtrar apenas alunos Presentes'
              }
            >
              <CheckCircle2 className={`w-3.5 h-3.5 ${filterStatus === 'PRESENTE' ? 'text-white' : 'text-emerald-600'}`} />
              <span>{stats.presente} Presentes</span>
            </button>

            {/* 2. Saída Antecipada */}
            <button
              type="button"
              onClick={() => handleToggleStatusFilter('SAIDA_ANTECIPADA')}
              className={`px-2.5 py-1 rounded-lg border flex items-center space-x-1.5 font-bold transition-all cursor-pointer ${
                filterStatus === 'SAIDA_ANTECIPADA'
                  ? 'bg-amber-600 text-white border-amber-700 shadow-md ring-2 ring-amber-500 ring-offset-1 scale-105'
                  : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300/80 hover:scale-102 shadow-2xs'
              }`}
              title={
                filterStatus === 'SAIDA_ANTECIPADA'
                  ? 'Filtro ativo: exibindo apenas Saídas Antecipadas. Clique para ver todos.'
                  : 'Clique para filtrar apenas alunos com Saída Antecipada'
              }
            >
              <Clock className={`w-3.5 h-3.5 ${filterStatus === 'SAIDA_ANTECIPADA' ? 'text-white' : 'text-amber-700'}`} />
              <span>{stats.saidaAntecipada} Saída Ant.</span>
            </button>

            {/* 3. Sem Equip. */}
            <button
              type="button"
              onClick={() => handleToggleStatusFilter('SEM_EQUIPAMENTO')}
              className={`px-2.5 py-1 rounded-lg border flex items-center space-x-1.5 font-bold transition-all cursor-pointer ${
                filterStatus === 'SEM_EQUIPAMENTO'
                  ? 'bg-orange-600 text-white border-orange-700 shadow-md ring-2 ring-orange-500 ring-offset-1 scale-105'
                  : 'bg-orange-100 hover:bg-orange-200 text-orange-900 border-orange-300/80 hover:scale-102 shadow-2xs'
              }`}
              title={
                filterStatus === 'SEM_EQUIPAMENTO'
                  ? 'Filtro ativo: exibindo apenas Sem Equipamento. Clique para ver todos.'
                  : 'Clique para filtrar apenas alunos Sem Equipamento'
              }
            >
              <Shirt className={`w-3.5 h-3.5 ${filterStatus === 'SEM_EQUIPAMENTO' ? 'text-white' : 'text-orange-600'}`} />
              <span>{stats.semEquipamento} Sem Equip.</span>
            </button>

            {/* 4. Faltas */}
            <button
              type="button"
              onClick={() => handleToggleStatusFilter('FALTA')}
              className={`px-2.5 py-1 rounded-lg border flex items-center space-x-1.5 font-bold transition-all cursor-pointer ${
                filterStatus === 'FALTA'
                  ? 'bg-rose-600 text-white border-rose-700 shadow-md ring-2 ring-rose-500 ring-offset-1 scale-105'
                  : 'bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-300/80 hover:scale-102 shadow-2xs'
              }`}
              title={
                filterStatus === 'FALTA'
                  ? 'Filtro ativo: exibindo apenas Faltas. Clique para ver todos.'
                  : 'Clique para filtrar apenas alunos com Falta'
              }
            >
              <XCircle className={`w-3.5 h-3.5 ${filterStatus === 'FALTA' ? 'text-white' : 'text-rose-600'}`} />
              <span>{stats.falta} Faltas</span>
            </button>

            {/* 4. Pendentes */}
            {(stats.pendente > 0 || filterStatus === 'PENDENTE') && (
              <button
                type="button"
                onClick={() => handleToggleStatusFilter('PENDENTE')}
                className={`px-2.5 py-1 rounded-lg border flex items-center space-x-1.5 font-bold transition-all cursor-pointer ${
                  filterStatus === 'PENDENTE'
                    ? 'bg-slate-700 text-white border-slate-800 shadow-md ring-2 ring-slate-500 ring-offset-1 scale-105'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-700 border-slate-300 hover:scale-102 shadow-2xs'
                }`}
                title={
                  filterStatus === 'PENDENTE'
                    ? 'Filtro ativo: exibindo apenas Pendentes. Clique para ver todos.'
                    : 'Clique para filtrar apenas alunos com Chamada Pendente'
                }
              >
                <Clock className={`w-3.5 h-3.5 ${filterStatus === 'PENDENTE' ? 'text-white' : 'text-slate-600'}`} />
                <span>{stats.pendente} Pendentes</span>
              </button>
            )}

            {/* Botão Secundário [ 🔄 Ver Todos ] quando algum filtro estiver aplicado */}
            {filterStatus !== 'TODOS' && (
              <button
                type="button"
                onClick={() => {
                  setFilterStatus('TODOS');
                  setTimeout(() => {
                    if (rosterListRef.current) {
                      rosterListRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } else {
                      document.getElementById('daily-attendance-sheet')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }, 50);
                }}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold flex items-center space-x-1 transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
                title="Limpar filtro e exibir todos os alunos"
              >
                <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
                <span>🔄 Ver Todos</span>
              </button>
            )}

            {/* Feedback Visual: [ 💾 Gravado às hh:mm ] */}
            {lastSavedTime && (
              <span
                className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs transition-all animate-in fade-in"
                title="Última alteração salva e persistida com sucesso no Firestore"
              >
                <span>💾 Gravado às {lastSavedTime}</span>
              </span>
            )}

            {isLoadingDateRecords && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span>Carregando data...</span>
              </span>
            )}
          </div>

          {/* Quick Buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end print:hidden no-print">
            {/* Print Timesheet / Call List */}
            <button
              type="button"
              onClick={handlePrintAttendanceDaily}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs active:scale-95"
              title="Imprimir lista de chamada / espelho de frequência em folha A4"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-600" />
              <span>Imprimir Espelho</span>
            </button>

            {/* Save PDF / Send DP (Geral) */}
            <button
              type="button"
              onClick={() => handleExportGeneralDailyPDF(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs active:scale-95"
              title="Salvar relatório geral diário em PDF com todos os alunos e enviar ao DP"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              <span>Salvar PDF / Enviar DP</span>
            </button>

            {selectedTurma !== 'TODAS' && (
              <button
                onClick={() => {
                  const result = generateTurmaPDFReport(selectedTurma, currentWeek, students, records);
                  setPdfPreviewState({
                    isOpen: true,
                    doc: result.doc,
                    dataUrl: result.dataUrl || result.dataUri,
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
              disabled={filteredStudents.length === 0 || batchAction.isPending}
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
              {batchAction.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sincronizando...</span>
                </>
              ) : areAllMarkedPresent ? (
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
              disabled={filteredStudents.length === 0 || batchAction.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center space-x-1 shadow-2xs hover:shadow-xs active:scale-95"
              title="Limpar todas as marcações da turma e retornar alunos para Pendente"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Limpar</span>
            </button>

            {onFinalizeCall && userCanMarkAttendance && (
              <button
                type="button"
                onClick={handleFinalizeCurrentCall}
                disabled={filteredStudents.length === 0 || batchAction.isPending || isFinalizingCall}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs ${
                  stats.pendente === 0 && stats.total > 0
                    ? 'bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-600'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Finalizar e consolidar chamada no Firestore e Relatórios Financeiros"
              >
                {isFinalizingCall ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Consolidando...</span>
                  </>
                ) : stats.pendente === 0 && stats.total > 0 ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
                    <span>Chamada Consolidada</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Finalizar Chamada</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Confirmation Feedback & Batch Sync Indicator */}
      <div className="space-y-2">
        {/* Batch Action Banner (Marcar Todos / Limpar) */}
        <SaveStatusBanner
          isPending={batchAction.isPending}
          pendingText={batchAction.pendingMessage}
          successNotice={batchAction.successNotice}
          error={batchAction.error}
          onClearError={batchAction.clearError}
        />

        {/* Individual Save Error Banner */}
        {individualSyncState.error && (
          <SaveStatusBanner
            isPending={false}
            error={individualSyncState.error}
            onClearError={() => setIndividualSyncState((prev) => ({ ...prev, error: null }))}
          />
        )}

        {/* Live Non-Blocking Batch Sync Indicator */}
        {(individualSyncState.pendingCount > 0 || (individualSyncState.isComplete && individualSyncState.totalInBatch > 0)) && (
          <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs shadow-xs">
            <div className="flex items-center space-x-2">
              {individualSyncState.pendingCount > 0 ? (
                <>
                  <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
                  <span className="font-bold text-slate-700">
                    Sincronizando com a nuvem ({individualSyncState.syncedCount}/{individualSyncState.totalInBatch})
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    ({individualSyncState.pendingCount} pendente{individualSyncState.pendingCount > 1 ? 's' : ''})
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold text-emerald-800">
                    Sincronizado na nuvem ({individualSyncState.totalInBatch}/{individualSyncState.totalInBatch}) ✓
                  </span>
                  <span className="text-emerald-700 text-[11px]">
                    Todos os registros confirmados com sucesso no Firestore
                  </span>
                </>
              )}
            </div>

            <div className="text-[11px] font-mono font-medium text-slate-500">
              {individualSyncState.pendingCount > 0 ? (
                <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-bold">
                  Gravando em segundo plano
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">
                  Confirmado
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Attendance Calling Roster Grid / Table */}
      {isLoadingStudents || (students.length === 0 && !isCoordenador) ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 space-y-3 shadow-xs">
          <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <h3 className="text-base font-bold text-slate-800">Carregando lista de alunos...</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Sincronizando registros da turma em tempo real com a nuvem do Colégio Crescer.
          </p>
        </div>
      ) : filteredStudents.length === 0 ? (
        !hasAnyModalityStudentsInTurma ? (
          <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-10 text-center text-amber-900 space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-amber-950">
              Nenhum aluno desta turma está matriculado nas suas modalidades
            </h3>
            <p className="text-xs text-amber-800 max-w-lg mx-auto leading-relaxed">
              As modalidades atribuídas ao seu usuário são:{' '}
              <strong className="text-amber-950">
                {allowedActivities.map((a) => a.name).join(', ')}
              </strong>
              , porém a turma <strong>{selectedTurma}</strong> não possui alunos matriculados nessas atividades.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 space-y-3">
            <Filter className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-700">Nenhum aluno encontrado</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Nenhum aluno está cadastrado na atividade "{selectedActivity}" para a turma "{selectedTurma}" com o termo digitado.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {normalizeStr(selectedActivity) === normalizeStr('Reforço') && (
            <div className="bg-amber-500/10 border border-amber-300 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                  <BookMarked className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide flex items-center gap-1.5">
                    <span>Chamada Consolidada de Reforço Escolar (Multiturmas)</span>
                    <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold">
                      {filteredStudents.length} aluno(s) convocados
                    </span>
                  </h4>
                  <p className="text-[11px] text-amber-900 leading-tight">
                    Agrupamento dinâmico de todos os alunos vinculados ao Reforço Escolar, independente da turma de origem.
                  </p>
                </div>
              </div>
              {selectedTurma !== 'TODAS' && (
                <button
                  type="button"
                  onClick={() => setSelectedTurma('TODAS')}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0"
                >
                  Ver Todas as Turmas Convocadas
                </button>
              )}
            </div>
          )}

          <div id="daily-attendance-sheet" ref={rosterListRef} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden scroll-mt-6">
          {/* Institutional Print Header */}
          <div className="print-only p-4 border-b-2 border-slate-900 text-center space-y-1">
            <h1 className="text-base font-black uppercase tracking-wider text-slate-900">
              INSTITUTO EDUCACIONAL CRESCER • COLÉGIO CRESCER
            </h1>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              LISTA DE CHAMADA DIÁRIA DE FREQUÊNCIA
            </h2>
            <div className="flex justify-between text-[10px] font-semibold text-slate-600 pt-1 border-t border-slate-300">
              <span>Data: {formatDateBR(selectedDate)}</span>
              <span>Modalidade: {selectedActivity}</span>
              <span>Turma: {selectedTurma === 'all' ? 'Todas as Turmas' : selectedTurma}</span>
              {currentUser?.name && <span>Responsável: {currentUser.name}</span>}
            </div>
          </div>

          <div className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold flex items-center space-x-2">
                <span>Lista de Chamada de Frequência</span>
                {selectedActivity !== 'TODAS' && <ActivityBadge activity={selectedActivity} size="sm" />}
              </h2>
              <p className="text-xs text-slate-400">
                {displayedStudents.length} {filterStatus !== 'TODOS' ? `de ${filteredStudents.length}` : ''} aluno(s) listado(s) {filterStatus !== 'TODOS' ? `• Filtro ativo: ${filterStatus === 'PRESENTE' ? 'Presentes' : filterStatus === 'SAIDA_ANTECIPADA' ? 'Saída Antecipada' : filterStatus === 'SEM_EQUIPAMENTO' ? 'Sem Equipamento' : filterStatus === 'FALTA' ? 'Faltas' : 'Pendentes'}` : ''} • Clique nos botões para registrar a presença ou justificativa de ausência.
              </p>
            </div>
            <div className="flex items-center space-x-2 print:hidden no-print">
              <button
                type="button"
                onClick={handlePrintFilteredAttendanceDaily}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all cursor-pointer flex items-center space-x-1 active:scale-95"
                title={`Imprimir lista de chamada filtrada (${selectedActivity}) em formato A4`}
              >
                <Printer className="w-3.5 h-3.5 text-emerald-400" />
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportFilteredDailyPDF(false)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 transition-all cursor-pointer flex items-center space-x-1 active:scale-95"
                title={`Salvar lista de chamada filtrada (${selectedActivity}) em PDF`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Salvar PDF</span>
              </button>
              <div className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-750 text-white px-2.5 py-1 rounded-lg border border-slate-700 shadow-inner focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition-colors">
                <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <label htmlFor="daily-sheet-date-picker" className="text-xs font-bold text-slate-300 shrink-0 cursor-pointer">
                  Data:
                </label>
                <input
                  id="daily-sheet-date-picker"
                  type="date"
                  value={selectedDate}
                  max={todayStr}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    if (newDate) {
                      handleDateChange(newDate);
                    }
                  }}
                  className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer [color-scheme:dark] px-1 py-0.5 rounded"
                  title="Selecionar data da chamada (escolha qualquer data letiva anterior para visualizar, editar e finalizar chamadas passadas)"
                />
                {selectedDate < todayStr && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-950 hidden sm:inline-block shrink-0 shadow-2xs" title="Visualizando chamada de data retroativa">
                    Retroativo
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {displayedStudents.length === 0 && filterStatus !== 'TODOS' ? (
              <div className="p-12 text-center text-slate-500 space-y-3">
                <Filter className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="text-base font-bold text-slate-700">
                  Nenhum aluno com status{' '}
                  <span className="text-indigo-600 font-extrabold">
                    "{filterStatus === 'PRESENTE' ? 'Presente' : filterStatus === 'SAIDA_ANTECIPADA' ? 'Saída Antecipada' : filterStatus === 'SEM_EQUIPAMENTO' ? 'Sem Equipamento' : filterStatus === 'FALTA' ? 'Falta' : 'Pendente'}"
                  </span>
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Não há alunos nesta lista com este status para {formatDateBR(selectedDate)}.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFilterStatus('TODOS');
                    setTimeout(() => {
                      if (rosterListRef.current) {
                        rosterListRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }, 50);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer inline-flex items-center space-x-1.5 active:scale-95"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Ver Todos os Alunos</span>
                </button>
              </div>
            ) : (
              displayedStudents.map((student) => {
                const isReforcoStudent = isStudentInReforcoVigency(student, selectedDate);

                // Determine activities to display for this student (ONLY allowed activities for Monitor/Professor)
                const studentAllActs = [
                  ...(student.activities || []),
                  ...(isReforcoStudent ? ['Reforço'] : []),
                ];
                const uniqueActs = Array.from(new Set(studentAllActs));
                const activitiesToDisplay = uniqueActs.filter(
                  (a) =>
                    allowedActivityIds.includes(a as ActivityType) &&
                    (selectedActivity === 'TODAS' || a === selectedActivity)
                ) as ActivityType[];

                const departureTimeToday = getStudentDepartureTimeForDate(student, selectedDate);

                const recordsForStudent: Record<string, AttendanceRecord | undefined> = {};
                const sigParts: string[] = [];

                activitiesToDisplay.forEach((act) => {
                  const recKey = `${student.id}_${act}_${selectedDate}`;
                  const rec =
                    recordMap.get(recKey) ||
                    recordMap.get(`${student.id}_${act.toLowerCase()}_${selectedDate}`) ||
                    recordMap.get(`${selectedDate}_${student.id}`) ||
                    recordMap.get(`${student.id}_${selectedDate}`);
                  recordsForStudent[act] = rec;
                  sigParts.push(
                    `${act}:${rec?.status || 'pendente'}:${rec?.exitTime || ''}:${rec?.equipmentMissingDetails || ''}:${rec?.observation || ''}`
                  );
                });

                const targetReforcoAct = selectedActivity === 'TODAS' ? 'Rotina' : selectedActivity;
                const reforcoRec =
                  recordMap.get(`${student.id}_${targetReforcoAct}_${selectedDate}`) ||
                  recordMap.get(`${student.id}_Reforço_${selectedDate}`);

                if (isReforcoStudent) {
                  sigParts.push(`reforco:${reforcoRec?.observation || ''}`);
                }

                const recordSignature = sigParts.join('|');

                return (
                  <StudentAttendanceItem
                    key={student.id}
                    student={student}
                    selectedDate={selectedDate}
                    selectedActivity={selectedActivity}
                    allowedActivityIds={allowedActivityIds}
                    activityMap={activityMap}
                    isCoordenador={isCoordenador}
                    currentWeek={currentWeek}
                    currentUser={currentUser}
                    isReforcoStudent={isReforcoStudent}
                    departureTimeToday={departureTimeToday}
                    activitiesToDisplay={activitiesToDisplay}
                    recordSignature={recordSignature}
                    recordsForStudent={recordsForStudent}
                    reforcoRecord={reforcoRec}
                    onStatusChange={onStatusChange}
                    onSaveRecord={onSaveRecord}
                  />
                );
              })
            )}
          </div>

          {/* Institutional Print Signatures Footer */}
          <div className="print-only p-6 pt-12 border-t border-slate-300 grid grid-cols-2 gap-8 text-center text-xs print-signatures">
            <div>
              <div className="border-t border-slate-800 pt-1 font-bold text-slate-900">
                {currentUser?.name || 'Responsável pelo Registro'}
              </div>
              <div className="text-[10px] text-slate-600">Assinatura do(a) Professor(a) / Monitor(a)</div>
            </div>
            <div>
              <div className="border-t border-slate-800 pt-1 font-bold text-slate-900">
                Coordenação Pedagógica
              </div>
              <div className="text-[10px] text-slate-600">Colégio Crescer</div>
            </div>
          </div>
        </div>
        </div>
      )}
      {/* On-screen PDF Viewer Modal */}
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
    </div>
  );
};
