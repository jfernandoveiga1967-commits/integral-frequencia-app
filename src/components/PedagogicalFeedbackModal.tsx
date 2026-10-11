import React, { useState, useEffect, useMemo } from 'react';
import {
  HeartHandshake,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  BookOpen,
  Loader2,
  Square,
  CheckSquare,
  Lock,
  ArrowRight,
  Info,
} from 'lucide-react';
import { UserProfile } from '../types';
import {
  subscribePendingFeedbacksForUser,
  acknowledgePedagogicalFeedback,
  PedagogicalFeedback,
} from '../services/feedbackService';

interface PedagogicalFeedbackModalProps {
  currentUser?: UserProfile | null;
}

export const PedagogicalFeedbackModal: React.FC<PedagogicalFeedbackModalProps> = ({
  currentUser,
}) => {
  const [pendingFeedbacks, setPendingFeedbacks] = useState<PedagogicalFeedback[]>([]);
  const [currentFeedbackIndex, setCurrentFeedbackIndex] = useState<number>(0);
  const [checkedPoints, setCheckedPoints] = useState<Record<number, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [acknowledgedNotice, setAcknowledgedNotice] = useState<string | null>(null);

  const userId = currentUser?.id || currentUser?.uid || '';
  const userEmail = currentUser?.email || '';

  // Escuta feedbacks pendentes no Firestore
  useEffect(() => {
    if (!userId && !userEmail) {
      setPendingFeedbacks([]);
      return;
    }

    const unsub = subscribePendingFeedbacksForUser(
      userId,
      userEmail,
      (feedbacks) => {
        setPendingFeedbacks(feedbacks);
        setCurrentFeedbackIndex(0);
        setCheckedPoints({});
      },
      (err) => {
        console.warn('[PedagogicalFeedbackModal] Erro ao escutar feedbacks pendentes:', err);
      }
    );

    return () => unsub();
  }, [userId, userEmail]);

  // Feedback ativo atual
  const activeFeedback = useMemo(() => {
    if (pendingFeedbacks.length === 0) return null;
    return pendingFeedbacks[currentFeedbackIndex] || pendingFeedbacks[0];
  }, [pendingFeedbacks, currentFeedbackIndex]);

  // Lista de pontos de ação do checklist
  const actionPoints = useMemo(() => {
    if (!activeFeedback) return [];
    if (Array.isArray(activeFeedback.actionPoints) && activeFeedback.actionPoints.length > 0) {
      return activeFeedback.actionPoints;
    }
    return [
      `Alinhamento rigoroso com a norma "${activeFeedback.normTitle}"`,
      'Atenção permanente à segurança física e bem-estar das crianças',
      'Comunicação proativa com a coordenação e equipe pedagógica',
    ];
  }, [activeFeedback]);

  // Cálculo de progresso do checklist
  const totalPoints = actionPoints.length;
  const checkedCount = actionPoints.filter((_, idx) => Boolean(checkedPoints[idx])).length;
  const isAllChecked = totalPoints > 0 && checkedCount === totalPoints;
  const percentCompleted = totalPoints > 0 ? Math.round((checkedCount / totalPoints) * 100) : 0;

  // Alterna checkbox individual
  const toggleCheckbox = (index: number) => {
    setCheckedPoints((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Confirmar Leitura e Aceite
  const handleConfirmAcknowledge = async () => {
    if (!activeFeedback || !currentUser || !isAllChecked) return;

    setIsSubmitting(true);
    try {
      await acknowledgePedagogicalFeedback(activeFeedback.id, currentUser);

      setAcknowledgedNotice(
        '🌿 Orientação compreendida com sucesso! Seu compromisso fortalece a segurança e o cuidado das nossas crianças.'
      );

      // Remove da lista local e reseta checklist
      setPendingFeedbacks((prev) => prev.filter((f) => f.id !== activeFeedback.id));
      setCheckedPoints({});
      setCurrentFeedbackIndex(0);

      setTimeout(() => {
        setAcknowledgedNotice(null);
      }, 4000);
    } catch (err) {
      console.error('Erro ao registrar ciência do feedback:', err);
      alert('Erro ao registrar ciência. Por favor, tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Se não houver feedbacks pendentes nem aviso ativo, não renderiza
  if (!activeFeedback && !acknowledgedNotice) {
    return null;
  }

  // Notificação de sucesso após aceite
  if (!activeFeedback && acknowledgedNotice) {
    return (
      <div className="fixed bottom-6 right-6 z-50 max-w-md bg-emerald-800 text-white p-4 rounded-2xl shadow-2xl border border-emerald-600 flex items-start gap-3 animate-in slide-in-from-bottom duration-300">
        <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
        <p className="text-xs font-semibold leading-relaxed">{acknowledgedNotice}</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-teal-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Cabeçalho Acolhedor */}
        <div className="bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-800 text-white p-5 sm:p-6 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-600/70 text-teal-100 border border-teal-400/30 flex items-center gap-1">
                <HeartHandshake className="w-3 h-3 text-teal-200" />
                Coordenação Pedagógica • Acolhimento
              </span>
              {pendingFeedbacks.length > 1 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/80 text-white">
                  Orientação {currentFeedbackIndex + 1} de {pendingFeedbacks.length}
                </span>
              )}
            </div>
            <span className="text-[11px] text-teal-200 font-medium">
              Colégio Crescer
            </span>
          </div>

          <h3 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2">
            Orientação Pedagógica Individual
          </h3>

          <div className="flex items-center gap-2 text-xs text-teal-100 bg-teal-900/40 px-3 py-1.5 rounded-xl border border-teal-600/30">
            <BookOpen className="w-3.5 h-3.5 text-teal-300 shrink-0" />
            <span className="font-semibold">
              Vinculada à Norma: &quot;{activeFeedback?.normTitle}&quot;
              {activeFeedback?.normSection ? ` (Seção ${activeFeedback.normSection})` : ''}
            </span>
          </div>
        </div>

        {/* Corpo com Rolagem */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Mensagem Cordial da Coordenação */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>Mensagem da Coordenação para você:</span>
            </div>

            <div className="p-4 sm:p-5 bg-teal-50/50 rounded-2xl border border-teal-100/80 text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed shadow-2xs">
              {activeFeedback?.generatedMessage}
            </div>
          </div>

          {/* Fato Observado (Contexto Respeitoso) */}
          {activeFeedback?.rawContext && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-700 block">Contexto da Observação:</span>
                <span className="italic">&quot;{activeFeedback.rawContext}&quot;</span>
              </div>
            </div>
          )}

          {/* Checklist Individual dos Pontos de Orientação */}
          <div className="space-y-3 bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-700" />
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Checklist de Ciência e Compromisso Pedagógico
                </h4>
              </div>
              <span className="text-[11px] font-black text-teal-800 bg-teal-100 px-2 py-0.5 rounded-full">
                {checkedCount} de {totalPoints} ({percentCompleted}%)
              </span>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Por gentileza, leia atentamente e assinale cada um dos pontos abaixo para confirmar sua
              compreensão e liberar o termo de ciência:
            </p>

            {/* Lista Interativa de Checkboxes */}
            <div className="space-y-2 pt-1">
              {actionPoints.map((point, index) => {
                const isChecked = Boolean(checkedPoints[index]);

                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => toggleCheckbox(index)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                      isChecked
                        ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-2xs'
                        : 'bg-white border-slate-200 hover:border-teal-300 text-slate-700'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    <div className="text-xs leading-relaxed font-medium">
                      <span className="font-bold mr-1.5">{index + 1}.</span>
                      <span>{point}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Barra de Progresso */}
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-3">
              <div
                className="bg-emerald-600 h-full transition-all duration-300"
                style={{ width: `${percentCompleted}%` }}
              />
            </div>
          </div>
        </div>

        {/* Rodapé com Trava e Botão de Confirmação */}
        <div className="bg-slate-50 p-4 sm:p-5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            {!isAllChecked ? (
              <span className="text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1.5 font-medium text-[11px]">
                <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Assinale 100% dos pontos do checklist para habilitar a confirmação.</span>
              </span>
            ) : (
              <span className="text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1.5 font-bold text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Todos os pontos assinalados! Pronto para assinar a ciência.</span>
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={!isAllChecked || isSubmitting}
            onClick={handleConfirmAcknowledge}
            className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
              isAllChecked && !isSubmitting
                ? 'bg-gradient-to-r from-teal-800 to-emerald-800 hover:from-teal-900 hover:to-emerald-900 text-white shadow-md'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Registrando Ciência...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>[ ✍️ Entendido e De Acordo ]</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
export default PedagogicalFeedbackModal;
