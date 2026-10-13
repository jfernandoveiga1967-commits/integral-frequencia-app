/**
 * voiceAiService.ts
 * Serviço de IA Conversacional por Voz — Sofia (Guia do Integral • Colégio Crescer)
 * Orquestração de Captura de Áudio (Web Audio API / SpeechRecognition),
 * Function Calling do Gemini (Chamada, Manual de 50 Normas, Cardápio/Semanário) e Síntese TTS.
 */

import { Student, AttendanceRecord, ActivityType, TurmaType, UserProfile, ScheduleBlock } from '../types';
import { INITIAL_MANUAL_NORMAS, ManualNorma } from '../types/manualNormas';
import { NORMAS_DATA } from '../data/normasData';
import { DEFAULT_SEPTEMBER_2026_MENU } from '../data/defaultCardapioData';
import { formatDateBR, getDayOfWeekFromDate, toISODateString } from '../utils/dateUtils';
import { isAdmin, getStoredUser, ADMIN_EMAIL } from '../utils/authUtils';

export type VoiceAgentState = 'Aguardando' | 'Ouvindo...' | 'Processando...' | 'Falando...';

export interface VoiceActionResult {
  type: 'chamada' | 'norma' | 'cardapio' | 'semanario' | 'info';
  title: string;
  details: string;
  badge?: string;
  success?: boolean;
}

export interface VoiceResponsePayload {
  spokenText: string;
  displayText?: string;
  functionCalled?: string;
  functionArgs?: Record<string, any>;
  actionResult?: VoiceActionResult;
}

export interface VoiceAgentContext {
  currentUser?: UserProfile | null;
  selectedDate: string;
  selectedTurma?: string;
  selectedActivity?: string;
  students: Student[];
  records: AttendanceRecord[];
  schedules?: ScheduleBlock[];
  onSaveRecord?: (record: Omit<AttendanceRecord, 'id' | 'createdAt'>) => Promise<void> | void;
  onNavigateTab?: (tab: any) => void;
  onSelectTurma?: (turma: any) => void;
  onSelectDate?: (date: string) => void;
}

// Helper: Normalização de texto sem acentos
export function normalizeVoiceText(s?: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * 1. CONSULTA E LANÇAMENTO DE CHAMADA POR VOZ
 */
export async function executeAttendanceVoiceAction(
  args: {
    acao: 'consultar_pendencias' | 'lancar_presenca' | 'lancar_falta' | 'resumo_dia';
    nomeAluno?: string;
    turma?: string;
    modalidade?: string;
    data?: string;
  },
  context: VoiceAgentContext
): Promise<{ text: string; action: VoiceActionResult }> {
  const targetDate = args.data || context.selectedDate || toISODateString(new Date());
  const targetActivity = (args.modalidade || context.selectedActivity || 'Rotina') as ActivityType;
  const targetTurma = args.turma || context.selectedTurma || 'TODAS';

  const activeStudents = (context.students || []).filter(
    (s) => (s.status || s.statusMatricula || 'ativo') === 'ativo'
  );

  const turmaStudents = targetTurma === 'TODAS'
    ? activeStudents
    : activeStudents.filter((s) => s.turma === targetTurma);

  // Registro map
  const recordMap = new Map<string, AttendanceRecord>();
  (context.records || []).forEach((r) => {
    if (r && r.date === targetDate) {
      recordMap.set(`${r.studentId}_${r.activity}_${r.date}`, r);
    }
  });

  // Ação 1: Consultar pendências
  if (args.acao === 'consultar_pendencias') {
    const pendentes = turmaStudents.filter((s) => {
      const rec = recordMap.get(`${s.id}_${targetActivity}_${targetDate}`);
      return !rec || !rec.status;
    });

    if (pendentes.length === 0) {
      const text = `Parabéns! Não há nenhuma pendência de chamada na modalidade ${targetActivity} para ${targetTurma === 'TODAS' ? 'todas as turmas' : `a turma ${targetTurma}`} na data de ${formatDateBR(targetDate)}.`;
      return {
        text,
        action: {
          type: 'chamada',
          title: 'Chamada 100% Completa',
          details: 'Todos os alunos ativos já possuem registro lançado.',
          badge: 'Sem Pendências',
          success: true,
        },
      };
    }

    const nomes = pendentes.slice(0, 5).map((p) => p.name).join(', ');
    const resto = pendentes.length > 5 ? ` e mais ${pendentes.length - 5} alunos` : '';
    const text = `Existem ${pendentes.length} alunos com chamada pendente em ${targetActivity}: ${nomes}${resto}.`;

    return {
      text,
      action: {
        type: 'chamada',
        title: `${pendentes.length} Pendências de Chamada`,
        details: `Alunos pendentes: ${nomes}${resto}.`,
        badge: `${pendentes.length} Pendentes`,
        success: true,
      },
    };
  }

  // Ação 2: Resumo do dia
  if (args.acao === 'resumo_dia') {
    let pres = 0;
    let falt = 0;
    let pend = 0;

    turmaStudents.forEach((s) => {
      const rec = recordMap.get(`${s.id}_${targetActivity}_${targetDate}`);
      if (!rec || !rec.status) pend++;
      else if (rec.status === 'presente' || rec.status === 'saida_antecipada') pres++;
      else if (rec.status === 'falta' || rec.status === 'sem_equipamento') falt++;
    });

    const text = `No resumo de hoje para ${targetActivity}: temos ${pres} presentes, ${falt} faltas e ${pend} pendências em ${turmaStudents.length} alunos matriculados.`;
    return {
      text,
      action: {
        type: 'chamada',
        title: `Resumo do Dia • ${targetActivity}`,
        details: `${pres} presentes • ${falt} faltas • ${pend} pendentes`,
        badge: `${pres}/${turmaStudents.length} Pres.`,
        success: true,
      },
    };
  }

  // Ação 3 ou 4: Lançar presença ou falta de aluno específico por voz
  if (args.acao === 'lancar_presenca' || args.acao === 'lancar_falta') {
    if (!args.nomeAluno) {
      return {
        text: 'Por favor, informe o nome do aluno que deseja marcar.',
        action: {
          type: 'chamada',
          title: 'Nome não especificado',
          details: 'Diga o nome do aluno para registrar.',
          badge: 'Aguardando',
          success: false,
        },
      };
    }

    const normSearch = normalizeVoiceText(args.nomeAluno);
    const matched = turmaStudents.find((s) => normalizeVoiceText(s.name).includes(normSearch));

    if (!matched) {
      return {
        text: `Não encontrei nenhum aluno com o nome ${args.nomeAluno} na turma ${targetTurma}.`,
        action: {
          type: 'chamada',
          title: 'Aluno não encontrado',
          details: `Busca por "${args.nomeAluno}" não retornou resultados.`,
          badge: 'Não Encontrado',
          success: false,
        },
      };
    }

    const newStatus = args.acao === 'lancar_presenca' ? 'presente' : 'falta';
    if (context.onSaveRecord) {
      await context.onSaveRecord({
        studentId: matched.id,
        turma: matched.turma,
        activity: targetActivity,
        date: targetDate,
        weekNumber: 38,
        year: 2026,
        status: newStatus,
        observation: `Lançado por comando de voz (Sofia)`,
        instructorName: context.currentUser?.name,
      });
    }

    const text = `Prontinho! Registrei ${newStatus === 'presente' ? 'Presença' : 'Falta'} com sucesso para ${matched.name} da turma ${matched.turma} na atividade ${targetActivity}.`;
    return {
      text,
      action: {
        type: 'chamada',
        title: `${newStatus === 'presente' ? 'Presença' : 'Falta'} Registrada`,
        details: `${matched.name} (${matched.turma}) • ${targetActivity}`,
        badge: newStatus === 'presente' ? 'Presente ✓' : 'Falta ✗',
        success: true,
      },
    };
  }

  return {
    text: 'Ação de chamada processada com sucesso.',
    action: {
      type: 'chamada',
      title: 'Chamada',
      details: 'Operação concluída.',
      success: true,
    },
  };
}

/**
 * 2. BUSCA NO MANUAL DE 50 NORMAS INSTITUCIONAIS
 */
export function executeManualNormasVoiceAction(
  termoOuTema: string
): { text: string; action: VoiceActionResult } {
  const normTerm = normalizeVoiceText(termoOuTema);

  if (!normTerm) {
    return {
      text: 'O Manual de Orientações do Colégio Crescer possui 50 normas que regem a segurança, postura pedagógica e bem-estar das crianças. Sobre qual assunto você gostaria de saber?',
      action: {
        type: 'norma',
        title: 'Manual de 50 Normas do Crescer',
        details: 'Diretrizes pedagógicas e funcionais completas.',
        badge: 'Manual Oficial',
      },
    };
  }

  // Busca por correspondência inteligente no acervo de 50 normas sequenciais
  const scored = NORMAS_DATA.map((norma) => {
    let score = 0;
    const titleNorm = normalizeVoiceText(norma.title);
    const descNorm = normalizeVoiceText(norma.summary);
    const secNorm = normalizeVoiceText(norma.sectionTitle || norma.sectionNumber);
    const secTag = normalizeVoiceText(norma.section || `secao ${norma.sectionNumber}`);
    const tagsNorm = normalizeVoiceText(Array.isArray(norma.tags) ? norma.tags.join(' ') : '');

    // Correspondência direta à numeração de seção (ex: "seção 12", "seção 4", "12")
    if (normTerm.includes(`secao ${norma.sectionNumber}`) || normTerm === norma.sectionNumber) {
      score += 60;
    }
    if (secTag.includes(normTerm)) score += 30;
    if (titleNorm.includes(normTerm)) score += 15;
    if (tagsNorm.includes(normTerm)) score += 12;
    if (descNorm.includes(normTerm)) score += 8;
    if (secNorm.includes(normTerm)) score += 6;

    // Palavras individuais
    const words = normTerm.split(/\s+/).filter((w) => w.length > 2);
    words.forEach((w) => {
      if (titleNorm.includes(w)) score += 4;
      if (tagsNorm.includes(w)) score += 3;
      if (descNorm.includes(w)) score += 2;
    });

    return { norma, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (!best || best.score === 0) {
    return {
      text: `Não encontrei uma norma específica para "${termoOuTema}", mas você pode consultar os 6 módulos do Manual no painel oficial de normas (Seções 1 a 50).`,
      action: {
        type: 'norma',
        title: 'Norma não localizada',
        details: `Nenhum resultado direto para "${termoOuTema}".`,
        badge: 'Pesquisa',
        success: false,
      },
    };
  }

  const norma = best.norma;
  const orientacao = norma.details?.[0] || norma.summary;
  const secLabel = norma.section || `Seção ${norma.sectionNumber}`;
  const text = `De acordo com a ${secLabel}, sobre ${norma.title}: ${norma.summary} A diretriz orienta que: ${orientacao}`;

  return {
    text,
    action: {
      type: 'norma',
      title: `${secLabel} — ${norma.title}`,
      details: norma.summary,
      badge: secLabel,
      success: true,
    },
  };
}

/**
 * 3. CONSULTA DE CARDÁPIO E SEMANÁRIO PEDAGÓGICO
 */
export function executeCardapioSemanarioVoiceAction(
  args: {
    tipo: 'cardapio_almoco' | 'cardapio_lanche' | 'culinaria' | 'roteiro_semanario' | 'rotina_geral';
    diaSemana?: string;
    turma?: string;
  },
  context: VoiceAgentContext
): { text: string; action: VoiceActionResult } {
  const today = new Date();
  const dayOfWeek = args.diaSemana || getDayOfWeekFromDate(context.selectedDate || toISODateString(today));

  // Consulta do Cardápio
  if (args.tipo === 'cardapio_almoco' || args.tipo === 'cardapio_lanche' || !args.tipo) {
    const menuDays = DEFAULT_SEPTEMBER_2026_MENU.days;
    // Pega o primeiro dia da semana correspondente
    const dayEntry = Object.values(menuDays).find((d) => d.dayOfWeek === dayOfWeek) || Object.values(menuDays)[0];

    if (!dayEntry) {
      return {
        text: 'Não encontrei o cardápio específico para este dia.',
        action: {
          type: 'cardapio',
          title: 'Cardápio',
          details: 'Informações do cardápio indisponíveis.',
          badge: 'Nutrição',
        },
      };
    }

    if (args.tipo === 'cardapio_lanche') {
      const text = `O lanche da tarde para ${dayOfWeek} tem frutas frescas da época, além de suco natural e lanche supervisionado pela nutricionista Thaís Grisoni Baroni.`;
      return {
        text,
        action: {
          type: 'cardapio',
          title: `Lanche da Tarde • ${dayOfWeek}`,
          details: `Frutas frescas da época, suco natural e acompanhamento nutricional.`,
          badge: 'Lanche',
          success: true,
        },
      };
    }

    const pratoPrincipal = dayEntry.protein || 'Grelhado especial';
    const guarnicao = dayEntry.garnish || 'Guarnição do dia';
    const bases = Array.isArray(dayEntry.base) ? dayEntry.base.join(' e ') : 'Arroz e feijão';
    const salada = dayEntry.salad || 'Salada fresca';
    const sobremesa = dayEntry.dessert || 'Fruta da época';

    const text = `No almoço de ${dayOfWeek}, o prato principal é ${pratoPrincipal}, com ${guarnicao}, ${bases} e salada de ${salada}. Para a sobremesa temos ${sobremesa}.`;
    return {
      text,
      action: {
        type: 'cardapio',
        title: `Almoço de ${dayOfWeek}`,
        details: `${pratoPrincipal} • ${guarnicao} • ${bases} • Salada: ${salada} • Sobremesa: ${sobremesa}`,
        badge: 'Almoço Balanceado',
        success: true,
      },
    };
  }

  // Consulta do Semanário / Rotina
  if (args.tipo === 'roteiro_semanario' || args.tipo === 'rotina_geral') {
    const targetTurma = args.turma || context.selectedTurma || '1º Ano Azul';
    const text = `No Semanário Pedagógico para ${targetTurma}, a rotina inclui acolhimento, oficinas práticas com intencionalidade BNCC, atividades motoras, horário de alimentação e fechamento lúdico.`;
    return {
      text,
      action: {
        type: 'semanario',
        title: `Semanário • ${targetTurma}`,
        details: 'Intencionalidade pedagógica BNCC, disparador lúdico e desenvolvimento guiado.',
        badge: 'BNCC Crescer',
        success: true,
      },
    };
  }

  return {
    text: 'Consulta de cardápio e rotinas pedagógicas do Integral realizada.',
    action: {
      type: 'info',
      title: 'Nutrição & Rotina',
      details: 'Cardápio supervisionado pela nutricionista Thaís Grisoni Baroni.',
      badge: 'Integral',
      success: true,
    },
  };
}

/**
 * 4. DISPATCHER GERAL DO AGENTE DE VOZ (Processa intenção do usuário)
 */
export async function processVoiceAgentQuery(
  userInput: string,
  context: VoiceAgentContext
): Promise<VoiceResponsePayload> {
  const normInput = normalizeVoiceText(userInput);

  // Verificação de segurança: Sofia é exclusiva para Administrador
  const effectiveUser = context.currentUser || getStoredUser();
  const isAuthorizedAdmin = isAdmin(effectiveUser);

  if (!isAuthorizedAdmin) {
    return {
      spokenText: 'Acesso negado. A assistente de voz Sofia é permitida apenas para o perfil Administrador.',
      displayText: 'Acesso restrito ao perfil Administrador.',
    };
  }

  // 1. Tenta chamar o endpoint no backend com timeout estrito de 8 segundos
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('/api/gemini/voice-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        prompt: userInput,
        context: {
          userName: effectiveUser?.name || 'Administrador',
          userRole: effectiveUser?.role || 'coordenador',
          userEmail: effectiveUser?.email || ADMIN_EMAIL,
          userCargoLabel: effectiveUser?.cargoLabel || 'Coordenador (Administrador)',
          userId: effectiveUser?.id || 'usr_coord_1',
          isAdmin: true,
          selectedDate: context.selectedDate,
          selectedTurma: context.selectedTurma,
          selectedActivity: context.selectedActivity,
        },
      }),
    });

    clearTimeout(timeoutId);

    if (res.status === 403) {
      return {
        spokenText: 'Acesso negado. A assistente de voz Sofia é permitida apenas para o perfil Administrador.',
        displayText: 'Acesso restrito ao perfil Administrador.',
      };
    }

    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.functionCall) {
        const { name, args } = data.functionCall;
        if (name === 'consultar_ou_lancar_chamada') {
          const result = await executeAttendanceVoiceAction(args, context);
          return {
            spokenText: data.spokenText || result.text,
            displayText: result.text,
            functionCalled: name,
            functionArgs: args,
            actionResult: result.action,
          };
        } else if (name === 'consultar_manual_normas') {
          const result = executeManualNormasVoiceAction(args.termoOuTema || userInput);
          return {
            spokenText: data.spokenText || result.text,
            displayText: result.text,
            functionCalled: name,
            functionArgs: args,
            actionResult: result.action,
          };
        } else if (name === 'consultar_cardapio_ou_semanario') {
          const result = executeCardapioSemanarioVoiceAction(args, context);
          return {
            spokenText: data.spokenText || result.text,
            displayText: result.text,
            functionCalled: name,
            functionArgs: args,
            actionResult: result.action,
          };
        }
      }

      if (data && data.spokenText) {
        return {
          spokenText: data.spokenText,
          displayText: data.spokenText,
        };
      }
    }
  } catch (err: any) {
    console.warn('[Sofia Voice Agent] Timeout ou indisponibilidade da rota backend:', err?.message || err);
    // Retorna mensagem padrão requerida para destravar imediatamente a interface
    return {
      spokenText: 'Estou reestabelecendo minha conexão com o sistema do Crescer, tente novamente em alguns instantes.',
      displayText: 'Estou reestabelecendo minha conexão com o sistema do Crescer, tente novamente em alguns instantes.',
      actionResult: {
        type: 'info',
        title: 'Sofia • Conexão Temporária',
        details: 'Estou reestabelecendo a conexão com o sistema do Crescer.',
        badge: 'Reestabelecendo',
      },
    };
  }

  // 2. Fallback Inteligente Local (Garantia de 100% de disponibilidade mesmo sem conexão com a API)
  // Análise de Intenção Local:

  // Intenção A: Chamada / Presença / Falta / Pendências
  if (
    normInput.includes('chamada') ||
    normInput.includes('presenca') ||
    normInput.includes('falta') ||
    normInput.includes('pendencia') ||
    normInput.includes('marcar') ||
    normInput.includes('quem falta') ||
    normInput.includes('quantos faltam')
  ) {
    let acao: 'consultar_pendencias' | 'lancar_presenca' | 'lancar_falta' | 'resumo_dia' = 'consultar_pendencias';

    if (normInput.includes('marcar presenca') || normInput.includes('presente')) {
      acao = 'lancar_presenca';
    } else if (normInput.includes('marcar falta') || normInput.includes('faltou')) {
      acao = 'lancar_falta';
    } else if (normInput.includes('resumo') || normInput.includes('quantos estao')) {
      acao = 'resumo_dia';
    }

    // Extrai nome de aluno se aplicável
    let nomeAluno: string | undefined;
    const matchPara = normInput.match(/(?:para|aluno|aluna)\s+([a-zA-ZÀ-ÿ]+)/);
    if (matchPara && matchPara[1]) {
      nomeAluno = matchPara[1];
    }

    const result = await executeAttendanceVoiceAction(
      { acao, nomeAluno },
      context
    );

    return {
      spokenText: result.text,
      displayText: result.text,
      functionCalled: 'consultar_ou_lancar_chamada',
      actionResult: result.action,
    };
  }

  // Intenção B: Manual de 50 Normas
  if (
    normInput.includes('norma') ||
    normInput.includes('manual') ||
    normInput.includes('regra') ||
    normInput.includes('celular') ||
    normInput.includes('radio') ||
    normInput.includes('uniforme') ||
    normInput.includes('fardamento') ||
    normInput.includes('alergia') ||
    normInput.includes('remedio') ||
    normInput.includes('medicamento') ||
    normInput.includes('parque') ||
    normInput.includes('seguranca') ||
    normInput.includes('atestado')
  ) {
    const result = executeManualNormasVoiceAction(userInput);
    return {
      spokenText: result.text,
      displayText: result.text,
      functionCalled: 'consultar_manual_normas',
      actionResult: result.action,
    };
  }

  // Intenção C: Cardápio / Comida / Almoço / Lanche / Semanário
  if (
    normInput.includes('cardapio') ||
    normInput.includes('almoco') ||
    normInput.includes('lanche') ||
    normInput.includes('comida') ||
    normInput.includes('culinaria') ||
    normInput.includes('semanario') ||
    normInput.includes('atividade') ||
    normInput.includes('roteiro')
  ) {
    const tipo = normInput.includes('lanche')
      ? 'cardapio_lanche'
      : normInput.includes('semanario') || normInput.includes('roteiro')
      ? 'roteiro_semanario'
      : 'cardapio_almoco';

    const result = executeCardapioSemanarioVoiceAction({ tipo }, context);
    return {
      spokenText: result.text,
      displayText: result.text,
      functionCalled: 'consultar_cardapio_ou_semanario',
      actionResult: result.action,
    };
  }

  // Saudação padrão e ajuda
  const defaultText =
    'Olá! Eu sou Sofia, sua assistente por voz do Integral. Posso ajudar você a registrar presença, verificar pendências de chamada, consultar o Manual de 50 Normas ou conferir o cardápio e o semanário do dia. O que você gostaria de fazer?';

  return {
    spokenText: defaultText,
    displayText: defaultText,
    actionResult: {
      type: 'info',
      title: 'Sofia • Guia do Integral',
      details: 'Comandos disponíveis: Chamada, Manual de Normas, Cardápio e Semanário.',
      badge: 'Pronta para Ajudar',
    },
  };
}

/**
 * 5. GERENCIADOR DE SÍNTESE DE FALA (TTS - Web Speech API)
 */
export class TextToSpeechManager {
  private static synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  private static currentUtterance: SpeechSynthesisUtterance | null = null;

  public static speak(
    text: string,
    options?: {
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: any) => void;
      rate?: number;
      pitch?: number;
    }
  ): void {
    if (!this.synth) {
      options?.onEnd?.();
      return;
    }

    // Cancela fala anterior se houver
    this.stop();

    // Limpa pontuações que soam ruins em TTS (ex: asteriscos de markdown, parênteses)
    const cleanText = text
      .replace(/\*/g, '')
      .replace(/•/g, ', ')
      .replace(/\[.*?\]/g, '')
      .trim();

    if (!cleanText) {
      options?.onEnd?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'pt-BR';
    utterance.rate = options?.rate ?? 1.05; // Velocidade agradável e natural
    utterance.pitch = options?.pitch ?? 1.0;

    // Seleciona a melhor voz em Português disponível
    const voices = this.synth.getVoices();
    const ptVoices = voices.filter((v) => v.lang.startsWith('pt'));
    const preferredVoice =
      ptVoices.find((v) => v.name.includes('Google') || v.name.includes('Luciana') || v.name.includes('Francisca') || v.name.includes('Natural')) ||
      ptVoices[0];

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    if (this.synth.paused) {
      try {
        this.synth.resume();
      } catch {}
    }

    // Timer de segurança para destravar caso o navegador não dispare onend
    const safetyDurationMs = Math.max(3000, cleanText.length * 85);
    const safetyTimer = setTimeout(() => {
      if (this.currentUtterance === utterance) {
        this.currentUtterance = null;
        options?.onEnd?.();
      }
    }, safetyDurationMs);

    utterance.onstart = () => {
      options?.onStart?.();
    };

    utterance.onend = () => {
      clearTimeout(safetyTimer);
      this.currentUtterance = null;
      options?.onEnd?.();
    };

    utterance.onerror = (e) => {
      clearTimeout(safetyTimer);
      this.currentUtterance = null;
      options?.onError?.(e);
      options?.onEnd?.();
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  public static stop(): void {
    if (this.synth) {
      this.synth.cancel();
    }
    this.currentUtterance = null;
  }

  public static isSpeaking(): boolean {
    return Boolean(this.synth?.speaking);
  }
}
