import React, { useState, useEffect, useMemo } from 'react';
import { Student, AttendanceRecord, ActivityType, TurmaType, WeekInfo } from './types';
import { loadStudents, saveStudents, loadAttendanceRecords, saveAttendanceRecords, loadTurmas, saveTurmas, resetAllData, isMockStudent } from './utils/storageUtils';
import { getISOWeekNumber, getWeekInfo, toISODateString } from './utils/dateUtils';
import { Header, TabType } from './components/Header';
import { WeekSelector } from './components/WeekSelector';
import { AttendanceSheet } from './components/AttendanceSheet';
import { StudentManager } from './components/StudentManager';
import { WeeklyReport } from './components/WeeklyReport';
import { WeeklyLibrary } from './components/WeeklyLibrary';
import {
  subscribeStudents,
  subscribeRecords,
  subscribeTurmas,
  saveStudentToFirestore,
  deleteStudentFromFirestore,
  saveRecordToFirestore,
  saveTurmaToFirestore,
  deleteTurmaFromFirestore,
  seedInitialDataToFirestore,
  testFirestoreConnection,
  deleteDoc,
  doc,
  db,
} from './firebase';

export default function App() {
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [turmas, setTurmas] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('frequencia');
  const [firebaseConnected, setFirebaseConnected] = useState<boolean>(false);

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
    const loadedTurmas = loadTurmas();
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

    const unsubStudents = subscribeStudents((fsStudents) => {
      // Identify and remove mock/fictional model students from Firestore if present
      const mockStudentsInFs = fsStudents.filter((s) => isMockStudent(s));
      if (mockStudentsInFs.length > 0) {
        mockStudentsInFs.forEach((s) => deleteStudentFromFirestore(s.id));
      }

      const realStudents = fsStudents.filter((s) => !isMockStudent(s));
      setStudents(realStudents);
      saveStudents(realStudents);

      if (isInitialStudentsSync && realStudents.length === 0 && loadedStudents.length > 0) {
        seedInitialDataToFirestore(loadedStudents, [], []);
      }
      isInitialStudentsSync = false;
    });

    const unsubRecords = subscribeRecords((fsRecords) => {
      // Filter out records created for mock students
      const realRecords = fsRecords.filter((r) => !isMockStudent({ id: r.studentId }));
      setRecords(realRecords);
      saveAttendanceRecords(realRecords);
      
      if (isInitialRecordsSync && realRecords.length === 0 && loadedRecords.length > 0) {
        seedInitialDataToFirestore([], loadedRecords, []);
      }
      isInitialRecordsSync = false;
    });

    const unsubTurmas = subscribeTurmas((fsTurmas) => {
      if (fsTurmas.length > 0) {
        setTurmas(fsTurmas);
        saveTurmas(fsTurmas);
      } else if (isInitialTurmasSync && loadedTurmas.length > 0) {
        seedInitialDataToFirestore([], [], loadedTurmas);
      }
      isInitialTurmasSync = false;
    });

    return () => {
      unsubStudents();
      unsubRecords();
      unsubTurmas();
    };
  }, []);

  // Event listener for date selection from day pills
  useEffect(() => {
    const handleSelectDate = (e: CustomEvent<string>) => {
      setSelectedDate(e.detail);
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
    const updated = [...turmas, name];
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

  // Records count for the current week
  const weekRecordsCount = useMemo(() => {
    return records.filter(
      (r) => r.weekNumber === currentWeek.weekNumber && r.year === currentWeek.year
    ).length;
  }, [records, currentWeek]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans antialiased flex flex-col">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        totalStudents={students.length}
        totalRecordsThisWeek={weekRecordsCount}
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
            currentWeek={currentWeek}
            selectedDate={selectedDate}
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
            currentWeek={currentWeek}
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
            currentWeek={currentWeek}
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
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 text-xs py-4 border-t border-slate-800 text-center print:hidden">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-center gap-2 text-left">
            <div>
              <span className="font-bold text-white">Frequência em Atividades Extracurriculares</span> • v1.2
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
