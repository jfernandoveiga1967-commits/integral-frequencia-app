/**
 * sofiaAgentService.ts
 * Serviço de Orquestração do Agente Inteligente Sofia • Colégio Crescer
 * Integração com Gemini API (temperatura 0.25), injeção de contexto em tempo real,
 * e execução estruturada de tarefas (Frequência, Ponto, Atividades, Feedbacks e Normas).
 */

import {
  Student,
  AttendanceRecord,
  UserProfile,
  ScheduleBlock,
  PontoRecord,
  ActivityType,
  SofiaActionType,
  SofiaActionPayload,
  SofiaResponsePayload,
} from '../types';
import { NORMAS_DATA } from '../data/normasData';
import { DEFAULT_SEPTEMBER_2026_MENU } from '../data/defaultCardapioData';
import { formatDateBR, getDayOfWeekFromDate, toISODateString } from '../utils/dateUtils';
import { isAdmin, getStoredUser, ADMIN_EMAIL } from '../utils/authUtils';
import {
  SofiaContextData,
  buildSofiaSystemPrompt,
  SOFIA_DEFAULT_TEMPERATURE,
  SOFIA_DEFAULT_MODEL,
} from '../utils/sofiaPromptBuilder';

export interface SofiaAgentContext {
  currentUser?: UserProfile | null;
  selectedDate: string;
  selectedTurma?: string;
  selectedActivity?: string;
  students: Student[];
  records: AttendanceRecord[];
  pontoRecords?: PontoRecord[];
  schedules?: ScheduleBlock[];
  activeTurmas?: string[];
  feedbacksCount?: number;
  feedbacksPendingCount?: number;
  onSaveRecord?: (record: Omit<AttendanceRecord, 'id' | 'createdAt'>) => Promise<void> | void;
  onNavigateTab?: (tab: any) => void;
  onSelectTurma?: (turma: any) => void;
  onSelectDate?: (date: string) => void;
  onOpenFeedbacks?: () => void;
}

export interface SofiaQueryInput {
  prompt: string;
  audioBlob?: Blob;
  audioBase64?: string;
  mimeType?: string;
}

// Normalização para correspondência de intenções locais
function normalizeText(s?: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Constrói os dados de contexto atualizados a partir do estado da aplicação
 */
export function buildCurrentAppContext(context: SofiaAgentContext): SofiaContextData {
  const now = new Date();
  const dateStr = context.selectedDate || toISODateString(now);
  const dayOfWeek = getDayOfWeekFromDate(dateStr);
  const formattedDate = `${dayOfWeek}, ${formatDateBR(dateStr)}`;
  const currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const activeStudents = (context.students || []).filter(
    (s) => (s.status || s.statusMatricula || 'ativo') === 'ativo'
  );

  const todayRecords = (context.records || []).filter((r) => r.date === dateStr);
  const presentes = todayRecords.filter((r) => r.status === 'presente').length;
  const faltas = todayRecords.filter((r) => r.status === 'falta').length;
  const pendencias = Math.max(0, activeStudents.length - todayRecords.length);

  return {
    currentUser: context.currentUser || getStoredUser(),
    currentDate: dateStr,
    formattedDate,
    currentTime,
    activeTurmas: context.activeTurmas && context.activeTurmas.length > 0
      ? context.activeTurmas
      : ['Mini Maternal', 'Maternal', '1º Ano Azul', '1º Ano Laranja', '2º Ano', '3º Ano', '4º Ano', '5º Ano'],
    selectedTurma: context.selectedTurma,
    selectedActivity: context.selectedActivity,
    summaryStats: {
      totalAlunos: activeStudents.length,
      presentes,
      faltas,
      pendenciasChamada: pendencias,
      feedbacksPendentes: context.feedbacksPendingCount ?? 0,
    },
  };
}

/**
 * Executa localmente as ações de chamada quando solicitadas (resumo do dia, faltas, presença)
 */
export async function executeAttendanceAction(
  args: {
    acao: 'resumo_dia' | 'buscar_faltas' | 'consultar_pendencias' | 'lancar_presenca' | 'lancar_falta';
    nomeAluno?: string;
    turma?: string;
    modalidade?: string;
  },
  context: SofiaAgentContext
): Promise<{ spokenText: string; displayText: string; action: SofiaActionPayload }> {
  const targetDate = context.selectedDate || toISODateString(new Date());
  const targetTurma = args.turma || context.selectedTurma || 'TODAS';
  const targetActivity = (args.modalidade || context.selectedActivity || 'Rotina') as ActivityType;

  const activeStudents = (context.students || []).filter(
    (s) => (s.status || s.statusMatricula || 'ativo') === 'ativo'
  );

  const turmaStudents = targetTurma === 'TODAS'
    ? activeStudents
    : activeStudents.filter((s) => s.turma === targetTurma);

  const recordsMap = new Map<string, AttendanceRecord>();
  (context.records || []).forEach((r) => {
    if (r && r.date === targetDate) {
      recordsMap.set(`${r.studentId}_${r.activity}_${r.date}`, r);
    }
  });

  // 1. Resumo do Dia
  if (args.acao === 'resumo_dia') {
    let presentes = 0;
    let faltas = 0;
    let pendentes = 0;

    turmaStudents.forEach((s) => {
      const rec = recordsMap.get(`${s.id}_${targetActivity}_${targetDate}`);
      if (!rec || !rec.status) {
        pendentes++;
      } else if (rec.status === 'presente') {
        presentes++;
      } else if (rec.status === 'falta') {
        faltas++;
      }
    });

    const spokenText = `Resumo de ${formatDateBR(targetDate)}: ${presentes} presentes, ${faltas} faltas e ${pendentes} pendências de chamada em ${targetTurma === 'TODAS' ? 'todas as turmas' : targetTurma}.`;
    const displayText = `📊 **Resumo da Frequência (${formatDateBR(targetDate)})**\n• Presentes: ${presentes}\n• Faltas: ${faltas}\n• Pendentes: ${pendentes}\n• Total de Alunos: ${turmaStudents.length}`;

    return {
      spokenText,
      displayText,
      action: {
        type: 'consultar_ou_lancar_chamada',
        title: 'Resumo da Chamada',
        details: `${presentes} presentes • ${faltas} faltas • ${pendentes} pendências`,
        badge: 'Frequência',
        targetTab: 'chamada',
        success: true,
      },
    };
  }

  // 2. Buscar Faltas
  if (args.acao === 'buscar_faltas') {
    const faltantes = turmaStudents.filter((s) => {
      const rec = recordsMap.get(`${s.id}_${targetActivity}_${targetDate}`);
      return rec?.status === 'falta';
    });

    if (faltantes.length === 0) {
      const spokenText = `Excelente notícia! Não há registro de faltas na data de ${formatDateBR(targetDate)} para ${targetTurma === 'TODAS' ? 'as turmas' : targetTurma}.`;
      return {
        spokenText,
        displayText: `✅ Nenhuma falta registrada em ${formatDateBR(targetDate)}.`,
        action: {
          type: 'consultar_ou_lancar_chamada',
          title: 'Consulta de Faltas',
          details: 'Zero faltas registradas',
          badge: 'Frequência 100%',
          targetTab: 'chamada',
          success: true,
        },
      };
    }

    const nomes = faltantes.map((s) => `${s.name} (${s.turma})`).slice(0, 5).join(', ');
    const extra = faltantes.length > 5 ? ` e mais ${faltantes.length - 5} alunos` : '';
    const spokenText = `Foram registradas ${faltantes.length} falta(s) hoje: ${nomes}${extra}.`;
    const displayText = `⚠️ **Alunos Ausentes (${faltantes.length})**:\n${faltantes.map((s) => `• ${s.name} — ${s.turma}`).join('\n')}`;

    return {
      spokenText,
      displayText,
      action: {
        type: 'consultar_ou_lancar_chamada',
        title: 'Lista de Ausências',
        details: `${faltantes.length} aluno(s) ausente(s)`,
        badge: 'Faltas',
        targetTab: 'chamada',
        success: true,
      },
    };
  }

  // 3. Consultar Pendências
  if (args.acao === 'consultar_pendencias') {
    const pendentes = turmaStudents.filter((s) => {
      const rec = recordsMap.get(`${s.id}_${targetActivity}_${targetDate}`);
      return !rec || !rec.status;
    });

    if (pendentes.length === 0) {
      return {
        spokenText: `Chamada 100% concluída para ${formatDateBR(targetDate)}. Não há nenhuma pendência.`,
        displayText: `✅ Todas as chamadas foram realizadas em ${formatDateBR(targetDate)}.`,
        action: {
          type: 'consultar_ou_lancar_chamada',
          title: 'Status da Chamada',
          details: 'Nenhuma pendência',
          badge: 'Concluído',
          targetTab: 'chamada',
          success: true,
        },
      };
    }

    const spokenText = `Constam ${pendentes.length} pendências de chamada para ${formatDateBR(targetDate)}. Deseja abrir a tela de frequência?`;
    const displayText = `⏳ **${pendentes.length} Chamadas Pendentes** para ${formatDateBR(targetDate)}.`;

    return {
      spokenText,
      displayText,
      action: {
        type: 'consultar_ou_lancar_chamada',
        title: 'Chamadas Pendentes',
        details: `${pendentes.length} aluno(s) aguardando registro`,
        badge: 'Pendências',
        targetTab: 'chamada',
        success: true,
      },
    };
  }

  // 4. Lançar Presença / Falta Individual
  if (args.acao === 'lancar_presenca' || args.acao === 'lancar_falta') {
    const isPresente = args.acao === 'lancar_presenca';
    if (!args.nomeAluno) {
      return {
        spokenText: 'Por favor, informe o nome do aluno que deseja registrar.',
        displayText: 'Informe o nome do aluno para registrar a chamada.',
        action: {
          type: 'consultar_ou_lancar_chamada',
          title: 'Chamada',
          details: 'Nome não fornecido',
          targetTab: 'chamada',
        },
      };
    }

    const normTarget = normalizeText(args.nomeAluno);
    const aluno = activeStudents.find((s) => normalizeText(s.name).includes(normTarget));

    if (!aluno) {
      return {
        spokenText: `Não localizei nenhum aluno com o nome ${args.nomeAluno} no cadastro ativo.`,
        displayText: `Aluno "${args.nomeAluno}" não encontrado.`,
        action: {
          type: 'consultar_ou_lancar_chamada',
          title: 'Aluno não encontrado',
          details: args.nomeAluno,
          targetTab: 'chamada',
          success: false,
        },
      };
    }

    if (context.onSaveRecord) {
      const dateParts = targetDate.split('-').map(Number);
      const targetYear = dateParts[0] || new Date().getFullYear();
      const parsedDate = new Date(targetDate + 'T12:00:00');
      const startOfYear = new Date(targetYear, 0, 1);
      const weekNumber = Math.max(1, Math.ceil((((parsedDate.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7));

      await context.onSaveRecord({
        studentId: aluno.id,
        turma: aluno.turma,
        activity: targetActivity,
        date: targetDate,
        weekNumber,
        year: targetYear,
        status: isPresente ? 'presente' : 'falta',
      });
    }

    const statusTexto = isPresente ? 'presença' : 'falta';
    const spokenText = `Pronto! Registrei ${statusTexto} para ${aluno.name} na turma ${aluno.turma}.`;
    const displayText = `✅ ${isPresente ? 'Presença' : 'Falta'} registrada para **${aluno.name}** (${aluno.turma}) em ${formatDateBR(targetDate)}.`;

    return {
      spokenText,
      displayText,
      action: {
        type: 'consultar_ou_lancar_chamada',
        title: `${isPresente ? 'Presença' : 'Falta'} Registrada`,
        details: `${aluno.name} • ${aluno.turma}`,
        badge: isPresente ? 'Presente' : 'Falta',
        targetTab: 'chamada',
        success: true,
      },
    };
  }

  return {
    spokenText: 'Como posso ajudar com a frequência dos alunos?',
    displayText: 'Como posso ajudar com a frequência dos alunos?',
    action: {
      type: 'info',
      title: 'Chamada',
      details: 'Ação geral',
      targetTab: 'chamada',
    },
  };
}

/**
 * Consulta o Manual de Normas Institucionais do Colégio Crescer
 */
export function executeNormaConsultation(termo: string): { spokenText: string; displayText: string; action: SofiaActionPayload } {
  const normTerm = normalizeText(termo);
  const found = NORMAS_DATA.find((n) => {
    const t = normalizeText(n.title);
    const s = normalizeText(n.summary);
    const sec = normalizeText(n.sectionTitle);
    const tags = Array.isArray(n.tags) ? n.tags.map(normalizeText).join(' ') : '';
    return t.includes(normTerm) || s.includes(normTerm) || sec.includes(normTerm) || tags.includes(normTerm);
  });

  if (!found) {
    return {
      spokenText: `Não encontrei nenhuma norma específica sobre ${termo}. Deseja que eu abra o Manual Oficial de Normas?`,
      displayText: `Nenhuma norma encontrada para "${termo}". Abrindo catálogo completo.`,
      action: {
        type: 'consultar_manual_normas',
        title: 'Manual de Normas',
        details: `Busca: "${termo}"`,
        badge: 'Manual',
        targetTab: 'manual',
        success: false,
      },
    };
  }

  const spokenText = `Conforme o Manual Oficial, Seção ${found.sectionNumber || ''}, ${found.title}: ${found.summary.slice(0, 160)}.`;
  const displayText = `📖 **Seção ${found.sectionNumber || ''} — ${found.title}**\n\n${found.summary}\n\n*${found.moduleTitle}*`;

  return {
    spokenText,
    displayText,
    action: {
      type: 'consultar_manual_normas',
      title: `Seção ${found.sectionNumber || ''} • ${found.title}`,
      details: found.summary.slice(0, 100),
      badge: 'Norma Oficial',
      targetTab: 'manual',
      success: true,
    },
  };
}

/**
 * Despachante Central do Agente Sofia:
 * Integra com a API Gemini no backend com calibração de temperatura 0.25
 * e fallback automático para execução determinística instantânea.
 */
export async function querySofiaAgent(
  input: string | SofiaQueryInput,
  context: SofiaAgentContext
): Promise<SofiaResponsePayload> {
  const rawPrompt = typeof input === 'string' ? input : input.prompt;
  const normPrompt = normalizeText(rawPrompt);
  const appContext = buildCurrentAppContext(context);

  // 1. Verificação de permissão institucional: restrito ao perfil de Administrador / Coordenação
  const effectiveUser = context.currentUser || getStoredUser();
  if (!isAdmin(effectiveUser)) {
    return {
      spokenText: 'Acesso negado. A assistente de voz Sofia é permitida apenas para a Coordenação e Administrador.',
      displayText: 'Acesso restrito ao perfil Administrador / Coordenação.',
      action: {
        type: 'info',
        title: 'Acesso Restrito',
        details: 'Perfil não autorizado',
      },
    };
  }

  // 2. Tenta a API do backend
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 18000);

    const res = await fetch('/api/gemini/voice-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        prompt: rawPrompt,
        audioBase64: typeof input !== 'string' ? input.audioBase64 : undefined,
        mimeType: typeof input !== 'string' ? input.mimeType : undefined,
        temperature: SOFIA_DEFAULT_TEMPERATURE,
        context: {
          userName: effectiveUser?.name || 'Administrador',
          userRole: effectiveUser?.role || 'coordenador',
          userEmail: effectiveUser?.email || ADMIN_EMAIL,
          userCargoLabel: effectiveUser?.cargoLabel || 'Coordenador(a)',
          userId: effectiveUser?.id || 'usr_coord_1',
          isAdmin: true,
          selectedDate: appContext.currentDate,
          selectedTurma: appContext.selectedTurma,
          selectedActivity: appContext.selectedActivity,
          summaryStats: appContext.summaryStats,
        },
      }),
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data?.success) {
        // Se a API retornou functionCall ou action
        if (data.action || data.functionCall) {
          const act = data.action || {
            type: data.functionCall.name,
            targetTab: data.functionCall.args?.targetTab,
            args: data.functionCall.args,
          };

          // Executa navegação se especificado
          if (act.targetTab && context.onNavigateTab) {
            context.onNavigateTab(act.targetTab);
          }

          // Se for chamada
          if (act.type === 'consultar_ou_lancar_chamada') {
            const executed = await executeAttendanceAction(act.args || { acao: 'resumo_dia' }, context);
            return {
              spokenText: data.spokenText || executed.spokenText,
              displayText: executed.displayText,
              action: executed.action,
              isAiGenerated: true,
            };
          }

          // Se for manual
          if (act.type === 'consultar_manual_normas') {
            const executed = executeNormaConsultation(act.args?.termoOuTema || rawPrompt);
            return {
              spokenText: data.spokenText || executed.spokenText,
              displayText: executed.displayText,
              action: executed.action,
              isAiGenerated: true,
            };
          }

          return {
            spokenText: data.spokenText,
            displayText: data.displayText || data.spokenText,
            action: {
              type: act.type as SofiaActionType,
              title: 'Ação Executada',
              details: act.targetTab ? `Módulo ${act.targetTab}` : 'Execução do comando',
              targetTab: act.targetTab,
              success: true,
            },
            isAiGenerated: true,
          };
        }

        if (data.spokenText) {
          return {
            spokenText: data.spokenText,
            displayText: data.spokenText,
            isAiGenerated: true,
          };
        }
      }
    }
  } catch (err) {
    console.warn('[Sofia Agent Service] API remota inacessível, aplicando motor de intenção local:', err);
  }

  // 3. Motor Local Determinístico de Alta Resiliência (Zero Latência)
  // Intenção: Navegação Direta de Módulo
  if (
    normPrompt.includes('livro ponto') ||
    normPrompt.includes('abrir ponto') ||
    normPrompt.includes('ir para o ponto') ||
    normPrompt.includes('espelho de ponto')
  ) {
    if (context.onNavigateTab) context.onNavigateTab('ponto');
    return {
      spokenText: 'Abrindo o Livro Ponto do Programa Integral.',
      displayText: 'Abrindo o módulo do **Livro Ponto**.',
      action: {
        type: 'navegar_modulo',
        title: 'Livro Ponto',
        details: 'Navegando para o Livro Ponto',
        badge: 'Ponto',
        targetTab: 'ponto',
        success: true,
      },
    };
  }

  if (
    normPrompt.includes('ir para chamada') ||
    normPrompt.includes('abrir chamada') ||
    normPrompt.includes('frequencia') ||
    normPrompt.includes('abrir lista')
  ) {
    if (context.onNavigateTab) context.onNavigateTab('chamada');
    return {
      spokenText: 'Abrindo a lista de Chamada e Frequência.',
      displayText: 'Abrindo o módulo de **Chamada e Frequência**.',
      action: {
        type: 'navegar_modulo',
        title: 'Chamada e Frequência',
        details: 'Navegando para a Frequência',
        badge: 'Chamada',
        targetTab: 'chamada',
        success: true,
      },
    };
  }

  if (
    normPrompt.includes('cardapio') ||
    normPrompt.includes('almoco') ||
    normPrompt.includes('lanche') ||
    normPrompt.includes('culinaria')
  ) {
    if (context.onNavigateTab) context.onNavigateTab('refeicoes');
    return {
      spokenText: 'Abrindo o Cardápio e Cozinha Experimental do Integral.',
      displayText: 'Abrindo o módulo de **Alimentação & Culinária**.',
      action: {
        type: 'navegar_modulo',
        title: 'Cardápio & Culinária',
        details: 'Navegando para Refeições',
        badge: 'Cardápio',
        targetTab: 'refeicoes',
        success: true,
      },
    };
  }

  if (
    normPrompt.includes('manual') ||
    normPrompt.includes('normas') ||
    normPrompt.includes('regulamento')
  ) {
    // Se for pergunta específica de norma
    const matchNorma = normPrompt.match(/(?:norma|sobre|regra)\s+(.+)/);
    if (matchNorma && matchNorma[1] && matchNorma[1].trim().length > 3) {
      if (context.onNavigateTab) context.onNavigateTab('manual');
      return executeNormaConsultation(matchNorma[1]);
    }

    if (context.onNavigateTab) context.onNavigateTab('manual');
    return {
      spokenText: 'Abrindo o Manual Oficial de Normas e Orientações.',
      displayText: 'Abrindo o **Manual de Normas** do Colégio Crescer.',
      action: {
        type: 'navegar_modulo',
        title: 'Manual de Normas',
        details: 'Catálogo de 51 Normas',
        badge: 'Manual',
        targetTab: 'manual',
        success: true,
      },
    };
  }

  if (
    normPrompt.includes('feedback') ||
    normPrompt.includes('orientacao profissional') ||
    normPrompt.includes('ocorrencia')
  ) {
    if (context.onOpenFeedbacks) {
      context.onOpenFeedbacks();
    } else if (context.onNavigateTab) {
      context.onNavigateTab('manual');
    }
    return {
      spokenText: 'Abrindo a gestão de Feedbacks de Orientação Profissional.',
      displayText: 'Abrindo o painel de **Feedbacks e Orientações**.',
      action: {
        type: 'navegar_modulo',
        title: 'Feedbacks de Orientação',
        details: 'Gestão da Coordenação',
        badge: 'Feedbacks',
        targetTab: 'feedbacks',
        success: true,
      },
    };
  }

  // Intenção: Chamada — Resumo do Dia
  if (
    normPrompt.includes('resumo') ||
    normPrompt.includes('quantos alunos') ||
    normPrompt.includes('situacao de hoje') ||
    normPrompt.includes('como esta o dia')
  ) {
    return await executeAttendanceAction({ acao: 'resumo_dia' }, context);
  }

  // Intenção: Chamada — Buscar Faltas
  if (
    normPrompt.includes('falta') ||
    normPrompt.includes('faltou') ||
    normPrompt.includes('ausente') ||
    normPrompt.includes('quem faltou')
  ) {
    return await executeAttendanceAction({ acao: 'buscar_faltas' }, context);
  }

  // Intenção: Chamada — Pendências
  if (
    normPrompt.includes('pendencia') ||
    normPrompt.includes('quem falta fazer') ||
    normPrompt.includes('faltam fazer')
  ) {
    return await executeAttendanceAction({ acao: 'consultar_pendencias' }, context);
  }

  // Resposta padrão imediata e profissional
  return {
    spokenText: 'Estou pronta. Posso consultar presenças, faltas, abrir o Livro Ponto, o Cardápio ou pesquisar no Manual de Normas.',
    displayText: 'Olá! Sou Sofia, assistente do Integral. Como posso ajudar com a frequência, ponto, atividades ou normas hoje?',
    action: {
      type: 'info',
      title: 'Sofia • Integral',
      details: 'Assistente pronta para comandos',
    },
  };
}
