import {
  ActivityItem,
  ActivityType,
  DayOfWeek,
  ScheduleBlock,
  SemanarioPlan,
  TurmaType,
} from '../types';
import { ACTIVITIES_LIST, OFFICIAL_ROLL_CALL_MODALITIES } from '../data/initialData';
import { ALL_DAYS_OF_WEEK, getDayOfWeekFromDate, normalizeDayOfWeek } from './dateUtils';
import { OFFICIAL_SCHEDULE_TEMPLATES } from './scheduleDefaults';
import { extractSlotLimits, timeToMinutes } from './timeUtils';
import { getTurmaPedagogicalWeight } from './turmaUtils';

const ROLL_CALL_ORDER = new Map<string, number>(
  OFFICIAL_ROLL_CALL_MODALITIES.map((mod, idx) => [mod.toLowerCase(), idx])
);

const NON_ROLL_CALL_CATEGORY_NAMES = new Set<string>(
  ACTIVITIES_LIST.filter((a) => !a.requiresRollCall).map((a) =>
    normalizeModalityText(a.name || a.id)
  )
);

/**
 * Normaliza texto de turma removendo acentos, espaços e símbolos para match resiliente.
 */
function normalizeTurmaKey(turma?: string | null): string {
  if (!turma) return '';
  return turma
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Normaliza texto de atividade/modalidade removendo acentos e pontuação extra.
 */
export function normalizeModalityText(text?: string | null): string {
  if (!text) return '';
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve o horário de início (em minutos desde 00:00) de um bloco ou plano semanal.
 * Retorna -1 caso não exista horário válido configurado.
 */
function resolveStartMinutes(slot: {
  startTime?: string;
  endTime?: string;
  horaInicio?: string;
  horaFim?: string;
  timeSlot?: string;
}): number {
  const { horaInicio } = extractSlotLimits(slot);
  return timeToMinutes(horaInicio);
}

/**
 * Mapeia nomes brutos de blocos da grade horária ou semanário para as modalidades oficiais de chamada,
 * tratando variações como:
 * - "Natação e Piscina" -> ["Natação"]
 * - "Flauta Doce" -> ["Flauta"]
 * - "Judô e Balé" -> ["Balé"] (Mini Maternal / Maternal / Infantil 1) ou ["Balé", "Judô"] (Infantil 2+)
 */
export function mapRawLabelToOfficialModalities(
  rawLabel?: string | null,
  turma?: string | null,
  activitiesList?: ActivityItem[]
): ActivityType[] {
  const norm = normalizeModalityText(rawLabel);
  if (!norm) return [];

  const matched: ActivityType[] = [];
  const addMod = (mod: ActivityType) => {
    if (!matched.includes(mod)) {
      matched.push(mod);
    }
  };

  // Natação (ex.: "Natação", "Natação e Piscina", "Piscina Infantil", "Aquática")
  if (
    norm.includes('natac') ||
    norm.includes('piscin') ||
    norm.includes('aquatic') ||
    norm.includes('hidro')
  ) {
    addMod('Natação');
  }

  // Flauta (ex.: "Flauta", "Flauta Doce", "Oficina de Flauta")
  if (norm.includes('flaut')) {
    addMod('Flauta');
  }

  // Futebol (ex.: "Futebol", "Futsal", "Futebol Society")
  if (norm.includes('futebol') || norm.includes('futsal') || norm.includes('society')) {
    addMod('Futebol');
  }

  // Ginástica (ex.: "Ginástica", "Ginástica Artística", "Ginástica Rítmica")
  if (norm.includes('ginast')) {
    addMod('Ginástica');
  }

  // Judô e/ou Balé (incluindo blocos compostos como "Judô e Balé" / "Balé / Judô")
  const hasJudo = /\bjudo\b/.test(norm) || norm.includes('judo');
  const hasBale = /\bbale\b/.test(norm) || /\bballet\b/.test(norm) || norm.includes('bale') || norm.includes('ballet');

  if (hasJudo && hasBale) {
    // Conforme o perfil etário/pedagógico da turma:
    // Mini Maternal, Maternal e Infantil 1 (peso < 40) possuem perfil padrão de Balé na grade composta,
    // enquanto Infantil 2 e Fundamental (peso >= 40) contemplam Judô e Balé.
    const weight = turma ? getTurmaPedagogicalWeight(turma) : 100;
    if (weight < 40) {
      addMod('Balé');
    } else {
      addMod('Balé');
      addMod('Judô');
    }
  } else {
    if (hasBale) addMod('Balé');
    if (hasJudo) addMod('Judô');
  }

  // Dança (distinta de Balé; ex.: "Dança", "Dança e Expressão", "Oficina de Dança")
  if (norm.includes('danc')) {
    addMod('Dança');
  }

  // Reforço Escolar
  if (norm.includes('reforco')) {
    addMod('Reforço');
  }

  // Rotina
  if (norm.includes('rotina')) {
    addMod('Rotina');
  }

  // Modalidades customizadas adicionais marcadas com requiresRollCall = true em activitiesList
  if (Array.isArray(activitiesList) && activitiesList.length > 0) {
    activitiesList.forEach((item) => {
      if (!item || !item.requiresRollCall) return;
      const officialName = (item.id || item.name || '').trim();
      if (!officialName) return;
      const itemIdNorm = normalizeModalityText(item.id);
      const itemNameNorm = normalizeModalityText(item.name);
      if (
        (itemIdNorm && (norm === itemIdNorm || norm.includes(itemIdNorm))) ||
        (itemNameNorm && (norm === itemNameNorm || norm.includes(itemNameNorm)))
      ) {
        addMod(officialName);
      }
    });
  }

  return matched;
}

/**
 * Resolve os blocos da grade horária aplicáveis para uma turma a partir dos blocos persistidos
 * ou, na ausência de blocos salvos para a turma, a partir do template oficial da matriz curricular.
 */
function resolveScheduleBlocksForTurma(
  turma: string,
  schedules?: ScheduleBlock[] | null
): ScheduleBlock[] {
  const normTarget = normalizeTurmaKey(turma);
  if (!normTarget) return [];

  if (Array.isArray(schedules) && schedules.length > 0) {
    const directMatches = schedules.filter(
      (b) => b && normalizeTurmaKey(b.turma) === normTarget
    );
    if (directMatches.length > 0) {
      return directMatches;
    }
  }

  // Fallback para o template oficial da turma quando ainda não há blocos cadastrados para ela
  const templateKey = Object.keys(OFFICIAL_SCHEDULE_TEMPLATES).find(
    (k) => normalizeTurmaKey(k) === normTarget
  );
  const template = templateKey
    ? OFFICIAL_SCHEDULE_TEMPLATES[templateKey]
    : OFFICIAL_SCHEDULE_TEMPLATES[turma];

  if (!template) return [];

  const templateBlocks: ScheduleBlock[] = [];
  ALL_DAYS_OF_WEEK.forEach((day) => {
    const daySlots = template[day] || [];
    daySlots.forEach((slot, idx) => {
      templateBlocks.push({
        id: `tmpl_${normTarget}_${day}_${idx + 1}`,
        turma: turma as TurmaType,
        dayOfWeek: day,
        startTime: slot.startTime,
        endTime: slot.endTime,
        activityId: slot.activity,
        location: slot.location || '',
      });
    });
  });

  return templateBlocks;
}

export interface SyncStudentActivitiesOptions {
  preserveReforco?: boolean;
  activitiesList?: ActivityItem[];
}

/**
 * Motor puro de sincronização automática entre a Matrícula do Aluno
 * (Turma + Dias da Semana Contratados + Horários de Saída) e a Grade de Modalidades da Turma na Semana.
 */
export function syncStudentActivitiesFromSchedule(
  turma: TurmaType | string,
  diasFrequencia?: (DayOfWeek | string)[] | null,
  schedules?: ScheduleBlock[] | null,
  semanalPlans?: SemanarioPlan[] | null,
  horariosSaida?: Partial<Record<DayOfWeek, string>> | null,
  options?: SyncStudentActivitiesOptions
): ActivityType[] {
  const matchedSet = new Set<ActivityType>(['Rotina']);

  if (options?.preserveReforco) {
    matchedSet.add('Reforço');
  }

  const normTurma = normalizeTurmaKey(turma);
  if (!normTurma) {
    return Array.from(matchedSet);
  }

  // 1. Dias efetivos em que o aluno frequenta o Integral
  const normalizedDays = Array.isArray(diasFrequencia)
    ? diasFrequencia
        .map((d) => normalizeDayOfWeek(String(d)))
        .filter((d): d is DayOfWeek => Boolean(d))
    : [];
  const enrolledDays = normalizedDays.length > 0 ? normalizedDays : ALL_DAYS_OF_WEEK;
  const enrolledDaysSet = new Set<DayOfWeek>(enrolledDays);

  // Pré-calcula minutos de saída por dia da semana
  const exitMinutesByDay = new Map<DayOfWeek, number>();
  if (horariosSaida && typeof horariosSaida === 'object') {
    ALL_DAYS_OF_WEEK.forEach((day) => {
      const rawExit = horariosSaida[day];
      if (rawExit && typeof rawExit === 'string' && rawExit.trim()) {
        const mins = timeToMinutes(rawExit);
        if (mins >= 0) {
          exitMinutesByDay.set(day, mins);
        }
      }
    });
  }

  const activitiesList = options?.activitiesList;

  // 2. Consulta blocos oficiais da Grade Horária da turma nos dias matriculados
  const turmaBlocks = resolveScheduleBlocksForTurma(turma, schedules);
  turmaBlocks.forEach((block) => {
    if (!block) return;
    const blockDay = normalizeDayOfWeek(block.dayOfWeek);
    if (!blockDay || !enrolledDaysSet.has(blockDay)) return;

    const exitMin = exitMinutesByDay.get(blockDay);
    if (exitMin !== undefined) {
      const startMin = resolveStartMinutes(block);
      // Se a oficina começa no horário de saída do aluno ou depois, não marcar automaticamente
      if (startMin >= 0 && startMin >= exitMin) {
        return;
      }
    }

    const rawLabels = [block.activityId, block.nome].filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0
    );
    rawLabels.forEach((label) => {
      const mods = mapRawLabelToOfficialModalities(label, turma, activitiesList);
      mods.forEach((m) => matchedSet.add(m));
    });
  });

  // 3. Consulta blocos/oficinas complementares do Semanário da turma nos dias matriculados
  if (Array.isArray(semanalPlans) && semanalPlans.length > 0) {
    semanalPlans.forEach((plan) => {
      if (!plan || plan.status === 'substituida') return;
      if (normalizeTurmaKey(plan.turma) !== normTurma) return;

      const planDay =
        normalizeDayOfWeek(plan.dayOfWeek) ||
        (plan.date ? getDayOfWeekFromDate(plan.date) : null);
      if (!planDay || !enrolledDaysSet.has(planDay)) return;

      const exitMin = exitMinutesByDay.get(planDay);
      if (exitMin !== undefined) {
        const startMin = resolveStartMinutes({
          horaInicio: plan.horaInicio,
          horaFim: plan.horaFim,
          timeSlot: plan.timeSlot,
        });
        if (startMin >= 0 && startMin >= exitMin) {
          return;
        }
      }

      const categoryLabel = (plan.category || '').trim();
      const catMods = mapRawLabelToOfficialModalities(categoryLabel, turma, activitiesList);
      if (catMods.length > 0) {
        catMods.forEach((m) => matchedSet.add(m));
        return;
      }

      // Evita interpretar títulos criativos quando a categoria já é explicitamente uma atividade de rotina sem chamada
      const normCat = normalizeModalityText(categoryLabel);
      if (normCat && NON_ROLL_CALL_CATEGORY_NAMES.has(normCat)) {
        return;
      }

      const titleLabel = [plan.title, plan.nome].find(
        (v) => typeof v === 'string' && v.trim().length > 0
      );
      if (titleLabel) {
        const titleMods = mapRawLabelToOfficialModalities(titleLabel, turma, activitiesList);
        titleMods.forEach((m) => matchedSet.add(m));
      }
    });
  }

  // 4. Ordenação canônica garantindo 'Rotina' sempre primeiro e demais em ordem oficial
  return Array.from(matchedSet).sort((a, b) => {
    if (a === 'Rotina') return -1;
    if (b === 'Rotina') return 1;
    const orderA = ROLL_CALL_ORDER.get(a.toLowerCase());
    const orderB = ROLL_CALL_ORDER.get(b.toLowerCase());
    if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
    if (orderA !== undefined) return -1;
    if (orderB !== undefined) return 1;
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
  });
}

/**
 * Compara duas listas de modalidades ignorando ordem e duplicatas.
 */
export function areActivityListsEqual(
  listA?: ActivityType[] | null,
  listB?: ActivityType[] | null
): boolean {
  const normA = Array.from(
    new Set(['Rotina', ...(Array.isArray(listA) ? listA : [])].map((v) => String(v).trim()).filter(Boolean))
  ).sort();
  const normB = Array.from(
    new Set(['Rotina', ...(Array.isArray(listB) ? listB : [])].map((v) => String(v).trim()).filter(Boolean))
  ).sort();
  if (normA.length !== normB.length) return false;
  return normA.every((val, idx) => val === normB[idx]);
}
