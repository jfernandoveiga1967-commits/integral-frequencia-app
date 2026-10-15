import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  HeartHandshake,
  CheckCircle2,
  Clock,
  AlertTriangle,
  BookOpen,
  Calendar,
  Phone,
  Mail,
  ShieldCheck,
  CheckSquare,
  Square,
  Sparkles,
  PenTool,
  Loader2,
  X,
  FileCheck,
  Building,
  Briefcase,
  Layers,
  ChevronRight,
  Award,
} from 'lucide-react';
import { UserProfile as UserProfileType } from '../types';
import {
  PedagogicalFeedback,
  subscribeAllFeedbacksForUser,
  acknowledgePedagogicalFeedback,
  formatFeedbackDateTimeBR,
} from '../services/feedbackService';

interface UserProfileProps {
  currentUser: UserProfileType;
  isOpen?: boolean;
  onClose?: () => void;
  defaultTab?: 'feedbacks' | 'details';
}

export const UserProfileModal: React.FC<UserProfileProps> = ({
  currentUser,
  isOpen = true,
  onClose,
  defaultTab = 'feedbacks',
}) => {
  const [activeTab, setActiveTab] = useState<'feedbacks' | 'details'>(defaultTab);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'signed'>('all');
  const [feedbacks, setFeedbacks] = useState<PedagogicalFeedback[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Armazena itens marcados do checklist por feedbackId: { [feedbackId]: { [itemIndex]: boolean } }
  const [checkedItems, setCheckedItems] = useState<Record<string, Record<number, boolean>>>({});
  const [signingId, setSigningId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const userId = currentUser.id || currentUser.uid || '';
  const userEmail = currentUser.email || '';
  const userName = currentUser.name || '';

  // Escuta todos os feedbacks da colaboradora no Firestore em tempo real
  useEffect(() => {
    if (!userId && !userEmail) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsub = subscribeAllFeedbacksForUser(
      userId,
      userEmail,
      userName,
      (list) => {
        setFeedbacks(list);
        setIsLoading(false);
      },
      (err) => {
        console.warn('[UserProfile] Erro ao carregar feedbacks:', err);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [userId, userEmail, userName]);

  // Contadores
  const pendingCount = useMemo(() => {
    return feedbacks.filter((f) => f.status === 'PENDING').length;
  }, [feedbacks]);

  const signedCount = useMemo(() => {
    return feedbacks.filter((f) => f.status === 'ACKNOWLEDGED').length;
  }, [feedbacks]);

  // Feedbacks filtrados
  const filteredFeedbacks = useMemo(() => {
    if (filterStatus === 'pending') return feedbacks.filter((f) => f.status === 'PENDING');
    if (filterStatus === 'signed') return feedbacks.filter((f) => f.status === 'ACKNOWLEDGED');
    return feedbacks;
  }, [feedbacks, filterStatus]);

  // Alterna item do checklist de um feedback específico
  const handleToggleItem = (feedbackId: string, itemIdx: number) => {
    setCheckedItems((prev) => {
      const currentFbItems = prev[feedbackId] || {};
      return {
        ...prev,
        [feedbackId]: {
          ...currentFbItems,
          [itemIdx]: !currentFbItems[itemIdx],
        },
      };
    });
  };

  // Verifica se todos os itens do checklist foram assinalados
  const isAllChecklistDone = (fb: PedagogicalFeedback) => {
    const points = fb.actionPoints || [];
    if (points.length === 0) return true;
    const currentFbItems = checkedItems[fb.id] || {};
    return points.every((_, idx) => Boolean(currentFbItems[idx]));
  };

  // Assinar e Confirmar Ciência
  const handleSignFeedback = async (fb: PedagogicalFeedback) => {
    if (!isAllChecklistDone(fb)) {
      alert('Por favor, assinale todos os itens do checklist de ciência antes de assinar.');
      return;
    }

    setSigningId(fb.id);
    try {
      await acknowledgePedagogicalFeedback(fb.id, currentUser, checkedItems[fb.id]);
      setSuccessToast(`✅ Ciência assinada com sucesso para a orientação "${fb.normTitle}"!`);
      setTimeout(() => setSuccessToast(null), 4500);
    } catch (err) {
      console.error('Erro ao assinar feedback:', err);
      alert('Erro ao registrar assinatura. Tente novamente.');
    } finally {
      setSigningId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Top Header com Card do Colaborador */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 flex items-start justify-between shrink-0 border-b border-indigo-900/40">
          <div className="flex items-center space-x-4 min-w-0">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white font-black text-xl sm:text-2xl flex items-center justify-center shadow-lg ring-4 ring-white/10 shrink-0">
              {currentUser.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  {currentUser.cargoLabel || currentUser.role || 'Monitora'}
                </span>
                {pendingCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white animate-pulse">
                    🔴 {pendingCount} {pendingCount === 1 ? 'Pendente' : 'Pendentes'}
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-2xl font-black text-white truncate mt-1">
                {currentUser.name}
              </h2>
              <p className="text-xs text-indigo-200/80 truncate">
                {currentUser.email || 'Email institucional'} • Colégio Crescer
              </p>
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              title="Fechar perfil"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Notificação Toast */}
        {successToast && (
          <div className="bg-emerald-600 text-white px-5 py-2.5 text-xs font-bold flex items-center justify-between shrink-0 animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-200 shrink-0" />
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

        {/* Navegação de Abas do Perfil */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-slate-200 bg-slate-50/80 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('feedbacks')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer ${
              activeTab === 'feedbacks'
                ? 'border-indigo-600 text-indigo-900 bg-white rounded-t-xl shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <HeartHandshake className="w-4 h-4 text-indigo-600" />
            <span>Meus Feedbacks e Orientações</span>
            {pendingCount > 0 ? (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white">
                {pendingCount}
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                {feedbacks.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer ${
              activeTab === 'details'
                ? 'border-indigo-600 text-indigo-900 bg-white rounded-t-xl shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="w-4 h-4 text-slate-600" />
            <span>Dados & Escala de Trabalho</span>
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/50">
          {activeTab === 'feedbacks' && (
            <div className="space-y-4">
              {/* Barra de Filtros */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setFilterStatus('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      filterStatus === 'all'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Todos ({feedbacks.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterStatus('pending')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      filterStatus === 'pending'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                    }`}
                  >
                    <span>🔴 Pendentes de Assinatura</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-white/20">
                      {pendingCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterStatus('signed')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      filterStatus === 'signed'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                  >
                    <span>🟢 Cientes e Assinados</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-white/20">
                      {signedCount}
                    </span>
                  </button>
                </div>

                <div className="text-[11px] text-slate-400 font-medium">
                  {isLoading ? 'Sincronizando com Firestore...' : 'Atualizado em tempo real'}
                </div>
              </div>

              {/* Lista de Feedbacks */}
              {isLoading ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600">Carregando orientações pedagógicas...</p>
                </div>
              ) : filteredFeedbacks.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-6">
                  <FileCheck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                  <h4 className="text-sm font-black text-slate-700">
                    {filterStatus === 'pending'
                      ? 'Nenhuma orientação pendente de assinatura!'
                      : 'Nenhum feedback registrado ainda'}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    {filterStatus === 'pending'
                      ? 'Parabéns! Todas as suas orientações e normas estão rigorosamente assinadas e em dia.'
                      : 'As orientações pedagógicas cordiais emitidas pela coordenação aparecerão aqui.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredFeedbacks.map((fb) => {
                    const isPending = fb.status === 'PENDING';
                    const points = fb.actionPoints || [];
                    const currentFbItems = checkedItems[fb.id] || {};
                    const checkedCount = points.filter((_, idx) => Boolean(currentFbItems[idx])).length;
                    const allDone = points.length === 0 || checkedCount === points.length;
                    const isSigningThis = signingId === fb.id;

                    const dateFormatted = formatFeedbackDateTimeBR(fb.createdAt);

                    return (
                      <div
                        key={fb.id}
                        className={`bg-white rounded-2xl border transition-all p-5 shadow-xs space-y-4 ${
                          isPending
                            ? 'border-rose-300 ring-2 ring-rose-500/10'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {/* Topo do Card */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  isPending
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                }`}
                              >
                                {isPending ? '🔴 PENDENTE DE ASSINATURA' : '🟢 CIENTE E ASSINADO'}
                              </span>

                              <span className="text-[11px] text-slate-400 font-medium">
                                Recebido em {dateFormatted}
                              </span>
                            </div>

                            <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-teal-600 shrink-0" />
                              <span>{fb.normTitle}</span>
                              {fb.normSection && (
                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                  {fb.normSection}
                                </span>
                              )}
                            </h3>
                          </div>

                          <div className="text-right text-[11px] text-slate-500 shrink-0">
                            Enviado por: <strong className="text-slate-700">{fb.createdByUserName || 'Coordenação'}</strong>
                          </div>
                        </div>

                        {/* Fato Observado (Contexto) */}
                        {fb.rawContext && (
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                            <span className="font-bold text-slate-600 block mb-0.5">
                              Fato / Observação da Rotina:
                            </span>
                            <p className="italic text-slate-700">&quot;{fb.rawContext}&quot;</p>
                          </div>
                        )}

                        {/* Mensagem Cordial da IA */}
                        <div className="space-y-1">
                          <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                            Orientação Pedagógica Cordial (CNV):
                          </span>
                          <div className="p-4 bg-teal-50/60 rounded-xl border border-teal-200/70 text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed shadow-2xs">
                            {fb.generatedMessage.split(/(\*\*.*?\*\*)/g).map((part, idx) => {
                              if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
                                return (
                                  <strong
                                    key={idx}
                                    className="font-black text-slate-900 bg-teal-100/60 px-1 py-0.5 rounded"
                                  >
                                    {part.slice(2, -2)}
                                  </strong>
                                );
                              }
                              return part;
                            })}
                          </div>
                        </div>

                        {/* Checklist de Ciência da Monitora */}
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-indigo-600" />
                              Checklist de Ciência da Monitora:
                            </span>
                            {isPending && points.length > 0 && (
                              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                                {checkedCount} de {points.length} itens assinalados
                              </span>
                            )}
                          </div>

                          {isPending && (
                            <p className="text-[11px] text-slate-500">
                              Assinale cada compromisso abaixo para confirmar sua leitura e habilitar sua assinatura digital:
                            </p>
                          )}

                          <div className="space-y-1.5">
                            {points.map((pointText, pIdx) => {
                              const isChecked = Boolean(currentFbItems[pIdx]);

                              if (isPending) {
                                return (
                                  <label
                                    key={pIdx}
                                    onClick={() => handleToggleItem(fb.id, pIdx)}
                                    className={`flex items-start gap-2.5 p-3 rounded-xl border transition-all cursor-pointer ${
                                      isChecked
                                        ? 'bg-indigo-50/70 border-indigo-300 text-indigo-950 font-medium'
                                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                                    }`}
                                  >
                                    <div className="mt-0.5 shrink-0 text-indigo-600">
                                      {isChecked ? (
                                        <CheckSquare className="w-4 h-4 fill-indigo-600 text-white" />
                                      ) : (
                                        <Square className="w-4 h-4 text-slate-400" />
                                      )}
                                    </div>
                                    <span className="text-xs sm:text-sm select-none">{pointText}</span>
                                  </label>
                                );
                              }

                              // Se já estiver assinado
                              return (
                                <div
                                  key={pIdx}
                                  className="flex items-start gap-2.5 p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200/60 text-emerald-950 text-xs"
                                >
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                  <span className="font-medium">{pointText}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Área de Assinatura e Carimbo Digital */}
                        <div className="pt-2">
                          {isPending ? (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-rose-50/80 p-3.5 rounded-xl border border-rose-200">
                              <div className="text-xs text-rose-900">
                                <span className="font-black block">Confirmação Obrigatória</span>
                                <span className="text-[11px] text-rose-800">
                                  {allDone
                                    ? 'Todos os pontos foram checados. Clique ao lado para assinar.'
                                    : `Assinale todos os ${points.length} itens do checklist para liberar a assinatura.`}
                                </span>
                              </div>

                              <button
                                type="button"
                                disabled={!allDone || isSigningThis}
                                onClick={() => handleSignFeedback(fb)}
                                className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black shadow-md transition-all cursor-pointer shrink-0 ${
                                  allDone && !isSigningThis
                                    ? 'bg-rose-600 hover:bg-rose-700 text-white hover:scale-[1.02] ring-2 ring-rose-400/40'
                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                }`}
                              >
                                {isSigningThis ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Registrando Assinatura...</span>
                                  </>
                                ) : (
                                  <>
                                    <PenTool className="w-4 h-4" />
                                    <span>Assinar e Confirmar Ciência</span>
                                  </>
                                )}
                              </button>
                            </div>
                          ) : (
                            <div className="bg-emerald-50/90 border border-emerald-300 p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-emerald-950">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-emerald-600 text-white rounded-lg">
                                  <CheckCircle2 className="w-4 h-4" />
                                </div>
                                <div className="text-xs">
                                  <span className="font-black block text-emerald-900">
                                    🟢 Ciente e Assinado Digitalmente
                                  </span>
                                  <span className="text-[11px] text-emerald-800">
                                    Assinado em{' '}
                                    {fb.acknowledgedFormatted ||
                                      `${new Date(fb.acknowledgedAt || '').toLocaleDateString('pt-BR')} às ${new Date(fb.acknowledgedAt || '').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                                    {fb.acknowledgedIp ? ` • Carimbo IP: ${fb.acknowledgedIp}` : ''}
                                  </span>
                                </div>
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-200/80 text-emerald-900 px-2.5 py-1 rounded-full border border-emerald-300 shrink-0 self-end sm:self-auto">
                                Certificado Gravado
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'details' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-indigo-600" />
                  Vínculos Funcionais & Escala
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <span className="text-slate-400 font-bold block mb-1">Cargo / Função:</span>
                    <span className="font-extrabold text-slate-800 text-sm">
                      {currentUser.cargoLabel || currentUser.role}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <span className="text-slate-400 font-bold block mb-1">Regime Contratual:</span>
                    <span className="font-extrabold text-slate-800 text-sm">
                      {currentUser.regimeContratual || currentUser.regimeTrabalho || 'CLT Mensalista'}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <span className="text-slate-400 font-bold block mb-1">Horário Contratual:</span>
                    <span className="font-extrabold text-slate-800 text-sm">
                      {currentUser.contractSchedule || `${currentUser.horarioInicio || '07:30'} às ${currentUser.horarioFim || '17:30'}`}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <span className="text-slate-400 font-bold block mb-1">Empresa Vinculada:</span>
                    <span className="font-extrabold text-slate-800 text-sm">
                      {currentUser.empresa || currentUser.company || 'Colégio Crescer'}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-slate-400 font-bold block mb-1.5 text-xs">
                    Turmas Atribuídas:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {(currentUser.assignedTurmas || []).length > 0 ? (
                      currentUser.assignedTurmas?.map((turma, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 rounded-xl text-xs font-black bg-indigo-50 text-indigo-800 border border-indigo-200"
                        >
                          {turma}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic">Nenhuma turma exclusiva atribuída</span>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-slate-400 font-bold block mb-1.5 text-xs">
                    Atividades e Modalidades:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {(currentUser.assignedActivities || []).length > 0 ? (
                      currentUser.assignedActivities?.map((act, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 rounded-xl text-xs font-black bg-teal-50 text-teal-800 border border-teal-200"
                        >
                          {act}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic">Rotina Geral do Integral</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>Colégio Crescer • Gestão de Conformidade e Orientações Pedagógicas</span>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-black text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 shadow-2xs transition-colors cursor-pointer"
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
