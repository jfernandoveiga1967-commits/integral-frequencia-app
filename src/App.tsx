import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ShieldCheck, GraduationCap, UserCheck, ArrowRight, ChevronDown, ChevronUp, AlertTriangle, X, Search, CheckCircle, Calendar, UserX } from 'lucide-react';
import { Student, AttendanceRecord, ActivityType, TurmaType, WeekInfo, UserProfile, UserRole, ActivityItem, ScheduleBlock, HolidayItem, PontoRecord, PontoMonthClosing, DayOfWeek } from './types';
import { INITIAL_HOLIDAYS, ACTIVITIES_LIST } from './data/initialData';
import { loadStudents, saveStudents, loadAttendanceRecords, saveAttendanceRecords, loadTurmas, saveTurmas, loadActivities, saveActivities, loadSchedules, saveSchedules, loadHolidays, saveHolidays, resetAllData, isMockStudent } from './utils/storageUtils';
import { getISOWeekNumber, getWeekInfo, toISODateString, formatDateBR } from './utils/dateUtils';
import { sortTurmasPedagogical } from './utils/turmaUtils';
import { getDailyConsolidatedMetrics } from './utils/frequenciaUtils';
import { getStoredUser, saveStoredUser, getLocalUsersList, saveLocalUsersList, PRESET_USERS, isCoordenador } from './utils/authUtils';
import { Header, TabType } from './components/Header';
import { AttendanceSheet } from './components/AttendanceSheet';
import { CurrentActivities } from './components/CurrentActivities';
import { StudentManager } from './components/StudentManager';
import { WeeklyReport } from './components/WeeklyReport';
import { WeeklyLibrary } from './components/WeeklyLibrary';
import { UserManagement } from './components/UserManagement';
import { LivroPonto } from './components/LivroPonto';
import { LoginScreen } from './components/LoginScreen';
import { useWebPushNotifications } from './hooks/useWebPushNotifications';
import {
  subscribeStudents,
  subscribeRecords,
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
  saveStudentToFirestore,
  deleteStudentFromFirestore,
  saveRecordToFirestore,
  saveTurmaToFirestore,
  deleteTurmaFromFirestore,
  saveUserToFirestore,
  deleteUserFromFirestore,
  saveActivityToFirestore,
  deleteActivityFromFirestore,
  saveScheduleBlockToFirestore,
  deleteScheduleBlockFromFirestore,
  saveAllSchedulesToFirestore,
  batchSyncSchedulesToFirestore,
  saveHolidayToFirestore,
  deleteHolidayFromFirestore,
  batchSaveHolidaysToFirestore,
  seedInitialDataToFirestore,
  testFirestoreConnection,
  deleteDoc,
  doc,
  db,
} from './firebase';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => getStoredUser());
  const [users, setUsers] = useState<UserProfile[]>(() => getLocalUsersList());
  const [activitiesList, setActivitiesList] = useState<ActivityItem[]>(() => loadActivities());
  const [schedules, setSchedules] = useState<ScheduleBlock[]>(() => loadSchedules());
  const [holidays, setHolidays] = useState<HolidayItem[]>(() => loadHolidays());
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [turmas, setTurmas] = useState<string[]>([]);
  const [pontoRecords, setPontoRecords] = useState<PontoRecord[]>([]);
  const [pontoClosings, setPontoClosings] = useState<PontoMonthClosing[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('momento');
  const [firebaseConnected, setFirebaseConnected] = useState<boolean>(false);

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

    // Redirect user to appropriate initial tab:
    // Non-admin / non-coordenador users (Monitor / Professor) are directed to 'momento' (or 'frequencia')
    if (finalUser.role !== 'coordenador') {
      setActiveTab('momento');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    saveStoredUser(null);
    setActiveTab('momento');
  };

  // Route protection: ensure non-coordenador cannot stay on restricted management tabs
  useEffect(() => {
    if (currentUser && !isCoordenador(currentUser)) {
      const restrictedTabs: TabType[] = ['alunos', 'relatorio', 'biblioteca', 'usuarios'];
      if (restrictedTabs.includes(activeTab)) {
        setActiveTab('momento');
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

  // Load initial local data & sync with Firebase Firestore real-time listeners
  useEffect(() => {
    const loadedStudents = loadStudents();
    const loadedRecords = loadAttendanceRecords();
    const loadedTurmas = sortTurmasPedagogical(loadTurmas());
    setStudents(loadedStudents);
    setRecords(loadedRecords);
    setTurmas(loadedTurmas);

    // Test Firestore connectivity
    testFirestoreConnection().then((connected) => {
      setFirebaseConnected(connected);
    });

    let isInitialStudentsSync = true;
    let isInitialRecordsSync = true;
    let isInitialTurmasSync = true;

    const cleanedMockStudentIds = new Set<string>();
    const cleanedMockRecordIds = new Set<string>();

    const unsubStudents = subscribeStudents((fsStudents) => {
      // Safely queue mock student deletions without repeating or looping
      const mockStudentsInFs = fsStudents.filter((s) => isMockStudent(s));
      mockStudentsInFs.forEach((s) => {
        if (!cleanedMockStudentIds.has(s.id)) {
          cleanedMockStudentIds.add(s.id);
          deleteStudentFromFirestore(s.id).catch(() => {});
        }
      });

      const realStudents = fsStudents.filter((s) => !isMockStudent(s));
      setStudents(realStudents);
      saveStudents(realStudents);

      if (isInitialStudentsSync && realStudents.length === 0 && loadedStudents.length > 0) {
        const realLoaded = loadedStudents.filter((s) => !isMockStudent(s));
        if (realLoaded.length > 0) {
          seedInitialDataToFirestore(realLoaded, [], []);
        }
      }
      isInitialStudentsSync = false;
    });

    const unsubRecords = subscribeRecords((fsRecords) => {
      // Filter out records created for mock students
      const mockRecordsInFs = fsRecords.filter(
        (r) => isMockStudent({ id: r.studentId }) || r.id.startsWith('st-1_') || r.id.startsWith('st-2_') || r.id.startsWith('st-3_')
      );
      mockRecordsInFs.forEach((r) => {
        if (!cleanedMockRecordIds.has(r.id)) {
          cleanedMockRecordIds.add(r.id);
          deleteDoc(doc(db, 'attendanceRecords', r.id)).catch(() => {});
        }
      });

      const realRecords = fsRecords.filter((r) => !isMockStudent({ id: r.studentId }));
      setRecords(realRecords);
      saveAttendanceRecords(realRecords);

      if (isInitialRecordsSync && realRecords.length === 0 && loadedRecords.length > 0) {
        const realLoadedRecs = loadedRecords.filter((r) => !isMockStudent({ id: r.studentId }));
        if (realLoadedRecs.length > 0) {
          seedInitialDataToFirestore([], realLoadedRecs, []);
        }
      }
      isInitialRecordsSync = false;
    });

    const unsubTurmas = subscribeTurmas((fsTurmas) => {
      if (fsTurmas.length > 0) {
        const sortedTurmas = sortTurmasPedagogical(fsTurmas);
        setTurmas(sortedTurmas);
        saveTurmas(sortedTurmas);
      } else if (isInitialTurmasSync && loadedTurmas.length > 0) {
        seedInitialDataToFirestore([], [], loadedTurmas);
      }
      isInitialTurmasSync = false;
    });

    const unsubUsers = subscribeUsers((fsUsers) => {
      // Cleanup any unwanted mock profiles
      fsUsers.forEach((u) => {
        if (
          u.id === 'usr_prof_1' ||
          u.id === 'usr_aux_1' ||
          u.name.toLowerCase().includes('marcos silva') ||
          u.name.toLowerCase().includes('mariana santos') ||
          u.name.toLowerCase().includes('marina santos') ||
          u.email === 'marcos.professor@crescer.edu.br' ||
          u.email === 'mariana.auxiliar@crescer.edu.br'
        ) {
          deleteUserFromFirestore(u.id);
        }
      });

      // Self-heal Fernando Veiga in Firestore if missing or if marked with wrong role
      const adminUsersInFs = fsUsers.filter(
        (u) =>
          (u.email && u.email.toLowerCase() === 'jfernandoveiga1967@gmail.com') ||
          u.id === 'usr_coord_1' ||
          u.name.toLowerCase().includes('fernando veiga')
      );

      if (adminUsersInFs.length === 0) {
        saveUserToFirestore(PRESET_USERS[0]);
      } else {
        // If there are duplicate admin documents in Firestore (e.g. non usr_coord_1 or with incomplete activities), delete duplicates
        adminUsersInFs.forEach((adm) => {
          if (adm.id !== 'usr_coord_1') {
            deleteUserFromFirestore(adm.id);
          } else if (
            adm.role !== 'coordenador' ||
            adm.cargoLabel !== 'Coordenador (Administrador)' ||
            !adm.canManageStudents ||
            !adm.canMarkAttendance ||
            !adm.assignedActivities ||
            adm.assignedActivities.length < 7
          ) {
            saveUserToFirestore({
              ...adm,
              id: 'usr_coord_1',
              name: 'Fernando Veiga',
              email: 'jfernandoveiga1967@gmail.com',
              role: 'coordenador',
              cargoLabel: 'Coordenador (Administrador)',
              avatarColor: 'bg-amber-500',
              assignedActivities: ['Natação', 'Balé', 'Dança', 'Judô', 'Futebol', 'Ginástica', 'Flauta'],
              assignedTurmas: ['1º Ano Azul', '1º Ano Amarelo', '2º Ano Azul', '2º Ano Amarelo', '3º Ano', '4º Ano', '5º Ano', '6º ao 9º Ano'],
              allowedClassIds: ['1º Ano Azul', '1º Ano Amarelo', '2º Ano Azul', '2º Ano Amarelo', '3º Ano', '4º Ano', '5º Ano', '6º ao 9º Ano'],
              canManageStudents: true,
              canMarkAttendance: true,
            });
          }
        });
      }

      const cleanFsUsers = fsUsers
        .filter(
          (u) =>
            u.id !== 'usr_prof_1' &&
            u.id !== 'usr_aux_1' &&
            !u.name.toLowerCase().includes('marcos silva') &&
            !u.name.toLowerCase().includes('mariana santos') &&
            !u.name.toLowerCase().includes('marina santos') &&
            u.email !== 'marcos.professor@crescer.edu.br' &&
            u.email !== 'mariana.auxiliar@crescer.edu.br'
        )
        .map((u) => {
          if (
            (u.email && u.email.toLowerCase() === 'jfernandoveiga1967@gmail.com') ||
            u.id === 'usr_coord_1' ||
            u.name.toLowerCase().includes('fernando veiga')
          ) {
            return {
              ...u,
              id: 'usr_coord_1',
              name: 'Fernando Veiga',
              email: 'jfernandoveiga1967@gmail.com',
              role: 'coordenador' as UserRole,
              cargoLabel: 'Coordenador (Administrador)',
              avatarColor: 'bg-amber-500',
              assignedActivities: ['Natação', 'Balé', 'Dança', 'Judô', 'Futebol', 'Ginástica', 'Flauta'],
              assignedTurmas: ['1º Ano Azul', '1º Ano Amarelo', '2º Ano Azul', '2º Ano Amarelo', '3º Ano', '4º Ano', '5º Ano', '6º ao 9º Ano'],
              allowedClassIds: ['1º Ano Azul', '1º Ano Amarelo', '2º Ano Azul', '2º Ano Amarelo', '3º Ano', '4º Ano', '5º Ano', '6º ao 9º Ano'],
              canManageStudents: true,
              canMarkAttendance: true,
            };
          }
          return u;
        });

      // Strictly deduplicate by ID and email (Firestore users always take absolute precedence over hardcoded presets)
      const dedupMap = new Map<string, UserProfile>();
      cleanFsUsers.forEach((u) => {
        const idKey = u.id;
        const emailKey = (u.email || '').trim().toLowerCase();
        const primaryKey = idKey || emailKey;
        if (primaryKey && !dedupMap.has(primaryKey)) {
          dedupMap.set(primaryKey, u);
        }
      });

      PRESET_USERS.forEach((pu) => {
        const emailKey = (pu.email || '').trim().toLowerCase();
        const alreadyExists = Array.from(dedupMap.values()).some(
          (existing) =>
            existing.id === pu.id ||
            (emailKey && existing.email && existing.email.trim().toLowerCase() === emailKey)
        );
        if (!alreadyExists) {
          const key = pu.id || emailKey;
          if (key) dedupMap.set(key, pu);
        }
      });

      const merged = Array.from(dedupMap.values());
      setUsers(merged);
      saveLocalUsersList(merged);

      // Real-time permission sync for current active session
      const activeSelf = currentUserRef.current;
      if (activeSelf) {
        const updatedSelf = merged.find(
          (u) => u.id === activeSelf.id || (u.email && activeSelf.email && u.email.toLowerCase() === activeSelf.email.toLowerCase())
        );
        if (updatedSelf) {
          const isMasterAdmin =
            (updatedSelf.email && updatedSelf.email.toLowerCase() === 'jfernandoveiga1967@gmail.com') ||
            updatedSelf.id === 'usr_coord_1';
          const enforcedSelf: UserProfile = isMasterAdmin
            ? {
                ...updatedSelf,
                name: 'Fernando Veiga',
                email: 'jfernandoveiga1967@gmail.com',
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
            // If requiresRollCall is false in Firestore, fix it immediately in Firestore
            if (act.requiresRollCall !== true) {
              saveActivityToFirestore({
                ...officialTemplate,
                ...act,
                requiresRollCall: true,
              });
            }
            return {
              ...officialTemplate,
              ...act,
              requiresRollCall: true,
            };
          }
          return act;
        });

        // If any official activity is missing from Firestore, seed it to Firestore
        ACTIVITIES_LIST.forEach((officialAct) => {
          if (!healedActivities.some((a) => a.id === officialAct.id || a.name === officialAct.name)) {
            saveActivityToFirestore(officialAct);
            healedActivities.push(officialAct);
          }
        });

        setActivitiesList(healedActivities);
        saveActivities(healedActivities);
      } else {
        // Seed default initial activities to Firestore
        const defaultActs = loadActivities();
        defaultActs.forEach((act) => saveActivityToFirestore(act));
        setActivitiesList(defaultActs);
      }
    });

    const unsubSchedules = subscribeToSchedules((fsSchedules) => {
      setSchedules(fsSchedules);
      saveSchedules(fsSchedules);
    });

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
        if (needsSync) {
          batchSaveHolidaysToFirestore(normalized).catch(() => {});
        }
      } else {
        const defaultHols = loadHolidays();
        setHolidays(defaultHols);
        batchSaveHolidaysToFirestore(defaultHols).catch(() => {});
      }
    });

    const unsubPontoRecords = subscribePontoRecords((fsPontoRecords) => {
      setPontoRecords(fsPontoRecords);
    });

    const unsubPontoClosings = subscribePontoClosings((fsPontoClosings) => {
      setPontoClosings(fsPontoClosings);
    });

    return () => {
      unsubStudents();
      unsubRecords();
      unsubTurmas();
      unsubUsers();
      unsubActivities();
      unsubSchedules();
      unsubHolidays();
      unsubPontoRecords();
      unsubPontoClosings();
    };
  }, []);

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
    const newStudent: Student = {
      ...newStudentData,
      id: `st-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    };
    setStudents((prev) => {
      const updated = [newStudent, ...prev];
      saveStudents(updated);
      return updated;
    });
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
    const newStudentsList: Student[] = names.map((name, idx) => ({
      id: `st-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      name,
      turma,
      activities,
      diasFrequencia: diasFrequencia && diasFrequencia.length > 0 ? diasFrequencia : ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    }));

    setStudents((prev) => {
      const updated = [...newStudentsList, ...prev];
      saveStudents(updated);
      return updated;
    });

    try {
      await Promise.allSettled(newStudentsList.map((s) => saveStudentToFirestore(s)));
    } catch (err) {
      console.error('Error batch adding students to Firestore:', err);
    }
  };

  const handleUpdateStudent = async (updatedStudent: Student) => {
    setStudents((prev) => {
      const updated = prev.map((s) => (s.id === updatedStudent.id ? updatedStudent : s));
      saveStudents(updated);
      return updated;
    });
    try {
      await saveStudentToFirestore(updatedStudent);
    } catch (err) {
      console.error('Error updating student in Firestore:', err);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    setStudents((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      saveStudents(updated);
      return updated;
    });
    try {
      await deleteStudentFromFirestore(id);
    } catch (err) {
      console.error('Error deleting student from Firestore:', err);
    }
  };

  // Save attendance record modifications
  const handleSaveRecord = (recordData: Omit<AttendanceRecord, 'id' | 'createdAt'>) => {
    const recordId = `${recordData.studentId}_${recordData.activity}_${recordData.date}`;
    const newRecord: AttendanceRecord = {
      ...recordData,
      id: recordId,
      createdAt: new Date().toISOString(),
    };
    
    setRecords((prev) => {
      const filtered = prev.filter((r) => r.id !== recordId);
      const updated = [newRecord, ...filtered];
      saveAttendanceRecords(updated);
      return updated;
    });
    saveRecordToFirestore(newRecord);
  };

  const handleBatchMarkPresent = (
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

    setRecords((prev) => {
      const filtered = prev.filter((r) => !targetKeys.has(r.id));
      const updated = [...batchNewRecords, ...filtered];
      saveAttendanceRecords(updated);
      return updated;
    });

    batchNewRecords.forEach((r) => saveRecordToFirestore(r));
  };

  const handleClearRecords = (
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
      saveAttendanceRecords(updated);
      return updated;
    });

    targetKeys.forEach((key) => {
      deleteDoc(doc(db, 'attendanceRecords', key)).catch((err) =>
        console.error('Error clearing Firestore record:', err)
      );
    });
  };

  // Turma management
  const handleAddTurma = (newTurmaName: string): boolean => {
    const name = newTurmaName.trim();
    if (!name || turmas.includes(name)) return false;
    const updated = sortTurmasPedagogical([...turmas, name]);
    setTurmas(updated);
    saveTurmas(updated);
    saveTurmaToFirestore(name);
    return true;
  };

  const handleDeleteTurma = (turmaName: string, deleteStudents: boolean = true, targetTurmaToReassign?: string) => {
    const updatedTurmas = turmas.filter((t) => t !== turmaName);
    setTurmas(updatedTurmas);
    saveTurmas(updatedTurmas);
    deleteTurmaFromFirestore(turmaName);

    if (deleteStudents) {
      // Remove all students belonging to this turma
      const studentIdsToRemove = new Set<string>(students.filter((s) => s.turma === turmaName).map((s) => s.id));
      const updatedStudents = students.filter((s) => s.turma !== turmaName);
      setStudents(updatedStudents);
      saveStudents(updatedStudents);

      studentIdsToRemove.forEach((sid) => deleteStudentFromFirestore(sid));

      // Clean attendance records for removed students
      const updatedRecords = records.filter((r) => !studentIdsToRemove.has(r.studentId));
      setRecords(updatedRecords);
      saveAttendanceRecords(updatedRecords);

      records.filter((r) => studentIdsToRemove.has(r.studentId)).forEach((r) => {
        deleteDoc(doc(db, 'attendanceRecords', r.id)).catch(() => {});
      });
    } else if (targetTurmaToReassign) {
      // Reassign students to targetTurmaToReassign
      const updatedStudents = students.map((s) => s.turma === turmaName ? { ...s, turma: targetTurmaToReassign } : s);
      setStudents(updatedStudents);
      saveStudents(updatedStudents);

      updatedStudents.filter((s) => s.turma === targetTurmaToReassign).forEach((s) => saveStudentToFirestore(s));

      const updatedRecords = records.map((r) => r.turma === turmaName ? { ...r, turma: targetTurmaToReassign } : r);
      setRecords(updatedRecords);
      saveAttendanceRecords(updatedRecords);

      updatedRecords.filter((r) => r.turma === targetTurmaToReassign).forEach((r) => saveRecordToFirestore(r));
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

  const handleSaveUser = (userToSave: UserProfile) => {
    const existingIdx = users.findIndex((u) => u.id === userToSave.id);
    let updatedUsers: UserProfile[];
    if (existingIdx >= 0) {
      updatedUsers = [...users];
      updatedUsers[existingIdx] = userToSave;
    } else {
      updatedUsers = [userToSave, ...users];
    }
    setUsers(updatedUsers);
    saveLocalUsersList(updatedUsers);
    saveUserToFirestore(userToSave);

    // If currentUser was saved, update state & storage immediately
    if (currentUser && currentUser.id === userToSave.id) {
      setCurrentUser(userToSave);
      saveStoredUser(userToSave);
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

  const handleDeleteUser = (userId: string) => {
    const updatedUsers = users.filter((u) => u.id !== userId);
    setUsers(updatedUsers);
    saveLocalUsersList(updatedUsers);
    deleteUserFromFirestore(userId);
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
    saveActivityToFirestore(activityToSave);
  };

  const handleDeleteActivity = (activityId: string) => {
    const updatedActs = activitiesList.filter((a) => a.id !== activityId);
    setActivitiesList(updatedActs);
    saveActivities(updatedActs);
    deleteActivityFromFirestore(activityId);
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
    saveScheduleBlockToFirestore(block);
  };

  const handleDeleteScheduleBlock = (id: string) => {
    const updated = schedules.filter((s) => s.id !== id);
    setSchedules(updated);
    saveSchedules(updated);
    deleteScheduleBlockFromFirestore(id);
  };

  const handleBatchSaveSchedules = (
    blocks: ScheduleBlock[],
    deletedIds: string[] = [],
    newOrUpdatedOnly?: ScheduleBlock[]
  ) => {
    setSchedules(blocks);
    saveSchedules(blocks);
    if (deletedIds.length > 0) {
      batchSyncSchedulesToFirestore(newOrUpdatedOnly || blocks, deletedIds);
    } else {
      saveAllSchedulesToFirestore(newOrUpdatedOnly || blocks);
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
    saveHolidayToFirestore(holiday);
  };

  const handleDeleteHoliday = (holidayId: string) => {
    setHolidays((prev) => {
      const updated = prev.filter((h) => h.id !== holidayId);
      saveHolidays(updated);
      return updated;
    });
    deleteHolidayFromFirestore(holidayId);
  };

  const handleBatchSaveHolidays = (batch: HolidayItem[]) => {
    setHolidays(batch);
    saveHolidays(batch);
    batchSaveHolidaysToFirestore(batch);
  };

  // Ponto Records & Closings Handlers
  const handleSavePontoRecord = (record: PontoRecord) => {
    setPontoRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === record.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = record;
        return next;
      }
      return [...prev, record];
    });
    savePontoRecordToFirestore(record);
  };

  const handleBatchSavePontoRecords = (recordsToSave: PontoRecord[]) => {
    setPontoRecords((prev) => {
      const map = new Map<string, PontoRecord>();
      prev.forEach((r) => map.set(r.id, r));
      recordsToSave.forEach((r) => map.set(r.id, r));
      return Array.from(map.values());
    });
    batchSavePontoRecordsToFirestore(recordsToSave);
  };

  const handleSavePontoClosing = (closing: PontoMonthClosing) => {
    setPontoClosings((prev) => {
      const idx = prev.findIndex((c) => c.id === closing.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = closing;
        return next;
      }
      return [...prev, closing];
    });
    savePontoClosingToFirestore(closing);
  };

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
  const todayStr = toISODateString(new Date());
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

  // Filtered pending students for audit modal
  const filteredPendingStudents = useMemo(() => {
    return todayConsolidated.pendingStudents.filter((s) => {
      const matchTurma = pendingFilterTurma === 'all' || s.turma === pendingFilterTurma;
      const matchSearch =
        !pendingSearchTerm.trim() ||
        s.name.toLowerCase().includes(pendingSearchTerm.toLowerCase()) ||
        s.turma.toLowerCase().includes(pendingSearchTerm.toLowerCase());
      return matchTurma && matchSearch;
    });
  }, [todayConsolidated.pendingStudents, pendingFilterTurma, pendingSearchTerm]);

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
        totalStudents={students.length}
        totalAtivosHoje={todayConsolidated.totalAtivos}
        presentesHoje={todayConsolidated.presentes}
        faltasHoje={todayConsolidated.faltas}
        justificadosHoje={todayConsolidated.justificados}
        pendentesHoje={todayConsolidated.pendentes}
        onNavigateToPending={() => setShowPendingAuditModal(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 space-y-5">
        {/* Banner de Auditoria e Trava para Coordenação/Administração */}
        {todayConsolidated.pendentes > 0 && isCoordenador(currentUser) && (
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
                    Dia {formatDateBR(todayStr)}
                  </span>
                </div>
                <h4 className="text-sm font-extrabold text-amber-950 mt-1">
                  Existem {todayConsolidated.pendentes} {todayConsolidated.pendentes === 1 ? 'aluno com chamada pendente' : 'alunos com chamada pendente/não lançada'} hoje
                </h4>
                <p className="text-xs text-amber-800/90 mt-0.5">
                  Total apurado: <strong>{todayConsolidated.apurados}</strong> de <strong>{todayConsolidated.totalAtivos} matrículas ativas</strong> esperadas. Certifique-se de preencher todos os alunos antes de gerar relatórios consolidados em PDF.
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
              <button
                type="button"
                onClick={() => {
                  setSelectedDate(todayStr);
                  setActiveTab('frequencia');
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-amber-900 bg-amber-100/90 hover:bg-amber-200/80 border border-amber-300 transition-all cursor-pointer"
              >
                Ir para Chamada
              </button>
            </div>
          </div>
        )}
        {/* Tab 1: Chamada de Frequência */}
        {activeTab === 'frequencia' && (
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
        {activeTab === 'momento' && (
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
            onUpdateUserPhone={handleUpdateUserPhone}
            onSaveRecord={handleSaveRecord}
            onBatchMarkPresent={handleBatchMarkPresent}
            onClearRecords={handleClearRecords}
            onNavigateToAttendance={handleNavigateToAttendance}
          />
        )}

        {/* Tab 3: Alunos e Turmas (Apenas Coordenador/Admin) */}
        {activeTab === 'alunos' && isCoordenador(currentUser) && (
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

        {/* Tab 4: Relatório Semanal (Apenas Coordenador/Admin) */}
        {activeTab === 'relatorio' && isCoordenador(currentUser) && (
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

        {/* Tab 5: Biblioteca de Semanas (Apenas Coordenador/Admin) */}
        {activeTab === 'biblioteca' && isCoordenador(currentUser) && (
          <WeeklyLibrary
            students={students}
            records={records}
            currentWeek={currentWeek}
            onSelectWeek={handleSelectWeekFromLibrary}
          />
        )}

        {/* Tab 6: Gerenciamento de Usuários (Apenas Coordenador/Admin) */}
        {activeTab === 'usuarios' && isCoordenador(currentUser) && (
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
          />
        )}

        {/* Tab 6: Livro Ponto & Folha de Frequência */}
        {activeTab === 'ponto' && (
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
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 text-xs py-4 border-t border-slate-800 text-center print:hidden">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-center gap-2 text-left">
            <div>
              <span className="font-bold text-white">Frequência Extracurricular</span> • v1.2
            </div>
            {firebaseConnected && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Nuvem Conectada</span>
              </span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <div className="text-slate-500 text-[11px] hidden md:block">
              Natação • Balé • Dança • Judô • Futebol • Ginástica • Flauta
            </div>
          </div>
        </div>
      </footer>

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
                    {todayConsolidated.pendentes} alunos matriculados sem chamada de Rotina em {formatDateBR(todayStr)}
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
                  <p className="text-xs text-slate-400 mt-0.5">Todos os alunos correspondentes ao filtro estão com chamada lançada.</p>
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
