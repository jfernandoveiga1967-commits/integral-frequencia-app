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
  PontoRecord,
  PontoMonthClosing,
  HolidayItem,
} from '../types';
import { formatDateBR, getDayOfWeekLabel, isStudentScheduledForDate, getEffectiveSchoolDays } from './dateUtils';
import { getPeriodConsolidatedMetrics } from './frequenciaUtils';
import { sortTurmasPedagogical } from './turmaUtils';
import { processMarkdownAndIconsForPDF } from './markdownUtils';
import { getLogoDataUrl, LOGO_BASE64, LOGO_WIDTH_MM, LOGO_HEIGHT_MM } from './pdfLogo';
import {
  formatCurrencyBR,
  getMonthNameBR,
  formatMinutesToHoursAndMinutes,
  calculateDayWorkedMinutes,
  numberToWordsBRL,
  calculateMonthlyPontoFinancials,
  isContinuousShift,
} from './pontoUtils';

export interface PDFGenerationResult {
  doc: jsPDF;
  blob: Blob;
  blobUrl: string;
  dataUri: string;
  dataUrl: string;
  filename: string;
  download: () => void;
}

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

  // Logo image on the left (width: 35mm, height: ~17.6mm, preserving 1.99:1 proportion)
  let logoDrawn = false;
  const logoData = getLogoDataUrl() || LOGO_BASE64;
  if (logoData) {
    try {
      // White rounded background card for optimal clarity and crisp contrast of the official logo
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(12, 5, 38, 22, 2, 2, 'F');

      // Draw official school logo image
      doc.addImage(logoData, 'PNG', 13.5, 6.7, LOGO_WIDTH_MM, LOGO_HEIGHT_MM);
      logoDrawn = true;
    } catch (e) {
      console.warn('Could not add logo image to PDF:', e);
      logoDrawn = false;
    }
  }

  const textStartX = logoDrawn ? 54 : 14;

  // Brand Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(244, 63, 94); // rose-500 badge look
  doc.text('INSTITUTO EDUCACIONAL CRESCER • PROGRAMA INTEGRAL', textStartX, 10.5);

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  const titleY = subtitle && subtitle.trim().length > 0 ? 18 : 20.5;
  doc.text(title.toUpperCase(), textStartX, titleY);

  // Subtitle / Description
  if (subtitle && subtitle.trim().length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(191, 219, 254); // blue-200
    doc.text(subtitle, textStartX, 25);
  }

  // Right Side: Emission Date and Filters
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(`Emissão: ${getCurrentDateTimeString()}`, pageWidth - 14, 10.5, { align: 'right' });

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
 * Compact Official Header for 1-Page Documents (Espelho de Ponto & Recibo de Bolsa)
 */
function drawCompactOfficialHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  filterDetails: string[],
  orientation: 'portrait' | 'landscape' = 'portrait'
) {
  const pageWidth = orientation === 'landscape' ? 297 : 210;

  // Header Banner Background (Height 20mm)
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 20, 'F');

  // Accent line
  doc.setFillColor(79, 70, 229); // indigo-600
  doc.rect(0, 0, pageWidth, 2.5, 'F');

  // Logo
  let logoDrawn = false;
  const logoData = getLogoDataUrl() || LOGO_BASE64;
  if (logoData) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(12, 4, 28, 13.5, 1.5, 1.5, 'F');
      doc.addImage(logoData, 'PNG', 13, 4.8, 26, 11.8);
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }

  const textStartX = logoDrawn ? 43 : 14;

  // Brand Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(244, 63, 94); // rose-500 badge look
  doc.text('INSTITUTO EDUCACIONAL CRESCER • PROGRAMA INTEGRAL', textStartX, 7.5);

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), textStartX, 13);

  // Subtitle
  if (subtitle && subtitle.trim().length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(191, 219, 254);
    doc.text(subtitle, textStartX, 17.5);
  }

  // Right Side: Emission & Details
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Emissão: ${getCurrentDateTimeString()}`, pageWidth - 14, 7.5, { align: 'right' });

  if (filterDetails.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(224, 231, 255);
    doc.text(filterDetails.join('  |  '), pageWidth - 14, 13, { align: 'right' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text('Documento Oficial de Registro Escolar', pageWidth - 14, 17.5, { align: 'right' });
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
    doc.line(14, pageHeight - 11, pageWidth - 14, pageHeight - 11);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // slate-400

    doc.text(
      'Instituto Educacional Crescer - Sistema de Gestão do Programa Integral',
      14,
      pageHeight - 6
    );

    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth - 14,
      pageHeight - 6,
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
    doc.text(m.label.toUpperCase(), x + 2.5, startY + 4.5);

    // Value - Auto-scale font size so text never overflows the box boundaries
    const textVal = String(m.value);
    let fontSize = 8.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    while (doc.getTextWidth(textVal) > (boxWidth - 4.5) && fontSize > 5.5) {
      fontSize -= 0.4;
      doc.setFontSize(fontSize);
    }
    doc.setFontSize(fontSize);
    doc.setTextColor(m.color[0], m.color[1], m.color[2]);
    doc.text(textVal, x + 2.5, startY + 10.5);
  });
}

// ---------------------------------------------------------------------------
// 1. GRADE HORÁRIA: GRADE SEMANAL DA TURMA / TODAS AS TURMAS (Tabela por Dias Selecionados)
// ---------------------------------------------------------------------------

export interface GenerateWeeklySchedulePDFOptions {
  turma: TurmaType | 'ALL';
  turmasList?: string[];
  schedules: ScheduleBlock[];
  activitiesList?: ActivityItem[];
  users?: UserProfile[];
  schoolYear?: number | string;
  selectedDays?: DayOfWeek[];
  saveImmediately?: boolean;
}

export function generateWeeklySchedulePDF({
  turma,
  turmasList = [],
  schedules,
  activitiesList = [],
  users = [],
  schoolYear = new Date().getFullYear(),
  selectedDays,
  saveImmediately = false,
}: GenerateWeeklySchedulePDFOptions): PDFGenerationResult {
  const isAll = turma === 'ALL';
  const targetTurmas = isAll
    ? sortTurmasPedagogical(turmasList.length > 0 ? turmasList : Array.from(new Set(schedules.map((s) => s.turma))))
    : [turma];

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const ALL_DAYS_ORDER: { id: DayOfWeek; label: string; short: string }[] = [
    { id: 'segunda', label: 'Segunda-feira', short: 'SEG' },
    { id: 'terca', label: 'Terça-feira', short: 'TER' },
    { id: 'quarta', label: 'Quarta-feira', short: 'QUA' },
    { id: 'quinta', label: 'Quinta-feira', short: 'QUI' },
    { id: 'sexta', label: 'Sexta-feira', short: 'SEX' },
  ];

  const DAYS_ORDER = selectedDays && selectedDays.length > 0
    ? ALL_DAYS_ORDER.filter((d) => selectedDays.includes(d.id))
    : ALL_DAYS_ORDER;

  const daysFilterLabel = DAYS_ORDER.length === 5 ? 'Segunda a Sexta' : DAYS_ORDER.map((d) => d.label).join(', ');
  const daysHeaderLabel = DAYS_ORDER.length === 5 ? 'Segunda a Sexta-feira' : DAYS_ORDER.map((d) => d.short).join(' • ');

  targetTurmas.forEach((currentTurma, index) => {
    if (index > 0) {
      doc.addPage('a4', 'landscape');
    }

    // Official Header Banner
    drawOfficialHeader(
      doc,
      isAll ? 'Grade Semanal Geral - Todas as Turmas' : 'Grade Horária da Turma',
      'Cronograma e Distribuição de Atividades do Integral',
      [`Turma: ${currentTurma}`, `Dias: ${daysFilterLabel}`, `Ano Letivo: ${schoolYear}`],
      'landscape'
    );

    let startY = 38;

    // Filter blocks for this turma and selected days
    const turmaBlocks = schedules.filter(
      (s) => s.turma === currentTurma && DAYS_ORDER.some((d) => d.id === s.dayOfWeek)
    );

    // Group blocks by day of week
    const dayBlocksMap: Record<DayOfWeek, ScheduleBlock[]> = {
      segunda: [],
      terca: [],
      quarta: [],
      quinta: [],
      sexta: [],
    };

    DAYS_ORDER.forEach((d) => {
      dayBlocksMap[d.id] = turmaBlocks
        .filter((s) => s.dayOfWeek === d.id)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
    });

    const totalFilteredBlocks = turmaBlocks.length;

    // Turma Summary Strip Card
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, startY, 269, 14, 2, 2, 'FD');

    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Turma: ${currentTurma}`, 18, startY + 5.5);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Total de Atividades nos Dias Selecionados: ${totalFilteredBlocks} horários (${DAYS_ORDER.length} ${DAYS_ORDER.length === 1 ? 'dia' : 'dias'})`,
      18,
      startY + 10
    );

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(79, 70, 229);
    doc.text(`Atendimento: ${daysHeaderLabel} • Turno Integral`, 269, startY + 7.5, { align: 'right' });

    startY += 16;

    const maxRows = Math.max(
      ...DAYS_ORDER.map((d) => dayBlocksMap[d.id]?.length || 0),
      1
    );

    const tableRows: string[][] = [];

    if (totalFilteredBlocks === 0) {
      tableRows.push(DAYS_ORDER.map(() => 'Sem horários cadastrados'));
    } else {
      for (let r = 0; r < maxRows; r++) {
        const rowCells = DAYS_ORDER.map((d) => {
          const block = dayBlocksMap[d.id]?.[r];
          if (!block) return '-';

          const lines: string[] = [];
          lines.push(`${block.startTime} às ${block.endTime}`);

          // Clean activity name from any [icon: ...] or markdown tags
          const cleanActivity = processMarkdownAndIconsForPDF(block.activityId);
          if (cleanActivity) {
            lines.push(cleanActivity.toUpperCase());
          }

          if (block.location && block.location.trim()) {
            const cleanLoc = processMarkdownAndIconsForPDF(block.location.trim());
            if (cleanLoc && cleanLoc !== '-' && !cleanLoc.toLowerCase().includes('sala / padrao') && !cleanLoc.toLowerCase().includes('sala / padrão')) {
              lines.push(`Sala: ${cleanLoc}`);
            }
          }

          // Docente/Teacher is intentionally omitted to keep schedule cells clean and flexible

          if (block.guidelines && block.guidelines.trim()) {
            const cleanGuidelines = processMarkdownAndIconsForPDF(block.guidelines.trim());
            if (cleanGuidelines && cleanGuidelines !== '-' && !cleanGuidelines.toLowerCase().includes('sem orientac') && !cleanGuidelines.toLowerCase().includes('sem orientaç')) {
              lines.push(`Obs: ${cleanGuidelines}`);
            }
          }

          return lines.join('\n');
        });
        tableRows.push(rowCells);
      }
    }

    const startPageForThisTurma = (doc as any).internal.getNumberOfPages();

    // Calculate dynamic column widths to fill 269mm evenly
    const colWidth = 269 / DAYS_ORDER.length;
    const dynamicColumnStyles: Record<number, { cellWidth: number }> = {};
    DAYS_ORDER.forEach((_, idx) => {
      dynamicColumnStyles[idx] = { cellWidth: colWidth };
    });

    autoTable(doc, {
      startY: startY,
      head: [DAYS_ORDER.map((d) => `${d.label.toUpperCase()} (${dayBlocksMap[d.id]?.length || 0})`)],
      body: tableRows,
      theme: 'grid',
      styles: {
        fontSize: DAYS_ORDER.length <= 3 ? 8 : 7.2,
        cellPadding: DAYS_ORDER.length <= 3 ? 3.5 : 2.5,
        valign: 'middle',
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [15, 23, 42], // slate-900
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: DAYS_ORDER.length <= 3 ? 8.5 : 8,
        halign: 'center',
      },
      bodyStyles: {
        textColor: [30, 41, 59],
        fontSize: DAYS_ORDER.length <= 3 ? 8 : 7.2,
        lineColor: [226, 232, 240],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: dynamicColumnStyles,
      margin: { top: 35, left: 14, right: 14, bottom: 22 },
      didDrawPage: () => {
        const currentDocPage = (doc as any).internal.getNumberOfPages();
        // Redraw header ONLY if autoTable created an additional page for this turma
        if (currentDocPage > startPageForThisTurma) {
          drawOfficialHeader(
            doc,
            isAll ? 'Grade Semanal Geral' : 'Grade Horária da Turma',
            'Cronograma e Distribuição de Atividades do Integral',
            [`Turma: ${currentTurma} (Cont.)`, `Dias: ${daysFilterLabel}`, `Ano Letivo: ${schoolYear}`],
            'landscape'
          );
        }
      },
    });

    // Signature line on this turma's page
    const finalY = (doc as any).lastAutoTable?.finalY || 145;
    if (finalY <= 170) {
      const sigY = Math.max(finalY + 10, 168);
      doc.setDrawColor(203, 213, 225);
      doc.line(30, sigY, 110, sigY);
      doc.line(180, sigY, 260, sigY);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Monitora / Docente da Turma', 70, sigY + 4, { align: 'center' });
      doc.text('Coordenação Pedagógica do Integral', 220, sigY + 4, { align: 'center' });
    } else if (finalY <= 186) {
      const sigY = finalY + 6;
      doc.setDrawColor(203, 213, 225);
      doc.line(30, sigY, 110, sigY);
      doc.line(180, sigY, 260, sigY);

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Monitora / Docente da Turma', 70, sigY + 3.5, { align: 'center' });
      doc.text('Coordenação Pedagógica do Integral', 220, sigY + 3.5, { align: 'center' });
    }
  });

  applyPageNumbersAndFooters(doc, 'landscape');
  
  const daysSuffix = DAYS_ORDER.length === 5 ? 'Seg_a_Sex' : DAYS_ORDER.map((d) => d.short).join('_');
  const filename = isAll
    ? `Grade_Semanal_Geral_Todas_as_Turmas_${daysSuffix}_${schoolYear}.pdf`
    : `Grade_${turma.replace(/[\/\s]+/g, '_')}_${daysSuffix}_${schoolYear}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  const dataUrl = dataUri;
  const download = () => doc.save(filename);

  if (saveImmediately) {
    doc.save(filename);
  }

  return { doc, blob, blobUrl, dataUri, dataUrl, filename, download };
}

export interface GenerateAllTurmasWeeklySchedulePDFOptions {
  turmasList: string[];
  schedules: ScheduleBlock[];
  activitiesList?: ActivityItem[];
  users?: UserProfile[];
  schoolYear?: number | string;
  selectedDays?: DayOfWeek[];
  saveImmediately?: boolean;
}

export function generateAllTurmasWeeklySchedulePDF({
  turmasList,
  schedules,
  activitiesList,
  users,
  schoolYear = new Date().getFullYear(),
  selectedDays,
  saveImmediately = false,
}: GenerateAllTurmasWeeklySchedulePDFOptions): PDFGenerationResult {
  return generateWeeklySchedulePDF({
    turma: 'ALL',
    turmasList,
    schedules,
    activitiesList,
    users,
    schoolYear,
    selectedDays,
    saveImmediately,
  });
}

// ---------------------------------------------------------------------------
// 2. GRADE HORÁRIA: ROTINA DIÁRIA DA TURMA (Cronograma detalhado do dia)
// ---------------------------------------------------------------------------

export interface GenerateDailyRoutinePDFOptions {
  turma: TurmaType;
  dayOfWeek?: DayOfWeek;
  selectedDays?: DayOfWeek[];
  schedules: ScheduleBlock[];
  activitiesList?: ActivityItem[];
  schoolYear?: number | string;
  saveImmediately?: boolean;
}

export function generateDailyRoutinePDF({
  turma,
  dayOfWeek,
  selectedDays,
  schedules,
  schoolYear = new Date().getFullYear(),
  saveImmediately = false,
}: GenerateDailyRoutinePDFOptions): PDFGenerationResult {
  const targetDays: DayOfWeek[] = selectedDays && selectedDays.length > 0
    ? selectedDays
    : [dayOfWeek || 'segunda'];

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  targetDays.forEach((currentDay, index) => {
    if (index > 0) {
      doc.addPage('a4', 'portrait');
    }

    const dayLabel = getDayOfWeekLabel(currentDay);
    const dayBlocks = schedules
      .filter((s) => s.turma === turma && s.dayOfWeek === currentDay)
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
    const tableData = dayBlocks.map((b) => {
      const cleanActivity = processMarkdownAndIconsForPDF(b.activityId);
      const rawLoc = b.location?.trim();
      const cleanLoc = rawLoc ? processMarkdownAndIconsForPDF(rawLoc) : '';
      const rawGuide = b.guidelines?.trim();
      const cleanGuide = rawGuide ? processMarkdownAndIconsForPDF(rawGuide) : '';

      return [
        `${b.startTime} - ${b.endTime}`,
        cleanActivity,
        cleanLoc || '-',
        cleanGuide || '-',
      ];
    });

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
  });

  applyPageNumbersAndFooters(doc, 'portrait');
  const daysSuffix = targetDays.length === 1 ? targetDays[0] : targetDays.map((d) => d.substring(0, 3)).join('_');
  const filename = `Rotina_${turma.replace(/[\/\s]+/g, '_')}_${daysSuffix}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  const dataUrl = dataUri;
  const download = () => doc.save(filename);

  if (saveImmediately) {
    doc.save(filename);
  }

  return { doc, blob, blobUrl, dataUri, dataUrl, filename, download };
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
  saveImmediately?: boolean;
}

export function generateActivitySchedulePDF({
  activityName,
  schedules,
  activitiesList = [],
  users = [],
  schoolYear = new Date().getFullYear(),
  teacherName,
  saveImmediately = false,
}: GenerateActivitySchedulePDFOptions): PDFGenerationResult {
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
    const rawLoc = b.location?.trim();
    const location = rawLoc ? processMarkdownAndIconsForPDF(rawLoc) : '-';
    
    // Resolve teacher for this specific block or fallback to general specialist
    const blockTeacher = processMarkdownAndIconsForPDF(resolvedTeacher || 'Docente Responsável');

    const rawGuide = b.guidelines?.trim() || activityMeta?.defaultEquipment?.trim();
    const guidelines = rawGuide ? processMarkdownAndIconsForPDF(rawGuide) : '-';

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
  const filename = `Grade_Horarios_${activityName.replace(/[\/\s]+/g, '_')}_${schoolYear}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  const dataUrl = dataUri;
  const download = () => doc.save(filename);

  if (saveImmediately) {
    doc.save(filename);
  }

  return { doc, blob, blobUrl, dataUri, dataUrl, filename, download };
}

// ---------------------------------------------------------------------------
// 3. RELATÓRIO INDIVIDUAL DO ALUNO (Filtro por Período / Data Inicial e Final)
// ---------------------------------------------------------------------------

export interface GenerateStudentPeriodPDFOptions {
  student: Student;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  periodLabel?: string;
  records: AttendanceRecord[];
  saveImmediately?: boolean;
}

export function generateStudentPeriodPDFReport({
  student,
  startDate,
  endDate,
  periodLabel,
  records,
  saveImmediately = false,
}: GenerateStudentPeriodPDFOptions): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const studentRecords = records
    .filter((r) => r.studentId === student.id && r.date >= startDate && r.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const routineRecords = studentRecords.filter(
    (r) => r.activity === 'Rotina' || (r.activity && r.activity.trim().toLowerCase() === 'rotina')
  );

  const baseRecords = routineRecords.length > 0 ? routineRecords : studentRecords;

  const total = baseRecords.length;
  const pres = baseRecords.filter((r) => r.status === 'presente').length;
  const saidaAnt = baseRecords.filter((r) => r.status === 'saida_antecipada').length;
  const falta = baseRecords.filter((r) => r.status === 'falta').length;
  const saude = baseRecords.filter((r) => r.status === 'saude').length;
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
    r.activity || 'Rotina',
    getStatusText(r.status),
    '-',
    r.exitTime || '-',
    r.equipmentMissingDetails
      ? `Sem Material: ${r.equipmentMissingDetails}`
      : r.observation || '-',
  ]);

  autoTable(doc, {
    startY: startY,
    head: [['Data', 'Atividade / Oficina', 'Status', 'Entrada', 'Saída', 'Observações / Ocorrências']],
    body: tableData.length > 0 ? tableData : [['Nenhum registro no período', '-', '-', '-', '-', '-']],
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
      0: { cellWidth: 20, fontStyle: 'bold', halign: 'center' },
      1: { cellWidth: 32 },
      2: { cellWidth: 28 },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        const row = studentRecords[data.row.index];
        if (row) {
          data.cell.styles.textColor = getStatusColor(row.status);
          data.cell.styles.fontStyle = 'bold';
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
  const filename = `Frequencia_${student.name.replace(/\s+/g, '_')}_${formatDate(startDate).replace(/\//g, '-')}_a_${formatDate(endDate).replace(/\//g, '-')}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  const dataUrl = dataUri;
  const download = () => doc.save(filename);

  if (saveImmediately) {
    doc.save(filename);
  }

  return { doc, blob, blobUrl, dataUri, dataUrl, filename, download };
}

// Backward-compatible wrapper for single week
export function generateStudentPDFReport(
  student: Student,
  week: WeekInfo,
  records: AttendanceRecord[]
): PDFGenerationResult {
  return generateStudentPeriodPDFReport({
    student,
    startDate: week.startDate,
    endDate: week.endDate,
    periodLabel: week.label,
    records,
    saveImmediately: false,
  });
}

// ---------------------------------------------------------------------------
// 4. RELATÓRIO CONSOLIDADO POR TURMA (Filtro por Período / Data Inicial e Final)
// ---------------------------------------------------------------------------

export interface GenerateTurmaConsolidatedPeriodPDFOptions {
  turma: TurmaType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  periodLabel?: string;
  students: Student[];
  records: AttendanceRecord[];
  saveImmediately?: boolean;
}

export function generateTurmaConsolidatedPeriodPDFReport({
  turma,
  startDate,
  endDate,
  periodLabel,
  students,
  records,
  saveImmediately = false,
}: GenerateTurmaConsolidatedPeriodPDFOptions): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const turmaStudents = students
    .filter((s) => s.turma === turma)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const turmaRecords = records.filter(
    (r) => r.turma === turma && r.date >= startDate && r.date <= endDate
  );

  const total = turmaRecords.length;
  const pres = turmaRecords.filter((r) => r.status === 'presente').length;
  const saidaAnt = turmaRecords.filter((r) => r.status === 'saida_antecipada').length;
  const falta = turmaRecords.filter((r) => r.status === 'falta').length;
  const saude = turmaRecords.filter((r) => r.status === 'saude').length;
  const semEquip = turmaRecords.filter((r) => r.status === 'sem_equipamento').length;
  const rate = total > 0 ? Math.round(((pres + saidaAnt) / total) * 100) : 100;

  // Header
  drawOfficialHeader(
    doc,
    `Relatório Consolidado - ${turma}`,
    'Acompanhamento Geral de Frequência da Turma',
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
  doc.text(`Turma: ${turma}`, 18, startY + 7);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Total de Alunos Matriculados: ${turmaStudents.length}`, 18, startY + 14);
  doc.text(`Total de Chamadas Realizadas no Período: ${total}`, 18, startY + 20);

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

  // Table Data: Students & Individual Rates in the Period
  const tableData = turmaStudents.map((st) => {
    const stRecords = turmaRecords.filter((r) => r.studentId === st.id);
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
    head: [['Aluno(a)', 'Presença', 'Taxa', 'Saída Ant.', 'Sem Equip.', 'Faltas', 'Ocorrências no Período']],
    body: tableData.length > 0 ? tableData : [['Nenhum aluno cadastrado nesta turma', '-', '-', '-', '-', '-', '-']],
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
  const filename = `Consolidado_Turma_${turma.replace(/[\/\s]+/g, '_')}_${formatDate(startDate).replace(/\//g, '-')}_a_${formatDate(endDate).replace(/\//g, '-')}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  const dataUrl = dataUri;
  const download = () => doc.save(filename);

  if (saveImmediately) {
    doc.save(filename);
  }

  return { doc, blob, blobUrl, dataUri, dataUrl, filename, download };
}

// Backward-compatible wrapper for single week
export function generateTurmaPDFReport(
  turma: TurmaType,
  week: WeekInfo,
  students: Student[],
  records: AttendanceRecord[]
): PDFGenerationResult {
  return generateTurmaConsolidatedPeriodPDFReport({
    turma,
    startDate: week.startDate,
    endDate: week.endDate,
    periodLabel: week.label,
    students,
    records,
    saveImmediately: false,
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
  saveImmediately?: boolean;
}

export function generateActivityModalityPeriodPDFReport({
  activityName,
  startDate,
  endDate,
  periodLabel,
  students,
  records,
  teacherName,
  saveImmediately = false,
}: GenerateActivityModalityPeriodPDFOptions): PDFGenerationResult {
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
  const filename = `Oficina_${activityName.replace(/[\/\s]+/g, '_')}_${formatDate(startDate).replace(/\//g, '-')}_a_${formatDate(endDate).replace(/\//g, '-')}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  const dataUrl = dataUri;
  const download = () => doc.save(filename);

  if (saveImmediately) {
    doc.save(filename);
  }

  return { doc, blob, blobUrl, dataUri, dataUrl, filename, download };
}

/**
 * Generates an Official Livro Ponto & Timesheet PDF Report (Folha de Frequência & Fechamento Financeiro)
 */
export interface GenerateLivroPontoPDFOptions {
  user: UserProfile | null;
  month: number; // 1 to 12
  year: number;
  monthDaysGrid: Array<{
    dayNumber: number;
    dateStr: string;
    dayOfWeekLabel?: string;
    dayOfWeekName?: string;
    dayOfWeekShort?: string;
    isWeekend?: boolean;
    isWk?: boolean;
    isSat?: boolean;
    isSun?: boolean;
    defaultStatus?: string;
    holidayRecessName?: string;
    holidayItem?: HolidayItem;
    record?: PontoRecord;
  }>;
  financials: {
    baseSalary: number;
    paidHolidaysCount: number;
    paidRecessDaysCount: number;
    unjustifiedAbsencesCount: number;
    unjustifiedAbsencesDiscount: number;
    totalExtraMinutes: number;
    extraHoursAmount: number;
    manualAddition: number;
    manualAdditionNote?: string;
    manualDiscount: number;
    manualDiscountNote?: string;
    netTotal: number;
  };
  closingRecord?: PontoMonthClosing | null;
  companyName?: string;
  institutionName?: string;
  pixKey?: string;
  contractSchedule?: string;
  contractDailyHoursFormatted?: string;
  saveImmediately?: boolean;
}

export function generateLivroPontoPDFReport({
  user,
  month,
  year,
  monthDaysGrid,
  financials,
  closingRecord,
  companyName = 'GADAL - Gestão e Apoio',
  institutionName = 'Instituto Educacional Crescer',
  pixKey = 'Pendente',
  contractSchedule = '11:40 - 17:40',
  contractDailyHoursFormatted = '6h 00min',
  saveImmediately = false,
}: GenerateLivroPontoPDFOptions): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const monthName = getMonthNameBR(month);
  const userName = user?.name || closingRecord?.userName || 'Colaborador';
  const userCargo = user?.cargoLabel || closingRecord?.userCargo || 'Estagiária / Monitora';

  // 1. Compact Header (Height: 20mm) - Guarantee 1 single page
  drawCompactOfficialHeader(
    doc,
    'ESPELHO DE PONTO',
    '',
    [`Colaborador(a): ${userName}`, `Competência: ${monthName}/${year}`],
    'portrait'
  );

  let startY = 23;

  // 2. Collaborator & Contract Details Card (Height: 11mm)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, startY, 182, 11, 1.5, 1.5, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`Colaborador(a): ${userName.toUpperCase()} (${userCargo})   |   Competência: ${monthName}/${year}`, 17, startY + 4.2);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Empresa: ${companyName}   |   Jornada: ${contractSchedule} (${contractDailyHoursFormatted})   |   PIX: ${pixKey}   |   Status: ${
      closingRecord?.isClosed ? 'FECHADO / PAGO' : 'ABERTO'
    }`,
    17,
    startY + 8.5
  );

  startY += 13;

  // 3. Financial & Performance Summary Metrics (Height: 8.5mm)
  const metrics = [
    { label: 'Bolsa Base', value: formatCurrencyBR(financials.baseSalary), color: [15, 23, 42] as [number, number, number] },
    {
      label: 'Feriados/Recessos',
      value: `${financials.paidHolidaysCount + financials.paidRecessDaysCount} dias`,
      color: [22, 163, 74] as [number, number, number],
    },
    {
      label: 'Faltas Injust.',
      value: `${financials.unjustifiedAbsencesCount} (${formatCurrencyBR(-financials.unjustifiedAbsencesDiscount)})`,
      color: [220, 38, 38] as [number, number, number],
    },
    {
      label: 'Horas Extras',
      value: `${formatMinutesToHoursAndMinutes(financials.totalExtraMinutes)} (${formatCurrencyBR(financials.extraHoursAmount)})`,
      color: [79, 70, 229] as [number, number, number],
    },
    {
      label: 'Líquido a Pagar',
      value: formatCurrencyBR(financials.netTotal),
      color: [16, 185, 129] as [number, number, number],
    },
  ];
  drawMetricBoxes(doc, 14, startY, 34, 8.5, 3, metrics);

  startY += 10.5;

  // Check if target user has a continuous 6h shift
  const isContinuous = isContinuousShift(
    closingRecord?.workShiftType ? { ...user, workShiftType: closingRecord.workShiftType } : user,
    contractSchedule
  );

  // 4. Timesheet Table Data (Compact cell padding to ensure 100% single page)
  const tableData = monthDaysGrid.map((item) => {
    const rec = item.record;
    const status = rec?.status || item.defaultStatus || 'normal';
    const holidayName = item.holidayItem?.name || item.holidayRecessName || '';

    let statusText = 'Normal';
    if (status === 'feriado') {
      statusText = holidayName ? `Feriado (${holidayName})` : 'Feriado Oficial';
    } else if (status === 'recesso') {
      statusText = holidayName ? `Recesso (${holidayName})` : 'Recesso Escolar';
    } else if (status === 'falta_injustificada') {
      statusText = 'FALTA INJUSTIFICADA';
    } else if (status === 'falta_justificada' || status === 'atestado') {
      statusText = status === 'atestado' ? 'Atestado Médico' : 'Falta Justificada';
    } else if (item.isSun) {
      statusText = 'Domingo / DSR';
    } else if (item.isSat) {
      statusText = 'Sábado';
    } else if (status === 'dispensado') {
      statusText = 'Dispensado(a)';
    }

    let workedHoursStr = '-';
    if (status === 'normal' && (rec?.entry1 || rec?.entry2)) {
      const dayCalc = calculateDayWorkedMinutes(rec, contractSchedule, 5);
      workedHoursStr = formatMinutesToHoursAndMinutes(dayCalc.workedMinutes);
    } else if (status === 'feriado' || status === 'recesso') {
      workedHoursStr = contractDailyHoursFormatted;
    } else if (status === 'falta_injustificada') {
      workedHoursStr = '0h00min';
    }

    const dayStr = String(item.dayNumber).padStart(2, '0');
    const dayLabel = item.dayOfWeekLabel || item.dayOfWeekName || item.dayOfWeekShort || '';
    const dayName = dayLabel.split('-')[0];

    if (isContinuous) {
      return [
        dayStr,
        dayName,
        rec?.entry1 || '-',
        rec?.exit2 || rec?.exit1 || '-',
        workedHoursStr,
        statusText,
        rec?.note || holidayName || '-',
      ];
    }

    return [
      dayStr,
      dayName,
      rec?.entry1 || '-',
      rec?.exit1 || '-',
      rec?.entry2 || '-',
      rec?.exit2 || '-',
      workedHoursStr,
      statusText,
      rec?.note || holidayName || '-',
    ];
  });

  const tableHead = isContinuous
    ? [['Dia', 'Sem.', 'Entrada', 'Saída', 'Horas', 'Status / Ocorrência', 'Observações']]
    : [['Dia', 'Sem.', 'Entrada 1', 'Saída 1', 'Entrada 2', 'Saída 2', 'Horas', 'Status / Ocorrência', 'Observações']];

  const columnStyles = isContinuous
    ? {
        0: { cellWidth: 8, halign: 'center' as const, fontStyle: 'bold' as const },
        1: { cellWidth: 15, halign: 'left' as const },
        2: { cellWidth: 18, halign: 'center' as const },
        3: { cellWidth: 18, halign: 'center' as const },
        4: { cellWidth: 16, halign: 'center' as const, fontStyle: 'bold' as const },
        5: { cellWidth: 46, halign: 'left' as const },
        6: { cellWidth: 'auto' as const, halign: 'left' as const },
      }
    : {
        0: { cellWidth: 8, halign: 'center' as const, fontStyle: 'bold' as const },
        1: { cellWidth: 15, halign: 'left' as const },
        2: { cellWidth: 14, halign: 'center' as const },
        3: { cellWidth: 14, halign: 'center' as const },
        4: { cellWidth: 14, halign: 'center' as const },
        5: { cellWidth: 14, halign: 'center' as const },
        6: { cellWidth: 16, halign: 'center' as const, fontStyle: 'bold' as const },
        7: { cellWidth: 42, halign: 'left' as const },
        8: { cellWidth: 'auto' as const, halign: 'left' as const },
      };

  autoTable(doc, {
    startY: startY,
    head: tableHead,
    body: tableData,
    theme: 'grid',
    pageBreak: 'avoid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.5,
      cellPadding: 0.65,
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 5.8,
      textColor: [51, 65, 85],
      cellPadding: 0.55,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: columnStyles,
    didParseCell: (data) => {
      if (data.section === 'body') {
        const rawRow = monthDaysGrid[data.row.index];
        if (rawRow) {
          const status = rawRow.record?.status || rawRow.defaultStatus;
          if (status === 'falta_injustificada') {
            data.cell.styles.fillColor = [254, 226, 226]; // light red
            data.cell.styles.textColor = [153, 27, 27];
            data.cell.styles.fontStyle = 'bold';
          } else if (status === 'feriado' || status === 'recesso') {
            data.cell.styles.fillColor = [236, 253, 245]; // light green
            data.cell.styles.textColor = [6, 95, 70];
          } else if (rawRow.isWeekend) {
            data.cell.styles.fillColor = [241, 245, 249]; // slate-100
            data.cell.styles.textColor = [100, 116, 139];
          }
        }
      }
    },
  });

  // 5. Signatures Section on the SAME Page
  const finalY = (doc as any).lastAutoTable?.finalY || 165;
  const sigY = finalY + 4;

  // Digital Signature banner if present
  if (closingRecord?.signedDigitally) {
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(167, 243, 208);
    doc.roundedRect(14, sigY, 182, 6, 1, 1, 'FD');

    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(6, 95, 70);
    doc.text(
      `✓ ASSINADO DIGITALMENTE: ${closingRecord.signedBy?.toUpperCase()} em ${new Date(
        closingRecord.signedAt || ''
      ).toLocaleString('pt-BR')}  |  Hash: ${closingRecord.digitalSignatureHash || 'AUTÊNTICO'}`,
      17,
      sigY + 4
    );
  }

  // Signature lines
  const lineY = sigY + (closingRecord?.signedDigitally ? 16 : 12);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(20, lineY, 90, lineY);
  doc.line(120, lineY, 190, lineY);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(userName, 55, lineY + 4, { align: 'center' });
  doc.setFontSize(5.8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Colaborador(a) / ${userCargo}`, 55, lineY + 7.5, { align: 'center' });

  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  doc.text(companyName, 155, lineY + 4, { align: 'center' });
  doc.setFontSize(5.8);
  doc.setTextColor(100, 116, 139);
  doc.text('Coordenação Pedagógica / DP GADAL', 155, lineY + 7.5, { align: 'center' });

  applyPageNumbersAndFooters(doc, 'portrait');
  const filename = `Espelho_Ponto_${userName.replace(/[\/\s]+/g, '_')}_${String(month).padStart(2, '0')}_${year}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  const dataUrl = dataUri;
  const download = () => doc.save(filename);

  if (saveImmediately) {
    doc.save(filename);
  }

  return { doc, blob, blobUrl, dataUri, dataUrl, filename, download };
}

/**
 * Generates an Official Receipt of Allowance & Full Quittance PDF Report (Single Page A4)
 */
export interface GenerateReciboBolsaPDFOptions {
  user?: UserProfile | null;
  month: number;
  year: number;
  financials: ReturnType<typeof calculateMonthlyPontoFinancials>;
  closingRecord?: PontoMonthClosing | null;
  companyName?: string;
  institutionName?: string;
  pixKey?: string;
  contractSchedule?: string;
  contractDailyHoursFormatted?: string;
  saveImmediately?: boolean;
}

export function generateReciboBolsaPDF({
  user,
  month,
  year,
  financials,
  closingRecord,
  companyName = 'GADAL - Gestão e Apoio',
  institutionName = 'Instituto Educacional Crescer',
  pixKey = 'Pendente',
  contractSchedule = '11:40 - 17:40',
  contractDailyHoursFormatted = '6h 00min',
  saveImmediately = false,
}: GenerateReciboBolsaPDFOptions): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const monthName = getMonthNameBR(month);
  const userName = user?.name || closingRecord?.userName || 'Colaborador';
  const userCargo = user?.cargoLabel || closingRecord?.userCargo || 'Estagiária / Monitora';

  // 1. Compact Header
  drawCompactOfficialHeader(
    doc,
    'RECIBO DE BOLSA AUXÍLIO & QUITAÇÃO',
    'PROGRAMA INTEGRAL • COMPROVANTE OFICIAL DE PAGAMENTO',
    [`Competência: ${monthName}/${year}`, `Emissão: ${getCurrentDateTimeString()}`],
    'portrait'
  );

  let startY = 24;

  // 2. Beneficiary Info Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, startY, 182, 21, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`BENEFICIÁRIA / ESTAGIÁRIA: ${userName.toUpperCase()} (${userCargo})`, 18, startY + 5.5);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Empresa Conveniada: ${companyName}   |   Instituição: ${institutionName}`,
    18,
    startY + 11
  );
  doc.text(
    `Jornada: ${contractSchedule} (${contractDailyHoursFormatted}/dia)   |   Chave PIX: ${pixKey}   |   Base (30d): ${formatCurrencyBR(
      financials.baseSalary
    )}`,
    18,
    startY + 16.5
  );

  startY += 25;

  // 3. Breakdown Table
  const tableData: any[] = [
    [
      'Bolsa Auxílio Estágio / Monitoria Integral (30 dias)',
      '30 dias',
      formatCurrencyBR(financials.baseSalary),
      '-',
    ],
    [
      `Feriados e Recessos Escolares Garantidos e Abonados (${financials.paidHolidaysCount + financials.paidRecessDaysCount} dias)`,
      `${financials.paidHolidaysCount + financials.paidRecessDaysCount} dias`,
      'Incluso na Bolsa',
      '-',
    ],
  ];

  if (financials.unjustifiedAbsencesCount > 0) {
    tableData.push([
      `Desconto de Faltas Injustificadas no Período (${financials.unjustifiedAbsencesCount} falta(s))`,
      `${financials.unjustifiedAbsencesCount} dia(s)`,
      '-',
      formatCurrencyBR(financials.unjustifiedAbsencesDiscount),
    ]);
  }

  if (financials.totalExtraMinutes > 0) {
    tableData.push([
      `Horas Extras / Reposições Apuradas (${formatMinutesToHoursAndMinutes(financials.totalExtraMinutes)})`,
      formatMinutesToHoursAndMinutes(financials.totalExtraMinutes),
      formatCurrencyBR(financials.extraHoursAmount),
      '-',
    ]);
  }

  if (financials.manualAddition && financials.manualAddition > 0) {
    tableData.push([
      `Adicional Especial / Bonificação (${closingRecord?.manualAdditionNote || 'Ajuste Autorizado'})`,
      'Evento Avulso',
      formatCurrencyBR(financials.manualAddition),
      '-',
    ]);
  }

  if (financials.manualDiscount && financials.manualDiscount > 0) {
    tableData.push([
      `Desconto Especial (${closingRecord?.manualDiscountNote || 'Ajuste Autorizado'})`,
      'Evento Avulso',
      '-',
      formatCurrencyBR(financials.manualDiscount),
    ]);
  }

  const totalGross =
    financials.baseSalary +
    financials.extraHoursAmount +
    (financials.manualAddition || 0);
  const totalDiscounts =
    financials.unjustifiedAbsencesDiscount + (financials.manualDiscount || 0);

  tableData.push([
    'TOTAL GERAL DE PROVENTOS E DESCONTOS',
    '-',
    formatCurrencyBR(totalGross),
    formatCurrencyBR(totalDiscounts),
  ]);

  autoTable(doc, {
    startY: startY,
    head: [['Descrição do Evento / Verba', 'Referência', 'Proventos (R$)', 'Descontos (R$)']],
    body: tableData,
    theme: 'grid',
    pageBreak: 'avoid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [51, 65, 85],
      cellPadding: 1.8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 95, halign: 'left' },
      1: { cellWidth: 28, halign: 'center' },
      2: { cellWidth: 30, halign: 'right', textColor: [16, 185, 129], fontStyle: 'bold' },
      3: { cellWidth: 29, halign: 'right', textColor: [220, 38, 38], fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === tableData.length - 1) {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = [15, 23, 42];
      }
    },
  });

  const finalTableY = (doc as any).lastAutoTable?.finalY || 105;

  // 4. Net Value Box
  const netY = finalTableY + 4;
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(52, 211, 153);
  doc.roundedRect(14, netY, 182, 13, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(6, 95, 70);
  doc.text('TOTAL LÍQUIDO A RECEBER:', 18, netY + 5.5);
  doc.setFontSize(11.5);
  doc.text(formatCurrencyBR(financials.netTotal), 190, netY + 6.5, { align: 'right' });

  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(4, 120, 87);
  doc.text(`Valor por extenso: ${numberToWordsBRL(financials.netTotal).toUpperCase()}`, 18, netY + 10.5);

  // 5. Legal Quittance Declaration
  const declY = netY + 16;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, declY, 182, 24, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('DECLARAÇÃO DE RECEBIMENTO & TERMO DE QUITAÇÃO PLENA', 18, declY + 5);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const legalText = `Declaro para os devidos fins de direito que recebi de ${institutionName} e ${companyName} a importância líquida supra de ${formatCurrencyBR(
    financials.netTotal
  )} (${numberToWordsBRL(
    financials.netTotal
  )}), referente ao pagamento de Bolsa Auxílio da competência de ${monthName}/${year}, conferindo plena, geral e irrevogável quitação de todas as obrigações para nada mais reclamar a qualquer título.`;
  const splitLegalText = doc.splitTextToSize(legalText, 174);
  doc.text(splitLegalText, 18, declY + 9.5);

  const sigStartY = declY + 28;

  // Digital Signature Banner
  if (closingRecord?.signedDigitally) {
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(167, 243, 208);
    doc.roundedRect(14, sigStartY, 182, 7, 1.5, 1.5, 'FD');

    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(6, 95, 70);
    doc.text(
      `✓ TERMO ASSINADO DIGITALMENTE POR: ${closingRecord.signedBy?.toUpperCase()} em ${new Date(
        closingRecord.signedAt || ''
      ).toLocaleString('pt-BR')}  |  Autenticação: ${closingRecord.digitalSignatureHash || 'AUTÊNTICO'}`,
      18,
      sigStartY + 4.5
    );
  }

  // Signature Lines
  const lineY = sigStartY + (closingRecord?.signedDigitally ? 17 : 12);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(20, lineY, 90, lineY);
  doc.line(120, lineY, 190, lineY);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(userName, 55, lineY + 4, { align: 'center' });
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text(`Beneficiária / ${userCargo}`, 55, lineY + 7.5, { align: 'center' });

  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  doc.text(institutionName, 155, lineY + 4, { align: 'center' });
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text(`Coordenação Pedagógica / ${companyName}`, 155, lineY + 7.5, { align: 'center' });

  applyPageNumbersAndFooters(doc, 'portrait');
  const filename = `Recibo_Bolsa_${userName.replace(/[\/\s]+/g, '_')}_${String(month).padStart(2, '0')}_${year}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  const dataUrl = dataUri;
  const download = () => doc.save(filename);

  if (saveImmediately) {
    doc.save(filename);
  }

  return { doc, blob, blobUrl, dataUri, dataUrl, filename, download };
}

/**
 * Generates an Official Daily Attendance Sheet PDF Report
 */
export interface GenerateAttendanceDailyPDFOptions {
  date: string; // YYYY-MM-DD
  activityName: string;
  turma: string;
  students: Student[];
  records: AttendanceRecord[];
  teacherName?: string;
  saveImmediately?: boolean;
}

export function generateAttendanceDailyPDFReport({
  date,
  activityName,
  turma,
  students,
  records,
  teacherName,
  saveImmediately = false,
}: GenerateAttendanceDailyPDFOptions): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const dateFormatted = formatDate(date);

  // Filter students for this activity/turma and scheduled for this date
  const relevantStudents = students
    .filter((st) => {
      const acts = Array.isArray(st.activities) ? st.activities : [];
      const matchAct = activityName === 'TODAS' || acts.includes(activityName as ActivityType);
      const matchTurma = turma === 'TODAS' || st.turma === turma;
      const matchSchedule = isStudentScheduledForDate(st, date);
      return matchAct && matchTurma && matchSchedule;
    })
    .sort((a, b) => {
      const turmaComp = (a.turma || '').localeCompare(b.turma || '', 'pt-BR', { numeric: true });
      if (turmaComp !== 0) return turmaComp;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

  // Calculate stats
  let pres = 0;
  let saidaAnt = 0;
  let falta = 0;
  let saude = 0;
  let semEquip = 0;
  let pendente = 0;

  relevantStudents.forEach((st) => {
    const rec = records.find((r) => r.studentId === st.id && r.date === date);
    if (!rec) {
      pendente++;
    } else {
      if (rec.status === 'presente') pres++;
      else if (rec.status === 'saida_antecipada') saidaAnt++;
      else if (rec.status === 'falta') falta++;
      else if (rec.status === 'saude') saude++;
      else if (rec.status === 'sem_equipamento') semEquip++;
    }
  });

  const total = relevantStudents.length;
  const presenceRate = total > 0 ? Math.round(((pres + saidaAnt) / total) * 100) : 100;

  // Header
  drawOfficialHeader(
    doc,
    'Lista de Chamada & Frequência Diária',
    `Controle de Frequência do Programa Integral - Data: ${dateFormatted}`,
    [`Atividade: ${activityName}`, `Turma: ${turma}`, `Data: ${dateFormatted}`],
    'portrait'
  );

  let startY = 36;

  // Info Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, startY, 182, 20, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Atividade: ${activityName}   |   Turma: ${turma}`, 18, startY + 5.5);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Professor(a) Responsável: ${teacherName || 'Docente'}   |   Total de Alunos: ${total}   |   Taxa de Presença: ${presenceRate}%`,
    18,
    startY + 12
  );

  startY += 24;

  // Metrics
  const metrics = [
    { label: 'Presentes', value: pres, color: [22, 163, 74] as [number, number, number] },
    { label: 'Saída Ant.', value: saidaAnt, color: [217, 119, 6] as [number, number, number] },
    { label: 'Faltas', value: falta, color: [220, 38, 38] as [number, number, number] },
    { label: 'Saúde', value: saude, color: [217, 119, 6] as [number, number, number] },
    { label: 'Sem Equip.', value: semEquip, color: [234, 88, 12] as [number, number, number] },
  ];
  drawMetricBoxes(doc, 14, startY, 34, 13.5, 3, metrics);

  startY += 18;

  // Table Data
  const tableData = relevantStudents.map((st, index) => {
    const rec = records.find((r) => r.studentId === st.id && r.date === date);
    let statusText = 'Pendente';
    if (rec) {
      if (rec.status === 'saida_antecipada') {
        statusText = `Saída às ${rec.exitTime || 's/h'}`;
      } else {
        statusText = getStatusText(rec.status);
      }
    }

    const obs = [
      rec?.equipmentMissingDetails ? `Equip: ${rec.equipmentMissingDetails}` : '',
      rec?.observation || '',
    ]
      .filter(Boolean)
      .join(' | ');

    return [
      String(index + 1).padStart(2, '0'),
      st.name,
      st.turma,
      statusText,
      obs || '-',
    ];
  });

  autoTable(doc, {
    startY: startY,
    head: [['Nº', 'Nome do Aluno(a)', 'Turma', 'Status de Frequência', 'Observações / Ocorrências']],
    body: tableData.length > 0 ? tableData : [['-', 'Nenhum aluno cadastrado no filtro selecionado', '-', '-', '-']],
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
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 55, fontStyle: 'bold' },
      2: { cellWidth: 25, halign: 'center' },
      3: { cellWidth: 40, halign: 'center' },
      4: { cellWidth: 'auto' },
    },
  });

  // Signatures
  const finalY = (doc as any).lastAutoTable?.finalY || 220;
  if (finalY < 250) {
    const sigY = Math.max(finalY + 16, 245);
    doc.setDrawColor(203, 213, 225);
    doc.line(20, sigY, 90, sigY);
    doc.line(120, sigY, 190, sigY);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Professor(a) / Monitor(a) Responsável`, 55, sigY + 4, { align: 'center' });
    doc.text('Coordenação do Programa Integral', 155, sigY + 4, { align: 'center' });
  }

  applyPageNumbersAndFooters(doc, 'portrait');
  const filename = `Chamada_${activityName.replace(/[\/\s]+/g, '_')}_${turma.replace(/[\/\s]+/g, '_')}_${dateFormatted.replace(/\//g, '-')}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  const dataUrl = dataUri;
  const download = () => doc.save(filename);

  if (saveImmediately) {
    doc.save(filename);
  }

  return { doc, blob, blobUrl, dataUri, dataUrl, filename, download };
}

// ---------------------------------------------------------------------------
// 9. RELATÓRIO NUMÉRICO DE FREQUÊNCIA DOS ALUNOS (CONSOLIDADO SINTÉTICO DIÁRIO)
// ---------------------------------------------------------------------------

export interface GenerateNumericAttendancePDFOptions {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  turma?: string;    // 'Todas as Turmas' or specific Turma
  periodLabel?: string;
  students: Student[];
  records: AttendanceRecord[];
  holidays?: HolidayItem[];
  saveImmediately?: boolean;
}

export function generateNumericAttendanceConsolidatedPDFReport({
  startDate,
  endDate,
  turma = 'Todas as Turmas',
  periodLabel,
  students,
  records,
  holidays = [],
  saveImmediately = false,
}: GenerateNumericAttendancePDFOptions): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const isAllTurmas = !turma || turma === 'Todas as Turmas' || turma === 'all';
  const targetTurmaParam = isAllTurmas ? 'all' : turma;

  // Single Source of Truth calculation from frequenciaUtils
  const consolidated = getPeriodConsolidatedMetrics(
    startDate,
    endDate,
    students,
    records,
    holidays,
    targetTurmaParam
  );

  // Header
  const subtitle = isAllTurmas
    ? 'Consolidado Sintético Diário de Todas as Turmas • Programa Integral'
    : `Consolidado Sintético Diário - Turma ${turma} • Programa Integral`;

  const periodDisplay = periodLabel || `De ${formatDateBR(startDate)} a ${formatDateBR(endDate)}`;

  drawOfficialHeader(
    doc,
    'Relatório Numérico de Frequência',
    subtitle,
    [`Escopo: ${isAllTurmas ? 'Geral (Todas as Turmas)' : turma}`, `Período: ${formatDateBR(startDate)} a ${formatDateBR(endDate)}`],
    'portrait'
  );

  let startY = 38;

  // Overview Info Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, 182, 24, 2.5, 2.5, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Escopo: ${isAllTurmas ? 'Todas as Turmas do Integral' : `Turma ${turma}`}`, 18, startY + 6.5);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Período de Apuração: ${periodDisplay}`, 18, startY + 13);
  doc.text(
    `Dias Úteis Letivos: ${consolidated.schoolDaysCount} dias ${
      consolidated.holidaysCount > 0 ? `(${consolidated.holidaysCount} feriados/recessos descontados)` : ''
    } • Matrículas Ativas no Escopo: ${consolidated.totalMatriculasAtivas} alunos`,
    18,
    startY + 19
  );

  startY += 28;

  const tableData = consolidated.dailyMetrics.map((day) => {
    let rateStr = '-';
    if (day.totalAtivos > 0 && day.apurados > 0) {
      rateStr = `${day.taxaPresenca}%`;
    } else if (day.apurados > 0) {
      rateStr = `${day.taxaApurada}%`;
    }

    return [
      `${formatDateBR(day.dateStr)} (${day.dayName})`,
      String(day.totalAtivos),
      String(day.presentes),
      String(day.faltas),
      String(day.justificados),
      rateStr,
    ];
  });

  const totalEsperadosAcumulados = consolidated.totalEsperadosAcumulados;
  const totalPresencasAcumuladas = consolidated.totalPresentesAcumulados;
  const totalFaltasAcumuladas = consolidated.totalFaltasAcumuladas;
  const totalSaudeAcumuladas = consolidated.totalJustificadosAcumulados;
  const taxaGeral = consolidated.taxaPresencaGeral;

  // Metric Cards
  const metrics = [
    { label: 'Dias Letivos', value: `${consolidated.schoolDaysCount} d`, color: [15, 23, 42] as [number, number, number] },
    { label: 'Alunos Esperados', value: totalEsperadosAcumulados, color: [79, 70, 229] as [number, number, number] },
    { label: 'Presenças', value: totalPresencasAcumuladas, color: [22, 163, 74] as [number, number, number] },
    { label: 'Faltas', value: totalFaltasAcumuladas, color: [220, 38, 38] as [number, number, number] },
    { label: 'Atestados/Saúde', value: totalSaudeAcumuladas, color: [217, 119, 6] as [number, number, number] },
  ];
  drawMetricBoxes(doc, 14, startY, 34, 14, 3, metrics);

  startY += 18;

  // Main Numerical Table with Foot Row
  autoTable(doc, {
    startY,
    head: [['Data / Dia da Semana', 'Alunos Esperados', 'Presenças', 'Faltas', 'Atestados / Saúde', '% Assiduidade']],
    body:
      tableData.length > 0
        ? tableData
        : [['Nenhum dia letivo encontrado para o período selecionado', '-', '-', '-', '-', '-']],
    foot: [
      [
        'TOTAIS DO PERÍODO',
        String(totalEsperadosAcumulados),
        String(totalPresencasAcumuladas),
        String(totalFaltasAcumuladas),
        String(totalSaudeAcumuladas),
        `${taxaGeral}%`,
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
      fontSize: 7.5,
      textColor: [51, 65, 85],
      cellPadding: 2.5,
    },
    footStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 'auto', fontStyle: 'bold' },
      1: { cellWidth: 32, halign: 'center' },
      2: { cellWidth: 26, halign: 'center', textColor: [22, 163, 74], fontStyle: 'bold' },
      3: { cellWidth: 24, halign: 'center', textColor: [220, 38, 38] },
      4: { cellWidth: 32, halign: 'center', textColor: [217, 119, 6] },
      5: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'foot' && data.column.index === 0) {
        data.cell.styles.halign = 'left';
      }
    },
  });

  // Signatures
  const finalY = (doc as any).lastAutoTable?.finalY || 210;
  if (finalY < 250) {
    const sigY = Math.max(finalY + 18, 242);
    doc.setDrawColor(203, 213, 225);
    doc.line(20, sigY, 90, sigY);
    doc.line(120, sigY, 190, sigY);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Coordenação do Programa Integral', 55, sigY + 4, { align: 'center' });
    doc.text('Direção Escolar • Colégio Crescer', 155, sigY + 4, { align: 'center' });
  }

  applyPageNumbersAndFooters(doc, 'portrait');
  const filename = `Relatorio_Numerico_Frequencia_${isAllTurmas ? 'Geral' : turma.replace(/[\/\s]+/g, '_')}_${formatDateBR(
    startDate
  ).replace(/\//g, '-')}_a_${formatDateBR(endDate).replace(/\//g, '-')}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  const dataUrl = dataUri;
  const download = () => doc.save(filename);

  if (saveImmediately) {
    doc.save(filename);
  }

  return { doc, blob, blobUrl, dataUri, dataUrl, filename, download };
}
