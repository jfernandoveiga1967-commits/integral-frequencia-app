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

const PLACEHOLDER_TEXT_PATTERNS = new Set([
  'aguardando preenchimento',
  'a preencher',
  'sem proposta',
  'pendente',
  'aguardando',
]);

export function isMeaningfulPlanText(value?: string | null): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !PLACEHOLDER_TEXT_PATTERNS.has(trimmed.toLowerCase());
}

export function getPlanDevelopmentText(plan?: SemanarioPlan | null): string {
  if (!plan) return '';
  const dev = typeof plan.development === 'string' ? plan.development.trim() : '';
  if (isMeaningfulPlanText(dev)) return dev;
  const desc = typeof (plan as any).descricao === 'string' ? (plan as any).descricao.trim() : '';
  return isMeaningfulPlanText(desc) ? desc : '';
}

export function getPlanTitleText(plan?: SemanarioPlan | null): string {
  if (!plan) return '';
  const ttl = typeof plan.title === 'string' ? plan.title.trim() : '';
  if (isMeaningfulPlanText(ttl)) return ttl;
  const prop = typeof (plan as any).proposta === 'string' ? (plan as any).proposta.trim() : '';
  return isMeaningfulPlanText(prop) ? prop : '';
}

export function getPlanObjectivesText(plan?: SemanarioPlan | null): string {
  if (!plan) return '';
  const obj = typeof plan.objectives === 'string' ? plan.objectives.trim() : '';
  if (isMeaningfulPlanText(obj)) return obj;
  const cont = typeof (plan as any).conteudo === 'string' ? (plan as any).conteudo.trim() : '';
  return isMeaningfulPlanText(cont) ? cont : '';
}

export function hasPlanPedagogicalContent(plan: SemanarioPlan): boolean {
  if (!plan || (plan as any).isPlaceholder) return false;
  const dev = getPlanDevelopmentText(plan);
  const obj = getPlanObjectivesText(plan);
  const title = getPlanTitleText(plan);
  return Boolean(dev || obj || title);
}

/**
 * Calcula um escore de completude pedagógica para desempate seguro.
 * Planos com descrição/desenvolvimento preenchido têm peso dominante sobre rascunhos sem descrição.
 */
function getPlanRichnessScore(plan: SemanarioPlan): number {
  if (!plan || (plan as any).isPlaceholder) return 0;
  let score = 0;
  if (getPlanDevelopmentText(plan)) score += 100;
  if (getPlanObjectivesText(plan)) score += 25;
  if (getPlanTitleText(plan)) score += 15;
  if (isMeaningfulPlanText(plan.materials)) score += 5;
  if (isMeaningfulPlanText(plan.adiResponsible) || isMeaningfulPlanText(plan.monitors)) score += 5;
  if (Array.isArray(plan.photos) && plan.photos.length > 0) score += 3;
  if ((plan as any).isSavedByUser) score += 2;
  return score;
}

function parsePlanTimestampMs(ts?: string): number {
  if (!ts) return 0;
  const ms = new Date(ts).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Mescla dois registros do mesmo slot do Semanário sem jamais apagar descrições,
 * títulos, objetivos, materiais ou responsáveis já preenchidos por atualizações parciais/vazias.
 */
export function mergeSemanarioPlanRecords(
  existing: SemanarioPlan,
  incoming: SemanarioPlan,
  options?: { allowClearDescription?: boolean; explicitModalEdit?: boolean }
): SemanarioPlan {
  const existingMs = parsePlanTimestampMs(existing.updatedAt || existing.createdAt);
  const incomingMs = parsePlanTimestampMs(incoming.updatedAt || incoming.createdAt);
  const existingScore = getPlanRichnessScore(existing);
  const incomingScore = getPlanRichnessScore(incoming);

  // O registro primário define status, horário e metadados mais recentes;
  // caso o incoming seja explicitamente uma edição do modal ou tenha timestamp >=, assume prioridade de metadados.
  const incomingIsNewerOrEqual =
    Boolean(options?.explicitModalEdit) ||
    incomingMs > existingMs ||
    (incomingMs === existingMs && incomingScore >= existingScore);

  const primary = incomingIsNewerOrEqual ? incoming : existing;
  const secondary = incomingIsNewerOrEqual ? existing : incoming;

  const pickText = (pVal?: string, sVal?: string, allowPrimaryBlank = false): string => {
    const pClean = typeof pVal === 'string' ? pVal.trim() : '';
    const sClean = typeof sVal === 'string' ? sVal.trim() : '';
    if (isMeaningfulPlanText(pClean)) return pClean;
    if (allowPrimaryBlank) return pClean;
    if (isMeaningfulPlanText(sClean)) return sClean;
    return pClean || sClean || '';
  };

  const allowClearDesc = Boolean(options?.allowClearDescription);

  const mergedDev = pickText(
    getPlanDevelopmentText(primary) || primary.development || (primary as any).descricao,
    getPlanDevelopmentText(secondary) || secondary.development || (secondary as any).descricao,
    allowClearDesc && primary === incoming
  );
  const mergedTitle = pickText(
    getPlanTitleText(primary) || primary.title || (primary as any).proposta,
    getPlanTitleText(secondary) || secondary.title || (secondary as any).proposta
  );
  const mergedObjectives = pickText(
    getPlanObjectivesText(primary) || primary.objectives || (primary as any).conteudo,
    getPlanObjectivesText(secondary) || secondary.objectives || (secondary as any).conteudo
  );
  const mergedMaterials = pickText(primary.materials, secondary.materials, Boolean(options?.explicitModalEdit) && primary === incoming);
  const mergedWeekTheme = pickText(primary.weekTheme, secondary.weekTheme, Boolean(options?.explicitModalEdit) && primary === incoming);
  const mergedAdi = pickText(primary.adiResponsible, secondary.adiResponsible, Boolean(options?.explicitModalEdit) && primary === incoming);
  const mergedMonitors = pickText(primary.monitors, secondary.monitors, Boolean(options?.explicitModalEdit) && primary === incoming);
  const mergedNotes = pickText(primary.notes, secondary.notes, Boolean(options?.explicitModalEdit) && primary === incoming);

  const pTeacher = (primary.teacherName || '').trim();
  const sTeacher = (secondary.teacherName || '').trim();
  const mergedTeacher =
    pTeacher && pTeacher.toLowerCase() !== 'aguardando preenchimento'
      ? pTeacher
      : sTeacher && sTeacher.toLowerCase() !== 'aguardando preenchimento'
      ? sTeacher
      : pTeacher || sTeacher || '';

  const mergedPhotos =
    Array.isArray(primary.photos) && primary.photos.length > 0
      ? primary.photos
      : Array.isArray(secondary.photos) && secondary.photos.length > 0
      ? secondary.photos
      : undefined;

  const hasContent = Boolean(
    isMeaningfulPlanText(mergedDev) ||
      isMeaningfulPlanText(mergedTitle) ||
      isMeaningfulPlanText(mergedObjectives)
  );

  const mergedUpdatedAt =
    incomingMs >= existingMs
      ? incoming.updatedAt || existing.updatedAt || new Date().toISOString()
      : existing.updatedAt || incoming.updatedAt || new Date().toISOString();

  // Limpa flags transitórias de controle ao consolidar o objeto final
  const cleanPrimary: any = { ...primary };
  delete cleanPrimary.statusOnlyUpdate;
  delete cleanPrimary.explicitModalEdit;
  delete cleanPrimary.allowClearDescription;

  return {
    ...secondary,
    ...cleanPrimary,
    id: existing.id || incoming.id,
    turma: primary.turma || secondary.turma,
    weekNumber: Number(primary.weekNumber) || Number(secondary.weekNumber) || 0,
    year: Number(primary.year) || Number(secondary.year) || new Date().getFullYear(),
    date: primary.date || secondary.date,
    dayOfWeek: primary.dayOfWeek || secondary.dayOfWeek,
    timeSlot: (primary.timeSlot && primary.timeSlot.trim()) ? primary.timeSlot : secondary.timeSlot,
    category: (primary.category && primary.category.trim()) ? primary.category : secondary.category,
    weekTheme: mergedWeekTheme || undefined,
    title: mergedTitle,
    objectives: mergedObjectives || undefined,
    development: mergedDev,
    materials: mergedMaterials || undefined,
    adiResponsible: mergedAdi || undefined,
    monitors: mergedMonitors || undefined,
    teacherName: mergedTeacher,
    status: primary.status || secondary.status || 'pendente',
    substitutionReason:
      (primary.status || secondary.status) === 'substituida'
        ? primary.substitutionReason || secondary.substitutionReason
        : undefined,
    photos: mergedPhotos,
    notes: mergedNotes || undefined,
    createdAt: existing.createdAt || incoming.createdAt || new Date().toISOString(),
    updatedAt: mergedUpdatedAt,
    updatedBy: primary.updatedBy || secondary.updatedBy,
    ...({
      descricao: mergedDev,
      proposta: mergedTitle,
      conteudo: mergedObjectives || mergedDev,
      hasSavedContent: hasContent,
      isSavedByUser: Boolean(
        (existing as any).isSavedByUser || (incoming as any).isSavedByUser || hasContent
      ),
      isPlaceholder:
        hasContent || (existing as any).isSavedByUser || (incoming as any).isSavedByUser
          ? false
          : Boolean((primary as any).isPlaceholder),
    } as any),
  };
}

/**
 * Encontra o registro existente equivalente (por ID ou por chave única de slot)
 * e retorna o plano já mesclado com o ID canônico preservado.
 */
export function resolveCanonicalSemanarioPlan(
  currentPlans: SemanarioPlan[],
  incoming: SemanarioPlan
): { canonicalPlan: SemanarioPlan; replacedDuplicateId?: string } {
  const incomingKey = getSemanarioPlanUniqueKey(incoming);
  const existing = (currentPlans || []).find(
    (p) => p && (p.id === incoming.id || getSemanarioPlanUniqueKey(p) === incomingKey)
  );
  if (!existing) {
    return { canonicalPlan: incoming };
  }
  const merged = mergeSemanarioPlanRecords(existing, incoming, {
    explicitModalEdit: Boolean((incoming as any).explicitModalEdit),
    allowClearDescription: Boolean((incoming as any).allowClearDescription),
  });
  return {
    canonicalPlan: merged,
    replacedDuplicateId: existing.id && incoming.id && existing.id !== incoming.id ? incoming.id : undefined,
  };
}

/**
 * Sanitização automática de SemanarioPlan por chave única (semana_turma_dia_horario_modalidade).
 * Em caso de registros duplicados no banco/cache:
 * - Mescla campos pedagógicos preservando descrições, títulos, objetivos e materiais preenchidos
 * - Nunca permite que um rascunho/status vazio sobrescreva uma descrição já salva
 * - Elimina duplicações garantindo exatamente 1 registro consolidado por modalidade no bloco daquela semana
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
      map.set(key, mergeSemanarioPlanRecords(existing, plan));
    }
  });

  return Array.from(map.values());
}

/**
 * Upsert inteligente para planos do semanário:
 * Antes de inserir novos planos (como em cópias/duplicações), verifica se já existe
 * um registro com a mesma semana, turma, dia, horário e modalidade/atividade.
 * Se existir, mescla preservando o ID original e os textos pedagógicos já preenchidos.
 */
export function upsertSemanarioPlans(
  currentPlans: SemanarioPlan[],
  incomingPlans: SemanarioPlan[]
): SemanarioPlan[] {
  const result = [...(currentPlans || [])];
  const incomingSafe = Array.isArray(incomingPlans) ? incomingPlans : [];

  incomingSafe.forEach((incoming) => {
    if (!incoming) return;
    const incomingKey = getSemanarioPlanUniqueKey(incoming);

    // Procura por ID ou pela chave única semana_turma_dia_horario_modalidade
    const existingIndex = result.findIndex(
      (p) => p && (p.id === incoming.id || getSemanarioPlanUniqueKey(p) === incomingKey)
    );

    if (existingIndex >= 0) {
      result[existingIndex] = mergeSemanarioPlanRecords(result[existingIndex], incoming, {
        explicitModalEdit: Boolean((incoming as any).explicitModalEdit),
        allowClearDescription: Boolean((incoming as any).allowClearDescription),
      });
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
