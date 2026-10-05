import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  ShieldAlert,
  Award,
  HeartHandshake,
  Bus,
  Utensils,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Ban,
  Search,
  Download,
  Printer,
  ChevronDown,
  ChevronUp,
  FileText,
  Sparkles,
  UserCheck,
  Eye,
  Heart,
  X,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Save,
  RotateCcw,
  Loader2,
  Tag,
  ListPlus,
  Check,
} from 'lucide-react';
import type { jsPDF } from 'jspdf';
import { UserProfile } from '../types';
import {
  ManualNorma,
  ModuleCategory,
  NormaType,
  MODULE_METADATA,
  INITIAL_MANUAL_NORMAS,
} from '../types/manualNormas';
import {
  subscribeManualNormas,
  saveManualNormaToFirestore,
  deleteManualNormaFromFirestore,
  seedInitialManualNormasIfEmpty,
  syncOfficialManualNormasToFirestore,
} from '../firebase';
import { generateManualNormasPDF } from '../utils/pdfGenerator';
import { isCoordenador } from '../utils/authUtils';
import { PdfViewerModal } from './PdfViewerModal';

export interface ManualOrientacoesProps {
  currentUser?: UserProfile | null;
}

// Modal para Criação e Edição de Norma
interface EditNormaModalProps {
  isOpen: boolean;
  onClose: () => void;
  normaToEdit?: ManualNorma | null;
  onSave: (norma: ManualNorma) => Promise<void>;
  currentUser?: UserProfile | null;
}

const EditNormaModal: React.FC<EditNormaModalProps> = ({
  isOpen,
  onClose,
  normaToEdit,
  onSave,
  currentUser,
}) => {
  const isEditing = Boolean(normaToEdit && normaToEdit.id);

  const [moduleId, setModuleId] = useState<ModuleCategory>('normas_internas');
  const [sectionNumber, setSectionNumber] = useState('');
  const [sectionTitle, setSectionTitle] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<NormaType>('diretriz');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState<string[]>(['']);
  const [tagsInput, setTagsInput] = useState('');
  const [order, setOrder] = useState<number>(99);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (normaToEdit) {
      setModuleId(normaToEdit.moduleId || 'normas_internas');
      setSectionNumber(normaToEdit.sectionNumber || '');
      setSectionTitle(normaToEdit.sectionTitle || '');
      setTitle(normaToEdit.title || '');
      setType(normaToEdit.type || 'diretriz');
      setSummary(normaToEdit.summary || '');
      setDetails(
        Array.isArray(normaToEdit.details) && normaToEdit.details.length > 0
          ? [...normaToEdit.details]
          : ['']
      );
      setTagsInput(Array.isArray(normaToEdit.tags) ? normaToEdit.tags.join(', ') : '');
      setOrder(normaToEdit.order ?? 99);
    } else {
      // Default new norma values
      setModuleId('normas_internas');
      setSectionNumber('1.1');
      setSectionTitle('');
      setTitle('');
      setType('diretriz');
      setSummary('');
      setDetails(['']);
      setTagsInput('');
      setOrder(99);
    }
    setErrorMessage(null);
  }, [normaToEdit, isOpen]);

  if (!isOpen) return null;

  const handleDetailChange = (index: number, value: string) => {
    const updated = [...details];
    updated[index] = value;
    setDetails(updated);
  };

  const handleAddDetail = () => {
    setDetails([...details, '']);
  };

  const handleRemoveDetail = (index: number) => {
    if (details.length <= 1) {
      setDetails(['']);
      return;
    }
    const updated = details.filter((_, idx) => idx !== index);
    setDetails(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage('O título da norma é obrigatório.');
      return;
    }

    const cleanDetails = details.map((d) => d.trim()).filter((d) => d.length > 0);
    if (cleanDetails.length === 0) {
      setErrorMessage('Adicione pelo menos um item ou diretriz detalhada para a norma.');
      return;
    }

    const cleanTags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
      .filter((t) => t.length > 0);

    const normaId = normaToEdit?.id || `norma_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const moduleInfo = MODULE_METADATA[moduleId];

    const payload: ManualNorma = {
      id: normaId,
      moduleId,
      moduleTitle: moduleInfo ? moduleInfo.title : moduleId,
      sectionNumber: sectionNumber.trim() || undefined,
      sectionTitle: sectionTitle.trim() || undefined,
      title: title.trim(),
      type,
      summary: summary.trim(),
      details: cleanDetails,
      tags: cleanTags,
      order: Number(order) || 99,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name || 'Administração',
      createdAt: normaToEdit?.createdAt || new Date().toISOString(),
    };

    try {
      setIsSaving(true);
      setErrorMessage(null);
      await onSave(payload);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao gravar norma no Firestore.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              {isEditing ? <Pencil className="w-5 h-5 text-amber-300" /> : <Plus className="w-5 h-5 text-indigo-300" />}
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white leading-tight">
                {isEditing ? 'Editar Norma do Manual' : 'Cadastrar Nova Norma'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEditing ? 'Atualize as diretrizes salvas no Firestore' : 'Adicione uma nova diretriz ao acervo institucional'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Module Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Módulo do Manual: *
              </label>
              <select
                value={moduleId}
                onChange={(e) => setModuleId(e.target.value as ModuleCategory)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500"
              >
                <option value="normas_internas">Módulo 1: Normas Internas do Integral</option>
                <option value="academia_transporte">Módulo 2: Academia, Transporte e Deslocamento</option>
                <option value="guia_sensivel">Módulo 3: Guia de Abordagem Sensível</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Classificação / Tipo de Alerta: *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as NormaType)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500"
              >
                <option value="diretriz">🔵 Diretriz Institucional (Azul)</option>
                <option value="proibicao">🔴 Proibição Expressa / Falta Grave (Vermelho)</option>
                <option value="alerta">🟡 Atenção & Segurança (Âmbar)</option>
                <option value="recomendado">🟢 Boa Prática Recomendada (Verde)</option>
              </select>
            </div>
          </div>

          {/* Section Number & Section Title */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nº da Seção:
              </label>
              <input
                type="text"
                value={sectionNumber}
                onChange={(e) => setSectionNumber(e.target.value)}
                placeholder="Ex: 1.3, 2.1, 3.2"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Título do Grupo / Seção:
              </label>
              <input
                type="text"
                value={sectionTitle}
                onChange={(e) => setSectionTitle(e.target.value)}
                placeholder="Ex: Proibições Expressas, Transporte Escolar"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Norma Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Título da Norma / Regra: *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Uso Particular de Smartphone durante o Atendimento"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          {/* Summary */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Resumo / Justificativa Principal:
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Breve frase que resume o objetivo ou valor desta regra..."
              rows={2}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Dynamic Rule Details / Bullets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Itens e Diretrizes Detalhadas (Bullets): *
              </label>
              <button
                type="button"
                onClick={handleAddDetail}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Item</span>
              </button>
            </div>

            <div className="space-y-2">
              {details.map((detail, idx) => (
                <div key={idx} className="flex items-start space-x-2">
                  <span className="text-xs font-bold text-slate-400 mt-2 shrink-0">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={detail}
                    onChange={(e) => handleDetailChange(idx, e.target.value)}
                    placeholder={`Diretriz ou instrução específica ${idx + 1}...`}
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveDetail(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                    title="Remover este item"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Tags and Order */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tags para Busca em Tempo Real (separadas por vírgula):
              </label>
              <div className="relative">
                <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="celular, segurança, lgpd, uniforme, piscina"
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ordem de Exibição:
              </label>
              <input
                type="number"
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
                min={1}
                max={999}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl font-bold focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando no Firestore...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{isEditing ? 'Salvar Alterações' : 'Cadastrar Norma'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const ManualOrientacoes: React.FC<ManualOrientacoesProps> = ({ currentUser }) => {
  const isAdmin = isCoordenador(currentUser);

  // Dynamic Normas State from Firestore
  const [normas, setNormas] = useState<ManualNorma[]>(() => {
    try {
      const cached = localStorage.getItem('crescer_manual_normas_cache');
      if (cached) return JSON.parse(cached);
    } catch {}
    return INITIAL_MANUAL_NORMAS;
  });

  const [isLoading, setIsLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<ModuleCategory | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Feedback Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Edit / Create Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [normaEditing, setNormaEditing] = useState<ManualNorma | null>(null);

  // Delete Confirmation State
  const [normaDeleting, setNormaDeleting] = useState<ManualNorma | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // PDF Preview State
  const [pdfPreviewState, setPdfPreviewState] = useState<{
    isOpen: boolean;
    doc?: jsPDF | null;
    dataUrl: string | null;
    blobUrl: string | null;
    filename: string;
    title: string;
    onDownload?: () => void;
  }>({
    isOpen: false,
    doc: null,
    dataUrl: null,
    blobUrl: null,
    filename: '',
    title: '',
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Subscribe to real-time updates from Firestore collection 'manual_normas'
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeManualNormas(
      (items) => {
        setNormas(items);
        setIsLoading(false);
      },
      (err) => {
        console.warn('Erro ao sincronizar manual_normas:', err);
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Set initial expanded sections when normas load
  useEffect(() => {
    if (Object.keys(expandedSections).length === 0 && normas.length > 0) {
      const init: Record<string, boolean> = {};
      normas.slice(0, 3).forEach((n) => {
        init[n.id] = true;
      });
      setExpandedSections(init);
    }
  }, [normas.length]);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleExpandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    normas.forEach((n) => {
      allExpanded[n.id] = true;
    });
    setExpandedSections(allExpanded);
  };

  const handleCollapseAll = () => {
    setExpandedSections({});
  };

  // Filtered Normas based on Module and Search Term
  const filteredNormas = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return normas.filter((norma) => {
      if (selectedModule !== 'all' && norma.moduleId !== selectedModule) {
        return false;
      }

      if (!term) return true;

      const matchTitle = norma.title.toLowerCase().includes(term);
      const matchSummary = (norma.summary || '').toLowerCase().includes(term);
      const matchSection = (norma.sectionTitle || '').toLowerCase().includes(term);
      const matchModule = (norma.moduleTitle || '').toLowerCase().includes(term);
      const matchDetails = Array.isArray(norma.details) && norma.details.some((d) => d.toLowerCase().includes(term));
      const matchTags = Array.isArray(norma.tags) && norma.tags.some((t) => t.toLowerCase().includes(term));

      return matchTitle || matchSummary || matchSection || matchModule || matchDetails || matchTags;
    });
  }, [normas, selectedModule, searchTerm]);

  // Statistics counters
  const totalCount = normas.length;
  const countProibicoes = useMemo(() => normas.filter((n) => n.type === 'proibicao').length, [normas]);
  const countRecomendadas = useMemo(() => normas.filter((n) => n.type === 'recomendado').length, [normas]);

  // Handle Save Norma (Create or Edit)
  const handleSaveNorma = async (norma: ManualNorma) => {
    await saveManualNormaToFirestore(norma);
    showToast(normaEditing ? 'Norma atualizada com sucesso no Firestore!' : 'Nova norma cadastrada no Firestore com sucesso!');
  };

  // Handle Delete Norma
  const handleConfirmDelete = async () => {
    if (!normaDeleting) return;
    try {
      setIsDeleting(true);
      await deleteManualNormaFromFirestore(normaDeleting.id);
      showToast('Norma excluída do Firestore com sucesso!');
      setNormaDeleting(null);
    } catch (err: any) {
      alert(`Erro ao excluir norma: ${err?.message || 'Falha na conexão'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Trigger Dynamic PDF Generation with Institutional Timbre
  const handleGeneratePDF = () => {
    const targetModule = selectedModule !== 'all' ? selectedModule : undefined;
    const { doc, blobUrl, dataUrl, filename, download } = generateManualNormasPDF(normas, targetModule);

    setPdfPreviewState({
      isOpen: true,
      doc,
      dataUrl,
      blobUrl,
      filename,
      title: 'Manual de Orientações, Normas Internas e Guia de Abordagem Sensível',
      onDownload: download,
    });
  };

  const [isSyncingOfficial, setIsSyncingOfficial] = useState(false);

  // Sincronizar as 32 normas reais dos documentos oficiais do Colégio Crescer
  const handleSyncOfficialDocuments = async () => {
    if (!confirm('Deseja sincronizar as 32 normas reais extraídas dos documentos oficiais do Colégio Crescer no Firestore?')) {
      return;
    }
    try {
      setIsSyncingOfficial(true);
      await syncOfficialManualNormasToFirestore();
      showToast('32 normas oficiais do Colégio Crescer sincronizadas com sucesso no Firestore!');
    } catch (e: any) {
      alert(`Erro ao sincronizar: ${e?.message || 'Falha na conexão'}`);
    } finally {
      setIsSyncingOfficial(false);
    }
  };

  // Seed default data if empty (Admin quick recovery button)
  const handleRestoreDefaults = async () => {
    if (!confirm('Deseja restaurar as 32 normas institucionais oficiais do Colégio Crescer no Firestore?')) {
      return;
    }
    try {
      setIsLoading(true);
      await syncOfficialManualNormasToFirestore();
      showToast('32 normas oficiais restauradas com sucesso no Firestore!');
    } catch (e: any) {
      alert(`Erro ao restaurar: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Floating Action Feedback Toast */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 bg-slate-950/95 border border-indigo-500/40 text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-top-3">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/25 text-indigo-300 border border-indigo-400/30">
                <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>Central Dinâmica de Normas</span>
              </span>
              {isAdmin && (
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  Modo Admin / Coordenação Ativo
                </span>
              )}
              <span className="text-xs text-slate-400 font-medium">
                Vigência 2026/2027 • Colégio Crescer
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Manual de Normas e Abordagem Sensível
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Diretrizes de conduta interna, segurança externa no transporte e academia, e guia socioemocional de mediação respeitosa para monitoras e equipe pedagógica.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Admin Action: + Nova Norma */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setNormaEditing(null);
                  setIsEditModalOpen(true);
                }}
                className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-emerald-700/30 transition-all flex items-center space-x-2 cursor-pointer"
                title="Cadastrar uma nova norma no banco de dados"
              >
                <Plus className="w-4 h-4 text-emerald-200" />
                <span>+ Nova Norma</span>
              </button>
            )}

            {/* Admin Action: Sincronizar Normas Oficiais dos PDFs */}
            {isAdmin && (
              <button
                type="button"
                onClick={handleSyncOfficialDocuments}
                disabled={isSyncingOfficial}
                className="px-3.5 py-2.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-2xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-60"
                title="Sincronizar as 32 normas reais dos documentos oficiais do Colégio Crescer no Firestore"
              >
                {isSyncingOfficial ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                ) : (
                  <RotateCcw className="w-4 h-4 text-amber-400" />
                )}
                <span>Sincronizar Normas Oficiais</span>
              </button>
            )}

            {/* Baixar PDF Oficial */}
            <button
              type="button"
              onClick={handleGeneratePDF}
              className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-indigo-600/30 transition-all flex items-center space-x-2 cursor-pointer"
              title="Gerar e visualizar PDF oficial com timbre do Colégio Crescer"
            >
              <Printer className="w-4 h-4 text-amber-300" />
              <span>Baixar Manual em PDF</span>
            </button>

            {/* Admin Emergency Recovery */}
            {isAdmin && normas.length < 5 && (
              <button
                type="button"
                onClick={handleRestoreDefaults}
                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-2xl transition-colors cursor-pointer"
                title="Restaurar normas padrão no Firestore"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Quick Highlights Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800/80">
          <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total no Firestore</span>
            <span className="text-lg font-black text-white">{totalCount} normas salvas</span>
          </div>
          <div className="bg-rose-950/40 p-3 rounded-2xl border border-rose-800/40">
            <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider block">Proibições / Graves</span>
            <span className="text-lg font-black text-rose-400">{countProibicoes} regras</span>
          </div>
          <div className="bg-emerald-950/40 p-3 rounded-2xl border border-emerald-800/40">
            <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">Boas Práticas</span>
            <span className="text-lg font-black text-emerald-400">{countRecomendadas} condutas</span>
          </div>
          <div className="bg-indigo-950/40 p-3 rounded-2xl border border-indigo-800/40">
            <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block">Diretrizes Sensíveis</span>
            <span className="text-lg font-black text-indigo-300">Tolerância Zero a Gritos</span>
          </div>
        </div>
      </div>

      {/* Control Bar: Categories & Global Search */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Module Category Filters */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setSelectedModule('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                selectedModule === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Todos os Módulos ({normas.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedModule('normas_internas')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                selectedModule === 'normas_internas'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Award className="w-3.5 h-3.5 text-amber-300" />
              <span>1. Normas Internas ({normas.filter((n) => n.moduleId === 'normas_internas').length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedModule('academia_transporte')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                selectedModule === 'academia_transporte'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Bus className="w-3.5 h-3.5 text-amber-200" />
              <span>2. Academia & Transporte ({normas.filter((n) => n.moduleId === 'academia_transporte').length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedModule('guia_sensivel')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                selectedModule === 'guia_sensivel'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <HeartHandshake className="w-3.5 h-3.5 text-rose-200" />
              <span>3. Abordagem Sensível ({normas.filter((n) => n.moduleId === 'guia_sensivel').length})</span>
            </button>
          </div>

          {/* Expand / Collapse All */}
          <div className="flex items-center space-x-2 self-end md:self-auto">
            <button
              type="button"
              onClick={handleExpandAll}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            >
              Expandir Todos
            </button>
            <button
              type="button"
              onClick={handleCollapseAll}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            >
              Recolher Todos
            </button>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por palavras-chave (ex: celular, gritar, banho, van, almoço, puxar, ponto, uniforme)..."
            className="w-full pl-10 pr-10 py-2.5 text-xs font-medium text-slate-800 placeholder-slate-400 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              title="Limpar busca"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {searchTerm && (
          <div className="text-xs text-slate-500 px-1 flex items-center justify-between">
            <span>
              Encontradas <strong>{filteredNormas.length} normas</strong> correspondentes à busca "{searchTerm}".
            </span>
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="text-indigo-600 hover:underline font-semibold cursor-pointer"
            >
              Ver todas as orientações
            </button>
          </div>
        )}
      </div>

      {/* Normas List */}
      <div className="space-y-3.5">
        {isLoading && normas.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
            <p className="text-xs font-bold text-slate-500">
              Carregando manual e normas do Firestore...
            </p>
          </div>
        ) : filteredNormas.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Nenhuma norma encontrada</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Nenhuma norma corresponde ao termo pesquisado. Tente buscar por palavras como "grito", "celular", "uniforme" ou limpe o filtro.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedModule('all');
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              Limpar Filtros e Busca
            </button>
          </div>
        ) : (
          filteredNormas.map((norma) => {
            const isExpanded = !!expandedSections[norma.id];
            const isProibicao = norma.type === 'proibicao';
            const isAlerta = norma.type === 'alerta';
            const isRecomendado = norma.type === 'recomendado';

            const cardBorder = isProibicao
              ? 'border-rose-200 hover:border-rose-300 bg-white'
              : isAlerta
              ? 'border-amber-200 hover:border-amber-300 bg-white'
              : isRecomendado
              ? 'border-emerald-200 hover:border-emerald-300 bg-white'
              : 'border-slate-200 hover:border-indigo-200 bg-white';

            const badgeBg = isProibicao
              ? 'bg-rose-600 text-white'
              : isAlerta
              ? 'bg-amber-500 text-white'
              : isRecomendado
              ? 'bg-emerald-600 text-white'
              : 'bg-indigo-600 text-white';

            const badgeIcon = isProibicao ? (
              <Ban className="w-3 h-3 text-rose-200 shrink-0" />
            ) : isAlerta ? (
              <AlertTriangle className="w-3 h-3 text-amber-200 shrink-0" />
            ) : isRecomendado ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-200 shrink-0" />
            ) : (
              <Sparkles className="w-3 h-3 text-indigo-200 shrink-0" />
            );

            const badgeLabel = isProibicao
              ? 'PROIBIÇÃO / INFRAÇÃO GRAVE'
              : isAlerta
              ? 'ATENÇÃO & SEGURANÇA'
              : isRecomendado
              ? 'BOA PRÁTICA RECOMENDADA'
              : 'DIRETRIZ INSTITUCIONAL';

            const moduleMeta = MODULE_METADATA[norma.moduleId];

            return (
              <div
                key={norma.id}
                className={`rounded-3xl border ${cardBorder} shadow-xs overflow-hidden transition-all`}
              >
                {/* Accordion Card Header */}
                <div className="p-4 sm:p-5 flex items-start sm:items-center justify-between gap-3 text-left">
                  <div
                    onClick={() => toggleSection(norma.id)}
                    className="flex-1 flex items-start sm:items-center space-x-3.5 cursor-pointer"
                  >
                    <div className="p-2.5 rounded-2xl bg-slate-900 text-white shrink-0 mt-0.5 sm:mt-0 shadow-xs">
                      {norma.moduleId === 'normas_internas' ? (
                        <Award className="w-5 h-5 text-indigo-400" />
                      ) : norma.moduleId === 'academia_transporte' ? (
                        <Bus className="w-5 h-5 text-amber-400" />
                      ) : (
                        <HeartHandshake className="w-5 h-5 text-rose-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${badgeBg}`}>
                          {badgeIcon}
                          <span>{badgeLabel}</span>
                        </span>
                        {norma.sectionNumber && (
                          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                            Seção {norma.sectionNumber}
                          </span>
                        )}
                        <span className="text-[11px] font-bold text-slate-400">
                          {moduleMeta ? moduleMeta.title : norma.moduleTitle}
                        </span>
                      </div>

                      <h3 className="text-base font-extrabold text-slate-900">
                        {norma.title}
                      </h3>
                      {norma.summary && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                          {norma.summary}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions: Admin (Edit / Delete) + Toggle Chevron */}
                  <div className="flex items-center space-x-2 shrink-0">
                    {isAdmin && (
                      <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setNormaEditing(norma);
                            setIsEditModalOpen(true);
                          }}
                          className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                          title="Editar esta norma"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setNormaDeleting(norma);
                          }}
                          className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                          title="Excluir esta norma do banco"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleSection(norma.id)}
                      className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                      title={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Card Details */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-1 space-y-3.5 border-t border-slate-100 bg-slate-50/50">
                    {/* Summary highlight */}
                    {norma.summary && (
                      <p className="text-xs text-slate-700 font-semibold bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
                        {norma.summary}
                      </p>
                    )}

                    {/* Bullet Points Details */}
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                        Diretrizes e Procedimentos:
                      </span>
                      <ul className="space-y-2">
                        {norma.details.map((detail, dIdx) => (
                          <li
                            key={dIdx}
                            className="text-xs text-slate-800 flex items-start space-x-2 leading-relaxed"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Tags & Footer metadata */}
                    <div className="pt-2 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {Array.isArray(norma.tags) &&
                          norma.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200"
                            >
                              #{tag}
                            </span>
                          ))}
                      </div>

                      {norma.updatedAt && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          Atualizado em {new Date(norma.updatedAt).toLocaleDateString('pt-BR')} {norma.updatedBy ? `por ${norma.updatedBy}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Admin Edit / Create Modal */}
      {isEditModalOpen && (
        <EditNormaModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setNormaEditing(null);
          }}
          normaToEdit={normaEditing}
          onSave={handleSaveNorma}
          currentUser={currentUser}
        />
      )}

      {/* Admin Delete Confirmation Dialog */}
      {normaDeleting && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-extrabold text-slate-900">
                Excluir Norma do Manual?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Você tem certeza que deseja remover a norma <strong>"{normaDeleting.title}"</strong>? Esta ação excluirá a diretriz do Firestore para todos os colaboradores.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => setNormaDeleting(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Viewer & Print Modal */}
      {pdfPreviewState.isOpen && (
        <PdfViewerModal
          isOpen={pdfPreviewState.isOpen}
          onClose={() => setPdfPreviewState((prev) => ({ ...prev, isOpen: false }))}
          doc={pdfPreviewState.doc}
          dataUrl={pdfPreviewState.dataUrl}
          blobUrl={pdfPreviewState.blobUrl}
          filename={pdfPreviewState.filename}
          title={pdfPreviewState.title}
          onDownload={pdfPreviewState.onDownload}
        />
      )}
    </div>
  );
};
