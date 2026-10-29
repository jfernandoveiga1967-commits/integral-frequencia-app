/**
 * menuService.ts
 * Serviço centralizado do Cardápio Nutricional e Culinária do Colégio Crescer.
 */

import { MonthlyMenu, MenuItemDay } from '../types/cardapio';
import { loadMonthlyMenu, saveMonthlyMenu } from '../utils/cardapioStorage';
import { normalizeDateInput } from './frequencyService';

/**
 * Lança ou atualiza uma refeição (Almoço ou Lanche) no cardápio de uma data específica
 */
export async function cadastrarRefeicaoCardapio(
  dataStr: string,
  tipo: 'Almoço' | 'Lanche',
  descricao: string
): Promise<{ success: boolean; message: string; menu: MonthlyMenu; dayItem?: MenuItemDay }> {
  const targetDate = normalizeDateInput(dataStr);
  const [yearStr, monthStr, dayStr] = targetDate.split('-');

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const dayNumber = parseInt(dayStr, 10);

  if (isNaN(year) || isNaN(month) || isNaN(dayNumber)) {
    throw new Error(`Data inválida fornecida para o cardápio: "${dataStr}". Utilize o formato YYYY-MM-DD ou DD/MM/YYYY.`);
  }

  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const menu = loadMonthlyMenu(monthKey);

  // Garante que o dia exista na estrutura
  if (!menu.days[targetDate]) {
    const dayOfWeekIdx = new Date(year, month - 1, dayNumber).getDay();
    const dayNames: any = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    menu.days[targetDate] = {
      date: targetDate,
      dayNumber,
      month,
      year,
      dayOfWeek: dayNames[dayOfWeekIdx] || 'segunda',
      weekIndex: (Math.min(5, Math.ceil(dayNumber / 7)) as any) || 1,
      base: ['Arroz Branco', 'Feijão'],
      protein: '',
      garnish: '',
      salad: 'Salada do dia',
      dessert: 'Fruta',
    };
  }

  const dayItem = menu.days[targetDate];

  if (tipo === 'Almoço') {
    // Se a descrição for composta ou única, distribui com clareza
    dayItem.protein = descricao;
    if (!dayItem.base || dayItem.base.length === 0) {
      dayItem.base = ['Arroz Branco', 'Feijão'];
    }
  } else {
    // Lanche da Tarde / Manhã
    dayItem.specialNotes = `Lanche: ${descricao}`;
    dayItem.observations = dayItem.observations
      ? `${dayItem.observations} | Lanche: ${descricao}`
      : `Lanche: ${descricao}`;
  }

  menu.updatedAt = new Date().toISOString();
  await saveMonthlyMenu(menu);

  return {
    success: true,
    message: `Refeição (${tipo}) para ${targetDate} cadastrada com sucesso: "${descricao}".`,
    menu,
    dayItem,
  };
}
