import { ScheduleBlock, SemanarioPlan, ActivityItem } from '../types';

/**
 * Normaliza qualquer formato de horário para o formato estrito 'HH:mm'.
 * Trata variações como:
 * - "8:30" => "08:30"
 * - "13:30:00" => "13:30"
 * - "14h30" => "14:30"
 * - " 09:05 " => "09:05"
 */
export function normalizeTime(timeStr?: string | null): string {
  if (!timeStr || typeof timeStr !== 'string') return '';
  const cleaned = timeStr.trim();
  if (!cleaned) return '';

  // Procura padrão com dois números separados por ':' ou 'h'
  const match = cleaned.match(/(\d{1,2})[:hH](\d{2})/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  // Fallback caso venha apenas hora ou hora sem minutos
  const hourOnlyMatch = cleaned.match(/^(\d{1,2})$/);
  if (hourOnlyMatch) {
    const hours = parseInt(hourOnlyMatch[1], 10);
    if (!isNaN(hours) && hours >= 0 && hours <= 23) {
      return `${String(hours).padStart(2, '0')}:00`;
    }
  }

  return '';
}

/**
 * Converte um horário no formato 'HH:mm' para o número total de minutos desde a meia-noite (0..1439).
 * Retorna -1 se o formato for inválido.
 */
export function timeToMinutes(timeStr?: string | null): number {
  const normalized = normalizeTime(timeStr);
  if (!normalized) return -1;
  const [hStr, mStr] = normalized.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

/**
 * Verifica se um horário de referência (currentTime) está dentro do intervalo [startTime, endTime).
 * Converte estritamente para minutos para evitar armadilhas de comparação lexicográfica em ASCII.
 */
export function isTimeInRange(currentTime: string, startTime: string, endTime: string): boolean {
  const currentMin = timeToMinutes(currentTime);
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);

  if (currentMin === -1 || startMin === -1 || endMin === -1) return false;

  // Caso normal (ex: 13:30 até 14:20)
  if (startMin <= endMin) {
    return currentMin >= startMin && currentMin < endMin;
  }

  // Caso especial: turno que cruza a meia-noite
  return currentMin >= startMin || currentMin < endMin;
}

/**
 * Extrai os limites de início e fim ('horaInicio' e 'horaFim') de um bloco da grade horária,
 * verificando todos os campos possíveis ('horaInicio', 'startTime', 'horaFim', 'endTime' e 'timeSlot').
 */
export function extractSlotLimits(slot: {
  startTime?: string;
  endTime?: string;
  horaInicio?: string;
  horaFim?: string;
  timeSlot?: string;
}): { horaInicio: string; horaFim: string } {
  let start = slot.horaInicio || slot.startTime || '';
  let end = slot.horaFim || slot.endTime || '';

  if ((!start || !end) && slot.timeSlot) {
    const matches = slot.timeSlot.match(/(\d{1,2}[:hH]\d{2})/g);
    if (matches && matches.length >= 2) {
      if (!start) start = matches[0];
      if (!end) end = matches[1];
    } else if (matches && matches.length === 1 && !start) {
      start = matches[0];
    }
  }

  return {
    horaInicio: normalizeTime(start),
    horaFim: normalizeTime(end),
  };
}

/**
 * Localiza a atividade ativa da turma com base no horário do relógio normalizado em 'HH:mm'.
 * Avalia estritamente cada bloco da grade horária.
 */
export function getCurrentActivityForTurma(
  turmaBlocks: ScheduleBlock[],
  currentTime: string
): ScheduleBlock | null {
  if (!Array.isArray(turmaBlocks) || turmaBlocks.length === 0) return null;
  const currentMin = timeToMinutes(currentTime);
  if (currentMin === -1) return null;

  for (const block of turmaBlocks) {
    if (!block) continue;
    const { horaInicio, horaFim } = extractSlotLimits(block);
    if (!horaInicio || !horaFim) continue;

    const startMin = timeToMinutes(horaInicio);
    const endMin = timeToMinutes(horaFim);

    if (startMin !== -1 && endMin !== -1) {
      if (startMin <= endMin) {
        if (currentMin >= startMin && currentMin < endMin) {
          return block;
        }
      } else {
        // Intervalo que vira a meia-noite
        if (currentMin >= startMin || currentMin < endMin) {
          return block;
        }
      }
    }
  }

  return null;
}

/**
 * Alias determinístico para getCurrentActivityForTurma
 */
export const getSlotAtivo = getCurrentActivityForTurma;

/**
 * Localiza o próximo bloco de atividade programado para a turma após o horário atual.
 */
export function getNextSlot(
  turmaBlocks: ScheduleBlock[],
  currentTime: string
): ScheduleBlock | null {
  if (!Array.isArray(turmaBlocks) || turmaBlocks.length === 0) return null;
  const currentMin = timeToMinutes(currentTime);
  if (currentMin === -1) return null;

  const upcomingBlocks = turmaBlocks.filter((block) => {
    if (!block) return false;
    const { horaInicio } = extractSlotLimits(block);
    const startMin = timeToMinutes(horaInicio);
    return startMin !== -1 && currentMin < startMin;
  });

  if (upcomingBlocks.length === 0) return null;

  upcomingBlocks.sort((a, b) => {
    const minA = timeToMinutes(extractSlotLimits(a).horaInicio);
    const minB = timeToMinutes(extractSlotLimits(b).horaInicio);
    return minA - minB;
  });

  return upcomingBlocks[0];
}

/**
 * Localiza os blocos da turma que já foram concluídos no dia com base no horário atual.
 */
export function getPastSlots(
  turmaBlocks: ScheduleBlock[],
  currentTime: string
): ScheduleBlock[] {
  if (!Array.isArray(turmaBlocks) || turmaBlocks.length === 0) return [];
  const currentMin = timeToMinutes(currentTime);
  if (currentMin === -1) return [];

  return turmaBlocks.filter((block) => {
    if (!block) return false;
    const { horaFim } = extractSlotLimits(block);
    const endMin = timeToMinutes(horaFim);
    return endMin !== -1 && currentMin >= endMin;
  });
}

/**
 * Extrai a descrição detalhada da atividade ativa, inspecionando todos os campos possíveis:
 * 1. Campos do bloco da grade: 'descricao', 'observacao', 'detalhes', 'guidelines'
 * 2. Campos do planejamento semanal (Semanário): 'development', 'descricao', 'detalhes', 'observacao', 'objectives', 'notes'
 * 3. Campos da lista de atividades (ActivityItem): 'description', 'descricao', 'detalhes', 'observacao'
 * 4. Fallback de títulos e nomes: 'title', 'nome', 'activityId'
 */
export function extractActivityDescription(options: {
  block?: ScheduleBlock | null;
  plan?: SemanarioPlan | null;
  activityItem?: ActivityItem | null;
}): string {
  const { block, plan, activityItem } = options;

  // 1. Verificar detalhamento do planejamento semanal (Semanário Pedagógico)
  if (plan) {
    if (plan.development && typeof plan.development === 'string' && plan.development.trim().length > 0) {
      return plan.development.trim();
    }
    if (plan.descricao && typeof plan.descricao === 'string' && plan.descricao.trim().length > 0) {
      return plan.descricao.trim();
    }
    if (plan.detalhes && typeof plan.detalhes === 'string' && plan.detalhes.trim().length > 0) {
      return plan.detalhes.trim();
    }
    if (plan.observacao && typeof plan.observacao === 'string' && plan.observacao.trim().length > 0) {
      return plan.observacao.trim();
    }
    if (plan.notes && typeof plan.notes === 'string' && plan.notes.trim().length > 0) {
      return plan.notes.trim();
    }
    if (plan.objectives && typeof plan.objectives === 'string' && plan.objectives.trim().length > 0) {
      return plan.objectives.trim();
    }
  }

  // 2. Verificar detalhamento do bloco da grade horária
  if (block) {
    if (block.descricao && typeof block.descricao === 'string' && block.descricao.trim().length > 0) {
      return block.descricao.trim();
    }
    if (block.observacao && typeof block.observacao === 'string' && block.observacao.trim().length > 0) {
      return block.observacao.trim();
    }
    if (block.detalhes && typeof block.detalhes === 'string' && block.detalhes.trim().length > 0) {
      return block.detalhes.trim();
    }
    if (block.guidelines && typeof block.guidelines === 'string' && block.guidelines.trim().length > 0) {
      return block.guidelines.trim();
    }
  }

  // 3. Verificar detalhamento no cadastro da modalidade (ActivityItem)
  if (activityItem) {
    if (activityItem.description && typeof activityItem.description === 'string' && activityItem.description.trim().length > 0) {
      return activityItem.description.trim();
    }
    if (activityItem.descricao && typeof activityItem.descricao === 'string' && activityItem.descricao.trim().length > 0) {
      return activityItem.descricao.trim();
    }
    if (activityItem.detalhes && typeof activityItem.detalhes === 'string' && activityItem.detalhes.trim().length > 0) {
      return activityItem.detalhes.trim();
    }
    if (activityItem.observacao && typeof activityItem.observacao === 'string' && activityItem.observacao.trim().length > 0) {
      return activityItem.observacao.trim();
    }
  }

  // 4. Fallback de nomes e títulos
  if (plan?.title && typeof plan.title === 'string' && plan.title.trim().length > 0) {
    return plan.title.trim();
  }
  if (block?.nome && typeof block.nome === 'string' && block.nome.trim().length > 0) {
    return block.nome.trim();
  }
  if (block?.activityId && typeof block.activityId === 'string' && block.activityId.trim().length > 0) {
    return block.activityId.trim();
  }
  if (activityItem?.name && typeof activityItem.name === 'string' && activityItem.name.trim().length > 0) {
    return activityItem.name.trim();
  }

  return '';
}
