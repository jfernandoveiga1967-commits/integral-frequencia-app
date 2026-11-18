/**
 * sofiaTools.ts
 * Catálogo e Executores de Ferramentas Reais da Assistente Sofia (Colégio Crescer).
 * Cobre todas as áreas do Integral com respeito às permissões por perfil e linguagem natural.
 */

import jsPDF from 'jspdf';
import {
  SofiaAgentToolName,
  SofiaToolResult,
  Student,
  AttendanceRecord,
  PontoRecord,
  UserProfile,
  ScheduleBlock,
  SemanarioPlan,
  TurmaAtribuicao,
  HolidayItem,
  ActivityItem,
  AppStateSummary,
  ALL_APP_TAB_IDS,
  TabType,
} from '../types';
import {
  generateLivroPontoPDFReport,
  generateNominalListPDF,
  generateTermoSaidaAvulsaPDF,
} from '../utils/pdfGenerator';
import {
  calculateMonthlyPontoFinancials,
  getMonthNameBR,
  formatCurrencyBR,
} from '../utils/pontoUtils';
import {
  formatDateBR,
  toISODateString,
  getDayOfWeekFromDate,
  isHolidayOrRecess,
  isStudentActiveOnDate,
  isStudentScheduledForDate,
  isWeekend,
} from '../utils/dateUtils';
import { formatPhoneDisplay } from '../utils/whatsappUtils';
import {
  getCurrentActivityForTurma,
  getNextSlot,
  extractSlotLimits,
  normalizeTime,
} from '../utils/timeUtils';
import { findMatchingSemanarioPlan } from '../utils/semanarioMatching';
import { loadMonthlyMenu } from '../utils/cardapioStorage';
import {
  loadLocalQuadroAtribuicoes,
  resolveAtribuicaoForTurma,
} from '../utils/atribuicoesStorage';
import { loadSemanarioPlans } from '../utils/storageUtils';
import { NORMAS_DATA } from '../data/normasData';
import {
  isAdmin,
  isTabAllowed,
  canManageStudents,
  canMarkAttendance,
  canManageCardapio,
} from '../utils/authUtils';
import { formatHourPTBR, getDayOfWeekFullPTBR } from '../utils/sofiaPromptBuilder';
import { getUsers, saveUser } from './userService';
import { getAttendanceSummaryByDate, lancarFrequenciaTurma, normalizeDateInput } from './frequencyService';
import { createStudent, updateStudent } from './studentService';
import { cadastrarRefeicaoCardapio as cadastrarRefeicaoCardapioService } from './menuService';
import {
  loadLocalFinancialProfiles,
  loadLocalFinancialExpenses,
  calculateFinancialMetrics,
  buildDefaultFinancialProfile,
} from './financialService';

export interface SofiaToolExecutionContext {
  students: Student[];
  records: AttendanceRecord[];
  pontoRecords?: PontoRecord[];
  currentUser?: UserProfile | null;
  selectedDate: string;
  selectedTurma?: string;
  selectedActivity?: string;
  activeTab?: string;
  schedules?: ScheduleBlock[];
  semanarioPlans?: SemanarioPlan[];
  quadroAtribuicoes?: TurmaAtribuicao[];
  users?: UserProfile[];
  holidays?: HolidayItem[];
  activitiesList?: ActivityItem[];
  activeTurmas?: string[];
  onSaveRecord?: (record: Omit<AttendanceRecord, 'id' | 'createdAt'>) => Promise<void> | void;
  onNavigateTab?: (tab: any) => void;
  onSelectTurma?: (turma: any) => void;
  onSelectDate?: (date: string) => void;
  appState?: AppStateSummary;
}

/**
 * Catálogo de Definições de Funções (Gemini Function Declarations)
 */
export const SOFIA_FUNCTION_DECLARATIONS = [
  {
    name: 'consultarAtividadesMomento',
    description:
      'Consulta o que cada turma (ou uma turma específica) está fazendo agora ou em um horário simulado na grade horária do Integral: atividade, local, monitora/ADI, horário de término e turmas sem atividade.',
    parameters: {
      type: 'OBJECT',
      properties: {
        turma: {
          type: 'STRING',
          description: 'Nome opcional da turma (ex: "Maternal Azul", "Infantil 2", "1º Ano Azul"). Se omitido, mostra o panorama das turmas.',
        },
        horarioSimulado: {
          type: 'STRING',
          description: 'Horário opcional no formato HH:mm para simular (ex: "15:30"). Se omitido, usa o horário atual.',
        },
        data: {
          type: 'STRING',
          description: 'Data opcional YYYY-MM-DD. Se omitido, usa hoje.',
        },
      },
    },
  },
  {
    name: 'consultarFrequenciaHoje',
    description:
      'Consulta as estatísticas ao vivo de frequência de hoje (presenças, faltas, saídas antecipadas e pendências de chamada), podendo filtrar por turma e listar nomes de presentes ou faltosos.',
    parameters: {
      type: 'OBJECT',
      properties: {
        turma: {
          type: 'STRING',
          description: 'Nome da turma opcional para filtro (ex: "Maternal", "1º Ano Azul", "Mini Maternal").',
        },
        listarNomes: {
          type: 'BOOLEAN',
          description: 'Se verdadeiro, inclui os nomes dos alunos faltantes, presentes ou pendentes.',
        },
      },
    },
  },
  {
    name: 'obterResumoFrequenciaPorData',
    description:
      'Consulta o histórico de frequência de alunos e relatório de faltas e presenças para uma data específica passada ou informada (ex: ontem, anteontem, dia 28 ou data YYYY-MM-DD / DD/MM/YYYY).',
    parameters: {
      type: 'OBJECT',
      properties: {
        data: {
          type: 'STRING',
          description: 'Data da consulta no formato YYYY-MM-DD ou DD/MM/YYYY.',
        },
      },
      required: ['data'],
    },
  },
  {
    name: 'registrarSaidaAntecipada',
    description:
      'Registra rapidamente o aviso/horário de saída antecipada de um aluno hoje (ex: "O Pedro vai sair 16h", "João do Infantil 1 sai mais cedo 15h30"). Detecta automaticamente se há dois alunos com o mesmo nome.',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: {
          type: 'STRING',
          description: 'Nome ou identificador do aluno.',
        },
        turma: {
          type: 'STRING',
          description: 'Nome da turma se informado (ex: "Infantil 1", "Maternal Azul").',
        },
        horario: {
          type: 'STRING',
          description: 'Horário previsto da saída (ex: "16:00", "15:30").',
        },
        justificativa: {
          type: 'STRING',
          description: 'Motivo ou quem vem buscar, se informado.',
        },
      },
      required: ['alunoId', 'horario'],
    },
  },
  {
    name: 'consultarAlertasSaidaHoje',
    description:
      'Consulta os alertas e relatórios de saídas de hoje: alunos de transporte escolar (van), saídas antecipadas agendadas e alunos já liberados.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tipo: {
          type: 'STRING',
          description: 'Foco da consulta: "van", "antecipada" ou "geral".',
          enum: ['van', 'antecipada', 'geral'],
        },
        turma: {
          type: 'STRING',
          description: 'Nome da turma opcional para filtro.',
        },
        detalhesVan: {
          type: 'BOOLEAN',
          description: 'Se verdadeiro, lista os nomes de cada aluno e condutor.',
        },
      },
    },
  },
  {
    name: 'consultarCardapio',
    description:
      'Consulta o cardápio de hoje, de outra data ou da semana (almoço, guarnição, salada, sobremesa, lanche/observações) e verifica se há alunos com alergias ou restrições alimentares.',
    parameters: {
      type: 'OBJECT',
      properties: {
        data: {
          type: 'STRING',
          description: 'Data opcional ("hoje", "amanha", YYYY-MM-DD ou DD/MM/YYYY). Padrão: hoje.',
        },
        turma: {
          type: 'STRING',
          description: 'Turma opcional para checar restrições alimentares.',
        },
      },
    },
  },
  {
    name: 'consultarSemanario',
    description:
      'Consulta o planejamento semanal (Semanário) de uma turma ou dia específico: atividades planejadas, objetivos e materiais.',
    parameters: {
      type: 'OBJECT',
      properties: {
        turma: {
          type: 'STRING',
          description: 'Turma opcional para filtrar o planejamento.',
        },
        data: {
          type: 'STRING',
          description: 'Data opcional (YYYY-MM-DD ou dia da semana). Padrão: hoje.',
        },
      },
    },
  },
  {
    name: 'consultarManualNormas',
    description:
      'Pesquisa regras, condutas, protocolos de emergência, uso de celular, saídas, alergias ou orientações no Manual Oficial do Colégio Crescer.',
    parameters: {
      type: 'OBJECT',
      properties: {
        termoOuTema: {
          type: 'STRING',
          description: 'Palavra-chave, assunto ou dúvida sobre regra do colégio.',
        },
      },
      required: ['termoOuTema'],
    },
  },
  {
    name: 'consultarAlunosOuTurma',
    description:
      'Busca alunos por nome aproximado ou lista os alunos de uma turma, trazendo turma, tipo de contrato (regular/avulso), horário de saída e transporte.',
    parameters: {
      type: 'OBJECT',
      properties: {
        busca: {
          type: 'STRING',
          description: 'Nome parcial ou completo do aluno.',
        },
        turma: {
          type: 'STRING',
          description: 'Turma opcional para filtrar.',
        },
      },
    },
  },
  {
    name: 'consultarQuadroAtribuicoes',
    description:
      'Consulta quem são as monitoras titulares, assistentes, ADIs, horários de turno e salas base no Quadro de Atribuições.',
    parameters: {
      type: 'OBJECT',
      properties: {
        turma: {
          type: 'STRING',
          description: 'Turma opcional para filtrar.',
        },
        colaborador: {
          type: 'STRING',
          description: 'Nome da monitora/ADI opcional para saber qual turma atende.',
        },
      },
    },
  },
  {
    name: 'consultarLivroPonto',
    description:
      'Consulta os registros do Livro Ponto de um colaborador ou do dia (entradas, intervalos, saídas e registros em aberto).',
    parameters: {
      type: 'OBJECT',
      properties: {
        colaborador: {
          type: 'STRING',
          description: 'Nome opcional do colaborador.',
        },
        data: {
          type: 'STRING',
          description: 'Data opcional YYYY-MM-DD. Padrão: hoje.',
        },
      },
    },
  },
  {
    name: 'navegarModulo',
    description:
      'Abre uma aba/tela do aplicativo para o usuário (Atividades do Momento, Chamada, Semanário, Livro Ponto, Cardápio, Alunos, Relatórios, Financeiro ou Manual).',
    parameters: {
      type: 'OBJECT',
      properties: {
        modulo: {
          type: 'STRING',
          description: 'Aba de destino: momento, frequencia, semanario, ponto, cardapio, alunos, financeiro, relatorio, manual.',
          enum: ['momento', 'frequencia', 'semanario', 'ponto', 'cardapio', 'alunos', 'financeiro', 'relatorio', 'manual'],
        },
      },
      required: ['modulo'],
    },
  },
  {
    name: 'gerarEspelhoPontoPDF',
    description:
      'Gera o Espelho de Ponto oficial em PDF de um colaborador para determinado mês e ano.',
    parameters: {
      type: 'OBJECT',
      properties: {
        colaboradorId: {
          type: 'STRING',
          description: 'Nome completo ou e-mail do colaborador.',
        },
        mesAno: {
          type: 'STRING',
          description: 'Mês e ano no formato MM/AAAA ou YYYY-MM.',
        },
      },
      required: ['colaboradorId', 'mesAno'],
    },
  },
  {
    name: 'gerarAutorizacaoEntradaSaidaPDF',
    description:
      'Gera documento oficial de Autorização de Entrada com Atraso ou Saída Antecipada de um aluno em PDF.',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: {
          type: 'STRING',
          description: 'Nome completo ou identificador do aluno.',
        },
        motivo: {
          type: 'STRING',
          description: '"atraso" ou "saida_antecipada".',
          enum: ['atraso', 'saida_antecipada'],
        },
        horario: {
          type: 'STRING',
          description: 'Horário do registro (ex: "14:15").',
        },
        justificativa: {
          type: 'STRING',
          description: 'Observação ou motivo informado.',
        },
      },
      required: ['alunoId', 'motivo', 'horario'],
    },
  },
  {
    name: 'registrarFaltaFrequencia',
    description:
      'Registra a falta de um aluno na lista de chamada do dia com justificativa opcional.',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: {
          type: 'STRING',
          description: 'Nome completo ou identificador do aluno.',
        },
        data: {
          type: 'STRING',
          description: 'Data da falta no formato YYYY-MM-DD.',
        },
        justificativa: {
          type: 'STRING',
          description: 'Motivo da ausência.',
        },
      },
      required: ['alunoId', 'data'],
    },
  },
  {
    name: 'dispararAlertaWhatsApp',
    description:
      'Prepara uma mensagem rápida para WhatsApp da equipe ou coordenação.',
    parameters: {
      type: 'OBJECT',
      properties: {
        destinatario: {
          type: 'STRING',
          description: 'Telefone com DDD, nome do contato ou "coordenacao".',
        },
        mensagem: {
          type: 'STRING',
          description: 'Texto da mensagem pronta para envio.',
        },
      },
      required: ['destinatario', 'mensagem'],
    },
  },
  {
    name: 'analisarDesarranjosDoDia',
    description:
      'Diagnostica o estado ao vivo do Integral: turmas com chamadas pendentes hoje, presenças, faltas e registros de ponto em aberto.',
    parameters: {
      type: 'OBJECT',
      properties: {
        foco: {
          type: 'STRING',
          description: 'Foco opcional: "geral", "frequencia" ou "ponto".',
        },
      },
    },
  },
  {
    name: 'gerarTermoSaidaAvulsa',
    description:
      'Registra a liberação antecipada de um aluno na portaria com dados de quem retira e gera o Termo de Saída Avulsa em PDF.',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: {
          type: 'STRING',
          description: 'Nome do aluno.',
        },
        nomeRetirante: {
          type: 'STRING',
          description: 'Nome completo da pessoa que está retirando o aluno.',
        },
        documentoRetirante: {
          type: 'STRING',
          description: 'RG ou CPF de quem está retirando.',
        },
        parentesco: {
          type: 'STRING',
          description: 'Parentesco ou vínculo.',
        },
        motivoSaida: {
          type: 'STRING',
          description: 'Motivo da saída antecipada.',
        },
        horarioSaida: {
          type: 'STRING',
          description: 'Horário do registro.',
        },
      },
      required: ['alunoId', 'nomeRetirante'],
    },
  },
  {
    name: 'alterarAnoLetivoAluno',
    description:
      'Realiza a rematrícula ou troca de ano letivo de um aluno (2026 ou 2027). Requer perfil administrativo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: {
          type: 'STRING',
          description: 'Nome completo do aluno.',
        },
        novoAnoLetivo: {
          type: 'INTEGER',
          description: 'Ano letivo de destino (2026 ou 2027).',
        },
      },
      required: ['alunoId', 'novoAnoLetivo'],
    },
  },
  {
    name: 'consultarResumoFinanceiro',
    description:
      'Retorna os indicadores financeiros do Programa Integral para determinado ano letivo. Exclusivo para Coordenação/Direção.',
    parameters: {
      type: 'OBJECT',
      properties: {
        anoLetivo: {
          type: 'INTEGER',
          description: 'Ano letivo (2026 ou 2027).',
        },
      },
    },
  },
  {
    name: 'cadastrarAluno',
    description:
      'Cadastra um novo aluno no Integral. Requer permissão de gestão de alunos.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nome: { type: 'STRING', description: 'Nome completo do aluno' },
        turmaId: { type: 'STRING', description: 'Nome da turma' },
        responsavel: { type: 'STRING', description: 'Nome do responsável' },
        telefone: { type: 'STRING', description: 'Telefone de contato' },
        horarioEntradaSaida: { type: 'STRING', description: 'Horário contratual' },
      },
      required: ['nome', 'turmaId', 'responsavel', 'telefone'],
    },
  },
  {
    name: 'editarAluno',
    description:
      'Atualiza dados de um aluno existente. Requer permissão de gestão de alunos.',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: { type: 'STRING', description: 'Nome ou identificador do aluno' },
        dadosAtualizados: {
          type: 'OBJECT',
          description: 'Campos a atualizar',
        },
      },
      required: ['alunoId', 'dadosAtualizados'],
    },
  },
  {
    name: 'cadastrarUsuario',
    description:
      'Registra um novo colaborador no sistema. Exclusivo para Coordenação/Administração.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nome: { type: 'STRING', description: 'Nome completo do colaborador' },
        email: { type: 'STRING', description: 'E-mail do colaborador' },
        funcao: { type: 'STRING', description: 'Função no Integral' },
        cargo: { type: 'STRING', description: 'Cargo' },
        perfil: {
          type: 'STRING',
          description: 'Perfil: ADMIN, MONITOR ou ADI',
          enum: ['ADMIN', 'MONITOR', 'ADI'],
        },
      },
      required: ['nome', 'email', 'funcao', 'cargo', 'perfil'],
    },
  },
  {
    name: 'gerarListaChamadaPDF',
    description:
      'Gera o PDF da lista de chamada nominal de uma turma.',
    parameters: {
      type: 'OBJECT',
      properties: {
        turmaId: { type: 'STRING', description: 'Nome da turma' },
      },
      required: ['turmaId'],
    },
  },
  {
    name: 'lancarFrequenciaTurma',
    description:
      'Lança a chamada de uma turma em determinada data.',
    parameters: {
      type: 'OBJECT',
      properties: {
        turmaId: { type: 'STRING', description: 'Nome da turma' },
        data: { type: 'STRING', description: 'Data YYYY-MM-DD' },
        chamadas: {
          type: 'ARRAY',
          description: 'Lista de alunos com booleano presente',
          items: {
            type: 'OBJECT',
            properties: {
              alunoId: { type: 'STRING', description: 'Nome ou identificador do aluno' },
              presente: { type: 'BOOLEAN', description: 'true para presença, false para falta' },
              observation: { type: 'STRING', description: 'Observação opcional' },
            },
            required: ['alunoId', 'presente'],
          },
        },
      },
      required: ['turmaId', 'data', 'chamadas'],
    },
  },
  {
    name: 'cadastrarRefeicaoCardapio',
    description:
      'Cadastra ou atualiza uma refeição (Almoço ou Lanche) no cardápio de uma data. Requer permissão de cardápio/coordenação.',
    parameters: {
      type: 'OBJECT',
      properties: {
        data: { type: 'STRING', description: 'Data YYYY-MM-DD ou DD/MM/YYYY' },
        tipo: {
          type: 'STRING',
          description: 'Almoço ou Lanche',
          enum: ['Almoço', 'Lanche'],
        },
        descricao: { type: 'STRING', description: 'Descrição da refeição' },
      },
      required: ['data', 'tipo', 'descricao'],
    },
  },
];

/**
 * Normaliza strings para busca insensível a maiúsculas, acentos e pontuações
 */
export function normalizeStr(str?: string): string {
  return (str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Realiza verificação aproximada (Fuzzy Match) entre duas expressões
 */
export function fuzzyMatch(target: string, query: string): boolean {
  const tNorm = normalizeStr(target);
  const qNorm = normalizeStr(query);
  if (!tNorm || !qNorm) return false;
  if (tNorm.includes(qNorm) || qNorm.includes(tNorm)) return true;

  const queryWords = qNorm.split(/\s+/).filter((w) => w.length >= 3);
  if (queryWords.length > 0 && queryWords.every((w) => tNorm.includes(w))) {
    return true;
  }
  return false;
}

/**
 * Localiza turma por busca aproximada (Fuzzy Search)
 */
export function findTurmaFuzzy(turmas: string[], query: string): string | undefined {
  if (!query) return undefined;
  const qNorm = normalizeStr(query);

  const exact = turmas.find((t) => normalizeStr(t) === qNorm);
  if (exact) return exact;

  const sub = turmas.find((t) => normalizeStr(t).includes(qNorm) || qNorm.includes(normalizeStr(t)));
  if (sub) return sub;

  if (qNorm.includes('mini')) return turmas.find((t) => normalizeStr(t).includes('mini')) || 'Mini Maternal Azul';
  if (qNorm.includes('maternal')) return turmas.find((t) => normalizeStr(t).includes('maternal') && !normalizeStr(t).includes('mini')) || 'Maternal Azul';
  if (qNorm.includes('infantil 1') || qNorm.includes('infantil i')) return turmas.find((t) => normalizeStr(t).includes('infantil 1') || normalizeStr(t).includes('infantil i')) || 'Infantil 1';
  if (qNorm.includes('infantil 2') || qNorm.includes('infantil ii')) return turmas.find((t) => normalizeStr(t).includes('infantil 2') || normalizeStr(t).includes('infantil ii')) || 'Infantil 2';
  if (qNorm.includes('1') && (qNorm.includes('ano') || qNorm.includes('laranja') || qNorm.includes('azul'))) {
    if (qNorm.includes('laranja')) return turmas.find((t) => normalizeStr(t).includes('1') && normalizeStr(t).includes('laranja')) || '1º Ano Laranja';
    return turmas.find((t) => normalizeStr(t).includes('1') && normalizeStr(t).includes('ano')) || '1º Ano Azul';
  }
  if (qNorm.includes('2') && qNorm.includes('ano')) return turmas.find((t) => normalizeStr(t).includes('2') && normalizeStr(t).includes('ano')) || '2º Ano Azul';
  if (qNorm.includes('3') && qNorm.includes('ano')) return turmas.find((t) => normalizeStr(t).includes('3') && normalizeStr(t).includes('ano')) || '3º Ano';
  if (qNorm.includes('4') && qNorm.includes('ano')) return turmas.find((t) => normalizeStr(t).includes('4') && normalizeStr(t).includes('ano')) || '4º Ano';
  if (qNorm.includes('5') && qNorm.includes('ano')) return turmas.find((t) => normalizeStr(t).includes('5') && normalizeStr(t).includes('ano')) || '5º Ano';

  return undefined;
}

/**
 * Busca todos os alunos candidatos para detectar ambiguidades (homônimos como "dois Pedros").
 */
export function findMatchingStudents(students: Student[], query: string, turmaFilter?: string): Student[] {
  if (!query || !students || students.length === 0) return [];
  const qClean = query.trim();
  const qNorm = normalizeStr(qClean);
  const tNorm = turmaFilter ? normalizeStr(turmaFilter) : '';

  const activePool = students.filter((s) => (s.status || s.statusMatricula || 'ativo') === 'ativo');
  const pool = activePool.length > 0 ? activePool : students;
  const scopedPool = tNorm
    ? pool.filter((s) => {
        const st = normalizeStr(s.turma);
        return st.includes(tNorm) || tNorm.includes(st);
      })
    : pool;
  const effectivePool = scopedPool.length > 0 ? scopedPool : pool;

  const byId = effectivePool.filter((s) => s.id === qClean);
  if (byId.length > 0) return byId;

  const exactName = effectivePool.filter((s) => normalizeStr(s.name) === qNorm);
  if (exactName.length > 0) return exactName;

  const substringMatches = effectivePool.filter(
    (s) => normalizeStr(s.name).includes(qNorm) || qNorm.includes(normalizeStr(s.name))
  );
  if (substringMatches.length > 0) return deduplicateMatchedNames(substringMatches);

  const queryTokens = qNorm.split(/\s+/).filter((t) => t.length >= 2);
  if (queryTokens.length > 0) {
    const allTokens = effectivePool.filter((s) => {
      const sTokens = normalizeStr(s.name).split(/\s+/);
      return queryTokens.every((qt) => sTokens.some((st) => st.startsWith(qt) || st.includes(qt)));
    });
    if (allTokens.length > 0) return deduplicateMatchedNames(allTokens);

    const firstTokenMatches = effectivePool.filter((s) => {
      const sTokens = normalizeStr(s.name).split(/\s+/);
      return sTokens.some((st) => st === queryTokens[0] || st.startsWith(queryTokens[0]));
    });
    if (firstTokenMatches.length > 0) return deduplicateMatchedNames(firstTokenMatches);
  }

  return [];
}

function deduplicateMatchedNames(list: Student[]): Student[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = `${normalizeStr(s.name)}__${normalizeStr(s.turma)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Localiza aluno por identificador ou correspondência de nome aproximada
 */
export function findStudent(students: Student[], query: string): Student | undefined {
  const matches = findMatchingStudents(students, query);
  return matches[0];
}

/**
 * Localiza colaborador institucional
 */
async function findCollaborator(query: string, usersList?: UserProfile[]): Promise<UserProfile | undefined> {
  const users = usersList && usersList.length > 0 ? usersList : await getUsers();
  const qNorm = normalizeStr(query);

  return users.find(
    (u) =>
      u.id === query ||
      normalizeStr(u.email) === qNorm ||
      normalizeStr(u.name) === qNorm ||
      normalizeStr(u.name).includes(qNorm)
  );
}

/**
 * Verifica se o usuário atual tem acesso a uma turma (coordenador vê tudo; monitora/professora vê suas turmas ou todas se sem restrição).
 */
function filterTurmasByUserScope(turmas: string[], user?: UserProfile | null): string[] {
  if (!user || isAdmin(user)) return turmas;
  const assigned = [
    ...(Array.isArray(user.allowedClassIds) ? user.allowedClassIds : []),
    ...(Array.isArray(user.assignedTurmas) ? user.assignedTurmas : []),
  ].filter(Boolean);
  if (assigned.length === 0) return turmas;
  return turmas.filter((t) => assigned.some((a) => normalizeStr(a) === normalizeStr(t)));
}

/**
 * Gera PDF de Autorização de Entrada/Saída com cabeçalho oficial do Colégio Crescer
 */
function generateAutorizacaoPDFBlob(params: {
  student: Student;
  motivo: 'atraso' | 'saida_antecipada';
  horario: string;
  data: string;
  justificativa?: string;
  emissor?: string;
}): { filename: string; blobUrl: string } {
  const pdfDoc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const isAtraso = params.motivo === 'atraso';
  const tipoTitulo = isAtraso
    ? 'AUTORIZAÇÃO DE ENTRADA COM ATRASO'
    : 'AUTORIZAÇÃO DE SAÍDA ANTECIPADA';

  pdfDoc.setFillColor(15, 23, 42);
  pdfDoc.rect(0, 0, 210, 36, 'F');

  pdfDoc.setTextColor(255, 255, 255);
  pdfDoc.setFont('helvetica', 'bold');
  pdfDoc.setFontSize(16);
  pdfDoc.text('COLÉGIO CRESCER • PROGRAMA INTEGRAL', 105, 16, { align: 'center' });

  pdfDoc.setFontSize(11);
  pdfDoc.setFont('helvetica', 'normal');
  pdfDoc.setTextColor(203, 213, 225);
  pdfDoc.text('Protocolo de Registro e Controle Institucional de Portaria', 105, 25, { align: 'center' });

  pdfDoc.setFillColor(241, 245, 249);
  pdfDoc.rect(15, 44, 180, 14, 'F');
  pdfDoc.setDrawColor(203, 213, 225);
  pdfDoc.rect(15, 44, 180, 14, 'S');

  pdfDoc.setTextColor(30, 41, 59);
  pdfDoc.setFont('helvetica', 'bold');
  pdfDoc.setFontSize(12);
  pdfDoc.text(tipoTitulo, 105, 53, { align: 'center' });

  let y = 70;
  const lineSpacing = 11;
  pdfDoc.setFontSize(10);
  pdfDoc.setTextColor(71, 85, 105);

  const drawField = (label: string, value: string) => {
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text(`${label}:`, 20, y);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.setTextColor(15, 23, 42);
    pdfDoc.text(value, 65, y);
    pdfDoc.setTextColor(71, 85, 105);
    y += lineSpacing;
  };

  const protocolo = `AUT-${Date.now().toString().slice(-6)}`;
  drawField('Número do Protocolo', protocolo);
  drawField('Nome do Aluno(a)', params.student.name);
  drawField('Turma', params.student.turma || 'Programa Integral');
  drawField('Data', formatDateBR(params.data));
  drawField('Horário', params.horario);
  drawField('Tipo', isAtraso ? 'Entrada com Atraso' : 'Saída Antecipada');
  drawField('Motivo', params.justificativa || 'Autorizado pela Coordenação do Integral');
  drawField('Registrado por', params.emissor || 'Sofia • Integral Crescer');

  y += 6;
  pdfDoc.setFillColor(248, 250, 252);
  pdfDoc.setDrawColor(226, 232, 240);
  pdfDoc.roundedRect(15, y, 180, 36, 3, 3, 'FD');

  pdfDoc.setFontSize(9);
  pdfDoc.setFont('helvetica', 'italic');
  pdfDoc.setTextColor(71, 85, 105);
  const termo =
    'O presente documento atesta o registro formal junto à Portaria e Coordenação do Programa Integral, em conformidade com as normas de segurança institucional do Colégio Crescer.';
  pdfDoc.text(pdfDoc.splitTextToSize(termo, 170), 20, y + 10);

  y += 65;
  pdfDoc.setDrawColor(148, 163, 184);
  pdfDoc.line(25, y, 95, y);
  pdfDoc.line(115, y, 185, y);

  pdfDoc.setFontSize(9);
  pdfDoc.setFont('helvetica', 'normal');
  pdfDoc.setTextColor(51, 65, 85);
  pdfDoc.text('Assinatura do Responsável', 60, y + 6, { align: 'center' });
  pdfDoc.text('Visto da Coordenação do Integral', 150, y + 6, { align: 'center' });

  pdfDoc.setFontSize(8);
  pdfDoc.setTextColor(148, 163, 184);
  pdfDoc.text(
    `Emitido em ${new Date().toLocaleString('pt-BR')} • Colégio Crescer`,
    105,
    285,
    { align: 'center' }
  );

  const filename = `Autorizacao_${params.motivo}_${params.student.name.replace(/\s+/g, '_')}_${params.data}.pdf`;
  const blob = pdfDoc.output('blob');
  const blobUrl = URL.createObjectURL(blob);

  return { filename, blobUrl };
}

/**
 * Executor Central das Ferramentas da Sofia
 */
export async function executeSofiaTool(
  toolName: SofiaAgentToolName,
  args: Record<string, any>,
  context: SofiaToolExecutionContext
): Promise<SofiaToolResult> {
  const currentDate = context.selectedDate || toISODateString(new Date());
  const isUserAdmin = isAdmin(context.currentUser);

  switch (toolName) {
    // -------------------------------------------------------------------
    // consultarAtividadesMomento(turma?, horarioSimulado?, data?)
    // -------------------------------------------------------------------
    case 'consultarAtividadesMomento': {
      const targetDate = args.data ? normalizeDateInput(String(args.data)) : currentDate;
      const now = new Date();
      const refTime = normalizeTime(args.horarioSimulado) ||
        now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const refTimeLabel = formatHourPTBR(refTime);
      const dayFull = getDayOfWeekFullPTBR(targetDate);

      if (isWeekend(targetDate)) {
        return {
          toolName,
          success: true,
          message: `Em ${dayFull} (${formatDateBR(targetDate)}) não há atividades do Integral na grade.`,
          spokenText: `Em ${dayFull} não temos atividades programadas no Integral.`,
        };
      }

      const holiday = isHolidayOrRecess(targetDate, context.holidays || []);
      if (holiday) {
        return {
          toolName,
          success: true,
          message: `${formatDateBR(targetDate)} (${dayFull}) está marcado como ${holiday.type === 'feriado' ? 'feriado' : 'recesso'}: ${holiday.name}.`,
          spokenText: `Dia ${formatDateBR(targetDate)} é ${holiday.name}, sem atividades na grade.`,
        };
      }

      const dayOfWeek = getDayOfWeekFromDate(targetDate);
      const turmasList = context.activeTurmas && context.activeTurmas.length > 0
        ? context.activeTurmas
        : Array.from(new Set((context.students || []).map((s) => s.turma).filter(Boolean)));
      const allSchedules = context.schedules || [];
      const atribuicoes = context.quadroAtribuicoes && context.quadroAtribuicoes.length > 0
        ? context.quadroAtribuicoes
        : loadLocalQuadroAtribuicoes();
      const semanario = context.semanarioPlans && context.semanarioPlans.length > 0
        ? context.semanarioPlans
        : loadSemanarioPlans();

      if (args.turma) {
        const matchedTurma = findTurmaFuzzy(turmasList, String(args.turma)) || String(args.turma);
        const turmaBlocks = allSchedules.filter(
          (b) => normalizeStr(b.turma) === normalizeStr(matchedTurma) && b.dayOfWeek === dayOfWeek
        );
        const currentBlock = getCurrentActivityForTurma(turmaBlocks, refTime);
        const nextBlock = getNextSlot(turmaBlocks, refTime);
        const atrib = resolveAtribuicaoForTurma(matchedTurma, atribuicoes, context.users || []);
        const responsavel = [atrib.monitoraName, atrib.adiName].filter(Boolean).join(' e ');

        if (!currentBlock) {
          const nextInfo = nextBlock
            ? ` A próxima é ${nextBlock.activityId} às ${formatHourPTBR(extractSlotLimits(nextBlock).horaInicio)}.`
            : ' Não há mais blocos programados para hoje.';
          const msg = `${matchedTurma} está sem atividade marcada na grade às ${refTimeLabel}.${nextInfo}`;
          return {
            toolName,
            success: true,
            message: msg,
            spokenText: msg,
            data: { turma: matchedTurma, horario: refTime, atividadeAtual: null },
          };
        }

        const limits = extractSlotLimits(currentBlock);
        const semPlan = findMatchingSemanarioPlan(
          semanario,
          matchedTurma,
          targetDate,
          currentBlock
        );
        const local = currentBlock.location || atrib.espacoBase || '';
        const localPart = local ? ` (${local})` : '';
        const endPart = limits.horaFim ? `, até ${formatHourPTBR(limits.horaFim)}` : '';
        const respPart = responsavel ? ` Com ${responsavel}.` : '';
        const temaPart = semPlan?.title ? ` Proposta: ${semPlan.title}.` : '';
        const nextPart = nextBlock
          ? ` Depois vem ${nextBlock.activityId} às ${formatHourPTBR(extractSlotLimits(nextBlock).horaInicio)}.`
          : '';

        const msg = `${args.horarioSimulado ? `Às ${refTimeLabel}` : `Agora, às ${refTimeLabel}`}, o ${matchedTurma} está em ${currentBlock.activityId}${localPart}${endPart}.${respPart}${temaPart}${nextPart}`;
        return {
          toolName,
          success: true,
          message: msg,
          spokenText: msg,
          data: {
            turma: matchedTurma,
            horario: refTime,
            atividadeAtual: currentBlock.activityId,
            local,
            ate: limits.horaFim,
            responsavel,
          },
        };
      }

      // Panorama geral das turmas
      const emAtividade: string[] = [];
      const semAtividade: string[] = [];
      turmasList.forEach((t) => {
        const blocks = allSchedules.filter(
          (b) => normalizeStr(b.turma) === normalizeStr(t) && b.dayOfWeek === dayOfWeek
        );
        const cur = getCurrentActivityForTurma(blocks, refTime);
        if (cur) {
          const limits = extractSlotLimits(cur);
          const loc = cur.location ? ` (${cur.location})` : '';
          emAtividade.push(`• ${t}: ${cur.activityId}${loc} até ${formatHourPTBR(limits.horaFim)}`);
        } else {
          semAtividade.push(t);
        }
      });

      let msg = `${args.horarioSimulado ? `Simulação para ${refTimeLabel}` : `Agora, às ${refTimeLabel}`} (${dayFull}): ${emAtividade.length} turma(s) em atividade`;
      if (semAtividade.length > 0) {
        msg += ` e ${semAtividade.length} sem atividade marcada na grade (${semAtividade.join(', ')})`;
      }
      msg += '.\n';
      if (emAtividade.length > 0) {
        msg += emAtividade.join('\n');
      }

      return {
        toolName,
        success: true,
        message: msg,
        spokenText: `Agora às ${refTimeLabel}, temos ${emAtividade.length} turmas em atividade e ${semAtividade.length} sem atividade na grade.`,
        data: { horario: refTime, emAtividade, semAtividade },
      };
    }

    // -------------------------------------------------------------------
    // registrarSaidaAntecipada(alunoId, horario, turma?, justificativa?)
    // -------------------------------------------------------------------
    case 'registrarSaidaAntecipada': {
      const alunoQuery = String(args.alunoId || '').trim();
      const turmaQuery = args.turma ? String(args.turma).trim() : undefined;
      const rawHorario = String(args.horario || '').trim();
      const normalizedHorario = normalizeTime(rawHorario) || rawHorario;
      const horarioDisplay = formatHourPTBR(normalizedHorario) || rawHorario;

      if (!alunoQuery) {
        return {
          toolName,
          success: false,
          message: 'De qual aluno é a saída antecipada?',
        };
      }

      const matches = findMatchingStudents(context.students || [], alunoQuery, turmaQuery);
      if (matches.length === 0) {
        return {
          toolName,
          success: false,
          message: turmaQuery
            ? `Não achei nenhum "${alunoQuery}" no ${turmaQuery}. Quer que eu procure em todas as turmas?`
            : `Não achei nenhum "${alunoQuery}" nas turmas do Integral. Pode conferir o nome?`,
        };
      }

      if (matches.length > 1) {
        const opts = matches.slice(0, 5).map((s) => `${s.name} (${s.turma})`).join(' ou ');
        return {
          toolName,
          success: false,
          needsDisambiguation: true,
          message: `Tenho mais de um aluno com esse nome: ${opts}. Qual deles vai sair às ${horarioDisplay}?`,
          data: { options: matches.map((s) => ({ name: s.name, turma: s.turma })) },
        };
      }

      const student = matches[0];
      if (!normalizedHorario) {
        return {
          toolName,
          success: false,
          message: `Qual horário o(a) ${student.name} (${student.turma}) vai sair?`,
        };
      }

      if (!context.onSaveRecord) {
        return {
          toolName,
          success: false,
          message: 'Não consegui salvar a saída agora. Quer que eu tente de novo?',
        };
      }

      const parsedDate = new Date(`${currentDate}T12:00:00`);
      const year = parsedDate.getFullYear() || new Date().getFullYear();
      const firstJan = new Date(year, 0, 1);
      const pastDays = (parsedDate.getTime() - firstJan.getTime()) / 86400000;
      const weekNumber = Math.max(1, Math.ceil((pastDays + firstJan.getDay() + 1) / 7)) || 1;

      await context.onSaveRecord({
        studentId: student.id,
        turma: student.turma,
        date: currentDate,
        weekNumber,
        year,
        status: 'saida_antecipada',
        activity: 'Rotina',
        exitTime: normalizedHorario,
        observation: args.justificativa
          ? `Saída antecipada às ${horarioDisplay}: ${args.justificativa}`
          : `Saída antecipada registrada para às ${horarioDisplay}`,
      });

      const atribuicoes = context.quadroAtribuicoes && context.quadroAtribuicoes.length > 0
        ? context.quadroAtribuicoes
        : loadLocalQuadroAtribuicoes();
      const atrib = resolveAtribuicaoForTurma(student.turma, atribuicoes, context.users || []);
      const monitoraHint = atrib.monitoraName ? ` (${atrib.monitoraName})` : '';

      return {
        toolName,
        success: true,
        message: `Anotado! Registrei a saída antecipada de ${student.name} (${student.turma}) hoje às ${horarioDisplay}. Quer que eu prepare um aviso para a monitora da turma${monitoraHint}?`,
        spokenText: `Anotado! Registrei a saída antecipada de ${student.name} hoje às ${horarioDisplay}.`,
        data: {
          aluno: student.name,
          turma: student.turma,
          horario: normalizedHorario,
        },
      };
    }

    // -------------------------------------------------------------------
    // consultarCardapio(data?, turma?)
    // -------------------------------------------------------------------
    case 'consultarCardapio': {
      const rawData = String(args.data || '').trim().toLowerCase();
      let targetDate = currentDate;
      if (rawData === 'amanha' || rawData === 'amanhã') {
        const d = new Date(`${currentDate}T12:00:00`);
        d.setDate(d.getDate() + 1);
        targetDate = toISODateString(d);
      } else if (rawData && rawData !== 'hoje') {
        targetDate = normalizeDateInput(rawData);
      }

      const [yearStr, monthStr] = targetDate.split('-');
      const monthKey = `${yearStr}-${monthStr}`;
      const menu = loadMonthlyMenu(monthKey);
      const dayItem = menu?.days?.[targetDate];
      const dayFull = getDayOfWeekFullPTBR(targetDate);

      if (!dayItem) {
        return {
          toolName,
          success: true,
          message: `Ainda não há cardápio preenchido para ${dayFull} (${formatDateBR(targetDate)}). Quer que eu abra a aba de Cardápio para você conferir ou lançar?`,
          spokenText: `Ainda não há cardápio cadastrado para ${dayFull}.`,
        };
      }

      if (dayItem.isHoliday) {
        return {
          toolName,
          success: true,
          message: `${dayFull} (${formatDateBR(targetDate)}) está marcado como ${dayItem.holidayDescription || 'feriado/recesso'}, sem refeições programadas.`,
        };
      }

      const parts: string[] = [];
      if (dayItem.protein) parts.push(`Prato principal: ${dayItem.protein}`);
      if (Array.isArray(dayItem.base) && dayItem.base.length > 0) parts.push(`Base: ${dayItem.base.join(', ')}`);
      if (dayItem.garnish) parts.push(`Guarnição: ${dayItem.garnish}`);
      if (dayItem.salad) parts.push(`Salada: ${dayItem.salad}`);
      if (dayItem.dessert) parts.push(`Sobremesa: ${dayItem.dessert}`);
      if (dayItem.specialNotes) parts.push(dayItem.specialNotes);

      // Verifica restrições/alergias em observações dos alunos da turma (se houver)
      const allergyKeywords = ['alerg', 'intoler', 'lactose', 'gluten', 'glúten', 'aplv', 'ovo', 'amendoim', 'restric', 'restriç'];
      const scopeTurma = args.turma ? normalizeStr(args.turma) : '';
      const studentsWithRestrictions = (context.students || []).filter((s) => {
        if ((s.status || s.statusMatricula || 'ativo') !== 'ativo') return false;
        if (scopeTurma && !normalizeStr(s.turma).includes(scopeTurma)) return false;
        const n = normalizeStr(s.notes);
        return allergyKeywords.some((kw) => n.includes(kw));
      });

      let msg = `${rawData === 'amanha' || rawData === 'amanhã' ? 'Amanhã' : 'Hoje'} é ${dayFull} (${formatDateBR(targetDate)}): ${parts.length > 0 ? parts.join(' • ') : 'itens ainda não detalhados'}.`;
      if (studentsWithRestrictions.length > 0) {
        const namesList = isUserAdmin
          ? studentsWithRestrictions.slice(0, 4).map((s) => `${s.name} (${s.turma})`).join(', ')
          : `${studentsWithRestrictions.length} aluno(s)`;
        msg += `\nAtenção: há registro de restrição alimentar para ${namesList}. Vale confirmar com a cozinha antes de servir.`;
      } else {
        msg += ' Tem algum aluno com restrição na sua turma? Posso conferir para você.';
      }

      return {
        toolName,
        success: true,
        message: msg,
        spokenText: msg,
        data: { date: targetDate, dayItem, restrictionsCount: studentsWithRestrictions.length },
      };
    }

    // -------------------------------------------------------------------
    // consultarSemanario(turma?, data?)
    // -------------------------------------------------------------------
    case 'consultarSemanario': {
      const targetDate = args.data ? normalizeDateInput(String(args.data)) : currentDate;
      const plans = context.semanarioPlans && context.semanarioPlans.length > 0
        ? context.semanarioPlans
        : loadSemanarioPlans();
      const turmasList = context.activeTurmas || [];
      const matchedTurma = args.turma
        ? findTurmaFuzzy(turmasList, String(args.turma)) || String(args.turma)
        : undefined;

      const filtered = plans.filter((p) => {
        if (p.date !== targetDate) return false;
        if (matchedTurma && normalizeStr(p.turma) !== normalizeStr(matchedTurma)) return false;
        return true;
      });

      if (filtered.length === 0) {
        return {
          toolName,
          success: true,
          message: matchedTurma
            ? `Não encontrei planejamento salvo no Semanário do ${matchedTurma} para ${formatDateBR(targetDate)}. Quer que eu abra o Semanário ou sugira uma atividade?`
            : `Não há atividades registradas no Semanário para ${formatDateBR(targetDate)}. Quer que eu abra o Semanário?`,
        };
      }

      const lines = filtered.slice(0, 6).map((p) => {
        const hora = p.horaInicio || (p.timeSlot ? p.timeSlot.split('-')[0]?.trim() : '');
        const horaStr = hora ? `${formatHourPTBR(hora)} — ` : '';
        const mat = p.materials ? ` (Materiais: ${p.materials})` : '';
        return `• ${horaStr}${p.turma}: ${p.title || p.category}${mat}`;
      });

      const extra = filtered.length > 6 ? `\nE mais ${filtered.length - 6} atividade(s) no Semanário.` : '';
      return {
        toolName,
        success: true,
        message: `No Semanário de ${getDayOfWeekFullPTBR(targetDate)} (${formatDateBR(targetDate)}):\n${lines.join('\n')}${extra}`,
        data: { date: targetDate, count: filtered.length },
      };
    }

    // -------------------------------------------------------------------
    // consultarManualNormas(termoOuTema)
    // -------------------------------------------------------------------
    case 'consultarManualNormas': {
      const termo = normalizeStr(args.termoOuTema || '');
      const tokens = termo.split(/\s+/).filter((t) => t.length >= 3);

      let bestMatch = NORMAS_DATA[0];
      let bestScore = 0;

      NORMAS_DATA.forEach((n) => {
        const titleN = normalizeStr(n.title);
        const sumN = normalizeStr(n.summary);
        const secN = normalizeStr(n.sectionTitle);
        const modN = normalizeStr(n.moduleTitle);
        const tagsN = Array.isArray(n.tags) ? n.tags.map(normalizeStr).join(' ') : '';
        const blob = `${titleN} ${secN} ${modN} ${tagsN} ${sumN}`;

        let score = 0;
        if (blob.includes(termo)) score += 10;
        tokens.forEach((tk) => {
          if (titleN.includes(tk)) score += 4;
          if (tagsN.includes(tk)) score += 3;
          if (sumN.includes(tk) || secN.includes(tk)) score += 2;
        });

        if (score > bestScore) {
          bestScore = score;
          bestMatch = n;
        }
      });

      if (bestScore === 0) {
        return {
          toolName,
          success: false,
          message: `Não achei uma regra exata sobre "${args.termoOuTema}" no Manual. Quer que eu abra o Manual de Normas para você dar uma olhada ou me explica melhor a situação?`,
        };
      }

      return {
        toolName,
        success: true,
        message: `Pelo nosso Manual (${bestMatch.title}): ${bestMatch.summary}\nSe precisar, posso abrir a página do Manual para você.`,
        spokenText: `Pelo Manual do Colégio Crescer, sobre ${bestMatch.title}: ${bestMatch.summary.slice(0, 180)}`,
        data: { section: bestMatch.sectionNumber, title: bestMatch.title },
      };
    }

    // -------------------------------------------------------------------
    // consultarAlunosOuTurma(busca?, turma?)
    // -------------------------------------------------------------------
    case 'consultarAlunosOuTurma': {
      const busca = String(args.busca || '').trim();
      const turmaArg = String(args.turma || '').trim();
      const turmasList = context.activeTurmas || [];
      const matchedTurma = turmaArg ? (findTurmaFuzzy(turmasList, turmaArg) || turmaArg) : '';

      const activeStudents = (context.students || []).filter((s) =>
        isStudentActiveOnDate(s, currentDate)
      );

      if (busca) {
        const matches = findMatchingStudents(activeStudents, busca, matchedTurma);
        if (matches.length === 0) {
          return {
            toolName,
            success: false,
            message: matchedTurma
              ? `Não achei nenhum "${busca}" no ${matchedTurma}. Quer que eu procure em todas as turmas?`
              : `Não achei nenhum aluno chamado "${busca}" no cadastro ativo.`,
          };
        }

        const lines = matches.slice(0, 6).map((s) => {
          const dayKey = getDayOfWeekFromDate(currentDate);
          const saida = s.horariosSaida?.[dayKey] || s.horarioSaida || s.horarioPermanenciaLimite || '18h30';
          const tipo = s.tipoContrato === 'avulso' ? ' • Avulso' : '';
          const van = s.tipoSaida === 'TRANSPORTE_ESCOLAR'
            ? ` • Vai de van${s.nomeCondutor ? ` (${s.nomeCondutor})` : ''}`
            : '';
          const notesPart = isUserAdmin && s.notes ? ` • Obs: ${s.notes}` : '';
          return `• ${s.name} — ${s.turma}${tipo} • Saída: ${formatHourPTBR(saida) || saida}${van}${notesPart}`;
        });

        return {
          toolName,
          success: true,
          message: matches.length === 1
            ? lines[0].replace(/^•\s*/, '')
            : `Encontrei ${matches.length} aluno(s):\n${lines.join('\n')}`,
          data: { count: matches.length },
        };
      }

      if (matchedTurma) {
        const allowed = filterTurmasByUserScope([matchedTurma], context.currentUser);
        if (allowed.length === 0) {
          return {
            toolName,
            success: false,
            message: `Você só tem acesso aos alunos das suas turmas vinculadas. Se precisar de outra turma, vale confirmar com a coordenação.`,
          };
        }

        const turmaStudents = activeStudents.filter(
          (s) => normalizeStr(s.turma) === normalizeStr(matchedTurma)
        );
        const expectedToday = turmaStudents.filter((s) => isStudentScheduledForDate(s, currentDate));
        const preview = expectedToday.slice(0, 8).map((s) => s.name).join(', ');
        const extra = expectedToday.length > 8 ? ` e mais ${expectedToday.length - 8}` : '';

        return {
          toolName,
          success: true,
          message: `O ${matchedTurma} tem ${turmaStudents.length} aluno(s) ativo(s), sendo ${expectedToday.length} esperado(s) hoje${expectedToday.length > 0 ? `: ${preview}${extra}.` : '.'}`,
          data: { turma: matchedTurma, total: turmaStudents.length, esperadosHoje: expectedToday.length },
        };
      }

      return {
        toolName,
        success: true,
        message: `Temos ${activeStudents.length} alunos ativos hoje no Integral. Quer que eu filtre por alguma turma ou nome específico?`,
      };
    }

    // -------------------------------------------------------------------
    // consultarQuadroAtribuicoes(turma?, colaborador?)
    // -------------------------------------------------------------------
    case 'consultarQuadroAtribuicoes': {
      const atribuicoes = context.quadroAtribuicoes && context.quadroAtribuicoes.length > 0
        ? context.quadroAtribuicoes
        : loadLocalQuadroAtribuicoes();
      const turmasList = context.activeTurmas || atribuicoes.map((a) => a.turma);

      if (args.turma) {
        const matched = findTurmaFuzzy(turmasList, String(args.turma)) || String(args.turma);
        const atrib = resolveAtribuicaoForTurma(matched, atribuicoes, context.users || []);
        const partes: string[] = [];
        if (atrib.monitoraName) partes.push(`Monitora: ${atrib.monitoraName}`);
        if (atrib.monitoraAssistenteName) partes.push(`Assistente: ${atrib.monitoraAssistenteName}`);
        if (atrib.adiName) partes.push(`ADI: ${atrib.adiName}`);
        if (atrib.horarioTurno) partes.push(`Turno: ${atrib.horarioTurno}`);
        if (atrib.espacoBase) partes.push(`Espaço: ${atrib.espacoBase}`);

        return {
          toolName,
          success: true,
          message: partes.length > 0
            ? `No ${atrib.turma}: ${partes.join(' • ')}.`
            : `Ainda não há equipe atribuída para o ${matched} no Quadro de Atribuições.`,
          data: atrib,
        };
      }

      if (args.colaborador) {
        const cNorm = normalizeStr(String(args.colaborador));
        const found = atribuicoes.filter(
          (a) =>
            normalizeStr(a.monitoraName).includes(cNorm) ||
            normalizeStr(a.monitoraAssistenteName).includes(cNorm) ||
            normalizeStr(a.adiName).includes(cNorm)
        );
        if (found.length === 0) {
          return {
            toolName,
            success: false,
            message: `Não encontrei "${args.colaborador}" atribuída a nenhuma turma hoje no Quadro de Atribuições.`,
          };
        }
        const desc = found.map((a) => `${a.turma}${a.horarioTurno ? ` (${a.horarioTurno})` : ''}`).join(', ');
        return {
          toolName,
          success: true,
          message: `${args.colaborador} está atribuída em: ${desc}.`,
          data: found,
        };
      }

      const filled = atribuicoes.filter((a) => a.monitoraName || a.adiName);
      if (filled.length === 0) {
        return {
          toolName,
          success: true,
          message: 'O Quadro de Atribuições ainda não tem monitoras/ADIs preenchidas aqui.',
        };
      }
      const lines = filled.slice(0, 8).map((a) => {
        const equipe = [a.monitoraName, a.adiName].filter(Boolean).join(' / ');
        return `• ${a.turma}: ${equipe}`;
      });
      return {
        toolName,
        success: true,
        message: `Atribuições de hoje:\n${lines.join('\n')}`,
      };
    }

    // -------------------------------------------------------------------
    // consultarLivroPonto(colaborador?, data?)
    // -------------------------------------------------------------------
    case 'consultarLivroPonto': {
      const targetDate = args.data ? normalizeDateInput(String(args.data)) : currentDate;
      const dayRecords = (context.pontoRecords || []).filter((r) => r.date === targetDate);
      const users = context.users && context.users.length > 0 ? context.users : await getUsers();

      // Segurança: colaboradores não-admin consultam apenas o próprio ponto
      const targetColab = args.colaborador ? String(args.colaborador).trim() : '';
      if (!isUserAdmin && targetColab && context.currentUser && !normalizeStr(context.currentUser.name).includes(normalizeStr(targetColab))) {
        return {
          toolName,
          success: false,
          message: 'Por privacidade da equipe, consigo consultar aqui apenas o seu próprio registro de ponto. Para outros colaboradores, fale com a coordenação.',
        };
      }

      const filteredRecords = !isUserAdmin && context.currentUser
        ? dayRecords.filter((r) => r.userId === context.currentUser!.id)
        : targetColab
        ? dayRecords.filter((r) => {
            const u = users.find((usr) => usr.id === r.userId);
            const rName = r.userName || u?.name || '';
            return normalizeStr(rName).includes(normalizeStr(targetColab));
          })
        : dayRecords;

      if (filteredRecords.length === 0) {
        return {
          toolName,
          success: true,
          message: targetColab
            ? `Não encontrei batida de ponto para ${targetColab} em ${formatDateBR(targetDate)}.`
            : `Ainda não há batidas de ponto registradas em ${formatDateBR(targetDate)}.`,
        };
      }

      const lines = filteredRecords.slice(0, 8).map((r) => {
        const u = users.find((usr) => usr.id === r.userId);
        const nome = r.userName || u?.name || 'Colaborador(a)';
        const e1 = r.entry1 || r.entrada_1 || '—';
        const s1 = r.exit1 || r.saida_1;
        const e2 = r.entry2 || r.entrada_2;
        const s2 = r.exit2 || r.saida_2;
        const intervalStr = s1 || e2 ? ` | Intervalo: ${s1 || '—'}–${e2 || '—'}` : '';
        const saidaStr = s2 ? ` | Saída: ${s2}` : ' (em aberto)';
        return `• ${nome}: Entrada ${e1}${intervalStr}${saidaStr}`;
      });

      return {
        toolName,
        success: true,
        message: `Registros do Livro Ponto em ${formatDateBR(targetDate)}:\n${lines.join('\n')}`,
      };
    }

    // -------------------------------------------------------------------
    // navegarModulo(modulo)
    // -------------------------------------------------------------------
    case 'navegarModulo': {
      const targetTab = String(args.modulo || 'momento') as TabType;
      if (context.currentUser && !isTabAllowed(targetTab, context.currentUser)) {
        return {
          toolName,
          success: false,
          message: 'Essa área não está liberada para o seu perfil de acesso. Se precisar, a coordenação pode liberar para você.',
        };
      }
      if (context.onNavigateTab) {
        context.onNavigateTab(targetTab);
      }
      const names: Record<string, string> = {
        momento: 'Atividades do Momento',
        frequencia: 'Chamada de Frequência',
        semanario: 'Semanário',
        ponto: 'Livro Ponto',
        cardapio: 'Cardápio e Culinária',
        alunos: 'Alunos e Turmas',
        financeiro: 'Financeiro',
        relatorio: 'Relatórios',
        manual: 'Manual e Normas',
      };
      return {
        toolName,
        success: true,
        message: `Abri a tela de ${names[targetTab] || targetTab} para você.`,
      };
    }

    // -------------------------------------------------------------------
    // 1. gerarEspelhoPontoPDF(colaboradorId, mesAno)
    // -------------------------------------------------------------------
    case 'gerarEspelhoPontoPDF': {
      const colaboradorQuery = args.colaboradorId || '';
      const mesAnoRaw = args.mesAno || '';

      if (!colaboradorQuery) {
        return {
          toolName,
          success: false,
          message: 'De qual colaborador você quer o Espelho de Ponto?',
        };
      }

      if (!isUserAdmin && context.currentUser && !normalizeStr(context.currentUser.name).includes(normalizeStr(colaboradorQuery))) {
        return {
          toolName,
          success: false,
          message: 'Só consigo gerar o espelho de ponto do seu próprio usuário. Para outro colaborador, fale com a coordenação.',
        };
      }

      const collaborator = await findCollaborator(colaboradorQuery, context.users);
      if (!collaborator) {
        return {
          toolName,
          success: false,
          message: `Não encontrei "${colaboradorQuery}" na lista de colaboradores. Quer conferir o nome?`,
        };
      }

      let targetMonth = new Date().getMonth() + 1;
      let targetYear = new Date().getFullYear();

      if (mesAnoRaw.includes('/')) {
        const parts = mesAnoRaw.split('/');
        targetMonth = parseInt(parts[0], 10);
        targetYear = parseInt(parts[1], 10);
      } else if (mesAnoRaw.includes('-')) {
        const parts = mesAnoRaw.split('-');
        targetYear = parseInt(parts[0], 10);
        targetMonth = parseInt(parts[1], 10);
      }

      if (isNaN(targetMonth) || isNaN(targetYear) || targetMonth < 1 || targetMonth > 12) {
        targetMonth = new Date().getMonth() + 1;
        targetYear = new Date().getFullYear();
      }

      const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
      const monthDaysGrid = [];
      const userRecords = (context.pontoRecords || []).filter(
        (r) => r.userId === collaborator.id
      );

      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayRec = userRecords.find((r) => r.date === dayStr);
        monthDaysGrid.push({
          date: dayStr,
          day,
          dayOfWeek: getDayOfWeekFromDate(dayStr),
          record: dayRec,
        });
      }

      const financials = calculateMonthlyPontoFinancials({
        records: userRecords,
        holidays: context.holidays || [],
        year: targetYear,
        month: targetMonth,
        regimeTrabalho: collaborator.regimeTrabalho || 'mensalista',
        baseSalary: collaborator.baseSalary || 1200,
        contractSchedule: collaborator.contractSchedule || (collaborator as any).assignedSchedule || '07:30 às 17:30',
      });

      try {
        const result = generateLivroPontoPDFReport({
          user: collaborator,
          month: targetMonth,
          year: targetYear,
          monthDaysGrid,
          financials,
          companyName: 'COLÉGIO CRESCER - CAMPINAS',
          institutionName: 'Programa do Integral',
          contractSchedule: collaborator.contractSchedule || (collaborator as any).assignedSchedule || '07:30 às 17:30',
          contractDailyHoursFormatted: '8h 00m',
          saveImmediately: false,
        });

        return {
          toolName,
          success: true,
          message: `Pronto! Gere o Espelho de Ponto de ${collaborator.name} (${getMonthNameBR(targetMonth)}/${targetYear}). É só baixar aqui embaixo.`,
          filename: result.filename,
          downloadUrl: result.blobUrl || result.dataUrl,
          data: {
            colaborador: collaborator.name,
            mes: targetMonth,
            ano: targetYear,
          },
        };
      } catch {
        return {
          toolName,
          success: false,
          message: 'Não consegui gerar o PDF do Espelho de Ponto agora. Quer que eu tente de novo?',
        };
      }
    }

    // -------------------------------------------------------------------
    // 2. gerarAutorizacaoEntradaSaidaPDF(alunoId, motivo, horario)
    // -------------------------------------------------------------------
    case 'gerarAutorizacaoEntradaSaidaPDF': {
      const alunoQuery = args.alunoId || '';
      const motivo: 'atraso' | 'saida_antecipada' =
        args.motivo === 'saida_antecipada' ? 'saida_antecipada' : 'atraso';
      const horario = args.horario || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const justificativa = args.justificativa;

      const matches = findMatchingStudents(context.students, alunoQuery);
      if (matches.length === 0) {
        return {
          toolName,
          success: false,
          message: `Não achei "${alunoQuery}" no cadastro. Pode conferir o nome completo?`,
        };
      }
      if (matches.length > 1) {
        const opts = matches.slice(0, 4).map((s) => `${s.name} (${s.turma})`).join(' ou ');
        return {
          toolName,
          success: false,
          needsDisambiguation: true,
          message: `Qual aluno você quer autorizar? ${opts}`,
        };
      }

      const student = matches[0];
      try {
        const { filename, blobUrl } = generateAutorizacaoPDFBlob({
          student,
          motivo,
          horario,
          data: currentDate,
          justificativa,
          emissor: context.currentUser?.name || 'Coordenação do Integral',
        });

        const rotulo = motivo === 'atraso' ? 'entrada com atraso' : 'saída antecipada';
        return {
          toolName,
          success: true,
          message: `Pronto! Preparei a autorização de ${rotulo} de ${student.name} (${student.turma}) para às ${formatHourPTBR(horario) || horario}.`,
          filename,
          downloadUrl: blobUrl,
          data: {
            aluno: student.name,
            turma: student.turma,
            motivo: rotulo,
            horario,
          },
        };
      } catch {
        return {
          toolName,
          success: false,
          message: 'Não consegui gerar a autorização em PDF agora. Quer que eu tente de novo?',
        };
      }
    }

    // -------------------------------------------------------------------
    // 3. registrarFaltaFrequencia(alunoId, data, justificativa)
    // -------------------------------------------------------------------
    case 'registrarFaltaFrequencia': {
      if (context.currentUser && !canMarkAttendance(context.currentUser)) {
        return {
          toolName,
          success: false,
          message: 'Seu perfil não tem permissão para lançar chamada. Posso avisar a monitora da turma ou a coordenação se você quiser.',
        };
      }
      const alunoQuery = args.alunoId || '';
      const targetDate = args.data ? normalizeDateInput(String(args.data)) : currentDate;
      const justificativa = args.justificativa || 'Falta registrada via Sofia';

      const matches = findMatchingStudents(context.students, alunoQuery);
      if (matches.length === 0) {
        return {
          toolName,
          success: false,
          message: `Não achei nenhum "${alunoQuery}" nas turmas ativas.`,
        };
      }
      if (matches.length > 1) {
        const opts = matches.slice(0, 4).map((s) => `${s.name} (${s.turma})`).join(' ou ');
        return {
          toolName,
          success: false,
          needsDisambiguation: true,
          message: `Tenho mais de um aluno com esse nome: ${opts}. Em qual deles devo lançar a falta?`,
        };
      }

      const student = matches[0];
      if (context.onSaveRecord) {
        const targetDateObj = new Date(`${targetDate}T12:00:00`);
        const year = targetDateObj.getFullYear() || new Date().getFullYear();
        const firstJan = new Date(year, 0, 1);
        const pastDaysOfYear = (targetDateObj.getTime() - firstJan.getTime()) / 86400000;
        const weekNumber = Math.max(1, Math.ceil((pastDaysOfYear + firstJan.getDay() + 1) / 7)) || 1;

        await context.onSaveRecord({
          studentId: student.id,
          turma: (student.turma as any) || '1º Ano Azul',
          date: targetDate,
          weekNumber,
          year,
          status: 'falta',
          activity: 'Rotina',
          observation: justificativa,
        });
      }

      return {
        toolName,
        success: true,
        message: `Anotado! Registrei falta para ${student.name} (${student.turma}) em ${formatDateBR(targetDate)}.`,
        data: {
          alunoNome: student.name,
          turma: student.turma,
          data: targetDate,
          status: 'falta',
        },
      };
    }

    // -------------------------------------------------------------------
    // 4. dispararAlertaWhatsApp(destinatario, mensagem)
    // -------------------------------------------------------------------
    case 'dispararAlertaWhatsApp': {
      const destinatario = args.destinatario || 'Coordenação';
      const mensagem = args.mensagem || '';

      if (!mensagem.trim()) {
        return {
          toolName,
          success: false,
          message: 'Me diz o que você quer escrever na mensagem para eu deixar pronta.',
        };
      }

      let phone = '5519999999999';
      const cleanDest = normalizeStr(destinatario);

      if (cleanDest.includes('coord')) {
        phone = '5519981234567';
      } else {
        const rawDigits = String(destinatario).replace(/\D/g, '');
        if (rawDigits.length >= 10) {
          phone = rawDigits.startsWith('55') ? rawDigits : `55${rawDigits}`;
        }
      }

      const encodedMsg = encodeURIComponent(mensagem);
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodedMsg}`;

      return {
        toolName,
        success: true,
        message: `Deixei a mensagem pronta para ${destinatario}. É só clicar no botão abaixo para enviar pelo WhatsApp.`,
        whatsappUrl,
        data: {
          destinatario,
          telefone: formatPhoneDisplay(phone),
          mensagem,
        },
      };
    }

    // -------------------------------------------------------------------
    // 5. analisarDesarranjosDoDia()
    // -------------------------------------------------------------------
    case 'analisarDesarranjosDoDia': {
      const now = new Date();
      const horaAtual = formatHourPTBR(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      const expectedStudents = (context.students || []).filter(
        (s) => isStudentActiveOnDate(s, currentDate) && isStudentScheduledForDate(s, currentDate)
      );
      const todayRecords = (context.records || []).filter((r) => r.date === currentDate);
      const presentes = todayRecords.filter((r) => r.status === 'presente' || r.status === 'sem_equipamento' || r.status === 'saida_antecipada').length;
      const faltas = todayRecords.filter((r) => r.status === 'falta').length;

      const turmasList = context.activeTurmas && context.activeTurmas.length > 0
        ? context.activeTurmas
        : ['Mini Maternal Azul', 'Maternal Azul', '1º Ano Azul', '1º Ano Laranja', '2º Ano Azul', '3º Ano', '4º Ano', '5º Ano'];

      const turmasComLancamento = new Set(todayRecords.map((r) => r.turma));
      const turmasPendentesHoje = turmasList.filter((t) => {
        const hasExpected = expectedStudents.some((s) => normalizeStr(s.turma) === normalizeStr(t));
        return hasExpected && !turmasComLancamento.has(t);
      });

      const pontoHoje = (context.pontoRecords || []).filter((p) => p.date === currentDate);
      const pontosIncompletos = pontoHoje.filter((p) => {
        const hasEntrada = Boolean(p.entrada_1 || p.entry1);
        const hasSaida = Boolean(p.saida_2 || p.exit2 || p.saida_1 || p.exit1);
        return hasEntrada && !hasSaida;
      });

      const tudoEmDia = turmasPendentesHoje.length === 0;
      let msg = tudoEmDia
        ? `Está tudo em dia agora (${horaAtual}): nenhuma turma com chamada pendente, ${presentes} presentes e ${faltas} faltas hoje.`
        : `Agora (${horaAtual}): ${presentes} presentes e ${faltas} faltas hoje, mas temos ${turmasPendentesHoje.length} turma(s) ainda sem chamada (${turmasPendentesHoje.join(', ')}).`;

      if (isUserAdmin && pontosIncompletos.length > 0) {
        msg += ` No Livro Ponto, ${pontosIncompletos.length} colaborador(es) ainda estão com a saída em aberto.`;
      }

      return {
        toolName,
        success: true,
        message: msg,
        spokenText: msg,
        data: {
          presentes,
          faltas,
          totalEsperados: expectedStudents.length,
          turmasPendentes: turmasPendentesHoje,
          pontosIncompletos: pontosIncompletos.length,
        },
      };
    }

    // -------------------------------------------------------------------
    // 6. obterResumoFrequenciaPorData(data)
    // -------------------------------------------------------------------
    case 'obterResumoFrequenciaPorData': {
      const targetDate = args.data || currentDate;
      const summary = getAttendanceSummaryByDate(targetDate, context.records, context.students);

      let msg = `Em ${getDayOfWeekFullPTBR(summary.date)} (${summary.formattedDate}), tivemos ${summary.totalPresentes} presentes e ${summary.totalFaltas} falta(s).`;

      if (summary.totalFaltas > 0) {
        const turmas = Object.keys(summary.faltasPorTurma);
        const lines = turmas.map((turma) => {
          const alunos = summary.faltasPorTurma[turma];
          return `• ${turma} (${alunos.length}): ${alunos.map((a) => a.name).join(', ')}`;
        });
        msg += `\n${lines.join('\n')}`;
      } else if (summary.totalPresentes === 0) {
        msg = `Não encontrei chamada lançada para ${summary.formattedDate}. Quer que eu consulte outro dia?`;
      }

      return {
        toolName,
        success: true,
        message: msg,
        data: {
          data: summary.date,
          dataFormatada: summary.formattedDate,
          totalFaltas: summary.totalFaltas,
          totalPresentes: summary.totalPresentes,
          faltasPorTurma: summary.faltasPorTurma,
          alunosFaltantes: summary.alunosFaltantes,
          turmasComRegistro: summary.turmasComRegistro,
        },
      };
    }

    // -------------------------------------------------------------------
    // consultarFrequenciaHoje(turma?, listarNomes?)
    // -------------------------------------------------------------------
    case 'consultarFrequenciaHoje': {
      const targetDate = context.selectedDate || toISODateString(new Date());
      const filterTurma = args.turma ? normalizeStr(args.turma) : '';

      const activeExpected = (context.students || []).filter(
        (s) => isStudentActiveOnDate(s, targetDate) && isStudentScheduledForDate(s, targetDate)
      );

      const expectedStudents = filterTurma
        ? activeExpected.filter((s) => {
            const sTurma = normalizeStr(s.turma);
            return sTurma.includes(filterTurma) || filterTurma.includes(sTurma);
          })
        : activeExpected;

      const recordMap = new Map<string, AttendanceRecord>();
      (context.records || []).forEach((r) => {
        if (r.date === targetDate) {
          recordMap.set(r.studentId, r);
        }
      });

      let presentes = 0;
      let faltas = 0;
      let saidasAntecipadas = 0;
      let pendentes = 0;
      const faltantesNomes: string[] = [];
      const pendentesNomes: string[] = [];

      expectedStudents.forEach((s) => {
        const rec = recordMap.get(s.id);
        if (!rec || !rec.status) {
          pendentes++;
          pendentesNomes.push(s.name);
        } else if (rec.status === 'falta') {
          faltas++;
          faltantesNomes.push(s.name);
        } else if (rec.status === 'saida_antecipada') {
          saidasAntecipadas++;
          presentes++;
        } else {
          presentes++;
        }
      });

      const turmaLabel = filterTurma
        ? (expectedStudents[0]?.turma || args.turma)
        : '';

      let respostaTexto = '';
      if (turmaLabel) {
        respostaTexto = `No ${turmaLabel} hoje: ${presentes} presentes, ${faltas} falta(s)${saidasAntecipadas > 0 ? `, ${saidasAntecipadas} saída(s) antecipada(s)` : ''} e ${pendentes} pendente(s) de ${expectedStudents.length} esperado(s).`;
        if (args.listarNomes && faltantesNomes.length > 0) {
          respostaTexto += ` Faltaram: ${faltantesNomes.join(', ')}.`;
        }
        if (args.listarNomes && pendentesNomes.length > 0 && pendentesNomes.length <= 10) {
          respostaTexto += ` Aguardando chamada: ${pendentesNomes.join(', ')}.`;
        }
      } else {
        respostaTexto = pendentes === 0
          ? `Chamada de hoje em dia! ${presentes} presentes e ${faltas} faltas${saidasAntecipadas > 0 ? ` (${saidasAntecipadas} saídas antecipadas)` : ''}.`
          : `Hoje temos ${presentes} presentes, ${faltas} faltas e ${pendentes} aluno(s) ainda pendente(s) de chamada.`;
      }

      return {
        toolName,
        success: true,
        message: respostaTexto,
        spokenText: respostaTexto,
        data: {
          data: targetDate,
          turma: turmaLabel || 'TODAS',
          totalEsperados: expectedStudents.length,
          presentes,
          faltas,
          saidasAntecipadas,
          pendentes,
          faltantesNomes,
        },
      };
    }

    // -------------------------------------------------------------------
    // consultarAlertasSaidaHoje(tipo?, turma?)
    // -------------------------------------------------------------------
    case 'consultarAlertasSaidaHoje': {
      const targetDate = context.selectedDate || toISODateString(new Date());
      const dayOfWeek = getDayOfWeekFromDate(targetDate);
      const filterTurma = args.turma ? normalizeStr(args.turma) : '';
      const tipoConsulta = args.tipo || 'geral';

      const activeExpected = (context.students || []).filter(
        (s) => isStudentActiveOnDate(s, targetDate) && isStudentScheduledForDate(s, targetDate)
      );

      const expectedStudents = filterTurma
        ? activeExpected.filter((s) => {
            const sTurma = normalizeStr(s.turma);
            return sTurma.includes(filterTurma) || filterTurma.includes(sTurma);
          })
        : activeExpected;

      const recordMap = new Map<string, AttendanceRecord>();
      (context.records || []).forEach((r) => {
        if (r.date === targetDate) {
          recordMap.set(r.studentId, r);
        }
      });

      const alunosVan = expectedStudents.filter(
        (s) => s.tipoSaida === 'TRANSPORTE_ESCOLAR' || Boolean(s.nomeCondutor)
      );

      const alunosSaidaAntecipada = expectedStudents.filter((s) => {
        const rec = recordMap.get(s.id);
        if (rec && (rec.status === 'saida_antecipada' || rec.exitTime)) {
          return true;
        }
        const horarioDia = s.horariosSaida?.[dayOfWeek as any] || s.horarioSaida;
        if (horarioDia) {
          const cleanH = horarioDia.trim();
          if (cleanH < '17:00' && cleanH >= '12:00') {
            return true;
          }
        }
        return false;
      });

      const alunosLiberados = expectedStudents.filter((s) => {
        const rec = recordMap.get(s.id);
        return Boolean(rec && (rec.checkoutConfirmed || rec.status === 'saida_antecipada'));
      });

      const totalVan = alunosVan.length;
      const totalAntecipadas = alunosSaidaAntecipada.length;
      const totalLiberados = alunosLiberados.length;

      let baseMsg = `Hoje temos ${totalVan} aluno(s) de van e ${totalAntecipadas} saída(s) antecipada(s)${totalLiberados > 0 ? ` (${totalLiberados} já liberado(s))` : ''}.`;
      let spokenText = baseMsg;

      if (tipoConsulta === 'van' || args.detalhesVan) {
        if (totalVan > 0) {
          baseMsg += `\n` +
            alunosVan.slice(0, 10).map((s) => `• ${s.name} (${s.turma}${s.nomeCondutor ? ` — ${s.nomeCondutor}` : ''})`).join('\n');
          if (totalVan > 10) baseMsg += `\nE mais ${totalVan - 10} aluno(s).`;
          spokenText = `Hoje temos ${totalVan} alunos de van, incluindo ${alunosVan.slice(0, 4).map((s) => s.name).join(', ')}.`;
        } else {
          baseMsg = 'Não há alunos de transporte escolar (van) esperados hoje neste filtro.';
        }
      } else if (tipoConsulta === 'antecipada') {
        if (totalAntecipadas > 0) {
          baseMsg = `Saídas antecipadas de hoje (${totalAntecipadas}):\n` +
            alunosSaidaAntecipada.map((s) => {
              const rec = recordMap.get(s.id);
              const h = rec?.exitTime || s.horariosSaida?.[dayOfWeek as any] || s.horarioSaida || 'A confirmar';
              return `• ${s.name} (${s.turma}) — ${formatHourPTBR(h) || h}`;
            }).join('\n');
          spokenText = `Hoje temos ${totalAntecipadas} saída antecipada agendada: ${alunosSaidaAntecipada.slice(0, 4).map((s) => s.name).join(', ')}.`;
        } else {
          baseMsg = 'Nenhuma saída antecipada agendada para hoje até agora.';
        }
      }

      return {
        toolName,
        success: true,
        message: baseMsg,
        spokenText,
        data: {
          data: targetDate,
          totalVan,
          totalAntecipadas,
          totalLiberados,
        },
      };
    }

    // -------------------------------------------------------------------
    // gerarTermoSaidaAvulsa(alunoId, nomeRetirante, ...)
    // -------------------------------------------------------------------
    case 'gerarTermoSaidaAvulsa': {
      const alunoQuery = args.alunoId || '';
      const nomeRetirante = args.nomeRetirante || 'Responsável Autorizado';
      const documentoRetirante = args.documentoRetirante || 'Informado na portaria';
      const parentesco = args.parentesco || 'Responsável';
      const motivoSaida = args.motivoSaida || 'Saída antecipada autorizada';
      const horarioSaida = args.horarioSaida || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const matches = findMatchingStudents(context.students, alunoQuery);
      if (matches.length === 0) {
        return {
          toolName,
          success: false,
          message: `Não achei "${alunoQuery}" no cadastro. Pode conferir o nome?`,
        };
      }
      if (matches.length > 1) {
        const opts = matches.slice(0, 4).map((s) => `${s.name} (${s.turma})`).join(' ou ');
        return {
          toolName,
          success: false,
          needsDisambiguation: true,
          message: `Tem mais de um aluno com esse nome: ${opts}. Para qual deles devo gerar o termo?`,
        };
      }

      const student = matches[0];
      try {
        const pdfResult = generateTermoSaidaAvulsaPDF(
          {
            student,
            nomeRetirante,
            documentoRetirante,
            parentesco,
            motivoSaida,
            dataSaida: currentDate,
            horarioSaida,
            responsavelLiberacao: context.currentUser?.name || 'Equipe Integral',
          },
          false
        );

        if (context.onSaveRecord) {
          const targetDate = currentDate;
          const targetDateObj = new Date(`${targetDate}T12:00:00`);
          const year = targetDateObj.getFullYear() || new Date().getFullYear();
          const firstJan = new Date(year, 0, 1);
          const pastDaysOfYear = (targetDateObj.getTime() - firstJan.getTime()) / 86400000;
          const weekNumber = Math.max(1, Math.ceil((pastDaysOfYear + firstJan.getDay() + 1) / 7)) || 1;

          await context.onSaveRecord({
            studentId: student.id,
            turma: (student.turma as any) || '1º Ano Azul',
            date: targetDate,
            weekNumber,
            year,
            status: 'saida_antecipada',
            activity: 'Rotina',
            exitTime: horarioSaida,
            checkoutConfirmed: true,
            observation: `Termo de Saída Avulsa: retirado por ${nomeRetirante} (${parentesco} - Doc: ${documentoRetirante}) às ${horarioSaida}.`,
          });
        }

        const horarioBr = formatHourPTBR(horarioSaida) || horarioSaida;
        return {
          toolName,
          success: true,
          message: `Pronto! Registrei a saída de ${student.name} (${student.turma}) às ${horarioBr} com ${nomeRetirante} e deixei o termo em PDF pronto para imprimir aqui embaixo.`,
          spokenText: `Pronto! Preparei o termo de saída de ${student.name} às ${horarioBr}.`,
          filename: pdfResult.filename,
          downloadUrl: pdfResult.blobUrl,
          data: {
            alunoNome: student.name,
            turma: student.turma,
            retirante: nomeRetirante,
            horario: horarioSaida,
          },
        };
      } catch {
        return {
          toolName,
          success: false,
          message: 'Não consegui gerar o Termo de Saída agora. Quer que eu tente de novo?',
        };
      }
    }

    // -------------------------------------------------------------------
    // alterarAnoLetivoAluno(alunoId, novoAnoLetivo)
    // -------------------------------------------------------------------
    case 'alterarAnoLetivoAluno': {
      if (!isUserAdmin && !canManageStudents(context.currentUser)) {
        return {
          toolName,
          success: false,
          message: 'Alteração de ano letivo e rematrícula são feitas apenas pela coordenação ou secretaria.',
        };
      }
      const alunoQuery = args.alunoId || args.nomeAluno || '';
      let novoAno = Number(args.novoAnoLetivo || args.anoLetivo || 2027);
      if (isNaN(novoAno) || (novoAno !== 2026 && novoAno !== 2027)) {
        novoAno = 2027;
      }

      const student = findStudent(context.students, alunoQuery);
      if (!student) {
        return {
          toolName,
          success: false,
          message: `Não achei nenhum "${alunoQuery}" no cadastro.`,
        };
      }

      const updated = await updateStudent(student.id, { anoLetivo: novoAno });
      if (!updated) {
        return {
          toolName,
          success: false,
          message: `Não consegui salvar a mudança de ano letivo agora. Quer que eu tente de novo?`,
        };
      }

      const idx = context.students.findIndex((s) => s.id === student.id);
      if (idx !== -1) context.students[idx] = updated;

      return {
        toolName,
        success: true,
        message: `Pronto! Passei ${student.name} (${student.turma}) para o ano letivo de ${novoAno}.`,
        spokenText: `Pronto! Passei ${student.name} para ${novoAno}.`,
        data: updated,
      };
    }

    // -------------------------------------------------------------------
    // consultarResumoFinanceiro(anoLetivo?)
    // -------------------------------------------------------------------
    case 'consultarResumoFinanceiro': {
      if (!isUserAdmin) {
        return {
          toolName,
          success: false,
          message: 'Os dados financeiros são restritos à coordenação e direção.',
        };
      }
      let targetAno = Number(args.anoLetivo || 2026);
      if (isNaN(targetAno)) targetAno = 2026;

      const allProfiles = loadLocalFinancialProfiles();
      let profiles = allProfiles.filter((p) => p.anoLetivo === targetAno);
      if (profiles.length === 0) {
        const studentsAno = context.students.filter((s) => (s.anoLetivo || 2026) === targetAno);
        profiles = studentsAno.map((s) => buildDefaultFinancialProfile(s, targetAno));
      }

      const allExpenses = loadLocalFinancialExpenses();
      const expenses = allExpenses.filter((e) => e.anoLetivo === targetAno);
      const metrics = calculateFinancialMetrics(profiles, expenses);

      const recConfBR = formatCurrencyBR(metrics.receitaConfirmada);
      const recPrevBR = formatCurrencyBR(metrics.receitaPrevistaMensal);
      const despesasBR = formatCurrencyBR(metrics.totalDespesasMes);
      const saldoLiqBR = formatCurrencyBR(metrics.saldoLiquidoOperacional);

      const msgTexto = `Resumo financeiro de ${targetAno}: ${recConfBR} confirmados (de ${recPrevBR} previstos), ${despesasBR} em despesas e saldo de ${saldoLiqBR}. Adimplência em ${metrics.taxaAdimplencia}% (${metrics.totalEmDia} em dia, ${metrics.totalPendentes} pendentes, ${metrics.totalAtrasados} em atraso).`;

      return {
        toolName,
        success: true,
        message: msgTexto,
        spokenText: `Em ${targetAno}, temos ${recConfBR} confirmados, ${despesasBR} em despesas e ${metrics.taxaAdimplencia}% de adimplência.`,
        data: { anoLetivo: targetAno, ...metrics },
      };
    }

    // -------------------------------------------------------------------
    // 7. cadastrarAluno(dadosAluno)
    // -------------------------------------------------------------------
    case 'cadastrarAluno': {
      if (!isUserAdmin && !canManageStudents(context.currentUser)) {
        return {
          toolName,
          success: false,
          message: 'O cadastro de novos alunos é liberado apenas para coordenação e secretaria.',
        };
      }
      const dados = args.dadosAluno || args;
      const nome = dados.nome || '';
      const turmaId = dados.turmaId || '1º Ano Azul';
      const responsavel = dados.responsavel || '';
      const telefone = dados.telefone || '';
      const horarioEntradaSaida = dados.horarioEntradaSaida || '11:40 - 17:40';

      if (!nome.trim()) {
        return {
          toolName,
          success: false,
          message: 'Qual é o nome completo do aluno para eu cadastrar?',
        };
      }

      const newStudent = await createStudent({
        nome,
        turmaId,
        responsavel,
        telefone,
        horarioEntradaSaida,
      });

      if (context.students && !context.students.some((s) => s.id === newStudent.id)) {
        context.students.unshift(newStudent);
      }

      return {
        toolName,
        success: true,
        message: `Pronto! Cadastrei ${newStudent.name} no ${newStudent.turma}. Quer já fixar as modalidades ou conferir o horário de saída?`,
        data: newStudent,
      };
    }

    // -------------------------------------------------------------------
    // 8. editarAluno(alunoId, dadosAtualizados)
    // -------------------------------------------------------------------
    case 'editarAluno': {
      if (!isUserAdmin && !canManageStudents(context.currentUser)) {
        return {
          toolName,
          success: false,
          message: 'A alteração cadastral de alunos é feita pela coordenação ou secretaria.',
        };
      }
      const alunoId = args.alunoId || '';
      const dadosAtualizados = args.dadosAtualizados || args;

      if (!alunoId) {
        return {
          toolName,
          success: false,
          message: 'Qual aluno você quer atualizar?',
        };
      }

      const found = findStudent(context.students, alunoId);
      const targetStudentId = found ? found.id : alunoId;
      const updated = await updateStudent(targetStudentId, dadosAtualizados);
      if (!updated) {
        return {
          toolName,
          success: false,
          message: `Não achei "${alunoId}" no cadastro para atualizar.`,
        };
      }

      const idx = context.students.findIndex((s) => s.id === updated.id);
      if (idx !== -1) context.students[idx] = updated;

      return {
        toolName,
        success: true,
        message: `Pronto! Atualizei o cadastro de ${updated.name}.`,
        data: updated,
      };
    }

    // -------------------------------------------------------------------
    // 9. cadastrarUsuario(dadosUsuario)
    // -------------------------------------------------------------------
    case 'cadastrarUsuario': {
      if (!isUserAdmin) {
        return {
          toolName,
          success: false,
          message: 'O cadastro de novos colaboradores é restrito à coordenação.',
        };
      }
      const dados = args.dadosUsuario || args;
      const nome = dados.nome || '';
      const email = dados.email || '';
      const funcao = dados.funcao || '';
      const cargo = dados.cargo || '';
      const perfil = String(dados.perfil || 'MONITOR').toUpperCase();

      if (!nome.trim() || !email.trim()) {
        return {
          toolName,
          success: false,
          message: 'Preciso do nome completo e do e-mail do colaborador para fazer o cadastro.',
        };
      }

      const isAdm = perfil === 'ADMIN';
      const isAdi = perfil === 'ADI';

      const newUser: UserProfile = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: nome.trim(),
        email: email.trim().toLowerCase(),
        role: isAdm ? 'coordenador' : isAdi ? 'auxiliar' : 'professor',
        cargoLabel: cargo || funcao || (isAdm ? 'Coordenador(a)' : isAdi ? 'ADI / Apoio' : 'Monitor(a)'),
        status: 'ATIVO',
        canManageStudents: isAdm,
        canMarkAttendance: true,
        allowedTabs: isAdm
          ? ALL_APP_TAB_IDS
          : isAdi
          ? ['momento', 'frequencia', 'semanario', 'manual']
          : ['momento', 'frequencia', 'semanario', 'manual'],
        contractSchedule: '07:30 - 17:30',
        contractDailyHoursFormatted: '8h 00m',
        baseSalary: 1200,
        regimeTrabalho: 'mensalista',
      };

      const saved = await saveUser(newUser);

      return {
        toolName,
        success: true,
        message: `Pronto! Cadastrei ${saved.name} (${saved.cargoLabel}) no sistema com acesso de ${isAdm ? 'Coordenação' : isAdi ? 'ADI' : 'Monitora/Professora'}.`,
        data: saved,
      };
    }

    // -------------------------------------------------------------------
    // 10. gerarListaChamadaPDF(turmaId)
    // -------------------------------------------------------------------
    case 'gerarListaChamadaPDF': {
      const turmaId = args.turmaId || context.selectedTurma || 'TODAS';

      try {
        const result = generateNominalListPDF({
          title: `Lista de Chamada Nominal — ${turmaId}`,
          turma: turmaId,
          students: context.students,
          records: context.records,
          currentUser: context.currentUser || undefined,
          saveImmediately: false,
        });

        return {
          toolName,
          success: true,
          message: `Pronto! A lista de chamada de ${turmaId} já está gerada em PDF aqui embaixo.`,
          filename: result.filename || `Lista_Chamada_${turmaId.replace(/\s+/g, '_')}.pdf`,
          downloadUrl: result.blobUrl || result.dataUrl,
          data: { turma: turmaId },
        };
      } catch {
        return {
          toolName,
          success: false,
          message: 'Não consegui gerar a lista em PDF agora. Quer que eu tente de novo?',
        };
      }
    }

    // -------------------------------------------------------------------
    // 11. lancarFrequenciaTurma(turmaId, data, chamadas)
    // -------------------------------------------------------------------
    case 'lancarFrequenciaTurma': {
      if (context.currentUser && !canMarkAttendance(context.currentUser)) {
        return {
          toolName,
          success: false,
          message: 'Seu perfil não tem permissão para lançar chamada. Posso consultar a lista para você.',
        };
      }
      const turmaId = args.turmaId || '1º Ano Azul';
      const targetDate = args.data ? normalizeDateInput(String(args.data)) : currentDate;
      let chamadas = Array.isArray(args.chamadas) ? args.chamadas : [];

      if (chamadas.length === 0) {
        const turmaStudents = context.students.filter(
          (s) =>
            normalizeStr(s.turma) === normalizeStr(turmaId) &&
            isStudentActiveOnDate(s, targetDate) &&
            isStudentScheduledForDate(s, targetDate)
        );
        chamadas = turmaStudents.map((s) => ({ alunoId: s.id, presente: true }));
      }

      const res = await lancarFrequenciaTurma({
        turmaId,
        data: targetDate,
        chamadas,
        instructorName: context.currentUser?.name || 'Sofia',
        onSaveRecord: context.onSaveRecord,
      });

      return {
        toolName,
        success: true,
        message: `Pronto! Lancei a chamada de ${res.turma} (${formatDateBR(res.data)}): ${res.presentes} presentes e ${res.faltas} falta(s).`,
        data: res,
      };
    }

    // -------------------------------------------------------------------
    // 12. cadastrarRefeicaoCardapio(data, tipo, descricao)
    // -------------------------------------------------------------------
    case 'cadastrarRefeicaoCardapio': {
      if (!isUserAdmin && !canManageCardapio(context.currentUser)) {
        return {
          toolName,
          success: false,
          message: 'A edição do cardápio é feita pela nutrição ou coordenação.',
        };
      }
      const targetDate = args.data ? normalizeDateInput(String(args.data)) : currentDate;
      const tipo: 'Almoço' | 'Lanche' =
        String(args.tipo).toLowerCase().includes('lanche') ? 'Lanche' : 'Almoço';
      const descricao = args.descricao || '';

      if (!descricao.trim()) {
        return {
          toolName,
          success: false,
          message: `Qual é o ${tipo.toLowerCase()} que devo registrar no cardápio?`,
        };
      }

      const res = await cadastrarRefeicaoCardapioService(targetDate, tipo, descricao);

      return {
        toolName,
        success: true,
        message: `Pronto! Atualizei o ${tipo.toLowerCase()} de ${formatDateBR(targetDate)}: "${descricao}".`,
        data: res.dayItem,
      };
    }

    default:
      return {
        toolName,
        success: false,
        message: 'Não consegui executar essa ação agora. Pode me explicar de outro jeito?',
      };
  }
}
