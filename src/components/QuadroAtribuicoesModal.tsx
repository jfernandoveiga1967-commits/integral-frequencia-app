import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Sparkles,
  X,
  Search,
  Edit3,
  Check,
  Phone,
  Send,
  MessageSquare,
  Clock,
  MapPin,
  Save,
  Filter,
  Printer,
  FileText,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  ChevronDown,
  User,
  HeartHandshake,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Pin,
  Trash2,
  RotateCcw,
  Calendar,
  History,
  Play,
} from 'lucide-react';
import {
  AdiDemandPriority,
  AdiDemandRecord,
  Student,
  TurmaAtribuicao,
  UserProfile,
} from '../types';
import { formatPhoneDisplay, cleanPhoneNumber } from '../utils/whatsappUtils';
import { getFirstName, buildApoioWhatsAppUrl, getDefaultHorarioTurnoForTurma } from '../utils/atribuicoesStorage';
import { ApoioWhatsAppModal } from './ApoioWhatsAppModal';
import { UserScrollSelect } from './UserScrollSelect';
import { generateQuadroAtribuicoesPDF } from '../utils/pdfGenerator';
import { isCoordenador, canEditQuadroAtribuicoes } from '../utils/authUtils';
import { toISODateString } from '../utils/dateUtils';
import {
  buildAdiDemandWhatsAppUrl,
  concludeAdiDemand,
  createAdiDemand,
  deleteAdiDemand,
  formatAdiPrazoBR,
  getPendingAdiDemandsForTurmaCard,
  normalizeAdiText,
  resolveAdiPhoneFromDirectory,
  subscribeAdiDemands,
  updateAdiDemandPhone,
  updateAdiDemandStatus,
} from '../services/adiDemandService';

export interface QuadroAtribuicoesModalProps {
  isOpen: boolean;
  onClose: () => void;
  atribuicoes: TurmaAtribuicao[];
  users: UserProfile[];
  currentUser: UserProfile | null;
  onSaveAtribuicao: (atribuicao: TurmaAtribuicao) => void;
  onBatchSaveAtribuicoes?: (items: TurmaAtribuicao[]) => void;
  students?: Student[];
  demands?: AdiDemandRecord[];
  initialViewMode?: 'atribuicoes' | 'demandas';
  initialAdiFilter?: string;
  initialTurmaFilter?: string;
}

export const QuadroAtribuicoesModal: React.FC<QuadroAtribuicoesModalProps> = ({
  isOpen,
  onClose,
  atribuicoes,
  users,
  currentUser,
  onSaveAtribuicao,
  onBatchSaveAtribuicoes,
  students = [],
  demands: externalDemands,
  initialViewMode = 'atribuicoes',
  initialAdiFilter = 'TODAS',
  initialTurmaFilter = 'TODAS',
}) => {
  const isCoord = isCoordenador(currentUser);
  const canEdit = canEditQuadroAtribuicoes(currentUser);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'todas' | 'minhas'>('todas');
  const [editingTurmaId, setEditingTurmaId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TurmaAtribuicao | null>(null);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // Apoio WhatsApp Modal state
  const [apoioModalState, setApoioModalState] = useState<{
    isOpen: boolean;
    destinatarioRole: 'adi' | 'monitora' | 'monitora_assistente' | 'coordenador';
    destinatarioName: string;
    destinatarioPhone?: string;
    turmaName: string;
  }>({
    isOpen: false,
    destinatarioRole: 'adi',
    destinatarioName: '',
    destinatarioPhone: '',
    turmaName: '',
  });

  const staffNames = useMemo(() => {
    return Array.from(new Set(users.map((u) => u.name).filter(Boolean))).sort();
  }, [users]);

  // ADI Demands state (uses external prop when provided, otherwise subscribes directly)
  const [internalDemands, setInternalDemands] = useState<AdiDemandRecord[]>([]);
  useEffect(() => {
    if (externalDemands !== undefined) return;
    const unsubscribe = subscribeAdiDemands((records) => {
      setInternalDemands(records);
    });
    return () => unsubscribe();
  }, [externalDemands]);

  const demands = externalDemands !== undefined ? externalDemands : internalDemands;

  // View Mode & Filters
  const [viewMode, setViewMode] = useState<'atribuicoes' | 'demandas'>(initialViewMode);
  const [demandStatusFilter, setDemandStatusFilter] = useState<'abertas' | 'concluidas' | 'todas'>('abertas');
  const [selectedAdiFilter, setSelectedAdiFilter] = useState<string>(initialAdiFilter || 'TODAS');
  const [selectedTurmaFilter, setSelectedTurmaFilter] = useState<string>(initialTurmaFilter || 'TODAS');

  useEffect(() => {
    if (isOpen) {
      setViewMode(initialViewMode || 'atribuicoes');
      setSelectedAdiFilter(initialAdiFilter || 'TODAS');
      setSelectedTurmaFilter(initialTurmaFilter || 'TODAS');
      setDemandStatusFilter('abertas');
    }
  }, [isOpen, initialViewMode, initialAdiFilter, initialTurmaFilter]);

  // New Demand Form state
  const todayIso = toISODateString(new Date());
  const [isNewDemandFormOpen, setIsNewDemandFormOpen] = useState(false);
  const [newAdiName, setNewAdiName] = useState('');
  const [newAdiPhone, setNewAdiPhone] = useState('');
  const [newTurma, setNewTurma] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newTitulo, setNewTitulo] = useState('');
  const [newDescricao, setNewDescricao] = useState('');
  const [newPrazoData, setNewPrazoData] = useState(todayIso);
  const [newPrioridade, setNewPrioridade] = useState<AdiDemandPriority>('normal');
  const [newDemandError, setNewDemandError] = useState('');
  const [isSavingDemand, setIsSavingDemand] = useState(false);

  // Return / Conclusion inline editor state
  const [concludingDemandId, setConcludingDemandId] = useState<string | null>(null);
  const [retornoText, setRetornoText] = useState('');
  const [isUpdatingDemand, setIsUpdatingDemand] = useState<string | null>(null);

  // Confirm delete inline state
  const [confirmDeleteDemandId, setConfirmDeleteDemandId] = useState<string | null>(null);

  // Phone missing prompt inline state for WhatsApp 1-click
  const [phonePromptDemandId, setPhonePromptDemandId] = useState<string | null>(null);
  const [phonePromptValue, setPhonePromptValue] = useState('');

  // Directory of ADIs from Quadro + Users + Existing Demands
  const adiDirectory = useMemo(() => {
    const map = new Map<
      string,
      { name: string; phone: string; turmas: string[] }
    >();

    const upsert = (rawName: string, rawPhone?: string, turma?: string) => {
      const name = (rawName || '').trim();
      if (!name) return;
      const key = normalizeAdiText(name);
      const prev = map.get(key);
      const phone = (rawPhone || '').trim() || prev?.phone || '';
      const turmasSet = new Set(prev?.turmas || []);
      if (turma && turma.trim()) turmasSet.add(turma.trim());
      map.set(key, {
        name: prev?.name || name,
        phone,
        turmas: Array.from(turmasSet),
      });
    };

    atribuicoes.forEach((a) => {
      upsert(a.adiName, a.adiPhone, a.turma);
    });

    users.forEach((u) => {
      const cargo = normalizeAdiText(u.cargoLabel);
      if (cargo.includes('adi') || u.role === 'auxiliar') {
        upsert(u.name, u.phone);
      }
    });

    demands.forEach((d) => {
      upsert(d.adiName, d.adiPhone, d.turma);
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [atribuicoes, users, demands]);

  const turmaOptions = useMemo(() => {
    return Array.from(new Set(atribuicoes.map((a) => a.turma).filter(Boolean)));
  }, [atribuicoes]);

  const studentSuggestions = useMemo(() => {
    const safe = Array.isArray(students) ? students : [];
    const active = safe.filter((s) => (s.status || 'ativo') === 'ativo');
    const filtered = newTurma
      ? active.filter((s) => normalizeAdiText(s.turma) === normalizeAdiText(newTurma))
      : active;
    return Array.from(new Set(filtered.map((s) => s.name).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
  }, [students, newTurma]);

  // User's assigned turmas
  const userTurmas = useMemo(() => {
    return new Set(currentUser?.allowedClassIds || currentUser?.assignedTurmas || []);
  }, [currentUser]);

  // Total pending ADI demands
  const totalOpenDemandsCount = useMemo(() => {
    return demands.filter((d) => d.status !== 'concluido').length;
  }, [demands]);

  // Filtered atribuicoes list
  const filteredList = useMemo(() => {
    return atribuicoes.filter((item) => {
      if (filterMode === 'minhas' && !isCoord) {
        if (!userTurmas.has(item.turma)) return false;
      }

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        item.turma.toLowerCase().includes(term) ||
        item.monitoraName.toLowerCase().includes(term) ||
        (item.monitoraAssistenteName || '').toLowerCase().includes(term) ||
        item.adiName.toLowerCase().includes(term) ||
        (item.espacoBase || '').toLowerCase().includes(term) ||
        (item.observacao || '').toLowerCase().includes(term)
      );
    });
  }, [atribuicoes, filterMode, isCoord, userTurmas, searchTerm]);

  // Filtered & grouped demands by ADI
  const filteredDemands = useMemo(() => {
    const term = normalizeAdiText(searchTerm);
    const adiFilterNorm = selectedAdiFilter !== 'TODAS' ? normalizeAdiText(selectedAdiFilter) : '';
    const turmaFilterNorm = selectedTurmaFilter !== 'TODAS' ? normalizeAdiText(selectedTurmaFilter) : '';

    return demands.filter((d) => {
      if (demandStatusFilter === 'abertas' && d.status === 'concluido') return false;
      if (demandStatusFilter === 'concluidas' && d.status !== 'concluido') return false;

      if (adiFilterNorm && normalizeAdiText(d.adiName) !== adiFilterNorm) return false;
      if (turmaFilterNorm) {
        const dTurmaNorm = normalizeAdiText(d.turma);
        // Se filtrou por turma específica, exibe demandas daquela turma ou demandas gerais da ADI daquela turma
        if (dTurmaNorm && dTurmaNorm !== turmaFilterNorm) return false;
      }

      if (term) {
        const haystack = normalizeAdiText(
          `${d.adiName} ${d.turma || ''} ${d.studentName || ''} ${d.titulo} ${d.descricao} ${d.observacaoRetorno || ''}`
        );
        if (!haystack.includes(term)) return false;
      }

      return true;
    });
  }, [demands, demandStatusFilter, selectedAdiFilter, selectedTurmaFilter, searchTerm]);

  const groupedDemandsByAdi = useMemo(() => {
    const groups = new Map<
      string,
      {
        adiName: string;
        adiPhone: string;
        turmas: string[];
        pendingCount: number;
        items: AdiDemandRecord[];
      }
    >();

    // Se houver filtro de ADI específica, garante o cabeçalho dela mesmo que esteja sem pendências no filtro atual
    if (selectedAdiFilter !== 'TODAS') {
      const dirEntry = adiDirectory.find(
        (entry) => normalizeAdiText(entry.name) === normalizeAdiText(selectedAdiFilter)
      );
      const key = normalizeAdiText(selectedAdiFilter);
      const pendingForAdi = demands.filter(
        (d) => d.status !== 'concluido' && normalizeAdiText(d.adiName) === key
      ).length;
      groups.set(key, {
        adiName: dirEntry?.name || selectedAdiFilter,
        adiPhone:
          dirEntry?.phone ||
          resolveAdiPhoneFromDirectory(selectedAdiFilter, atribuicoes, users),
        turmas: dirEntry?.turmas || [],
        pendingCount: pendingForAdi,
        items: [],
      });
    } else if (demandStatusFilter === 'abertas' && !searchTerm.trim() && selectedTurmaFilter === 'TODAS') {
      // Exibe todas as ADIs do quadro que têm demandas abertas ou pertencem ao quadro oficial
      adiDirectory.forEach((entry) => {
        const key = normalizeAdiText(entry.name);
        const pendingForAdi = demands.filter(
          (d) => d.status !== 'concluido' && normalizeAdiText(d.adiName) === key
        ).length;
        if (pendingForAdi > 0 || atribuicoes.some((a) => normalizeAdiText(a.adiName) === key)) {
          groups.set(key, {
            adiName: entry.name,
            adiPhone: entry.phone,
            turmas: entry.turmas,
            pendingCount: pendingForAdi,
            items: [],
          });
        }
      });
    }

    filteredDemands.forEach((d) => {
      const key = normalizeAdiText(d.adiName);
      if (!groups.has(key)) {
        const dirEntry = adiDirectory.find((e) => normalizeAdiText(e.name) === key);
        const pendingForAdi = demands.filter(
          (item) => item.status !== 'concluido' && normalizeAdiText(item.adiName) === key
        ).length;
        groups.set(key, {
          adiName: d.adiName,
          adiPhone:
            d.adiPhone ||
            dirEntry?.phone ||
            resolveAdiPhoneFromDirectory(d.adiName, atribuicoes, users, d.turma),
          turmas: dirEntry?.turmas || (d.turma ? [d.turma] : []),
          pendingCount: pendingForAdi,
          items: [],
        });
      }
      groups.get(key)!.items.push(d);
    });

    return Array.from(groups.values()).sort((a, b) => {
      if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount;
      return a.adiName.localeCompare(b.adiName, 'pt-BR');
    });
  }, [
    filteredDemands,
    demands,
    adiDirectory,
    atribuicoes,
    users,
    selectedAdiFilter,
    selectedTurmaFilter,
    demandStatusFilter,
    searchTerm,
  ]);

  if (!isOpen) return null;

  const openNewDemandForm = (prefillAdi?: string, prefillPhone?: string, prefillTurma?: string) => {
    const defaultAdi =
      prefillAdi ||
      (selectedAdiFilter !== 'TODAS' ? selectedAdiFilter : adiDirectory[0]?.name || '');
    const defaultTurma =
      prefillTurma || (selectedTurmaFilter !== 'TODAS' ? selectedTurmaFilter : '');
    const resolvedPhone =
      prefillPhone ||
      resolveAdiPhoneFromDirectory(defaultAdi, atribuicoes, users, defaultTurma);

    setNewAdiName(defaultAdi);
    setNewAdiPhone(resolvedPhone ? formatPhoneDisplay(resolvedPhone) : '');
    setNewTurma(defaultTurma);
    setNewStudentName('');
    setNewTitulo('');
    setNewDescricao('');
    setNewPrazoData(toISODateString(new Date()));
    setNewPrioridade('normal');
    setNewDemandError('');
    setIsNewDemandFormOpen(true);
    setViewMode('demandas');
  };

  const handleCreateDemandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewDemandError('');
    if (!newAdiName.trim()) {
      setNewDemandError('Selecione a ADI responsável pela demanda.');
      return;
    }
    if (!newTitulo.trim()) {
      setNewDemandError('Informe o título do lembrete ou demanda.');
      return;
    }
    if (!newPrazoData) {
      setNewDemandError('Informe a data de prazo.');
      return;
    }

    setIsSavingDemand(true);
    try {
      await createAdiDemand({
        adiName: newAdiName.trim(),
        adiPhone: newAdiPhone.trim() || undefined,
        turma: newTurma.trim() || undefined,
        studentName: newStudentName.trim() || undefined,
        titulo: newTitulo.trim(),
        descricao: newDescricao.trim() || newTitulo.trim(),
        prazoData: newPrazoData,
        prioridade: newPrioridade,
        createdBy: currentUser?.name || 'Coordenação',
      });
      setIsNewDemandFormOpen(false);
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 3000);
    } catch (err) {
      setNewDemandError(err instanceof Error ? err.message : 'Não foi possível salvar a demanda.');
    } finally {
      setIsSavingDemand(false);
    }
  };

  const handleSendDemandWhatsApp = (demand: AdiDemandRecord) => {
    const resolvedPhone =
      demand.adiPhone ||
      resolveAdiPhoneFromDirectory(demand.adiName, atribuicoes, users, demand.turma);
    const cleaned = cleanPhoneNumber(resolvedPhone);
    if (!cleaned) {
      setPhonePromptDemandId(demand.id);
      setPhonePromptValue('');
      return;
    }
    const url = buildAdiDemandWhatsAppUrl(cleaned, demand);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSavePhoneAndSendWhatsApp = async (demand: AdiDemandRecord) => {
    const cleaned = cleanPhoneNumber(phonePromptValue);
    if (!cleaned) return;
    await updateAdiDemandPhone(
      demand.id,
      formatPhoneDisplay(phonePromptValue),
      currentUser?.name || 'Coordenação'
    );
    const url = buildAdiDemandWhatsAppUrl(cleaned, { ...demand, adiPhone: phonePromptValue });
    setPhonePromptDemandId(null);
    setPhonePromptValue('');
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleConcludeDemand = async (demandId: string, markConcluded: boolean) => {
    setIsUpdatingDemand(demandId);
    try {
      if (markConcluded) {
        await concludeAdiDemand(
          demandId,
          retornoText,
          currentUser?.name || 'Coordenação'
        );
      } else {
        await updateAdiDemandStatus(
          demandId,
          'em_andamento',
          currentUser?.name || 'Coordenação',
          retornoText
        );
      }
      setConcludingDemandId(null);
      setRetornoText('');
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 2500);
    } finally {
      setIsUpdatingDemand(null);
    }
  };

  const getDisplayHorario = (item: TurmaAtribuicao) => {
    if (item.horarioTurno && item.horarioTurno.trim() !== '') {
      return item.horarioTurno.trim();
    }
    return getDefaultHorarioTurnoForTurma(item.turma);
  };

  const startEdit = (item: TurmaAtribuicao) => {
    setEditingTurmaId(item.id);
    setEditForm({
      ...item,
      horarioTurno: getDisplayHorario(item),
    });
  };

  const cancelEdit = () => {
    setEditingTurmaId(null);
    setEditForm(null);
  };

  const handleSaveEdit = () => {
    if (!editForm) return;
    onSaveAtribuicao(editForm);
    setEditingTurmaId(null);
    setEditForm(null);
    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 3000);
  };

  const openApoioModal = (
    destinatarioRole: 'adi' | 'monitora' | 'monitora_assistente',
    destinatarioName: string,
    destinatarioPhone: string | undefined,
    turmaName: string
  ) => {
    setApoioModalState({
      isOpen: true,
      destinatarioRole,
      destinatarioName,
      destinatarioPhone: destinatarioPhone || '',
      turmaName,
    });
  };

  // 1-Click WhatsApp Direct Launcher
  const triggerOneClickWhatsApp = (
    destinatarioName: string,
    destinatarioPhone: string | undefined,
    turmaName: string,
    role: 'adi' | 'monitora' | 'monitora_assistente'
  ) => {
    const cleanNum = cleanPhoneNumber(destinatarioPhone);
    if (!cleanNum) {
      // Se não tem telefone, abre o modal para preencher
      openApoioModal(role, destinatarioName, destinatarioPhone, turmaName);
      return;
    }
    const url = buildApoioWhatsAppUrl(cleanNum, destinatarioName);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    try {
      generateQuadroAtribuicoesPDF(atribuicoes, true);
    } catch (err) {
      console.error('Erro ao gerar PDF do Quadro de Atribuições:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-700 via-amber-800 to-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <h2 className="text-base sm:text-xl font-black leading-tight truncate text-white">
              Quadro Geral de Atribuições
            </h2>
            {totalOpenDemandsCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-100 text-[11px] font-black">
                📌 {totalOpenDemandsCount} {totalOpenDemandsCount === 1 ? 'demanda ADI' : 'demandas ADI'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => openNewDemandForm()}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Demanda / Lembrete ADI</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-amber-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top Filter and Actions Bar */}
        <div className="px-5 py-3 bg-amber-50/40 border-b border-amber-100/80 space-y-2.5 shrink-0">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            {/* Segmented Switch: Atribuições vs Demandas por ADI */}
            <div className="inline-flex rounded-xl bg-white p-1 border border-slate-300 shadow-xs text-xs font-extrabold self-start">
              <button
                type="button"
                onClick={() => setViewMode('atribuicoes')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
                  viewMode === 'atribuicoes'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Atribuições por Turma</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('demandas')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
                  viewMode === 'demandas'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <span>📌 Demandas Pendentes por ADI</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    viewMode === 'demandas'
                      ? 'bg-white/20 text-white'
                      : totalOpenDemandsCount > 0
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {totalOpenDemandsCount}
                </span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[200px] sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={
                    viewMode === 'demandas'
                      ? 'Buscar demanda, ADI, aluno...'
                      : 'Buscar por turma, monitora ou ADI...'
                  }
                  className="w-full pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-xs"
                />
              </div>

              {viewMode === 'atribuicoes' && !isCoord && userTurmas.size > 0 && (
                <div className="inline-flex rounded-xl bg-white p-0.5 border border-slate-300 shadow-xs text-xs font-bold shrink-0">
                  <button
                    type="button"
                    onClick={() => setFilterMode('todas')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      filterMode === 'todas'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todas as Turmas
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('minhas')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      filterMode === 'minhas'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Minha(s) Turma(s)
                  </button>
                </div>
              )}

              {viewMode === 'atribuicoes' && (
                <>
                  <button
                    onClick={handlePrint}
                    type="button"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                    title="Imprimir quadro de atribuições"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>Imprimir</span>
                  </button>

                  <button
                    onClick={handleExportPDF}
                    type="button"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                    title="Exportar quadro geral de todas as turmas em PDF"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>
                </>
              )}

              {saveSuccessNotice && (
                <span className="inline-flex items-center space-x-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-bold text-xs animate-in fade-in">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Salvo!</span>
                </span>
              )}
            </div>
          </div>

          {/* Sub-barra de filtros do modo Demandas por ADI */}
          {viewMode === 'demandas' && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-200/70">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'abertas', label: `Pendentes / Em Andamento (${totalOpenDemandsCount})` },
                  {
                    id: 'concluidas',
                    label: `Histórico Concluído (${demands.filter((d) => d.status === 'concluido').length})`,
                  },
                  { id: 'todas', label: `Todas (${demands.length})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDemandStatusFilter(tab.id as 'abertas' | 'concluidas' | 'todas')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border transition-all cursor-pointer ${
                      demandStatusFilter === tab.id
                        ? 'bg-amber-700 text-white border-amber-700 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedAdiFilter}
                  onChange={(e) => setSelectedAdiFilter(e.target.value)}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                >
                  <option value="TODAS">Todas as ADIs</option>
                  {adiDirectory.map((adi) => (
                    <option key={adi.name} value={adi.name}>
                      {adi.name}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedTurmaFilter}
                  onChange={(e) => setSelectedTurmaFilter(e.target.value)}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                >
                  <option value="TODAS">Todas as Turmas</option>
                  {turmaOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                {(selectedAdiFilter !== 'TODAS' || selectedTurmaFilter !== 'TODAS') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAdiFilter('TODAS');
                      setSelectedTurmaFilter('TODAS');
                    }}
                    className="px-2 py-1 rounded-lg text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 transition-colors cursor-pointer"
                  >
                    Limpar Filtro
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Formulário Inline Compacto: Nova Demanda / Lembrete ADI */}
          {isNewDemandFormOpen && (
            <form
              onSubmit={handleCreateDemandSubmit}
              className="bg-amber-50/70 border-2 border-amber-300 rounded-2xl p-4 space-y-3 shadow-sm animate-in fade-in"
            >
              <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                <div className="flex items-center space-x-2">
                  <Pin className="w-4 h-4 text-amber-700" />
                  <h3 className="text-sm font-black text-amber-950">
                    Novo Lembrete / Demanda para ADI
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNewDemandFormOpen(false)}
                  className="p-1 rounded-lg text-amber-700 hover:bg-amber-200/60 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {newDemandError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{newDemandError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    ADI Responsável *
                  </label>
                  <input
                    type="text"
                    list="adi-directory-list"
                    value={newAdiName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewAdiName(val);
                      const matchedPhone = resolveAdiPhoneFromDirectory(
                        val,
                        atribuicoes,
                        users,
                        newTurma
                      );
                      if (matchedPhone) {
                        setNewAdiPhone(formatPhoneDisplay(matchedPhone));
                      }
                    }}
                    placeholder="Ex: Patrícia Nascimento"
                    className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    required
                  />
                  <datalist id="adi-directory-list">
                    {adiDirectory.map((adi) => (
                      <option key={adi.name} value={adi.name} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    WhatsApp da ADI (opcional)
                  </label>
                  <input
                    type="tel"
                    value={newAdiPhone}
                    onChange={(e) => setNewAdiPhone(e.target.value)}
                    placeholder="(XX) XXXXX-XXXX"
                    className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    Turma Vinculada (opcional)
                  </label>
                  <select
                    value={newTurma}
                    onChange={(e) => setNewTurma(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  >
                    <option value="">Geral da ADI (todas as salas dela)</option>
                    {turmaOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    Aluno Pontual (opcional)
                  </label>
                  <input
                    type="text"
                    list="adi-student-suggestions"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    placeholder="Nome do aluno (se houver)"
                    className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                  <datalist id="adi-student-suggestions">
                    {studentSuggestions.map((sName) => (
                      <option key={sName} value={sName} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-6">
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    Título do Lembrete / Assunto *
                  </label>
                  <input
                    type="text"
                    value={newTitulo}
                    onChange={(e) => setNewTitulo(e.target.value)}
                    placeholder="Ex: Conferir troca de mochila / alinhar adaptação"
                    className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    required
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    Prazo *
                  </label>
                  <input
                    type="date"
                    value={newPrazoData}
                    onChange={(e) => setNewPrazoData(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    required
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    Prioridade
                  </label>
                  <select
                    value={newPrioridade}
                    onChange={(e) => setNewPrioridade(e.target.value as AdiDemandPriority)}
                    className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  >
                    <option value="normal">Normal</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                  Descrição / Orientações Detalhadas
                </label>
                <textarea
                  rows={2}
                  value={newDescricao}
                  onChange={(e) => setNewDescricao(e.target.value)}
                  placeholder="Descreva o que precisa ser verificado, acompanhado ou retornado pela ADI..."
                  className="w-full px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsNewDemandFormOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingDemand}
                  className="inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingDemand ? 'Salvando...' : 'Registrar Lembrete ADI'}</span>
                </button>
              </div>
            </form>
          )}

          {viewMode === 'demandas' ? (
            /* VISÃO: DEMANDAS PENDENTES / HISTÓRICO POR ADI */
            groupedDemandsByAdi.length === 0 ? (
              <div className="text-center py-12 text-slate-500 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400 mb-2" />
                <p className="font-extrabold text-sm text-slate-700">
                  {demandStatusFilter === 'abertas'
                    ? 'Nenhuma demanda pendente encontrada para os filtros selecionados.'
                    : 'Nenhuma demanda encontrada para os filtros selecionados.'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Use "+ Nova Demanda / Lembrete ADI" acima para registrar um novo acompanhamento.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedDemandsByAdi.map((group) => (
                  <div
                    key={group.adiName}
                    className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs"
                  >
                    {/* Cabeçalho da ADI */}
                    <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50/60 border-b border-amber-200/80 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-black text-amber-950">
                            {group.adiName}
                          </h3>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black border ${
                              group.pendingCount > 0
                                ? 'bg-amber-600 text-white border-amber-700'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            📌 {group.pendingCount} {group.pendingCount === 1 ? 'pendente' : 'pendentes'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-amber-900/80 font-medium">
                          {group.adiPhone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {formatPhoneDisplay(group.adiPhone)}
                            </span>
                          )}
                          {group.turmas.length > 0 && (
                            <span className="truncate">
                              Turmas: <strong>{group.turmas.join(', ')}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {canEdit && (
                        <button
                          type="button"
                          onClick={() =>
                            openNewDemandForm(group.adiName, group.adiPhone, group.turmas.length === 1 ? group.turmas[0] : '')
                          }
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-extrabold transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Lembrete p/ {getFirstName(group.adiName)}</span>
                        </button>
                      )}
                    </div>

                    {/* Lista de Lembretes da ADI */}
                    {group.items.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-slate-400 italic">
                        Nenhuma demanda {demandStatusFilter === 'concluidas' ? 'concluída' : 'em aberto'} nesta seção.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {group.items.map((demand) => {
                          const isConcluded = demand.status === 'concluido';
                          const isOverdue = !isConcluded && demand.prazoData < todayIso;
                          const isDueToday = !isConcluded && demand.prazoData === todayIso;
                          const isConcludingThis = concludingDemandId === demand.id;
                          const isPromptingPhone = phonePromptDemandId === demand.id;
                          const isConfirmingDelete = confirmDeleteDemandId === demand.id;

                          return (
                            <div
                              key={demand.id}
                              className={`p-3.5 space-y-2 transition-colors ${
                                isConcluded
                                  ? 'bg-slate-50/70'
                                  : demand.prioridade === 'urgente'
                                  ? 'bg-rose-50/30'
                                  : 'bg-white'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${
                                        demand.status === 'concluido'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : demand.status === 'em_andamento'
                                          ? 'bg-sky-50 text-sky-700 border-sky-200'
                                          : 'bg-amber-50 text-amber-800 border-amber-200'
                                      }`}
                                    >
                                      {demand.status === 'concluido'
                                        ? 'Concluído'
                                        : demand.status === 'em_andamento'
                                        ? 'Em Andamento'
                                        : 'Pendente'}
                                    </span>

                                    {demand.prioridade === 'urgente' && (
                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-rose-600 text-white">
                                        Urgente
                                      </span>
                                    )}

                                    <span
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                        isOverdue
                                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                                          : isDueToday
                                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                                          : 'bg-slate-100 text-slate-600 border-slate-200'
                                      }`}
                                    >
                                      <Calendar className="w-2.5 h-2.5" />
                                      Prazo: {formatAdiPrazoBR(demand.prazoData)}
                                      {isOverdue && ' (Atrasado)'}
                                      {isDueToday && ' (Hoje)'}
                                    </span>

                                    {demand.turma && (
                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                        {demand.turma}
                                      </span>
                                    )}

                                    {demand.studentName && (
                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                        Aluno(a): {demand.studentName}
                                      </span>
                                    )}
                                  </div>

                                  <h4
                                    className={`text-xs sm:text-sm font-extrabold ${
                                      isConcluded ? 'text-slate-500 line-through' : 'text-slate-900'
                                    }`}
                                  >
                                    {demand.titulo}
                                  </h4>

                                  {demand.descricao && demand.descricao !== demand.titulo && (
                                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                                      {demand.descricao}
                                    </p>
                                  )}

                                  {demand.observacaoRetorno && (
                                    <div className="mt-1.5 p-2 rounded-lg bg-emerald-50/70 border border-emerald-200 text-[11px] text-emerald-900">
                                      <span className="font-extrabold">Parecer / Retorno:</span>{' '}
                                      {demand.observacaoRetorno}
                                      {demand.resolvedAt && (
                                        <span className="text-emerald-700/80 ml-2">
                                          • Concluído em {new Date(demand.resolvedAt).toLocaleDateString('pt-BR')}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Ações Rápidas */}
                                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleSendDemandWhatsApp(demand)}
                                    className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 shadow-2xs transition-all cursor-pointer"
                                    title="Enviar lembrete formatado no WhatsApp em 1-Clique"
                                  >
                                    <Send className="w-3 h-3" />
                                    <span>WhatsApp (1-Clique)</span>
                                  </button>

                                  {!isConcluded && demand.status === 'pendente' && (
                                    <button
                                      type="button"
                                      disabled={isUpdatingDemand === demand.id}
                                      onClick={() =>
                                        updateAdiDemandStatus(
                                          demand.id,
                                          'em_andamento',
                                          currentUser?.name || 'Coordenação'
                                        )
                                      }
                                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-colors cursor-pointer"
                                      title="Marcar demanda como Em Andamento"
                                    >
                                      <Play className="w-3 h-3" />
                                      <span>Em Andamento</span>
                                    </button>
                                  )}

                                  {!isConcluded ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isConcludingThis) {
                                          setConcludingDemandId(null);
                                        } else {
                                          setConcludingDemandId(demand.id);
                                          setRetornoText(demand.observacaoRetorno || '');
                                        }
                                      }}
                                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 transition-colors cursor-pointer"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Registrar Parecer / Concluir</span>
                                    </button>
                                  ) : (
                                    canEdit && (
                                      <button
                                        type="button"
                                        disabled={isUpdatingDemand === demand.id}
                                        onClick={() =>
                                          updateAdiDemandStatus(
                                            demand.id,
                                            'pendente',
                                            currentUser?.name || 'Coordenação'
                                          )
                                        }
                                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition-colors cursor-pointer"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        <span>Reabrir</span>
                                      </button>
                                    )
                                  )}

                                  {canEdit && (
                                    isConfirmingDelete ? (
                                      <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            await deleteAdiDemand(demand.id);
                                            setConfirmDeleteDemandId(null);
                                          }}
                                          className="text-[10px] font-black text-rose-700 hover:text-rose-900 cursor-pointer"
                                        >
                                          Confirmar
                                        </button>
                                        <span className="text-slate-300">|</span>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteDemandId(null)}
                                          className="text-[10px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                                        >
                                          Não
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteDemandId(demand.id)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                        title="Excluir demanda"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )
                                  )}
                                </div>
                              </div>

                              {/* Prompt inline caso a ADI não tenha WhatsApp salvo */}
                              {isPromptingPhone && (
                                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center gap-2 animate-in fade-in">
                                  <span className="text-[11px] font-bold text-emerald-900">
                                    Informe o WhatsApp de {demand.adiName} para enviar o lembrete:
                                  </span>
                                  <input
                                    type="tel"
                                    value={phonePromptValue}
                                    onChange={(e) => setPhonePromptValue(e.target.value)}
                                    placeholder="(XX) XXXXX-XXXX"
                                    className="px-2.5 py-1 text-xs font-bold bg-white border border-emerald-300 rounded-lg w-40"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSavePhoneAndSendWhatsApp(demand)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold cursor-pointer"
                                  >
                                    Salvar e Abrir WhatsApp
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPhonePromptDemandId(null)}
                                    className="text-[11px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              )}

                              {/* Painel inline: Registrar Parecer / Concluir */}
                              {isConcludingThis && (
                                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2 animate-in fade-in">
                                  <label className="block text-[11px] font-extrabold text-amber-950">
                                    Parecer / Observação de Retorno:
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={retornoText}
                                    onChange={(e) => setRetornoText(e.target.value)}
                                    placeholder="Anote o retorno da ADI, providência tomada ou observação de acompanhamento..."
                                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                                  />
                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setConcludingDemandId(null)}
                                      className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isUpdatingDemand === demand.id}
                                      onClick={() => handleConcludeDemand(demand.id, false)}
                                      className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
                                    >
                                      Salvar Parecer (Em Andamento)
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isUpdatingDemand === demand.id}
                                      onClick={() => handleConcludeDemand(demand.id, true)}
                                      className="inline-flex items-center space-x-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Concluir Demanda</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : filteredList.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Users className="w-12 h-12 mx-auto text-slate-300 mb-2" />
              <p className="font-bold text-sm">Nenhuma atribuição encontrada.</p>
              <p className="text-xs text-slate-400">Verifique o termo buscado ou limpe os filtros.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredList.map((item) => {
                const isEditing = editingTurmaId === item.id;
                const isMyTurma = userTurmas.has(item.turma);
                const itemPendingDemands = getPendingAdiDemandsForTurmaCard(
                  demands,
                  item.turma,
                  item.adiName
                );

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-xs ${
                      isMyTurma
                        ? 'border-amber-400/80 bg-amber-50/20 ring-1 ring-amber-400/40'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="px-4 py-2.5 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                        <h3 className="font-extrabold text-sm text-slate-900 truncate">
                          {item.turma}
                        </h3>
                        {isMyTurma && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500 text-white">
                            Sua Turma
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          {getDisplayHorario(item)}
                        </span>
                        {canEdit && !isEditing && (
                          <button
                            onClick={() => startEdit(item)}
                            className="p-1 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-100/50 transition-colors"
                            title="Editar atribuições desta turma"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 space-y-3 flex-1">
                      {isEditing && editForm ? (
                        /* Edit Mode Form (Coordinator) */
                        <div className="space-y-3 bg-amber-50/50 p-3 rounded-xl border border-amber-200 animate-in fade-in">
                          {/* Monitora Titular */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <UserScrollSelect
                                label="Monitora Titular:"
                                selectedName={editForm.monitoraName}
                                users={users}
                                placeholder="Selecione a monitora titular..."
                                accentColor="slate"
                                onSelectUser={(u) => {
                                  setEditForm({
                                    ...editForm,
                                    monitoraName: u.name,
                                    monitoraId: u.id,
                                    monitoraPhone: u.phone ? formatPhoneDisplay(u.phone) : editForm.monitoraPhone || '',
                                  });
                                }}
                                onClear={() => {
                                  setEditForm({
                                    ...editForm,
                                    monitoraName: '',
                                    monitoraId: '',
                                    monitoraPhone: '',
                                  });
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                                WhatsApp da Titular:
                              </label>
                              <input
                                type="tel"
                                value={editForm.monitoraPhone || ''}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, monitoraPhone: e.target.value })
                                }
                                placeholder="(XX) XXXXX-XXXX"
                                className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                              />
                            </div>
                          </div>

                          {/* Monitora Assistente */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <UserScrollSelect
                                label="Monitora Assistente:"
                                badgeLabel="Assistente"
                                selectedName={editForm.monitoraAssistenteName || ''}
                                users={users}
                                placeholder="Selecione a monitora assistente..."
                                accentColor="sky"
                                onSelectUser={(u) => {
                                  // Busca o perfil correspondente na lista geral de colaboradores/usuários
                                  const foundUser = users.find((user) => user.id === u.id || user.name.toLowerCase() === u.name.toLowerCase()) || u;
                                  const rawPhone = foundUser.phone || '';
                                  const formattedPhone = rawPhone ? formatPhoneDisplay(rawPhone) : '';

                                  setEditForm({
                                    ...editForm,
                                    monitoraAssistenteName: foundUser.name,
                                    monitoraAssistenteId: foundUser.id,
                                    monitoraAssistentePhone: formattedPhone,
                                  });
                                }}
                                onClear={() => {
                                  setEditForm({
                                    ...editForm,
                                    monitoraAssistenteName: '',
                                    monitoraAssistenteId: '',
                                    monitoraAssistentePhone: '',
                                  });
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-sky-900 mb-0.5">
                                WhatsApp da Assistente:
                              </label>
                              <input
                                type="tel"
                                value={editForm.monitoraAssistentePhone || ''}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, monitoraAssistentePhone: e.target.value })
                                }
                                placeholder="(XX) XXXXX-XXXX"
                                className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                              />
                            </div>
                          </div>

                          {/* Sua ADI */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <UserScrollSelect
                                label="Sua ADI (Apoio da Turma):"
                                badgeLabel="ADI"
                                selectedName={editForm.adiName}
                                users={users}
                                placeholder="Selecione a ADI..."
                                accentColor="amber"
                                onSelectUser={(u) => {
                                  setEditForm({
                                    ...editForm,
                                    adiName: u.name,
                                    adiId: u.id,
                                    adiPhone: u.phone ? formatPhoneDisplay(u.phone) : editForm.adiPhone || '',
                                  });
                                }}
                                onClear={() => {
                                  setEditForm({
                                    ...editForm,
                                    adiName: '',
                                    adiId: '',
                                    adiPhone: '',
                                  });
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-amber-900 mb-0.5">
                                WhatsApp de Sua ADI:
                              </label>
                              <input
                                type="tel"
                                value={editForm.adiPhone || ''}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, adiPhone: e.target.value })
                                }
                                placeholder="(XX) XXXXX-XXXX"
                                className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                                Horário do Turno:
                              </label>
                              <input
                                type="text"
                                value={editForm.horarioTurno || ''}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, horarioTurno: e.target.value })
                                }
                                placeholder={getDefaultHorarioTurnoForTurma(editForm.turma)}
                                className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                                Espaço / Sala Base:
                              </label>
                              <input
                                type="text"
                                value={editForm.espacoBase || ''}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, espacoBase: e.target.value })
                                }
                                placeholder="Ex: Sala 04 / Pátio"
                                className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                              Observações da Atribuição:
                            </label>
                            <input
                              type="text"
                              value={editForm.observacao || ''}
                              onChange={(e) =>
                                setEditForm({ ...editForm, observacao: e.target.value })
                              }
                              placeholder="Notas pedagógicas, rotinas específicas..."
                              className="w-full px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg"
                            />
                          </div>

                          <div className="flex items-center justify-end space-x-2 pt-1 border-t border-amber-200">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="px-3 py-1 text-xs font-bold text-slate-600 hover:text-slate-800"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              className="inline-flex items-center space-x-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Salvar Atribuição</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Read Mode Display */
                        <div className="space-y-2.5">
                          {/* Block: Sua ADI (Destacado e Conforme Especificação) */}
                          <div className="bg-gradient-to-r from-amber-50 to-orange-50/60 border border-amber-200/90 rounded-xl p-2.5 space-y-2 shadow-2xs">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center space-x-1.5 text-[10px] font-black uppercase tracking-wider text-amber-800">
                                  <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>Sua ADI:</span>
                                </div>
                                <div className="text-xs sm:text-sm font-extrabold text-amber-950 truncate">
                                  {item.adiName || '—'}
                                </div>
                                <div className="text-[10px] text-amber-700/80 font-semibold flex items-center gap-1">
                                  <Phone className="w-2.5 h-2.5" />
                                  <span>{formatPhoneDisplay(item.adiPhone) || 'Sem telefone cadastrado'}</span>
                                </div>
                              </div>

                              {/* WhatsApp Fast Buttons for ADI */}
                              <div className="flex items-center space-x-1 shrink-0">
                                {/* 1-Click WhatsApp Button */}
                                <button
                                  type="button"
                                  onClick={() => triggerOneClickWhatsApp(item.adiName, item.adiPhone, item.turma, 'adi')}
                                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs active:scale-95 transition-all cursor-pointer"
                                  title={`Abrir WhatsApp direto com "${item.adiName}"`}
                                >
                                  <Send className="w-3 h-3" />
                                  <span>1-Clique</span>
                                </button>

                                {/* Custom Message / Edit Button */}
                                <button
                                  type="button"
                                  onClick={() => openApoioModal('adi', item.adiName, item.adiPhone, item.turma)}
                                  className="p-1.5 rounded-lg text-emerald-800 hover:bg-emerald-100/60 border border-emerald-300 bg-emerald-50 transition-colors cursor-pointer"
                                  title="Personalizar mensagem antes de enviar"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Badge de Demandas Pendentes + Atalho "+ Lembrete" */}
                            {(itemPendingDemands.length > 0 || canEdit) && (
                              <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-amber-200/70">
                                {itemPendingDemands.length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedAdiFilter(item.adiName || 'TODAS');
                                      setSelectedTurmaFilter('TODAS');
                                      setDemandStatusFilter('abertas');
                                      setViewMode('demandas');
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black transition-colors cursor-pointer"
                                    title={`Ver lembretes pendentes de ${item.adiName}`}
                                  >
                                    <span>
                                      📌 {itemPendingDemands.length}{' '}
                                      {itemPendingDemands.length === 1 ? 'pendente' : 'pendentes'}
                                    </span>
                                  </button>
                                ) : (
                                  <span className="text-[10px] font-semibold text-emerald-700">
                                    ✓ Sem pendências ADI
                                  </span>
                                )}

                                {canEdit && item.adiName && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openNewDemandForm(item.adiName, item.adiPhone, item.turma)
                                    }
                                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-extrabold transition-colors cursor-pointer"
                                    title={`Registrar lembrete para ${item.adiName}`}
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                    <span>Lembrete</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Block: Monitora Responsável */}
                          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <Users className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>Monitora Titular:</span>
                              </div>
                              <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                                {item.monitoraName || '—'}
                              </div>
                              <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                                <Phone className="w-2.5 h-2.5 text-slate-400" />
                                <span>{formatPhoneDisplay(item.monitoraPhone) || 'Sem telefone cadastrado'}</span>
                              </div>
                            </div>

                            {/* WhatsApp Fast Buttons for Monitora */}
                            <div className="flex items-center space-x-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => triggerOneClickWhatsApp(item.monitoraName, item.monitoraPhone, item.turma, 'monitora')}
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold text-white bg-slate-700 hover:bg-slate-800 shadow-xs active:scale-95 transition-all"
                                title={`Abrir WhatsApp direto com "${item.monitoraName}"`}
                              >
                                <Send className="w-3 h-3 text-emerald-400" />
                                <span>1-Clique</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => openApoioModal('monitora', item.monitoraName, item.monitoraPhone, item.turma)}
                                className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-200/80 border border-slate-300 bg-white transition-colors"
                                title="Personalizar mensagem antes de enviar"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Block: Monitora Assistente */}
                          <div className="bg-sky-50/50 border border-sky-200/80 rounded-xl p-2.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-sky-700">
                                <HeartHandshake className="w-3 h-3 text-sky-500 shrink-0" />
                                <span>Monitora Assistente:</span>
                              </div>
                              <div className="text-xs sm:text-sm font-bold text-sky-950 truncate">
                                {item.monitoraAssistenteName || <span className="text-slate-400 font-normal italic">Não atribuída</span>}
                              </div>
                              <div className="text-[10px] text-sky-600/90 font-semibold flex items-center gap-1">
                                <Phone className="w-2.5 h-2.5 text-sky-400" />
                                <span>{formatPhoneDisplay(item.monitoraAssistentePhone) || 'Sem telefone cadastrado'}</span>
                              </div>
                            </div>

                            {/* WhatsApp Fast Buttons for Monitora Assistente */}
                            {item.monitoraAssistenteName ? (
                              <div className="flex items-center space-x-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => triggerOneClickWhatsApp(item.monitoraAssistenteName!, item.monitoraAssistentePhone, item.turma, 'monitora_assistente')}
                                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold text-white bg-sky-600 hover:bg-sky-700 shadow-xs active:scale-95 transition-all"
                                  title={`Abrir WhatsApp direto com "${item.monitoraAssistenteName}"`}
                                >
                                  <Send className="w-3 h-3 text-sky-200" />
                                  <span>1-Clique</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openApoioModal('monitora_assistente', item.monitoraAssistenteName!, item.monitoraAssistentePhone, item.turma)}
                                  className="p-1.5 rounded-lg text-sky-800 hover:bg-sky-100/60 border border-sky-300 bg-sky-50 transition-colors"
                                  title="Personalizar mensagem antes de enviar"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : canEdit ? (
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                className="px-2 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100/70 border border-dashed border-sky-300 rounded-lg transition-colors"
                              >
                                + Atribuir
                              </button>
                            ) : null}
                          </div>

                          {/* Location & Observação */}
                          {(item.espacoBase || item.observacao) && (
                            <div className="text-[10px] text-slate-500 px-1 pt-1 border-t border-slate-100 flex items-center justify-between gap-2">
                              {item.espacoBase && (
                                <span className="flex items-center gap-1 truncate font-medium">
                                  <MapPin className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                  {item.espacoBase}
                                </span>
                              )}
                              {item.observacao && (
                                <span className="truncate italic text-slate-400 text-right">
                                  {item.observacao}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs shrink-0">
          <div className="text-slate-500 text-[11px] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              Mensagem padrão pré-formatada: <strong>"Olá, [Nome]! Preciso do seu apoio."</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl shadow-xs transition-colors"
          >
            Fechar Quadro
          </button>
        </div>
      </div>

      {/* Datalist of users for autocompletion */}
      <datalist id="staff-list">
        {staffNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {/* Embedded Apoio WhatsApp Modal */}
      <ApoioWhatsAppModal
        isOpen={apoioModalState.isOpen}
        onClose={() => setApoioModalState((prev) => ({ ...prev, isOpen: false }))}
        destinatarioRole={apoioModalState.destinatarioRole}
        destinatarioName={apoioModalState.destinatarioName}
        destinatarioPhone={apoioModalState.destinatarioPhone}
        turmaName={apoioModalState.turmaName}
        onUpdatePhone={(newPhone) => {
          // Atualiza o telefone na atribuição correspondente
          const target = atribuicoes.find((a) => a.turma === apoioModalState.turmaName);
          if (target) {
            const updated = { ...target };
            if (apoioModalState.destinatarioRole === 'adi') {
              updated.adiPhone = newPhone;
            } else if (apoioModalState.destinatarioRole === 'monitora_assistente') {
              updated.monitoraAssistentePhone = newPhone;
            } else {
              updated.monitoraPhone = newPhone;
            }
            onSaveAtribuicao(updated);
          }
        }}
      />
    </div>
  );
};
