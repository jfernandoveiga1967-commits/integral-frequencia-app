import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Filter,
  Download,
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
} from 'lucide-react';
import { ActivityItem, DayOfWeek, SemanarioPlan, SemanarioStatus, TurmaType, UserProfile, WeekInfo } from '../../types';
import { SemanarioCard } from './SemanarioCard';
import { SemanarioModal } from './SemanarioModal';
import {
  getCategoriesForTurma,
  generateCuratedProposal,
  getAllCategoriesAlphabetical,
} from '../../utils/semanarioUtils';
import { sortTurmasPedagogical } from '../../utils/turmaUtils';
import { getISOWeekNumber, getWeekInfo } from '../../utils/dateUtils';
import { generateSemanarioPDFReport } from '../../utils/pdfGenerator';

interface SemanarioMainProps {
  plans: SemanarioPlan[];
  turmas: TurmaType[];
  users: UserProfile[];
  currentUser: UserProfile | null;
  currentWeek: WeekInfo;
  activitiesList?: ActivityItem[];
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

export const SemanarioMain: React.FC<SemanarioMainProps> = ({
  plans,
  turmas,
  users,
  currentUser,
  currentWeek,
  activitiesList,
  onSavePlan,
  onDeletePlan,
  onBatchSavePlans,
  onSelectWeek,
  onAddTurma,
}) => {
  // Sort official 13 turmas pedagogically
  const sortedTurmas = useMemo(() => sortTurmasPedagogical(turmas), [turmas]);

  // Filters State
  const [selectedTurma, setSelectedTurma] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingPlan, setEditingPlan] = useState<Partial<SemanarioPlan> | null>(null);
  const [defaultDayForModal, setDefaultDayForModal] = useState<DayOfWeek>('segunda');

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

  // Filtered Plans for Current Week
  const weekPlans = useMemo(() => {
    return plans.filter(
      (p) => p.weekNumber === currentWeek.weekNumber && p.year === currentWeek.year
    );
  }, [plans, currentWeek]);

  // Filtered by UI Selectors
  const filteredPlans = useMemo(() => {
    return weekPlans.filter((p) => {
      if (selectedTurma !== 'all' && p.turma !== selectedTurma) return false;
      if (selectedDay !== 'all' && p.dayOfWeek !== selectedDay) return false;
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (selectedStatus !== 'all' && p.status !== selectedStatus) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchTitle = p.title.toLowerCase().includes(query);
        const matchCategory = p.category.toLowerCase().includes(query);
        const matchTurma = p.turma.toLowerCase().includes(query);
        const matchTheme = (p.weekTheme || '').toLowerCase().includes(query);
        const matchAdi = (p.adiResponsible || '').toLowerCase().includes(query);
        const matchMonitors = (p.monitors || '').toLowerCase().includes(query);
        const matchObjectives = (p.objectives || '').toLowerCase().includes(query);
        const matchDevelopment = (p.development || '').toLowerCase().includes(query);
        const matchTeacher = (p.teacherName || '').toLowerCase().includes(query);
        const matchMaterials = (p.materials || '').toLowerCase().includes(query);
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
          !matchMaterials
        ) {
          return false;
        }
      }

      return true;
    });
  }, [weekPlans, selectedTurma, selectedDay, selectedCategory, selectedStatus, searchTerm]);

  // KPI Metrics
  const metrics = useMemo(() => {
    const total = weekPlans.length;
    const realizadas = weekPlans.filter((p) => p.status === 'realizada').length;
    const pendentes = weekPlans.filter((p) => p.status === 'pendente').length;
    const substituidas = weekPlans.filter((p) => p.status === 'substituida').length;
    const taxaRealizacao = total > 0 ? Math.round((realizadas / total) * 100) : 0;

    return { total, realizadas, pendentes, substituidas, taxaRealizacao };
  }, [weekPlans]);

  // Handlers for Plan CRUD
  const handleCreateNewPlan = (day?: DayOfWeek) => {
    setEditingPlan(null);
    setDefaultDayForModal(day || (selectedDay !== 'all' ? (selectedDay as DayOfWeek) : 'segunda'));
    setIsModalOpen(true);
  };

  const handleEditPlan = (plan: SemanarioPlan) => {
    setEditingPlan(plan);
    setDefaultDayForModal(plan.dayOfWeek);
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

  // Batch AI Generator: Automatically fills empty slots with rich pedagogical proposals
  const handleBatchGenerateAIWeek = () => {
    const targetTurma = selectedTurma !== 'all' ? selectedTurma : sortedTurmas[0] || '1º Ano Azul';
    const confirmMsg = `Deseja gerar automaticamente sugestões pedagógicas com IA para a turma "${targetTurma}" na ${currentWeek.label}?`;
    if (!window.confirm(confirmMsg)) return;

    setIsGeneratingBatchAI(true);

    const categories = getCategoriesForTurma(targetTurma, activitiesList);
    const newBatchPlans: SemanarioPlan[] = [];

    DAYS_OF_WEEK_CONFIG.forEach((day, dayIndex) => {
      // Pick 2 distinct categories for each day
      const cat1 = categories[dayIndex % categories.length];
      const cat2 = categories[(dayIndex + 3) % categories.length];

      const prop1 = generateCuratedProposal(targetTurma, cat1);
      newBatchPlans.push({
        id: `plan_ai_${Date.now()}_${day.id}_1`,
        turma: targetTurma,
        weekNumber: currentWeek.weekNumber,
        year: currentWeek.year,
        date: currentWeek.startDate,
        dayOfWeek: day.id,
        timeSlot: '13:30 - 14:30',
        category: cat1,
        title: prop1.title,
        objectives: prop1.objectives,
        development: prop1.development,
        materials: prop1.materials,
        teacherName: currentUser?.name || 'Monitora Integral',
        status: 'pendente',
        createdAt: new Date().toISOString(),
      });

      const prop2 = generateCuratedProposal(targetTurma, cat2);
      newBatchPlans.push({
        id: `plan_ai_${Date.now()}_${day.id}_2`,
        turma: targetTurma,
        weekNumber: currentWeek.weekNumber,
        year: currentWeek.year,
        date: currentWeek.startDate,
        dayOfWeek: day.id,
        timeSlot: '15:00 - 16:00',
        category: cat2,
        title: prop2.title,
        objectives: prop2.objectives,
        development: prop2.development,
        materials: prop2.materials,
        teacherName: currentUser?.name || 'Monitora Integral',
        status: 'pendente',
        createdAt: new Date().toISOString(),
      });
    });

    onBatchSavePlans(newBatchPlans);
    setTimeout(() => {
      setIsGeneratingBatchAI(false);
    }, 500);
  };

  // PDF Export
  const handleExportPDF = () => {
    generateSemanarioPDFReport(
      filteredPlans,
      currentWeek,
      selectedTurma,
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

  return (
    <div className="space-y-6">
      {/* Top Banner / Breadcrumb & Actions */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -top-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Registro de Atividades
            </h1>
          </div>

          {/* Quick Actions in Banner */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
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
              onClick={handleBatchGenerateAIWeek}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-extrabold shadow-lg transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
              title="Gerar Propostas da Semana com IA (Gemini)"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>{isGeneratingBatchAI ? 'Gerando com IA...' : 'Semana com IA'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportPDF}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
              title="Exportar PDF Institucional Oficial"
            >
              <FileDown className="w-4 h-4 text-indigo-400" />
              <span>PDF Oficial</span>
            </button>

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
          <div className="flex items-center space-x-3 text-xs">
            <div className="flex items-center space-x-1.5 px-3 py-1 bg-slate-800/80 rounded-xl border border-slate-700">
              <span className="text-slate-400">Total:</span>
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

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por título, objetivo, material, monitora..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          {/* Selectors */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto">
            {/* Turma Selector */}
            <div>
              <select
                value={selectedTurma}
                onChange={(e) => setSelectedTurma(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer"
              >
                <option value="all">Todas as 13 Turmas</option>
                {sortedTurmas.map((t) => (
                  <option key={t} value={t}>
                    Turma {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Day Selector */}
            <div>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer"
              >
                <option value="all">Todos os Dias</option>
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
                {filterCategories.map((c) => (
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
                <option value="pendente">Pendente</option>
                <option value="substituida">Substituída</option>
              </select>
            </div>
          </div>
        </div>

        {/* Day Pills Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setSelectedDay('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedDay === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Semana Completa ({weekPlans.length})
          </button>

          {DAYS_OF_WEEK_CONFIG.map((d) => {
            const countForDay = weekPlans.filter((p) => p.dayOfWeek === d.id).length;
            const isSelected = selectedDay === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDay(d.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{d.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {countForDay}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content: Plans Grid */}
      {filteredPlans.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4 text-amber-600">
            <BookOpen className="w-8 h-8" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900 mb-1">
            Nenhuma proposta encontrada para os filtros selecionados
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
            Você pode criar um novo planejamento pedagógico ou gerar automaticamente a semana com inteligência artificial.
          </p>
          <div className="flex items-center justify-center space-x-3">
            <button
              type="button"
              onClick={() => handleCreateNewPlan()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Criar Nova Proposta</span>
            </button>
            <button
              type="button"
              onClick={handleBatchGenerateAIWeek}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer flex items-center space-x-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Gerar Semana com IA</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* When "all" days is selected, group proposals cleanly by day */}
          {selectedDay === 'all' ? (
            DAYS_OF_WEEK_CONFIG.map((d) => {
              const dayPlans = filteredPlans.filter((p) => p.dayOfWeek === d.id);
              if (dayPlans.length === 0) return null;

              return (
                <div key={d.id} className="space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                    <div className="flex items-center space-x-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                      <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                        {d.label}
                      </h3>
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {dayPlans.length} {dayPlans.length === 1 ? 'proposta' : 'propostas'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCreateNewPlan(d.id)}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar em {d.short}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dayPlans.map((plan) => (
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
              );
            })
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPlans.map((plan) => (
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
          )}
        </div>
      )}

      {/* Modal for Planning Creation / Edit */}
      <SemanarioModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={onSavePlan}
        initialPlan={editingPlan}
        turmas={sortedTurmas}
        users={users}
        currentUser={currentUser}
        activitiesList={activitiesList}
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
