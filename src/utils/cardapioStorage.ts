import { MonthlyMenu, CookingRecipe, MenuItemDay, DayOfWeekMenu } from '../types/cardapio';
import { HolidayItem } from '../types';
import {
  DEFAULT_SEPTEMBER_2026_MENU,
  DEFAULT_CULINARY_RECIPES_SEPTEMBER_2026,
} from '../data/defaultCardapioData';
import {
  saveMonthlyMenuToFirestore,
  getMonthlyMenuFromFirestore,
  saveCookingRecipesToFirestore,
  getCookingRecipesFromFirestore,
} from '../firebase';
import { loadHolidays } from './storageUtils';
import { isHolidayOrRecess } from './dateUtils';

const MENU_STORAGE_KEY_PREFIX = 'crescer_cardapio_monthly_';
const RECIPES_STORAGE_KEY_PREFIX = 'crescer_culinaria_recipes_';

const MONTH_NAMES_BR = [
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
];

/**
 * Gera a grade padrão de 5 semanas (Segunda a Sexta) para qualquer mês
 */
export function generateBlankMonthMenu(
  year: number,
  month: number,
  nutritionistName = 'Thaís Grisoni Baroni',
  crn = '84367',
  contactEmail = 'thaisgriisoni@gmail.com / acessonutri@hotmail.com'
): MonthlyMenu {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const days: Record<string, MenuItemDay> = {};

  // Descobre a primeira segunda-feira que engloba a 1ª semana do mês
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const dayOfWeekFirst = firstDayOfMonth.getDay(); // 0 = Domingo, 1 = Segunda...

  // Retrocede para a segunda-feira correspondente
  const startDate = new Date(firstDayOfMonth);
  if (dayOfWeekFirst === 0) {
    startDate.setDate(startDate.getDate() - 6);
  } else if (dayOfWeekFirst > 1) {
    startDate.setDate(startDate.getDate() - (dayOfWeekFirst - 1));
  }

  const currentDate = new Date(startDate);
  const dayNames: DayOfWeekMenu[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];

  const holidays = loadHolidays();

  for (let week = 1; week <= 5; week++) {
    for (let d = 0; d < 5; d++) {
      const curYear = currentDate.getFullYear();
      const curMonth = currentDate.getMonth() + 1;
      const curDay = currentDate.getDate();
      const dateStr = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(curDay).padStart(2, '0')}`;

      // Feriado ou Recesso Escolar cadastrado no calendário institucional
      const holidayHit = isHolidayOrRecess(dateStr, holidays);
      const isSept7 = curMonth === 9 && curDay === 7;
      const isHoliday = Boolean(holidayHit || isSept7);
      const holidayDescription = holidayHit
        ? (holidayHit.type === 'feriado' ? `FERIADO (${holidayHit.name})` : `RECESSO ESCOLAR (${holidayHit.name})`)
        : (isSept7 ? 'FERIADO (Independência do Brasil)' : undefined);

      days[dateStr] = {
        date: dateStr,
        dayNumber: curDay,
        month: curMonth,
        year: curYear,
        dayOfWeek: dayNames[d],
        weekIndex: week as 1 | 2 | 3 | 4 | 5,
        isHoliday,
        holidayDescription,
        base: isHoliday ? [] : ['Arroz Branco', 'Feijão'],
        protein: isHoliday ? (holidayDescription || 'FERIADO') : '',
        garnish: '',
        salad: isHoliday ? '' : 'Salada',
        dessert: isHoliday ? '' : 'Fruta',
      };

      currentDate.setDate(currentDate.getDate() + 1);
    }
    // Pula sábado e domingo (avança 2 dias)
    currentDate.setDate(currentDate.getDate() + 2);
  }

  return {
    id: monthKey,
    monthKey,
    year,
    month,
    monthName: MONTH_NAMES_BR[month - 1] || 'MÊS',
    nutritionistName,
    crn,
    contactEmail,
    institutionName: 'Instituto Educacional Crescer - Ensino Fundamental & Integral',
    days,
  };
}

/**
 * Carrega o cardápio mensal daquele mês (com fallback imediato para Setembro 2026 oficial)
 */
export function loadMonthlyMenu(monthKey: string): MonthlyMenu {
  try {
    const raw = localStorage.getItem(`${MENU_STORAGE_KEY_PREFIX}${monthKey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.days && Object.keys(parsed.days).length > 0) {
        // Sincroniza dias com os feriados/recessos institucionais do calendário oficial
        const holidays = loadHolidays();
        let changed = false;
        Object.entries(parsed.days as Record<string, MenuItemDay>).forEach(([dateStr, day]) => {
          const hol = isHolidayOrRecess(dateStr, holidays);
          if (hol && !day.isHoliday) {
            day.isHoliday = true;
            day.holidayDescription = hol.type === 'feriado'
              ? `FERIADO (${hol.name})`
              : `RECESSO ESCOLAR (${hol.name})`;
            day.protein = day.holidayDescription;
            day.base = [];
            day.garnish = '';
            day.salad = '';
            day.dessert = '';
            changed = true;
          }
        });
        if (changed) {
          saveMonthlyMenuLocally(parsed);
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar cardápio do localStorage:', err);
  }

  // Fallback para Setembro 2026
  if (monthKey === '2026-09') {
    saveMonthlyMenuLocally(DEFAULT_SEPTEMBER_2026_MENU);
    return DEFAULT_SEPTEMBER_2026_MENU;
  }

  // Se for outro mês, gera template inicial
  const [yearStr, monthStr] = monthKey.split('-');
  const y = Number(yearStr) || 2026;
  const m = Number(monthStr) || 9;
  const generated = generateBlankMonthMenu(y, m);
  saveMonthlyMenuLocally(generated);
  return generated;
}

/**
 * Salva localmente o cardápio mensal
 */
export function saveMonthlyMenuLocally(menu: MonthlyMenu): void {
  try {
    localStorage.setItem(`${MENU_STORAGE_KEY_PREFIX}${menu.monthKey}`, JSON.stringify(menu));
  } catch (err) {
    console.warn('Erro ao salvar cardápio no localStorage:', err);
  }
}

/**
 * Salva cardápio no LocalStorage e no Firestore
 */
export async function saveMonthlyMenu(menu: MonthlyMenu): Promise<void> {
  saveMonthlyMenuLocally(menu);
  try {
    await saveMonthlyMenuToFirestore(menu);
  } catch (err) {
    console.warn('Falha na gravação remota:', err);
  }
}

/**
 * Sincroniza do Firestore caso exista versão mais recente
 */
export async function syncMonthlyMenuFromFirestore(monthKey: string): Promise<MonthlyMenu | null> {
  try {
    const firestoreMenu = await getMonthlyMenuFromFirestore(monthKey);
    if (firestoreMenu && firestoreMenu.days && Object.keys(firestoreMenu.days).length > 0) {
      saveMonthlyMenuLocally(firestoreMenu);
      return firestoreMenu;
    }
  } catch (err) {
    console.warn('Erro ao sincronizar cardápio do Firestore:', err);
  }
  return null;
}

/**
 * Carrega as receitas de culinária do mês
 */
export function loadCookingRecipes(monthKey: string): CookingRecipe[] {
  try {
    const raw = localStorage.getItem(`${RECIPES_STORAGE_KEY_PREFIX}${monthKey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar receitas do localStorage:', err);
  }

  // Se for Setembro de 2026, usa as 4 receitas oficiais enviadas
  if (monthKey === '2026-09') {
    saveCookingRecipesLocally(monthKey, DEFAULT_CULINARY_RECIPES_SEPTEMBER_2026);
    return DEFAULT_CULINARY_RECIPES_SEPTEMBER_2026;
  }

  return [];
}

/**
 * Salva localmente as receitas
 */
export function saveCookingRecipesLocally(monthKey: string, recipes: CookingRecipe[]): void {
  try {
    localStorage.setItem(`${RECIPES_STORAGE_KEY_PREFIX}${monthKey}`, JSON.stringify(recipes));
  } catch (err) {
    console.warn('Erro ao salvar receitas no localStorage:', err);
  }
}

/**
 * Salva receitas no LocalStorage e no Firestore
 */
export async function saveCookingRecipes(monthKey: string, recipes: CookingRecipe[]): Promise<void> {
  saveCookingRecipesLocally(monthKey, recipes);
  try {
    await saveCookingRecipesToFirestore(monthKey, recipes);
  } catch (err) {
    console.warn('Falha na gravação remota:', err);
  }
}

/**
 * Sincroniza receitas do Firestore
 */
export async function syncCookingRecipesFromFirestore(monthKey: string): Promise<CookingRecipe[] | null> {
  try {
    const firestoreRecipes = await getCookingRecipesFromFirestore(monthKey);
    if (Array.isArray(firestoreRecipes) && firestoreRecipes.length > 0) {
      saveCookingRecipesLocally(monthKey, firestoreRecipes);
      return firestoreRecipes;
    }
  } catch (err) {
    console.warn('Erro ao sincronizar receitas do Firestore:', err);
  }
  return null;
}

export interface CookingWeekCalculation {
  weekNumber: 1 | 2 | 3 | 4 | 5;
  weekLabel: string;
  datesLabel: string;
  activeDates: string[];
  holidaysInWeek: { date: string; dayName: string; name: string; type: string }[];
  thursday: { date: string; dayNumber: number; isHoliday: boolean; holidayName?: string };
  friday: { date: string; dayNumber: number; isHoliday: boolean; holidayName?: string };
  hasHolidayInCookingDays: boolean;
  holidayWarning: string | null;
}

/**
 * Calcula automaticamente os dias letivos da Oficina de Culinária (Quintas e Sextas)
 * para uma dada semana e mês, cruzando com o calendário de feriados e recessos escolares.
 */
export function calculateCookingWorkshopDates(
  year: number,
  month: number,
  weekNumber: 1 | 2 | 3 | 4 | 5,
  holidaysList?: HolidayItem[]
): CookingWeekCalculation {
  const holidays = holidaysList && holidaysList.length > 0 ? holidaysList : loadHolidays();
  const weekLabels: Record<number, string> = {
    1: 'PRIMEIRA SEMANA',
    2: 'SEGUNDA SEMANA',
    3: 'TERCEIRA SEMANA',
    4: 'QUARTA SEMANA',
    5: 'QUINTA SEMANA',
  };

  const firstDayOfMonth = new Date(year, month - 1, 1);
  const dayOfWeekFirst = firstDayOfMonth.getDay(); // 0 = Domingo, 1 = Segunda...

  // Retrocede para a segunda-feira correspondente à semana 1
  const startDate = new Date(firstDayOfMonth);
  if (dayOfWeekFirst === 0) {
    startDate.setDate(startDate.getDate() - 6);
  } else if (dayOfWeekFirst > 1) {
    startDate.setDate(startDate.getDate() - (dayOfWeekFirst - 1));
  }

  // Segunda-feira da semana solicitada
  const mondayOfWeek = new Date(startDate);
  mondayOfWeek.setDate(mondayOfWeek.getDate() + (weekNumber - 1) * 7);

  const dayNames = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
  const weekDays = [0, 1, 2, 3, 4].map((offset) => {
    const d = new Date(mondayOfWeek);
    d.setDate(d.getDate() + offset);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const dayNum = d.getDate();
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const holidayHit = isHolidayOrRecess(dateStr, holidays);
    return {
      date: dateStr,
      dateObj: d,
      dayNumber: dayNum,
      month: m,
      year: y,
      dayName: dayNames[offset],
      isHoliday: Boolean(holidayHit),
      holidayItem: holidayHit,
    };
  });

  const thursday = {
    date: weekDays[3].date,
    dayNumber: weekDays[3].dayNumber,
    isHoliday: weekDays[3].isHoliday,
    holidayName: weekDays[3].holidayItem?.name,
  };

  const friday = {
    date: weekDays[4].date,
    dayNumber: weekDays[4].dayNumber,
    isHoliday: weekDays[4].isHoliday,
    holidayName: weekDays[4].holidayItem?.name,
  };

  const holidaysInWeek = weekDays
    .filter((d) => d.isHoliday)
    .map((d) => ({
      date: d.date,
      dayName: d.dayName,
      name: d.holidayItem?.name || 'Feriado/Recesso',
      type: d.holidayItem?.type === 'feriado' ? 'Feriado' : 'Recesso Escolar',
    }));

  const hasHolidayInCookingDays = thursday.isHoliday || friday.isHoliday;

  // Dias letivos ativos de culinária (normalmente Quinta e Sexta)
  const activeCookingDays = [weekDays[3], weekDays[4]].filter((d) => !d.isHoliday);

  const monthNameUpper = MONTH_NAMES_BR[month - 1] || 'MÊS';
  let datesLabel = '';

  const pad2 = (n: number) => String(n).padStart(2, '0');

  if (activeCookingDays.length === 2) {
    const d1 = activeCookingDays[0];
    const d2 = activeCookingDays[1];
    if (d1.month === d2.month) {
      const mName = MONTH_NAMES_BR[d1.month - 1] || monthNameUpper;
      datesLabel = `${pad2(d1.dayNumber)} E ${pad2(d2.dayNumber)} DE ${mName}`;
    } else {
      const mName1 = MONTH_NAMES_BR[d1.month - 1];
      const mName2 = MONTH_NAMES_BR[d2.month - 1];
      datesLabel = `${pad2(d1.dayNumber)} DE ${mName1} E ${pad2(d2.dayNumber)} DE ${mName2}`;
    }
  } else if (activeCookingDays.length === 1) {
    const dOnly = activeCookingDays[0];
    const mName = MONTH_NAMES_BR[dOnly.month - 1] || monthNameUpper;
    datesLabel = `${pad2(dOnly.dayNumber)} DE ${mName}`;
  } else {
    // Ambos são feriados
    datesLabel = `SEM AULAS (FERIADO/RECESSO)`;
  }

  let holidayWarning: string | null = null;
  if (thursday.isHoliday && friday.isHoliday) {
    holidayWarning = `Quinta (${pad2(thursday.dayNumber)}) e Sexta-feira (${pad2(friday.dayNumber)}) são feriados/recessos escolares. Não haverá oficina prática nesta semana.`;
  } else if (thursday.isHoliday) {
    holidayWarning = `Quinta-feira (${pad2(thursday.dayNumber)}/${pad2(month)}) é ${thursday.holidayName || 'Feriado/Recesso'}. Oficina realizada exclusivamente na Sexta-feira (${pad2(friday.dayNumber)}/${pad2(month)}).`;
  } else if (friday.isHoliday) {
    holidayWarning = `Sexta-feira (${pad2(friday.dayNumber)}/${pad2(month)}) é ${friday.holidayName || 'Feriado/Recesso'}. Oficina realizada exclusivamente na Quinta-feira (${pad2(thursday.dayNumber)}/${pad2(month)}).`;
  } else if (holidaysInWeek.length > 0) {
    const hDesc = holidaysInWeek.map((h) => `${h.dayName} (${h.name})`).join(', ');
    holidayWarning = `Atenção: A semana possui feriado/recesso letivo (${hDesc}), mas as aulas de culinária (Quinta e Sexta) ocorrem normalmente.`;
  }

  return {
    weekNumber,
    weekLabel: weekLabels[weekNumber] || `SEMANA ${weekNumber}`,
    datesLabel,
    activeDates: activeCookingDays.map((d) => d.date),
    holidaysInWeek,
    thursday,
    friday,
    hasHolidayInCookingDays,
    holidayWarning,
  };
}
