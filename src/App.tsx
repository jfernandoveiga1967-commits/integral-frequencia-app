import React, { useState, useEffect, useMemo } from 'react';
import { Student, AttendanceRecord, ActivityType, TurmaType, WeekInfo } from './types';
import { loadStudents, saveStudents, loadAttendanceRecords, saveAttendanceRecords, loadTurmas, saveTurmas, resetAllData } from './utils/storageUtils';
import { getISOWeekNumber, getWeekInfo, toISODateString } from './utils/dateUtils';
import { Header, TabType } from './components/Header';
import { WeekSelector } from './components/WeekSelector';
import { AttendanceSheet } from './components/AttendanceSheet';
import { StudentManager } from './components/StudentManager';
import { WeeklyReport } from './components/WeeklyReport';
import { WeeklyLibrary } from './components/WeeklyLibrary';

export default function App() {
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [turmas, setTurmas] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('frequencia');

  // Initial week and date setup
  const initialDateObj = new Date();
  const { year: initialYear, weekNumber: initialWeekNo } = getISOWeekNumber(initialDateObj);
  
  const [currentWeek, setCurrentWeek] = useState<WeekInfo>(() =>
    getWeekInfo(initialYear, initialWeekNo)
  );
  
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    toISODateString(initialDateObj)
  );

  // Load initial data from localStorage on mount
  useEffect(() => {
    const loadedStudents = loadStudents();
    const loadedRecords = loadAttendanceRecords();
    const loadedTurmas = loadTurmas();
    setStudents(loadedStudents);
    setRecords(loadedRecords);
    setTurmas(loadedTurmas);
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
  };

  const handleUpdateStudent = (updatedStudent: Student) => {
    const updated = students.map((s) => (s.id === updatedStudent.id ? updatedStudent : s));
    setStudents(updated);
    saveStudents(updated);
  };

  const handleDeleteStudent = (id: string) => {
    const updated = students.filter((s) => s.id !== id);
    setStudents(updated);
    saveStudents(updated);
  };

  // Save attendance record modifications
  const handleSaveRecord = (recordData: Omit<AttendanceRecord, 'id' | 'createdAt'>) => {
    const recordId = `${recordData.studentId}_${recordData.activity}_${recordData.date}`;
    
    setRecords((prev) => {
      const filtered = prev.filter((r) => r.id !== recordId);
      const newRecord: AttendanceRecord = {
        ...recordData,
        id: recordId,
        createdAt: new Date().toISOString(),
      };
      const updated = [newRecord, ...filtered];
      saveAttendanceRecords(updated);
      return updated;
    });
  };

  const handleBatchMarkPresent = (
    studentIds: string[],
    activity: ActivityType,
    date: string
  ) => {
    setRecords((prev) => {
      // Create set of keys to update
      const targetKeys = new Set(studentIds.map((sid) => `${sid}_${activity}_${date}`));
      
      const filtered = prev.filter((r) => !targetKeys.has(r.id));
      
      const batchNewRecords: AttendanceRecord[] = studentIds.map((studentId) => {
        const student = students.find((s) => s.id === studentId);
        return {
          id: `${studentId}_${activity}_${date}`,
          studentId,
          activity,
          turma: student ? student.turma : '1º Ano Azul',
          date,
          weekNumber: currentWeek.weekNumber,
          year: currentWeek.year,
          status: 'presente',
          createdAt: new Date().toISOString(),
        };
      });

      const updated = [...batchNewRecords, ...filtered];
      saveAttendanceRecords(updated);
      return updated;
    });
  };

  const handleClearRecords = (
    studentIds: string[],
    activity: ActivityType,
    date: string
  ) => {
    setRecords((prev) => {
      const targetKeys = new Set(studentIds.map((sid) => `${sid}_${activity}_${date}`));
      const updated = prev.filter((r) => !targetKeys.has(r.id));
      saveAttendanceRecords(updated);
      return updated;
    });
  };

  // Turma management
  const handleAddTurma = (newTurmaName: string): boolean => {
    const name = newTurmaName.trim();
    if (!name || turmas.includes(name)) return false;
    const updated = [...turmas, name];
    setTurmas(updated);
    saveTurmas(updated);
    return true;
  };

  const handleDeleteTurma = (turmaName: string, deleteStudents: boolean = true, targetTurmaToReassign?: string) => {
    const updatedTurmas = turmas.filter((t) => t !== turmaName);
    setTurmas(updatedTurmas);
    saveTurmas(updatedTurmas);

    if (deleteStudents) {
      // Remove all students belonging to this turma
      const studentIdsToRemove = new Set(students.filter((s) => s.turma === turmaName).map((s) => s.id));
      const updatedStudents = students.filter((s) => s.turma !== turmaName);
      setStudents(updatedStudents);
      saveStudents(updatedStudents);

      // Clean attendance records for removed students
      const updatedRecords = records.filter((r) => !studentIdsToRemove.has(r.studentId));
      setRecords(updatedRecords);
      saveAttendanceRecords(updatedRecords);
    } else if (targetTurmaToReassign) {
      // Reassign students to targetTurmaToReassign
      const updatedStudents = students.map((s) => s.turma === turmaName ? { ...s, turma: targetTurmaToReassign } : s);
      setStudents(updatedStudents);
      saveStudents(updatedStudents);

      const updatedRecords = records.map((r) => r.turma === turmaName ? { ...r, turma: targetTurmaToReassign } : r);
      setRecords(updatedRecords);
      saveAttendanceRecords(updatedRecords);
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
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <span className="font-bold text-white">Frequência em Atividades Extracurriculares</span> • Sistema de Chamada e Ocorrências
          </div>
          <div className="text-slate-500">
            Natação • Balé • Dança • Judô • Futebol • Ginástica • Flauta
          </div>
        </div>
      </footer>
    </div>
  );
}
