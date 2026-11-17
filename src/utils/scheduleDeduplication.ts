import { SemanarioPlan, ScheduleBlock } from '../types';
import { getISOWeekNumber, getDayOfWeekFromDate, normalizeDayOfWeek } from './dateUtils';

/**
 * Normaliza qualquer componente de string para geração de chaves únicas:
 * minúsculas, sem acentos, sem pontuações ou espaços múltiplos
 */
export function normalizeKeyComponent(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Normaliza intervalo de horário (ex: '13:30 - 14:30' ou '13:30 às 14:30' ou '13:30')
 * Extrai o início ou início-fim simplificado para chave única estável
 */
export function normalizeTimeKey(timeStr?: string): string {
  if (!timeStr) return '';
  const matches = timeStr.match(/(\d{1,2}:\d{2})/g);
  if (!matches || matches.length === 0) return normalizeKeyComponent(timeStr);
  const start = matches[0].padStart(5, '0');
  const end = matches.length > 1 ? matches[1].padStart(5, '0') : '';
  return end ? `${start}-${end}` : start;
}

/**
 * Resolve o escopo semanal (ano + semana ISO) de um plano do Semanário.
 * Garante que registros de semanas distintas jamais colidam na deduplicação.
 */
function resolveSemanarioWeekScope(plan: {
  weekNumber?: number;
  year?: number;
  date?: string;
}): string {
  const weekNum = Number(plan.weekNumber) || 0;
  const yearNum = Number(plan.year) || 0;
  if (weekNum > 0 && yearNum > 0) {
    return `${yearNum}w${weekNum}`;
  }
  if (plan.date) {
    const parts = plan.date.split('-').map(Number);
    if (parts.length === 3 && parts.every((n) => !Number.isNaN(n) && n > 0)) {
      const iso = getISOWeekNumber(new Date(parts[0], parts[1] - 1, parts[2]));
      return `${iso.year}w${iso.weekNumber}`;
    }
    const cleanDate = normalizeKeyComponent(plan.date);
    if (cleanDate) return cleanDate;
  }
  if (yearNum > 0) return `${yearNum}`;
  return 'unscoped';
}

/**
 * Gera a chave única oficial do Semanário: semana_turma_dia_horario_modalidade
 */
export function getSemanarioPlanUniqueKey(plan: {
  weekNumber?: number;
  year?: number;
  date?: string;
  turma?: string;
  dayOfWeek?: string;
  timeSlot?: string;
  category?: string;
  title?: string;
}): string {
  const weekScope = resolveSemanarioWeekScope(plan);
  const turmaKey = normalizeKeyComponent(plan.turma);
  const resolvedDay =
    normalizeDayOfWeek(plan.dayOfWeek) ||
    (plan.date ? getDayOfWeekFromDate(plan.date) : null) ||
    plan.dayOfWeek;
  const dayKey = normalizeKeyComponent(resolvedDay || '');
  const timeKey = normalizeTimeKey(plan.timeSlot);
  // Modalidade: categoria tem prioridade; se não houver, usa o título
  const modalidadeKey = normalizeKeyComponent(plan.category || plan.title);

  return `${weekScope}_${turmaKey}_${dayKey}_${timeKey}_${modalidadeKey}`;
}

function hasPlanPedagogicalContent(plan: SemanarioPlan): boolean {
  if (!plan || (plan as any).isPlaceholder) return false;
  const dev = (plan.development || (plan as any).descricao || '').trim();
  const obj = (plan.objectives || (plan as any).conteudo || '').trim();
  const title = (plan.title || (plan as any).proposta || '').trim();
  if (!dev && !obj && !title) return false;
  const combined = `${dev} ${obj} ${title}`.toLowerCase().trim();
  if (
    combined === 'aguardando preenchimento' ||
    combined === 'a preencher' ||
    combined === 'sem proposta' ||
    combined === 'pendente'
  ) {
    return false;
  }
  return true;
}

/**
 * Sanitização automática de SemanarioPlan por chave única (semana_turma_dia_horario_modalidade).
 * Em caso de registros duplicados no banco/cache:
 * - Mantém o registro mais atualizado ou com conteúdo efetivamente preenchido
 * - Elimina duplicações garantindo exatamente 1 registro por modalidade no bloco daquela semana
 */
export function deduplicateSemanarioPlans(plans: SemanarioPlan[]): SemanarioPlan[] {
  if (!Array.isArray(plans) || plans.length === 0) return [];
  const map = new Map<string, SemanarioPlan>();

  plans.forEach((plan) => {
    if (!plan) return;
    const key = getSemanarioPlanUniqueKey(plan);
    if (!map.has(key)) {
      map.set(key, plan);
    } else {
      const existing = map.get(key)!;
      const existingHasContent = hasPlanPedagogicalContent(existing);
      const currentHasContent = hasPlanPedagogicalContent(plan);

      // Prioriza o plano que possui conteúdo pedagógico preenchido
      if (currentHasContent && !existingHasContent) {
        map.set(key, plan);
        return;
      }
      if (!currentHasContent && existingHasContent) {
        return;
      }

      // Se ambos tiverem ou não conteúdo, prioriza o atualizado mais recentemente
      const existingDate = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const currentDate = plan.updatedAt ? new Date(plan.updatedAt).getTime() : 0;
      if (currentDate > existingDate) {
        map.set(key, plan);
      } else if (currentDate === existingDate && (plan as any).isSavedByUser && !(existing as any).isSavedByUser) {
        map.set(key, plan);
      }
    }
  });

  return Array.from(map.values());
}

/**
 * Upsert inteligente para planos do semanário:
 * Antes de inserir novos planos (como em cópias/duplicações), verifica se já existe
 * um registro com a mesma semana, turma, dia, horário e modalidade/atividade.
 * Se existir, substitui/atualiza o registro em vez de concatenar (Append).
 */
export function upsertSemanarioPlans(
  currentPlans: SemanarioPlan[],
  incomingPlans: SemanarioPlan[]
): SemanarioPlan[] {
  const result = [...currentPlans];
  const incomingSafe = Array.isArray(incomingPlans) ? incomingPlans : [];

  incomingSafe.forEach((incoming) => {
    if (!incoming) return;
    const incomingKey = getSemanarioPlanUniqueKey(incoming);

    // Procura por ID ou pela chave única semana_turma_dia_horario_modalidade
    const existingIndex = result.findIndex(
      (p) => p.id === incoming.id || getSemanarioPlanUniqueKey(p) === incomingKey
    );

    if (existingIndex >= 0) {
      // Upsert: substitui preservando o ID original
      const originalId = result[existingIndex].id;
      result[existingIndex] = {
        ...incoming,
        id: originalId || incoming.id,
        createdAt: result[existingIndex].createdAt || incoming.createdAt,
        updatedAt: incoming.updatedAt || new Date().toISOString(),
      };
    } else {
      result.push(incoming);
    }
  });

  return deduplicateSemanarioPlans(result);
}

/**
 * Chave única para blocos da grade horária: turma_dia_horario_modalidade
 */
export function getScheduleBlockUniqueKey(block: {
  turma?: string;
  dayOfWeek?: string;
  startTime?: string;
  endTime?: string;
  activityId?: string;
}): string {
  const turmaKey = normalizeKeyComponent(block.turma);
  const dayKey = normalizeKeyComponent(block.dayOfWeek);
  const timeKey = `${normalizeTimeKey(block.startTime)}-${normalizeTimeKey(block.endTime)}`;
  const modalidadeKey = normalizeKeyComponent(block.activityId);

  return `${turmaKey}_${dayKey}_${timeKey}_${modalidadeKey}`;
}

/**
 * Deduplica blocos da grade horária por chave única turma_dia_horario_modalidade
 */
export function deduplicateScheduleBlocks(blocks: ScheduleBlock[]): ScheduleBlock[] {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  const map = new Map<string, ScheduleBlock>();

  blocks.forEach((block) => {
    if (!block) return;
    const key = getScheduleBlockUniqueKey(block);
    if (!map.has(key)) {
      map.set(key, block);
    } else {
      const existing = map.get(key)!;
      const existingDate = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const currentDate = block.updatedAt ? new Date(block.updatedAt).getTime() : 0;
      if (currentDate >= existingDate) {
        map.set(key, block);
      }
    }
  });

  return Array.from(map.values());
}

/**
 * Upsert inteligente para blocos da grade horária
 */
export function upsertScheduleBlocks(
  currentBlocks: ScheduleBlock[],
  incomingBlocks: ScheduleBlock[]
): ScheduleBlock[] {
  const result = [...currentBlocks];
  const incomingSafe = Array.isArray(incomingBlocks) ? incomingBlocks : [];

  incomingSafe.forEach((incoming) => {
    if (!incoming) return;
    const incomingKey = getScheduleBlockUniqueKey(incoming);

    const existingIndex = result.findIndex(
      (b) => b.id === incoming.id || getScheduleBlockUniqueKey(b) === incomingKey
    );

    if (existingIndex >= 0) {
      const originalId = result[existingIndex].id;
      result[existingIndex] = {
        ...incoming,
        id: originalId || incoming.id,
        createdAt: result[existingIndex].createdAt || incoming.createdAt,
        updatedAt: incoming.updatedAt || new Date().toISOString(),
      };
    } else {
      result.push(incoming);
    }
  });

  return deduplicateScheduleBlocks(result);
}
