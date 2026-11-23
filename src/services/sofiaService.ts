/**
 * sofiaService.ts
 * Orquestrador da Assistente Sofia (Colégio Crescer).
 * Envia contexto ao vivo em America/Sao_Paulo, executa Function Calling real em modo AUTO
 * com até 4 chamadas sequenciais por pedido, functionResponse estruturado e trava anti-repetição.
 */

import {
  Student,
  AttendanceRecord,
  PontoRecord,
  UserProfile,
  ScheduleBlock,
  AppStateSummary,
  SofiaChatMessage,
  SofiaToolCall,
  SofiaToolResult,
  SofiaToolExecutionStep,
  SofiaAgentToolName,
  SofiaAdminAiAlert,
} from '../types';
import {
  formatDateBR,
  getDayOfWeekFromDate,
  toISODateString,
} from '../utils/dateUtils';
import {
  getUnifiedSofiaAttendanceMetrics,
  getTodayISOSaoPaulo,
  getNowTimeSaoPaulo,
} from '../utils/frequenciaUtils';
import { getCurrentActivityForTurma, extractSlotLimits } from '../utils/timeUtils';
import { loadMonthlyMenu } from '../utils/cardapioStorage';
import { isAdmin } from '../utils/authUtils';
import {
  formatHourPTBR,
  getDayOfWeekFullPTBR,
  SOFIA_CORE_TRAINING_PROMPT,
  SOFIA_DEFAULT_MODEL,
} from '../utils/sofiaPromptBuilder';
import {
  executeSofiaTool,
  SofiaToolExecutionContext,
} from './sofiaTools';
import {
  SOFIA_ADMIN_ALERT_EVENT,
  getStoredSofiaAdminAlert,
  saveSofiaAdminAlert,
  clearStoredSofiaAdminAlert,
  persistSofiaAdminAlertToDbAndNotify,
  resolvePersistentSofiaAdminAlert,
} from './sofiaSecurityService';
import { getSofiaAuthHeaders } from './authSessionService';

export {
  SOFIA_ADMIN_ALERT_EVENT,
  getStoredSofiaAdminAlert,
  saveSofiaAdminAlert,
  clearStoredSofiaAdminAlert,
};

export const SOFIA_SYSTEM_INSTRUCTION = SOFIA_CORE_TRAINING_PROMPT;

const MAX_TOOL_STEPS = 4;

/**
 * Extrai data e contexto temporal de consultas em linguagem natural (ex: "ontem", "anteontem", "dia 28")
 */
export function extractDateFromTemporalQuery(
  rawQuery: string,
  baseDateStr?: string
): { targetDate: string; isHistorical: boolean; label: string } {
  const q = rawQuery.toLowerCase();
  const ref = baseDateStr ? new Date(baseDateStr + 'T12:00:00') : new Date();

  if (q.includes('anteontem')) {
    const d = new Date(ref);
    d.setDate(d.getDate() - 2);
    return { targetDate: toISODateString(d), isHistorical: true, label: 'anteontem' };
  }

  if (q.includes('ontem')) {
    const d = new Date(ref);
    d.setDate(d.getDate() - 1);
    return { targetDate: toISODateString(d), isHistorical: true, label: 'ontem' };
  }

  if (q.includes('amanha') || q.includes('amanhã')) {
    const d = new Date(ref);
    d.setDate(d.getDate() + 1);
    return { targetDate: toISODateString(d), isHistorical: false, label: 'amanhã' };
  }

  const isoMatch = rawQuery.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return { targetDate: isoMatch[0], isHistorical: true, label: isoMatch[0] };
  }

  const brMatch = rawQuery.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (brMatch) {
    const d = brMatch[1].padStart(2, '0');
    const m = brMatch[2].padStart(2, '0');
    const y = brMatch[3] || String(ref.getFullYear());
    return { targetDate: `${y}-${m}-${d}`, isHistorical: true, label: `${d}/${m}/${y}` };
  }

  const diaMatch = rawQuery.match(/\bdia\s+(\d{1,2})(?:\s+de\s+([a-zA-Zç]+))?(?:\s+de\s+(\d{4}))?\b/i);
  if (diaMatch) {
    const day = parseInt(diaMatch[1], 10);
    if (day >= 1 && day <= 31) {
      let month = ref.getMonth();
      let year = ref.getFullYear();

      if (diaMatch[2]) {
        const mStr = diaMatch[2].toLowerCase();
        const monthNames = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        const idx = monthNames.findIndex((m) => mStr.startsWith(m));
        if (idx !== -1) month = idx;
      }
      if (diaMatch[3]) {
        year = parseInt(diaMatch[3], 10);
      }
      const targetDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { targetDate, isHistorical: true, label: `dia ${day}` };
    }
  }

  return { targetDate: getTodayISOSaoPaulo(ref), isHistorical: false, label: 'hoje' };
}

/**
 * Constrói o resumo do estado global em tempo real da escola usando a mesma Fonte Única de Verdade
 * das ferramentas e do painel de frequência (America/Sao_Paulo).
 */
export function buildLiveAppStateSummary(params: {
  students: Student[];
  records: AttendanceRecord[];
  pontoRecords?: PontoRecord[];
  currentUser?: UserProfile | null;
  selectedDate: string;
  activeTab?: string;
  selectedTurma?: string;
  activeTurmas?: string[];
  schedules?: ScheduleBlock[];
}): AppStateSummary {
  const now = new Date();
  const dateStr = getTodayISOSaoPaulo(now);
  const currentTime = getNowTimeSaoPaulo(now);
  const dayOfWeek = getDayOfWeekFromDate(dateStr);
  const dayOfWeekFull = getDayOfWeekFullPTBR(dateStr);
  const formattedDate = formatDateBR(dateStr);

  const metrics = getUnifiedSofiaAttendanceMetrics({
    dateStr,
    students: params.students || [],
    records: params.records || [],
    activeTurmas: params.activeTurmas,
  });

  const turmasList =
    params.activeTurmas && params.activeTurmas.length > 0
      ? params.activeTurmas
      : ['Mini Maternal Azul', 'Maternal Azul', '1º Ano Azul', '1º Ano Laranja', '2º Ano Azul', '3º Ano', '4º Ano', '5º Ano'];

  // Panorama curto das atividades agora
  const atividadesAgoraResumo: string[] = [];
  if (Array.isArray(params.schedules) && params.schedules.length > 0) {
    turmasList.forEach((t) => {
      const blocks = params.schedules!.filter(
        (b) => b.turma?.toLowerCase().trim() === t.toLowerCase().trim() && b.dayOfWeek === dayOfWeek
      );
      const cur = getCurrentActivityForTurma(blocks, currentTime);
      if (cur) {
        const limits = extractSlotLimits(cur);
        atividadesAgoraResumo.push(
          `${t}: ${cur.activityId}${cur.location ? ` (${cur.location})` : ''} até ${formatHourPTBR(limits.horaFim)}`
        );
      }
    });
  }

  // Cardápio de hoje resumido
  let cardapioHojeResumo = '';
  try {
    const [y, m] = dateStr.split('-');
    const menu = loadMonthlyMenu(`${y}-${m}`);
    const dayMenu = menu?.days?.[dateStr];
    if (dayMenu && !dayMenu.isHoliday) {
      const items = [dayMenu.protein, dayMenu.garnish, dayMenu.dessert, dayMenu.specialNotes].filter(Boolean);
      if (items.length > 0) cardapioHojeResumo = items.join(' • ');
    }
  } catch {
    // silencioso
  }

  const assignedTurmas = [
    ...(Array.isArray(params.currentUser?.allowedClassIds) ? params.currentUser!.allowedClassIds : []),
    ...(Array.isArray(params.currentUser?.assignedTurmas) ? params.currentUser!.assignedTurmas : []),
  ].filter(Boolean);

  return {
    currentTime,
    currentDate: dateStr,
    dayOfWeek,
    dayOfWeekFull,
    formattedDate,
    atualizadoEm: metrics.atualizado_em,
    activeTab: params.activeTab,
    selectedTurma: params.selectedTurma,
    totalMatriculados: metrics.total_matriculados,
    totalAlunosAtivos: metrics.esperados,
    totalPresentesHoje: metrics.presentes,
    totalFaltasHoje: metrics.faltas,
    totalJustificadosHoje: metrics.justificados,
    totalAlunosEsperadosHoje: metrics.esperados,
    totalAlunosPendentesHoje: metrics.alunos_pendentes_qtd,
    totalChamadasPendentesBlocoAtual: metrics.turmas_com_chamada_pendente.quantidade,
    turmasComChamadaPendenteHoje: metrics.turmas_com_chamada_pendente.turmas,
    atividadesAgoraResumo: atividadesAgoraResumo.slice(0, 12),
    cardapioHojeResumo: cardapioHojeResumo || undefined,
    currentUser: {
      id: params.currentUser?.id,
      name: params.currentUser?.name || 'Equipe',
      email: params.currentUser?.email || '',
      role: params.currentUser?.role || 'professor',
      cargoLabel: params.currentUser?.cargoLabel || 'Equipe do Integral',
      isAdmin: isAdmin(params.currentUser),
      allowedTabs: params.currentUser?.allowedTabs,
      assignedTurmas,
    },
  };
}

function sanitizeHistoryForTransport(history: SofiaChatMessage[]): any[] {
  return (history || [])
    .filter((h) => h && h.id !== 'welcome')
    .slice(-20)
    .map((h) => ({
      id: h.id,
      sender: h.sender,
      text: h.text,
      timestamp: h.timestamp,
      toolTurns: h.toolTurns,
    }));
}

function normalizeForRepetition(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classificação explícita: ferramentas SOMENTE LEITURA (idempotentes, podem repetir 1x em falha transitória)
 * vs. ferramentas de ESCRITA / EFEITO COLATERAL (NUNCA repetem automaticamente).
 */
export const READ_ONLY_SOFIA_TOOLS = new Set<SofiaAgentToolName>([
  'consultarFrequenciaHoje',
  'obterResumoFrequenciaPorData',
  'consultarAtividadesMomento',
  'consultarGradeHoraria',
  'consultarLivroPonto',
  'analisarDesarranjosDoDia',
  'consultarAlertasSaidaHoje',
  'consultarCardapio',
  'consultarSemanario',
  'consultarManualNormas',
  'consultarAlunosOuTurma',
  'consultarQuadroAtribuicoes',
  'consultarResumoFinanceiro',
  'gerar_pdf_frequencia',
  'gerarListaChamadaPDF',
  'gerarEspelhoPontoPDF',
  'gerarAutorizacaoEntradaSaidaPDF',
]);

export const WRITE_SOFIA_TOOLS = new Set<SofiaAgentToolName>([
  'confirmarSaidaAluno',
  'registrarSaidaAntecipada',
  'registrarFaltaFrequencia',
  'lancarFrequenciaTurma',
  'cadastrarAluno',
  'editarAluno',
  'alterarAnoLetivoAluno',
  'cadastrarUsuario',
  'cadastrarRefeicaoCardapio',
  'dispararAlertaWhatsApp',
  'gerarTermoSaidaAvulsa',
  'navegarModulo',
]);

export function isReadOnlySofiaTool(toolName: SofiaAgentToolName): boolean {
  return READ_ONLY_SOFIA_TOOLS.has(toolName);
}

function formatToolResultForModel(
  toolResult: SofiaToolResult,
  isWriteTool = false
): Record<string, any> {
  if (toolResult.success) {
    const payload =
      toolResult.data && typeof toolResult.data === 'object' && !Array.isArray(toolResult.data)
        ? toolResult.data
        : { resultado: toolResult.data };
    return {
      ok: true,
      ...payload,
      ...(toolResult.filename ? { arquivo_gerado: toolResult.filename } : {}),
      ...(toolResult.needsDisambiguation ? { precisa_desambiguacao: true } : {}),
    };
  }

  const isPermissionDenied = toolResult.data?.motivo === 'sem_permissao';

  return {
    ok: false,
    erro: toolResult.error || 'Não foi possível concluir esta consulta ou ação.',
    ...(isWriteTool && !isPermissionDenied
      ? {
          acao_nao_repetida_automaticamente: true,
          instrucao:
            'Explique com naturalidade o motivo de não ter sido possível concluir e pergunte ao usuário se ele deseja tentar novamente.',
        }
      : {}),
    ...(toolResult.data && typeof toolResult.data === 'object' ? toolResult.data : {}),
  };
}

function buildFallbackAdminAlert(
  status: number,
  model?: string,
  lastError?: string
): SofiaAdminAiAlert | null {
  const nowISO = new Date().toISOString();
  const activeModel = model || SOFIA_DEFAULT_MODEL;
  if (status === 402) {
    return {
      active: true,
      code: 402,
      kind: 'billing_depleted',
      message: 'Créditos da IA esgotados — recarregue em ai.studio/projects',
      actionUrl: 'https://ai.studio/projects',
      detectedAt: nowISO,
      model: activeModel,
      lastError,
    };
  }
  if (status === 429) {
    return {
      active: true,
      code: 429,
      kind: 'rate_limited',
      message: 'Limite temporário da IA atingido — verifique a cota em ai.studio/projects',
      actionUrl: 'https://ai.studio/projects',
      detectedAt: nowISO,
      model: activeModel,
      lastError,
    };
  }
  if (status === 404) {
    return {
      active: true,
      code: 404,
      kind: 'model_not_found',
      message: `Modelo de IA (${activeModel}) indisponível no projeto — verifique em ai.studio/projects`,
      actionUrl: 'https://ai.studio/projects',
      detectedAt: nowISO,
      model: activeModel,
      lastError,
    };
  }
  if (status === 503) {
    return {
      active: true,
      code: 503,
      kind: 'service_error',
      message: `Serviço de IA (${activeModel}) temporariamente indisponível — tente novamente em instantes`,
      actionUrl: 'https://ai.studio/projects',
      detectedAt: nowISO,
      model: activeModel,
      lastError,
    };
  }
  return null;
}

async function postSofiaChatWithRetry(
  body: Record<string, any>,
  apiBaseUrl = '',
  users?: UserProfile[],
  extraHeaders?: Record<string, string>
): Promise<any> {
  let lastError: any = null;
  const endpoint = `${apiBaseUrl}/api/sofia/chat`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getSofiaAuthHeaders(),
          ...(extraHeaders || {}),
        },
        body: JSON.stringify(body),
      });

      const parsed = await res.json().catch(() => null);
      if (res.ok && parsed?.success) {
        void resolvePersistentSofiaAdminAlert();
        return parsed;
      }

      if (res.status === 401 || res.status === 403) {
        const authErr = new Error('Acesso restrito ao administrador.');
        (authErr as any).status = res.status;
        throw authErr;
      }

      const errMsg = parsed?.error || `HTTP ${res.status}`;
      const error = new Error(errMsg);
      (error as any).status = res.status;
      (error as any).model = parsed?.model || SOFIA_DEFAULT_MODEL;
      (error as any).fallbackAttempted = Boolean(parsed?.fallbackAttempted);
      (error as any).quotaDepleted = Boolean(parsed?.quotaDepleted) || res.status === 402;
      (error as any).rateLimited = Boolean(parsed?.rateLimited) || res.status === 429;
      (error as any).modelNotFound = Boolean(parsed?.modelNotFound) || res.status === 404;

      const adminAlert: SofiaAdminAiAlert | null =
        parsed?.adminAlert || buildFallbackAdminAlert(res.status, parsed?.model, errMsg);
      if (adminAlert) {
        (error as any).adminAlert = adminAlert;
        void persistSofiaAdminAlertToDbAndNotify(adminAlert, users);
      }
      lastError = error;

      // Erros definitivos de cota/crédito/limite/modelo (402, 429, 404) não devem ser repetidos em loop
      if (res.status === 402 || res.status === 429 || res.status === 404) {
        throw error;
      }

      // Retry automático (1x) apenas para falha transitória 5xx
      if (res.status >= 500 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 450));
        continue;
      }
      throw error;
    } catch (err: any) {
      lastError = err;
      const isNonRetryableStatus =
        err?.status === 401 ||
        err?.status === 403 ||
        err?.status === 402 ||
        err?.status === 429 ||
        err?.status === 404 ||
        err?.quotaDepleted ||
        err?.rateLimited ||
        err?.modelNotFound;

      if (attempt === 0 && !isNonRetryableStatus) {
        await new Promise((r) => setTimeout(r, 450));
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Falha de comunicação com o servidor da Sofia');
}

/**
 * Política de execução de ferramentas:
 * - Ferramentas de LEITURA: permitem até 1 retry automático em erro transitório.
 * - Ferramentas de ESCRITA: executam estritamente 1 única vez (NUNCA repetem automaticamente);
 *   em caso de erro, devolve `{ success: false, error }` para ir no functionResponse ao modelo.
 */
async function executeToolWithPolicy(
  call: SofiaToolCall,
  context: SofiaToolExecutionContext
): Promise<SofiaToolResult> {
  const canRetry = isReadOnlySofiaTool(call.name);
  const maxAttempts = canRetry ? 2 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await executeSofiaTool(call.name, call.args || {}, context);
    } catch (err: any) {
      console.error(
        `[Sofia Tool] Falha ao executar ${canRetry ? 'leitura' : 'escrita'} "${call.name}" (tentativa ${attempt + 1}/${maxAttempts}):`,
        err
      );
      if (attempt + 1 >= maxAttempts) {
        return {
          toolName: call.name,
          success: false,
          error:
            err?.message ||
            (canRetry
              ? 'Erro ao consultar os dados desta ferramenta.'
              : 'Não foi possível concluir o registro agora.'),
        };
      }
    }
  }

  return {
    toolName: call.name,
    success: false,
    error: 'Não foi possível executar esta ação agora.',
  };
}

/**
 * Função Principal de Envio e Resolução Conversacional com a Sofia.
 * Ciclo completo: Modelo (AUTO) -> Executa Ferramenta(s) -> Devolve functionResponse ao Modelo -> Modelo escreve resposta final.
 */
export async function sendSofiaMessage(params: {
  message: string;
  history: SofiaChatMessage[];
  context: SofiaToolExecutionContext;
  onToolExecuting?: (toolName: string) => void;
  apiBaseUrl?: string;
  authHeaders?: Record<string, string>;
}): Promise<{
  text: string;
  model?: string;
  fallbackUsed?: boolean;
  toolCall?: SofiaToolCall;
  toolResult?: SofiaToolResult;
  toolResults?: SofiaToolResult[];
  toolTurns?: SofiaToolExecutionStep[];
  error?: string;
  errorCode?: number;
}> {
  const { message, history, context, onToolExecuting, apiBaseUrl = '', authHeaders } = params;

  if (!context.currentUser || !isAdmin(context.currentUser)) {
    return {
      text: 'Recurso exclusivo para administradores.',
      error: 'sem_permissao',
    };
  }

  const appState =
    context.appState ||
    buildLiveAppStateSummary({
      students: context.students,
      records: context.records,
      pontoRecords: context.pontoRecords,
      currentUser: context.currentUser,
      selectedDate: context.selectedDate,
      activeTab: context.activeTab,
      selectedTurma: context.selectedTurma,
      activeTurmas: context.activeTurmas,
      schedules: context.schedules,
    });

  const serializedHistory = sanitizeHistoryForTransport(history);
  const pendingToolTurns: SofiaToolExecutionStep[] = [];
  const executedToolResults: SofiaToolResult[] = [];
  const scopedContext: SofiaToolExecutionContext = {
    ...context,
    executedDownloadKeys: context.executedDownloadKeys || new Set<string>(),
  };
  let firstToolCall: SofiaToolCall | undefined;
  let lastModelUsed: string = SOFIA_DEFAULT_MODEL;
  let anyFallbackUsed = false;

  try {
    let modelText = '';

    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const data = await postSofiaChatWithRetry(
        {
          message,
          history: serializedHistory,
          pendingToolTurns,
          appState,
        },
        apiBaseUrl,
        scopedContext.users,
        authHeaders
      );

      if (data?.model) lastModelUsed = String(data.model);
      if (data?.fallbackUsed) anyFallbackUsed = true;

      if (data.hasFunctionCall && Array.isArray(data.toolCalls) && data.toolCalls.length > 0) {
        const stepCalls: SofiaToolCall[] = [];
        const stepResults: SofiaToolExecutionStep['results'] = [];

        for (const rawCall of data.toolCalls) {
          const call: SofiaToolCall = {
            id: rawCall.id,
            name: rawCall.name,
            args: rawCall.args || {},
          };
          if (!firstToolCall) firstToolCall = call;
          stepCalls.push(call);

          if (onToolExecuting) {
            onToolExecuting(call.name);
          }

          const toolResult = await executeToolWithPolicy(call, scopedContext);
          executedToolResults.push(toolResult);

          stepResults.push({
            id: call.id,
            name: call.name,
            response: formatToolResultForModel(toolResult, !isReadOnlySofiaTool(call.name)),
          });
        }

        pendingToolTurns.push({
          rawModelContent: data.rawModelContent,
          calls: stepCalls,
          results: stepResults,
        });

        continue;
      }

      modelText = String(data.text || '').trim();
      break;
    }

    // Se atingiu o limite de 4 passos chamando ferramentas e ainda não tem texto final, força a resposta final com base nos functionResponse coletados
    if (!modelText && pendingToolTurns.length > 0) {
      const wrapUpData = await postSofiaChatWithRetry(
        {
          message,
          history: serializedHistory,
          pendingToolTurns,
          appState,
          forceFinalAnswer: true,
        },
        apiBaseUrl,
        scopedContext.users,
        authHeaders
      );
      if (wrapUpData?.model) lastModelUsed = String(wrapUpData.model);
      if (wrapUpData?.fallbackUsed) anyFallbackUsed = true;
      modelText = String(wrapUpData.text || '').trim();
    }

    // Trava anti-repetição: se a nova resposta for idêntica à resposta anterior da Sofia, refaz a chamada pedindo foco explícito no último pedido
    const prevSofiaMsg = [...(history || [])]
      .reverse()
      .find((h) => h && h.sender === 'sofia' && h.id !== 'welcome' && h.text?.trim());

    if (
      prevSofiaMsg &&
      modelText &&
      normalizeForRepetition(modelText) === normalizeForRepetition(prevSofiaMsg.text)
    ) {
      try {
        const retryAntiRepetition = await postSofiaChatWithRetry(
          {
            message,
            history: serializedHistory,
            pendingToolTurns,
            appState,
            forceFinalAnswer: true,
            antiRepetitionNote: `Sua resposta anterior no chat foi exatamente: "${prevSofiaMsg.text}". Agora o usuário enviou um NOVO pedido ("${message}"). NÃO repita o texto anterior; responda especificamente a este último pedido com os dados encontrados.`,
          },
          apiBaseUrl,
          scopedContext.users,
          authHeaders
        );
        if (retryAntiRepetition?.model) lastModelUsed = String(retryAntiRepetition.model);
        if (retryAntiRepetition?.fallbackUsed) anyFallbackUsed = true;
        if (retryAntiRepetition?.text?.trim()) {
          modelText = String(retryAntiRepetition.text).trim();
        }
      } catch (antiRepErr) {
        console.error('[Sofia Service] Falha no retry anti-repetição:', antiRepErr);
      }
    }

    if (!modelText) {
      modelText = 'Conferi os dados aqui, mas não ficou claro o que você precisa agora. Pode me dizer de outro jeito?';
    }

    const lastResult = executedToolResults.length > 0
      ? executedToolResults[executedToolResults.length - 1]
      : undefined;

    return {
      text: modelText,
      model: lastModelUsed,
      fallbackUsed: anyFallbackUsed,
      toolCall: firstToolCall,
      toolResult: lastResult,
      toolResults: executedToolResults,
      toolTurns: pendingToolTurns,
    };
  } catch (err: any) {
    console.error('[Sofia Service] Erro ao processar conversa com a Sofia:', err);
    if (err?.status === 401 || err?.status === 403) {
      return {
        text: 'Sua sessão administrativa precisa ser confirmada novamente. Saia e entre de novo com seu e-mail e senha para usar a Sofia.',
        model: err?.model || lastModelUsed,
        toolCall: firstToolCall,
        toolResult: executedToolResults[executedToolResults.length - 1],
        toolResults: executedToolResults,
        toolTurns: pendingToolTurns,
        error: 'sessao_nao_autorizada',
        errorCode: err?.status,
      };
    }

    const isAdminNotifiedError =
      err?.status === 402 ||
      err?.status === 429 ||
      err?.status === 404 ||
      err?.status === 503 ||
      Boolean(err?.quotaDepleted) ||
      Boolean(err?.rateLimited) ||
      Boolean(err?.modelNotFound);

    return {
      text: isAdminNotifiedError
        ? 'Estou com uma instabilidade aqui e não consigo responder agora. Já avisei a administração. Tente de novo em alguns minutos.'
        : 'Estou com uma instabilidade aqui agora e não consegui concluir. Pode tentar de novo em alguns instantes?',
      model: err?.model || lastModelUsed,
      fallbackUsed: Boolean(err?.fallbackAttempted) || anyFallbackUsed,
      toolCall: firstToolCall,
      toolResult: executedToolResults[executedToolResults.length - 1],
      toolResults: executedToolResults,
      toolTurns: pendingToolTurns,
      error: err?.message || 'Erro de comunicação',
      errorCode: typeof err?.status === 'number' ? err.status : undefined,
    };
  }
}
