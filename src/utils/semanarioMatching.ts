import { SemanarioPlan, ScheduleBlock } from '../types.ts';
import { deduplicateSemanarioPlans } from './semanarioUtils';
import { normalizeTime } from './timeUtils';

/**
 * Normaliza strings para comparação flexível (remove acentos, espaços extras e lowercases)
 */
export function normalizeString(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Extrai horários de início e término em formato "HH:mm" de uma string de timeSlot
 * Ex: "13:30 - 14:30" => ["13:30", "14:30"]
 * Ex: "9:30 às 10:30" => ["09:30", "10:30"]
 */
export function extractTimeInterval(timeSlot?: string): { start?: string; end?: string } {
  if (!timeSlot) return {};
  const matches = timeSlot.match(/(\d{1,2}[:hH]\d{2})/g);
  if (!matches || matches.length === 0) return {};
  return {
    start: normalizeTime(matches[0]),
    end: matches.length > 1 ? normalizeTime(matches[1]) : undefined,
  };
}

/**
 * Busca o SemanarioPlan correspondente para uma determinada turma, data e bloco da grade.
 * Critérios rigorosos de cruzamento:
 * 1. Turma deve corresponder (com normalização tolerante a variações como '1º Ano A' vs '1º Ano Azul')
 * 2. Data deve corresponder à data solicitada (se o plano possuir data gravada)
 * 3. Match de Horário (timeSlot vs startTime/endTime/horaInicio/horaFim)
 * 4. Match de Categoria / Atividade (category ou title vs activityId)
 */
export function findMatchingSemanarioPlan(
  plans: SemanarioPlan[] | undefined,
  turmaName: string,
  targetDate: string,
  block: ScheduleBlock | null
): SemanarioPlan | null {
  if (!block || !Array.isArray(plans) || plans.length === 0) return null;

  // Sanitização automática: deduplica planos por chave única (turma_dia_horario_modalidade)
  const cleanPlans = deduplicateSemanarioPlans(plans);

  const normTurma = normalizeString(turmaName);
  const normDate = targetDate.trim();

  // Filtrar planos da mesma turma
  const turmaPlans = cleanPlans.filter((p) => {
    if (!p) return false;
    const pTurma = normalizeString(p.turma);
    const isSameTurma =
      pTurma === normTurma ||
      (pTurma.length > 3 && normTurma.length > 3 && (pTurma.includes(normTurma) || normTurma.includes(pTurma)));
    if (!isSameTurma) return false;

    // Filtro de data: se o plano tem data, deve bater com targetDate
    if (p.date && p.date !== normDate) return false;

    return true;
  });

  if (turmaPlans.length === 0) return null;

  const blockStart = normalizeTime(block.horaInicio || block.startTime);
  const normActivity = normalizeString(block.activityId);

  // Tentativa 1: Match por timeSlot exato ou sobreposto
  const timeMatched = turmaPlans.find((p) => {
    const pStart = normalizeTime(p.horaInicio || (p.timeSlot ? extractTimeInterval(p.timeSlot).start : ''));
    if (blockStart && pStart && blockStart === pStart) return true;
    if (blockStart && p.timeSlot && p.timeSlot.includes(blockStart)) return true;
    return false;
  });
  if (timeMatched) return timeMatched;

  // Tentativa 2: Match por Categoria / Atividade da grade
  const categoryMatched = turmaPlans.find((p) => {
    const pCat = normalizeString(p.category);
    const pTitle = normalizeString(p.title);
    if (pCat && (pCat === normActivity || normActivity.includes(pCat) || pCat.includes(normActivity))) {
      return true;
    }
    if (pTitle && (pTitle === normActivity || normActivity.includes(pTitle))) {
      return true;
    }
    return false;
  });
  if (categoryMatched) return categoryMatched;

  // Tentativa 3: Se houver apenas 1 plano cadastrado para a turma na data
  if (turmaPlans.length === 1) {
    return turmaPlans[0];
  }

  return null;
}
