import { Student, AttendanceRecord, HolidayItem, AttendanceStatus } from '../types';
import { isStudentScheduledForDate, isStudentActiveOnDate, getEffectiveSchoolDays, formatDateBR, getDayOfWeekLabel, getDayOfWeekFromDate } from './dateUtils';

/**
 * Status Categorization for Attendance Calculations
 */
export type AttendanceCategory = 'PRESENTE' | 'FALTA' | 'JUSTIFICADO' | 'PENDENTE';

/**
 * Checks if a record status counts as PRESENTE (Presença Efetiva no Integral).
 * In accordance with pedagogical and administrative rules:
 * - 'presente': Regular attendance
 * - 'saida_antecipada': Student attended and left early
 * - 'sem_equipamento': Student attended but forgot equipment/uniform
 */
export function isPresencaStatus(status: AttendanceStatus | string | null | undefined): boolean {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return s === 'presente' || s === 'saida_antecipada' || s === 'sem_equipamento';
}

/**
 * Checks if a record status counts as FALTA (Ausência Não Justificada).
 */
export function isFaltaStatus(status: AttendanceStatus | string | null | undefined): boolean {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return s === 'falta';
}

/**
 * Checks if a record status counts as JUSTIFICADO / SAÚDE (Ausência com Atestado Médico ou Justificativa).
 */
export function isJustificadoStatus(status: AttendanceStatus | string | null | undefined): boolean {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return s === 'saude' || s === 'justificado' || s === 'atestado';
}

/**
 * Checks if an activity name corresponds strictly to the core Integral Routine (Chamada Geral de Rotina).
 * Routine roll call is 1 record per student per day.
 */
export function isRoutineActivity(activity: string | null | undefined): boolean {
  if (!activity) return false;
  const norm = activity.trim().toLowerCase();
  return norm === 'rotina' || norm === 'chamada_geral' || norm === 'geral';
}

/**
 * Student Daily Attendance Analysis Result
 */
export interface StudentDailyAttendance {
  student: Student;
  record?: AttendanceRecord;
  category: AttendanceCategory;
  rawStatus?: AttendanceStatus | string;
  isScheduled: boolean;
}

/**
 * Resolves the attendance category of a single student on a given date based on their routine roll call record.
 */
export function resolveStudentAttendanceCategory(
  student: Student,
  record: AttendanceRecord | undefined,
  dateStr: string
): AttendanceCategory {
  // If there is an explicit recorded status on this date, respect it directly
  if (record && record.status) {
    if (isPresencaStatus(record.status)) {
      return 'PRESENTE';
    }
    if (isFaltaStatus(record.status)) {
      return 'FALTA';
    }
    if (isJustificadoStatus(record.status)) {
      return 'JUSTIFICADO';
    }
  }

  if (!isStudentActiveOnDate(student, dateStr)) {
    return 'PENDENTE';
  }
  const isScheduled = isStudentScheduledForDate(student, dateStr);
  if (!isScheduled) {
    // If student isn't scheduled for this day of week and has no record, they are not expected
    return 'PENDENTE';
  }

  return 'PENDENTE';
}

/**
 * Options for calculating daily consolidated attendance
 */
export interface DailyConsolidatedOptions {
  /** When true, students without roll call on past/closed days are treated as Falta */
  convertPastPendingToAbsence?: boolean;
}

/**
 * Daily Consolidated Attendance Metrics for a single date
 */
export interface DailyConsolidatedMetrics {
  dateStr: string;
  dayName: string;
  dayShort: string;
  /** Total de alunos matriculados ativos cadastrados no escopo */
  totalMatriculados: number;
  /** Total active students in scope scheduled for this date (Base Esperada Hoje por dia de frequência) */
  totalAtivos: number;
  /** Alias explícito para Base Esperada Hoje (Garantido: presentes + faltas + justificados + pendentes) */
  totalEsperados: number;
  /** Total present (Presente normal + Saída antecipada + Sem equipamento) */
  presentes: number;
  /** Subset of presentes with early dismissal */
  saidasAntecipadas: number;
  /** Subset of presentes without equipment/uniform */
  semEquipamento: number;
  /** Total unjustified absences */
  faltas: number;
  /** Total justified absences (Medical / health note) */
  justificados: number;
  /** Total scheduled students without a routine roll call record */
  pendentes: number;
  /** Quantidade de pendências que foram computadas como falta (se regra de encerramento ativada) */
  pendenciasConvertidas?: number;
  /** Total processed records (Presentes + Faltas + Justificados) */
  apurados: number;
  /** Attendance percentage over total active scheduled (0 to 100) */
  taxaPresenca: number;
  /** Attendance percentage over processed records (0 to 100) */
  taxaApurada: number;
  /** Array of active students pending roll call on this day */
  pendingStudents: Student[];
  /** Detailed array of all students and their evaluated status */
  studentDetails: StudentDailyAttendance[];
  /** Rigid formula validation flag: (presentes + faltas + justificados + pendentes === totalEsperados) */
  isAuditStrictlyValid: boolean;
  /** Se o dia é passado ou chamada já encerrada */
  isPastOrClosed?: boolean;
}

/**
 * Calculates daily consolidated attendance metrics for a specific date.
 * Single Source of Truth for Header, Top Monitor, WeeklyReport, and PDF Generators.
 */
export function getDailyConsolidatedMetrics(
  dateStr: string,
  students: Student[],
  records: AttendanceRecord[],
  turmaFilter?: string,
  options?: DailyConsolidatedOptions
): DailyConsolidatedMetrics {
  const isAllTurmas = !turmaFilter || turmaFilter === 'all' || turmaFilter === 'Todas as Turmas';
  const targetStudents = isAllTurmas
    ? students
    : students.filter((s) => s.turma === turmaFilter);

  // Total active enrolled students in the scope
  const activeEnrolledStudents = targetStudents.filter((s) => isStudentActiveOnDate(s, dateStr));
  const totalMatriculados = activeEnrolledStudents.length;

  // Map of Routine Records on this date by studentId
  const routineRecordMap = new Map<string, AttendanceRecord>();
  records.forEach((r) => {
    if (r.date === dateStr && isRoutineActivity(r.activity)) {
      routineRecordMap.set(r.studentId, r);
    }
  });

  const studentDetails: StudentDailyAttendance[] = [];
  const pendingStudents: Student[] = [];

  let presentes = 0;
  let saidasAntecipadas = 0;
  let semEquipamento = 0;
  let faltas = 0;
  let justificados = 0;
  let pendentes = 0;
  let pendenciasConvertidas = 0;

  // Build the unified list of students to evaluate for this date:
  // 1. All active enrolled students scheduled for this specific date (diasFrequencia check)
  const scheduledStudents = activeEnrolledStudents.filter((s) => isStudentScheduledForDate(s, dateStr));
  const evaluatedMap = new Map<string, Student>();

  scheduledStudents.forEach((st) => {
    evaluatedMap.set(st.id, st);
  });

  // 2. Plus any enrolled student who actually has an attendance record on this date (e.g. extra / replacement day)
  activeEnrolledStudents.forEach((st) => {
    if (!evaluatedMap.has(st.id) && routineRecordMap.has(st.id)) {
      evaluatedMap.set(st.id, st);
    }
  });

  // 3. And any student in targetStudents if they have a record on this date
  targetStudents.forEach((st) => {
    if (!evaluatedMap.has(st.id) && routineRecordMap.has(st.id)) {
      evaluatedMap.set(st.id, st);
    }
  });

  const evaluatedStudents = Array.from(evaluatedMap.values());

  const todayStr = new Date().toISOString().split('T')[0];
  const isPastDate = dateStr < todayStr;
  const hasRecordsOnDate = routineRecordMap.size > 0;
  // A roll call is closed if it is in the past, or if roll call was conducted (records exist on that day)
  const isCallClosed = isPastDate || (hasRecordsOnDate && dateStr <= todayStr);
  const shouldConvertPending = Boolean(options?.convertPastPendingToAbsence && isCallClosed);

  evaluatedStudents.forEach((student) => {
    const rec = routineRecordMap.get(student.id);
    let category = resolveStudentAttendanceCategory(student, rec, dateStr);

    if (category === 'PRESENTE') {
      presentes++;
      if (rec?.status === 'saida_antecipada') {
        saidasAntecipadas++;
      } else if (rec?.status === 'sem_equipamento') {
        semEquipamento++;
      }
    } else if (category === 'FALTA') {
      faltas++;
    } else if (category === 'JUSTIFICADO') {
      justificados++;
    } else {
      // Pending case (unmarked / without record)
      if (shouldConvertPending) {
        faltas++;
        pendenciasConvertidas++;
        category = 'FALTA';
      } else {
        pendentes++;
        pendingStudents.push(student);
      }
    }

    studentDetails.push({
      student,
      record: rec,
      category,
      rawStatus: rec?.status,
      isScheduled: isStudentScheduledForDate(student, dateStr),
    });
  });

  // Guarantee strictly alphabetical sorting (A-Z) for pending students
  pendingStudents.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));

  // CONSISTÊNCIA DE TOTAIS: O Total de Esperados é RIGOROSAMENTE a soma exata dos registros apurados + pendentes
  const totalEsperados = presentes + faltas + justificados + pendentes;
  const totalAtivos = totalEsperados;
  const apurados = presentes + faltas + justificados;
  const isAuditStrictlyValid = presentes + faltas + justificados + pendentes === totalEsperados;

  // Percentage calculations
  const taxaPresenca = totalEsperados > 0 ? Math.round((presentes / totalEsperados) * 100) : 0;
  const taxaApurada = apurados > 0 ? Math.round((presentes / apurados) * 100) : 0;

  const dayOfWeek = getDayOfWeekFromDate(dateStr);
  const dayName = dayOfWeek ? getDayOfWeekLabel(dayOfWeek) : '';
  const dayShort = dayOfWeek
    ? dayOfWeek === 'quarta'
      ? 'Qua'
      : dayOfWeek === 'quinta'
      ? 'Qui'
      : dayOfWeek.slice(0, 3).toUpperCase()
    : '';

  return {
    dateStr,
    dayName,
    dayShort,
    totalMatriculados,
    totalAtivos,
    totalEsperados,
    presentes,
    saidasAntecipadas,
    semEquipamento,
    faltas,
    justificados,
    pendentes,
    pendenciasConvertidas,
    apurados,
    taxaPresenca,
    taxaApurada,
    pendingStudents,
    studentDetails,
    isAuditStrictlyValid,
    isPastOrClosed: isPastDate,
  };
}

/**
 * Period Consolidated Attendance Metrics (Multi-Day Synthesis)
 */
export interface PeriodConsolidatedMetrics {
  startDate: string;
  endDate: string;
  scopeTurma: string;
  schoolDaysCount: number;
  holidaysCount: number;
  totalMatriculasAtivas: number;
  dailyMetrics: DailyConsolidatedMetrics[];
  totalEsperadosAcumulados: number;
  totalPresentesAcumulados: number;
  totalSaidasAntecipadasAcumuladas: number;
  totalSemEquipamentoAcumuladas: number;
  totalFaltasAcumuladas: number;
  totalJustificadosAcumulados: number;
  totalPendentesAcumulados: number;
  totalPendenciasConvertidasAcumuladas: number;
  totalApuradosAcumulados: number;
  taxaPresencaGeral: number;
  /** Days in the period that have unrecorded / pending student attendance */
  daysWithPendingRollCall: {
    dateStr: string;
    dayName: string;
    pendentesCount: number;
    pendingStudents: Student[];
  }[];
}

/**
 * Calculates multi-day consolidated attendance metrics across school days in a date range.
 * Single Source of Truth for Relatório Numérico and Weekly Overview.
 */
export function getPeriodConsolidatedMetrics(
  startDate: string,
  endDate: string,
  students: Student[],
  records: AttendanceRecord[],
  holidays: HolidayItem[] = [],
  turmaFilter: string = 'all',
  options?: DailyConsolidatedOptions
): PeriodConsolidatedMetrics {
  const isAllTurmas = !turmaFilter || turmaFilter === 'all' || turmaFilter === 'Todas as Turmas';
  const targetStudents = isAllTurmas
    ? students
    : students.filter((s) => s.turma === turmaFilter);

  const schoolDaysInfo = getEffectiveSchoolDays(startDate, endDate, holidays);
  const effectiveDays = schoolDaysInfo.effectiveDays;

  const dailyMetrics: DailyConsolidatedMetrics[] = [];
  const daysWithPendingRollCall: PeriodConsolidatedMetrics['daysWithPendingRollCall'] = [];

  let totalEsperadosAcumulados = 0;
  let totalPresentesAcumulados = 0;
  let totalSaidasAntecipadasAcumuladas = 0;
  let totalSemEquipamentoAcumuladas = 0;
  let totalFaltasAcumuladas = 0;
  let totalJustificadosAcumulados = 0;
  let totalPendentesAcumulados = 0;
  let totalPendenciasConvertidasAcumuladas = 0;

  effectiveDays.forEach((day) => {
    const daily = getDailyConsolidatedMetrics(day.dateStr, targetStudents, records, turmaFilter, options);
    dailyMetrics.push(daily);

    totalEsperadosAcumulados += daily.totalEsperados;
    totalPresentesAcumulados += daily.presentes;
    totalSaidasAntecipadasAcumuladas += daily.saidasAntecipadas;
    totalSemEquipamentoAcumuladas += daily.semEquipamento;
    totalFaltasAcumuladas += daily.faltas;
    totalJustificadosAcumulados += daily.justificados;
    totalPendentesAcumulados += daily.pendentes;
    totalPendenciasConvertidasAcumuladas += daily.pendenciasConvertidas || 0;

    if (daily.pendentes > 0) {
      daysWithPendingRollCall.push({
        dateStr: daily.dateStr,
        dayName: daily.dayName,
        pendentesCount: daily.pendentes,
        pendingStudents: daily.pendingStudents,
      });
    }
  });

  const totalApuradosAcumulados =
    totalPresentesAcumulados + totalFaltasAcumuladas + totalJustificadosAcumulados;

  const taxaPresencaGeral =
    totalEsperadosAcumulados > 0
      ? Math.round((totalPresentesAcumulados / totalEsperadosAcumulados) * 100)
      : totalApuradosAcumulados > 0
      ? Math.round((totalPresentesAcumulados / totalApuradosAcumulados) * 100)
      : 0;

  return {
    startDate,
    endDate,
    scopeTurma: turmaFilter,
    schoolDaysCount: schoolDaysInfo.effectiveDaysCount,
    holidaysCount: schoolDaysInfo.holidaysCount,
    totalMatriculasAtivas: targetStudents.filter((s) => isStudentActiveOnDate(s, endDate)).length,
    dailyMetrics,
    totalEsperadosAcumulados,
    totalPresentesAcumulados,
    totalSaidasAntecipadasAcumuladas,
    totalSemEquipamentoAcumuladas,
    totalFaltasAcumuladas,
    totalJustificadosAcumulados,
    totalPendentesAcumulados,
    totalPendenciasConvertidasAcumuladas,
    totalApuradosAcumulados,
    taxaPresencaGeral,
    daysWithPendingRollCall,
  };
}
