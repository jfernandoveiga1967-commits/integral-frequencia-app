/**
 * sofiaService.ts
 * Orquestrador da Assistente Sofia (Colégio Crescer).
 * Envia contexto ao vivo da escola, executa ações no sistema e mantém fallback local natural.
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
} from '../types';
import {
  formatDateBR,
  getDayOfWeekFromDate,
  isStudentActiveOnDate,
  isStudentScheduledForDate,
  toISODateString,
} from '../utils/dateUtils';
import { getCurrentActivityForTurma, extractSlotLimits } from '../utils/timeUtils';
import { loadMonthlyMenu } from '../utils/cardapioStorage';
import { isAdmin } from '../utils/authUtils';
import { formatHourPTBR, getDayOfWeekFullPTBR, SOFIA_CORE_TRAINING_PROMPT } from '../utils/sofiaPromptBuilder';
import {
  executeSofiaTool,
  SofiaToolExecutionContext,
  findTurmaFuzzy,
} from './sofiaTools';

export const SOFIA_SYSTEM_INSTRUCTION = SOFIA_CORE_TRAINING_PROMPT;

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

  return { targetDate: toISODateString(ref), isHistorical: false, label: 'hoje' };
}

/**
 * Constrói o resumo do estado global em tempo real da escola
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
  const dateStr = params.selectedDate || toISODateString(now);
  const dayOfWeek = getDayOfWeekFromDate(dateStr);
  const dayOfWeekFull = getDayOfWeekFullPTBR(dateStr);
  const formattedDate = formatDateBR(dateStr);
  const currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const activeStudents = (params.students || []).filter((s) =>
    isStudentActiveOnDate(s, dateStr)
  );
  const expectedStudents = activeStudents.filter((s) =>
    isStudentScheduledForDate(s, dateStr)
  );

  const todayRecords = (params.records || []).filter((r) => r.date === dateStr);
  const presentes = todayRecords.filter(
    (r) => r.status === 'presente' || r.status === 'sem_equipamento' || r.status === 'saida_antecipada'
  ).length;
  const faltas = todayRecords.filter((r) => r.status === 'falta').length;

  const turmasList = params.activeTurmas && params.activeTurmas.length > 0
    ? params.activeTurmas
    : ['Mini Maternal Azul', 'Maternal Azul', '1º Ano Azul', '1º Ano Laranja', '2º Ano Azul', '3º Ano', '4º Ano', '5º Ano'];

  const turmasComLancamento = new Set(todayRecords.map((r) => r.turma));
  const turmasPendentes = turmasList.filter((t) => {
    const hasExpected = expectedStudents.some((s) => s.turma === t);
    return hasExpected && !turmasComLancamento.has(t);
  });

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
    activeTab: params.activeTab,
    selectedTurma: params.selectedTurma,
    totalAlunosAtivos: activeStudents.length,
    totalPresentesHoje: presentes,
    totalFaltasHoje: faltas,
    totalAlunosEsperadosHoje: expectedStudents.length,
    totalChamadasPendentesBlocoAtual: turmasPendentes.length,
    turmasComChamadaPendenteHoje: turmasPendentes,
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

function cleanText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Tenta detectar qual turma foi citada na mensagem atual ou no histórico recente.
 */
function detectTurmaFromQueryOrHistory(
  userQuery: string,
  history: SofiaChatMessage[],
  context: SofiaToolExecutionContext
): string | undefined {
  const turmas = context.activeTurmas && context.activeTurmas.length > 0
    ? context.activeTurmas
    : Array.from(new Set((context.students || []).map((s) => s.turma).filter(Boolean)));

  const direct = findTurmaFuzzy(turmas, userQuery);
  if (direct) return direct;

  for (let i = history.length - 1; i >= Math.max(0, history.length - 4); i--) {
    const hText = history[i]?.text || '';
    const fromHist = findTurmaFuzzy(turmas, hText);
    if (fromHist) return fromHist;
  }

  return context.selectedTurma;
}

/**
 * Motor local heurístico de intenções alinhado ao treinamento da Sofia
 */
async function resolveLocalSofiaIntent(
  userQuery: string,
  history: SofiaChatMessage[],
  context: SofiaToolExecutionContext
): Promise<{ text: string; toolCall?: SofiaToolCall; toolResult?: SofiaToolResult }> {
  const q = cleanText(userQuery);
  const currentDate = context.selectedDate || toISODateString(new Date());
  const contextualTurma = detectTurmaFromQueryOrHistory(userQuery, history, context);

  // 1. Saída antecipada rápida ("O Pedro vai sair 16h", "o João do infantil 1 vai sair mais cedo")
  const timeExtract = userQuery.match(/\b(\d{1,2})[:hH](\d{2})?\b/);
  const isEarlyDeparture =
    (q.includes('vai sair') || q.includes('sair mais cedo') || q.includes('saida antecipada')) &&
    !q.includes('quem') &&
    !q.includes('quais') &&
    !q.includes('quantos') &&
    !q.includes('termo') &&
    !q.includes('pdf');

  if (isEarlyDeparture) {
    const horario = timeExtract
      ? `${timeExtract[1].padStart(2, '0')}:${(timeExtract[2] || '00').padStart(2, '0')}`
      : new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Tenta localizar nome citado na frase
    let candidateName = '';
    for (const s of context.students || []) {
      const sClean = cleanText(s.name);
      const first = sClean.split(' ')[0];
      if (sClean && q.includes(sClean)) {
        candidateName = s.name;
        break;
      }
      if (first.length >= 3 && new RegExp(`\\b${first}\\b`, 'i').test(q)) {
        candidateName = first;
        break;
      }
    }
    if (!candidateName) {
      const m = userQuery.match(/(?:o|a|aluno|aluna)\s+([A-Za-zÀ-ú]{3,}(?:\s+[A-Za-zÀ-ú]{2,})?)/i);
      if (m) candidateName = m[1].trim();
    }

    const toolCall: SofiaToolCall = {
      name: 'registrarSaidaAntecipada',
      args: {
        alunoId: candidateName || '',
        turma: findTurmaFuzzy(context.activeTurmas || [], userQuery),
        horario,
      },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 2. Termo de Saída Avulsa / Liberação de Balcão
  if (
    q.includes('termo de saida') ||
    q.includes('termo de liberacao') ||
    q.includes('saida avulsa') ||
    q.includes('retirado por') ||
    q.includes('retirada por')
  ) {
    let studentName = '';
    for (const s of context.students || []) {
      if (q.includes(cleanText(s.name))) {
        studentName = s.name;
        break;
      }
      const parts = cleanText(s.name).split(' ');
      if (parts.length >= 2 && q.includes(parts[0]) && q.includes(parts[1])) {
        studentName = s.name;
        break;
      }
    }

    const matchRetirante = userQuery.match(/retirad[oa]\s+por\s+([A-Za-zÀ-ú\s]+?)(?:(?:com\s+)?(?:rg|cpf|doc)|parentesco|as|às|\.|$)/i);
    const nomeRetirante = matchRetirante ? matchRetirante[1].trim() : 'Responsável Autorizado';
    const matchDoc = userQuery.match(/(?:rg|cpf|doc(?:umento)?)\s*[:=]?\s*([0-9A-Za-z\.\-\/\s]+?)(?:parentesco|as|às|\.|$)/i);
    const docDigits = matchDoc ? matchDoc[1].trim() : 'Informado na portaria';
    const horarioMatch = userQuery.match(/(\d{1,2}[:hH]\d{2})/);
    const horarioSaida = horarioMatch
      ? horarioMatch[1].replace(/[hH]/, ':')
      : new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const toolCall: SofiaToolCall = {
      name: 'gerarTermoSaidaAvulsa',
      args: {
        alunoId: studentName || userQuery,
        nomeRetirante,
        documentoRetirante: docDigits,
        horarioSaida,
      },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 3. Atividades do Momento ("maternal azul tá na natação?", "o que tá acontecendo agora?", "quem está na piscina?")
  if (
    q.includes('agora') ||
    q.includes('momento') ||
    q.includes('fazendo') ||
    q.includes('natacao') ||
    q.includes('piscina') ||
    q.includes('bale') ||
    q.includes('judo') ||
    q.includes('futebol') ||
    q.includes('ginastica') ||
    q.includes('flauta') ||
    q.includes('sem atividade') ||
    q.includes('simular') ||
    (q.includes('ta na') || q.includes('esta na') || q.includes('ta em'))
  ) {
    const turmaHit = findTurmaFuzzy(context.activeTurmas || [], userQuery);
    const simTime = (q.includes('simular') || q.includes('as ')) && timeExtract
      ? `${timeExtract[1].padStart(2, '0')}:${(timeExtract[2] || '00').padStart(2, '0')}`
      : undefined;

    const toolCall: SofiaToolCall = {
      name: 'consultarAtividadesMomento',
      args: {
        turma: turmaHit,
        horarioSimulado: simTime,
      },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 4. Cardápio / Almoço / Lanche / Alergia
  if (
    q.includes('cardapio') ||
    q.includes('almoco') ||
    q.includes('lanche') ||
    q.includes('comida') ||
    q.includes('refeicao') ||
    q.includes('sobremesa') ||
    q.includes('alergi')
  ) {
    const dataArg = q.includes('amanha') ? 'amanha' : currentDate;
    const toolCall: SofiaToolCall = {
      name: 'consultarCardapio',
      args: {
        data: dataArg,
        turma: findTurmaFuzzy(context.activeTurmas || [], userQuery),
      },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 5. Semanário
  if (q.includes('semanario') || q.includes('planejamento')) {
    const toolCall: SofiaToolCall = {
      name: 'consultarSemanario',
      args: {
        turma: findTurmaFuzzy(context.activeTurmas || [], userQuery),
        data: currentDate,
      },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 6. Quadro de Atribuições ("quem é a monitora", "atribuições", "adi do maternal")
  if (
    q.includes('atribuic') ||
    q.includes('monitora') ||
    q.includes('adi') ||
    q.includes('responsavel pela turma') ||
    q.includes('quem cuida')
  ) {
    const toolCall: SofiaToolCall = {
      name: 'consultarQuadroAtribuicoes',
      args: {
        turma: findTurmaFuzzy(context.activeTurmas || [], userQuery),
      },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 7. Espelho de Ponto PDF ou Consulta do Livro Ponto
  if (q.includes('espelho') || q.includes('folha de ponto') || (q.includes('ponto') && q.includes('pdf'))) {
    const mesAnoMatch = userQuery.match(/(\d{1,2})[\/\-](\d{4})/);
    const now = new Date();
    const mesAno = mesAnoMatch
      ? `${mesAnoMatch[1].padStart(2, '0')}/${mesAnoMatch[2]}`
      : `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    const targetColab = context.currentUser?.name || '';

    const toolCall: SofiaToolCall = {
      name: 'gerarEspelhoPontoPDF',
      args: { colaboradorId: targetColab, mesAno },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  if (q.includes('livro ponto') || q.includes('bater ponto') || q.includes('batida') || q.includes('ponto')) {
    if (q.includes('nao to entendendo') || q.includes('como') || q.includes('ajuda') || q.includes('lanca')) {
      return {
        text: 'Calma, é rapidinho! Quer que eu abra o Livro Ponto para você ou já te mostre os registros de hoje? Se quiser lançar, me diz o nome e o horário.',
      };
    }
    const toolCall: SofiaToolCall = {
      name: 'consultarLivroPonto',
      args: { data: currentDate },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 8. Pendências de chamada / Diagnóstico rápido
  if (q.includes('pendente') || q.includes('pendencia') || q.includes('falta fazer chamada') || q.includes('tudo em dia')) {
    const toolCall: SofiaToolCall = { name: 'analisarDesarranjosDoDia', args: {} };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 9. Consultas de Saída (Van, Saídas Antecipadas)
  if (q.includes('van') || q.includes('transporte') || q.includes('liberado') || q.includes('saida antecipada')) {
    const tipo: 'van' | 'antecipada' | 'geral' = q.includes('van') || q.includes('transporte')
      ? 'van'
      : q.includes('antecipada')
      ? 'antecipada'
      : 'geral';
    const toolCall: SofiaToolCall = {
      name: 'consultarAlertasSaidaHoje',
      args: { tipo, detalhesVan: true },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 10. Frequência histórica vs Frequência de hoje
  const temporal = extractDateFromTemporalQuery(userQuery, currentDate);
  const isAttendanceQuery =
    q.includes('falta') ||
    q.includes('faltou') ||
    q.includes('faltaram') ||
    q.includes('presente') ||
    q.includes('presenca') ||
    q.includes('frequencia') ||
    q.includes('chamada') ||
    q.includes('vieram') ||
    q.includes('ausente');

  if (temporal.isHistorical && isAttendanceQuery) {
    const toolCall: SofiaToolCall = {
      name: 'obterResumoFrequenciaPorData',
      args: { data: temporal.targetDate },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  if (isAttendanceQuery || q.includes('lista de hoje') || q.includes('resumo')) {
    const toolCall: SofiaToolCall = {
      name: 'consultarFrequenciaHoje',
      args: {
        turma: findTurmaFuzzy(context.activeTurmas || [], userQuery) || (q.includes('turma') ? contextualTurma : undefined),
        listarNomes: q.includes('quem') || q.includes('nomes') || q.includes('faltou'),
      },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 11. Manual / Normas
  if (q.includes('norma') || q.includes('regra') || q.includes('manual') || q.includes('celular') || q.includes('acidente')) {
    const toolCall: SofiaToolCall = {
      name: 'consultarManualNormas',
      args: { termoOuTema: userQuery },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 12. Busca de aluno / turma
  if (q.includes('aluno') || q.includes('turma') || q.includes('quantos') || findTurmaFuzzy(context.activeTurmas || [], userQuery)) {
    const toolCall: SofiaToolCall = {
      name: 'consultarAlunosOuTurma',
      args: {
        turma: findTurmaFuzzy(context.activeTurmas || [], userQuery),
      },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // Resposta padrão humana e acolhedora
  return {
    text: 'Oi! Posso ver quem está em atividade agora, consultar a chamada ou faltas, registrar saída antecipada, checar o cardápio ou tirar dúvida do Manual. O que você precisa resolver?',
  };
}

async function fetchSofiaChatWithRetry(body: Record<string, any>): Promise<Response> {
  let lastError: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('/api/sofia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return res;
      if (res.status >= 500 && attempt === 0) continue;
      return res;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Falha de comunicação');
}

/**
 * Função Principal de Envio e Resolução Conversacional com a Sofia
 */
export async function sendSofiaMessage(params: {
  message: string;
  history: SofiaChatMessage[];
  context: SofiaToolExecutionContext;
  onToolExecuting?: (toolName: string) => void;
}): Promise<{
  text: string;
  toolCall?: SofiaToolCall;
  toolResult?: SofiaToolResult;
}> {
  const { message, history, context, onToolExecuting } = params;
  const appState = context.appState || buildLiveAppStateSummary({
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

  try {
    const res = await fetchSofiaChatWithRetry({
      message,
      history,
      appState,
    });

    if (res.ok) {
      const data = await res.json();

      if (data.hasFunctionCall && data.toolCall) {
        const toolCall: SofiaToolCall = {
          name: data.toolCall.name,
          args: data.toolCall.args || {},
        };

        if (onToolExecuting) {
          onToolExecuting(toolCall.name);
        }

        // Executa a ferramenta no ambiente da aplicação (com 1 tentativa automática em falha transitória)
        let toolResult: SofiaToolResult;
        try {
          toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
        } catch {
          toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
        }

        // Envia resultado de volta para a Sofia sintetizar em linguagem natural e acolhedora
        try {
          const followUpRes = await fetchSofiaChatWithRetry({
            message,
            history,
            toolResult,
            toolCall,
            appState,
          });

          if (followUpRes.ok) {
            const followUpData = await followUpRes.json();
            if (followUpData.success && followUpData.text) {
              return {
                text: followUpData.text,
                toolCall,
                toolResult,
              };
            }
          }
        } catch {
          // Usa mensagem natural já preparada pela própria execução se follow-up falhar
        }

        return {
          text: toolResult.message,
          toolCall,
          toolResult,
        };
      }

      if (data.success && data.text) {
        return {
          text: data.text,
        };
      }
    }
  } catch (err) {
    console.warn('[Sofia Service] Alternando para processamento local:', err);
  }

  return await resolveLocalSofiaIntent(message, history, context);
}
