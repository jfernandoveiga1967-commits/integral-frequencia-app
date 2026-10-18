import {
  UserProfile,
  ScheduleBlock,
  AttendanceRecord,
  HolidayItem,
  DayOfWeek,
  TurmaType,
  ActivityType,
} from '../types';
import { getDayOfWeekFromDate, getDayOfWeekLabel, isHolidayOrRecess } from '../utils/dateUtils';
import { loadSchedules } from '../utils/storageUtils';

export interface FolhaItem {
  date: string;
  dayOfWeekLabel: string;
  activity: string;
  turma: string;
  timeSlot?: string;
  status:
    | 'prevista_cumprida'
    | 'feriado_recesso'
    | 'falta_injustificada'
    | 'falta_justificada'
    | 'aula_extra_substituicao'
    | 'prevista_futura';
  statusLabel: string;
  motivo: string;
  qtdAlunosComChamada: number;
  pertenceGrade: boolean;
  valorHoraAula: number;
  valorBase: number;
  horaAtividade: number;
  dsr: number;
  valorTotalItem: number;
  isExtra?: boolean;
  isDesconto?: boolean;
}

export interface FolhaApuracaoProfessorHoristaResult {
  regimeTrabalho: 'professor_horista';
  professorId: string;
  professorName: string;
  cargoLabel: string;
  competencia: string; // MM/YYYY
  startDate: string;
  endDate: string;

  // 1. Carga da Grade Horária & Salário Base CLT (4,5 semanas - art. 320 § 1º CLT)
  aulasSemanaisGrade: number; // Carga Semanal Fixa
  multiplicadorSemanasClt: number;
  aulasMensaisContratadas: number; // Carga Semanal × 4.5
  valorHoraAula: number;
  salarioBaseAulas: number; // (Aulas Semanais × 4.5) × Valor Hora-Aula

  // 2. Reflexos Legais Obrigatórios
  percentualHoraAtividade: number; // 5%
  valorHoraAtividade: number; // 5% sobre Salário Base de Aulas
  fatorDsr: number; // 1/6 (16,67%)
  valorDsr: number; // 1/6 sobre (Salário Base de Aulas + Hora-Atividade)
  subtotalSalarioContratado: number; // Salário Base + Hora-Atividade + DSR

  // 3. Frequência, Execução e Horas Extras (+50%)
  totalAulasPrevistasPeriodo: number;
  totalAulasCumpridasGrade: number;
  totalFeriadosRecessos: number;

  // Faltas injustificadas com descontos proporcionais diretos
  totalFaltasInjustificadas: number;
  descontoAulasFaltas: number;
  descontoHoraAtividadeFaltas: number;
  descontoDsrFaltas: number;
  totalDescontoFaltas: number;

  // Aulas excedentes / fora da grade (Horas Extras +50% e reflexos)
  totalAulasExtras: number;
  valorHoraExtraUnitario: number; // Hora-Aula × 1.50
  valorHoraExtraAulas: number; // Aulas Extras × (Hora-Aula × 1.50)
  reflexoHoraAtividadeExtras: number; // 5% sobre Horas Extras
  reflexoDsrExtras: number; // 1/6 sobre (Horas Extras + HA)
  totalHorasExtrasGeral: number; // HE + HA + DSR

  // 4. Benefícios e Ajustes Manuais
  ajudaDeCusto: number; // R$ 150,00 fixo não salarial
  manualAddition: number;
  manualAdditionNote?: string;
  manualDiscount: number;
  manualDiscountNote?: string;

  // 5. Fechamento Final da Folha
  totalProventosSalarial: number;
  totalDescontosGeral: number;
  totalLiquidoAPagar: number;

  // Detalhamento dos Itens e Vínculos
  itens: FolhaItem[];
  horariosGradeVinculados: ScheduleBlock[];
  diasGradeSemanal: DayOfWeek[];
}

export interface FolhaHoristaParams {
  professor: UserProfile | null;
  startDate: string;
  endDate: string;
  holidays: HolidayItem[];
  records: AttendanceRecord[];
  pontoRecords?: any[];
  schedules?: ScheduleBlock[];
  professorActivities?: string[];
  manualAddition?: number;
  manualAdditionNote?: string;
  manualDiscount?: number;
  manualDiscountNote?: string;
  ajudaDeCusto?: number;
}

/**
 * Normaliza nomes de turmas para comparação robusta
 */
export function normalizeTurmaForMatching(turmaStr?: string): string {
  if (!turmaStr) return '';
  return turmaStr
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[º°ª]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Retorna os blocos padrão de contingência para a Professora Letícia (Balé e Dança)
 * Total: 15 horários semanais distribuídos entre Segunda e Terça
 */
export function getDefaultLeticiaScheduleBlocks(): ScheduleBlock[] {
  return [
    // SEGUNDA-FEIRA (7 horários de Dança)
    {
      id: 'grade_leticia_seg_1',
      turma: '2º Ano Azul',
      dayOfWeek: 'segunda',
      startTime: '15:00',
      endTime: '15:50',
      activityId: 'Dança',
    },
    {
      id: 'grade_leticia_seg_2',
      turma: '2º Ano Vermelho',
      dayOfWeek: 'segunda',
      startTime: '15:00',
      endTime: '15:50',
      activityId: 'Dança',
    },
    {
      id: 'grade_leticia_seg_3',
      turma: '3º Ano Azul',
      dayOfWeek: 'segunda',
      startTime: '14:20',
      endTime: '15:10',
      activityId: 'Dança',
    },
    {
      id: 'grade_leticia_seg_4',
      turma: '3º Ano Vermelho',
      dayOfWeek: 'segunda',
      startTime: '13:40',
      endTime: '14:40',
      activityId: 'Dança',
    },
    {
      id: 'grade_leticia_seg_5',
      turma: '4º Ano Vermelho',
      dayOfWeek: 'segunda',
      startTime: '13:40',
      endTime: '14:40',
      activityId: 'Dança',
    },
    {
      id: 'grade_leticia_seg_6',
      turma: '5º Ano Azul',
      dayOfWeek: 'segunda',
      startTime: '13:40',
      endTime: '14:40',
      activityId: 'Dança',
    },
    {
      id: 'grade_leticia_seg_7',
      turma: '6º Ano Azul',
      dayOfWeek: 'segunda',
      startTime: '13:40',
      endTime: '14:40',
      activityId: 'Dança',
    },

    // TERÇA-FEIRA (8 horários de Balé)
    {
      id: 'grade_leticia_ter_1',
      turma: '1º Ano Vermelho',
      dayOfWeek: 'terca',
      startTime: '13:40',
      endTime: '14:40',
      activityId: 'Balé',
    },
    {
      id: 'grade_leticia_ter_2',
      turma: '2º Ano Azul',
      dayOfWeek: 'terca',
      startTime: '13:40',
      endTime: '14:40',
      activityId: 'Balé',
    },
    {
      id: 'grade_leticia_ter_3',
      turma: '2º Ano Vermelho',
      dayOfWeek: 'terca',
      startTime: '13:40',
      endTime: '14:40',
      activityId: 'Balé',
    },
    {
      id: 'grade_leticia_ter_4',
      turma: '3º Ano Azul',
      dayOfWeek: 'terca',
      startTime: '13:40',
      endTime: '14:40',
      activityId: 'Balé',
    },
    {
      id: 'grade_leticia_ter_5',
      turma: '3º Ano Vermelho',
      dayOfWeek: 'terca',
      startTime: '14:20',
      endTime: '15:10',
      activityId: 'Balé',
    },
    {
      id: 'grade_leticia_ter_6',
      turma: '4º Ano Azul',
      dayOfWeek: 'terca',
      startTime: '13:40',
      endTime: '14:40',
      activityId: 'Balé',
    },
    {
      id: 'grade_leticia_ter_7',
      turma: '5º Ano Azul',
      dayOfWeek: 'terca',
      startTime: '13:40',
      endTime: '14:40',
      activityId: 'Balé',
    },
    {
      id: 'grade_leticia_ter_8',
      turma: '6º Ano Azul',
      dayOfWeek: 'terca',
      startTime: '13:40',
      endTime: '14:40',
      activityId: 'Balé',
    },
  ];
}

/**
 * Verifica se um bloco da grade pertence ao professor horista
 */
export function isScheduleBlockOfProfessorHorista(
  teacher: UserProfile | null,
  block: ScheduleBlock,
  customActivities?: string[]
): boolean {
  if (!teacher || !block) return false;

  const isLeticia =
    teacher.id === 'usr_leticia' ||
    Boolean(teacher.name && teacher.name.toLowerCase().includes('leticia'));

  // 1. Vínculo Direto por ID de Usuário / Professor
  const blockTeacherId = (block as any).teacherId || (block as any).instructorId || (block as any).userId;
  if (blockTeacherId) {
    if (blockTeacherId === teacher.id || (teacher.uid && blockTeacherId === teacher.uid)) {
      return true;
    }
  }

  // 2. Vínculo por Modalidade / Atividades Atribuídas
  const teacherActs = new Set<string>();
  if (Array.isArray(teacher.assignedActivities)) {
    teacher.assignedActivities.forEach((a) => a && teacherActs.add(a.toLowerCase().trim()));
  }
  if (teacher.specialtyActivity) {
    teacherActs.add(teacher.specialtyActivity.toLowerCase().trim());
  }
  if (Array.isArray(customActivities)) {
    customActivities.forEach((a) => a && teacherActs.add(a.toLowerCase().trim()));
  }
  if (isLeticia) {
    teacherActs.add('bale');
    teacherActs.add('balé');
    teacherActs.add('danca');
    teacherActs.add('dança');
  }

  const blockAct = (block.activityId || '').toLowerCase().trim();
  const cargo = (teacher.cargoLabel || '').toLowerCase();

  const isMatchAct =
    teacherActs.has(blockAct) ||
    cargo.includes(blockAct) ||
    (isLeticia && (blockAct.includes('dan') || blockAct.includes('bal')));

  if (!isMatchAct) return false;

  // Se o docente possui dias da grade autorizados estritos (ex: ['segunda', 'terca']), filtra o dia
  if (Array.isArray(teacher.diasGradeAutorizados) && teacher.diasGradeAutorizados.length > 0) {
    if (!teacher.diasGradeAutorizados.includes(block.dayOfWeek)) {
      return false;
    }
  }

  // Se o docente possui turmas restritas vinculadas, valida se a turma do bloco confere
  if (Array.isArray(teacher.assignedTurmas) && teacher.assignedTurmas.length > 0) {
    const blockTurmaNorm = normalizeTurmaForMatching(block.turma);
    const hasTurma = teacher.assignedTurmas.some((t) =>
      normalizeTurmaForMatching(t) === blockTurmaNorm ||
      blockTurmaNorm.includes(normalizeTurmaForMatching(t))
    );
    if (!hasTurma) return false;
  }

  return true;
}

/**
 * Retorna todos os blocos ativos vinculados ao docente horista na Grade Horária Semanal
 */
export function getProfessorWeeklyGradeBlocks(
  teacher: UserProfile | null,
  schedules?: ScheduleBlock[],
  customActivities?: string[]
): ScheduleBlock[] {
  if (!teacher) return [];

  const sourceSchedules =
    Array.isArray(schedules) && schedules.length > 0 ? schedules : loadSchedules();

  let matched = sourceSchedules.filter((b) =>
    isScheduleBlockOfProfessorHorista(teacher, b, customActivities)
  );

  // Fallback de contingência caso a grade ainda não tenha blocos carregados para a Professora Letícia
  const isLeticia =
    teacher.id === 'usr_leticia' ||
    Boolean(teacher.name && teacher.name.toLowerCase().includes('leticia'));

  if (matched.length === 0 && isLeticia) {
    matched = getDefaultLeticiaScheduleBlocks();
  }

  return matched;
}

/**
 * Calcula a Carga Semanal Fixa da Grade e os valores base contratuais CLT (4,5 semanas)
 */
export function calculateCargaSemanalFixa(
  teacher: UserProfile | null,
  schedules?: ScheduleBlock[],
  customActivities?: string[]
): {
  aulasSemanaisGrade: number;
  multiplicadorSemanasClt: number;
  aulasMensaisContratadas: number;
  valorHoraAula: number;
  salarioBaseAulas: number;
  horaAtividade: number;
  dsr: number;
  subtotalSalarioContratado: number;
  diasGradeSemanal: DayOfWeek[];
  activeGradeBlocks: ScheduleBlock[];
} {
  if (!teacher) {
    return {
      aulasSemanaisGrade: 0,
      multiplicadorSemanasClt: 4.5,
      aulasMensaisContratadas: 0,
      valorHoraAula: 0,
      salarioBaseAulas: 0,
      horaAtividade: 0,
      dsr: 0,
      subtotalSalarioContratado: 0,
      diasGradeSemanal: [],
      activeGradeBlocks: [],
    };
  }

  const activeGradeBlocks = getProfessorWeeklyGradeBlocks(teacher, schedules, customActivities);
  const aulasSemanaisGrade = activeGradeBlocks.length;
  const multiplicadorSemanasClt = 4.5;
  const aulasMensaisContratadas = Number((aulasSemanaisGrade * multiplicadorSemanasClt).toFixed(2));

  const valorHoraAula =
    teacher.valorHoraAula !== undefined &&
    teacher.valorHoraAula !== null &&
    Number(teacher.valorHoraAula) > 0
      ? Number(teacher.valorHoraAula)
      : 35.0;

  // Salário Base Mensal de Aulas: (Aulas Semanais × 4.5) × Valor da Hora-Aula (Art. 320 § 1º CLT)
  const salarioBaseAulas = Math.round(aulasMensaisContratadas * valorHoraAula * 100) / 100;

  // Hora-Atividade (5%): Salário Base de Aulas × 0,05
  const horaAtividade = Math.round(salarioBaseAulas * 0.05 * 100) / 100;

  // DSR (1/6 = 16,67%): (Salário Base de Aulas + Hora-Atividade) / 6 (Lei 605/49 e Súmula 351 TST)
  const dsr = Math.round(((salarioBaseAulas + horaAtividade) / 6) * 100) / 100;

  const subtotalSalarioContratado = Math.round((salarioBaseAulas + horaAtividade + dsr) * 100) / 100;

  const diasSet = new Set<DayOfWeek>();
  activeGradeBlocks.forEach((b) => diasSet.add(b.dayOfWeek));
  const order: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
  const diasGradeSemanal = order.filter((d) => diasSet.has(d));

  return {
    aulasSemanaisGrade,
    multiplicadorSemanasClt,
    aulasMensaisContratadas,
    valorHoraAula,
    salarioBaseAulas,
    horaAtividade,
    dsr,
    subtotalSalarioContratado,
    diasGradeSemanal: diasGradeSemanal.length > 0 ? diasGradeSemanal : ['segunda', 'terca'],
    activeGradeBlocks,
  };
}

/**
 * Verifica se uma turma e atividade pertencem à Grade Horária do docente horista
 */
export function checkClassBelongsToGradeHorista(
  teacherGradeBlocks: ScheduleBlock[],
  dayOfWeek: DayOfWeek,
  turmaName: string,
  activityName: string
): { belongs: boolean; matchingBlock?: ScheduleBlock } {
  const normTurma = normalizeTurmaForMatching(turmaName);
  const normAct = (activityName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  // 1. Procura primeiro bloco exato no mesmo dia da semana
  const dayBlocks = teacherGradeBlocks.filter((b) => b.dayOfWeek === dayOfWeek);
  for (const block of dayBlocks) {
    const blockTurma = normalizeTurmaForMatching(block.turma);
    const blockAct = (block.activityId || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    const matchAct =
      blockAct === normAct ||
      blockAct.includes(normAct) ||
      normAct.includes(blockAct) ||
      (normAct.includes('dan') && blockAct.includes('dan')) ||
      (normAct.includes('bal') && blockAct.includes('bal'));

    const matchTurma =
      blockTurma === normTurma ||
      blockTurma.includes(normTurma) ||
      normTurma.includes(blockTurma) ||
      (normTurma.includes('ano') && blockTurma.includes(normTurma.split(' ')[0]));

    if (matchAct && matchTurma) {
      return { belongs: true, matchingBlock: block };
    }
  }

  // 2. Se a modalidade conferir no dia, flexibiliza junção de turmas no mesmo dia
  for (const block of dayBlocks) {
    const blockAct = (block.activityId || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    const matchAct =
      blockAct === normAct ||
      blockAct.includes(normAct) ||
      normAct.includes(blockAct) ||
      (normAct.includes('dan') && blockAct.includes('dan')) ||
      (normAct.includes('bal') && blockAct.includes('bal'));

    if (matchAct) {
      return { belongs: true, matchingBlock: block };
    }
  }

  return { belongs: false };
}

/**
 * MOTOR DE APURAÇÃO DA FOLHA DO PROFESSOR HORISTA CLT (Sincronizado com a Grade Horária)
 * 
 * Regras:
 * 1. Carga da Grade Semanal Fixa: identificada automaticamente da Grade Horária.
 * 2. Salário Base Mensal de Aulas: (Aulas Semanais da Grade × 4.5) × Valor da Hora-Aula (Art. 320 § 1º CLT).
 * 3. Reflexos Legais Obrigatórios:
 *    - Hora-Atividade de 5% sobre o Salário Base de Aulas.
 *    - Descanso Semanal Remunerado (DSR) de 1/6 (16,67%) sobre (Salário Base + Hora-Atividade).
 * 4. Cruzamento com Chamada de Frequência e Exceções:
 *    - Aulas da grade confirmadas via Chamada de Frequência validam o cumprimento da carga mensal contratada.
 *    - Feriados e Recessos Escolares (ex: 12/10) mantêm a remuneração integral garantida por lei, sem descontos.
 *    - Faltas injustificadas geram desconto proporcional direto sobre aula, hora-atividade e reflexo do DSR do período.
 *    - Aulas excedentes ou substituições ministradas fora da grade regular são apuradas automaticamente como 'Horas Extras (+50%)'
 *      com reflexos de Hora-Atividade (5%) e DSR (1/6).
 */
export function calculateFolhaProfessorHorista({
  professor,
  startDate,
  endDate,
  holidays = [],
  records = [],
  pontoRecords = [],
  schedules,
  professorActivities = ['Balé', 'Dança'],
  manualAddition = 0,
  manualAdditionNote = '',
  manualDiscount = 0,
  manualDiscountNote = '',
  ajudaDeCusto = 150,
}: FolhaHoristaParams): FolhaApuracaoProfessorHoristaResult {
  const isLeticia =
    professor?.id === 'usr_leticia' ||
    Boolean(professor?.name && professor.name.toLowerCase().includes('leticia'));

  const valorHoraAula =
    professor?.valorHoraAula !== undefined &&
    professor?.valorHoraAula !== null &&
    Number(professor.valorHoraAula) > 0
      ? Number(professor.valorHoraAula)
      : 35.0;

  const safeAjuda =
    professor?.ajudaDeCusto !== undefined && professor?.ajudaDeCusto !== null
      ? Number(professor.ajudaDeCusto)
      : Number(ajudaDeCusto) || 150;

  const safeManualAdd = Math.max(0, Number(manualAddition) || 0);
  const safeManualDesc = Math.max(0, Number(manualDiscount) || 0);

  // 1. CARGA DA GRADE HORÁRIA E SALÁRIO BASE CONTRATUAL CLT
  const gradeCalc = calculateCargaSemanalFixa(professor, schedules, professorActivities);
  const teacherGradeBlocks = gradeCalc.activeGradeBlocks;
  const {
    aulasSemanaisGrade,
    multiplicadorSemanasClt,
    aulasMensaisContratadas,
    salarioBaseAulas,
    horaAtividade: valorHoraAtividade,
    dsr: valorDsr,
    subtotalSalarioContratado,
    diasGradeSemanal,
  } = gradeCalc;

  const effectiveActivities = isLeticia
    ? Array.from(new Set(['Balé', 'Dança', 'Bale', 'Danca', ...professorActivities]))
    : professorActivities.length > 0
    ? professorActivities
    : ['Balé', 'Dança'];

  const items: FolhaItem[] = [];

  const startObj = new Date(startDate + 'T12:00:00');
  const endObj = new Date(endDate + 'T12:00:00');
  const curr = new Date(startObj);

  const todayStr = new Date().toISOString().split('T')[0];

  let totalAulasPrevistasPeriodo = 0;
  let totalAulasCumpridasGrade = 0;
  let totalFeriadosRecessos = 0;
  let totalFaltasInjustificadas = 0;
  let totalAulasExtras = 0;

  // Mapa de registros de ponto por data para validação de atestados e faltas
  const pontoByDate = new Map<string, any>();
  if (Array.isArray(pontoRecords)) {
    pontoRecords.forEach((pr) => {
      if (pr?.date) pontoByDate.set(pr.date, pr);
    });
  }

  while (curr <= endObj) {
    const dateStr = curr.toISOString().split('T')[0];
    const dayOfWeekNum = curr.getDay(); // 0 = Dom, 6 = Sab
    const dayOfWeekId = getDayOfWeekFromDate(dateStr);
    const dayOfWeekLabel = getDayOfWeekLabel(dayOfWeekId);
    const holidayItem = isHolidayOrRecess(dateStr, holidays);
    const isPastDate = dateStr < todayStr;
    const isToday = dateStr === todayStr;

    // Finais de semana não computam dias letivos
    if (dayOfWeekNum === 0 || dayOfWeekNum === 6) {
      curr.setDate(curr.getDate() + 1);
      continue;
    }

    // Blocos previstos na Grade Horária para este dia da semana
    const scheduledBlocksToday = teacherGradeBlocks.filter(
      (b) => b.dayOfWeek === dayOfWeekId
    );
    const hasGradeOnThisDay = scheduledBlocksToday.length > 0;

    // 1. REGRA ESTRITA DE FERIADO / RECESSO ESCOLAR
    // Feriados e Recessos Escolares mantêm a remuneração integral garantida por lei, sem descontos (CLT art. 320 / CCT)
    if (holidayItem) {
      if (hasGradeOnThisDay) {
        totalFeriadosRecessos += scheduledBlocksToday.length;
        totalAulasPrevistasPeriodo += scheduledBlocksToday.length;

        scheduledBlocksToday.forEach((block) => {
          items.push({
            date: dateStr,
            dayOfWeekLabel,
            activity: block.activityId || effectiveActivities[0] || 'Balé',
            turma: block.turma,
            timeSlot: `${block.startTime} - ${block.endTime}`,
            status: 'feriado_recesso',
            statusLabel: 'Feriado / Recesso Escolar (Remuneração Garantida)',
            motivo: `${holidayItem.name} (${holidayItem.type === 'feriado' ? 'Feriado Oficial' : 'Recesso Escolar'}) — Remuneração integral garantida por lei (sem descontos)`,
            qtdAlunosComChamada: 0,
            pertenceGrade: true,
            valorHoraAula,
            valorBase: 0, // Já integrado no Salário Base Mensal
            horaAtividade: 0,
            dsr: 0,
            valorTotalItem: 0,
          });
        });
      }
      curr.setDate(curr.getDate() + 1);
      continue;
    }

    // 2. DIA LETIVO REGULAR: Busca chamadas registradas vinculadas ao docente ou à sua modalidade
    const dateRecords = records.filter((r) => {
      if (!r || r.date !== dateStr) return false;
      const matchInstructor =
        (r.instructorId &&
          (r.instructorId === professor?.id ||
            (professor?.uid && r.instructorId === professor.uid))) ||
        (r.instructorName &&
          professor?.name &&
          r.instructorName.toLowerCase().includes(professor.name.toLowerCase().split(' ')[0]));

      const matchActivity = effectiveActivities.some(
        (act) =>
          act
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim() ===
          (r.activity || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
      );
      return matchInstructor || matchActivity;
    });

    // Se houve chamada realizada no dia:
    if (dateRecords.length > 0) {
      // Agrupa chamadas por bloco de turma / horário
      const blockGroups = new Map<string, AttendanceRecord[]>();

      dateRecords.forEach((r) => {
        const timeSlotKey = r.timeSlot ? r.timeSlot.trim() : (r.turma || 'Bloco Único');
        const blockKey = `${r.activity}:::${timeSlotKey}`;
        const list = blockGroups.get(blockKey) || [];
        list.push(r);
        blockGroups.set(blockKey, list);
      });

      const confirmedGradeBlocksOnThisDate = new Set<string>();

      blockGroups.forEach((recsInBlock, blockKey) => {
        const [act, blockLabel] = blockKey.split(':::');
        const turmasUnicas = Array.from(new Set(recsInBlock.map((r) => r.turma).filter(Boolean)));
        const turmasDesc =
          turmasUnicas.length > 1
            ? `${turmasUnicas.length} turmas agrupadas (${turmasUnicas.join(', ')})`
            : turmasUnicas[0] || blockLabel;

        // VERIFICAÇÃO SE A TURMA E MODALIDADE PERTENCEM À GRADE HORÁRIA DO DOCENTE
        const gradeCheck = checkClassBelongsToGradeHorista(
          teacherGradeBlocks,
          dayOfWeekId,
          turmasDesc,
          act
        );

        if (gradeCheck.belongs) {
          // 🟢 AULA DA GRADE CONFIRMADA VIA CHAMADA DE FREQUÊNCIA
          totalAulasCumpridasGrade++;
          totalAulasPrevistasPeriodo++;
          if (gradeCheck.matchingBlock) {
            confirmedGradeBlocksOnThisDate.add(gradeCheck.matchingBlock.id);
          }

          items.push({
            date: dateStr,
            dayOfWeekLabel,
            activity: act,
            turma: turmasDesc,
            timeSlot:
              recsInBlock[0]?.timeSlot ||
              (gradeCheck.matchingBlock
                ? `${gradeCheck.matchingBlock.startTime} - ${gradeCheck.matchingBlock.endTime}`
                : undefined),
            status: 'prevista_cumprida',
            statusLabel: '🟢 Aula Prevista Ministrada (Carga Contratada)',
            motivo: `Aula prevista na Grade Horária confirmada via Chamada de Frequência (${recsInBlock.length} alunos registrados)`,
            qtdAlunosComChamada: recsInBlock.length,
            pertenceGrade: true,
            valorHoraAula,
            valorBase: 0, // Já coberto pela Carga Mensal Contratada (4.5 semanas)
            horaAtividade: 0,
            dsr: 0,
            valorTotalItem: 0,
          });
        } else {
          // ⭐ AULA EXCEDENTE OU MINISTRADA FORA DA GRADE REGULAR: APURADA AUTOMATICAMENTE COMO HORA EXTRA (+50%)
          totalAulasExtras++;
          const valExtraBase = Math.round(valorHoraAula * 1.5 * 100) / 100;
          const haExtra = Math.round(valExtraBase * 0.05 * 100) / 100;
          const dsrExtra = Math.round(((valExtraBase + haExtra) / 6) * 100) / 100;
          const totalItemExtra = Math.round((valExtraBase + haExtra + dsrExtra) * 100) / 100;

          items.push({
            date: dateStr,
            dayOfWeekLabel,
            activity: act,
            turma: turmasDesc,
            timeSlot: recsInBlock[0]?.timeSlot,
            status: 'aula_extra_substituicao',
            statusLabel: '⭐ Aula Extra / Substituição (+50%)',
            motivo: `Aula ministrada fora da Grade regular — Apurada com adicional legal de 50% (R$ ${valExtraBase.toFixed(2)}) + reflexos de Hora-Atividade (R$ ${haExtra.toFixed(2)}) e DSR (R$ ${dsrExtra.toFixed(2)})`,
            qtdAlunosComChamada: recsInBlock.length,
            pertenceGrade: false,
            valorHoraAula,
            valorBase: valExtraBase,
            horaAtividade: haExtra,
            dsr: dsrExtra,
            valorTotalItem: totalItemExtra,
            isExtra: true,
          });
        }
      });

      // Verifica se houve blocos previstos para o dia que ficaram sem chamada confirmada
      scheduledBlocksToday.forEach((block) => {
        if (!confirmedGradeBlocksOnThisDate.has(block.id)) {
          totalAulasPrevistasPeriodo++;
          if (isPastDate) {
            // Checa ponto para verificar se foi atestado médico ou falta justificada
            const ponto = pontoByDate.get(dateStr);
            const isJustified =
              ponto?.status === 'atestado' ||
              ponto?.status === 'falta_justificada' ||
              Boolean(ponto?.note && ponto.note.toLowerCase().includes('atestado'));

            if (isJustified) {
              items.push({
                date: dateStr,
                dayOfWeekLabel,
                activity: block.activityId || effectiveActivities[0] || 'Balé',
                turma: block.turma,
                timeSlot: `${block.startTime} - ${block.endTime}`,
                status: 'falta_justificada',
                statusLabel: '🟡 Falta Justificada / Atestado',
                motivo: `${ponto?.note || 'Atestado Médico / Licença'} — Remuneração mantida sem descontos`,
                qtdAlunosComChamada: 0,
                pertenceGrade: true,
                valorHoraAula,
                valorBase: 0,
                horaAtividade: 0,
                dsr: 0,
                valorTotalItem: 0,
              });
            } else {
              // 🔴 FALTA INJUSTIFICADA: gera desconto proporcional direto sobre aula, hora-atividade e reflexo do DSR
              totalFaltasInjustificadas++;
              const descAula = valorHoraAula;
              const descHa = Math.round(descAula * 0.05 * 100) / 100;
              const descDsr = Math.round(((descAula + descHa) / 6) * 100) / 100;
              const totalDesc = Math.round((descAula + descHa + descDsr) * 100) / 100;

              items.push({
                date: dateStr,
                dayOfWeekLabel,
                activity: block.activityId || effectiveActivities[0] || 'Balé',
                turma: block.turma,
                timeSlot: `${block.startTime} - ${block.endTime}`,
                status: 'falta_injustificada',
                statusLabel: '🔴 Falta Injustificada',
                motivo: `Aula prevista na Grade Horária não ministrada sem justificativa — Desconto da hora-aula (-R$ ${descAula.toFixed(2)}), Hora-Atividade (-R$ ${descHa.toFixed(2)}) e reflexo do DSR (-R$ ${descDsr.toFixed(2)})`,
                qtdAlunosComChamada: 0,
                pertenceGrade: true,
                valorHoraAula,
                valorBase: descAula,
                horaAtividade: descHa,
                dsr: descDsr,
                valorTotalItem: -totalDesc,
                isDesconto: true,
              });
            }
          } else {
            // Data de hoje ou futura
            items.push({
              date: dateStr,
              dayOfWeekLabel,
              activity: block.activityId || effectiveActivities[0] || 'Balé',
              turma: block.turma,
              timeSlot: `${block.startTime} - ${block.endTime}`,
              status: 'prevista_futura',
              statusLabel: isToday ? '⚪ Aula Prevista Hoje (Aguardando Chamada)' : '⚪ Aula Prevista (A Realizar)',
              motivo: 'Horário regular cadastrado na Grade Horária Semanal',
              qtdAlunosComChamada: 0,
              pertenceGrade: true,
              valorHoraAula,
              valorBase: 0,
              horaAtividade: 0,
              dsr: 0,
              valorTotalItem: 0,
            });
          }
        }
      });
    } else {
      // Nenhuma chamada registrada nesta data letiva
      if (hasGradeOnThisDay) {
        totalAulasPrevistasPeriodo += scheduledBlocksToday.length;

        scheduledBlocksToday.forEach((block) => {
          if (isPastDate) {
            const ponto = pontoByDate.get(dateStr);
            const isJustified =
              ponto?.status === 'atestado' ||
              ponto?.status === 'falta_justificada' ||
              Boolean(ponto?.note && ponto.note.toLowerCase().includes('atestado'));

            if (isJustified) {
              items.push({
                date: dateStr,
                dayOfWeekLabel,
                activity: block.activityId || effectiveActivities[0] || 'Balé',
                turma: block.turma,
                timeSlot: `${block.startTime} - ${block.endTime}`,
                status: 'falta_justificada',
                statusLabel: '🟡 Falta Justificada / Atestado',
                motivo: `${ponto?.note || 'Atestado Médico / Licença'} — Remuneração mantida sem descontos`,
                qtdAlunosComChamada: 0,
                pertenceGrade: true,
                valorHoraAula,
                valorBase: 0,
                horaAtividade: 0,
                dsr: 0,
                valorTotalItem: 0,
              });
            } else {
              // 🔴 FALTA INJUSTIFICADA
              totalFaltasInjustificadas++;
              const descAula = valorHoraAula;
              const descHa = Math.round(descAula * 0.05 * 100) / 100;
              const descDsr = Math.round(((descAula + descHa) / 6) * 100) / 100;
              const totalDesc = Math.round((descAula + descHa + descDsr) * 100) / 100;

              items.push({
                date: dateStr,
                dayOfWeekLabel,
                activity: block.activityId || effectiveActivities[0] || 'Balé',
                turma: block.turma,
                timeSlot: `${block.startTime} - ${block.endTime}`,
                status: 'falta_injustificada',
                statusLabel: '🔴 Falta Injustificada',
                motivo: `Aula prevista na Grade Horária não ministrada sem justificativa — Desconto da hora-aula (-R$ ${descAula.toFixed(2)}), Hora-Atividade (-R$ ${descHa.toFixed(2)}) e reflexo do DSR (-R$ ${descDsr.toFixed(2)})`,
                qtdAlunosComChamada: 0,
                pertenceGrade: true,
                valorHoraAula,
                valorBase: descAula,
                horaAtividade: descHa,
                dsr: descDsr,
                valorTotalItem: -totalDesc,
                isDesconto: true,
              });
            }
          } else {
            items.push({
              date: dateStr,
              dayOfWeekLabel,
              activity: block.activityId || effectiveActivities[0] || 'Balé',
              turma: block.turma,
              timeSlot: `${block.startTime} - ${block.endTime}`,
              status: 'prevista_futura',
              statusLabel: isToday ? '⚪ Aula Prevista Hoje (Aguardando Chamada)' : '⚪ Aula Prevista (A Realizar)',
              motivo: 'Horário regular cadastrado na Grade Horária Semanal',
              qtdAlunosComChamada: 0,
              pertenceGrade: true,
              valorHoraAula,
              valorBase: 0,
              horaAtividade: 0,
              dsr: 0,
              valorTotalItem: 0,
            });
          }
        });
      }
    }

    curr.setDate(curr.getDate() + 1);
  }

  // CÁLCULO DAS HORAS EXTRAS (+50% com reflexos)
  const valorHoraExtraUnitario = Math.round(valorHoraAula * 1.5 * 100) / 100;
  const valorHoraExtraAulas = Math.round(totalAulasExtras * valorHoraExtraUnitario * 100) / 100;
  const reflexoHoraAtividadeExtras = Math.round(valorHoraExtraAulas * 0.05 * 100) / 100;
  const reflexoDsrExtras =
    Math.round(((valorHoraExtraAulas + reflexoHoraAtividadeExtras) / 6) * 100) / 100;
  const totalHorasExtrasGeral =
    Math.round((valorHoraExtraAulas + reflexoHoraAtividadeExtras + reflexoDsrExtras) * 100) / 100;

  // CÁLCULO DOS DESCONTOS DE FALTAS INJUSTIFICADAS (com reflexos de HA e DSR)
  const descontoAulasFaltas = Math.round(totalFaltasInjustificadas * valorHoraAula * 100) / 100;
  const descontoHoraAtividadeFaltas = Math.round(descontoAulasFaltas * 0.05 * 100) / 100;
  const descontoDsrFaltas =
    Math.round(((descontoAulasFaltas + descontoHoraAtividadeFaltas) / 6) * 100) / 100;
  const totalDescontoFaltas =
    Math.round((descontoAulasFaltas + descontoHoraAtividadeFaltas + descontoDsrFaltas) * 100) / 100;

  // FECHAMENTO FINAL DA FOLHA CLT
  const totalProventosSalarial =
    Math.round(
      (subtotalSalarioContratado +
        totalHorasExtrasGeral -
        totalDescontoFaltas +
        safeManualAdd -
        safeManualDesc) *
        100
    ) / 100;

  const totalDescontosGeral = Math.round((totalDescontoFaltas + safeManualDesc) * 100) / 100;
  const totalLiquidoAPagar = Math.round((totalProventosSalarial + safeAjuda) * 100) / 100;

  const [sYear, sMonth] = startDate.split('-');
  const competencia = `${sMonth}/${sYear}`;

  return {
    regimeTrabalho: 'professor_horista',
    professorId: professor?.id || 'usr_leticia',
    professorName: professor?.name || 'Professora Letícia',
    cargoLabel: professor?.cargoLabel || 'Professora de Balé e Dança',
    competencia,
    startDate,
    endDate,

    aulasSemanaisGrade,
    multiplicadorSemanasClt: 4.5,
    aulasMensaisContratadas,
    valorHoraAula,
    salarioBaseAulas,

    percentualHoraAtividade: 0.05,
    valorHoraAtividade,
    fatorDsr: 1 / 6,
    valorDsr,
    subtotalSalarioContratado,

    totalAulasPrevistasPeriodo,
    totalAulasCumpridasGrade,
    totalFeriadosRecessos,

    totalFaltasInjustificadas,
    descontoAulasFaltas,
    descontoHoraAtividadeFaltas,
    descontoDsrFaltas,
    totalDescontoFaltas,

    totalAulasExtras,
    valorHoraExtraUnitario,
    valorHoraExtraAulas,
    reflexoHoraAtividadeExtras,
    reflexoDsrExtras,
    totalHorasExtrasGeral,

    ajudaDeCusto: safeAjuda,
    manualAddition: safeManualAdd,
    manualAdditionNote,
    manualDiscount: safeManualDesc,
    manualDiscountNote,

    totalProventosSalarial,
    totalDescontosGeral,
    totalLiquidoAPagar,

    itens: items,
    horariosGradeVinculados: teacherGradeBlocks,
    diasGradeSemanal,
  };
}

export default {
  calculateFolhaProfessorHorista,
  calculateCargaSemanalFixa,
  getProfessorWeeklyGradeBlocks,
  isScheduleBlockOfProfessorHorista,
  getDefaultLeticiaScheduleBlocks,
  normalizeTurmaForMatching,
};
