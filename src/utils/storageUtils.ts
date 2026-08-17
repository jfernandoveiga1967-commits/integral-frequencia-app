import { Student, AttendanceRecord, ActivityType, TurmaType, AttendanceStatus, ActivityItem, ScheduleBlock, HolidayItem } from '../types';
import { INITIAL_STUDENTS, TURMAS_LIST, ACTIVITIES_LIST, INITIAL_HOLIDAYS } from '../data/initialData';
import { getISOWeekNumber, getWeekInfo, getWeekDays, toISODateString } from './dateUtils';

const STUDENTS_KEY = 'integral_frequencia_students_v1';
const RECORDS_KEY = 'integral_frequencia_records_v1';
const TURMAS_KEY = 'integral_frequencia_turmas_v1';
const ACTIVITIES_KEY = 'integral_frequencia_activities_v1';
const SCHEDULES_KEY = 'integral_frequencia_schedules_v1';
const HOLIDAYS_KEY = 'integral_frequencia_holidays_v1';

export function loadHolidays(): HolidayItem[] {
  try {
    const data = localStorage.getItem(HOLIDAYS_KEY);
    if (data) {
      const parsed: HolidayItem[] = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Create lookup map for initial data to enrich any missing endDates
        const initialMap = new Map<string, HolidayItem>();
        INITIAL_HOLIDAYS.forEach((initH) => {
          initialMap.set(initH.id, initH);
          initialMap.set(initH.name.toLowerCase().trim(), initH);
        });

        let migrated = false;
        const normalized = parsed.map((h) => {
          let updated = { ...h };
          
          // Normalize any old types ('ferias', 'ponto_facultativo') to 'recesso'
          if ((updated.type as string) === 'ferias' || (updated.type as string) === 'ponto_facultativo') {
            updated.type = 'recesso';
            migrated = true;
          }

          // If this is a known initial holiday that originally lacked endDate in previous storage versions, enrich it
          if (!updated.endDate) {
            const initMatch = initialMap.get(updated.id) || initialMap.get(updated.name.toLowerCase().trim());
            if (initMatch && initMatch.endDate) {
              updated.endDate = initMatch.endDate;
              migrated = true;
            }
          }

          return updated;
        });

        if (migrated) {
          saveHolidays(normalized);
        }
        return normalized.sort((a, b) => a.date.localeCompare(b.date));
      }
    }
  } catch (e) {
    console.error('Erro ao carregar feriados do LocalStorage:', e);
  }
  saveHolidays(INITIAL_HOLIDAYS);
  return INITIAL_HOLIDAYS;
}

export function saveHolidays(holidays: HolidayItem[]): void {
  try {
    const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem(HOLIDAYS_KEY, JSON.stringify(sorted));
  } catch (e) {
    console.error('Erro ao salvar feriados:', e);
  }
}


export function loadSchedules(): ScheduleBlock[] {
  try {
    const data = localStorage.getItem(SCHEDULES_KEY);
    if (data) {
      const parsed: ScheduleBlock[] = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar grade horária do LocalStorage:', e);
  }
  return [];
}

export function saveSchedules(schedules: ScheduleBlock[]): void {
  try {
    localStorage.setItem(SCHEDULES_KEY, JSON.stringify(schedules));
  } catch (e) {
    console.error('Erro ao salvar grade horária:', e);
  }
}

export function loadActivities(): ActivityItem[] {
  try {
    const data = localStorage.getItem(ACTIVITIES_KEY);
    if (data) {
      const parsed: ActivityItem[] = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const enriched = parsed.map((act) => ({
          ...act,
          requiresRollCall: act.requiresRollCall !== undefined ? act.requiresRollCall : true,
        }));
        if (!enriched.some((a) => a.id === 'Rotina')) {
          const rotinaItem = ACTIVITIES_LIST.find((a) => a.id === 'Rotina') || {
            id: 'Rotina',
            name: 'Rotina',
            icon: 'Clock',
            description: 'Rotina diária e acompanhamento obrigatório de todos os alunos do Integral',
            defaultEquipment: 'Agenda escolar / Material de uso diário',
            requiresRollCall: true,
          };
          const updated = [rotinaItem, ...enriched];
          saveActivities(updated);
          return updated;
        }
        return enriched;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar atividades do LocalStorage:', e);
  }
  saveActivities(ACTIVITIES_LIST);
  return ACTIVITIES_LIST;
}

export function saveActivities(activities: ActivityItem[]): void {
  try {
    localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(activities));
  } catch (e) {
    console.error('Erro ao salvar atividades:', e);
  }
}

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
        let studentToUpdate = { ...s };
        if ((studentToUpdate.turma as string) === 'Mini Maternal / Maternal / Infantil 1 Azul') {
          migrated = true;
          studentToUpdate.turma = newTurmas[idx % 3];
        }
        // MANDATORY RULE: Every student must have 'Rotina' in activities
        if (!Array.isArray(studentToUpdate.activities)) {
          studentToUpdate.activities = ['Rotina'];
          migrated = true;
        } else if (!studentToUpdate.activities.includes('Rotina')) {
          studentToUpdate.activities = ['Rotina', ...studentToUpdate.activities];
          migrated = true;
        }
        return studentToUpdate;
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
