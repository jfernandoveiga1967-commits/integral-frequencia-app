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
 * Converts minutes to friendly hours and minutes format (e.g. 522 -> "8h 42min", 360 -> "6h 00min")
 */
export function formatMinutesToHoursAndMinutes(totalMinutes: number): string {
  if (isNaN(totalMinutes) || totalMinutes <= 0) return '0h 00min';
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  return `${h}h ${String(m).padStart(2, '0')}min`;
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
      dailyHoursFormatted: '6h 00min',
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
      dailyHoursFormatted: '6h 00min',
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
    dailyHoursFormatted: '6h 00min',
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
 * Calculates total worked minutes for a single day record and identifies overtime/missing minutes
 */
export function calculateDayWorkedMinutes(
  record: PontoRecord,
  contractSchedule = '11:40 - 17:40',
  toleranceMinutes = 5,
  explicitDailyMinutes?: number
): {
  workedMinutes: number;
  overtimeMinutes: number;
  missingMinutes: number;
  effectiveSummary: string;
} {
  if (
    record.status === 'feriado' ||
    record.status === 'recesso' ||
    record.status === 'sabado' ||
    record.status === 'domingo' ||
    record.status === 'falta_justificada' ||
    record.status === 'atestado'
  ) {
    return { workedMinutes: 0, overtimeMinutes: 0, missingMinutes: 0, effectiveSummary: '' };
  }

  const { startMinutes: expStart, endMinutes: expEnd, dailyHours, dailyHoursFormatted, workedMinutes: parsedSchedMinutes } = parseContractSchedule(contractSchedule);
  const expectedDailyMinutes = (explicitDailyMinutes !== undefined && explicitDailyMinutes > 0)
    ? explicitDailyMinutes
    : (parsedSchedMinutes > 0 ? parsedSchedMinutes : Math.round(dailyHours * 60));

  if (record.status === 'falta_injustificada') {
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

  // Single shift (e.g. Entrada 1 + Saída 2 or Entrada 1 + Saída 1)
  if (e1 !== null && s2 !== null && s1 === null && e2 === null) {
    // Tolerances on start and end
    const startDiff = e1 - expStart;
    const effectiveStart = Math.abs(startDiff) <= toleranceMinutes ? expStart : e1;

    const endDiff = s2 - expEnd;
    const effectiveEnd = Math.abs(endDiff) <= toleranceMinutes ? expEnd : s2;

    period1 = Math.max(0, effectiveEnd - effectiveStart);
  } else {
    if (e1 !== null && s1 !== null) {
      period1 = Math.max(0, s1 - e1);
    }
    if (e2 !== null && s2 !== null) {
      period2 = Math.max(0, s2 - e2);
    }
  }

  const totalWorked = period1 + period2;
  if (totalWorked === 0) {
    return { workedMinutes: 0, overtimeMinutes: 0, missingMinutes: 0, effectiveSummary: '' };
  }

  const overtimeMinutes = totalWorked > expectedDailyMinutes ? totalWorked - expectedDailyMinutes : 0;
  const missingMinutes = totalWorked < expectedDailyMinutes ? expectedDailyMinutes - totalWorked : 0;

  return {
    workedMinutes: totalWorked,
    overtimeMinutes,
    missingMinutes,
    effectiveSummary: `${formatMinutesToTime(totalWorked)} (${dailyHoursFormatted || formatMinutesToHoursAndMinutes(expectedDailyMinutes)} contratual)`,
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
  totalExtraMinutes: number;
  extraHoursDecimal: number;
  extraHoursFormatted: string;
  extraHoursAmount: number;
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
  let totalExtraMinutes = 0;
  let paidHolidaysCount = 0;
  let paidRecessDaysCount = 0;
  let workedDaysCount = 0;

  const monthStr = String(month).padStart(2, '0');
  const monthKey = `${year}-${monthStr}`;

  records.forEach((rec) => {
    if (!rec.date.startsWith(monthKey)) return;

    if (rec.status === 'falta_injustificada') {
      unjustifiedAbsencesCount++;
    } else if (rec.status === 'feriado') {
      paidHolidaysCount++;
    } else if (rec.status === 'recesso') {
      paidRecessDaysCount++;
    } else if (rec.status === 'normal') {
      if (rec.entry1 || rec.entry2) {
        workedDaysCount++;
      }
      const { overtimeMinutes } = calculateDayWorkedMinutes(rec, contractSchedule, 5, safeMinutes);
      totalExtraMinutes += overtimeMinutes;
    }
  });

  const unjustifiedAbsencesDiscount = unjustifiedAbsencesCount * diariaRate;
  const extraHoursDecimal = totalExtraMinutes / 60;
  const extraHoursFormatted = formatMinutesToHoursAndMinutes(totalExtraMinutes);
  const extraHoursAmount = totalExtraMinutes * minuteRate;

  const netTotal = Math.max(
    0,
    safeBase -
      unjustifiedAbsencesDiscount +
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
    totalExtraMinutes,
    extraHoursDecimal,
    extraHoursFormatted,
    extraHoursAmount,
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
