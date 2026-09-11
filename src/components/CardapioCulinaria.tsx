import React, { useState, useEffect, useMemo } from 'react';
import {
  Utensils,
  ChefHat,
  Printer,
  Calendar,
  Clock,
  CheckCircle2,
  FileText,
  AlertCircle,
  Sparkles,
  Plus,
  Edit3,
  Trash2,
  Info,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Flame,
  Coffee,
  Apple,
  Salad,
  Carrot,
} from 'lucide-react';
import { UserProfile } from '../types';
import { MonthlyMenu, CookingRecipe, MenuItemDay, DayOfWeekMenu } from '../types/cardapio';
import {
  loadMonthlyMenu,
  saveMonthlyMenu,
  syncMonthlyMenuFromFirestore,
  loadCookingRecipes,
  saveCookingRecipes,
  syncCookingRecipesFromFirestore,
  generateBlankMonthMenu,
} from '../utils/cardapioStorage';
import { canManageCardapio, isNutricionista } from '../utils/authUtils';
import { generateCardapioMensalPDF, generateReceitasCulinariaPDF, PDFGenerationResult } from '../utils/pdfGenerator';
import { PdfViewerModal } from './PdfViewerModal';
import { EditDayModal } from './CardapioCulinaria/EditDayModal';
import { EditRecipeModal } from './CardapioCulinaria/EditRecipeModal';
import { formatDateBR } from '../utils/dateUtils';

interface CardapioCulinariaProps {
  currentUser: UserProfile | null;
}

export const CardapioCulinaria: React.FC<CardapioCulinariaProps> = ({ currentUser }) => {
  // Navigation subtabs
  const [activeSubTab, setActiveSubTab] = useState<'almoco' | 'culinaria' | 'nutricionista'>('almoco');

  // Month selection (defaults to September 2026 as officialized by the school)
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(9);
  const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  // Menu data
  const [monthlyMenu, setMonthlyMenu] = useState<MonthlyMenu>(() => loadMonthlyMenu(monthKey));

  // Recipes data
  const [recipes, setRecipes] = useState<CookingRecipe[]>(() => loadCookingRecipes(monthKey));

  // Modals state
  const [editingDay, setEditingDay] = useState<MenuItemDay | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<CookingRecipe | null>(null);
  const [isNewRecipeModalOpen, setIsNewRecipeModalOpen] = useState<boolean>(false);

  // PDF Preview State
  const [pdfPreview, setPdfPreview] = useState<{
    isOpen: boolean;
    result: PDFGenerationResult | null;
    title: string;
  }>({
    isOpen: false,
    result: null,
    title: '',
  });

  // Success / Info toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Nutritionist profile editable state
  const [editingNutritionistName, setEditingNutritionistName] = useState<string>(monthlyMenu.nutritionistName || 'Thaís Grisoni Baroni');
  const [isSavingNutri, setIsSavingNutri] = useState<boolean>(false);

  useEffect(() => {
    setEditingNutritionistName(monthlyMenu.nutritionistName || 'Thaís Grisoni Baroni');
  }, [monthlyMenu.nutritionistName]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSaveNutritionistName = async () => {
    const trimmed = editingNutritionistName.trim();
    if (!trimmed) return;
    setIsSavingNutri(true);
    try {
      const updatedMenu = { ...monthlyMenu, nutritionistName: trimmed };
      setMonthlyMenu(updatedMenu);
      await saveMonthlyMenu(updatedMenu);
      showToast('Nome da Nutricionista atualizado com sucesso!');
    } catch (err) {
      console.error('Erro ao atualizar nutricionista:', err);
    } finally {
      setIsSavingNutri(false);
    }
  };

  // Check if current user has nutritionist/admin permissions
  const hasEditPermission = useMemo(() => {
    return canManageCardapio(currentUser);
  }, [currentUser]);

  // Load and sync when monthKey changes
  useEffect(() => {
    const localMenu = loadMonthlyMenu(monthKey);
    setMonthlyMenu(localMenu);

    const localRecipes = loadCookingRecipes(monthKey);
    setRecipes(localRecipes);

    // Sync from Firestore in background
    syncMonthlyMenuFromFirestore(monthKey).then((remoteMenu) => {
      if (remoteMenu) {
        setMonthlyMenu(remoteMenu);
      }
    });

    syncCookingRecipesFromFirestore(monthKey).then((remoteRecipes) => {
      if (remoteRecipes) {
        setRecipes(remoteRecipes);
      }
    });
  }, [monthKey]);

  // Month navigation
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear((prev) => prev - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear((prev) => prev + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  // Save updated Day
  const handleSaveDay = async (updatedDay: MenuItemDay) => {
    const updatedMenu: MonthlyMenu = {
      ...monthlyMenu,
      days: {
        ...monthlyMenu.days,
        [updatedDay.date]: updatedDay,
      },
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name || 'Nutricionista',
    };

    setMonthlyMenu(updatedMenu);
    await saveMonthlyMenu(updatedMenu);
    showToast(`Cardápio do dia ${updatedDay.dayNumber} atualizado com sucesso!`);
  };

  // Save recipe
  const handleSaveRecipe = async (savedRecipe: CookingRecipe) => {
    let updatedList: CookingRecipe[];
    const exists = recipes.some((r) => r.id === savedRecipe.id);
    if (exists) {
      updatedList = recipes.map((r) => (r.id === savedRecipe.id ? savedRecipe : r));
    } else {
      updatedList = [...recipes, savedRecipe];
    }

    setRecipes(updatedList);
    await saveCookingRecipes(monthKey, updatedList);
    showToast(`Receita "${savedRecipe.title}" salva com sucesso!`);
  };

  // Delete recipe
  const handleDeleteRecipe = async (recipeId: string) => {
    if (!confirm('Deseja realmente remover esta receita da oficina?')) return;
    const updatedList = recipes.filter((r) => r.id !== recipeId);
    setRecipes(updatedList);
    await saveCookingRecipes(monthKey, updatedList);
    showToast('Receita removida da oficina.');
  };

  // Generate Menu PDF
  const handlePrintMenuPDF = () => {
    try {
      const pdfRes = generateCardapioMensalPDF(monthlyMenu, false);
      setPdfPreview({
        isOpen: true,
        result: pdfRes,
        title: `Cardápio Mensal - ${monthlyMenu.monthName} ${monthlyMenu.year}`,
      });
    } catch (e) {
      console.error('Erro ao gerar PDF do cardápio:', e);
      alert('Erro ao gerar PDF do cardápio. Verifique os dados e tente novamente.');
    }
  };

  // Generate Recipes PDF
  const handlePrintRecipesPDF = () => {
    try {
      const pdfRes = generateReceitasCulinariaPDF(
        monthKey,
        monthlyMenu.monthName,
        selectedYear,
        recipes,
        false
      );
      setPdfPreview({
        isOpen: true,
        result: pdfRes,
        title: `Caderno de Receitas - ${monthlyMenu.monthName} ${selectedYear}`,
      });
    } catch (e) {
      console.error('Erro ao gerar PDF das receitas:', e);
      alert('Erro ao gerar PDF das receitas. Verifique os dados e tente novamente.');
    }
  };

  // Find Today's lunch
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const todayItem = useMemo(() => {
    return monthlyMenu.days[todayStr] || null;
  }, [monthlyMenu, todayStr]);

  // Group days by week (1 to 5)
  const weeksGrouped = useMemo(() => {
    const map: Record<number, MenuItemDay[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    const dayOrder: Record<DayOfWeekMenu, number> = {
      segunda: 0,
      terca: 1,
      quarta: 2,
      quinta: 3,
      sexta: 4,
    };

    Object.values(monthlyMenu.days).forEach((d) => {
      if (d.weekIndex >= 1 && d.weekIndex <= 5) {
        map[d.weekIndex].push(d);
      }
    });

    // Ordenar de segunda a sexta dentro de cada semana
    for (let w = 1; w <= 5; w++) {
      map[w].sort((a, b) => (dayOrder[a.dayOfWeek] ?? 0) - (dayOrder[b.dayOfWeek] ?? 0));
    }

    return map;
  }, [monthlyMenu]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-2.5 px-4 py-3 bg-emerald-600 text-white rounded-xl shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-200" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Hero Header */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl border border-emerald-800/40 relative overflow-hidden">
        {/* Decorative background glows */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <Utensils className="w-8 h-8 text-emerald-400" />
              <span>Cardápio e Culinária</span>
            </h1>
          </div>

          {/* Month Selector & Print Actions */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 bg-black/25 p-1.5 rounded-xl border border-white/10 backdrop-blur-md">
            <div className="flex items-center space-x-1 px-1">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Mês anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-center min-w-[110px] px-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block leading-tight">
                  {monthlyMenu.monthName}
                </span>
                <span className="text-sm font-extrabold text-white leading-tight">{selectedYear}</span>
              </div>
              <button
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Próximo mês"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="h-6 w-[1px] bg-white/15 hidden sm:block" />

            {/* Quick Actions */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrintMenuPDF}
                className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer whitespace-nowrap"
                title="Gerar PDF do Cardápio Mensal A4"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cardápio PDF</span>
              </button>

              <button
                onClick={handlePrintRecipesPDF}
                className="flex items-center space-x-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer whitespace-nowrap"
                title="Gerar Caderno de Receitas da Oficina PDF"
              >
                <ChefHat className="w-3.5 h-3.5" />
                <span>Receitas PDF</span>
              </button>
            </div>
          </div>
        </div>

        {/* Subtabs bar */}
        <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveSubTab('almoco')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'almoco'
                ? 'bg-white text-emerald-950 shadow-lg'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <Utensils className="w-4 h-4" />
            <span>Cardápio do Almoço</span>
          </button>

          <button
            onClick={() => setActiveSubTab('culinaria')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'culinaria'
                ? 'bg-white text-emerald-950 shadow-lg'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <ChefHat className="w-4 h-4" />
            <span>Oficina de Culinária (Receitas)</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-400 text-amber-950 font-extrabold ml-1">
              {recipes.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('nutricionista')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'nutricionista'
                ? 'bg-white text-emerald-950 shadow-lg'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Nutricionista Responsável</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-VIEW 1: CARDÁPIO DO ALMOÇO */}
      {/* ========================================================================= */}
      {activeSubTab === 'almoco' && (
        <div className="space-y-6">
          {/* Banner do Dia de Hoje (se dia letivo) */}
          {todayItem && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500/30 rounded-2xl p-5 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start space-x-4">
                  <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-md">
                    <Utensils className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Prato do Dia • {formatDateBR(todayItem.date)} ({todayItem.dayOfWeek.toUpperCase()})
                      </span>
                      {todayItem.isHoliday && (
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-bold rounded-md">
                          {todayItem.holidayDescription || 'FERIADO'}
                        </span>
                      )}
                    </div>
                    {todayItem.isHoliday ? (
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-1">
                        Hoje não há fornecimento de almoço escolar devido ao recesso/feriado.
                      </p>
                    ) : (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-base font-extrabold text-slate-900 dark:text-white">
                          {todayItem.protein || 'Cardápio Regular'}
                        </span>
                        {todayItem.garnish && (
                          <span className="text-sm text-slate-600 dark:text-slate-300">
                            com <span className="font-semibold">{todayItem.garnish}</span>
                          </span>
                        )}
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          (Base: {todayItem.base?.join(' e ') || 'Arroz e Feijão'} • {todayItem.salad || 'Salada'} • {todayItem.dessert || 'Fruta'})
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {hasEditPermission && (
                  <button
                    onClick={() => setEditingDay(todayItem)}
                    className="flex items-center space-x-1.5 px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar Hoje</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Cabeçalho da Grade Mensal */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>Grade Oficial do Cardápio Escolar</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Nutricionista: {monthlyMenu.nutritionistName} (CRN: {monthlyMenu.crn}) • Refeições balanceadas com Arroz, Feijão, Proteína, Guarnição, Salada e Fruta.
              </p>
            </div>

            {hasEditPermission && (
              <div className="flex items-center space-x-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                <ShieldCheck className="w-4 h-4" />
                <span>Modo de Edição Habilitado para Nutricionista</span>
              </div>
            )}
          </div>

          {/* Grade 5 Semanas x 5 Dias (Segunda a Sexta) */}
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((weekNum) => {
              const daysInWeek = weeksGrouped[weekNum] || [];

              return (
                <div
                  key={`week_${weekNum}`}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm"
                >
                  {/* Cabeçalho da Semana */}
                  <div className="bg-slate-100 dark:bg-slate-800/80 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="px-2.5 py-1 bg-emerald-700 text-white text-xs font-extrabold rounded-lg uppercase tracking-wider">
                        {weekNum}ª Semana
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {daysInWeek.length > 0
                          ? `Dias ${daysInWeek[0]?.dayNumber} a ${daysInWeek[daysInWeek.length - 1]?.dayNumber} de ${monthlyMenu.monthName.toLowerCase()}`
                          : ''}
                      </span>
                    </div>
                  </div>

                  {/* Dias da Semana (Grid de 5 colunas em desktop) */}
                  <div className="grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
                    {daysInWeek.map((day) => {
                      const isToday = day.date === todayStr;

                      return (
                        <div
                          key={day.date}
                          className={`p-3.5 flex flex-col justify-between transition-colors relative group ${
                            day.isHoliday
                              ? 'bg-amber-50/70 dark:bg-amber-950/20'
                              : isToday
                              ? 'bg-emerald-50/60 dark:bg-emerald-950/30'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <div>
                            {/* Cabeçalho do Dia */}
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center space-x-1.5">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  {day.dayOfWeek}
                                </span>
                                <span
                                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black ${
                                    isToday
                                      ? 'bg-emerald-600 text-white'
                                      : day.isHoliday
                                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                                      : 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                                  }`}
                                >
                                  {day.dayNumber}
                                </span>
                              </div>

                              {hasEditPermission && (
                                <button
                                  onClick={() => setEditingDay(day)}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded transition-opacity cursor-pointer"
                                  title="Editar cardápio deste dia"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            {/* Conteúdo do Cardápio */}
                            {day.isHoliday ? (
                              <div className="py-4 text-center">
                                <div className="inline-block px-3 py-1 bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-lg text-xs font-extrabold border border-amber-500/30">
                                  {day.holidayDescription || 'FERIADO'}
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                  Sem almoço escolar
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-1.5 text-xs">
                                {/* Base */}
                                <div className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                                  *{day.base?.join(' e *') || 'Arroz Branco e Feijão'}
                                </div>

                                {/* Proteína (Destaque) */}
                                <div className="font-bold text-slate-900 dark:text-white leading-tight">
                                  {day.protein || 'Cardápio Regular'}
                                </div>

                                {/* Guarnição */}
                                {day.garnish && (
                                  <div className="text-emerald-700 dark:text-emerald-400 font-medium text-[11.5px]">
                                    + {day.garnish}
                                  </div>
                                )}

                                {/* Salada e Fruta */}
                                <div className="text-slate-600 dark:text-slate-400 text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800/80">
                                  {day.salad || 'Salada'} • {day.dessert || 'Fruta'}
                                </div>

                                {day.specialNotes && (
                                  <div className="text-[10px] text-amber-600 dark:text-amber-400 italic">
                                    Obs: {day.specialNotes}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 2: OFICINA DE CULINÁRIA (RECEITAS) */}
      {/* ========================================================================= */}
      {activeSubTab === 'culinaria' && (
        <div className="space-y-6">
          {/* Header & Caderno Information */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-500/30">
                <ChefHat className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Oficina de Culinária Infantil & Desenvolvimento Pedagógico
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
                  Aulas práticas ministradas às <span className="font-semibold text-amber-600 dark:text-amber-400">Quintas e Sextas-feiras</span> com foco no contato com alimentos saudáveis, noções matemáticas (medidas), trabalho em equipe e autonomia das crianças.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handlePrintRecipesPDF}
                className="flex items-center space-x-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Caderno de Receitas</span>
              </button>

              {hasEditPermission && (
                <button
                  onClick={() => {
                    setEditingRecipe(null);
                    setIsNewRecipeModalOpen(true);
                  }}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar Receita</span>
                </button>
              )}
            </div>
          </div>

          {/* Cards de Receitas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recipes.map((recipe, index) => (
              <div
                key={recipe.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Card Header */}
                  <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-1 bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] font-extrabold rounded-lg uppercase tracking-wider border border-amber-500/30">
                          {recipe.weekLabel}
                        </span>
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                          {recipe.datesLabel}
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-slate-900 dark:text-white mt-2">
                        {recipe.title}
                      </h3>
                      <div className="flex items-center space-x-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {recipe.prepTime && (
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{recipe.prepTime}</span>
                          </span>
                        )}
                        {recipe.servings && (
                          <span className="flex items-center space-x-1">
                            <Utensils className="w-3.5 h-3.5 text-slate-400" />
                            <span>{recipe.servings}</span>
                          </span>
                        )}
                        <span className="capitalize px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-[10px] font-bold">
                          {recipe.category}
                        </span>
                      </div>
                    </div>

                    {hasEditPermission && (
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => {
                            setEditingRecipe(recipe);
                            setIsNewRecipeModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Editar receita"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRecipe(recipe.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Excluir receita"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Body: Ingredientes & Modo de Preparo */}
                  <div className="p-5 space-y-5">
                    {/* Ingredientes */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                        <Carrot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Ingredientes Necessários ({recipe.ingredients.length})</span>
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {recipe.ingredients.map((ing, idx) => (
                          <label
                            key={idx}
                            className="flex items-start space-x-2 text-xs text-slate-700 dark:text-slate-300 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 w-3.5 h-3.5 accent-amber-500 rounded cursor-pointer"
                            />
                            <span>{ing}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Modo de Preparo */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                        <Flame className="w-4 h-4 text-amber-500" />
                        <span>Passo a Passo com as Crianças</span>
                      </h4>
                      <ol className="space-y-2 text-xs text-slate-700 dark:text-slate-300 list-decimal list-inside">
                        {recipe.instructions.map((step, sIdx) => (
                          <li key={sIdx} className="leading-relaxed pl-1">
                            <span className="font-normal">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Dica Nutricional / Alergênicos */}
                    {recipe.nutritionalNotes && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start space-x-2">
                        <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Valor Nutricional & Pedagógico: </span>
                          <span>{recipe.nutritionalNotes}</span>
                        </div>
                      </div>
                    )}

                    {recipe.allergens && recipe.allergens.length > 0 && (
                      <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                        <span>Atenção a Alergias: Contém {recipe.allergens.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer do Card */}
                <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>Oficina de Culinária Crescer</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Nutrição Infantil</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 3: NUTRICIONISTA RESPONSÁVEL */}
      {/* ========================================================================= */}
      {activeSubTab === 'nutricionista' && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-xl shadow-lg shadow-emerald-900/20 flex-shrink-0">
                <UserCheck className="w-8 h-8" />
              </div>
              <div className="flex-1 w-full space-y-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Nome da Responsável Técnica (Editável)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingNutritionistName}
                      onChange={(e) => setEditingNutritionistName(e.target.value)}
                      placeholder="Nome completo da nutricionista"
                      className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-base font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <button
                      onClick={handleSaveNutritionistName}
                      disabled={isSavingNutri || !editingNutritionistName.trim() || editingNutritionistName.trim() === monthlyMenu.nutritionistName}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl shadow transition-all cursor-pointer whitespace-nowrap"
                    >
                      {isSavingNutri ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>

                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  Nutricionista - CRN: 84367
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Dia do Cardápio */}
      <EditDayModal
        isOpen={!!editingDay}
        day={editingDay}
        onClose={() => setEditingDay(null)}
        onSave={handleSaveDay}
      />

      {/* Modal: Adicionar/Editar Receita da Oficina */}
      <EditRecipeModal
        isOpen={isNewRecipeModalOpen}
        recipe={editingRecipe}
        monthKey={monthKey}
        onClose={() => {
          setIsNewRecipeModalOpen(false);
          setEditingRecipe(null);
        }}
        onSave={handleSaveRecipe}
      />

      {/* Modal: Visualizador de PDF */}
      {pdfPreview.isOpen && pdfPreview.result && (
        <PdfViewerModal
          isOpen={pdfPreview.isOpen}
          onClose={() => setPdfPreview({ isOpen: false, result: null, title: '' })}
          doc={pdfPreview.result.doc}
          blob={pdfPreview.result.blob}
          blobUrl={pdfPreview.result.blobUrl}
          dataUrl={pdfPreview.result.dataUrl}
          dataUri={pdfPreview.result.dataUri}
          filename={pdfPreview.result.filename}
          title={pdfPreview.title}
          onDownload={pdfPreview.result.download}
        />
      )}
    </div>
  );
};
