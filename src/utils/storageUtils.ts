import { Student, AttendanceRecord, ActivityType, TurmaType, AttendanceStatus } from '../types';
import { INITIAL_STUDENTS, TURMAS_LIST } from '../data/initialData';
import { getISOWeekNumber, getWeekInfo, getWeekDays, toISODateString } from './dateUtils';

const STUDENTS_KEY = 'integral_frequencia_students_v1';
const RECORDS_KEY = 'integral_frequencia_records_v1';
const TURMAS_KEY = 'integral_frequencia_turmas_v1';

export function loadTurmas(): string[] {
  try {
    const data = localStorage.getItem(TURMAS_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar turmas do LocalStorage:', e);
  }
  saveTurmas(TURMAS_LIST);
  return TURMAS_LIST;
}

export function saveTurmas(turmas: string[]): void {
  try {
    localStorage.setItem(TURMAS_KEY, JSON.stringify(turmas));
  } catch (e) {
    console.error('Erro ao salvar turmas:', e);
  }
}

export function isMockStudent(student: { id: string; name?: string }): boolean {
  if (!student || !student.id) return false;
  // Fictional model student IDs: st-1 through st-32 (pattern: st- followed by 1 or 2 digits)
  return /^st-\d{1,2}$/.test(student.id);
}

export function loadStudents(): Student[] {
  try {
    const data = localStorage.getItem(STUDENTS_KEY);
    if (data) {
      let parsed: Student[] = JSON.parse(data);
      let migrated = false;
      const newTurmas: TurmaType[] = ['Mini Maternal Azul', 'Maternal Azul', 'Infantil 1 Azul'];
      parsed = parsed.map((s, idx) => {
        if ((s.turma as string) === 'Mini Maternal / Maternal / Infantil 1 Azul') {
          migrated = true;
          return { ...s, turma: newTurmas[idx % 3] };
        }
        return s;
      });

      // Filter out any mock/fictional model students
      const originalLength = parsed.length;
      parsed = parsed.filter((s) => !isMockStudent(s));

      if (migrated || parsed.length !== originalLength) {
        saveStudents(parsed);
      }
      return parsed;
    }
  } catch (e) {
    console.error('Erro ao carregar alunos do LocalStorage:', e);
  }
  saveStudents(INITIAL_STUDENTS);
  return INITIAL_STUDENTS;
}

export function saveStudents(students: Student[]): void {
  try {
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
  } catch (e) {
    console.error('Erro ao salvar alunos:', e);
  }
}

export function loadAttendanceRecords(): AttendanceRecord[] {
  try {
    const data = localStorage.getItem(RECORDS_KEY);
    if (data) {
      let parsed: AttendanceRecord[] = JSON.parse(data);
      // Check if records are the initial 82 seed records (generated automatically)
      const isInitialSeed = parsed.some((r) => r.id.startsWith('st-1_') || r.id.startsWith('st-2_') || r.id.startsWith('st-3_'));
      if (isInitialSeed) {
        saveAttendanceRecords([]);
        return [];
      }
      return parsed;
    }
  } catch (e) {
    console.error('Erro ao carregar registros do LocalStorage:', e);
  }
  
  saveAttendanceRecords([]);
  return [];
}

export function saveAttendanceRecords(records: AttendanceRecord[]): void {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('Erro ao salvar registros:', e);
  }
}

export function resetAllData(): void {
  localStorage.removeItem(STUDENTS_KEY);
  localStorage.removeItem(RECORDS_KEY);
  localStorage.removeItem(TURMAS_KEY);
}

function generateInitialSeedRecords(): AttendanceRecord[] {
  return [];
}
