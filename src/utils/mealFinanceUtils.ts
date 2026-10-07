import * as XLSX from 'xlsx';
import {
  Student,
  AttendanceRecord,
  HolidayItem,
  DayOfWeek,
  MealDailyEntry,
  MealReportConfig,
} from '../types';
import { formatDateBR, getDayOfWeekFromDate, getDayOfWeekLabel, isHolidayOrRecess, isStudentScheduledForDate } from './dateUtils';
import { isPresencaStatus, isFaltaStatus, isJustificadoStatus, isRoutineActivity } from './frequenciaUtils';

export const MEAL_STORAGE_KEY_PREFIX = 'crescer_meal_config_';

/**
 * Retorna o nome amigável do dia da semana (ex: Segunda-feira)
 */
export function getFriendlyDayLabel(dayOfWeek: string): string {
  switch (dayOfWeek) {
    case 'segunda':
      return 'Segunda-feira';
    case 'terca':
      return 'Terça-feira';
    case 'quarta':
      return 'Quarta-feira';
    case 'quinta':
      return 'Quinta-feira';
    case 'sexta':
      return 'Sexta-feira';
    case 'sabado':
      return 'Sábado';
    case 'domingo':
      return 'Domingo';
    default:
      return dayOfWeek;
  }
}

/**
 * Carrega a configuração de refeições salva para um mês (localStorage)
 */
export function loadMealConfig(monthKey: string): MealReportConfig | null {
  try {
    const raw = localStorage.getItem(`${MEAL_STORAGE_KEY_PREFIX}${monthKey}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Erro ao carregar configuração de refeições:', e);
  }
  return null;
}

/**
 * Salva a configuração de refeições de um mês (localStorage)
 */
export function saveMealConfig(config: MealReportConfig): void {
  try {
    localStorage.setItem(
      `${MEAL_STORAGE_KEY_PREFIX}${config.monthKey}`,
      JSON.stringify(config)
    );
  } catch (e) {
    console.warn('Erro ao salvar configuração de refeições:', e);
  }
}

/**
 * Salva ou atualiza o snapshot de refeições para uma data específica no LocalStorage.
 * 'lastCalculatedMealsCount' preserva a contagem de refeições da chamada de rotina.
 */
export function recordMealSnapshotForDate(
  dateStr: string,
  mealsCount: number
): void {
  if (!dateStr || mealsCount <= 0) return;
  const monthKey = dateStr.slice(0, 7); // "YYYY-MM"
  try {
    const existing = loadMealConfig(monthKey) || {
      id: monthKey,
      monthKey,
      year: parseInt(dateStr.slice(0, 4), 10),
      month: parseInt(dateStr.slice(5, 7), 10),
      defaultUnitPrice: 9.0,
      entries: {},
    };

    const currentEntry = existing.entries[dateStr] || {};
    if (currentEntry.lastCalculatedMealsCount === mealsCount) return;

    existing.entries[dateStr] = {
      ...currentEntry,
      lastCalculatedMealsCount: mealsCount,
      updatedAt: new Date().toISOString(),
    };

    saveMealConfig(existing);
  } catch (err) {
    console.warn('Erro ao registrar snapshot de refeições:', err);
  }
}

/**
 * Sincroniza snapshots de refeições calculados a partir dos registros de frequência de Rotina
 */
export function syncMealSnapshotsFromRecords(records: AttendanceRecord[]): void {
  if (!Array.isArray(records) || records.length === 0) return;
  const countsByDate = new Map<string, number>();
  records.forEach((r) => {
    if (!r || !r.date) return;
    if (isRoutineActivity(r.activity) || !r.activity) {
      if (isPresencaStatus(r.status)) {
        countsByDate.set(r.date, (countsByDate.get(r.date) || 0) + 1);
      }
    }
  });

  countsByDate.forEach((count, dateStr) => {
    if (count > 0) {
      recordMealSnapshotForDate(dateStr, count);
    }
  });
}

/**
 * Retorna o total de alunos presentes na chamada oficial para uma data específica
 */
export function getRollCallPresencesForDate(dateStr: string, records: AttendanceRecord[]): number {
  if (!Array.isArray(records) || records.length === 0) return 0;
  
  // 1. Prioriza registros da rotina/chamada geral
  const routineRecords = records.filter((r) => {
    if (!r || r.date !== dateStr) return false;
    return isRoutineActivity(r.activity) || !r.activity;
  });

  if (routineRecords.length > 0) {
    return routineRecords.filter((r) => isPresencaStatus(r.status)).length;
  }

  // 2. Fallback por aluno único com presença registrada na data
  const dayRecords = records.filter((r) => r && r.date === dateStr);
  const presentStudentIds = new Set<string>();
  dayRecords.forEach((r) => {
    if (isPresencaStatus(r.status) && r.studentId) {
      presentStudentIds.add(r.studentId);
    }
  });
  return presentStudentIds.size;
}

/**
 * Constrói a lista detalhada de dias para um período específico (Data Inicial a Data Final)
 * Mantém a regra de desconsiderar sábados, domingos e feriados cadastrados nos cálculos padrão.
 */
export function buildMealEntriesForDateRange(
  startDateStr: string, // YYYY-MM-DD
  endDateStr: string,   // YYYY-MM-DD
  students: Student[],
  records: AttendanceRecord[],
  holidays: HolidayItem[],
  configOverrides?: MealReportConfig | null,
  defaultUnitPrice: number = 9.0
): MealDailyEntry[] {
  const entries: MealDailyEntry[] = [];
  const savedEntries = configOverrides?.entries || {};
  const effectiveUnitPrice = configOverrides?.defaultUnitPrice ?? defaultUnitPrice;

  if (!startDateStr || !endDateStr) return entries;

  const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);

  const start = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);

  // Garantir ordem correta
  if (start > end) return entries;

  const current = new Date(start);
  while (current <= end) {
    const year = current.getFullYear();
    const month = current.getMonth() + 1;
    const day = current.getDate();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeekIndex = current.getDay(); // 0=Dom, 6=Sab

    let dayOfWeek: DayOfWeek | 'sabado' | 'domingo';
    if (dayOfWeekIndex === 0) dayOfWeek = 'domingo';
    else if (dayOfWeekIndex === 6) dayOfWeek = 'sabado';
    else {
      const weekdays: DayOfWeek[] = ['domingo' as any, 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado' as any];
      dayOfWeek = weekdays[dayOfWeekIndex];
    }

    const isWeekend = dayOfWeekIndex === 0 || dayOfWeekIndex === 6;
    const holidayMatch = isHolidayOrRecess(dateStr, holidays);
    const isHoliday = !!holidayMatch;
    const isSchoolDay = !isWeekend && !isHoliday;

    // 1. Coluna TOTAL ESPERADOS (Alunos Efetivamente Esperados no Dia):
    let expectedStudentsCount = 0;
    if (isSchoolDay) {
      const scheduledStudents = students.filter((s) => {
        const status = s.status || s.statusMatricula || 'ativo';
        if (status === 'inativo' || status === 'cancelado') return false;
        return isStudentScheduledForDate(s, dateStr);
      });
      expectedStudentsCount = scheduledStudents.length;
    }

    const dayTotalEsperados = isSchoolDay ? expectedStudentsCount : 0;

    // Calcular quantidade de alunos presentes segundo a chamada do sistema
    let systemCount = 0;
    let dayPresentes = 0;
    let dayFaltas = 0;
    let dayAtestados = 0;
    let dayPendentes = 0;
    let hasCallConcluded = false;

    if (isSchoolDay) {
      const routineRecords = records.filter((r) => {
        if (!r || r.date !== dateStr) return false;
        return isRoutineActivity(r.activity) || !r.activity;
      });

      if (routineRecords.length > 0) {
        hasCallConcluded = true;
        dayPresentes = routineRecords.filter((r) => isPresencaStatus(r.status)).length;
        dayFaltas = routineRecords.filter((r) => isFaltaStatus(r.status)).length;
        dayAtestados = routineRecords.filter((r) => isJustificadoStatus(r.status)).length;
        dayPendentes = Math.max(0, expectedStudentsCount - (dayPresentes + dayFaltas + dayAtestados));
        systemCount = dayPresentes;
      } else {
        // Fallback: se houver registros de chamada no dia sem tag específica
        const anyDayRecords = records.filter((r) => r && r.date === dateStr);
        if (anyDayRecords.length > 0) {
          const presentSet = new Set<string>();
          const faltaSet = new Set<string>();
          const atestadoSet = new Set<string>();
          anyDayRecords.forEach((r) => {
            if (!r.studentId) return;
            if (isPresencaStatus(r.status)) presentSet.add(r.studentId);
            else if (isJustificadoStatus(r.status)) atestadoSet.add(r.studentId);
            else if (isFaltaStatus(r.status)) faltaSet.add(r.studentId);
          });
          dayPresentes = presentSet.size;
          dayFaltas = faltaSet.size;
          dayAtestados = atestadoSet.size;
          hasCallConcluded = dayPresentes > 0 || dayFaltas > 0;
          dayPendentes = Math.max(0, expectedStudentsCount - (dayPresentes + dayFaltas + dayAtestados));
          systemCount = dayPresentes;
        } else {
          hasCallConcluded = false;
          systemCount = 0;
          dayPresentes = 0;
          dayFaltas = 0;
          dayAtestados = 0;
          dayPendentes = expectedStudentsCount;
        }
      }
    }

    const savedDay = savedEntries[dateStr];
    const rawSavedCount = savedDay?.editableStudents !== undefined ? savedDay?.editableStudents : savedDay?.manualCount;
    const hasSavedCount = rawSavedCount !== undefined && rawSavedCount !== null;
    const savedCountNum = hasSavedCount ? Number(rawSavedCount) : undefined;
    const isSavedZeroOrNull = savedCountNum === undefined || isNaN(savedCountNum) || savedCountNum === 0;

    // Snapshot e Fallback de Histórico (Fallback de Chamada Reaberta)
    let lastCalculatedMealsCount = savedDay?.lastCalculatedMealsCount;
    let isReopenedCall = false;
    let effectiveSystemCount = systemCount;

    if (dayPresentes > 0) {
      lastCalculatedMealsCount = dayPresentes;
      effectiveSystemCount = dayPresentes;
      isReopenedCall = false;
    } else if (
      isSchoolDay &&
      dayPresentes === 0 &&
      lastCalculatedMealsCount !== undefined &&
      lastCalculatedMealsCount > 0
    ) {
      isReopenedCall = true;
      effectiveSystemCount = lastCalculatedMealsCount;
    }

    let manualCount = 0;
    let isManualOverride = false;

    if (isSchoolDay) {
      if (!isSavedZeroOrNull) {
        // Se houver valor manual salvo maior que zero, preserva o valor explicitamente editado pelo usuário
        manualCount = savedCountNum!;
        isManualOverride = Boolean(savedDay?.isManualOverride ?? true);
      } else if (effectiveSystemCount > 0) {
        // DIRETRIZ SÊNIOR (Item 1):
        // Caso o campo 'ALUNOS (EDITÁVEL)' (editableStudents) do dia esteja zerado ou nulo
        // e a chamada automática possuir valor (ex: 165 alunos no dia 06/10/2026),
        // preenche automaticamente editableStudents com o total de presentes (presentCount) da chamada do dia!
        manualCount = effectiveSystemCount;
        isManualOverride = false;
      } else if (isReopenedCall && lastCalculatedMealsCount !== undefined && lastCalculatedMealsCount > 0) {
        manualCount = lastCalculatedMealsCount;
        isManualOverride = false;
      } else {
        manualCount = 0;
        isManualOverride = false;
      }
    } else {
      manualCount = !isSavedZeroOrNull ? savedCountNum! : 0;
      isManualOverride = !isSavedZeroOrNull;
    }

    const unitPrice = savedDay?.unitPrice !== undefined ? Number(savedDay.unitPrice) : effectiveUnitPrice;
    const notes = savedDay?.notes || (isHoliday ? (holidayMatch?.name || 'Recesso/Feriado') : isWeekend ? 'Final de Semana' : '');

    entries.push({
      date: dateStr,
      dayNumber: day,
      dayOfWeek,
      dayLabel: getFriendlyDayLabel(dayOfWeek),
      isSchoolDay,
      holidayName: isHoliday ? holidayMatch?.name : undefined,
      totalEsperados: dayTotalEsperados,
      presentes: isReopenedCall && dayPresentes === 0 ? (lastCalculatedMealsCount || 0) : dayPresentes,
      faltas: dayFaltas,
      atestados: dayAtestados,
      pendentes: isReopenedCall ? 0 : dayPendentes,
      systemCount: isSchoolDay ? effectiveSystemCount : 0,
      manualCount,
      editableStudents: manualCount,
      isManualOverride,
      lastCalculatedMealsCount: lastCalculatedMealsCount || (manualCount > 0 ? manualCount : undefined),
      isReopenedCall,
      unitPrice,
      total: manualCount * unitPrice,
      notes,
    });

    // Próximo dia
    current.setDate(current.getDate() + 1);
  }

  return entries;
}

/**
 * Constrói a lista detalhada de dias para o mês com contagens do sistema e dados manuais
 */
export function buildMonthMealEntries(
  year: number,
  month: number, // 1-12
  students: Student[],
  records: AttendanceRecord[],
  holidays: HolidayItem[],
  configOverrides?: MealReportConfig | null,
  defaultUnitPrice: number = 9.0
): MealDailyEntry[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  return buildMealEntriesForDateRange(
    startDateStr,
    endDateStr,
    students,
    records,
    holidays,
    configOverrides,
    defaultUnitPrice
  );
}

/**
 * Calcula métricas resumidas do relatório
 */
export function calculateMealTotals(entries: MealDailyEntry[]) {
  const attendedDays = entries.filter((e) => e.manualCount > 0);
  const totalMeals = entries.reduce((acc, curr) => acc + (Number(curr.manualCount) || 0), 0);
  const totalEsperados = entries.reduce((acc, curr) => acc + (Number(curr.totalEsperados) || 0), 0);
  const totalSystemMeals = entries.reduce((acc, curr) => acc + (Number(curr.systemCount) || 0), 0);
  const totalAmount = entries.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
  const schoolDaysCount = entries.filter((e) => e.isSchoolDay).length;
  const averageMealsPerDay = attendedDays.length > 0 ? Math.round((totalMeals / attendedDays.length) * 10) / 10 : 0;

  return {
    totalMeals,
    totalEsperados,
    totalSystemMeals,
    totalAmount,
    attendedDaysCount: attendedDays.length,
    schoolDaysCount,
    averageMealsPerDay,
  };
}

/**
 * Exporta a planilha editável em Excel (.xlsx) com FÓRMULAS NATIVAS do Excel
 */
export function exportMealReportToExcel(
  entries: MealDailyEntry[],
  periodLabel: string,
  config: MealReportConfig
): void {
  const wb = XLSX.utils.book_new();

  // Cabeçalho de informações gerais
  const headerRows: (string | number)[][] = [
    ['INSTITUTO EDUCACIONAL CRESCER - PROGRAMA INTEGRAL'],
    ['RELATÓRIO FINANCEIRO DE REFEIÇÕES / ALMOÇO'],
    [`Período de Referência: ${periodLabel}`, '', `Emissão: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`],
    [`Prestador / Cantina: ${config.contractCompany || 'Cantina e Nutrição Escolar'}`, '', `Valor Unitário Padrão: R$ ${config.defaultUnitPrice.toFixed(2)}`],
    [],
    ['Data', 'Dia da Semana', 'Situação / Observação', 'Total Esperados (Ativos)', 'Refeições / Presentes (Qtd)', 'Valor Unitário (R$)', 'Total Diário (R$)'],
  ];

  // Adicionar linhas com dados
  // Começamos na linha 7 (índice 6)
  const dataRows: any[][] = [];
  const startRowIndex = 7; // Linha 7 no Excel (1-based)

  entries.forEach((e, idx) => {
    const excelRow = startRowIndex + idx;
    const dateFormatted = formatDateBR(e.date);
    
    // Total Diário com fórmula: =E{row}*F{row}
    const formulaCell = { f: `E${excelRow}*F${excelRow}`, t: 'n', v: e.manualCount * e.unitPrice };

    dataRows.push([
      dateFormatted,
      e.dayLabel,
      e.notes || (e.isSchoolDay ? 'Dia Letivo' : 'Não Letivo'),
      e.isSchoolDay ? (e.totalEsperados ?? e.manualCount) : 0,
      e.manualCount,
      e.unitPrice,
      formulaCell,
    ]);
  });

  const lastDataRowIndex = startRowIndex + entries.length - 1;

  // Linhas de Soma Final com fórmulas
  const sumEsperadosFormula = { f: `SUM(D${startRowIndex}:D${lastDataRowIndex})`, t: 'n' };
  const sumMealsFormula = { f: `SUM(E${startRowIndex}:E${lastDataRowIndex})`, t: 'n' };
  const sumTotalFormula = { f: `SUM(G${startRowIndex}:G${lastDataRowIndex})`, t: 'n' };

  const footerRows: any[][] = [
    [],
    ['TOTAL GERAL DO PERÍODO', '', 'Consolidado Final', sumEsperadosFormula, sumMealsFormula, '', sumTotalFormula],
    [],
    ['ASSINATURAS E CONFERÊNCIA:'],
    [`${config.responsibleCoordinator || 'Fernando Veiga'}`],
    [`${config.coordinatorRole || 'Coordenação do Integral / DP GAVAR'}`],
    [],
    [`${config.responsibleFinancial || 'Departamento Financeiro'}`],
    [`${config.financialRole || 'Conferência e Prestação de Contas'}`],
    [],
    [`Data de Validação: _____ / _____ / ${new Date().getFullYear()}`],
  ];

  const allRows = [...headerRows, ...dataRows, ...footerRows];
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Definir larguras de coluna
  ws['!cols'] = [
    { wch: 14 }, // Data
    { wch: 16 }, // Dia da Semana
    { wch: 30 }, // Observação
    { wch: 25 }, // Total Esperados (Ativos)
    { wch: 25 }, // Refeições / Presentes
    { wch: 20 }, // Valor Unitário
    { wch: 20 }, // Total Diário
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Relatório de Refeições');

  const cleanPeriod = periodLabel.replace(/[\/\s:]+/g, '_');
  const fileName = `Relatorio_Refeicoes_${cleanPeriod}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Exporta em CSV formatado em português (delimitador ';' e UTF-8 com BOM)
 */
export function exportMealReportToCSV(
  entries: MealDailyEntry[],
  periodLabel: string,
  config: MealReportConfig
): void {
  const totals = calculateMealTotals(entries);

  let csvContent = '\uFEFF'; // UTF-8 BOM
  csvContent += 'INSTITUTO EDUCACIONAL CRESCER - PROGRAMA INTEGRAL\n';
  csvContent += 'RELATORIO FINANCEIRO DE REFEICOES (ALMOCO)\n';
  csvContent += `Periodo de Referencia:;${periodLabel}\n`;
  csvContent += `Prestador/Cantina:;${config.contractCompany || 'Cantina e Nutricao Escolar'}\n`;
  csvContent += `Data de Emissao:;${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}\n\n`;

  csvContent += 'Data;Dia da Semana;Situacao / Observacao;Total Esperados (Ativos);Alunos Presentes / Refeicoes (Qtd);Valor Unitario (R$);Total Diario (R$)\n';

  entries.forEach((e) => {
    const totalFormatted = (e.manualCount * e.unitPrice).toFixed(2).replace('.', ',');
    const unitPriceFormatted = e.unitPrice.toFixed(2).replace('.', ',');
    const obs = (e.notes || (e.isSchoolDay ? 'Dia Letivo' : 'Nao Letivo')).replace(/;/g, ',');
    const esperadosQtd = e.isSchoolDay ? (e.totalEsperados ?? e.manualCount) : 0;

    csvContent += `${formatDateBR(e.date)};${e.dayLabel};"${obs}";${esperadosQtd};${e.manualCount};${unitPriceFormatted};${totalFormatted}\n`;
  });

  const totalGeralFormatted = totals.totalAmount.toFixed(2).replace('.', ',');
  csvContent += `\nTOTAL DO PERIODO;;Consolidado Geral;${totals.totalEsperados};${totals.totalMeals};;${totalGeralFormatted}\n`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const cleanPeriod = periodLabel.replace(/[\/\s:]+/g, '_');
  link.setAttribute('download', `Relatorio_Refeicoes_${cleanPeriod}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
