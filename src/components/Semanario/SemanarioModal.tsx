import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Clock,
  Layers,
  FileText,
  Upload,
  Trash2,
  Image as ImageIcon,
  AlertTriangle,
  User,
  Calendar,
  Zap,
} from 'lucide-react';
import { ActivityItem, DayOfWeek, SemanarioPlan, SemanarioStatus, TurmaType, UserProfile } from '../../types';
import {
  getCategoriesForTurma,
  generateCuratedProposal,
  isTurmaEligibleForProjeto,
} from '../../utils/semanarioUtils';

interface SemanarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (plan: SemanarioPlan) => void;
  initialPlan?: Partial<SemanarioPlan> | null;
  turmas: TurmaType[];
  users: UserProfile[];
  currentUser?: UserProfile | null;
  activitiesList?: ActivityItem[];
  weekNumber: number;
  year: number;
  defaultDate?: string;
  defaultDayOfWeek?: DayOfWeek;
}

export const SemanarioModal: React.FC<SemanarioModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialPlan,
  turmas,
  users,
  currentUser,
  activitiesList,
  weekNumber,
  year,
  defaultDate,
  defaultDayOfWeek = 'segunda',
}) => {
  // Contextual metadata
  const [turma, setTurma] = useState<TurmaType>(turmas[0] || '1º Ano Azul');
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(defaultDayOfWeek);
  const [timeSlot, setTimeSlot] = useState<string>('13:30 - 14:30');

  // Exact Requested Fields
  // 1. Tema da Semana
  const [weekTheme, setWeekTheme] = useState<string>('');
  // 2. Categoria / Prefixo
  const [category, setCategory] = useState<string>('');
  // 3. Nome da Atividade / Proposta
  const [title, setTitle] = useState<string>('');
  // 4. ADI Responsável
  const [adiResponsible, setAdiResponsible] = useState<string>('');
  // 5. Monitora(s)
  const [monitors, setMonitors] = useState<string>('');
  // 6. Descrição (expansível)
  const [development, setDevelopment] = useState<string>('');

  // Auxiliary details
  const [objectives, setObjectives] = useState<string>('');
  const [materials, setMaterials] = useState<string>('');
  const [status, setStatus] = useState<SemanarioStatus>('pendente');
  const [substitutionReason, setSubstitutionReason] = useState<string>('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState<string>('');

  // AI Assistant Panel State
  const [showAiPanel, setShowAiPanel] = useState<boolean>(false);
  const [aiTheme, setAiTheme] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Available categories for currently selected class (strict alphabetical, "Projeto" if eligible)
  const availableCategories = useMemo(() => {
    return getCategoriesForTurma(turma, activitiesList);
  }, [turma, activitiesList]);

  // Registered staff suggestions for ADI and Monitors
  const staffSuggestions = useMemo(() => {
    if (!users || users.length === 0) {
      return ['Patrícia', 'Sthefany', 'Márcia', 'Rosana', 'Juliana', 'Aline', 'Camila'];
    }
    return users.map((u) => u.name).filter(Boolean);
  }, [users]);

  // Initialize or reset form fields
  useEffect(() => {
    if (isOpen) {
      if (initialPlan) {
        setTurma(initialPlan.turma || turmas[0] || '1º Ano Azul');
        setDayOfWeek(initialPlan.dayOfWeek || defaultDayOfWeek);
        setTimeSlot(initialPlan.timeSlot || '13:30 - 14:30');
        setWeekTheme(initialPlan.weekTheme || '');
        setCategory(initialPlan.category || availableCategories[0] || 'Acolhimento');
        setTitle(initialPlan.title || '');
        setAdiResponsible(initialPlan.adiResponsible || initialPlan.teacherName || '');
        setMonitors(initialPlan.monitors || '');
        setDevelopment(initialPlan.development || '');
        setObjectives(initialPlan.objectives || '');
        setMaterials(initialPlan.materials || '');
        setStatus(initialPlan.status || 'pendente');
        setSubstitutionReason(initialPlan.substitutionReason || '');
        setPhotos(initialPlan.photos || []);
        setNotes(initialPlan.notes || '');
      } else {
        const initialTurma = turmas[0] || '1º Ano Azul';
        const cats = getCategoriesForTurma(initialTurma, activitiesList);
        setTurma(initialTurma);
        setDayOfWeek(defaultDayOfWeek);
        setTimeSlot('13:30 - 14:30');
        setWeekTheme('');
        setCategory(cats[0] || 'Acolhimento');
        setTitle('');
        setAdiResponsible(currentUser?.name || '');
        setMonitors('');
        setDevelopment('');
        setObjectives('');
        setMaterials('');
        setStatus('pendente');
        setSubstitutionReason('');
        setPhotos([]);
        setNotes('');
      }
      setShowAiPanel(false);
      setAiError(null);
    }
  }, [isOpen, initialPlan, activitiesList]);

  // Adjust category if turma changes and previously selected category is invalid
  const handleTurmaChange = (newTurma: TurmaType) => {
    setTurma(newTurma);
    const validCats = getCategoriesForTurma(newTurma, activitiesList);
    if (!validCats.includes(category)) {
      setCategory(validCats[0] || 'Acolhimento');
    }
  };

  // Image Upload handler (Base64 file reader)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setPhotos((prev) => [...prev, result]);
        }
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // AI Proposal Generator (Server-side Gemini with rich curated fallback)
  const handleGenerateAIProposal = async (customTheme?: string) => {
    setAiLoading(true);
    setAiError(null);

    const themeQuery = customTheme !== undefined ? customTheme : (aiTheme || weekTheme);

    try {
      const response = await fetch('/api/gemini/generate-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turma,
          category,
          theme: themeQuery,
          dayOfWeek,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.proposal) {
          setTitle(data.proposal.title || title);
          setDevelopment(data.proposal.development || development);
          setObjectives(data.proposal.objectives || objectives);
          setMaterials(data.proposal.materials || materials);
          if (themeQuery && !weekTheme) {
            setWeekTheme(themeQuery);
          }
          setAiLoading(false);
          return;
        }
      }
    } catch {
      // Fallback seamlessly to high-quality curated pedagogical bank
    }

    // Curated pedagogical generator fallback
    const curated = generateCuratedProposal(turma, category, themeQuery);
    setTitle(curated.title);
    setDevelopment(curated.development);
    setObjectives(curated.objectives);
    setMaterials(curated.materials);
    if (themeQuery && !weekTheme) {
      setWeekTheme(themeQuery);
    }
    setAiLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('Por favor, informe o Nome da Atividade / Proposta.');
      return;
    }

    const planToSave: SemanarioPlan = {
      id: initialPlan?.id || `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      turma,
      weekNumber: initialPlan?.weekNumber || weekNumber,
      year: initialPlan?.year || year,
      date: initialPlan?.date || defaultDate || new Date().toISOString().split('T')[0],
      dayOfWeek,
      timeSlot,
      weekTheme: weekTheme.trim() || undefined,
      category: category.trim() || availableCategories[0] || 'Acolhimento',
      title: title.trim(),
      adiResponsible: adiResponsible.trim() || undefined,
      monitors: monitors.trim() || undefined,
      teacherName: (adiResponsible.trim() || monitors.trim() || currentUser?.name || 'Monitora').trim(),
      objectives: objectives.trim() || undefined,
      development: development.trim(),
      materials: materials.trim() || undefined,
      status,
      substitutionReason: status === 'substituida' ? substitutionReason.trim() : undefined,
      photos: photos.length > 0 ? photos : undefined,
      notes: notes.trim() || undefined,
      createdAt: initialPlan?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name,
    };

    onSave(planToSave);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 my-auto">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                {initialPlan?.id ? 'Editar Proposta' : 'Nova Proposta do Semanário'}
              </h3>
              <p className="text-xs text-slate-400">
                Semana {weekNumber} • Ano {year} • Programa Integral
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowAiPanel(!showAiPanel)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                showAiPanel
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'bg-slate-800 text-amber-300 hover:bg-slate-700 border border-amber-500/30'
              }`}
              title="Gerador Assistido por IA (Gemini)"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>{showAiPanel ? 'Ocultar IA' : 'Assistente IA'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* AI Assistant Banner / Generator Panel */}
        {showAiPanel && (
          <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-amber-950 text-white p-4 border-b border-indigo-800/40 animate-in slide-in-from-top-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                    Gerador de Propostas Pedagógicas Inteligente
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Gere passo a passo metodológico, objetivos alinhados à BNCC e materiais para a turma{' '}
                  <strong className="text-white">{turma}</strong> na categoria{' '}
                  <strong className="text-amber-200">{category || 'selecionada'}</strong>.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={aiTheme}
                    onChange={(e) => setAiTheme(e.target.value)}
                    placeholder="Tema ou foco (ex: Perdoar como Jesus nos ensinou, Primavera, Emoções)..."
                    className="w-full sm:flex-1 px-3 py-2 bg-slate-800/90 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                  />
                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={() => handleGenerateAIProposal()}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 transition-all shadow-sm cursor-pointer shrink-0 w-full sm:w-auto"
                    >
                      {aiLoading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Gerando...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5" />
                          <span>{title ? 'Regerar com IA' : 'Gerar com IA'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Top Context Bar: Turma, Dia da Semana, Horário */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Turma Oficial ({turmas.length} turmas)
              </label>
              <select
                value={turma}
                onChange={(e) => handleTurmaChange(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer"
              >
                {turmas.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Dia da Semana
              </label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value as DayOfWeek)}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer"
              >
                <option value="segunda">Segunda-feira</option>
                <option value="terca">Terça-feira</option>
                <option value="quarta">Quarta-feira</option>
                <option value="quinta">Quinta-feira</option>
                <option value="sexta">Sexta-feira</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Horário / Faixa
              </label>
              <input
                type="text"
                value={timeSlot}
                onChange={(e) => setTimeSlot(e.target.value)}
                placeholder="Ex: 13:30 - 14:30"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
          </div>

          {/* Sequential Grid Structure Requested */}
          
          {/* 1. Tema da Semana */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Tema da Semana
            </label>
            <input
              type="text"
              value={weekTheme}
              onChange={(e) => setWeekTheme(e.target.value)}
              placeholder="Ex: Perdoar como Jesus nos ensinou"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          {/* 2. Categoria / Prefixo */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-800">
                Categoria / Prefixo
              </label>
              {isTurmaEligibleForProjeto(turma) && (
                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded-md border border-rose-200">
                  Projeto Habilitado (3º ao 6º Ano)
                </span>
              )}
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer"
            >
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Nome da Atividade / Proposta */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-800">
                Nome da Atividade / Proposta *
              </label>
              <button
                type="button"
                onClick={() => handleGenerateAIProposal()}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Sugerir com IA</span>
              </button>
            </div>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Crescendo com Jesus"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          {/* 4. ADI Responsável & 5. Monitora(s) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                ADI Responsável
              </label>
              <div className="relative">
                <input
                  type="text"
                  list="adi-suggestions"
                  value={adiResponsible}
                  onChange={(e) => setAdiResponsible(e.target.value)}
                  placeholder="Ex: Patrícia"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
                <datalist id="adi-suggestions">
                  {staffSuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Monitora(s)
              </label>
              <div className="relative">
                <input
                  type="text"
                  list="monitors-suggestions"
                  value={monitors}
                  onChange={(e) => setMonitors(e.target.value)}
                  placeholder="Ex: Sthefany e Márcia"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
                <datalist id="monitors-suggestions">
                  {staffSuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          {/* 6. Descrição (Caixa de texto expansível para detalhar o passo a passo da proposta) */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Descrição
            </label>
            <textarea
              rows={4}
              value={development}
              onChange={(e) => setDevelopment(e.target.value)}
              placeholder="Descreva o passo a passo detalhado da proposta: acolhimento, desenvolvimento da atividade, dinâmica pedagógica e encerramento..."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 leading-relaxed resize-y"
            />
          </div>

          {/* Complementos Opcionais: Objetivos & Recursos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Objetivos de Aprendizagem & BNCC (Opcional)
              </label>
              <textarea
                rows={2}
                value={objectives}
                onChange={(e) => setObjectives(e.target.value)}
                placeholder="Habilidades a desenvolver (ex: empatia, coordenação motora)..."
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Recursos & Materiais Necessários (Opcional)
              </label>
              <textarea
                rows={2}
                value={materials}
                onChange={(e) => setMaterials(e.target.value)}
                placeholder="Ex: Folhas A3, tintas, giz de cera, almofadas..."
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
          </div>

          {/* Status de Execução & Evidências */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-2">
                Status de Execução da Atividade
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setStatus('realizada')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                    status === 'realizada'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-400 ring-2 ring-emerald-500/20'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Realizada</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatus('pendente')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                    status === 'pendente'
                      ? 'bg-slate-100 text-slate-800 border-slate-400 ring-2 ring-slate-400/20'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span>Pendente</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatus('substituida')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                    status === 'substituida'
                      ? 'bg-amber-50 text-amber-900 border-amber-400 ring-2 ring-amber-500/20'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <RefreshCw className="w-4 h-4 text-amber-600" />
                  <span>Substituída</span>
                </button>
              </div>
            </div>

            {/* Substitution Reason Box */}
            {status === 'substituida' && (
              <div className="pt-2 border-t border-slate-200 animate-in fade-in">
                <label className="block text-xs font-bold text-amber-900 mb-1">
                  Motivo da Substituição da Atividade *
                </label>
                <input
                  type="text"
                  required={status === 'substituida'}
                  value={substitutionReason}
                  onChange={(e) => setSubstitutionReason(e.target.value)}
                  placeholder="Ex: Condição climática chuvosa, reorganização do cronograma comemorativo..."
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            )}

            {/* Photo / Media Attachments */}
            <div className="pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                  <ImageIcon className="w-4 h-4 text-indigo-600" />
                  <span>Evidências Pedagógicas & Fotos ({photos.length})</span>
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Anexar Foto</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />

              {photos.length === 0 ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors cursor-pointer"
                >
                  <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs text-slate-500 font-semibold">
                    Clique para anexar registros fotográficos da realização ou substituição da atividade
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                  {photos.map((photo, idx) => (
                    <div
                      key={idx}
                      className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-square"
                    >
                      <img
                        src={photo}
                        alt={`Evidência ${idx + 1}`}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
                        title="Remover foto"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-400 transition-colors cursor-pointer aspect-square"
                  >
                    <Upload className="w-5 h-5 mb-0.5" />
                    <span className="text-[10px] font-bold">+ Adicionar</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSubmit}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer flex items-center space-x-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Salvar Proposta</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
