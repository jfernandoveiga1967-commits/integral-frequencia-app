import { PontoRecord, PontoMonthClosing, HolidayItem, UserProfile, PontoStatus } from '../types';
import { isWeekend, isSaturday, isSunday, isHolidayOrRecess, toISODateString } from './dateUtils';

/**
 * Converts "HH:MM" time string to minutes from 00:00 (e.g. "11:40" -> 700)
 */
export function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr || !timeStr.includes(':')) return null;
  const [h, m] = timeStr.trim().split(':').map(Number);
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
 * Parses contract schedule string like "11:40 - 17:40" or "11:40 às 17:40"
 */
export function parseContractSchedule(scheduleStr = '11:40 - 17:40'): {
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  dailyHours: number;
} {
  const clean = scheduleStr.replace(/às/gi, '-').replace(/\s+/g, ' ').trim();
  const parts = clean.split('-').map((s) => s.trim());
  const start = parts[0] || '11:40';
  const end = parts[1] || '17:40';

  const startMinutes = parseTimeToMinutes(start) ?? 700; // 11:40 = 700
  const endMinutes = parseTimeToMinutes(end) ?? 1060; // 17:40 = 1060
  const totalMinutes = Math.max(0, endMinutes - startMinutes);
  const dailyHours = totalMinutes / 60 || 6;

  return { start, end, startMinutes, endMinutes, dailyHours };
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
  toleranceMinutes = 5
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

  if (record.status === 'falta_injustificada') {
    const { dailyHours } = parseContractSchedule(contractSchedule);
    return {
      workedMinutes: 0,
      overtimeMinutes: 0,
      missingMinutes: Math.round(dailyHours * 60),
      effectiveSummary: 'Falta Injustificada',
    };
  }

  const e1 = parseTimeToMinutes(record.entry1);
  const s1 = parseTimeToMinutes(record.exit1);
  const e2 = parseTimeToMinutes(record.entry2);
  const s2 = parseTimeToMinutes(record.exit2);

  const { startMinutes: expStart, endMinutes: expEnd, dailyHours } = parseContractSchedule(contractSchedule);
  const expectedDailyMinutes = Math.round(dailyHours * 60);

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
    effectiveSummary: `${formatMinutesToTime(totalWorked)} (${dailyHours}h contratual)`,
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
  contractSchedule?: string;
  manualAddition?: number;
  manualDiscount?: number;
}): {
  baseSalary: number;
  divisorDays: number;
  contractDailyHours: number;
  diariaRate: number;
  hourlyRate: number;
  minuteRate: number;
  unjustifiedAbsencesCount: number;
  unjustifiedAbsencesDiscount: number;
  totalExtraMinutes: number;
  extraHoursDecimal: number;
  extraHoursAmount: number;
  paidHolidaysCount: number;
  paidRecessDaysCount: number;
  workedDaysCount: number;
  manualAddition: number;
  manualDiscount: number;
  netTotal: number;
} {
  const safeBase = Number(baseSalary) > 0 ? Number(baseSalary) : 1200;
  const safeDivisor = Number(divisorDays) > 0 ? Number(divisorDays) : 30;
  const safeHours = Number(contractDailyHours) > 0 ? Number(contractDailyHours) : 6;

  const diariaRate = safeBase / safeDivisor; // e.g. 1200 / 30 = 40.00
  const hourlyRate = diariaRate / safeHours; // e.g. 40 / 6 = 6.6667
  const minuteRate = hourlyRate / 60;

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
      const { overtimeMinutes } = calculateDayWorkedMinutes(rec, contractSchedule);
      totalExtraMinutes += overtimeMinutes;
    }
  });

  const unjustifiedAbsencesDiscount = unjustifiedAbsencesCount * diariaRate;
  const extraHoursDecimal = totalExtraMinutes / 60;
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
    contractDailyHours: safeHours,
    diariaRate,
    hourlyRate,
    minuteRate,
    unjustifiedAbsencesCount,
    unjustifiedAbsencesDiscount,
    totalExtraMinutes,
    extraHoursDecimal,
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
