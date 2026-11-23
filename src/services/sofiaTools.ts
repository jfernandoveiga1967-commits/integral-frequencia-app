/**
 * sofiaTools.ts
 * Executores de Ferramentas Reais da Assistente Sofia (Colégio Crescer).
 * Todas as ferramentas devolvem APENAS dados estruturados (objetos/números/listas)
 * — sem texto conversacional pré-montado e sem spokenText — para que o modelo
 * redija a resposta final em linguagem natural.
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
  DayOfWeek,
  SofiaSecurityProfile,
} from '../types';
import {
  generateLivroPontoPDFReport,
  generateNominalListPDF,
  generateSofiaFrequenciaPDFReport,
  generateTermoSaidaAvulsaPDF,
} from '../utils/pdfGenerator';
import {
  calculateMonthlyPontoFinancials,
  getMonthNameBR,
  isContinuousShift,
} from '../utils/pontoUtils';
import {
  formatDateBR,
  getDayOfWeekFromDate,
  isHolidayOrRecess,
  isStudentActiveOnDate,
  isStudentScheduledForDate,
  isWeekend,
  normalizeDayOfWeek,
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
  isUserActive,
} from '../utils/authUtils';
import { getDayOfWeekFullPTBR } from '../utils/sofiaPromptBuilder';
import {
  getNowTimeSaoPaulo,
  getTodayISOSaoPaulo,
  getUnifiedSofiaAttendanceMetrics,
} from '../utils/frequenciaUtils';
import { getUsers, saveUser } from './userService';
import { lancarFrequenciaTurma, normalizeDateInput } from './frequencyService';
import { createStudent, updateStudent } from './studentService';
import { cadastrarRefeicaoCardapio as cadastrarRefeicaoCardapioService } from './menuService';
import {
  loadLocalFinancialProfiles,
  loadLocalFinancialExpenses,
  calculateFinancialMetrics,
  buildDefaultFinancialProfile,
} from './financialService';
import {
  checkSofiaToolPermission,
  recordSofiaAuditLog,
  requiresConfirmation,
} from './sofiaSecurityService';

export { SOFIA_FUNCTION_DECLARATIONS } from './sofiaToolDeclarations';

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
  executedDownloadKeys?: Set<string>;
  onPdfAutoDownload?: (toolName: SofiaAgentToolName, filename: string) => void;
}

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
 * Localiza turma por busca aproximada (Fuzzy Search)
 */
export function findTurmaFuzzy(turmas: string[], query: string): string | undefined {
  if (!query) return undefined;
  const qNorm = normalizeStr(query);
  if (!qNorm || qNorm === 'todas' || qNorm === 'all' || qNorm === 'todas as turmas') {
    return undefined;
  }

  const exact = turmas.find((t) => normalizeStr(t) === qNorm);
  if (exact) return exact;

  const sub = turmas.find((t) => normalizeStr(t).includes(qNorm) || qNorm.includes(normalizeStr(t)));
  if (sub) return sub;

  if (qNorm.includes('mini')) {
    return turmas.find((t) => normalizeStr(t).includes('mini')) || 'Mini Maternal Azul';
  }
  if (qNorm.includes('maternal')) {
    return turmas.find((t) => normalizeStr(t).includes('maternal') && !normalizeStr(t).includes('mini')) || 'Maternal Azul';
  }
  if (qNorm.includes('infantil 1') || qNorm.includes('infantil i')) {
    const azul = qNorm.includes('azul');
    const laranja = qNorm.includes('laranja');
    if (azul) {
      return turmas.find((t) => (normalizeStr(t).includes('infantil 1') || normalizeStr(t).includes('infantil i')) && normalizeStr(t).includes('azul')) || query;
    }
    if (laranja) {
      return turmas.find((t) => (normalizeStr(t).includes('infantil 1') || normalizeStr(t).includes('infantil i')) && normalizeStr(t).includes('laranja')) || query;
    }
    return turmas.find((t) => normalizeStr(t).includes('infantil 1') || normalizeStr(t).includes('infantil i')) || query;
  }
  if (qNorm.includes('infantil 2') || qNorm.includes('infantil ii')) {
    return turmas.find((t) => normalizeStr(t).includes('infantil 2') || normalizeStr(t).includes('infantil ii')) || query;
  }
  if (qNorm.includes('1') && (qNorm.includes('ano') || qNorm.includes('laranja') || qNorm.includes('azul'))) {
    if (qNorm.includes('laranja')) {
      return turmas.find((t) => normalizeStr(t).includes('1') && normalizeStr(t).includes('laranja')) || '1º Ano Laranja';
    }
    return turmas.find((t) => normalizeStr(t).includes('1') && normalizeStr(t).includes('ano')) || '1º Ano Azul';
  }
  if (qNorm.includes('2') && qNorm.includes('ano')) {
    return turmas.find((t) => normalizeStr(t).includes('2') && normalizeStr(t).includes('ano')) || '2º Ano Azul';
  }
  if (qNorm.includes('3') && qNorm.includes('ano')) {
    return turmas.find((t) => normalizeStr(t).includes('3') && normalizeStr(t).includes('ano')) || '3º Ano';
  }
  if (qNorm.includes('4') && qNorm.includes('ano')) {
    return turmas.find((t) => normalizeStr(t).includes('4') && normalizeStr(t).includes('ano')) || '4º Ano';
  }
  if (qNorm.includes('5') && qNorm.includes('ano')) {
    return turmas.find((t) => normalizeStr(t).includes('5') && normalizeStr(t).includes('ano')) || '5º Ano';
  }

  return undefined;
}

/**
 * Busca todos os alunos candidatos para detectar ambiguidades (homônimos).
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

export function findStudent(students: Student[], query: string): Student | undefined {
  return findMatchingStudents(students, query)[0];
}

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

function resolveDateArg(raw?: string, fallback?: string): string {
  const base = fallback || getTodayISOSaoPaulo();
  if (!raw) return base;
  const clean = normalizeStr(raw);
  if (clean === 'hoje') return getTodayISOSaoPaulo();
  if (clean === 'ontem') {
    const d = new Date(`${base}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }
  if (clean === 'anteontem') {
    const d = new Date(`${base}T12:00:00`);
    d.setDate(d.getDate() - 2);
    return d.toISOString().split('T')[0];
  }
  if (clean === 'amanha') {
    const d = new Date(`${base}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }
  return normalizeDateInput(String(raw)) || base;
}

function buildWeekInfoFromDate(dateStr: string): { year: number; weekNumber: number } {
  const parsed = new Date(`${dateStr}T12:00:00`);
  const year = parsed.getFullYear() || new Date().getFullYear();
  const firstJan = new Date(year, 0, 1);
  const pastDays = (parsed.getTime() - firstJan.getTime()) / 86400000;
  const weekNumber = Math.max(1, Math.ceil((pastDays + firstJan.getDay() + 1) / 7)) || 1;
  return { year, weekNumber };
}

function generateAutorizacaoPDFBlob(params: {
  student: Student;
  motivo: 'atraso' | 'saida_antecipada';
  horario: string;
  data: string;
  justificativa?: string;
  emissor?: string;
}): { filename: string; blobUrl: string; download: () => void } {
  const JsPDFCtor: any = (jsPDF as any)?.jsPDF || (jsPDF as any)?.default || jsPDF;
  const pdfDoc = new JsPDFCtor({
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

  const filename = `Autorizacao_${params.motivo}_${params.student.name.replace(/\s+/g, '_')}_${params.data}.pdf`;
  let blobUrl = '';
  try {
    const blob = pdfDoc.output('blob');
    blobUrl =
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(blob)
        : '';
  } catch {
    blobUrl = '';
  }

  const download = () => {
    if (typeof document !== 'undefined') {
      try {
        pdfDoc.save(filename);
      } catch {}
    }
  };

  return { filename, blobUrl, download };
}

// ===========================================================================
// GUARDA IDEMPOTENTE CONTRA DOWNLOAD DUPLICADO DE PDF EM RETRIES
// ===========================================================================
const PDF_DOWNLOAD_DEDUP_TTL_MS = 10_000;
const recentPdfDownloads = new Map<string, number>();

export function clearRecentPdfDownloadCache(): void {
  recentPdfDownloads.clear();
}

export function triggerIdempotentPdfDownload(
  toolName: SofiaAgentToolName,
  filename: string,
  downloadFn?: () => void,
  context?: SofiaToolExecutionContext
): boolean {
  const key = `${toolName}::${filename}`;
  const now = Date.now();

  for (const [k, ts] of recentPdfDownloads.entries()) {
    if (now - ts > PDF_DOWNLOAD_DEDUP_TTL_MS) {
      recentPdfDownloads.delete(k);
    }
  }

  if (context?.executedDownloadKeys?.has(key) || recentPdfDownloads.has(key)) {
    return false;
  }

  context?.executedDownloadKeys?.add(key);
  recentPdfDownloads.set(key, now);

  if (typeof document !== 'undefined' && typeof downloadFn === 'function') {
    try {
      downloadFn();
    } catch {}
  }

  if (context?.onPdfAutoDownload) {
    try {
      context.onPdfAutoDownload(toolName, filename);
    } catch {}
  }

  return true;
}

const AUDITED_WRITE_TOOLS = new Set<SofiaAgentToolName>([
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

function buildPermissionDeniedResult(
  toolName: SofiaAgentToolName,
  reason?: string,
  profile?: SofiaSecurityProfile
): SofiaToolResult {
  return {
    toolName,
    success: false,
    error: reason || 'Você não tem permissão para realizar esta ação. Procure a coordenação.',
    data: {
      ok: false,
      motivo: 'sem_permissao',
      perfil: profile || 'desconhecido',
      instrucao:
        'Explique com gentileza que esta ação não está disponível para o perfil atual do usuário e sugira procurar a coordenação.',
    },
  };
}

function buildConfirmationPromptResult(
  toolName: SofiaAgentToolName,
  resumoAcao: Record<string, any>
): SofiaToolResult {
  return {
    toolName,
    success: true,
    data: {
      ok: true,
      requer_confirmacao: true,
      confirmado: false,
      acao: toolName,
      resumo_acao: resumoAcao,
      pergunta_sugerida: 'Confirma?',
      instrucao:
        'Ação NÃO executada ainda. Apresente um resumo claro do que será feito e pergunte "Confirma?". Só chame novamente com confirmado: true se o usuário confirmar na próxima mensagem.',
    },
  };
}

function resolveAvailableTurmas(context: SofiaToolExecutionContext): string[] {
  if (context.activeTurmas && context.activeTurmas.length > 0) {
    return context.activeTurmas;
  }
  const fromStudents = Array.from(new Set((context.students || []).map((s) => s.turma).filter(Boolean)));
  if (fromStudents.length > 0) return fromStudents;
  return ['Mini Maternal Azul', 'Maternal Azul', '1º Ano Azul', '1º Ano Laranja', '2º Ano Azul', '3º Ano', '4º Ano', '5º Ano'];
}

/**
 * Executor Central das Ferramentas da Sofia com RBAC em código, Confirmação e Auditoria.
 * Devolve apenas dados estruturados (sem frases prontas ou spokenText).
 */
export async function executeSofiaTool(
  toolName: SofiaAgentToolName,
  args: Record<string, any>,
  context: SofiaToolExecutionContext
): Promise<SofiaToolResult> {
  const safeArgs = args || {};
  const permCheck = checkSofiaToolPermission({
    toolName,
    args: safeArgs,
    currentUser: context.currentUser,
  });

  if (!permCheck.allowed) {
    await recordSofiaAuditLog({
      toolName,
      args: safeArgs,
      currentUser: context.currentUser,
      outcome: 'negado',
      detail: permCheck.reason || 'Acesso negado (não administrador)',
    });
    return buildPermissionDeniedResult(toolName, permCheck.reason, permCheck.profile);
  }

  let result: SofiaToolResult;
  try {
    result = await executeSofiaToolCore(toolName, safeArgs, context, permCheck.profile);
  } catch (err: any) {
    if (AUDITED_WRITE_TOOLS.has(toolName)) {
      await recordSofiaAuditLog({
        toolName,
        args: safeArgs,
        currentUser: context.currentUser,
        outcome: 'erro',
        detail: err?.message || 'Erro inesperado durante a execução da ferramenta',
      });
    }
    throw err;
  }

  if (result.data?.motivo === 'sem_permissao') {
    await recordSofiaAuditLog({
      toolName,
      args: safeArgs,
      currentUser: context.currentUser,
      outcome: 'negado',
      detail: result.error || 'Acesso negado na validação de escopo',
    });
  } else if (AUDITED_WRITE_TOOLS.has(toolName)) {
    const outcome = result.data?.requer_confirmacao
      ? 'aguardando_confirmacao'
      : result.success
      ? 'sucesso'
      : 'erro';
    await recordSofiaAuditLog({
      toolName,
      args: safeArgs,
      currentUser: context.currentUser,
      outcome,
      detail:
        result.error ||
        (result.data?.requer_confirmacao
          ? 'Aguardando confirmação explícita do usuário'
          : 'Ação concluída com sucesso'),
    });
  }

  return result;
}

async function executeSofiaToolCore(
  toolName: SofiaAgentToolName,
  args: Record<string, any>,
  context: SofiaToolExecutionContext,
  securityProfile: SofiaSecurityProfile
): Promise<SofiaToolResult> {
  const todaySaoPaulo = getTodayISOSaoPaulo();
  const baseDate = context.selectedDate || todaySaoPaulo;
  const isUserAdmin = securityProfile === 'coordenador' || isAdmin(context.currentUser);
  const availableTurmas = resolveAvailableTurmas(context);

  switch (toolName) {
    // -------------------------------------------------------------------
    // consultarFrequenciaHoje(turma?, listarNomes?) — Fonte Única de Verdade
    // -------------------------------------------------------------------
    case 'consultarFrequenciaHoje': {
      const targetDate = todaySaoPaulo;
      const matchedTurma = args.turma
        ? findTurmaFuzzy(availableTurmas, String(args.turma)) || String(args.turma)
        : undefined;

      const metrics = getUnifiedSofiaAttendanceMetrics({
        dateStr: targetDate,
        students: context.students || [],
        records: context.records || [],
        turmaFilter: matchedTurma,
        activeTurmas: availableTurmas,
      });

      const includeNames = Boolean(args.listarNomes) || Boolean(matchedTurma);
      const presentesList = metrics.consolidated.studentDetails
        .filter((d) => d.category === 'PRESENTE')
        .map((d) => ({ nome: d.student.name, turma: d.student.turma, status: d.rawStatus || 'presente' }));
      const faltasList = metrics.consolidated.studentDetails
        .filter((d) => d.category === 'FALTA')
        .map((d) => ({ nome: d.student.name, turma: d.student.turma, observacao: d.record?.observation || null }));
      const justificadosList = metrics.consolidated.studentDetails
        .filter((d) => d.category === 'JUSTIFICADO')
        .map((d) => ({ nome: d.student.name, turma: d.student.turma, observacao: d.record?.observation || null }));
      const pendentesList = metrics.consolidated.pendingStudents.map((s) => ({
        nome: s.name,
        turma: s.turma,
      }));

      return {
        toolName,
        success: true,
        data: {
          data: metrics.data,
          data_formatada: formatDateBR(metrics.data),
          dia_semana: getDayOfWeekFullPTBR(metrics.data),
          turma: metrics.turma,
          presentes: metrics.presentes,
          faltas: metrics.faltas,
          justificados: metrics.justificados,
          saidas_antecipadas: metrics.saidas_antecipadas,
          sem_equipamento: metrics.sem_equipamento,
          esperados: metrics.esperados,
          total_matriculados: metrics.total_matriculados,
          alunos_pendentes_chamada: metrics.alunos_pendentes_qtd,
          turmas_com_chamada_pendente: metrics.turmas_com_chamada_pendente,
          atualizado_em: metrics.atualizado_em,
          ...(includeNames
            ? {
                alunos_presentes: presentesList.slice(0, 60),
                alunos_presentes_omitidos: Math.max(0, presentesList.length - 60),
                alunos_faltantes: faltasList,
                alunos_justificados: justificadosList,
                alunos_pendentes_preview: pendentesList.slice(0, 30),
              }
            : {
                alunos_faltantes: faltasList.slice(0, 30),
              }),
        },
      };
    }

    // -------------------------------------------------------------------
    // obterResumoFrequenciaPorData(data?, turma?) — Mesma query unificada
    // -------------------------------------------------------------------
    case 'obterResumoFrequenciaPorData': {
      const targetDate = resolveDateArg(args.data, todaySaoPaulo);
      const matchedTurma = args.turma
        ? findTurmaFuzzy(availableTurmas, String(args.turma)) || String(args.turma)
        : undefined;

      const metrics = getUnifiedSofiaAttendanceMetrics({
        dateStr: targetDate,
        students: context.students || [],
        records: context.records || [],
        turmaFilter: matchedTurma,
        activeTurmas: availableTurmas,
      });

      const faltantes = metrics.consolidated.studentDetails
        .filter((d) => d.category === 'FALTA' || d.category === 'JUSTIFICADO')
        .map((d) => ({
          nome: d.student.name,
          turma: d.student.turma,
          tipo: d.category === 'JUSTIFICADO' ? 'justificado' : 'falta',
          observacao: d.record?.observation || null,
        }));

      const presentes = metrics.consolidated.studentDetails
        .filter((d) => d.category === 'PRESENTE')
        .map((d) => ({
          nome: d.student.name,
          turma: d.student.turma,
        }));

      return {
        toolName,
        success: true,
        data: {
          data: metrics.data,
          data_formatada: formatDateBR(metrics.data),
          dia_semana: getDayOfWeekFullPTBR(metrics.data),
          turma: metrics.turma,
          presentes: metrics.presentes,
          faltas: metrics.faltas,
          justificados: metrics.justificados,
          esperados: metrics.esperados,
          total_matriculados: metrics.total_matriculados,
          turmas_com_chamada_pendente: metrics.turmas_com_chamada_pendente,
          atualizado_em: metrics.atualizado_em,
          alunos_faltantes: faltantes,
          alunos_presentes: matchedTurma ? presentes : presentes.slice(0, 40),
        },
      };
    }

    // -------------------------------------------------------------------
    // gerar_pdf_frequencia(data?, turma?, tipo?)
    // -------------------------------------------------------------------
    case 'gerar_pdf_frequencia': {
      const targetDate = resolveDateArg(args.data, todaySaoPaulo);
      const matchedTurma = args.turma
        ? findTurmaFuzzy(availableTurmas, String(args.turma)) || String(args.turma)
        : undefined;

      const rawTipo = normalizeStr(args.tipo || 'todos');
      const tipo: 'presentes' | 'faltas' | 'todos' =
        rawTipo === 'presentes' ? 'presentes' : rawTipo === 'faltas' ? 'faltas' : 'todos';

      const unifiedMetrics = getUnifiedSofiaAttendanceMetrics({
        dateStr: targetDate,
        students: context.students || [],
        records: context.records || [],
        turmaFilter: matchedTurma,
        activeTurmas: availableTurmas,
      });

      const pdfResult = generateSofiaFrequenciaPDFReport({
        date: targetDate,
        turma: matchedTurma,
        tipo,
        students: context.students || [],
        records: context.records || [],
        unifiedMetrics,
        currentUserName: context.currentUser?.name,
        saveImmediately: false,
      });

      const downloadDisparado = triggerIdempotentPdfDownload(
        toolName,
        pdfResult.filename,
        pdfResult.download,
        context
      );

      return {
        toolName,
        success: true,
        filename: pdfResult.filename,
        downloadUrl: pdfResult.blobUrl || pdfResult.dataUrl,
        data: {
          ok: true,
          nomeArquivo: pdfResult.filename,
          download_automatico_disparado: downloadDisparado,
          totalAlunos: pdfResult.totalAlunos,
          data: targetDate,
          data_formatada: formatDateBR(targetDate),
          turma: matchedTurma || 'TODAS',
          tipo,
          presentes: unifiedMetrics.presentes,
          faltas: unifiedMetrics.faltas,
          esperados: unifiedMetrics.esperados,
          atualizado_em: unifiedMetrics.atualizado_em,
        },
      };
    }

    // -------------------------------------------------------------------
    // consultarAtividadesMomento(turma?, horarioSimulado?, data?)
    // -------------------------------------------------------------------
    case 'consultarAtividadesMomento': {
      const targetDate = resolveDateArg(args.data, todaySaoPaulo);
      const refTime = normalizeTime(args.horarioSimulado) || getNowTimeSaoPaulo();
      const dayFull = getDayOfWeekFullPTBR(targetDate);

      if (isWeekend(targetDate)) {
        return {
          toolName,
          success: true,
          data: {
            data: targetDate,
            dia_semana: dayFull,
            fim_de_semana: true,
            atividades: [],
          },
        };
      }

      const holiday = isHolidayOrRecess(targetDate, context.holidays || []);
      if (holiday) {
        return {
          toolName,
          success: true,
          data: {
            data: targetDate,
            dia_semana: dayFull,
            feriado_ou_recesso: { nome: holiday.name, tipo: holiday.type },
            atividades: [],
          },
        };
      }

      const dayOfWeek = getDayOfWeekFromDate(targetDate);
      const allSchedules = context.schedules || [];
      const atribuicoes = context.quadroAtribuicoes && context.quadroAtribuicoes.length > 0
        ? context.quadroAtribuicoes
        : loadLocalQuadroAtribuicoes();
      const semanario = context.semanarioPlans && context.semanarioPlans.length > 0
        ? context.semanarioPlans
        : loadSemanarioPlans();

      if (args.turma) {
        const matchedTurma = findTurmaFuzzy(availableTurmas, String(args.turma)) || String(args.turma);
        const turmaBlocks = allSchedules.filter(
          (b) => normalizeStr(b.turma) === normalizeStr(matchedTurma) && b.dayOfWeek === dayOfWeek
        );
        const currentBlock = getCurrentActivityForTurma(turmaBlocks, refTime);
        const nextBlock = getNextSlot(turmaBlocks, refTime);
        const atrib = resolveAtribuicaoForTurma(matchedTurma, atribuicoes, context.users || []);
        const responsavel = [atrib.monitoraName, atrib.monitoraAssistenteName, atrib.adiName]
          .filter(Boolean)
          .join(', ');

        if (!currentBlock) {
          return {
            toolName,
            success: true,
            data: {
              data: targetDate,
              dia_semana: dayFull,
              horario_consulta: refTime,
              turma: matchedTurma,
              atividade_atual: null,
              proxima_atividade: nextBlock
                ? {
                    atividade: nextBlock.activityId,
                    inicio: extractSlotLimits(nextBlock).horaInicio,
                    fim: extractSlotLimits(nextBlock).horaFim,
                    local: nextBlock.location || atrib.espacoBase || null,
                  }
                : null,
              responsavel: responsavel || null,
              grade_do_dia_vazia: turmaBlocks.length === 0,
            },
          };
        }

        const limits = extractSlotLimits(currentBlock);
        const semPlan = findMatchingSemanarioPlan(semanario, matchedTurma, targetDate, currentBlock);
        return {
          toolName,
          success: true,
          data: {
            data: targetDate,
            dia_semana: dayFull,
            horario_consulta: refTime,
            turma: matchedTurma,
            atividade_atual: currentBlock.activityId,
            inicio: limits.horaInicio,
            fim: limits.horaFim,
            local: currentBlock.location || atrib.espacoBase || null,
            orientacoes: currentBlock.guidelines || null,
            proposta_semanario: semPlan?.title || null,
            responsavel: responsavel || null,
            proxima_atividade: nextBlock
              ? {
                  atividade: nextBlock.activityId,
                  inicio: extractSlotLimits(nextBlock).horaInicio,
                  fim: extractSlotLimits(nextBlock).horaFim,
                }
              : null,
          },
        };
      }

      const emAtividade: Array<{ turma: string; atividade: string; local: string | null; inicio: string; fim: string }> = [];
      const semAtividade: string[] = [];

      availableTurmas.forEach((t) => {
        const blocks = allSchedules.filter(
          (b) => normalizeStr(b.turma) === normalizeStr(t) && b.dayOfWeek === dayOfWeek
        );
        const cur = getCurrentActivityForTurma(blocks, refTime);
        if (cur) {
          const limits = extractSlotLimits(cur);
          emAtividade.push({
            turma: t,
            atividade: cur.activityId,
            local: cur.location || null,
            inicio: limits.horaInicio,
            fim: limits.horaFim,
          });
        } else {
          semAtividade.push(t);
        }
      });

      return {
        toolName,
        success: true,
        data: {
          data: targetDate,
          dia_semana: dayFull,
          horario_consulta: refTime,
          em_atividade: emAtividade,
          sem_atividade_no_horario: semAtividade,
        },
      };
    }

    // -------------------------------------------------------------------
    // consultarGradeHoraria(turma?, dia?, atividade?)
    // -------------------------------------------------------------------
    case 'consultarGradeHoraria': {
      const matchedTurma = args.turma
        ? findTurmaFuzzy(availableTurmas, String(args.turma)) || String(args.turma)
        : undefined;
      let targetDay: DayOfWeek | null = null;
      if (args.dia) {
        const asDay = normalizeDayOfWeek(String(args.dia));
        if (asDay) targetDay = asDay;
        else {
          const resolved = resolveDateArg(String(args.dia), todaySaoPaulo);
          targetDay = getDayOfWeekFromDate(resolved);
        }
      } else {
        targetDay = getDayOfWeekFromDate(todaySaoPaulo);
      }

      const atividadeFilter = args.atividade ? normalizeStr(String(args.atividade)) : '';
      const blocks = (context.schedules || [])
        .filter((b) => {
          if (matchedTurma && normalizeStr(b.turma) !== normalizeStr(matchedTurma)) return false;
          if (targetDay && b.dayOfWeek !== targetDay) return false;
          if (atividadeFilter && !normalizeStr(b.activityId).includes(atividadeFilter)) return false;
          return true;
        })
        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

      return {
        toolName,
        success: true,
        data: {
          turma: matchedTurma || 'TODAS',
          dia_semana: targetDay ? getDayOfWeekFullPTBR(targetDay) : 'toda a semana',
          atividade_filtro: args.atividade || null,
          total_blocos: blocks.length,
          blocos: blocks.slice(0, 40).map((b) => {
            const limits = extractSlotLimits(b);
            return {
              turma: b.turma,
              dia: getDayOfWeekFullPTBR(b.dayOfWeek),
              inicio: limits.horaInicio,
              fim: limits.horaFim,
              atividade: b.activityId,
              local: b.location || null,
            };
          }),
        },
      };
    }

    // -------------------------------------------------------------------
    // consultarLivroPonto(colaborador?, data?) — Cálculo de pendências + escala
    // -------------------------------------------------------------------
    case 'consultarLivroPonto': {
      const targetDate = resolveDateArg(args.data, todaySaoPaulo);
      const dayRecords = (context.pontoRecords || []).filter((r) => r.date === targetDate);
      const users = context.users && context.users.length > 0 ? context.users : await getUsers();
      const targetColab = args.colaborador ? String(args.colaborador).trim() : '';

      const filteredRecords = targetColab
        ? dayRecords.filter((r) => {
            const u = users.find((usr) => usr.id === r.userId);
            const rName = r.userName || u?.name || '';
            return normalizeStr(rName).includes(normalizeStr(targetColab));
          })
        : dayRecords;

      const registros = filteredRecords.map((r) => {
        const u = users.find((usr) => usr.id === r.userId);
        const nome = r.userName || u?.name || 'Colaborador';
        const e1 = (r.entry1 || r.entrada_1 || '').trim() || null;
        const s1 = (r.exit1 || r.saida_1 || '').trim() || null;
        const e2 = (r.entry2 || r.entrada_2 || '').trim() || null;
        const s2 = (r.exit2 || r.saida_2 || '').trim() || null;
        const isContinuous = u ? isContinuousShift(u, u.contractSchedule) : false;

        const motivosPendencia: string[] = [];
        if (s1 && !e2) {
          motivosPendencia.push('inicio_intervalo_sem_retorno');
        }
        if (e2 && !s2) {
          motivosPendencia.push('sem_saida');
        }
        if (e1 && !s1 && !e2 && !s2) {
          motivosPendencia.push('entrada_sem_outro_registro');
        } else if (!isContinuous && e1 && s1 && !e2 && !s2) {
          // Já contemplado acima por inicio_intervalo_sem_retorno
        }

        return {
          colaborador: nome,
          cargo: u?.cargoLabel || (r as any).userCargo || null,
          jornada_continua: isContinuous,
          entrada: e1,
          inicio_intervalo: s1,
          retorno_intervalo: e2,
          saida: s2,
          pendente: motivosPendencia.length > 0,
          motivos_pendencia: motivosPendencia,
        };
      });

      const pendencias = registros.filter((r) => r.pendente);

      // Verifica se existe escala diária cadastrada para todos os colaboradores ativos
      const activeStaff = users.filter((u) => isUserActive(u));
      const allHaveExplicitSchedule =
        activeStaff.length > 0 &&
        activeStaff.every((u) => Array.isArray(u.diasGradeAutorizados) && u.diasGradeAutorizados.length > 0);

      let escalaDisponivel = false;
      let semRegistro: Array<{ colaborador: string; cargo: string | null }> = [];

      if (isUserAdmin && allHaveExplicitSchedule && !targetColab) {
        const dayKey = getDayOfWeekFromDate(targetDate);
        if (dayKey) {
          escalaDisponivel = true;
          const recordedIds = new Set(dayRecords.map((r) => r.userId));
          const recordedNames = new Set(dayRecords.map((r) => normalizeStr(r.userName)));
          semRegistro = activeStaff
            .filter((u) => u.diasGradeAutorizados!.includes(dayKey))
            .filter((u) => !recordedIds.has(u.id) && !recordedNames.has(normalizeStr(u.name)))
            .map((u) => ({ colaborador: u.name, cargo: u.cargoLabel || null }));
        }
      }

      return {
        toolName,
        success: true,
        data: {
          data: targetDate,
          data_formatada: formatDateBR(targetDate),
          dia_semana: getDayOfWeekFullPTBR(targetDate),
          filtro_colaborador: targetColab || null,
          total_registros: registros.length,
          registros: registros.slice(0, 30),
          pendencias,
          total_pendencias: pendencias.length,
          escala_disponivel: escalaDisponivel,
          sem_registro: semRegistro,
          total_colaboradores_ativos_sistema: isUserAdmin ? activeStaff.length : undefined,
        },
      };
    }

    // -------------------------------------------------------------------
    // analisarDesarranjosDoDia() — Resumo executivo completo unificado
    // -------------------------------------------------------------------
    case 'analisarDesarranjosDoDia': {
      const targetDate = todaySaoPaulo;
      const metrics = getUnifiedSofiaAttendanceMetrics({
        dateStr: targetDate,
        students: context.students || [],
        records: context.records || [],
        activeTurmas: availableTurmas,
      });

      const pontoHoje = (context.pontoRecords || []).filter((p) => p.date === targetDate);
      const users = context.users && context.users.length > 0 ? context.users : [];
      const pontoPendencias = pontoHoje
        .map((p) => {
          const u = users.find((usr) => usr.id === p.userId);
          const nome = p.userName || u?.name || 'Colaborador';
          const e1 = (p.entry1 || p.entrada_1 || '').trim();
          const s1 = (p.exit1 || p.saida_1 || '').trim();
          const e2 = (p.entry2 || p.entrada_2 || '').trim();
          const s2 = (p.exit2 || p.saida_2 || '').trim();
          const motivos: string[] = [];
          if (s1 && !e2) motivos.push('inicio_intervalo_sem_retorno');
          if (e2 && !s2) motivos.push('sem_saida');
          if (e1 && !s1 && !e2 && !s2) motivos.push('entrada_sem_outro_registro');
          return motivos.length > 0 ? { colaborador: nome, motivos } : null;
        })
        .filter(Boolean);

      const expectedStudents = metrics.consolidated.studentDetails.map((d) => d.student);
      const recordMap = new Map<string, AttendanceRecord>();
      metrics.consolidated.studentDetails.forEach((d) => {
        if (d.record) recordMap.set(d.student.id, d.record);
      });

      const dayOfWeek = getDayOfWeekFromDate(targetDate);
      const saidasAntecipadasHoje = expectedStudents.filter((s) => {
        const rec = recordMap.get(s.id);
        if (rec && (rec.status === 'saida_antecipada' || rec.exitTime)) return true;
        const h = s.horariosSaida?.[dayOfWeek as any] || s.horarioSaida;
        return Boolean(h && h.trim() < '17:00' && h.trim() >= '12:00');
      });

      const alunosVanHoje = expectedStudents.filter(
        (s) =>
          s.tipoSaida === 'TRANSPORTE_ESCOLAR' ||
          Boolean(s.nomeCondutor) ||
          Boolean((s as any).usesSchoolTransport) ||
          Boolean((s as any).vanDriverName)
      );

      return {
        toolName,
        success: true,
        data: {
          data: targetDate,
          data_formatada: formatDateBR(targetDate),
          dia_semana: getDayOfWeekFullPTBR(targetDate),
          hora_atual: getNowTimeSaoPaulo(),
          atualizado_em: metrics.atualizado_em,
          frequencia: {
            presentes: metrics.presentes,
            faltas: metrics.faltas,
            justificados: metrics.justificados,
            saidas_antecipadas: metrics.saidas_antecipadas,
            sem_equipamento: metrics.sem_equipamento,
            esperados: metrics.esperados,
            total_matriculados: metrics.total_matriculados,
            alunos_pendentes_chamada: metrics.alunos_pendentes_qtd,
            turmas_com_chamada_pendente: metrics.turmas_com_chamada_pendente,
          },
          saidas: {
            total_van: alunosVanHoje.length,
            total_saidas_antecipadas: saidasAntecipadasHoje.length,
            saidas_antecipadas_lista: saidasAntecipadasHoje.slice(0, 15).map((s) => {
              const rec = recordMap.get(s.id);
              return {
                nome: s.name,
                turma: s.turma,
                horario: rec?.exitTime || s.horariosSaida?.[dayOfWeek as any] || s.horarioSaida || null,
                confirmada: Boolean(rec?.checkoutConfirmed),
              };
            }),
          },
          ponto: isUserAdmin
            ? {
                total_registros_hoje: pontoHoje.length,
                pendencias_qtd: pontoPendencias.length,
                pendencias: pontoPendencias,
                escala_disponivel: false,
              }
            : undefined,
        },
      };
    }

    // -------------------------------------------------------------------
    // registrarSaidaAntecipada(alunoId, horario?, turma?, justificativa?)
    // -------------------------------------------------------------------
    case 'registrarSaidaAntecipada': {
      const alunoQuery = String(args.alunoId || '').trim();
      const turmaQuery = args.turma ? String(args.turma).trim() : undefined;
      const rawHorario = String(args.horario || '').trim();
      const normalizedHorario = normalizeTime(rawHorario) || rawHorario || getNowTimeSaoPaulo();

      if (!alunoQuery) {
        return {
          toolName,
          success: false,
          error: 'Nome do aluno não informado.',
        };
      }

      const matches = findMatchingStudents(context.students || [], alunoQuery, turmaQuery);
      if (matches.length === 0) {
        return {
          toolName,
          success: false,
          error: turmaQuery
            ? `Nenhum aluno chamado "${alunoQuery}" encontrado na turma ${turmaQuery}.`
            : `Nenhum aluno chamado "${alunoQuery}" encontrado no cadastro ativo.`,
        };
      }

      if (matches.length > 1) {
        return {
          toolName,
          success: false,
          needsDisambiguation: true,
          error: 'Mais de um aluno encontrado com esse nome; precisa confirmar qual deles.',
          data: {
            opcoes: matches.slice(0, 6).map((s) => ({ nome: s.name, turma: s.turma })),
          },
        };
      }

      const student = matches[0];
      if (!context.onSaveRecord) {
        return {
          toolName,
          success: false,
          error: 'Função de gravação indisponível no contexto atual.',
        };
      }

      const targetDate = todaySaoPaulo;
      const { year, weekNumber } = buildWeekInfoFromDate(targetDate);

      await context.onSaveRecord({
        studentId: student.id,
        turma: student.turma,
        date: targetDate,
        weekNumber,
        year,
        status: 'saida_antecipada',
        activity: 'Rotina',
        exitTime: normalizedHorario,
        observation: args.justificativa
          ? `Saída antecipada às ${normalizedHorario}: ${args.justificativa}`
          : `Saída antecipada registrada para às ${normalizedHorario}`,
      });

      const atribuicoes = context.quadroAtribuicoes && context.quadroAtribuicoes.length > 0
        ? context.quadroAtribuicoes
        : loadLocalQuadroAtribuicoes();
      const atrib = resolveAtribuicaoForTurma(student.turma, atribuicoes, context.users || []);

      return {
        toolName,
        success: true,
        data: {
          aluno: student.name,
          turma: student.turma,
          data: targetDate,
          horario: normalizedHorario,
          justificativa: args.justificativa || null,
          monitora_turma: atrib.monitoraName || null,
        },
      };
    }

    // -------------------------------------------------------------------
    // confirmarSaidaAluno(alunoId, turma?, horario?, observacao?)
    // -------------------------------------------------------------------
    case 'confirmarSaidaAluno': {
      const alunoQuery = String(args.alunoId || '').trim();
      const turmaQuery = args.turma ? String(args.turma).trim() : undefined;
      const horario = normalizeTime(args.horario) || String(args.horario || '').trim() || getNowTimeSaoPaulo();

      if (!alunoQuery) {
        return { toolName, success: false, error: 'Nome do aluno não informado.' };
      }

      const matches = findMatchingStudents(context.students || [], alunoQuery, turmaQuery);
      if (matches.length === 0) {
        return { toolName, success: false, error: `Nenhum aluno chamado "${alunoQuery}" encontrado.` };
      }
      if (matches.length > 1) {
        return {
          toolName,
          success: false,
          needsDisambiguation: true,
          error: 'Mais de um aluno encontrado com esse nome.',
          data: { opcoes: matches.slice(0, 6).map((s) => ({ nome: s.name, turma: s.turma })) },
        };
      }

      const student = matches[0];
      if (!context.onSaveRecord) {
        return { toolName, success: false, error: 'Função de gravação indisponível no momento.' };
      }

      const targetDate = todaySaoPaulo;
      const { year, weekNumber } = buildWeekInfoFromDate(targetDate);

      await context.onSaveRecord({
        studentId: student.id,
        turma: student.turma,
        date: targetDate,
        weekNumber,
        year,
        status: 'saida_antecipada',
        activity: 'Rotina',
        exitTime: horario,
        checkoutConfirmed: true,
        observation: args.observacao
          ? `Saída confirmada às ${horario}: ${args.observacao}`
          : `Saída confirmada pela equipe às ${horario}`,
      });

      return {
        toolName,
        success: true,
        data: {
          aluno: student.name,
          turma: student.turma,
          data: targetDate,
          horario,
          saida_confirmada: true,
        },
      };
    }

    // -------------------------------------------------------------------
    // consultarAlertasSaidaHoje(tipo?, turma?, detalhesVan?)
    // -------------------------------------------------------------------
    case 'consultarAlertasSaidaHoje': {
      const targetDate = todaySaoPaulo;
      const dayOfWeek = getDayOfWeekFromDate(targetDate);
      const matchedTurma = args.turma
        ? findTurmaFuzzy(availableTurmas, String(args.turma)) || String(args.turma)
        : undefined;

      const metrics = getUnifiedSofiaAttendanceMetrics({
        dateStr: targetDate,
        students: context.students || [],
        records: context.records || [],
        turmaFilter: matchedTurma,
        activeTurmas: availableTurmas,
      });

      const expectedStudents = metrics.consolidated.studentDetails.map((d) => d.student);
      const recordMap = new Map<string, AttendanceRecord>();
      metrics.consolidated.studentDetails.forEach((d) => {
        if (d.record) recordMap.set(d.student.id, d.record);
      });

      const alunosVan = expectedStudents
        .filter((s) => s.tipoSaida === 'TRANSPORTE_ESCOLAR' || Boolean(s.nomeCondutor))
        .map((s) => ({
          nome: s.name,
          turma: s.turma,
          condutor: s.nomeCondutor || null,
          horario: s.horariosSaida?.[dayOfWeek as any] || s.horarioSaida || null,
        }));

      const alunosSaidaAntecipada = expectedStudents
        .filter((s) => {
          const rec = recordMap.get(s.id);
          if (rec && (rec.status === 'saida_antecipada' || rec.exitTime)) return true;
          const horarioDia = s.horariosSaida?.[dayOfWeek as any] || s.horarioSaida;
          return Boolean(horarioDia && horarioDia.trim() < '17:00' && horarioDia.trim() >= '12:00');
        })
        .map((s) => {
          const rec = recordMap.get(s.id);
          return {
            nome: s.name,
            turma: s.turma,
            horario: rec?.exitTime || s.horariosSaida?.[dayOfWeek as any] || s.horarioSaida || null,
            liberado: Boolean(rec?.checkoutConfirmed),
            observacao: rec?.observation || null,
          };
        });

      const liberados = expectedStudents
        .filter((s) => Boolean(recordMap.get(s.id)?.checkoutConfirmed))
        .map((s) => ({ nome: s.name, turma: s.turma }));

      return {
        toolName,
        success: true,
        data: {
          data: targetDate,
          turma: matchedTurma || 'TODAS',
          tipo_consulta: args.tipo || 'geral',
          total_van: alunosVan.length,
          total_saidas_antecipadas: alunosSaidaAntecipada.length,
          total_liberados: liberados.length,
          alunos_van: alunosVan,
          saidas_antecipadas: alunosSaidaAntecipada,
          alunos_liberados: liberados,
        },
      };
    }

    // -------------------------------------------------------------------
    // consultarCardapio(data?, turma?)
    // -------------------------------------------------------------------
    case 'consultarCardapio': {
      const targetDate = resolveDateArg(args.data, todaySaoPaulo);
      const [yearStr, monthStr] = targetDate.split('-');
      const monthKey = `${yearStr}-${monthStr}`;
      const menu = loadMonthlyMenu(monthKey);
      const dayItem = menu?.days?.[targetDate] || null;
      const dayFull = getDayOfWeekFullPTBR(targetDate);

      const allergyKeywords = ['alerg', 'intoler', 'lactose', 'gluten', 'glúten', 'aplv', 'ovo', 'amendoim', 'restric', 'restriç'];
      const scopeTurma = args.turma
        ? normalizeStr(findTurmaFuzzy(availableTurmas, String(args.turma)) || String(args.turma))
        : '';

      const studentsWithRestrictions = (context.students || []).filter((s) => {
        if ((s.status || s.statusMatricula || 'ativo') !== 'ativo') return false;
        if (scopeTurma && !normalizeStr(s.turma).includes(scopeTurma)) return false;
        const n = normalizeStr(s.notes);
        return allergyKeywords.some((kw) => n.includes(kw));
      });

      return {
        toolName,
        success: true,
        data: {
          data: targetDate,
          data_formatada: formatDateBR(targetDate),
          dia_semana: dayFull,
          cardapio_cadastrado: Boolean(dayItem),
          feriado: Boolean(dayItem?.isHoliday),
          descricao_feriado: dayItem?.holidayDescription || null,
          refeicao: dayItem && !dayItem.isHoliday
            ? {
                prato_principal: dayItem.protein || null,
                base: dayItem.base || [],
                guarnicao: dayItem.garnish || null,
                salada: dayItem.salad || null,
                sobremesa: dayItem.dessert || null,
                observacoes: dayItem.specialNotes || null,
              }
            : null,
          restricoes_alimentares_qtd: studentsWithRestrictions.length,
          alunos_com_restricao: isUserAdmin
            ? studentsWithRestrictions.slice(0, 12).map((s) => ({
                nome: s.name,
                turma: s.turma,
                observacao: s.notes || null,
              }))
            : undefined,
        },
      };
    }

    // -------------------------------------------------------------------
    // consultarSemanario(turma?, data?)
    // -------------------------------------------------------------------
    case 'consultarSemanario': {
      const targetDate = resolveDateArg(args.data, todaySaoPaulo);
      const plans = context.semanarioPlans && context.semanarioPlans.length > 0
        ? context.semanarioPlans
        : loadSemanarioPlans();
      const matchedTurma = args.turma
        ? findTurmaFuzzy(availableTurmas, String(args.turma)) || String(args.turma)
        : undefined;

      const filtered = plans.filter((p) => {
        if (p.date !== targetDate) return false;
        if (matchedTurma && normalizeStr(p.turma) !== normalizeStr(matchedTurma)) return false;
        return true;
      });

      return {
        toolName,
        success: true,
        data: {
          data: targetDate,
          data_formatada: formatDateBR(targetDate),
          dia_semana: getDayOfWeekFullPTBR(targetDate),
          turma: matchedTurma || 'TODAS',
          total_atividades: filtered.length,
          atividades: filtered.slice(0, 15).map((p) => ({
            turma: p.turma,
            horario: p.horaInicio || p.timeSlot || null,
            categoria: p.category,
            titulo: p.title,
            materiais: p.materials || null,
            objetivos: p.objectives || null,
            status: p.status,
          })),
        },
      };
    }

    // -------------------------------------------------------------------
    // consultarManualNormas(termoOuTema)
    // -------------------------------------------------------------------
    case 'consultarManualNormas': {
      const termo = normalizeStr(args.termoOuTema || '');
      const tokens = termo.split(/\s+/).filter((t) => t.length >= 3);

      const scored = NORMAS_DATA.map((n) => {
        const titleN = normalizeStr(n.title);
        const sumN = normalizeStr(n.summary);
        const secN = normalizeStr(n.sectionTitle);
        const modN = normalizeStr(n.moduleTitle);
        const tagsN = Array.isArray(n.tags) ? n.tags.map(normalizeStr).join(' ') : '';
        const blob = `${titleN} ${secN} ${modN} ${tagsN} ${sumN}`;

        let score = 0;
        if (termo && blob.includes(termo)) score += 10;
        tokens.forEach((tk) => {
          if (titleN.includes(tk)) score += 4;
          if (tagsN.includes(tk)) score += 3;
          if (sumN.includes(tk) || secN.includes(tk)) score += 2;
        });

        return { norma: n, score };
      })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);

      if (scored.length === 0) {
        return {
          toolName,
          success: false,
          error: `Nenhuma norma exata encontrada no Manual para "${args.termoOuTema}".`,
        };
      }

      const top = scored[0].norma;
      return {
        toolName,
        success: true,
        data: {
          secao: top.sectionNumber,
          modulo: top.moduleTitle,
          titulo: top.title,
          resumo: top.summary,
          outras_relacionadas: scored.slice(1, 3).map((x) => ({
            secao: x.norma.sectionNumber,
            titulo: x.norma.title,
          })),
        },
      };
    }

    // -------------------------------------------------------------------
    // consultarAlunosOuTurma(busca?, turma?)
    // -------------------------------------------------------------------
    case 'consultarAlunosOuTurma': {
      const busca = String(args.busca || '').trim();
      const turmaArg = String(args.turma || '').trim();
      const matchedTurma = turmaArg ? findTurmaFuzzy(availableTurmas, turmaArg) || turmaArg : '';

      const activeStudents = (context.students || []).filter((s) => isStudentActiveOnDate(s, baseDate));
      const dayKey = getDayOfWeekFromDate(baseDate);

      if (busca) {
        const matches = findMatchingStudents(activeStudents, busca, matchedTurma);
        if (matches.length === 0) {
          return {
            toolName,
            success: false,
            error: matchedTurma
              ? `Nenhum aluno chamado "${busca}" encontrado na turma ${matchedTurma}.`
              : `Nenhum aluno chamado "${busca}" encontrado no cadastro ativo.`,
          };
        }

        return {
          toolName,
          success: true,
          data: {
            total_encontrados: matches.length,
            alunos: matches.slice(0, 10).map((s) => ({
              nome: s.name,
              turma: s.turma,
              tipo_contrato: s.tipoContrato || 'regular',
              horario_saida: (dayKey && s.horariosSaida?.[dayKey]) || s.horarioSaida || s.horarioPermanenciaLimite || '18:30',
              transporte: s.tipoSaida === 'TRANSPORTE_ESCOLAR' ? 'van' : 'pais',
              condutor: s.nomeCondutor || null,
              observacoes: isUserAdmin ? s.notes || null : null,
            })),
          },
        };
      }

      if (matchedTurma) {
        const turmaStudents = activeStudents.filter((s) => normalizeStr(s.turma) === normalizeStr(matchedTurma));
        const expectedToday = turmaStudents.filter((s) => isStudentScheduledForDate(s, baseDate));

        return {
          toolName,
          success: true,
          data: {
            turma: matchedTurma,
            total_ativos: turmaStudents.length,
            esperados_hoje: expectedToday.length,
            alunos: expectedToday.slice(0, 25).map((s) => ({
              nome: s.name,
              tipo_contrato: s.tipoContrato || 'regular',
              horario_saida: (dayKey && s.horariosSaida?.[dayKey]) || s.horarioSaida || '18:30',
            })),
          },
        };
      }

      return {
        toolName,
        success: true,
        data: {
          total_alunos_ativos: activeStudents.length,
          turmas: availableTurmas,
        },
      };
    }

    // -------------------------------------------------------------------
    // consultarQuadroAtribuicoes(turma?, colaborador?)
    // -------------------------------------------------------------------
    case 'consultarQuadroAtribuicoes': {
      const atribuicoes = context.quadroAtribuicoes && context.quadroAtribuicoes.length > 0
        ? context.quadroAtribuicoes
        : loadLocalQuadroAtribuicoes();
      const turmasList = availableTurmas.length > 0 ? availableTurmas : atribuicoes.map((a) => a.turma);

      if (args.turma) {
        const matched = findTurmaFuzzy(turmasList, String(args.turma)) || String(args.turma);
        const atrib = resolveAtribuicaoForTurma(matched, atribuicoes, context.users || []);
        return {
          toolName,
          success: true,
          data: {
            turma: atrib.turma,
            monitora: atrib.monitoraName || null,
            assistente: atrib.monitoraAssistenteName || null,
            adi: atrib.adiName || null,
            turno: atrib.horarioTurno || null,
            espaco_base: atrib.espacoBase || null,
          },
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
            error: `Colaborador(a) "${args.colaborador}" não encontrado no Quadro de Atribuições.`,
          };
        }
        return {
          toolName,
          success: true,
          data: {
            colaborador: args.colaborador,
            atribuicoes: found.map((a) => ({
              turma: a.turma,
              turno: a.horarioTurno || null,
              espaco: a.espacoBase || null,
            })),
          },
        };
      }

      return {
        toolName,
        success: true,
        data: {
          atribuicoes: atribuicoes
            .filter((a) => a.monitoraName || a.adiName)
            .map((a) => ({
              turma: a.turma,
              monitora: a.monitoraName || null,
              assistente: a.monitoraAssistenteName || null,
              adi: a.adiName || null,
              turno: a.horarioTurno || null,
            })),
        },
      };
    }

    // -------------------------------------------------------------------
    // navegarModulo(modulo)
    // -------------------------------------------------------------------
    case 'navegarModulo': {
      const targetTab = String(args.modulo || 'momento') as TabType;
      if (context.onNavigateTab) {
        context.onNavigateTab(targetTab);
      }
      return {
        toolName,
        success: true,
        data: { modulo_aberto: targetTab },
      };
    }

    // -------------------------------------------------------------------
    // gerarEspelhoPontoPDF(colaboradorId?, mesAno?)
    // -------------------------------------------------------------------
    case 'gerarEspelhoPontoPDF': {
      const colaboradorQuery = args.colaboradorId || context.currentUser?.name || '';
      const mesAnoRaw = args.mesAno || '';

      if (!colaboradorQuery) {
        return { toolName, success: false, error: 'Nome do colaborador não informado.' };
      }

      const collaborator = await findCollaborator(colaboradorQuery, context.users);
      if (!collaborator) {
        return {
          toolName,
          success: false,
          error: `Colaborador "${colaboradorQuery}" não encontrado no cadastro.`,
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
      const userRecords = (context.pontoRecords || []).filter((r) => r.userId === collaborator.id);
      const holidaysList = context.holidays || [];

      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayRec = userRecords.find((r) => r.date === dayStr);
        const dayOfWeekName = getDayOfWeekFromDate(dayStr);
        const wk = isWeekend(dayStr);
        const holidayItem = holidaysList.find((h) => {
          if (h.endDate) return dayStr >= h.date && dayStr <= h.endDate;
          return h.date === dayStr;
        });
        const dowNum = new Date(`${dayStr}T12:00:00`).getDay();
        const defaultStatus = dowNum === 6
          ? 'sabado'
          : dowNum === 0
          ? 'domingo'
          : holidayItem
          ? (holidayItem.type === 'recesso' ? 'recesso' : 'feriado')
          : 'normal';

        monthDaysGrid.push({
          dayNumber: day,
          dateStr: dayStr,
          dayOfWeekLabel: dayOfWeekName,
          dayOfWeekName,
          isWeekend: wk,
          isWk: wk,
          isSat: dowNum === 6,
          isSun: dowNum === 0,
          defaultStatus,
          holidayRecessName: holidayItem?.name,
          holidayItem,
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

      const downloadDisparado = triggerIdempotentPdfDownload(
        toolName,
        result.filename,
        result.download,
        context
      );

      return {
        toolName,
        success: true,
        filename: result.filename,
        downloadUrl: result.blobUrl || result.dataUrl,
        data: {
          ok: true,
          nomeArquivo: result.filename,
          download_automatico_disparado: downloadDisparado,
          colaborador: collaborator.name,
          mes: getMonthNameBR(targetMonth),
          ano: targetYear,
        },
      };
    }

    // -------------------------------------------------------------------
    // gerarAutorizacaoEntradaSaidaPDF(alunoId, motivo, horario?, justificativa?)
    // -------------------------------------------------------------------
    case 'gerarAutorizacaoEntradaSaidaPDF': {
      const alunoQuery = args.alunoId || '';
      const motivo: 'atraso' | 'saida_antecipada' =
        args.motivo === 'saida_antecipada' ? 'saida_antecipada' : 'atraso';
      const horario = normalizeTime(args.horario) || args.horario || getNowTimeSaoPaulo();

      const matches = findMatchingStudents(context.students, alunoQuery);
      if (matches.length === 0) {
        return { toolName, success: false, error: `Aluno "${alunoQuery}" não encontrado no cadastro.` };
      }
      if (matches.length > 1) {
        return {
          toolName,
          success: false,
          needsDisambiguation: true,
          error: 'Mais de um aluno encontrado com esse nome.',
          data: { opcoes: matches.slice(0, 6).map((s) => ({ nome: s.name, turma: s.turma })) },
        };
      }

      const student = matches[0];
      const { filename, blobUrl, download } = generateAutorizacaoPDFBlob({
        student,
        motivo,
        horario,
        data: todaySaoPaulo,
        justificativa: args.justificativa,
        emissor: context.currentUser?.name || 'Coordenação do Integral',
      });

      const downloadDisparado = triggerIdempotentPdfDownload(
        toolName,
        filename,
        download,
        context
      );

      return {
        toolName,
        success: true,
        filename,
        downloadUrl: blobUrl,
        data: {
          ok: true,
          nomeArquivo: filename,
          download_automatico_disparado: downloadDisparado,
          aluno: student.name,
          turma: student.turma,
          motivo,
          horario,
        },
      };
    }

    // -------------------------------------------------------------------
    // registrarFaltaFrequencia(alunoId, data?, justificativa?, confirmado?)
    // -------------------------------------------------------------------
    case 'registrarFaltaFrequencia': {
      const alunoQuery = args.alunoId || '';
      const turmaQuery = args.turma ? String(args.turma).trim() : undefined;
      const targetDate = resolveDateArg(args.data, todaySaoPaulo);
      const justificativa = args.justificativa || 'Falta registrada via Sofia';

      let matches = findMatchingStudents(context.students, alunoQuery, turmaQuery);
      if (matches.length === 0) {
        return { toolName, success: false, error: `Aluno "${alunoQuery}" não encontrado.` };
      }

      if (matches.length > 1) {
        return {
          toolName,
          success: false,
          needsDisambiguation: true,
          error: 'Mais de um aluno encontrado com esse nome.',
          data: { opcoes: matches.slice(0, 6).map((s) => ({ nome: s.name, turma: s.turma })) },
        };
      }

      const student = matches[0];

      if (requiresConfirmation(toolName) && args.confirmado !== true) {
        return buildConfirmationPromptResult(toolName, {
          acao: 'Registrar falta na chamada',
          aluno: student.name,
          turma: student.turma,
          data: formatDateBR(targetDate),
          justificativa,
        });
      }

      if (!context.onSaveRecord) {
        return { toolName, success: false, error: 'Função de gravação indisponível no momento.' };
      }

      const { year, weekNumber } = buildWeekInfoFromDate(targetDate);
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

      return {
        toolName,
        success: true,
        data: {
          aluno: student.name,
          turma: student.turma,
          data: targetDate,
          data_formatada: formatDateBR(targetDate),
          status: 'falta',
        },
      };
    }

    // -------------------------------------------------------------------
    // dispararAlertaWhatsApp(destinatario, mensagem, confirmado?)
    // -------------------------------------------------------------------
    case 'dispararAlertaWhatsApp': {
      const destinatario = args.destinatario || 'Coordenação';
      const mensagem = String(args.mensagem || '').trim();
      if (!mensagem) {
        return { toolName, success: false, error: 'Texto da mensagem não informado.' };
      }

      if (requiresConfirmation(toolName) && args.confirmado !== true) {
        return buildConfirmationPromptResult(toolName, {
          acao: 'Preparar aviso via WhatsApp',
          destinatario: Array.isArray(destinatario) ? destinatario.join(', ') : String(destinatario),
          mensagem,
        });
      }

      let phone = '5519999999999';
      const cleanDest = normalizeStr(String(destinatario));
      if (cleanDest.includes('coord')) {
        phone = '5519981234567';
      } else {
        const rawDigits = String(destinatario).replace(/\D/g, '');
        if (rawDigits.length >= 10) {
          phone = rawDigits.startsWith('55') ? rawDigits : `55${rawDigits}`;
        }
      }

      const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(mensagem)}`;
      return {
        toolName,
        success: true,
        whatsappUrl,
        data: {
          destinatario,
          telefone: formatPhoneDisplay(phone),
          mensagem,
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
      const horarioSaida = normalizeTime(args.horarioSaida) || args.horarioSaida || getNowTimeSaoPaulo();

      const matches = findMatchingStudents(context.students, alunoQuery);
      if (matches.length === 0) {
        return { toolName, success: false, error: `Aluno "${alunoQuery}" não encontrado.` };
      }
      if (matches.length > 1) {
        return {
          toolName,
          success: false,
          needsDisambiguation: true,
          error: 'Mais de um aluno encontrado com esse nome.',
          data: { opcoes: matches.slice(0, 6).map((s) => ({ nome: s.name, turma: s.turma })) },
        };
      }

      const student = matches[0];
      const pdfResult = generateTermoSaidaAvulsaPDF(
        {
          student,
          nomeRetirante,
          documentoRetirante,
          parentesco,
          motivoSaida,
          dataSaida: todaySaoPaulo,
          horarioSaida,
          responsavelLiberacao: context.currentUser?.name || 'Equipe Integral',
        },
        typeof document !== 'undefined'
      );

      if (context.onSaveRecord) {
        const { year, weekNumber } = buildWeekInfoFromDate(todaySaoPaulo);
        await context.onSaveRecord({
          studentId: student.id,
          turma: (student.turma as any) || '1º Ano Azul',
          date: todaySaoPaulo,
          weekNumber,
          year,
          status: 'saida_antecipada',
          activity: 'Rotina',
          exitTime: horarioSaida,
          checkoutConfirmed: true,
          observation: `Termo de Saída Avulsa: retirado por ${nomeRetirante} (${parentesco} - Doc: ${documentoRetirante}) às ${horarioSaida}.`,
        });
      }

      return {
        toolName,
        success: true,
        filename: pdfResult.filename,
        downloadUrl: pdfResult.blobUrl || pdfResult.dataUrl,
        data: {
          ok: true,
          nomeArquivo: pdfResult.filename,
          aluno: student.name,
          turma: student.turma,
          retirante: nomeRetirante,
          horario: horarioSaida,
        },
      };
    }

    // -------------------------------------------------------------------
    // alterarAnoLetivoAluno(alunoId, novoAnoLetivo, confirmado?)
    // -------------------------------------------------------------------
    case 'alterarAnoLetivoAluno': {
      const alunoQuery = args.alunoId || args.nomeAluno || '';
      let novoAno = Number(args.novoAnoLetivo || args.anoLetivo || 2027);
      if (isNaN(novoAno) || (novoAno !== 2026 && novoAno !== 2027)) novoAno = 2027;

      const matches = findMatchingStudents(context.students, alunoQuery);
      if (matches.length === 0) {
        return { toolName, success: false, error: `Aluno "${alunoQuery}" não encontrado.` };
      }
      if (matches.length > 1) {
        return {
          toolName,
          success: false,
          needsDisambiguation: true,
          error: 'Mais de um aluno encontrado com esse nome.',
          data: { opcoes: matches.slice(0, 6).map((s) => ({ nome: s.name, turma: s.turma })) },
        };
      }
      const student = matches[0];

      if (requiresConfirmation(toolName) && args.confirmado !== true) {
        return buildConfirmationPromptResult(toolName, {
          acao: 'Alterar ano letivo / rematrícula do aluno',
          aluno: student.name,
          turma: student.turma,
          ano_atual: student.anoLetivo || 2026,
          novo_ano_letivo: novoAno,
        });
      }

      const updated = await updateStudent(student.id, { anoLetivo: novoAno });
      if (!updated) {
        return { toolName, success: false, error: 'Não foi possível salvar a alteração de ano letivo.' };
      }

      const idx = context.students.findIndex((s) => s.id === student.id);
      if (idx !== -1) context.students[idx] = updated;

      return {
        toolName,
        success: true,
        data: { aluno: student.name, turma: student.turma, novo_ano_letivo: novoAno },
      };
    }

    // -------------------------------------------------------------------
    // consultarResumoFinanceiro(anoLetivo?)
    // -------------------------------------------------------------------
    case 'consultarResumoFinanceiro': {
      let targetAno = Number(args.anoLetivo || new Date().getFullYear());
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

      return {
        toolName,
        success: true,
        data: {
          ano_letivo: targetAno,
          receita_confirmada: metrics.receitaConfirmada,
          receita_prevista_mensal: metrics.receitaPrevistaMensal,
          total_despesas_mes: metrics.totalDespesasMes,
          saldo_liquido_operacional: metrics.saldoLiquidoOperacional,
          taxa_adimplencia: metrics.taxaAdimplencia,
          em_dia: metrics.totalEmDia,
          pendentes: metrics.totalPendentes,
          atrasados: metrics.totalAtrasados,
        },
      };
    }

    // -------------------------------------------------------------------
    // cadastrarAluno(...)
    // -------------------------------------------------------------------
    case 'cadastrarAluno': {
      const dados = args.dadosAluno || args;
      const nome = String(dados.nome || '').trim();
      const turmaRaw = String(dados.turmaId || '1º Ano Azul');
      const turmaId = findTurmaFuzzy(availableTurmas, turmaRaw) || turmaRaw;

      if (!nome) {
        return { toolName, success: false, error: 'Nome do aluno não informado.' };
      }

      const newStudent = await createStudent({
        nome,
        turmaId,
        responsavel: dados.responsavel || '',
        telefone: dados.telefone || '',
        horarioEntradaSaida: dados.horarioEntradaSaida || '11:40 - 17:40',
      });

      if (context.students && !context.students.some((s) => s.id === newStudent.id)) {
        context.students.unshift(newStudent);
      }

      return {
        toolName,
        success: true,
        data: { nome: newStudent.name, turma: newStudent.turma },
      };
    }

    // -------------------------------------------------------------------
    // editarAluno(alunoId, dadosAtualizados, confirmado?)
    // -------------------------------------------------------------------
    case 'editarAluno': {
      const alunoId = args.alunoId || '';
      const dadosAtualizados = args.dadosAtualizados || {};
      if (!alunoId) return { toolName, success: false, error: 'Aluno não informado.' };

      const matches = findMatchingStudents(context.students, alunoId);
      if (matches.length > 1) {
        return {
          toolName,
          success: false,
          needsDisambiguation: true,
          error: 'Mais de um aluno encontrado com esse nome.',
          data: { opcoes: matches.slice(0, 6).map((s) => ({ nome: s.name, turma: s.turma })) },
        };
      }
      const found = matches[0];
      if (!found && !context.students.some((s) => s.id === alunoId)) {
        return { toolName, success: false, error: `Aluno "${alunoId}" não encontrado para atualização.` };
      }

      if (requiresConfirmation(toolName) && args.confirmado !== true) {
        return buildConfirmationPromptResult(toolName, {
          acao: 'Atualizar cadastro do aluno',
          aluno: found ? found.name : alunoId,
          turma: found?.turma || null,
          alteracoes: dadosAtualizados,
        });
      }

      const targetStudentId = found ? found.id : alunoId;
      const updated = await updateStudent(targetStudentId, dadosAtualizados);
      if (!updated) {
        return { toolName, success: false, error: `Aluno "${alunoId}" não encontrado para atualização.` };
      }

      const idx = context.students.findIndex((s) => s.id === updated.id);
      if (idx !== -1) context.students[idx] = updated;

      return {
        toolName,
        success: true,
        data: { nome: updated.name, turma: updated.turma },
      };
    }

    // -------------------------------------------------------------------
    // cadastrarUsuario(..., confirmado?)
    // -------------------------------------------------------------------
    case 'cadastrarUsuario': {
      const dados = args.dadosUsuario || args;
      const nome = String(dados.nome || '').trim();
      const email = String(dados.email || '').trim().toLowerCase();
      const funcao = dados.funcao || '';
      const cargo = dados.cargo || '';
      const perfil = String(dados.perfil || 'MONITOR').toUpperCase();

      if (!nome || !email) {
        return { toolName, success: false, error: 'Nome e e-mail do colaborador são obrigatórios.' };
      }

      if (requiresConfirmation(toolName) && args.confirmado !== true) {
        return buildConfirmationPromptResult(toolName, {
          acao: 'Cadastrar novo colaborador no sistema',
          nome,
          email,
          perfil,
          cargo: cargo || funcao || (perfil === 'ADMIN' ? 'Coordenador(a)' : perfil === 'ADI' ? 'ADI / Apoio' : 'Monitor(a)'),
        });
      }

      const isAdm = perfil === 'ADMIN';
      const isAdi = perfil === 'ADI';
      const newUser: UserProfile = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: nome,
        email,
        role: isAdm ? 'coordenador' : isAdi ? 'auxiliar' : 'professor',
        cargoLabel: cargo || funcao || (isAdm ? 'Coordenador(a)' : isAdi ? 'ADI / Apoio' : 'Monitor(a)'),
        status: 'ATIVO',
        canManageStudents: isAdm,
        canMarkAttendance: true,
        allowedTabs: isAdm ? ALL_APP_TAB_IDS : ['momento', 'frequencia', 'semanario', 'manual'],
        contractSchedule: '07:30 - 17:30',
        contractDailyHoursFormatted: '8h 00m',
        baseSalary: 1200,
        regimeTrabalho: 'mensalista',
      };

      const saved = await saveUser(newUser);
      return {
        toolName,
        success: true,
        data: { nome: saved.name, cargo: saved.cargoLabel, perfil },
      };
    }

    // -------------------------------------------------------------------
    // gerarListaChamadaPDF(turmaId?)
    // -------------------------------------------------------------------
    case 'gerarListaChamadaPDF': {
      const rawTurma = args.turmaId || context.selectedTurma || 'TODAS';
      const turmaId = rawTurma !== 'TODAS' ? findTurmaFuzzy(availableTurmas, rawTurma) || rawTurma : 'TODAS';

      const result = generateNominalListPDF({
        title: `Lista de Chamada Nominal — ${turmaId}`,
        turma: turmaId,
        students: context.students,
        records: context.records,
        currentUser: context.currentUser || undefined,
        saveImmediately: false,
      });

      const resolvedFilename = result.filename || `Lista_Chamada_${turmaId.replace(/\s+/g, '_')}.pdf`;
      const downloadDisparado = triggerIdempotentPdfDownload(
        toolName,
        resolvedFilename,
        result.download,
        context
      );

      return {
        toolName,
        success: true,
        filename: resolvedFilename,
        downloadUrl: result.blobUrl || result.dataUrl,
        data: {
          ok: true,
          nomeArquivo: resolvedFilename,
          download_automatico_disparado: downloadDisparado,
          turma: turmaId,
        },
      };
    }

    // -------------------------------------------------------------------
    // lancarFrequenciaTurma(turmaId, data?, chamadas?, confirmado?)
    // -------------------------------------------------------------------
    case 'lancarFrequenciaTurma': {
      const rawTurma = args.turmaId || context.selectedTurma || '';
      if (!rawTurma) {
        return { toolName, success: false, error: 'Turma não informada para o lançamento de chamada.' };
      }
      const turmaId = findTurmaFuzzy(availableTurmas, rawTurma) || rawTurma;

      const targetDate = resolveDateArg(args.data, todaySaoPaulo);
      let chamadas = Array.isArray(args.chamadas) ? args.chamadas : [];

      if (chamadas.length === 0) {
        const turmaStudents = (context.students || []).filter(
          (s) =>
            normalizeStr(s.turma) === normalizeStr(turmaId) &&
            isStudentActiveOnDate(s, targetDate) &&
            isStudentScheduledForDate(s, targetDate)
        );
        chamadas = turmaStudents.map((s) => ({ alunoId: s.id, presente: true }));
      }

      if (requiresConfirmation(toolName) && args.confirmado !== true) {
        const totalPresentesPrev = chamadas.filter((c: any) => c.presente !== false).length;
        const totalFaltasPrev = chamadas.filter((c: any) => c.presente === false).length;
        return buildConfirmationPromptResult(toolName, {
          acao: 'Lançar chamada completa da turma',
          turma: turmaId,
          data: formatDateBR(targetDate),
          total_alunos: chamadas.length,
          presentes_previstos: totalPresentesPrev,
          faltas_previstas: totalFaltasPrev,
        });
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
        data: {
          turma: res.turma,
          data: res.data,
          data_formatada: formatDateBR(res.data),
          total_alunos: res.totalAlunos,
          presentes: res.presentes,
          faltas: res.faltas,
        },
      };
    }

    // -------------------------------------------------------------------
    // cadastrarRefeicaoCardapio(data?, tipo?, descricao)
    // -------------------------------------------------------------------
    case 'cadastrarRefeicaoCardapio': {
      const targetDate = resolveDateArg(args.data, todaySaoPaulo);
      const tipo: 'Almoço' | 'Lanche' =
        String(args.tipo || 'Almoço').toLowerCase().includes('lanche') ? 'Lanche' : 'Almoço';
      const descricao = String(args.descricao || '').trim();
      if (!descricao) {
        return { toolName, success: false, error: 'Descrição da refeição não informada.' };
      }

      const res = await cadastrarRefeicaoCardapioService(targetDate, tipo, descricao);
      return {
        toolName,
        success: true,
        data: {
          data: targetDate,
          data_formatada: formatDateBR(targetDate),
          tipo,
          descricao,
          dayItem: res.dayItem,
        },
      };
    }

    default:
      return {
        toolName,
        success: false,
        error: `Ação "${String(toolName)}" não reconhecida.`,
      };
  }
}
