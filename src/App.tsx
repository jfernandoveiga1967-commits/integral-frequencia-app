import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, GraduationCap, UserCheck, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Student, AttendanceRecord, ActivityType, TurmaType, WeekInfo, UserProfile, UserRole, ActivityItem } from './types';
import { loadStudents, saveStudents, loadAttendanceRecords, saveAttendanceRecords, loadTurmas, saveTurmas, loadActivities, saveActivities, resetAllData, isMockStudent } from './utils/storageUtils';
import { getISOWeekNumber, getWeekInfo, toISODateString } from './utils/dateUtils';
import { getStoredUser, saveStoredUser, getLocalUsersList, saveLocalUsersList, PRESET_USERS } from './utils/authUtils';
import { Header, TabType } from './components/Header';
import { WeekSelector } from './components/WeekSelector';
import { AttendanceSheet } from './components/AttendanceSheet';
import { StudentManager } from './components/StudentManager';
import { WeeklyReport } from './components/WeeklyReport';
import { WeeklyLibrary } from './components/WeeklyLibrary';
import { UserManagement } from './components/UserManagement';
import { LoginScreen } from './components/LoginScreen';
import {
  subscribeStudents,
  subscribeRecords,
  subscribeTurmas,
  subscribeUsers,
  subscribeActivities,
  saveStudentToFirestore,
  deleteStudentFromFirestore,
  saveRecordToFirestore,
  saveTurmaToFirestore,
  deleteTurmaFromFirestore,
  saveUserToFirestore,
  deleteUserFromFirestore,
  saveActivityToFirestore,
  deleteActivityFromFirestore,
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
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [turmas, setTurmas] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('frequencia');
  const [firebaseConnected, setFirebaseConnected] = useState<boolean>(false);

  // Keep a stable ref of currentUser for real-time listener updates
  const currentUserRef = React.useRef<UserProfile | null>(currentUser);
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
  };

  const handleLogout = () => {
    setCurrentUser(null);
    saveStoredUser(null);
  };

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
    const loadedTurmas = loadTurmas().sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
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
        const sortedTurmas = [...fsTurmas].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
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

      // Strictly deduplicate by email
      const dedupMap = new Map<string, UserProfile>();
      cleanFsUsers.forEach((u) => {
        const key = (u.email || '').trim().toLowerCase() || u.id;
        if (!dedupMap.has(key)) {
          dedupMap.set(key, u);
        }
      });

      PRESET_USERS.forEach((pu) => {
        const key = (pu.email || '').trim().toLowerCase() || pu.id;
        if (!dedupMap.has(key)) {
          dedupMap.set(key, pu);
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
        setActivitiesList(fsActivities);
        saveActivities(fsActivities);
      } else {
        // Seed default initial activities to Firestore
        const defaultActs = loadActivities();
        defaultActs.forEach((act) => saveActivityToFirestore(act));
      }
    });

    return () => {
      unsubStudents();
      unsubRecords();
      unsubTurmas();
      unsubUsers();
      unsubActivities();
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
  const handleAddStudent = (newStudentData: Omit<Student, 'id'>) => {
    const newStudent: Student = {
      ...newStudentData,
      id: `st-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    };
    const updated = [newStudent, ...students];
    setStudents(updated);
    saveStudents(updated);
    saveStudentToFirestore(newStudent);
  };

  const handleBatchAddStudents = (
    names: string[],
    turma: TurmaType,
    activities: ActivityType[]
  ) => {
    const newStudentsList: Student[] = names.map((name, idx) => ({
      id: `st-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      name,
      turma,
      activities,
    }));

    const updated = [...newStudentsList, ...students];
    setStudents(updated);
    saveStudents(updated);
    newStudentsList.forEach((s) => saveStudentToFirestore(s));
  };

  const handleUpdateStudent = (updatedStudent: Student) => {
    const updated = students.map((s) => (s.id === updatedStudent.id ? updatedStudent : s));
    setStudents(updated);
    saveStudents(updated);
    saveStudentToFirestore(updatedStudent);
  };

  const handleDeleteStudent = (id: string) => {
    const updated = students.filter((s) => s.id !== id);
    setStudents(updated);
    saveStudents(updated);
    deleteStudentFromFirestore(id);
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
    const updated = [...turmas, name].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
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

  // Records count for the current week
  const weekRecordsCount = useMemo(() => {
    return records.filter(
      (r) => r.weekNumber === currentWeek.weekNumber && r.year === currentWeek.year
    ).length;
  }, [records, currentWeek]);

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
        totalRecordsThisWeek={weekRecordsCount}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Week Selector Bar */}
        <WeekSelector
          currentWeek={currentWeek}
          selectedDate={selectedDate}
          onWeekChange={setCurrentWeek}
          onDateChange={setSelectedDate}
          onGoToCurrentWeek={handleGoToCurrentWeek}
          onOpenLibrary={() => setActiveTab('biblioteca')}
        />

        {/* Tab 1: Chamada de Frequência */}
        {activeTab === 'frequencia' && (
          <AttendanceSheet
            students={students}
            records={records}
            turmas={turmas}
            activitiesList={activitiesList}
            currentWeek={currentWeek}
            selectedDate={selectedDate}
            currentUser={currentUser}
            onSaveRecord={handleSaveRecord}
            onBatchMarkPresent={handleBatchMarkPresent}
            onClearRecords={handleClearRecords}
          />
        )}

        {/* Tab 2: Alunos e Turmas */}
        {activeTab === 'alunos' && (
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

        {/* Tab 3: Relatório Semanal */}
        {activeTab === 'relatorio' && (
          <WeeklyReport
            students={students}
            records={records}
            turmas={turmas}
            activitiesList={activitiesList}
            currentWeek={currentWeek}
            currentUser={currentUser}
            onDeleteTurma={handleDeleteTurma}
          />
        )}

        {/* Tab 4: Biblioteca de Semanas */}
        {activeTab === 'biblioteca' && (
          <WeeklyLibrary
            students={students}
            records={records}
            currentWeek={currentWeek}
            onSelectWeek={handleSelectWeekFromLibrary}
          />
        )}

        {/* Tab 5: Gerenciamento de Usuários (Apenas Coordenador/Admin) */}
        {activeTab === 'usuarios' && (
          <UserManagement
            currentUser={currentUser}
            users={users}
            activitiesList={activitiesList}
            turmas={turmas}
            onSaveUser={handleSaveUser}
            onDeleteUser={handleDeleteUser}
            onSaveActivity={handleSaveActivity}
            onDeleteActivity={handleDeleteActivity}
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
    </div>
  );
}
