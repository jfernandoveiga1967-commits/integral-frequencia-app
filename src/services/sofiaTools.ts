/**
 * sofiaTools.ts
 * Catálogo e Executores de Ferramentas Reais da Assistente Inteligente Sofia (Colégio Crescer).
 * Suporte a Gemini Function Calling (Tool Use) com execução determinística no cliente.
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
  AppStateSummary,
  ALL_APP_TAB_IDS,
} from '../types';
import { generateLivroPontoPDFReport, generateNominalListPDF } from '../utils/pdfGenerator';
import {
  calculateMonthlyPontoFinancials,
  getMonthNameBR,
} from '../utils/pontoUtils';
import { formatDateBR, toISODateString, getDayOfWeekFromDate } from '../utils/dateUtils';
import { formatPhoneDisplay } from '../utils/whatsappUtils';
import { getUsers, saveUser } from './userService';
import { getAttendanceSummaryByDate, lancarFrequenciaTurma } from './frequencyService';
import { createStudent, updateStudent } from './studentService';
import { cadastrarRefeicaoCardapio as cadastrarRefeicaoCardapioService } from './menuService';

export interface SofiaToolExecutionContext {
  students: Student[];
  records: AttendanceRecord[];
  pontoRecords?: PontoRecord[];
  currentUser?: UserProfile | null;
  selectedDate: string;
  selectedTurma?: string;
  selectedActivity?: string;
  schedules?: ScheduleBlock[];
  activeTurmas?: string[];
  onSaveRecord?: (record: Omit<AttendanceRecord, 'id' | 'createdAt'>) => Promise<void> | void;
  onNavigateTab?: (tab: any) => void;
  appState?: AppStateSummary;
}

/**
 * Catálogo de Definições de Funções (Gemini Function Declarations)
 */
export const SOFIA_FUNCTION_DECLARATIONS = [
  {
    name: 'gerarEspelhoPontoPDF',
    description:
      'Gera o Espelho de Ponto oficial em PDF de um colaborador para determinado mês e ano, calculando horas, fechamento e link imediato de download.',
    parameters: {
      type: 'OBJECT',
      properties: {
        colaboradorId: {
          type: 'STRING',
          description: 'Nome completo, e-mail ou identificador único do colaborador.',
        },
        mesAno: {
          type: 'STRING',
          description: 'Mês e ano no formato MM/AAAA (ex: 09/2026) ou YYYY-MM (ex: 2026-09).',
        },
      },
      required: ['colaboradorId', 'mesAno'],
    },
  },
  {
    name: 'gerarAutorizacaoEntradaSaidaPDF',
    description:
      'Gera documento oficial do Colégio Crescer de Autorização de Entrada com Atraso ou Saída Antecipada de um aluno em PDF.',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: {
          type: 'STRING',
          description: 'Nome completo ou ID do aluno.',
        },
        motivo: {
          type: 'STRING',
          description: 'Motivo da ocorrência: "atraso" (entrada com atraso) ou "saida_antecipada".',
          enum: ['atraso', 'saida_antecipada'],
        },
        horario: {
          type: 'STRING',
          description: 'Horário do registro (ex: "14:15").',
        },
        justificativa: {
          type: 'STRING',
          description: 'Observação ou justificativa apresentada pelo responsável (opcional).',
        },
      },
      required: ['alunoId', 'motivo', 'horario'],
    },
  },
  {
    name: 'registrarFaltaFrequencia',
    description:
      'Registra a falta de um aluno na lista de chamada do dia com justificativa opcional, persistindo no sistema de frequência.',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: {
          type: 'STRING',
          description: 'Nome completo ou ID do aluno.',
        },
        data: {
          type: 'STRING',
          description: 'Data da falta no formato YYYY-MM-DD.',
        },
        justificativa: {
          type: 'STRING',
          description: 'Justificativa ou motivo da ausência.',
        },
      },
      required: ['alunoId', 'data'],
    },
  },
  {
    name: 'dispararAlertaWhatsApp',
    description:
      'Prepara um alerta ou comunicado institucional via WhatsApp com texto e link pronto para disparo rápido.',
    parameters: {
      type: 'OBJECT',
      properties: {
        destinatario: {
          type: 'STRING',
          description: 'Telefone com DDD, nome do contato ou "coordenacao".',
        },
        mensagem: {
          type: 'STRING',
          description: 'Texto completo e amigável da mensagem ou alerta a enviar.',
        },
      },
      required: ['destinatario', 'mensagem'],
    },
  },
  {
    name: 'analisarDesarranjosDoDia',
    description:
      'Diagnostica o estado ao vivo da escola: identifica turmas com chamadas pendentes no horário atual, ausências inesperadas e inconsistências de batidas de ponto.',
    parameters: {
      type: 'OBJECT',
      properties: {
        foco: {
          type: 'STRING',
          description: 'Foco opcional da análise: "geral", "frequencia" ou "ponto".',
        },
      },
    },
  },
  {
    name: 'obterResumoFrequenciaPorData',
    description:
      'Consulta o histórico de frequência de alunos e relatório de faltas e presenças para uma data específica passada ou informada (ex: ontem, anteontem, dia 28 ou data YYYY-MM-DD / DD/MM/YYYY). Retorna o total de alunos faltantes, lista de faltas por turma e aluno, e o total de presenças consolidadas.',
    parameters: {
      type: 'OBJECT',
      properties: {
        data: {
          type: 'STRING',
          description: 'Data da consulta no formato YYYY-MM-DD ou DD/MM/YYYY (ex: "2026-10-28" ou "28/10/2026").',
        },
      },
      required: ['data'],
    },
  },
  {
    name: 'cadastrarAluno',
    description:
      'Cadastra um novo aluno no sistema escolar com matrícula, turma, responsável e telefone.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nome: { type: 'STRING', description: 'Nome completo do aluno' },
        turmaId: { type: 'STRING', description: 'Identificador ou nome da turma (ex: "1º Ano Azul", "Maternal")' },
        responsavel: { type: 'STRING', description: 'Nome do responsável legal pelo aluno' },
        telefone: { type: 'STRING', description: 'Telefone ou WhatsApp de contato do responsável' },
        horarioEntradaSaida: { type: 'STRING', description: 'Horário contratual de entrada e saída (ex: "11:40 - 17:40" ou "17:30")' },
      },
      required: ['nome', 'turmaId', 'responsavel', 'telefone'],
    },
  },
  {
    name: 'editarAluno',
    description:
      'Atualiza os dados cadastrais de um aluno existente no sistema.',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: { type: 'STRING', description: 'ID ou nome completo do aluno a ser editado' },
        dadosAtualizados: {
          type: 'OBJECT',
          description: 'Campos atualizados do aluno (nome, turma, status, horarioSaida, notes, etc.)',
        },
      },
      required: ['alunoId', 'dadosAtualizados'],
    },
  },
  {
    name: 'cadastrarUsuario',
    description:
      'Registra um novo usuário ou colaborador institucional no sistema do Colégio Crescer com perfil e cargo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nome: { type: 'STRING', description: 'Nome completo do colaborador' },
        email: { type: 'STRING', description: 'E-mail institucional ou pessoal do colaborador' },
        funcao: { type: 'STRING', description: 'Função desempenhada no Integral' },
        cargo: { type: 'STRING', description: 'Cargo oficial (ex: "Monitor de Recreação", "Auxiliar de Desenvolvimento Infantil", "Coordenador")' },
        perfil: {
          type: 'STRING',
          description: 'Perfil de acesso institucional: "ADMIN", "MONITOR" ou "ADI"',
          enum: ['ADMIN', 'MONITOR', 'ADI'],
        },
      },
      required: ['nome', 'email', 'funcao', 'cargo', 'perfil'],
    },
  },
  {
    name: 'gerarListaChamadaPDF',
    description:
      'Gera o PDF oficial da lista de chamada nominal de uma turma específica para impressão ou download imediato.',
    parameters: {
      type: 'OBJECT',
      properties: {
        turmaId: { type: 'STRING', description: 'Nome da turma (ex: "1º Ano Azul", "Mini Maternal", "5º Ano")' },
      },
      required: ['turmaId'],
    },
  },
  {
    name: 'lancarFrequenciaTurma',
    description:
      'Realiza a chamada completa em lote de uma turma em determinada data, marcando a presença ou falta de cada aluno.',
    parameters: {
      type: 'OBJECT',
      properties: {
        turmaId: { type: 'STRING', description: 'Nome ou identificador da turma' },
        data: { type: 'STRING', description: 'Data da chamada no formato YYYY-MM-DD' },
        chamadas: {
          type: 'ARRAY',
          description: 'Lista de registros contendo alunoId e booleano presente (true/false)',
          items: {
            type: 'OBJECT',
            properties: {
              alunoId: { type: 'STRING', description: 'ID ou nome do aluno' },
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
      'Cadastra ou atualiza uma refeição (Almoço ou Lanche) no cardápio de uma data específica.',
    parameters: {
      type: 'OBJECT',
      properties: {
        data: { type: 'STRING', description: 'Data da refeição no formato YYYY-MM-DD ou DD/MM/YYYY' },
        tipo: {
          type: 'STRING',
          description: 'Tipo da refeição: "Almoço" ou "Lanche"',
          enum: ['Almoço', 'Lanche'],
        },
        descricao: { type: 'STRING', description: 'Descrição detalhada do prato principal, guarnições ou lanche' },
      },
      required: ['data', 'tipo', 'descricao'],
    },
  },
];

/**
 * Normaliza strings para busca insensível a maiúsculas e acentos
 */
function normalizeStr(str?: string): string {
  return (str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Localiza aluno por ID ou correspondência de nome
 */
function findStudent(students: Student[], query: string): Student | undefined {
  if (!query) return undefined;
  const qNorm = normalizeStr(query);
  return students.find(
    (s) =>
      s.id === query ||
      normalizeStr(s.name) === qNorm ||
      normalizeStr(s.name).includes(qNorm)
  );
}

/**
 * Localiza colaborador institucional por ID, e-mail ou nome
 */
async function findCollaborator(query: string): Promise<UserProfile | undefined> {
  const users = await getUsers();
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
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const isAtraso = params.motivo === 'atraso';
  const tipoTitulo = isAtraso
    ? 'AUTORIZAÇÃO DE ENTRADA COM ATRASO'
    : 'AUTORIZAÇÃO DE SAÍDA ANTECIPADA';

  // Cabeçalho institucional estilizado
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 36, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('COLÉGIO CRESCER • PROGRAMA INTEGRAL', 105, 16, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text('Protocolo de Registro e Controle Institucional de Portaria', 105, 25, { align: 'center' });

  // Tarja de Título do Documento
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(15, 44, 180, 14, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(15, 44, 180, 14, 'S');

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(tipoTitulo, 105, 53, { align: 'center' });

  // Corpo dos Dados
  let y = 70;
  const lineSpacing = 11;

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105); // slate-600

  const drawField = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(value, 65, y);
    doc.setTextColor(71, 85, 105);
    y += lineSpacing;
  };

  const protocolo = `AUT-${Date.now().toString().slice(-6)}`;
  drawField('Número do Protocolo', protocolo);
  drawField('Nome do Aluno(a)', params.student.name);
  drawField('Turma / Agrupamento', params.student.turma || 'Programa Integral');
  drawField('Data da Ocorrência', formatDateBR(params.data));
  drawField('Horário Registrado', params.horario);
  drawField('Tipo de Registro', isAtraso ? 'Entrada com Atraso' : 'Saída Antecipada');
  drawField('Justificativa / Motivo', params.justificativa || 'Autorizado pela Coordenação do Integral');
  drawField('Registrado por', params.emissor || 'Sofia • Assistente Oficial');

  // Box de Termo de Ciência
  y += 6;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(15, y, 180, 36, 3, 3, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(71, 85, 105);
  const termo =
    'O presente documento atesta o registro formal junto à Portaria e Coordenação do Programa Integral, em conformidade com as normas pedagógicas e de segurança institucional do Colégio Crescer.';
  doc.text(doc.splitTextToSize(termo, 170), 20, y + 10);

  // Assinaturas
  y += 65;
  doc.setDrawColor(148, 163, 184); // slate-400
  doc.line(25, y, 95, y);
  doc.line(115, y, 185, y);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text('Assinatura do Responsável', 60, y + 6, { align: 'center' });
  doc.text('Visto da Coordenação do Integral', 150, y + 6, { align: 'center' });

  // Rodapé
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Documento emitido digitalmente em ${new Date().toLocaleString('pt-BR')} • Colégio Crescer`,
    105,
    285,
    { align: 'center' }
  );

  const filename = `Autorizacao_${params.motivo}_${params.student.name.replace(/\s+/g, '_')}_${params.data}.pdf`;
  const blob = doc.output('blob');
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

  switch (toolName) {
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
          message: 'Colaborador não informado. Por favor, indique o nome ou e-mail.',
        };
      }

      const collaborator = await findCollaborator(colaboradorQuery);
      if (!collaborator) {
        return {
          toolName,
          success: false,
          message: `Colaborador "${colaboradorQuery}" não encontrado no cadastro de usuários ativos do Colégio Crescer.`,
        };
      }

      // Decompõe mês e ano
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

      // Constrói os dados de dias do mês
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

      // Calcula métricas financeiras
      const financials = calculateMonthlyPontoFinancials({
        records: userRecords,
        holidays: [],
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
          message: `Espelho de Ponto de ${collaborator.name} referente a ${getMonthNameBR(targetMonth)}/${targetYear} gerado com sucesso!`,
          filename: result.filename,
          downloadUrl: result.blobUrl || result.dataUrl,
          data: {
            colaborador: collaborator.name,
            mes: targetMonth,
            ano: targetYear,
            totalHoras: financials.totalWorkedFormatted || '00:00',
            saldoBancoHoras: financials.extraHoursFormatted || '00:00',
          },
        };
      } catch (pdfErr: any) {
        console.error('Erro ao gerar PDF do Espelho de Ponto:', pdfErr);
        return {
          toolName,
          success: false,
          message: `Falha técnica ao gerar o Espelho de Ponto: ${pdfErr?.message || 'erro desconhecido'}.`,
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

      const student = findStudent(context.students, alunoQuery);
      if (!student) {
        return {
          toolName,
          success: false,
          message: `Aluno(a) "${alunoQuery}" não encontrado na base de matrículas ativas.`,
        };
      }

      try {
        const { filename, blobUrl } = generateAutorizacaoPDFBlob({
          student,
          motivo,
          horario,
          data: currentDate,
          justificativa,
          emissor: context.currentUser?.name || 'Coordenação do Integral',
        });

        const rotulo = motivo === 'atraso' ? 'Entrada com Atraso' : 'Saída Antecipada';
        return {
          toolName,
          success: true,
          message: `Autorização de ${rotulo} para ${student.name} (${student.turma}) gerada com sucesso!`,
          filename,
          downloadUrl: blobUrl,
          data: {
            aluno: student.name,
            turma: student.turma,
            motivo: rotulo,
            horario,
          },
        };
      } catch (err: any) {
        return {
          toolName,
          success: false,
          message: `Erro ao gerar autorização em PDF: ${err?.message || 'erro desconhecido'}.`,
        };
      }
    }

    // -------------------------------------------------------------------
    // 3. registrarFaltaFrequencia(alunoId, data, justificativa)
    // -------------------------------------------------------------------
    case 'registrarFaltaFrequencia': {
      const alunoQuery = args.alunoId || '';
      const targetDate = args.data || currentDate;
      const justificativa = args.justificativa || 'Falta confirmada pela Assistente Sofia';

      const student = findStudent(context.students, alunoQuery);
      if (!student) {
        return {
          toolName,
          success: false,
          message: `Aluno(a) "${alunoQuery}" não localizado na lista de frequência.`,
        };
      }

      if (context.onSaveRecord) {
        const targetDateObj = new Date(targetDate);
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
        message: `Falta de ${student.name} (${student.turma}) em ${formatDateBR(targetDate)} registrada e computada no sistema.`,
        data: {
          alunoId: student.id,
          alunoNome: student.name,
          turma: student.turma,
          data: targetDate,
          status: 'falta',
          justificativa,
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
          message: 'A mensagem do alerta não pode ser vazia.',
        };
      }

      // Determina telefone
      let phone = '5519999999999';
      const cleanDest = normalizeStr(destinatario);

      if (cleanDest.includes('coord')) {
        phone = '5519981234567'; // Coordenação Integral
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
        message: `Alerta pronto para envio para ${destinatario}. Clique no botão abaixo para abrir a conversa no WhatsApp.`,
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
      const horaAtual = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const activeStudents = (context.students || []).filter(
        (s) => (s.status || s.statusMatricula || 'ativo') === 'ativo'
      );
      const todayRecords = (context.records || []).filter((r) => r.date === currentDate);
      const presentes = todayRecords.filter((r) => r.status === 'presente').length;
      const faltas = todayRecords.filter((r) => r.status === 'falta').length;

      // Localiza turmas sem lançamento hoje
      const turmasList = context.activeTurmas && context.activeTurmas.length > 0
        ? context.activeTurmas
        : ['Mini Maternal', 'Maternal', '1º Ano Azul', '1º Ano Laranja', '2º Ano', '3º Ano', '4º Ano', '5º Ano'];

      const turmasComLancamento = new Set(todayRecords.map((r) => r.turma));
      const turmasPendentesHoje = turmasList.filter((t) => !turmasComLancamento.has(t));

      // Inconsistências de ponto do dia
      const pontoHoje = (context.pontoRecords || []).filter((p) => p.date === currentDate);
      const pontosIncompletos = pontoHoje.filter((p) => {
        const hasEntrada = Boolean(p.entrada_1 || p.entry1);
        const hasSaida = Boolean(p.saida_2 || p.exit2 || p.saida_1 || p.exit1);
        return hasEntrada && !hasSaida;
      });

      let diagnosticoTexto = `Diagnóstico ao Vivo de ${formatDateBR(currentDate)} (${horaAtual}):\n`;
      diagnosticoTexto += `• Alunos: ${presentes} presentes, ${faltas} faltas registradas de um total de ${activeStudents.length} matriculados.\n`;

      if (turmasPendentesHoje.length > 0) {
        diagnosticoTexto += `• Atenção: ${turmasPendentesHoje.length} turma(s) sem lançamento de chamada hoje (${turmasPendentesHoje.join(', ')}).\n`;
      } else {
        diagnosticoTexto += `• Frequência: Todas as turmas possuem lançamento no sistema.\n`;
      }

      if (pontosIncompletos.length > 0) {
        diagnosticoTexto += `• Livro Ponto: ${pontosIncompletos.length} colaborador(es) com registro em aberto no dia.\n`;
      } else {
        diagnosticoTexto += `• Livro Ponto: Sem inconsistências críticas no momento.\n`;
      }

      return {
        toolName,
        success: true,
        message: diagnosticoTexto,
        data: {
          presentes,
          faltas,
          totalAlunos: activeStudents.length,
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

      let msg = `Relatório Oficial de Frequência do dia ${summary.formattedDate}:\n`;
      msg += `• Presenças consolidadas: ${summary.totalPresentes}\n`;
      msg += `• Total de alunos faltantes: ${summary.totalFaltas}\n`;

      if (summary.totalFaltas > 0) {
        msg += `\nLista detalhada de faltas por turma:\n`;
        const turmas = Object.keys(summary.faltasPorTurma);
        turmas.forEach((turma) => {
          const alunos = summary.faltasPorTurma[turma];
          msg += `• ${turma} (${alunos.length}): ${alunos.map((a) => a.name).join(', ')}\n`;
        });
      } else {
        msg += `• Excelente: não constam faltas registradas nesta data (100% de comparecimento nas turmas apuradas).\n`;
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
    // 7. cadastrarAluno(dadosAluno)
    // -------------------------------------------------------------------
    case 'cadastrarAluno': {
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
          message: 'Nome do aluno não informado para cadastro.',
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
        message: `Aluno(a) "${newStudent.name}" cadastrado(a) com sucesso na turma "${newStudent.turma}"!\n• Matrícula/ID: ${newStudent.id}\n• Responsável: ${responsavel || 'Não informado'}\n• Telefone: ${telefone || 'Não informado'}\n• Horário: ${horarioEntradaSaida}`,
        data: newStudent,
      };
    }

    // -------------------------------------------------------------------
    // 8. editarAluno(alunoId, dadosAtualizados)
    // -------------------------------------------------------------------
    case 'editarAluno': {
      const alunoId = args.alunoId || '';
      const dadosAtualizados = args.dadosAtualizados || args;

      if (!alunoId) {
        return {
          toolName,
          success: false,
          message: 'ID ou nome do aluno não informado para edição.',
        };
      }

      let targetStudentId = alunoId;
      const found = findStudent(context.students, alunoId);
      if (found) {
        targetStudentId = found.id;
      }

      const updated = await updateStudent(targetStudentId, dadosAtualizados);
      if (!updated) {
        return {
          toolName,
          success: false,
          message: `Aluno(a) "${alunoId}" não foi localizado no cadastro escolar para atualização.`,
        };
      }

      const idx = context.students.findIndex((s) => s.id === updated.id);
      if (idx !== -1) {
        context.students[idx] = updated;
      }

      return {
        toolName,
        success: true,
        message: `Cadastro do aluno(a) "${updated.name}" atualizado com sucesso no sistema escolar!`,
        data: updated,
      };
    }

    // -------------------------------------------------------------------
    // 9. cadastrarUsuario(dadosUsuario)
    // -------------------------------------------------------------------
    case 'cadastrarUsuario': {
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
          message: 'Nome e e-mail são obrigatórios para cadastrar um novo colaborador.',
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
          ? ['momento', 'frequencia']
          : ['momento', 'frequencia', 'semanario'],
        contractSchedule: '07:30 - 17:30',
        contractDailyHoursFormatted: '8h 00m',
        baseSalary: 1200,
        regimeTrabalho: 'mensalista',
      };

      const saved = await saveUser(newUser);

      return {
        toolName,
        success: true,
        message: `Colaborador(a) "${saved.name}" registrado(a) com sucesso no sistema!\n• E-mail: ${saved.email}\n• Cargo: ${saved.cargoLabel}\n• Perfil: ${perfil}`,
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
          message: `Lista de chamada nominal da turma "${turmaId}" gerada em PDF com sucesso!`,
          filename: result.filename || `Lista_Chamada_${turmaId.replace(/\s+/g, '_')}.pdf`,
          downloadUrl: result.blobUrl || result.dataUrl,
          data: { turma: turmaId },
        };
      } catch (err: any) {
        return {
          toolName,
          success: false,
          message: `Erro ao gerar lista de chamada em PDF: ${err?.message || 'erro desconhecido'}.`,
        };
      }
    }

    // -------------------------------------------------------------------
    // 11. lancarFrequenciaTurma(turmaId, data, chamadas)
    // -------------------------------------------------------------------
    case 'lancarFrequenciaTurma': {
      const turmaId = args.turmaId || '1º Ano Azul';
      const targetDate = args.data || currentDate;
      let chamadas = Array.isArray(args.chamadas) ? args.chamadas : [];

      if (chamadas.length === 0) {
        const turmaStudents = context.students.filter(
          (s) => s.turma?.toLowerCase() === turmaId.toLowerCase()
        );
        chamadas = turmaStudents.map((s) => ({ alunoId: s.id, presente: true }));
      }

      const res = await lancarFrequenciaTurma({
        turmaId,
        data: targetDate,
        chamadas,
        instructorName: context.currentUser?.name || 'Sofia • Assistente IA',
        onSaveRecord: context.onSaveRecord,
      });

      return {
        toolName,
        success: true,
        message: `Chamada da turma "${res.turma}" realizada com sucesso para ${formatDateBR(res.data)}!\n• Total apurado: ${res.totalAlunos} alunos\n• Presenças: ${res.presentes}\n• Faltas: ${res.faltas}`,
        data: res,
      };
    }

    // -------------------------------------------------------------------
    // 12. cadastrarRefeicaoCardapio(data, tipo, descricao)
    // -------------------------------------------------------------------
    case 'cadastrarRefeicaoCardapio': {
      const targetDate = args.data || currentDate;
      const tipo: 'Almoço' | 'Lanche' =
        String(args.tipo).toLowerCase().includes('lanche') ? 'Lanche' : 'Almoço';
      const descricao = args.descricao || '';

      if (!descricao.trim()) {
        return {
          toolName,
          success: false,
          message: 'Descrição da refeição não informada para o cardápio.',
        };
      }

      const res = await cadastrarRefeicaoCardapioService(targetDate, tipo, descricao);

      return {
        toolName,
        success: true,
        message: `Cardápio atualizado com sucesso!\n• Data: ${formatDateBR(targetDate)}\n• Refeição: ${tipo}\n• Detalhes: "${descricao}"`,
        data: res.dayItem,
      };
    }

    default:
      return {
        toolName,
        success: false,
        message: `Ferramenta "${toolName}" não reconhecida.`,
      };
  }
}

/**
 * Função utilitária direta para consulta de frequência por data
 */
export async function obterResumoFrequenciaPorData(
  data: string,
  context: SofiaToolExecutionContext
): Promise<SofiaToolResult> {
  return executeSofiaTool('obterResumoFrequenciaPorData', { data }, context);
}

