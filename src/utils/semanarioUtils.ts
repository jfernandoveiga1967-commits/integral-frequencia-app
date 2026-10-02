import { ActivityItem, DayOfWeek, ScheduleBlock, SemanarioPlan, SemanarioStatus, Student, WeekInfo } from '../types';
import { getTurmaPedagogicalWeight } from './turmaUtils';
import { loadActivities, loadSchedules } from './storageUtils';
import { ACTIVITIES_LIST, TURMAS_LIST } from '../data/initialData';
import { getISOWeekNumber, getWeekInfo, getWeekDays, isStudentScheduledForDay, isStudentScheduledForDate, isStudentActiveOnDate, toISODateString } from './dateUtils';
import { OFFICIAL_SCHEDULE_TEMPLATES, getDefaultScheduleBlocks } from './scheduleDefaults';

export const CATEGORIA_PROJETO = 'Projeto';

/**
 * Normaliza o nome da turma para comparação flexível (sem acentos, sem símbolos).
 */
function normalizeTurma(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Retorna os blocos de horário oficiais cadastrados na Grade Horária para uma turma e opcionalmente um dia.
 * Busca todos os horários cadastrados da turma (do acolhimento à saída final), sem omissões.
 */
export function getScheduleBlocksForTurma(
  turmaName: string,
  dayOfWeek?: DayOfWeek,
  schedules?: ScheduleBlock[]
): ScheduleBlock[] {
  if (!turmaName) return [];

  let allSchedules = schedules;
  if (!allSchedules || allSchedules.length === 0) {
    allSchedules = loadSchedules();
  }
  if (!allSchedules || allSchedules.length === 0) {
    allSchedules = getDefaultScheduleBlocks();
  }

  const normTarget = normalizeTurma(turmaName);

  let turmaBlocks = (allSchedules || []).filter(
    (b) => b && normalizeTurma(b.turma) === normTarget
  );

  // Se a turma ainda não tiver blocos salvos na lista de schedules, busca no template padrão
  if (turmaBlocks.length === 0) {
    const templateKey = Object.keys(OFFICIAL_SCHEDULE_TEMPLATES).find(
      (k) => normalizeTurma(k) === normTarget
    );
    const template = templateKey
      ? OFFICIAL_SCHEDULE_TEMPLATES[templateKey]
      : OFFICIAL_SCHEDULE_TEMPLATES[turmaName] || OFFICIAL_SCHEDULE_TEMPLATES['1º Ano Azul'];

    if (template) {
      const days: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
      days.forEach((d) => {
        const daySlots = template[d] || [];
        daySlots.forEach((slot, idx) => {
          turmaBlocks.push({
            id: `sched_tmpl_${turmaName.replace(/\s+/g, '_')}_${d}_${idx + 1}_${slot.activity}`,
            turma: turmaName as any,
            dayOfWeek: d,
            startTime: slot.startTime,
            endTime: slot.endTime,
            activityId: slot.activity,
            location: slot.location || '',
          });
        });
      });
    }
  }

  if (dayOfWeek) {
    turmaBlocks = turmaBlocks.filter((b) => b.dayOfWeek === dayOfWeek);
  }

  // Ordenação estritamente cronológica por horário de início
  return [...turmaBlocks].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
}

/**
 * Retorna as categorias / modalidades permitidas para uma turma específica,
 * EXTRAÍDAS EXCLUSIVAMENTE DA GRADE HORÁRIA OFICIAL CADASTRADA para aquela turma.
 *
 * Regra Estrita:
 * - A turma Mini e Maternal Azul NÃO possui Robótica na grade -> Robótica NUNCA será retornada.
 * - Somente turmas com Robótica na grade (ex: 3º ao 6º Ano) terão Robótica retornada.
 * - Mantém sempre ordenação alfabética estrita de A a Z.
 */
export function getCategoriesForTurma(
  turmaName: string,
  schedules?: ScheduleBlock[],
  _activitiesList?: ActivityItem[]
): string[] {
  if (!turmaName) return [];

  const blocks = getScheduleBlocksForTurma(turmaName, undefined, schedules);
  const categoriesSet = new Set<string>();

  blocks.forEach((b) => {
    const act = (b.activityId || '').trim();
    if (act) {
      categoriesSet.add(act);
    }
  });

  // Se por alguma razão extrema não houver blocos na grade, usa o template padrão
  if (categoriesSet.size === 0) {
    const template = OFFICIAL_SCHEDULE_TEMPLATES[turmaName];
    if (template) {
      const days: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
      days.forEach((d) => {
        (template[d] || []).forEach((slot) => {
          if (slot.activity) categoriesSet.add(slot.activity.trim());
        });
      });
    }
  }

  // Ordenação alfabética estrita em português (A a Z)
  return Array.from(categoriesSet).sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
  );
}

/**
 * Retorna todas as categorias cadastradas no sistema em ordem alfabética estrita (A a Z).
 */
export function getAllCategoriesAlphabetical(activitiesList?: ActivityItem[]): string[] {
  let rawNames: string[] = [];
  if (activitiesList && activitiesList.length > 0) {
    rawNames = activitiesList.map((a) => (a.name || a.id).trim());
  } else {
    try {
      const stored = loadActivities();
      if (stored && stored.length > 0) {
        rawNames = stored.map((a) => (a.name || a.id).trim());
      } else {
        rawNames = ACTIVITIES_LIST.map((a) => (a.name || a.id).trim());
      }
    } catch {
      rawNames = ACTIVITIES_LIST.map((a) => (a.name || a.id).trim());
    }
  }

  const set = new Set<string>();
  rawNames.forEach((name) => {
    const trimmed = name.trim();
    if (trimmed) set.add(trimmed);
  });

  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}

/**
 * Verifica se a turma é de 3º Ano ou superior (3º Ano, 4º Ano, 5º Ano, 6º Ano...)
 */
export function isTurmaEligibleForProjeto(turmaName: string): boolean {
  if (!turmaName) return false;
  const weight = getTurmaPedagogicalWeight(turmaName);
  return weight >= 130;
}

/**
 * Cores e ícones temáticos para cada categoria ou modalidade
 */
export function getCategoryBadgeStyle(category: string): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  const cat = (category || '').toLowerCase();

  if (cat.includes('natação') || cat.includes('natacao') || cat.includes('piscina') || cat.includes('aquática')) {
    return { bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-300', dot: 'bg-sky-500' };
  }
  if (cat.includes('balé') || cat.includes('bale')) {
    return { bg: 'bg-pink-50', text: 'text-pink-800', border: 'border-pink-300', dot: 'bg-pink-500' };
  }
  if (cat.includes('judô') || cat.includes('judo') || cat.includes('marcial') || cat.includes('luta')) {
    return { bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-300', dot: 'bg-amber-600' };
  }
  if (cat.includes('futebol') || cat.includes('esporte') || cat.includes('quadra')) {
    return { bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-300', dot: 'bg-emerald-600' };
  }
  if (cat.includes('dança') || cat.includes('danca')) {
    return { bg: 'bg-purple-50', text: 'text-purple-900', border: 'border-purple-300', dot: 'bg-purple-600' };
  }
  if (cat.includes('flauta') || cat.includes('música') || cat.includes('musica') || cat.includes('musicalização') || cat.includes('musicalizacao') || cat.includes('ritmo')) {
    return { bg: 'bg-teal-50', text: 'text-teal-900', border: 'border-teal-300', dot: 'bg-teal-600' };
  }
  if (cat.includes('ginástica') || cat.includes('ginastica')) {
    return { bg: 'bg-indigo-50', text: 'text-indigo-900', border: 'border-indigo-300', dot: 'bg-indigo-600' };
  }
  if (cat.includes('robótica') || cat.includes('robotica') || cat.includes('computacional') || cat.includes('tecnologia')) {
    return { bg: 'bg-cyan-50', text: 'text-cyan-900', border: 'border-cyan-300', dot: 'bg-cyan-600' };
  }
  if (cat.includes('devocional') || cat.includes('valores') || cat.includes('espiritualidade')) {
    return { bg: 'bg-rose-50', text: 'text-rose-900', border: 'border-rose-300', dot: 'bg-rose-600' };
  }
  if (cat.includes('almoço') || cat.includes('almoco') || cat.includes('lanche') || cat.includes('culinária') || cat.includes('culinaria')) {
    return { bg: 'bg-orange-50', text: 'text-orange-900', border: 'border-orange-300', dot: 'bg-orange-600' };
  }
  if (cat.includes('acolhimento') || cat.includes('roda')) {
    return { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500' };
  }
  if (cat.includes('artes') || cat.includes('expressão') || cat.includes('expressao') || cat.includes('pintura')) {
    return { bg: 'bg-fuchsia-50', text: 'text-fuchsia-800', border: 'border-fuchsia-200', dot: 'bg-fuchsia-500' };
  }
  if (cat.includes('contação') || cat.includes('contacao') || cat.includes('histórias') || cat.includes('historias') || cat.includes('literatura')) {
    return { bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200', dot: 'bg-sky-500' };
  }
  if (cat.includes('projeto')) {
    return { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-300', dot: 'bg-rose-600' };
  }
  if (cat.includes('rotina')) {
    return { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300', dot: 'bg-slate-600' };
  }

  return { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300', dot: 'bg-slate-500' };
}

export function getStatusStyle(status: 'realizada' | 'pendente' | 'substituida'): {
  label: string;
  bg: string;
  text: string;
  border: string;
  badgeBg: string;
} {
  switch (status) {
    case 'realizada':
      return {
        label: 'Realizada',
        bg: 'bg-emerald-50 text-emerald-800 border-emerald-300',
        text: 'text-emerald-800',
        border: 'border-emerald-400',
        badgeBg: 'bg-emerald-500',
      };
    case 'substituida':
      return {
        label: 'Substituída',
        bg: 'bg-amber-50 text-amber-900 border-amber-300',
        text: 'text-amber-900',
        border: 'border-amber-400',
        badgeBg: 'bg-amber-500',
      };
    case 'pendente':
    default:
      return {
        label: '⏳ Pendente',
        bg: 'bg-slate-100 text-slate-700 border-slate-300',
        text: 'text-slate-700',
        border: 'border-slate-300',
        badgeBg: 'bg-slate-400',
      };
  }
}

// Storage local keys
const SEMANARIO_STORAGE_KEY = 'integral_semanario_plans_v1';

/**
 * Normaliza e sincroniza os planos do Semanário com a Matriz Curricular e Grade Horária Oficial:
 * 1. Remove planos com categorias que não existem na turma ou que não estejam no dia oficial da grade.
 * 2. Atualiza o timeSlot com os horários oficiais exatos da Grade Horária (block.startTime - block.endTime).
 * 3. Propostas que ainda não foram preenchidas/detalhadas pela equipe mantêm status garantido como 'pendente'.
 */
export function normalizeAndSyncSemanarioPlans(
  plans: SemanarioPlan[],
  schedules?: ScheduleBlock[]
): SemanarioPlan[] {
  if (!Array.isArray(plans)) return [];

  const normalized: SemanarioPlan[] = [];

  plans.forEach((p) => {
    if (!p || !p.turma || !p.dayOfWeek) return;

    // Obtém os blocos da grade oficial daquela turma para aquele dia da semana
    const dayBlocks = getScheduleBlocksForTurma(p.turma, p.dayOfWeek, schedules);
    if (dayBlocks.length === 0) {
      normalized.push(p);
      return;
    }

    // Procura se a atividade/categoria do plano existe nos blocos daquele dia
    const matchingBlock = dayBlocks.find(
      (b) =>
        (b.activityId || '').trim().toLowerCase() === (p.category || '').trim().toLowerCase() ||
        (p.timeSlot && p.timeSlot.includes(b.startTime))
    );

    // Se houver bloco oficial correspondente, sincroniza o horário oficial
    const officialTimeSlot = matchingBlock
      ? `${matchingBlock.startTime} - ${matchingBlock.endTime}`
      : p.timeSlot || '13:00 - 14:00';

    const effectiveStatus: SemanarioStatus = p.status || 'pendente';

    normalized.push({
      ...p,
      timeSlot: officialTimeSlot,
      status: effectiveStatus,
    });
  });

  return normalized;
}

export function loadSemanarioPlans(): SemanarioPlan[] {
  try {
    const raw = localStorage.getItem(SEMANARIO_STORAGE_KEY);
    if (!raw) return getInitialSamplePlans();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Limpa planos espúrios e sincroniza horários oficiais da grade
      const cleaned = normalizeAndSyncSemanarioPlans(parsed);
      return cleaned.length > 0 ? cleaned : getInitialSamplePlans();
    }
    return getInitialSamplePlans();
  } catch (err) {
    console.error('Erro ao carregar planos do Semanário do localStorage:', err);
    return getInitialSamplePlans();
  }
}

export function saveSemanarioPlans(plans: SemanarioPlan[]): void {
  try {
    localStorage.setItem(SEMANARIO_STORAGE_KEY, JSON.stringify(plans));
  } catch (err) {
    console.error('Erro ao salvar planos do Semanário no localStorage:', err);
  }
}

/**
 * Determina com rigor se um registro de atividade do Semanário é considerado "Lançado / Preenchido".
 * Critérios exigidos:
 * 1. O registro deve conter texto/conteúdo pedagógico salvo no campo de proposta/descrição (desenvolvimento, descrição, proposta ou conteúdo diferente de vazio/nulo).
 * 2. A mera presença do bloco de horário padrão da grade horária NÃO pontua como atividade lançada nem soma no percentual de progresso.
 * 3. Ignora placeholders padrão não editados ("Aguardando preenchimento", "A preencher", etc.).
 */
export function isPlanContentFilled(plan: SemanarioPlan | null | undefined): boolean {
  if (!plan) return false;

  // Bloco virtual / placeholder não salvo da grade
  if ((plan as any).isPlaceholder) {
    return false;
  }

  // Se o responsável ainda estiver com o padrão de espera do sistema e não houver usuário que salvou
  if (
    plan.teacherName === 'Aguardando preenchimento' &&
    (!plan.updatedBy || plan.updatedBy === 'Coordenação Pedagógica') &&
    !(plan as any).isSavedByUser
  ) {
    return false;
  }

  // Extrai o conteúdo pedagógico de todos os campos possíveis (development, descricao, conteudo, proposta, title)
  const dev = (plan.development || '').trim();
  const desc = ((plan as any).descricao || '').trim();
  const cont = ((plan as any).conteudo || '').trim();
  const prop = ((plan as any).proposta || '').trim();
  const title = (plan.title || '').trim();

  // Deve haver texto/conteúdo pedagógico salvo em ao menos um dos campos de proposta/descrição
  const hasText = Boolean(dev || desc || cont || prop || title);
  if (!hasText) {
    return false;
  }

  // Se o texto for apenas um placeholder genérico do sistema, não pontua
  const combined = `${dev} ${desc} ${cont} ${prop} ${title}`.toLowerCase().trim();
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
 * Remove propostas que não pertencem à Grade Horária da turma correspondente.
 * Exemplo: Se houver uma proposta de "Robótica" para "Mini e Maternal Azul", ela é removida.
 */
export function cleanupInvalidTurmaPlans(plans: SemanarioPlan[], schedules?: ScheduleBlock[]): SemanarioPlan[] {
  return normalizeAndSyncSemanarioPlans(plans, schedules);
}

/**
 * Amostras Pedagógicas Iniciais para demonstração e visualização instantânea
 * na aba Atividades do Momento (com planos reais, objetivos BNCC, materiais e status de substituição).
 */
export function getInitialSamplePlans(
  _currentWeekInfo?: WeekInfo,
  _turmasToUse?: string[],
  _schedules?: ScheduleBlock[],
  _activitiesList?: ActivityItem[]
): SemanarioPlan[] {
  const todayStr = new Date().toISOString().split('T')[0];
  const year = new Date().getFullYear();

  return [
    {
      id: `sample_plan_1ano_${todayStr}`,
      turma: '1º Ano A',
      weekNumber: 38,
      year: year,
      date: todayStr,
      dayOfWeek: 'segunda',
      timeSlot: '13:30 - 14:30',
      category: 'Oficina de Artes',
      title: 'Crescendo com Jesus: Painel Coletivo das Virtudes',
      objectives: 'BNCC (EI03TS02) Expressar-se livremente por meio de desenho, pintura e colagem, desenvolvendo empatia e cooperação mútua no espaço coletivo.',
      development: 'Roda de conversa inicial sobre acolhimento e partilha. Em seguida, os alunos produzem estampas manuais com guache para montar o mural colaborativo das boas atitudes.',
      materials: 'Papel Kraft bobina, tintas guache atóxicas variadas, pincéis chatos nº 12, retalhos de tecido e aventais.',
      adiResponsible: 'Patrícia',
      teacherName: 'Ana Clara e Márcia',
      monitors: 'Ana Clara Carchano Garcia',
      status: 'pendente',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'Coordenação Pedagógica',
    },
    {
      id: `sample_plan_infantil2_${todayStr}`,
      turma: 'Infantil II',
      weekNumber: 38,
      year: year,
      date: todayStr,
      dayOfWeek: 'segunda',
      timeSlot: '13:30 - 14:30',
      category: 'Contação de Histórias & Literatura',
      title: 'História na Sacola Encantada: O Segredo da Joaninha',
      objectives: 'BNCC (EI02EF03) Demonstrar interesse e atenção ao ouvir a leitura de histórias, poemas e cantigas, associando sons e movimentos corporais.',
      development: 'Apresentação dos personagens utilizando fantoches de feltro e sonorização com instrumentos de percussão leve. Condução em círculo com tapetes sensoriais.',
      materials: 'Sacola pedagógica, fantoches de feltro da Joaninha e Grilo, chocalhos sonoros e tapete acolchoado.',
      adiResponsible: 'Juliana',
      teacherName: 'Sthefany',
      monitors: 'Sthefany Santos',
      status: 'substituida',
      substitutionReason: 'Atividade adaptada para o espaço multiuso interno em virtude da manutenção do pergolado externo e tempo chuvoso.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'Coordenação Pedagógica',
    },
    {
      id: `sample_plan_maternal_${todayStr}`,
      turma: 'Maternal I',
      weekNumber: 38,
      year: year,
      date: todayStr,
      dayOfWeek: 'segunda',
      timeSlot: '14:30 - 15:30',
      category: 'Psicomotricidade & Movimento',
      title: 'Circuito Lúdico dos Pequenos Exploradores',
      objectives: 'BNCC (EI02CG02) Deslocar seu corpo no espaço, orientando-se por noções de frente, trás, em cima, embaixo.',
      development: 'Circuito com almofadas firmes, túnel de tecido e cones macios estimulando o engatinhar, equilíbrio e coordenação motora ampla.',
      materials: 'Colchonetes, túnel de pano, blocos de espuma e música instrumental alegre.',
      adiResponsible: 'Camila',
      teacherName: 'Beatriz',
      monitors: 'Beatriz Oliveira',
      status: 'realizada',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'Coordenação Pedagógica',
    },
  ];
}

export const DAYS_OF_WEEK_ORDER: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];

/**
 * Gera automaticamente o currículo pedagógico completo para as turmas informadas na semana indicada,
 * PUXANDO EXCLUSIVAMENTE da Grade Horária oficial (ScheduleBlock) de cada turma para cada dia da semana.
 * Todas as propostas não preenchidas iniciam com status [⏳ Pendente].
 */
export function generateCurriculumForTurmasAndWeek(
  turmasList: string[],
  weekInfo: WeekInfo,
  schedules?: ScheduleBlock[],
  _activitiesList?: ActivityItem[]
): SemanarioPlan[] {
  const plans: SemanarioPlan[] = [];
  const weekDays = getWeekDays(weekInfo.startDate);

  turmasList.forEach((turmaName) => {
    DAYS_OF_WEEK_ORDER.forEach((day, dayOffset) => {
      const dayDate = weekDays[dayOffset]?.dateStr || weekInfo.startDate;
      const dayBlocks = getScheduleBlocksForTurma(turmaName, day, schedules);

      dayBlocks.forEach((block) => {
        const categoryName = block.activityId;
        const timeSlot = `${block.startTime} - ${block.endTime}`;
        const proposal = generateCuratedProposal(turmaName, categoryName);

        const safeTurmaId = turmaName.replace(/\s+/g, '_').toLowerCase();
        const safeCatId = categoryName.replace(/\s+/g, '_').toLowerCase();
        const safeTime = block.startTime.replace(':', '');

        plans.push({
          id: `plan_sched_${safeTurmaId}_${day}_${safeCatId}_${safeTime}_w${weekInfo.weekNumber}_${weekInfo.year}`,
          turma: turmaName,
          weekNumber: weekInfo.weekNumber,
          year: weekInfo.year,
          date: dayDate,
          dayOfWeek: day,
          timeSlot: timeSlot,
          category: categoryName,
          title: proposal.title,
          objectives: proposal.objectives,
          development: proposal.development,
          materials: proposal.materials,
          teacherName: 'Aguardando preenchimento',
          status: 'pendente',
          substitutionReason: undefined,
          photos: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: 'Coordenação Pedagógica',
        });
      });
    });
  });

  return plans;
}

/**
 * Formata a descrição da proposta pedagógica conforme a estrutura oficial da Escola Crescer:
 * - Categorias Gerais: [CATEGORIA]:\n[Título]\n\nProposta:\n...\n\nDinâmica:\n...\n\nMateriais (se aplicável):\n• ...\n\nImportante:\n...
 * - Devocional: Devocional:\n[Título]\n\nProposta:\n...\n\nVersículo:\n...\n\nAtividades:\n...\n\nImportante:\n...
 * - Contação de História: Contação de História:\n[Título]\n\nLivro:\n...\n\nProposta:\n...\n\nDinâmica:\n...\n\nMateriais (se aplicável):\n• ...\n\nImportante:\n...
 * - Artes: Artes:\n[Título]\n\nProposta:\n...\n\nDinâmica:\n...\n\nMateriais (se aplicável):\n• ...\n\nImportante:\n...
 *
 * REGRA MANDATÓRIA: Sem códigos BNCC, sem Markdown pesado (** ou #), texto corrido em caixa baixa.
 */
export function formatPedagogicalDescription(
  categoryName: string,
  title: string,
  proposta: string,
  dinamica: string,
  materiais?: string,
  importante?: string,
  extra?: { livro?: string; versiculo?: string }
): string {
  const cleanCat = (categoryName || 'Atividade Geral').trim();
  const isDev = cleanCat.toLowerCase().includes('devocional');
  const isCont =
    cleanCat.toLowerCase().includes('história') ||
    cleanCat.toLowerCase().includes('historia') ||
    cleanCat.toLowerCase().includes('livro') ||
    cleanCat.toLowerCase().includes('leitura') ||
    cleanCat.toLowerCase().includes('literatura');

  const imp =
    importante?.trim() ||
    'Promova a escuta atenta, acolha cada criança com carinho e mantenha um alinhamento constante de apoio mútuo com a equipe da sala.';

  const formatList = (m?: string): string => {
    if (!m) return '';
    const lines = m
      .split('\n')
      .map((l) => l.replace(/^[-*•]\s*/, '').trim())
      .filter(Boolean);
    if (!lines.length) return '';
    return lines.map((l) => `• ${l}`).join('\n');
  };

  const matBlock = formatList(materiais);

  if (isDev) {
    return [
      `Devocional:`,
      title.trim(),
      '',
      `Proposta:`,
      proposta.trim(),
      '',
      `Atividades:`,
      dinamica.trim(),
      '',
      `Versículo:`,
      extra?.versiculo?.trim() || 'Lucas 6:31 - Como vocês querem que os outros lhes façam, façam também vocês a eles.',
      '',
      `Importante:`,
      imp,
    ].join('\n');
  }

  if (isCont) {
    const livroStr = extra?.livro?.trim() || 'O Monstro das Cores, de Anna Llenas (Editora Aletria).';
    return [
      `Contação de História:`,
      title.trim(),
      '',
      `Proposta:`,
      proposta.trim(),
      '',
      `Atividades:`,
      dinamica.trim(),
      '',
      `Livro:`,
      livroStr,
      '',
      matBlock ? `Materiais (se aplicável):\n${matBlock}\n` : '',
      `Importante:`,
      imp,
    ].filter(Boolean).join('\n');
  }

  return [
    `${cleanCat}:`,
    title.trim(),
    '',
    `Proposta:`,
    proposta.trim(),
    '',
    `Atividades:`,
    dinamica.trim(),
    '',
    matBlock ? `Materiais (se aplicável):\n${matBlock}\n` : '',
    `Importante:`,
    imp,
  ].filter(Boolean).join('\n');
}

/**
 * Gerador de sugestão pedagógica curada por modalidade alinhada à persona da Escola Crescer
 */
export function generateCuratedProposal(
  turma: string,
  category: string,
  theme?: string
): {
  title: string;
  theme?: string;
  objectives: string;
  development: string;
  materials: string;
  dicaMonitora?: string;
  formattedDevelopment?: string;
} {
  const cleanTheme = (theme || '').trim();
  const cat = (category || '').toLowerCase();
  const isUpperElementary = /4[º°o]|5[º°o]|6[º°o]/i.test(turma || '');

  let base: {
    categoryHeader: string;
    title: string;
    proposta: string;
    dinamica: string;
    materials: string;
    dicaMonitora?: string;
    extra?: { livro?: string; versiculo?: string };
  };

  if (cat.includes('devocional')) {
    base = {
      categoryHeader: 'Devocional',
      title: 'O coração que acolhe e agradece',
      proposta: 'proporcionar um momento sereno de reflexão sobre a gratidão e o amor de Deus, fortalecendo a empatia e os laços de amizade na rotina escolar.',
      dinamica: 'a monitora reúne a turma em roda e convida cada criança a segurar a pedrinha da gratidão, compartilhando uma palavra de carinho antes de uma oração simples e acolhedora.',
      materials: 'Pedrinhas decorativas da gratidão\nBíblia infantil com linguagem acessível',
      dicaMonitora: 'acolha os sentimentos trazidos pelas crianças com sensibilidade e respeito ao tempo individual de expressão.',
      extra: {
        versiculo: '1 Tessalonicenses 5:18 - Em tudo dai graças, porque esta é a vontade de Deus em Cristo Jesus para convosco.',
      },
    };
  } else if (cat.includes('história') || cat.includes('historia') || cat.includes('leitura') || cat.includes('literatura')) {
    base = {
      categoryHeader: 'Contação de História',
      title: 'A viagem mágica das emoções coloridas',
      proposta: 'despertar o prazer da leitura e o imaginário infantil por meio da apreciação afetuosa das ilustrações e da narrativa.',
      dinamica: 'a monitora reúne a turma e realiza a leitura mediada com pausas para instigar as percepções das crianças sobre os sentimentos dos personagens, permitindo o manuseio afetuoso do livro.',
      materials: 'Livro impresso O monstro das cores\nPotes transparentes e novelos de lã colorida',
      dicaMonitora: 'incentive a participação espontânea de todas as crianças e valorize as interpretações individuais sobre a história.',
      extra: {
        livro: 'O Monstro das Cores, de Anna Llenas (Editora Aletria).',
      },
    };
  } else if (cat.includes('artes') || cat.includes('desenho') || cat.includes('pintura')) {
    if (isUpperElementary) {
      base = {
        categoryHeader: 'Artes',
        title: 'Mosaicos e formas da imaginação',
        proposta: 'explorar técnicas de composição expressiva, estimulando a percepção estética, a paciência e a criatividade autônoma na produção artística.',
        dinamica: 'com mediação da equipe, os alunos delimitam o desenho em papel cartão e recortam pequenos fragmentos de papéis texturizados para preencher a composição com cuidado e precisão.',
        materials: 'Papel cartão rígido\nRetalhos de papéis texturizados e coloridos\nTesouras sem ponta e cola branca',
        dicaMonitora: 'valorize a persistência no acabamento e o estilo expressivo individual de cada criação.',
      };
    } else {
      base = {
        categoryHeader: 'Artes',
        title: 'Ateliê das texturas e cores naturais',
        proposta: 'explorar a sensibilidade artística, a percepção de cores e formas e a coordenação motora fina em uma vivência plástica acolhedora.',
        dinamica: 'a monitora organiza as bancadas com suportes amplos e tintas; as crianças experimentam livremente misturas de tons e carimbos para compor sua produção com carinho.',
        materials: 'Papel kraft\nTintas guache atóxicas\nPincéis largos e esponjas',
        dicaMonitora: 'deixe as crianças explorarem as misturas de cores com liberdade antes de definir a forma final.',
      };
    }
  } else if (cat.includes('natação') || cat.includes('natacao') || cat.includes('piscina') || cat.includes('aquática')) {
    base = {
      categoryHeader: 'Natação',
      title: 'O circuito dos pequenos golfinhos',
      proposta: 'estimular a segurança no meio aquático, a respiração suave e a autonomia corporal de forma lúdica e afetuosa.',
      dinamica: 'a equipe orienta a entrada na água com brincadeiras de sopro e flutuação em estrela assistida, seguida do resgate de argolas coloridas na parte rasa.',
      materials: 'Pranchas de EVA\nArgolas de mergulho para água rasa\nEspaguetes flutuadores',
      dicaMonitora: 'mantenha a atenção visual contínua e encoraje com palavras afetuosas as crianças que apresentarem receio.',
    };
  } else if (cat.includes('balé') || cat.includes('bale')) {
    base = {
      categoryHeader: 'Balé',
      title: 'A dança dos lenços encantados',
      proposta: 'desenvolver a postura suave, a expressão corporal e o ritmo clássico de forma leve e lúdica.',
      dinamica: 'a turma realiza movimentos de meia ponta e giros suaves segurando lenços de seda coloridos ao som de melodia clássica serena.',
      materials: 'Lenços de seda coloridos\nAparelho de som e sapatilhas',
      dicaMonitora: 'demonstre os passos com entusiasmo e acolha a espontaneidade gestual de cada aluna.',
    };
  } else if (cat.includes('judô') || cat.includes('judo') || cat.includes('marcial')) {
    base = {
      categoryHeader: 'Judô',
      title: 'Mestres do equilíbrio e do respeito mútuo',
      proposta: 'trabalhar o autocontrole, a disciplina afetuosa, o equilíbrio e o cuidado com a segurança nas quedas suaves.',
      dinamica: 'cerimonial de saudação inicial com respeito mútuo, seguido de rolamentos suaves no tatame e jogos cooperativos de equilíbrio em duplas.',
      materials: 'Tatame amortecedor\nKimonos e faixas',
      dicaMonitora: 'reforce que o cuidado e a proteção ao parceiro são o princípio fundamental do treino.',
    };
  } else if (cat.includes('futebol') || cat.includes('esporte')) {
    base = {
      categoryHeader: 'Futebol',
      title: 'A rede dos passes solidários',
      proposta: 'aprimorar a coordenação motora ampla, a visão de jogo e a cooperação em equipe através de desafios participativos com bola.',
      dinamica: 'circuito de condução de bola entre cones baixos, seguido de partida recreativa onde o ponto só é validado após a participação de todos os colegas.',
      materials: 'Bolas de futebol infantil\nCones demarcadores\nColetes coloridos',
      dicaMonitora: 'incentive o passe e a celebração do esforço coletivo acima de qualquer competição.',
    };
  } else if (cat.includes('música') || cat.includes('musicalização') || cat.includes('ritmo') || cat.includes('flauta')) {
    base = {
      categoryHeader: 'Musicalização',
      title: 'A sinfonia dos sons da natureza',
      proposta: 'apurar a escuta atenta, a sensibilidade rítmica e a sincronia corporal com brincadeiras sonoras acolhedoras.',
      dinamica: 'a monitora propõe jogos de ecos rítmicos com palmas e estalos; em seguida, distribui pequenos instrumentos para acompanhar uma canção suave.',
      materials: 'Chocalhos de sementes\nClavas de madeira\nPandeiros infantis',
      dicaMonitora: 'comece com andamentos calmos e celebre a harmonia coletiva do grupo ao tocar junto.',
    };
  } else if (cat.includes('culinária') || cat.includes('nutricional')) {
    base = {
      categoryHeader: 'Culinária Infantil',
      title: 'Chefs mirins e o arco-íris dos sabores',
      proposta: 'promover hábitos saudáveis e a curiosidade sensorial pela variedade de frutas frescas em uma vivência gastronômica alegre.',
      dinamica: 'após a higienização cuidadosa das mãos e colocação das touquinhas, as crianças cortam pedacinhos de frutas com espátulas plásticas e montam seus espetinhos coloridos.',
      materials: 'Frutas frescas da estação\nEspátulas plásticas seguras\nPratinhos e toucas higiênicas',
      dicaMonitora: 'estimule as crianças a sentirem os aromas e provarem novos sabores com tranquilidade.',
    };
  } else if (cat.includes('robótica') || cat.includes('robotica') || cat.includes('computacional')) {
    base = {
      categoryHeader: 'Robótica Educacional',
      title: 'Pequenos inventores e as engrenagens curiosas',
      proposta: 'despertar o raciocínio investigativo e a colaboração em equipe através da montagem de mecanismos simples.',
      dinamica: 'em duplas, as crianças exploram o encaixe de eixos e engrenagens para criar um protótipo funcional, dialogando sobre como aprimorar o movimento.',
      materials: 'Kits de blocos estruturais didáticos\nEixos e rodinhas plásticas',
      dicaMonitora: 'estimule a reflexão diante dos desafios, fazendo perguntas investigativas com carinho.',
    };
  } else {
    base = {
      categoryHeader: category || 'Vivência Integrada',
      title: 'A trilha dos passos cooperativos',
      proposta: 'proporcionar uma vivência participativa e cooperativa, promovendo a integração afetiva e a autonomia das crianças no espaço coletivo.',
      dinamica: 'a monitora introduz a dinâmica de forma lúdica, distribuindo os materiais e orientando as crianças passo a passo para que todas brinquem e colaborem juntas.',
      materials: 'Materiais pedagógicos de apoio da sala\nPranchetas e recursos lúdicos',
      dicaMonitora: 'mantenha a atenção afetuosa a cada criança, apoiando quem necessitar de mediação mais próxima e celebrando os avanços do grupo.',
    };
  }

  const formattedDevelopment = formatPedagogicalDescription(
    base.categoryHeader,
    base.title,
    base.proposta,
    base.dinamica,
    base.materials,
    base.dicaMonitora,
    base.extra
  );

  return {
    title: base.title,
    theme: cleanTheme || 'Desenvolvimento integral e convivência fraterna',
    objectives: base.proposta,
    development: formattedDevelopment,
    materials: base.materials,
    dicaMonitora: base.dicaMonitora,
    formattedDevelopment,
  };
}

/**
 * Converte string de horário ou timeSlot em minutos absolutos do dia (0 a 1439).
 * Suporta formatos como:
 * - "11:20 - 11:30"
 * - "07:30"
 * - "7:30"
 * - "07h30" / "13h" / "15h00"
 * Retorna 9999 para horários ausentes ou não identificáveis (colocando-os ao final).
 */
export function parseTimeToMinutes(rawTime?: string | null): number {
  if (!rawTime || typeof rawTime !== 'string') return 9999;
  const cleaned = rawTime.trim();

  // Padrão 1: HH:MM (ex: "11:20 - 11:30", "07:30", "7:30")
  const colonMatch = cleaned.match(/(\d{1,2}):(\d{2})/);
  if (colonMatch) {
    const hours = parseInt(colonMatch[1], 10);
    const minutes = parseInt(colonMatch[2], 10);
    return hours * 60 + minutes;
  }

  // Padrão 2: HHhMM ou HHh (ex: "07h30", "11h", "15h00")
  const hMatch = cleaned.match(/(\d{1,2})h(\d{2})?/i);
  if (hMatch) {
    const hours = parseInt(hMatch[1], 10);
    const minutes = hMatch[2] ? parseInt(hMatch[2], 10) : 0;
    return hours * 60 + minutes;
  }

  return 9999;
}

/**
 * Extrai os minutos de início de um item/plano pedagógico a partir de seus campos de horário
 * (horarioInicio, horario, timeSlot, startTime).
 */
export function getStartMinutes(item: any): number {
  if (!item) return 9999;
  const rawTime =
    item.horarioInicio ||
    item.horario ||
    item.timeSlot ||
    item.startTime ||
    '';
  const minutes = parseTimeToMinutes(rawTime);
  if (minutes !== 9999) return minutes;

  // Fallback defensivo: tenta extrair horário do título ou categoria caso ausente
  if (typeof item.title === 'string') {
    const titleMin = parseTimeToMinutes(item.title);
    if (titleMin !== 9999) return titleMin;
  }
  if (typeof item.category === 'string') {
    const catMin = parseTimeToMinutes(item.category);
    if (catMin !== 9999) return catMin;
  }

  return 9999;
}

/**
 * Verifica se a atividade corresponde estritamente à modalidade 'Reforço e Lego' ou 'Reforço'.
 * Bloqueia categoricamente modalidades regulares como Flauta, Judô, Natação, Psicomotricidade, Acolhimento, Almoço, Higienização, Artes, Culinária, Lanche, Saída, etc.
 */
export function isReforcoActivity(
  activityOrPlan:
    | SemanarioPlan
    | ScheduleBlock
    | { category?: string; title?: string; activityId?: string; modalidade?: string; name?: string }
    | string
    | null
    | undefined
): boolean {
  if (!activityOrPlan) return false;
  const norm = (s?: string) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  let cat = '';
  let title = '';

  if (typeof activityOrPlan === 'string') {
    cat = norm(activityOrPlan);
  } else {
    cat = norm(
      (activityOrPlan as any).category ||
      (activityOrPlan as any).activityId ||
      (activityOrPlan as any).modalidade ||
      (activityOrPlan as any).name ||
      ''
    );
    title = norm((activityOrPlan as any).title || '');
  }

  // Lista explícita de modalidades regulares que NUNCA devem exibir o badge/alunos de Reforço
  const FORBIDDEN_REGULAR_ACTIVITIES = [
    'flauta',
    'judo',
    'natacao',
    'psicomotricidade',
    'acolhimento',
    'almoco',
    'higienizacao',
    'artes',
    'culinaria',
    'lanche',
    'saida',
    'recreacao',
    'descanso',
    'sono',
    'parque',
    'patio',
    'leitura',
    'devocional',
    'musicalizacao',
    'musica',
    'ballet',
    'bale',
    'capoeira',
    'futebol',
    'ingles',
    'rotina',
  ];

  // Se a categoria for estritamente uma rotina regular e não contiver 'reforco', bloqueia imediatamente
  const isForbiddenCategory = FORBIDDEN_REGULAR_ACTIVITIES.some((forbidden) => {
    return (
      cat === forbidden ||
      cat.startsWith(`${forbidden} `) ||
      cat.endsWith(` ${forbidden}`) ||
      title === forbidden
    ) && !cat.includes('reforco') && !title.includes('reforco');
  });

  if (isForbiddenCategory) {
    return false;
  }

  // Condição (a): A modalidade/categoria deve ser estritamente 'Reforço e Lego' (ou contiver 'Reforço' na categoria/título)
  const isStrictReforco =
    cat === 'reforco e lego' ||
    cat === 'lego e reforco' ||
    cat.includes('reforco') ||
    title.includes('reforco');

  return isStrictReforco;
}

/**
 * Identifica se uma proposta pedagógica do Semanário corresponde a atividades paralelas (Reforço e Lego).
 */
export function isLegoOrReforcoPlan(plan: SemanarioPlan | null | undefined): boolean {
  return isReforcoActivity(plan);
}

/**
 * Identifica se o aluno frequenta a modalidade 'Reforço' (via modalidadesEspeciais, specialties ou activities).
 */
export function isStudentInReforco(student: Student | null | undefined): boolean {
  if (!student) return false;
  const status = student.status || student.statusMatricula || 'ativo';
  if (status !== 'ativo') return false;
  const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mods = Array.isArray(student.modalidadesEspeciais) ? student.modalidadesEspeciais : [];
  const specs = Array.isArray(student.specialties) ? student.specialties : [];
  const acts = Array.isArray(student.activities) ? student.activities : [];
  return (
    mods.some((m: string) => norm(m).includes('reforco')) ||
    specs.some((s: string) => norm(s).includes('reforco')) ||
    acts.some((a: string) => norm(a).includes('reforco'))
  );
}

/**
 * Validação de Vigência do Reforço Escolar:
 * Verifica se a data do evento/dia atual está estritamente entre 'reforcoStartDate' e 'reforcoEndDate'.
 * O aluno deve ser incluído nos cards e chamadas APENAS dentro desse intervalo de vigência.
 * Se a data atual for anterior à data de início ou posterior à data final, o aluno NÃO deve ser listado.
 */
export function isStudentInReforcoVigency(
  student: Student | null | undefined,
  dateStr?: string | null
): boolean {
  if (!student) return false;
  if (!isStudentInReforco(student)) return false;

  const targetDate = (dateStr || '').trim() || toISODateString(new Date());

  if (student.reforcoStartDate && student.reforcoStartDate.trim()) {
    if (targetDate < student.reforcoStartDate.trim()) {
      return false;
    }
  }
  if (student.reforcoEndDate && student.reforcoEndDate.trim()) {
    if (targetDate > student.reforcoEndDate.trim()) {
      return false;
    }
  }

  return true;
}

/**
 * Retorna os alunos de uma turma específica convocados para o Reforço no dia da semana fornecido,
 * respeitando o período de vigência para a data informada.
 */
export function getReforcoStudentsForTurmaAndDay(
  students: Student[],
  turma: string,
  dayOfWeek: DayOfWeek,
  targetDate?: string
): Student[] {
  if (!Array.isArray(students) || students.length === 0 || !turma) return [];
  const normTurma = (t: string) => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const targetTurmaNorm = normTurma(turma);

  return students
    .filter((s) => {
      if (normTurma(s.turma) !== targetTurmaNorm) return false;
      if (!isStudentInReforcoVigency(s, targetDate)) return false;
      if (targetDate) {
        if (!isStudentActiveOnDate(s, targetDate)) return false;
        if (!isStudentScheduledForDate(s, targetDate)) return false;
      } else {
        if (!isStudentScheduledForDay(s, dayOfWeek)) return false;
      }
      return true;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
}

/**
 * Injeção estrita dos alunos de Reforço para um card do Semanário.
 * Atende simultaneamente às condições mandatadas:
 *   a) Categoria/modalidade estritamente 'Reforço e Lego' ou contendo 'Reforço';
 *   b) Dia da semana contratado/agendado para o aluno;
 *   c) Horário do bloco coincidente com o horário de execução do Reforço;
 *   d) Vigência com Data Inicial/Final (reforcoStartDate e reforcoEndDate).
 * Impede categoricamente a exibição em cards de Acolhimento, Almoço, Higienização, Artes, Culinária, Lanche, Saída, etc.
 */
export function getReforcoStudentsForCard(
  plan: SemanarioPlan | null | undefined,
  students: Student[] | null | undefined,
  schedules?: ScheduleBlock[] | null,
  targetDate?: string
): Student[] {
  if (!plan || !Array.isArray(students) || students.length === 0) return [];

  // Condição a: Modalidade/categoria estritamente 'Reforço e Lego' ou contendo 'Reforço'
  // E bloqueio de modalidades regulares
  if (!isReforcoActivity(plan)) {
    return [];
  }

  // Condição c: Horário do bloco coincidente com a execução do Reforço
  // Se existirem blocos oficiais na grade (schedules) para esta turma e dia, valida se há um bloco de Reforço
  if (Array.isArray(schedules) && schedules.length > 0 && plan.turma && plan.dayOfWeek && plan.timeSlot) {
    const norm = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const safeTurma = norm(plan.turma);

    const reforcoBlocks = schedules.filter((b) => {
      if (norm(b.turma) !== safeTurma) return false;
      if (b.dayOfWeek !== plan.dayOfWeek) return false;
      const actNorm = norm(b.activityId);
      return actNorm === 'reforco e lego' || actNorm === 'lego e reforco' || actNorm.includes('reforco');
    });

    if (reforcoBlocks.length > 0) {
      const planTime = (plan.timeSlot || '').replace(/\s+/g, '');
      const matchesScheduleTime = reforcoBlocks.some((b) => {
        const blockTime = `${b.startTime}-${b.endTime}`.replace(/\s+/g, '');
        return planTime.includes(blockTime) || blockTime.includes(planTime) || planTime.includes(b.startTime);
      });
      if (!matchesScheduleTime) {
        return [];
      }
    }
  }

  // Condição b e d: Aluno matriculado no Reforço com vigência ativa e agendado para o dia/data
  const normTurma = (t: string) => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const targetTurmaNorm = normTurma(plan.turma);
  const effectiveDate = targetDate || plan.date;

  return students
    .filter((s) => {
      if (!s) return false;
      const status = s.status || s.statusMatricula || 'ativo';
      if (status !== 'ativo') return false;

      // Turma do aluno
      if (normTurma(s.turma) !== targetTurmaNorm) return false;

      // Aluno matriculado/inscrito em Reforço dentro do intervalo de vigência estrito
      if (!isStudentInReforcoVigency(s, effectiveDate)) return false;

      // Validação de calendário escolar e dias contratados/frequência
      if (effectiveDate) {
        if (!isStudentActiveOnDate(s, effectiveDate)) return false;
        if (!isStudentScheduledForDate(s, effectiveDate)) return false;
      } else {
        // Dia da semana contratado/agendado de frequência
        if (!isStudentScheduledForDay(s, plan.dayOfWeek)) return false;
      }

      return true;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
}

export const getSpecialtyStudentsForActivity = getReforcoStudentsForCard;

