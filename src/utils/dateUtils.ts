import { WeekInfo, HolidayItem } from '../types';

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
 * Checks if a specific date string (YYYY-MM-DD) is a registered holiday or recess
 */
export function isHolidayOrRecess(dateStr: string, holidays: HolidayItem[]): HolidayItem | undefined {
  if (!dateStr || !holidays || holidays.length === 0) return undefined;
  return holidays.find((h) => h.date === dateStr);
}

/**
 * Returns effective school days (Monday-Friday, excluding weekends and registered holidays)
 */
export function getEffectiveSchoolDays(
  startDateStr: string,
  endDateStr: string,
  holidays: HolidayItem[]
): { dateStr: string; dayName: string; dayShort: string }[] {
  const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);

  const cur = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);

  const holidayDateSet = new Set(holidays.map((h) => h.date));
  const effectiveDays: { dateStr: string; dayName: string; dayShort: string }[] = [];

  while (cur <= end) {
    const dateStr = toISODateString(cur);
    const dayOfWeek = cur.getDay();

    // Check if it's a weekday (1-5) and not a holiday
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && !holidayDateSet.has(dateStr)) {
      effectiveDays.push({
        dateStr,
        dayName: getDayNameFull(cur),
        dayShort: `${formatDateShort(cur)}`,
      });
    }

    cur.setDate(cur.getDate() + 1);
  }

  return effectiveDays;
}

