import { MonthlyMenu, CookingRecipe, MenuItemDay, DayOfWeekMenu } from '../types/cardapio';
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

  for (let week = 1; week <= 5; week++) {
    for (let d = 0; d < 5; d++) {
      const curYear = currentDate.getFullYear();
      const curMonth = currentDate.getMonth() + 1;
      const curDay = currentDate.getDate();
      const dateStr = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(curDay).padStart(2, '0')}`;

      // Feriado de 07 de Setembro padrão caso seja Setembro
      const isSept7 = curMonth === 9 && curDay === 7;

      days[dateStr] = {
        date: dateStr,
        dayNumber: curDay,
        month: curMonth,
        year: curYear,
        dayOfWeek: dayNames[d],
        weekIndex: week as 1 | 2 | 3 | 4 | 5,
        isHoliday: isSept7,
        holidayDescription: isSept7 ? 'FERIADO' : undefined,
        base: isSept7 ? [] : ['Arroz Branco', 'Feijão'],
        protein: isSept7 ? 'FERIADO' : '',
        garnish: '',
        salad: isSept7 ? '' : 'Salada',
        dessert: isSept7 ? '' : 'Fruta',
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
  await saveMonthlyMenuToFirestore(menu);
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
  await saveCookingRecipesToFirestore(monthKey, recipes);
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
