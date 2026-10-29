import { AttendanceRecord, BlockConfirmation, Student } from '../types';

const BLOCK_CONFIRMATIONS_STORAGE_KEY = 'col_crescer_block_confirmations_v1';

/**
 * Gera uma chave unificada para identificar a chamada de um bloco de horário
 */
export function buildBlockConfirmationKey(
  date: string,
  turma: string,
  activityId: string = '',
  timeSlot: string = ''
): string {
  const normDate = (date || '').trim();
  const normTurma = (turma || '').trim().toLowerCase();
  const normActivity = (activityId || '').trim().toLowerCase();
  const normSlot = (timeSlot || '').trim().toLowerCase();
  return `${normDate}__${normTurma}__${normActivity}__${normSlot}`;
}

/**
 * Carrega o mapa de confirmações salvas localmente
 */
export function getStoredBlockConfirmations(): Record<string, BlockConfirmation> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BLOCK_CONFIRMATIONS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Erro ao carregar confirmações de bloco do localStorage:', err);
    return {};
  }
}

/**
 * Salva o mapa de confirmações no localStorage
 */
function persistBlockConfirmations(map: Record<string, BlockConfirmation>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BLOCK_CONFIRMATIONS_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Erro ao persistir confirmações de bloco no localStorage:', err);
  }
}

/**
 * Verifica se a chamada do bloco de horário foi confirmada/salva pelo monitor
 * @param date Data YYYY-MM-DD
 * @param turma Nome da Turma
 * @param activityId Modalidade / Atividade do bloco
 * @param timeSlot Horário do bloco (ex: "13:30 - 14:20")
 * @param records Registros de presença em memória (opcional)
 */
export function isBlockAttendanceConfirmed(
  date: string,
  turma: string,
  activityId?: string,
  timeSlot?: string,
  records?: AttendanceRecord[]
): boolean {
  if (!date || !turma) return false;

  // 1. Verificação no cache/armazenamento de confirmações auditáveis
  const keyWithSlot = buildBlockConfirmationKey(date, turma, activityId, timeSlot);
  const keyWithoutSlot = buildBlockConfirmationKey(date, turma, activityId, '');
  const keyTurmaDate = buildBlockConfirmationKey(date, turma, '', '');

  const confirmations = getStoredBlockConfirmations();
  if (
    (confirmations[keyWithSlot] && confirmations[keyWithSlot].confirmadoNoBloco) ||
    (confirmations[keyWithoutSlot] && confirmations[keyWithoutSlot].confirmadoNoBloco) ||
    (timeSlot === '' && confirmations[keyTurmaDate] && confirmations[keyTurmaDate].confirmadoNoBloco)
  ) {
    return true;
  }

  // 2. Verificação nos registros de chamada sincronizados (flag confirmadoNoBloco)
  if (records && records.length > 0) {
    const normTurma = turma.trim().toLowerCase();
    const hasConfirmedRecord = records.some((r) => {
      if (r.date !== date) return false;
      const recTurma = (r.turma || '').trim().toLowerCase();
      if (recTurma !== normTurma) return false;

      // Se houver atividade informada, confere compatibilidade
      if (activityId && r.activity !== activityId) return false;

      // Se tiver marcação explícita de confirmação de auditoria
      if (r.confirmadoNoBloco === true) return true;

      // Se houver timeSlot compatível e instrutor registrado
      if (timeSlot && r.timeSlot && r.timeSlot.trim() === timeSlot.trim() && (r.instructorId || r.instructorName)) {
        return true;
      }

      return false;
    });

    if (hasConfirmedRecord) {
      return true;
    }
  }

  return false;
}

/**
 * Grava o carimbo de confirmação auditável da chamada do bloco pelo monitor
 */
export function confirmBlockAttendance(params: {
  date: string;
  turma: string;
  activityId: string;
  timeSlot?: string;
  confirmedBy?: string;
}): BlockConfirmation {
  const { date, turma, activityId, timeSlot = '', confirmedBy = 'Monitor' } = params;
  const key = buildBlockConfirmationKey(date, turma, activityId, timeSlot);

  const confirmation: BlockConfirmation = {
    id: key,
    turma,
    activityId,
    date,
    timeSlot,
    confirmedAt: new Date().toISOString(),
    confirmedBy,
    confirmadoNoBloco: true,
  };

  const current = getStoredBlockConfirmations();
  current[key] = confirmation;
  // Salva também chave genérica (sem slot) para garantia de persistência
  const keyGeneric = buildBlockConfirmationKey(date, turma, activityId, '');
  current[keyGeneric] = confirmation;

  persistBlockConfirmations(current);

  // Notifica componentes em tempo de execução
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('BLOCK_CONFIRMATION_UPDATED', {
        detail: confirmation,
      })
    );
  }

  return confirmation;
}

/**
 * Remove confirmação do bloco se a chamada for reaberta ou desfeita
 */
export function clearBlockConfirmation(params: {
  date: string;
  turma: string;
  activityId?: string;
  timeSlot?: string;
}): void {
  const { date, turma, activityId = '', timeSlot = '' } = params;
  const keyWithSlot = buildBlockConfirmationKey(date, turma, activityId, timeSlot);
  const keyWithoutSlot = buildBlockConfirmationKey(date, turma, activityId, '');

  const current = getStoredBlockConfirmations();
  delete current[keyWithSlot];
  delete current[keyWithoutSlot];
  persistBlockConfirmations(current);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('BLOCK_CONFIRMATION_UPDATED', {
        detail: { turma, date, confirmadoNoBloco: false },
      })
    );
  }
}

export interface AttendanceSummaryByDate {
  date: string; // YYYY-MM-DD
  formattedDate: string;
  totalFaltas: number;
  totalPresentes: number;
  totalRegistros: number;
  alunosFaltantes: Array<{
    id: string;
    name: string;
    turma: string;
    observation?: string;
  }>;
  faltasPorTurma: Record<string, Array<{ id: string; name: string }>>;
  turmasComRegistro: string[];
}

/**
 * Normaliza qualquer entrada de data (YYYY-MM-DD ou DD/MM/YYYY) para ISO YYYY-MM-DD
 */
export function normalizeDateInput(rawDate: string): string {
  if (!rawDate) return '';
  const trimmed = rawDate.trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return trimmed;
}

/**
 * Consulta o histórico completo de frequência de uma data específica
 */
export function getAttendanceSummaryByDate(
  dateInput: string,
  inMemoryRecords?: AttendanceRecord[],
  inMemoryStudents?: Student[]
): AttendanceSummaryByDate {
  const targetDate = normalizeDateInput(dateInput);

  // Carrega registros de presença
  let allRecords: AttendanceRecord[] = [];
  if (inMemoryRecords && inMemoryRecords.length > 0) {
    allRecords = inMemoryRecords;
  } else if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('attendance_records');
      if (raw) allRecords = JSON.parse(raw);
    } catch {}
  }

  // Carrega lista de alunos
  let allStudents: Student[] = [];
  if (inMemoryStudents && inMemoryStudents.length > 0) {
    allStudents = inMemoryStudents;
  } else if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('crescer_students');
      if (raw) allStudents = JSON.parse(raw);
    } catch {}
  }

  // Mapa de alunos por ID para resolução rápida
  const studentsMap = new Map<string, Student>();
  allStudents.forEach((s) => {
    studentsMap.set(s.id, s);
  });

  // Filtra registros da data solicitada
  const dateRecords = allRecords.filter((r) => r.date === targetDate);

  // Consolidação por aluno (garantindo unicidade de alunos faltantes/presentes no dia)
  const studentStatusMap = new Map<
    string,
    {
      status: string;
      turma: string;
      studentName?: string;
      observation?: string;
    }
  >();

  const turmasSet = new Set<string>();

  dateRecords.forEach((r) => {
    if (r.turma) turmasSet.add(r.turma);
    const existing = studentStatusMap.get(r.studentId);
    // Presença sobrepõe falta caso tenha comparecido a alguma atividade do dia
    if (!existing || existing.status !== 'presente') {
      const st = studentsMap.get(r.studentId);
      studentStatusMap.set(r.studentId, {
        status: r.status,
        turma: r.turma || st?.turma || 'Geral',
        studentName: st?.name || (r as any).studentName,
        observation: r.observation,
      });
    }
  });

  const alunosFaltantes: Array<{
    id: string;
    name: string;
    turma: string;
    observation?: string;
  }> = [];

  const faltasPorTurma: Record<string, Array<{ id: string; name: string }>> = {};
  let totalPresentes = 0;
  let totalFaltas = 0;

  studentStatusMap.forEach((info, studentId) => {
    const st = studentsMap.get(studentId);
    const nomeAluno = info.studentName || st?.name || `Aluno ID ${studentId}`;
    const turmaAluno = info.turma || st?.turma || 'Sem Turma';

    if (info.status === 'presente') {
      totalPresentes++;
    } else if (info.status === 'falta' || info.status === 'sem_equipamento') {
      totalFaltas++;
      alunosFaltantes.push({
        id: studentId,
        name: nomeAluno,
        turma: turmaAluno,
        observation: info.observation,
      });

      if (!faltasPorTurma[turmaAluno]) {
        faltasPorTurma[turmaAluno] = [];
      }
      faltasPorTurma[turmaAluno].push({ id: studentId, name: nomeAluno });
    }
  });

  // Formatação BR da data
  let formattedDate = targetDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    const [y, m, d] = targetDate.split('-');
    formattedDate = `${d}/${m}/${y}`;
  }

  return {
    date: targetDate,
    formattedDate,
    totalFaltas,
    totalPresentes,
    totalRegistros: dateRecords.length,
    alunosFaltantes,
    faltasPorTurma,
    turmasComRegistro: Array.from(turmasSet),
  };
}

/**
 * Lança e confirma a chamada em lote para todos os alunos de uma turma em uma data
 */
export async function lancarFrequenciaTurma(params: {
  turmaId: string;
  data: string;
  chamadas: Array<{ alunoId: string; presente: boolean; observation?: string }>;
  instructorName?: string;
  onSaveRecord?: (record: Omit<AttendanceRecord, 'id' | 'createdAt'>) => Promise<void> | void;
}): Promise<{
  turma: string;
  data: string;
  totalAlunos: number;
  presentes: number;
  faltas: number;
}> {
  const targetDate = normalizeDateInput(params.data);
  const targetDateObj = new Date(targetDate + 'T12:00:00');
  const year = targetDateObj.getFullYear();
  const firstJan = new Date(year, 0, 1);
  const pastDaysOfYear = (targetDateObj.getTime() - firstJan.getTime()) / 86400000;
  const weekNumber = Math.max(1, Math.ceil((pastDaysOfYear + firstJan.getDay() + 1) / 7)) || 1;

  let presentesCount = 0;
  let faltasCount = 0;

  for (const item of params.chamadas) {
    const isPresent = item.presente === true;
    if (isPresent) presentesCount++;
    else faltasCount++;

    const recordData: Omit<AttendanceRecord, 'id' | 'createdAt'> = {
      studentId: item.alunoId,
      turma: params.turmaId,
      activity: 'Rotina',
      date: targetDate,
      weekNumber,
      year,
      status: isPresent ? 'presente' : 'falta',
      observation: item.observation || undefined,
      instructorName: params.instructorName || 'Sofia • Assistente IA',
      confirmadoNoBloco: true,
      confirmedAt: new Date().toISOString(),
    };

    if (params.onSaveRecord) {
      await params.onSaveRecord(recordData);
    }
  }

  // Registra carimbo oficial do bloco no frequencyService
  confirmBlockAttendance({
    date: targetDate,
    turma: params.turmaId,
    activityId: 'Rotina',
    confirmedBy: params.instructorName || 'Sofia • Assistente IA',
  });

  return {
    turma: params.turmaId,
    data: targetDate,
    totalAlunos: params.chamadas.length,
    presentes: presentesCount,
    faltas: faltasCount,
  };
}


