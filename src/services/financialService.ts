import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import {
  db,
  saveCustomExpenseCategoriesToFirestore,
} from '../firebase';
import {
  Student,
  UserProfile,
  StudentFinancialProfile,
  FinancialMetricSummary,
  FinancialPlanHour,
  FinancialExpense,
  ExpenseCategory,
  ExpenseStatus,
  CustomExpenseCategory,
  CustomCategoryColor,
  PontoRecord,
  PontoMonthClosing,
  HolidayItem,
  AttendanceRecord,
  ScheduleBlock,
  SemanarioPlan,
  MealReportConfig,
  MealReportGlobalSettings,
  getTabelaPlanosPorAno,
} from '../types';
import { CookingRecipe } from '../types/cardapio';
import {
  loadStudents,
  saveStudents,
  loadPontoClosings,
  loadPontoRecords,
  loadHolidays,
  loadSchedules,
  loadAttendanceRecords,
} from '../utils/storageUtils';
import { loadMealConfig, buildMonthMealEntries, calculateMealTotals, getRollCallPresencesForDate } from '../utils/mealFinanceUtils';
import {
  calculateApuracaoAulasEfetivasPrestador,
} from '../utils/frequenciaUtils';
import {
  calculateMonthlyPontoFinancials,
  formatCurrencyBR,
  DIVISOR_MENSAL_PADRAO,
  DURACAO_AULA_PADRAO_MINUTOS,
} from '../utils/pontoUtils';
import { isUserInactiveOrDismissed, detectCargoCategory } from '../utils/authUtils';
import {
  calculateFolhaProfessorHorista,
} from './FolhaService';
import { broadcastSyncEvent } from './syncService';

const FINANCIAL_COLLECTION = 'studentFinancialProfiles';
const EXPENSES_COLLECTION = 'financialExpenses';
const LOCAL_STORAGE_KEY = 'colegio_crescer_financial_profiles_v1';
const LOCAL_EXPENSES_STORAGE_KEY = 'colegio_crescer_financial_expenses_v1';
export const LOCAL_CUSTOM_CATEGORIES_KEY = 'colegio_crescer_custom_expense_categories_v1';

// Tabela Padrão de Preços das Modalidades Extracurriculares
export const MODALITY_PRICE_TABLE: Record<string, number> = {
  'Natação': 190,
  'Natacao': 190,
  'Balé': 130,
  'Bale': 130,
  'Judô': 130,
  'Judo': 130,
  'Futebol': 120,
  'Ginástica': 120,
  'Ginastica': 120,
  'Dança': 120,
  'Danca': 120,
  'Flauta': 110,
  'Música': 110,
  'Musica': 110,
  'Reforço': 150,
  'Reforco': 150,
  'Rotina': 0,
};

// Mensalidade Base por Plano Contratual
export const BASE_PLAN_PRICES: Record<FinancialPlanHour, number> = {
  PARCIAL_4H: 1150,
  INTEGRAL_8H: 1850,
  EXTENDIDO_12H: 2450,
  CUSTOMIZADO: 1500,
};

export interface CategoryDisplayStyle {
  id: string;
  label: string;
  shortLabel: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  isSyncedSystem?: boolean;
  origemAbaLabel?: string;
}

const COLOR_THEME_MAP: Record<
  CustomCategoryColor,
  { bgClass: string; textClass: string; borderClass: string }
> = {
  indigo: { bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-200' },
  emerald: { bgClass: 'bg-emerald-50', textClass: 'text-emerald-700', borderClass: 'border-emerald-200' },
  amber: { bgClass: 'bg-amber-50', textClass: 'text-amber-700', borderClass: 'border-amber-200' },
  rose: { bgClass: 'bg-rose-50', textClass: 'text-rose-700', borderClass: 'border-rose-200' },
  sky: { bgClass: 'bg-sky-50', textClass: 'text-sky-700', borderClass: 'border-sky-200' },
  purple: { bgClass: 'bg-purple-50', textClass: 'text-purple-700', borderClass: 'border-purple-200' },
  orange: { bgClass: 'bg-orange-50', textClass: 'text-orange-700', borderClass: 'border-orange-200' },
  teal: { bgClass: 'bg-teal-50', textClass: 'text-teal-700', borderClass: 'border-teal-200' },
  slate: { bgClass: 'bg-slate-100', textClass: 'text-slate-700', borderClass: 'border-slate-200' },
};

export const AVAILABLE_CUSTOM_CATEGORY_COLORS: Array<{
  id: CustomCategoryColor;
  label: string;
  dotClass: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}> = [
  { id: 'sky', label: 'Azul Celeste', dotClass: 'bg-sky-500', ...COLOR_THEME_MAP.sky },
  { id: 'rose', label: 'Rosa / Coral', dotClass: 'bg-rose-500', ...COLOR_THEME_MAP.rose },
  { id: 'purple', label: 'Roxo', dotClass: 'bg-purple-500', ...COLOR_THEME_MAP.purple },
  { id: 'amber', label: 'Âmbar', dotClass: 'bg-amber-500', ...COLOR_THEME_MAP.amber },
  { id: 'teal', label: 'Turquesa', dotClass: 'bg-teal-500', ...COLOR_THEME_MAP.teal },
  { id: 'orange', label: 'Laranja', dotClass: 'bg-orange-500', ...COLOR_THEME_MAP.orange },
  { id: 'indigo', label: 'Índigo', dotClass: 'bg-indigo-500', ...COLOR_THEME_MAP.indigo },
  { id: 'emerald', label: 'Esmeralda', dotClass: 'bg-emerald-500', ...COLOR_THEME_MAP.emerald },
  { id: 'slate', label: 'Grafite', dotClass: 'bg-slate-500', ...COLOR_THEME_MAP.slate },
];

// Categorias padronizadas pré-fixadas no formulário "Lançar Nova Despesa"
export const STANDARD_MANUAL_EXPENSE_CATEGORIES: Array<{ id: ExpenseCategory; label: string }> = [
  { id: 'FOLHA_COORDENACAO', label: 'Folha: Coordenação' },
  { id: 'FOLHA_AUXILIAR_ADI', label: 'Folha: Auxiliar (ADI)' },
  { id: 'FOLHA_MONITOR', label: 'Folha: Monitor' },
  { id: 'FOLHA_PROFESSOR_HORISTA', label: 'Folha: Professor Horista' },
  { id: 'FOLHA_PROFESSOR_PRESTADOR', label: 'Folha: Professor Prestador' },
  { id: 'FOLHA_NUTRICIONISTA', label: 'Folha: Nutricionista' },
  { id: 'ALIMENTACAO_REFEICOES', label: 'Refeições (Almoço)' },
];

// Categorias sincronizadas automaticamente das abas internas (Livro Ponto, Relatório de Refeições)
export const SYNCED_SYSTEM_CATEGORIES: Record<string, CategoryDisplayStyle> = {
  FOLHA_COORDENACAO: {
    id: 'FOLHA_COORDENACAO',
    label: 'Folha: Coordenação',
    shortLabel: 'Folha: Coordenação',
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-800',
    borderClass: 'border-amber-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Livro Ponto',
  },
  FOLHA_AUXILIAR_ADI: {
    id: 'FOLHA_AUXILIAR_ADI',
    label: 'Folha: Auxiliar (ADI)',
    shortLabel: 'Folha: Auxiliar (ADI)',
    bgClass: 'bg-indigo-50',
    textClass: 'text-indigo-700',
    borderClass: 'border-indigo-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Livro Ponto',
  },
  FOLHA_MONITOR: {
    id: 'FOLHA_MONITOR',
    label: 'Folha: Monitor',
    shortLabel: 'Folha: Monitor',
    bgClass: 'bg-sky-50',
    textClass: 'text-sky-700',
    borderClass: 'border-sky-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Livro Ponto',
  },
  FOLHA_PROFESSOR_HORISTA: {
    id: 'FOLHA_PROFESSOR_HORISTA',
    label: 'Folha: Professor Horista',
    shortLabel: 'Folha: Professor Horista',
    bgClass: 'bg-purple-50',
    textClass: 'text-purple-700',
    borderClass: 'border-purple-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Livro Ponto',
  },
  FOLHA_PROFESSOR_PRESTADOR: {
    id: 'FOLHA_PROFESSOR_PRESTADOR',
    label: 'Folha: Professor Prestador',
    shortLabel: 'Folha: Professor Prestador',
    bgClass: 'bg-fuchsia-50',
    textClass: 'text-fuchsia-700',
    borderClass: 'border-fuchsia-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Livro Ponto',
  },
  FOLHA_NUTRICIONISTA: {
    id: 'FOLHA_NUTRICIONISTA',
    label: 'Folha: Nutricionista',
    shortLabel: 'Folha: Nutricionista',
    bgClass: 'bg-teal-50',
    textClass: 'text-teal-700',
    borderClass: 'border-teal-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Livro Ponto',
  },
  FOLHA_MONITORIA: {
    id: 'FOLHA_MONITORIA',
    label: 'Folha: Monitoria / ADIs',
    shortLabel: 'Folha: Monitoria',
    bgClass: 'bg-indigo-50',
    textClass: 'text-indigo-700',
    borderClass: 'border-indigo-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Livro Ponto',
  },
  FOLHA_PROFESSORES_OFICINAS: {
    id: 'FOLHA_PROFESSORES_OFICINAS',
    label: 'Folha: Professores de Oficinas',
    shortLabel: 'Folha: Prof. Oficinas',
    bgClass: 'bg-purple-50',
    textClass: 'text-purple-700',
    borderClass: 'border-purple-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Livro Ponto',
  },
  FOLHA_NUTRICAO: {
    id: 'FOLHA_NUTRICAO',
    label: 'Folha: Nutricionista',
    shortLabel: 'Folha: Nutricionista',
    bgClass: 'bg-teal-50',
    textClass: 'text-teal-700',
    borderClass: 'border-teal-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Livro Ponto',
  },
  FOLHA_APOIO_LIMPEZA: {
    id: 'FOLHA_APOIO_LIMPEZA',
    label: 'Folha: Apoio / Limpeza',
    shortLabel: 'Folha: Apoio / Limpeza',
    bgClass: 'bg-sky-50',
    textClass: 'text-sky-700',
    borderClass: 'border-sky-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Livro Ponto',
  },
  FOLHA_SECRETARIA_ADMIN: {
    id: 'FOLHA_SECRETARIA_ADMIN',
    label: 'Folha: Secretaria / Administrativo',
    shortLabel: 'Folha: Secretaria / Admin',
    bgClass: 'bg-slate-100',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-300',
    isSyncedSystem: true,
    origemAbaLabel: 'Livro Ponto',
  },
  FOLHA_OUTROS: {
    id: 'FOLHA_OUTROS',
    label: 'Folha: Outros Cargos',
    shortLabel: 'Folha: Outros',
    bgClass: 'bg-indigo-50',
    textClass: 'text-indigo-700',
    borderClass: 'border-indigo-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Livro Ponto',
  },
  FOLHA_PAGAMENTO: {
    id: 'FOLHA_PAGAMENTO',
    label: 'Folha de Pagamento & Equipe (Livro Ponto)',
    shortLabel: 'Folha / Ponto',
    bgClass: 'bg-indigo-50',
    textClass: 'text-indigo-700',
    borderClass: 'border-indigo-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Livro Ponto',
  },
  ALIMENTACAO_REFEICOES: {
    id: 'ALIMENTACAO_REFEICOES',
    label: 'Refeições (Almoço)',
    shortLabel: 'Refeições (Almoço)',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Relatório de Refeições (Almoço)',
  },
  ALIMENTACAO_HORTIFRUTI: {
    id: 'ALIMENTACAO_HORTIFRUTI',
    label: 'Refeições (Almoço)',
    shortLabel: 'Refeições (Almoço)',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Relatório de Refeições (Almoço)',
  },
  CULINARIA_OFICINAS: {
    id: 'CULINARIA_OFICINAS',
    label: 'Culinária (Oficinas)',
    shortLabel: 'Culinária (Oficinas)',
    bgClass: 'bg-orange-50',
    textClass: 'text-orange-700',
    borderClass: 'border-orange-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Culinária / Oficinas',
  },
  OFICINAS_CULINARIA: {
    id: 'OFICINAS_CULINARIA',
    label: 'Culinária (Oficinas & Insumos)',
    shortLabel: 'Culinária (Oficinas)',
    bgClass: 'bg-orange-50',
    textClass: 'text-orange-700',
    borderClass: 'border-orange-200',
    isSyncedSystem: true,
    origemAbaLabel: 'Culinária / Oficinas',
  },
};

// Mantido para compatibilidade retroativa com relatórios PDF ou referências legadas
export const EXPENSE_CATEGORIES_INFO: Record<
  ExpenseCategory,
  { label: string; shortLabel: string; bgClass: string; textClass: string; borderClass: string }
> = {
  ...SYNCED_SYSTEM_CATEGORIES,
  OFICINAS_TERCEIRIZADAS: {
    label: 'Oficinas Especialistas',
    shortLabel: 'Oficinas Extras',
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-700',
    borderClass: 'border-amber-200',
  },
  MATERIAIS_DIDATICOS: {
    label: 'Materiais Pedagógicos',
    shortLabel: 'Materiais Pedagógicos',
    bgClass: 'bg-sky-50',
    textClass: 'text-sky-700',
    borderClass: 'border-sky-200',
  },
  MANUTENCAO_INFRA: {
    label: 'Manutenção & Infraestrutura',
    shortLabel: 'Manutenção',
    bgClass: 'bg-rose-50',
    textClass: 'text-rose-700',
    borderClass: 'border-rose-200',
  },
  OUTROS: {
    label: 'Sem Categoria / Outros',
    shortLabel: 'Outros',
    bgClass: 'bg-slate-100',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-200',
  },
};

export function getCategoryColors(colorTheme?: CustomCategoryColor) {
  return COLOR_THEME_MAP[colorTheme || 'sky'] || COLOR_THEME_MAP.sky;
}

/**
 * Resolve informações de exibição (rótulo e cores) para qualquer categoria:
 * sincronizada de aba interna, personalizada criada pelo gestor ou legada.
 */
export function getCategoryDisplayInfo(
  categoriaId: string,
  customCategories: CustomExpenseCategory[] = [],
  fallbackLabel?: string
): CategoryDisplayStyle {
  if (!categoriaId) {
    return {
      id: 'SEM_CATEGORIA',
      label: fallbackLabel || 'Sem Categoria',
      shortLabel: fallbackLabel || 'Sem Categoria',
      ...COLOR_THEME_MAP.slate,
    };
  }

  // 1. Verificar categorias personalizadas criadas pelo gestor
  const customMatch = (customCategories || []).find(
    (c) => c.id === categoriaId || c.label.toLowerCase() === categoriaId.toLowerCase()
  );
  if (customMatch) {
    const colors = getCategoryColors(customMatch.colorTheme);
    return {
      id: customMatch.id,
      label: customMatch.label,
      shortLabel: customMatch.shortLabel || customMatch.label,
      ...colors,
      isSyncedSystem: false,
    };
  }

  // 2. Verificar categorias automáticas sincronizadas das abas
  if (SYNCED_SYSTEM_CATEGORIES[categoriaId]) {
    return SYNCED_SYSTEM_CATEGORIES[categoriaId];
  }

  // 3. Fallback legado (caso exista registro histórico)
  if (EXPENSE_CATEGORIES_INFO[categoriaId]) {
    return {
      id: categoriaId,
      ...EXPENSE_CATEGORIES_INFO[categoriaId],
    };
  }

  // 4. Fallback humanizado usando categoriaLabel salvo no documento ou slug limpo
  const cleanLabel =
    fallbackLabel ||
    categoriaId
      .replace(/^custom_/i, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());

  return {
    id: categoriaId,
    label: cleanLabel,
    shortLabel: cleanLabel,
    ...COLOR_THEME_MAP.slate,
  };
}

// ---------------------------------------------------------------------------
// CRUD DE CATEGORIAS PERSONALIZADAS (LOCALSTORAGE + FIRESTORE)
// ---------------------------------------------------------------------------

export function slugifyCategoryId(label: string): string {
  const normalized = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `custom_${normalized || Date.now()}`;
}

export function loadLocalCustomCategories(): CustomExpenseCategory[] {
  try {
    const raw = localStorage.getItem(LOCAL_CUSTOM_CATEGORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => c && c.id && c.label) : [];
  } catch (e) {
    console.warn('Erro ao carregar categorias personalizadas do localStorage:', e);
    return [];
  }
}

export function saveLocalCustomCategories(categories: CustomExpenseCategory[]): void {
  try {
    localStorage.setItem(LOCAL_CUSTOM_CATEGORIES_KEY, JSON.stringify(categories || []));
  } catch (e) {
    console.warn('Erro ao salvar categorias personalizadas no localStorage:', e);
  }
}

export async function createCustomExpenseCategory(
  label: string,
  colorTheme: CustomCategoryColor = 'sky',
  currentList?: CustomExpenseCategory[],
  createdBy?: string
): Promise<{ categories: CustomExpenseCategory[]; created: CustomExpenseCategory }> {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error('Informe um nome válido para a categoria.');
  }

  const baseList = currentList ? [...currentList] : loadLocalCustomCategories();
  const duplicate = baseList.find((c) => c.label.trim().toLowerCase() === trimmed.toLowerCase());
  if (duplicate) {
    return { categories: baseList, created: duplicate };
  }

  let newId = slugifyCategoryId(trimmed);
  if (baseList.some((c) => c.id === newId) || SYNCED_SYSTEM_CATEGORIES[newId]) {
    newId = `${newId}_${Date.now().toString(36).slice(-4)}`;
  }

  const nowIso = new Date().toISOString();
  const created: CustomExpenseCategory = {
    id: newId,
    label: trimmed,
    shortLabel: trimmed,
    colorTheme,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: createdBy || 'Gestão',
  };

  const nextList = [...baseList, created];
  saveLocalCustomCategories(nextList);
  broadcastSyncEvent('SYNC_FINANCIAL_CATEGORIES', { categories: nextList });

  try {
    await saveCustomExpenseCategoriesToFirestore(nextList, createdBy);
  } catch (err) {
    console.warn('Aviso ao persistir nova categoria no Firestore:', err);
  }

  return { categories: nextList, created };
}

export async function renameCustomExpenseCategory(
  categoryId: string,
  newLabel: string,
  currentList?: CustomExpenseCategory[],
  updatedBy?: string
): Promise<CustomExpenseCategory[]> {
  const trimmed = newLabel.trim();
  if (!trimmed) {
    throw new Error('O nome da categoria não pode ficar vazio.');
  }

  const baseList = currentList ? [...currentList] : loadLocalCustomCategories();
  const nowIso = new Date().toISOString();
  const nextList = baseList.map((cat) =>
    cat.id === categoryId
      ? {
          ...cat,
          label: trimmed,
          shortLabel: trimmed,
          updatedAt: nowIso,
        }
      : cat
  );

  saveLocalCustomCategories(nextList);
  broadcastSyncEvent('SYNC_FINANCIAL_CATEGORIES', { categories: nextList });

  try {
    await saveCustomExpenseCategoriesToFirestore(nextList, updatedBy);

    // Atualiza o categoriaLabel nas despesas locais e remotas que referenciam essa categoria
    const localExpenses = loadLocalFinancialExpenses();
    const affected = localExpenses.filter((e) => e.categoria === categoryId);
    if (affected.length > 0) {
      const updatedExpenses = localExpenses.map((e) =>
        e.categoria === categoryId ? { ...e, categoriaLabel: trimmed, updatedAt: nowIso } : e
      );
      saveLocalFinancialExpenses(updatedExpenses);
      for (const exp of affected) {
        await setDoc(
          doc(db, EXPENSES_COLLECTION, exp.id),
          { categoriaLabel: trimmed, updatedAt: nowIso },
          { merge: true }
        ).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Aviso ao renomear categoria no Firestore:', err);
  }

  return nextList;
}

export async function deleteCustomExpenseCategory(
  categoryId: string,
  allExpenses: FinancialExpense[],
  currentList?: CustomExpenseCategory[],
  updatedBy?: string
): Promise<{ categories: CustomExpenseCategory[]; deleted: boolean; reason?: string }> {
  const isUsed = (allExpenses || []).some((e) => e.categoria === categoryId);
  if (isUsed) {
    return {
      categories: currentList || loadLocalCustomCategories(),
      deleted: false,
      reason: 'Esta categoria possui despesas vinculadas. Remova ou altere as despesas antes de excluí-la.',
    };
  }

  const baseList = currentList ? [...currentList] : loadLocalCustomCategories();
  const nextList = baseList.filter((c) => c.id !== categoryId);

  saveLocalCustomCategories(nextList);
  broadcastSyncEvent('SYNC_FINANCIAL_CATEGORIES', { categories: nextList });

  try {
    await saveCustomExpenseCategoriesToFirestore(nextList, updatedBy);
  } catch (err) {
    console.warn('Aviso ao excluir categoria no Firestore:', err);
  }

  return { categories: nextList, deleted: true };
}

// ---------------------------------------------------------------------------
// HIGIENIZAÇÃO NÃO-DESTRUTIVA DE DESPESAS LEGADAS
// ---------------------------------------------------------------------------

// Conjunto estrito de IDs obsoletos de versões antigas que devem ser removidos
export const OBSOLETE_EXPENSE_IDS = new Set([
  'exp_2026_folha_monit',
  'exp_2027_folha_monit',
  'exp_2026_alimentacao_cantina',
  'exp_2027_alimentacao_cantina',
  'exp_2026_folha_livro_ponto', // Bloco único antigo substituído pelo fracionamento por cargo
  'exp_2027_folha_livro_ponto', // Bloco único antigo substituído pelo fracionamento por cargo
  'exp_2026_folha_cat_monitoria', // Substituído pelos cargos específicos Auxiliar (ADI) e Monitor
  'exp_2027_folha_cat_monitoria',
  'exp_2026_folha_cat_professores_oficinas', // Substituído por Professor Horista e Professor Prestador
  'exp_2027_folha_cat_professores_oficinas',
  'exp_2026_folha_cat_nutricao', // Padronizado para exp_*_folha_cat_nutricionista
  'exp_2027_folha_cat_nutricao',
  'exp_2026_oficinas_natacao',
  'exp_2027_oficinas_natacao',
  'exp_2026_oficinas_artes',
  'exp_2027_oficinas_artes',
  'exp_2026_materiais_pedag',
  'exp_2027_materiais_pedag',
  'exp_2026_manutencao_higiene',
  'exp_2027_manutencao_higiene',
  'auto_expense_oficinas',
  'auto_expense_natacao',
  'exp_2026_auto_expense_oficinas',
  'exp_2027_auto_expense_oficinas',
  'exp_2026_auto_expense_natacao',
  'exp_2027_auto_expense_natacao',
  'exp_2026_culinaria_oficinas', // Despesa fictícia antiga erradicada
  'exp_2027_culinaria_oficinas', // Despesa fictícia antiga erradicada
  'sync_culinaria_oficinas_2026',
  'sync_culinaria_oficinas_2027',
]);

/**
 * Identifica registros obsoletos/fictícios/duplicados legados.
 * Nunca bloqueia despesas manuais ou categorias personalizadas criadas pelo gestor.
 */
export function isObsoleteOrDuplicateExpense(exp: Partial<FinancialExpense> | null | undefined): boolean {
  if (!exp) return true;
  const id = (exp.id || '').toLowerCase();
  if (OBSOLETE_EXPENSE_IDS.has(exp.id || '') || OBSOLETE_EXPENSE_IDS.has(id)) return true;

  const desc = (exp.descricao || '').toLowerCase();
  const cat = (exp.categoria || '').toLowerCase();
  const origem = (exp.origemModulo || '').toLowerCase();
  const syncKey = (exp.autoSyncKey || '').toLowerCase();

  // Nunca considerar despesas manuais ou categorias personalizadas como obsoletas
  if (origem === 'manual' || cat.startsWith('custom_')) {
    return false;
  }

  // Erradica definitivamente a despesa fictícia auto-gerada de Culinária (Oficinas)
  if (
    cat === 'culinaria_oficinas' ||
    cat === 'oficinas_culinaria' ||
    origem === 'culinaria_oficinas' ||
    origem === 'semanario_culinaria' ||
    id.includes('culinaria_oficinas') ||
    syncKey.includes('culinaria_oficinas')
  ) {
    return true;
  }

  // Bloqueia apenas repasses antigos de oficinas extras terceirizadas (natação, balé, judô) e mocks antigos
  if (
    cat === 'oficinas_terceirizadas' ||
    origem === 'oficinas_extras' ||
    id.includes('auto_expense_oficinas') ||
    id.includes('auto_expense_natacao') ||
    syncKey.includes('auto_expense_oficina') ||
    syncKey.includes('auto_expense_natacao')
  ) {
    return true;
  }

  if (
    desc.includes('repasse de oficinas') ||
    desc.includes('repasse de judô') ||
    desc.includes('repasse de natação') ||
    desc.includes('repasse de balé') ||
    desc.includes('repasse de futebol') ||
    desc.includes('repasse de flauta')
  ) {
    return true;
  }

  if (id.includes('folha_monit') || id.includes('alimentacao_cantina')) {
    return true;
  }

  if (
    id.includes('mock') ||
    desc.includes('mock') ||
    id.includes('materiais_pedag') ||
    id.includes('manutencao_higiene')
  ) {
    return true;
  }

  return false;
}

/**
 * Calcula a soma das modalidades extras do aluno
 */
export function calculateModalidadesExtrasTotal(activities: string[] = []): number {
  return activities.reduce((acc, act) => {
    const cleanName = act.trim();
    if (cleanName.toLowerCase() === 'rotina') return acc;
    const price = MODALITY_PRICE_TABLE[cleanName] ?? 120;
    return acc + price;
  }, 0);
}

/**
 * Calcula o valor líquido total da mensalidade
 */
export function calculateValorTotalMensal(
  base: number,
  extras: number,
  descontoPercentual: number
): number {
  const subtotal = Math.max(0, base + extras);
  const discountFactor = Math.max(0, Math.min(100, descontoPercentual || 0)) / 100;
  const total = subtotal * (1 - discountFactor);
  return Math.round(total * 100) / 100;
}

/**
 * Gera um perfil financeiro padrão para um estudante caso ainda não possua registro no Firestore.
 */
export function buildDefaultFinancialProfile(
  student: Student,
  anoLetivo: number = student.anoLetivo || 2026
): StudentFinancialProfile {
  const isAvulso = student.tipoContrato === 'avulso';
  const plano: FinancialPlanHour = isAvulso ? 'PARCIAL_4H' : 'INTEGRAL_8H';
  const tabela = getTabelaPlanosPorAno(anoLetivo);
  const planoContratual =
    student.planoContratual || (isAvulso ? 'Diária Integral' : 'Integral Semana (18:30h)');
  const planoInfo = tabela[planoContratual as keyof typeof tabela];
  const fallbackBase = anoLetivo === 2027 ? 1250 : 1120;

  const base =
    student.valorPlanoBase !== undefined && student.valorPlanoBase > 0
      ? student.valorPlanoBase
      : planoInfo?.valorBase ?? fallbackBase;

  const extras =
    student.valorModalidadesExtras !== undefined
      ? student.valorModalidadesExtras
      : student.valorOficinas !== undefined
      ? student.valorOficinas
      : student.oficinasExtras !== undefined
      ? student.oficinasExtras
      : student.valorExtras !== undefined
      ? student.valorExtras
      : calculateModalidadesExtrasTotal(student.activities || []);

  const descontoBolsa = Number(student.descontoBolsa) || 0;
  const total =
    student.valorMensalidadeFinal !== undefined && student.valorMensalidadeFinal > 0
      ? student.valorMensalidadeFinal
      : Math.max(0, base + extras - descontoBolsa);

  const descontoPercentual = base > 0 ? Math.round((descontoBolsa / base) * 100) : 0;
  const isIsento = descontoBolsa >= base + extras && base + extras > 0;

  return {
    id: `${anoLetivo}_${student.id}`,
    studentId: student.id,
    studentName: student.name,
    turma: student.turma,
    anoLetivo,
    planoHora: plano,
    valorMensalidadeBase: base,
    valorModalidadesExtras: extras,
    oficinasExtras: extras,
    valorOficinas: extras,
    valorExtras: extras,
    descontoPercentual,
    valorTotalMensal: total,
    diaVencimento: 10,
    statusPagamento: isIsento ? 'ISENTO' : 'EM_DIA',
    mesReferencia: `${anoLetivo}-08`,
    formaPagamentoPadrao: 'Boleto',
    observacoes: `Plano Contratual: ${planoContratual}`,
    studentStatus: student.status || 'ativo',
    planoContratual,
    descontoBolsa,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Sincronização Contratual Dinâmica',
  };
}

// ---------------------------------------------------------------------------
// GESTÃO DE CONTRATOS (STORAGE & FIRESTORE)
// ---------------------------------------------------------------------------

export function loadLocalFinancialProfiles(): StudentFinancialProfile[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Erro ao ler perfis financeiros locais:', e);
    return [];
  }
}

export function saveLocalFinancialProfiles(profiles: StudentFinancialProfile[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profiles));
  } catch (e) {
    console.warn('Erro ao salvar perfis financeiros locais:', e);
  }
}

export async function loadFinancialProfilesFromFirestore(
  anoLetivo?: number
): Promise<StudentFinancialProfile[]> {
  try {
    const colRef = collection(db, FINANCIAL_COLLECTION);
    const q = anoLetivo ? query(colRef, where('anoLetivo', '==', anoLetivo)) : colRef;
    const snap = await getDocs(q);

    const remoteList: StudentFinancialProfile[] = [];
    snap.forEach((d) => {
      remoteList.push({ id: d.id, ...d.data() } as StudentFinancialProfile);
    });

    if (remoteList.length > 0) {
      saveLocalFinancialProfiles(remoteList);
    }
    return remoteList;
  } catch (err) {
    console.warn('Falha ao carregar perfis financeiros do Firestore. Usando cache local:', err);
    const local = loadLocalFinancialProfiles();
    return anoLetivo ? local.filter((p) => p.anoLetivo === anoLetivo) : local;
  }
}

export async function saveFinancialProfileToFirestore(
  profile: StudentFinancialProfile
): Promise<void> {
  const docId = profile.id || `${profile.anoLetivo}_${profile.studentId}`;
  const cleanProfile: StudentFinancialProfile = {
    ...profile,
    id: docId,
    updatedAt: new Date().toISOString(),
  };

  try {
    const docRef = doc(db, FINANCIAL_COLLECTION, docId);
    await setDoc(docRef, cleanProfile, { merge: true });
  } catch (err) {
    console.warn('Falha na gravação remota do perfil financeiro:', err);
  }

  const current = loadLocalFinancialProfiles();
  const index = current.findIndex(
    (p) => p.id === docId || (p.studentId === profile.studentId && p.anoLetivo === profile.anoLetivo)
  );
  if (index >= 0) {
    current[index] = cleanProfile;
  } else {
    current.push(cleanProfile);
  }
  saveLocalFinancialProfiles(current);
}

export function subscribeFinancialProfiles(
  anoLetivo: number,
  onUpdate: (profiles: StudentFinancialProfile[]) => void
): () => void {
  try {
    const colRef = collection(db, FINANCIAL_COLLECTION);
    const q = query(colRef, where('anoLetivo', '==', anoLetivo));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: StudentFinancialProfile[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as StudentFinancialProfile);
        });
        saveLocalFinancialProfiles(list);
        onUpdate(list);
      },
      (error) => {
        console.warn('Erro no listener de perfis financeiros:', error);
        const local = loadLocalFinancialProfiles().filter((p) => p.anoLetivo === anoLetivo);
        onUpdate(local);
      }
    );

    return unsubscribe;
  } catch (e) {
    console.warn('Falha ao iniciar listener de perfis financeiros:', e);
    const local = loadLocalFinancialProfiles().filter((p) => p.anoLetivo === anoLetivo);
    onUpdate(local);
    return () => {};
  }
}

export async function zeroAllExtraWorkshopsValues(
  anoLetivo: number,
  providedStudents?: Student[]
): Promise<{ success: boolean; count: number; profiles: StudentFinancialProfile[]; updatedStudents: Student[] }> {
  const allStudents = loadStudents();
  const targetStudents = (providedStudents && providedStudents.length > 0 ? providedStudents : allStudents).filter(
    (s) => s.anoLetivo === anoLetivo
  );

  const allProfiles = loadLocalFinancialProfiles();
  const profileMap = new Map<string, StudentFinancialProfile>();
  allProfiles.forEach((p) => {
    if (p.anoLetivo === anoLetivo && p.studentId) {
      profileMap.set(p.studentId, p);
    }
  });

  const updatedProfiles: StudentFinancialProfile[] = [];
  const updatedStudentList: Student[] = [];
  const nowIso = new Date().toISOString();

  for (const student of targetStudents) {
    const existing = profileMap.get(student.id);
    const profile = existing ? { ...existing } : buildDefaultFinancialProfile(student, anoLetivo);

    profile.valorModalidadesExtras = 0;
    profile.oficinasExtras = 0;
    profile.valorOficinas = 0;
    profile.valorExtras = 0;

    const baseVal = profile.valorMensalidadeBase || (anoLetivo === 2027 ? 1250 : 1120);
    const descontoBolsa = Number(profile.descontoBolsa) || 0;
    const newTotal = Math.max(0, baseVal - descontoBolsa);

    profile.valorTotalMensal = newTotal;
    if (descontoBolsa >= baseVal && baseVal > 0) {
      profile.statusPagamento = 'ISENTO';
    } else if (profile.statusPagamento === 'ISENTO') {
      profile.statusPagamento = 'EM_DIA';
    }
    profile.updatedAt = nowIso;
    profile.updatedBy = 'Zeramento Administrativo de Oficinas Extras';

    updatedProfiles.push(profile);

    const updatedStudent: Student = {
      ...student,
      valorModalidadesExtras: 0,
      oficinasExtras: 0,
      valorOficinas: 0,
      valorExtras: 0,
      valorMensalidadeFinal: newTotal,
    };
    updatedStudentList.push(updatedStudent);
  }

  try {
    const batchSize = 400;
    for (let i = 0; i < updatedProfiles.length; i += batchSize) {
      const chunkProfiles = updatedProfiles.slice(i, i + batchSize);
      const batch = writeBatch(db);

      chunkProfiles.forEach((p) => {
        const docId = p.id || `${anoLetivo}_${p.studentId}`;
        const ref = doc(db, FINANCIAL_COLLECTION, docId);
        batch.set(
          ref,
          {
            ...p,
            id: docId,
            valorModalidadesExtras: 0,
            oficinasExtras: 0,
            valorOficinas: 0,
            valorExtras: 0,
            valorTotalMensal: p.valorTotalMensal,
            statusPagamento: p.statusPagamento,
            updatedAt: nowIso,
            updatedBy: 'Zeramento Administrativo de Oficinas Extras',
          },
          { merge: true }
        );
      });

      await batch.commit();
    }
  } catch (err) {
    console.warn('Aviso ao persistir perfis financeiros zerados no Firestore (modo offline/resiliente):', err);
  }

  try {
    const studentBatchSize = 200;
    for (let i = 0; i < updatedStudentList.length; i += studentBatchSize) {
      const chunkStudents = updatedStudentList.slice(i, i + studentBatchSize);
      const batch = writeBatch(db);

      chunkStudents.forEach((st) => {
        const alunosRef = doc(db, 'alunos', st.id);
        const studentsRef = doc(db, 'students', st.id);
        const patch = {
          valorModalidadesExtras: 0,
          oficinasExtras: 0,
          valorOficinas: 0,
          valorExtras: 0,
          valorMensalidadeFinal: st.valorMensalidadeFinal,
          updatedAt: nowIso,
        };
        batch.set(alunosRef, patch, { merge: true });
        batch.set(studentsRef, patch, { merge: true });
      });

      await batch.commit();
    }
  } catch (err) {
    console.warn('Aviso ao sincronizar alunos no Firestore após zerar oficinas (modo offline/resiliente):', err);
  }

  const mergedProfiles = allProfiles.filter((p) => p.anoLetivo !== anoLetivo);
  mergedProfiles.push(...updatedProfiles);
  saveLocalFinancialProfiles(mergedProfiles);

  const studentMap = new Map<string, Student>();
  allStudents.forEach((st) => studentMap.set(st.id, st));
  updatedStudentList.forEach((st) => studentMap.set(st.id, st));
  const finalStudentsList = Array.from(studentMap.values());
  saveStudents(finalStudentsList);

  try {
    broadcastSyncEvent('SYNC_STUDENTS', { anoLetivo, action: 'ZERO_EXTRA_WORKSHOPS' });
  } catch {}

  return {
    success: true,
    count: updatedProfiles.length,
    profiles: updatedProfiles,
    updatedStudents: finalStudentsList,
  };
}

// ---------------------------------------------------------------------------
// EXTRAÇÃO AUTOMÁTICA DAS FONTES REAIS (PONTO, REFEIÇÕES E CULINÁRIA)
// ---------------------------------------------------------------------------

interface StaffPayrollGroupDef {
  key: string;
  categoria: string;
  label: string;
  shortLabel: string;
}

const PAYROLL_GROUP_DEFS: Record<string, StaffPayrollGroupDef> = {
  coordenacao: {
    key: 'coordenacao',
    categoria: 'FOLHA_COORDENACAO',
    label: 'Coordenação',
    shortLabel: 'Folha: Coordenação',
  },
  auxiliar_adi: {
    key: 'auxiliar_adi',
    categoria: 'FOLHA_AUXILIAR_ADI',
    label: 'Auxiliar (ADI)',
    shortLabel: 'Folha: Auxiliar (ADI)',
  },
  monitor: {
    key: 'monitor',
    categoria: 'FOLHA_MONITOR',
    label: 'Monitor',
    shortLabel: 'Folha: Monitor',
  },
  professor_horista: {
    key: 'professor_horista',
    categoria: 'FOLHA_PROFESSOR_HORISTA',
    label: 'Professor Horista',
    shortLabel: 'Folha: Professor Horista',
  },
  professor_prestador: {
    key: 'professor_prestador',
    categoria: 'FOLHA_PROFESSOR_PRESTADOR',
    label: 'Professor Prestador',
    shortLabel: 'Folha: Professor Prestador',
  },
  nutricionista: {
    key: 'nutricionista',
    categoria: 'FOLHA_NUTRICIONISTA',
    label: 'Nutricionista',
    shortLabel: 'Folha: Nutricionista',
  },
  secretaria: {
    key: 'secretaria',
    categoria: 'FOLHA_SECRETARIA_ADMIN',
    label: 'Secretaria / Administrativo',
    shortLabel: 'Folha: Secretaria / Admin',
  },
  apoio_limpeza: {
    key: 'apoio_limpeza',
    categoria: 'FOLHA_APOIO_LIMPEZA',
    label: 'Apoio / Limpeza',
    shortLabel: 'Folha: Apoio / Limpeza',
  },
  outros: {
    key: 'outros',
    categoria: 'FOLHA_OUTROS',
    label: 'Outros Cargos',
    shortLabel: 'Folha: Outros',
  },
};

/**
 * Classifica o colaborador ativo em seu cargo oficial do Livro Ponto / Gestão de Pessoas:
 * Coordenação, Auxiliar (ADI), Monitor, Professor Horista, Professor Prestador ou Nutricionista.
 */
export function classifyStaffPayrollGroup(u: UserProfile): StaffPayrollGroupDef {
  const cargo = String(u.cargoLabel || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const unifiedCargo = detectCargoCategory(u);

  if (
    cargo.includes('limpeza') ||
    cargo.includes('servicos gerais') ||
    cargo.includes('zelad') ||
    cargo.includes('porteir') ||
    cargo.includes('copeir')
  ) {
    return PAYROLL_GROUP_DEFS.apoio_limpeza;
  }

  if (
    (cargo.includes('secretar') ||
      cargo.includes('recep') ||
      cargo.includes('tesour') ||
      cargo.includes('auxiliar administrativo')) &&
    unifiedCargo !== 'coordenador'
  ) {
    return PAYROLL_GROUP_DEFS.secretaria;
  }

  switch (unifiedCargo) {
    case 'coordenador':
      return PAYROLL_GROUP_DEFS.coordenacao;
    case 'auxiliar_adi':
      return PAYROLL_GROUP_DEFS.auxiliar_adi;
    case 'monitor':
      return PAYROLL_GROUP_DEFS.monitor;
    case 'professor_horista':
      return PAYROLL_GROUP_DEFS.professor_horista;
    case 'professor_prestador':
      return PAYROLL_GROUP_DEFS.professor_prestador;
    case 'nutricionista':
      return PAYROLL_GROUP_DEFS.nutricionista;
    default:
      return PAYROLL_GROUP_DEFS.monitor;
  }
}

function getMonthNumberFromCompetencia(
  anoLetivo: number,
  targetMonth: number | 'ALL' = 'ALL',
  pontoClosings: PontoMonthClosing[] = [],
  pontoRecords: PontoRecord[] = [],
  mealReports: MealReportConfig[] = []
): number {
  if (targetMonth !== 'ALL' && targetMonth >= 1 && targetMonth <= 12) {
    return targetMonth;
  }

  const yearPrefix = `${anoLetivo}-`;

  // Tenta encontrar o mês mais recente com fechamento de ponto ou relatório de refeição no ano letivo
  const closingMonths = pontoClosings
    .filter((c) => Number(c.year) === anoLetivo || (c.monthKey || '').startsWith(yearPrefix))
    .map((c) => Number(c.month || (c.monthKey || '').split('-')[1] || 0))
    .filter((m) => m >= 1 && m <= 12);

  if (closingMonths.length > 0) {
    return Math.max(...closingMonths);
  }

  const pontoMonths = pontoRecords
    .filter((r) => (r.date || '').startsWith(yearPrefix))
    .map((r) => Number(r.date.slice(5, 7)))
    .filter((m) => m >= 1 && m <= 12);

  if (pontoMonths.length > 0) {
    return Math.max(...pontoMonths);
  }

  const mealMonths = mealReports
    .filter((r) => Number(r.year) === anoLetivo || (r.monthKey || '').startsWith(yearPrefix))
    .map((r) => Number(r.month || (r.monthKey || '').split('-')[1] || 0))
    .filter((m) => m >= 1 && m <= 12);

  if (mealMonths.length > 0) {
    return Math.max(...mealMonths);
  }

  const now = new Date();
  if (now.getFullYear() === anoLetivo) {
    return now.getMonth() + 1;
  }
  return 8; // Agosto como referência escolar padrão para outros exercícios sem lançamentos
}

export interface ModuleSyncContext {
  anoLetivo: number;
  selectedMonth?: number | 'ALL';
  students?: Student[];
  users?: UserProfile[];
  pontoRecords?: PontoRecord[];
  pontoClosings?: PontoMonthClosing[];
  holidays?: HolidayItem[];
  attendanceRecords?: AttendanceRecord[];
  schedules?: ScheduleBlock[];
  semanarioPlans?: SemanarioPlan[];
  mealReports?: MealReportConfig[];
  mealGlobalSettings?: MealReportGlobalSettings | null;
  cookingRecipes?: CookingRecipe[];
}

/**
 * Extrai e agrupa automaticamente as despesas de Folha de Pagamento fracionadas por Cargo/Categoria
 * a partir dos colaboradores ativos e registros reais do Livro Ponto.
 */
export function extractPayrollExpensesByRoleCategory(ctx: ModuleSyncContext): FinancialExpense[] {
  const { anoLetivo } = ctx;
  const users = ctx.users || [];
  const pontoRecords = ctx.pontoRecords && ctx.pontoRecords.length > 0 ? ctx.pontoRecords : loadPontoRecords();
  const pontoClosings = ctx.pontoClosings && ctx.pontoClosings.length > 0 ? ctx.pontoClosings : loadPontoClosings();
  const holidays = ctx.holidays && ctx.holidays.length > 0 ? ctx.holidays : loadHolidays();
  const attendanceRecords =
    ctx.attendanceRecords && ctx.attendanceRecords.length > 0 ? ctx.attendanceRecords : loadAttendanceRecords();
  const schedules = ctx.schedules && ctx.schedules.length > 0 ? ctx.schedules : loadSchedules();
  const mealReports = ctx.mealReports || [];

  const targetMonth = getMonthNumberFromCompetencia(
    anoLetivo,
    ctx.selectedMonth ?? 'ALL',
    pontoClosings,
    pontoRecords,
    mealReports
  );
  const padM = String(targetMonth).padStart(2, '0');
  const monthKey = `${anoLetivo}-${padM}`;
  const daysInMonth = new Date(anoLetivo, targetMonth, 0).getDate();
  const startDate = `${monthKey}-01`;
  const endDate = `${monthKey}-${String(daysInMonth).padStart(2, '0')}`;
  const monthLabel = MONTH_NAMES_DRE[targetMonth - 1]?.full || padM;

  // Filtra colaboradores ATIVOS (e ignora apenas admin técnico sem dados financeiros/fechamento)
  const activeStaff = users.filter((u) => {
    if (!u || !u.id) return false;
    if (isUserInactiveOrDismissed(u)) return false;
    const isTechnicalAdmin = String(u.role).toLowerCase() === 'admin';
    if (isTechnicalAdmin) {
      const hasSalaryOrAid =
        (u.baseSalary !== undefined && u.baseSalary !== null && Number(u.baseSalary) > 0) ||
        (u.ajudaDeCusto !== undefined && u.ajudaDeCusto !== null && Number(u.ajudaDeCusto) > 0);
      const hasMonthClosing = pontoClosings.some(
        (c) => c.userId === u.id && c.monthKey === monthKey && Number(c.netTotal) > 0
      );
      if (!hasSalaryOrAid && !hasMonthClosing) return false;
    }
    return true;
  });

  const groupsMap = new Map<
    string,
    {
      def: StaffPayrollGroupDef;
      subtotal: number;
      staffNames: string[];
    }
  >();

  activeStaff.forEach((u) => {
    // Busca fechamento estritamente do mês selecionado (sem herdar fechamento de outros meses)
    const userClosing = pontoClosings.find((c) => c.userId === u.id && c.monthKey === monthKey) || null;
    const isMonthClosed = Boolean(userClosing?.isClosed);

    let netCost = 0;

    if (isMonthClosed && userClosing) {
      netCost = Number(userClosing.netTotal) || 0;
    } else {
      const userMonthRecords = pontoRecords.filter(
        (r) => r.userId === u.id && r.date && r.date.startsWith(monthKey)
      );
      // Espelha 100% os Dados do Contribuinte / Dados Contratuais do Livro Ponto
      const regime = u.regimeTrabalho || 'mensalista';
      const baseSalary =
        u.baseSalary !== undefined && u.baseSalary !== null ? Number(u.baseSalary) : 1200;
      const ajudaDeCusto =
        u.ajudaDeCusto !== undefined && u.ajudaDeCusto !== null
          ? Math.max(0, Number(u.ajudaDeCusto))
          : 0;
      const divisorHours = u.contractDivisorHours || DIVISOR_MENSAL_PADRAO;
      const duracaoAulaMinutos = u.duracaoAulaMinutos || DURACAO_AULA_PADRAO_MINUTOS;
      const contractSchedule = u.contractSchedule || '11:40 - 17:40';
      const valorHoraAula =
        u.valorHoraAula !== undefined && u.valorHoraAula !== null ? Number(u.valorHoraAula) : undefined;
      const manualAddition = userClosing?.manualAddition || 0;
      const manualDiscount = userClosing?.manualDiscount || 0;

      if (regime === 'professor_horista') {
        const activities =
          Array.isArray(u.assignedActivities) && u.assignedActivities.length > 0
            ? u.assignedActivities
            : u.specialtyActivity
            ? [u.specialtyActivity]
            : ['Balé', 'Dança'];
        const folhaHorista = calculateFolhaProfessorHorista({
          professor: u,
          startDate,
          endDate,
          holidays,
          records: attendanceRecords,
          pontoRecords: userMonthRecords,
          schedules,
          professorActivities: activities,
          manualAddition,
          manualDiscount,
          ajudaDeCusto,
        });
        const calc = calculateMonthlyPontoFinancials({
          records: userMonthRecords,
          holidays,
          year: anoLetivo,
          month: targetMonth,
          regimeTrabalho: 'professor_horista',
          valorHoraAula,
          duracaoAulaMinutos,
          customFolhaHorista: folhaHorista,
          baseSalary,
          divisorHours,
          divisorDays: 30,
          ajudaDeCusto,
          contractDailyHours: u.contractDailyHours,
          contractDailyMinutes: u.contractDailyMinutes,
          contractDailyHoursFormatted: u.contractDailyHoursFormatted,
          contractSchedule,
          manualAddition,
          manualDiscount,
          dataAdmissao: u.dataAdmissao,
        });
        netCost = Number(calc.netTotal) || 0;
      } else if (regime === 'prestador_aula_efetiva') {
        const activities =
          Array.isArray(u.assignedActivities) && u.assignedActivities.length > 0
            ? u.assignedActivities
            : u.specialtyActivity
            ? [u.specialtyActivity]
            : ['Flauta'];
        const apuracao = calculateApuracaoAulasEfetivasPrestador({
          prestador: u,
          startDate,
          endDate,
          holidays,
          records: attendanceRecords,
          prestadorActivities: activities,
        });
        const calc = calculateMonthlyPontoFinancials({
          records: userMonthRecords,
          holidays,
          year: anoLetivo,
          month: targetMonth,
          regimeTrabalho: 'prestador_aula_efetiva',
          valorHoraAula,
          duracaoAulaMinutos,
          customTotalAulas: apuracao.totalAulasDadas,
          baseSalary,
          divisorHours,
          divisorDays: 30,
          ajudaDeCusto,
          contractDailyHours: u.contractDailyHours,
          contractDailyMinutes: u.contractDailyMinutes,
          contractDailyHoursFormatted: u.contractDailyHoursFormatted,
          contractSchedule,
          manualAddition,
          manualDiscount,
          dataAdmissao: u.dataAdmissao,
        });
        netCost = Number(calc.netTotal) || 0;
      } else {
        const calc = calculateMonthlyPontoFinancials({
          records: userMonthRecords,
          holidays,
          year: anoLetivo,
          month: targetMonth,
          regimeTrabalho: 'mensalista',
          baseSalary,
          divisorHours,
          divisorDays: 30,
          ajudaDeCusto,
          contractDailyHours: u.contractDailyHours,
          contractDailyMinutes: u.contractDailyMinutes,
          contractDailyHoursFormatted: u.contractDailyHoursFormatted,
          contractSchedule,
          manualAddition,
          manualDiscount,
          dataAdmissao: u.dataAdmissao,
        });
        netCost = Number(calc.netTotal) || 0;
      }
    }

    if (netCost <= 0) return;

    const groupDef = classifyStaffPayrollGroup(u);
    const existingGroup = groupsMap.get(groupDef.key) || {
      def: groupDef,
      subtotal: 0,
      staffNames: [],
    };
    existingGroup.subtotal = Math.round((existingGroup.subtotal + netCost) * 100) / 100;
    existingGroup.staffNames.push(u.name.split(' ').slice(0, 2).join(' '));
    groupsMap.set(groupDef.key, existingGroup);
  });

  const nowIso = new Date().toISOString();
  const dueDate = `${monthKey}-05`;

  const result: FinancialExpense[] = [];
  const order = [
    'coordenacao',
    'auxiliar_adi',
    'monitor',
    'professor_horista',
    'professor_prestador',
    'nutricionista',
    'secretaria',
    'apoio_limpeza',
    'outros',
  ];

  order.forEach((groupKey) => {
    const entry = groupsMap.get(groupKey);
    if (!entry || entry.subtotal <= 0) return;

    const count = entry.staffNames.length;
    const namesPreview =
      entry.staffNames.length <= 4
        ? entry.staffNames.join(', ')
        : `${entry.staffNames.slice(0, 4).join(', ')} e +${entry.staffNames.length - 4}`;

    result.push({
      id: `exp_${anoLetivo}_folha_cat_${entry.def.key}`,
      anoLetivo,
      categoria: entry.def.categoria,
      categoriaLabel: entry.def.shortLabel,
      subcategoriaCargo: entry.def.label,
      descricao: `Folha: ${entry.def.label} (${count} ${count === 1 ? 'colaborador ativo' : 'colaboradores ativos'})`,
      valor: entry.subtotal,
      dataVencimento: dueDate,
      dataPagamento: dueDate,
      status: 'PAGO',
      formaPagamento: 'Transferência Bancária (Folha)',
      fornecedorOuBeneficiario: `Equipe ${entry.def.label} — Livro Ponto`,
      fornecedor: `Equipe ${entry.def.label} — Livro Ponto`,
      observacoes: `Auto-Sync Livro Ponto • Dados do Contribuinte (${monthLabel}/${anoLetivo}): ${namesPreview}.`,
      createdAt: nowIso,
      updatedAt: nowIso,
      isAutoGenerated: true,
      origemModulo: 'FOLHA_PONTO',
      origemAbaLabel: 'Livro Ponto',
      autoSyncKey: `sync_folha_cat_${entry.def.key}_${anoLetivo}`,
      competenciaMonthKey: monthKey,
    });
  });

  return result;
}

/**
 * Lê as configurações globais de refeição com fallback para cache local.
 */
function resolveMealGlobalSettings(ctx: ModuleSyncContext): MealReportGlobalSettings | null {
  if (ctx.mealGlobalSettings) return ctx.mealGlobalSettings;
  try {
    const raw = localStorage.getItem('crescer_meal_global_settings');
    if (raw) return JSON.parse(raw) as MealReportGlobalSettings;
  } catch {}
  return null;
}

/**
 * Extrai e sincroniza dinamicamente o custo real de Refeições (Almoço) puxando exatamente
 * a apuração do Relatório Financeiro de Refeições (Almoço) do mês selecionado.
 */
export function extractMealExpense(ctx: ModuleSyncContext): FinancialExpense {
  const { anoLetivo } = ctx;
  const students = ctx.students || [];
  const holidays = ctx.holidays && ctx.holidays.length > 0 ? ctx.holidays : loadHolidays();
  const pontoClosings = ctx.pontoClosings || [];
  const pontoRecords = ctx.pontoRecords || [];
  const mealReports = ctx.mealReports || [];
  const attendanceRecords =
    ctx.attendanceRecords && ctx.attendanceRecords.length > 0 ? ctx.attendanceRecords : loadAttendanceRecords();

  const targetMonth = getMonthNumberFromCompetencia(
    anoLetivo,
    ctx.selectedMonth ?? 'ALL',
    pontoClosings,
    pontoRecords,
    mealReports
  );
  const padM = String(targetMonth).padStart(2, '0');
  const monthKey = `${anoLetivo}-${padM}`;
  const monthLabel = MONTH_NAMES_DRE[targetMonth - 1]?.full || padM;

  // Config estrita do mês selecionado no Relatório Financeiro de Refeições (Almoço)
  const remoteMealReport = mealReports.find((r) => r.monthKey === monthKey) || null;
  const localMealConfig = loadMealConfig(monthKey);
  const effectiveMealConfig: MealReportConfig | null =
    remoteMealReport && localMealConfig
      ? !remoteMealReport.updatedAt || (localMealConfig.updatedAt && localMealConfig.updatedAt > remoteMealReport.updatedAt)
        ? localMealConfig
        : remoteMealReport
      : remoteMealReport || localMealConfig;

  const globalSettings = resolveMealGlobalSettings(ctx);
  const unitPrice =
    remoteMealReport && remoteMealReport.defaultUnitPrice !== undefined
      ? Number(remoteMealReport.defaultUnitPrice)
      : globalSettings?.unitPrice !== undefined
      ? Number(globalSettings.unitPrice)
      : effectiveMealConfig?.defaultUnitPrice !== undefined
      ? Number(effectiveMealConfig.defaultUnitPrice)
      : 9.0;

  // Sanitiza entradas salvas exatamente como o Relatório Financeiro de Refeições (MealReportModal)
  const sanitizedEntries: Record<string, any> = {};
  if (effectiveMealConfig?.entries) {
    Object.entries(effectiveMealConfig.entries).forEach(([dateKey, val]) => {
      if (!val) return;
      const rawCount = val.editableStudents !== undefined ? val.editableStudents : val.manualCount;
      const hasCount = rawCount !== undefined && rawCount !== null;
      let count = hasCount ? Number(rawCount) : undefined;
      const rollCallCount = getRollCallPresencesForDate(dateKey, attendanceRecords);
      if ((count === undefined || count === 0) && rollCallCount > 0) {
        count = rollCallCount;
      }
      const isExplicitOverride =
        count !== undefined && count > 0 && rollCallCount > 0
          ? count !== rollCallCount && Boolean(val.isManualOverride)
          : Boolean(val.isManualOverride);

      sanitizedEntries[dateKey] = {
        ...val,
        manualCount: count,
        editableStudents: count,
        isManualOverride: isExplicitOverride,
      };
    });
  }

  const mealConfigForCalc: MealReportConfig | null = effectiveMealConfig
    ? { ...effectiveMealConfig, defaultUnitPrice: unitPrice, entries: sanitizedEntries }
    : null;

  const mealEntries = buildMonthMealEntries(
    anoLetivo,
    targetMonth,
    students,
    attendanceRecords,
    holidays,
    mealConfigForCalc,
    unitPrice
  );
  const mealTotals = calculateMealTotals(mealEntries);
  const totalMealCost = Math.round(mealTotals.totalAmount * 100) / 100;

  const DEFAULT_MEAL_PROVIDER = 'Cantina & Nutrição Escolar';
  const pickCustomProvider = (...candidates: Array<string | undefined | null>): string => {
    for (const c of candidates) {
      const trimmed = typeof c === 'string' ? c.trim() : '';
      if (trimmed && trimmed !== DEFAULT_MEAL_PROVIDER) {
        return trimmed;
      }
    }
    return DEFAULT_MEAL_PROVIDER;
  };

  const providerName = pickCustomProvider(
    remoteMealReport?.providerName,
    remoteMealReport?.contractCompany,
    globalSettings?.providerName,
    effectiveMealConfig?.providerName,
    effectiveMealConfig?.contractCompany
  );

  const nowIso = new Date().toISOString();
  const dueDate = `${monthKey}-10`;

  return {
    id: `exp_${anoLetivo}_alimentacao_refeicoes`,
    anoLetivo,
    categoria: 'ALIMENTACAO_REFEICOES',
    categoriaLabel: 'Refeições (Almoço)',
    descricao: `Refeições (Almoço) — ${mealTotals.totalMeals} refeições (${monthLabel}/${anoLetivo})`,
    valor: totalMealCost,
    dataVencimento: dueDate,
    dataPagamento: dueDate,
    status: 'PAGO',
    formaPagamento: 'Boleto Bancário',
    fornecedorOuBeneficiario: providerName,
    fornecedor: providerName,
    observacoes: `Auto-Sync Relatório Financeiro de Refeições (Almoço) • ${monthLabel}/${anoLetivo}: ${mealTotals.totalMeals} refeições em ${mealTotals.attendedDaysCount}/${mealTotals.schoolDaysCount} dia(s) letivo(s) • Média ${mealTotals.averageMealsPerDay} alunos/dia • Unitário padrão ${formatCurrencyBR(unitPrice)}.`,
    createdAt: nowIso,
    updatedAt: nowIso,
    isAutoGenerated: true,
    origemModulo: 'CARDAPIO_REFEICOES',
    origemAbaLabel: 'Relatório de Refeições (Almoço)',
    autoSyncKey: `sync_refeicoes_cardapio_${anoLetivo}`,
    competenciaMonthKey: monthKey,
  };
}

/**
 * Despesa fictícia de Culinária (Oficinas) removida definitivamente (retorna sempre null).
 */
export function extractCulinaryWorkshopExpense(_ctx: ModuleSyncContext): FinancialExpense | null {
  return null;
}

/**
 * Calcula TODAS as despesas operacionais automáticas reais a partir dos módulos:
 * 1. Livro Ponto fracionado por Cargo / Categoria
 * 2. Refeições (Almoço) com base no Relatório Financeiro de Refeições (Almoço)
 */
export function calculateModuleExpenses(
  anoLetivo: number,
  students: Student[] = [],
  users: UserProfile[] = [],
  extraCtx?: Omit<ModuleSyncContext, 'anoLetivo' | 'students' | 'users'>
): FinancialExpense[] {
  const ctx: ModuleSyncContext = {
    anoLetivo,
    students,
    users,
    ...extraCtx,
  };

  const payrollExpenses = extractPayrollExpensesByRoleCategory(ctx);
  const mealExpense = extractMealExpense(ctx);

  return [...payrollExpenses, mealExpense];
}

// ---------------------------------------------------------------------------
// GESTÃO DE DESPESAS (STORAGE & FIRESTORE) — PRESERVANDO 100% OS LANÇAMENTOS MANUAIS
// ---------------------------------------------------------------------------

/**
 * Mescla uma despesa auto-gerada com a cópia existente no Firestore/LocalStorage:
 * - O `valor` e `observacoes` auto-calculados refletem sempre a fonte real em tempo real;
 * - Em Refeições (Almoço), o nome da cantina/prestador salvo no Relatório de Refeições prevalece quando personalizado;
 * - As edições administrativas do gestor (`status`, `dataPagamento`, `formaPagamento`, `dataVencimento`, `fornecedor`)
 *   são preservadas.
 */
export function mergeAutoSyncedExpense(
  autoGenerated: FinancialExpense,
  existing?: Partial<FinancialExpense> | null
): FinancialExpense {
  if (!existing) return { ...autoGenerated };

  const statusVal = (existing.status as ExpenseStatus) || autoGenerated.status;
  const dataPgtoVal =
    statusVal === 'PAGO'
      ? existing.dataPagamento || autoGenerated.dataPagamento || new Date().toISOString().split('T')[0]
      : undefined;

  const autoProvider = (autoGenerated.fornecedorOuBeneficiario || autoGenerated.fornecedor || '').trim();
  const existingProvider =
    (existing.fornecedorOuBeneficiario && existing.fornecedorOuBeneficiario.trim()) ||
    (existing.fornecedor && existing.fornecedor.trim()) ||
    '';

  const fornecedorVal =
    autoGenerated.origemModulo === 'CARDAPIO_REFEICOES' &&
    autoProvider &&
    autoProvider !== 'Cantina & Nutrição Escolar'
      ? autoProvider
      : existingProvider || autoProvider || '';

  const sameMonth =
    !existing.competenciaMonthKey ||
    existing.competenciaMonthKey === autoGenerated.competenciaMonthKey;
  const vencimentoVal =
    sameMonth && existing.dataVencimento && existing.dataVencimento.trim()
      ? existing.dataVencimento.trim()
      : autoGenerated.dataVencimento;

  const formaPgtoVal =
    existing.formaPagamento && existing.formaPagamento.trim()
      ? existing.formaPagamento.trim()
      : autoGenerated.formaPagamento;

  return {
    ...autoGenerated,
    status: statusVal,
    dataPagamento: dataPgtoVal,
    fornecedorOuBeneficiario: fornecedorVal,
    fornecedor: fornecedorVal,
    dataVencimento: vencimentoVal,
    formaPagamento: formaPgtoVal,
    createdAt: existing.createdAt || autoGenerated.createdAt,
  };
}

/**
 * Lê despesas locais filtrando apenas registros obsoletos/mock antigos e
 * preservando integralmente TODAS as despesas manuais e sincronizadas válidas.
 */
export function sanitizeLocalExpensesStorage(anoLetivo?: number): FinancialExpense[] {
  try {
    const raw = localStorage.getItem(LOCAL_EXPENSES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const cleaned = parsed.filter((e) => e && !isObsoleteOrDuplicateExpense(e)) as FinancialExpense[];
    if (cleaned.length !== parsed.length) {
      localStorage.setItem(LOCAL_EXPENSES_STORAGE_KEY, JSON.stringify(cleaned));
    }
    return anoLetivo !== undefined ? cleaned.filter((e) => Number(e.anoLetivo) === Number(anoLetivo)) : cleaned;
  } catch (err) {
    console.warn('Erro ao ler storage local de despesas:', err);
    return [];
  }
}

export function loadLocalFinancialExpenses(): FinancialExpense[] {
  return sanitizeLocalExpensesStorage();
}

export function saveLocalFinancialExpenses(expenses: FinancialExpense[]): void {
  try {
    const cleaned = (expenses || []).filter((e) => e && !isObsoleteOrDuplicateExpense(e));
    localStorage.setItem(LOCAL_EXPENSES_STORAGE_KEY, JSON.stringify(cleaned));
  } catch (e) {
    console.warn('Erro ao salvar despesas locais:', e);
  }
}

/**
 * Persiste os registros auto-gerados mantendo 100% intactas as despesas manuais e personalizadas.
 */
export async function forceRewriteSanitizedExpensesToFirestore(
  anoLetivo: number = 2026,
  autoGeneratedExpenses?: FinancialExpense[]
): Promise<FinancialExpense[]> {
  const allLocal = sanitizeLocalExpensesStorage();
  const yearLocal = allLocal.filter((e) => Number(e.anoLetivo) === Number(anoLetivo));

  try {
    const colRef = collection(db, EXPENSES_COLLECTION);
    const snap = await getDocs(query(colRef, where('anoLetivo', '==', anoLetivo)));

    const remoteMap = new Map<string, FinancialExpense>();
    for (const d of snap.docs) {
      const data = { id: d.id, ...d.data() } as FinancialExpense;
      if (isObsoleteOrDuplicateExpense(data)) {
        await deleteDoc(d.ref).catch(() => {});
      } else {
        remoteMap.set(d.id, data);
      }
    }

    // Remove IDs legados obsoletos conhecidos do Firestore
    for (const obsId of OBSOLETE_EXPENSE_IDS) {
      if (obsId.includes(`_${anoLetivo}_`) || !obsId.includes('202')) {
        await deleteDoc(doc(db, EXPENSES_COLLECTION, obsId)).catch(() => {});
      }
    }

    // Mescla locais com remotos sem apagar despesas manuais!
    const mergedMap = new Map<string, FinancialExpense>();
    yearLocal.forEach((e) => mergedMap.set(e.id, e));
    remoteMap.forEach((e, id) => {
      const prev = mergedMap.get(id);
      if (!prev || (e.updatedAt && (!prev.updatedAt || e.updatedAt >= prev.updatedAt))) {
        mergedMap.set(id, e);
      }
    });

    // Se há lista auto-gerada atualizada dos módulos, mescla e remove apenas auto-syncs órfãos (ex: cargo sem ativos)
    if (autoGeneratedExpenses && autoGeneratedExpenses.length > 0) {
      const activeAutoIds = new Set(autoGeneratedExpenses.map((a) => a.id));

      // Remove apenas despesas auto-geradas de Folha/Culinária que não existem mais na extração atual
      for (const [id, existing] of Array.from(mergedMap.entries())) {
        if (
          existing.isAutoGenerated &&
          existing.origemModulo !== 'MANUAL' &&
          !activeAutoIds.has(id) &&
          (id.startsWith(`exp_${anoLetivo}_folha_cat_`) || id === `exp_${anoLetivo}_folha_livro_ponto`)
        ) {
          mergedMap.delete(id);
          await deleteDoc(doc(db, EXPENSES_COLLECTION, id)).catch(() => {});
        }
      }

      for (const autoExp of autoGeneratedExpenses) {
        const existing = mergedMap.get(autoExp.id);
        const merged = mergeAutoSyncedExpense(autoExp, existing);
        mergedMap.set(autoExp.id, merged);

        // Só grava no Firestore se for novo ou se valor/observacoes/descricao/competencia mudaram
        const changed =
          !existing ||
          Math.abs((Number(existing.valor) || 0) - merged.valor) > 0.009 ||
          existing.observacoes !== merged.observacoes ||
          existing.descricao !== merged.descricao ||
          existing.categoria !== merged.categoria ||
          existing.categoriaLabel !== merged.categoriaLabel ||
          existing.origemAbaLabel !== merged.origemAbaLabel ||
          existing.competenciaMonthKey !== merged.competenciaMonthKey ||
          existing.dataVencimento !== merged.dataVencimento ||
          (existing.fornecedorOuBeneficiario || '') !== (merged.fornecedorOuBeneficiario || '') ||
          (existing.fornecedor || '') !== (merged.fornecedor || '');

        if (changed) {
          await setDoc(doc(db, EXPENSES_COLLECTION, merged.id), merged, { merge: true }).catch(() => {});
        }
      }
    }

    const finalYearList = Array.from(mergedMap.values());
    const otherYears = allLocal.filter((e) => Number(e.anoLetivo) !== Number(anoLetivo));
    saveLocalFinancialExpenses([...otherYears, ...finalYearList]);
    return finalYearList;
  } catch (err) {
    console.warn('Aviso ao sincronizar despesas com Firestore:', err);
    return yearLocal;
  }
}

export async function loadFinancialExpensesFromFirestore(
  anoLetivo?: number
): Promise<FinancialExpense[]> {
  const targetYear = anoLetivo || 2026;
  return forceRewriteSanitizedExpensesToFirestore(targetYear);
}

/**
 * Atualiza ou salva uma despesa operacional no Firestore e no localStorage.
 */
export async function updateFinancialExpense(
  expenseId: string,
  patch: Partial<FinancialExpense>
): Promise<FinancialExpense | null> {
  if (!expenseId) return null;

  const allLocal = sanitizeLocalExpensesStorage();
  const existing = allLocal.find((e) => e.id === expenseId);

  const merged: FinancialExpense = {
    ...(existing || ({} as FinancialExpense)),
    ...patch,
    id: expenseId,
    updatedAt: new Date().toISOString(),
    updatedBy: patch.updatedBy || existing?.updatedBy || 'Coordenação',
  };

  try {
    const docRef = doc(db, EXPENSES_COLLECTION, expenseId);
    await setDoc(docRef, merged, { merge: true });
  } catch (err) {
    console.warn('Aviso: Falha na gravação remota da despesa no Firestore:', err);
  }

  const updatedList = allLocal.map((item) => (item.id === expenseId ? merged : item));
  if (!updatedList.some((item) => item.id === expenseId)) {
    updatedList.push(merged);
  }
  saveLocalFinancialExpenses(updatedList);
  broadcastSyncEvent('SYNC_FINANCIAL_EXPENSES', { anoLetivo: merged.anoLetivo });

  return merged;
}

export async function saveExpense(expense: FinancialExpense): Promise<FinancialExpense> {
  const expenseId = expense.id || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const cleanExpense: FinancialExpense = {
    ...expense,
    id: expenseId,
    origemModulo: expense.origemModulo || 'MANUAL',
    isAutoGenerated: expense.isAutoGenerated ?? false,
  };
  const result = await updateFinancialExpense(expenseId, cleanExpense);
  return result || cleanExpense;
}

export const saveExpenseToFirestore = saveExpense;

export async function deleteExpenseFromFirestore(expenseId: string): Promise<void> {
  try {
    const docRef = doc(db, EXPENSES_COLLECTION, expenseId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Falha ao excluir despesa no Firestore:', err);
  }

  const current = sanitizeLocalExpensesStorage().filter((e) => e.id !== expenseId);
  saveLocalFinancialExpenses(current);
  broadcastSyncEvent('SYNC_FINANCIAL_EXPENSES', { deletedId: expenseId });
}

export function subscribeFinancialExpenses(
  anoLetivo: number,
  onUpdate: (expenses: FinancialExpense[]) => void
): () => void {
  const initialLocal = sanitizeLocalExpensesStorage(anoLetivo);
  onUpdate(initialLocal);

  try {
    const colRef = collection(db, EXPENSES_COLLECTION);
    const q = query(colRef, where('anoLetivo', '==', anoLetivo));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const remoteList: FinancialExpense[] = [];

        snapshot.forEach((d) => {
          const data = { id: d.id, ...d.data() } as FinancialExpense;
          if (isObsoleteOrDuplicateExpense(data)) {
            deleteDoc(d.ref).catch(() => {});
          } else {
            remoteList.push(data);
          }
        });

        const allLocal = sanitizeLocalExpensesStorage();
        const otherYears = allLocal.filter((e) => Number(e.anoLetivo) !== Number(anoLetivo));

        // Se o Firestore já retornou documentos ou está conectado, usa-os preservando ordem limpa
        saveLocalFinancialExpenses([...otherYears, ...remoteList]);
        onUpdate(remoteList);
      },
      (error) => {
        console.warn('Erro no listener de despesas:', error);
        const local = sanitizeLocalExpensesStorage(anoLetivo);
        onUpdate(local);
      }
    );

    return unsubscribe;
  } catch (e) {
    console.warn('Falha ao iniciar listener de despesas:', e);
    const local = sanitizeLocalExpensesStorage(anoLetivo);
    onUpdate(local);
    return () => {};
  }
}

// ---------------------------------------------------------------------------
// CONSOLIDAÇÃO DE FLUXO DE CAIXA E INDICADORES (DINÂMICO POR CATEGORIA)
// ---------------------------------------------------------------------------

export function calculateFinancialMetrics(
  profiles: StudentFinancialProfile[],
  expenses: FinancialExpense[] = [],
  customCategories: CustomExpenseCategory[] = []
): FinancialMetricSummary {
  let receitaPrevistaMensal = 0;
  let receitaConfirmada = 0;
  let totalEmAtraso = 0;

  let totalEmDia = 0;
  let totalPendentes = 0;
  let totalAtrasados = 0;
  let totalIsentos = 0;

  let faturamentoBrutoReal = 0;
  let totalDescontoBolsas = 0;
  let totalAlunosPagantes = 0;

  profiles.forEach((p) => {
    if (p.studentStatus && p.studentStatus !== 'ativo') {
      return;
    }

    const valorBase = Number(p.valorMensalidadeBase) || 0;
    const extras = Number(p.valorModalidadesExtras) || 0;
    const desconto =
      p.descontoBolsa !== undefined
        ? Number(p.descontoBolsa) || 0
        : ((Number(p.descontoPercentual) || 0) * (valorBase + extras)) / 100;

    const valorLiquido =
      p.valorTotalMensal !== undefined
        ? Number(p.valorTotalMensal) || 0
        : Math.max(0, valorBase + extras - desconto);

    faturamentoBrutoReal += valorBase + extras;
    totalDescontoBolsas += desconto;

    if (p.statusPagamento === 'ISENTO' || valorLiquido <= 0) {
      totalIsentos++;
      return;
    }

    totalAlunosPagantes++;
    receitaPrevistaMensal += valorLiquido;

    if (p.statusPagamento === 'EM_DIA') {
      receitaConfirmada += valorLiquido;
      totalEmDia++;
    } else if (p.statusPagamento === 'EM_ATRASO') {
      totalEmAtraso += valorLiquido;
      totalAtrasados++;
    } else if (p.statusPagamento === 'PENDENTE') {
      totalPendentes++;
    }
  });

  const ticketMedioPorAluno =
    totalAlunosPagantes > 0
      ? Math.round((receitaPrevistaMensal / totalAlunosPagantes) * 100) / 100
      : 0;

  const baseAdimplencia = receitaConfirmada + totalEmAtraso;
  const taxaAdimplencia =
    baseAdimplencia > 0
      ? Math.round((receitaConfirmada / baseAdimplencia) * 100)
      : receitaPrevistaMensal > 0
      ? 100
      : 0;

  // Totalizadores de TODAS as despesas válidas (Folha fracionada + Refeições + Culinária + Personalizadas)
  const validExpenses = (expenses || []).filter((e) => !isObsoleteOrDuplicateExpense(e));

  let totalDespesasMes = 0;
  let totalDespesasPagas = 0;
  let totalDespesasPendentes = 0;
  let custoFolhaReal = 0;
  let custoAlimentacaoReal = 0;
  let custoCulinariaReal = 0;
  let custoOutrasCategoriasReal = 0;

  const categoryBreakdownMap = new Map<
    string,
    {
      categoria: string;
      label: string;
      shortLabel?: string;
      valor: number;
      isAutoGenerated: boolean;
      origemModulo?: string;
      origemAbaLabel?: string;
    }
  >();

  validExpenses.forEach((exp) => {
    const val = Number(exp.valor) || 0;
    totalDespesasMes += val;

    const catKey = exp.categoria || 'OUTROS';
    const isPayroll =
      catKey.startsWith('FOLHA_') || exp.origemModulo === 'FOLHA_PONTO';
    const isMeals =
      catKey === 'ALIMENTACAO_REFEICOES' ||
      catKey === 'ALIMENTACAO_HORTIFRUTI' ||
      exp.origemModulo === 'CARDAPIO_REFEICOES';
    const isCulinary =
      catKey === 'CULINARIA_OFICINAS' ||
      catKey === 'OFICINAS_CULINARIA' ||
      exp.origemModulo === 'CULINARIA_OFICINAS' ||
      exp.origemModulo === 'SEMANARIO_CULINARIA';

    if (isPayroll) {
      custoFolhaReal += val;
    } else if (isMeals) {
      custoAlimentacaoReal += val;
    } else if (isCulinary) {
      custoCulinariaReal += val;
    } else {
      custoOutrasCategoriasReal += val;
    }

    if (exp.status === 'PAGO') {
      totalDespesasPagas += val;
    } else {
      totalDespesasPendentes += val;
    }

    const catInfo = getCategoryDisplayInfo(catKey, customCategories, exp.categoriaLabel);
    const existingRow = categoryBreakdownMap.get(catKey);
    if (existingRow) {
      existingRow.valor = Math.round((existingRow.valor + val) * 100) / 100;
    } else {
      categoryBreakdownMap.set(catKey, {
        categoria: catKey,
        label: catInfo.label,
        shortLabel: catInfo.shortLabel,
        valor: Math.round(val * 100) / 100,
        isAutoGenerated: Boolean(exp.isAutoGenerated || exp.autoSyncKey),
        origemModulo: exp.origemModulo,
        origemAbaLabel: exp.origemAbaLabel || catInfo.origemAbaLabel,
      });
    }
  });

  const custosPorCategoria = Array.from(categoryBreakdownMap.values()).sort((a, b) => {
    // Ordena: Folha -> Refeições -> Culinária -> Categorias personalizadas (alfabética)
    const rank = (item: typeof a) => {
      if (item.categoria.startsWith('FOLHA_')) return 1;
      if (item.categoria.startsWith('ALIMENTACAO_')) return 2;
      if (item.categoria === 'CULINARIA_OFICINAS' || item.categoria === 'OFICINAS_CULINARIA') return 3;
      return 4;
    };
    const rDiff = rank(a) - rank(b);
    if (rDiff !== 0) return rDiff;
    return a.label.localeCompare(b.label, 'pt-BR');
  });

  const totalCustosOperacionaisReais = Math.round(totalDespesasMes * 100) / 100;
  const resultadoOperacionalLiquidoReal =
    Math.round((receitaPrevistaMensal - totalCustosOperacionaisReais) * 100) / 100;
  const margemOperacionalLiquida =
    receitaPrevistaMensal > 0
      ? Math.round((resultadoOperacionalLiquidoReal / receitaPrevistaMensal) * 1000) / 10
      : 0;

  const saldoLiquidoOperacional = Math.round((receitaConfirmada - totalDespesasMes) * 100) / 100;

  return {
    receitaPrevistaMensal: Math.round(receitaPrevistaMensal * 100) / 100,
    receitaConfirmada: Math.round(receitaConfirmada * 100) / 100,
    totalEmAtraso: Math.round(totalEmAtraso * 100) / 100,
    taxaAdimplencia,
    totalContratos: profiles.length,
    totalEmDia,
    totalPendentes,
    totalAtrasados,
    totalIsentos,
    totalDespesasMes: Math.round(totalDespesasMes * 100) / 100,
    totalDespesasPagas: Math.round(totalDespesasPagas * 100) / 100,
    totalDespesasPendentes: Math.round(totalDespesasPendentes * 100) / 100,
    saldoLiquidoOperacional,
    faturamentoBrutoReal: Math.round(faturamentoBrutoReal * 100) / 100,
    totalDescontoBolsas: Math.round(totalDescontoBolsas * 100) / 100,
    totalAlunosPagantes,
    ticketMedioPorAluno,
    custoFolhaReal: Math.round(custoFolhaReal * 100) / 100,
    custoAlimentacaoReal: Math.round(custoAlimentacaoReal * 100) / 100,
    custoCulinariaReal: Math.round(custoCulinariaReal * 100) / 100,
    custoOutrasCategoriasReal: Math.round(custoOutrasCategoriasReal * 100) / 100,
    custosPorCategoria,
    totalCustosOperacionaisReais,
    resultadoOperacionalLiquidoReal,
    margemOperacionalLiquida,
  };
}

// ---------------------------------------------------------------------------
// SINCRONIZAÇÃO AUTOMÁTICA COMPLETA EM TEMPO REAL
// ---------------------------------------------------------------------------

export const EXPENSE_LAST_SYNC_STORAGE_KEY = 'colegio_crescer_last_expense_sync_v1';

export function getLastExpenseSyncTime(): string | null {
  try {
    return localStorage.getItem(EXPENSE_LAST_SYNC_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function saveLastExpenseSyncTime(timestamp: string): void {
  try {
    localStorage.setItem(EXPENSE_LAST_SYNC_STORAGE_KEY, timestamp);
  } catch (err) {
    console.warn('Erro ao salvar timestamp da sincronização:', err);
  }
}

/**
 * Executa a sincronização automática das despesas a partir das abas reais:
 * - Livro Ponto (fracionado por Cargo/Categoria)
 * - Cardápio & Nutrição (Refeições com base nos alunos ativos da Rotina)
 * - Oficinas de Culinária (Cardápio + Semanário)
 * Preservando integralmente todas as despesas manuais e categorias personalizadas criadas pelo gestor.
 */
export async function syncExpensesFromModules(
  anoLetivo: number = 2026,
  students: Student[] = [],
  users: UserProfile[] = [],
  _currentExpenses: FinancialExpense[] = [],
  extraCtx?: Omit<ModuleSyncContext, 'anoLetivo' | 'students' | 'users'>
): Promise<{ updatedExpenses: FinancialExpense[]; count: number; timestamp: string }> {
  const autoGenerated = calculateModuleExpenses(anoLetivo, students, users, extraCtx);
  const updatedExpenses = await forceRewriteSanitizedExpensesToFirestore(anoLetivo, autoGenerated);
  const nowIso = new Date().toISOString();
  saveLastExpenseSyncTime(nowIso);

  return {
    updatedExpenses,
    count: updatedExpenses.length,
    timestamp: nowIso,
  };
}

// ---------------------------------------------------------------------------
// MATRIZ MENSAL DISCRIMINADA DO DRE (JANEIRO A DEZEMBRO + TOTAL ANUAL)
// ---------------------------------------------------------------------------

export interface DRECategoryMonthlyRow {
  categoria: string;
  label: string;
  shortLabel?: string;
  isAutoGenerated: boolean;
  origemModulo?: string;
  origemAbaLabel?: string;
  monthlyValues: number[]; // 12 meses
  totalAnual: number;
}

export interface DREMonthlyColumn {
  monthIndex: number; // 1 a 12
  monthName: string; // 'Jan', 'Fev', ...
  monthFullName: string; // 'Janeiro', 'Fevereiro', ...
  receitaBruta: number;
  descontoBolsas: number;
  receitaLiquida: number; // ROL
  custoFolha: number;
  custoAlimentacao: number;
  custoCulinaria: number;
  custoOutrasCategorias: number;
  custosOperacionais: number; // Total de todos os custos operacionais
  resultadoLiquido: number; // ReceitaLiquida - CustosOperacionais
  margemPercentual: number; // %
}

export interface DREMonthlySummary {
  anoLetivo: number;
  months: DREMonthlyColumn[];
  categoryRows: DRECategoryMonthlyRow[];
  totalAnual: {
    receitaBruta: number;
    descontoBolsas: number;
    receitaLiquida: number;
    custoFolha: number;
    custoAlimentacao: number;
    custoCulinaria: number;
    custoOutrasCategorias: number;
    custosOperacionais: number;
    resultadoLiquido: number;
    margemPercentual: number;
  };
}

export const MONTH_NAMES_DRE: Array<{ short: string; full: string }> = [
  { short: 'Jan', full: 'Janeiro' },
  { short: 'Fev', full: 'Fevereiro' },
  { short: 'Mar', full: 'Março' },
  { short: 'Abr', full: 'Abril' },
  { short: 'Mai', full: 'Maio' },
  { short: 'Jun', full: 'Junho' },
  { short: 'Jul', full: 'Julho' },
  { short: 'Ago', full: 'Agosto' },
  { short: 'Set', full: 'Setembro' },
  { short: 'Out', full: 'Outubro' },
  { short: 'Nov', full: 'Novembro' },
  { short: 'Dez', full: 'Dezembro' },
];

/**
 * Constrói a matriz mensal do DRE (Janeiro a Dezembro) refletindo dinamicamente
 * todas as categorias sincronizadas das abas e todas as categorias personalizadas criadas manualmente.
 */
export function calculateDREMonthlyMatrix(
  metrics: FinancialMetricSummary,
  anoLetivo: number = 2026
): DREMonthlySummary {
  const recBruta = Number(metrics.faturamentoBrutoReal) || 0;
  const descBolsas = Number(metrics.totalDescontoBolsas) || 0;
  const recLiquida = Number(metrics.receitaPrevistaMensal) || 0;
  const folha = Number(metrics.custoFolhaReal) || 0;
  const alimentacao = Number(metrics.custoAlimentacaoReal) || 0;
  const culinaria = Number(metrics.custoCulinariaReal) || 0;
  const outras = Number(metrics.custoOutrasCategoriasReal) || 0;
  const custosTotais =
    metrics.totalCustosOperacionaisReais !== undefined
      ? Number(metrics.totalCustosOperacionaisReais)
      : Math.round((folha + alimentacao + culinaria + outras) * 100) / 100;
  const resLiquido = Math.round((recLiquida - custosTotais) * 100) / 100;
  const margem = recLiquida > 0 ? Math.round((resLiquido / recLiquida) * 1000) / 10 : 0;

  const months: DREMonthlyColumn[] = MONTH_NAMES_DRE.map((m, idx) => ({
    monthIndex: idx + 1,
    monthName: m.short,
    monthFullName: m.full,
    receitaBruta: Math.round(recBruta * 100) / 100,
    descontoBolsas: Math.round(descBolsas * 100) / 100,
    receitaLiquida: Math.round(recLiquida * 100) / 100,
    custoFolha: Math.round(folha * 100) / 100,
    custoAlimentacao: Math.round(alimentacao * 100) / 100,
    custoCulinaria: Math.round(culinaria * 100) / 100,
    custoOutrasCategorias: Math.round(outras * 100) / 100,
    custosOperacionais: Math.round(custosTotais * 100) / 100,
    resultadoLiquido: Math.round(resLiquido * 100) / 100,
    margemPercentual: margem,
  }));

  const categoryRows: DRECategoryMonthlyRow[] = (metrics.custosPorCategoria || []).map((cat) => ({
    categoria: cat.categoria,
    label: cat.label,
    shortLabel: cat.shortLabel,
    isAutoGenerated: cat.isAutoGenerated,
    origemModulo: cat.origemModulo,
    origemAbaLabel: cat.origemAbaLabel,
    monthlyValues: Array.from({ length: 12 }, () => Math.round(cat.valor * 100) / 100),
    totalAnual: Math.round(cat.valor * 12 * 100) / 100,
  }));

  const totalAnualReceitaBruta = Math.round(recBruta * 12 * 100) / 100;
  const totalAnualDescontoBolsas = Math.round(descBolsas * 12 * 100) / 100;
  const totalAnualReceitaLiquida = Math.round(recLiquida * 12 * 100) / 100;
  const totalAnualCustoFolha = Math.round(folha * 12 * 100) / 100;
  const totalAnualCustoAlimentacao = Math.round(alimentacao * 12 * 100) / 100;
  const totalAnualCustoCulinaria = Math.round(culinaria * 12 * 100) / 100;
  const totalAnualCustoOutras = Math.round(outras * 12 * 100) / 100;
  const totalAnualCustosOperacionais = Math.round(custosTotais * 12 * 100) / 100;
  const totalAnualResultadoLiquido = Math.round(resLiquido * 12 * 100) / 100;
  const totalAnualMargem =
    totalAnualReceitaLiquida > 0
      ? Math.round((totalAnualResultadoLiquido / totalAnualReceitaLiquida) * 1000) / 10
      : 0;

  return {
    anoLetivo,
    months,
    categoryRows,
    totalAnual: {
      receitaBruta: totalAnualReceitaBruta,
      descontoBolsas: totalAnualDescontoBolsas,
      receitaLiquida: totalAnualReceitaLiquida,
      custoFolha: totalAnualCustoFolha,
      custoAlimentacao: totalAnualCustoAlimentacao,
      custoCulinaria: totalAnualCustoCulinaria,
      custoOutrasCategorias: totalAnualCustoOutras,
      custosOperacionais: totalAnualCustosOperacionais,
      resultadoLiquido: totalAnualResultadoLiquido,
      margemPercentual: totalAnualMargem,
    },
  };
}
