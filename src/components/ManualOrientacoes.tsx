import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Printer,
  ChevronDown,
  ChevronUp,
  Sparkles,
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
  Check,
  Radio,
  Smartphone,
  Eye,
  Zap,
  ClipboardCheck,
  FileCheck,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type { jsPDF } from 'jspdf';
import { UserProfile, NormaReminderRecord } from '../types';
import {
  ManualNorma,
  ModuleCategory,
  NormaType,
  NormaAceite,
  MODULE_METADATA,
  INITIAL_MANUAL_NORMAS,
  compareNormasBySectionNumber,
  parseSectionNumber,
} from '../types/manualNormas';
import {
  subscribeManualNormas,
  saveManualNormaToFirestore,
  deleteManualNormaFromFirestore,
  syncOfficialManualNormasToFirestore,
  saveNormaAceiteToFirestore,
  subscribeAllNormasAceites,
  subscribeUsers,
  subscribeNormasReminders,
} from '../firebase';
import {
  generateManualNormasPDF,
  generateRelatorioConformidadeAceitesPDF,
} from '../utils/pdfGenerator';
import { isCoordenador, getLocalUsersList } from '../utils/authUtils';
import { PdfViewerModal } from './PdfViewerModal';
import { EnviarLembreteModal } from './EnviarLembreteModal';
import { ManualNormaCard } from './ManualNormaCard';
import { TermoAceiteManual } from './TermoAceiteManual';
import {
  subscribeUserManualProgress,
  markNormaCompletedInFirestore,
  saveFullManualAcknowledgmentToFirestore,
  subscribeUserManualAcknowledgment,
  ManualAcknowledgmentRecord,
  UserManualProgress,
} from '../services/manualProgressService';

export interface ManualOrientacoesProps {
  currentUser?: UserProfile | null;
}

// Tipos para Filtro Rápido por Alerta
export type AlertFilterType = 'all' | 'proibicoes_alertas' | 'boas_praticas' | 'diretrizes';

// Tipos para Categorias Temáticas Sanfonadas
export type ThematicCategoryId =
  | 'rotina_operacional'
  | 'seguranca_cuidados'
  | 'postura_fardamento'
  | 'guia_socioemocional';

export interface ThematicCategoryMeta {
  id: ThematicCategoryId;
  title: string;
  subtitle: string;
  badgeLabel: string;
  theme: 'blue' | 'amber' | 'purple' | 'rose';
  borderClass: string;
  headerBgClass: string;
  iconBgClass: string;
}

export const THEMATIC_CATEGORIES: ThematicCategoryMeta[] = [
  {
    id: 'rotina_operacional',
    title: 'Categoria 1: Rotina Operacional do Integral',
    subtitle: 'Ponto Eletrônico, Rádio Frequência 2, Refeitório, Caderno Vai e Volta, Acolhimento e Lições',
    badgeLabel: 'Rotina & Fluxos',
    theme: 'blue',
    borderClass: 'border-blue-200/90 hover:border-blue-300',
    headerBgClass: 'bg-gradient-to-r from-blue-900 to-slate-900 text-white',
    iconBgClass: 'bg-blue-500/20 text-blue-300',
  },
  {
    id: 'seguranca_cuidados',
    title: 'Categoria 2: Segurança, Espaços e Cuidados',
    subtitle: 'Parque/Parcão, Brinquedão, Banheiros, Troca de Fraldas e Luvas, Alergias, Culinária e Academia',
    badgeLabel: 'Segurança & Cuidados',
    theme: 'amber',
    borderClass: 'border-amber-200/90 hover:border-amber-300',
    headerBgClass: 'bg-gradient-to-r from-amber-900 to-slate-900 text-white',
    iconBgClass: 'bg-amber-500/20 text-amber-300',
  },
  {
    id: 'postura_fardamento',
    title: 'Categoria 3: Postura, Fardamento e Proibições',
    subtitle: 'Vestuário/Sem Bijuterias, Celular Proibido, Conversas Paralelas, Proibições Gerais e ECA',
    badgeLabel: 'Conduta & Fardamento',
    theme: 'purple',
    borderClass: 'border-purple-200/90 hover:border-purple-300',
    headerBgClass: 'bg-gradient-to-r from-purple-950 to-slate-900 text-white',
    iconBgClass: 'bg-purple-500/20 text-purple-300',
  },
  {
    id: 'guia_socioemocional',
    title: 'Categoria 4: Guia Socioemocional e Abordagem Sensível',
    subtitle: 'Não Gritar, Não Puxar, Não Pegar com Força, Paciência e Mediação de Conflitos em 3 Passos',
    badgeLabel: 'Abordagem Sensível',
    theme: 'rose',
    borderClass: 'border-rose-200/90 hover:border-rose-300',
    headerBgClass: 'bg-gradient-to-r from-rose-950 to-slate-900 text-white',
    iconBgClass: 'bg-rose-500/20 text-rose-300',
  },
];

// Helper para mapear norma para sua categoria temática
export function getThematicCategory(norma: ManualNorma): ThematicCategoryId {
  const normId = (norma.id || '').toLowerCase();
  const title = (norma.title || '').toLowerCase();
  const sec = (norma.sectionNumber || '').toLowerCase();

  // 4. Guia Socioemocional
  if (
    norma.moduleId === 'guia_sensivel' ||
    normId.includes('sensivel') ||
    title.includes('gritar') ||
    title.includes('puxar') ||
    title.includes('força') ||
    title.includes('aspereza') ||
    title.includes('paciência') ||
    title.includes('ameaçar') ||
    title.includes('conflito') ||
    sec.includes('7')
  ) {
    return 'guia_socioemocional';
  }

  // 3. Postura e Fardamento
  if (
    normId.includes('vestuario') ||
    normId.includes('celular') ||
    normId.includes('comunicacao_respeitosa') ||
    normId.includes('proibicoes_gerais') ||
    normId.includes('penalidades') ||
    normId.includes('chinelos') ||
    title.includes('vestuário') ||
    title.includes('celular') ||
    title.includes('conversas paralelas') ||
    title.includes('penalidades') ||
    title.includes('comentário inadequado') ||
    title.includes('fardamento')
  ) {
    return 'postura_fardamento';
  }

  // 2. Segurança e Cuidados
  if (
    normId.includes('parque') ||
    normId.includes('cuidados_bebes') ||
    normId.includes('academia') ||
    normId.includes('culinaria') ||
    title.includes('parque') ||
    title.includes('parcão') ||
    title.includes('maternal') ||
    title.includes('fralda') ||
    title.includes('academia') ||
    title.includes('culinária') ||
    title.includes('banheiro') ||
    title.includes('alimentos')
  ) {
    return 'seguranca_cuidados';
  }

  // 1. Rotina Operacional (Ponto, Rádio, Refeitório, Vai e Volta, Lições, Acolhimento)
  return 'rotina_operacional';
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

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
                <option value="diretriz">🔵 Orientação Institucional - Programa do Integral (Azul)</option>
                <option value="proibicao">🔴 Proibição Expressa / Falta Grave (Vermelho)</option>
                <option value="alerta">🟡 Atenção & Segurança (Âmbar)</option>
                <option value="recomendado">🟢 Boa Prática Recomendada (Verde)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nº da Seção:
              </label>
              <input
                type="text"
                value={sectionNumber}
                onChange={(e) => setSectionNumber(e.target.value)}
                placeholder="Ex: 1.3, 2.1, 8"
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
                  placeholder="celular, rádio, frequência 2, uniforme, parque"
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

// Modal de Status de Aceite e Auditoria da Equipe
interface StatusAceiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserProfile[];
  aceites: NormaAceite[];
  reminders?: NormaReminderRecord[];
  currentUser?: UserProfile | null;
  normas?: ManualNorma[];
  onSendReminder: (userId: string, userName: string) => void;
  reminderSentUsers: Record<string, boolean>;
  onExportPDF: () => void;
}

const StatusAceiteModal: React.FC<StatusAceiteModalProps> = ({
  isOpen,
  onClose,
  users,
  aceites,
  reminders = [],
  currentUser,
  normas = [],
  onSendReminder,
  reminderSentUsers,
  onExportPDF,
}) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'cientes' | 'pendentes'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserForReminder, setSelectedUserForReminder] = useState<UserProfile | null>(null);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);

  if (!isOpen) return null;

  // Mapear cada usuário para seu registro de aceite e lembrete
  const usersWithAceite = users
    .filter((u) => u.status !== 'inativo' && u.name)
    .map((user) => {
      const userAceite = aceites.find(
        (a) => a.userId === user.id || (user.email && a.userEmail?.toLowerCase() === user.email.toLowerCase())
      );
      const userReminder = (reminders || []).find(
        (r) => r.userId === user.id
      );
      return {
        user,
        aceite: userAceite || null,
        reminder: userReminder || null,
        isSigned: Boolean(userAceite),
      };
    })
    .sort((a, b) => {
      // Pendentes primeiro, depois ordem alfabética
      if (a.isSigned !== b.isSigned) {
        return a.isSigned ? 1 : -1;
      }
      return a.user.name.localeCompare(b.user.name);
    });

  const total = usersWithAceite.length;
  const totalCientes = usersWithAceite.filter((u) => u.isSigned).length;
  const totalPendentes = total - totalCientes;
  const taxaConformidade = total > 0 ? Math.round((totalCientes / total) * 100) : 0;

  const filteredList = usersWithAceite.filter((item) => {
    if (filterStatus === 'cientes' && !item.isSigned) return false;
    if (filterStatus === 'pendentes' && item.isSigned) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = item.user.name.toLowerCase().includes(q);
      const matchEmail = (item.user.email || '').toLowerCase().includes(q);
      const matchRole = (item.user.cargoLabel || item.user.role || '').toLowerCase().includes(q);
      return matchName || matchEmail || matchRole;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-300 rounded-2xl">
              <ClipboardCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white leading-tight">
                Status de Aceite e Auditoria da Equipe
              </h3>
              <p className="text-xs text-slate-400">
                Acompanhamento em tempo real de ciência e conformidade do Manual • Colégio Crescer
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onExportPDF}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-xs cursor-pointer"
              title="Gerar Relatório Oficial de Conformidade em PDF"
            >
              <Printer className="w-3.5 h-3.5 text-amber-300" />
              <span>Exportar Relatório PDF</span>
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

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total da Equipe</span>
              <span className="text-xl font-black text-slate-900">{total}</span>
              <span className="text-[11px] text-slate-500 block">Colaboradores ativos</span>
            </div>
            <div className="bg-emerald-50/80 p-3.5 rounded-2xl border border-emerald-200">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Cientes e Assinados</span>
              <span className="text-xl font-black text-emerald-800">{totalCientes}</span>
              <span className="text-[11px] text-emerald-600 font-semibold block">{taxaConformidade}% da equipe</span>
            </div>
            <div className="bg-rose-50/80 p-3.5 rounded-2xl border border-rose-200">
              <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">Pendentes de Leitura</span>
              <span className="text-xl font-black text-rose-800">{totalPendentes}</span>
              <span className="text-[11px] text-rose-600 font-semibold block">Aguardando confirmação</span>
            </div>
            <div className="bg-indigo-50/80 p-3.5 rounded-2xl border border-indigo-200">
              <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">Taxa de Conformidade</span>
              <span className="text-xl font-black text-indigo-800">{taxaConformidade}%</span>
              <span className="text-[11px] text-indigo-600 font-semibold block">Meta: 100%</span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center space-x-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filterStatus === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos ({total})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('cientes')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                  filterStatus === 'cientes'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-700 hover:text-emerald-900'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Cientes ({totalCientes})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('pendentes')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                  filterStatus === 'pendentes'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-rose-700 hover:text-rose-900'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Pendentes ({totalPendentes})</span>
              </button>
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por colaborador ou email..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
              />
            </div>
          </div>

          {/* Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Colaborador / Função</th>
                    <th className="px-4 py-3">E-mail</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Data / Hora Aceite</th>
                    <th className="px-4 py-3 text-center">Último Lembrete Enviado</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        Nenhum colaborador encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredList.map((item) => {
                      const isSigned = item.isSigned;
                      const hasSentReminder = Boolean(reminderSentUsers[item.user.id]) || Boolean(item.reminder);
                      const cargo = item.user.cargoLabel || (item.user.role === 'coordenador' ? 'Coordenação' : item.user.role === 'professor' ? 'Docente' : item.user.role === 'auxiliar' ? 'Monitora / Estagiária' : 'Colaborador');

                      return (
                        <tr key={item.user.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center space-x-2.5">
                              <div className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                                {item.user.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span className="font-extrabold text-slate-900 block leading-tight">
                                  {item.user.name}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-500">
                                  {cargo}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-slate-600 font-medium">
                            {item.user.email || '—'}
                          </td>

                          <td className="px-4 py-3 text-center">
                            {isSigned ? (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span>Ciente</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                                <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                                <span>Pendente</span>
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-center text-slate-600 font-medium">
                            {isSigned && item.aceite?.timestamp ? (
                              <span className="text-[11px]">
                                {new Date(item.aceite.timestamp).toLocaleDateString('pt-BR')}{' '}
                                <span className="text-slate-400 font-normal">
                                  às {new Date(item.aceite.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">Aguardando</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-center text-slate-600 font-medium">
                            {item.reminder?.lastSentAt ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="text-[11px] font-bold text-slate-800">
                                  {new Date(item.reminder.lastSentAt).toLocaleDateString('pt-BR')}{' '}
                                  <span className="text-slate-400 font-normal">
                                    às {new Date(item.reminder.lastSentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </span>
                                <span
                                  className={`inline-flex items-center space-x-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full mt-0.5 ${
                                    item.reminder.channel === 'whatsapp'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : item.reminder.channel === 'app'
                                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}
                                >
                                  {item.reminder.channel === 'whatsapp' ? '📱 WhatsApp' : item.reminder.channel === 'app' ? '🔔 App' : '📱+🔔 Ambos'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">Nenhum</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right">
                            {isSigned ? (
                              <span className="text-[11px] text-emerald-600 font-bold inline-flex items-center space-x-1">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                                <span>Concluído</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedUserForReminder(item.user);
                                  setIsReminderModalOpen(true);
                                }}
                                className="px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center space-x-1 ml-auto cursor-pointer bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-2xs hover:shadow-xs"
                                title="Disparar lembrete via WhatsApp Direct ou Notificação no App"
                              >
                                <Send className="w-3 h-3 text-indigo-600" />
                                <span>{hasSentReminder ? 'Reenviar Lembrete' : 'Enviar Lembrete'}</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal de Disparo de Lembrete (WhatsApp Direct e Notificação no App) */}
        {isReminderModalOpen && selectedUserForReminder && (
          <EnviarLembreteModal
            isOpen={isReminderModalOpen}
            onClose={() => {
              setIsReminderModalOpen(false);
              setSelectedUserForReminder(null);
            }}
            targetUser={selectedUserForReminder}
            currentUser={currentUser || null}
            normas={normas}
            defaultNormaTitle="Normas Internas e Rotina do Integral (Manual 2026)"
            onReminderSent={(res) => {
              if (selectedUserForReminder) {
                onSendReminder(selectedUserForReminder.id, selectedUserForReminder.name);
              }
            }}
          />
        )}

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Colégio Crescer • Registro Digital de Conformidade Trabalhista e Pedagógica
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
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
  const [alertTypeFilter, setAlertTypeFilter] = useState<AlertFilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Active Quick Pin State
  const [activeQuickPin, setActiveQuickPin] = useState<string | null>(null);

  // Targeted Card Highlight
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);

  // Accordion state for Thematic Categories (all open by default for comprehensive overview)
  const [expandedCategories, setExpandedCategories] = useState<Record<ThematicCategoryId, boolean>>({
    rotina_operacional: true,
    seguranca_cuidados: true,
    postura_fardamento: true,
    guia_socioemocional: true,
  });

  // Accordion state for individual Norma Cards
  const [expandedNormas, setExpandedNormas] = useState<Record<string, boolean>>({});

  // Feedback Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Edit / Create Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [normaEditing, setNormaEditing] = useState<ManualNorma | null>(null);

  // Delete Confirmation State
  const [normaDeleting, setNormaDeleting] = useState<ManualNorma | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sincronização oficial
  const [isSyncingOfficial, setIsSyncingOfficial] = useState(false);

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

  // Estados para Gestão de Aceite Digital e Auditoria da Equipe
  const [allUsers, setAllUsers] = useState<UserProfile[]>(() => getLocalUsersList());
  const [allAceites, setAllAceites] = useState<NormaAceite[]>([]);
  const [allReminders, setAllReminders] = useState<NormaReminderRecord[]>([]);
  const [isConfirmingAceite, setIsConfirmingAceite] = useState(false);
  const [hasDeclaredCheckbox, setHasDeclaredCheckbox] = useState(false);
  const [isStatusAceiteModalOpen, setIsStatusAceiteModalOpen] = useState(false);
  const [reminderSentUsers, setReminderSentUsers] = useState<Record<string, boolean>>({});

  // Novo mecanismo de dois níveis: Checklist por Norma + Trava do Termo Geral
  const [normIdsCompleted, setNormIdsCompleted] = useState<string[]>([]);
  const [currentAckRecord, setCurrentAckRecord] = useState<ManualAcknowledgmentRecord | null>(null);

  const currentUserId = currentUser?.id || (currentUser as any)?.uid || '';

  // Escuta o array 'normIdsCompleted' do Firestore do usuário logado
  useEffect(() => {
    if (!currentUserId) {
      setNormIdsCompleted([]);
      return;
    }
    const unsub = subscribeUserManualProgress(currentUserId, (prog) => {
      setNormIdsCompleted(prog.normIdsCompleted || []);
    });
    return () => unsub();
  }, [currentUserId]);

  // Escuta o aceite final na coleção 'manual_acknowledgments'
  useEffect(() => {
    if (!currentUserId) {
      setCurrentAckRecord(null);
      return;
    }
    const unsub = subscribeUserManualAcknowledgment(currentUserId, (ack) => {
      setCurrentAckRecord(ack);
    });
    return () => unsub();
  }, [currentUserId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Subscribe to real-time users
  useEffect(() => {
    const unsub = subscribeUsers((users) => {
      if (users && users.length > 0) {
        setAllUsers(users);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to real-time normas_aceites
  useEffect(() => {
    const unsub = subscribeAllNormasAceites((items) => {
      setAllAceites(items);
    });
    return () => unsub();
  }, []);

  // Subscribe to real-time normas_reminders
  useEffect(() => {
    const unsub = subscribeNormasReminders((items) => {
      setAllReminders(items);
    });
    return () => unsub();
  }, []);

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

  // Aceite do usuário autenticado atual
  const currentUserAceite = useMemo(() => {
    if (!currentUser) return null;
    return (
      allAceites.find(
        (a) =>
          a.userId === currentUser.id ||
          (currentUser.email && a.userEmail?.toLowerCase() === currentUser.email.toLowerCase())
      ) || null
    );
  }, [allAceites, currentUser]);

  // Colaboradores elegíveis para aceite
  const eligibleUsers = useMemo(() => {
    return allUsers.filter((u) => u.status !== 'inativo' && u.name);
  }, [allUsers]);

  // Total de cientes
  const totalCientesCount = useMemo(() => {
    return eligibleUsers.filter((u) =>
      allAceites.some(
        (a) => a.userId === u.id || (u.email && a.userEmail?.toLowerCase() === u.email.toLowerCase())
      )
    ).length;
  }, [eligibleUsers, allAceites]);

  // Ação 1: Confirmar Ciência de Norma Individual (Checklist individual 100%)
  const handleConfirmNormaScience = async (normaId: string) => {
    if (!currentUserId) {
      alert('É necessário estar autenticado para registrar ciência na norma.');
      return;
    }

    try {
      const updated = await markNormaCompletedInFirestore(currentUserId, normaId, currentUser);
      setNormIdsCompleted(updated);
      showToast('🟢 Ciência da norma confirmada com sucesso!');
    } catch (err: any) {
      alert(`Erro ao registrar ciência da norma: ${err?.message || 'Falha na conexão'}`);
    }
  };

  // Ação 2: Confirmar e Aceitar Todo o Manual Institucional (Após normIdsCompleted === totalNormasAtivas)
  const handleConfirmFullManual = async () => {
    if (!currentUser) {
      alert('É necessário estar autenticado para registrar o termo de ciência institucional.');
      return;
    }

    const totalAtivas = normas.length;
    if (normIdsCompleted.length < totalAtivas) {
      alert(`Você ainda possui ${totalAtivas - normIdsCompleted.length} norma(s) pendente(s) de leitura.`);
      return;
    }

    try {
      setIsConfirmingAceite(true);
      const ackRecord = await saveFullManualAcknowledgmentToFirestore({
        currentUser,
        totalNormasCount: totalAtivas,
        normIdsCompleted,
      });
      setCurrentAckRecord(ackRecord);
      showToast('🎉 Termo de Aceite Institucional de todo o manual registrado com sucesso no Firestore!');
    } catch (err: any) {
      alert(`Erro ao registrar aceite do manual: ${err?.message || 'Falha na conexão'}`);
    } finally {
      setIsConfirmingAceite(false);
    }
  };

  // Mantém compatibilidade com handleConfirmAceite
  const handleConfirmAceite = handleConfirmFullManual;

  // Enviar lembrete a colaborador pendente
  const handleSendReminder = (userId: string, userName: string) => {
    setReminderSentUsers((prev) => ({ ...prev, [userId]: true }));
    showToast(`Lembrete de leitura enviado com sucesso para ${userName}!`);
  };

  // Exportar relatório de conformidade em PDF
  const handleExportRelatorioConformidadePDF = () => {
    const list = eligibleUsers.map((user) => {
      const userAceite = allAceites.find(
        (a) => a.userId === user.id || (user.email && a.userEmail?.toLowerCase() === user.email.toLowerCase())
      );
      return {
        user,
        aceite: userAceite || null,
      };
    });

    const { doc, blobUrl, dataUrl, filename, download } = generateRelatorioConformidadeAceitesPDF(list);

    setPdfPreviewState({
      isOpen: true,
      doc,
      dataUrl,
      blobUrl,
      filename,
      title: 'Relatório Oficial de Conformidade e Aceite Digital • Manual de Normas',
      onDownload: download,
    });
  };

  // Category Toggle
  const toggleCategory = (catId: ThematicCategoryId) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  const handleExpandAllCategories = () => {
    setExpandedCategories({
      rotina_operacional: true,
      seguranca_cuidados: true,
      postura_fardamento: true,
      guia_socioemocional: true,
    });
  };

  const handleCollapseAllCategories = () => {
    setExpandedCategories({
      rotina_operacional: false,
      seguranca_cuidados: false,
      postura_fardamento: false,
      guia_socioemocional: false,
    });
  };

  // Norma Card Toggle
  const toggleNormaCard = (normaId: string) => {
    setExpandedNormas((prev) => ({
      ...prev,
      [normaId]: !prev[normaId],
    }));
  };

  const handleExpandAllNormas = () => {
    const allExp: Record<string, boolean> = {};
    normas.forEach((n) => {
      allExp[n.id] = true;
    });
    setExpandedNormas(allExp);
  };

  const handleCollapseAllNormas = () => {
    setExpandedNormas({});
  };

  // Quick Pins Navigation Handler
  const handleQuickPinClick = (pinKey: string, targetNormaId: string, catId: ThematicCategoryId) => {
    if (activeQuickPin === pinKey) {
      // Toggle off
      setActiveQuickPin(null);
      setSearchTerm('');
      setSelectedModule('all');
      setAlertTypeFilter('all');
      return;
    }

    setActiveQuickPin(pinKey);

    // Reset module and alert filter so the target is visible
    setSelectedModule('all');
    setAlertTypeFilter('all');
    setSearchTerm('');

    // Ensure target category is open
    setExpandedCategories((prev) => ({
      ...prev,
      [catId]: true,
    }));

    // Ensure target norma card is expanded
    setExpandedNormas((prev) => ({
      ...prev,
      [targetNormaId]: true,
    }));

    // Highlight and smooth scroll to card
    setHighlightedCardId(targetNormaId);
    setTimeout(() => {
      const el = document.getElementById(`card-${targetNormaId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);

    setTimeout(() => {
      setHighlightedCardId(null);
    }, 3200);
  };

  // Filtered Normas based on Module, Search Term and Alert Type Filter
  const filteredNormas = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return normas.filter((norma) => {
      // 1. Module filter
      if (selectedModule !== 'all' && norma.moduleId !== selectedModule) {
        return false;
      }

      // 2. Alert type filter
      if (alertTypeFilter === 'proibicoes_alertas') {
        if (norma.type !== 'proibicao' && norma.type !== 'alerta') return false;
      } else if (alertTypeFilter === 'boas_praticas') {
        if (norma.type !== 'recomendado') return false;
      } else if (alertTypeFilter === 'diretrizes') {
        if (norma.type !== 'diretriz') return false;
      }

      // 3. Search query
      if (!term) return true;

      const matchTitle = norma.title.toLowerCase().includes(term);
      const matchSummary = (norma.summary || '').toLowerCase().includes(term);
      const matchSection = (norma.sectionTitle || '').toLowerCase().includes(term);
      const matchModule = (norma.moduleTitle || '').toLowerCase().includes(term);
      const matchDetails = Array.isArray(norma.details) && norma.details.some((d) => d.toLowerCase().includes(term));
      const matchTags = Array.isArray(norma.tags) && norma.tags.some((t) => t.toLowerCase().includes(term));

      return matchTitle || matchSummary || matchSection || matchModule || matchDetails || matchTags;
    }).sort(compareNormasBySectionNumber);
  }, [normas, selectedModule, alertTypeFilter, searchTerm]);

  // Group filtered normas into the 4 Thematic Categories with strict numerical section sorting
  const groupedThematicNormas = useMemo(() => {
    const map: Record<ThematicCategoryId, ManualNorma[]> = {
      rotina_operacional: [],
      seguranca_cuidados: [],
      postura_fardamento: [],
      guia_socioemocional: [],
    };

    filteredNormas.forEach((n) => {
      const cat = getThematicCategory(n);
      map[cat].push(n);
    });

    // Ordenação rigorosa crescente por número de seção (ex: 1, 2, 3, 4, 10, 11...)
    (Object.keys(map) as ThematicCategoryId[]).forEach((catId) => {
      map[catId].sort(compareNormasBySectionNumber);
    });

    return map;
  }, [filteredNormas]);

  // Statistics counters
  const totalCount = normas.length;
  const countProibicoes = useMemo(() => normas.filter((n) => n.type === 'proibicao' || n.type === 'alerta').length, [normas]);
  const countRecomendadas = useMemo(() => normas.filter((n) => n.type === 'recomendado').length, [normas]);
  const countDiretrizes = useMemo(() => normas.filter((n) => n.type === 'diretriz').length, [normas]);

  // Handle Save Norma
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

  // Sincronizar as 32 normas reais dos documentos oficiais do Colégio Crescer
  const handleSyncOfficialDocuments = async () => {
    if (!confirm('Deseja sincronizar as 32 normas reais dos documentos oficiais do Colégio Crescer no Firestore?')) {
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

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Floating Action Feedback Toast */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 bg-slate-950/95 border border-indigo-500/40 text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-top-3">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-7 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/25 text-indigo-300 border border-indigo-400/30">
                <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>Manual & Normas do Integral</span>
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

            {isAdmin && (
              <button
                type="button"
                onClick={handleSyncOfficialDocuments}
                disabled={isSyncingOfficial}
                className="px-3.5 py-2.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-2xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-60"
                title="Sincronizar as 32 normas reais dos documentos oficiais do Colégio Crescer no Firestore"
              >
                {isSyncingOfficial ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>Sincronizar Oficiais</span>
              </button>
            )}

            {/* Admin Action: Status de Aceite da Equipe */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsStatusAceiteModalOpen(true)}
                className="px-3.5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-blue-700/30 transition-all flex items-center space-x-1.5 cursor-pointer"
                title="Abrir painel de auditoria de aceite digital da equipe"
              >
                <ClipboardCheck className="w-4 h-4 text-emerald-300" />
                <span>Status de Aceite ({totalCientesCount}/{eligibleUsers.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleGeneratePDF}
              className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-indigo-600/30 transition-all flex items-center space-x-2 cursor-pointer"
              title="Gerar e visualizar PDF oficial com timbre do Colégio Crescer"
            >
              <Printer className="w-4 h-4 text-amber-300" />
              <span>Baixar Manual em PDF</span>
            </button>
          </div>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800/80">
          <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Acervo Total</span>
            <span className="text-base sm:text-lg font-black text-white">{totalCount} normas oficiais</span>
          </div>
          <div className="bg-rose-950/40 p-3 rounded-2xl border border-rose-800/40">
            <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider block">Proibições / Alertas</span>
            <span className="text-base sm:text-lg font-black text-rose-400">{countProibicoes} regras</span>
          </div>
          <div className="bg-emerald-950/40 p-3 rounded-2xl border border-emerald-800/40">
            <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">Boas Práticas</span>
            <span className="text-base sm:text-lg font-black text-emerald-400">{countRecomendadas} condutas</span>
          </div>
          <div className="bg-indigo-950/40 p-3 rounded-2xl border border-indigo-800/40">
            <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block">Diretrizes Sensíveis</span>
            <span className="text-base sm:text-lg font-black text-indigo-300">{countDiretrizes} diretrizes</span>
          </div>
        </div>
      </div>

      {/* Tarja Oficial de Orientação Institucional */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 p-3.5 sm:p-4 rounded-3xl border border-indigo-500/30 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/20 text-amber-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-indigo-100 block">
              ORIENTAÇÃO INSTITUCIONAL - PROGRAMA DO INTEGRAL
            </span>
            <span className="text-[11px] text-slate-400 block">
              Diretrizes oficiais aplicáveis a toda a equipe de monitoria e pedagógica do Colégio Crescer
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-1.5 shrink-0">
          <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
            Normas Oficiais 2026/2027
          </span>
        </div>
      </div>

      {/* 1. ATALHOS DE ACESSO RÁPIDO (Quick Pins / Badges Fixas) */}
      <div className="bg-white p-3 sm:p-4 rounded-3xl border border-slate-200/90 shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              Atalhos de Consulta Rápida:
            </span>
          </div>
          {activeQuickPin && (
            <button
              type="button"
              onClick={() => {
                setActiveQuickPin(null);
                setSearchTerm('');
              }}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
            >
              Limpar atalho
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Pin 1: Rádio Frequência 2 */}
          <button
            type="button"
            onClick={() =>
              handleQuickPinClick(
                'radio',
                'norma_fluxograma_ponto_radio',
                'rotina_operacional'
              )
            }
            className={`px-3 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 border shadow-2xs ${
              activeQuickPin === 'radio'
                ? 'bg-blue-600 text-white border-blue-600 shadow-blue-500/20 ring-2 ring-blue-400/40'
                : 'bg-blue-50/80 hover:bg-blue-100/90 text-blue-900 border-blue-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Rádio Frequência 2</span>
          </button>

          {/* Quick Pin 2: As 10 Regras da Academia */}
          <button
            type="button"
            onClick={() =>
              handleQuickPinClick(
                'academia_10_regras',
                'norma_academia_10_regras_comportamento',
                'seguranca_cuidados'
              )
            }
            className={`px-3 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 border shadow-2xs ${
              activeQuickPin === 'academia_10_regras'
                ? 'bg-amber-600 text-white border-amber-600 shadow-amber-500/20 ring-2 ring-amber-400/40'
                : 'bg-amber-50/80 hover:bg-amber-100/90 text-amber-900 border-amber-200'
            }`}
          >
            <Bus className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>As 10 Regras da Academia</span>
          </button>

          {/* Quick Pin 3: Parque / Parcão */}
          <button
            type="button"
            onClick={() =>
              handleQuickPinClick(
                'parque',
                'norma_regras_parque_parcao',
                'seguranca_cuidados'
              )
            }
            className={`px-3 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 border shadow-2xs ${
              activeQuickPin === 'parque'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-500/20 ring-2 ring-emerald-400/40'
                : 'bg-emerald-50/80 hover:bg-emerald-100/90 text-emerald-900 border-emerald-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Parque / Parcão</span>
          </button>

          {/* Quick Pin 4: Mediação de Conflitos */}
          <button
            type="button"
            onClick={() =>
              handleQuickPinClick(
                'mediacao',
                'norma_sensivel_mediacao_conflitos',
                'guia_socioemocional'
              )
            }
            className={`px-3 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 border shadow-2xs ${
              activeQuickPin === 'mediacao'
                ? 'bg-rose-600 text-white border-rose-600 shadow-rose-500/20 ring-2 ring-rose-400/40'
                : 'bg-rose-50/80 hover:bg-rose-100/90 text-rose-900 border-rose-200'
            }`}
          >
            <HeartHandshake className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>Mediação de Conflitos</span>
          </button>

          {/* Quick Pin 5: Proibição de Celular e Bijuterias */}
          <button
            type="button"
            onClick={() =>
              handleQuickPinClick(
                'celular_bijuterias',
                'norma_proibicao_celular_conversas',
                'postura_fardamento'
              )
            }
            className={`px-3 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 border shadow-2xs ${
              activeQuickPin === 'celular_bijuterias'
                ? 'bg-purple-600 text-white border-purple-600 shadow-purple-500/20 ring-2 ring-purple-400/40'
                : 'bg-purple-50/80 hover:bg-purple-100/90 text-purple-900 border-purple-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            <span>Proibição de Celular & Bijuterias</span>
          </button>
        </div>
      </div>

      {/* 2. BARRA DE CONTROLE: Módulos, Busca e Filtros Rápidos de Alerta */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
        {/* Seletor por Módulos Oficiais */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setSelectedModule('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
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
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
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
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
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
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                selectedModule === 'guia_sensivel'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <HeartHandshake className="w-3.5 h-3.5 text-rose-200" />
              <span>3. Abordagem Sensível ({normas.filter((n) => n.moduleId === 'guia_sensivel').length})</span>
            </button>
          </div>

          {/* Controles Globais de Expansão */}
          <div className="flex flex-wrap items-center gap-1.5 self-end md:self-auto">
            <button
              type="button"
              onClick={handleExpandAllCategories}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            >
              Expandir Categorias
            </button>
            <button
              type="button"
              onClick={handleCollapseAllCategories}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            >
              Recolher Categorias
            </button>
            <button
              type="button"
              onClick={handleExpandAllNormas}
              className="px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition-colors cursor-pointer"
            >
              Expandir Todas as Normas
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
            placeholder="Buscar por palavras-chave (ex: celular, rádio, frequência 2, brinquedão, banheiros, vai e volta, uniforme)..."
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

        {/* 3. FILTROS RÁPIDOS POR TIPO DE ALERTA */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
            Filtro de Alerta:
          </span>

          <button
            type="button"
            onClick={() => setAlertTypeFilter('all')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              alertTypeFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Todos ({filteredNormas.length})
          </button>

          <button
            type="button"
            onClick={() => setAlertTypeFilter('proibicoes_alertas')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              alertTypeFilter === 'proibicoes_alertas'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>🔴 Proibições & Alertas</span>
          </button>

          <button
            type="button"
            onClick={() => setAlertTypeFilter('boas_praticas')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              alertTypeFilter === 'boas_praticas'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>🟢 Boas Práticas</span>
          </button>

          <button
            type="button"
            onClick={() => setAlertTypeFilter('diretrizes')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              alertTypeFilter === 'diretrizes'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span>🟣 Diretrizes Sensíveis</span>
          </button>
        </div>

        {searchTerm && (
          <div className="text-xs text-slate-500 pt-1 flex items-center justify-between">
            <span>
              Encontradas <strong>{filteredNormas.length} normas</strong> correspondentes à busca "{searchTerm}".
            </span>
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="text-indigo-600 hover:underline font-semibold cursor-pointer"
            >
              Limpar busca
            </button>
          </div>
        )}
      </div>

      {/* 4. VISUALIZAÇÃO AGRUPADA EM CATEGORIAS TEMÁTICAS SANFONADAS */}
      <div className="space-y-4">
        {isLoading && normas.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
            <p className="text-xs font-bold text-slate-500">
              Carregando normas oficiais do Colégio Crescer...
            </p>
          </div>
        ) : filteredNormas.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Nenhuma norma encontrada</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Nenhuma diretriz corresponde aos filtros e buscas atuais. Tente limpar os filtros de módulo, alerta ou busca.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedModule('all');
                setAlertTypeFilter('all');
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              Limpar Filtros e Busca
            </button>
          </div>
        ) : (
          THEMATIC_CATEGORIES.map((categoryMeta) => {
            const catNormas = groupedThematicNormas[categoryMeta.id] || [];
            if (catNormas.length === 0) return null;

            const isCategoryExpanded = Boolean(expandedCategories[categoryMeta.id]);

            return (
              <div
                key={categoryMeta.id}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden transition-all"
              >
                {/* Header da Categoria Temática (Sanfona Principal) */}
                <button
                  type="button"
                  onClick={() => toggleCategory(categoryMeta.id)}
                  className={`w-full p-4 sm:p-5 flex items-start sm:items-center justify-between gap-4 text-left transition-colors cursor-pointer ${categoryMeta.headerBgClass}`}
                >
                  <div className="flex items-start sm:items-center space-x-3.5">
                    <div className={`p-2.5 rounded-2xl shrink-0 mt-0.5 sm:mt-0 ${categoryMeta.iconBgClass}`}>
                      {categoryMeta.id === 'rotina_operacional' ? (
                        <Clock className="w-5 h-5 text-blue-300" />
                      ) : categoryMeta.id === 'seguranca_cuidados' ? (
                        <ShieldAlert className="w-5 h-5 text-amber-300" />
                      ) : categoryMeta.id === 'postura_fardamento' ? (
                        <Award className="w-5 h-5 text-purple-300" />
                      ) : (
                        <HeartHandshake className="w-5 h-5 text-rose-300" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/20 text-white backdrop-blur-xs">
                          {categoryMeta.badgeLabel}
                        </span>
                        <span className="text-xs text-slate-300 font-semibold">
                          {catNormas.length} {catNormas.length === 1 ? 'norma oficial' : 'normas oficiais'}
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-black text-white mt-0.5">
                        {categoryMeta.title}
                      </h3>
                      <p className="text-xs text-slate-300 mt-0.5 line-clamp-1">
                        {categoryMeta.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 text-white/80">
                    <div className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                      {isCategoryExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Conteúdo da Categoria: Lista de Normas */}
                {isCategoryExpanded && (
                  <div className="p-4 sm:p-5 space-y-3.5 bg-slate-50/60 border-t border-slate-100">
                    {catNormas.map((norma) => {
                      const isNormaExpanded = Boolean(expandedNormas[norma.id]);
                      const isHighlighted = highlightedCardId === norma.id;

                      const isNormaCompleted = normIdsCompleted.includes(norma.id);

                      return (
                        <ManualNormaCard
                          key={norma.id}
                          norma={norma}
                          isExpanded={isNormaExpanded}
                          isHighlighted={isHighlighted}
                          isAdmin={isAdmin}
                          currentUser={currentUser}
                          isCompleted={isNormaCompleted}
                          onToggleExpand={() => toggleNormaCard(norma.id)}
                          onConfirmNormaScience={handleConfirmNormaScience}
                          onEditNorma={(n) => {
                            setNormaEditing(n);
                            setIsEditModalOpen(true);
                          }}
                          onDeleteNorma={(n) => {
                            setNormaDeleting(n);
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 5. TERMO DE CIÊNCIA E COMPROMISSO INSTITUCIONAL COM TRAVA DE LIBERAÇÃO (RODAPÉ) */}
      <TermoAceiteManual
        currentUser={currentUser}
        totalNormasAtivas={normas.length}
        normIdsCompleted={normIdsCompleted}
        existingAcknowledgment={currentAckRecord}
        legacyAceite={currentUserAceite}
        isConfirming={isConfirmingAceite}
        onConfirmFullManual={handleConfirmFullManual}
        onNavigateToPendingNormas={() => {
          // Localiza a primeira norma pendente e foca nela
          const firstPending = normas.find((n) => !normIdsCompleted.includes(n.id));
          if (firstPending) {
            const cat = getThematicCategory(firstPending);
            setExpandedCategories((prev) => ({ ...prev, [cat]: true }));
            setExpandedNormas((prev) => ({ ...prev, [firstPending.id]: true }));
            setHighlightedCardId(firstPending.id);
            const el = document.getElementById(`card-${firstPending.id}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            setTimeout(() => setHighlightedCardId(null), 3000);
          } else {
            window.scrollTo({ top: 350, behavior: 'smooth' });
          }
        }}
      />

      {/* Admin Status de Aceite Modal */}
      {isStatusAceiteModalOpen && (
        <StatusAceiteModal
          isOpen={isStatusAceiteModalOpen}
          onClose={() => setIsStatusAceiteModalOpen(false)}
          users={eligibleUsers}
          aceites={allAceites}
          reminders={allReminders}
          currentUser={currentUser}
          normas={normas}
          onSendReminder={handleSendReminder}
          reminderSentUsers={reminderSentUsers}
          onExportPDF={handleExportRelatorioConformidadePDF}
        />
      )}

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
