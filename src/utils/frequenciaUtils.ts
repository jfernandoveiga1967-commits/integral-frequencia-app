import { Student, AttendanceRecord, HolidayItem, AttendanceStatus, UserProfile, DayOfWeek, ScheduleBlock } from '../types';
import { isStudentScheduledForDate, isStudentActiveOnDate, getEffectiveSchoolDays, formatDateBR, getDayOfWeekLabel, getDayOfWeekFromDate, isHolidayOrRecess } from './dateUtils';
export { isStudentInReforcoVigency, isStudentInReforco } from './semanarioUtils';
import { calculateDemonstrativoPJ } from '../services/DemonstrativoService';

/**
 * Status Categorization for Attendance Calculations
 */
export type AttendanceCategory = 'PRESENTE' | 'FALTA' | 'JUSTIFICADO' | 'PENDENTE';

/**
 * Normaliza o status do registro de presença de forma defensiva (Runtime Safety).
 * Considera status 'presente' e 'CONCLUIDO' / 'concluido' como presenças válidas,
 * e converte apenas faltas declaradas ou dados inválidos de forma segura.
 */
export function normalizeAttendanceStatus(rawStatus: any): AttendanceStatus {
  if (!rawStatus) return 'falta';
  const clean = String(rawStatus).trim().toLowerCase();
  if (
    clean === 'presente' ||
    clean === 'concluido' ||
    clean === 'concluído' ||
    clean === 'p' ||
    clean === 'compareceu'
  ) {
    return 'presente';
  }
  if (
    clean === 'sem_equipamento' ||
    clean === 'sem-equipamento' ||
    clean === 'sem equipamento'
  ) {
    return 'sem_equipamento';
  }
  if (
    clean === 'saida_antecipada' ||
    clean === 'saida-antecipada' ||
    clean === 'saida antecipada'
  ) {
    return 'saida_antecipada';
  }
  if (clean === 'justificado' || clean === 'atestado') {
    return 'justificado' as any;
  }
  if (clean === 'falta' || clean === 'saude' || clean === 'ausente' || clean === 'f') {
    return 'falta';
  }
  return 'falta';
}

/**
 * Checks if a record status counts as PRESENTE (Presença Efetiva no Integral).
 * In accordance with pedagogical and administrative rules:
 * - 'presente': Regular attendance
 * - 'concluido' / 'concluído': Chamada de rotina gravada no banco
 * - 'saida_antecipada': Student attended and left early
 * - 'sem_equipamento': Student attended but forgot equipment/uniform
 */
export function isPresencaStatus(status: AttendanceStatus | string | null | undefined): boolean {
  if (!status) return false;
  const s = String(status).trim().toLowerCase();
  return (
    s === 'presente' ||
    s === 'concluido' ||
    s === 'concluído' ||
    s === 'saida_antecipada' ||
    s === 'sem_equipamento' ||
    s === 'p' ||
    s === 'compareceu'
  );
}

/**
 * Checks if a record status counts as FALTA (Ausência Efetiva Não Justificada).
 * Reflete estritamente alunos efetivamente ausentes marcados como falta.
 */
export function isFaltaStatus(status: AttendanceStatus | string | null | undefined): boolean {
  if (!status) return false;
  const s = String(status).trim().toLowerCase();
  return s === 'falta' || s === 'ausente' || s === 'f';
}

/**
 * Checks if a record status counts as JUSTIFICADO / SAÚDE (Ausência com Atestado Médico ou Justificativa).
 */
export function isJustificadoStatus(status: AttendanceStatus | string | null | undefined): boolean {
  if (!status) return false;
  const s = String(status).trim().toLowerCase();
  return s === 'justificado' || s === 'atestado';
}

/**
 * Checks if an activity name corresponds strictly to the core Integral Routine (Chamada Geral de Rotina).
 * Routine roll call is 1 record per student per day (tipo == 'ROTINA' ou activity == 'Rotina').
 */
export function isRoutineActivity(activity: string | null | undefined, rawRecord?: any): boolean {
  if (rawRecord) {
    const rawTipo = String(rawRecord.tipo || rawRecord.type || '').trim().toLowerCase();
    if (rawTipo === 'rotina' || rawTipo === 'chamada_geral' || rawTipo === 'geral') return true;
  }
  if (!activity) return false;
  const norm = String(activity).trim().toLowerCase();
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
 * Garante que os alunos marcados como presentes (ou com status CONCLUIDO) sejam computados como PRESENTE,
 * e que FALTA reflita apenas os alunos efetivamente ausentes.
 */
export function resolveStudentAttendanceCategory(
  student: Student,
  record: AttendanceRecord | undefined,
  dateStr: string
): AttendanceCategory {
  // If there is an explicit recorded status on this date, respect it directly
  if (record) {
    const rawStatus = (record as any).rawStatus || record.status;
    const safeStatus = normalizeAttendanceStatus(record.status);

    if (isPresencaStatus(rawStatus) || isPresencaStatus(safeStatus)) {
      return 'PRESENTE';
    }
    if (isJustificadoStatus(rawStatus) || isJustificadoStatus(safeStatus)) {
      return 'JUSTIFICADO';
    }
    if (isFaltaStatus(rawStatus) || isFaltaStatus(safeStatus)) {
      return 'FALTA';
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
  /** When true, locks expected count strictly to students who responded to roll call */
  lockToRoutineRecords?: boolean;
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
 * Verifica se um aluno deve ser considerado como matrícula ativa no escopo consolidado.
 * Alinhado 100% com o indicador superior de 'Total Matriculados':
 * - Considera qualquer aluno que possui status 'ativo' no banco de dados (ou sem status definido, padrão 'ativo').
 * - Trata alunos ativos recentemente adicionados para que sejam sempre computados no consolidado sem divergência.
 * - Alunos com status 'inativo' ou 'cancelado' só são considerados em datas retroativas anteriores ou iguais à data de inativação.
 */
export function isStudentActiveInDatabase(
  student: Student | null | undefined,
  referenceDate?: string
): boolean {
  if (!student) return false;
  const status = (student.status || (student as any).statusMatricula || 'ativo').toLowerCase().trim();

  // Aluno com status 'ativo': SEMPRE computado como matrícula ativa, inclusive os recém-adicionados
  if (status === 'ativo') {
    // Alunos de contrato avulso só deixam de ser ativos se a data de referência for posterior ao término do contrato
    if (student.tipoContrato === 'avulso' && student.dataTerminoContrato && referenceDate) {
      if (referenceDate > student.dataTerminoContrato) {
        return false;
      }
    }
    return true;
  }

  // Alunos inativos ou cancelados: só considerados se a data de consulta for anterior ou igual à inativação
  if (status === 'inativo' || status === 'cancelado') {
    if (referenceDate) {
      return isStudentActiveOnDate(student, referenceDate);
    }
    return false;
  }

  return true;
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

  // Total active enrolled students in the scope (alinhado rigorosamente à regra de alunos ativos no banco de dados)
  const activeEnrolledStudents = targetStudents.filter((s) => isStudentActiveInDatabase(s, dateStr));
  const totalMatriculados = activeEnrolledStudents.length;

  // Map of Routine Records on this date by studentId
  // Considera estritamente registros de chamada da Rotina (tipo == 'ROTINA' ou activity == 'Rotina')
  // gravados no Firestore para a data (especialmente dias 08/10 e 09/10)
  const routineRecordMap = new Map<string, AttendanceRecord>();
  // Map of ANY Records on this date by studentId (fallback resiliente para presenças registradas)
  const anyRecordMap = new Map<string, AttendanceRecord>();
  records.forEach((r) => {
    if (!r || !r.studentId) return;
    const isMatchingDate = r.date === dateStr || (r as any).data === dateStr;
    if (!isMatchingDate) return;

    const rawActivity = (r.activity || '').trim();
    const rawTipo = String((r as any).tipo || (r as any).type || '').trim();
    const isRoutine =
      isRoutineActivity(rawActivity, r) ||
      rawTipo.toUpperCase() === 'ROTINA' ||
      rawActivity.toUpperCase() === 'ROTINA' ||
      !rawActivity;

    if (isRoutine) {
      routineRecordMap.set(r.studentId, r);
    }
    if (!anyRecordMap.has(r.studentId) || isPresencaStatus(r.status) || isPresencaStatus((r as any).rawStatus)) {
      anyRecordMap.set(r.studentId, r);
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

  const todayStr = new Date().toISOString().split('T')[0];
  const isPastDate = dateStr < todayStr;
  const isToday = dateStr === todayStr;
  const hasRecordsOnDate = routineRecordMap.size > 0 || anyRecordMap.size > 0;

  // Build lookup map for students by id
  const studentById = new Map<string, Student>();
  students.forEach((s) => studentById.set(s.id, s));

  // Build the list of students to evaluate for this date:
  // Base Esperada Rigorosa: Alunos matriculados ativos programados para este dia da semana (contrato) + alunos com chamada registrada
  const evaluatedMap = new Map<string, Student>();
  const scheduledStudents = activeEnrolledStudents.filter((s) => isStudentScheduledForDate(s, dateStr));

  if (isPastDate || isToday) {
    if (options?.lockToRoutineRecords) {
      // Se explicitamente solicitado travar estritamente em quem respondeu:
      routineRecordMap.forEach((rec, studentId) => {
        const student = studentById.get(studentId) || targetStudents.find((s) => s.id === studentId);
        if (student && (isAllTurmas || student.turma === turmaFilter)) {
          evaluatedMap.set(student.id, student);
        }
      });
    } else {
      // Regra Consolidada Oficial: Avalia SEMPRE todos os alunos matriculados ativos programados para este dia letivo
      scheduledStudents.forEach((st) => {
        evaluatedMap.set(st.id, st);
      });
      // Inclui também qualquer aluno com registro lançado nesta data (mesmo fora da grade de frequência semanal)
      routineRecordMap.forEach((rec, studentId) => {
        const student = studentById.get(studentId) || targetStudents.find((s) => s.id === studentId);
        if (student) {
          if (isAllTurmas || student.turma === turmaFilter) {
            evaluatedMap.set(student.id, student);
          }
        } else {
          evaluatedMap.set(studentId, {
            id: studentId,
            name: rec.observation || 'Aluno',
            turma: rec.turma || (turmaFilter !== 'all' ? turmaFilter : 'Integral'),
            activities: ['Rotina'],
          } as Student);
        }
      });
      anyRecordMap.forEach((rec, studentId) => {
        const student = studentById.get(studentId) || targetStudents.find((s) => s.id === studentId);
        if (student && (isAllTurmas || student.turma === turmaFilter)) {
          evaluatedMap.set(student.id, student);
        }
      });
    }
  } else {
    // Dias futuros: não gera pendências nem registros antecipados
  }

  const evaluatedStudents = Array.from(evaluatedMap.values());
  const isCallClosed = isPastDate || (hasRecordsOnDate && Boolean(options?.lockToRoutineRecords || options?.convertPastPendingToAbsence));
  const shouldConvertPending = Boolean(options?.convertPastPendingToAbsence && isCallClosed);

  evaluatedStudents.forEach((student) => {
    // Prioriza registro da Rotina; se ausente, faz fallback para qualquer registro do aluno no dia
    const rec = routineRecordMap.get(student.id) || anyRecordMap.get(student.id);
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
 * Apuração Oficial do Relatório Consolidado (calculateRelatorioConsolidado)
 * Considera estritamente os registros de chamada da Rotina (tipo == 'ROTINA' ou activity == 'Rotina')
 * com status == 'CONCLUIDO' / 'presente' gravados no Firestore para os dias da semana (especialmente 08/10 e 09/10).
 * Garante que os alunos marcados como presentes no AttendanceSheet sejam computados na coluna 'PRESENÇAS'
 * e que 'FALTAS' reflita apenas os alunos efetivamente ausentes.
 */
export function calculateRelatorioConsolidado(
  dateStr: string,
  students: Student[],
  records: AttendanceRecord[],
  turmaFilter?: string,
  options?: DailyConsolidatedOptions
): DailyConsolidatedMetrics {
  return getDailyConsolidatedMetrics(dateStr, students, records, turmaFilter, options);
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
    totalMatriculasAtivas: targetStudents.filter((s) => isStudentActiveInDatabase(s, endDate)).length,
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

/**
 * Item individual de aula para medição de prestador de serviços por aula efetiva
 */
export interface AulaEfetivaItem {
  date: string;
  dayOfWeekLabel: string;
  activity: string;
  turma: string;
  timeSlot?: string;
  status: 'realizada' | 'feriado' | 'cancelada' | 'fora_da_grade';
  statusLabel: string;
  motivo?: string;
  qtdAlunosComChamada: number;
  valorUnitario: number;
  valorTotal: number;
}

/**
 * Resultado consolidado da apuração de aulas efetivas para pagamento do prestador
 */
export interface ApuracaoAulasEfetivasResult {
  itens: AulaEfetivaItem[];
  totalAulasDadas: number;
  totalAulasExtrasPendentes?: number;
  aulasNaoMinistradas: number;
  aulasForaGrade?: number;
  valorHoraAula: number;
  valorTotalAulasDadas: number;
  ajudaDeCusto: number;
  valorTotalLiquidoAPagar: number;
  cargaHorariaSemanalEsperada?: number;
  tetoSemanal?: number;
  diasGradeSemanal?: DayOfWeek[];
  atingiuTeto?: boolean;
}

/**
 * Apuração de Aulas Dadas para Prestador por Aula Efetiva (PJ / Horista Efetivo).
 * Sincronizado diretamente com a Grade Horária cadastrada do docente via DemonstrativoService.
 */
export function calculateApuracaoAulasEfetivasPrestador({
  prestador,
  startDate,
  endDate,
  holidays,
  records,
  schedules,
  prestadorActivities = ['Flauta'],
}: {
  prestador: UserProfile | null;
  startDate: string;
  endDate: string;
  holidays: HolidayItem[];
  records: AttendanceRecord[];
  schedules?: ScheduleBlock[];
  prestadorActivities?: string[];
}): ApuracaoAulasEfetivasResult {
  // Executa o motor oficial e sincronizado do DemonstrativoService
  return calculateDemonstrativoPJ({
    prestador,
    startDate,
    endDate,
    holidays,
    records,
    schedules,
    prestadorActivities,
  });
}

