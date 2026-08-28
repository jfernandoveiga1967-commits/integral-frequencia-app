import { WeekInfo, HolidayItem, DayOfWeek, Student } from '../types';

export const ALL_DAYS_OF_WEEK: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];

export function formatDiasFrequencia(dias?: DayOfWeek[]): string {
  if (!dias || dias.length === 0 || dias.length === 5) {
    return 'Integral Completo (Seg a Sex)';
  }
  const map: Record<DayOfWeek, string> = {
    segunda: 'Seg',
    terca: 'Ter',
    quarta: 'Qua',
    quinta: 'Qui',
    sexta: 'Sex',
  };
  return dias.map((d) => map[d] || d).join(', ');
}

/**
 * Checks whether a student is active on a given date.
 * - Active students return true.
 * - Inactive / Cancelled students return true for past dates BEFORE their inactivationDate,
 *   and false on or after their inactivationDate (or false if no inactivationDate is set).
 */
export function isStudentActiveOnDate(
  student: { status?: 'ativo' | 'inativo' | 'cancelado'; inactivationDate?: string } | null | undefined,
  date: Date | string
): boolean {
  if (!student) return false;
  const status = student.status || 'ativo';
  if (status === 'ativo') return true;

  if (status === 'inativo' || status === 'cancelado') {
    if (!student.inactivationDate) {
      return false;
    }
    const dateStr = typeof date === 'string' ? date : toISODateString(date);
    // If the check date is strictly before the inactivation date, student was still active!
    return dateStr < student.inactivationDate;
  }

  return true;
}

export function isStudentScheduledForDay(student: { diasFrequencia?: DayOfWeek[] } | null | undefined, dayOfWeek: DayOfWeek | null): boolean {
  if (!student) return false;
  if (!dayOfWeek) return false;
  if (!student.diasFrequencia || !Array.isArray(student.diasFrequencia) || student.diasFrequencia.length === 0) {
    return true; // Default: enrolled for all weekdays
  }
  return student.diasFrequencia.includes(dayOfWeek);
}

export function isStudentScheduledForDate(student: { diasFrequencia?: DayOfWeek[] } | null | undefined, date: Date | string): boolean {
  if (!student) return false;
  const dayOfWeek = getDayOfWeekFromDate(date);
  return isStudentScheduledForDay(student, dayOfWeek);
}

/**
 * Format a time string like "18:00" into "18h00" (or keeps clean string)
 */
export function formatHorarioSaida(timeStr?: string): string {
  if (!timeStr) return '';
  const trimmed = timeStr.trim();
  if (!trimmed) return '';
  if (trimmed.includes(':')) {
    const [h, m] = trimmed.split(':');
    return `${h}h${m.padStart(2, '0')}`;
  }
  return trimmed;
}

/**
 * Gets student departure time configured for a specific day of the week
 */
export function getStudentDepartureTimeForDay(
  student: Student | { horariosSaida?: Partial<Record<DayOfWeek, string>> } | null | undefined,
  dayOfWeek: DayOfWeek | null | undefined
): string | undefined {
  if (!student || !dayOfWeek) return undefined;
  if (!student.horariosSaida) return undefined;
  return student.horariosSaida[dayOfWeek];
}

/**
 * Gets student departure time configured for a specific date (YYYY-MM-DD or Date object)
 */
export function getStudentDepartureTimeForDate(
  student: Student | { horariosSaida?: Partial<Record<DayOfWeek, string>> } | null | undefined,
  date: Date | string
): string | undefined {
  if (!student) return undefined;
  const dayOfWeek = getDayOfWeekFromDate(date);
  return getStudentDepartureTimeForDay(student, dayOfWeek);
}

export function getISOWeekNumber(date: Date): { year: number; weekNumber: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), weekNumber: weekNo };
}

export function getWeekDateRange(year: number, weekNumber: number): { startDate: Date; endDate: Date } {
  // Simple calculation for ISO week Monday
  const simple = new Date(year, 0, 1 + (weekNumber - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4) {
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    ISOweekStart.setDate(simple.getDate() + (8 - simple.getDay()));
  }
  
  const startDate = new Date(ISOweekStart);
  const endDate = new Date(ISOweekStart);
  endDate.setDate(startDate.getDate() + 4); // Monday to Friday

  return { startDate, endDate };
}

export function formatDateBR(dateString: string): string {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
}

export function formatDateShort(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

export function toISODateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getWeekInfo(year: number, weekNumber: number): WeekInfo {
  const { startDate, endDate } = getWeekDateRange(year, weekNumber);
  const startStr = toISODateString(startDate);
  const endStr = toISODateString(endDate);
  
  return {
    year,
    weekNumber,
    startDate: startStr,
    endDate: endStr,
    label: `Semana ${weekNumber} (${formatDateShort(startDate)} a ${formatDateShort(endDate)}/${year})`,
  };
}

export function getWeekDays(startDateStr: string): { dateStr: string; dayName: string; dayShort: string }[] {
  const [year, month, day] = startDateStr.split('-').map(Number);
  const startDate = new Date(year, month - 1, day);
  
  const dayNames = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];
  const dayShorts = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
  
  const days = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push({
      dateStr: toISODateString(d),
      dayName: dayNames[i],
      dayShort: `${dayShorts[i]} (${formatDateShort(d)})`,
    });
  }
  return days;
}

export function getDayOfWeekFromDate(date: Date | string): 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | null {
  let d: Date;
  if (typeof date === 'string') {
    const parts = date.split('-').map(Number);
    if (parts.length === 3) {
      d = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      d = new Date(date);
    }
  } else {
    d = date;
  }

  const day = d.getDay(); // 0: Dom, 1: Seg, 2: Ter, 3: Qua, 4: Qui, 5: Sex, 6: Sáb
  switch (day) {
    case 1:
      return 'segunda';
    case 2:
      return 'terca';
    case 3:
      return 'quarta';
    case 4:
      return 'quinta';
    case 5:
      return 'sexta';
    default:
      return null;
  }
}

export function getDayOfWeekLabel(day: 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | string): string {
  switch (day) {
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
    default:
      return day;
  }
}

/**
 * Checks if a date falls on a weekend (Saturday = 6, Sunday = 0)
 */
export function isWeekend(date: Date | string): boolean {
  let d: Date;
  if (typeof date === 'string') {
    const parts = date.split('-').map(Number);
    if (parts.length === 3) {
      d = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      d = new Date(date);
    }
  } else {
    d = date;
  }
  const day = d.getDay();
  return day === 0 || day === 6; // 0 = Domingo, 6 = Sábado
}

export function isSaturday(date: Date | string): boolean {
  let d: Date;
  if (typeof date === 'string') {
    const parts = date.split('-').map(Number);
    if (parts.length === 3) {
      d = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      d = new Date(date);
    }
  } else {
    d = date;
  }
  return d.getDay() === 6;
}

export function isSunday(date: Date | string): boolean {
  let d: Date;
  if (typeof date === 'string') {
    const parts = date.split('-').map(Number);
    if (parts.length === 3) {
      d = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      d = new Date(date);
    }
  } else {
    d = date;
  }
  return d.getDay() === 0;
}

export function getDayNameFull(date: Date | string): string {
  let d: Date;
  if (typeof date === 'string') {
    const parts = date.split('-').map(Number);
    if (parts.length === 3) {
      d = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      d = new Date(date);
    }
  } else {
    d = date;
  }
  const dayNames = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ];
  return dayNames[d.getDay()] || '';
}

/**
 * Checks if a specific date string (YYYY-MM-DD) falls within a registered holiday, recess, or vacation period
 */
export function isHolidayOrRecess(dateStr: string, holidays: HolidayItem[]): HolidayItem | undefined {
  if (!dateStr || !holidays || holidays.length === 0) return undefined;
  return holidays.find((h) => {
    if (!h || !h.date) return false;
    const start = h.date;
    const end = h.endDate && h.endDate >= h.date ? h.endDate : h.date;
    return dateStr >= start && dateStr <= end;
  });
}

/**
 * Calculates duration and school days breakdown for a holiday or recess interval
 * Accurately includes all calendar days (weekdays + weekends) in totalCalendarDays,
 * and tracks schoolDaysCount (Mon-Fri) and weekendDaysCount (Sat-Sun).
 */
export function calculateHolidayDuration(startDateStr: string, endDateStr?: string): {
  totalCalendarDays: number;
  schoolDaysCount: number;
  weekendDaysCount: number;
} {
  if (!startDateStr) {
    return { totalCalendarDays: 1, schoolDaysCount: 1, weekendDaysCount: 0 };
  }

  const endStr = endDateStr && endDateStr >= startDateStr ? endDateStr : startDateStr;
  const [sY, sM, sD] = startDateStr.split('-').map(Number);
  const [eY, eM, eD] = endStr.split('-').map(Number);

  // Set hours to 12:00:00 to avoid DST / timezone jump issues
  const start = new Date(sY, sM - 1, sD, 12, 0, 0);
  const end = new Date(eY, eM - 1, eD, 12, 0, 0);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    const isWk = isWeekend(startDateStr);
    return { totalCalendarDays: 1, schoolDaysCount: isWk ? 0 : 1, weekendDaysCount: isWk ? 1 : 0 };
  }

  let totalCalendarDays = 0;
  let schoolDaysCount = 0;
  let weekendDaysCount = 0;

  const cur = new Date(start);
  while (cur <= end) {
    totalCalendarDays++;
    const day = cur.getDay();
    if (day === 0 || day === 6) {
      weekendDaysCount++;
    } else {
      schoolDaysCount++;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return { totalCalendarDays, schoolDaysCount, weekendDaysCount };
}

/**
 * Formats a holiday item's date or interval for user-friendly display (e.g. "20/07/2026 a 30/07/2026" or "07/09/2026")
 */
export function formatHolidayRange(holiday: HolidayItem): string {
  if (!holiday || !holiday.date) return '';
  if (!holiday.endDate || holiday.endDate === holiday.date) {
    return formatDateBR(holiday.date);
  }
  return `${formatDateBR(holiday.date)} a ${formatDateBR(holiday.endDate)}`;
}

/**
 * Formats a holiday item's date or interval with short format (e.g. "20/07 a 30/07" or "07/09")
 */
export function formatHolidayRangeShort(holiday: HolidayItem): string {
  if (!holiday || !holiday.date) return '';
  const sParts = holiday.date.split('-');
  const startFormatted = sParts.length === 3 ? `${sParts[2]}/${sParts[1]}` : holiday.date;

  if (!holiday.endDate || holiday.endDate === holiday.date) {
    return startFormatted;
  }

  const eParts = holiday.endDate.split('-');
  const endFormatted = eParts.length === 3 ? `${eParts[2]}/${eParts[1]}` : holiday.endDate;

  return `${startFormatted} a ${endFormatted}`;
}

/**
 * Returns effective school days (Monday-Friday, excluding weekends and registered holidays/vacations)
 */
export function getEffectiveSchoolDays(
  startDateStr: string,
  endDateStr: string,
  holidays: HolidayItem[]
): {
  effectiveDays: { dateStr: string; dayName: string; dayShort: string }[];
  effectiveDaysCount: number;
  holidaysCount: number;
} {
  const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);

  const cur = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);

  const effectiveDays: { dateStr: string; dayName: string; dayShort: string }[] = [];
  let holidaysCount = 0;

  while (cur <= end) {
    const dateStr = toISODateString(cur);
    const dayOfWeek = cur.getDay();

    // Check if it's a weekday (1-5)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const holidayHit = isHolidayOrRecess(dateStr, holidays);
      if (holidayHit) {
        holidaysCount++;
      } else {
        effectiveDays.push({
          dateStr,
          dayName: getDayNameFull(cur),
          dayShort: `${formatDateShort(cur)}`,
        });
      }
    }

    cur.setDate(cur.getDate() + 1);
  }

  return {
    effectiveDays,
    effectiveDaysCount: effectiveDays.length,
    holidaysCount,
  };
}


