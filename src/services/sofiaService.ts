/**
 * sofiaService.ts
 * Orquestrador do Agente de IA Autônomo e Resolutivo Sofia (Colégio Crescer).
 * Gerencia a comunicação conversacional em linguagem natural, injeção de RAG Local (AppStateSummary)
 * e o ciclo multi-turn de Gemini Function Calling com fallback autônomo local.
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
import { formatDateBR, getDayOfWeekFromDate, toISODateString } from '../utils/dateUtils';
import { executeSofiaTool, SofiaToolExecutionContext } from './sofiaTools';
import { NORMAS_DATA } from '../data/normasData';

export const SOFIA_SYSTEM_INSTRUCTION = `Você é a Sofia, a Assistente Inteligente Oficial do Programa Integral do Colégio Crescer. Você possui conhecimento total da estrutura pedagógica, rotinas de ponto, chamadas de frequência, normas internas, cardápio e gestão de turmas. Seu tom de voz é profissional, acolhedor, resolutivo e seguro. Você não é um bot rígido de menus: você conversa de forma natural, analisa a situação atual da escola, identifica inconsistências proativamente e executa ações diretas no sistema quando solicitada.

PERMISSÕES E CAPACIDADE ADMINISTRATIVA PLENA:
Você possui permissões administrativas totais para criar alunos, cadastrar usuários, lançar chamadas, alterar cardápios e gerar qualquer PDF do sistema. Quando o usuário pedir para cadastrar, editar ou lançar qualquer dado, invoque a ferramenta correspondente imediatamente e confirme a execução com os detalhes do registro efetuado.

REGRAS DE TEMPO E CONSULTAS HISTÓRICAS:
- Interprete com precisão termos temporais como "ontem", "anteontem", "dia anterior", "semana passada" ou datas numéricas específicas no texto do usuário.
- REGRA OBRIGATÓRIA: Quando o usuário perguntar sobre faltas, presenças ou relatórios de frequência de um dia anterior ou data específica (ex: "quem faltou ontem?", "quantas faltas tivemos ontem?", "como foi a chamada do dia 28?"), você DEVE invocar obrigatoriamente a ferramenta "obterResumoFrequenciaPorData" passando a data calculada (ex: data de ontem) em vez de retornar o diagnóstico em tempo real do momento atual.`;

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

  // Regex para data ISO (YYYY-MM-DD)
  const isoMatch = rawQuery.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return { targetDate: isoMatch[0], isHistorical: true, label: isoMatch[0] };
  }

  // Regex para data BR (DD/MM/YYYY ou DD/MM)
  const brMatch = rawQuery.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (brMatch) {
    const d = brMatch[1].padStart(2, '0');
    const m = brMatch[2].padStart(2, '0');
    const y = brMatch[3] || String(ref.getFullYear());
    return { targetDate: `${y}-${m}-${d}`, isHistorical: true, label: `${d}/${m}/${y}` };
  }

  // Regex para "dia 28", "dia 28 de outubro", etc.
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
 * Constrói o resumo do estado global em tempo real da aplicação (RAG Local)
 */
export function buildLiveAppStateSummary(params: {
  students: Student[];
  records: AttendanceRecord[];
  pontoRecords?: PontoRecord[];
  currentUser?: UserProfile | null;
  selectedDate: string;
  activeTurmas?: string[];
  schedules?: ScheduleBlock[];
}): AppStateSummary {
  const now = new Date();
  const dateStr = params.selectedDate || toISODateString(now);
  const dayOfWeek = getDayOfWeekFromDate(dateStr);
  const formattedDate = formatDateBR(dateStr);
  const currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const activeStudents = (params.students || []).filter(
    (s) => (s.status || s.statusMatricula || 'ativo') === 'ativo'
  );

  const todayRecords = (params.records || []).filter((r) => r.date === dateStr);
  const presentes = todayRecords.filter((r) => r.status === 'presente').length;
  const faltas = todayRecords.filter((r) => r.status === 'falta').length;

  const turmasList = params.activeTurmas && params.activeTurmas.length > 0
    ? params.activeTurmas
    : ['Mini Maternal', 'Maternal', '1º Ano Azul', '1º Ano Laranja', '2º Ano', '3º Ano', '4º Ano', '5º Ano'];

  const turmasComLancamento = new Set(todayRecords.map((r) => r.turma));
  const turmasPendentes = turmasList.filter((t) => !turmasComLancamento.has(t));

  return {
    currentTime,
    currentDate: dateStr,
    dayOfWeek,
    formattedDate,
    totalAlunosAtivos: activeStudents.length,
    totalPresentesHoje: presentes,
    totalFaltasHoje: faltas,
    totalAlunosEsperadosHoje: activeStudents.length,
    totalChamadasPendentesBlocoAtual: turmasPendentes.length,
    turmasComChamadaPendenteHoje: turmasPendentes,
    currentUser: {
      id: params.currentUser?.id,
      name: params.currentUser?.name || 'Administrador',
      email: params.currentUser?.email || 'admin@crescercampinas.com.br',
      role: params.currentUser?.role || 'coordenador',
      cargoLabel: params.currentUser?.cargoLabel || 'Coordenador(a)',
      isAdmin: true,
    },
  };
}

/**
 * Normalizador de texto para matching semântico e local
 */
function cleanText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Motor local heurístico de intenções com suporte a Function Calling para contingência
 */
async function resolveLocalSofiaIntent(
  userQuery: string,
  context: SofiaToolExecutionContext
): Promise<{ text: string; toolCall?: SofiaToolCall; toolResult?: SofiaToolResult }> {
  const q = cleanText(userQuery);
  const currentDate = context.selectedDate || toISODateString(new Date());

  // 1. Intenção: Espelho de Ponto
  if (
    q.includes('espelho') ||
    q.includes('folha de ponto') ||
    (q.includes('ponto') && (q.includes('pdf') || q.includes('gerar') || q.includes('baixar') || q.includes('imprimir')))
  ) {
    // Tenta extrair colaborador
    let targetColab = 'Danyel';
    if (q.includes('thais') || q.includes('thaís')) targetColab = 'Thaís Grisoni';
    else if (q.includes('danyel')) targetColab = 'Danyel Pereira';
    else if (q.includes('amanda')) targetColab = 'Amanda';
    else if (context.currentUser?.name) targetColab = context.currentUser.name;

    // Tenta extrair mês/ano
    let mesAno = '09/2026';
    const mesAnoMatch = userQuery.match(/(\d{1,2})[\/\-](\d{4})/);
    if (mesAnoMatch) {
      mesAno = `${mesAnoMatch[1].padStart(2, '0')}/${mesAnoMatch[2]}`;
    }

    const toolCall: SofiaToolCall = {
      name: 'gerarEspelhoPontoPDF',
      args: { colaboradorId: targetColab, mesAno },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);

    return {
      text: toolResult.success
        ? `Prontinho! Gere o Espelho de Ponto de ${targetColab} (${mesAno}). Você pode clicar no botão abaixo para baixá-lo imediatamente.`
        : `Tentei gerar o espelho de ponto, mas: ${toolResult.message}`,
      toolCall,
      toolResult,
    };
  }

  // 2. Intenção: Autorização de Entrada ou Saída Antecipada
  if (
    q.includes('autorizacao') ||
    q.includes('atraso') ||
    q.includes('saida antecipada') ||
    q.includes('liberacao de portaria') ||
    q.includes('portaria')
  ) {
    const isSaida = q.includes('saida') || q.includes('sair mais cedo') || q.includes('antecipada');
    const motivo = isSaida ? 'saida_antecipada' : 'atraso';

    // Localiza aluno mencionado
    let student = context.students[0];
    for (const s of context.students) {
      if (q.includes(cleanText(s.name))) {
        student = s;
        break;
      }
    }

    const horarioMatch = userQuery.match(/(\d{1,2}:\d{2})/);
    const horario = horarioMatch ? horarioMatch[1] : new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const toolCall: SofiaToolCall = {
      name: 'gerarAutorizacaoEntradaSaidaPDF',
      args: {
        alunoId: student?.name || 'Aluno',
        motivo,
        horario,
        justificativa: 'Solicitação registrada via Assistente Sofia',
      },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);

    return {
      text: toolResult.success
        ? `Gerei o documento oficial de ${motivo === 'atraso' ? 'Entrada com Atraso' : 'Saída Antecipada'} do(a) aluno(a) ${student?.name || 'Aluno'}. O arquivo PDF já está disponível para download e protocolo!`
        : `Não foi possível gerar a autorização: ${toolResult.message}`,
      toolCall,
      toolResult,
    };
  }

  // 3. Intenção: Registrar Falta
  if (
    q.includes('registrar falta') ||
    q.includes('marcar falta') ||
    q.includes('lancar falta') ||
    (q.includes('faltou') && !q.includes('quem'))
  ) {
    let student = context.students[0];
    for (const s of context.students) {
      if (q.includes(cleanText(s.name))) {
        student = s;
        break;
      }
    }

    const toolCall: SofiaToolCall = {
      name: 'registrarFaltaFrequencia',
      args: {
        alunoId: student?.name || 'Aluno',
        data: currentDate,
        justificativa: 'Falta informada pela coordenação',
      },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);

    return {
      text: toolResult.success
        ? `Falta do(a) aluno(a) ${student?.name} devidamente registrada e computada na frequência de hoje.`
        : `Erro ao registrar falta: ${toolResult.message}`,
      toolCall,
      toolResult,
    };
  }

  // 4. Intenção: Disparar Alerta WhatsApp
  if (q.includes('whatsapp') || q.includes('alerta') || q.includes('notificar') || q.includes('aviso')) {
    const toolCall: SofiaToolCall = {
      name: 'dispararAlertaWhatsApp',
      args: {
        destinatario: 'Coordenação do Integral',
        mensagem: `Comunicado Importante do Colégio Crescer: ${userQuery}`,
      },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);

    return {
      text: 'O alerta foi estruturado com sucesso. Você pode abrir e enviar a mensagem diretamente pelo WhatsApp através do botão abaixo.',
      toolCall,
      toolResult,
    };
  }

  // 5. Intenção: Consulta Histórica de Frequência por Data (Ontem, Anteontem, Dia Específico)
  const temporal = extractDateFromTemporalQuery(userQuery, currentDate);
  const isAttendanceQuery =
    q.includes('falta') ||
    q.includes('faltaram') ||
    q.includes('faltou') ||
    q.includes('presente') ||
    q.includes('presenca') ||
    q.includes('frequencia') ||
    q.includes('chamada') ||
    q.includes('ausente') ||
    q.includes('ausentes') ||
    q.includes('resumo') ||
    q.includes('relatorio') ||
    q.includes('como foi') ||
    q.includes('quem');

  if (
    (temporal.isHistorical && isAttendanceQuery) ||
    (temporal.isHistorical && !q.includes('ponto') && !q.includes('espelho') && !q.includes('autorizacao')) ||
    q.includes('frequencia de') ||
    q.includes('chamada de') ||
    q.includes('faltas de')
  ) {
    const toolCall: SofiaToolCall = {
      name: 'obterResumoFrequenciaPorData',
      args: {
        data: temporal.targetDate,
      },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);

    return {
      text: toolResult.message,
      toolCall,
      toolResult,
    };
  }

  // 6. Intenção: Análise de Desarranjos / Diagnóstico Geral do Momento Atual
  if (
    q.includes('desarranjo') ||
    q.includes('diagnostico') ||
    q.includes('analisar') ||
    q.includes('como esta') ||
    q.includes('status do dia') ||
    q.includes('resumo') ||
    q.includes('situacao')
  ) {
    const toolCall: SofiaToolCall = {
      name: 'analisarDesarranjosDoDia',
      args: {},
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);

    return {
      text: toolResult.message,
      toolCall,
      toolResult,
    };
  }

  // 6. Intenção: Cadastrar Aluno
  if (q.includes('cadastrar aluno') || q.includes('adicionar aluno') || q.includes('novo aluno') || q.includes('matricular aluno')) {
    const nomeMatch = userQuery.match(/(?:aluno|nome)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
    const turmaMatch = userQuery.match(/(?:turma)\s+([A-Za-z0-9ºª\s]+?)(?:,|$|\.|\bcom\b|\bresp\b)/i);
    const respMatch = userQuery.match(/(?:responsavel|mae|pai)\s+([A-ZÀ-Úa-zà-ú\s]+?)(?:,|$|\.|\btel\b)/i);
    const telMatch = userQuery.match(/(?:telefone|tel|cel|whatsapp)\s+([0-9\(\)\-\s]+)/i);

    const nome = nomeMatch ? nomeMatch[1].trim() : 'Novo Aluno';
    const turmaId = turmaMatch ? turmaMatch[1].trim() : (context.selectedTurma || '1º Ano Azul');
    const responsavel = respMatch ? respMatch[1].trim() : 'Coordenação';
    const telefone = telMatch ? telMatch[1].trim() : '19999999999';

    const toolCall: SofiaToolCall = {
      name: 'cadastrarAluno',
      args: { nome, turmaId, responsavel, telefone },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 7. Intenção: Editar Aluno
  if (q.includes('editar aluno') || q.includes('atualizar aluno') || q.includes('alterar aluno')) {
    let student = context.students[0];
    for (const s of context.students) {
      if (q.includes(cleanText(s.name))) {
        student = s;
        break;
      }
    }
    const toolCall: SofiaToolCall = {
      name: 'editarAluno',
      args: {
        alunoId: student?.id || student?.name || 'aluno',
        dadosAtualizados: { notes: `Atualizado por comando da Sofia em ${new Date().toLocaleDateString('pt-BR')}` },
      },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 8. Intenção: Cadastrar Usuário / Colaborador
  if (
    q.includes('cadastrar usuario') ||
    q.includes('novo usuario') ||
    q.includes('cadastrar monitor') ||
    q.includes('novo monitor') ||
    q.includes('novo colaborador')
  ) {
    const nomeMatch = userQuery.match(/(?:nome|usuario|monitor|colaborador)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
    const emailMatch = userQuery.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
    const perfil = q.includes('admin') || q.includes('coord') ? 'ADMIN' : q.includes('adi') || q.includes('apoio') ? 'ADI' : 'MONITOR';

    const nome = nomeMatch ? nomeMatch[1].trim() : 'Novo Colaborador';
    const email = emailMatch ? emailMatch[1].trim() : `${cleanText(nome).replace(/\s+/g, '.')}@crescercampinas.com.br`;

    const toolCall: SofiaToolCall = {
      name: 'cadastrarUsuario',
      args: {
        nome,
        email,
        funcao: perfil === 'ADMIN' ? 'Coordenação' : perfil === 'ADI' ? 'Auxiliar de Desenvolvimento' : 'Monitor de Recreação',
        cargo: perfil === 'ADMIN' ? 'Coordenador(a)' : perfil === 'ADI' ? 'ADI / Apoio' : 'Monitor(a) de Alunos',
        perfil,
      },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 9. Intenção: Gerar Lista de Chamada em PDF
  if (
    (q.includes('lista') && q.includes('chamada') && (q.includes('pdf') || q.includes('gerar') || q.includes('imprimir') || q.includes('baixar'))) ||
    q.includes('lista nominal')
  ) {
    let targetTurma = context.selectedTurma || '1º Ano Azul';
    for (const t of context.activeTurmas || []) {
      if (q.includes(cleanText(t))) {
        targetTurma = t;
        break;
      }
    }
    const toolCall: SofiaToolCall = {
      name: 'gerarListaChamadaPDF',
      args: { turmaId: targetTurma },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 10. Intenção: Lançar Chamada da Turma
  if (q.includes('fazer chamada da turma') || q.includes('lancar chamada da turma') || q.includes('chamada da turma')) {
    let targetTurma = context.selectedTurma || '1º Ano Azul';
    for (const t of context.activeTurmas || []) {
      if (q.includes(cleanText(t))) {
        targetTurma = t;
        break;
      }
    }
    const toolCall: SofiaToolCall = {
      name: 'lancarFrequenciaTurma',
      args: { turmaId: targetTurma, data: currentDate, chamadas: [] },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 11. Intenção: Cadastrar Refeição no Cardápio
  if (
    q.includes('cardapio') &&
    (q.includes('cadastrar') || q.includes('lancar') || q.includes('adicionar') || q.includes('inserir') || q.includes('almoco') || q.includes('lanche'))
  ) {
    const isLanche = q.includes('lanche');
    const tipo = isLanche ? 'Lanche' : 'Almoço';
    const descMatch = userQuery.match(/(?:refeicao|almoco|lanche|cardapio|como|prato)\s*[:=]?\s*(.+)/i);
    const descricao = descMatch ? descMatch[1].trim() : 'Arroz, Feijão e Prato do Dia';

    const toolCall: SofiaToolCall = {
      name: 'cadastrarRefeicaoCardapio',
      args: { data: currentDate, tipo, descricao },
    };
    const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);
    return { text: toolResult.message, toolCall, toolResult };
  }

  // 12. Consulta a Normas Internas
  if (q.includes('norma') || q.includes('regra') || q.includes('manual') || q.includes('conduta')) {
    const match = NORMAS_DATA.find((n) =>
      q.includes(cleanText(n.title)) || cleanText(n.summary || '').includes(q)
    ) || NORMAS_DATA[0];

    return {
      text: `De acordo com as Normas Institucionais do Colégio Crescer (Seção ${match.sectionNumber} - ${match.title}):\n\n"${match.summary}"\n\nRecomendo sempre registrar qualquer desvio de conduta ou ajuste formal nos protocolos correspondentes.`,
    };
  }

  // Resposta padrão acolhedora e resolutiva
  return {
    text: `Olá! Como Assistente de Execução Plena com permissões administrativas totais do Programa Integral, posso cadastrar alunos, registrar colaboradores, lançar chamadas, alterar cardápios, emitir listas de chamada em PDF, gerar espelhos de ponto ou autorizações de portaria. O que você gostaria que eu realizasse agora?`,
  };
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
    activeTurmas: context.activeTurmas,
    schedules: context.schedules,
  });

  try {
    // 1. Tenta acionar a API de chat no servidor com Gemini
    const res = await fetch('/api/sofia/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history,
        appState,
      }),
    });

    if (res.ok) {
      const data = await res.json();

      // Se a IA decidiu chamar uma ferramenta
      if (data.hasFunctionCall && data.toolCall) {
        const toolCall: SofiaToolCall = {
          name: data.toolCall.name,
          args: data.toolCall.args || {},
        };

        if (onToolExecuting) {
          onToolExecuting(toolCall.name);
        }

        // Executa a ferramenta no ambiente da aplicação
        const toolResult = await executeSofiaTool(toolCall.name, toolCall.args, context);

        // Notifica o Gemini com o resultado para síntese conversacional natural
        try {
          const followUpRes = await fetch('/api/sofia/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toolResult,
              toolCall,
              appState,
            }),
          });

          if (followUpRes.ok) {
            const followUpData = await followUpRes.json();
            return {
              text: followUpData.text || toolResult.message,
              toolCall,
              toolResult,
            };
          }
        } catch {
          // Usa mensagem da própria ferramenta se follow-up falhar
        }

        return {
          text: toolResult.message,
          toolCall,
          toolResult,
        };
      }

      if (data.text) {
        return {
          text: data.text,
        };
      }
    }
  } catch (err) {
    console.warn('[Sofia Service] API remota inacessível, utilizando motor heurístico autônomo:', err);
  }

  // 2. Fallback Inteligente Local (Garante funcionamento autônomo ininterrupto)
  return await resolveLocalSofiaIntent(message, context);
}
