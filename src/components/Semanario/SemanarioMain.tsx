import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Printer,
  Sparkles,
  Search,
  CheckCircle2,
  Clock,
  RefreshCw,
  Layers,
  GraduationCap,
  FileDown,
  AlertCircle,
  Users,
  X,
  ArrowLeft,
  ChevronRight as ChevronRightIcon,
  Tag,
  CheckCheck,
  FolderTree,
  CalendarDays,
  Zap,
} from 'lucide-react';
import { ActivityItem, DayOfWeek, ScheduleBlock, SemanarioPlan, SemanarioStatus, TurmaType, UserProfile, WeekInfo } from '../../types';
import { SemanarioCard } from './SemanarioCard';
import { SemanarioModal } from './SemanarioModal';
import {
  getCategoriesForTurma,
  getScheduleBlocksForTurma,
  generateCuratedProposal,
  generateCurriculumForTurmasAndWeek,
  getAllCategoriesAlphabetical,
  getCategoryBadgeStyle,
  cleanupInvalidTurmaPlans,
} from '../../utils/semanarioUtils';
import { sortTurmasPedagogical, getTurmaPedagogicalWeight } from '../../utils/turmaUtils';
import { getISOWeekNumber, getWeekInfo, getWeekDays } from '../../utils/dateUtils';
import { generateSemanarioPDFReport } from '../../utils/pdfGenerator';

/**
 * Extrai o horário de início (horaInicio) de um timeSlot como '11:20 - 11:30' ou '07:30'
 * Retorna string normalizada para ordenação como '07:30', '11:20', etc.
 */
function extractStartTime(timeSlot?: string): string {
  if (!timeSlot) return '99:99';
  const match = timeSlot.match(/(\d{1,2}:\d{2})/);
  if (match) {
    return match[1].padStart(5, '0');
  }
  return timeSlot.trim();
}

interface SemanarioMainProps {
  plans: SemanarioPlan[];
  turmas: TurmaType[];
  users: UserProfile[];
  currentUser: UserProfile | null;
  currentWeek: WeekInfo;
  activitiesList?: ActivityItem[];
  schedules?: ScheduleBlock[];
  onSavePlan: (plan: SemanarioPlan) => void;
  onDeletePlan: (planId: string) => void;
  onBatchSavePlans: (plans: SemanarioPlan[]) => void;
  onSelectWeek?: (week: WeekInfo) => void;
  onAddTurma?: (newTurmaName: string) => boolean;
}

const DAYS_OF_WEEK_CONFIG: Array<{ id: DayOfWeek; label: string; short: string }> = [
  { id: 'segunda', label: 'Segunda-feira', short: 'Seg' },
  { id: 'terca', label: 'Terça-feira', short: 'Ter' },
  { id: 'quarta', label: 'Quarta-feira', short: 'Qua' },
  { id: 'quinta', label: 'Quinta-feira', short: 'Qui' },
  { id: 'sexta', label: 'Sexta-feira', short: 'Sex' },
];

/**
 * Retorna o segmento pedagógico e estilo de badge para uma turma
 */
function getTurmaStageInfo(turmaName: string): { label: string; color: string; bg: string; border: string } {
  const weight = getTurmaPedagogicalWeight(turmaName);
  if (weight < 100) {
    return {
      label: 'Educação Infantil',
      color: 'text-amber-700',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
    };
  }
  if (weight < 160) {
    return {
      label: 'Ensino Fundamental I',
      color: 'text-blue-700',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
    };
  }
  return {
    label: 'Ensino Fundamental II',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
  };
}

export const SemanarioMain: React.FC<SemanarioMainProps> = ({
  plans,
  turmas,
  users,
  currentUser,
  currentWeek,
  activitiesList,
  schedules,
  onSavePlan,
  onDeletePlan,
  onBatchSavePlans,
  onSelectWeek,
  onAddTurma,
}) => {
  // Sort official turmas pedagogically
  const sortedTurmas = useMemo(() => sortTurmasPedagogical(turmas), [turmas]);

  // Determines current active day of week (Monday to Friday, or Monday if on weekend)
  const getInitialDayOfWeek = (): DayOfWeek => {
    const dayNum = new Date().getDay(); // 0 is Sun, 1 is Mon, 5 is Fri, 6 is Sat
    const map: Record<number, DayOfWeek> = {
      1: 'segunda',
      2: 'terca',
      3: 'quarta',
      4: 'quinta',
      5: 'sexta',
    };
    return map[dayNum] || 'segunda';
  };

  // Navigation State: null = Overview of all turmas; string = Selected Turma Detailed View
  const [activeTurma, setActiveTurma] = useState<string | null>(null);

  // Filters State - strictly single day selection from Segunda to Sexta
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(() => getInitialDayOfWeek());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [overviewSearchTerm, setOverviewSearchTerm] = useState<string>('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingPlan, setEditingPlan] = useState<Partial<SemanarioPlan> | null>(null);
  const [defaultDayForModal, setDefaultDayForModal] = useState<DayOfWeek>('segunda');
  const [defaultCategoryForModal, setDefaultCategoryForModal] = useState<string | undefined>(undefined);

  // Add Turma Modal State
  const [isAddTurmaModalOpen, setIsAddTurmaModalOpen] = useState<boolean>(false);
  const [newTurmaName, setNewTurmaName] = useState<string>('');
  const [addTurmaError, setAddTurmaError] = useState<string | null>(null);
  const [addTurmaSuccess, setAddTurmaSuccess] = useState<string | null>(null);

  // AI Batch Generation Modal / Loading State
  const [isGeneratingBatchAI, setIsGeneratingBatchAI] = useState<boolean>(false);

  // Add Turma Handler
  const handleAddTurmaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTurmaName.trim();
    if (!trimmed) {
      setAddTurmaError('Digite o nome da turma.');
      return;
    }
    if (turmas.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setAddTurmaError('Já existe uma turma cadastrada com este nome.');
      return;
    }
    if (onAddTurma) {
      const ok = onAddTurma(trimmed);
      if (ok) {
        setAddTurmaSuccess(`Turma "${trimmed}" cadastrada com sucesso!`);
        setTimeout(() => {
          setIsAddTurmaModalOpen(false);
          setNewTurmaName('');
          setAddTurmaSuccess(null);
          setAddTurmaError(null);
        }, 1000);
      } else {
        setAddTurmaError('Não foi possível cadastrar a turma.');
      }
    } else {
      setIsAddTurmaModalOpen(false);
      setNewTurmaName('');
    }
  };

  // Week Navigation
  const handlePrevWeek = () => {
    let prevWeekNo = currentWeek.weekNumber - 1;
    let year = currentWeek.year;
    if (prevWeekNo < 1) {
      prevWeekNo = 52;
      year -= 1;
    }
    const newWeek = getWeekInfo(year, prevWeekNo);
    if (onSelectWeek) onSelectWeek(newWeek);
  };

  const handleNextWeek = () => {
    let nextWeekNo = currentWeek.weekNumber + 1;
    let year = currentWeek.year;
    if (nextWeekNo > 52) {
      nextWeekNo = 1;
      year += 1;
    }
    const newWeek = getWeekInfo(year, nextWeekNo);
    if (onSelectWeek) onSelectWeek(newWeek);
  };

  const handleCurrentWeek = () => {
    const today = new Date();
    const iso = getISOWeekNumber(today);
    const newWeek = getWeekInfo(iso.year, iso.weekNumber);
    if (onSelectWeek) onSelectWeek(newWeek);
  };

  // Filtered Plans for Current Week (Sanitized against official schedule)
  const weekPlans = useMemo(() => {
    const raw = plans.filter(
      (p) => p.weekNumber === currentWeek.weekNumber && p.year === currentWeek.year
    );
    return cleanupInvalidTurmaPlans(raw, schedules);
  }, [plans, currentWeek, schedules]);

  // General KPI Metrics for Current Week
  const metrics = useMemo(() => {
    const total = weekPlans.length;
    const realizadas = weekPlans.filter((p) => p.status === 'realizada').length;
    const pendentes = weekPlans.filter((p) => p.status === 'pendente').length;
    const substituidas = weekPlans.filter((p) => p.status === 'substituida').length;
    const taxaRealizacao = total > 0 ? Math.round((realizadas / total) * 100) : 0;

    return { total, realizadas, pendentes, substituidas, taxaRealizacao };
  }, [weekPlans]);

  // Plans of the selected Turma (when in detailed view)
  const activeTurmaPlans = useMemo(() => {
    if (!activeTurma) return [];
    return weekPlans.filter((p) => p.turma === activeTurma);
  }, [weekPlans, activeTurma]);

  // Vínculo Estrito com a Grade Horária Oficial da Turma no Dia Selecionado:
  // Carrega todas as atividades previstas na matriz curricular da turma para o dia ativo (do acolhimento à saída),
  // garantindo horários oficiais de início/fim e status padrão [⏳ Pendente] para itens não preenchidos,
  // além de incorporar quaisquer propostas personalizadas salvas para o dia sem omissões.
  const activeTurmaDaySchedulePlans = useMemo(() => {
    if (!activeTurma) return [];

    // Blocos oficiais da Grade Horária para a turma e o dia selecionado (ordenados por horário)
    const officialBlocks = getScheduleBlocksForTurma(activeTurma, selectedDay, schedules);
    const weekDays = getWeekDays(currentWeek.startDate);
    const dayIndex = DAYS_OF_WEEK_CONFIG.findIndex((d) => d.id === selectedDay);
    const dayDate = weekDays[dayIndex >= 0 ? dayIndex : 0]?.dateStr || currentWeek.startDate;

    const usedExistingPlanIds = new Set<string>();

    const officialMappedPlans = officialBlocks.map((block) => {
      const officialTimeSlot = `${block.startTime} - ${block.endTime}`;
      const safeTurmaId = activeTurma.replace(/\s+/g, '_').toLowerCase();
      const safeCatId = (block.activityId || '').replace(/\s+/g, '_').toLowerCase();
      const safeTime = (block.startTime || '').replace(':', '');

      // Procura plano já salvo que coincida com o horário, id gerado ou categoria
      const existingPlan = activeTurmaPlans.find((p) => {
        if (p.dayOfWeek !== selectedDay || usedExistingPlanIds.has(p.id)) return false;
        if (p.timeSlot && p.timeSlot.trim() === officialTimeSlot.trim()) return true;
        if (p.id && (p.id.includes(block.id) || (p.id.includes(safeCatId) && p.id.includes(safeTime)))) return true;
        return (p.category || '').toLowerCase().trim() === (block.activityId || '').toLowerCase().trim();
      });

      if (existingPlan) {
        usedExistingPlanIds.add(existingPlan.id);
        return {
          ...existingPlan,
          timeSlot: existingPlan.timeSlot || officialTimeSlot,
          status: existingPlan.status || 'pendente',
        };
      }

      // Se ainda não foi detalhado pela equipe, gera proposta com status padrão [⏳ Pendente]
      const curated = generateCuratedProposal(activeTurma, block.activityId);

      const newPlan: SemanarioPlan = {
        id: `plan_sched_${safeTurmaId}_${selectedDay}_${safeCatId}_${safeTime}_w${currentWeek.weekNumber}_${currentWeek.year}`,
        turma: activeTurma as TurmaType,
        weekNumber: currentWeek.weekNumber,
        year: currentWeek.year,
        date: dayDate,
        dayOfWeek: selectedDay,
        timeSlot: officialTimeSlot,
        category: block.activityId,
        title: curated.title,
        objectives: curated.objectives,
        development: curated.development,
        materials: curated.materials,
        teacherName: 'Aguardando preenchimento',
        status: 'pendente',
        photos: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: 'Coordenação Pedagógica',
      };

      return newPlan;
    });

    // Planos adicionais cadastrados pelo usuário para o dia que não coincidem com os blocos oficiais
    const extraPlans = activeTurmaPlans.filter(
      (p) => p.dayOfWeek === selectedDay && !usedExistingPlanIds.has(p.id)
    );

    return [...officialMappedPlans, ...extraPlans];
  }, [activeTurma, selectedDay, schedules, activeTurmaPlans, currentWeek]);

  // Filtered and Chronologically Sorted Plans inside selected Turma and selected Day
  const filteredActiveTurmaPlans = useMemo(() => {
    if (!activeTurma) return [];
    const list = activeTurmaDaySchedulePlans.filter((p) => {
      if (selectedCategory !== 'all' && p.category.toLowerCase() !== selectedCategory.toLowerCase()) return false;
      if (selectedStatus !== 'all' && p.status !== selectedStatus) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchTitle = (p.title || '').toLowerCase().includes(query);
        const matchCategory = (p.category || '').toLowerCase().includes(query);
        const matchTurma = (p.turma || '').toLowerCase().includes(query);
        const matchTheme = (p.weekTheme || '').toLowerCase().includes(query);
        const matchAdi = (p.adiResponsible || '').toLowerCase().includes(query);
        const matchMonitors = (p.monitors || '').toLowerCase().includes(query);
        const matchObjectives = (p.objectives || '').toLowerCase().includes(query);
        const matchDevelopment = (p.development || '').toLowerCase().includes(query);
        const matchTeacher = (p.teacherName || '').toLowerCase().includes(query);
        const matchMaterials = (p.materials || '').toLowerCase().includes(query);
        const matchTime = (p.timeSlot || '').toLowerCase().includes(query);
        if (
          !matchTitle &&
          !matchCategory &&
          !matchTurma &&
          !matchTheme &&
          !matchAdi &&
          !matchMonitors &&
          !matchObjectives &&
          !matchDevelopment &&
          !matchTeacher &&
          !matchMaterials &&
          !matchTime
        ) {
          return false;
        }
      }

      return true;
    });

    // Ordenação estritamente cronológica pelo horário de início (horaInicio) em ordem crescente
    return [...list].sort((a, b) => {
      const timeA = extractStartTime(a.timeSlot);
      const timeB = extractStartTime(b.timeSlot);
      const timeCompare = timeA.localeCompare(timeB);
      if (timeCompare !== 0) return timeCompare;
      return (a.category || '').localeCompare(b.category || '', 'pt-BR');
    });
  }, [activeTurmaDaySchedulePlans, activeTurma, selectedCategory, selectedStatus, searchTerm]);

  // Allowed categories for active turma - strictly from official Grade Horária for selected day
  const activeTurmaDayCategories = useMemo(() => {
    if (!activeTurma) return [];
    const cats = Array.from(new Set(activeTurmaDaySchedulePlans.map((p) => p.category)));
    return cats.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [activeTurma, activeTurmaDaySchedulePlans]);

  // Allowed categories for active turma across the whole week (for filter options)
  const activeTurmaAllowedCategories = useMemo(() => {
    if (!activeTurma) return [];
    return getCategoriesForTurma(activeTurma, schedules, activitiesList);
  }, [activeTurma, schedules, activitiesList]);

  // Handlers for Plan CRUD
  const handleCreateNewPlan = (day?: DayOfWeek, category?: string, prefillTurma?: string) => {
    const targetTurma = prefillTurma || activeTurma || sortedTurmas[0] || '1º Ano Azul';
    setEditingPlan({
      turma: targetTurma as TurmaType,
      category: category || undefined,
    });
    setDefaultDayForModal(day || selectedDay);
    setDefaultCategoryForModal(category);
    setIsModalOpen(true);
  };

  const handleEditPlan = (plan: SemanarioPlan) => {
    setEditingPlan(plan);
    setDefaultDayForModal(plan.dayOfWeek);
    setDefaultCategoryForModal(plan.category);
    setIsModalOpen(true);
  };

  const handleDuplicatePlan = (plan: SemanarioPlan) => {
    const duplicated: SemanarioPlan = {
      ...plan,
      id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: `${plan.title} (Cópia)`,
      status: 'pendente',
      photos: undefined,
      substitutionReason: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSavePlan(duplicated);
  };

  const handleStatusChange = (planId: string, newStatus: SemanarioStatus, reason?: string) => {
    const target = plans.find((p) => p.id === planId);
    if (!target) return;
    const updated: SemanarioPlan = {
      ...target,
      status: newStatus,
      substitutionReason: newStatus === 'substituida' ? reason || target.substitutionReason : undefined,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name,
    };
    onSavePlan(updated);
  };

  const handleRegenerateWithAI = (plan: SemanarioPlan) => {
    setEditingPlan(plan);
    setIsModalOpen(true);
  };

  // Batch AI Generator: Automatically fills official schedule slots with rich pedagogical proposals
  const handleBatchGenerateAIWeek = (turmaOverride?: string) => {
    const targetTurma = turmaOverride || activeTurma || sortedTurmas[0] || '1º Ano Azul';
    const confirmMsg = `Deseja gerar automaticamente sugestões pedagógicas com IA para a grade horária oficial da turma "${targetTurma}" na ${currentWeek.label}?`;
    if (!window.confirm(confirmMsg)) return;

    setIsGeneratingBatchAI(true);

    const weekDays = getWeekDays(currentWeek.startDate);
    const newBatchPlans: SemanarioPlan[] = [];

    DAYS_OF_WEEK_CONFIG.forEach((day, dayIndex) => {
      const dayDate = weekDays[dayIndex]?.dateStr || currentWeek.startDate;
      const scheduledBlocks = getScheduleBlocksForTurma(targetTurma, day.id, schedules);

      scheduledBlocks.forEach((block, bIdx) => {
        const prop = generateCuratedProposal(targetTurma, block.activityId);
        newBatchPlans.push({
          id: `plan_ai_${Date.now()}_${day.id}_${bIdx}_${block.activityId.replace(/\s+/g, '_').toLowerCase()}`,
          turma: targetTurma,
          weekNumber: currentWeek.weekNumber,
          year: currentWeek.year,
          date: dayDate,
          dayOfWeek: day.id,
          timeSlot: `${block.startTime} - ${block.endTime}`,
          category: block.activityId,
          title: prop.title,
          objectives: prop.objectives,
          development: prop.development,
          materials: prop.materials,
          teacherName: currentUser?.name || 'Monitora / ADI do Integral',
          status: 'pendente',
          createdAt: new Date().toISOString(),
        });
      });
    });

    onBatchSavePlans(newBatchPlans);
    setTimeout(() => {
      setIsGeneratingBatchAI(false);
    }, 500);
  };

  // Handler to populate all official turmas
  const handlePopulateAllTurmasWeek = () => {
    setIsGeneratingBatchAI(true);
    const generated = generateCurriculumForTurmasAndWeek(sortedTurmas, currentWeek, schedules, activitiesList);
    onBatchSavePlans(generated);
    setTimeout(() => {
      setIsGeneratingBatchAI(false);
    }, 400);
  };

  // Handler to populate a single turma
  const handlePopulateSingleTurmaWeek = (turmaName: string) => {
    const target = turmaName || activeTurma || sortedTurmas[0];
    const generated = generateCurriculumForTurmasAndWeek([target], currentWeek, schedules, activitiesList);
    onBatchSavePlans(generated);
  };

  // PDF Export
  const handleExportPDF = (turmaFilter?: string) => {
    const plansToExport = turmaFilter
      ? weekPlans.filter((p) => p.turma === turmaFilter)
      : activeTurma
      ? filteredActiveTurmaPlans
      : weekPlans;

    generateSemanarioPDFReport(
      plansToExport,
      currentWeek,
      turmaFilter || activeTurma || 'all',
      selectedDay,
      currentUser,
      true
    );
  };

  // Print
  const handlePrint = () => {
    window.print();
  };

  // All active categories list for filter dropdown (sorted alphabetically)
  const filterCategories = useMemo(() => {
    return getAllCategoriesAlphabetical(activitiesList);
  }, [activitiesList]);

  // Turmas filtered by overview search term
  const displayedTurmas = useMemo(() => {
    if (!overviewSearchTerm.trim()) return sortedTurmas;
    const q = overviewSearchTerm.toLowerCase();
    return sortedTurmas.filter((t) => t.toLowerCase().includes(q));
  }, [sortedTurmas, overviewSearchTerm]);

  return (
    <div className="space-y-6">
      {/* Top Banner / Navigation & Actions */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -top-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center space-x-2.5 mb-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Semanário Pedagógico
              </span>
              {activeTurma && (
                <span className="text-[11px] font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">
                  {activeTurma}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <span>Registro de Atividades</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              {activeTurma
                ? `Planejamento e acompanhamento das atividades da Turma ${activeTurma}`
                : 'Selecione uma turma para visualizar e gerenciar o planejamento semanal'}
            </p>
          </div>

          {/* Quick Actions in Banner */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {activeTurma ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTurma(null)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-extrabold shadow-sm transition-all flex items-center space-x-2 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-amber-400" />
                  <span>Voltar para Turmas</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCreateNewPlan()}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-extrabold shadow-lg transition-all flex items-center space-x-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nova Proposta</span>
                </button>

                <button
                  type="button"
                  disabled={isGeneratingBatchAI}
                  onClick={() => handlePopulateSingleTurmaWeek(activeTurma)}
                  className="px-3.5 py-2.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                  title="Gerar/Restaurar todas as atividades padrão desta turma"
                >
                  <Zap className="w-4 h-4 text-amber-300" />
                  <span>Preencher Grade</span>
                </button>

                <button
                  type="button"
                  disabled={isGeneratingBatchAI}
                  onClick={() => handleBatchGenerateAIWeek(activeTurma)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-extrabold shadow-lg transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                  title="Gerar Propostas da Semana com IA para esta turma"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>{isGeneratingBatchAI ? 'Gerando...' : 'Semana com IA'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportPDF(activeTurma)}
                  className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                  title="Exportar PDF desta Turma"
                >
                  <FileDown className="w-4 h-4 text-indigo-400" />
                  <span>PDF da Turma</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAddTurmaError(null);
                    setAddTurmaSuccess(null);
                    setNewTurmaName('');
                    setIsAddTurmaModalOpen(true);
                  }}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold shadow-lg transition-all flex items-center space-x-2 cursor-pointer"
                  title="Cadastrar Nova Turma"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nova Turma</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCreateNewPlan()}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-extrabold shadow-lg transition-all flex items-center space-x-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nova Proposta</span>
                </button>

                <button
                  type="button"
                  disabled={isGeneratingBatchAI}
                  onClick={handlePopulateAllTurmasWeek}
                  className="px-3.5 py-2.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                  title="Povoar grade oficial completa de todas as turmas"
                >
                  <Zap className="w-4 h-4 text-amber-300" />
                  <span>Povoar Todas Turmas</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportPDF()}
                  className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                  title="Exportar PDF Institucional Oficial de Todas as Turmas"
                >
                  <FileDown className="w-4 h-4 text-indigo-400" />
                  <span>PDF Geral</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
              title="Imprimir visualização"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Week Navigator Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrevWeek}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors cursor-pointer"
              title="Semana Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="px-4 py-1.5 bg-slate-800 border border-slate-700 rounded-xl flex items-center space-x-2 text-xs font-bold text-white">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>{currentWeek.label}</span>
            </div>

            <button
              type="button"
              onClick={handleNextWeek}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors cursor-pointer"
              title="Próxima Semana"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleCurrentWeek}
              className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Semana Atual
            </button>
          </div>

          {/* Quick KPI stats in header */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            <div className="flex items-center space-x-1.5 px-3 py-1 bg-slate-800/80 rounded-xl border border-slate-700">
              <span className="text-slate-400">Total Lançadas:</span>
              <span className="font-extrabold text-white">{metrics.total}</span>
            </div>
            <div className="flex items-center space-x-1.5 px-3 py-1 bg-emerald-950/60 text-emerald-400 rounded-xl border border-emerald-800/60">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="font-bold">{metrics.realizadas} Realizadas</span>
            </div>
            <div className="flex items-center space-x-1.5 px-3 py-1 bg-amber-950/60 text-amber-400 rounded-xl border border-amber-800/60">
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="font-bold">{metrics.substituidas} Subst.</span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          NÍVEL 1: VISÃO INICIAL (PAINEL GERAL DE TURMAS)
          ========================================================================= */}
      {!activeTurma && (
        <div className="space-y-6">
          {/* Subheader & Search for Classes */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 leading-tight">
                  Painel de Turmas Oficiais
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {sortedTurmas.length} turmas ativas • Clique em uma turma para abrir seus registros
                </p>
              </div>
            </div>

            {/* Turma Search */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={overviewSearchTerm}
                onChange={(e) => setOverviewSearchTerm(e.target.value)}
                placeholder="Filtrar turmas por nome..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
          </div>

          {/* Grid of Class Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {displayedTurmas.map((t) => {
              const turmaPlans = weekPlans.filter((p) => p.turma === t);
              const allowedCategories = getCategoriesForTurma(t, schedules, activitiesList);
              const scheduledBlocks = getScheduleBlocksForTurma(t, undefined, schedules);
              const totalExpected = scheduledBlocks.length > 0 ? scheduledBlocks.length : allowedCategories.length || 10;
              const launchedCount = turmaPlans.length;
              const realizadasCount = turmaPlans.filter((p) => p.status === 'realizada').length;
              const pendentesCount = turmaPlans.filter((p) => p.status === 'pendente').length;
              const substituidasCount = turmaPlans.filter((p) => p.status === 'substituida').length;

              // Distinct categories launched
              const distinctCategoriesLaunched = Array.from(new Set(turmaPlans.map((p) => p.category)));
              const progressPercentage = Math.min(100, Math.round((launchedCount / totalExpected) * 100));

              const stageInfo = getTurmaStageInfo(t);

              return (
                <div
                  key={t}
                  onClick={() => {
                    setActiveTurma(t);
                    setSelectedDay(getInitialDayOfWeek());
                    setSelectedCategory('all');
                    setSelectedStatus('all');
                    setSearchTerm('');
                  }}
                  className="bg-white rounded-3xl border border-slate-200/90 shadow-xs hover:shadow-xl hover:border-indigo-400 transition-all duration-300 flex flex-col justify-between overflow-hidden cursor-pointer group hover:-translate-y-0.5 select-none"
                >
                  {/* Card Header */}
                  <div className="p-5 pb-3">
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <span
                        className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md border ${stageInfo.bg} ${stageInfo.color} ${stageInfo.border}`}
                      >
                        {stageInfo.label}
                      </span>
                      <div className="p-1.5 bg-slate-100 group-hover:bg-indigo-600 group-hover:text-white text-slate-500 rounded-xl transition-colors">
                        <GraduationCap className="w-4 h-4" />
                      </div>
                    </div>

                    <h3 className="text-base font-black text-slate-900 group-hover:text-indigo-900 transition-colors leading-snug">
                      {t}
                    </h3>
                  </div>

                  {/* Progress & KPIs Section */}
                  <div className="px-5 py-3 bg-slate-50/70 border-y border-slate-100 space-y-3">
                    {/* Launch Ratio and Percentage */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-slate-700 tracking-wide text-[11px] uppercase">
                        {launchedCount}/{totalExpected} ATIVIDADES LANÇADAS
                      </span>
                      <span
                        className={`font-black text-xs px-2 py-0.5 rounded-full ${
                          progressPercentage === 100
                            ? 'bg-emerald-100 text-emerald-800'
                            : progressPercentage > 50
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {progressPercentage}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          progressPercentage === 100
                            ? 'bg-emerald-500'
                            : progressPercentage > 50
                            ? 'bg-indigo-600'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.max(5, progressPercentage)}%` }}
                      />
                    </div>

                    {/* Status Counters */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1 text-center">
                      <div className="p-1.5 bg-emerald-50 border border-emerald-200/60 rounded-xl">
                        <div className="text-[10px] font-bold text-emerald-700">Realizadas</div>
                        <div className="text-xs font-black text-emerald-900">{realizadasCount}</div>
                      </div>
                      <div className="p-1.5 bg-slate-100 border border-slate-200 rounded-xl">
                        <div className="text-[10px] font-bold text-slate-600">Pendentes</div>
                        <div className="text-xs font-black text-slate-800">{pendentesCount}</div>
                      </div>
                      <div className="p-1.5 bg-amber-50 border border-amber-200/60 rounded-xl">
                        <div className="text-[10px] font-bold text-amber-700">Subst.</div>
                        <div className="text-xs font-black text-amber-900">{substituidasCount}</div>
                      </div>
                    </div>
                  </div>

                  {/* Categories Breakdown */}
                  <div className="p-5 pt-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                      <span className="flex items-center space-x-1">
                        <Tag className="w-3 h-3 text-slate-400" />
                        <span>Categorias Preenchidas</span>
                      </span>
                      <span className="text-slate-700 font-extrabold">
                        {distinctCategoriesLaunched.length} / {allowedCategories.length}
                      </span>
                    </div>

                    {/* Category preview pills */}
                    <div className="flex flex-wrap gap-1">
                      {allowedCategories.slice(0, 4).map((cat) => {
                        const isFilled = distinctCategoriesLaunched.includes(cat);
                        return (
                          <span
                            key={cat}
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border truncate max-w-[120px] ${
                              isFilled
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-slate-50 text-slate-400 border-slate-200 opacity-60'
                            }`}
                          >
                            {cat}
                          </span>
                        );
                      })}
                      {allowedCategories.length > 4 && (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                          +{allowedCategories.length - 4}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Action Footer */}
                  <div className="p-4 pt-2 border-t border-slate-100 bg-white">
                    <div className="w-full py-2 px-3 bg-slate-50 group-hover:bg-indigo-600 group-hover:text-white text-indigo-700 rounded-xl text-xs font-extrabold flex items-center justify-between transition-colors shadow-xs">
                      <span>Ver Atividades da Turma</span>
                      <ChevronRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          NÍVEL 2: VISÃO DA TURMA SELECIONADA
          ========================================================================= */}
      {activeTurma && (
        <div className="space-y-6">
          {/* Detailed Turma Top Bar with Back Button & Switcher */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              <button
                type="button"
                onClick={() => setActiveTurma(null)}
                className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl transition-all cursor-pointer flex items-center space-x-1.5 shrink-0 shadow-xs active:scale-95"
                title="Voltar para a lista de todas as turmas"
              >
                <ArrowLeft className="w-4 h-4 text-slate-800" />
                <span className="text-xs font-black pr-1">Voltar para Turmas</span>
              </button>

              <div className="h-7 w-[1px] bg-slate-200 hidden sm:block" />

              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                    Turma: {activeTurma}
                  </h2>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${getTurmaStageInfo(activeTurma).bg} ${getTurmaStageInfo(activeTurma).color} ${getTurmaStageInfo(activeTurma).border}`}
                  >
                    {getTurmaStageInfo(activeTurma).label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {activeTurmaPlans.length} propostas cadastradas nesta semana •{' '}
                  {activeTurmaPlans.filter((p) => p.status === 'realizada').length} realizadas
                </p>
              </div>
            </div>

            {/* Turma Switcher */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Quick Select another turma */}
              <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                <span className="text-xs font-bold text-slate-500">Turma:</span>
                <select
                  value={activeTurma}
                  onChange={(e) => setActiveTurma(e.target.value)}
                  className="bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none cursor-pointer"
                >
                  {sortedTurmas.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Filter and Search Bar for the active Turma */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex flex-col lg:flex-row items-center gap-3">
              {/* Search Box */}
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar nesta turma por atividade, horário..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Selectors */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full lg:w-auto">
                {/* Day Selector */}
                <div>
                  <select
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(e.target.value as DayOfWeek)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer"
                  >
                    {DAYS_OF_WEEK_CONFIG.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category Selector */}
                <div>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer"
                  >
                    <option value="all">Todas as Categorias</option>
                    {activeTurmaAllowedCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Selector */}
                <div>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer"
                  >
                    <option value="all">Todos os Status</option>
                    <option value="realizada">Realizada</option>
                    <option value="pendente">⏳ Pendente</option>
                    <option value="substituida">Substituída</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Day Filter Pills - Strictly Segunda a Sexta */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 border-t border-slate-100">
              {DAYS_OF_WEEK_CONFIG.map((d) => {
                const dayBlocks = getScheduleBlocksForTurma(activeTurma, d.id, schedules);
                const countForDay = dayBlocks.length;
                const isSelected = selectedDay === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDay(d.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-2 ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 font-black shadow-xs ring-2 ring-amber-400/50'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>{d.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                        isSelected ? 'bg-slate-950 text-white' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {countForDay} {countForDay === 1 ? 'atividade' : 'atividades'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* =========================================================================
              EXIBIÇÃO DOS REGISTROS DE ATIVIDADES DA TURMA (ORDEM CRONOLÓGICA)
              ========================================================================= */}
          {filteredActiveTurmaPlans.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4 text-amber-600">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 mb-1">
                Nenhuma atividade encontrada para {DAYS_OF_WEEK_CONFIG.find((d) => d.id === selectedDay)?.label} na turma {activeTurma}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
                Cadastre novas atividades para este dia ou preencha a grade horária oficial da turma.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => handlePopulateSingleTurmaWeek(activeTurma)}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold rounded-xl shadow-md transition-all cursor-pointer flex items-center space-x-2"
                >
                  <Zap className="w-4 h-4" />
                  <span>Preencher Grade Oficial Desta Turma</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCreateNewPlan(selectedDay, undefined, activeTurma)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar Atividade em {DAYS_OF_WEEK_CONFIG.find((d) => d.id === selectedDay)?.short}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header do Dia em Ordem Cronológica */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center space-x-2.5">
                  <div className="w-3 h-3 rounded-full bg-amber-500 ring-4 ring-amber-100" />
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    {DAYS_OF_WEEK_CONFIG.find((d) => d.id === selectedDay)?.label} • Grade Horária (Ordem Cronológica)
                  </h3>
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    {filteredActiveTurmaPlans.length} {filteredActiveTurmaPlans.length === 1 ? 'atividade' : 'atividades'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleCreateNewPlan(selectedDay, undefined, activeTurma)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-all border border-indigo-200/60"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar em {DAYS_OF_WEEK_CONFIG.find((d) => d.id === selectedDay)?.short}</span>
                </button>
              </div>

              {/* Lista dos Cards em Ordem Cronológica */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredActiveTurmaPlans.map((plan) => (
                  <SemanarioCard
                    key={plan.id}
                    plan={plan}
                    onEdit={handleEditPlan}
                    onDelete={onDeletePlan}
                    onDuplicate={handleDuplicatePlan}
                    onStatusChange={handleStatusChange}
                    onRegenerateWithAI={handleRegenerateWithAI}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal for Planning Creation / Edit */}
      <SemanarioModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={onSavePlan}
        onBatchSave={onBatchSavePlans}
        initialPlan={editingPlan}
        turmas={sortedTurmas}
        users={users}
        currentUser={currentUser}
        activitiesList={activitiesList}
        schedules={schedules}
        weekNumber={currentWeek.weekNumber}
        year={currentWeek.year}
        defaultDayOfWeek={defaultDayForModal}
      />

      {/* Modal for Adding New Turma */}
      {isAddTurmaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="px-6 py-5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight">Nova Turma</h3>
                  <p className="text-xs text-emerald-100 font-medium">Cadastre uma nova turma no sistema</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddTurmaModalOpen(false);
                  setNewTurmaName('');
                  setAddTurmaError(null);
                  setAddTurmaSuccess(null);
                }}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTurmaSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Nome da Turma
                </label>
                <input
                  type="text"
                  value={newTurmaName}
                  onChange={(e) => {
                    setNewTurmaName(e.target.value);
                    if (addTurmaError) setAddTurmaError(null);
                  }}
                  placeholder="Ex: Maternal Amarelo, 7º Ano Azul..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  autoFocus
                />
              </div>

              {addTurmaError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-xs font-bold text-rose-700">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{addTurmaError}</span>
                </div>
              )}

              {addTurmaSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2 text-xs font-bold text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                  <span>{addTurmaSuccess}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddTurmaModalOpen(false);
                    setNewTurmaName('');
                    setAddTurmaError(null);
                    setAddTurmaSuccess(null);
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newTurmaName.trim()}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center space-x-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Cadastrar Turma</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
