import { PontoRecord, PontoMonthClosing, HolidayItem, UserProfile, PontoStatus } from '../types';
import { isWeekend, isSaturday, isSunday, isHolidayOrRecess, toISODateString } from './dateUtils';

/**
 * Converts "HH:MM" time string to minutes from 00:00 (e.g. "11:40" -> 700)
 */
export function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr || !timeStr.includes(':')) return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Converts minutes from 00:00 to "HH:MM" (e.g. 700 -> "11:40")
 */
export function formatMinutesToTime(totalMinutes: number): string {
  if (isNaN(totalMinutes) || totalMinutes < 0) return '00:00';
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.floor(totalMinutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Converts minutes to friendly hours and minutes format (e.g. 520 -> "8h40min", 360 -> "6h00min")
 */
export function formatMinutesToHoursAndMinutes(totalMinutes: number): string {
  if (isNaN(totalMinutes) || totalMinutes === 0) return '0h00min';
  const isNegative = totalMinutes < 0;
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = Math.floor(abs % 60);
  const formatted = `${h}h${String(m).padStart(2, '0')}min`;
  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Parses user input string or number representing hours/minutes into exact total minutes.
 * Supports: "8h 42min", "8h42min", "8h 42", "8:42", "8.7", "8,7", "6h", 6, 522
 */
export function parseHoursAndMinutesStringToMinutes(str?: string | number): number {
  if (typeof str === 'number') {
    if (isNaN(str) || str <= 0) return 360;
    if (str < 24) return Math.round(str * 60);
    return Math.round(str);
  }
  if (!str || !String(str).trim()) return 360;
  const clean = String(str).trim().toLowerCase();

  // Match "8h 42min", "8h 42", "8h42", "8h"
  const hmMatch = clean.match(/^(\d+)\s*h\s*(\d+)?/);
  if (hmMatch) {
    const h = parseInt(hmMatch[1], 10);
    const m = hmMatch[2] ? parseInt(hmMatch[2], 10) : 0;
    return (h * 60) + m;
  }

  // Match "08:42"
  const colonMatch = clean.match(/^(\d+):(\d+)/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    return (h * 60) + m;
  }

  // Match decimals "8.7" or "8,7" or "6"
  const numStr = clean.replace(',', '.').replace(/[^\d.]/g, '');
  const val = parseFloat(numStr);
  if (!isNaN(val) && val > 0) {
    if (val < 24) return Math.round(val * 60);
    return Math.round(val);
  }

  return 360;
}

/**
 * Dynamically calculates contractual daily hours from a schedule string.
 * Supports:
 * - Single shift: "11:40 - 17:40" (6h 00min), "08:00 - 14:00" (6h 00min)
 * - Two shifts with lunch interval: "07:30 - 11:30 / 13:00 - 17:42" (4h 00min + 4h 42min = 8h 42min, 1h30 almoço descontado)
 * - Free text variations: "08:00 às 12:00 e 13:30 às 17:30" (4h + 4h = 8h 00min, 1h30 almoço descontado)
 */
export function calculateDailyHoursFromSchedule(scheduleStr = ''): {
  dailyHours: number;
  dailyHoursFormatted: string;
  workedMinutes: number;
  lunchBreakMinutes: number;
  shiftsCount: number;
  summary: string;
} {
  if (!scheduleStr || !scheduleStr.trim()) {
    return {
      dailyHours: 6,
      dailyHoursFormatted: '6h00min',
      workedMinutes: 360,
      lunchBreakMinutes: 0,
      shiftsCount: 0,
      summary: '',
    };
  }

  // Extract all time patterns like "08:00", "8:00", "07:30", "11:30", "13:00", "17:42"
  const timeRegex = /\b([0-1]?[0-9]|2[0-3]):([0-5][0-9])\b/g;
  const matches = Array.from(scheduleStr.matchAll(timeRegex));

  if (matches.length < 2) {
    return {
      dailyHours: 6,
      dailyHoursFormatted: '6h00min',
      workedMinutes: 360,
      lunchBreakMinutes: 0,
      shiftsCount: 0,
      summary: '',
    };
  }

  const timesInMinutes: number[] = matches.map((m) => {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    return h * 60 + min;
  });

  let totalWorkedMinutes = 0;
  let totalLunchBreakMinutes = 0;
  let shiftsCount = 0;
  let shift1Minutes = 0;
  let shift2Minutes = 0;

  if (timesInMinutes.length >= 4) {
    // 2 shifts: Turno 1 (times[0] -> times[1]), Almoço (times[1] -> times[2]), Turno 2 (times[2] -> times[3])
    shift1Minutes = Math.max(0, timesInMinutes[1] - timesInMinutes[0]);
    totalLunchBreakMinutes = Math.max(0, timesInMinutes[2] - timesInMinutes[1]);
    shift2Minutes = Math.max(0, timesInMinutes[3] - timesInMinutes[2]);

    totalWorkedMinutes = shift1Minutes + shift2Minutes;
    shiftsCount = 2;
  } else if (timesInMinutes.length >= 2) {
    // 1 shift: times[0] -> times[1]
    shift1Minutes = Math.max(0, timesInMinutes[1] - timesInMinutes[0]);
    totalWorkedMinutes = shift1Minutes;
    shiftsCount = 1;
  }

  const dailyHours = totalWorkedMinutes > 0 ? Number((totalWorkedMinutes / 60).toFixed(2)) : 6;
  const dailyHoursFormatted = formatMinutesToHoursAndMinutes(totalWorkedMinutes || 360);

  let summary = '';
  if (shiftsCount === 2 && totalLunchBreakMinutes > 0) {
    const lunchFormatted = formatMinutesToTime(totalLunchBreakMinutes);
    summary = `Carga Calculada: ${dailyHoursFormatted} (${formatMinutesToHoursAndMinutes(shift1Minutes)} + ${formatMinutesToHoursAndMinutes(shift2Minutes)} • ${lunchFormatted} de almoço descontado)`;
  } else if (shiftsCount === 1) {
    summary = `Carga Calculada: ${dailyHoursFormatted} diárias`;
  }

  return {
    dailyHours,
    dailyHoursFormatted,
    workedMinutes: totalWorkedMinutes,
    lunchBreakMinutes: totalLunchBreakMinutes,
    shiftsCount,
    summary,
  };
}

/**
 * Parses contract schedule string like "11:40 - 17:40", "07:30 - 11:30 / 13:00 - 17:42"
 */
export function parseContractSchedule(scheduleStr = '11:40 - 17:40'): {
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  dailyHours: number;
  dailyHoursFormatted: string;
  workedMinutes: number;
  lunchBreakMinutes: number;
} {
  const timeRegex = /\b([0-1]?[0-9]|2[0-3]):([0-5][0-9])\b/g;
  const matches = Array.from(scheduleStr.matchAll(timeRegex));

  const { dailyHours, dailyHoursFormatted, workedMinutes, lunchBreakMinutes } = calculateDailyHoursFromSchedule(scheduleStr);

  if (matches.length >= 4) {
    const start = matches[0][0];
    const end = matches[3][0];
    const startMinutes = (parseInt(matches[0][1], 10) * 60) + parseInt(matches[0][2], 10);
    const endMinutes = (parseInt(matches[3][1], 10) * 60) + parseInt(matches[3][2], 10);
    return { start, end, startMinutes, endMinutes, dailyHours, dailyHoursFormatted, workedMinutes, lunchBreakMinutes };
  }

  if (matches.length >= 2) {
    const start = matches[0][0];
    const end = matches[1][0];
    const startMinutes = (parseInt(matches[0][1], 10) * 60) + parseInt(matches[0][2], 10);
    const endMinutes = (parseInt(matches[1][1], 10) * 60) + parseInt(matches[1][2], 10);
    return { start, end, startMinutes, endMinutes, dailyHours, dailyHoursFormatted, workedMinutes, lunchBreakMinutes };
  }

  return {
    start: '11:40',
    end: '17:40',
    startMinutes: 700,
    endMinutes: 1060,
    dailyHours: 6,
    dailyHoursFormatted: '6h00min',
    workedMinutes: 360,
    lunchBreakMinutes: 0,
  };
}

/**
 * Applies 5-minute tolerance rule:
 * - If punch is within +/- tolerance of expected time, it is considered EXACTLY the scheduled time.
 * - No deductions or overtime are applied for variations up to 5 minutes.
 */
export function applyTolerance(
  actualTime: string,
  expectedTime: string,
  toleranceMinutes = 5
): {
  effectiveTime: string;
  isWithinTolerance: boolean;
  diffMinutes: number; // Positive = extra, Negative = late/early exit
} {
  const actualMin = parseTimeToMinutes(actualTime);
  const expectedMin = parseTimeToMinutes(expectedTime);

  if (actualMin === null || expectedMin === null) {
    return { effectiveTime: actualTime, isWithinTolerance: false, diffMinutes: 0 };
  }

  const diff = actualMin - expectedMin;

  if (Math.abs(diff) <= toleranceMinutes) {
    return {
      effectiveTime: expectedTime,
      isWithinTolerance: true,
      diffMinutes: 0,
    };
  }

  return {
    effectiveTime: actualTime,
    isWithinTolerance: false,
    diffMinutes: diff,
  };
}

/**
 * Determines if a user/schedule is configured for continuous shift (e.g. 6 hours straight without mandatory lunch punch)
 * - Returns true ONLY for 'continua_6h' (2 punches: Entrada and Saida)
 * - Returns false for 'padrao_8h' and 'personalizada' (4 punches: Entrada 1, Saida 1, Entrada 2, Saida 2)
 */
export function isContinuousShift(
  user?: Partial<UserProfile> | null,
  contractSchedule?: string
): boolean {
  // If explicitly set to Standard (8h+) or Custom -> ALWAYS false (must show 4 punch columns: Entrada 1, Saída 1, Entrada 2, Saída 2)
  if (user?.workShiftType === 'padrao_8h' || user?.workShiftType === 'personalizada') {
    return false;
  }

  // If explicitly set to Continuous 6h -> true (shows 2 punch columns: Entrada, Saída)
  if (user?.workShiftType === 'continua_6h') {
    return true;
  }

  // Fallback for contract schedule:
  const sched = (contractSchedule || user?.contractSchedule || '').trim();
  if (sched) {
    // If it contains a lunch interval separator (/ or ;) or mentions almoço / intervalo -> 4 punch columns
    if (sched.includes('/') || sched.includes(';') || sched.toLowerCase().includes('alm') || sched.toLowerCase().includes('intervalo')) {
      return false;
    }
    const { shiftsCount, dailyHours } = calculateDailyHoursFromSchedule(sched);
    if (shiftsCount > 1 || dailyHours > 6) {
      return false;
    }
    // Single continuous shift with 1 entrance and 1 exit (e.g. 11:40 - 17:40)
    if (shiftsCount === 1) {
      return true;
    }
  }

  if (user?.contractDailyHours !== undefined && user.contractDailyHours > 6) {
    return false;
  }
  if (user?.contractDailyMinutes !== undefined && user.contractDailyMinutes > 360) {
    return false;
  }

  // Default: true (2 punches: Entrada e Saída) for standard single shifts in the school
  return true;
}

/**
 * Checks whether all contractual punch slots are completed for a day
 */
export function isDayShiftComplete(
  record?: Partial<PontoRecord> | null,
  isContinuous = true
): boolean {
  if (!record) return false;
  const e1 = (record.entry1 || '').trim();
  const s1 = (record.exit1 || '').trim();
  const e2 = (record.entry2 || '').trim();
  const s2 = (record.exit2 || '').trim();

  return isContinuous
    ? Boolean(e1 && (s2 || s1))
    : Boolean(e1 && s1 && e2 && s2);
}

export interface DayPontoStatusResult {
  statusKey: string;
  label: string;
  badgeBg: string;
  badgeText: string;
  isShiftComplete: boolean;
  hasPunches: boolean;
  isToday: boolean;
  isPast: boolean;
  tooltip?: string;
}

/**
 * Consolidates the daily occurrence status in the Espelho de Ponto:
 * 
 * 1. Regra de Jornada Em Andamento (Turnos Incompletos):
 *    Para colaboradores com contrato de 2 turnos (duas entradas e duas saídas),
 *    se o dia atual possui batida de entrada/saída do 1º turno, mas a entrada/saída do 2º turno
 *    ainda está em aberto (—), o status da ocorrência deve obrigatoriamente ser EM ANDAMENTO.
 * 
 * 2. Consolidação do Status Final:
 *    O status PRESENÇA NORMAL só deve ser concedido após o encerramento completo de todos os turnos
 *    previstos no contrato do dia (ou após o horário final da jornada com as devidas batidas registradas).
 */
export function getDayPontoStatus({
  record,
  defaultStatus = 'normal',
  isContinuous,
  dateStr,
  isWeekend = false,
  holidayName,
  referenceDateStr,
}: {
  record?: Partial<PontoRecord> | null;
  defaultStatus?: string;
  isContinuous: boolean;
  dateStr: string;
  isWeekend?: boolean;
  holidayName?: string;
  referenceDateStr?: string;
}): DayPontoStatusResult {
  const todayStr = referenceDateStr || toISODateString(new Date());
  const isToday = dateStr === todayStr;
  const isPast = dateStr < todayStr;
  const status = record?.status || defaultStatus;

  if (status === 'feriado') {
    return {
      statusKey: 'feriado',
      label: 'FERIADO PAGO',
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-800',
      isShiftComplete: true,
      hasPunches: false,
      isToday,
      isPast,
      tooltip: holidayName ? `Feriado: ${holidayName}` : 'Feriado Pago (Abonado)',
    };
  }

  if (status === 'recesso') {
    return {
      statusKey: 'recesso',
      label: 'RECESSO PAGO',
      badgeBg: 'bg-teal-100',
      badgeText: 'text-teal-800',
      isShiftComplete: true,
      hasPunches: false,
      isToday,
      isPast,
      tooltip: holidayName ? `Recesso: ${holidayName}` : 'Recesso Escolar Pago (Abonado)',
    };
  }

  if (status === 'falta_injustificada') {
    return {
      statusKey: 'falta_injustificada',
      label: 'FALTA (-1D)',
      badgeBg: 'bg-rose-100',
      badgeText: 'text-rose-800',
      isShiftComplete: false,
      hasPunches: false,
      isToday,
      isPast,
      tooltip: 'Falta Injustificada (Desconto integral de 1 Diária)',
    };
  }

  if (status === 'falta_justificada' || status === 'atestado') {
    return {
      statusKey: status,
      label: status === 'atestado' ? 'ATESTADO' : 'JUSTIFICADA',
      badgeBg: 'bg-indigo-100',
      badgeText: 'text-indigo-800',
      isShiftComplete: true,
      hasPunches: false,
      isToday,
      isPast,
      tooltip: status === 'atestado' ? 'Atestado Médico Abonado' : 'Falta Justificada Abonada',
    };
  }

  if (status === 'compensado') {
    return {
      statusKey: 'compensado',
      label: 'COMPENSADO',
      badgeBg: 'bg-purple-100',
      badgeText: 'text-purple-800',
      isShiftComplete: true,
      hasPunches: false,
      isToday,
      isPast,
      tooltip: 'Horas ou dia compensado em banco de horas',
    };
  }

  if (status === 'dispensado') {
    return {
      statusKey: 'dispensado',
      label: 'DISPENSADO',
      badgeBg: 'bg-blue-100',
      badgeText: 'text-blue-800',
      isShiftComplete: true,
      hasPunches: false,
      isToday,
      isPast,
      tooltip: 'Dispensado(a) pela coordenação',
    };
  }

  // Working day (status === 'normal')
  const e1 = (record?.entry1 || '').trim();
  const s1 = (record?.exit1 || '').trim();
  const e2 = (record?.entry2 || '').trim();
  const s2 = (record?.exit2 || '').trim();

  const hasPunches = Boolean(e1 || s1 || e2 || s2);
  const isShiftComplete = isContinuous
    ? Boolean(e1 && (s2 || s1))
    : Boolean(e1 && s1 && e2 && s2);

  if (!hasPunches) {
    if (isWeekend) {
      return {
        statusKey: 'weekend',
        label: '—',
        badgeBg: 'bg-slate-100',
        badgeText: 'text-slate-400',
        isShiftComplete: false,
        hasPunches: false,
        isToday,
        isPast,
      };
    }
    return {
      statusKey: 'a_realizar',
      label: 'A Realizar',
      badgeBg: 'bg-slate-100',
      badgeText: 'text-slate-500',
      isShiftComplete: false,
      hasPunches: false,
      isToday,
      isPast,
      tooltip: isToday ? 'Aguardando 1ª batida de entrada do dia' : (isPast ? 'Sem registros' : 'Previsto em calendário'),
    };
  }

  // Has punches registered
  if (isShiftComplete) {
    return {
      statusKey: 'presenca_normal',
      label: 'PRESENÇA NORMAL',
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-800',
      isShiftComplete: true,
      hasPunches: true,
      isToday,
      isPast,
      tooltip: isContinuous
        ? 'Jornada contínua concluída com sucesso (Entrada e Saída registradas)'
        : 'Todos os turnos contratuais concluídos com sucesso (1º e 2º turnos encerrados)',
    };
  }

  // Incomplete punches:
  if (isToday) {
    // Current day in progress:
    return {
      statusKey: 'em_andamento',
      label: 'EM ANDAMENTO',
      badgeBg: 'bg-amber-100',
      badgeText: 'text-amber-800',
      isShiftComplete: false,
      hasPunches: true,
      isToday: true,
      isPast: false,
      tooltip: !isContinuous
        ? (e1 && s1 && !e2
            ? '1º turno concluído, 2º turno ainda em aberto (Em Andamento)'
            : (e1 && s1 && e2 && !s2
                ? '2º turno em andamento (aguardando saída final)'
                : '1º turno em andamento (aguardando saída almoço)'))
        : 'Jornada contínua em andamento (aguardando saída final)',
    };
  }

  // Past day with incomplete punches:
  const isSecondTurnMissing = !isContinuous && e1 && s1 && (!e2 || !s2);
  return {
    statusKey: isSecondTurnMissing ? 'turno_incompleto' : 'pendente_saida',
    label: isSecondTurnMissing ? 'TURNO INCOMPLETO' : 'PENDENTE SAÍDA',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    isShiftComplete: false,
    hasPunches: true,
    isToday: false,
    isPast: true,
    tooltip: isSecondTurnMissing
      ? '1º turno foi registrado, mas o 2º turno ficou em aberto ou pendente'
      : 'Batida de saída pendente no encerramento da jornada',
  };
}

/**
 * Calculates total worked minutes for a single day record and identifies overtime/missing minutes
 */
export function calculateDayWorkedMinutes(
  record?: Partial<PontoRecord> | null,
  contractSchedule = '11:40 - 17:40',
  toleranceMinutes = 5,
  explicitDailyMinutes?: number
): {
  workedMinutes: number;
  overtimeMinutes: number;
  missingMinutes: number;
  effectiveSummary: string;
} {
  if (!record) {
    return { workedMinutes: 0, overtimeMinutes: 0, missingMinutes: 0, effectiveSummary: '' };
  }

  const recStatus = record.status || 'normal';

  if (
    recStatus === 'feriado' ||
    recStatus === 'recesso' ||
    recStatus === 'sabado' ||
    recStatus === 'domingo' ||
    recStatus === 'falta_justificada' ||
    recStatus === 'atestado' ||
    recStatus === 'compensado'
  ) {
    return { workedMinutes: 0, overtimeMinutes: 0, missingMinutes: 0, effectiveSummary: '' };
  }

  const { startMinutes: expStart, endMinutes: expEnd, dailyHours, dailyHoursFormatted, workedMinutes: parsedSchedMinutes } = parseContractSchedule(contractSchedule);
  const expectedDailyMinutes = (explicitDailyMinutes !== undefined && explicitDailyMinutes > 0)
    ? explicitDailyMinutes
    : (parsedSchedMinutes > 0 ? parsedSchedMinutes : Math.round(dailyHours * 60));

  if (recStatus === 'falta_injustificada') {
    return {
      workedMinutes: 0,
      overtimeMinutes: 0,
      missingMinutes: expectedDailyMinutes,
      effectiveSummary: 'Falta Injustificada',
    };
  }

  const e1 = parseTimeToMinutes(record.entry1);
  const s1 = parseTimeToMinutes(record.exit1);
  const e2 = parseTimeToMinutes(record.entry2);
  const s2 = parseTimeToMinutes(record.exit2);

  let period1 = 0;
  let period2 = 0;

  const continuous = isContinuousShift(null, contractSchedule);

  if (continuous) {
    // Case 1: Continuous / 2-Punch Shift (Direct Entrada 1 and Saída (exit2 or exit1), no second entrance e2)
    if (e1 !== null && (s2 !== null || s1 !== null) && e2 === null) {
      const punchOut = s2 !== null ? s2 : s1!;
      
      // Apply tolerance to entrance and exit against contractual schedule
      const startDiff = e1 - expStart;
      const effectiveStart = Math.abs(startDiff) <= toleranceMinutes ? expStart : e1;

      const endDiff = punchOut - expEnd;
      const effectiveEnd = Math.abs(endDiff) <= toleranceMinutes ? expEnd : punchOut;

      period1 = Math.max(0, effectiveEnd - effectiveStart);
    }
  } else {
    // Case 2: Split Shift with Lunch Interval (2 turns: 4 punches)
    const timeRegex = /\b([0-1]?[0-9]|2[0-3]):([0-5][0-9])\b/g;
    const matches = Array.from(contractSchedule.matchAll(timeRegex));
    let t1Start = expStart;
    let t1End = expStart + 240;
    let t2Start = expStart + 300;
    let t2End = expEnd;

    if (matches.length >= 4) {
      t1Start = (parseInt(matches[0][1], 10) * 60) + parseInt(matches[0][2], 10);
      t1End = (parseInt(matches[1][1], 10) * 60) + parseInt(matches[1][2], 10);
      t2Start = (parseInt(matches[2][1], 10) * 60) + parseInt(matches[2][2], 10);
      t2End = (parseInt(matches[3][1], 10) * 60) + parseInt(matches[3][2], 10);
    }

    if (e1 !== null && s1 !== null) {
      const startDiff1 = e1 - t1Start;
      const effE1 = Math.abs(startDiff1) <= toleranceMinutes ? t1Start : e1;
      const endDiff1 = s1 - t1End;
      const effS1 = Math.abs(endDiff1) <= toleranceMinutes ? t1End : s1;
      period1 = Math.max(0, effS1 - effE1);
    }

    if (e2 !== null && s2 !== null) {
      const startDiff2 = e2 - t2Start;
      const effE2 = Math.abs(startDiff2) <= toleranceMinutes ? t2Start : e2;
      const endDiff2 = s2 - t2End;
      const effS2 = Math.abs(endDiff2) <= toleranceMinutes ? t2End : s2;
      period2 = Math.max(0, effS2 - effE2);
    }

    // Direct continuous fallback if someone with split contract punched e1 and s2 directly
    if (period1 === 0 && period2 === 0 && e1 !== null && s2 !== null && s1 === null && e2 === null) {
      const startDiff = e1 - expStart;
      const effStart = Math.abs(startDiff) <= toleranceMinutes ? expStart : e1;
      const endDiff = s2 - expEnd;
      const effEnd = Math.abs(endDiff) <= toleranceMinutes ? expEnd : s2;
      period1 = Math.max(0, effEnd - effStart);
    }
  }

  let totalWorked = period1 + period2;
  if (totalWorked === 0) {
    return { workedMinutes: 0, overtimeMinutes: 0, missingMinutes: 0, effectiveSummary: '' };
  }

  // Tolerance check on total daily hours (e.g. within tolerance of expectedDailyMinutes)
  if (Math.abs(totalWorked - expectedDailyMinutes) <= toleranceMinutes) {
    totalWorked = expectedDailyMinutes;
  }

  const overtimeMinutes = totalWorked > expectedDailyMinutes ? totalWorked - expectedDailyMinutes : 0;
  const missingMinutes = totalWorked < expectedDailyMinutes ? expectedDailyMinutes - totalWorked : 0;

  return {
    workedMinutes: totalWorked,
    overtimeMinutes,
    missingMinutes,
    effectiveSummary: `${formatMinutesToHoursAndMinutes(totalWorked)} (${dailyHoursFormatted || formatMinutesToHoursAndMinutes(expectedDailyMinutes)} contratual)`,
  };
}

/**
 * Calculates worked hours for a single day record (Portuguese alias for calculateDayWorkedMinutes).
 */
export function calcularHorasDia(
  record?: Partial<PontoRecord> | null,
  contractSchedule = '11:40 - 17:40',
  toleranceMinutes = 5,
  explicitDailyMinutes?: number
) {
  return calculateDayWorkedMinutes(record, contractSchedule, toleranceMinutes, explicitDailyMinutes);
}

/**
 * Sequential and deterministic punch processing logic.
 *
 * Standard shift (4 punches):
 * 1. If ENTRADA 1 is empty -> records in entry1
 * 2. If ENTRADA 1 is filled & SAÍDA 1 is empty -> records in exit1 (Saída Almoço)
 * 3. If SAÍDA 1 is filled & ENTRADA 2 is empty -> records in entry2 (Retorno Almoço)
 * 4. If ENTRADA 2 is filled & SAÍDA 2 is empty -> records in exit2 (Saída Final)
 * 5. If all 4 are filled -> blocks overwrite and returns warning
 *
 * Continuous 6h shift (2 punches):
 * 1. 1st punch -> records in entry1
 * 2. 2nd punch -> records in exit2 (skipping intermediate lunch intervals)
 * 3. If both are filled -> blocks overwrite and returns warning
 */
export function processSequentialPunch({
  existingRecord,
  userId,
  userName,
  dateStr,
  monthKey,
  dayNumber,
  currentTime,
  isContinuousShift,
  contractSchedule = '11:40 - 17:40',
  toleranceMinutes = 5,
  updatedByName = 'Sistema',
}: {
  existingRecord?: PontoRecord | null;
  userId: string;
  userName: string;
  dateStr: string;
  monthKey: string;
  dayNumber: number;
  currentTime: string;
  isContinuousShift: boolean;
  contractSchedule?: string;
  toleranceMinutes?: number;
  updatedByName?: string;
}): {
  success: boolean;
  error?: string;
  slotName?: string;
  slotKey?: 'entry1' | 'exit1' | 'entry2' | 'exit2';
  updatedRecord?: PontoRecord;
  calculatedHours?: ReturnType<typeof calculateDayWorkedMinutes>;
} {
  const nowIso = new Date().toISOString();
  const { start, end } = parseContractSchedule(contractSchedule);
  const startTol = applyTolerance(currentTime, start, toleranceMinutes);
  const endTol = applyTolerance(currentTime, end, toleranceMinutes);

  let updatedRecord: PontoRecord;
  let slotName = '';
  let slotKey: 'entry1' | 'exit1' | 'entry2' | 'exit2';

  if (isContinuousShift) {
    // Continuous Shift: strictly 2 punches (Entrada and Saída)
    const e1 = (existingRecord?.entry1 || '').trim();
    const s_final = (existingRecord?.exit2 || existingRecord?.exit1 || '').trim();

    if (!e1) {
      // 1ª Batida do dia: ENTRADA
      slotKey = 'entry1';
      slotName = 'Entrada (Início da Jornada)';
      const effectivePunch = startTol.isWithinTolerance ? start : currentTime;
      updatedRecord = {
        id: existingRecord?.id || `${userId}_${dateStr}`,
        userId,
        userName,
        date: dateStr,
        monthKey,
        dayNumber,
        entry1: effectivePunch,
        exit1: '',
        entry2: '',
        exit2: '',
        status: existingRecord?.status || 'normal',
        createdAt: existingRecord?.createdAt || nowIso,
        updatedAt: nowIso,
        updatedBy: updatedByName,
      };
    } else if (!s_final) {
      // 2ª Batida do dia: SAÍDA (A Entrada já está preenchida, então obrigatoriamente grava em Saída)
      slotKey = 'exit2';
      slotName = 'Saída (Fim da Jornada)';
      const effectivePunch = endTol.isWithinTolerance ? end : currentTime;
      updatedRecord = {
        ...(existingRecord || {
          id: `${userId}_${dateStr}`,
          userId,
          userName,
          date: dateStr,
          monthKey,
          dayNumber,
          entry1: e1,
          createdAt: nowIso,
        }),
        entry1: e1,
        exit1: '',
        entry2: '',
        exit2: effectivePunch,
        status: 'normal',
        updatedAt: nowIso,
        updatedBy: updatedByName,
      };
    } else {
      // Ambas as batidas do dia já foram preenchidas
      const calc = calcularHorasDia(existingRecord, contractSchedule, toleranceMinutes);
      return {
        success: false,
        error: `Todas as batidas de hoje já foram registradas (Entrada: ${e1} • Saída: ${s_final} • Total: ${formatMinutesToHoursAndMinutes(calc.workedMinutes)}). Para editar horários, clique no botão de edição na tabela.`,
      };
    }
  } else {
    // Standard Shift (4 Batidas)
    const e1 = (existingRecord?.entry1 || '').trim();
    const s1 = (existingRecord?.exit1 || '').trim();
    const e2 = (existingRecord?.entry2 || '').trim();
    const s2 = (existingRecord?.exit2 || '').trim();

    if (!e1) {
      // 1. Se ENTRADA 1 estiver vazia -> Grave em ENTRADA 1
      slotKey = 'entry1';
      slotName = 'Entrada 1 (Início da Jornada)';
      const effectivePunch = startTol.isWithinTolerance ? start : currentTime;
      updatedRecord = {
        id: existingRecord?.id || `${userId}_${dateStr}`,
        userId,
        userName,
        date: dateStr,
        monthKey,
        dayNumber,
        entry1: effectivePunch,
        exit1: s1,
        entry2: e2,
        exit2: s2,
        status: existingRecord?.status || 'normal',
        createdAt: existingRecord?.createdAt || nowIso,
        updatedAt: nowIso,
        updatedBy: updatedByName,
      };
    } else if (!s1) {
      // 2. Se ENTRADA 1 estiver preenchida e SAÍDA 1 vazia -> Grave em SAÍDA 1 (Saída Almoço)
      slotKey = 'exit1';
      slotName = 'Saída 1 (Saída Almoço)';
      updatedRecord = {
        ...(existingRecord || {
          id: `${userId}_${dateStr}`,
          userId,
          userName,
          date: dateStr,
          monthKey,
          dayNumber,
          status: 'normal',
          createdAt: nowIso,
        }),
        entry1: e1,
        exit1: currentTime,
        entry2: e2,
        exit2: s2,
        status: 'normal',
        updatedAt: nowIso,
        updatedBy: updatedByName,
      };
    } else if (!e2) {
      // 3. Se SAÍDA 1 estiver preenchida e ENTRADA 2 vazia -> Grave em ENTRADA 2 (Retorno Almoço)
      slotKey = 'entry2';
      slotName = 'Entrada 2 (Retorno Almoço)';
      updatedRecord = {
        ...(existingRecord || {
          id: `${userId}_${dateStr}`,
          userId,
          userName,
          date: dateStr,
          monthKey,
          dayNumber,
          status: 'normal',
          createdAt: nowIso,
        }),
        entry1: e1,
        exit1: s1,
        entry2: currentTime,
        exit2: s2,
        status: 'normal',
        updatedAt: nowIso,
        updatedBy: updatedByName,
      };
    } else if (!s2) {
      // 4. Se ENTRADA 2 estiver preenchida e SAÍDA 2 vazia -> Grave em SAÍDA 2 (Saída Final)
      slotKey = 'exit2';
      slotName = 'Saída 2 (Saída Final)';
      const effectivePunch = endTol.isWithinTolerance ? end : currentTime;
      updatedRecord = {
        ...(existingRecord || {
          id: `${userId}_${dateStr}`,
          userId,
          userName,
          date: dateStr,
          monthKey,
          dayNumber,
          status: 'normal',
          createdAt: nowIso,
        }),
        entry1: e1,
        exit1: s1,
        entry2: e2,
        exit2: effectivePunch,
        status: 'normal',
        updatedAt: nowIso,
        updatedBy: updatedByName,
      };
    } else {
      // 5. Todas as 4 batidas já preenchidas
      return {
        success: false,
        error: `Todas as 4 batidas da jornada padrão de hoje já foram preenchidas (E1: ${e1} • S1: ${s1} • E2: ${e2} • S2: ${s2}). Para editar qualquer batida, utilize o botão de edição na tabela.`,
      };
    }
  }

  // Recalculate daily worked hours immediately
  const calculatedHours = calcularHorasDia(updatedRecord, contractSchedule, toleranceMinutes);

  return {
    success: true,
    slotName,
    slotKey,
    updatedRecord,
    calculatedHours,
  };
}

/**
 * Calculates complete financial breakdown for the monthly closing
 */
export function calculateMonthlyPontoFinancials({
  records,
  holidays,
  year,
  month,
  baseSalary = 1200,
  divisorDays = 30,
  contractDailyHours = 6,
  contractDailyMinutes,
  contractDailyHoursFormatted,
  contractSchedule = '11:40 - 17:40',
  manualAddition = 0,
  manualDiscount = 0,
}: {
  records: PontoRecord[];
  holidays: HolidayItem[];
  year: number;
  month: number; // 1-12
  baseSalary?: number;
  divisorDays?: number;
  contractDailyHours?: number;
  contractDailyMinutes?: number;
  contractDailyHoursFormatted?: string;
  contractSchedule?: string;
  manualAddition?: number;
  manualDiscount?: number;
}): {
  baseSalary: number;
  divisorDays: number;
  contractDailyHours: number;
  contractDailyMinutes: number;
  contractDailyHoursFormatted: string;
  diariaRate: number;
  hourlyRate: number;
  minuteRate: number;
  unjustifiedAbsencesCount: number;
  unjustifiedAbsencesDiscount: number;
  totalWorkedMinutes: number;
  totalWorkedFormatted: string;
  totalExtraMinutes: number;
  extraHoursDecimal: number;
  extraHoursFormatted: string;
  extraHoursAmount: number;
  totalMissingMinutes: number;
  missingHoursFormatted: string;
  missingHoursDiscount: number;
  paidHolidaysCount: number;
  paidRecessDaysCount: number;
  workedDaysCount: number;
  manualAddition: number;
  manualDiscount: number;
  netTotal: number;
} {
  const safeBase = (baseSalary !== undefined && baseSalary !== null && !isNaN(Number(baseSalary)))
    ? Math.max(0, Number(baseSalary))
    : 1200;
  const safeDivisor = Number(divisorDays) > 0 ? Number(divisorDays) : 30;

  const safeMinutes = (contractDailyMinutes !== undefined && Number(contractDailyMinutes) > 0)
    ? Number(contractDailyMinutes)
    : (Number(contractDailyHours) > 0 ? Math.round(Number(contractDailyHours) * 60) : 360);

  const safeHours = safeMinutes / 60;
  const formattedContractHours = contractDailyHoursFormatted || formatMinutesToHoursAndMinutes(safeMinutes);

  const diariaRate = safeBase / safeDivisor; // e.g. 1200 / 30 = 40.00
  const minuteRate = diariaRate / safeMinutes; // Exact minute rate without decimal hour approximations
  const hourlyRate = minuteRate * 60;

  let unjustifiedAbsencesCount = 0;
  let totalWorkedMinutes = 0;
  let totalExtraMinutes = 0;
  let totalMissingMinutes = 0;
  let paidHolidaysCount = 0;
  let paidRecessDaysCount = 0;
  let workedDaysCount = 0;

  const monthStr = String(month).padStart(2, '0');
  const monthKey = `${year}-${monthStr}`;

  (records || []).forEach((rec) => {
    if (!rec || !rec.date || !rec.date.startsWith(monthKey)) return;

    const recStatus = rec.status || 'normal';
    if (recStatus === 'falta_injustificada') {
      unjustifiedAbsencesCount++;
    } else if (recStatus === 'feriado') {
      paidHolidaysCount++;
    } else if (recStatus === 'recesso') {
      paidRecessDaysCount++;
    } else if (recStatus === 'normal') {
      if (rec.entry1 || rec.entry2) {
        workedDaysCount++;
      }
      const { workedMinutes, overtimeMinutes, missingMinutes } = calculateDayWorkedMinutes(rec, contractSchedule, 5, safeMinutes);
      totalWorkedMinutes += workedMinutes;
      totalExtraMinutes += overtimeMinutes;
      // Only deduct missing minutes on days where the employee worked partially or has unpunched hours
      // (Full day unjustified absences are already counted in unjustifiedAbsencesCount)
      const isShiftCompleted = isContinuousShift(null, contractSchedule)
        ? Boolean(rec.entry1 && (rec.exit2 || rec.exit1))
        : Boolean(rec.entry1 && rec.exit1 && rec.entry2 && rec.exit2);
      const isTodayRec = toISODateString(new Date()) === rec.date;

      if (missingMinutes > 0 && (rec.entry1 || rec.entry2 || rec.exit1 || rec.exit2)) {
        if (!(isTodayRec && !isShiftCompleted)) {
          totalMissingMinutes += missingMinutes;
        }
      }
    }
  });

  const unjustifiedAbsencesDiscount = unjustifiedAbsencesCount * diariaRate;
  const totalWorkedFormatted = formatMinutesToHoursAndMinutes(totalWorkedMinutes);
  const extraHoursDecimal = totalExtraMinutes / 60;
  const extraHoursFormatted = formatMinutesToHoursAndMinutes(totalExtraMinutes);
  const extraHoursAmount = totalExtraMinutes * minuteRate;
  const missingHoursFormatted = formatMinutesToHoursAndMinutes(totalMissingMinutes);
  const missingHoursDiscount = totalMissingMinutes * minuteRate;

  const netTotal = Math.max(
    0,
    safeBase -
      unjustifiedAbsencesDiscount -
      missingHoursDiscount +
      extraHoursAmount +
      (Number(manualAddition) || 0) -
      (Number(manualDiscount) || 0)
  );

  return {
    baseSalary: safeBase,
    divisorDays: safeDivisor,
    contractDailyHours: Number(safeHours.toFixed(2)),
    contractDailyMinutes: safeMinutes,
    contractDailyHoursFormatted: formattedContractHours,
    diariaRate,
    hourlyRate,
    minuteRate,
    unjustifiedAbsencesCount,
    unjustifiedAbsencesDiscount,
    totalWorkedMinutes,
    totalWorkedFormatted,
    totalExtraMinutes,
    extraHoursDecimal,
    extraHoursFormatted,
    extraHoursAmount,
    totalMissingMinutes,
    missingHoursFormatted,
    missingHoursDiscount,
    paidHolidaysCount,
    paidRecessDaysCount,
    workedDaysCount,
    manualAddition: Number(manualAddition) || 0,
    manualDiscount: Number(manualDiscount) || 0,
    netTotal: Math.round(netTotal * 100) / 100,
  };
}

/**
 * Currency formatter for Brazilian Real (BRL)
 */
export function formatCurrencyBR(amount = 0): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(isNaN(amount) ? 0 : amount);
}

/**
 * Generates an immutable digital hash for signed receipts
 */
export function generateDigitalSignatureHash(
  userId: string,
  userName: string,
  monthKey: string,
  timestampStr: string
): string {
  const raw = `${userId}-${userName}-${monthKey}-${timestampStr}-CRESCER-GADAL`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  const monthClean = monthKey.replace('-', '');
  return `RECIBO-${monthClean}-${hex.substring(0, 4)}-${hex.substring(4, 8)}`;
}

/**
 * Returns month name in Portuguese
 */
export function getMonthNameBR(monthNumber: number): string {
  const months = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  return months[monthNumber - 1] || '';
}

/**
 * Converts a currency value into written Portuguese text (Valor por Extenso)
 */
export function numberToWordsBRL(value: number): string {
  if (isNaN(value) || value <= 0) return 'zero reais';

  const unidades = [
    '',
    'um',
    'dois',
    'três',
    'quatro',
    'cinco',
    'seis',
    'sete',
    'oito',
    'nove',
    'dez',
    'onze',
    'doze',
    'treze',
    'quatorze',
    'quinze',
    'dezesseis',
    'dezessete',
    'dezoito',
    'dezenove',
  ];
  const dezenas = [
    '',
    '',
    'vinte',
    'trinta',
    'quarenta',
    'cinquenta',
    'sessenta',
    'setenta',
    'oitenta',
    'noventa',
  ];
  const centenas = [
    '',
    'cento',
    'duzentos',
    'trezentos',
    'quatrocentos',
    'quinhentos',
    'seiscentos',
    'setecentos',
    'oitocentos',
    'novecentos',
  ];

  function convertGroup(n: number): string {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;
    const parts: string[] = [];

    if (c > 0) parts.push(centenas[c]);

    const du = n % 100;
    if (du < 20 && du > 0) {
      parts.push(unidades[du]);
    } else {
      if (d > 0) parts.push(dezenas[d]);
      if (u > 0) parts.push(unidades[u]);
    }
    return parts.join(' e ');
  }

  const inteiro = Math.floor(value);
  const centavos = Math.round((value - inteiro) * 100);

  const milhares = Math.floor(inteiro / 1000);
  const resto = inteiro % 1000;

  const partsReais: string[] = [];
  if (milhares > 0) {
    if (milhares === 1) {
      partsReais.push('mil');
    } else {
      partsReais.push(`${convertGroup(milhares)} mil`);
    }
  }

  if (resto > 0) {
    partsReais.push(convertGroup(resto));
  }

  let textReais = partsReais.join(' e ');
  if (inteiro === 1) {
    textReais += ' real';
  } else if (inteiro > 1) {
    textReais += ' reais';
  }

  let textCentavos = '';
  if (centavos > 0) {
    const centText = convertGroup(centavos);
    textCentavos = `${centText} ${centavos === 1 ? 'centavo' : 'centavos'}`;
  }

  if (textReais && textCentavos) {
    return `${textReais} e ${textCentavos}`;
  }
  return textReais || textCentavos || 'zero reais';
}

/**
 * Checks whether a PontoRecord has an overlapped / corrupted punch state:
 * - Afternoon / exit punch sitting in entry1 with exit empty
 * - Inverted punches (entry1 >= exit2)
 * - Identical duplicate punches
 */
export function isOverlappedPontoRecord(
  record?: PontoRecord | null,
  contractSchedule = '11:40 - 17:40'
): boolean {
  if (!record || !record.entry1) return false;
  const e1 = record.entry1.trim();
  const s1 = (record.exit1 || '').trim();
  const e2 = (record.entry2 || '').trim();
  const s2 = (record.exit2 || '').trim();

  const todayStr = toISODateString(new Date());
  // If record is for today, having only entry1 is completely normal (employee is currently working in their first shift)
  if (record.date === todayStr && !s1 && !e2 && !s2) {
    return false;
  }

  const { start, end, startMinutes: expStartMin, endMinutes: expEndMin } = parseContractSchedule(contractSchedule);
  const e1Min = parseTimeToMinutes(e1);
  if (e1Min === null) return false;

  // Case 1: Past day where only entry1 is filled, but its time is near or after contractual exit
  // (e.g. e1 was stamped at 17:40 when contractual exit is 17:40, indicating exit punch overwrote entry)
  if (!s1 && !e2 && !s2 && record.date < todayStr) {
    if (expEndMin > expStartMin + 180 && e1Min >= expEndMin - 30) {
      return true;
    }
  }

  // Case 2: Inverted punches (entry1 is later than exit2 or exit1)
  const s2Min = parseTimeToMinutes(s2 || s1);
  if (s2Min !== null && e1Min > s2Min) {
    return true;
  }

  // Case 3: Identical punches in entry1 and exit2 (e.g. both '17:40')
  if (s2 && e1 === s2 && expEndMin > expStartMin + 180 && e1Min >= expEndMin - 30) {
    return true;
  }

  return false;
}

/**
 * Restores a single corrupted/overlapped PontoRecord:
 * - Restores contractual standard entry time (e.g. '11:40') in entry1
 * - Places the recorded exit time in exit2
 */
export function repairSinglePontoRecord(
  record: PontoRecord,
  user?: Partial<UserProfile> | null,
  contractSchedule = '11:40 - 17:40'
): PontoRecord {
  const sched = (user?.contractSchedule || contractSchedule || '11:40 - 17:40').trim();
  const { start: expStart, end: expEnd } = parseContractSchedule(sched);

  const e1 = (record.entry1 || '').trim();
  const s1 = (record.exit1 || '').trim();
  const e2 = (record.entry2 || '').trim();
  const s2 = (record.exit2 || '').trim();

  const nowIso = new Date().toISOString();
  let resolvedEntry = expStart || '11:40';
  let resolvedExit = expEnd || '17:40';

  // If entry1 had the afternoon punch, that is the exit punch!
  if (e1 && (!s1 && !e2 && !s2)) {
    resolvedExit = e1;
    resolvedEntry = expStart || '11:40';
  } else if (e1 && s2) {
    const e1Min = parseTimeToMinutes(e1) || 0;
    const s2Min = parseTimeToMinutes(s2) || 0;
    if (e1Min > s2Min) {
      // Inverted: s2 was actually entrance, e1 was exit
      resolvedEntry = s2;
      resolvedExit = e1;
    } else if (e1 === s2) {
      resolvedEntry = expStart || '11:40';
      resolvedExit = s2;
    }
  }

  return {
    ...record,
    entry1: resolvedEntry,
    exit1: '',
    entry2: '',
    exit2: resolvedExit,
    status: record.status === 'falta_injustificada' ? 'normal' : (record.status || 'normal'),
    updatedAt: nowIso,
    updatedBy: 'Restauração Automática de Batida',
    note: record.note
      ? `${record.note} (Entrada restaurada: ${resolvedEntry} / Saída: ${resolvedExit})`
      : `Horário de entrada restaurado (${resolvedEntry}) e saída preservada (${resolvedExit})`,
  };
}

/**
 * Audits and repairs an array of PontoRecords, fixing all records where exit punches overwrote entrance punches.
 */
export function repairOverlappedPontoRecords(
  records: PontoRecord[],
  usersMap?: Map<string, UserProfile> | Record<string, UserProfile>,
  defaultSchedule = '11:40 - 17:40'
): {
  repairedRecords: PontoRecord[];
  repairedCount: number;
  repairedDetails: Array<{ id: string; userName: string; date: string; oldEntry: string; newEntry: string; newExit: string }>;
} {
  let repairedCount = 0;
  const repairedDetails: Array<{ id: string; userName: string; date: string; oldEntry: string; newEntry: string; newExit: string }> = [];

  const repairedRecords = (records || []).map((rec) => {
    let user: UserProfile | undefined;
    if (usersMap) {
      if (usersMap instanceof Map) {
        user = usersMap.get(rec.userId);
      } else {
        user = usersMap[rec.userId];
      }
    }
    const schedule = user?.contractSchedule || defaultSchedule || '11:40 - 17:40';

    if (isOverlappedPontoRecord(rec, schedule)) {
      const oldEntry = rec.entry1 || '';
      const fixed = repairSinglePontoRecord(rec, user, schedule);
      repairedCount++;
      repairedDetails.push({
        id: rec.id,
        userName: rec.userName || user?.name || rec.userId,
        date: rec.date,
        oldEntry,
        newEntry: fixed.entry1 || '',
        newExit: fixed.exit2 || '',
      });
      return fixed;
    }
    return rec;
  });

  return { repairedRecords, repairedCount, repairedDetails };
}
