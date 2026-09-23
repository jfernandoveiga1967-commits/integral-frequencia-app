// Programa do Integral - Colégio Crescer: Aplicação Principal
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ShieldCheck, GraduationCap, UserCheck, ArrowRight, ChevronDown, ChevronUp, AlertTriangle, X, Search, CheckCircle, Calendar, UserX, Lock, ShieldAlert } from 'lucide-react';
import { Student, AttendanceRecord, ActivityType, TurmaType, WeekInfo, UserProfile, UserRole, ActivityItem, ScheduleBlock, HolidayItem, PontoRecord, PontoMonthClosing, DayOfWeek, SemanarioPlan, TurmaAtribuicao } from './types';
import { INITIAL_HOLIDAYS, ACTIVITIES_LIST, INITIAL_STUDENTS, TURMAS_LIST } from './data/initialData';
import {
  loadStudents,
  saveStudents,
  fetchStudents,
  removeStudentFromLocalStorage,
  markStudentAsDeleted,
  normalizeStudent,
  mergeStudentData,
  mergeStudentsList,
  loadAttendanceRecords,
  saveAttendanceRecords,
  loadTurmas,
  saveTurmas,
  loadActivities,
  saveActivities,
  loadSchedules,
  saveSchedules,
  loadHolidays,
  saveHolidays,
  loadPontoRecords,
  savePontoRecords,
  loadPontoClosings,
  savePontoClosings,
  loadSemanarioPlans,
  saveSemanarioPlans,
  resetAllData,
  isMockStudent,
  checkAndInactivateExpiredTemporaryStudents,
} from './utils/storageUtils';
import { loadLocalQuadroAtribuicoes, saveLocalQuadroAtribuicoes, reconcileAtribuicoesWithTurmas, generateTurmaAtribuicaoId } from './utils/atribuicoesStorage';
import { getISOWeekNumber, getWeekInfo, toISODateString, formatDateBR, formatDiasFrequencia } from './utils/dateUtils';
import { sortTurmasPedagogical } from './utils/turmaUtils';
import { getDailyConsolidatedMetrics } from './utils/frequenciaUtils';
import { getStoredUser, saveStoredUser, getLocalUsersList, saveLocalUsersList, normalizeAndDeduplicateUsers, ADMIN_EMAIL, PRESET_USERS, isCoordenador, isTabAllowed, getUserAllowedTabs } from './utils/authUtils';
import { Header, TabType } from './components/Header';
import { Footer } from './components/Footer';
import { AttendanceSheet } from './components/AttendanceSheet';
import { CurrentActivities } from './components/CurrentActivities';
import { StudentManager } from './components/StudentManager';
import { WeeklyReport } from './components/WeeklyReport';
import { WeeklyLibrary } from './components/WeeklyLibrary';
import { UserManagement } from './components/UserManagement';
import { LivroPonto } from './components/LivroPonto';
import { SemanarioMain } from './components/Semanario/SemanarioMain';
import { CardapioCulinaria } from './components/CardapioCulinaria';
import { LoginScreen } from './components/LoginScreen';
import { useWebPushNotifications } from './hooks/useWebPushNotifications';
import {
  subscribeStudents,
  subscribeRecords,
  subscribeDashboardRecords,
  subscribeTurmas,
  subscribeUsers,
  subscribeActivities,
  subscribeToSchedules,
  subscribeHolidays,
  subscribePontoRecords,
  savePontoRecordToFirestore,
  batchSavePontoRecordsToFirestore,
  subscribePontoClosings,
  savePontoClosingToFirestore,
  subscribeSemanarioPlans,
  subscribeTodaySemanarioPlans,
  saveSemanarioPlanToFirestore,
  deleteSemanarioPlanFromFirestore,
  batchSaveSemanarioPlansToFirestore,
  subscribeQuadroAtribuicoes,
  saveTurmaAtribuicaoToFirestore,
  batchSaveQuadroAtribuicoesToFirestore,
  deleteTurmaAtribuicaoFromFirestore,
  saveStudentToFirestore,
  deleteStudentFromFirestore,
  saveRecordToFirestore,
  deleteAttendanceRecordFromFirestore,
  batchSaveRecordsToFirestore,
  batchDeleteAttendanceRecordsFromFirestore,
  reconnectFirestore,
  processAttendanceOutbox,
  saveTurmaToFirestore,
  deleteTurmaFromFirestore,
  saveUserToFirestore,
  deleteUserFromFirestore,
  fetchAllUsersDirectFromServer,
  saveActivityToFirestore,
  deleteActivityFromFirestore,
  saveScheduleBlockToFirestore,
  deleteScheduleBlockFromFirestore,
  saveAllSchedulesToFirestore,
  batchSyncSchedulesToFirestore,
  saveHolidayToFirestore,
  deleteHolidayFromFirestore,
  batchSaveHolidaysToFirestore,
  testFirestoreConnection,
  getIsFirestoreQuotaExceeded,
  deleteDoc,
  doc,
  db,
} from './firebase';
import {
  broadcastSyncEvent,
  subscribeToSyncEvents,
  initConnectivityMonitor,
  subscribeConnectionStatus,
  forceManualSync,
  ConnectionState,
} from './services/syncService';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => getStoredUser());
  const [users, setUsers] = useState<UserProfile[]>(() => getLocalUsersList());
  const [activitiesList, setActivitiesList] = useState<ActivityItem[]>(() => loadActivities());
  const [schedules, setSchedules] = useState<ScheduleBlock[]>(() => loadSchedules());
  const [holidays, setHolidays] = useState<HolidayItem[]>(() => loadHolidays());
  const [students, setStudents] = useState<Student[]>(() => {
    const local = loadStudents().filter((s) => !isMockStudent(s));
    return local.length > 0 ? local : INITIAL_STUDENTS.map((s) => normalizeStudent(s));
  });
  const [records, setRecords] = useState<AttendanceRecord[]>(() => loadAttendanceRecords());
  const [turmas, setTurmas] = useState<string[]>(() => {
    const local = loadTurmas();
    return local.length > 0 ? sortTurmasPedagogical(local) : sortTurmasPedagogical(TURMAS_LIST);
  });
  const [pontoRecords, setPontoRecords] = useState<PontoRecord[]>(() => loadPontoRecords());
  const [pontoClosings, setPontoClosings] = useState<PontoMonthClosing[]>(() => loadPontoClosings());
  const [semanarioPlans, setSemanarioPlans] = useState<SemanarioPlan[]>(() => loadSemanarioPlans());
  const [quadroAtribuicoes, setQuadroAtribuicoes] = useState<TurmaAtribuicao[]>(() => loadLocalQuadroAtribuicoes());
  const [activeTab, setActiveTab] = useState<TabType>('momento');
  const [firebaseConnected, setFirebaseConnected] = useState<boolean>(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'synced',
    isOnline: true,
    lastSyncTime: Date.now(),
    pendingOutboxCount: 0,
  });

  // Keep a stable ref of currentUser for real-time listener updates
  const currentUserRef = useRef<UserProfile | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const handleLogin = (user: UserProfile) => {
    const isMasterAdmin =
      (user.email || '').trim().toLowerCase() === 'jfernandoveiga1967@gmail.com' ||
      user.id === 'usr_coord_1';
    const finalUser = isMasterAdmin
      ? {
          ...user,
          name: 'Fernando Veiga',
          email: 'jfernandoveiga1967@gmail.com',
          role: 'coordenador' as UserRole,
          cargoLabel: 'Coordenador (Administrador)',
          avatarColor: 'bg-amber-500',
          canManageStudents: true,
          canMarkAttendance: true,
        }
      : user;
    setCurrentUser(finalUser);
    saveStoredUser(finalUser);

    if (!isTabAllowed(activeTab, finalUser)) {
      const allowed = getUserAllowedTabs(finalUser);
      if (allowed.length > 0) {
        setActiveTab(allowed[0]);
      }
    }

    // Verificação de expiração de contratos avulsos ao realizar login
    const currentStudents = loadStudents();
    const { updatedStudents: postLoginStudents, inactivatedStudents: loginInactivated } =
      checkAndInactivateExpiredTemporaryStudents(currentStudents);
    if (loginInactivated.length > 0) {
      setStudents(postLoginStudents);
      saveStudents(postLoginStudents);
      loginInactivated.forEach((st) => {
        saveStudentToFirestore(st).catch((err) =>
          console.error('Erro ao salvar inativação automática no login:', err)
        );
      });
    }

    // Redirect user to appropriate initial tab:
    // If current tab is not in allowed tabs, direct to the first allowed tab
    if (finalUser.role !== 'coordenador') {
      const allowed = getUserAllowedTabs(finalUser);
      if (allowed.length > 0 && !allowed.includes(activeTab)) {
        setActiveTab(allowed[0]);
      }
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    saveStoredUser(null);
    setActiveTab('momento');
  };

  // Route protection: ensure non-coordenador cannot stay on restricted tabs
  useEffect(() => {
    if (currentUser && !isCoordenador(currentUser)) {
      if (!isTabAllowed(activeTab, currentUser)) {
        const allowed = getUserAllowedTabs(currentUser);
        if (allowed.length > 0) {
          setActiveTab(allowed[0]);
        }
      }
    }
  }, [currentUser, activeTab]);

  // Initial week and date setup
  const initialDateObj = new Date();
  const { year: initialYear, weekNumber: initialWeekNo } = getISOWeekNumber(initialDateObj);
  
  const [currentWeek, setCurrentWeek] = useState<WeekInfo>(() =>
    getWeekInfo(initialYear, initialWeekNo)
  );
  
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    toISODateString(initialDateObj)
  );
  const todayStr = useMemo(() => toISODateString(new Date()), []);

  // Load initial local data & sync with Firebase Firestore real-time listeners
  useEffect(() => {
    const rawLoadedStudents = loadStudents();
    const { updatedStudents: loadedStudents, inactivatedStudents: initInactivated } =
      checkAndInactivateExpiredTemporaryStudents(rawLoadedStudents);
    const loadedRecords = loadAttendanceRecords();
    const loadedTurmas = sortTurmasPedagogical(loadTurmas());
    setStudents(loadedStudents);
    if (initInactivated.length > 0) {
      saveStudents(loadedStudents);
    }
    setRecords(loadedRecords);
    setTurmas(loadedTurmas);

    // Test Firestore connectivity & flush any pending outbox queue
    testFirestoreConnection().then((connected) => {
      setFirebaseConnected(connected);
      if (connected) {
        processAttendanceOutbox().catch(() => {});
      }
    });

    // Initialize cross-tab sync & background connectivity engine
    const cleanupConnectivity = initConnectivityMonitor();
    const unsubStatus = subscribeConnectionStatus((statusState) => {
      setConnectionState(statusState);
      setFirebaseConnected(statusState.isOnline && statusState.status !== 'offline');
    });

    const unsubCrossTabSync = subscribeToSyncEvents((message) => {
      switch (message.type) {
        case 'SYNC_ATTENDANCE_RECORDS': {
          const payloadRecords = message.payload as AttendanceRecord[];
          if (Array.isArray(payloadRecords)) {
            setRecords(payloadRecords);
            saveAttendanceRecords(payloadRecords);
          }
          break;
        }
        case 'SYNC_ATTENDANCE_RECORD_UPSERT': {
          const rec = message.payload as AttendanceRecord;
          if (rec && rec.id) {
            setRecords((prev) => {
              const filtered = prev.filter((r) => r.id !== rec.id);
              const updated = [rec, ...filtered];
              saveAttendanceRecords(updated);
              return updated;
            });
          }
          break;
        }
        case 'SYNC_ATTENDANCE_RECORDS_DELETE': {
          const deletedIds = new Set(message.payload as string[]);
          setRecords((prev) => {
            const updated = prev.filter((r) => !deletedIds.has(r.id));
            saveAttendanceRecords(updated);
            return updated;
          });
          break;
        }
        case 'SYNC_STUDENTS': {
          const updatedStudents = message.payload as Student[];
          if (Array.isArray(updatedStudents)) {
            setStudents(updatedStudents);
            saveStudents(updatedStudents);
          }
          break;
        }
        case 'SYNC_SCHEDULES': {
          const updatedSchedules = message.payload as ScheduleBlock[];
          if (Array.isArray(updatedSchedules)) {
            setSchedules(updatedSchedules);
            saveSchedules(updatedSchedules);
          }
          break;
        }
        case 'SYNC_ACTIVITIES': {
          const updatedActivities = message.payload as ActivityItem[];
          if (Array.isArray(updatedActivities)) {
            setActivitiesList(updatedActivities);
            saveActivities(updatedActivities);
          }
          break;
        }
        case 'SYNC_TURMAS': {
          const updatedTurmas = message.payload as string[];
          if (Array.isArray(updatedTurmas)) {
            const sorted = sortTurmasPedagogical(updatedTurmas);
            setTurmas(sorted);
            saveTurmas(sorted);
          }
          break;
        }
        case 'SYNC_PONTO_RECORDS': {
          const updatedPonto = message.payload as PontoRecord[];
          if (Array.isArray(updatedPonto)) {
            setPontoRecords(updatedPonto);
            savePontoRecords(updatedPonto);
          }
          break;
        }
        case 'SYNC_PONTO_CLOSINGS': {
          const updatedClosings = message.payload as PontoMonthClosing[];
          if (Array.isArray(updatedClosings)) {
            setPontoClosings(updatedClosings);
            savePontoClosings(updatedClosings);
          }
          break;
        }
        case 'SYNC_SEMANARIO': {
          const updatedPlans = message.payload as SemanarioPlan[];
          if (Array.isArray(updatedPlans)) {
            setSemanarioPlans(updatedPlans);
            saveSemanarioPlans(updatedPlans);
          }
          break;
        }
        case 'SYNC_USERS': {
          const updatedUsers = message.payload as UserProfile[];
          if (Array.isArray(updatedUsers)) {
            setUsers(updatedUsers);
            saveLocalUsersList(updatedUsers);
          }
          break;
        }
        case 'SYNC_QUADRO_ATRIBUICOES': {
          const updatedAtribuicoes = message.payload as TurmaAtribuicao[];
          if (Array.isArray(updatedAtribuicoes)) {
            setQuadroAtribuicoes(updatedAtribuicoes);
            saveLocalQuadroAtribuicoes(updatedAtribuicoes);
          }
          break;
        }
        case 'FORCE_RESYNC': {
          const freshRecords = loadAttendanceRecords();
          if (freshRecords && freshRecords.length > 0) {
            setRecords(freshRecords);
          }
          break;
        }
      }
    });

    return () => {
      cleanupConnectivity();
      unsubStatus();
      unsubCrossTabSync();
    };
  }, []);

  const isCoord = isCoordenador(currentUser);
  const isLogged = !!currentUser;

  // Sincronização sob demanda (Zero Overhead para dispositivos móveis com conexão restrita)
  // Regra: se a aba correspondente não estiver liberada para o usuário, o listener correspondente NÃO é inicializado.
  // O coordenador possui sempre acesso irrestrito total.
  const shouldSyncStudents = isLogged && (isCoord || isTabAllowed('momento', currentUser) || isTabAllowed('frequencia', currentUser) || isTabAllowed('alunos', currentUser) || isTabAllowed('relatorio', currentUser) || isTabAllowed('biblioteca', currentUser));
  const shouldSyncTurmas = isLogged && (isCoord || isTabAllowed('momento', currentUser) || isTabAllowed('frequencia', currentUser) || isTabAllowed('alunos', currentUser) || isTabAllowed('semanario', currentUser) || isTabAllowed('relatorio', currentUser) || isTabAllowed('biblioteca', currentUser));
  const shouldSyncUsers = isLogged; // Otimização ativa: a lista de 24 usuários só é sincronizada após o login; antes do login, a autenticação faz busca pontual por e-mail no Firestore
  const shouldSyncActivities = isLogged && (isCoord || isTabAllowed('momento', currentUser) || isTabAllowed('frequencia', currentUser) || isTabAllowed('semanario', currentUser) || isTabAllowed('alunos', currentUser) || isTabAllowed('relatorio', currentUser) || isTabAllowed('usuarios', currentUser));
  const shouldSyncSchedules = isLogged && (isCoord || isTabAllowed('momento', currentUser) || isTabAllowed('frequencia', currentUser) || isTabAllowed('usuarios', currentUser));
  const shouldSyncHolidays = isLogged && (isCoord || isTabAllowed('ponto', currentUser) || isTabAllowed('semanario', currentUser) || isTabAllowed('relatorio', currentUser) || isTabAllowed('usuarios', currentUser));
  const shouldSyncPonto = isLogged && (isCoord || isTabAllowed('ponto', currentUser));
  const shouldSyncSemanario = isLogged && (isCoord || isTabAllowed('semanario', currentUser) || isTabAllowed('biblioteca', currentUser));
  const shouldSyncQuadro = isLogged && (isCoord || isTabAllowed('alunos', currentUser) || isTabAllowed('usuarios', currentUser));
  const shouldSyncRecords = isLogged && (isCoord || isTabAllowed('momento', currentUser) || isTabAllowed('frequencia', currentUser) || isTabAllowed('relatorio', currentUser) || isTabAllowed('biblioteca', currentUser));

  const hasHealedActivitiesRef = useRef(false);

  // 1. Alunos em Tempo Real
  useEffect(() => {
    if (!shouldSyncStudents) return;

    const unsubStudents = subscribeStudents((fsStudents) => {
      const realStudents = fsStudents.filter((s) => !isMockStudent(s));
      let effectiveList: Student[];
      if (realStudents.length > 0) {
        effectiveList = realStudents;
      } else {
        const currentLocal = loadStudents().filter((s) => !isMockStudent(s));
        effectiveList = currentLocal.length > 0 ? currentLocal : INITIAL_STUDENTS.map((s) => normalizeStudent(s));
      }

      const { updatedStudents: verifiedStudents, inactivatedStudents: syncInactivated } =
        checkAndInactivateExpiredTemporaryStudents(effectiveList);

      setStudents(verifiedStudents);
      saveStudents(verifiedStudents);

      if (realStudents.length > 0 && syncInactivated.length > 0) {
        syncInactivated.forEach((st) => {
          saveStudentToFirestore(st).catch(() => {});
        });
      }
    });

    return () => {
      unsubStudents();
    };
  }, [shouldSyncStudents]);

  // 2. Turmas em Tempo Real
  useEffect(() => {
    if (!shouldSyncTurmas) return;

    const unsubTurmas = subscribeTurmas((fsTurmas) => {
      if (fsTurmas.length > 0) {
        const sortedTurmas = sortTurmasPedagogical(fsTurmas);
        setTurmas(sortedTurmas);
        saveTurmas(sortedTurmas);
      }
    });

    return () => {
      unsubTurmas();
    };
  }, [shouldSyncTurmas]);

  // 3. Usuários / Colaboradores em Tempo Real & Sincronização Dinâmica de Permissões
  useEffect(() => {
    if (!shouldSyncUsers) return;

    const unsubUsers = subscribeUsers((fsUsers) => {
      let effectiveUsers: UserProfile[];
      if (fsUsers && fsUsers.length > 0) {
        effectiveUsers = normalizeAndDeduplicateUsers(fsUsers);
        setUsers(effectiveUsers);
        saveLocalUsersList(effectiveUsers);
      } else {
        const localList = getLocalUsersList();
        if (localList && localList.length > 1) {
          effectiveUsers = localList;
          setUsers(effectiveUsers);
        } else {
          effectiveUsers = normalizeAndDeduplicateUsers(fsUsers || []);
          setUsers(effectiveUsers);
        }
      }

      // Sincronização dinâmica de permissões da sessão ativa em tempo real
      const activeSelf = currentUserRef.current;
      if (activeSelf) {
        const updatedSelf = effectiveUsers.find(
          (u) => u.id === activeSelf.id || (u.email && activeSelf.email && u.email.toLowerCase() === activeSelf.email.toLowerCase())
        );
        if (updatedSelf) {
          const isMasterAdmin =
            (updatedSelf.email && updatedSelf.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) ||
            updatedSelf.id === 'usr_coord_1';
          const enforcedSelf: UserProfile = isMasterAdmin
            ? {
                ...updatedSelf,
                name: 'Fernando Veiga',
                email: ADMIN_EMAIL,
                role: 'coordenador' as UserRole,
                cargoLabel: 'Coordenador (Administrador)',
                avatarColor: 'bg-amber-500',
                canManageStudents: true,
                canMarkAttendance: true,
              }
            : updatedSelf;

          const isDifferent =
            JSON.stringify(enforcedSelf.allowedClassIds) !== JSON.stringify(activeSelf.allowedClassIds) ||
            JSON.stringify(enforcedSelf.assignedTurmas) !== JSON.stringify(activeSelf.assignedTurmas) ||
            JSON.stringify(enforcedSelf.assignedActivities) !== JSON.stringify(activeSelf.assignedActivities) ||
            JSON.stringify(enforcedSelf.allowedTabs) !== JSON.stringify(activeSelf.allowedTabs) ||
            enforcedSelf.role !== activeSelf.role ||
            enforcedSelf.name !== activeSelf.name ||
            enforcedSelf.phone !== activeSelf.phone ||
            enforcedSelf.pixKey !== activeSelf.pixKey ||
            enforcedSelf.contractSchedule !== activeSelf.contractSchedule ||
            enforcedSelf.contractDailyHours !== activeSelf.contractDailyHours ||
            enforcedSelf.baseSalary !== activeSelf.baseSalary ||
            enforcedSelf.company !== activeSelf.company ||
            enforcedSelf.canManageStudents !== activeSelf.canManageStudents ||
            enforcedSelf.canMarkAttendance !== activeSelf.canMarkAttendance;

          if (isDifferent) {
            setCurrentUser(enforcedSelf);
            saveStoredUser(enforcedSelf);
          }
        }
      }
    });

    return () => {
      unsubUsers();
    };
  }, [shouldSyncUsers]);

  // 4. Atividades em Tempo Real
  useEffect(() => {
    if (!shouldSyncActivities) return;

    const unsubActivities = subscribeActivities((fsActivities) => {
      if (fsActivities.length > 0) {
        const officialMap = new Map<string, ActivityItem>();
        ACTIVITIES_LIST.forEach((initAct) => {
          officialMap.set(initAct.id, initAct);
          officialMap.set(initAct.name, initAct);
        });

        const healedActivities = fsActivities.map((act) => {
          const isOfficial = officialMap.has(act.id) || officialMap.has(act.name);
          if (isOfficial) {
            const officialTemplate = officialMap.get(act.id) || officialMap.get(act.name)!;
            const expectedRollCall = officialTemplate.requiresRollCall !== undefined ? officialTemplate.requiresRollCall : false;
            if (!hasHealedActivitiesRef.current && act.requiresRollCall !== expectedRollCall) {
              saveActivityToFirestore({
                ...officialTemplate,
                ...act,
                requiresRollCall: expectedRollCall,
              }).catch((err) => console.warn('Falha na gravação remota:', err));
            }
            return {
              ...officialTemplate,
              ...act,
              requiresRollCall: expectedRollCall,
            };
          }
          return act;
        });

        if (!hasHealedActivitiesRef.current) {
          hasHealedActivitiesRef.current = true;
          ACTIVITIES_LIST.forEach((officialAct) => {
            if (!healedActivities.some((a) => a.id === officialAct.id || a.name === officialAct.name)) {
              saveActivityToFirestore(officialAct).catch((err) => console.warn('Falha na gravação remota:', err));
              healedActivities.push(officialAct);
            }
          });
        }

        setActivitiesList(healedActivities);
        saveActivities(healedActivities);
      } else {
        const defaultActs = loadActivities();
        setActivitiesList(defaultActs);
      }
    });

    return () => {
      unsubActivities();
    };
  }, [shouldSyncActivities]);

  // 5. Horários de Atividades em Tempo Real
  useEffect(() => {
    if (!shouldSyncSchedules) return;

    const unsubSchedules = subscribeToSchedules((fsSchedules) => {
      setSchedules(fsSchedules);
      saveSchedules(fsSchedules);
    });

    return () => {
      unsubSchedules();
    };
  }, [shouldSyncSchedules]);

  // 6. Feriados e Recessos em Tempo Real
  useEffect(() => {
    if (!shouldSyncHolidays) return;

    const unsubHolidays = subscribeHolidays((fsHolidays) => {
      if (fsHolidays.length > 0) {
        const initialMap = new Map<string, HolidayItem>();
        INITIAL_HOLIDAYS.forEach((initH) => {
          initialMap.set(initH.id, initH);
          initialMap.set(initH.name.toLowerCase().trim(), initH);
        });

        let needsSync = false;
        const normalized = fsHolidays.map((h) => {
          let updated = { ...h };
          if ((updated.type as string) === 'ferias' || (updated.type as string) === 'ponto_facultativo') {
            updated.type = 'recesso';
            needsSync = true;
          }
          if (!updated.endDate || updated.endDate === updated.date) {
            const match = initialMap.get(updated.id) || initialMap.get(updated.name.toLowerCase().trim());
            if (match && match.endDate && match.endDate !== updated.endDate) {
              updated.endDate = match.endDate;
              needsSync = true;
            }
          }
          return updated;
        });

        setHolidays(normalized);
        saveHolidays(normalized);
      } else {
        const defaultHols = loadHolidays();
        setHolidays(defaultHols);
      }
    });

    return () => {
      unsubHolidays();
    };
  }, [shouldSyncHolidays]);

  // 7 & 8. Livro Ponto: Registros e Fechamentos Mensais em Tempo Real
  useEffect(() => {
    if (!shouldSyncPonto) return;

    const unsubPontoRecords = subscribePontoRecords((fsPontoRecords) => {
      if (fsPontoRecords && fsPontoRecords.length > 0) {
        setPontoRecords(fsPontoRecords);
        savePontoRecords(fsPontoRecords);
      } else {
        const localRecs = loadPontoRecords();
        if (localRecs.length > 0) {
          setPontoRecords(localRecs);
        }
      }
    });

    const unsubPontoClosings = subscribePontoClosings((fsPontoClosings) => {
      if (fsPontoClosings && fsPontoClosings.length > 0) {
        setPontoClosings(fsPontoClosings);
        savePontoClosings(fsPontoClosings);
      } else {
        const localClosings = loadPontoClosings();
        if (localClosings.length > 0) {
          setPontoClosings(localClosings);
        }
      }
    });

    return () => {
      unsubPontoRecords();
      unsubPontoClosings();
    };
  }, [shouldSyncPonto]);

  // 9. Semanário Pedagógico em Tempo Real
  useEffect(() => {
    if (!shouldSyncSemanario) return;

    const unsubSemanario = subscribeSemanarioPlans((fsPlans) => {
      if (fsPlans && fsPlans.length > 0) {
        setSemanarioPlans(fsPlans);
        saveSemanarioPlans(fsPlans);
      } else {
        const localPlans = loadSemanarioPlans();
        if (localPlans.length > 0) {
          setSemanarioPlans(localPlans);
        }
      }
    });

    return () => {
      unsubSemanario();
    };
  }, [shouldSyncSemanario]);

  // 9b. Semanário Pedagógico de HOJE (Leitura Restrita para aba Atividades do Momento sem acesso à aba Semanário completa)
  const shouldSyncTodaySemanario =
    isLogged && !shouldSyncSemanario && isTabAllowed('momento', currentUser);

  const [todaySemanarioPlans, setTodaySemanarioPlans] = useState<SemanarioPlan[]>([]);

  useEffect(() => {
    if (!shouldSyncTodaySemanario) return;

    const targetDate = selectedDate || todayStr;
    const unsubToday = subscribeTodaySemanarioPlans(
      targetDate,
      (fsTodayPlans) => {
        if (fsTodayPlans && fsTodayPlans.length > 0) {
          setTodaySemanarioPlans(fsTodayPlans);
        } else {
          const localPlans = loadSemanarioPlans();
          const filtered = localPlans.filter((p) => p.date === targetDate);
          setTodaySemanarioPlans(filtered);
        }
      },
      (err) => {
        console.warn('Erro ao escutar planos do dia do Semanário para aba Momento:', err);
        const localPlans = loadSemanarioPlans();
        const filtered = localPlans.filter((p) => p.date === targetDate);
        setTodaySemanarioPlans(filtered);
      }
    );

    return () => {
      unsubToday();
    };
  }, [shouldSyncTodaySemanario, selectedDate, todayStr]);

  const effectiveTodaySemanarioPlans = useMemo(() => {
    const targetDate = selectedDate || todayStr;
    if (shouldSyncSemanario) {
      return (semanarioPlans || []).filter((p) => p.date === targetDate);
    }
    return todaySemanarioPlans;
  }, [shouldSyncSemanario, semanarioPlans, todaySemanarioPlans, selectedDate, todayStr]);

  // 10. Quadro de Atribuições em Tempo Real
  useEffect(() => {
    if (!shouldSyncQuadro) return;

    const unsubQuadro = subscribeQuadroAtribuicoes((fsAtribuicoes) => {
      if (fsAtribuicoes && fsAtribuicoes.length > 0) {
        setQuadroAtribuicoes(fsAtribuicoes);
        saveLocalQuadroAtribuicoes(fsAtribuicoes);
      } else {
        const local = loadLocalQuadroAtribuicoes();
        if (local && local.length > 0) {
          setQuadroAtribuicoes(local);
        }
      }
    });

    return () => {
      unsubQuadro();
    };
  }, [shouldSyncQuadro]);

  // 11. Registros de Frequência / Presença em Tempo Real (Dashboard e Chamada)
  useEffect(() => {
    if (!shouldSyncRecords) return;

    const targetDate = selectedDate || todayStr;
    const unsubRecords = subscribeRecords(
      (fsRecords) => {
        const realRecords = fsRecords.filter(
          (r) => !isMockStudent({ id: r.studentId }) && !r.id.startsWith('st-1_') && !r.id.startsWith('st-2_') && !r.id.startsWith('st-3_') && r.date !== '2026-09-15'
        );
        setRecords((prev) => {
          const map = new Map(prev.filter((r) => r.date !== '2026-09-15').map((r) => [r.id, r]));
          realRecords.forEach((r) => map.set(r.id, r));
          const merged = Array.from(map.values());
          saveAttendanceRecords(merged);
          return merged;
        });
      },
      (err) => {
        console.warn('Erro ao escutar attendanceRecords do dashboard:', err);
      },
      targetDate,
      300
    );

    return () => {
      unsubRecords();
    };
  }, [shouldSyncRecords, selectedDate, todayStr]);

  // Diagnóstico em console do total de ouvintes ativos em tempo real
  useEffect(() => {
    if (!isLogged) return;
    const activeListeners = [
      shouldSyncStudents && 'Alunos (subscribeStudents)',
      shouldSyncTurmas && 'Turmas (subscribeTurmas)',
      shouldSyncUsers && 'Usuários (subscribeUsers)',
      shouldSyncActivities && 'Atividades (subscribeActivities)',
      shouldSyncSchedules && 'Horários (subscribeToSchedules)',
      shouldSyncHolidays && 'Feriados/Recessos (subscribeHolidays)',
      shouldSyncPonto && 'Ponto - Registros (subscribePontoRecords)',
      shouldSyncPonto && 'Ponto - Fechamentos (subscribePontoClosings)',
      shouldSyncSemanario && 'Semanário (subscribeSemanarioPlans)',
      shouldSyncQuadro && 'Quadro de Atribuições (subscribeQuadroAtribuicoes)',
      shouldSyncRecords && 'Registros de Frequência (subscribeRecords)',
    ].filter(Boolean) as string[];

    console.info(
      `[Sincronização Sob Demanda] Usuário: ${currentUser?.name} (${currentUser?.role}). ` +
      `Ouvintes ativos em tempo real: ${activeListeners.length}/11 [${activeListeners.join(', ')}]`
    );
  }, [
    isLogged,
    currentUser?.name,
    currentUser?.role,
    shouldSyncStudents,
    shouldSyncTurmas,
    shouldSyncUsers,
    shouldSyncActivities,
    shouldSyncSchedules,
    shouldSyncHolidays,
    shouldSyncPonto,
    shouldSyncSemanario,
    shouldSyncQuadro,
    shouldSyncRecords,
  ]);

  // Event listener for date selection from day pills
  useEffect(() => {
    const handleSelectDate = (e: CustomEvent<string>) => {
      if (e && e.detail) {
        setSelectedDate(e.detail);
      }
    };
    window.addEventListener('app_select_date', handleSelectDate as EventListener);
    return () => {
      window.removeEventListener('app_select_date', handleSelectDate as EventListener);
    };
  }, []);

  // Save student modifications
  const handleAddStudent = async (newStudentData: Omit<Student, 'id'>) => {
    const rawStudent: Student = {
      ...newStudentData,
      id: `st-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    };
    const newStudent = normalizeStudent(rawStudent);
    let updatedList: Student[] = [];
    setStudents((prev) => {
      const updated = [newStudent, ...prev];
      updatedList = updated;
      saveStudents(updated);
      return updated;
    });
    broadcastSyncEvent('SYNC_STUDENTS', updatedList);
    try {
      await saveStudentToFirestore(newStudent);
    } catch (err) {
      console.error('Error adding student to Firestore:', err);
    }
  };

  const handleBatchAddStudents = async (
    names: string[],
    turma: TurmaType,
    activities: ActivityType[],
    diasFrequencia?: DayOfWeek[]
  ) => {
    const newStudentsList: Student[] = names.map((name, idx) =>
      normalizeStudent({
        id: `st-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
        name,
        turma,
        activities,
        diasFrequencia: diasFrequencia && diasFrequencia.length > 0 ? diasFrequencia : ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        horariosSaida: {},
        status: 'ativo',
      })
    );

    let updatedList: Student[] = [];
    setStudents((prev) => {
      const updated = [...newStudentsList, ...prev];
      updatedList = updated;
      saveStudents(updated);
      return updated;
    });
    broadcastSyncEvent('SYNC_STUDENTS', updatedList);

    try {
      await Promise.allSettled(newStudentsList.map((s) => saveStudentToFirestore(s)));
    } catch (err) {
      console.error('Error batch adding students to Firestore:', err);
    }
  };

  const handleUpdateStudent = async (updatedStudent: Student) => {
    let updatedList: Student[] = [];
    setStudents((prev) => {
      const existing = prev.find((s) => s.id === updatedStudent.id);
      const merged = mergeStudentData(existing, updatedStudent);
      const updated = prev.map((s) => (s.id === merged.id ? merged : s));
      updatedList = updated;
      saveStudents(updated);
      return updated;
    });
    broadcastSyncEvent('SYNC_STUDENTS', updatedList);
    try {
      await saveStudentToFirestore(updatedStudent);
    } catch (err) {
      console.error('Error updating student in Firestore:', err);
    }
  };

  const handleDeleteStudent = async (id: string, studentName?: string, studentTurma?: string): Promise<void> => {
    // 1. Identifica nome e turma caso não tenham sido passados
    const targetStudent = students.find((s) => s.id === id);
    const resolvedName = (studentName || targetStudent?.name || '').trim();
    const resolvedTurma = (studentTurma || targetStudent?.turma || '').trim();

    // 2. Exclusão assíncrona no Firestore (coleções 'alunos' e 'students')
    // Localiza e remove todos os documentos que correspondem ao aluno (incluindo duplicatas)
    let deletedIds: string[] = [];
    try {
      const res = await deleteStudentFromFirestore(id, resolvedName, resolvedTurma);
      deletedIds = res.deletedIds || [];
    } catch (err) {
      console.warn('Falha na gravação remota:', err);
    }

    // 3. Limpeza de Cache ao Deletar:
    // Remove imediatamente do storage local e marca todos os IDs encontrados para não ressincronizar
    const allIdsToPurge = new Set<string>([id, ...deletedIds]);
    allIdsToPurge.forEach((sid) => {
      removeStudentFromLocalStorage(sid);
      markStudentAsDeleted(sid);
    });

    // 4. Atualiza estado da tela removendo tanto pelo ID quanto pelo par nome+turma (para garantir que réplicas sumam da tela)
    let updatedList: Student[] = [];
    setStudents((prev) => {
      const updated = prev.filter((s) => {
        if (allIdsToPurge.has(s.id)) return false;
        if (
          resolvedName &&
          resolvedTurma &&
          s.name.trim().toLowerCase() === resolvedName.toLowerCase() &&
          s.turma.trim().toLowerCase() === resolvedTurma.toLowerCase()
        ) {
          return false;
        }
        return true;
      });
      updatedList = updated;
      saveStudents(updated);
      return updated;
    });
    broadcastSyncEvent('SYNC_STUDENTS', updatedList);
  };

  // Save attendance record modifications
  const handleSaveRecord = async (recordData: Omit<AttendanceRecord, 'id' | 'createdAt'>) => {
    const recordId = `${recordData.studentId}_${recordData.activity}_${recordData.date}`;
    const newRecord: AttendanceRecord = {
      ...recordData,
      id: recordId,
      createdAt: new Date().toISOString(),
    };
    
    // Atualização local imediata e síncrona
    setRecords((prev) => {
      const filtered = prev.filter((r) => r.id !== recordId);
      const updated = [newRecord, ...filtered];
      saveAttendanceRecords(updated);
      return updated;
    });

    // Notificação imediata para outras abas e janelas em tempo real
    broadcastSyncEvent('SYNC_ATTENDANCE_RECORD_UPSERT', newRecord);

    // Gravação direta no Firestore
    try {
      await saveRecordToFirestore(newRecord);
    } catch (err) {
      console.error('Erro ao salvar chamada no Firestore:', err);
      throw err;
    }
  };

  const handleBatchMarkPresent = async (
    studentIds: string[],
    activity: ActivityType | 'TODAS',
    date: string
  ) => {
    const targetKeys = new Set<string>();
    const batchNewRecords: AttendanceRecord[] = [];

    studentIds.forEach((studentId) => {
      const student = students.find((s) => s.id === studentId);
      if (!student) return;

      const activitiesToMark = activity === 'TODAS' ? student.activities : [activity];
      activitiesToMark.forEach((act) => {
        const key = `${studentId}_${act}_${date}`;
        targetKeys.add(key);
        batchNewRecords.push({
          id: key,
          studentId,
          activity: act,
          turma: student.turma,
          date,
          weekNumber: currentWeek.weekNumber,
          year: currentWeek.year,
          status: 'presente',
          createdAt: new Date().toISOString(),
        });
      });
    });

    let updatedRecords: AttendanceRecord[] = [];
    setRecords((prev) => {
      const filtered = prev.filter((r) => !targetKeys.has(r.id));
      const updated = [...batchNewRecords, ...filtered];
      updatedRecords = updated;
      saveAttendanceRecords(updated);
      return updated;
    });

    // Notificação imediata para outras abas e dispositivos
    broadcastSyncEvent('SYNC_ATTENDANCE_RECORDS', updatedRecords);

    try {
      // Gravação atômica em batch no Firestore
      await batchSaveRecordsToFirestore(batchNewRecords);
    } catch (err) {
      console.error('Erro ao salvar lote de presença no Firestore:', err);
      throw err;
    }
  };

  const handleClearRecords = async (
    studentIds: string[],
    activity: ActivityType | 'TODAS',
    date: string
  ) => {
    const studentIdSet = new Set(studentIds);
    const targetKeys = new Set<string>();

    studentIds.forEach((studentId) => {
      const student = students.find((s) => s.id === studentId);
      if (activity === 'TODAS') {
        if (student) {
          student.activities.forEach((act) => {
            targetKeys.add(`${studentId}_${act}_${date}`);
          });
        }
      } else {
        targetKeys.add(`${studentId}_${activity}_${date}`);
      }
    });

    let updatedRecords: AttendanceRecord[] = [];
    setRecords((prev) => {
      const updated = prev.filter((r) => {
        if (r.date === date && studentIdSet.has(r.studentId)) {
          if (activity === 'TODAS' || r.activity === activity) {
            targetKeys.add(r.id);
            return false;
          }
        }
        return !targetKeys.has(r.id);
      });
      updatedRecords = updated;
      saveAttendanceRecords(updated);
      return updated;
    });

    // Notificação imediata para outras abas e dispositivos
    broadcastSyncEvent('SYNC_ATTENDANCE_RECORDS', updatedRecords);

    try {
      // Exclusão atômica em lote no Firestore
      await batchDeleteAttendanceRecordsFromFirestore(Array.from(targetKeys));
    } catch (err) {
      console.error('Error clearing Firestore records:', err);
      throw err;
    }
  };

  // Turma management
  const handleAddTurma = (newTurmaName: string): boolean => {
    const name = newTurmaName.trim();
    if (!name || turmas.includes(name)) return false;
    const updated = sortTurmasPedagogical([...turmas, name]);
    setTurmas(updated);
    saveTurmas(updated);
    broadcastSyncEvent('SYNC_TURMAS', updated);
    saveTurmaToFirestore(name).catch((err) => console.warn('Falha na gravação remota:', err));

    // Integração com o Quadro de Atribuições: cria automaticamente a atribuição para a nova turma
    const safeId = generateTurmaAtribuicaoId(name);
    const newAtribuicao: TurmaAtribuicao = {
      id: safeId,
      turma: name,
      monitoraName: '',
      monitoraPhone: '',
      monitoraAssistenteName: '',
      monitoraAssistentePhone: '',
      adiName: '',
      adiPhone: '',
      horarioTurno: '',
      espacoBase: name,
      observacao: '',
    };
    setQuadroAtribuicoes((prev) => {
      const filtered = prev.filter((a) => a.turma !== name);
      const nextList = [...filtered, newAtribuicao];
      saveLocalQuadroAtribuicoes(nextList);
      broadcastSyncEvent('SYNC_QUADRO_ATRIBUICOES', nextList);
      return nextList;
    });
    saveTurmaAtribuicaoToFirestore(newAtribuicao).catch((err) => console.warn('Falha na gravação remota:', err));

    return true;
  };

  const handleDeleteTurma = (turmaName: string, deleteStudents: boolean = true, targetTurmaToReassign?: string) => {
    const updatedTurmas = turmas.filter((t) => t !== turmaName);
    setTurmas(updatedTurmas);
    saveTurmas(updatedTurmas);
    broadcastSyncEvent('SYNC_TURMAS', updatedTurmas);
    deleteTurmaFromFirestore(turmaName).catch((err) => console.warn('Falha na gravação remota:', err));

    // Integração com o Quadro de Atribuições: remove imediatamente a atribuição correspondente
    setQuadroAtribuicoes((prev) => {
      const nextList = prev.filter((a) => a.turma !== turmaName);
      saveLocalQuadroAtribuicoes(nextList);
      broadcastSyncEvent('SYNC_QUADRO_ATRIBUICOES', nextList);
      return nextList;
    });
    deleteTurmaAtribuicaoFromFirestore(turmaName).catch((err) => console.warn('Falha na gravação remota:', err));

    if (deleteStudents) {
      // Remove all students belonging to this turma
      const studentIdsToRemove = new Set<string>(students.filter((s) => s.turma === turmaName).map((s) => s.id));
      const updatedStudents = students.filter((s) => s.turma !== turmaName);
      setStudents(updatedStudents);
      saveStudents(updatedStudents);
      broadcastSyncEvent('SYNC_STUDENTS', updatedStudents);

      const studentsToRemove = students.filter((s) => s.turma === turmaName);
      studentsToRemove.forEach((s) => deleteStudentFromFirestore(s.id, s.name, s.turma).catch((err) => console.warn('Falha na gravação remota:', err)));

      // Clean attendance records for removed students
      const updatedRecords = records.filter((r) => !studentIdsToRemove.has(r.studentId));
      setRecords(updatedRecords);
      saveAttendanceRecords(updatedRecords);
      broadcastSyncEvent('SYNC_ATTENDANCE_RECORDS', updatedRecords);

      records.filter((r) => studentIdsToRemove.has(r.studentId)).forEach((r) => {
        deleteDoc(doc(db, 'attendanceRecords', r.id)).catch(() => {});
      });
    } else if (targetTurmaToReassign) {
      // Reassign students to targetTurmaToReassign
      const updatedStudents = students.map((s) => s.turma === turmaName ? { ...s, turma: targetTurmaToReassign } : s);
      setStudents(updatedStudents);
      saveStudents(updatedStudents);
      broadcastSyncEvent('SYNC_STUDENTS', updatedStudents);

      updatedStudents.filter((s) => s.turma === targetTurmaToReassign).forEach((s) => saveStudentToFirestore(s).catch((err) => console.warn('Falha na gravação remota:', err)));

      const updatedRecords = records.map((r) => r.turma === turmaName ? { ...r, turma: targetTurmaToReassign } : r);
      setRecords(updatedRecords);
      saveAttendanceRecords(updatedRecords);
      broadcastSyncEvent('SYNC_ATTENDANCE_RECORDS', updatedRecords);

      updatedRecords.filter((r) => r.turma === targetTurmaToReassign).forEach((r) => saveRecordToFirestore(r).catch((err) => console.warn('Falha na gravação remota:', err)));
    }
  };

  const handleResetData = () => {
    resetAllData();
    const loadedStudents = loadStudents();
    const loadedRecords = loadAttendanceRecords();
    const loadedTurmas = loadTurmas();
    setStudents(loadedStudents);
    setRecords(loadedRecords);
    setTurmas(loadedTurmas);
  };

  const handleGoToCurrentWeek = () => {
    const today = new Date();
    const { year, weekNumber } = getISOWeekNumber(today);
    setCurrentWeek(getWeekInfo(year, weekNumber));
    setSelectedDate(toISODateString(today));
  };

  const handleSelectWeekFromLibrary = (weekInfo: WeekInfo, targetTab: 'frequencia' | 'relatorio' = 'frequencia') => {
    setCurrentWeek(weekInfo);
    setSelectedDate(weekInfo.startDate);
    setActiveTab(targetTab);
  };

  const handleForceReloadUsers = async () => {
    try {
      if (getIsFirestoreQuotaExceeded()) {
        const localList = getLocalUsersList();
        if (localList && localList.length > 0) {
          const merged = normalizeAndDeduplicateUsers(localList);
          setUsers(merged);
        }
        return;
      }
      const freshUsers = await fetchAllUsersDirectFromServer();
      if (freshUsers && freshUsers.length > 0) {
        const merged = normalizeAndDeduplicateUsers(freshUsers);
        setUsers(merged);
        saveLocalUsersList(merged);
        broadcastSyncEvent('SYNC_USERS', merged);
      }
    } catch (err) {
      console.warn('Recarregamento do servidor indisponível (mantendo lista local):', err);
      const localList = getLocalUsersList();
      if (localList && localList.length > 0) {
        const merged = normalizeAndDeduplicateUsers(localList);
        setUsers(merged);
      }
    }
  };

  const handleSaveUser = async (userToSave: UserProfile) => {
    try {
      // 1. Gravação resiliente no Firestore e no cache local
      const confirmedUser = await saveUserToFirestore(userToSave);

      // 2. Atualiza estado da tela imediatamente
      const targetId = (confirmedUser.id || userToSave.id || '').trim();
      const targetEmail = (confirmedUser.email || userToSave.email || '').trim().toLowerCase();

      setUsers((prev) => {
        const existingIdx = prev.findIndex(
          (u) => (targetId && u.id === targetId) || (targetEmail && u.email && u.email.trim().toLowerCase() === targetEmail)
        );
        let updatedUsers: UserProfile[];
        if (existingIdx >= 0) {
          updatedUsers = [...prev];
          updatedUsers[existingIdx] = {
            ...prev[existingIdx],
            ...confirmedUser,
          };
        } else {
          updatedUsers = [confirmedUser, ...prev];
        }
        const deduplicated = normalizeAndDeduplicateUsers(updatedUsers);
        saveLocalUsersList(deduplicated);
        broadcastSyncEvent('SYNC_USERS', deduplicated);
        return deduplicated;
      });

      // Se for o usuário atualmente autenticado, atualiza perfil logado
      if (
        currentUser &&
        ((targetId && currentUser.id === targetId) ||
          (currentUser.email && targetEmail && currentUser.email.toLowerCase() === targetEmail))
      ) {
        const updatedCurrent = {
          ...currentUser,
          ...confirmedUser,
        };
        setCurrentUser(updatedCurrent);
        saveStoredUser(updatedCurrent);
      }

      // 3. Atualização opcional de sincronização (apenas se a cota do Firestore não estiver excedida)
      if (!getIsFirestoreQuotaExceeded()) {
        try {
          await handleForceReloadUsers();
        } catch (reloadErr) {
          console.warn('Aviso ao sincronizar lista remota de usuários:', reloadErr);
        }
      }
    } catch (err: any) {
      console.warn('Aviso durante salvamento de usuário (aplicando contingência local):', err);
      // Fallback seguro: garante persistência local mesmo em imprevistos
      setUsers((prev) => {
        const deduplicated = normalizeAndDeduplicateUsers([userToSave, ...prev]);
        saveLocalUsersList(deduplicated);
        return deduplicated;
      });
      // Relança o erro para permitir confirmação real na interface (useConfirmedAction)
      throw err;
    }
  };

  const handleUpdateUserPhone = (userId: string, newPhone: string) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;
    const updated: UserProfile = {
      ...targetUser,
      phone: newPhone.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    handleSaveUser(updated);
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      // 1. Exclui no Firestore primeiro
      await deleteUserFromFirestore(userId);

      // 2. Atualiza estado e cache local após confirmação
      const targetUser = users.find((u) => u.id === userId);
      const targetEmail = (targetUser?.email || '').trim().toLowerCase();
      const updatedUsers = users.filter(
        (u) => u.id !== userId && (!targetEmail || !u.email || u.email.trim().toLowerCase() !== targetEmail)
      );
      const deduplicated = normalizeAndDeduplicateUsers(updatedUsers);
      setUsers(deduplicated);
      saveLocalUsersList(deduplicated);
      broadcastSyncEvent('SYNC_USERS', deduplicated);

      // 3. Força recarga sem cache
      await handleForceReloadUsers();
    } catch (err: any) {
      console.error('Erro ao excluir usuário no Firestore:', err);
      throw err;
    }
  };

  const handleSaveActivity = (activityToSave: ActivityItem) => {
    const existingIdx = activitiesList.findIndex((a) => a.id === activityToSave.id);
    let updatedActs: ActivityItem[];
    if (existingIdx >= 0) {
      updatedActs = [...activitiesList];
      updatedActs[existingIdx] = activityToSave;
    } else {
      updatedActs = [...activitiesList, activityToSave];
    }
    setActivitiesList(updatedActs);
    saveActivities(updatedActs);
    broadcastSyncEvent('SYNC_ACTIVITIES', updatedActs);
    saveActivityToFirestore(activityToSave).catch((err) => console.warn('Falha na gravação remota:', err));
  };

  const handleDeleteActivity = (activityId: string) => {
    const updatedActs = activitiesList.filter((a) => a.id !== activityId);
    setActivitiesList(updatedActs);
    saveActivities(updatedActs);
    broadcastSyncEvent('SYNC_ACTIVITIES', updatedActs);
    deleteActivityFromFirestore(activityId).catch((err) => console.warn('Falha na gravação remota:', err));
  };

  // Schedule Management Handlers
  const handleSaveScheduleBlock = (block: ScheduleBlock) => {
    const existingIdx = schedules.findIndex((s) => s.id === block.id);
    let updated: ScheduleBlock[];
    if (existingIdx >= 0) {
      updated = [...schedules];
      updated[existingIdx] = block;
    } else {
      updated = [...schedules, block];
    }
    setSchedules(updated);
    saveSchedules(updated);
    broadcastSyncEvent('SYNC_SCHEDULES', updated);
    saveScheduleBlockToFirestore(block).catch((err) => console.warn('Falha na gravação remota:', err));
  };

  const handleDeleteScheduleBlock = (id: string) => {
    const updated = schedules.filter((s) => s.id !== id);
    setSchedules(updated);
    saveSchedules(updated);
    broadcastSyncEvent('SYNC_SCHEDULES', updated);
    deleteScheduleBlockFromFirestore(id).catch((err) => console.warn('Falha na gravação remota:', err));
  };

  const handleBatchSaveSchedules = (
    blocks: ScheduleBlock[],
    deletedIds: string[] = [],
    newOrUpdatedOnly?: ScheduleBlock[]
  ) => {
    setSchedules(blocks);
    saveSchedules(blocks);
    broadcastSyncEvent('SYNC_SCHEDULES', blocks);
    if (deletedIds.length > 0) {
      batchSyncSchedulesToFirestore(newOrUpdatedOnly || blocks, deletedIds).catch((err) => console.warn('Falha na gravação remota:', err));
    } else {
      saveAllSchedulesToFirestore(newOrUpdatedOnly || blocks).catch((err) => console.warn('Falha na gravação remota:', err));
    }
  };

  // Holiday and Recess Management Handlers
  const handleSaveHoliday = (holiday: HolidayItem) => {
    setHolidays((prev) => {
      const filtered = prev.filter((h) => h.id !== holiday.id);
      const updated = [...filtered, holiday].sort((a, b) => a.date.localeCompare(b.date));
      saveHolidays(updated);
      return updated;
    });
    saveHolidayToFirestore(holiday).catch((err) => console.warn('Falha na gravação remota:', err));
  };

  const handleDeleteHoliday = (holidayId: string) => {
    setHolidays((prev) => {
      const updated = prev.filter((h) => h.id !== holidayId);
      saveHolidays(updated);
      return updated;
    });
    deleteHolidayFromFirestore(holidayId).catch((err) => console.warn('Falha na gravação remota:', err));
  };

  const handleBatchSaveHolidays = (batch: HolidayItem[]) => {
    setHolidays(batch);
    saveHolidays(batch);
    batchSaveHolidaysToFirestore(batch).catch((err) => console.warn('Falha na gravação remota:', err));
  };

  // Ponto Records & Closings Handlers
  const handleSavePontoRecord = async (record: PontoRecord) => {
    setPontoRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === record.id);
      let next: PontoRecord[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = record;
      } else {
        next = [...prev, record];
      }
      savePontoRecords(next);
      broadcastSyncEvent('SYNC_PONTO_RECORDS', next);
      return next;
    });
    try {
      await savePontoRecordToFirestore(record);
    } catch (err) {
      console.error('Erro ao salvar ponto no Firestore:', err);
      throw err;
    }
  };

  const handleBatchSavePontoRecords = async (recordsToSave: PontoRecord[]) => {
    setPontoRecords((prev) => {
      const map = new Map<string, PontoRecord>();
      prev.forEach((r) => map.set(r.id, r));
      recordsToSave.forEach((r) => map.set(r.id, r));
      const merged = Array.from(map.values());
      savePontoRecords(merged);
      broadcastSyncEvent('SYNC_PONTO_RECORDS', merged);
      return merged;
    });
    try {
      await batchSavePontoRecordsToFirestore(recordsToSave);
    } catch (err) {
      console.error('Erro ao salvar lote de pontos no Firestore:', err);
      throw err;
    }
  };

  const handleSavePontoClosing = async (closing: PontoMonthClosing) => {
    try {
      // Gravação direta no Firestore PRIMEIRO para dados sensíveis de fechamento
      await savePontoClosingToFirestore(closing);
      
      setPontoClosings((prev) => {
        const idx = prev.findIndex((c) => c.id === closing.id);
        let next: PontoMonthClosing[];
        if (idx >= 0) {
          next = [...prev];
          next[idx] = closing;
        } else {
          next = [...prev, closing];
        }
        savePontoClosings(next);
        broadcastSyncEvent('SYNC_PONTO_CLOSINGS', next);
        return next;
      });
    } catch (err) {
      console.error('Erro crítico ao salvar fechamento da folha no Firestore:', err);
      throw err;
    }
  };

  // Semanário Pedagogical Planning Handlers
  const handleSaveSemanarioPlan = useCallback((plan: SemanarioPlan) => {
    setSemanarioPlans((prev) => {
      const idx = prev.findIndex((p) => p.id === plan.id);
      let next: SemanarioPlan[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = plan;
      } else {
        next = [plan, ...prev];
      }
      saveSemanarioPlans(next);
      broadcastSyncEvent('SYNC_SEMANARIO', next);
      return next;
    });
    saveSemanarioPlanToFirestore(plan).catch((err) => console.warn('Falha na gravação remota:', err));
  }, []);

  const handleDeleteSemanarioPlan = useCallback((planId: string) => {
    setSemanarioPlans((prev) => {
      const next = prev.filter((p) => p.id !== planId);
      saveSemanarioPlans(next);
      broadcastSyncEvent('SYNC_SEMANARIO', next);
      return next;
    });
    deleteSemanarioPlanFromFirestore(planId).catch((err) => console.warn('Falha na gravação remota:', err));
  }, []);

  const handleBatchSaveSemanarioPlans = useCallback((plansToSave: SemanarioPlan[]) => {
    setSemanarioPlans((prev) => {
      const map = new Map<string, SemanarioPlan>();
      prev.forEach((p) => map.set(p.id, p));
      plansToSave.forEach((p) => map.set(p.id, p));
      const merged = Array.from(map.values());
      saveSemanarioPlans(merged);
      return merged;
    });
    batchSaveSemanarioPlansToFirestore(plansToSave).catch((err) => console.warn('Falha na gravação remota:', err));
  }, []);

  const handleSaveTurmaAtribuicao = useCallback((item: TurmaAtribuicao) => {
    const safeId = generateTurmaAtribuicaoId(item.turma);
    const normalizedItem: TurmaAtribuicao = {
      ...item,
      id: safeId,
    };
    setQuadroAtribuicoes((prev) => {
      const idx = prev.findIndex((a) => a.turma === normalizedItem.turma || a.id === safeId);
      let next: TurmaAtribuicao[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = normalizedItem;
      } else {
        next = [...prev, normalizedItem];
      }
      saveLocalQuadroAtribuicoes(next);
      broadcastSyncEvent('SYNC_QUADRO_ATRIBUICOES', next);
      return next;
    });
    saveTurmaAtribuicaoToFirestore(normalizedItem).catch((err) => console.warn('Falha na gravação remota:', err));
  }, []);

  const handleBatchSaveQuadroAtribuicoes = useCallback((items: TurmaAtribuicao[]) => {
    setQuadroAtribuicoes(items);
    saveLocalQuadroAtribuicoes(items);
    broadcastSyncEvent('SYNC_QUADRO_ATRIBUICOES', items);
    batchSaveQuadroAtribuicoesToFirestore(items).catch((err) => console.warn('Falha na gravação remota:', err));
  }, []);

  // Quadro de Atribuições estritamente alinhado às turmas ativas de Alunos e Turmas
  const effectiveQuadroAtribuicoes = useMemo(() => {
    return reconcileAtribuicoesWithTurmas(quadroAtribuicoes, turmas);
  }, [quadroAtribuicoes, turmas]);

  // Navigate from Atividades do Momento directly to attendance sheet with filters
  const handleNavigateToAttendance = (activity?: ActivityType, turma?: TurmaType, date?: string) => {
    if (date) {
      setSelectedDate(date);
    }
    setActiveTab('frequencia');
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('app_select_attendance_filter', {
          detail: { activity, turma, date },
        })
      );
    }, 60);
  };

  // Modal de Auditoria de Chamada / Alunos Pendentes
  const [showPendingAuditModal, setShowPendingAuditModal] = useState<boolean>(false);
  const [pendingFilterTurma, setPendingFilterTurma] = useState<string>('all');
  const [pendingSearchTerm, setPendingSearchTerm] = useState<string>('');

  // Contadores em tempo real baseados estritamente na Chamada de Rotina de hoje (Fonte Única da Verdade)
  const todayConsolidated = useMemo(() => {
    return getDailyConsolidatedMetrics(todayStr, students, records);
  }, [todayStr, students, records]);

  // Web Push Notifications & Background Audio Alerts Engine
  useWebPushNotifications({
    currentUser,
    schedules,
    records,
    students,
    activitiesList,
    holidays,
    onNavigateToAttendance: handleNavigateToAttendance,
  });

  // Filtered pending students for audit modal (always strictly alphabetical A-Z)
  const filteredPendingStudents = useMemo(() => {
    return todayConsolidated.pendingStudents
      .filter((s) => {
        const matchTurma = pendingFilterTurma === 'all' || s.turma === pendingFilterTurma;
        const matchSearch =
          !pendingSearchTerm.trim() ||
          s.name.toLowerCase().includes(pendingSearchTerm.toLowerCase()) ||
          s.turma.toLowerCase().includes(pendingSearchTerm.toLowerCase());
        return matchTurma && matchSearch;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  }, [todayConsolidated.pendingStudents, pendingFilterTurma, pendingSearchTerm]);

  // Manual sync trigger
  const handleForceSync = async () => {
    try {
      await reconnectFirestore(true);
    } catch {}
    const res = await forceManualSync();
    const freshRecords = loadAttendanceRecords();
    if (freshRecords.length > 0) setRecords(freshRecords);
    const freshStudents = loadStudents();
    if (freshStudents.length > 0) setStudents(freshStudents);
  };

  // If user is not logged in, render the Login Screen with all registered users
  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} onSaveUser={handleSaveUser} usersList={users} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans antialiased flex flex-col">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        totalStudents={students.filter((s) => s.status !== 'inativo' && s.status !== 'cancelado').length || students.length}
        totalMatriculados={students.filter((s) => s.status !== 'inativo' && s.status !== 'cancelado').length || students.length}
        totalAtivosHoje={todayConsolidated.totalAtivos}
        presentesHoje={todayConsolidated.presentes}
        faltasHoje={todayConsolidated.faltas}
        justificadosHoje={todayConsolidated.justificados}
        pendentesHoje={todayConsolidated.pendentes}
        onNavigateToPending={() => setShowPendingAuditModal(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        connectionState={connectionState}
        onForceSync={handleForceSync}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 space-y-5">
        {/* Banner de Auditoria e Trava para Coordenação/Administração - Exibido exclusivamente na aba Chamada de Frequência */}
        {activeTab === 'frequencia' && todayConsolidated.pendentes > 0 && isCoordenador(currentUser) && (
          <div className="bg-amber-50 border border-amber-300/80 rounded-2xl p-3.5 sm:p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-amber-100 rounded-xl text-amber-700 shrink-0">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-amber-200/90 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-300">
                    Auditoria de Chamada
                  </span>
                  <span className="text-xs font-bold text-amber-800">
                    Dia {formatDateBR(todayStr)} ({todayConsolidated.dayName})
                  </span>
                </div>
                <h4 className="text-sm font-extrabold text-amber-950 mt-1">
                  Existem {todayConsolidated.pendentes} {todayConsolidated.pendentes === 1 ? 'aluno esperado com chamada pendente' : 'alunos esperados com chamada pendente/não lançada'} hoje
                </h4>
                <p className="text-xs text-amber-800/90 mt-0.5">
                  Total apurado: <strong>{todayConsolidated.apurados}</strong> de <strong>{todayConsolidated.totalAtivos} alunos com frequência prevista hoje</strong> (de {students.length} matriculados). Alunos sem agenda para hoje não geram pendência.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setShowPendingAuditModal(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-extrabold text-white bg-amber-600 hover:bg-amber-700 shadow-sm transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <UserX className="w-4 h-4" />
                <span>Ver {todayConsolidated.pendentes} Alunos Pendentes</span>
              </button>
              {selectedDate !== todayStr && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(todayStr);
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-amber-900 bg-amber-100/90 hover:bg-amber-200/80 border border-amber-300 transition-all cursor-pointer"
                >
                  Ir para Hoje
                </button>
              )}
            </div>
          </div>
        )}
        {/* Fallback quando o usuário não possui nenhuma aba liberada */}
        {getUserAllowedTabs(currentUser).length === 0 && (
          <div className="bg-white rounded-3xl p-8 sm:p-12 text-center max-w-lg mx-auto border border-slate-200 shadow-sm space-y-4 my-8">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-800">Nenhuma aba liberada</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Nenhuma aba liberada para seu usuário. Entre em contato com a coordenação.
            </p>
          </div>
        )}

        {/* Fallback quando o usuário tenta acessar uma aba não permitida */}
        {getUserAllowedTabs(currentUser).length > 0 && !isTabAllowed(activeTab, currentUser) && (
          <div className="bg-white rounded-3xl p-8 sm:p-10 text-center max-w-lg mx-auto border border-slate-200 shadow-sm space-y-4 my-8">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-black text-slate-800">Acesso Restrito</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Você não possui permissão para acessar esta aba. Entre em contato com a coordenação.
            </p>
          </div>
        )}

        {/* Tab 1: Chamada de Frequência */}
        {activeTab === 'frequencia' && isTabAllowed('frequencia', currentUser) && (
          <AttendanceSheet
            students={students}
            records={records}
            turmas={turmas}
            activitiesList={activitiesList}
            schedules={schedules}
            holidays={holidays}
            currentWeek={currentWeek}
            selectedDate={selectedDate}
            currentUser={currentUser}
            onSaveRecord={handleSaveRecord}
            onBatchMarkPresent={handleBatchMarkPresent}
            onClearRecords={handleClearRecords}
          />
        )}

        {/* Tab 2: Atividades do Momento */}
        {activeTab === 'momento' && isTabAllowed('momento', currentUser) && (
          <CurrentActivities
            students={students}
            records={records}
            turmas={turmas}
            activitiesList={activitiesList}
            schedules={schedules}
            holidays={holidays}
            currentWeek={currentWeek}
            selectedDate={selectedDate}
            currentUser={currentUser}
            users={users}
            quadroAtribuicoes={effectiveQuadroAtribuicoes}
            onSaveAtribuicao={handleSaveTurmaAtribuicao}
            onBatchSaveAtribuicoes={handleBatchSaveQuadroAtribuicoes}
            onUpdateUserPhone={handleUpdateUserPhone}
            onSaveRecord={handleSaveRecord}
            onBatchMarkPresent={handleBatchMarkPresent}
            onClearRecords={handleClearRecords}
            onNavigateToAttendance={handleNavigateToAttendance}
            todaySemanarioPlans={effectiveTodaySemanarioPlans}
          />
        )}

        {/* Tab 3: Semanário / Planejamento Pedagógico */}
        {activeTab === 'semanario' && isTabAllowed('semanario', currentUser) && (
          <SemanarioMain
            plans={semanarioPlans}
            turmas={turmas}
            users={users}
            currentUser={currentUser}
            currentWeek={currentWeek}
            activitiesList={activitiesList}
            schedules={schedules}
            onSavePlan={handleSaveSemanarioPlan}
            onDeletePlan={handleDeleteSemanarioPlan}
            onBatchSavePlans={handleBatchSaveSemanarioPlans}
            onSelectWeek={setCurrentWeek}
            onAddTurma={handleAddTurma}
          />
        )}

        {/* Tab 4: Alunos e Turmas */}
        {activeTab === 'alunos' && isTabAllowed('alunos', currentUser) && (
          <StudentManager
            students={students}
            records={records}
            turmas={turmas}
            activitiesList={activitiesList}
            currentWeek={currentWeek}
            currentUser={currentUser}
            onAddStudent={handleAddStudent}
            onBatchAddStudents={handleBatchAddStudents}
            onUpdateStudent={handleUpdateStudent}
            onDeleteStudent={handleDeleteStudent}
            onAddTurma={handleAddTurma}
            onDeleteTurma={handleDeleteTurma}
          />
        )}

        {/* Tab 5: Relatório Semanal */}
        {activeTab === 'relatorio' && isTabAllowed('relatorio', currentUser) && (
          <WeeklyReport
            students={students}
            records={records}
            turmas={turmas}
            activitiesList={activitiesList}
            holidays={holidays}
            currentWeek={currentWeek}
            currentUser={currentUser}
            users={users}
            onDeleteTurma={handleDeleteTurma}
          />
        )}

        {/* Tab 6: Biblioteca de Semanas */}
        {activeTab === 'biblioteca' && isTabAllowed('biblioteca', currentUser) && (
          <WeeklyLibrary
            students={students}
            records={records}
            currentWeek={currentWeek}
            onSelectWeek={handleSelectWeekFromLibrary}
          />
        )}

        {/* Tab 7: Gerenciamento de Usuários */}
        {activeTab === 'usuarios' && isTabAllowed('usuarios', currentUser) && (
          <UserManagement
            currentUser={currentUser}
            users={users}
            activitiesList={activitiesList}
            turmas={turmas}
            schedules={schedules}
            holidays={holidays}
            onSaveUser={handleSaveUser}
            onDeleteUser={handleDeleteUser}
            onSaveActivity={handleSaveActivity}
            onDeleteActivity={handleDeleteActivity}
            onSaveScheduleBlock={handleSaveScheduleBlock}
            onDeleteScheduleBlock={handleDeleteScheduleBlock}
            onBatchSaveSchedules={handleBatchSaveSchedules}
            onSaveHoliday={handleSaveHoliday}
            onDeleteHoliday={handleDeleteHoliday}
            onBatchSaveHolidays={handleBatchSaveHolidays}
            onForceReloadUsers={handleForceReloadUsers}
          />
        )}

        {/* Tab 8: Livro Ponto & Folha de Frequência */}
        {activeTab === 'ponto' && isTabAllowed('ponto', currentUser) && (
          <LivroPonto
            currentUser={currentUser}
            users={users}
            holidays={holidays}
            pontoRecords={pontoRecords}
            pontoClosings={pontoClosings}
            onSavePontoRecord={handleSavePontoRecord}
            onBatchSavePontoRecords={handleBatchSavePontoRecords}
            onSavePontoClosing={handleSavePontoClosing}
            onSaveHoliday={handleSaveHoliday}
            onDeleteHoliday={handleDeleteHoliday}
            onBatchSaveHolidays={handleBatchSaveHolidays}
            onSaveUser={handleSaveUser}
          />
        )}

        {/* Tab 9: Cardápio e Culinária */}
        {activeTab === 'cardapio' && isTabAllowed('cardapio', currentUser) && (
          <CardapioCulinaria currentUser={currentUser} />
        )}
      </main>

      {/* Footer */}
      <Footer
        currentUser={currentUser}
        onLogout={handleLogout}
        connectionState={connectionState}
        onForceSync={handleForceSync}
        firebaseConnected={firebaseConnected}
      />

      {/* Modal de Auditoria de Alunos com Chamada Pendente */}
      {showPendingAuditModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                  <UserX className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white leading-tight">
                    Auditoria de Chamadas Pendentes
                  </h3>
                  <p className="text-xs text-slate-400">
                    {todayConsolidated.pendentes} alunos com presença prevista hoje sem chamada de Rotina em {formatDateBR(todayStr)} ({todayConsolidated.dayName})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPendingAuditModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Subheader Filters & Search */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={pendingSearchTerm}
                  onChange={(e) => setPendingSearchTerm(e.target.value)}
                  placeholder="Buscar aluno pendente por nome..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <span className="text-xs font-bold text-slate-600 shrink-0">Turma:</span>
                <select
                  value={pendingFilterTurma}
                  onChange={(e) => setPendingFilterTurma(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 w-full sm:w-auto cursor-pointer"
                >
                  <option value="all">Todas as Turmas ({todayConsolidated.pendingStudents.length})</option>
                  {turmas.map((t) => {
                    const countInTurma = todayConsolidated.pendingStudents.filter((s) => s.turma === t).length;
                    return (
                      <option key={t} value={t}>
                        Turma {t} ({countInTurma})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Students List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[50vh]">
              {filteredPendingStudents.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
                  <p className="text-sm font-extrabold text-slate-700">Nenhum aluno pendente encontrado!</p>
                  <p className="text-xs text-slate-400 mt-0.5">Todos os alunos esperados hoje correspondentes ao filtro estão com chamada lançada.</p>
                </div>
              ) : (
                filteredPendingStudents.map((student) => (
                  <div
                    key={student.id}
                    className="p-3 bg-white border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-amber-300 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-extrabold text-xs text-slate-700 shrink-0">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-slate-900">{student.name}</span>
                          <span className="text-[10px] font-extrabold px-2 py-0.2 bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                            Turma {student.turma}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.2 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
                            {formatDiasFrequencia(student.diasFrequencia)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Matrícula: #{student.id.slice(0, 6)} • Status: <span className="text-amber-600 font-bold">Pendente de Chamada</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 self-end sm:self-auto shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const dateObj = new Date(todayStr + 'T12:00:00');
                          const isoWeek = getISOWeekNumber(dateObj);
                          handleSaveRecord({
                            studentId: student.id,
                            turma: student.turma,
                            activity: 'Rotina',
                            date: todayStr,
                            weekNumber: currentWeek?.weekNumber || isoWeek.weekNumber,
                            year: currentWeek?.year || isoWeek.year,
                            status: 'presente',
                            observation: '',
                          });
                        }}
                        className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
                        title="Lançar Presença na Rotina"
                      >
                        Presente
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const dateObj = new Date(todayStr + 'T12:00:00');
                          const isoWeek = getISOWeekNumber(dateObj);
                          handleSaveRecord({
                            studentId: student.id,
                            turma: student.turma,
                            activity: 'Rotina',
                            date: todayStr,
                            weekNumber: currentWeek?.weekNumber || isoWeek.weekNumber,
                            year: currentWeek?.year || isoWeek.year,
                            status: 'falta',
                            observation: '',
                          });
                        }}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
                        title="Lançar Falta na Rotina"
                      >
                        Falta
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const dateObj = new Date(todayStr + 'T12:00:00');
                          const isoWeek = getISOWeekNumber(dateObj);
                          handleSaveRecord({
                            studentId: student.id,
                            turma: student.turma,
                            activity: 'Rotina',
                            date: todayStr,
                            weekNumber: currentWeek?.weekNumber || isoWeek.weekNumber,
                            year: currentWeek?.year || isoWeek.year,
                            status: 'saude',
                            observation: 'Atestado Médico / Ausência Justificada',
                          });
                        }}
                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
                        title="Lançar Atestado / Saúde"
                      >
                        Atestado
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="text-xs text-slate-500 font-medium">
                Fórmula de Auditoria: <span className="font-mono text-slate-700 font-bold">{todayConsolidated.presentes} Pres. + {todayConsolidated.faltas} Falt. + {todayConsolidated.justificados} Atest. + {todayConsolidated.pendentes} Pend. = {todayConsolidated.totalAtivos} Total</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPendingAuditModal(false);
                    setSelectedDate(todayStr);
                    setActiveTab('frequencia');
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  Abrir Chamada Geral
                </button>
                <button
                  type="button"
                  onClick={() => setShowPendingAuditModal(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
