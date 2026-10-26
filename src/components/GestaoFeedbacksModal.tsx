import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Sparkles,
  Send,
  MessageSquare,
  History,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  BookOpen,
  Phone,
  Edit3,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  ShieldCheck,
  HeartHandshake,
  Check,
  Download,
  Printer,
  Search,
  Filter,
} from 'lucide-react';
import { UserProfile } from '../types';
import { ManualNorma } from '../types/manualNormas';
import { NORMAS_DATA } from '../data/normasData';
import { subscribeManualNormas, subscribeUsers } from '../firebase';
import { getLocalUsersList } from '../utils/authUtils';
import { generateCordialFeedback } from '../services/feedbackAiService';
import { NormaSearchSelect } from './NormaSearchSelect';
import {
  createPedagogicalFeedback,
  subscribeAllPedagogicalFeedbacks,
  deletePedagogicalFeedback,
  buildWhatsAppFeedbackLink,
  PedagogicalFeedback,
} from '../services/feedbackService';
import { canDeleteFeedback } from '../utils/permissionUtils';
import { FeedbackMarkdown } from './FeedbackMarkdown';
import { sanitizeCordialMessageForWhatsApp } from '../utils/feedbackPromptBuilder';
import { generateRelatorioFeedbacksPDF } from '../utils/pdfGenerator';

interface GestaoFeedbacksModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserProfile | null;
  users?: UserProfile[];
  initialNormId?: string;
  initialChecklistItem?: string;
}

export const GestaoFeedbacksModal: React.FC<GestaoFeedbacksModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  users: initialUsers,
  initialNormId,
  initialChecklistItem,
}) => {
  const [activeTab, setActiveTab] = useState<'elaborate' | 'history'>('elaborate');

  // Usuários e Normas
  const [usersList, setUsersList] = useState<UserProfile[]>(() =>
    initialUsers && initialUsers.length > 0 ? initialUsers : getLocalUsersList()
  );
  const [normasList, setNormasList] = useState<ManualNorma[]>(NORMAS_DATA);
  const [feedbacksHistory, setFeedbacksHistory] = useState<PedagogicalFeedback[]>([]);

  // Formulário Essencial de Elaboração (Colaborador + Norma + Item Específico do Checklist)
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedNormId, setSelectedNormId] = useState<string>(() => initialNormId || '');
  const [selectedChecklistItem, setSelectedChecklistItem] = useState<string>(() => initialChecklistItem || '');

  useEffect(() => {
    if (initialNormId) {
      setSelectedNormId(initialNormId);
    }
  }, [initialNormId]);

  useEffect(() => {
    if (initialChecklistItem) {
      setSelectedChecklistItem(initialChecklistItem);
    }
  }, [initialChecklistItem]);

  const [generatedMessage, setGeneratedMessage] = useState<string>('');
  const [actionPoints, setActionPoints] = useState<string[]>([]);
  const [newActionPoint, setNewActionPoint] = useState<string>('');

  // Estados de Controle
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [selectedFeedbackDetails, setSelectedFeedbackDetails] = useState<PedagogicalFeedback | null>(null);
  const [feedbackToDelete, setFeedbackToDelete] = useState<PedagogicalFeedback | null>(null);
  const [isDeletingFeedback, setIsDeletingFeedback] = useState<boolean>(false);

  // Filtros de Pesquisa por Colaborador no Histórico e Exportação PDF
  const [historyCollaboratorFilter, setHistoryCollaboratorFilter] = useState<string>('all');
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Lista única de colaboradores para o dropdown
  const collaboratorFilterOptions = useMemo(() => {
    const namesSet = new Set<string>();
    feedbacksHistory.forEach((fb) => {
      if (fb.targetUserName && fb.targetUserName.trim()) {
        namesSet.add(fb.targetUserName.trim());
      }
    });
    usersList.forEach((u) => {
      if (u.name && u.name.trim()) {
        namesSet.add(u.name.trim());
      }
    });
    return Array.from(namesSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [feedbacksHistory, usersList]);

  // Feedbacks filtrados com precisão por colaborador e busca textual
  const filteredFeedbacksHistory = useMemo(() => {
    return feedbacksHistory.filter((fb) => {
      // 1. Filtro estrito por colaborador selecionado
      if (historyCollaboratorFilter !== 'all') {
        const target = (fb.targetUserName || '').trim().toLowerCase();
        const selected = historyCollaboratorFilter.trim().toLowerCase();
        if (target !== selected && !target.includes(selected)) {
          return false;
        }
      }

      // 2. Filtro complementar por busca textual
      if (historySearchQuery.trim()) {
        const query = historySearchQuery.trim().toLowerCase();
        const matchName = (fb.targetUserName || '').toLowerCase().includes(query);
        const matchNorm = (fb.normTitle || '').toLowerCase().includes(query) || (fb.normSection || '').toLowerCase().includes(query);
        const matchContext = (fb.rawContext || '').toLowerCase().includes(query);
        const matchMsg = (fb.generatedMessage || '').toLowerCase().includes(query);
        if (!matchName && !matchNorm && !matchContext && !matchMsg) {
          return false;
        }
      }

      return true;
    });
  }, [feedbacksHistory, historyCollaboratorFilter, historySearchQuery]);

  // Ação de download do Relatório de Feedbacks em PDF
  const handleExportFeedbacksPDF = () => {
    try {
      setIsExportingPdf(true);
      const filterLabel = historyCollaboratorFilter !== 'all' ? historyCollaboratorFilter : undefined;
      const { filename } = generateRelatorioFeedbacksPDF(
        filteredFeedbacksHistory,
        filterLabel,
        true
      );
      setSuccessToast(`Relatório oficial em PDF baixado com sucesso: ${filename}`);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      console.error('Erro ao gerar relatório em PDF:', err);
      alert(`Não foi possível gerar o PDF: ${err?.message || 'Erro desconhecido'}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Escuta exclusão global para sincronização imediata entre abas
  useEffect(() => {
    const handleDeletedEvent = (e: any) => {
      const deletedId = e?.detail?.feedbackId;
      if (deletedId) {
        setFeedbacksHistory((prev) => prev.filter((fb) => fb.id !== deletedId));
        setSelectedFeedbackDetails((curr) => (curr?.id === deletedId ? null : curr));
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('app_pedagogical_feedback_deleted', handleDeletedEvent);
      return () => window.removeEventListener('app_pedagogical_feedback_deleted', handleDeletedEvent);
    }
  }, []);

  // Carrega e escuta usuários
  useEffect(() => {
    const unsub = subscribeUsers(
      (data) => {
        if (data && data.length > 0) setUsersList(data);
      },
      () => {}
    );
    return () => unsub();
  }, []);

  // Carrega e escuta normas
  useEffect(() => {
    const unsub = subscribeManualNormas(
      (data) => {
        if (data && data.length > 0) setNormasList(data);
      },
      () => {}
    );
    return () => unsub();
  }, []);

  // Escuta histórico de feedbacks
  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeAllPedagogicalFeedbacks((list) => {
      setFeedbacksHistory(list);
    });
    return () => unsub();
  }, [isOpen]);

  // Lista de monitoras e educadoras para envio
  const eligibleRecipients = useMemo(() => {
    return usersList
      .filter((u) => u.status !== 'inativo')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  }, [usersList]);

  const selectedUser = useMemo(() => {
    return eligibleRecipients.find((u) => (u.id || u.uid) === selectedUserId) || null;
  }, [eligibleRecipients, selectedUserId]);

  const selectedNorm = useMemo(() => {
    return normasList.find((n) => n.id === selectedNormId) || null;
  }, [normasList, selectedNormId]);

  // Ação 1: Gerar Feedback com IA (Modelo estrito de CNV da coordenação)
  const handleGenerateAi = async () => {
    if (!selectedUser) {
      alert('Selecione primeiro o colaborador(a) destinatário (ex: Amanda).');
      return;
    }
    if (!selectedNorm) {
      alert('Selecione a norma institucional correspondente (ex: Seção 17).');
      return;
    }

    setIsGeneratingAi(true);
    try {
      const result = await generateCordialFeedback(
        selectedUser.name,
        selectedNorm.title,
        selectedNorm.summary || '',
        selectedNorm.sectionNumber || selectedNorm.section,
        selectedNorm.details,
        selectedChecklistItem
      );

      const sanitized = sanitizeCordialMessageForWhatsApp(result.message, {
        userName: selectedUser.name,
        normTitle: selectedNorm.title,
        rawContext: selectedChecklistItem || selectedNorm.summary || selectedNorm.title,
        normSection: selectedNorm.sectionNumber ? String(selectedNorm.sectionNumber) : undefined,
      });

      setGeneratedMessage(sanitized);
      setActionPoints(result.actionPoints);

      setSuccessToast(
        result.isAiGenerated
          ? '✨ Feedback pedagógico gerado com IA (CNV) com sucesso!'
          : '🌿 Feedback estruturado no modelo de Comunicação Não Violenta com sucesso!'
      );
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      console.error('Erro ao gerar mensagem cordial:', err);
      alert('Não foi possível gerar a mensagem com IA no momento. Tente novamente.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Adicionar ponto ao checklist
  const handleAddActionPoint = () => {
    const clean = newActionPoint.trim();
    if (!clean) return;
    setActionPoints((prev) => [...prev, clean]);
    setNewActionPoint('');
  };

  // Remover ponto do checklist
  const handleRemoveActionPoint = (index: number) => {
    setActionPoints((prev) => prev.filter((_, i) => i !== index));
  };

  // Ação 2: Enviar no Sistema (Firestore - feedbacks_pedagogicos)
  const handleSendInApp = async () => {
    if (!selectedUser || !selectedNorm) {
      alert('Selecione a colaboradora e a norma correspondente.');
      return;
    }
    if (!generatedMessage.trim()) {
      alert('Gere ou escreva o texto da orientação cordial antes de enviar.');
      return;
    }

    const finalPoints = actionPoints.length > 0 ? actionPoints : [
      `Alinhamento rigoroso com a norma "${selectedNorm.title}"`,
      'Zelo contínuo pela segurança física e bem-estar das crianças',
      'Cumprimento dos protocolos operacionais do Colégio Crescer',
    ];

    const employeeId = selectedUser.id || selectedUser.uid || '';

    const sanitizedMessageToSave = sanitizeCordialMessageForWhatsApp(generatedMessage.trim(), {
      userName: selectedUser.name || 'Colaboradora',
      normTitle: selectedNorm.title,
      rawContext: selectedChecklistItem || selectedNorm.summary || selectedNorm.title,
      normSection: selectedNorm.sectionNumber ? String(selectedNorm.sectionNumber) : undefined,
    });

    setIsSaving(true);
    try {
      await createPedagogicalFeedback({
        employee_id: employeeId,
        user_id: employeeId,
        targetUserId: employeeId,
        targetUserName: selectedUser.name || 'Colaboradora',
        targetUserEmail: selectedUser.email || '',
        targetUserPhone: selectedUser.phone || '',
        normId: selectedNorm.id,
        normTitle: selectedNorm.title,
        normSection: selectedNorm.sectionNumber || undefined,
        rawContext: selectedChecklistItem || selectedNorm.summary || selectedNorm.title,
        generatedMessage: sanitizedMessageToSave,
        actionPoints: finalPoints,
        createdByUserId: currentUser?.id || currentUser?.uid || 'coordenacao',
        createdByUserName: currentUser?.name || 'Coordenação Pedagógica',
      });

      setSuccessToast('✅ Feedback cordial registrado no sistema com sucesso na coleção feedbacks_pedagogicos!');
      setTimeout(() => setSuccessToast(null), 4000);

      // Limpa formulário e vai para histórico
      setGeneratedMessage('');
      setActionPoints([]);
      setSelectedUserId('');
      setSelectedNormId('');
      setSelectedChecklistItem('');
      setActiveTab('history');
    } catch (err) {
      console.error('Erro ao registrar feedback:', err);
      alert('Erro ao gravar feedback no sistema.');
    } finally {
      setIsSaving(false);
    }
  };

  // Ação 3: Enviar via WhatsApp Direct (Garante gravação prévia no Firestore)
  const handleSendWhatsApp = async () => {
    if (!selectedUser) {
      alert('Selecione a colaboradora destinatária.');
      return;
    }
    if (!selectedNorm) {
      alert('Selecione a norma vinculada.');
      return;
    }
    if (!generatedMessage.trim()) {
      alert('Gere ou escreva a mensagem antes de acionar o WhatsApp.');
      return;
    }

    const finalPoints = actionPoints.length > 0 ? actionPoints : [
      `Alinhamento rigoroso com a norma "${selectedNorm.title}"`,
      'Zelo contínuo pela segurança e bem-estar das crianças',
    ];

    const employeeId = selectedUser.id || selectedUser.uid || '';

    const sanitizedMessageToSave = sanitizeCordialMessageForWhatsApp(generatedMessage.trim(), {
      userName: selectedUser.name || 'Colaboradora',
      normTitle: selectedNorm.title,
      rawContext: selectedChecklistItem || selectedNorm.summary || selectedNorm.title,
      normSection: selectedNorm.sectionNumber ? String(selectedNorm.sectionNumber) : undefined,
    });

    // Salva no Firestore obrigatoriamente para não anular a persistência
    setIsSaving(true);
    let savedFeedback: PedagogicalFeedback | null = null;
    try {
      savedFeedback = await createPedagogicalFeedback({
        employee_id: employeeId,
        user_id: employeeId,
        targetUserId: employeeId,
        targetUserName: selectedUser.name || 'Colaboradora',
        targetUserEmail: selectedUser.email || '',
        targetUserPhone: selectedUser.phone || '',
        normId: selectedNorm.id,
        normTitle: selectedNorm.title,
        normSection: selectedNorm.sectionNumber || undefined,
        rawContext: selectedChecklistItem || selectedNorm.summary || selectedNorm.title,
        generatedMessage: sanitizedMessageToSave,
        actionPoints: finalPoints,
        createdByUserId: currentUser?.id || currentUser?.uid || 'coordenacao',
        createdByUserName: currentUser?.name || 'Coordenação Pedagógica',
        whatsappSentAt: new Date().toISOString(),
      });
      setSuccessToast('✅ Feedback gravado no banco de dados e preparando WhatsApp...');
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (e) {
      console.warn('Gravação prévia em fallback:', e);
    } finally {
      setIsSaving(false);
    }

    const link = buildWhatsAppFeedbackLink(selectedUser.phone, {
      targetUserName: selectedUser.name,
      normTitle: selectedNorm.title,
      generatedMessage: sanitizedMessageToSave,
    });

    window.open(link, '_blank');
  };

  // Exclusão individual de feedback com atualização imediata de estado e toast de confirmação
  const handleConfirmDeleteFeedback = async () => {
    if (!feedbackToDelete) return;
    setIsDeletingFeedback(true);
    try {
      const targetName = feedbackToDelete.targetUserName;
      const targetNorm = feedbackToDelete.normTitle;
      const feedbackId = feedbackToDelete.id;

      await deletePedagogicalFeedback(feedbackId);

      // Atualiza o estado local imediatamente sem necessidade de recarregar a página
      setFeedbacksHistory((prev) => prev.filter((fb) => fb.id !== feedbackId));

      if (selectedFeedbackDetails?.id === feedbackId) {
        setSelectedFeedbackDetails(null);
      }

      setFeedbackToDelete(null);

      // Notificação / toast de sucesso da operação
      setSuccessToast(`Feedback de "${targetNorm}" para ${targetName} excluído com sucesso!`);
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err) {
      console.error('Erro ao excluir feedback:', err);
      alert('Não foi possível excluir o feedback do banco de dados. Tente novamente.');
    } finally {
      setIsDeletingFeedback(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-800 text-white p-5 sm:p-6 flex items-start justify-between shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-teal-600/60 text-teal-100 border border-teal-400/30">
                Gestão da Coordenação • CNV
              </span>
              <span className="flex items-center gap-1 text-[11px] text-teal-200 font-medium">
                <HeartHandshake className="w-3.5 h-3.5 text-teal-300" />
                Cuidado & Segurança
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              Feedbacks de Orientação Profissional
            </h2>
            <p className="text-xs sm:text-sm text-teal-100/90 leading-relaxed max-w-2xl">
              Clareza, respeito e responsabilidade institucional.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-teal-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notificação Toast */}
        {successToast && (
          <div className="bg-emerald-600 text-white px-5 py-2.5 text-xs font-bold flex items-center justify-between shrink-0 animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successToast}</span>
            </div>
            <button
              onClick={() => setSuccessToast(null)}
              className="text-white/80 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Navegação por Abas */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-slate-200 bg-slate-50/80 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('elaborate')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-extrabold border-b-2 transition-all cursor-pointer ${
              activeTab === 'elaborate'
                ? 'border-teal-700 text-teal-900 bg-white rounded-t-xl shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4 text-teal-600" />
            <span>Elaborar Novo Feedback com IA</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-extrabold border-b-2 transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'border-teal-700 text-teal-900 bg-white rounded-t-xl shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4 text-slate-600" />
            <span>Histórico de Feedbacks Enviados ({feedbacksHistory.length})</span>
          </button>
        </div>

        {/* Conteúdo Principal com Rolagem */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'elaborate' && (
            <div className="space-y-5">
              {/* Seleção Essencial de Colaborador e Norma */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Colaborador Destinatário */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-teal-600" />
                    <span>Colaborador (ex: Amanda):</span>
                  </label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 text-slate-800"
                  >
                    <option value="">Selecione o colaborador...</option>
                    {eligibleRecipients.map((u) => (
                      <option key={u.id || u.uid} value={u.id || u.uid}>
                        {u.name} ({u.cargoLabel || u.role || 'Monitora'})
                        {u.phone ? ` • Tel: ${u.phone}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Seletor de Norma */}
                <NormaSearchSelect
                  normas={normasList}
                  selectedNormId={selectedNormId}
                  onSelectNorm={(id) => {
                    setSelectedNormId(id);
                    // Limpa item do checklist se a norma for trocada e o item anterior não pertencer à nova
                    setSelectedChecklistItem('');
                  }}
                />

                {/* Seletor Específico de Item do Checklist (Foco Estrito de IA) */}
                {selectedNorm && Array.isArray(selectedNorm.details) && selectedNorm.details.length > 0 && (
                  <div className="md:col-span-2 space-y-1.5 p-3.5 rounded-2xl bg-teal-50/60 border border-teal-200/90 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                        <span>Foco Específico em Item do Checklist:</span>
                      </label>
                      {selectedChecklistItem && (
                        <button
                          type="button"
                          onClick={() => setSelectedChecklistItem('')}
                          className="text-[11px] font-bold text-teal-700 hover:text-teal-900 underline cursor-pointer"
                        >
                          Remover foco específico (analisar norma geral)
                        </button>
                      )}
                    </div>
                    <select
                      value={selectedChecklistItem}
                      onChange={(e) => setSelectedChecklistItem(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-teal-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600 text-slate-800"
                    >
                      <option value="">🎯 Geral: Toda a Norma Institucional (Sem item específico)</option>
                      {selectedNorm.details.map((detail, idx) => (
                        <option key={idx} value={detail}>
                          Item {idx + 1}: {detail}
                        </option>
                      ))}
                    </select>
                    {selectedChecklistItem ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-teal-900 font-bold bg-teal-100/70 p-2 rounded-xl border border-teal-200">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>
                          Foco Estrito Ativo: A IA focará 100% no procedimento deste item (&quot;{selectedChecklistItem}&quot;), sem adicionar contextos genéricos de outros pontos da norma.
                        </span>
                      </div>
                    ) : (
                      <p className="text-[10.5px] text-slate-500">
                        Selecione um item acima se a observação foi referente a um ponto específico (ex: uniforme/calçado, celular, crachá, fila).
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Botão de Ação: Gerar Feedback com IA */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>A IA gerará a mensagem institucional técnica e contextualizada no padrão oficial do Colégio Crescer.</span>
                </div>
                <button
                  type="button"
                  disabled={isGeneratingAi || !selectedUserId || !selectedNormId}
                  onClick={handleGenerateAi}
                  className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isGeneratingAi ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Gerando Feedback com IA...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>[ ✨ Gerar Feedback com IA ]</span>
                    </>
                  )}
                </button>
              </div>

              {/* Mensagem Gerada (Revisão e Edição Final) */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-teal-600" />
                    <span>Texto da Orientação Pedagógica (Edição Final Antes do Envio):</span>
                  </label>
                  {generatedMessage && (
                    <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Editável livremente pela coordenação
                    </span>
                  )}
                </div>
                <textarea
                  value={generatedMessage}
                  onChange={(e) => setGeneratedMessage(e.target.value)}
                  rows={7}
                  placeholder="Clique em '[ ✨ Gerar Feedback com IA ]' para criar o texto acolhedor, ou digite manualmente a orientação aqui..."
                  className="w-full text-xs p-3.5 bg-white border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-600 text-slate-800 placeholder-slate-400 font-sans leading-relaxed resize-y shadow-2xs"
                />
                {generatedMessage && (
                  <div className="p-3.5 bg-teal-50/60 rounded-2xl border border-teal-200/70 text-xs text-slate-800 space-y-1.5 shadow-2xs">
                    <span className="text-[11px] font-black uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                      Visualização Formatada (Como a colaboradora verá no app, sem asteriscos):
                    </span>
                    <FeedbackMarkdown content={generatedMessage} highlightVariant="teal" />
                  </div>
                )}
              </div>

              {/* Checklist de Pontos da Orientação */}
              <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-teal-700" />
                      Checklist de Ciência da Monitora ({actionPoints.length} pontos)
                    </span>
                    <p className="text-[11px] text-slate-500">
                      A monitora precisará assinalar individualmente 100% desses itens para confirmar ciência no app.
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  {actionPoints.length === 0 ? (
                    <div className="text-center py-3 text-xs text-slate-400 italic">
                      Nenhum ponto de checklist adicionado ainda. Eles são gerados automaticamente pela IA ou podem ser inseridos abaixo.
                    </div>
                  ) : (
                    actionPoints.map((point, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between gap-2 p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs text-xs text-slate-700 font-medium"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-900 font-black text-[10px] flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <span>{point}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveActionPoint(index)}
                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition-colors shrink-0"
                          title="Remover ponto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}

                  {/* Adicionar novo ponto */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={newActionPoint}
                      onChange={(e) => setNewActionPoint(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddActionPoint();
                        }
                      }}
                      placeholder="Adicionar novo ponto de atenção prática..."
                      className="flex-1 text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600 text-slate-800 placeholder-slate-400"
                    />
                    <button
                      type="button"
                      onClick={handleAddActionPoint}
                      className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Botões Finais de Envio */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={!selectedUser || !generatedMessage.trim()}
                  onClick={handleSendWhatsApp}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  title="Abrir WhatsApp com a mensagem formatada"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>[ 📱 Enviar via WhatsApp Direct ]</span>
                </button>

                <button
                  type="button"
                  disabled={isSaving || !selectedUser || !selectedNorm || !generatedMessage.trim()}
                  onClick={handleSendInApp}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-black text-white bg-teal-800 hover:bg-teal-900 shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  title="Salvar na coleção 'pedagogical_feedbacks' para notificação no app da monitora"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Registrando Feedback...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>[ 💾 Enviar Feedback no Sistema ]</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800">
                    Histórico de Feedbacks Enviados
                  </h3>
                  <p className="text-xs text-slate-500">
                    Acompanhamento em tempo real das ciências e compromissos registrados pelas monitoras.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportFeedbacksPDF}
                    disabled={isExportingPdf || filteredFeedbacksHistory.length === 0}
                    className="px-3 py-1.5 bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-600 hover:to-emerald-600 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Baixar Relatório Oficial de Feedbacks em PDF"
                  >
                    {isExportingPdf ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-emerald-200" />
                    )}
                    <span>Baixar Relatório em PDF</span>
                  </button>
                  <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                    Total: {filteredFeedbacksHistory.length}
                    {historyCollaboratorFilter !== 'all' && (
                      <span className="text-slate-400 font-normal ml-1">
                        (de {feedbacksHistory.length})
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Barra de Filtros por Colaborador e Pesquisa */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                {/* Seletor de Colaborador */}
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Filtrar por Colaborador
                  </label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select
                      value={historyCollaboratorFilter}
                      onChange={(e) => setHistoryCollaboratorFilter(e.target.value)}
                      className="w-full pl-8.5 pr-8 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 text-slate-800 cursor-pointer shadow-2xs"
                    >
                      <option value="all">
                        Todos os Colaboradores ({feedbacksHistory.length})
                      </option>
                      {collaboratorFilterOptions.map((name) => {
                        const count = feedbacksHistory.filter(
                          (fb) => fb.targetUserName?.toLowerCase().trim() === name.toLowerCase().trim()
                        ).length;
                        return (
                          <option key={name} value={name}>
                            {name} {count > 0 ? `(${count})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                {/* Busca Textual */}
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Buscar no Histórico
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      placeholder="Nome, norma ou contexto..."
                      className="w-full pl-8.5 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 text-slate-800 placeholder-slate-400 shadow-2xs"
                    />
                    {historySearchQuery && (
                      <button
                        type="button"
                        onClick={() => setHistorySearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                        title="Limpar busca"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Botão de Limpar Filtros quando ativo */}
                {(historyCollaboratorFilter !== 'all' || historySearchQuery.trim()) && (
                  <div className="sm:self-end">
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryCollaboratorFilter('all');
                        setHistorySearchQuery('');
                      }}
                      className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl transition-all cursor-pointer whitespace-nowrap shadow-2xs flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5 text-rose-500" />
                      <span>Limpar Filtro</span>
                    </button>
                  </div>
                )}
              </div>

              {feedbacksHistory.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-3xl p-6">
                  <HeartHandshake className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-600">Nenhum feedback registrado ainda</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Use a aba &quot;Elaborar Novo Feedback com IA&quot; para criar orientações humanizadas e acompanhar o progresso aqui.
                  </p>
                </div>
              ) : filteredFeedbacksHistory.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-3xl p-6 bg-slate-50/50">
                  <User className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">
                    Nenhum feedback encontrado para o filtro selecionado
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    {historyCollaboratorFilter !== 'all'
                      ? `Não foram encontrados feedbacks para "${historyCollaboratorFilter}".`
                      : 'Tente alterar os termos de pesquisa.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryCollaboratorFilter('all');
                      setHistorySearchQuery('');
                    }}
                    className="mt-3 px-3.5 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-xl border border-teal-200 cursor-pointer inline-flex items-center gap-1.5 transition-colors"
                  >
                    <span>Limpar Filtros</span>
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                  {filteredFeedbacksHistory.map((fb) => {
                    const isPending = fb.status === 'PENDING';
                    const dateFormatted = new Date(fb.createdAt).toLocaleDateString('pt-BR');
                    const timeFormatted = new Date(fb.createdAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={fb.id}
                        className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-xs text-slate-900">
                              {fb.targetUserName}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                isPending
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              }`}
                            >
                              {isPending ? '🔴 PENDENTE DE ASSINATURA' : '🟢 CIENTE E ASSINADO'}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Enviado em {dateFormatted} às {timeFormatted}
                            </span>
                          </div>

                          <div className="text-xs text-slate-600 flex items-center gap-1.5">
                            <BookOpen className="w-3 h-3 text-teal-600 shrink-0" />
                            <span className="font-semibold text-slate-800">{fb.normTitle}</span>
                            {fb.normSection && (
                              <span className="text-slate-400">({fb.normSection})</span>
                            )}
                          </div>

                          <p className="text-[11px] text-slate-500 line-clamp-1 italic">
                            &quot;{fb.rawContext}&quot;
                          </p>

                          {!isPending && fb.acknowledgedAt && (
                            <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1 mt-1 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 w-fit">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>
                                Ciente em{' '}
                                {fb.acknowledgedFormatted ||
                                  `${new Date(fb.acknowledgedAt).toLocaleDateString('pt-BR')} às ${new Date(fb.acknowledgedAt).toLocaleTimeString('pt-BR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}`}
                                {fb.acknowledgedIp ? ` • IP: ${fb.acknowledgedIp}` : ''}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setSelectedFeedbackDetails(fb)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                          >
                            Ver Detalhes
                          </button>
                          {fb.targetUserPhone && (
                            <button
                              type="button"
                              onClick={() => {
                                const link = buildWhatsAppFeedbackLink(fb.targetUserPhone, {
                                  targetUserName: fb.targetUserName,
                                  normTitle: fb.normTitle,
                                  generatedMessage: fb.generatedMessage,
                                });
                                window.open(link, '_blank');
                              }}
                              className="p-1.5 rounded-xl text-emerald-700 hover:bg-emerald-50 border border-emerald-200 transition-colors cursor-pointer"
                              title="Reenviar via WhatsApp"
                            >
                              <Phone className="w-4 h-4" />
                            </button>
                          )}
                          {canDeleteFeedback(currentUser, fb) && (
                            <button
                              type="button"
                              onClick={() => setFeedbackToDelete(fb)}
                              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 transition-colors cursor-pointer shrink-0"
                              title="Excluir este feedback (Apenas Coordenação/Autor)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal de Detalhes do Feedback (Histórico) */}
        {selectedFeedbackDetails && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs">
            <div className="bg-white rounded-3xl p-6 max-w-xl w-full max-h-[85vh] overflow-y-auto space-y-4 shadow-2xl border border-slate-200">
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <h4 className="text-base font-black text-slate-900">
                    Detalhes da Orientação Pedagógica
                  </h4>
                  <p className="text-xs text-slate-500">
                    Destinatária: {selectedFeedbackDetails.targetUserName}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedFeedbackDetails(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-bold text-slate-600 block">Norma Vinculada:</span>
                  <span className="font-semibold text-slate-900">
                    {selectedFeedbackDetails.normTitle}
                  </span>
                </div>

                <div>
                  <span className="font-bold text-slate-600 block">Fato Observado:</span>
                  <p className="p-2.5 bg-slate-50 rounded-xl text-slate-700 italic border border-slate-200">
                    &quot;{selectedFeedbackDetails.rawContext}&quot;
                  </p>
                </div>

                <div>
                  <span className="font-bold text-slate-600 block mb-1">
                    Mensagem Cordial Enviada:
                  </span>
                  <div className="p-3.5 bg-teal-50/50 rounded-xl border border-teal-100 text-xs text-slate-800 shadow-2xs">
                    <FeedbackMarkdown
                      content={selectedFeedbackDetails.generatedMessage}
                      highlightVariant="teal"
                    />
                  </div>
                </div>

                {selectedFeedbackDetails.actionPoints?.length > 0 && (
                  <div>
                    <span className="font-bold text-slate-600 block mb-1">
                      Checklist de Ciência:
                    </span>
                    <ul className="space-y-1">
                      {selectedFeedbackDetails.actionPoints.map((pt, i) => (
                        <li key={i} className="flex items-center gap-2 text-slate-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                {canDeleteFeedback(currentUser, selectedFeedbackDetails) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFeedbackToDelete(selectedFeedbackDetails);
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Excluir este feedback permanentemente"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir Feedback</span>
                  </button>
                ) : (
                  <div />
                )}
                <button
                  onClick={() => setSelectedFeedbackDetails(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Confirmação de Segurança para Exclusão de Feedback */}
        {feedbackToDelete && (
          <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-rose-100 rounded-2xl text-rose-600 shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">
                    Excluir Registro de Feedback?
                  </h4>
                  <p className="text-xs text-slate-500">
                    Ação restrita da coordenação e autor
                  </p>
                </div>
              </div>

              <div className="bg-rose-50/80 p-4 rounded-2xl border border-rose-200 text-xs text-rose-950 space-y-2">
                <p className="font-bold text-rose-900">
                  Deseja realmente excluir este feedback? Esta ação não pode ser desfeita.
                </p>
                <div className="pt-2 text-[11px] text-slate-700 space-y-1 border-t border-rose-200/60">
                  <p>
                    <strong className="text-slate-900">Colaboradora:</strong> {feedbackToDelete.targetUserName}
                  </p>
                  <p>
                    <strong className="text-slate-900">Norma:</strong> {feedbackToDelete.normTitle}
                  </p>
                  <p>
                    <strong className="text-slate-900">Status:</strong>{' '}
                    <span
                      className={`font-bold ${
                        feedbackToDelete.status === 'PENDING' ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {feedbackToDelete.status === 'PENDING'
                        ? 'Pendente de Assinatura'
                        : 'Ciente e Assinado'}
                    </span>
                  </p>
                  <p>
                    <strong className="text-slate-900">Data de Envio:</strong>{' '}
                    {new Date(feedbackToDelete.createdAt).toLocaleDateString('pt-BR')} às{' '}
                    {new Date(feedbackToDelete.createdAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isDeletingFeedback}
                  onClick={() => setFeedbackToDelete(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeletingFeedback}
                  onClick={handleConfirmDeleteFeedback}
                  className="px-4 py-2.5 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-600/20 disabled:opacity-50 active:scale-95"
                >
                  {isDeletingFeedback ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Excluindo...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 text-white" />
                      <span>Sim, Excluir Registro</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rodapé do Modal */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400">
            Colégio Crescer • Comunicação Não-Violenta (CNV) e Gestão Humanizada
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
export default GestaoFeedbacksModal;
