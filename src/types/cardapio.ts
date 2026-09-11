export type DayOfWeekMenu = 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta';

export interface MenuItemDay {
  date: string; // ISO format "YYYY-MM-DD"
  dayNumber: number; // e.g. 1..31
  month: number; // 1..12
  year: number;
  dayOfWeek: DayOfWeekMenu;
  weekIndex: 1 | 2 | 3 | 4 | 5; // 1ª à 5ª semana
  isHoliday?: boolean;
  holidayDescription?: string; // e.g. "FERIADO"

  // Refeição completa do almoço
  base: string[]; // e.g. ["Arroz Branco", "Feijão"]
  protein: string; // e.g. "Frango em tiras", "Iscas de pernil", "Ovo mexido"
  garnish: string; // e.g. "Creme de milho", "Farofa caseira", "Purê de batata"
  salad: string; // e.g. "Salada", "Vinagrete", "Brócolis no vapor"
  dessert: string; // e.g. "Fruta"
  specialNotes?: string; // e.g. Dica ou aviso nutricional
}

export interface MonthlyMenu {
  id: string; // e.g. "2026-09"
  monthKey: string; // "YYYY-MM"
  year: number;
  month: number; // 1-12
  monthName: string; // "SETEMBRO"
  nutritionistName: string; // "Thaís Grisoni Baroni"
  crn: string; // "CRN: 84367"
  contactEmail: string; // "thaisgriisoni@gmail.com / acessonutri@hotmail.com"
  institutionName?: string; // "Instituto Educacional Crescer"
  days: Record<string, MenuItemDay>; // Keyed by date "YYYY-MM-DD"
  generalNotes?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface CookingRecipe {
  id: string; // unique ID
  monthKey: string; // "2026-09"
  weekNumber: 1 | 2 | 3 | 4 | 5; // 1ª à 5ª semana
  weekLabel: string; // "PRIMEIRA SEMANA", "SEGUNDA SEMANA", etc.
  datesLabel: string; // "03 E 04 DE SETEMBRO"
  title: string; // "Bolo de Abobrinha", "Vitamina da Imunidade"
  category: 'doce' | 'salgado' | 'bebida' | 'lanche';
  prepTime?: string; // e.g. "30-40 minutos"
  servings?: string; // e.g. "25 a 30 porções"
  difficulty?: 'fácil' | 'médio';
  
  ingredients: string[]; // Lista de ingredientes com quantidades
  instructions: string[]; // Passo a passo do modo de preparo
  nutritionalNotes?: string; // e.g. "*RICO EM VITAMINAS A e C"
  allergens?: string[]; // e.g. ["Glúten", "Ovos", "Lactose"]
  pedagogicalSkills?: string; // e.g. "Coordenação motora fina, medidas e pesos, hábitos saudáveis"
  
  authorName?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}
