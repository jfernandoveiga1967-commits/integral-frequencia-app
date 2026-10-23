import { Student, AttendanceRecord, TurmaAtribuicao, UserProfile, DayOfWeek } from '../types';
import { getDefaultHorarioTurnoForTurma } from './atribuicoesStorage';
import {
  getDayOfWeekFromDate,
  normalizeDayOfWeek,
  isStudentActiveOnDate,
  isStudentScheduledForDate,
} from './dateUtils';
import { isCoordenador } from './authUtils';
import { isRoutineActivity } from './frequenciaUtils';

export type DepartureStage = '10m' | '5m' | '0m';

export interface DepartureAlertItem {
  id: string;
  studentId: string;
  studentName: string;
  turma: string;
  departureTime: string;
  standardTime: string;
  diffMinutes: number;
  triggeredAt: string;
  stage: DepartureStage;
  instruction: string;
}

/**
 * Normaliza uma string de horário para o formato estrito "HH:MM" (ex: "16:30", "7:05")
 */
export function normalizeTimeHHMM(timeStr?: string | null): string | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = match[1].padStart(2, '0');
  const minute = match[2];
  return `${hour}:${minute}`;
}

/**
 * Converte horário "HH:MM" em minutos decorridos desde 00:00
 */
export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Obtém o horário padrão de saída de uma turma:
 * 1. Busca primeiro o valor REAL e atual em quadroAtribuicoes (campo horarioTurno)
 * 2. Se não houver documento ou campo vazio, usa getDefaultHorarioTurnoForTurma como fallback
 * 3. Extrai o horário final do turno (ex: "11:40 às 17:40" -> "17:40", "10:20 - 17:20" -> "17:20")
 */
export function getTurmaStandardDepartureTime(
  turmaName: string,
  quadroAtribuicoes?: TurmaAtribuicao[]
): string {
  if (!turmaName) return '17:40';

  // 1. Procurar em quadroAtribuicoes pelo registro salvo da turma
  const match = quadroAtribuicoes?.find(
    (item) => item.turma?.trim().toLowerCase() === turmaName.trim().toLowerCase()
  );

  let rawHorario = match?.horarioTurno?.trim();

  // 2. Se não encontrou ou está em branco, usar fallback do padrão da escola
  if (!rawHorario) {
    rawHorario = getDefaultHorarioTurnoForTurma(turmaName);
  }

  // 3. Extrair os horários presentes na string (ex: ["11:40", "17:40"])
  const times = rawHorario.match(/(\d{1,2}:\d{2})/g);
  if (times && times.length > 0) {
    // O horário de término do turno é o último horário listado
    const lastTime = times[times.length - 1];
    return normalizeTimeHHMM(lastTime) || '17:40';
  }

  return '17:40';
}

/**
 * Obtém o horário de saída configurado para o aluno no dia da semana especificado
 */
export function getStudentDepartureForDay(
  student: Student,
  dayOfWeek: DayOfWeek | string | null
): string | null {
  if (!student || !dayOfWeek) return null;
  const normDay = normalizeDayOfWeek(dayOfWeek);
  if (!normDay) return null;

  // 1. Horário específico do dia da semana
  if (student.horariosSaida && student.horariosSaida[normDay]) {
    const raw = student.horariosSaida[normDay];
    if (raw && typeof raw === 'string' && raw.trim() !== '') {
      return normalizeTimeHHMM(raw);
    }
  }

  // 2. Fallback de compatibilidade caso tenha horarioSaida fixo geral
  if (student.horarioSaida && typeof student.horarioSaida === 'string' && student.horarioSaida.trim() !== '') {
    return normalizeTimeHHMM(student.horarioSaida);
  }

  return null;
}

/**
 * Remove chaves antigas de alertas de dias anteriores do localStorage
 */
export function cleanOldDepartureAlertStorageKeys(currentDateIso: string): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith('integral_departure_alerted_') ||
          key.startsWith('integral_early_checkout_confirmed_'))
      ) {
        // Se a chave não contiver a data de hoje, programa para remoção
        if (!key.includes(`_${currentDateIso}_`) && !key.endsWith(`_${currentDateIso}`)) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.warn('Erro ao limpar chaves antigas de alerta de saída:', err);
  }
}

/**
 * Verifica se a saída antecipada do aluno já teve baixa / entrega confirmada hoje
 * pela recepção ou monitora via botão no card.
 */
export function isEarlyCheckoutConfirmed(
  currentDateIso: string,
  studentId: string,
  records?: AttendanceRecord[]
): boolean {
  // 1. Verifica nos registros de presença do dia se há confirmação explícita
  if (Array.isArray(records)) {
    const hasConfirmedRecord = records.some((r) => {
      if (!r || r.date !== currentDateIso || r.studentId !== studentId) return false;
      if (r.checkoutConfirmed === true) return true;
      if (
        r.observation &&
        (r.observation.toLowerCase().includes('confirmada') ||
          r.observation.toLowerCase().includes('baixa'))
      ) {
        return true;
      }
      return false;
    });
    if (hasConfirmedRecord) return true;
  }

  // 2. Verifica no localStorage para persistência local instantânea
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const key = `integral_early_checkout_confirmed_${currentDateIso}_${studentId}`;
      if (localStorage.getItem(key)) {
        return true;
      }
    } catch {}
  }

  return false;
}

/**
 * Marca no localStorage que a saída antecipada do aluno teve baixa confirmada hoje
 */
export function markEarlyCheckoutAsConfirmed(
  currentDateIso: string,
  studentId: string
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `integral_early_checkout_confirmed_${currentDateIso}_${studentId}`;
    localStorage.setItem(key, new Date().toISOString());
  } catch (err) {
    console.warn('Erro ao gravar confirmação de baixa de saída:', err);
  }
}

/**
 * Remove a marcação de baixa de saída antecipada (para cancelamentos/reaberturas)
 */
export function unmarkEarlyCheckoutConfirmed(
  currentDateIso: string,
  studentId: string
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `integral_early_checkout_confirmed_${currentDateIso}_${studentId}`;
    localStorage.removeItem(key);
  } catch (err) {
    console.warn('Erro ao remover confirmação de baixa de saída:', err);
  }
}

/**
 * Verifica se uma saída de aluno já foi alertada hoje em um estágio específico (10m, 5m ou 0m)
 */
export function isDepartureAlreadyAlerted(
  currentDateIso: string,
  studentId: string,
  departureTime: string,
  stage?: DepartureStage
): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stageSuffix = stage ? `_${stage}` : '';
    const key = `integral_departure_alerted_${currentDateIso}_${studentId}_${departureTime}${stageSuffix}`;
    return Boolean(localStorage.getItem(key));
  } catch {
    return false;
  }
}

/**
 * Marca uma saída de aluno como alertada hoje no localStorage em um estágio específico
 */
export function markDepartureAsAlerted(
  currentDateIso: string,
  studentId: string,
  departureTime: string,
  stage?: DepartureStage
): void {
  if (typeof window === 'undefined') return;
  try {
    const stageSuffix = stage ? `_${stage}` : '';
    const key = `integral_departure_alerted_${currentDateIso}_${studentId}_${departureTime}${stageSuffix}`;
    localStorage.setItem(key, new Date().toISOString());
  } catch (err) {
    console.warn('Erro ao gravar alerta de saída no localStorage:', err);
  }
}

/**
 * Avalia todos os alunos e retorna as saídas customizadas que entraram nos 3 estágios de alerta (10m, 5m, 0m)
 */
export function evaluateDepartureAlerts(params: {
  students: Student[];
  records: AttendanceRecord[];
  quadroAtribuicoes?: TurmaAtribuicao[];
  selectedDate: string; // YYYY-MM-DD
  currentUser: UserProfile | null;
  alertMinutes?: number;
  simulatedTimeHHMM?: string; // Opcional para testes e simulações
  dayOfWeekOverride?: DayOfWeek; // Opcional para testes e simulações
}): DepartureAlertItem[] {
  const {
    students,
    records,
    quadroAtribuicoes,
    selectedDate,
    currentUser,
    simulatedTimeHHMM,
    dayOfWeekOverride,
  } = params;

  if (!students || students.length === 0) return [];

  // 1. Identificar dia da semana (não alerta em fins de semana)
  const dayOfWeek = dayOfWeekOverride || getDayOfWeekFromDate(selectedDate);
  if (!dayOfWeek) return [];

  // 2. Determinar horário de referência (atual ou simulado)
  let currentMinutes: number;
  if (simulatedTimeHHMM) {
    const normSim = normalizeTimeHHMM(simulatedTimeHHMM);
    if (!normSim) return [];
    currentMinutes = timeToMinutes(normSim);
  } else {
    const now = new Date();
    currentMinutes = now.getHours() * 60 + now.getMinutes();
  }

  // 3. Permissões de Turma: monitoras só são alertadas sobre turmas atribuídas
  const isUserCoord = isCoordenador(currentUser);
  const userTurmas = new Set<string>(
    currentUser?.allowedClassIds || currentUser?.assignedTurmas || []
  );

  // 4. Mapear status de presença/saída dos alunos no dia
  const departedOrAbsentStudentIds = new Set<string>();
  records.forEach((r) => {
    if (r.date === selectedDate) {
      if (isEarlyCheckoutConfirmed(selectedDate, r.studentId, records)) {
        departedOrAbsentStudentIds.add(r.studentId);
      } else if (
        r.status === 'falta' &&
        !records.some((rec) => rec.date === selectedDate && rec.studentId === r.studentId && rec.status === 'saida_antecipada')
      ) {
        departedOrAbsentStudentIds.add(r.studentId);
      }
    }
  });

  const alertsToTrigger: DepartureAlertItem[] = [];

  for (const student of students) {
    // A. Filtrar por turma do usuário
    if (!isUserCoord && userTurmas.size > 0 && !userTurmas.has(student.turma)) {
      continue;
    }

    // B. Aluno deve estar ativo na data
    if (!isStudentActiveOnDate(student, selectedDate)) {
      continue;
    }

    // C. Aluno deve ter frequência prevista para a data
    if (!isStudentScheduledForDate(student, selectedDate)) {
      continue;
    }

    // D. Aluno já saiu (baixa confirmada) ou faltou hoje?
    if (departedOrAbsentStudentIds.has(student.id)) {
      continue;
    }

    // E. Obter horário customizado de saída do aluno para o dia (Fonte a: cadastro; Fonte b: chamada)
    let studentDeparture = getStudentDepartureForDay(student, dayOfWeek);
    const saidaRec = records.find(
      (r) => r.date === selectedDate && r.studentId === student.id && r.status === 'saida_antecipada'
    );
    if (saidaRec) {
      let callTime = normalizeTimeHHMM(saidaRec.exitTime);
      if (!callTime && saidaRec.observation) {
        const match = saidaRec.observation.match(/(\d{1,2}:\d{2})/);
        if (match) callTime = normalizeTimeHHMM(match[1]);
      }
      if (callTime) {
        studentDeparture = callTime;
      }
    }

    if (!studentDeparture) {
      continue; // Não possui horário customizado neste dia
    }

    // F. Obter horário padrão da turma
    const standardDeparture = getTurmaStandardDepartureTime(student.turma, quadroAtribuicoes);

    // G. REGRA FUNDAMENTAL: O alerta SÓ dispara se for DIFERENTE do padrão da turma
    if (studentDeparture === standardDeparture) {
      continue;
    }

    // H. Verificar em qual dos 3 estágios automáticos o aluno se enquadra
    const departureMinutes = timeToMinutes(studentDeparture);
    const diffMinutes = departureMinutes - currentMinutes;

    let currentStage: DepartureStage | null = null;
    let stageInstruction = '';

    // 1º Estágio: 10 minutos antes (entre 10 min e > 5 min)
    if (diffMinutes <= 10 && diffMinutes > 5) {
      currentStage = '10m';
      stageInstruction = 'Organizar pertences e mochila do aluno';
    }
    // 2º Estágio: 5 minutos antes (entre 5 min e > 0 min)
    else if (diffMinutes <= 5 && diffMinutes > 0) {
      currentStage = '5m';
      stageInstruction = 'Encaminhar aluno ao portão / ponto de encontro';
    }
    // 3º Estágio: No horário exato / 0 min (com tolerância de até 5 minutos após o horário)
    else if (diffMinutes <= 0 && diffMinutes >= -5) {
      currentStage = '0m';
      stageInstruction = 'Horário atingido: Aluno liberado';
    }

    // Se estiver em um estágio ativo e ainda não alertado neste estágio hoje
    if (currentStage) {
      if (!isDepartureAlreadyAlerted(selectedDate, student.id, studentDeparture, currentStage)) {
        alertsToTrigger.push({
          id: `${student.id}_${studentDeparture}_${currentStage}`,
          studentId: student.id,
          studentName: student.name,
          turma: student.turma,
          departureTime: studentDeparture,
          standardTime: standardDeparture,
          diffMinutes,
          triggeredAt: new Date().toISOString(),
          stage: currentStage,
          instruction: stageInstruction,
        });
      }
    }
  }

  return alertsToTrigger;
}

export interface PendingEarlyDeparture {
  student: Student;
  departureTime: string;
  standardTime: string;
  source?: 'cadastro' | 'chamada' | 'ambos';
}

/**
 * Mapeia os alunos de uma determinada turma regular que possuem horário de saída antecipada
 * para o dia selecionado e que AINDA NÃO tiveram a saída confirmada/concluída hoje.
 *
 * Captura saídas antecipadas de AMBAS as fontes:
 *  a) Horário de saída agendado na ficha do aluno (student.horariosSaida ou student.horarioSaida);
 *  b) Status 'Saída Antecipada' registrado na Chamada de Frequência do dia (records com status === 'saida_antecipada', ex.: Daniel Brusco - 15:20).
 *
 * Regra de Permanência Visual no Card:
 * - Exibe o aluno no card da turma regular durante TODO O DIA (mesmo em horário futuro como 15:20 ou já marcado na chamada)
 *   até que a recepção/monitora confirme a entrega do aluno com o botão de baixa/conclusão de saída.
 */
export function getPendingEarlyDeparturesForTurma(params: {
  turmaName: string;
  students: Student[];
  records: AttendanceRecord[];
  selectedDate: string;
  quadroAtribuicoes?: TurmaAtribuicao[];
}): PendingEarlyDeparture[] {
  const { turmaName, students, records, selectedDate, quadroAtribuicoes } = params;
  if (!turmaName || !Array.isArray(students) || students.length === 0) return [];

  const dayOfWeek = getDayOfWeekFromDate(selectedDate);
  if (!dayOfWeek) return [];

  const standardDeparture = getTurmaStandardDepartureTime(turmaName, quadroAtribuicoes);
  const standardMinutes = timeToMinutes(standardDeparture);

  // Mapeia registros de frequência do dia para consulta rápida por aluno
  const recordsTodayByStudent = new Map<string, AttendanceRecord[]>();
  if (Array.isArray(records)) {
    records.forEach((r) => {
      if (r && r.date === selectedDate && r.studentId) {
        const list = recordsTodayByStudent.get(r.studentId) || [];
        list.push(r);
        recordsTodayByStudent.set(r.studentId, list);
      }
    });
  }

  const pending: PendingEarlyDeparture[] = [];
  const processedStudentIds = new Set<string>();

  students.forEach((student) => {
    if (!student || student.turma !== turmaName) return;

    // Aluno deve estar ativo na data
    if (!isStudentActiveOnDate(student, selectedDate)) return;

    // Aluno deve ter frequência prevista para a data
    if (!isStudentScheduledForDate(student, selectedDate)) return;

    const studentRecords = recordsTodayByStudent.get(student.id) || [];

    // Se o aluno teve a entrega/baixa confirmada pela recepção/monitora, não exibe mais no card
    if (isEarlyCheckoutConfirmed(selectedDate, student.id, studentRecords)) {
      return;
    }

    // Se o aluno faltou o dia todo (marcado apenas com falta e sem nenhuma saída antecipada nem presença)
    const hasSaidaAntecipadaRecord = studentRecords.some((r) => r.status === 'saida_antecipada');
    const hasOnlyFalta =
      studentRecords.length > 0 &&
      studentRecords.every((r) => r.status === 'falta') &&
      !hasSaidaAntecipadaRecord;
    if (hasOnlyFalta) {
      return;
    }

    // Fonte a: Horário de saída agendado na ficha do aluno
    const profileDeparture = getStudentDepartureForDay(student, dayOfWeek);
    let isProfileEarly = false;
    if (profileDeparture) {
      const depMin = timeToMinutes(profileDeparture);
      if (depMin < standardMinutes) {
        isProfileEarly = true;
      }
    }

    // Fonte b: Status 'Saída Antecipada' registrado na Chamada de Frequência do dia (ex.: Daniel Brusco - 15:20)
    let callDepartureTime: string | null = null;
    if (hasSaidaAntecipadaRecord) {
      const saidaRec =
        studentRecords.find((r) => r.status === 'saida_antecipada' && isRoutineActivity(r.activity)) ||
        studentRecords.find((r) => r.status === 'saida_antecipada');

      if (saidaRec) {
        if (saidaRec.exitTime) {
          callDepartureTime = normalizeTimeHHMM(saidaRec.exitTime);
        }
        if (!callDepartureTime && saidaRec.observation) {
          const match = saidaRec.observation.match(/(\d{1,2}:\d{2})/);
          if (match) {
            callDepartureTime = normalizeTimeHHMM(match[1]);
          }
        }
        if (!callDepartureTime) {
          callDepartureTime = profileDeparture || '15:20';
        }
      }
    }

    // Captura o aluno se tiver saída antecipada por qualquer uma das duas fontes
    if (isProfileEarly || hasSaidaAntecipadaRecord) {
      // Prioridade do horário: o registrado na chamada de hoje prevalece se existir; senão o agendado na ficha
      const effectiveDepartureTime = callDepartureTime || profileDeparture || '15:20';

      let source: 'cadastro' | 'chamada' | 'ambos' = 'cadastro';
      if (isProfileEarly && hasSaidaAntecipadaRecord) {
        source = 'ambos';
      } else if (hasSaidaAntecipadaRecord) {
        source = 'chamada';
      }

      processedStudentIds.add(student.id);
      pending.push({
        student,
        departureTime: effectiveDepartureTime,
        standardTime: standardDeparture,
        source,
      });
    }
  });

  // Também verifica se há algum aluno registrado com saída antecipada na chamada desta turma
  // mas cujo cadastro de turma possa divergir pontualmente
  if (Array.isArray(records)) {
    records.forEach((r) => {
      if (
        r &&
        r.date === selectedDate &&
        r.turma === turmaName &&
        r.status === 'saida_antecipada' &&
        r.studentId &&
        !processedStudentIds.has(r.studentId)
      ) {
        const studentObj = students.find((s) => s.id === r.studentId);
        if (studentObj && isStudentActiveOnDate(studentObj, selectedDate)) {
          const studentRecords = recordsTodayByStudent.get(studentObj.id) || [r];
          if (!isEarlyCheckoutConfirmed(selectedDate, studentObj.id, studentRecords)) {
            let depTime = normalizeTimeHHMM(r.exitTime);
            if (!depTime && r.observation) {
              const match = r.observation.match(/(\d{1,2}:\d{2})/);
              if (match) depTime = normalizeTimeHHMM(match[1]);
            }
            if (!depTime) {
              depTime = getStudentDepartureForDay(studentObj, dayOfWeek) || '15:20';
            }

            processedStudentIds.add(studentObj.id);
            pending.push({
              student: studentObj,
              departureTime: depTime,
              standardTime: standardDeparture,
              source: 'chamada',
            });
          }
        }
      }
    });
  }

  // Ordena por horário de saída (mais cedo primeiro) e depois por ordem alfabética do nome
  return pending.sort((a, b) => {
    const diff = timeToMinutes(a.departureTime) - timeToMinutes(b.departureTime);
    if (diff !== 0) return diff;
    return (a.student.name || '').localeCompare(b.student.name || '', 'pt-BR');
  });
}

