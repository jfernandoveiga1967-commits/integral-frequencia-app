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
  Bell,
  Volume2,
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
  Send,
  Edit3,
  UserCheck,
  ShieldCheck,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Target,
  Package,
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
  TurmaAtribuicao,
  SemanarioPlan,
  DepartureAlertSettings,
} from '../types';
import { getDepartureAlertSettings, subscribeDepartureAlertSettings } from '../firebase';
import { playDepartureAlertSound } from '../utils/notificationUtils';
import {
  DepartureAlertItem,
  evaluateDepartureAlerts,
  markDepartureAsAlerted,
  cleanOldDepartureAlertStorageKeys,
} from '../utils/departureAlertUtils';
import { DepartureAlertBanner } from './DepartureAlertBanner';
import { DepartureAlertModal } from './DepartureAlertModal';
import { findMatchingSemanarioPlan } from '../utils/semanarioMatching';
import { ActivityBadge, renderActivityIconOrImage } from './ActivityBadge';
import { StatusBadge } from './StatusBadge';
import { WhatsAppNotifyModal } from './WhatsAppNotifyModal';
import { ApoioWhatsAppModal } from './ApoioWhatsAppModal';
import { QuadroAtribuicoesModal } from './QuadroAtribuicoesModal';
import {
  getDayOfWeekFromDate,
  getDayOfWeekLabel,
  isWeekend,
  isHolidayOrRecess,
  formatDateBR,
  toISODateString,
  isStudentScheduledForDay,
  isStudentScheduledForDate,
  isStudentActiveOnDate,
} from '../utils/dateUtils';
import { canMarkAttendance, isCoordenador } from '../utils/authUtils';
import { isRoutineActivity } from '../utils/frequenciaUtils';
import { sortTurmasPedagogical } from '../utils/turmaUtils';
import { findResponsibleCollaborator, cleanPhoneNumber } from '../utils/whatsappUtils';
import {
  loadLocalQuadroAtribuicoes,
  saveLocalQuadroAtribuicoes,
  resolveAtribuicaoForTurma,
  reconcileAtribuicoesWithTurmas,
  buildApoioWhatsAppUrl,
  getFirstName,
} from '../utils/atribuicoesStorage';

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
  quadroAtribuicoes?: TurmaAtribuicao[];
  onSaveAtribuicao?: (atribuicao: TurmaAtribuicao) => void;
  onBatchSaveAtribuicoes?: (items: TurmaAtribuicao[]) => void;
  onSaveRecord: (record: Omit<AttendanceRecord, 'id' | 'createdAt'>) => void;
  onBatchMarkPresent: (studentIds: string[], activity: ActivityType | 'TODAS', date: string) => void;
  onClearRecords: (studentIds: string[], activity: ActivityType | 'TODAS', date: string) => void;
  onNavigateToAttendance: (activity?: ActivityType, turma?: TurmaType, date?: string) => void;
  onUpdateUserPhone?: (userId: string, newPhone: string) => void;
  todaySemanarioPlans?: SemanarioPlan[];
}

/**
 * Retorna os alunos da turma que participam da atividade informada no dia.
 * - Grade Geral / Rotina Coletiva (Acolhimento, Almoço, Parquinho, etc.) ou 'Rotina':
 *   todos os alunos ativos da turma agendados para a data.
 * - Atividades Extracurriculares que exigem chamada (Balé, Judô, etc.):
 *   alunos com a modalidade no cadastro (ou todos da turma se a turma não tiver filtros individuais).
 */
function getEnrolledStudentsForActivity(
  students: Student[],
  turmaName: string,
  activityId: string,
  effectiveDayOfWeek: DayOfWeek,
  selectedDate?: string,
  activityMap?: Map<string, ActivityItem>
): Student[] {
  const turmaActiveStudents = students.filter((s) => {
    if (s.turma !== turmaName) return false;
    const st = s.status || s.statusMatricula || 'ativo';
    if (st !== 'ativo') return false;
    if (selectedDate && !isStudentActiveOnDate(s, selectedDate)) return false;
    return isStudentScheduledForDay(s, effectiveDayOfWeek);
  });

  const actMeta = activityMap?.get(activityId);
  const requiresRollCall = actMeta ? actMeta.requiresRollCall !== false : true;

  if (!requiresRollCall || isRoutineActivity(activityId) || activityId === 'Rotina') {
    return turmaActiveStudents;
  }

  const specificEnrolled = turmaActiveStudents.filter((s) =>
    (s.activities || []).includes(activityId)
  );

  if (specificEnrolled.length > 0) {
    return specificEnrolled;
  }
  return turmaActiveStudents;
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
  quadroAtribuicoes,
  onSaveAtribuicao,
  onBatchSaveAtribuicoes,
  onSaveRecord,
  onBatchMarkPresent,
  onClearRecords,
  onNavigateToAttendance,
  onUpdateUserPhone,
  todaySemanarioPlans = [],
}) => {
  // Plan details expansion state per turma
  const [expandedPlanTurmas, setExpandedPlanTurmas] = useState<Record<string, boolean>>({});

  const togglePlanExpanded = (turmaName: string) => {
    setExpandedPlanTurmas((prev) => ({
      ...prev,
      [turmaName]: !prev[turmaName],
    }));
  };

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

  // Quadro de Atribuições local state & sync (sempre estritamente alinhado às turmas de Alunos e Turmas)
  const [atribuicoesList, setAtribuicoesList] = useState<TurmaAtribuicao[]>(() => {
    const raw = quadroAtribuicoes && quadroAtribuicoes.length > 0
      ? quadroAtribuicoes
      : loadLocalQuadroAtribuicoes();
    return reconcileAtribuicoesWithTurmas(raw, turmas);
  });

  useEffect(() => {
    const base = quadroAtribuicoes && quadroAtribuicoes.length > 0
      ? quadroAtribuicoes
      : loadLocalQuadroAtribuicoes();
    setAtribuicoesList(reconcileAtribuicoesWithTurmas(base, turmas));
  }, [quadroAtribuicoes, turmas]);

  const handleSaveAtribuicaoItem = (item: TurmaAtribuicao) => {
    setAtribuicoesList((prev) => {
      const idx = prev.findIndex((a) => a.turma === item.turma);
      let updated: TurmaAtribuicao[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = item;
      } else {
        updated = [...prev, item];
      }
      saveLocalQuadroAtribuicoes(updated);
      return updated;
    });
    if (onSaveAtribuicao) {
      onSaveAtribuicao(item);
    }
  };

  // Quadro de Atribuições modal
  const [isQuadroModalOpen, setIsQuadroModalOpen] = useState(false);

  // Departure Alert state & settings - Inicializa com localStorage de salvaguarda (se houver) e escuta em tempo real
  const [alertSettings, setAlertSettings] = useState<DepartureAlertSettings>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const cached = localStorage.getItem('integral_departure_alert_settings');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed.alertMinutes === 'number') {
            return parsed;
          }
        }
      } catch {}
    }
    return {
      id: 'departureAlert',
      alertMinutes: 5,
    };
  });
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [activeDepartureAlerts, setActiveDepartureAlerts] = useState<DepartureAlertItem[]>([]);

  // Escutar configurações de alerta de saída em tempo real do Firestore (onSnapshot)
  useEffect(() => {
    const unsubscribe = subscribeDepartureAlertSettings((settings) => {
      if (settings && typeof settings.alertMinutes === 'number') {
        setAlertSettings(settings);
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Apoio WhatsApp Modal state (customizable message)
  const [apoioModalState, setApoioModalState] = useState<{
    isOpen: boolean;
    destinatarioRole: 'adi' | 'monitora' | 'coordenador';
    destinatarioName: string;
    destinatarioPhone?: string;
    turmaName: string;
  }>({
    isOpen: false,
    destinatarioRole: 'adi',
    destinatarioName: '',
    destinatarioPhone: '',
    turmaName: '',
  });

  // Direct 1-Click WhatsApp Trigger
  const triggerApoioDirectWhatsApp = (
    destinatarioName: string,
    destinatarioPhone: string | undefined,
    turmaName: string,
    role: 'adi' | 'monitora'
  ) => {
    const cleanNum = cleanPhoneNumber(destinatarioPhone);
    if (!cleanNum) {
      setApoioModalState({
        isOpen: true,
        destinatarioRole: role,
        destinatarioName,
        destinatarioPhone: destinatarioPhone || '',
        turmaName,
      });
      return;
    }
    const url = buildApoioWhatsAppUrl(cleanNum, destinatarioName);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

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
    targetUserId?: string;
    targetUserEmail?: string;
    targetUserName?: string;
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

  // Monitoramento periódico e sob demanda de saídas customizadas de alunos
  useEffect(() => {
    const runCheck = () => {
      // Limpeza de chaves de dias anteriores no localStorage
      cleanOldDepartureAlertStorageKeys(selectedDate);

      const newAlerts = evaluateDepartureAlerts({
        students,
        records,
        quadroAtribuicoes: atribuicoesList,
        selectedDate,
        currentUser,
        alertMinutes: alertSettings.alertMinutes,
        simulatedTimeHHMM: isSimulatingTime ? simulatedTime : undefined,
        dayOfWeekOverride: isSimulatingTime ? simulatedDay : undefined,
      });

      if (newAlerts.length > 0) {
        // Gravar no localStorage para evitar repetições no dia
        newAlerts.forEach((item) => {
          markDepartureAsAlerted(selectedDate, item.studentId, item.departureTime);
        });

        // Disparar o som do sistema
        playDepartureAlertSound();

        // Adicionar aos alertas visuais em exibição
        setActiveDepartureAlerts((prev) => {
          const existingIds = new Set(prev.map((a) => a.id));
          const toAdd = newAlerts.filter((a) => !existingIds.has(a.id));
          return [...toAdd, ...prev];
        });
      }
    };

    runCheck();

    // Roda a cada 30 segundos
    const interval = setInterval(runCheck, 30000);
    return () => clearInterval(interval);
  }, [
    students,
    records,
    atribuicoesList,
    selectedDate,
    currentUser,
    alertSettings.alertMinutes,
    isSimulatingTime,
    simulatedTime,
    simulatedDay,
    effectiveCurrentTime,
  ]);

  // Monitora default view filter: 'minhas' vs 'todas'
  const userAssignedTurmas = useMemo(() => {
    return new Set(currentUser?.allowedClassIds || currentUser?.assignedTurmas || []);
  }, [currentUser]);

  const [turmaScopeFilter, setTurmaScopeFilter] = useState<'minhas' | 'todas'>(() => {
    if (isCoord || !currentUser) return 'todas';
    const assigned = currentUser.allowedClassIds || currentUser.assignedTurmas || [];
    return assigned.length > 0 ? 'minhas' : 'todas';
  });

  // Map of activity ID -> ActivityItem
  const activityMap = useMemo(() => {
    const map = new Map<string, ActivityItem>();
    activitiesList.forEach((act) => {
      map.set(act.id, act);
      map.set(act.name, act);
    });
    return map;
  }, [activitiesList]);

  // Allowed turmas for user sorted pedagogically
  const allowedTurmas = useMemo(() => {
    const sorted = sortTurmasPedagogical(turmas);
    if (isCoord || !currentUser) return sorted;
    if (turmaScopeFilter === 'minhas' && userAssignedTurmas.size > 0) {
      return sorted.filter((t) => userAssignedTurmas.has(t));
    }
    return sorted;
  }, [turmas, isCoord, currentUser, turmaScopeFilter, userAssignedTurmas]);

  // Compute activity state per turma
  const turmaStatuses = useMemo(() => {
    // Trava de Fim de Semana: se for sábado (6) ou domingo (0) e simulação não estiver ativa
    const currentDayOfWeekNum = new Date().getDay();
    const isWeekendNow = currentDayOfWeekNum === 0 || currentDayOfWeekNum === 6;
    const isWeekendSelected = isWeekend(selectedDate);
    const isWeekendLocked = (isWeekendNow || isWeekendSelected) && !isSimulatingTime;

    return allowedTurmas.map((turmaName) => {
      // All blocks for this turma on this day
      const turmaBlocks = schedules
        .filter((s) => s.turma === turmaName && s.dayOfWeek === effectiveDayOfWeek)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      // Se for final de semana e não estiver em modo de simulação, nenhum bloco está em andamento
      if (isWeekendLocked) {
        return {
          turmaName,
          turmaBlocks,
          activeBlock: null,
          nextBlock: null,
          pastBlocks: [],
          rollCallInfo: null,
        };
      }

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

        // Enrolled students in this turma for this activity who are scheduled to attend on this day
        const enrolledStudents = getEnrolledStudentsForActivity(
          students,
          turmaName,
          activeBlock.activityId,
          effectiveDayOfWeek,
          selectedDate,
          activityMap
        );

        // Attendance records today for this turma & activity
        const recordsToday = records.filter(
          (r) =>
            r.date === selectedDate &&
            r.turma === turmaName &&
            (r.activity === activeBlock.activityId ||
              (isRoutineActivity(activeBlock.activityId) && isRoutineActivity(r.activity)))
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
    isSimulatingTime,
  ]);

  // Overall Statistics
  const stats = useMemo(() => {
    const totalTurmas = turmaStatuses.length;

    // Trava de Fim de Semana nos Cards de Métricas:
    // Verifique o estado atual do dia da semana (new Date().getDay()). Se for sábado (6) ou domingo (0)
    // e o modo de simulação NÃO estiver ativado pelo usuário:
    // EM ATIVIDADE AGORA: Deve exibir 0.
    // ALUNOS ATIVOS: Deve exibir 0.
    // CHAMADAS PENDENTES: Deve exibir 0.
    const currentDayOfWeekNum = new Date().getDay();
    const isWeekendNow = currentDayOfWeekNum === 0 || currentDayOfWeekNum === 6;
    const isWeekendSelected = isWeekend(selectedDate);
    const isWeekendLocked = (isWeekendNow || isWeekendSelected) && !isSimulatingTime;

    if (isWeekendLocked) {
      return {
        totalTurmas,
        inActivity: 0,
        pendingRollCalls: 0,
        completedRollCalls: 0,
        totalStudentsInActivePeriods: 0,
      };
    }

    const inActivity = turmaStatuses.filter((ts) => ts.activeBlock !== null).length;

    // Card "Chamadas Pendentes":
    // Contagem por Turma/Atividade: Deve somar +1 pendência para cada turma cuja atividade atual
    // exija chamada (ou seja marcada para acompanhamento) e ainda não tenha a lista de presença/frequência
    // salva pelo monitor para o bloco de horário atual.
    // A pendência deve sumir do card assim que a chamada do horário for confirmada.
    const pendingRollCalls = turmaStatuses.filter((ts) => {
      if (!ts.activeBlock || !ts.rollCallInfo) return false;
      if (!ts.rollCallInfo.requiresRollCall) return false;
      if (ts.rollCallInfo.totalEnrolled === 0) return false;
      return ts.rollCallInfo.statusType !== 'concluida';
    }).length;

    const completedRollCalls = turmaStatuses.filter(
      (ts) =>
        ts.activeBlock !== null &&
        ts.rollCallInfo &&
        ts.rollCallInfo.requiresRollCall &&
        ts.rollCallInfo.statusType === 'concluida' &&
        ts.rollCallInfo.totalEnrolled > 0
    ).length;

    // Card "Alunos Ativos":
    // Regra Geral: O card deve somar o total de alunos presentes de todas as turmas que possuem qualquer
    // atividade em andamento no minuto atual, independentemente de a atividade ser de Grade Geral / Rotina Coletiva
    // (ex: Acolhimento, Almoço, Parquinho) ou de Atividade Extracurricular.
    // Desconto de Saídas: Desconsidere alunos que registraram saída antecipada no dia.
    const saidaAntecipadaStudentIds = new Set<string>();
    records.forEach((r) => {
      if (r.date === selectedDate && (r.status === 'saida_antecipada' || !!r.exitTime)) {
        saidaAntecipadaStudentIds.add(r.studentId);
      }
    });

    const absentRoutineStudentIds = new Set<string>();
    records.forEach((r) => {
      if (
        r.date === selectedDate &&
        (r.status === 'falta' || r.status === 'saude') &&
        isRoutineActivity(r.activity)
      ) {
        absentRoutineStudentIds.add(r.studentId);
      }
    });

    const activePresentStudentIds = new Set<string>();

    turmaStatuses.forEach((ts) => {
      if (!ts.activeBlock) return;

      const enrolled = ts.rollCallInfo?.enrolledStudents || [];

      enrolled.forEach((student) => {
        // Desconto de Saídas: desconsidera quem registrou saída antecipada no dia
        if (saidaAntecipadaStudentIds.has(student.id)) {
          return;
        }

        // Desconsidera faltas / atestados do dia na rotina geral
        if (absentRoutineStudentIds.has(student.id)) {
          return;
        }

        // Verifica se há registro desta atividade específica
        const actRec = records.find(
          (r) =>
            r.date === selectedDate &&
            r.turma === ts.turmaName &&
            (r.activity === ts.activeBlock!.activityId ||
              (isRoutineActivity(ts.activeBlock!.activityId) && isRoutineActivity(r.activity))) &&
            r.studentId === student.id
        );

        if (actRec) {
          if (actRec.status === 'presente' || actRec.status === 'sem_equipamento') {
            activePresentStudentIds.add(student.id);
          }
          // Se for falta, saude ou saida_antecipada, não inclui
        } else {
          // Sem registro para a atividade específica ainda:
          // Checa se tem registro na rotina geral
          const routineRec = records.find(
            (r) =>
              r.date === selectedDate &&
              r.studentId === student.id &&
              isRoutineActivity(r.activity)
          );

          if (routineRec) {
            if (routineRec.status === 'presente' || routineRec.status === 'sem_equipamento') {
              activePresentStudentIds.add(student.id);
            }
          } else {
            // Sem nenhum registro hoje ainda: aluno ativo e agendado sem falta ou saída é considerado presente
            activePresentStudentIds.add(student.id);
          }
        }
      });
    });

    const totalStudentsInActivePeriods = activePresentStudentIds.size;

    return {
      totalTurmas,
      inActivity,
      pendingRollCalls,
      completedRollCalls,
      totalStudentsInActivePeriods,
    };
  }, [turmaStatuses, records, selectedDate, isSimulatingTime]);

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
          item.activeBlock !== null &&
          item.rollCallInfo &&
          item.rollCallInfo.requiresRollCall &&
          item.rollCallInfo.totalEnrolled > 0 &&
          item.rollCallInfo.statusType !== 'concluida'
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
    return getEnrolledStudentsForActivity(
      students,
      quickRollCallModal.turma,
      quickRollCallModal.activityId,
      effectiveDayOfWeek,
      selectedDate,
      activityMap
    );
  }, [quickRollCallModal, students, effectiveDayOfWeek, selectedDate, activityMap]);

  const quickModalRecordsMap = useMemo(() => {
    if (!quickRollCallModal) return new Map<string, AttendanceRecord>();
    const map = new Map<string, AttendanceRecord>();
    records
      .filter(
        (r) =>
          r.date === selectedDate &&
          r.turma === quickRollCallModal.turma &&
          (r.activity === quickRollCallModal.activityId ||
            (isRoutineActivity(quickRollCallModal.activityId) && isRoutineActivity(r.activity)))
      )
      .forEach((r) => map.set(r.studentId, r));
    return map;
  }, [quickRollCallModal, records, selectedDate]);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Top Panoramic Control & Live Clock Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-4.5 text-white shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Title & Live Status */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <Radio className="w-3 h-3 text-indigo-400 animate-pulse" />
                <span>MONITORAMENTO EM TEMPO REAL</span>
              </span>

              {isSimulatingTime ? (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  <span>Modo Simulação Ativo</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>Sincronizado com o Relógio</span>
                </span>
              )}
            </div>

            <h2 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center space-x-2">
              <span>Atividades do Momento nas Turmas</span>
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Visão panorâmica instantânea de todas as salas, modalidades em andamento no Colégio Crescer e status de chamada.
            </p>
          </div>

          {/* Big Clock Display & Simulation Switcher */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-slate-950/60 p-2.5 sm:p-3 rounded-xl border border-slate-800 backdrop-blur-xs">
            <div className="flex items-center space-x-2.5 pr-0 sm:pr-3 border-b sm:border-b-0 sm:border-r border-slate-800 pb-2 sm:pb-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
                <Clock className="w-5 h-5 animate-spin-slow" />
              </div>
              <div>
                <div className="text-[9px] font-extrabold uppercase tracking-widest text-indigo-300">
                  {isSimulatingTime ? 'Horário Simulado' : 'Horário Atual'}
                </div>
                <div className="text-xl sm:text-2xl font-black tracking-tight text-white font-mono flex items-baseline space-x-1">
                  <span>{effectiveCurrentTime}</span>
                  {!isSimulatingTime && (
                    <span className="text-[11px] text-slate-400 font-normal">
                      :{String(systemSeconds).padStart(2, '0')}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 font-semibold">
                  {getDayOfWeekLabel(effectiveDayOfWeek)}
                </div>
              </div>
            </div>

            {/* Simulation Controls */}
            <div className="flex flex-col justify-center space-y-1">
              <button
                type="button"
                onClick={() => setIsSimulatingTime(!isSimulatingTime)}
                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center space-x-1.5 cursor-pointer border ${
                  isSimulatingTime
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>{isSimulatingTime ? 'Tempo Real' : 'Simular Horário'}</span>
              </button>

              {isSimulatingTime && (
                <div className="flex items-center space-x-1">
                  <input
                    type="time"
                    value={simulatedTime}
                    onChange={(e) => setSimulatedTime(e.target.value)}
                    className="px-1.5 py-0.5 bg-slate-900 border border-amber-500/40 rounded text-[11px] font-mono font-bold text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <select
                    value={simulatedDay}
                    onChange={(e) => setSimulatedDay(e.target.value as DayOfWeek)}
                    className="px-1.5 py-0.5 bg-slate-900 border border-amber-500/40 rounded text-[11px] font-bold text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
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
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-amber-300">Atalhos:</span>
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
                className="px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700 transition-colors cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}

        {/* Weekend or Holiday notice in real mode */}
        {!isSimulatingTime && (isWeekendDay || holidayInfo) && (
          <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-amber-200 text-xs">
            <div className="flex items-center space-x-2">
              {holidayInfo ? (
                <Palmtree className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <CalendarOff className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span className="text-[11px]">
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
              className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-extrabold text-xs hover:bg-amber-400 transition-colors shrink-0 cursor-pointer shadow-xs"
            >
              Simular Segunda-feira
            </button>
          </div>
        )}

        {/* Quick Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 mt-3.5 pt-3.5 border-t border-slate-800">
          <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total de Turmas</div>
            <div className="text-lg sm:text-xl font-black text-white mt-0.5">{stats.totalTurmas}</div>
            <div className="text-[9px] text-slate-400 mt-0.5">Cadastradas no sistema</div>
          </div>

          <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
            <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Em Atividade Agora</div>
            <div className="text-lg sm:text-xl font-black text-indigo-300 mt-0.5">{stats.inActivity}</div>
            <div className="text-[9px] text-indigo-400/80 mt-0.5">Com horário em curso</div>
          </div>

          <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
            <div className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Chamadas Pendentes</div>
            <div className="text-lg sm:text-xl font-black text-rose-300 mt-0.5">{stats.pendingRollCalls}</div>
            <div className="text-[9px] text-rose-400/80 mt-0.5">Aguardando registro</div>
          </div>

          <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
            <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Alunos Ativos</div>
            <div className="text-lg sm:text-xl font-black text-emerald-300 mt-0.5">
              {stats.totalStudentsInActivePeriods}
            </div>
            <div className="text-[9px] text-emerald-400/80 mt-0.5">Presentes em atividades agora</div>
          </div>
        </div>
      </div>

      {/* Aviso de Saída Customizada / Antecipada */}
      <DepartureAlertBanner
        alerts={activeDepartureAlerts}
        onDismiss={(alertId) =>
          setActiveDepartureAlerts((prev) => prev.filter((a) => a.id !== alertId))
        }
        onDismissAll={() => setActiveDepartureAlerts([])}
      />

      {/* Filter, Search and Quadro de Atribuições Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs space-y-2.5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por turma, modalidade, sala ou professor..."
              className="w-full pl-8.5 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Scope filter for Monitoras */}
          {userAssignedTurmas.size > 0 && !isCoord && (
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 text-xs font-bold shrink-0 self-start md:self-auto">
              <button
                type="button"
                onClick={() => setTurmaScopeFilter('minhas')}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  turmaScopeFilter === 'minhas'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Minha Turma
              </button>
              <button
                type="button"
                onClick={() => setTurmaScopeFilter('todas')}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  turmaScopeFilter === 'todas'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todas as Turmas
              </button>
            </div>
          )}

          {/* Activity Dropdown */}
          <div className="w-full md:w-56">
            <select
              value={selectedActivityFilter}
              onChange={(e) => setSelectedActivityFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="TODAS">Todas as Atividades</option>
              {activitiesList.map((act) => (
                <option key={act.id} value={act.id}>
                  {act.name} {act.requiresRollCall !== false ? '(Chamada)' : '(Grade)'}
                </option>
              ))}
            </select>
          </div>

          {/* Button: Quadro Geral de Atribuições */}
          <button
            type="button"
            onClick={() => setIsQuadroModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold flex items-center justify-center space-x-1.5 transition-all shadow-xs shrink-0 cursor-pointer"
            title="Abrir Quadro Geral de Atribuições das Turmas e Apoio"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Quadro de Atribuições</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-800/60 text-amber-100 uppercase tracking-wider font-black">
              Sua ADI
            </span>
          </button>

          {/* Button / Indicator: Configuração de Aviso de Saída */}
          {isCoord ? (
            <button
              type="button"
              onClick={() => setIsAlertModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-xs font-extrabold flex items-center justify-center space-x-1.5 transition-all shadow-2xs shrink-0 cursor-pointer"
              title="Configurar minutos de antecedência do aviso sonoro de saída customizada"
            >
              <Bell className="w-3.5 h-3.5 text-indigo-600" />
              <span>Aviso Saída:</span>
              <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-black">
                {alertSettings.alertMinutes} min
              </span>
            </button>
          ) : (
            <div
              className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-bold flex items-center space-x-1.5 shrink-0"
              title="Aviso sonoro automático configurado para saídas customizadas"
            >
              <Bell className="w-3.5 h-3.5 text-amber-600" />
              <span>Saída: {alertSettings.alertMinutes} min antes</span>
            </div>
          )}
        </div>

        {/* Status Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 mr-1 flex items-center space-x-1">
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
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer border ${
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

      {/* Grid of Class Cards (3-4 columns for desktop & compact density) */}
      {filteredTurmas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-xs space-y-2.5">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <Search className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-extrabold text-slate-800">Nenhuma turma encontrada</h3>
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
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Limpar Filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-3.5">
          {filteredTurmas.map((item) => {
            const { turmaName, activeBlock, nextBlock, rollCallInfo } = item;
            const actDetails = activeBlock ? activityMap.get(activeBlock.activityId) : null;
            const nextActDetails = nextBlock ? activityMap.get(nextBlock.activityId) : null;
            const turmaAtribuicao = resolveAtribuicaoForTurma(turmaName, atribuicoesList, users);

            const isClassActive = activeBlock !== null;

            // Busca os planos correspondentes do Semanário Pedagógico para hoje
            const activePlan = findMatchingSemanarioPlan(
              todaySemanarioPlans,
              turmaName,
              selectedDate,
              activeBlock
            );
            const nextPlan = findMatchingSemanarioPlan(
              todaySemanarioPlans,
              turmaName,
              selectedDate,
              nextBlock
            );

            return (
              <div
                key={turmaName}
                className={`rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-xs hover:shadow-md ${
                  isClassActive
                    ? 'bg-white border-indigo-200 ring-1 ring-indigo-500/20'
                    : 'bg-slate-50/70 border-slate-200 opacity-90 hover:opacity-100'
                }`}
              >
                {/* Card Top: Turma Header */}
                <div
                  className={`px-3.5 py-2.5 border-b flex items-center justify-between ${
                    isClassActive
                      ? 'bg-gradient-to-r from-indigo-900 to-slate-900 text-white border-slate-800'
                      : 'bg-slate-100/80 text-slate-800 border-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 shadow-xs ${
                        isClassActive
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-xs sm:text-sm leading-tight truncate">
                        {turmaName}
                      </h3>
                      <p
                        className={`text-[10px] font-semibold truncate ${
                          isClassActive ? 'text-indigo-300' : 'text-slate-500'
                        }`}
                      >
                        {item.turmaBlocks.length} horários cadastrados
                      </p>
                    </div>
                  </div>

                  {/* Active vs Idle Tag */}
                  {isClassActive ? (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Em Andamento</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200/80 text-slate-600 border border-slate-300/80 shrink-0">
                      <span>Sem Atividade</span>
                    </span>
                  )}
                </div>

                {/* Card Body: Active Activity or Idle Message */}
                <div className="p-3 sm:p-3.5 space-y-2.5 flex-1 flex flex-col justify-between">
                  {isClassActive && activeBlock ? (
                    <div className="space-y-2.5">
                      {/* Activity Name & Icon */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center space-x-2 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-inner">
                            {renderActivityIconOrImage(
                              actDetails?.icon,
                              actDetails?.customIconUrl,
                              'w-4 h-4',
                              activeBlock.activityId
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                              Momento
                            </div>
                            <div className="text-xs sm:text-sm font-black text-slate-900 leading-tight truncate">
                              {activeBlock.activityId}
                            </div>
                          </div>
                        </div>

                        {/* Time interval chip */}
                        <div className="text-right shrink-0">
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Clock className="w-2.5 h-2.5 text-indigo-500" />
                            <span>
                              {activeBlock.startTime} - {activeBlock.endTime}
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* Location & Guidelines */}
                      <div className="space-y-1 bg-slate-50 rounded-xl p-2 border border-slate-100 text-[11px]">
                        <div className="flex items-center space-x-1.5 text-slate-700 font-semibold truncate">
                          <MapPin className="w-3 h-3 text-indigo-600 shrink-0" />
                          <span className="text-slate-400">Local:</span>
                          <span className="font-bold text-slate-900 truncate">
                            {activeBlock.location || 'Local da Turma'}
                          </span>
                        </div>

                        {activeBlock.guidelines && (
                          <div className="flex items-start space-x-1.5 text-slate-600 pt-1 border-t border-slate-200/60 text-[10px] leading-snug">
                            <FileText className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                            <span className="italic line-clamp-2">{activeBlock.guidelines}</span>
                          </div>
                        )}
                      </div>

                      {/* Bloco Pedagógico do Semanário (Planejamento para este horário) */}
                      <div className="rounded-xl border p-2.5 transition-all space-y-2 bg-gradient-to-br from-indigo-50/60 via-white to-purple-50/30 border-indigo-100/90 shadow-2xs">
                        {/* Cabeçalho do Bloco */}
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center space-x-1.5 min-w-0">
                            <div className="w-5 h-5 rounded-md bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                              <BookOpen className="w-3 h-3" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-950 truncate">
                              Planejamento do Semanário
                            </span>
                          </div>

                          {/* Badges de Status / Substituição */}
                          {activePlan ? (
                            activePlan.status === 'substituida' ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                                <AlertCircle className="w-3 h-3 text-amber-700" />
                                <span>Substituição</span>
                              </span>
                            ) : activePlan.status === 'realizada' ? (
                              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Realizada</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 shrink-0">
                                <Sparkles className="w-3 h-3 text-indigo-600" />
                                <span>Planejado</span>
                              </span>
                            )
                          ) : null}
                        </div>

                        {/* Conteúdo do Plano ou Mensagem de Nenhum Planejamento */}
                        {activePlan ? (
                          <div className="space-y-1.5">
                            <div className="space-y-0.5">
                              <div className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                                {activePlan.title}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                                {activePlan.category && (
                                  <span className="font-semibold text-indigo-700 bg-white px-1.5 py-0.2 rounded border border-indigo-100">
                                    {activePlan.category}
                                  </span>
                                )}
                                {(activePlan.adiResponsible || activePlan.teacherName) && (
                                  <span className="text-slate-500 font-medium truncate">
                                    <span className="text-slate-400">Resp./ADI:</span>{' '}
                                    <strong className="text-slate-700">{activePlan.adiResponsible || activePlan.teacherName}</strong>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Alerta de Motivo da Substituição quando houver */}
                            {activePlan.status === 'substituida' && activePlan.substitutionReason && (
                              <div className="bg-amber-50 border border-amber-200/90 rounded-lg p-2 text-[10px] text-amber-900 leading-tight space-y-0.5">
                                <div className="font-extrabold flex items-center gap-1 text-amber-950">
                                  <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>Motivo da Substituição:</span>
                                </div>
                                <p className="italic text-amber-800">{activePlan.substitutionReason}</p>
                              </div>
                            )}

                            {/* Botão Ver Mais / Ver Menos Detalhes Pedagógicos */}
                            {(activePlan.objectives || activePlan.materials || activePlan.development) && (
                              <div>
                                <button
                                  type="button"
                                  onClick={() => togglePlanExpanded(turmaName)}
                                  className="w-full mt-1 py-1 px-2 rounded-lg bg-white hover:bg-indigo-50/80 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold transition-colors flex items-center justify-between cursor-pointer shadow-2xs"
                                >
                                  <span className="flex items-center space-x-1">
                                    <FileText className="w-3 h-3 text-indigo-500" />
                                    <span>
                                      {expandedPlanTurmas[turmaName]
                                        ? 'Ocultar Detalhes Pedagógicos'
                                        : 'Ver Objetivos & Materiais'}
                                    </span>
                                  </span>
                                  {expandedPlanTurmas[turmaName] ? (
                                    <ChevronUp className="w-3 h-3 text-indigo-600" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3 text-indigo-600" />
                                  )}
                                </button>

                                {/* Área Expandida com Objetivos BNCC, Materiais e Desenvolvimento */}
                                {expandedPlanTurmas[turmaName] && (
                                  <div className="mt-1.5 space-y-1.5 pt-1 border-t border-indigo-100 text-[10px]">
                                    {activePlan.objectives && (
                                      <div className="bg-white/90 rounded-lg p-2 border border-slate-200 space-y-0.5">
                                        <div className="font-extrabold text-slate-800 flex items-center gap-1">
                                          <Target className="w-3 h-3 text-indigo-600 shrink-0" />
                                          <span>Objetivos de Aprendizagem & BNCC:</span>
                                        </div>
                                        <p className="text-slate-600 leading-relaxed whitespace-pre-line">
                                          {activePlan.objectives}
                                        </p>
                                      </div>
                                    )}

                                    {activePlan.materials && (
                                      <div className="bg-white/90 rounded-lg p-2 border border-slate-200 space-y-0.5">
                                        <div className="font-extrabold text-slate-800 flex items-center gap-1">
                                          <Package className="w-3 h-3 text-amber-600 shrink-0" />
                                          <span>Recursos & Materiais Necessários:</span>
                                        </div>
                                        <p className="text-slate-600 leading-relaxed whitespace-pre-line">
                                          {activePlan.materials}
                                        </p>
                                      </div>
                                    )}

                                    {activePlan.development && (
                                      <div className="bg-white/90 rounded-lg p-2 border border-slate-200 space-y-0.5">
                                        <div className="font-extrabold text-slate-800 flex items-center gap-1">
                                          <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
                                          <span>Passo a Passo / Desenvolvimento:</span>
                                        </div>
                                        <p className="text-slate-600 leading-relaxed whitespace-pre-line">
                                          {activePlan.development}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2 py-1.5 px-2 rounded-lg bg-white/70 border border-slate-200/70 text-[10px] text-slate-400">
                            <BookOpen className="w-3 h-3 text-slate-300 shrink-0" />
                            <span className="italic">Nenhum planejamento cadastrado para este horário</span>
                          </div>
                        )}
                      </div>

                      {/* Roll Call Status Section */}
                      {rollCallInfo && (
                        <div>
                          {rollCallInfo.requiresRollCall ? (
                            <div className="rounded-xl border p-2.5 space-y-2 transition-all bg-white shadow-2xs border-slate-200">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-1.5 min-w-0">
                                  {rollCallInfo.statusType === 'concluida' ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  ) : rollCallInfo.statusType === 'parcial' ? (
                                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  ) : (
                                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                  )}
                                  <span className="text-[11px] font-black text-slate-800 truncate">
                                    {rollCallInfo.statusType === 'concluida'
                                      ? 'Chamada Concluída'
                                      : rollCallInfo.statusType === 'parcial'
                                      ? 'Chamada Parcial'
                                      : 'Chamada Pendente'}
                                  </span>
                                </div>

                                <span
                                  className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full border shrink-0 ${
                                    rollCallInfo.statusType === 'concluida'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : rollCallInfo.statusType === 'parcial'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                  }`}
                                >
                                  {rollCallInfo.recordedCount}/{rollCallInfo.totalEnrolled} Alunos
                                </span>
                              </div>

                              {/* Progress bar */}
                              {rollCallInfo.totalEnrolled > 0 && (
                                <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
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
                              <div className="flex items-center space-x-1.5 pt-0.5">
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
                                    className="flex-1 py-1 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] shadow-2xs transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                                  >
                                    <ClipboardCheck className="w-3 h-3" />
                                    <span>
                                      {rollCallInfo.statusType === 'concluida'
                                        ? 'Revisar'
                                        : 'Chamada'}
                                    </span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    const collab = findResponsibleCollaborator({
                                      users,
                                      turmaName,
                                      activityName: activeBlock.activityId,
                                      targetUserId: (activeBlock as any).teacherId || (activeBlock as any).monitorId,
                                    });
                                    setWhatsAppModalData({
                                      isOpen: true,
                                      turmaName,
                                      activityName: activeBlock.activityId,
                                      startTime: activeBlock.startTime,
                                      endTime: activeBlock.endTime,
                                      location: activeBlock.location,
                                      guidelines: activeBlock.guidelines,
                                      targetUserId: collab?.id,
                                      targetUserEmail: collab?.email,
                                      targetUserName: collab?.name,
                                    });
                                  }}
                                  className="py-1 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold transition-colors cursor-pointer flex items-center space-x-1"
                                  title="Avisar Monitora via WhatsApp"
                                >
                                  <MessageSquare className="w-3 h-3 text-emerald-600" />
                                  <span>Avisar</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    onNavigateToAttendance(activeBlock.activityId, turmaName, selectedDate)
                                  }
                                  title="Abrir na Ficha de Chamada Completa"
                                  className="py-1 px-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-[11px] font-bold transition-colors cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-slate-100/70 rounded-lg p-2 border border-slate-200 text-slate-500 text-[10px] font-semibold flex items-center justify-between gap-1.5">
                              <div className="flex items-center space-x-1.5 truncate">
                                <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
                                <span className="truncate">Grade Geral / Rotina Coletiva</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const collab = findResponsibleCollaborator({
                                    users,
                                    turmaName,
                                    activityName: activeBlock.activityId,
                                    targetUserId: (activeBlock as any).teacherId || (activeBlock as any).monitorId,
                                  });
                                  setWhatsAppModalData({
                                    isOpen: true,
                                    turmaName,
                                    activityName: activeBlock.activityId,
                                    startTime: activeBlock.startTime,
                                    endTime: activeBlock.endTime,
                                    location: activeBlock.location,
                                    guidelines: activeBlock.guidelines,
                                    targetUserId: collab?.id,
                                    targetUserEmail: collab?.email,
                                    targetUserName: collab?.name,
                                  });
                                }}
                                className="py-0.5 px-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[9px] font-bold transition-colors cursor-pointer flex items-center space-x-1 shrink-0"
                                title="Avisar Monitora via WhatsApp"
                              >
                                <MessageSquare className="w-2.5 h-2.5 text-emerald-600" />
                                <span>Avisar</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Idle state */
                    <div className="py-4 px-2 text-center space-y-1.5 bg-white rounded-xl border border-slate-200/80">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                        <Clock className="w-4 h-4 text-slate-400" />
                      </div>
                      <div className="text-[11px] font-bold text-slate-700">Sem atividade agora</div>
                      <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-tight">
                        Intervalo ou aguardando próximo horário.
                      </p>
                    </div>
                  )}

                  {/* Next upcoming activity block */}
                  <div className="pt-2 border-t border-slate-200/80">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center space-x-1">
                      <ArrowRight className="w-2.5 h-2.5" />
                      <span>Próxima:</span>
                    </div>

                    {nextBlock ? (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100/90 border border-slate-200 text-[11px]">
                        <div className="flex items-center space-x-1.5 min-w-0">
                          <div className="w-5 h-5 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                            {renderActivityIconOrImage(
                              nextActDetails?.icon,
                              nextActDetails?.customIconUrl,
                              'w-3 h-3',
                              nextBlock.activityId
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="font-extrabold text-slate-800 truncate block text-[11px] leading-tight">
                              {nextBlock.activityId}
                            </span>
                            {nextBlock.location && (
                              <span className="text-[9px] text-slate-500 font-semibold truncate block">
                                {nextBlock.location}
                              </span>
                            )}
                            {nextPlan && (
                              <div className="mt-0.5 flex items-center space-x-1 text-[9px] text-indigo-800 bg-indigo-50/80 rounded px-1.5 py-0.5 border border-indigo-100/80 max-w-full">
                                <BookOpen className="w-2.5 h-2.5 shrink-0 text-indigo-600" />
                                <span className="font-bold truncate">Plano: {nextPlan.title}</span>
                                {nextPlan.status === 'substituida' && (
                                  <span className="text-[8px] font-black text-amber-900 bg-amber-100 px-1 rounded-2xs shrink-0">
                                    Subst.
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-1 shrink-0">
                          <span className="font-bold text-indigo-700 text-[10px] bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                            {nextBlock.startTime} - {nextBlock.endTime}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const collab = findResponsibleCollaborator({
                                users,
                                turmaName,
                                activityName: nextBlock.activityId,
                                targetUserId: (nextBlock as any).teacherId || (nextBlock as any).monitorId,
                              });
                              setWhatsAppModalData({
                                isOpen: true,
                                turmaName,
                                activityName: nextBlock.activityId,
                                startTime: nextBlock.startTime,
                                endTime: nextBlock.endTime,
                                location: nextBlock.location,
                                guidelines: nextBlock.guidelines,
                                targetUserId: collab?.id,
                                targetUserEmail: collab?.email,
                                targetUserName: collab?.name,
                              });
                            }}
                            className="p-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
                            title="Avisar Monitora da Próxima Atividade via WhatsApp"
                          >
                            <MessageSquare className="w-3 h-3 text-emerald-600" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic py-0.5">
                        Grade do dia finalizada para esta turma.
                      </div>
                    )}
                  </div>

                  {/* Bloco de Atribuição e Apoio Rápido: Sua ADI & Monitora */}
                  <div className="mt-2 pt-2 border-t border-slate-200/80">
                    <div className="bg-gradient-to-r from-amber-50/90 to-orange-50/70 border border-amber-200/90 rounded-xl p-2 space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center space-x-1.5 min-w-0">
                          <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider shrink-0">
                            Sua ADI:
                          </span>
                          <span className="text-xs font-black text-amber-950 truncate" title={turmaAtribuicao.adiName}>
                            {turmaAtribuicao.adiName}
                          </span>
                        </div>

                        {/* WhatsApp Fast Actions */}
                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => triggerApoioDirectWhatsApp(turmaAtribuicao.adiName, turmaAtribuicao.adiPhone, turmaName, 'adi')}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs active:scale-95 transition-all cursor-pointer"
                            title={`WhatsApp 1-Clique para ${turmaAtribuicao.adiName}: "Olá, ${getFirstName(turmaAtribuicao.adiName)}! Preciso do seu apoio."`}
                          >
                            <Send className="w-2.5 h-2.5" />
                            <span>1-Clique</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setApoioModalState({
                                isOpen: true,
                                destinatarioRole: 'adi',
                                destinatarioName: turmaAtribuicao.adiName,
                                destinatarioPhone: turmaAtribuicao.adiPhone || '',
                                turmaName,
                              })
                            }
                            className="p-1 rounded-lg text-emerald-800 hover:bg-emerald-100 border border-emerald-300 bg-white transition-colors cursor-pointer"
                            title="Personalizar mensagem no seu estilo próprio antes de enviar"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Monitora da Turma e Vice-Versa */}
                      <div className="flex items-center justify-between pt-1 border-t border-amber-200/60 text-[10px]">
                        <div className="flex items-center space-x-1 text-slate-600 truncate min-w-0 pr-1">
                          <span className="font-bold text-slate-500 shrink-0">Monitora:</span>
                          <span className="font-semibold text-slate-800 truncate">{turmaAtribuicao.monitoraName}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => triggerApoioDirectWhatsApp(turmaAtribuicao.monitoraName, turmaAtribuicao.monitoraPhone, turmaName, 'monitora')}
                          className="text-slate-600 hover:text-emerald-700 font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                          title={`Falar com Monitora (${turmaAtribuicao.monitoraName}) no WhatsApp`}
                        >
                          <Phone className="w-2.5 h-2.5 text-emerald-600" />
                          <span>Falar c/ Monitora</span>
                        </button>
                      </div>
                    </div>
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
          targetUserId={whatsAppModalData.targetUserId}
          targetUserEmail={whatsAppModalData.targetUserEmail}
          targetUserName={whatsAppModalData.targetUserName}
          onUpdateUserPhone={onUpdateUserPhone}
        />
      )}

      {/* Quadro Geral de Atribuições Modal */}
      <QuadroAtribuicoesModal
        isOpen={isQuadroModalOpen}
        onClose={() => setIsQuadroModalOpen(false)}
        atribuicoes={atribuicoesList}
        users={users}
        currentUser={currentUser}
        onSaveAtribuicao={handleSaveAtribuicaoItem}
        onBatchSaveAtribuicoes={onBatchSaveAtribuicoes}
      />

      {/* Configuração de Aviso de Saída Modal */}
      <DepartureAlertModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        currentSettings={alertSettings}
        currentUser={currentUser}
        onSettingsUpdated={(newSettings) => setAlertSettings(newSettings)}
      />

      {/* Apoio WhatsApp Custom Message Modal */}
      <ApoioWhatsAppModal
        isOpen={apoioModalState.isOpen}
        onClose={() => setApoioModalState((prev) => ({ ...prev, isOpen: false }))}
        destinatarioRole={apoioModalState.destinatarioRole}
        destinatarioName={apoioModalState.destinatarioName}
        destinatarioPhone={apoioModalState.destinatarioPhone}
        turmaName={apoioModalState.turmaName}
        onUpdatePhone={(newPhone) => {
          const target = atribuicoesList.find((a) => a.turma === apoioModalState.turmaName);
          if (target) {
            const updated = { ...target };
            if (apoioModalState.destinatarioRole === 'adi') {
              updated.adiPhone = newPhone;
            } else {
              updated.monitoraPhone = newPhone;
            }
            handleSaveAtribuicaoItem(updated);
          }
        }}
      />
    </div>
  );
};
