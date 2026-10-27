import { AttendanceRecord, BlockConfirmation } from '../types';

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
