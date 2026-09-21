import { ActivityItem, SemanarioPlan, WeekInfo, ScheduleBlock, UserProfile } from '../types';
import { getScheduleBlocksForTurma, generateCuratedProposal, DAYS_OF_WEEK_ORDER } from './semanarioUtils';
import { getWeekDays } from './dateUtils';
import { getStoredUser } from './authUtils';

export interface SemanarioAiProgress {
  current: number;
  total: number;
  percent: number;
  successCount: number;
  failCount: number;
  currentTurma?: string;
  currentCategory?: string;
  currentDay?: string;
  isFinished?: boolean;
}

export interface SemanarioAiBatchResult {
  plans: SemanarioPlan[];
  total: number;
  successCount: number;
  failCount: number;
  failedPlans: SemanarioPlan[];
  wasAborted: boolean;
}

/**
 * Chama a rota do Gemini (/api/gemini/generate-proposal) para obter proposta pedagógica alinhada à BNCC.
 */
export async function fetchGeminiProposal(
  turma: string,
  category: string,
  dayOfWeek: string,
  date: string,
  theme?: string,
  signal?: AbortSignal,
  currentUser?: UserProfile | null
): Promise<{ success: boolean; proposal?: { title: string; objectives: string; development: string; materials: string }; error?: string }> {
  try {
    const userToVerify = currentUser !== undefined ? currentUser : getStoredUser();
    const userRole = userToVerify?.role || '';
    const userEmail = userToVerify?.email || '';

    const res = await fetch('/api/gemini/generate-proposal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': userRole,
        'x-user-email': userEmail,
      },
      body: JSON.stringify({
        turma,
        category,
        dayOfWeek,
        date,
        theme,
        userRole,
        userEmail,
      }),
      signal,
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return {
        success: false,
        error: errJson?.error || `HTTP ${res.status}: Falha na geração`,
      };
    }

    const data = await res.json();
    if (data.success && data.proposal && data.proposal.title) {
      return {
        success: true,
        proposal: data.proposal,
      };
    }

    return {
      success: false,
      error: data.error || 'Resposta da IA em formato inesperado',
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    return {
      success: false,
      error: err.message || 'Erro de conexão com o serviço de IA',
    };
  }
}

/**
 * Prepara o esqueleto inicial de planos para as turmas e semana fornecidas.
 */
export function buildPlanTemplatesForTurmas(
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

        const safeTurmaId = turmaName.replace(/\s+/g, '_').toLowerCase();
        const safeCatId = categoryName.replace(/\s+/g, '_').toLowerCase();
        const safeTime = block.startTime.replace(':', '');

        // Preenche inicialmente com fallback curado (caso seja abortado antes de rodar)
        const curated = generateCuratedProposal(turmaName, categoryName);

        plans.push({
          id: `plan_sched_${safeTurmaId}_${day}_${safeCatId}_${safeTime}_w${weekInfo.weekNumber}_${weekInfo.year}`,
          turma: turmaName,
          weekNumber: weekInfo.weekNumber,
          year: weekInfo.year,
          date: dayDate,
          dayOfWeek: day,
          timeSlot: timeSlot,
          category: categoryName,
          title: curated.title,
          objectives: curated.objectives,
          development: curated.development,
          materials: curated.materials,
          teacherName: 'Aguardando preenchimento',
          status: 'pendente',
          substitutionReason: undefined,
          photos: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: 'Coordenação Pedagógica (IA)',
        });
      });
    });
  });

  return plans;
}

/**
 * Executa o povoamento com IA do Gemini em lote controlado (concurrency pool de 3 a 4 requisições simultâneas),
 * atualizando o progresso em tempo real e aplicando fallback automático para falhas isoladas.
 */
export async function populateTurmasWithAI(
  turmasList: string[],
  weekInfo: WeekInfo,
  schedules?: ScheduleBlock[],
  activitiesList?: ActivityItem[],
  options?: {
    concurrency?: number;
    onProgress?: (progress: SemanarioAiProgress) => void;
    abortSignal?: AbortSignal;
    plansToProcess?: SemanarioPlan[];
    currentUser?: UserProfile | null;
  }
): Promise<SemanarioAiBatchResult> {
  const plans = options?.plansToProcess || buildPlanTemplatesForTurmas(turmasList, weekInfo, schedules, activitiesList);
  const total = plans.length;
  const concurrency = Math.max(1, Math.min(options?.concurrency || 3, 5));

  let completedCount = 0;
  let successCount = 0;
  let failCount = 0;
  let wasAborted = false;
  const failedPlans: SemanarioPlan[] = [];

  if (total === 0) {
    return {
      plans: [],
      total: 0,
      successCount: 0,
      failCount: 0,
      failedPlans: [],
      wasAborted: false,
    };
  }

  // Notificação inicial
  options?.onProgress?.({
    current: 0,
    total,
    percent: 0,
    successCount: 0,
    failCount: 0,
    currentTurma: plans[0]?.turma,
    currentCategory: plans[0]?.category,
    currentDay: plans[0]?.dayOfWeek,
  });

  let index = 0;

  async function worker() {
    while (index < plans.length) {
      if (options?.abortSignal?.aborted) {
        wasAborted = true;
        break;
      }

      const currentIndex = index++;
      const plan = plans[currentIndex];
      if (!plan) continue;

      try {
        const result = await fetchGeminiProposal(
          plan.turma,
          plan.category,
          plan.dayOfWeek,
          plan.date,
          undefined,
          options?.abortSignal,
          options?.currentUser
        );

        if (result.success && result.proposal) {
          plan.title = result.proposal.title;
          plan.objectives = result.proposal.objectives;
          plan.development = result.proposal.development;
          plan.materials = result.proposal.materials;
          plan.updatedBy = 'Gemini 2.5 (IA Oficial)';
          plan.updatedAt = new Date().toISOString();
          successCount++;
        } else {
          // Falha na API: mantém ou reforça o fallback curado e anota a falha
          const fallback = generateCuratedProposal(plan.turma, plan.category);
          plan.title = fallback.title;
          plan.objectives = fallback.objectives;
          plan.development = fallback.development;
          plan.materials = fallback.materials;
          plan.updatedBy = 'Coordenação (Fallback Curado)';
          plan.updatedAt = new Date().toISOString();
          failCount++;
          failedPlans.push(plan);
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || options?.abortSignal?.aborted) {
          wasAborted = true;
          break;
        }
        const fallback = generateCuratedProposal(plan.turma, plan.category);
        plan.title = fallback.title;
        plan.objectives = fallback.objectives;
        plan.development = fallback.development;
        plan.materials = fallback.materials;
        failCount++;
        failedPlans.push(plan);
      } finally {
        completedCount++;
        const percent = Math.round((completedCount / total) * 100);
        options?.onProgress?.({
          current: completedCount,
          total,
          percent,
          successCount,
          failCount,
          currentTurma: plan.turma,
          currentCategory: plan.category,
          currentDay: plan.dayOfWeek,
          isFinished: completedCount >= total,
        });
      }
    }
  }

  // Lança o pool de workers concorrentes
  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);

  return {
    plans,
    total,
    successCount,
    failCount,
    failedPlans,
    wasAborted,
  };
}
