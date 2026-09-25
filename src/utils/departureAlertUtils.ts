import { Student, AttendanceRecord, TurmaAtribuicao, UserProfile, DayOfWeek } from '../types';
import { getDefaultHorarioTurnoForTurma } from './atribuicoesStorage';
import {
  getDayOfWeekFromDate,
  normalizeDayOfWeek,
  isStudentActiveOnDate,
  isStudentScheduledForDate,
} from './dateUtils';
import { isCoordenador } from './authUtils';

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
      if (key && key.startsWith('integral_departure_alerted_')) {
        // Se a chave não contiver a data de hoje, programa para remoção
        if (!key.includes(`_${currentDateIso}_`)) {
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
      if (r.status === 'saida_antecipada' || Boolean(r.exitTime)) {
        departedOrAbsentStudentIds.add(r.studentId);
      } else if (r.status === 'falta' || r.status === 'saude') {
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

    // D. Aluno já saiu ou faltou hoje?
    if (departedOrAbsentStudentIds.has(student.id)) {
      continue;
    }

    // E. Obter horário customizado de saída do aluno para o dia
    const studentDeparture = getStudentDepartureForDay(student, dayOfWeek);
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
