import { Student, AttendanceRecord, ActivityType, TurmaType, AttendanceStatus, ActivityItem, ScheduleBlock, HolidayItem, PontoRecord, PontoMonthClosing, SemanarioPlan, DayOfWeek, StudentStatus } from '../types';
import { INITIAL_STUDENTS, TURMAS_LIST, ACTIVITIES_LIST, INITIAL_HOLIDAYS } from '../data/initialData';
import { getISOWeekNumber, getWeekInfo, getWeekDays, toISODateString } from './dateUtils';
import { getInitialSamplePlans } from './semanarioUtils';
import { getDefaultScheduleBlocks } from './scheduleDefaults';

const STUDENTS_KEY = 'integral_frequencia_students_v1';
const RECORDS_KEY = 'integral_frequencia_records_v1';
const TURMAS_KEY = 'integral_frequencia_turmas_v1';
const ACTIVITIES_KEY = 'integral_frequencia_activities_v1';
const SCHEDULES_KEY = 'integral_frequencia_schedules_v1';
const HOLIDAYS_KEY = 'integral_frequencia_holidays_v1';
const PONTO_RECORDS_KEY = 'integral_frequencia_ponto_records_v1';
const PONTO_CLOSINGS_KEY = 'integral_frequencia_ponto_closings_v1';
const SEMANARIO_KEY = 'integral_semanario_plans_v1';

export const DEFAULT_DIAS_FREQUENCIA: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];

/**
 * Normaliza e enriquece os dados de um aluno, garantindo a integridade e
 * preservação irrestrita das propriedades customizadas (diasFrequencia, horariosSaida, statusMatricula, etc.),
 * aplicando valores padrão APENAS quando essas propriedades estiverem ausentes.
 */
export function normalizeStudent(
  rawStudent: any,
  existingStudent?: Student
): Student {
  if (!rawStudent && !existingStudent) {
    return {
      id: `st-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: '',
      turma: '',
      activities: ['Rotina'],
      diasFrequencia: [...DEFAULT_DIAS_FREQUENCIA],
      horariosSaida: {},
      status: 'ativo',
      statusMatricula: 'ativo',
    };
  }

  const s = rawStudent || {};
  const id = String(s.id || existingStudent?.id || `st-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`).trim();
  const name = String(s.name !== undefined ? s.name : (existingStudent?.name || '')).trim();
  const turma = String(s.turma !== undefined ? s.turma : (existingStudent?.turma || '')) as TurmaType;

  // Atividades: Garantir array e presença obrigatória da 'Rotina'
  let rawActs: string[] = [];
  if (Array.isArray(s.activities)) {
    rawActs = s.activities;
  } else if (Array.isArray(existingStudent?.activities)) {
    rawActs = existingStudent.activities;
  }
  const uniqueActs = Array.from(new Set(rawActs.map((a: any) => String(a).trim()).filter(Boolean)));
  const activities = uniqueActs.includes('Rotina') ? uniqueActs : ['Rotina', ...uniqueActs];

  // Preservação de Dias de Frequência (diasFrequencia / dias_frequencia)
  // REGRA CRÍTICA: Se já existir no registro ou no aluno existente (mesmo que parcial, ex: 2ª/4ª/6ª), PRESERVAR!
  let diasFrequencia: DayOfWeek[];
  if (Array.isArray(s.diasFrequencia) && s.diasFrequencia.length > 0) {
    diasFrequencia = [...s.diasFrequencia];
  } else if (Array.isArray(s.dias_frequencia) && s.dias_frequencia.length > 0) {
    diasFrequencia = [...s.dias_frequencia];
  } else if (existingStudent && Array.isArray(existingStudent.diasFrequencia) && existingStudent.diasFrequencia.length > 0) {
    diasFrequencia = [...existingStudent.diasFrequencia];
  } else {
    diasFrequencia = [...DEFAULT_DIAS_FREQUENCIA];
  }

  // Preservação de Horários de Saída (horariosSaida / horarioSaida)
  let horariosSaida: Partial<Record<DayOfWeek, string>> = {};
  if (existingStudent?.horariosSaida && typeof existingStudent.horariosSaida === 'object') {
    horariosSaida = { ...existingStudent.horariosSaida };
  }
  if (s.horariosSaida && typeof s.horariosSaida === 'object') {
    horariosSaida = { ...horariosSaida, ...s.horariosSaida };
  } else if (typeof s.horarioSaida === 'string' && s.horarioSaida.trim().length > 0) {
    const fixedTime = s.horarioSaida.trim();
    horariosSaida = {
      segunda: fixedTime,
      terca: fixedTime,
      quarta: fixedTime,
      quinta: fixedTime,
      sexta: fixedTime,
    };
  }

  // Preservação de Status / Status de Matrícula
  const rawStatus = s.status || s.statusMatricula || existingStudent?.status || existingStudent?.statusMatricula || 'ativo';
  const status: StudentStatus = (rawStatus === 'inativo' || rawStatus === 'cancelado') ? rawStatus : 'ativo';

  const inactivationDate = s.inactivationDate || existingStudent?.inactivationDate || undefined;
  const inactivationReason = s.inactivationReason || existingStudent?.inactivationReason || undefined;
  const notes = s.notes !== undefined ? s.notes : (existingStudent?.notes !== undefined ? existingStudent.notes : undefined);

  return {
    id,
    name,
    turma,
    activities,
    diasFrequencia,
    horariosSaida,
    status,
    statusMatricula: status,
    inactivationDate,
    inactivationReason,
    notes,
  };
}

/**
 * Fusão inteligente (Deep Merge) de dois registros de alunos,
 * preservando todas as customizações (diasFrequencia, horariosSaida, status)
 * sem redefinir para padrões default.
 */
export function mergeStudentData(
  existingStudent: Student | undefined,
  incomingStudent: Partial<Student> | Student
): Student {
  if (!existingStudent) {
    return normalizeStudent(incomingStudent);
  }

  // Se o incoming tem diasFrequencia com valores válidos, usa; se não, preserva o do existing
  const incomingDays = Array.isArray(incomingStudent.diasFrequencia) && incomingStudent.diasFrequencia.length > 0
    ? incomingStudent.diasFrequencia
    : existingStudent.diasFrequencia;

  // Merge de horários de saída: preserva os horários já definidos no existing
  const mergedHorarios: Partial<Record<DayOfWeek, string>> = {
    ...(existingStudent.horariosSaida || {}),
    ...(incomingStudent.horariosSaida || {}),
  };

  // Se incoming tem horarioSaida string único especificado
  if (typeof (incomingStudent as any).horarioSaida === 'string' && (incomingStudent as any).horarioSaida.trim().length > 0) {
    const fixedTime = (incomingStudent as any).horarioSaida.trim();
    (['segunda', 'terca', 'quarta', 'quinta', 'sexta'] as DayOfWeek[]).forEach((d) => {
      if (!mergedHorarios[d]) mergedHorarios[d] = fixedTime;
    });
  }

  // Atividades
  const incomingActs = Array.isArray(incomingStudent.activities) ? incomingStudent.activities : [];
  const existingActs = Array.isArray(existingStudent.activities) ? existingStudent.activities : [];
  const baseActs = incomingActs.length > 0 ? incomingActs : existingActs;
  const mergedActivities = Array.from(new Set(['Rotina', ...baseActs]));

  const status = incomingStudent.status || (incomingStudent as any).statusMatricula || existingStudent.status || existingStudent.statusMatricula || 'ativo';

  return {
    ...existingStudent,
    ...incomingStudent,
    id: incomingStudent.id || existingStudent.id,
    name: incomingStudent.name !== undefined ? incomingStudent.name : existingStudent.name,
    turma: incomingStudent.turma !== undefined ? incomingStudent.turma : existingStudent.turma,
    activities: mergedActivities,
    diasFrequencia: incomingDays && incomingDays.length > 0 ? incomingDays : (existingStudent.diasFrequencia || [...DEFAULT_DIAS_FREQUENCIA]),
    horariosSaida: mergedHorarios,
    status,
    statusMatricula: status,
    inactivationDate: incomingStudent.inactivationDate !== undefined ? incomingStudent.inactivationDate : existingStudent.inactivationDate,
    inactivationReason: incomingStudent.inactivationReason !== undefined ? incomingStudent.inactivationReason : existingStudent.inactivationReason,
    notes: incomingStudent.notes !== undefined ? incomingStudent.notes : existingStudent.notes,
  };
}

/**
 * Mescla uma lista de alunos recebida (ex: do Firestore ou importação) com a lista local existente,
 * preservando todas as configurações customizadas já salvas de cada aluno.
 */
export function mergeStudentsList(
  currentStudents: Student[],
  incomingStudents: Student[]
): Student[] {
  const currentMap = new Map<string, Student>();
  const nameTurmaMap = new Map<string, Student>();

  (currentStudents || []).forEach((s) => {
    if (s.id) currentMap.set(s.id, s);
    if (s.name && s.turma) {
      const key = `${s.name.toLowerCase().trim()}_${s.turma.toLowerCase().trim()}`;
      nameTurmaMap.set(key, s);
    }
  });

  const processedIds = new Set<string>();
  const mergedList: Student[] = [];

  (incomingStudents || []).forEach((incoming) => {
    if (!incoming) return;
    if (isMockStudent(incoming)) return;

    let existing = incoming.id ? currentMap.get(incoming.id) : undefined;
    if (!existing && incoming.name && incoming.turma) {
      const key = `${incoming.name.toLowerCase().trim()}_${incoming.turma.toLowerCase().trim()}`;
      existing = nameTurmaMap.get(key);
    }

    const merged = mergeStudentData(existing, incoming);
    processedIds.add(merged.id);
    mergedList.push(merged);
  });

  // Preservar alunos locais que não estejam no incoming (para não perder dados offline ou de lotes parciais)
  (currentStudents || []).forEach((localStudent) => {
    if (!isMockStudent(localStudent) && !processedIds.has(localStudent.id)) {
      mergedList.push(normalizeStudent(localStudent));
    }
  });

  return mergedList;
}

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
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar grade horária do LocalStorage:', e);
  }
  const defaultBlocks = getDefaultScheduleBlocks();
  saveSchedules(defaultBlocks);
  return defaultBlocks;
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
        const officialMap = new Map<string, ActivityItem>();
        ACTIVITIES_LIST.forEach((a) => {
          officialMap.set(a.id, a);
          officialMap.set(a.name, a);
        });
        
        // Enrich activities
        const enriched: ActivityItem[] = parsed.map((act): ActivityItem => {
          const official = officialMap.get(act.id) || officialMap.get(act.name);
          return {
            ...act,
            requiresRollCall: act.requiresRollCall !== undefined ? act.requiresRollCall : (official ? official.requiresRollCall : true),
            icon: act.icon || (official ? official.icon : 'Clock'),
          };
        });

        // Ensure all default official activities are present
        ACTIVITIES_LIST.forEach((officialAct) => {
          if (!enriched.some((a) => a.id === officialAct.id || a.name === officialAct.name)) {
            enriched.push({ ...officialAct });
          }
        });

        const sorted = enriched.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'pt-BR', { sensitivity: 'base' }));
        saveActivities(sorted);
        return sorted;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar atividades do LocalStorage:', e);
  }
  const defaultSorted = [...ACTIVITIES_LIST].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'pt-BR', { sensitivity: 'base' }));
  saveActivities(defaultSorted);
  return defaultSorted;
}

export function saveActivities(activities: ActivityItem[]): void {
  try {
    const sorted = [...activities].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'pt-BR', { sensitivity: 'base' }));
    localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(sorted));
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
      const parsed: any[] = JSON.parse(data);
      if (Array.isArray(parsed)) {
        let migrated = false;
        const newTurmas: TurmaType[] = ['Mini Maternal Azul', 'Maternal Azul', 'Infantil 1 Azul'];

        // Filter out any mock/fictional model students
        const nonMock = parsed.filter((s) => !isMockStudent(s));
        if (nonMock.length !== parsed.length) migrated = true;

        const normalized = nonMock.map((s, idx) => {
          let studentToUpdate = { ...s };
          if ((studentToUpdate.turma as string) === 'Mini Maternal / Maternal / Infantil 1 Azul') {
            migrated = true;
            studentToUpdate.turma = newTurmas[idx % 3];
          }
          return normalizeStudent(studentToUpdate);
        });

        if (migrated) {
          saveStudents(normalized);
        }
        return normalized;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar alunos do LocalStorage:', e);
  }
  const defaultInitial = INITIAL_STUDENTS.map((s) => normalizeStudent(s));
  saveStudents(defaultInitial);
  return defaultInitial;
}

export function saveStudents(students: Student[]): void {
  try {
    const nonMock = (students || []).filter((s) => !isMockStudent(s));
    const normalized = nonMock.map((s) => normalizeStudent(s));
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(normalized));
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

export function loadPontoRecords(): PontoRecord[] {
  try {
    const data = localStorage.getItem(PONTO_RECORDS_KEY);
    if (data) {
      const parsed: PontoRecord[] = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar registros de ponto do LocalStorage:', e);
  }
  return [];
}

export function savePontoRecords(records: PontoRecord[]): void {
  try {
    localStorage.setItem(PONTO_RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('Erro ao salvar registros de ponto:', e);
  }
}

export function loadPontoClosings(): PontoMonthClosing[] {
  try {
    const data = localStorage.getItem(PONTO_CLOSINGS_KEY);
    if (data) {
      const parsed: PontoMonthClosing[] = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar fechamentos de ponto do LocalStorage:', e);
  }
  return [];
}

export function savePontoClosings(closings: PontoMonthClosing[]): void {
  try {
    localStorage.setItem(PONTO_CLOSINGS_KEY, JSON.stringify(closings));
  } catch (e) {
    console.error('Erro ao salvar fechamentos de ponto:', e);
  }
}

export function loadSemanarioPlans(): SemanarioPlan[] {
  try {
    const data = localStorage.getItem(SEMANARIO_KEY);
    if (data) {
      const parsed: SemanarioPlan[] = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar planos do Semanário do LocalStorage:', e);
  }
  const defaultPlans = getInitialSamplePlans();
  saveSemanarioPlans(defaultPlans);
  return defaultPlans;
}

export function saveSemanarioPlans(plans: SemanarioPlan[]): void {
  try {
    localStorage.setItem(SEMANARIO_KEY, JSON.stringify(plans));
  } catch (e) {
    console.error('Erro ao salvar planos do Semanário:', e);
  }
}

export function resetAllData(): void {
  localStorage.removeItem(STUDENTS_KEY);
  localStorage.removeItem(RECORDS_KEY);
  localStorage.removeItem(TURMAS_KEY);
  localStorage.removeItem(PONTO_RECORDS_KEY);
  localStorage.removeItem(PONTO_CLOSINGS_KEY);
  localStorage.removeItem(SEMANARIO_KEY);
}

function generateInitialSeedRecords(): AttendanceRecord[] {
  return [];
}
