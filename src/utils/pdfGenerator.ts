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
  User,
  PontoRecord,
  PontoMonthClosing,
  HolidayItem,
  SemanarioPlan,
  TurmaAtribuicao,
  NominalAttendanceFilter,
  NominalStudentTypeFilter,
  NominalPeriodMode,
  NominalReportMetrics,
  NominalProcessedStudent,
  StudentFinancialProfile,
  FinancialMetricSummary,
  FinancialExpense,
  PLANOS_CONTRATUAIS_TABELA,
  getTabelaPlanosPorAno,
} from '../types';
import { MonthlyMenu, CookingRecipe, MenuItemDay } from '../types/cardapio';
import { ManualNorma, MODULE_METADATA, NormaAceite, compareNormasBySectionNumber } from '../types/manualNormas';
import { PedagogicalFeedback } from '../services/feedbackService';
import { formatDateBR, getDayOfWeekLabel, isStudentScheduledForDate, getEffectiveSchoolDays, isStudentScheduledForDay } from './dateUtils';
import { getPeriodConsolidatedMetrics, normalizeAttendanceStatus } from './frequenciaUtils';
import { sortTurmasPedagogical } from './turmaUtils';
import { parseTimeToMinutes, getStartMinutes, isReforcoActivity, getReforcoStudentsForCard, isStudentInReforcoVigency } from './semanarioUtils';
import { processMarkdownAndIconsForPDF } from './markdownUtils';
import { getLogoDataUrl, LOGO_BASE64, LOGO_WIDTH_MM, LOGO_HEIGHT_MM } from './pdfLogo';
import { formatPhoneDisplay } from './whatsappUtils';
import { isUserActive, isUserDismissed, getUnifiedCargoDisplay } from './authUtils';
import {
  formatCurrencyBR,
  getMonthNameBR,
  formatMinutesToHoursAndMinutes,
  calculateDayWorkedMinutes,
  numberToWordsBRL,
  calculateMonthlyPontoFinancials,
  isContinuousShift,
  getDayPontoStatus,
} from './pontoUtils';
import { getDefaultHorarioTurnoForTurma } from './atribuicoesStorage';
import { calculateCookingWorkshopDates } from './cardapioStorage';
import { loadHolidays } from './storageUtils';
import { DREMonthlySummary } from '../services/financialService';

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
    case 'sem_equipamento':
      return 'Sem Equipamento';
    case 'pendente':
      return 'Pendente';
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
    case 'sem_equipamento':
      return [234, 88, 12]; // orange-600
    case 'pendente':
      return [217, 119, 6]; // amber-600
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
  const rightMarginX = pageWidth - 14;

  // Header Banner Background (Height 32mm)
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
  const availableWidth = rightMarginX - textStartX;

  // Tier 1 (Y = 9.5mm): Organization Brand on Left, Emission Timestamp on Right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(244, 63, 94); // rose-500 badge look
  doc.text('INSTITUTO EDUCACIONAL CRESCER • PROGRAMA INTEGRAL', textStartX, 9.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(`Emissão: ${getCurrentDateTimeString()}`, rightMarginX, 9.5, { align: 'right' });

  // Tier 2 (Y = 15.5mm): Exclusively dedicated to document Title across the entire available width
  doc.setFont('helvetica', 'bold');
  const rawTitle = title.toUpperCase();
  let titleFontSize = 12;
  doc.setFontSize(titleFontSize);
  while (titleFontSize > 8.5 && doc.getTextWidth(rawTitle) > availableWidth) {
    titleFontSize -= 0.5;
    doc.setFontSize(titleFontSize);
  }
  doc.setTextColor(255, 255, 255);
  doc.text(rawTitle, textStartX, 15.5);

  // Tier 3 (Y = 21.5mm): Subtitle on Left, Official Tag on Right
  if (subtitle && subtitle.trim().length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(191, 219, 254); // blue-200
    const maxSubWidth = availableWidth - 55; // 55mm reserved for right label
    let cleanSubtitle = subtitle.trim();
    if (doc.getTextWidth(cleanSubtitle) > maxSubWidth) {
      while (cleanSubtitle.length > 5 && doc.getTextWidth(cleanSubtitle + '...') > maxSubWidth) {
        cleanSubtitle = cleanSubtitle.slice(0, -1);
      }
      cleanSubtitle += '...';
    }
    doc.text(cleanSubtitle, textStartX, 21.5);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('Documento Oficial de Registro Escolar', rightMarginX, 21.5, { align: 'right' });

  // Tier 4 (Y = 27mm): Filter Details (Aluno, Turma, Período, etc.) on its own dedicated row
  if (filterDetails && filterDetails.length > 0) {
    doc.setFont('helvetica', 'bold');
    let filterFontSize = 7.5;
    doc.setFontSize(filterFontSize);
    const filterText = filterDetails.join('   •   ');
    while (filterFontSize > 6.2 && doc.getTextWidth(filterText) > availableWidth) {
      filterFontSize -= 0.3;
      doc.setFontSize(filterFontSize);
    }
    doc.setTextColor(224, 231, 255); // indigo-100
    let cleanFilterText = filterText;
    if (doc.getTextWidth(cleanFilterText) > availableWidth) {
      while (cleanFilterText.length > 5 && doc.getTextWidth(cleanFilterText + '...') > availableWidth) {
        cleanFilterText = cleanFilterText.slice(0, -1);
      }
      cleanFilterText += '...';
    }
    doc.text(cleanFilterText, textStartX, 27);
  }
}

/**
 * Compact Official Header for 1-Page Documents (Espelho de Ponto & Recibo de Bolsa)
 */
function drawCompactOfficialHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  filterDetails: string[],
  orientation: 'portrait' | 'landscape' = 'portrait',
  customMarginX: number = 14
) {
  const pageWidth = orientation === 'landscape' ? 297 : 210;
  const rightMarginX = pageWidth - customMarginX;

  // Header Banner Background (Height 21mm)
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 21, 'F');

  // Accent line
  doc.setFillColor(79, 70, 229); // indigo-600
  doc.rect(0, 0, pageWidth, 2.5, 'F');

  // Logo
  let logoDrawn = false;
  const logoData = getLogoDataUrl() || LOGO_BASE64;
  if (logoData) {
    try {
      doc.setFillColor(255, 255, 255);
      const logoX = customMarginX <= 8 ? 8 : 12;
      doc.roundedRect(logoX, 4, 28, 14, 1.5, 1.5, 'F');
      doc.addImage(logoData, 'PNG', logoX + 1, 4.8, 26, 12);
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }

  const textStartX = logoDrawn ? (customMarginX <= 8 ? 39 : 43) : customMarginX;
  const availableWidth = rightMarginX - textStartX;

  // Tier 1 (Y = 7mm): Brand and Timestamp
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(244, 63, 94);
  doc.text('INSTITUTO EDUCACIONAL CRESCER • PROGRAMA INTEGRAL', textStartX, 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Emissão: ${getCurrentDateTimeString()}`, rightMarginX, 7, { align: 'right' });

  // Tier 2 (Y = 12mm): Dedicated row for Title
  doc.setFont('helvetica', 'bold');
  let titleFontSize = 10.5;
  doc.setFontSize(titleFontSize);
  const rawTitle = title.toUpperCase();
  while (titleFontSize > 7.5 && doc.getTextWidth(rawTitle) > availableWidth) {
    titleFontSize -= 0.5;
    doc.setFontSize(titleFontSize);
  }
  doc.setTextColor(255, 255, 255);
  doc.text(rawTitle, textStartX, 12);

  // Tier 3 (Y = 17mm): Subtitle or Filters on Left, Official Tag on Right
  const detailText = filterDetails && filterDetails.length > 0 
    ? filterDetails.join('  •  ')
    : (subtitle || '');

  if (detailText.trim().length > 0) {
    doc.setFont('helvetica', 'bold');
    let detailFontSize = 7.2;
    doc.setFontSize(detailFontSize);
    const maxDetailWidth = availableWidth - 45;
    let cleanDetail = detailText.trim();
    while (detailFontSize > 5.5 && doc.getTextWidth(cleanDetail) > maxDetailWidth) {
      detailFontSize -= 0.3;
      doc.setFontSize(detailFontSize);
    }
    doc.setTextColor(224, 231, 255);
    if (doc.getTextWidth(cleanDetail) > maxDetailWidth) {
      while (cleanDetail.length > 5 && doc.getTextWidth(cleanDetail + '...') > maxDetailWidth) {
        cleanDetail = cleanDetail.slice(0, -1);
      }
      cleanDetail += '...';
    }
    doc.text(cleanDetail, textStartX, 17);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(148, 163, 184);
  doc.text('Documento Oficial de Registro Escolar', rightMarginX, 17, { align: 'right' });
}

/**
 * Common Footer & Page Numbers
 */
function applyPageNumbersAndFooters(
  doc: jsPDF,
  orientation: 'portrait' | 'landscape' = 'portrait',
  customMarginX: number = 14
) {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageWidth = orientation === 'landscape' ? 297 : 210;
  const pageHeight = orientation === 'landscape' ? 210 : 297;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Footer divider line
    doc.setDrawColor(226, 232, 240);
    doc.line(customMarginX, pageHeight - 11, pageWidth - customMarginX, pageHeight - 11);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // slate-400

    doc.text(
      'Instituto Educacional Crescer - Sistema de Gestão do Programa Integral',
      customMarginX,
      pageHeight - 6
    );

    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth - customMarginX,
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
    doc.roundedRect(x, startY, boxWidth, boxHeight, 1.5, 1.5, 'FD');

    // Label - proportionally positioned inside the top third of the card
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(m.label.toUpperCase(), x + 2.0, startY + 3.4);

    // Value - Auto-scale font size so text sits cleanly in the lower half without spilling out
    const textVal = String(m.value);
    let fontSize = 7.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    while (doc.getTextWidth(textVal) > (boxWidth - 3.6) && fontSize > 4.5) {
      fontSize -= 0.3;
      doc.setFontSize(fontSize);
    }
    doc.setFontSize(fontSize);
    doc.setTextColor(m.color[0], m.color[1], m.color[2]);
    doc.text(textVal, x + 2.0, startY + (boxHeight - 2.2));
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
        (Array.isArray(u.assignedActivities) && u.assignedActivities.some(
          (act) => act.toLowerCase() === activityName.toLowerCase()
        )) ||
        (typeof u.specialtyActivity === 'string' && u.specialtyActivity.toLowerCase() === activityName.toLowerCase())
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
    { label: 'Sem Equip.', value: semEquip, color: [234, 88, 12] as [number, number, number] },
  ];
  drawMetricBoxes(doc, 14, startY, 43, 15, 3.3, metrics);

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
    { label: 'Sem Equip.', value: semEquip, color: [234, 88, 12] as [number, number, number] },
  ];
  drawMetricBoxes(doc, 14, startY, 43, 14, 3.3, metrics);

  startY += 19;

  // Table Data: Students & Individual Rates in the Period
  const tableData = turmaStudents.map((st) => {
    const stRecords = turmaRecords.filter((r) => r.studentId === st.id);
    const stTotal = stRecords.length;
    const stPres = stRecords.filter((r) => r.status === 'presente').length;
    const stSaidaAnt = stRecords.filter((r) => r.status === 'saida_antecipada').length;
    const stFalta = stRecords.filter((r) => r.status === 'falta').length;
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
    { label: 'Sem Equip.', value: semEquip, color: [234, 88, 12] as [number, number, number] },
  ];
  drawMetricBoxes(doc, 14, startY, 43, 14, 3.3, metrics);

  startY += 19;

  // Table Data: Enrolled students & their performance in this modality
  const tableData = enrolledStudents.map((st) => {
    const stRecords = activityRecords.filter((r) => r.studentId === st.id);
    const stTotal = stRecords.length;
    const stPres = stRecords.filter((r) => r.status === 'presente').length;
    const stSaidaAnt = stRecords.filter((r) => r.status === 'saida_antecipada').length;
    const stFalta = stRecords.filter((r) => r.status === 'falta').length;
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
    totalMissingMinutes?: number;
    missingHoursFormatted?: string;
    missingHoursDiscount?: number;
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

export function drawSingleTimecardPage(
  doc: jsPDF,
  options: GenerateLivroPontoPDFOptions
) {
  const {
    user,
    month,
    year,
    monthDaysGrid,
    financials,
    closingRecord,
    companyName: companyNameProp,
    pixKey = 'Pendente',
    contractSchedule = '11:40 - 17:40',
    contractDailyHoursFormatted = '6h 00min',
  } = options;

  const monthName = getMonthNameBR(month);
  const userName = user?.name || closingRecord?.userName || 'Colaborador';
  const userCargo = user?.cargoLabel || closingRecord?.userCargo || 'Estagiária / Monitora';
  const companyName = user?.company || closingRecord?.companyName || companyNameProp || 'GADAL - Gestão e Apoio';

  // 1. Compact Header (8mm margin) - Height: 21mm
  drawCompactOfficialHeader(
    doc,
    'ESPELHO DE PONTO',
    '',
    [`Colaborador(a): ${userName}`, `Competência: ${monthName}/${year}`],
    'portrait',
    8
  );

  let startY = 22.5;

  // 2. Collaborator & Contract Details Card (Height: 11.8mm, Width: 194mm with 8mm margins)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(8, startY, 194, 11.8, 1.5, 1.5, 'FD');

  const statusSuffix = user?.status === 'DESLIGADO'
    ? ` [DESLIGADO(A)${user?.dataDesligamento ? ` EM ${formatDateBR(user.dataDesligamento)}` : ''}]`
    : user?.status === 'INATIVO'
    ? ' [INATIVO(A)]'
    : '';

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.2);
  doc.setFont('helvetica', 'bold');
  doc.text(`Colaborador(a): ${userName.toUpperCase()} (${userCargo})${statusSuffix}   |   Competência: ${monthName}/${year}`, 11, startY + 4.6);

  doc.setFontSize(7.6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const admissaoStr = user?.dataAdmissao ? `Admissão: ${formatDateBR(user.dataAdmissao)}   |   ` : '';
  doc.text(
    `Empresa: ${companyName}   |   ${admissaoStr}Jornada: ${contractSchedule} (${contractDailyHoursFormatted})   |   PIX: ${pixKey}   |   Status: ${
      closingRecord?.isClosed ? 'FECHADO / PAGO' : 'ABERTO'
    }`,
    11,
    startY + 9.2
  );

  startY += 13.2;

  // 3. Financial & Performance Summary Metrics (Height: 10.2mm, 6 cards fitting 194mm width)
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
      label: 'Atrasos / Faltantes',
      value: `${financials.missingHoursFormatted || '0h00min'} (${(financials.missingHoursDiscount && financials.missingHoursDiscount > 0) ? formatCurrencyBR(-financials.missingHoursDiscount) : 'R$ 0,00'})`,
      color: [180, 83, 9] as [number, number, number],
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
  drawMetricBoxes(doc, 8, startY, 29.8, 10.2, 2.8, metrics);

  startY += 12.0;

  // Check if target user has a continuous 6h shift
  const isContinuous = isContinuousShift(
    closingRecord?.workShiftType ? { ...user, workShiftType: closingRecord.workShiftType } : user,
    contractSchedule
  );

  // 4. Timesheet Table Data (Expanded row height for full A4 page presence)
  const tableData = monthDaysGrid.map((item) => {
    const rec = item.record;
    const status = rec?.status || item.defaultStatus || 'normal';
    const holidayName = item.holidayItem?.name || item.holidayRecessName || '';
    const hasPunches = Boolean(rec?.entry1 || rec?.entry2 || rec?.exit1 || rec?.exit2);
    const isDiaDescanso = item.isWk || Boolean(item.holidayItem) || status === 'sabado' || status === 'domingo' || status === 'feriado' || status === 'recesso';
    const isBeforeAdmission = Boolean(user?.dataAdmissao && item.dateStr < user.dataAdmissao) || status === 'nao_admitido';
    const dayCalc = calculateDayWorkedMinutes(rec, contractSchedule, 5, undefined, isDiaDescanso);

    const statusResult = getDayPontoStatus({
      record: rec,
      defaultStatus: status,
      isContinuous,
      dateStr: item.dateStr,
      isWeekend: item.isWk,
      holidayName,
      isDiaDescanso,
      dataAdmissao: user?.dataAdmissao,
    });
    const statusText = statusResult.label;

    let workedHoursStr = '-';
    if (isBeforeAdmission) {
      workedHoursStr = '-';
    } else if (hasPunches) {
      workedHoursStr = formatMinutesToHoursAndMinutes(dayCalc.workedMinutes);
    } else if (isDiaDescanso) {
      workedHoursStr = (status === 'feriado' || status === 'recesso') ? contractDailyHoursFormatted : '-';
    } else if (
      status === 'falta_injustificada' ||
      status === 'Falta Não Abonada (Descontar 1 Diária)' ||
      status === 'falta_nao_abonada'
    ) {
      workedHoursStr = '0h00min';
    }

    const dayStr = String(item.dayNumber).padStart(2, '0');
    const dayLabel = item.dayOfWeekLabel || item.dayOfWeekName || item.dayOfWeekShort || '';
    const dayName = dayLabel.split('-')[0];

    if (isBeforeAdmission && !hasPunches) {
      if (isContinuous) {
        return [
          dayStr,
          dayName,
          '—',
          '—',
          '—',
          'NÃO ADMITIDO / FORA DO CONTRATO',
          rec?.note || '-',
        ];
      }
      return [
        dayStr,
        dayName,
        '—',
        '—',
        '—',
        '—',
        '—',
        'NÃO ADMITIDO / FORA DO CONTRATO',
        rec?.note || '-',
      ];
    }

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
    ? [['Dia', 'Sem.', 'Entrada 1', 'Saída 1', 'Horas', 'Status / Ocorrência', 'Observações']]
    : [['Dia', 'Sem.', 'Entrada 1', 'Saída Almoço', 'Retorno Almoço', 'Saída 2', 'Horas', 'Status / Ocorrência', 'Observações']];

  // Column styles fitting exactly 194mm (8mm margins on A4 portrait)
  const columnStyles = isContinuous
    ? {
        0: { cellWidth: 10, halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 8.0 },
        1: { cellWidth: 16, halign: 'center' as const, fontSize: 7.6 },
        2: { cellWidth: 22, halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 8.2 },
        3: { cellWidth: 22, halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 8.2 },
        4: { cellWidth: 20, halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 8.2 },
        5: { cellWidth: 54, halign: 'left' as const, fontSize: 7.4 },
        6: { cellWidth: 50, halign: 'left' as const, fontSize: 7.2 },
      }
    : {
        0: { cellWidth: 10, halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 8.0 },
        1: { cellWidth: 15, halign: 'center' as const, fontSize: 7.6 },
        2: { cellWidth: 16, halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 8.0 },
        3: { cellWidth: 16, halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 8.0 },
        4: { cellWidth: 16, halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 8.0 },
        5: { cellWidth: 16, halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 8.0 },
        6: { cellWidth: 18, halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 8.0 },
        7: { cellWidth: 50, halign: 'left' as const, fontSize: 7.4 },
        8: { cellWidth: 37, halign: 'left' as const, fontSize: 7.2 },
      };

  // Altura das linhas da tabela de registros diários ajustada para 1.55mm (libera respiro no terço inferior)
  const daysCount = monthDaysGrid.length;
  const verticalPadding = daysCount <= 28 ? 1.65 : (daysCount <= 29 ? 1.60 : 1.55);

  autoTable(doc, {
    startY: startY,
    head: tableHead,
    body: tableData,
    theme: 'grid',
    pageBreak: 'avoid',
    margin: { left: 8, right: 8 },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.0,
      cellPadding: { top: 2.2, bottom: 2.2, left: 1.2, right: 1.2 },
      halign: 'center',
      valign: 'middle',
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
    },
    bodyStyles: {
      fontSize: 7.4,
      textColor: [51, 65, 85],
      cellPadding: { top: verticalPadding, bottom: verticalPadding, left: 1.2, right: 1.2 },
      valign: 'middle',
      lineWidth: 0.12,
      lineColor: [226, 232, 240],
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
          const isBeforeAdmissao = (user?.dataAdmissao && rawRow.dateStr < user.dataAdmissao) || status === 'nao_admitido';

          if (isBeforeAdmissao) {
            data.cell.styles.fillColor = [241, 245, 249]; // light slate neutro
            data.cell.styles.textColor = [100, 116, 139]; // slate-500
          } else if (
            status === 'falta_injustificada' ||
            status === 'Falta Não Abonada (Descontar 1 Diária)' ||
            status === 'falta_nao_abonada'
          ) {
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

  // 5. Seção de Assinaturas com folga elegante (fixada com segurança em y = 262mm)
  const finalY = (doc as any).lastAutoTable?.finalY || 232;
  const lineY = Math.max(finalY + (closingRecord?.signedDigitally ? 14 : 10), 262);

  // Digital Signature banner if present
  if (closingRecord?.signedDigitally) {
    const bannerY = lineY - 10.5;
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(167, 243, 208);
    doc.roundedRect(8, bannerY, 194, 6.0, 1, 1, 'FD');

    doc.setFontSize(7.0);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(6, 95, 70);
    doc.text(
      `✓ ASSINADO DIGITALMENTE: ${closingRecord.signedBy?.toUpperCase()} em ${new Date(
        closingRecord.signedAt || ''
      ).toLocaleString('pt-BR')}  |  Hash: ${closingRecord.digitalSignatureHash || 'AUTÊNTICO'}`,
      11,
      bannerY + 4.0
    );
  }

  // Linhas de assinatura ancoradas em y = 262mm (respiro elegante acima do rodapé em 285mm)
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.35);
  doc.line(16, lineY, 96, lineY);
  doc.line(114, lineY, 194, lineY);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(userName, 56, lineY + 3.8, { align: 'center' });
  doc.setFontSize(7.2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Colaborador(a) / ${userCargo}`, 56, lineY + 7.5, { align: 'center' });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(companyName, 154, lineY + 3.8, { align: 'center' });
  doc.setFontSize(7.2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  const companyShort = companyName.replace(/ - Gestão e Apoio/i, '').trim();
  doc.text(`Coordenação do Integral / DP ${companyShort || companyName}`, 154, lineY + 7.5, { align: 'center' });
}

export function generateLivroPontoPDFReport(options: GenerateLivroPontoPDFOptions): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  drawSingleTimecardPage(doc, options);
  applyPageNumbersAndFooters(doc, 'portrait', 8);

  const monthName = getMonthNameBR(options.month);
  const userName = options.user?.name || options.closingRecord?.userName || 'Colaborador';
  const filename = `Espelho_Ponto_${userName.replace(/[\/\s]+/g, '_')}_${String(options.month).padStart(2, '0')}_${options.year}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  const dataUrl = dataUri;
  const download = () => doc.save(filename);

  if (options.saveImmediately) {
    doc.save(filename);
  }

  return { doc, blob, blobUrl, dataUri, dataUrl, filename, download };
}

/**
 * Consolidates all active employees' timecards into a SINGLE unified PDF document
 * with a page break (doc.addPage) between each employee.
 */
export function generateAllTimecardsPDF(
  optionsList: GenerateLivroPontoPDFOptions[],
  customFilename?: string
): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  optionsList.forEach((opts, index) => {
    if (index > 0) {
      doc.addPage('a4', 'portrait');
    }
    drawSingleTimecardPage(doc, opts);
  });

  applyPageNumbersAndFooters(doc, 'portrait', 8);

  const first = optionsList[0];
  const monthName = first ? getMonthNameBR(first.month) : 'Competencia';
  const year = first ? first.year : new Date().getFullYear();
  const filename = customFilename || `Espelhos_Ponto_TODOS_${monthName}_${year}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  const dataUrl = dataUri;
  const download = () => doc.save(filename);

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

export function drawSingleReceiptPage(
  doc: jsPDF,
  options: GenerateReciboBolsaPDFOptions
): void {
  const {
    user,
    month,
    year,
    financials,
    closingRecord,
    companyName: companyNameProp,
    institutionName = 'Instituto Educacional Crescer',
    pixKey = 'Pendente',
    contractSchedule = '11:40 - 17:40',
    contractDailyHoursFormatted = '6h 00min',
  } = options;

  const monthName = getMonthNameBR(month);
  const userName = user?.name || closingRecord?.userName || 'Colaborador';
  const userCargo = user?.cargoLabel || closingRecord?.userCargo || 'Estagiária / Monitora';
  const companyName = user?.company || closingRecord?.companyName || companyNameProp || 'GADAL - Gestão e Apoio';

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

  const isProfessor = (financials.regimeTrabalho || closingRecord?.regimeTrabalho || user?.regimeTrabalho) === 'professor_horista';

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const rolePrefix = isProfessor ? 'BENEFICIÁRIO(A) / PROFESSOR(A) HORISTA' : 'BENEFICIÁRIA / ESTAGIÁRIA';
  doc.text(`${rolePrefix}: ${userName.toUpperCase()} (${userCargo})`, 18, startY + 5.5);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Empresa Conveniada: ${companyName}   |   Instituição: ${institutionName}`,
    18,
    startY + 11
  );

  if (isProfessor) {
    const horaAulaVal = financials.valorHoraAula || 0;
    const durAula = financials.duracaoAulaMinutos || 50;
    const aulasTotal = financials.totalAulas || 0;
    doc.text(
      `Regime: Professor Horista   |   Hora-Aula: ${formatCurrencyBR(horaAulaVal)} (${durAula}min)   |   Aulas no Mês: ${aulasTotal}   |   Chave PIX: ${pixKey}`,
      18,
      startY + 16.5
    );
  } else {
    doc.text(
      `Jornada: ${contractSchedule} (${contractDailyHoursFormatted}/dia)   |   Divisor: ${financials.divisorHours || 220}h (${formatCurrencyBR(financials.hourlyRate || (financials.baseSalary / 220))}/h)   |   Chave PIX: ${pixKey}`,
      18,
      startY + 16.5
    );
  }

  startY += 25;

  // 3. Breakdown Table
  const tableData: any[] = isProfessor
    ? [
        [
          `Salário Base de Aulas (${financials.totalAulas || 0} aulas ministradas no mês)`,
          `${financials.totalAulas || 0} aulas`,
          formatCurrencyBR(financials.salarioAulas || 0),
          '-',
        ],
        [
          'Adicional de Hora-Atividade (5% s/ Salário de Aulas - CCT/CLT)',
          '5%',
          formatCurrencyBR(financials.horaAtividade || 0),
          '-',
        ],
        [
          'Descanso Semanal Remunerado - D.S.R. (1/6 - Lei 605/49 e Súmula 351 TST)',
          '1/6 (16,67%)',
          formatCurrencyBR(financials.dsr || 0),
          '-',
        ],
        [
          'Ajuda de Custo (Verba Indenizatória / Não Salarial - 100% Líquida)',
          'Fixo Mensal',
          formatCurrencyBR(financials.ajudaDeCusto !== undefined ? Number(financials.ajudaDeCusto) : 0.0),
          '-',
        ],
      ]
    : [
        [
          `Bolsa Auxílio Contratual (Divisor Mensal ${financials.divisorHours || 220}h)`,
          `${financials.divisorHours || 220}h`,
          formatCurrencyBR(financials.baseSalary),
          '-',
        ],
        [
          'Ajuda de Custo (Verba Não Salarial / Não Indenizatória - 100% Líquida)',
          'Fixo Mensal',
          formatCurrencyBR(financials.ajudaDeCusto !== undefined ? Number(financials.ajudaDeCusto) : 0.0),
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
    const faltasLabel = isProfessor
      ? `Desconto de Faltas Injustificadas no Período (${financials.unjustifiedAbsencesCount} falta(s))`
      : `Desconto de Faltas Injustificadas no Período (${financials.unjustifiedAbsencesCount} dia(s) × carga 8,8h)`;
    tableData.push([
      faltasLabel,
      `${financials.unjustifiedAbsencesCount} dia(s)`,
      '-',
      formatCurrencyBR(financials.unjustifiedAbsencesDiscount),
    ]);
  }

  if (financials.missingHoursDiscount && financials.missingHoursDiscount > 0) {
    tableData.push([
      `Desconto de Atrasos / Horas Faltantes (${financials.missingHoursFormatted || '0h00min'})`,
      financials.missingHoursFormatted || '0h00min',
      '-',
      formatCurrencyBR(financials.missingHoursDiscount),
    ]);
  }

  if (financials.totalExtraMinutes50 > 0 || financials.totalExtraMinutes100 > 0) {
    if (financials.totalExtraMinutes50 > 0) {
      tableData.push([
        `Horas Extras Apuradas (50% - Dias Úteis: ${formatMinutesToHoursAndMinutes(financials.totalExtraMinutes50)})`,
        'Hora × 1,5',
        formatCurrencyBR(financials.extraHours50Amount),
        '-',
      ]);
    }
    if (financials.totalExtraMinutes100 > 0) {
      tableData.push([
        `Horas Extras Apuradas (100% - Descanso/Feriado: ${formatMinutesToHoursAndMinutes(financials.totalExtraMinutes100)})`,
        'Hora × 2,0 (CLT Art. 70)',
        formatCurrencyBR(financials.extraHours100Amount),
        '-',
      ]);
    }
  } else if (financials.totalExtraMinutes > 0) {
    tableData.push([
      `Horas Extras Apuradas (${formatMinutesToHoursAndMinutes(financials.totalExtraMinutes)})`,
      'Hora × 1,5',
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

  const safeAjuda = financials.ajudaDeCusto !== undefined ? Number(financials.ajudaDeCusto) : 0.0;
  const baseEarnings = isProfessor
    ? (financials.salarioAulas || 0) + (financials.horaAtividade || 0) + (financials.dsr || 0)
    : financials.baseSalary;
  const totalGross =
    baseEarnings +
    financials.extraHoursAmount +
    (financials.manualAddition || 0) +
    safeAjuda;
  const totalDiscounts =
    financials.unjustifiedAbsencesDiscount +
    (financials.missingHoursDiscount || 0) +
    (financials.manualDiscount || 0);

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
}

export function generateReciboBolsaPDF(options: GenerateReciboBolsaPDFOptions): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  drawSingleReceiptPage(doc, options);
  applyPageNumbersAndFooters(doc, 'portrait');

  const userName = options.user?.name || options.closingRecord?.userName || 'Colaborador';
  const filename = `Recibo_Bolsa_${userName.replace(/[\/\s]+/g, '_')}_${String(options.month).padStart(2, '0')}_${options.year}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  const dataUrl = dataUri;
  const download = () => doc.save(filename);

  if (options.saveImmediately) {
    doc.save(filename);
  }

  return { doc, blob, blobUrl, dataUri, dataUrl, filename, download };
}

/**
 * Consolidates all employees' receipts into a SINGLE unified PDF document
 * with a page break (doc.addPage) between each employee.
 */
export function generateAllReceiptsPDF(
  optionsList: GenerateReciboBolsaPDFOptions[],
  customFilename?: string
): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  optionsList.forEach((opts, index) => {
    if (index > 0) {
      doc.addPage('a4', 'portrait');
    }
    drawSingleReceiptPage(doc, opts);
  });

  applyPageNumbersAndFooters(doc, 'portrait');

  const first = optionsList[0];
  const monthName = first ? getMonthNameBR(first.month) : 'Competencia';
  const year = first ? first.year : new Date().getFullYear();
  const filename = customFilename || `Recibos_Pagamento_LOTE_${monthName}_${year}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  const dataUrl = dataUri;
  const download = () => doc.save(filename);

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
  documentTitle?: string;
  onlyProvidedStudents?: boolean;
}

export function generateAttendanceDailyPDFReport({
  date,
  activityName,
  turma,
  students,
  records,
  teacherName,
  saveImmediately = false,
  documentTitle,
  onlyProvidedStudents = false,
}: GenerateAttendanceDailyPDFOptions): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const dateFormatted = formatDate(date);

  // If pre-filtered students are provided (or onlyProvidedStudents is true), use them directly
  const relevantStudents = onlyProvidedStudents
    ? [...students].sort((a, b) => {
        const turmaComp = (a.turma || '').localeCompare(b.turma || '', 'pt-BR', { numeric: true });
        if (turmaComp !== 0) return turmaComp;
        return a.name.localeCompare(b.name, 'pt-BR');
      })
    : students
        .filter((st) => {
          const acts = Array.isArray(st.activities) ? st.activities : [];
          const matchAct =
            activityName === 'TODAS' ||
            activityName === 'Rotina' ||
            acts.includes(activityName as ActivityType) ||
            (isReforcoActivity(activityName) && isStudentInReforcoVigency(st, date));
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
  let semEquip = 0;
  let pendente = 0;

  relevantStudents.forEach((st) => {
    const rec = records.find((r) => r.studentId === st.id && r.date === date && (activityName === 'TODAS' || !r.activity || r.activity === activityName));
    if (!rec) {
      pendente++;
    } else {
      if (rec.status === 'presente') pres++;
      else if (rec.status === 'saida_antecipada') saidaAnt++;
      else if (rec.status === 'falta') falta++;
      else if (rec.status === 'sem_equipamento') semEquip++;
    }
  });

  const total = relevantStudents.length;
  const presenceRate = total > 0 ? Math.round(((pres + saidaAnt) / total) * 100) : 100;

  // Header Title: formal title reflecting the activity or custom title
  const formalTitle = documentTitle || (
    activityName && activityName !== 'TODAS'
      ? `LISTA DE CHAMADA — ${activityName.toUpperCase()}`
      : 'LISTA DE CHAMADA & FREQUÊNCIA DIÁRIA'
  );

  // Header
  drawOfficialHeader(
    doc,
    formalTitle,
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
    { label: 'Sem Equip.', value: semEquip, color: [234, 88, 12] as [number, number, number] },
  ];
  drawMetricBoxes(doc, 14, startY, 43, 13.5, 3.3, metrics);

  startY += 18;

  // Table Data
  const tableData = relevantStudents.map((st, index) => {
    const rec = records.find((r) => r.studentId === st.id && r.date === date && (activityName === 'TODAS' || !r.activity || r.activity === activityName));
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
      3: { cellWidth: 40, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        const text = String(data.cell.raw || '');
        if (text.includes('Presente')) {
          data.cell.styles.textColor = [22, 163, 74]; // Green 600
          data.cell.styles.fontStyle = 'bold';
        } else if (text.includes('Falta')) {
          data.cell.styles.textColor = [220, 38, 38]; // Red 600
          data.cell.styles.fontStyle = 'bold';
        } else if (text.includes('Pendente')) {
          data.cell.styles.textColor = [217, 119, 6]; // Amber 600
          data.cell.styles.fontStyle = 'bold';
        } else if (text.includes('Saída')) {
          data.cell.styles.textColor = [180, 83, 9]; // Amber 700
          data.cell.styles.fontStyle = 'bold';
        } else if (text.includes('Sem Equipamento')) {
          data.cell.styles.textColor = [234, 88, 12]; // Orange 600
          data.cell.styles.fontStyle = 'bold';
        }
      }
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
  convertPastPendingToAbsence?: boolean;
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
  convertPastPendingToAbsence = true,
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
    targetTurmaParam,
    { convertPastPendingToAbsence }
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
    } • Matrículas Ativas no Escopo: ${consolidated.totalMatriculasAtivas} alunos • ${
      convertPastPendingToAbsence
        ? 'Regra: Pendências de chamadas passadas computadas como falta'
        : 'Regra: Exibição explícita de pendências'
    }`,
    18,
    startY + 19
  );

  startY += 28;

  const tableData = consolidated.dailyMetrics.map((day) => {
    let rateStr = '-';
    if (day.totalEsperados > 0 && day.apurados > 0) {
      rateStr = `${day.taxaPresenca}%`;
    } else if (day.apurados > 0) {
      rateStr = `${day.taxaApurada}%`;
    }

    return [
      `${formatDateBR(day.dateStr)} (${day.dayName})`,
      String(day.totalEsperados),
      String(day.presentes),
      String(day.faltas),
      String(day.pendentes),
      rateStr,
    ];
  });

  const totalEsperadosAcumulados = consolidated.totalEsperadosAcumulados;
  const totalPresencasAcumuladas = consolidated.totalPresentesAcumulados;
  const totalFaltasAcumuladas = consolidated.totalFaltasAcumuladas;
  const totalPendentesAcumulados = consolidated.totalPendentesAcumulados;
  const taxaGeral = consolidated.taxaPresencaGeral;

  // Metric Cards (5 cards proportionally distributed: 14 margin + 5 * 33.6 + 4 * 3.5 = 196mm)
  const metrics = [
    { label: 'Dias Letivos', value: `${consolidated.schoolDaysCount} d`, color: [15, 23, 42] as [number, number, number] },
    { label: 'Total Esperados', value: totalEsperadosAcumulados, color: [79, 70, 229] as [number, number, number] },
    { label: 'Presenças', value: totalPresencasAcumuladas, color: [22, 163, 74] as [number, number, number] },
    { label: 'Faltas', value: totalFaltasAcumuladas, color: [220, 38, 38] as [number, number, number] },
    {
      label: 'Pendentes',
      value: totalPendentesAcumulados,
      color: totalPendentesAcumulados > 0 ? ([194, 65, 12] as [number, number, number]) : ([100, 116, 139] as [number, number, number]),
    },
  ];
  drawMetricBoxes(doc, 14, startY, 33.6, 14, 3.5, metrics);

  startY += 18;

  // Main Numerical Table with Foot Row - Rigorous Mathematical Balance:
  // Presenças + Faltas + Pendentes === Total Esperados
  autoTable(doc, {
    startY,
    head: [['Data / Dia da Semana', 'Total Esperados', 'Presenças', 'Faltas', 'Pendentes', '% Assiduidade']],
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
        String(totalPendentesAcumulados),
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
      1: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 26, halign: 'center', textColor: [22, 163, 74], fontStyle: 'bold' },
      3: { cellWidth: 26, halign: 'center', textColor: [220, 38, 38], fontStyle: 'bold' },
      4: { cellWidth: 26, halign: 'center', textColor: [217, 119, 6], fontStyle: 'bold' },
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

/**
 * Generates the Official Meal Financial Report PDF (Relatório Financeiro de Refeições / Almoço)
 */
export function generateMealFinancialPDFReport(
  entries: Array<{
    date: string;
    dayLabel: string;
    isSchoolDay: boolean;
    totalEsperados?: number;
    systemCount?: number;
    manualCount: number;
    unitPrice: number;
    total: number;
    notes?: string;
  }>,
  periodLabel: string,
  config: {
    monthKey: string;
    startDate?: string;
    endDate?: string;
    defaultUnitPrice: number;
    contractCompany?: string;
    responsibleCoordinator?: string;
    coordinatorRole?: string;
    responsibleFinancial?: string;
    financialRole?: string;
    generalNotes?: string;
  },
  saveImmediately = false
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const totals = {
    totalMeals: entries.reduce((acc, curr) => acc + (Number(curr.manualCount) || 0), 0),
    totalAmount: entries.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0),
    attendedDays: entries.filter((e) => e.manualCount > 0).length,
  };

  const avgMeals = totals.attendedDays > 0 ? (totals.totalMeals / totals.attendedDays).toFixed(1) : '0';

  // 1. Header Oficial de 4 Níveis (Compacto)
  drawOfficialHeader(
    doc,
    'Relatório Financeiro de Refeições',
    `Prestador: ${config.contractCompany || 'Cantina e Nutrição Escolar'} • Prestação de Contas`,
    [`Período: ${periodLabel}`, `Preço Base: R$ ${config.defaultUnitPrice.toFixed(2)}`],
    'portrait'
  );

  let startY = 31;

  // 2. Summary Metric Boxes (5 caixas compactas - sem coluna de esperados)
  const metrics = [
    { label: 'Dias com Almoço', value: `${totals.attendedDays} dias`, color: [15, 23, 42] as [number, number, number] },
    { label: 'Total Refeições', value: `${totals.totalMeals} un`, color: [79, 70, 229] as [number, number, number] },
    { label: 'Média Diária', value: `${avgMeals} al/dia`, color: [14, 116, 144] as [number, number, number] },
    { label: 'Valor Unitário', value: `R$ ${config.defaultUnitPrice.toFixed(2)}`, color: [217, 119, 6] as [number, number, number] },
    {
      label: 'Total a Pagar',
      value: `R$ ${totals.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      color: [22, 163, 74] as [number, number, number],
    },
  ];
  drawMetricBoxes(doc, 14, startY, 34, 9.5, 3, metrics);

  startY += 12;

  // 3. Prepare Table Data (Sem coluna de esperados, exibindo refeições faturadas)
  const tableData = entries.map((e) => {
    const formattedTotal = `R$ ${e.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formattedUnit = `R$ ${e.unitPrice.toFixed(2)}`;
    const obs = e.notes || (e.isSchoolDay ? 'Dia Letivo' : 'Não Letivo');

    return [
      `${formatDateBR(e.date)} (${e.dayLabel.split('-')[0]})`,
      obs,
      String(e.manualCount),
      formattedUnit,
      formattedTotal,
    ];
  });

  const totalGeralStr = `R$ ${totals.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  autoTable(doc, {
    startY,
    head: [['Data / Dia', 'Situação / Observação', 'Alunos / Refeições', 'Valor Unitário', 'Total Diário']],
    body: tableData,
    foot: [
      [
        'TOTAL GERAL DO PERÍODO',
        `Consolidado (${totals.attendedDays} dias faturados)`,
        `${totals.totalMeals} un`,
        '-',
        totalGeralStr,
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.0,
      cellPadding: [1.0, 1.6],
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 6.3,
      textColor: [51, 65, 85],
      cellPadding: [0.8, 1.4],
    },
    footStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.0,
      cellPadding: [1.0, 1.6],
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 30, halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74] },
    },
    margin: { top: 43, bottom: 25, left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === 'foot' && data.column.index === 0) {
        data.cell.styles.halign = 'left';
      }
      if (data.section === 'foot' && data.column.index === 4) {
        data.cell.styles.textColor = [52, 211, 153]; // emerald-400
      }
    },
  });

  // Signatures estritamente na mesma folha (Single-page A4)
  const finalY = (doc as any).lastAutoTable?.finalY || 190;

  if (config.generalNotes && config.generalNotes.trim()) {
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text(`Observações: ${config.generalNotes.trim()}`, 14, Math.min(finalY + 3.5, 246));
  }

  // Posiciona as assinaturas de forma fixa no rodapé da folha sem estourar
  const sigY = Math.min(Math.max(finalY + 12, 250), 266);

  // Linhas de Assinatura (Apenas 2: Coordenação e Financeiro)
  doc.setDrawColor(148, 163, 184); // slate-400
  doc.setLineWidth(0.3);
  doc.line(20, sigY, 90, sigY);
  doc.line(120, sigY, 190, sigY);

  // Assinatura 1 - Coordenação do Integral
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(
    config.responsibleCoordinator || 'Fernando Veiga',
    55,
    sigY + 4,
    { align: 'center' }
  );

  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(
    config.coordinatorRole || 'Coordenação do Integral / DP GAVAR',
    55,
    sigY + 7.5,
    { align: 'center' }
  );

  // Assinatura 2 - Departamento Financeiro
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(
    config.responsibleFinancial || 'Departamento Financeiro',
    155,
    sigY + 4,
    { align: 'center' }
  );

  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(
    config.financialRole || 'Conferência & Prestação de Contas',
    155,
    sigY + 7.5,
    { align: 'center' }
  );

  // Garante estritamente 1 única folha A4 eliminando qualquer quebra de página involuntária
  while (doc.getNumberOfPages() > 1) {
    doc.deletePage(doc.getNumberOfPages());
  }

  applyPageNumbersAndFooters(doc, 'portrait');

  const cleanPeriod = periodLabel.replace(/[\/\s:]+/g, '_');
  const filename = `Relatorio_Financeiro_Refeicoes_${cleanPeriod}.pdf`;

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
 * ============================================================================
 * GERADOR DE PDF OFICIAL - SEMANÁRIO PEDAGÓGICO (PROGRAMA INTEGRAL)
 * Cabeçalho Institucional Oficial de 4 Níveis do Instituto Educacional Crescer
 * ============================================================================
 */
export function generateSemanarioPDFReport(
  plans: SemanarioPlan[],
  weekInfo: WeekInfo,
  selectedTurma: string = 'all',
  selectedDay: string = 'all',
  currentUser?: UserProfile | null,
  saveImmediately: boolean = false,
  availableTurmas?: string[],
  students?: Student[],
  schedules?: ScheduleBlock[]
): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const leftMargin = 14;
  const rightMargin = 196;
  const printableWidth = rightMargin - leftMargin;

  const dayLabels: Record<string, string> = {
    segunda: 'Segunda-feira',
    terca: 'Terça-feira',
    quarta: 'Quarta-feira',
    quinta: 'Quinta-feira',
    sexta: 'Sexta-feira',
  };

  const dayOrder: Array<{ id: DayOfWeek; label: string }> = [
    { id: 'segunda', label: 'Segunda-feira' },
    { id: 'terca', label: 'Terça-feira' },
    { id: 'quarta', label: 'Quarta-feira' },
    { id: 'quinta', label: 'Quinta-feira' },
    { id: 'sexta', label: 'Sexta-feira' },
  ];

  const activeDays = selectedDay === 'all'
    ? dayOrder
    : dayOrder.filter((d) => d.id === selectedDay);

  // Determina lista de turmas a processar:
  // Se for uma turma específica ('selectedTurma !== all'): apenas ela.
  // Se for 'all': todas as turmas presentes nos planos ou registradas, ordenadas pedagogicamente.
  let turmasToProcess: string[] = [];
  if (selectedTurma && selectedTurma !== 'all') {
    turmasToProcess = [selectedTurma];
  } else {
    const fromPlans = Array.from(new Set(plans.map((p) => p.turma).filter(Boolean)));
    const candidateList = fromPlans.length > 0 ? fromPlans : (availableTurmas || []);
    turmasToProcess = sortTurmasPedagogical(candidateList);
    if (turmasToProcess.length === 0) {
      turmasToProcess = ['Todas as Turmas'];
    }
  }

  // =========================================================================
  // QUEBRA DE PÁGINA OBRIGATÓRIA POR TURMA NO RELATÓRIO CONSOLIDADO:
  // Cada turma começa rigorosamente no topo de uma nova página (doc.addPage()).
  // NUNCA duas turmas diferentes compartilham a mesma folha/página.
  // =========================================================================
  turmasToProcess.forEach((turmaName, turmaIndex) => {
    if (turmaIndex > 0) {
      doc.addPage();
    }

    const turmaPlans = plans.filter((p) => p.turma === turmaName);

    // Filter labels for Header Tier 4
    const filterDetails: string[] = [
      `Semana ${weekInfo.weekNumber} (${formatDateBR(weekInfo.startDate)} a ${formatDateBR(weekInfo.endDate)})`,
      `Turma: ${turmaName}`,
    ];
    if (selectedDay && selectedDay !== 'all') {
      filterDetails.push(`Dia: ${dayLabels[selectedDay] || selectedDay}`);
    } else {
      filterDetails.push('Compilação Semanal (Segunda a Sexta)');
    }

    // Draw the official 4-tier institutional header for this turma
    drawOfficialHeader(
      doc,
      'Semanário de Atividades',
      'Planejamento Semanal de Atividades',
      filterDetails,
      'portrait'
    );

    let currentY = 36;

    // KPI Metrics Banner for this Turma
    const total = turmaPlans.length;
    const realizadas = turmaPlans.filter((p) => p.status === 'realizada').length;
    const pendentes = turmaPlans.filter((p) => p.status === 'pendente').length;
    const substituidas = turmaPlans.filter((p) => p.status === 'substituida').length;
    const taxa = total > 0 ? Math.round((realizadas / total) * 100) : 0;

    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(leftMargin, currentY, printableWidth, 14, 2, 2, 'FD');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(`RESUMO DA TURMA — ${turmaName.toUpperCase()}:`, leftMargin + 4, currentY + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(
      `Total de Propostas: ${total}   |   Realizadas: ${realizadas} (${taxa}%)   |   Pendentes: ${pendentes}   |   Substituídas: ${substituidas}`,
      leftMargin + 4,
      currentY + 10.5
    );

    currentY += 18;

    if (turmaPlans.length === 0) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 116, 139);
      doc.text('Nenhuma proposta pedagógica cadastrada para esta turma no filtro selecionado.', leftMargin, currentY + 10);
      currentY += 25;
    } else {
      activeDays.forEach((day) => {
        const dayPlans = turmaPlans.filter((p) => p.dayOfWeek === day.id);
        if (dayPlans.length === 0) return;

        // Ordenação estritamente cronológica por horário de início (Time-Based Parsing)
        // Garante a sequência da linha do tempo diária da escola (Acolhimento -> Atividade -> Almoço -> Lanche -> Saída)
        const sortedDayPlans = [...dayPlans].sort((a, b) => {
          const minA = getStartMinutes(a);
          const minB = getStartMinutes(b);
          if (minA !== minB) return minA - minB;
          return (a.title || a.category || '').localeCompare(b.title || b.category || '', 'pt-BR');
        });

        // Check for page overflow inside the same turma
        if (currentY > 230) {
          doc.addPage();
          drawOfficialHeader(
            doc,
            'Semanário de Atividades',
            'Planejamento Semanal de Atividades',
            filterDetails,
            'portrait'
          );
          currentY = 36;
        }

        // Day Header Section
        doc.setFillColor(30, 41, 59); // slate-800
        doc.roundedRect(leftMargin, currentY, printableWidth, 7, 1.5, 1.5, 'F');
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(
          `${day.label.toUpperCase()} (${sortedDayPlans.length} ${sortedDayPlans.length === 1 ? 'atividade' : 'atividades'})`,
          leftMargin + 4,
          currentY + 5
        );

        currentY += 9;

        // Table of Proposals for this Day in this Turma (Ordenadas cronologicamente)
        const tableRows = sortedDayPlans.map((p) => {
          let statusStr = 'Pendente';
          if (p.status === 'realizada') statusStr = 'Realizada';
          if (p.status === 'substituida') {
            statusStr = p.substitutionReason ? `Substituída (${p.substitutionReason})` : 'Substituída';
          }

          // Injeção Estrita de Alunos de Reforço: Apenas no bloco de 'Reforço e Lego' no dia e horário corretos
          let reforcoNote = '';
          if (Array.isArray(students) && students.length > 0 && isReforcoActivity(p)) {
            const reforcoList = getReforcoStudentsForCard(p, students, schedules);
            if (reforcoList.length > 0) {
              const studentNames = reforcoList.map((s) => s.name).join(', ');
              reforcoNote = `[MODALIDADE PARALELA • REFORÇO ESCOLAR]\nAlunos convocados para a sala de Reforço (${reforcoList.length}): ${studentNames}`;
            }
          }

          const detailsText = [
            `Horário: ${p.timeSlot || 'Integral'} • Responsável: ${p.teacherName || p.monitors || p.adiResponsible || 'Monitora'}`,
            reforcoNote,
            p.objectives ? `Proposta / Intenção: ${p.objectives}` : '',
            p.development ? `${p.development}` : '',
            p.materials ? `Materiais: ${p.materials}` : '',
          ]
            .filter(Boolean)
            .join('\n\n');

          const timePrefix = p.timeSlot ? `${p.timeSlot}\n` : '';

          return [
            `${timePrefix}${p.category}\n[${statusStr}]`,
            `${p.title.toUpperCase()}\n\n${detailsText}`,
          ];
        });

        autoTable(doc, {
          startY: currentY,
          head: [['Horário • Categoria / Status', 'Proposta Pedagógica & Desenvolvimento']],
          body: tableRows,
          theme: 'grid',
          headStyles: {
            fillColor: [71, 85, 105], // slate-600
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 7.5,
            cellPadding: 2,
          },
          bodyStyles: {
            fontSize: 7,
            cellPadding: 2.5,
            textColor: [30, 41, 59],
            valign: 'top',
          },
          columnStyles: {
            0: { cellWidth: 42, fontStyle: 'bold' },
            1: { cellWidth: 140 },
          },
          margin: { left: leftMargin, right: 14 },
          didDrawPage: (data) => {
            currentY = data.cursor?.y || currentY;
          },
        });

        currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 6 : currentY + 10;
      });
    }

    // Assinaturas para cada turma ao final de sua seção
    if (currentY > 245) {
      doc.addPage();
      drawOfficialHeader(
        doc,
        'Semanário de Atividades',
        'Planejamento Semanal de Atividades',
        filterDetails,
        'portrait'
      );
      currentY = 36;
    }

    const sigY = Math.max(currentY + 10, 256);

    doc.setDrawColor(148, 163, 184); // slate-400
    doc.setLineWidth(0.3);
    doc.line(20, sigY, 90, sigY);
    doc.line(120, sigY, 190, sigY);

    // Assinatura 1 - Coordenação
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Fernando Veiga', 55, sigY + 4, { align: 'center' });

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Coordenação do Programa Integral / DP GAVAR', 55, sigY + 7.5, { align: 'center' });

    // Assinatura 2 - Monitoria / Professora
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(currentUser?.name || 'Professora / Monitora Responsável', 155, sigY + 4, { align: 'center' });

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Equipe Pedagógica • ${turmaName}`, 155, sigY + 7.5, { align: 'center' });
  });

  applyPageNumbersAndFooters(doc, 'portrait');

  const cleanTurma = selectedTurma === 'all' ? 'Todas_Turmas' : selectedTurma.replace(/[\/\s:]+/g, '_');
  const cleanDay = selectedDay !== 'all' ? `_${selectedDay}` : '_Semana_Completa';
  const filename = `Semanario_Integral_Semana_${weekInfo.weekNumber}_${cleanTurma}${cleanDay}.pdf`;

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
 * Renderiza uma textura sutil com padrão de linhas diagonais a 45º para indicar
 * visualmente que a célula pertence ao mês anterior ou posterior (#E2E8F0 sobre #F9FAFB).
 */
function drawOutOfMonthCellPattern(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const x0 = x + 0.2;
  const y0 = y + 0.2;
  const x1 = x + width - 0.2;
  const y1 = y + height - 0.2;
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return;

  doc.setDrawColor(226, 232, 240); // #E2E8F0 (slate-200, padrão suave e discreto)
  doc.setLineWidth(0.15);

  const spacing = 5; // mm entre linhas diagonais
  const minC = y0 - x1;
  const maxC = y1 - x0;
  const startC = Math.floor(minC / spacing) * spacing;

  for (let c = startC; c <= maxC; c += spacing) {
    const pts: { x: number; y: number }[] = [];

    // Borda superior: y = y0 => x = y0 - c
    const xTop = y0 - c;
    if (xTop >= x0 && xTop <= x1) pts.push({ x: xTop, y: y0 });

    // Borda inferior: y = y1 => x = y1 - c
    const xBottom = y1 - c;
    if (xBottom >= x0 && xBottom <= x1) pts.push({ x: xBottom, y: y1 });

    // Borda esquerda: x = x0 => y = x0 + c
    const yLeft = x0 + c;
    if (yLeft > y0 && yLeft < y1) pts.push({ x: x0, y: yLeft });

    // Borda direita: x = x1 => y = x1 + c
    const yRight = x1 + c;
    if (yRight > y0 && yRight < y1) pts.push({ x: x1, y: yRight });

    if (pts.length >= 2) {
      doc.line(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
    }
  }
}

/**
 * Renderiza um ícone discreto no centro da célula fora do mês vigente (célula limpa/neutra).
 */
function drawOutOfMonthDiscreteIcon(doc: jsPDF, cx: number, cy: number) {
  // Selo circular branco discreto com borda suave
  const radius = 3.2;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setLineWidth(0.2);
  doc.circle(cx, cy, radius, 'FD');

  // Traço minimalista discreto em slate-400
  doc.setDrawColor(148, 163, 184); // slate-400
  doc.setLineWidth(0.4);
  doc.line(cx - 1.5, cy, cx + 1.5, cy);
}

/**
 * Gera o Cardápio Mensal em PDF formato A4 Paisagem (Horizontal), exatamente
 * como o modelo impresso da Nutricionista (5 semanas, Segunda a Sexta).
 */
export function generateCardapioMensalPDF(
  menu: MonthlyMenu,
  saveImmediately = false
): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297;
  const pageHeight = 210;

  // Header Background bar
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Logo Crescer
  const logoData = getLogoDataUrl();
  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', 12, 4, 38, 18);
    } catch (e) {
      console.warn('Erro ao inserir logo no PDF do cardápio:', e);
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(22, 101, 52);
    doc.text('COLÉGIO CRESCER', 12, 14);
  }

  // Título Centralizado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(22, 101, 52); // Dark Green
  doc.text('CARDÁPIO MENSAL', pageWidth / 2, 9, { align: 'center' });

  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(`${menu.monthName} ${menu.year}`, pageWidth / 2, 15, { align: 'center' });

  // Nome da Nutricionista e CRN na mesma linha
  const formatPdfCrn = (rawCrn?: string) => {
    if (!rawCrn || !rawCrn.trim()) return 'CRN: 84367';
    const trimmed = rawCrn.trim();
    return /^CRN/i.test(trimmed) ? trimmed : `CRN: ${trimmed}`;
  };
  const crnLabel = formatPdfCrn(menu.crn);
  const nutriName = menu.nutritionistName || 'Thaís Grisoni Baroni';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${nutriName} - ${crnLabel}`, pageWidth / 2, 22, { align: 'center' });

  // Tabela de Cardápio (5 colunas + 1 lateral de semana)
  // Monta as linhas para 1ª à 5ª semana
  const daysByWeek: Record<number, MenuItemDay[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  const sortedDays = Object.values(menu.days).sort((a, b) => a.date.localeCompare(b.date));

  sortedDays.forEach((d) => {
    if (d.weekIndex >= 1 && d.weekIndex <= 5) {
      daysByWeek[d.weekIndex].push(d);
    }
  });

  // Resolução do mês e ano vigentes do cardápio para validação de dias fora do mês
  const targetMonth = menu.month || (menu.monthKey ? parseInt(menu.monthKey.split('-')[1], 10) : 0);
  const targetYear = menu.year || (menu.monthKey ? parseInt(menu.monthKey.split('-')[0], 10) : 0);

  const isOutOfMonthDay = (item?: MenuItemDay): boolean => {
    if (!item) return true;
    if (item.month && targetMonth && item.month !== targetMonth) return true;
    if (item.year && targetYear && item.year !== targetYear) return true;
    if (item.date) {
      const parts = item.date.split('-');
      if (parts.length >= 2) {
        const itemY = parseInt(parts[0], 10);
        const itemM = parseInt(parts[1], 10);
        if (targetMonth && itemM !== targetMonth) return true;
        if (targetYear && itemY !== targetYear) return true;
      }
    }
    return false;
  };

  const cleanMenuText = (str?: string): string => {
    if (!str) return '';
    return str.replace(/\*/g, '').trim();
  };

  const weekHeaders = ['SEMANA', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA'];

  const tableBody: string[][] = [];

  for (let w = 1; w <= 5; w++) {
    const daysInWeek = daysByWeek[w] || [];
    const order = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
    const row: string[] = [`${w}ª SEMANA`];

    order.forEach((dayName) => {
      const item = daysInWeek.find((d) => d.dayOfWeek === dayName);
      if (isOutOfMonthDay(item)) {
        // Célula fora do mês vigente (mês anterior/posterior): NÃO exibe data nem prato
        row.push('');
      } else if (item.isHoliday) {
        row.push(`DIA ${item.dayNumber}\n\n${cleanMenuText(item.holidayDescription || 'FERIADO')}`);
      } else {
        const parts: string[] = [];
        const rice = cleanMenuText(item.base?.[0] || 'Arroz Branco');
        parts.push(`DIA ${item.dayNumber} - ${rice}`);
        if (item.base?.[1]) parts.push(cleanMenuText(item.base[1]));
        const extraBase = cleanMenuText(item.base3 || item.base?.[2]);
        if (extraBase) parts.push(extraBase);
        if (item.protein) parts.push(cleanMenuText(item.protein));
        if (item.garnish) parts.push(cleanMenuText(item.garnish));
        const salad = cleanMenuText(item.salad || '');
        if (salad) parts.push(salad);
        const dessert = cleanMenuText(item.dessert || '');
        if (dessert) parts.push(dessert);
        const obs = cleanMenuText(item.observations || item.specialNotes);
        if (obs) {
          parts.push(obs.toLowerCase().startsWith('obs:') ? obs : `Obs: ${obs}`);
        }
        row.push(parts.join('\n'));
      }
    });

    tableBody.push(row);
  }

  autoTable(doc, {
    startY: 28,
    head: [weekHeaders],
    body: tableBody,
    theme: 'grid',
    margin: { left: 10, right: 10 },
    styles: {
      fontSize: 8.0,
      cellPadding: 2.2,
      lineColor: [30, 41, 59],
      lineWidth: 0.25,
      textColor: [15, 23, 42],
      valign: 'middle',
      halign: 'center',
    },
    headStyles: {
      fillColor: [22, 101, 52], // Deep Green
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 8.8,
      cellPadding: 2.5,
    },
    columnStyles: {
      0: {
        cellWidth: 24,
        fillColor: [22, 101, 52],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        fontSize: 8.0,
      },
      1: { cellWidth: 50.6, halign: 'center' },
      2: { cellWidth: 50.6, halign: 'center' },
      3: { cellWidth: 50.6, halign: 'center' },
      4: { cellWidth: 50.6, halign: 'center' },
      5: { cellWidth: 50.6, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index > 0) {
        const weekNum = data.row.index + 1;
        const order = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
        const dayName = order[data.column.index - 1];
        const daysInWeek = daysByWeek[weekNum] || [];
        const item = daysInWeek.find((d) => d.dayOfWeek === dayName);

        if (isOutOfMonthDay(item)) {
          // Fundo com tonalidade neutra (cinza muito claro #F9FAFB)
          data.cell.styles.fillColor = [249, 250, 251];
          data.cell.styles.textColor = [203, 213, 225];
        } else if (typeof data.cell.raw === 'string' && (data.cell.raw.includes('FERIADO') || data.cell.raw.includes('RECESSO'))) {
          data.cell.styles.fillColor = [254, 240, 138];
          data.cell.styles.textColor = [161, 98, 7];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.halign = 'center';
        }
      }
    },
    willDrawCell: (data) => {
      // Para células do cardápio (colunas 1 a 5), esvazia text padrão para renderizar customizado no didDrawCell
      if (data.section === 'body' && data.column.index > 0) {
        data.cell.text = [];
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index === 0) return;

      const weekNum = data.row.index + 1;
      const order = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
      const dayName = order[data.column.index - 1];
      const daysInWeek = daysByWeek[weekNum] || [];
      const item = daysInWeek.find((d) => d.dayOfWeek === dayName);

      const cell = data.cell;
      const centerX = cell.x + cell.width / 2;
      const centerY = cell.y + cell.height / 2;

      // =========================================================================
      // TRATAMENTO VISUAL: CÉLULAS FORA DO MÊS VIGENTE (MÊS ANTERIOR / POSTERIOR)
      // =========================================================================
      if (isOutOfMonthDay(item)) {
        // 1. Fundo com tonalidade neutra (cinza muito claro #F9FAFB)
        doc.setFillColor(249, 250, 251);
        doc.rect(cell.x + 0.15, cell.y + 0.15, cell.width - 0.3, cell.height - 0.3, 'F');

        // 2. Aplicação de padrão suave / textura sutil de linhas diagonais a 45º (#E2E8F0)
        drawOutOfMonthCellPattern(doc, cell.x, cell.y, cell.width, cell.height);

        // 3. Ícone discreto central / indicador de célula limpa fora do mês
        drawOutOfMonthDiscreteIcon(doc, centerX, centerY);
        return;
      }

      if (!item) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(148, 163, 184);
        doc.text('-', centerX, cell.y + cell.height / 2, { align: 'center', baseline: 'middle' });
        return;
      }

      if (item.isHoliday) {
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(161, 98, 7);
        const holY = cell.y + cell.height / 2 - 2.5;
        doc.text(`DIA ${item.dayNumber}`, centerX, holY, { align: 'center' });

        doc.setFontSize(8.0);
        doc.text(cleanMenuText(item.holidayDescription || 'FERIADO'), centerX, holY + 4.8, {
          align: 'center',
          maxWidth: cell.width - 4,
        });
        return;
      }

      // Cardápio normal do dia
      const dayPart = `DIA ${item.dayNumber}`;
      const riceText = cleanMenuText(item.base?.[0] || 'Arroz Branco');
      const ricePart = ` - ${riceText}`;

      const remainingLines: string[] = [];
      if (item.base?.[1]) {
        remainingLines.push(cleanMenuText(item.base[1]));
      }
      const extraBase = cleanMenuText(item.base3 || item.base?.[2]);
      if (extraBase) {
        remainingLines.push(extraBase);
      }
      if (item.protein) {
        remainingLines.push(cleanMenuText(item.protein));
      }
      if (item.garnish) {
        remainingLines.push(cleanMenuText(item.garnish));
      }
      const salad = cleanMenuText(item.salad || '');
      if (salad) {
        remainingLines.push(salad);
      }
      const dessert = cleanMenuText(item.dessert || '');
      if (dessert) {
        remainingLines.push(dessert);
      }

      const obsRaw = cleanMenuText(item.observations || item.specialNotes);
      const obsText = obsRaw
        ? (obsRaw.toLowerCase().startsWith('obs:') ? obsRaw : `Obs: ${obsRaw}`)
        : '';

      const totalLinesCount = 1 + remainingLines.length + (obsText ? 1 : 0);
      const lineHeight = totalLinesCount >= 7 ? 3.2 : 3.4;
      const totalBlockHeight = totalLinesCount * lineHeight;
      let curY = cell.y + (cell.height - totalBlockHeight) / 2 + (totalLinesCount >= 7 ? 2.2 : 2.5);

      // Linha 1: "DIA X" em NEGRITO e " - Arroz Branco" em NORMAL
      doc.setFontSize(totalLinesCount >= 7 ? 7.6 : 8.0);
      doc.setFont('helvetica', 'bold');
      const dayW = doc.getTextWidth(dayPart);
      doc.setFont('helvetica', 'normal');
      const riceW = doc.getTextWidth(ricePart);
      const line1W = dayW + riceW;
      const line1X = cell.x + (cell.width - line1W) / 2;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(dayPart, line1X, curY);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85); // slate-700
      doc.text(ricePart, line1X + dayW, curY);

      // Demais itens centralizados harmonicamente no corpo da célula
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(totalLinesCount >= 7 ? 7.2 : 7.6);
      doc.setTextColor(51, 65, 85);

      remainingLines.forEach((line) => {
        curY += lineHeight;
        doc.text(line, centerX, curY, { align: 'center', maxWidth: cell.width - 4 });
      });

      // Linha de Observações / Alergênicos na parte inferior da célula em itálico
      if (obsText) {
        curY += lineHeight + 0.15;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(totalLinesCount >= 7 ? 6.7 : 7.0);
        doc.setTextColor(180, 83, 9);
        doc.text(obsText, centerX, curY, { align: 'center', maxWidth: cell.width - 4 });
      }
    },
  });

  // Footer bar
  const footerY = pageHeight - 8;
  doc.setDrawColor(22, 101, 52);
  doc.setLineWidth(0.8);
  doc.line(10, footerY - 3, pageWidth - 10, footerY - 3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(22, 101, 52);
  doc.text(`Nutricionista: ${nutriName} - ${crnLabel}`, 12, footerY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Instituto Educacional Crescer`, pageWidth - 12, footerY, { align: 'right' });

  const filename = `Cardapio_Mensal_${menu.monthName}_${menu.year}.pdf`;
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
 * Gera o Caderno de Receitas da Oficina de Culinária em PDF formato A4
 */
export function generateReceitasCulinariaPDF(
  monthKey: string,
  monthName: string,
  year: number,
  recipes: CookingRecipe[],
  saveImmediately = false,
  nutritionistName?: string,
  crn?: string,
  holidays?: HolidayItem[]
): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;

  // Resolução do calendário escolar institucional de feriados e recessos
  const activeHolidays = holidays && holidays.length > 0 ? holidays : loadHolidays();
  const monthNum = parseInt(monthKey.split('-')[1], 10) || 9;

  // Header Banner
  doc.setFillColor(240, 253, 244);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setDrawColor(34, 197, 94);
  doc.setLineWidth(1);
  doc.line(0, 32, pageWidth, 32);

  // Logo Crescer
  const logoData = getLogoDataUrl();
  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', 12, 5, 32, 15);
    } catch (e) {
      console.warn('Erro ao inserir logo no PDF de culinária:', e);
    }
  }

  // Header Titles (Centralizados)
  const centerX = pageWidth / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(22, 101, 52);
  doc.text('OFICINAS DE CULINÁRIA', centerX, 14, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`RECEITAS - ${monthName.toUpperCase()} DE ${year}`, centerX, 22.5, { align: 'center' });

  let currentY = 38;

  recipes.forEach((recipe, idx) => {
    // Sincronização e validação das datas com o calendário escolar
    const weekNum = (recipe.weekNumber || (idx + 1)) as 1 | 2 | 3 | 4 | 5;
    const weekCalc = calculateCookingWorkshopDates(year, monthNum, weekNum, activeHolidays);
    const displayDatesLabel = recipe.datesLabel || weekCalc.datesLabel;
    const displayWeekLabel = recipe.weekLabel || weekCalc.weekLabel;

    // 1. Pre-calculate text wrapping and height
    let totalIngLines = 0;
    recipe.ingredients.forEach((ing) => {
      const lines = doc.splitTextToSize(`• ${ing}`, 64);
      totalIngLines += lines.length;
    });
    const ingBlockHeight = 5 + totalIngLines * 4.0;

    let totalPrepLines = 0;
    recipe.instructions.forEach((step, sIdx) => {
      const stepText = `${sIdx + 1}. ${step}`;
      const lines = doc.splitTextToSize(stepText, 96);
      totalPrepLines += lines.length;
    });
    const prepBlockHeight = 5 + totalPrepLines * 4.0 + (recipe.instructions.length * 1.2);

    const columnsHeight = Math.max(ingBlockHeight, prepBlockHeight);

    const metaParts: string[] = [];
    if (recipe.prepTime) metaParts.push(`Preparo: ${recipe.prepTime}`);
    if (recipe.servings) metaParts.push(`Rendimento: ${recipe.servings}`);
    if (recipe.allergens && recipe.allergens.length > 0) {
      metaParts.push(`Alérgenos: ${recipe.allergens.join(', ')}`);
    }
    const hasMeta = metaParts.length > 0;
    const footerMetaHeight = hasMeta ? 9 : 2;

    const topBarHeight = 9;
    const titleHeight = 8;
    const totalCardHeight = topBarHeight + titleHeight + columnsHeight + footerMetaHeight + 4;

    // Page overflow check
    if (currentY + totalCardHeight > pageHeight - 18) {
      doc.addPage();
      currentY = 16;
    }

    // Card Outer Box
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.roundedRect(12, currentY, pageWidth - 24, totalCardHeight, 3, 3, 'FD');

    // Card Top Header Bar (Semana & Datas)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(12, currentY, pageWidth - 24, topBarHeight, 3, 3, 'F');
    doc.rect(12, currentY + 5, pageWidth - 24, 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(`${displayWeekLabel} • ${displayDatesLabel}`, 16, currentY + 6.2);

    // Indicador visual de ajuste de datas decorrente do calendário escolar
    if (weekCalc.hasHolidayInCookingDays) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(180, 83, 9);
      doc.text('(Data validada pelo Calendário Escolar)', pageWidth - 16, currentY + 6.2, { align: 'right' });
    }

    // Recipe Title (sem rendimento abaixo)
    doc.setFontSize(11.5);
    doc.setTextColor(22, 101, 52);
    doc.text(recipe.title, 16, currentY + 15);

    // Column headers & content
    const contentStartY = currentY + topBarHeight + titleHeight + 1;

    // Left column: Ingredientes
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Ingredientes:', 16, contentStartY + 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    let ingY = contentStartY + 7.5;
    recipe.ingredients.forEach((ing) => {
      const splitIng = doc.splitTextToSize(`• ${ing}`, 64);
      splitIng.forEach((line: string) => {
        doc.text(line, 16, ingY);
        ingY += 4.0;
      });
    });

    // Right column: Modo de Preparo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Modo de Preparo:', 88, contentStartY + 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    let prepY = contentStartY + 7.5;
    recipe.instructions.forEach((step, sIdx) => {
      const stepText = `${sIdx + 1}. ${step}`;
      const splitStep = doc.splitTextToSize(stepText, 102);
      splitStep.forEach((line: string) => {
        doc.text(line, 88, prepY);
        prepY += 4.0;
      });
      prepY += 1.2;
    });

    // Informações / Rendimento reposicionados APÓS o modo de preparo
    if (hasMeta) {
      const metaY = contentStartY + columnsHeight + 2;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(16, metaY, pageWidth - 16, metaY);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(metaParts.join('   •   '), 16, metaY + 4.5);
    }

    currentY += totalCardHeight + 5;
  });

  const formatPdfCrn = (rawCrn?: string) => {
    if (!rawCrn || !rawCrn.trim()) return 'CRN: 84367';
    const trimmed = rawCrn.trim();
    return /^CRN/i.test(trimmed) ? trimmed : `CRN: ${trimmed}`;
  };
  const nutriName = nutritionistName || 'Thaís Grisoni Baroni';
  const crnLabel = formatPdfCrn(crn);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerY = pageHeight - 10;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(12, footerY - 3, pageWidth - 12, footerY - 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Nutricionista Responsável: ${nutriName} - ${crnLabel}`, 14, footerY);
    doc.text('Instituto Educacional Crescer • Modalidade Culinária', pageWidth - 14, footerY, { align: 'right' });
  }

  const filename = `Oficina_Culinaria_Receitas_${monthName}_${year}.pdf`;
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
 * Gera o documento PDF oficial formatado para o Quadro Geral de Atribuições
 */
export function generateQuadroAtribuicoesPDF(
  atribuicoes: TurmaAtribuicao[],
  saveImmediately: boolean = true
): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297;
  const pageHeight = 210;

  // Cabeçalho oficial compacto horizontal
  drawCompactOfficialHeader(
    doc,
    'QUADRO GERAL DE ATRIBUIÇÕES',
    'Distribuição de Turmas, Monitoras, Monitoras Assistentes e ADIs',
    [
      `Total de Turmas: ${atribuicoes.length}`,
      'Ano Letivo: 2026',
      'Turnos: Conforme Atribuição (10:20 / 11:30 / 11:40 às 17:20-17:40)',
    ],
    'landscape'
  );

  const tableRows = atribuicoes.map((item) => {
    const monitoraDisplay = item.monitoraName
      ? `${item.monitoraName}${item.monitoraPhone ? `\nTel: ${item.monitoraPhone}` : ''}`
      : '—';

    const monitoraAssistenteDisplay = item.monitoraAssistenteName
      ? `${item.monitoraAssistenteName}${item.monitoraAssistentePhone ? `\nTel: ${item.monitoraAssistentePhone}` : ''}`
      : '—';

    const adiDisplay = item.adiName
      ? `${item.adiName}${item.adiPhone ? `\nTel: ${item.adiPhone}` : ''}`
      : '—';

    const espacoDisplay = item.espacoBase || '—';
    const horarioDisplay = (item.horarioTurno && item.horarioTurno.trim() !== '')
      ? item.horarioTurno.trim()
      : getDefaultHorarioTurnoForTurma(item.turma);
    const obsDisplay = item.observacao || '—';

    return [
      item.turma,
      monitoraDisplay,
      monitoraAssistenteDisplay,
      adiDisplay,
      espacoDisplay,
      horarioDisplay,
      obsDisplay,
    ];
  });

  autoTable(doc, {
    startY: 25,
    head: [
      [
        'Turma',
        'Monitora Titular',
        'Monitora Assistente',
        'Sua ADI (Apoio)',
        'Espaço Base',
        'Turno / Horário',
        'Observações',
      ],
    ],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [180, 83, 9], // amber-700
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59], // slate-800
      cellPadding: 2.5,
      valign: 'middle',
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 38, textColor: [15, 23, 42] }, // Turma
      1: { cellWidth: 44 }, // Monitora Titular
      2: { cellWidth: 44 }, // Monitora Assistente
      3: { cellWidth: 40 }, // Sua ADI
      4: { cellWidth: 32 }, // Espaço Base
      5: { cellWidth: 30 }, // Turno / Horário
      6: { cellWidth: 'auto' }, // Observações
    },
    alternateRowStyles: {
      fillColor: [254, 252, 232], // amber-50/40
    },
    didDrawPage: (data) => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      const currentPage = data.pageNumber;

      // Rodapé
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);

      const footerY = pageHeight - 6;
      doc.text(
        'Colégio Crescer • Programa Integral — Documento de Controle e Atribuição de Equipe',
        14,
        footerY
      );
      doc.text(`Página ${currentPage} de ${pageCount}`, pageWidth - 14, footerY, {
        align: 'right',
      });
    },
    margin: { left: 14, right: 14, top: 25, bottom: 12 },
  });

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const filename = `Quadro_Geral_Atribuicoes_Integral_${dateStr}.pdf`;
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
// 17. RELAÇÃO NOMINAL DE ALUNOS (Lista Cadastral Formal sem elementos de chamada)
// ---------------------------------------------------------------------------

export interface GenerateNominalListPDFOptions {
  title?: string;
  specialty?: string;
  turma?: string;
  dayOfWeek?: DayOfWeek | 'todos' | string;
  students: Student[];
  records?: AttendanceRecord[];
  currentUser?: UserProfile | null;
  saveImmediately?: boolean;
  attendanceFilter?: NominalAttendanceFilter;
  studentTypeFilter?: NominalStudentTypeFilter;
  periodMode?: NominalPeriodMode;
  targetDate?: string;
  startDate?: string;
  endDate?: string;
  metrics?: NominalReportMetrics;
  processedItems?: NominalProcessedStudent[];
  anoLetivo?: number;
}

export function generateNominalListPDF({
  title,
  specialty = 'TODAS',
  turma = 'TODAS',
  dayOfWeek = 'todos',
  students = [],
  records,
  currentUser,
  saveImmediately = false,
  attendanceFilter = 'todos',
  studentTypeFilter = 'todos',
  periodMode = 'dia',
  targetDate,
  startDate,
  endDate,
  metrics,
  processedItems,
  anoLetivo,
}: GenerateNominalListPDFOptions): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;

  // Normalização e filtragem defensiva
  const normalizeStr = (s?: string) =>
    (s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const isAllSpecialties = !specialty || specialty === 'TODAS' || specialty === 'TODOS';
  const isAllReforco = !isAllSpecialties && normalizeStr(specialty) === 'reforco';
  const isRotina = !isAllSpecialties && normalizeStr(specialty) === 'rotina';
  const isAllTurmas = !turma || turma === 'TODAS' || turma === 'TODOS';
  const isAllDays = !dayOfWeek || dayOfWeek === 'todos' || dayOfWeek === 'TODOS';

  const dayLabelsMap: Record<string, string> = {
    segunda: 'Segunda-feira',
    terca: 'Terça-feira',
    quarta: 'Quarta-feira',
    quinta: 'Quinta-feira',
    sexta: 'Sexta-feira',
  };

  const dayShortMap: Record<string, string> = {
    segunda: 'Seg',
    terca: 'Ter',
    quarta: 'Qua',
    quinta: 'Qui',
    sexta: 'Sex',
  };

  const isAttendanceReportMode = Boolean(records || metrics || processedItems);

  // Se já tivermos processedItems passados pelo modal, utilizamos diretamente
  let itemsToRender: {
    student: Student;
    status: 'presente' | 'faltoso';
    tipo: 'regular' | 'avulso';
    presenceCount: number;
    absenceCount: number;
    isExpected: boolean;
  }[] = [];

  if (processedItems && processedItems.length > 0) {
    itemsToRender = processedItems;
  } else if (isAttendanceReportMode) {
    // Computar avaliação nominal caso records tenha sido fornecido sem processedItems
    const effectiveDate = targetDate || new Date().toISOString().split('T')[0];
    const recs = records || [];

    const candidateStudents = (Array.isArray(students) ? students : []).filter((s) => {
      if (!s || typeof s !== 'object') return false;
      const st = s.status || s.statusMatricula || 'ativo';
      if (st !== 'ativo') return false;

      if (studentTypeFilter === 'regular' && s.tipoContrato === 'avulso') return false;
      if (studentTypeFilter === 'avulso' && s.tipoContrato !== 'avulso') return false;

      if (anoLetivo && s.anoLetivo !== anoLetivo) return false;

      if (!isAllTurmas && s.turma !== turma) return false;

      if (!isAllSpecialties) {
        if (isAllReforco) {
          const hasRef =
            (Array.isArray(s.modalidadesEspeciais) && s.modalidadesEspeciais.some((m) => normalizeStr(m) === 'reforco')) ||
            (Array.isArray(s.specialties) && s.specialties.some((m) => normalizeStr(m) === 'reforco')) ||
            (Array.isArray(s.activities) && s.activities.some((act) => normalizeStr(act) === 'reforco'));
          if (!hasRef) return false;
        } else if (isRotina) {
          const hasRot =
            (Array.isArray(s.activities) && s.activities.some((act) => normalizeStr(act) === 'rotina')) ||
            (Array.isArray(s.modalidadesEspeciais) && s.modalidadesEspeciais.some((m) => normalizeStr(m) === 'rotina')) ||
            (Array.isArray(s.specialties) && s.specialties.some((m) => normalizeStr(m) === 'rotina')) ||
            Boolean((s as any).activity && normalizeStr((s as any).activity) === 'rotina') ||
            (!s.activities || s.activities.length === 0);
          if (!hasRot) return false;
        } else {
          const hasAct = Array.isArray(s.activities) && s.activities.some((act) => normalizeStr(act) === normalizeStr(specialty));
          const hasSpec =
            (Array.isArray(s.modalidadesEspeciais) && s.modalidadesEspeciais.some((m) => normalizeStr(m) === normalizeStr(specialty))) ||
            (Array.isArray(s.specialties) && s.specialties.some((m) => normalizeStr(m) === normalizeStr(specialty)));
          if (!hasAct && !hasSpec) return false;
        }
      }

      return true;
    });

    itemsToRender = candidateStudents.map((s) => {
      let isExpected = false;
      let hasPresence = false;
      let pCount = 0;
      let aCount = 0;

      if (periodMode === 'dia') {
        isExpected = isStudentScheduledForDate(s, effectiveDate);
        const dayRecs = recs.filter((r) => r.studentId === s.id && r.date === effectiveDate);
        pCount = dayRecs.filter((r) => {
          const norm = normalizeAttendanceStatus(r.status);
          return norm === 'presente' || norm === 'sem_equipamento' || norm === 'saida_antecipada';
        }).length;
        aCount = dayRecs.filter((r) => normalizeAttendanceStatus(r.status) === 'falta').length;
        hasPresence = pCount > 0;
        if (hasPresence) isExpected = true;
      } else {
        const sDate = startDate || effectiveDate;
        const eDate = endDate || effectiveDate;
        const periodRecs = recs.filter((r) => r.studentId === s.id && r.date >= sDate && r.date <= eDate);
        pCount = periodRecs.filter((r) => {
          const norm = normalizeAttendanceStatus(r.status);
          return norm === 'presente' || norm === 'sem_equipamento' || norm === 'saida_antecipada';
        }).length;
        aCount = periodRecs.filter((r) => normalizeAttendanceStatus(r.status) === 'falta').length;
        hasPresence = pCount > 0;
        isExpected = hasPresence || true;
      }

      return {
        student: s,
        status: hasPresence ? ('presente' as const) : ('faltoso' as const),
        tipo: s.tipoContrato === 'avulso' ? ('avulso' as const) : ('regular' as const),
        presenceCount: pCount,
        absenceCount: aCount,
        isExpected,
      };
    }).filter((item) => {
      if (!item.isExpected) return false;
      if (attendanceFilter === 'presentes') return item.status === 'presente';
      if (attendanceFilter === 'faltosos') return item.status === 'faltoso';
      return true;
    });
  } else {
    // Modo tradicional puramente cadastral
    const filteredStudents = (Array.isArray(students) ? students : []).filter((s) => {
      if (!s || typeof s !== 'object') return false;
      const st = s.status || s.statusMatricula || 'ativo';
      if (st !== 'ativo') return false;

      if (studentTypeFilter === 'regular' && s.tipoContrato === 'avulso') return false;
      if (studentTypeFilter === 'avulso' && s.tipoContrato !== 'avulso') return false;

      if (anoLetivo && s.anoLetivo !== anoLetivo) return false;

      if (!isAllTurmas && s.turma !== turma) return false;

      if (!isAllSpecialties) {
        if (isAllReforco) {
          const hasRef =
            (Array.isArray(s.modalidadesEspeciais) && s.modalidadesEspeciais.some((m) => normalizeStr(m) === 'reforco')) ||
            (Array.isArray(s.specialties) && s.specialties.some((m) => normalizeStr(m) === 'reforco')) ||
            (Array.isArray(s.activities) && s.activities.some((act) => normalizeStr(act) === 'reforco'));
          if (!hasRef) return false;
        } else if (isRotina) {
          const hasRot =
            (Array.isArray(s.activities) && s.activities.some((act) => normalizeStr(act) === 'rotina')) ||
            (Array.isArray(s.modalidadesEspeciais) && s.modalidadesEspeciais.some((m) => normalizeStr(m) === 'rotina')) ||
            (Array.isArray(s.specialties) && s.specialties.some((m) => normalizeStr(m) === 'rotina')) ||
            Boolean((s as any).activity && normalizeStr((s as any).activity) === 'rotina') ||
            (!s.activities || s.activities.length === 0);
          if (!hasRot) return false;
        } else {
          const hasAct = Array.isArray(s.activities) && s.activities.some((act) => normalizeStr(act) === normalizeStr(specialty));
          const hasSpec =
            (Array.isArray(s.modalidadesEspeciais) && s.modalidadesEspeciais.some((m) => normalizeStr(m) === normalizeStr(specialty))) ||
            (Array.isArray(s.specialties) && s.specialties.some((m) => normalizeStr(m) === normalizeStr(specialty)));
          if (!hasAct && !hasSpec) return false;
        }
      }

      if (!isAllDays) {
        const scheduledOnDay = isStudentScheduledForDay(s, dayOfWeek as DayOfWeek);
        if (!scheduledOnDay) return false;
      }

      return true;
    });

    itemsToRender = filteredStudents.map((s) => ({
      student: s,
      status: 'presente' as const,
      tipo: s.tipoContrato === 'avulso' ? ('avulso' as const) : ('regular' as const),
      presenceCount: 0,
      absenceCount: 0,
      isExpected: true,
    }));
  }

  // Ordenação Estrita Alfabética
  const sortedItems = [...itemsToRender].sort((a, b) =>
    (a.student.name || '').localeCompare(b.student.name || '', 'pt-BR')
  );

  // Determinar Título Oficial
  let docTitle = title;
  if (!docTitle) {
    if (isAttendanceReportMode) {
      if (attendanceFilter === 'presentes') {
        docTitle = 'RELAÇÃO NOMINAL — ALUNOS PRESENTES';
      } else if (attendanceFilter === 'faltosos') {
        docTitle = 'RELAÇÃO NOMINAL — ALUNOS FALTOSOS / AUSENTES';
      } else {
        docTitle = 'RELAÇÃO NOMINAL DE FREQUÊNCIA (PRESENTES E FALTOSOS)';
      }
    } else {
      if (isAllReforco) {
        docTitle = 'RELAÇÃO NOMINAL DE ALUNOS — REFORÇO ESCOLAR';
      } else if (isRotina) {
        docTitle = 'RELAÇÃO NOMINAL DE ALUNOS — ROTINA';
      } else if (!isAllSpecialties) {
        docTitle = `RELAÇÃO NOMINAL DE ALUNOS — ${specialty.toUpperCase()}`;
      } else if (!isAllTurmas) {
        docTitle = `RELAÇÃO NOMINAL DE ALUNOS — TURMA ${turma.toUpperCase()}`;
      } else {
        docTitle = 'RELAÇÃO NOMINAL DE ALUNOS MATRICULADOS';
      }
    }
  }

  const subtitle = isAttendanceReportMode
    ? 'Acompanhamento Nominal de Presença e Faltas • Programa Integral'
    : 'Cadastro Oficial de Matrícula • Programa Integral';

  // Detalhes de Filtro no Cabeçalho (Tier 4)
  const filterDetails: string[] = [];

  // Período
  if (isAttendanceReportMode) {
    if (periodMode === 'dia') {
      const dt = targetDate || new Date().toISOString().split('T')[0];
      const dLabel = getDayOfWeekLabel(dt);
      filterDetails.push(`Data: ${formatDateBR(dt)} (${dLabel})`);
    } else {
      const s = startDate ? formatDateBR(startDate) : 'Início';
      const e = endDate ? formatDateBR(endDate) : 'Fim';
      filterDetails.push(`Período: ${s} até ${e}`);
    }
  } else if (!isAllDays) {
    filterDetails.push(`Dia: ${dayLabelsMap[dayOfWeek] || dayOfWeek}`);
  } else {
    filterDetails.push('Frequência: Todos os Dias');
  }

  // Tipo de Aluno
  if (studentTypeFilter === 'regular') {
    filterDetails.push('Alunos: Apenas Regulares');
  } else if (studentTypeFilter === 'avulso') {
    filterDetails.push('Alunos: Apenas Avulsos');
  } else {
    filterDetails.push('Alunos: Regulares e Avulsos');
  }

  // Status de Presença
  if (isAttendanceReportMode) {
    if (attendanceFilter === 'presentes') {
      filterDetails.push('Filtro: Apenas Presentes');
    } else if (attendanceFilter === 'faltosos') {
      filterDetails.push('Filtro: Apenas Faltosos / Ausentes');
    } else {
      filterDetails.push('Filtro: Presentes e Faltosos');
    }
  }

  // Turma
  filterDetails.push(isAllTurmas ? 'Turma: Todas as Turmas' : `Turma: ${turma}`);

  // Exercício
  filterDetails.push(`Exercício: ${anoLetivo || 2026}`);

  // Modalidade
  if (isAllReforco) {
    filterDetails.push('Modalidade: Reforço Escolar');
  } else if (isRotina) {
    filterDetails.push('Modalidade: Rotina');
  } else if (!isAllSpecialties) {
    filterDetails.push(`Modalidade: ${specialty}`);
  }

  filterDetails.push(`Listados: ${sortedItems.length}`);

  if (currentUser?.name) {
    filterDetails.push(`Coord: ${currentUser.name}`);
  }

  // Desenhar cabeçalho oficial institucional de 4 níveis
  drawOfficialHeader(doc, docTitle, subtitle, filterDetails, 'portrait');

  // Desenhar Cards de KPIs se métricas estiverem disponíveis
  let tableStartY = 37;
  if (metrics) {
    tableStartY = 47;
    const boxWidth = 43;
    const boxHeight = 10;
    const spacing = 3.3;
    drawMetricBoxes(doc, 14, 34, boxWidth, boxHeight, spacing, [
      { label: 'Total Esperados', value: metrics.totalEsperados, color: [15, 23, 42] },
      { label: 'Total Presentes', value: `${metrics.totalPresentes} (${metrics.taxaPresenca}%)`, color: [5, 150, 105] },
      { label: 'Total Faltosos', value: `${metrics.totalFaltosos} (${metrics.taxaFaltas}%)`, color: [225, 29, 72] },
      { label: 'Alunos Listados', value: `${sortedItems.length} de ${metrics.totalEsperados}`, color: [79, 70, 229] },
    ]);
  }

  // Preparar linhas da tabela
  if (isAttendanceReportMode) {
    const tableRows = sortedItems.map((item, idx) => {
      const st = item.student;
      const num = String(idx + 1).padStart(2, '0');
      const studentName = (st.name || '').trim().toUpperCase();
      const tipoContrato = item.tipo === 'avulso' ? 'AVULSO' : 'REGULAR';
      const studentTurma = st.turma || '—';

      const statusText = item.status === 'presente'
        ? item.presenceCount > 1
          ? `PRESENTE (${item.presenceCount})`
          : 'PRESENTE'
        : 'FALTOSO / AUSENTE';

      let detalheStr = '—';
      if (item.status === 'presente') {
        detalheStr = item.presenceCount === 1 ? '1 chamada' : `${item.presenceCount} chamadas`;
      } else {
        detalheStr = item.absenceCount > 0 ? `${item.absenceCount} falta anotada` : 'Sem presença';
      }

      // Modalidades
      const allMods: string[] = [];
      if (Array.isArray(st.modalidadesEspeciais) && st.modalidadesEspeciais.length > 0) {
        allMods.push(...st.modalidadesEspeciais);
      } else if (Array.isArray(st.specialties) && st.specialties.length > 0) {
        allMods.push(...st.specialties);
      }
      if (Array.isArray(st.activities) && st.activities.length > 0) {
        st.activities.forEach((act) => {
          if (!allMods.includes(act)) allMods.push(act);
        });
      }
      const modalidadesStr = allMods.length > 0 ? allMods.join(', ') : 'Rotina Regular';

      return [num, studentName, tipoContrato, studentTurma, statusText, detalheStr, modalidadesStr];
    });

    autoTable(doc, {
      startY: tableStartY,
      head: [['Nº', 'NOME DO ALUNO', 'TIPO', 'TURMA', 'STATUS FREQUÊNCIA', 'DETALHE', 'MODALIDADES']],
      body: tableRows.length > 0 ? tableRows : [['—', 'Nenhum aluno encontrado para os filtros selecionados.', '—', '—', '—', '—', '—']],
      theme: 'striped',
      headStyles: {
        fillColor: [15, 23, 42], // slate-900
        textColor: [255, 255, 255],
        fontSize: 7.8,
        fontStyle: 'bold',
        halign: 'left',
        cellPadding: 2.6,
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2.0,
        textColor: [30, 41, 59], // slate-800
        lineColor: [226, 232, 240], // slate-200
        lineWidth: 0.2,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // slate-50
      },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center', fontStyle: 'bold', textColor: [71, 85, 105] },
        1: { cellWidth: 54, fontStyle: 'bold' },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 22, halign: 'center' },
        4: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 20, halign: 'center' },
        6: { cellWidth: 'auto', halign: 'left' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const val = String(data.cell.raw || '');
          if (val.includes('PRESENTE')) {
            data.cell.styles.textColor = [5, 150, 105]; // emerald-600
          } else if (val.includes('FALTOSO') || val.includes('AUSENTE')) {
            data.cell.styles.textColor = [225, 29, 72]; // rose-600
          }
        }
        if (data.section === 'body' && data.column.index === 2) {
          const val = String(data.cell.raw || '');
          if (val === 'AVULSO') {
            data.cell.styles.textColor = [180, 83, 9]; // amber-700
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      margin: { left: 14, right: 14, top: tableStartY, bottom: 14 },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          doc.setFillColor(15, 23, 42);
          doc.rect(0, 0, pageWidth, 12, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(255, 255, 255);
          doc.text(`${docTitle} — (Continuação)`, 14, 8);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(203, 213, 225);
          doc.text(`Página ${data.pageNumber}`, pageWidth - 14, 8, { align: 'right' });
        }
      },
    });
  } else {
    // Modo tradicional limpo cadastral
    const tableRows = sortedItems.map((item, idx) => {
      const st = item.student;
      const num = String(idx + 1).padStart(2, '0');
      const studentName = (st.name || '').trim().toUpperCase();
      const studentTurma = st.turma || '—';

      let freqDaysStr = 'Seg a Sex (Todos)';
      if (Array.isArray(st.diasFrequencia) && st.diasFrequencia.length > 0 && st.diasFrequencia.length < 5) {
        freqDaysStr = st.diasFrequencia.map((d) => dayShortMap[d] || d).join(', ');
      }

      let exitTime = '18:00';
      if (!isAllDays && st.horariosSaida && st.horariosSaida[dayOfWeek as DayOfWeek]) {
        exitTime = st.horariosSaida[dayOfWeek as DayOfWeek] || '18:00';
      } else if (st.horarioSaida) {
        exitTime = st.horarioSaida;
      }

      const allMods: string[] = [];
      if (Array.isArray(st.modalidadesEspeciais) && st.modalidadesEspeciais.length > 0) {
        allMods.push(...st.modalidadesEspeciais);
      } else if (Array.isArray(st.specialties) && st.specialties.length > 0) {
        allMods.push(...st.specialties);
      }
      if (Array.isArray(st.activities) && st.activities.length > 0) {
        st.activities.forEach((act) => {
          if (!allMods.includes(act)) allMods.push(act);
        });
      }
      const modalidadesStr = allMods.length > 0 ? allMods.join(', ') : 'Rotina Regular';
      const logisticaStr =
        st.tipoSaida === 'TRANSPORTE_ESCOLAR'
          ? `Transp: ${st.nomeCondutor || 'Van'}`
          : 'Pais / Resp.';

      return [num, studentName, studentTurma, logisticaStr, freqDaysStr, exitTime, modalidadesStr];
    });

    autoTable(doc, {
      startY: 37,
      head: [['Nº', 'NOME DO ALUNO', 'TURMA', 'LOGÍSTICA SAÍDA', 'DIAS FREQUÊNCIA', 'SAÍDA', 'MODALIDADES']],
      body: tableRows.length > 0 ? tableRows : [['—', 'Nenhum aluno encontrado para os filtros selecionados.', '—', '—', '—', '—', '—']],
      theme: 'striped',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 7.8,
        fontStyle: 'bold',
        halign: 'left',
        cellPadding: 2.6,
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2.2,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center', fontStyle: 'bold', textColor: [71, 85, 105] },
        1: { cellWidth: 54, fontStyle: 'bold' },
        2: { cellWidth: 24, halign: 'center' },
        3: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 28, halign: 'center' },
        5: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
        6: { cellWidth: 'auto', halign: 'left' },
      },
      margin: { left: 14, right: 14, top: 37, bottom: 14 },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          doc.setFillColor(15, 23, 42);
          doc.rect(0, 0, pageWidth, 12, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(255, 255, 255);
          doc.text(`${docTitle} — (Continuação)`, 14, 8);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(203, 213, 225);
          doc.text(`Página ${data.pageNumber}`, pageWidth - 14, 8, { align: 'right' });
        }
      },
    });
  }

  // Aplicar rodapés e paginação
  applyPageNumbersAndFooters(doc, 'portrait');

  // Gerar nome de arquivo amigável e higienizado
  const cleanSpec = (isAllReforco ? 'Reforco' : isRotina ? 'Rotina' : !isAllSpecialties ? specialty : 'Geral').replace(/[\/\s]+/g, '_');
  const cleanTurma = (!isAllTurmas ? turma : 'TodasTurmas').replace(/[\/\s]+/g, '_');
  const cleanPeriod = isAttendanceReportMode
    ? (periodMode === 'dia' ? (targetDate || 'Hoje') : `${startDate || 'Ini'}_${endDate || 'Fim'}`).replace(/[\/\s-]+/g, '_')
    : (!isAllDays ? (dayShortMap[dayOfWeek] || dayOfWeek) : 'Semana').replace(/[\/\s]+/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = isAttendanceReportMode
    ? `Relatorio_Nominal_Frequencia_${cleanSpec}_${cleanTurma}_${cleanPeriod}_${dateStr}.pdf`
    : `Relacao_Nominal_${cleanSpec}_${cleanTurma}_${cleanPeriod}_${dateStr}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');

  const download = () => {
    doc.save(filename);
  };

  if (saveImmediately) {
    download();
  }

  return {
    doc,
    blob,
    blobUrl,
    dataUri,
    dataUrl: dataUri,
    filename,
    download,
  };
}

/**
 * Gera o documento PDF oficial das Normas e Manual de Orientações com Timbre Institucional.
 * Recebe a lista dinâmica e atualizada do Firestore.
 */
export function generateManualNormasPDF(
  normas: ManualNorma[],
  targetModuleId?: string,
  saveImmediately = false
): {
  doc: jsPDF;
  blob: Blob;
  blobUrl: string;
  dataUri: string;
  dataUrl: string;
  filename: string;
  download: () => void;
} {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  // Filtrar normas pelo módulo alvo se especificado
  const targetNormas = targetModuleId && targetModuleId !== 'all'
    ? normas.filter((n) => n.moduleId === targetModuleId)
    : normas;

  const docTitle = targetModuleId && targetModuleId !== 'all' && MODULE_METADATA[targetModuleId as keyof typeof MODULE_METADATA]
    ? MODULE_METADATA[targetModuleId as keyof typeof MODULE_METADATA].title
    : 'MANUAL DE ORIENTAÇÕES, NORMAS INTERNAS E ABORDAGEM SENSÍVEL';

  // Subtítulo excluído conforme diretriz institucional
  const subtitle = '';
  const filterDetails = [
    `Total de Diretrizes: ${targetNormas.length}`,
    `Módulo: ${targetModuleId && targetModuleId !== 'all' ? targetModuleId : 'Geral (Todos os Módulos)'}`,
    `Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
  ];

  drawOfficialHeader(doc, docTitle, subtitle, filterDetails, 'portrait');

  let currentY = 38;

  // Intro Banner Box (Tarja de Orientação Institucional)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, currentY, contentWidth, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text('ORIENTAÇÃO INSTITUCIONAL - PROGRAMA DO INTEGRAL', marginX + 4, currentY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const intro =
    'Este documento reúne as diretrizes fundamentais de segurança, ética e abordagem respeitosa que norteiam o atendimento aos alunos do Programa Integral. Sua leitura e aplicação diária são compulsórias para todas as monitoras e colaboradores.';
  const splitIntro = doc.splitTextToSize(intro, contentWidth - 8);
  doc.text(splitIntro, marginX + 4, currentY + 10.5);

  currentY += 23;

  // Group by module in pedagogical order with strict numerical section sorting
  const modulesOrder = [
    'rotina_operacional',
    'seguranca_cuidados',
    'postura_fardamento',
    'guia_socioemocional',
    'normas_internas',
    'academia_transporte',
    'guia_sensivel',
  ];

  const modulesTitlesMap: Record<string, string> = {
    rotina_operacional: 'MÓDULO 1: ROTINA OPERACIONAL (SEÇÕES 1 A 16)',
    seguranca_cuidados: 'MÓDULO 2: SEGURANÇA, ESPAÇOS, ACADEMIA E TRANSPORTE (SEÇÕES 17 A 27)',
    postura_fardamento: 'MÓDULO 3: POSTURA, FARDAMENTO E PROIBIÇÕES (SEÇÕES 28 A 38)',
    guia_socioemocional: 'MÓDULO 4: GUIA SOCIOEMOCIONAL E ABORDAGEM SENSÍVEL (SEÇÕES 39 A 51)',
    normas_internas: 'MÓDULO 1: ROTINA OPERACIONAL (SEÇÕES 1 A 16)',
    academia_transporte: 'MÓDULO 2: SEGURANÇA, ESPAÇOS, ACADEMIA E TRANSPORTE (SEÇÕES 17 A 27)',
    guia_sensivel: 'MÓDULO 4: GUIA SOCIOEMOCIONAL E ABORDAGEM SENSÍVEL (SEÇÕES 39 A 51)',
  };

  const grouped = new Map<string, ManualNorma[]>();

  modulesOrder.forEach((modId) => {
    const items = targetNormas
      .filter((n) => n.moduleId === modId)
      .sort(compareNormasBySectionNumber);
    if (items.length > 0) {
      grouped.set(modId, items);
    }
  });

  // Any custom modules
  targetNormas.forEach((n) => {
    if (!modulesOrder.includes(n.moduleId)) {
      const arr = grouped.get(n.moduleId) || [];
      arr.push(n);
      arr.sort(compareNormasBySectionNumber);
      grouped.set(n.moduleId, arr);
    }
  });

  grouped.forEach((normasList, modId) => {
    const meta = MODULE_METADATA[modId as keyof typeof MODULE_METADATA];
    const modTitle = modulesTitlesMap[modId] || (meta ? meta.title : `Módulo: ${modId}`);

    if (currentY > pageHeight - 35) {
      doc.addPage();
      currentY = 18;
    }

    // Module Header
    doc.setFillColor(15, 23, 42); // slate-900
    doc.roundedRect(marginX, currentY, contentWidth, 8, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(modTitle.toUpperCase(), marginX + 4, currentY + 5.5);
    currentY += 12;

    normasList.forEach((norma) => {
      if (currentY > pageHeight - 32) {
        doc.addPage();
        currentY = 18;
      }

      // Badge logic
      let badgeR = 79, badgeG = 70, badgeB = 229; // indigo
      let badgeLabel = 'DIRETRIZ INSTITUCIONAL';

      if (norma.type === 'proibicao') {
        badgeR = 225; badgeG = 29; badgeB = 72; // rose
        badgeLabel = 'PROIBIÇÃO / INFRAÇÃO GRAVE';
      } else if (norma.type === 'alerta') {
        badgeR = 217; badgeG = 119; badgeB = 6; // amber
        badgeLabel = 'ATENÇÃO & SEGURANÇA';
      } else if (norma.type === 'recomendado') {
        badgeR = 5; badgeG = 150; badgeB = 105; // emerald
        badgeLabel = 'BOA PRÁTICA RECOMENDADA';
      }

      doc.setFillColor(badgeR, badgeG, badgeB);
      doc.roundedRect(marginX, currentY, 34, 4.5, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      doc.setTextColor(255, 255, 255);
      doc.text(badgeLabel, marginX + 17, currentY + 3.2, { align: 'center' });

      // Title com numeração de seção única e explícita (ex: SEÇÃO 1 • ..., SEÇÃO 17 • ...)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      const secNum = String(norma.sectionNumber || norma.section || '').replace(/^seção\s*/i, '').trim();
      const titleWithSec = secNum ? `SEÇÃO ${secNum} • ${norma.title}` : norma.title;
      const splitTitle = doc.splitTextToSize(titleWithSec, contentWidth - 40);
      doc.text(splitTitle, marginX + 37, currentY + 3.5);

      currentY += Math.max(splitTitle.length * 4.2, 6.5);

      // Summary
      if (norma.summary) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        const splitSum = doc.splitTextToSize(norma.summary, contentWidth - 4);
        doc.text(splitSum, marginX + 4, currentY);
        currentY += splitSum.length * 3.8 + 2;
      }

      // Bullets
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);

      if (Array.isArray(norma.details)) {
        norma.details.forEach((det) => {
          if (currentY > pageHeight - 18) {
            doc.addPage();
            currentY = 18;
          }
          const bulletText = '• ' + det;
          const splitDet = doc.splitTextToSize(bulletText, contentWidth - 8);
          doc.text(splitDet, marginX + 4, currentY);
          currentY += splitDet.length * 3.6 + 1.2;
        });
      }

      currentY += 4.5;
    });

    currentY += 4;
  });

  applyPageNumbersAndFooters(doc, 'portrait');

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Manual_Normas_Colegio_Crescer_${targetModuleId || 'Geral'}_${dateStr}.pdf`;

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
 * Gera o Relatório Oficial de Conformidade e Aceite Digital do Manual de Normas (PDF).
 * Apresenta auditoria de colaboradores cientes vs pendentes com timbre institucional.
 */
export function generateRelatorioConformidadeAceitesPDF(
  collaborators: {
    user: UserProfile;
    aceite?: NormaAceite | null;
  }[],
  saveImmediately = false
): {
  doc: jsPDF;
  blob: Blob;
  blobUrl: string;
  dataUri: string;
  dataUrl: string;
  filename: string;
  download: () => void;
} {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  const total = collaborators.length;
  const confirmados = collaborators.filter((c) => Boolean(c.aceite)).length;
  const pendentes = total - confirmados;
  const taxaConformidade = total > 0 ? Math.round((confirmados / total) * 100) : 0;

  const docTitle = 'RELATÓRIO DE CONFORMIDADE E ACEITE DIGITAL';
  const subtitle = 'Manual de Orientações, Normas Internas e Guia de Abordagem Sensível';
  const filterDetails = [
    `Total da Equipe: ${total}`,
    `Assinados: ${confirmados} (${taxaConformidade}%)`,
    `Pendências: ${pendentes}`,
    `Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
  ];

  drawOfficialHeader(doc, docTitle, subtitle, filterDetails, 'portrait');

  let currentY = 38;

  // Metrics summary boxes
  const boxWidth = (contentWidth - 6) / 3;
  const boxHeight = 16;

  // Box 1: Confirmados
  doc.setFillColor(240, 253, 244); // green-50
  doc.setDrawColor(187, 247, 208); // green-200
  doc.roundedRect(marginX, currentY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(22, 101, 52); // green-800
  doc.text('ACEITES CONFIRMADOS', marginX + 4, currentY + 5.5);
  doc.setFontSize(13);
  doc.text(`${confirmados}`, marginX + 4, currentY + 12);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Taxa: ${taxaConformidade}% da equipe`, marginX + 22, currentY + 12);

  // Box 2: Pendentes
  const box2X = marginX + boxWidth + 3;
  doc.setFillColor(254, 242, 242); // red-50
  doc.setDrawColor(254, 202, 202); // red-200
  doc.roundedRect(box2X, currentY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(153, 27, 27); // red-800
  doc.text('PENDENTES DE LEITURA', box2X + 4, currentY + 5.5);
  doc.setFontSize(13);
  doc.text(`${pendentes}`, box2X + 4, currentY + 12);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`${total - confirmados} aguardando ciência`, box2X + 22, currentY + 12);

  // Box 3: Total Equipe
  const box3X = marginX + (boxWidth + 3) * 2;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(box3X, currentY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text('TOTAL DE COLABORADORES', box3X + 4, currentY + 5.5);
  doc.setFontSize(13);
  doc.text(`${total}`, box3X + 4, currentY + 12);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Monitoras e Docentes', box3X + 22, currentY + 12);

  currentY += boxHeight + 6;

  // Table using autoTable
  const tableData = collaborators.map((item) => {
    const isSigned = Boolean(item.aceite);
    const cargo = item.user.cargoLabel || (item.user.role === 'coordenador' ? 'Coordenação' : item.user.role === 'professor' ? 'Docente' : item.user.role === 'auxiliar' ? 'Monitora / Estagiária' : 'Colaborador');
    const dataHora = isSigned && item.aceite?.timestamp
      ? new Date(item.aceite.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Pendente';
    const statusLabel = isSigned ? 'CIENTE E ASSINADO' : 'PENDENTE';
    const versao = isSigned ? (item.aceite?.appVersion || '2026.1') : '—';

    return [
      item.user.name || 'Sem nome',
      cargo,
      item.user.email || '—',
      statusLabel,
      dataHora,
      versao,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Colaborador / Nome', 'Função / Cargo', 'E-mail Institucional', 'Status de Aceite', 'Data / Hora', 'Versão']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'left',
      cellPadding: 2.2,
    },
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 2,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 44, fontStyle: 'bold' },
      1: { cellWidth: 32 },
      2: { cellWidth: 44 },
      3: { cellWidth: 26, halign: 'center' },
      4: { cellWidth: 24, halign: 'center' },
      5: { cellWidth: 12, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        if (data.cell.raw === 'CIENTE E ASSINADO') {
          data.cell.styles.textColor = [22, 101, 52];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || currentY + 50;
  let sigY = finalY + 12;

  if (sigY > pageHeight - 35) {
    doc.addPage();
    sigY = 30;
  }

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(25, sigY, 95, sigY);
  doc.line(115, sigY, 185, sigY);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Coordenação do Programa Integral', 60, sigY + 4, { align: 'center' });
  doc.text('Fernando Veiga', 60, sigY + 7.5, { align: 'center' });

  doc.text('Direção Escolar • Colégio Crescer', 150, sigY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Auditoria de Conformidade Trabalhista e Pedagógica', 150, sigY + 7.5, { align: 'center' });

  applyPageNumbersAndFooters(doc, 'portrait');

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Relatorio_Conformidade_Aceites_Integral_${dateStr}.pdf`;

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
 * Gera o Relatório Cadastral de Colaboradores em PDF com Timbre Oficial do Colégio Crescer.
 * Respeita estritamente a lista de usuários filtrados na interface (busca, cargo, status)
 * e as colunas personalizadas selecionadas pelo usuário.
 */
export function generateUsersReportPDF(
  users: User[],
  filtersApplied: string,
  selectedColumns: string[] = ['nome', 'telefone'],
  saveImmediately = true
): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  const total = users.length;
  const totalAtivos = users.filter((u) => isUserActive(u)).length;
  const totalInativos = total - totalAtivos;

  const docTitle = 'Relatório Cadastral de Colaboradores';
  const subtitle = 'Colégio Crescer • Programa do Integral — Gestão de Pessoas';
  const filterDetails = [
    filtersApplied ? `Filtros: ${filtersApplied}` : 'Filtro: Todos os Colaboradores',
    `Total: ${total} colaborador(es)`,
  ];

  // Cabeçalho Institucional com logotipo oficial
  drawOfficialHeader(doc, docTitle, subtitle, filterDetails, 'portrait');

  // Cards de Resumo Executivo (KPIs)
  const currentY = 36;
  const boxWidth = (contentWidth - 6) / 3;
  const boxHeight = 13;

  // Box 1: Total
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.roundedRect(marginX, currentY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text('TOTAL DE COLABORADORES', marginX + 3.5, currentY + 4.5);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(`${total}`, marginX + 3.5, currentY + 10);

  // Box 2: Ativos
  const box2X = marginX + boxWidth + 3;
  doc.setFillColor(240, 253, 244); // green-50
  doc.setDrawColor(187, 247, 208); // green-200
  doc.roundedRect(box2X, currentY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(22, 101, 52); // green-800
  doc.text('COLABORADORES ATIVOS', box2X + 3.5, currentY + 4.5);
  doc.setFontSize(11);
  doc.setTextColor(21, 128, 61); // green-700
  doc.text(`${totalAtivos}`, box2X + 3.5, currentY + 10);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  const percAtivos = total > 0 ? Math.round((totalAtivos / total) * 100) : 0;
  doc.text(`${percAtivos}% da lista`, box2X + 22, currentY + 10);

  // Box 3: Inativos / Desligados
  const box3X = box2X + boxWidth + 3;
  doc.setFillColor(254, 242, 242); // red-50
  doc.setDrawColor(254, 202, 202); // red-200
  doc.roundedRect(box3X, currentY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(153, 27, 27); // red-800
  doc.text('INATIVOS / DESLIGADOS', box3X + 3.5, currentY + 4.5);
  doc.setFontSize(11);
  doc.setTextColor(185, 28, 28); // red-700
  doc.text(`${totalInativos}`, box3X + 3.5, currentY + 10);

  // Definições de todas as colunas possíveis
  interface UserColDef {
    id: string;
    header: string;
    weight: number;
    style: any;
    getValue: (u: User) => string;
  }

  const getCargo = (user: User) => {
    return getUnifiedCargoDisplay(user);
  };

  const getStatus = (user: User) => {
    const active = isUserActive(user);
    const dismissed = isUserDismissed(user);
    return active ? 'Ativo' : dismissed ? 'Desligado' : 'Inativo';
  };

  const getDataCadastro = (user: User) => {
    if (user.dataAdmissao) {
      const clean = user.dataAdmissao.trim();
      if (clean.includes('/')) return clean;
      if (clean.includes('-')) {
        const parts = clean.split('T')[0].split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    if ((user as any).createdAt) {
      const cleanCreated = String((user as any).createdAt).trim();
      if (cleanCreated.includes('/')) return cleanCreated;
      if (cleanCreated.includes('-')) {
        const parts = cleanCreated.split('T')[0].split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    return '—';
  };

  const getHorario = (user: User) => {
    const sched = (user.contractSchedule || '').trim();
    const hours = user.contractDailyHoursFormatted || (user.contractDailyHours ? `${user.contractDailyHours}h/dia` : '');
    if (sched && hours) {
      return `${sched} (${hours})`;
    }
    if (sched) return sched;
    if (hours) return hours;
    return '—';
  };

  const getPixKey = (user: User) => {
    const raw = (user.pixKey || (user as any).bankData?.pix || (user as any).pix || '').trim();
    return raw || '—';
  };

  const ALL_COLUMNS: Record<string, UserColDef> = {
    nome: {
      id: 'nome',
      header: 'NOME DO COLABORADOR',
      weight: 4.5,
      style: { fontStyle: 'bold', textColor: [15, 23, 42] },
      getValue: (u) => u.name || '—',
    },
    telefone: {
      id: 'telefone',
      header: 'TELEFONE',
      weight: 2.8,
      style: { halign: 'center', textColor: [51, 65, 85] },
      getValue: (u) => (u.phone ? formatPhoneDisplay(u.phone) : '—'),
    },
    email: {
      id: 'email',
      header: 'E-MAIL',
      weight: 4.2,
      style: { textColor: [51, 65, 85] },
      getValue: (u) => u.email || '—',
    },
    cargo: {
      id: 'cargo',
      header: 'CARGO / FUNÇÃO',
      weight: 3.5,
      style: { textColor: [51, 65, 85] },
      getValue: (u) => getCargo(u),
    },
    status: {
      id: 'status',
      header: 'STATUS',
      weight: 1.8,
      style: { halign: 'center', fontStyle: 'bold' },
      getValue: (u) => getStatus(u),
    },
    dataCadastro: {
      id: 'dataCadastro',
      header: 'DATA CADASTRO',
      weight: 2.2,
      style: { halign: 'center', textColor: [71, 85, 105] },
      getValue: (u) => getDataCadastro(u),
    },
    empresa: {
      id: 'empresa',
      header: 'EMPRESA / CNPJ',
      weight: 3.6,
      style: { textColor: [51, 65, 85] },
      getValue: (u) => {
        const emp = (u.empresa || u.company || '').trim();
        const cnpj = (u as any).cnpj ? `CNPJ: ${(u as any).cnpj}` : '';
        if (emp && cnpj) return `${emp} (${cnpj})`;
        if (emp) return emp;
        if (cnpj) return cnpj;
        return 'GADAL - Gestão e Apoio';
      },
    },
    pix: {
      id: 'pix',
      header: 'CHAVE PIX',
      weight: 3.5,
      style: { textColor: [30, 41, 59] },
      getValue: (u) => getPixKey(u),
    },
    pixKey: {
      id: 'pixKey',
      header: 'CHAVE PIX',
      weight: 3.5,
      style: { textColor: [30, 41, 59] },
      getValue: (u) => getPixKey(u),
    },
    horario: {
      id: 'horario',
      header: 'HORÁRIO / JORNADA',
      weight: 3.4,
      style: { halign: 'center', textColor: [51, 65, 85] },
      getValue: (u) => getHorario(u),
    },
  };

  // Normalizar seleção garantindo que ao menos 'nome' esteja presente
  const rawSelection = (selectedColumns && selectedColumns.length > 0)
    ? selectedColumns
    : ['nome', 'telefone', 'email', 'cargo', 'status', 'dataCadastro', 'empresa'];

  const normalizedSelection = rawSelection.includes('nome') ? rawSelection : ['nome', ...rawSelection];

  const activeColumns: UserColDef[] = normalizedSelection
    .map((id) => ALL_COLUMNS[id])
    .filter(Boolean);

  // Largura proporcional dinâmica das colunas
  const numColWidth = 8;
  const availableWidth = contentWidth - numColWidth; // 174mm
  const totalWeight = activeColumns.reduce((acc, col) => acc + col.weight, 0);

  let allocatedWidth = 0;
  const colWidths = activeColumns.map((col, idx) => {
    if (idx === activeColumns.length - 1) {
      return Math.max(12, availableWidth - allocatedWidth);
    }
    const w = Math.round((col.weight / totalWeight) * availableWidth);
    allocatedWidth += w;
    return w;
  });

  const headers = ['Nº', ...activeColumns.map((c) => c.header)];
  const columnStyles: Record<number, any> = {
    0: { cellWidth: numColWidth, halign: 'center', fontStyle: 'bold', textColor: [100, 116, 139] },
  };

  activeColumns.forEach((col, idx) => {
    columnStyles[idx + 1] = {
      cellWidth: colWidths[idx],
      ...col.style,
    };
  });

  // Mapear dados para as linhas da tabela
  const tableRows = users.map((user, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const cols = activeColumns.map((c) => c.getValue(user));
    return [num, ...cols];
  });

  const emptyRow = ['—', 'Nenhum colaborador encontrado para os filtros selecionados.', ...Array(Math.max(0, headers.length - 2)).fill('—')];

  // Índice da coluna de status para customização de badge
  const statusColumnIndex = activeColumns.findIndex((c) => c.id === 'status');

  // Renderizar AutoTable
  autoTable(doc, {
    startY: 52,
    head: [headers],
    body: tableRows.length > 0 ? tableRows : [emptyRow],
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42], // slate-900
      textColor: [255, 255, 255],
      fontSize: activeColumns.length > 6 ? 6.7 : 7.3,
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: activeColumns.length > 6 ? 2.0 : 2.6,
    },
    styles: {
      fontSize: activeColumns.length > 6 ? 6.7 : 7.2,
      cellPadding: activeColumns.length > 6 ? 1.8 : 2.2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      overflow: 'ellipsize',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
    columnStyles,
    margin: { left: 14, right: 14, top: 52, bottom: 14 },
    didParseCell: (data) => {
      if (statusColumnIndex !== -1 && data.section === 'body' && data.column.index === statusColumnIndex + 1) {
        const val = String(data.cell.raw || '');
        if (val.startsWith('Ativo')) {
          data.cell.styles.textColor = [22, 101, 52]; // green-800
          data.cell.styles.fillColor = [240, 253, 244]; // green-50
          data.cell.styles.fontStyle = 'bold';
        } else if (val.startsWith('Desligado')) {
          data.cell.styles.textColor = [153, 27, 27]; // red-800
          data.cell.styles.fillColor = [254, 242, 242]; // red-50
          data.cell.styles.fontStyle = 'bold';
        } else if (val.startsWith('Inativo')) {
          data.cell.styles.textColor = [71, 85, 105]; // slate-600
          data.cell.styles.fillColor = [241, 245, 249]; // slate-100
        }
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageWidth, 12, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text('RELATÓRIO CADASTRAL DE COLABORADORES — (Continuação)', 14, 8);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(203, 213, 225);
        doc.text(`Página ${data.pageNumber}`, pageWidth - 14, 8, { align: 'right' });
      }
    },
  });

  // Aplicar rodapés institucionais e numeração de páginas
  applyPageNumbersAndFooters(doc, 'portrait');

  // Nome do arquivo amigável e higienizado
  const cleanFilter = (filtersApplied || 'Todos').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 25);
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Relatorio_Cadastral_Colaboradores_${cleanFilter}_${dateStr}.pdf`;

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
 * Gera o Relatório Oficial de Feedbacks de Orientação Profissional (PDF).
 * Documento estruturado com timbre institucional do Colégio Crescer, métricas de conformidade,
 * e detalhamento dos feedbacks emitidos com carimbo de ciência e IP.
 */
export function generateRelatorioFeedbacksPDF(
  feedbacks: PedagogicalFeedback[],
  collaboratorFilter?: string,
  saveImmediately = false
): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  const total = feedbacks.length;
  const cientes = feedbacks.filter((f) => f.status === 'ACKNOWLEDGED').length;
  const pendentes = total - cientes;
  const taxaCientes = total > 0 ? Math.round((cientes / total) * 100) : 0;

  const docTitle = 'RELATÓRIO DE FEEDBACKS DE ORIENTAÇÃO PROFISSIONAL';
  const subtitle = 'Clareza, respeito e responsabilidade institucional • Colégio Crescer';

  const filterDesc = collaboratorFilter && collaboratorFilter !== 'all'
    ? `Colaborador(a): ${collaboratorFilter}`
    : 'Todos os Colaboradores';

  const filterDetails = [
    `Total: ${total} registro(s)`,
    `Cientes: ${cientes} (${taxaCientes}%)`,
    `Pendentes: ${pendentes}`,
    filterDesc,
    `Emissão: ${getCurrentDateTimeString()}`,
  ];

  drawOfficialHeader(doc, docTitle, subtitle, filterDetails, 'portrait');

  let currentY = 38;

  // Caixas de métricas institucionais
  const boxWidth = (contentWidth - 6) / 3;
  const boxHeight = 16;

  // Box 1: Cientes e Assinados
  doc.setFillColor(240, 253, 244); // green-50
  doc.setDrawColor(187, 247, 208); // green-200
  doc.roundedRect(marginX, currentY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(22, 101, 52); // green-800
  doc.text('CIENTES E ASSINADOS', marginX + 4, currentY + 5.5);
  doc.setFontSize(13);
  doc.text(`${cientes}`, marginX + 4, currentY + 12);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Taxa: ${taxaCientes}% de ciência`, marginX + 22, currentY + 12);

  // Box 2: Pendentes de Assinatura
  const box2X = marginX + boxWidth + 3;
  doc.setFillColor(254, 242, 242); // red-50
  doc.setDrawColor(254, 202, 202); // red-200
  doc.roundedRect(box2X, currentY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(153, 27, 27); // red-800
  doc.text('PENDENTES DE ASSINATURA', box2X + 4, currentY + 5.5);
  doc.setFontSize(13);
  doc.text(`${pendentes}`, box2X + 4, currentY + 12);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`${pendentes} aguardando ciência`, box2X + 22, currentY + 12);

  // Box 3: Total Registros
  const box3X = marginX + (boxWidth + 3) * 2;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(box3X, currentY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text('TOTAL DE FEEDBACKS', box3X + 4, currentY + 5.5);
  doc.setFontSize(13);
  doc.text(`${total}`, box3X + 4, currentY + 12);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Orientações emitidas', box3X + 22, currentY + 12);

  currentY += boxHeight + 6;

  // Mapear dados da tabela:
  // Nome do Colaborador, Status (Ciente/Assinado), Norma/Seção citada, Data de Envio e IP/Carimbo de leitura
  const tableData = feedbacks.map((fb) => {
    const isSigned = fb.status === 'ACKNOWLEDGED';
    const statusLabel = isSigned ? 'CIENTE E ASSINADO' : 'PENDENTE';

    // Norma / Seção
    const normaText = fb.normSection ? `${fb.normTitle} (${fb.normSection})` : (fb.normTitle || '—');

    // Data de Envio
    let dataEnvio = '—';
    if (fb.createdAt) {
      try {
        const d = new Date(fb.createdAt);
        dataEnvio = `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      } catch {
        dataEnvio = fb.createdAt;
      }
    }

    // Carimbo de leitura e IP
    let carimboLeitura = 'Aguardando ciência';
    if (isSigned) {
      const dataHoraCiente = fb.acknowledgedFormatted || (fb.acknowledgedAt ? new Date(fb.acknowledgedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Confirmado');
      const ip = fb.acknowledgedIp ? ` • IP: ${fb.acknowledgedIp}` : '';
      carimboLeitura = `${dataHoraCiente}${ip}`;
    }

    return [
      fb.targetUserName || 'Sem nome',
      statusLabel,
      normaText,
      dataEnvio,
      carimboLeitura,
    ];
  });

  const emptyRow = ['—', '—', 'Nenhum feedback encontrado com os filtros selecionados.', '—', '—'];

  autoTable(doc, {
    startY: currentY,
    head: [['Nome do Colaborador', 'Status', 'Norma / Seção Citada', 'Data de Envio', 'IP / Carimbo de Leitura']],
    body: tableData.length > 0 ? tableData : [emptyRow],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'left',
      cellPadding: 2.4,
    },
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold' },
      1: { cellWidth: 32, halign: 'center' },
      2: { cellWidth: 48 },
      3: { cellWidth: 26, halign: 'center' },
      4: { cellWidth: 36, halign: 'center' },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        if (String(data.cell.raw).includes('CIENTE')) {
          data.cell.styles.textColor = [22, 101, 52]; // green-800
          data.cell.styles.fillColor = [240, 253, 244]; // green-50
          data.cell.styles.fontStyle = 'bold';
        } else if (String(data.cell.raw).includes('PENDENTE')) {
          data.cell.styles.textColor = [185, 28, 28]; // red-700
          data.cell.styles.fillColor = [254, 242, 242]; // red-50
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageWidth, 12, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text('RELATÓRIO DE FEEDBACKS DE ORIENTAÇÃO PROFISSIONAL — (Continuação)', 14, 8);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(203, 213, 225);
        doc.text(`Página ${data.pageNumber}`, pageWidth - 14, 8, { align: 'right' });
      }
    },
  });

  applyPageNumbersAndFooters(doc, 'portrait');

  const cleanFilter = (collaboratorFilter && collaboratorFilter !== 'all' ? collaboratorFilter : 'Geral')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(0, 25);
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Relatorio_Feedbacks_${cleanFilter}_${dateStr}.pdf`;

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
// 41. FICHA CADASTRAL DE MATRÍCULA E TERMO DE AUTORIZAÇÃO DE SAÍDA (A4)
// ---------------------------------------------------------------------------

export interface GenerateFichaMatriculaPDFOptions {
  student: Student;
  schoolYear?: number | string;
  saveImmediately?: boolean;
}

export function generateFichaMatriculaPDF({
  student,
  schoolYear = student.anoLetivo || new Date().getFullYear(),
  saveImmediately = false,
}: GenerateFichaMatriculaPDFOptions): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const resolvedYear = String(schoolYear);
  const pageWidth = 210;
  const leftX = 14;
  const rightX = 196;
  const contentWidth = 182;

  // 1. CABEÇALHO INSTITUCIONAL
  drawOfficialHeader(
    doc,
    'FICHA CADASTRAL DE MATRÍCULA',
    '',
    [
      `Aluno(a): ${student.name}`,
      `Turma: ${student.turma}`,
      `Ano Letivo: ${resolvedYear}`,
      `Matrícula: ${student.id || 'N/A'}`,
    ],
    'portrait'
  );

  let currentY = 36;

  // Helper para desenhar títulos de blocos com tarja de alto contraste
  const drawSectionHeader = (title: string, y: number): number => {
    doc.setFillColor(15, 23, 42); // slate-900
    doc.roundedRect(leftX, y, contentWidth, 5.8, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), leftX + 4, y + 4.1);
    return y + 7.2;
  };

  // -------------------------------------------------------------------------
  // BLOCO 1: IDENTIFICAÇÃO DO ALUNO E MATRÍCULA
  // -------------------------------------------------------------------------
  currentY = drawSectionHeader('1. Identificação do Aluno e Matrícula', currentY);

  const block1StartY = currentY;
  const block1Height = 50;

  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, block1StartY, contentWidth, block1Height, 1.5, 1.5, 'FD');

  const col1X = leftX + 4;
  const col2X = leftX + 96;

  // Linha 1: Nome Completo & Matrícula/ID
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text('NOME COMPLETO DO ESTUDANTE:', col1X, block1StartY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(student.name.toUpperCase(), col1X, block1StartY + 9.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text('CÓDIGO / MATRÍCULA:', col2X, block1StartY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(student.id || 'N/A', col2X, block1StartY + 9.2);

  // Linha 2: Turma de Destino & Ano Letivo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text('TURMA DE DESTINO / ENTURMAÇÃO:', col1X, block1StartY + 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(79, 70, 229); // indigo-600
  doc.text(student.turma, col1X, block1StartY + 18.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text('ANO LETIVO DA MATRÍCULA:', col2X, block1StartY + 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Exercício ${resolvedYear}`, col2X, block1StartY + 18.2);

  // Linha 3: Data de Nascimento & Status da Matrícula
  const rawBirth = student.dataNascimento || student.birthDate;
  const formattedBirth = rawBirth
    ? (rawBirth.includes('-') ? formatDateBR(rawBirth) : rawBirth)
    : 'Conforme prontuário escolar';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text('DATA DE NASCIMENTO:', col1X, block1StartY + 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(formattedBirth, col1X, block1StartY + 27.2);

  const statusLabel =
    student.status === 'inativo'
      ? 'Inativo'
      : student.status === 'cancelado'
      ? 'Cancelado'
      : 'Ativo Regular';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text('SITUAÇÃO DA MATRÍCULA:', col2X, block1StartY + 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  if (student.status === 'inativo' || student.status === 'cancelado') {
    doc.setTextColor(220, 38, 38);
  } else {
    doc.setTextColor(22, 163, 74);
  }
  doc.text(statusLabel.toUpperCase(), col2X, block1StartY + 27.2);

  // Linha 4: Plano Contratual & Limite de Permanência
  const planoContratual = student.planoContratual || 'Integral Semana (18:30h)';
  const tabelaPlanosAno = getTabelaPlanosPorAno(resolvedYear);
  const horarioLimite =
    student.horarioPermanenciaLimite ||
    tabelaPlanosAno[planoContratual]?.horarioPadrao ||
    '18:30h';
  const valorBase =
    student.valorPlanoBase !== undefined
      ? student.valorPlanoBase
      : (tabelaPlanosAno[planoContratual]?.valorBase ?? (Number(resolvedYear) === 2027 ? 1250 : 1120));
  const descontoBolsa = student.descontoBolsa || 0;
  const mensalidadeFinal =
    student.valorMensalidadeFinal !== undefined
      ? student.valorMensalidadeFinal
      : Math.max(0, valorBase - descontoBolsa);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text('PLANO CONTRATUAL OFICIAL:', col1X, block1StartY + 32);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(planoContratual, col1X, block1StartY + 36.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text('LIMITE DE PERMANÊNCIA DIÁRIA:', col2X, block1StartY + 32);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(79, 70, 229); // indigo-600
  doc.text(`Até às ${horarioLimite}`, col2X, block1StartY + 36.2);

  // Linha 5: Valor Base / Desconto & Mensalidade Final Contratada
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text('VALOR BASE DO PLANO E BOLSA:', col1X, block1StartY + 41);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Base: ${formatCurrencyBR(valorBase)}   •   Desconto/Bolsa: ${formatCurrencyBR(descontoBolsa)}`,
    col1X,
    block1StartY + 45.2
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text('MENSALIDADE CONTRATUAL LÍQUIDA:', col2X, block1StartY + 41);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(22, 101, 52); // emerald-800
  doc.text(`${formatCurrencyBR(mensalidadeFinal)} / mês`, col2X, block1StartY + 45.2);

  currentY = block1StartY + block1Height + 6;

  // -------------------------------------------------------------------------
  // BLOCO 2: MODALIDADES EXTRACURRICULARES E HORÁRIOS CONTRATUAIS
  // -------------------------------------------------------------------------
  currentY = drawSectionHeader('2. Modalidades Extracurriculares e Horários Contratuais', currentY);

  const enrolledActivities = (student.activities || []).filter(Boolean);
  const activitiesDisplay =
    enrolledActivities.length > 0 ? enrolledActivities.join('  •  ') : 'Rotina Regular do Integral';

  const specialList = (student.modalidadesEspeciais || student.specialties || []).filter(Boolean);
  const specialDisplay = specialList.length > 0 ? `  •  Especiais: ${specialList.join(', ')}` : '';

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, currentY, contentWidth, 10.5, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('MODALIDADES CONTRATADAS / ATIVIDADES:', leftX + 4, currentY + 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`${activitiesDisplay}${specialDisplay}`, leftX + 4, currentY + 8.2);

  currentY += 14;

  // Quadro de Horários de Saída (Segunda a Sexta)
  const daysInfo: { id: DayOfWeek; label: string }[] = [
    { id: 'segunda', label: 'SEGUNDA-FEIRA' },
    { id: 'terca', label: 'TERÇA-FEIRA' },
    { id: 'quarta', label: 'QUARTA-FEIRA' },
    { id: 'quinta', label: 'QUINTA-FEIRA' },
    { id: 'sexta', label: 'SEXTA-FEIRA' },
  ];

  const diasFreq = student.diasFrequencia && student.diasFrequencia.length > 0
    ? student.diasFrequencia
    : (['segunda', 'terca', 'quarta', 'quinta', 'sexta'] as DayOfWeek[]);

  const tableHead = daysInfo.map((d) => d.label);
  const statusRow = daysInfo.map((d) => {
    const isEnrolled = diasFreq.includes(d.id);
    return isEnrolled ? 'Atendimento' : 'Folga';
  });

  const hoursRow = daysInfo.map((d) => {
    const isEnrolled = diasFreq.includes(d.id);
    if (!isEnrolled) return 'Não frequenta';
    const specificTime = student.horariosSaida?.[d.id];
    if (specificTime && specificTime.trim()) return `Saída: ${specificTime}`;
    if (student.horarioSaida && student.horarioSaida.trim()) return `Saída: ${student.horarioSaida}`;
    return 'Saída: 18:00';
  });

  const colWidth = contentWidth / 5;

  autoTable(doc, {
    startY: currentY,
    head: [tableHead],
    body: [statusRow, hoursRow],
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 3,
      halign: 'center',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: colWidth },
      1: { cellWidth: colWidth },
      2: { cellWidth: colWidth },
      3: { cellWidth: colWidth },
      4: { cellWidth: colWidth },
    },
    margin: { left: leftX, right: leftX },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const day = daysInfo[data.column.index];
        const isEnrolled = day && diasFreq.includes(day.id);
        if (!isEnrolled) {
          data.cell.styles.fillColor = [248, 250, 252];
          data.cell.styles.textColor = [148, 163, 184];
        } else {
          if (data.row.index === 0) {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [15, 23, 42];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    },
  });

  applyPageNumbersAndFooters(doc, 'portrait');

  const cleanName = student.name.replace(/[^a-zA-Z0-9À-ÿ]/g, '_').slice(0, 30);
  const filename = `Ficha_Matricula_${cleanName}_${resolvedYear}.pdf`;

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
// 42. DEMONSTRATIVO FINANCEIRO E CONTROLE DE MENSALIDADES (A4 LANDSCAPE)
// ---------------------------------------------------------------------------

export interface GenerateFinancialReportPDFOptions {
  profiles: StudentFinancialProfile[];
  expenses?: FinancialExpense[];
  metrics: FinancialMetricSummary;
  schoolYear: number | string;
  monthRef?: string;
  turmaFilter?: string;
  statusFilter?: string;
  saveImmediately?: boolean;
}

export function generateFinancialReportPDF({
  profiles,
  expenses = [],
  metrics,
  schoolYear,
  monthRef = 'Exercício Corrente',
  turmaFilter = 'Todas',
  statusFilter = 'Todos',
  saveImmediately = false,
}: GenerateFinancialReportPDFOptions): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const leftX = 14;
  const contentWidth = 269;

  // Cabeçalho Oficial
  drawOfficialHeader(
    doc,
    `DEMONSTRATIVO FINANCEIRO E FLUXO DE CAIXA — ${schoolYear}`,
    'Colégio Crescer • Gestão de Receitas, Custos Operacionais e Saldo Líquido',
    [
      `Ano Letivo: ${schoolYear}`,
      `Mês/Período: ${monthRef}`,
      `Turma: ${turmaFilter}`,
      `Status: ${statusFilter}`,
      `Total Contratos: ${profiles.length}`,
      `Despesas Cadastradas: ${expenses.length}`,
    ],
    'landscape'
  );

  let startY = 36;

  // 4 Cards de Indicadores Financeiros no Topo (Dashboard de Fluxo de Caixa)
  const cardWidth = (contentWidth - 9) / 4; // ~65mm cada
  const cardHeight = 17;

  // Card 1: Receita Contratual Líquida / Faturamento Bruto
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(leftX, startY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(21, 128, 61);
  doc.text('RECEITA CONTRATUAL LÍQUIDA', leftX + 4, startY + 4.8);
  doc.setFontSize(10);
  doc.setTextColor(21, 128, 61);
  doc.text(formatCurrencyBR(metrics.receitaPrevistaMensal), leftX + 4, startY + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.0);
  doc.setTextColor(71, 85, 105);
  doc.text(`Bruto: ${formatCurrencyBR(metrics.faturamentoBrutoReal)} | Bolsas: -${formatCurrencyBR(metrics.totalDescontoBolsas)}`, leftX + 4, startY + 15);

  // Card 2: Total de Despesas do Mês (100% Reais)
  const card2X = leftX + cardWidth + 3;
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(254, 202, 202);
  doc.roundedRect(card2X, startY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(185, 28, 28);
  doc.text('CUSTOS OPERACIONAIS REAIS', card2X + 4, startY + 4.8);
  doc.setFontSize(10);
  doc.setTextColor(185, 28, 28);
  doc.text(formatCurrencyBR(metrics.totalCustosOperacionaisReais ?? metrics.totalDespesasMes), card2X + 4, startY + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.0);
  doc.setTextColor(153, 27, 27);
  doc.text(`Folha: ${formatCurrencyBR(metrics.custoFolhaReal || 0)} | Alim: ${formatCurrencyBR(metrics.custoAlimentacaoReal || 0)}`, card2X + 4, startY + 15);

  // Card 3: Resultado Operacional Líquido Real = Receitas Líquidas - Custos Reais
  const card3X = card2X + cardWidth + 3;
  const netResult = metrics.resultadoOperacionalLiquidoReal ?? metrics.saldoLiquidoOperacional;
  const isPositiveBalance = netResult >= 0;
  if (isPositiveBalance) {
    doc.setFillColor(238, 242, 255);
    doc.setDrawColor(199, 210, 254);
  } else {
    doc.setFillColor(255, 241, 242);
    doc.setDrawColor(254, 205, 211);
  }
  doc.roundedRect(card3X, startY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(isPositiveBalance ? 67 : 190, isPositiveBalance ? 56 : 18, isPositiveBalance ? 202 : 60);
  doc.text('RESULTADO OPERACIONAL LÍQUIDO', card3X + 4, startY + 4.8);
  doc.setFontSize(10);
  doc.setTextColor(isPositiveBalance ? 49 : 190, isPositiveBalance ? 46 : 18, isPositiveBalance ? 129 : 60);
  doc.text(formatCurrencyBR(netResult), card3X + 4, startY + 10.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(isPositiveBalance ? 22 : 220, isPositiveBalance ? 101 : 38, isPositiveBalance ? 52 : 38);
  doc.text(isPositiveBalance ? `Superávit Real (${metrics.margemOperacionalLiquida ?? 0}% Margem)` : 'Atenção: Déficit no Período', card3X + 4, startY + 15);

  // Card 4: Ticket Médio & Pagantes
  const card4X = card3X + cardWidth + 3;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(card4X, startY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  doc.text('TICKET MÉDIO / PAGANTES', card4X + 4, startY + 4.8);
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrencyBR(metrics.ticketMedioPorAluno), card4X + 4, startY + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.0);
  doc.setTextColor(71, 85, 105);
  doc.text(`${metrics.totalAlunosPagantes} pagantes (${metrics.totalIsentos} isentos/bolsa 100%)`, card4X + 4, startY + 15);

  startY += cardHeight + 4;

  // Seção 1: Demonstrativo de Receitas & Mensalidades
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(leftX, startY, contentWidth, 5.5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('1. RECEITAS: CONTRATOS E MENSALIDADES DOS ALUNOS', leftX + 4, startY + 3.8);

  startY += 7;

  // Tabela Analítica de Contratos dos Alunos
  const tableData = profiles.map((p, idx) => {
    const fallbackPlanoLabel =
      p.planoHora === 'INTEGRAL_8H'
        ? 'Integral (8h)'
        : p.planoHora === 'PARCIAL_4H'
        ? 'Parcial (4h)'
        : p.planoHora === 'EXTENDIDO_12H'
        ? 'Estendido (12h)'
        : 'Personalizado';

    const planoLabel = p.planoContratual || fallbackPlanoLabel;

    const statusLabel =
      p.statusPagamento === 'EM_DIA'
        ? 'EM DIA'
        : p.statusPagamento === 'EM_ATRASO'
        ? 'EM ATRASO'
        : p.statusPagamento === 'ISENTO'
        ? 'ISENTO'
        : 'PENDENTE';

    const descontoStr =
      p.descontoBolsa && p.descontoBolsa > 0
        ? `-${formatCurrencyBR(p.descontoBolsa)}`
        : p.descontoPercentual > 0
        ? `${p.descontoPercentual}%`
        : '-';

    return [
      String(idx + 1).padStart(2, '0'),
      p.studentName || 'Aluno',
      p.turma || '-',
      planoLabel,
      formatCurrencyBR(p.valorMensalidadeBase),
      formatCurrencyBR(p.valorModalidadesExtras),
      descontoStr,
      formatCurrencyBR(p.valorTotalMensal),
      `Dia ${String(p.diaVencimento).padStart(2, '0')}`,
      statusLabel,
      p.formaPagamentoPadrao || 'Boleto',
    ];
  });

  autoTable(doc, {
    startY,
    head: [
      [
        '#',
        'Nome do Estudante',
        'Turma',
        'Plano Contratual',
        'Base',
        'Oficinas Extras',
        'Desconto',
        'Valor Total',
        'Vencimento',
        'Situação',
        'Forma',
      ],
    ],
    body:
      tableData.length > 0
        ? tableData
        : [['-', 'Nenhum contrato localizado para os filtros informados', '', '', '', '', '', '', '', '', '']],
    theme: 'grid',
    styles: {
      fontSize: 6.8,
      cellPadding: 1.8,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.2,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 54, fontStyle: 'bold' },
      2: { cellWidth: 30 },
      3: { cellWidth: 30 },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 16, halign: 'center' },
      7: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
      8: { cellWidth: 21, halign: 'center' },
      9: { cellWidth: 23, halign: 'center', fontStyle: 'bold' },
      10: { cellWidth: 17, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 9) {
        const text = String(data.cell.raw || '');
        if (text === 'EM DIA') {
          data.cell.styles.textColor = [22, 163, 74];
        } else if (text === 'EM ATRASO') {
          data.cell.styles.textColor = [220, 38, 38];
        } else if (text === 'PENDENTE') {
          data.cell.styles.textColor = [217, 119, 6];
        } else if (text === 'ISENTO') {
          data.cell.styles.textColor = [100, 116, 139];
        }
      }
    },
  });

  let afterReceitasY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 6 : startY + 60;

  // Seção 2: Demonstrativo de Despesas e Custos Operacionais
  if (expenses.length > 0) {
    // Se o espaço na página atual for insuficiente para cabeçalho + tabela, quebra de página
    if (afterReceitasY > 165) {
      doc.addPage('a4', 'landscape');
      drawOfficialHeader(
        doc,
        `DEMONSTRATIVO DE DESPESAS E SALDO LÍQUIDO — ${schoolYear}`,
        'Colégio Crescer • Custos Operacionais e Saídas do Período',
        [`Ano Letivo: ${schoolYear}`, `Total de Lançamentos: ${expenses.length}`],
        'landscape'
      );
      afterReceitasY = 36;
    }

    doc.setFillColor(15, 23, 42);
    doc.roundedRect(leftX, afterReceitasY, contentWidth, 5.5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('2. DESPESAS: CUSTOS OPERACIONAIS E SAÍDAS DO PROGRAMA INTEGRAL', leftX + 4, afterReceitasY + 3.8);

    const expenseTableData = expenses.map((exp, idx) => {
      const catLabel =
        exp.categoria === 'FOLHA_PAGAMENTO'
          ? 'Folha / Salários'
          : exp.categoria === 'OFICINAS_TERCEIRIZADAS'
          ? 'Oficinas Especialistas'
          : exp.categoria === 'OFICINAS_CULINARIA'
          ? 'Oficinas de Culinária'
          : exp.categoria === 'ALIMENTACAO_HORTIFRUTI'
          ? 'Alimentação & Cantina'
          : exp.categoria === 'MATERIAIS_DIDATICOS'
          ? 'Materiais Pedagógicos'
          : exp.categoria === 'MANUTENCAO_INFRA'
          ? 'Manutenção & Infra'
          : 'Outros Custos';

      const statusExpLabel = exp.status === 'PAGO' ? 'PAGO' : 'PENDENTE';

      const autoTag = exp.isAutoGenerated || exp.autoSyncKey ? ' [Auto-Sync]' : '';

      return [
        String(idx + 1).padStart(2, '0'),
        catLabel,
        `${exp.descricao}${autoTag}`,
        exp.fornecedor || exp.fornecedorOuBeneficiario || '-',
        formatDateBR(exp.dataVencimento),
        formatCurrencyBR(exp.valor),
        exp.formaPagamento || 'Boleto',
        statusExpLabel,
      ];
    });

    autoTable(doc, {
      startY: afterReceitasY + 7,
      head: [
        [
          '#',
          'Categoria Operacional',
          'Descrição do Custo / Despesa',
          'Fornecedor / Beneficiário',
          'Vencimento',
          'Valor (R$)',
          'Forma de Pagamento',
          'Situação',
        ],
      ],
      body: expenseTableData,
      theme: 'grid',
      styles: {
        fontSize: 6.8,
        cellPadding: 1.8,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [185, 28, 28], // red-700
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.2,
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center' },
        1: { cellWidth: 42, fontStyle: 'bold' },
        2: { cellWidth: 80 },
        3: { cellWidth: 48 },
        4: { cellWidth: 24, halign: 'center' },
        5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: 24, halign: 'center' },
        7: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 7) {
          const text = String(data.cell.raw || '');
          if (text === 'PAGO') {
            data.cell.styles.textColor = [22, 163, 74];
          } else {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
      },
    });
  }

  // Seção de Fechamento de Caixa e Assinaturas
  const finalTableY = (doc as any).lastAutoTable?.finalY || 165;
  const sigPage = (doc as any).internal.getNumberOfPages();
  const spaceLeft = 200 - finalTableY;

  if (spaceLeft < 28) {
    doc.addPage('a4', 'landscape');
    drawOfficialHeader(
      doc,
      `FECHAMENTO DE CAIXA E TERMO DE HOMOLOGAÇÃO — ${schoolYear}`,
      'Colégio Crescer • Assinatura da Coordenação e Direção Financeira',
      [`Ano Letivo: ${schoolYear}`],
      'landscape'
    );
  }

  const boxY = spaceLeft < 28 ? 40 : finalTableY + 6;

  // Box Resumo do Saldo Líquido
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(leftX, boxY, contentWidth, 12, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text(
    `FECHAMENTO OPERACIONAL:   Receita Confirmada: ${formatCurrencyBR(metrics.receitaConfirmada)}   (-)   Despesas Totais: ${formatCurrencyBR(metrics.totalDespesasMes)}   (=)   Saldo Líquido Operacional: ${formatCurrencyBR(metrics.saldoLiquidoOperacional)}`,
    leftX + 4,
    boxY + 7.5
  );

  // Linhas de Assinatura
  const sigY = boxY + 22;
  if (sigY < 192) {
    doc.setDrawColor(203, 213, 225);
    doc.line(leftX + 20, sigY, leftX + 110, sigY);
    doc.line(leftX + 159, sigY, leftX + 249, sigY);

    doc.setFontSize(7.2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Coordenação Geral do Programa Integral', leftX + 65, sigY + 4, { align: 'center' });
    doc.text('Diretoria Administrativa e Financeira', leftX + 204, sigY + 4, { align: 'center' });
  }

  applyPageNumbersAndFooters(doc, 'landscape');

  const filename = `Demonstrativo_Financeiro_Consolidado_${schoolYear}.pdf`;
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
// 42.1. DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE MENSAL) EM PDF (LANDSCAPE)
// ---------------------------------------------------------------------------

export interface GenerateDREMonthlyReportOptions {
  schoolYear: number;
  metrics: FinancialMetricSummary;
  monthlyDRE: DREMonthlySummary;
  selectedMonth?: number | 'ALL';
  profilesCount?: number;
  saveImmediately?: boolean;
}

export function generateDREMonthlyReportPDF({
  schoolYear,
  metrics,
  monthlyDRE,
  selectedMonth = 'ALL',
  profilesCount = 0,
  saveImmediately = false,
}: GenerateDREMonthlyReportOptions): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const leftX = 14;
  const contentWidth = 269;

  const targetMonth =
    selectedMonth !== 'ALL' ? monthlyDRE.months.find((m) => m.monthIndex === selectedMonth) : null;

  // Cabeçalho Oficial com timbre
  drawOfficialHeader(
    doc,
    targetMonth
      ? `DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO — ${targetMonth.monthFullName.toUpperCase()} / ${schoolYear}`
      : `DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE MENSAL) — ${schoolYear}`,
    targetMonth
      ? `Colégio Crescer • Demonstrativo Analítico da Competência de ${targetMonth.monthFullName} de ${schoolYear}`
      : 'Colégio Crescer • Demonstrativo Mês a Mês (Jan a Dez) e Fechamento Anual',
    [
      `Ano Letivo: ${schoolYear}`,
      targetMonth ? `Competência: ${targetMonth.monthFullName}` : `Regime: Competência Mensal Contratual`,
      `Base Ativa: ${profilesCount > 0 ? `${profilesCount} Contratos` : 'Base Integrada'}`,
      `Integração: Livro Ponto + Cardápio & Refeições`,
    ],
    'landscape'
  );

  let startY = 36;

  // 4 Cards de Indicadores do DRE
  const cardWidth = (contentWidth - 9) / 4;
  const cardHeight = 17;

  // Card 1: Receita Contratual Líquida
  const card1Value = targetMonth ? targetMonth.receitaLiquida : monthlyDRE.totalAnual.receitaLiquida;
  const card1Title = targetMonth ? `RECEITA LÍQUIDA (${targetMonth.monthName.toUpperCase()})` : 'RECEITA LÍQUIDA ANUAL (ROL)';
  const card1Sub = targetMonth
    ? `Bruto: ${formatCurrencyBR(targetMonth.receitaBruta)} | Bolsas: -${formatCurrencyBR(targetMonth.descontoBolsas)}`
    : `Mensal: ${formatCurrencyBR(metrics.receitaPrevistaMensal)} | 12 meses`;

  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(leftX, startY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(21, 128, 61);
  doc.text(card1Title, leftX + 4, startY + 4.8);
  doc.setFontSize(10);
  doc.setTextColor(21, 128, 61);
  doc.text(formatCurrencyBR(card1Value), leftX + 4, startY + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.0);
  doc.setTextColor(71, 85, 105);
  doc.text(card1Sub, leftX + 4, startY + 15);

  // Card 2: Custos Operacionais Reais
  const card2X = leftX + cardWidth + 3;
  const card2Value = targetMonth ? targetMonth.custosOperacionais : monthlyDRE.totalAnual.custosOperacionais;
  const card2Title = targetMonth ? `CUSTOS (${targetMonth.monthName.toUpperCase()})` : 'CUSTOS OPERACIONAIS ANUAIS';
  const card2Sub = targetMonth
    ? `Folha: ${formatCurrencyBR(targetMonth.custoFolha)} | Alim: ${formatCurrencyBR(targetMonth.custoAlimentacao)}`
    : `Folha Anual: ${formatCurrencyBR(monthlyDRE.totalAnual.custoFolha)} | Alim: ${formatCurrencyBR(monthlyDRE.totalAnual.custoAlimentacao)}`;

  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(254, 202, 202);
  doc.roundedRect(card2X, startY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(185, 28, 28);
  doc.text(card2Title, card2X + 4, startY + 4.8);
  doc.setFontSize(10);
  doc.setTextColor(185, 28, 28);
  doc.text(formatCurrencyBR(card2Value), card2X + 4, startY + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.0);
  doc.setTextColor(153, 27, 27);
  doc.text(card2Sub, card2X + 4, startY + 15);

  // Card 3: Resultado Operacional Líquido
  const card3X = card2X + cardWidth + 3;
  const card3Value = targetMonth ? targetMonth.resultadoLiquido : monthlyDRE.totalAnual.resultadoLiquido;
  const card3Margem = targetMonth ? targetMonth.margemPercentual : monthlyDRE.totalAnual.margemPercentual;
  const card3Title = targetMonth ? `RESULTADO (${targetMonth.monthName.toUpperCase()})` : 'RESULTADO LÍQUIDO ANUAL';
  const isPos = card3Value >= 0;

  doc.setFillColor(isPos ? 238 : 255, isPos ? 242 : 241, isPos ? 255 : 242);
  doc.setDrawColor(isPos ? 199 : 254, isPos ? 210 : 205, isPos ? 254 : 211);
  doc.roundedRect(card3X, startY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(isPos ? 67 : 190, isPos ? 56 : 18, isPos ? 202 : 60);
  doc.text(card3Title, card3X + 4, startY + 4.8);
  doc.setFontSize(10);
  doc.setTextColor(isPos ? 49 : 190, isPos ? 46 : 18, isPos ? 129 : 60);
  doc.text(formatCurrencyBR(card3Value), card3X + 4, startY + 10.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.0);
  doc.setTextColor(isPos ? 22 : 220, isPos ? 101 : 38, isPos ? 52 : 38);
  doc.text(
    isPos
      ? `Superávit (${card3Margem}% Margem)`
      : `Déficit (${card3Margem}% Margem)`,
    card3X + 4,
    startY + 15
  );

  // Card 4: Ticket Médio & Base
  const card4X = card3X + cardWidth + 3;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(card4X, startY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  doc.text('TICKET MÉDIO MENSAL', card4X + 4, startY + 4.8);
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrencyBR(metrics.ticketMedioPorAluno), card4X + 4, startY + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.0);
  doc.setTextColor(71, 85, 105);
  doc.text(`${metrics.totalAlunosPagantes} pagantes (${metrics.totalIsentos} isentos)`, card4X + 4, startY + 15);

  startY += cardHeight + 4;

  // Banner da Seção da Tabela
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(leftX, startY, contentWidth, 5.5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('MATRIZ MÊS A MÊS DO DRE (JANEIRO A DEZEMBRO) — EXERCÍCIO ' + schoolYear, leftX + 4, startY + 3.8);

  startY += 7;

  // Montagem da tabela mensal (14 colunas: Linha Contábil, Jan, Fev, Mar, Abr, Mai, Jun, Jul, Ago, Set, Out, Nov, Dez, Total Anual)
  const headRow = [
    'Linha Contábil / Indicador',
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
    'Total Anual'
  ];

  const row1 = [
    '1. Receita Operacional Bruta',
    ...monthlyDRE.months.map(m => formatCurrencyBR(m.receitaBruta)),
    formatCurrencyBR(monthlyDRE.totalAnual.receitaBruta)
  ];

  const row2 = [
    '2. (-) Deduções e Bolsas de Estudo',
    ...monthlyDRE.months.map(m => `-${formatCurrencyBR(m.descontoBolsas)}`),
    `-${formatCurrencyBR(monthlyDRE.totalAnual.descontoBolsas)}`
  ];

  const row3 = [
    '3. (=) Receita Operacional Líquida (ROL)',
    ...monthlyDRE.months.map(m => formatCurrencyBR(m.receitaLiquida)),
    formatCurrencyBR(monthlyDRE.totalAnual.receitaLiquida)
  ];

  const row4 = [
    '4.1 (-) Folha de Pagamento & Equipe (Ponto)',
    ...monthlyDRE.months.map(m => `-${formatCurrencyBR(m.custoFolha)}`),
    `-${formatCurrencyBR(monthlyDRE.totalAnual.custoFolha)}`
  ];

  const row5 = [
    '4.2 (-) Alimentação Escolar & Insumos (Cardápio)',
    ...monthlyDRE.months.map(m => `-${formatCurrencyBR(m.custoAlimentacao)}`),
    `-${formatCurrencyBR(monthlyDRE.totalAnual.custoAlimentacao)}`
  ];

  const row6 = [
    '4. (=) Total Custos Operacionais Reais',
    ...monthlyDRE.months.map(m => `-${formatCurrencyBR(m.custosOperacionais)}`),
    `-${formatCurrencyBR(monthlyDRE.totalAnual.custosOperacionais)}`
  ];

  const row7 = [
    '5. (=) Resultado Operacional Líquido',
    ...monthlyDRE.months.map(m => formatCurrencyBR(m.resultadoLiquido)),
    formatCurrencyBR(monthlyDRE.totalAnual.resultadoLiquido)
  ];

  const row8 = [
    '6. Margem Operacional Líquida (%)',
    ...monthlyDRE.months.map(m => `${m.margemPercentual}%`),
    `${monthlyDRE.totalAnual.margemPercentual}%`
  ];

  const tableBody = [row1, row2, row3, row4, row5, row6, row7, row8];

  autoTable(doc, {
    startY,
    head: [headRow],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 6.2,
      cellPadding: 1.8,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.5,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 16.4, halign: 'right' },
      2: { cellWidth: 16.4, halign: 'right' },
      3: { cellWidth: 16.4, halign: 'right' },
      4: { cellWidth: 16.4, halign: 'right' },
      5: { cellWidth: 16.4, halign: 'right' },
      6: { cellWidth: 16.4, halign: 'right' },
      7: { cellWidth: 16.4, halign: 'right' },
      8: { cellWidth: 16.4, halign: 'right' },
      9: { cellWidth: 16.4, halign: 'right' },
      10: { cellWidth: 16.4, halign: 'right' },
      11: { cellWidth: 16.4, halign: 'right' },
      12: { cellWidth: 16.4, halign: 'right' },
      13: { cellWidth: 18.2, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (selectedMonth !== 'ALL' && data.column.index === Number(selectedMonth)) {
        if (data.section === 'head') {
          data.cell.styles.fillColor = [79, 70, 229]; // indigo-600
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if (data.section === 'body') {
        const rowIndex = data.row.index;
        if (rowIndex === 2) {
          data.cell.styles.fillColor = [240, 253, 244];
          data.cell.styles.textColor = [21, 128, 61];
          data.cell.styles.fontStyle = 'bold';
        } else if (rowIndex === 5) {
          data.cell.styles.fillColor = [254, 242, 242];
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = 'bold';
        } else if (rowIndex === 6) {
          const isRowPos = monthlyDRE.totalAnual.resultadoLiquido >= 0;
          data.cell.styles.fillColor = isRowPos ? [238, 242, 255] : [255, 241, 242];
          data.cell.styles.textColor = isRowPos ? [49, 46, 129] : [190, 18, 60];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 6.6;
        } else if (rowIndex === 7) {
          data.cell.styles.fillColor = [248, 250, 252];
          data.cell.styles.fontStyle = 'bold';
        }

        if (selectedMonth !== 'ALL' && data.column.index === Number(selectedMonth)) {
          data.cell.styles.fontStyle = 'bold';
          if (rowIndex !== 2 && rowIndex !== 5 && rowIndex !== 6) {
            data.cell.styles.fillColor = [238, 242, 255]; // indigo-50
          }
        }
      }
    },
  });

  const afterTableY = (doc as any).lastAutoTable?.finalY || 140;

  // Bloco de Notas Explicativas
  const notesY = afterTableY + 6;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(leftX, notesY, contentWidth, 14, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  doc.setTextColor(30, 41, 59);
  doc.text('NOTAS EXPLICATIVAS DO DRE OPERACIONAL:', leftX + 4, notesY + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `1. Receita apurada a partir dos contratos vigentes no exercício (${formatCurrencyBR(metrics.receitaPrevistaMensal)}/mês e ${formatCurrencyBR(monthlyDRE.totalAnual.receitaLiquida)}/ano).`,
    leftX + 4,
    notesY + 8
  );
  doc.text(
    `2. Custos operacionais 100% integrados às fontes reais: Folha de Pagamento do Livro Ponto (${formatCurrencyBR(metrics.custoFolhaReal || 0)}/mês) e Alimentação Escolar do Cardápio (${formatCurrencyBR(metrics.custoAlimentacaoReal || 0)}/mês). Total operacional mensal: ${formatCurrencyBR(metrics.totalCustosOperacionaisReais ?? metrics.totalDespesasMes)}.`,
    leftX + 4,
    notesY + 11.5
  );

  // Assinaturas
  const sigY = notesY + 24;
  if (sigY < 195) {
    doc.setDrawColor(203, 213, 225);
    doc.line(leftX + 25, sigY, leftX + 115, sigY);
    doc.line(leftX + 154, sigY, leftX + 244, sigY);

    doc.setFontSize(7.0);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Coordenação Geral do Programa Integral', leftX + 70, sigY + 4, { align: 'center' });
    doc.text('Diretoria Financeira & Controladoria Escolar', leftX + 199, sigY + 4, { align: 'center' });
  }

  applyPageNumbersAndFooters(doc, 'landscape');

  const filename = `DRE_Mensal_Consolidado_${schoolYear}.pdf`;
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
// 43. TERMO DE LIBERAÇÃO EXCEPCIONAL / FICHA DE SAÍDA DE BALCÃO (A4 PORTRAIT)
// ---------------------------------------------------------------------------

export interface TermoSaidaAvulsaData {
  student: Student;
  nomeRetirante: string;
  documentoRetirante: string;
  parentesco: string;
  motivoSaida: string;
  dataSaida: string; // YYYY-MM-DD
  horarioSaida: string; // HH:mm
  observacoes?: string;
  responsavelLiberacao?: string;
}

export function generateTermoSaidaAvulsaPDF(
  data: TermoSaidaAvulsaData,
  saveImmediately: boolean = false
): PDFGenerationResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const leftX = 14;
  const contentWidth = 182;
  const rightX = leftX + contentWidth;

  const dataFormatada = formatDateBR(data.dataSaida);
  const horaFormatada = data.horarioSaida || '17:00';

  // Cabeçalho Oficial Institucional
  drawOfficialHeader(
    doc,
    'TERMO DE LIBERAÇÃO DE ALUNO • SAÍDA AVULSA',
    '',
    [
      `Estudante: ${data.student.name}`,
      `Turma: ${data.student.turma}`,
      `Data da Saída: ${dataFormatada}`,
      `Horário: ${horaFormatada}`,
    ],
    'portrait'
  );

  let currentY = 38;

  // Helper para títulos de blocos
  const drawSectionTitle = (title: string, y: number) => {
    doc.setFillColor(15, 23, 42); // slate-900
    doc.roundedRect(leftX, y, contentWidth, 6, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), leftX + 4, y + 4.2);
    return y + 8;
  };

  // -------------------------------------------------------------------------
  // BLOCO 1: DADOS DO(A) ESTUDANTE
  // -------------------------------------------------------------------------
  currentY = drawSectionTitle('1. Dados de Identificação do(a) Aluno(a)', currentY);

  const block1StartY = currentY;
  const block1Height = 28;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, block1StartY, contentWidth, block1Height, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);

  // Linha 1: Nome do Aluno e Turma
  doc.text('Nome do(a) Aluno(a):', leftX + 4, block1StartY + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(data.student.name, leftX + 38, block1StartY + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Turma Oficial:', leftX + 115, block1StartY + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(data.student.turma, leftX + 138, block1StartY + 7);

  // Linha 2: Data/Hora Efetiva e Logística Cadastrada
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Data / Horário da Saída:', leftX + 4, block1StartY + 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(`${dataFormatada} às ${horaFormatada}`, leftX + 38, block1StartY + 15);

  const logisticaHabitual =
    data.student.tipoSaida === 'TRANSPORTE_ESCOLAR'
      ? `Transporte Escolar (Condutor: ${data.student.nomeCondutor || 'Van Credenciada'})`
      : 'Retirada pelos Pais / Responsáveis Diretos';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Logística Cadastrada:', leftX + 95, block1StartY + 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text(logisticaHabitual, leftX + 128, block1StartY + 15);

  // Linha 3: Status / Ano Letivo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text(`Ano Letivo: ${data.student.anoLetivo || 2026}  •  Matrícula Integral Ativa no Sistema E1 / Colégio Crescer`, leftX + 4, block1StartY + 23);

  currentY = block1StartY + block1Height + 5;

  // -------------------------------------------------------------------------
  // BLOCO 2: DADOS DO RETIRANTE / AUTORIZADO
  // -------------------------------------------------------------------------
  currentY = drawSectionTitle('2. Identificação da Pessoa que Está Retirando o Aluno', currentY);

  const block2StartY = currentY;
  const block2Height = 44;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, block2StartY, contentWidth, block2Height, 2, 2, 'FD');

  // Nome do Retirante
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Nome Completo do Retirante:', leftX + 4, block2StartY + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(data.nomeRetirante || '________________________________________________', leftX + 46, block2StartY + 8);

  // Documento e Parentesco
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Documento (RG / CPF):', leftX + 4, block2StartY + 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(data.documentoRetirante || '________________________', leftX + 38, block2StartY + 17);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Parentesco / Vínculo:', leftX + 105, block2StartY + 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(data.parentesco || 'Responsável Autorizado', leftX + 138, block2StartY + 17);

  // Motivo da Saída
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Motivo Declarado:', leftX + 4, block2StartY + 26);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(data.motivoSaida || 'Saída Antecipada / Atendimento Familiar', leftX + 32, block2StartY + 26);

  // Observações
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Observações de Portaria:', leftX + 4, block2StartY + 35);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const obsText = data.observacoes || 'Liberação autorizada presencialmente mediante conferência de documentação pessoal.';
  const splitObs = doc.splitTextToSize(obsText, contentWidth - 46);
  doc.text(splitObs, leftX + 42, block2StartY + 35);

  currentY = block2StartY + block2Height + 5;

  // -------------------------------------------------------------------------
  // BLOCO 3: TERMO DE DECLARAÇÃO, CIÊNCIA E RESPONSABILIDADE
  // -------------------------------------------------------------------------
  currentY = drawSectionTitle('3. Termo de Declaração, Ciência e Responsabilidade', currentY);

  const block3StartY = currentY;
  const block3Height = 26;

  doc.setFillColor(254, 252, 232); // amber-50
  doc.setDrawColor(252, 211, 77); // amber-300
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, block3StartY, contentWidth, block3Height, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(69, 26, 3); // amber-950

  const termoText =
    'Declaro para os devidos fins de direito e controle da rotina escolar que, nesta data e horário, procedi à retirada do(a) estudante acima qualificado(a) das dependências do Colégio Crescer (Programa do Integral). Declaro estar ciente de que a responsabilidade pela guarda, segurança e integridade física do(a) aluno(a) transfere-se integralmente a mim a partir do ato desta liberação excepcional de Portaria.';
  const splitTermo = doc.splitTextToSize(termoText, contentWidth - 8);
  doc.text(splitTermo, leftX + 4, block3StartY + 6);

  currentY = block3StartY + block3Height + 10;

  // -------------------------------------------------------------------------
  // BLOCO 4: CAMPOS DE ASSINATURA (LADO A LADO)
  // -------------------------------------------------------------------------
  currentY = drawSectionTitle('4. Termo de Quitação e Assinaturas Homologadas', currentY);

  const sigBoxY = currentY;
  const sigBoxHeight = 52;

  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, sigBoxY, contentWidth, sigBoxHeight, 2, 2, 'FD');

  const halfWidth = (contentWidth - 12) / 2;
  const col1X = leftX + 6;
  const col2X = leftX + halfWidth + 12;

  // Linhas de assinatura
  const lineY = sigBoxY + 28;

  // Assinatura 1: Retirante / Responsável
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.4);
  doc.line(col1X + 4, lineY, col1X + halfWidth - 4, lineY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(15, 23, 42);
  doc.text('Assinatura do Responsável / Retirante', col1X + halfWidth / 2, lineY + 4.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(`Nome: ${data.nomeRetirante}`, col1X + halfWidth / 2, lineY + 9, { align: 'center' });
  doc.text(`Documento: ${data.documentoRetirante}`, col1X + halfWidth / 2, lineY + 13, { align: 'center' });
  doc.text(`Grau de Parentesco / Vínculo: ${data.parentesco}`, col1X + halfWidth / 2, lineY + 17, { align: 'center' });

  // Assinatura 2: Coordenação / Portaria
  doc.line(col2X + 4, lineY, col2X + halfWidth - 4, lineY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(15, 23, 42);
  doc.text('Visto da Coordenação do Integral / Portaria', col2X + halfWidth / 2, lineY + 4.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  // Remove qualquer exibição textual entre parênteses do cargo/função (ex: "(Coordenador (Administrador))")
  const rawRespName = data.responsavelLiberacao || 'Coordenação Geral do Programa Integral';
  const cleanRespName = rawRespName.replace(/\s*\([^)]*\)/g, '').trim() || 'Coordenação Geral do Programa Integral';
  doc.text(cleanRespName, col2X + halfWidth / 2, lineY + 9, { align: 'center' });
  doc.text('Colégio Crescer — Campinas/SP', col2X + halfWidth / 2, lineY + 13, { align: 'center' });
  doc.text(`Liberado presencialmente em ${dataFormatada} às ${horaFormatada}`, col2X + halfWidth / 2, lineY + 17, { align: 'center' });

  // Rodapé Oficial
  applyPageNumbersAndFooters(doc, 'portrait');

  const cleanStudentName = data.student.name.replace(/[^a-zA-Z0-9À-ÿ]/g, '_').slice(0, 25);
  const cleanDate = (data.dataSaida || 'hoje').replace(/[^a-zA-Z0-9]/g, '-');
  const filename = `Termo_Saida_Avulsa_${cleanStudentName}_${cleanDate}.pdf`;

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







