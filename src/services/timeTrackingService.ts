/**
 * Serviço de Registro e Gestão Sequencial de Batidas de Ponto (Livro Ponto)
 * 
 * Regras de Negócio e Travas de Segurança:
 * 1. Obtenção do registro mais recente do dia (Firestore + Cache Local).
 * 2. Ordenação estrita das marcas de horário existentes em ordem cronológica.
 * 3. Alocação sequencial determinística de slots diários:
 *    - Batida 1 -> Atribuída estritamente a entrada_1 / entry1.
 *    - Batida 2 -> Atribuída estritamente a saida_1 / exit1 (validando horário > entrada_1).
 *    - Batida 3 -> Atribuída estritamente a entrada_2 / entry2 (validando horário > saida_1).
 *    - Batida 4 -> Atribuída estritamente a saida_2 / exit2 (validando horário > entrada_2).
 * 4. Trava anti-sobrescrita: NUNCA sobrescreve um slot preenchido no mesmo dia.
 *    A nova batida avança obrigatoriamente para o próximo slot vago na sequência.
 * 5. Matriz completa de 4 batidas preservada no estado local, cache e Firestore.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PontoRecord } from '../types';
import { loadPontoRecords, savePontoRecords } from '../utils/storageUtils';
import { broadcastSyncEvent } from './syncService';
import { isSimplifiedTwoPunchUser } from '../utils/pontoUtils';

export type PunchSlotKey = 'entry1' | 'exit1' | 'entry2' | 'exit2';

export interface RegisterPunchParams {
  userId: string;
  userName: string;
  dateStr?: string; // YYYY-MM-DD (padrão: hoje)
  currentTime?: string; // HH:mm (padrão: horário atual)
  existingRecord?: PontoRecord | null;
  toleranceMinutes?: number;
  contractSchedule?: string;
  updatedByName?: string;
  auditData?: {
    wifiValidated?: boolean;
    networkName?: string;
    clientIp?: string;
    geofenceValidated?: boolean;
    locationId?: string;
    locationName?: string;
    latitude?: number;
    longitude?: number;
    distanceMeters?: number;
  };
}

export interface RegisterPunchResult {
  success: boolean;
  error?: string;
  slotAssigned?: PunchSlotKey;
  slotNumber?: 1 | 2 | 3 | 4;
  slotName?: string;
  updatedRecord?: PontoRecord;
  existingRecord?: PontoRecord;
}

/**
 * Converte string de horário "HH:mm" ou "H:mm" para total de minutos desde 00:00.
 */
export function timeStringToMinutes(timeStr?: string | null): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.trim().match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

/**
 * Normaliza horário no formato padrão estrito "HH:mm".
 */
export function normalizeTimeString(timeStr?: string | null): string {
  if (!timeStr || typeof timeStr !== 'string') return '';
  const match = timeStr.trim().match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/);
  if (!match) return timeStr.trim();
  const h = String(parseInt(match[1], 10)).padStart(2, '0');
  const m = String(parseInt(match[2], 10)).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Obtém a data atual no formato YYYY-MM-DD
 */
export function getCurrentDateISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Obtém o horário atual no formato HH:mm
 */
export function getCurrentTimeHHMM(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Busca o registro mais recente do colaborador para a data especificada
 * combinando: parâmetro direto, Cache do LocalStorage e leitura no Firestore.
 */
export async function getFreshestDayPontoRecord(
  userId: string,
  dateStr: string,
  initialRecord?: PontoRecord | null
): Promise<PontoRecord | null> {
  const recordId = `${userId}_${dateStr}`;
  let bestRecord: PontoRecord | null = initialRecord || null;

  // 1. Verifica cache local do storage
  try {
    const cachedList = loadPontoRecords();
    const foundInCache = cachedList.find((r) => r.userId === userId && r.date === dateStr);
    if (foundInCache) {
      if (!bestRecord) {
        bestRecord = foundInCache;
      } else {
        // Se o cache tiver mais batidas preenchidas ou updatedAt mais recente, prefere o cache
        const cachePunches = countFilledPunches(foundInCache);
        const bestPunches = countFilledPunches(bestRecord);
        if (cachePunches > bestPunches) {
          bestRecord = foundInCache;
        }
      }
    }
  } catch (e) {
    console.warn('[timeTrackingService] Aviso ao ler cache local de ponto:', e);
  }

  // 2. Consulta Firestore para garantir a fonte de verdade mais recente
  try {
    const docRef = doc(db, 'pontoRecords', recordId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const fsRecord = snap.data() as PontoRecord;
      if (!bestRecord) {
        bestRecord = fsRecord;
      } else {
        const fsPunches = countFilledPunches(fsRecord);
        const bestPunches = countFilledPunches(bestRecord);
        if (fsPunches >= bestPunches) {
          bestRecord = fsRecord;
        }
      }
    }
  } catch (err) {
    console.warn('[timeTrackingService] Aviso ao consultar Firestore para ponto do dia:', err);
  }

  return bestRecord;
}

/**
 * Conta quantos slots de batida estão efetivamente preenchidos
 */
function countFilledPunches(r?: Partial<PontoRecord> | null): number {
  if (!r) return 0;
  let count = 0;
  if ((r.entry1 || r.entrada_1 || '').trim()) count++;
  if ((r.exit1 || r.saida_1 || '').trim()) count++;
  if ((r.entry2 || r.entrada_2 || '').trim()) count++;
  if ((r.exit2 || r.saida_2 || '').trim()) count++;
  return count;
}

/**
 * Extrai e normaliza os 4 slots de horário existentes do registro
 */
export function extractDaySlots(record?: Partial<PontoRecord> | null): {
  e1: string;
  s1: string;
  e2: string;
  s2: string;
} {
  return {
    e1: normalizeTimeString(record?.entry1 || record?.entrada_1),
    s1: normalizeTimeString(record?.exit1 || record?.saida_1),
    e2: normalizeTimeString(record?.entry2 || record?.entrada_2),
    s2: normalizeTimeString(record?.exit2 || record?.saida_2),
  };
}

/**
 * Registra uma nova batida de ponto com alocação sequencial estrita dos 4 slots diários.
 * Nome oficial interoperável: registerPunch (alias: salvarBatidaPonto).
 */
export async function registerPunch(params: RegisterPunchParams): Promise<RegisterPunchResult> {
  const {
    userId,
    userName,
    dateStr = getCurrentDateISO(),
    currentTime = getCurrentTimeHHMM(),
    existingRecord: paramRecord,
    updatedByName = 'Sistema',
    auditData,
  } = params;

  if (!userId) {
    return {
      success: false,
      error: 'ID de colaborador inválido ou não especificado.',
    };
  }

  const normalizedPunchTime = normalizeTimeString(currentTime);
  const punchMinutes = timeStringToMinutes(normalizedPunchTime);

  if (punchMinutes === null) {
    return {
      success: false,
      error: `Formato de horário inválido: "${currentTime}". Esperado HH:mm.`,
    };
  }

  // 1. Obtém o registro mais atualizado do dia
  const freshestRecord = await getFreshestDayPontoRecord(userId, dateStr, paramRecord);
  const currentSlots = extractDaySlots(freshestRecord);

  // 2. Extrai marcas de horários existentes válidas e ordena estritamente em ordem cronológica
  const existingMarks: { slot: PunchSlotKey; time: string; minutes: number }[] = [];
  if (currentSlots.e1 && timeStringToMinutes(currentSlots.e1) !== null) {
    existingMarks.push({ slot: 'entry1', time: currentSlots.e1, minutes: timeStringToMinutes(currentSlots.e1)! });
  }
  if (currentSlots.s1 && timeStringToMinutes(currentSlots.s1) !== null) {
    existingMarks.push({ slot: 'exit1', time: currentSlots.s1, minutes: timeStringToMinutes(currentSlots.s1)! });
  }
  if (currentSlots.e2 && timeStringToMinutes(currentSlots.e2) !== null) {
    existingMarks.push({ slot: 'entry2', time: currentSlots.e2, minutes: timeStringToMinutes(currentSlots.e2)! });
  }
  if (currentSlots.s2 && timeStringToMinutes(currentSlots.s2) !== null) {
    existingMarks.push({ slot: 'exit2', time: currentSlots.s2, minutes: timeStringToMinutes(currentSlots.s2)! });
  }

  // Ordena estritamente por minutos cronológicos
  existingMarks.sort((a, b) => a.minutes - b.minutes);

  // 3. Alocação Sequencial Determinística de Slots & Trava Anti-Sobrescrita
  const isSimplifiedUser = isSimplifiedTwoPunchUser(undefined, userName || userId);

  let targetSlot: PunchSlotKey;
  let slotNumber: 1 | 2 | 3 | 4;
  let slotName: string;

  if (isSimplifiedUser) {
    // Jornada Simplificada de 2 batidas ([Entrada 1] e [Saída 1]) exclusivamente para Danyel Pereira e Thaís Grisoni
    if (!currentSlots.e1) {
      targetSlot = 'entry1';
      slotNumber = 1;
      slotName = 'Entrada 1 (Início da Jornada)';
    } else if (!currentSlots.s1 && !currentSlots.s2) {
      const prevTime = currentSlots.e1;
      const prevMinutes = timeStringToMinutes(prevTime)!;

      if (punchMinutes <= prevMinutes) {
        return {
          success: false,
          error: `O horário da Saída 1 (${normalizedPunchTime}) deve ser estritamente posterior ao horário de Entrada 1 (${prevTime}).`,
        };
      }

      targetSlot = 'exit1';
      slotNumber = 2;
      slotName = 'Saída 1 (Fim da Jornada)';
    } else {
      const e1Val = currentSlots.e1;
      const s1Val = currentSlots.s1 || currentSlots.s2;
      return {
        success: false,
        error: `Todas as 2 batidas da jornada simplificada de hoje já foram preenchidas (Entrada 1: ${e1Val} • Saída 1: ${s1Val}). Nenhuma batida foi sobrescrita. Utilize o botão de edição na tabela se precisar ajustar horários.`,
      };
    }
  } else {
    // Garante a distribuição sequencial de 4 batidas para os demais colaboradores da instituição:
    // Se entrada_1 vazia -> Batida 1
    // Se entrada_1 preenchida e saida_1 vazia -> Batida 2 (com validação > entrada_1)
    // Se saida_1 preenchida e entrada_2 vazia -> Batida 3 (com validação > saida_1)
    // Se entrada_2 preenchida e saida_2 vazia -> Batida 4 (com validação > entrada_2)
    if (!currentSlots.e1) {
      // Batida 1 -> Atribua estritamente a entrada_1
      targetSlot = 'entry1';
      slotNumber = 1;
      slotName = 'Entrada 1 (Início da Jornada)';
    } else if (!currentSlots.s1) {
      // Batida 2 -> Atribua estritamente a saida_1
      const prevTime = currentSlots.e1;
      const prevMinutes = timeStringToMinutes(prevTime)!;

      if (punchMinutes <= prevMinutes) {
        return {
          success: false,
          error: `O horário da Saída 1 (${normalizedPunchTime}) deve ser estritamente posterior ao horário de Entrada 1 (${prevTime}).`,
        };
      }

      targetSlot = 'exit1';
      slotNumber = 2;
      slotName = 'Saída Almoço (Saída Intervalo)';
    } else if (!currentSlots.e2) {
      // Batida 3 -> Atribua estritamente a entrada_2
      const prevTime = currentSlots.s1;
      const prevMinutes = timeStringToMinutes(prevTime)!;

      if (punchMinutes <= prevMinutes) {
        return {
          success: false,
          error: `O horário do Retorno Almoço (${normalizedPunchTime}) deve ser estritamente posterior ao horário de Saída Almoço (${prevTime}).`,
        };
      }

      targetSlot = 'entry2';
      slotNumber = 3;
      slotName = 'Retorno Almoço (Retorno Intervalo)';
    } else if (!currentSlots.s2) {
      // Batida 4 -> Atribua estritamente a saida_2
      const prevTime = currentSlots.e2;
      const prevMinutes = timeStringToMinutes(prevTime)!;

      if (punchMinutes <= prevMinutes) {
        return {
          success: false,
          error: `O horário da Saída 2 (${normalizedPunchTime}) deve ser estritamente posterior ao horário de Retorno Almoço (${prevTime}).`,
        };
      }

      targetSlot = 'exit2';
      slotNumber = 4;
      slotName = 'Saída 2 (Saída Final da Jornada)';
    } else {
      // Trava de segurança: todas as 4 batidas já registradas
      return {
        success: false,
        error: `Todas as 4 batidas da jornada diária de hoje já foram preenchidas (E1: ${currentSlots.e1} • S1: ${currentSlots.s1} • E2: ${currentSlots.e2} • S2: ${currentSlots.s2}). Nenhuma batida foi sobrescrita. Utilize o botão de edição na tabela se precisar ajustar horários.`,
      };
    }
  }

  // 4. Monta o registro consolidado com a matriz completa de 4 batidas sem perder nenhum horário
  const nowIso = new Date().toISOString();
  const dayNumber = Number(dateStr.split('-')[2]) || 1;
  const monthKey = dateStr.substring(0, 7);
  const recordId = freshestRecord?.id || `${userId}_${dateStr}`;

  const updatedE1 = targetSlot === 'entry1' ? normalizedPunchTime : currentSlots.e1;
  const updatedS1 = targetSlot === 'exit1' ? normalizedPunchTime : currentSlots.s1;
  const updatedE2 = targetSlot === 'entry2' ? normalizedPunchTime : currentSlots.e2;
  const updatedS2 = targetSlot === 'exit2' ? normalizedPunchTime : currentSlots.s2;

  const consolidatedRecord: PontoRecord = {
    ...(freshestRecord || {}),
    id: recordId,
    userId,
    userName: userName || freshestRecord?.userName || 'Colaborador',
    date: dateStr,
    monthKey,
    dayNumber,
    // Matriz dos 4 slots canônicos
    entry1: updatedE1,
    exit1: updatedS1,
    entry2: updatedE2,
    exit2: updatedS2,
    // Aliases interoperáveis solicitados
    entrada_1: updatedE1,
    saida_1: updatedS1,
    entrada_2: updatedE2,
    saida_2: updatedS2,
    status: freshestRecord?.status || 'normal',
    createdAt: freshestRecord?.createdAt || nowIso,
    updatedAt: nowIso,
    updatedBy: updatedByName,
    // Auditoria e geolocalização / Wi-Fi
    ...(auditData || {}),
  };

  // 5. Grava no Firestore com segurança e tratamento
  try {
    const docRef = doc(db, 'pontoRecords', recordId);
    await setDoc(docRef, consolidatedRecord, { merge: true });
  } catch (firestoreErr) {
    console.error('[timeTrackingService] Erro ao gravar batida de ponto no Firestore:', firestoreErr);
    // Continua para atualizar cache local mesmo em caso de erro temporário de rede
  }

  // 6. Atualiza o cache local (LocalStorage) com a matriz completa dos registros
  try {
    const currentCached = loadPontoRecords();
    const existingIdx = currentCached.findIndex((r) => r.id === recordId || (r.userId === userId && r.date === dateStr));
    let nextCached: PontoRecord[];
    if (existingIdx >= 0) {
      nextCached = [...currentCached];
      nextCached[existingIdx] = consolidatedRecord;
    } else {
      nextCached = [consolidatedRecord, ...currentCached];
    }
    savePontoRecords(nextCached);
    broadcastSyncEvent('SYNC_PONTO_RECORDS', nextCached);
  } catch (storageErr) {
    console.warn('[timeTrackingService] Aviso ao atualizar LocalStorage após batida:', storageErr);
  }

  // Dispara evento local para atualização reativa
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('app_ponto_registered', {
        detail: {
          record: consolidatedRecord,
          slotAssigned: targetSlot,
          slotNumber,
          slotName,
          time: normalizedPunchTime,
        },
      })
    );
  }

  return {
    success: true,
    slotAssigned: targetSlot,
    slotNumber,
    slotName,
    updatedRecord: consolidatedRecord,
    existingRecord: freshestRecord || undefined,
  };
}

/**
 * Alias em português brasileiro para máxima compatibilidade com as diretrizes do sistema.
 */
export const salvarBatidaPonto = registerPunch;
export default {
  registerPunch,
  salvarBatidaPonto,
  getFreshestDayPontoRecord,
  extractDaySlots,
  timeStringToMinutes,
  normalizeTimeString,
};
