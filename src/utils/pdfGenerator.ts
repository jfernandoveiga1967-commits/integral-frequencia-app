import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Student,
  AttendanceRecord,
  TurmaType,
  WeekInfo,
  ScheduleBlock,
  DayOfWeek,
  ActivityItem,
  ActivityType,
  UserProfile,
} from '../types';
import { formatDateBR, getDayOfWeekLabel } from './dateUtils';
import { sortTurmasPedagogical } from './turmaUtils';

// Helper to format date string YYYY-MM-DD to DD/MM/YYYY
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return formatDateBR(dateStr);
}

// Format current timestamp e.g. "15/08/2026 às 10:30"
function getCurrentDateTimeString(): string {
  const now = new Date();
  const date = now.toLocaleDateString('pt-BR');
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${date} às ${time}`;
}

// Status labels
function getStatusText(status: string): string {
  switch (status) {
    case 'presente':
      return 'Presente';
    case 'saida_antecipada':
      return 'Saída Antecipada';
    case 'falta':
      return 'Falta';
    case 'saude':
      return 'Ausência Saúde';
    case 'sem_equipamento':
      return 'Sem Equipamento';
    default:
      return status;
  }
}

// Status text colors [R, G, B]
function getStatusColor(status: string): [number, number, number] {
  switch (status) {
    case 'presente':
      return [22, 163, 74]; // green-600
    case 'saida_antecipada':
      return [217, 119, 6]; // amber-600
    case 'falta':
      return [220, 38, 38]; // red-600
    case 'saude':
      return [217, 119, 6]; // amber-600
    case 'sem_equipamento':
      return [234, 88, 12]; // orange-600
    default:
      return [51, 65, 85];
  }
}

/**
 * Common Official Header Drawer
 */
function drawOfficialHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  filterDetails: string[],
  orientation: 'portrait' | 'landscape' = 'portrait'
) {
  const pageWidth = orientation === 'landscape' ? 297 : 210;

  // Header Banner Background
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 32, 'F');

  // Accent line
  doc.setFillColor(79, 70, 229); // indigo-600
  doc.rect(0, 0, pageWidth, 3, 'F');

  // Brand Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(244, 63, 94); // rose-500 badge look
  doc.text('COLÉGIO CRESCER • PROGRAMA INTEGRAL', 14, 10);

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), 14, 18);

  // Subtitle / Description
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(191, 219, 254); // blue-200
  doc.text(subtitle, 14, 25);

  // Right Side: Emission Date and Filters
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(`Emissão: ${getCurrentDateTimeString()}`, pageWidth - 14, 11, { align: 'right' });

  if (filterDetails.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(224, 231, 255); // indigo-100
    const filterText = filterDetails.join('  |  ');
    doc.text(filterText, pageWidth - 14, 18, { align: 'right' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('Documento Oficial de Registro Escolar', pageWidth - 14, 25, { align: 'right' });
}

/**
 * Common Footer & Page Numbers
 */
function applyPageNumbersAndFooters(doc: jsPDF, orientation: 'portrait' | 'landscape' = 'portrait') {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageWidth = orientation === 'landscape' ? 297 : 210;
  const pageHeight = orientation === 'landscape' ? 210 : 297;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Footer divider line
    doc.setDrawColor(226, 232, 240);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // slate-400

    doc.text(
      'Colégio Crescer - Sistema de Gestão do Programa Integral',
      14,
      pageHeight - 7
    );

    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth - 14,
      pageHeight - 7,
      { align: 'right' }
    );
  }
}

/**
 * Helper to draw summary metrics cards
 */
function drawMetricBoxes(
  doc: jsPDF,
  startX: number,
  startY: number,
  boxWidth: number,
  boxHeight: number,
  spacing: number,
  metrics: { label: string; value: string | number; color: [number, number, number] }[]
) {
  metrics.forEach((m, idx) => {
    const x = startX + idx * (boxWidth + spacing);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, startY, boxWidth, boxHeight, 2, 2, 'FD');

    // Label
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(m.label.toUpperCase(), x + 3, startY + 5);

    // Value
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(m.color[0], m.color[1], m.color[2]);
    doc.text(String(m.value), x + 3, startY + 11.5);
  });
}

// ---------------------------------------------------------------------------
// 1. GRADE HORÁRIA: GRADE SEMANAL DA TURMA (Tabela Segunda a Sexta)
// ---------------------------------------------------------------------------

export interface GenerateWeeklySchedulePDFOptions {
  turma: TurmaType | 'ALL';
  turmasList?: string[];
  schedules: ScheduleBlock[];
  activitiesList?: ActivityItem[];
  schoolYear?: number | string;
}

export function generateWeeklySchedulePDF({
  turma,
  turmasList = [],
  schedules,
  schoolYear = new Date().getFullYear(),
}: GenerateWeeklySchedulePDFOptions) {
  const isAll = turma === 'ALL';
  const targetTurmas = isAll
    ? sortTurmasPedagogical(turmasList.length > 0 ? turmasList : Array.from(new Set(schedules.map((s) => s.turma))))
    : [turma];

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const DAYS_ORDER: { id: DayOfWeek; label: string }[] = [
    { id: 'segunda', label: 'Segunda-feira' },
    { id: 'terca', label: 'Terça-feira' },
    { id: 'quarta', label: 'Quarta-feira' },
    { id: 'quinta', label: 'Quinta-feira' },
    { id: 'sexta', label: 'Sexta-feira' },
  ];

  targetTurmas.forEach((currentTurma, index) => {
    if (index > 0) {
      doc.addPage('a4', 'landscape');
    }

    const turmaSchedules = schedules
      .filter((s) => s.turma === currentTurma)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const totalBlocks = turmaSchedules.length;

    // Header
    drawOfficialHeader(
      doc,
      'Grade Horária Semanal',
      'Cronograma e Distribuição de Atividades do Integral',
      [`Turma: ${currentTurma}`, `Ano Letivo: ${schoolYear}`],
      'landscape'
    );

    // Sub-card with Turma Information
    let startY = 38;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, startY, 269, 14, 2, 2, 'FD');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Turma / Segmento: ${currentTurma}`, 18, startY + 6);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Total de Horários / Blocos Cadastrados: ${totalBlocks} atividades na semana`, 18, startY + 11);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(79, 70, 229);
    doc.text('Horário de Atendimento: Segunda a Sexta-feira', 269, startY + 8.5, { align: 'right' });

    startY += 18;

    // Prepare 5-day columns matrix
    const dayBlocksMap: Record<DayOfWeek, ScheduleBlock[]> = {
      segunda: turmaSchedules.filter((s) => s.dayOfWeek === 'segunda'),
      terca: turmaSchedules.filter((s) => s.dayOfWeek === 'terca'),
      quarta: turmaSchedules.filter((s) => s.dayOfWeek === 'quarta'),
      quinta: turmaSchedules.filter((s) => s.dayOfWeek === 'quinta'),
      sexta: turmaSchedules.filter((s) => s.dayOfWeek === 'sexta'),
    };

    const maxRows = Math.max(
      dayBlocksMap.segunda.length,
      dayBlocksMap.terca.length,
      dayBlocksMap.quarta.length,
      dayBlocksMap.quinta.length,
      dayBlocksMap.sexta.length,
      1
    );

    const tableRows: string[][] = [];

    if (totalBlocks === 0) {
      tableRows.push([
        'Sem horários cadastrados',
        'Sem horários cadastrados',
        'Sem horários cadastrados',
        'Sem horários cadastrados',
        'Sem horários cadastrados',
      ]);
    } else {
      for (let r = 0; r < maxRows; r++) {
        const rowCells = DAYS_ORDER.map((d) => {
          const block = dayBlocksMap[d.id][r];
          if (!block) return '-';
          let text = `${block.startTime} - ${block.endTime}\n${block.activityId.toUpperCase()}`;
          if (block.location) {
            text += `\nLocal: ${block.location}`;
          }
          if (block.guidelines) {
            text += `\nObs: ${block.guidelines}`;
          }
          return text;
        });
        tableRows.push(rowCells);
      }
    }

    autoTable(doc, {
      startY: startY,
      head: [DAYS_ORDER.map((d) => `${d.label.toUpperCase()} (${dayBlocksMap[d.id].length})`)],
      body: tableRows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 3.5,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [15, 23, 42], // slate-900
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'center',
      },
      bodyStyles: {
        textColor: [30, 41, 59],
        fontSize: 8,
        lineColor: [226, 232, 240],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 53.8 },
        1: { cellWidth: 53.8 },
        2: { cellWidth: 53.8 },
        3: { cellWidth: 53.8 },
        4: { cellWidth: 53.8 },
      },
    });

    // Signature line
    const lastY = (doc as any).lastAutoTable?.finalY || 150;
    if (lastY < 175) {
      const sigY = Math.max(lastY + 16, 172);
      doc.setDrawColor(203, 213, 225);
      doc.line(30, sigY, 110, sigY);
      doc.line(180, sigY, 260, sigY);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Monitora / Responsável da Turma', 70, sigY + 4, { align: 'center' });
      doc.text('Coordenação Pedagógica do Integral', 220, sigY + 4, { align: 'center' });
    }
  });

  applyPageNumbersAndFooters(doc, 'landscape');
  doc.save(`Grade_Semanal_${turma.replace(/[\/\s]+/g, '_')}_${schoolYear}.pdf`);
}

// ---------------------------------------------------------------------------
// 2. GRADE HORÁRIA: ROTINA DIÁRIA DA TURMA (Cronograma detalhado do dia)
// ---------------------------------------------------------------------------

export interface GenerateDailyRoutinePDFOptions {
  turma: TurmaType;
  dayOfWeek: DayOfWeek;
  schedules: ScheduleBlock[];
  activitiesList?: ActivityItem[];
  schoolYear?: number | string;
}

export function generateDailyRoutinePDF({
  turma,
  dayOfWeek,
  schedules,
  schoolYear = new Date().getFullYear(),
}: GenerateDailyRoutinePDFOptions) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const dayLabel = getDayOfWeekLabel(dayOfWeek);
  const dayBlocks = schedules
    .filter((s) => s.turma === turma && s.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Header
  drawOfficialHeader(
    doc,
    `Rotina Diária - ${dayLabel}`,
    'Cronograma Detalhado de Horários e Orientações',
    [`Turma: ${turma}`, `Dia: ${dayLabel}`],
    'portrait'
  );

  let startY = 38;

  // Turma & Day Info Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, 182, 20, 2.5, 2.5, 'FD');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Turma: ${turma}`, 18, startY + 7);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Dia da Semana: ${dayLabel}  •  Ano Letivo: ${schoolYear}`, 18, startY + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(79, 70, 229);
  doc.text(`${dayBlocks.length} Atividades`, 190, startY + 11, { align: 'right' });

  startY += 26;

  // Detailed Table
  const tableData = dayBlocks.map((b) => [
    `${b.startTime} - ${b.endTime}`,
    b.activityId,
    b.location || 'Sala / Padrão',
    b.guidelines || 'Sem orientações adicionais',
  ]);

  autoTable(doc, {
    startY: startY,
    head: [['Horário', 'Atividade / Oficina', 'Local / Espaço', 'Orientações Pedagógicas / Observações']],
    body: tableData.length > 0 ? tableData : [['-', 'Nenhum horário cadastrado para este dia', '-', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
      cellPadding: 3.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold', halign: 'center' },
      1: { cellWidth: 38, fontStyle: 'bold' },
      2: { cellWidth: 34 },
      3: { cellWidth: 'auto' },
    },
  });

  // Notes Box & Signature
  const finalY = (doc as any).lastAutoTable?.finalY || 160;
  if (finalY < 235) {
    const notesY = finalY + 10;
    doc.setFillColor(254, 252, 232); // amber-50
    doc.setDrawColor(254, 240, 138); // amber-200
    doc.roundedRect(14, notesY, 182, 22, 2, 2, 'FD');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9); // amber-700
    doc.text('ORIENTAÇÕES GERAIS PARA A MONITORA / PROFESSOR:', 18, notesY + 6);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(113, 63, 18);
    doc.text('• Realize a chamada pontualmente no início das oficinas extracurriculares que exigem roll call.', 18, notesY + 11);
    doc.text('• Registre saídas antecipadas informando o horário exato e o motivo informado pela recepção.', 18, notesY + 15);
    doc.text('• Em caso de indisposição ou falta de material obrigatório, lance a ocorrência imediatamente no sistema.', 18, notesY + 19);

    const sigY = notesY + 36;
    doc.setDrawColor(203, 213, 225);
    doc.line(20, sigY, 90, sigY);
    doc.line(120, sigY, 190, sigY);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Monitora / Educador Responsável', 55, sigY + 4, { align: 'center' });
    doc.text('Coordenação do Programa Integral', 155, sigY + 4, { align: 'center' });
  }

  applyPageNumbersAndFooters(doc, 'portrait');
  doc.save(`Rotina_${turma.replace(/[\/\s]+/g, '_')}_${dayOfWeek}.pdf`);
}

// ---------------------------------------------------------------------------
// 2.1. GRADE GERAL CONSOLIDADA POR ATIVIDADE / MODALIDADE
// ---------------------------------------------------------------------------

export interface GenerateActivitySchedulePDFOptions {
  activityName: ActivityType;
  schedules: ScheduleBlock[];
  activitiesList?: ActivityItem[];
  users?: UserProfile[];
  schoolYear?: number | string;
  periodLabel?: string;
  teacherName?: string;
}

export function generateActivitySchedulePDF({
  activityName,
  schedules,
  activitiesList = [],
  users = [],
  schoolYear = new Date().getFullYear(),
  teacherName,
}: GenerateActivitySchedulePDFOptions) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const DAYS_ORDER_MAP: Record<DayOfWeek, { order: number; label: string }> = {
    segunda: { order: 1, label: 'Segunda-feira' },
    terca: { order: 2, label: 'Terça-feira' },
    quarta: { order: 3, label: 'Quarta-feira' },
    quinta: { order: 4, label: 'Quinta-feira' },
    sexta: { order: 5, label: 'Sexta-feira' },
  };

  // Find all schedule blocks matching this activity (case insensitive or exact)
  const activityBlocks = schedules
    .filter(
      (s) =>
        s.activityId?.trim().toLowerCase() === activityName.trim().toLowerCase() ||
        s.activityId === activityName
    )
    .sort((a, b) => {
      // 1. Day of Week order
      const dayA = DAYS_ORDER_MAP[a.dayOfWeek]?.order || 99;
      const dayB = DAYS_ORDER_MAP[b.dayOfWeek]?.order || 99;
      if (dayA !== dayB) return dayA - dayB;

      // 2. Start Time
      const timeComp = a.startTime.localeCompare(b.startTime);
      if (timeComp !== 0) return timeComp;

      // 3. End Time
      const endComp = a.endTime.localeCompare(b.endTime);
      if (endComp !== 0) return endComp;

      // 4. Turma pedagogical comparison
      return (a.turma || '').localeCompare(b.turma || '', 'pt-BR', { numeric: true });
    });

  // Calculate unique turmas attended
  const uniqueTurmas = Array.from(new Set(activityBlocks.map((b) => b.turma)));
  const sortedUniqueTurmas = sortTurmasPedagogical(uniqueTurmas);

  // Find activity metadata
  const activityMeta = activitiesList.find(
    (a) => a.id.toLowerCase() === activityName.toLowerCase() || a.name.toLowerCase() === activityName.toLowerCase()
  );

  // Detect responsible teacher(s)
  let resolvedTeacher = teacherName;
  if (!resolvedTeacher) {
    const specialists = users.filter(
      (u) =>
        u.assignedActivities?.some(
          (act) => act.toLowerCase() === activityName.toLowerCase()
        ) ||
        u.specialtyActivity?.toLowerCase() === activityName.toLowerCase()
    );
    if (specialists.length > 0) {
      resolvedTeacher = specialists.map((s) => s.name).join(', ');
    } else {
      resolvedTeacher = 'Docente Especialista / Coordenação';
    }
  }

  // Header banner
  drawOfficialHeader(
    doc,
    `Grade de Horários - ${activityName}`,
    'Quadro Geral Consolidado de Turmas, Espaços e Docentes da Modalidade',
    [`Modalidade: ${activityName}`, `Ano Letivo: ${schoolYear}`],
    'portrait'
  );

  let startY = 38;

  // Overview Info Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, 182, 26, 2.5, 2.5, 'FD');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Modalidade: ${activityName}`, 18, startY + 7);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Professor(a) Especialista Responsável: ${resolvedTeacher}`,
    18,
    startY + 14
  );
  doc.text(
    `Ano / Período Letivo: ${schoolYear}  •  Total de Aulas Semanais: ${activityBlocks.length}  •  Turmas Atendidas: ${sortedUniqueTurmas.length}`,
    18,
    startY + 20
  );

  // Badges on top right of the card
  doc.setFillColor(238, 242, 255);
  doc.setDrawColor(199, 210, 254);
  doc.roundedRect(140, startY + 3, 50, 20, 2, 2, 'FD');

  doc.setTextColor(67, 56, 202);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('TOTAL SEMANAL', 165, startY + 8.5, { align: 'center' });
  doc.setFontSize(12);
  doc.text(`${activityBlocks.length} AULAS`, 165, startY + 17.5, { align: 'center' });

  startY += 32;

  // Build table data
  const tableData = activityBlocks.map((b) => {
    const dayLabel = DAYS_ORDER_MAP[b.dayOfWeek]?.label || b.dayOfWeek;
    const timeRange = `${b.startTime} às ${b.endTime}`;
    const location = b.location || 'Sala / Espaço Padrão';
    
    // Resolve teacher for this specific block or fallback to general specialist
    const blockTeacher = resolvedTeacher || 'Docente Responsável';

    const guidelines = b.guidelines || activityMeta?.defaultEquipment || '-';

    return [
      dayLabel,
      timeRange,
      b.turma,
      location,
      blockTeacher,
      guidelines,
    ];
  });

  autoTable(doc, {
    startY: startY,
    head: [
      [
        'Dia da Semana',
        'Horário',
        'Turma',
        'Local / Sala',
        'Professor(a) / Monitor(a)',
        'Orientações / Material',
      ],
    ],
    body:
      tableData.length > 0
        ? tableData
        : [
            [
              '-',
              '-',
              'Nenhum horário cadastrado para esta modalidade na grade',
              '-',
              '-',
              '-',
            ],
          ],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 7.8,
      textColor: [30, 41, 59],
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold' },
      1: { cellWidth: 26, fontStyle: 'bold', halign: 'center' },
      2: { cellWidth: 30, fontStyle: 'bold' },
      3: { cellWidth: 32 },
      4: { cellWidth: 36 },
      5: { cellWidth: 'auto' },
    },
  });

  // Signatures
  const finalY = (doc as any).lastAutoTable?.finalY || 160;
  if (finalY < 240) {
    const sigY = Math.max(finalY + 18, 235);
    doc.setDrawColor(203, 213, 225);
    doc.line(20, sigY, 90, sigY);
    doc.line(120, sigY, 190, sigY);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Professor(a) Especialista (${activityName})`,
      55,
      sigY + 4,
      { align: 'center' }
    );
    doc.text('Coordenação do Programa Integral', 155, sigY + 4, { align: 'center' });
  }

  applyPageNumbersAndFooters(doc, 'portrait');
  doc.save(
    `Grade_Horarios_${activityName.replace(/[\/\s]+/g, '_')}_${schoolYear}.pdf`
  );
}

// ---------------------------------------------------------------------------
// 3. RELATÓRIO INDIVIDUAL DO ALUNO (Filtro por Período / Data Inicial e Final)
// ---------------------------------------------------------------------------l)
// ---------------------------------------------------------------------------

export interface GenerateStudentPeriodPDFOptions {
  student: Student;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  periodLabel?: string;
  records: AttendanceRecord[];
}

export function generateStudentPeriodPDFReport({
  student,
  startDate,
  endDate,
  periodLabel,
  records,
}: GenerateStudentPeriodPDFOptions) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const periodText = periodLabel || `De ${formatDate(startDate)} até ${formatDate(endDate)}`;

  const studentRecords = records
    .filter((r) => r.studentId === student.id && r.date >= startDate && r.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const total = studentRecords.length;
  const pres = studentRecords.filter((r) => r.status === 'presente').length;
  const saidaAnt = studentRecords.filter((r) => r.status === 'saida_antecipada').length;
  const falta = studentRecords.filter((r) => r.status === 'falta').length;
  const saude = studentRecords.filter((r) => r.status === 'saude').length;
  const semEquip = studentRecords.filter((r) => r.status === 'sem_equipamento').length;
  const rate = total > 0 ? Math.round(((pres + saidaAnt) / total) * 100) : 100;

  // Header
  drawOfficialHeader(
    doc,
    'Relatório Individual de Frequência',
    'Histórico de Presenças, Ausências e Ocorrências',
    [`Aluno: ${student.name}`, `Período: ${formatDate(startDate)} a ${formatDate(endDate)}`],
    'portrait'
  );

  // Student Info Box
  let startY = 38;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, 182, 28, 2.5, 2.5, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Aluno(a): ${student.name}`, 18, startY + 7);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Turma / Ano Escolar: ${student.turma}`, 18, startY + 14);
  doc.text(`Oficinas Matriculadas: ${student.activities.join(', ') || 'Nenhuma'}`, 18, startY + 21);

  // Taxa de Presença Badge
  doc.setFillColor(238, 242, 255);
  doc.setDrawColor(199, 210, 254);
  doc.roundedRect(140, startY + 3, 50, 22, 2, 2, 'FD');

  doc.setTextColor(67, 56, 202);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('TAXA DE PRESENÇA', 165, startY + 9, { align: 'center' });
  doc.setFontSize(13);
  doc.text(`${rate}%`, 165, startY + 19, { align: 'center' });

  startY += 34;

  // Metrics summary boxes
  const metrics = [
    { label: 'Presenças', value: pres, color: [22, 163, 74] as [number, number, number] },
    { label: 'Saída Ant.', value: saidaAnt, color: [217, 119, 6] as [number, number, number] },
    { label: 'Faltas', value: falta, color: [220, 38, 38] as [number, number, number] },
    { label: 'Saúde', value: saude, color: [217, 119, 6] as [number, number, number] },
    { label: 'Sem Equip.', value: semEquip, color: [234, 88, 12] as [number, number, number] },
  ];
  drawMetricBoxes(doc, 14, startY, 34, 15, 3, metrics);

  startY += 21;

  // Table of Records
  const tableData = studentRecords.map((r) => [
    formatDate(r.date),
    r.activity,
    r.status === 'saida_antecipada'
      ? `Saída Antecipada (${r.exitTime || 'S/ hor.'})`
      : getStatusText(r.status),
    r.equipmentMissingDetails || r.observation || '-',
  ]);

  autoTable(doc, {
    startY: startY,
    head: [['Data', 'Atividade / Oficina', 'Status do Registro', 'Detalhes / Ocorrências / Observações']],
    body: tableData.length > 0 ? tableData : [['-', '-', 'Sem registros lançados para este período', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85],
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 26, halign: 'center' },
      1: { cellWidth: 36, fontStyle: 'bold' },
      2: { cellWidth: 42, fontStyle: 'bold' },
      3: { cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        const val = String(data.cell.raw || '');
        if (val === 'Presente') {
          data.cell.styles.textColor = [22, 163, 74];
        } else if (val.startsWith('Saída Antecipada')) {
          data.cell.styles.textColor = [217, 119, 6];
        } else if (val === 'Falta') {
          data.cell.styles.textColor = [220, 38, 38];
        } else if (val === 'Sem Equipamento') {
          data.cell.styles.textColor = [234, 88, 12];
        } else if (val === 'Ausência Saúde') {
          data.cell.styles.textColor = [217, 119, 6];
        }
      }
    },
  });

  // Footer / Signatures
  const finalY = (doc as any).lastAutoTable?.finalY || 210;
  if (finalY < 250) {
    const sigY = Math.max(finalY + 18, 240);
    doc.setDrawColor(203, 213, 225);
    doc.line(20, sigY, 90, sigY);
    doc.line(120, sigY, 190, sigY);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Assinatura do Responsável', 55, sigY + 4, { align: 'center' });
    doc.text('Coordenação do Integral', 155, sigY + 4, { align: 'center' });
  }

  applyPageNumbersAndFooters(doc, 'portrait');
  doc.save(`Frequencia_${student.name.replace(/\s+/g, '_')}_${formatDate(startDate).replace(/\//g, '-')}_a_${formatDate(endDate).replace(/\//g, '-')}.pdf`);
}

// Backward-compatible wrapper for single week
export function generateStudentPDFReport(
  student: Student,
  week: WeekInfo,
  records: AttendanceRecord[]
) {
  generateStudentPeriodPDFReport({
    student,
    startDate: week.startDate,
    endDate: week.endDate,
    periodLabel: week.label,
    records,
  });
}

// ---------------------------------------------------------------------------
// 4. RELATÓRIO CONSOLIDADO DA TURMA (Filtro por Período / Data Inicial e Final)
// ---------------------------------------------------------------------------

export interface GenerateTurmaConsolidatedPeriodPDFOptions {
  turma: TurmaType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  periodLabel?: string;
  students: Student[];
  records: AttendanceRecord[];
}

export function generateTurmaConsolidatedPeriodPDFReport({
  turma,
  startDate,
  endDate,
  periodLabel,
  students,
  records,
}: GenerateTurmaConsolidatedPeriodPDFOptions) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const turmaStudents = students
    .filter((s) => s.turma === turma)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const studentIdsInTurma = new Set(turmaStudents.map((s) => s.id));

  const periodRecords = records.filter(
    (r) =>
      r.date >= startDate &&
      r.date <= endDate &&
      (r.turma === turma || studentIdsInTurma.has(r.studentId))
  );

  const total = periodRecords.length;
  const pres = periodRecords.filter((r) => r.status === 'presente').length;
  const saidaAnt = periodRecords.filter((r) => r.status === 'saida_antecipada').length;
  const falta = periodRecords.filter((r) => r.status === 'falta').length;
  const saude = periodRecords.filter((r) => r.status === 'saude').length;
  const semEquip = periodRecords.filter((r) => r.status === 'sem_equipamento').length;
  const rate = total > 0 ? Math.round(((pres + saidaAnt) / total) * 100) : 100;

  // Header
  drawOfficialHeader(
    doc,
    `Relatório Consolidado - ${turma}`,
    'Matriz de Frequência e Indicadores Gerais da Turma',
    [`Turma: ${turma}`, `Período: ${formatDate(startDate)} a ${formatDate(endDate)}`],
    'portrait'
  );

  // Turma Overview Box
  let startY = 38;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, 182, 26, 2.5, 2.5, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Turma / Ano Escolar: ${turma}`, 18, startY + 7);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Total de Alunos Matriculados: ${turmaStudents.length}`, 18, startY + 14);
  doc.text(`Total de Registros de Chamada no Período: ${total}`, 18, startY + 20);

  // Rate Badge
  doc.setFillColor(238, 242, 255);
  doc.setDrawColor(199, 210, 254);
  doc.roundedRect(140, startY + 3, 50, 20, 2, 2, 'FD');

  doc.setTextColor(67, 56, 202);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('MÉDIA DE PRESENÇA', 165, startY + 8.5, { align: 'center' });
  doc.setFontSize(12);
  doc.text(`${rate}%`, 165, startY + 17.5, { align: 'center' });

  startY += 32;

  // Metrics
  const metrics = [
    { label: 'Presenças', value: pres, color: [22, 163, 74] as [number, number, number] },
    { label: 'Saída Ant.', value: saidaAnt, color: [217, 119, 6] as [number, number, number] },
    { label: 'Faltas', value: falta, color: [220, 38, 38] as [number, number, number] },
    { label: 'Saúde', value: saude, color: [217, 119, 6] as [number, number, number] },
    { label: 'Sem Equip.', value: semEquip, color: [234, 88, 12] as [number, number, number] },
  ];
  drawMetricBoxes(doc, 14, startY, 34, 14, 3, metrics);

  startY += 19;

  // Table Data
  const tableData = turmaStudents.map((st) => {
    const stRecords = periodRecords.filter((r) => r.studentId === st.id);
    const stTotal = stRecords.length;
    const stPres = stRecords.filter((r) => r.status === 'presente').length;
    const stSaidaAnt = stRecords.filter((r) => r.status === 'saida_antecipada').length;
    const stFalta = stRecords.filter((r) => r.status === 'falta').length;
    const stSaude = stRecords.filter((r) => r.status === 'saude').length;
    const stEquip = stRecords.filter((r) => r.status === 'sem_equipamento').length;
    const stRate = stTotal > 0 ? Math.round(((stPres + stSaidaAnt) / stTotal) * 100) : '-';

    const occurrences = stRecords
      .filter((r) => r.status !== 'presente')
      .map((r) => {
        const text =
          r.status === 'saida_antecipada'
            ? `Saída ${r.exitTime || 's/h'}`
            : getStatusText(r.status);
        return `${formatDate(r.date).slice(0, 5)} ${r.activity}: ${text}${
          r.equipmentMissingDetails ? ` (${r.equipmentMissingDetails})` : ''
        }`;
      })
      .join('; ');

    return [
      st.name,
      stTotal > 0 ? `${stPres + stSaidaAnt}/${stTotal}` : '0',
      stRate === '-' ? '100%' : `${stRate}%`,
      stSaidaAnt > 0 ? String(stSaidaAnt) : '0',
      stEquip > 0 ? String(stEquip) : '0',
      stFalta > 0 ? String(stFalta) : '0',
      occurrences || 'Sem ocorrências',
    ];
  });

  autoTable(doc, {
    startY: startY,
    head: [['Aluno(a)', 'Presença', 'Taxa', 'Saída Ant.', 'Sem Equip.', 'Faltas', 'Resumo de Ocorrências no Período']],
    body: tableData.length > 0 ? tableData : [['Sem alunos matriculados nesta turma', '-', '-', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [51, 65, 85],
      cellPadding: 2.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 'auto' },
    },
  });

  // Signatures
  const finalY = (doc as any).lastAutoTable?.finalY || 210;
  if (finalY < 250) {
    const sigY = Math.max(finalY + 18, 240);
    doc.setDrawColor(203, 213, 225);
    doc.line(20, sigY, 90, sigY);
    doc.line(120, sigY, 190, sigY);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Professor(a) / Monitor(a) da Turma', 55, sigY + 4, { align: 'center' });
    doc.text('Coordenação do Programa Integral', 155, sigY + 4, { align: 'center' });
  }

  applyPageNumbersAndFooters(doc, 'portrait');
  doc.save(`Consolidado_Turma_${turma.replace(/[\/\s]+/g, '_')}_${formatDate(startDate).replace(/\//g, '-')}_a_${formatDate(endDate).replace(/\//g, '-')}.pdf`);
}

// Backward-compatible wrapper for single week
export function generateTurmaPDFReport(
  turma: TurmaType,
  week: WeekInfo,
  students: Student[],
  records: AttendanceRecord[]
) {
  generateTurmaConsolidatedPeriodPDFReport({
    turma,
    startDate: week.startDate,
    endDate: week.endDate,
    periodLabel: week.label,
    students,
    records,
  });
}

// ---------------------------------------------------------------------------
// 5. RELATÓRIO POR MODALIDADE / OFICINA (Para Professores Especialistas)
// ---------------------------------------------------------------------------

export interface GenerateActivityModalityPeriodPDFOptions {
  activityName: ActivityType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  periodLabel?: string;
  students: Student[];
  records: AttendanceRecord[];
  teacherName?: string;
}

export function generateActivityModalityPeriodPDFReport({
  activityName,
  startDate,
  endDate,
  periodLabel,
  students,
  records,
  teacherName,
}: GenerateActivityModalityPeriodPDFOptions) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Students enrolled in this activity
  const enrolledStudents = students
    .filter((s) => s.activities && s.activities.includes(activityName))
    .sort((a, b) => {
      const turmaComp = (a.turma || '').localeCompare(b.turma || '', 'pt-BR', { numeric: true });
      if (turmaComp !== 0) return turmaComp;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

  const enrolledStudentIds = new Set(enrolledStudents.map((s) => s.id));

  // Records for this activity in this date range
  const activityRecords = records.filter(
    (r) => r.activity === activityName && r.date >= startDate && r.date <= endDate
  );

  const total = activityRecords.length;
  const pres = activityRecords.filter((r) => r.status === 'presente').length;
  const saidaAnt = activityRecords.filter((r) => r.status === 'saida_antecipada').length;
  const falta = activityRecords.filter((r) => r.status === 'falta').length;
  const saude = activityRecords.filter((r) => r.status === 'saude').length;
  const semEquip = activityRecords.filter((r) => r.status === 'sem_equipamento').length;
  const rate = total > 0 ? Math.round(((pres + saidaAnt) / total) * 100) : 100;

  // Header
  drawOfficialHeader(
    doc,
    `Relatório de Oficina - ${activityName}`,
    'Lista de Frequência e Acompanhamento do Professor Especialista',
    [`Modalidade: ${activityName}`, `Período: ${formatDate(startDate)} a ${formatDate(endDate)}`],
    'portrait'
  );

  // Overview Card
  let startY = 38;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, 182, 26, 2.5, 2.5, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Oficina / Modalidade: ${activityName}`, 18, startY + 7);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Professor(a) Especialista: ${teacherName || 'Docente Responsável'}`, 18, startY + 14);
  doc.text(`Total de Alunos Matriculados: ${enrolledStudents.length}  •  Chamadas Realizadas: ${total}`, 18, startY + 20);

  // Taxa de Presença Badge
  doc.setFillColor(238, 242, 255);
  doc.setDrawColor(199, 210, 254);
  doc.roundedRect(140, startY + 3, 50, 20, 2, 2, 'FD');

  doc.setTextColor(67, 56, 202);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('TAXA DE PRESENÇA', 165, startY + 8.5, { align: 'center' });
  doc.setFontSize(12);
  doc.text(`${rate}%`, 165, startY + 17.5, { align: 'center' });

  startY += 32;

  // Metrics
  const metrics = [
    { label: 'Presenças', value: pres, color: [22, 163, 74] as [number, number, number] },
    { label: 'Saída Ant.', value: saidaAnt, color: [217, 119, 6] as [number, number, number] },
    { label: 'Faltas', value: falta, color: [220, 38, 38] as [number, number, number] },
    { label: 'Saúde', value: saude, color: [217, 119, 6] as [number, number, number] },
    { label: 'Sem Equip.', value: semEquip, color: [234, 88, 12] as [number, number, number] },
  ];
  drawMetricBoxes(doc, 14, startY, 34, 14, 3, metrics);

  startY += 19;

  // Table Data: Enrolled students & their performance in this modality
  const tableData = enrolledStudents.map((st) => {
    const stRecords = activityRecords.filter((r) => r.studentId === st.id);
    const stTotal = stRecords.length;
    const stPres = stRecords.filter((r) => r.status === 'presente').length;
    const stSaidaAnt = stRecords.filter((r) => r.status === 'saida_antecipada').length;
    const stFalta = stRecords.filter((r) => r.status === 'falta').length;
    const stSaude = stRecords.filter((r) => r.status === 'saude').length;
    const stEquip = stRecords.filter((r) => r.status === 'sem_equipamento').length;
    const stRate = stTotal > 0 ? Math.round(((stPres + stSaidaAnt) / stTotal) * 100) : '-';

    const occurrences = stRecords
      .filter((r) => r.status !== 'presente')
      .map((r) => {
        const text =
          r.status === 'saida_antecipada'
            ? `Saída às ${r.exitTime || 's/h'}`
            : getStatusText(r.status);
        return `${formatDate(r.date).slice(0, 5)}: ${text}${
          r.equipmentMissingDetails ? ` (${r.equipmentMissingDetails})` : ''
        }`;
      })
      .join('; ');

    return [
      st.name,
      st.turma,
      stTotal > 0 ? `${stPres + stSaidaAnt}/${stTotal}` : '0',
      stRate === '-' ? '100%' : `${stRate}%`,
      stSaidaAnt > 0 ? String(stSaidaAnt) : '0',
      stEquip > 0 ? String(stEquip) : '0',
      stFalta > 0 ? String(stFalta) : '0',
      occurrences || 'Sem ocorrências',
    ];
  });

  autoTable(doc, {
    startY: startY,
    head: [['Aluno(a)', 'Turma', 'Presença', 'Taxa', 'Saída Ant.', 'Sem Equip.', 'Faltas', 'Ocorrências / Materiais']],
    body: tableData.length > 0 ? tableData : [['Sem alunos matriculados nesta modalidade', '-', '-', '-', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [51, 65, 85],
      cellPadding: 2.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { cellWidth: 24 },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 16, halign: 'center' },
      6: { cellWidth: 14, halign: 'center' },
      7: { cellWidth: 'auto' },
    },
  });

  // Signatures
  const finalY = (doc as any).lastAutoTable?.finalY || 210;
  if (finalY < 250) {
    const sigY = Math.max(finalY + 18, 240);
    doc.setDrawColor(203, 213, 225);
    doc.line(20, sigY, 90, sigY);
    doc.line(120, sigY, 190, sigY);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Professor(a) Especialista (${activityName})`, 55, sigY + 4, { align: 'center' });
    doc.text('Coordenação do Programa Integral', 155, sigY + 4, { align: 'center' });
  }

  applyPageNumbersAndFooters(doc, 'portrait');
  doc.save(`Oficina_${activityName.replace(/[\/\s]+/g, '_')}_${formatDate(startDate).replace(/\//g, '-')}_a_${formatDate(endDate).replace(/\//g, '-')}.pdf`);
}
