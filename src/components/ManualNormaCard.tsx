import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Ban,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  Award,
  Bus,
  HeartHandshake,
  Check,
  Loader2,
  Square,
  CheckSquare,
} from 'lucide-react';
import { ManualNorma, MODULE_METADATA } from '../types/manualNormas';
import { UserProfile } from '../types';

export interface ManualNormaCardProps {
  norma: ManualNorma;
  isExpanded: boolean;
  isHighlighted?: boolean;
  isAdmin?: boolean;
  currentUser?: UserProfile | null;
  isCompleted: boolean;
  onToggleExpand: () => void;
  onConfirmNormaScience: (normaId: string) => Promise<void> | void;
  onEditNorma?: (norma: ManualNorma) => void;
  onDeleteNorma?: (norma: ManualNorma) => void;
  onOpenFeedback?: (norma: ManualNorma, selectedChecklistItem?: string) => void;
}

export const ManualNormaCard: React.FC<ManualNormaCardProps> = ({
  norma,
  isExpanded,
  isHighlighted = false,
  isAdmin = false,
  currentUser,
  isCompleted,
  onToggleExpand,
  onConfirmNormaScience,
  onEditNorma,
  onDeleteNorma,
  onOpenFeedback,
}) => {
  // Estado local dos checkboxes de cada ponto de atenção/detalhe da norma
  // Para normas já concluídas no Firestore, todos os pontos começam marcados
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    if (isCompleted && Array.isArray(norma.details)) {
      norma.details.forEach((_, idx) => {
        initial[idx] = true;
      });
    }
    return initial;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Efeito se a norma for marcada como concluída posteriormente
  React.useEffect(() => {
    if (isCompleted && Array.isArray(norma.details)) {
      setCheckedItems((prev) => {
        const next = { ...prev };
        norma.details.forEach((_, idx) => {
          next[idx] = true;
        });
        return next;
      });
    }
  }, [isCompleted, norma.details]);

  const detailsCount = Array.isArray(norma.details) && norma.details.length > 0 ? norma.details.length : 1;

  // Calcula quantos checkboxes estão marcados
  const checkedCount = Array.isArray(norma.details) && norma.details.length > 0
    ? norma.details.filter((_, idx) => Boolean(checkedItems[idx])).length
    : checkedItems[0] ? 1 : 0;

  // O botão de confirmar ciência individual só pode ser habilitado se 100% dos checkboxes estiverem marcados
  const isAllChecked = checkedCount >= detailsCount;
  const progressPercent = Math.round((checkedCount / detailsCount) * 100);

  const toggleCheck = (idx: number) => {
    setCheckedItems((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const handleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const updated: Record<number, boolean> = {};
    if (Array.isArray(norma.details) && norma.details.length > 0) {
      norma.details.forEach((_, idx) => {
        updated[idx] = true;
      });
    } else {
      updated[0] = true;
    }
    setCheckedItems(updated);
  };

  const handleConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAllChecked || isCompleted || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onConfirmNormaScience(norma.id);
    } catch (err) {
      console.error('Erro ao confirmar ciência da norma:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isProibicao = norma.type === 'proibicao';
  const isAlerta = norma.type === 'alerta';
  const isRecomendado = norma.type === 'recomendado';

  const cardBorder = isHighlighted
    ? 'border-indigo-500 ring-4 ring-indigo-400/30 bg-indigo-50/40 shadow-lg'
    : isCompleted
    ? 'border-emerald-300 ring-1 ring-emerald-300/40 bg-white shadow-xs'
    : isProibicao
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
    : 'ORIENTAÇÃO INSTITUCIONAL - PROGRAMA DO INTEGRAL';

  const moduleMeta = MODULE_METADATA[norma.moduleId];

  return (
    <div
      id={`card-${norma.id}`}
      className={`rounded-2xl border ${cardBorder} shadow-xs overflow-hidden transition-all duration-200`}
    >
      {/* Top Card Header */}
      <div className="p-4 sm:p-4.5 flex items-start sm:items-center justify-between gap-3 text-left">
        <div
          onClick={onToggleExpand}
          className="flex-1 flex items-start sm:items-center space-x-3 cursor-pointer"
        >
          <div className="p-2 rounded-xl bg-slate-900 text-white shrink-0 mt-0.5 sm:mt-0 shadow-2xs">
            {norma.moduleId === 'normas_internas' ? (
              <Award className="w-4 h-4 text-indigo-400" />
            ) : norma.moduleId === 'academia_transporte' ? (
              <Bus className="w-4 h-4 text-amber-400" />
            ) : (
              <HeartHandshake className="w-4 h-4 text-rose-400" />
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span
                className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${badgeBg}`}
              >
                {badgeIcon}
                <span>{badgeLabel}</span>
              </span>

              {/* Badge de Norma Concluída solicitado */}
              {isCompleted ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs animate-in fade-in">
                  <span>🟢 Norma Concluída</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                  <span>⏳ Leitura Pendente ({checkedCount}/{detailsCount})</span>
                </span>
              )}

              {(() => {
                const secClean = String(norma.sectionNumber || norma.section || '').replace(/^seção\s*/i, '').trim();
                if (!secClean) return null;
                return (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-slate-900 text-white border border-slate-700 shadow-2xs">
                    SEÇÃO {secClean}
                  </span>
                );
              })()}
              <span className="text-[11px] font-bold text-slate-400">
                {moduleMeta ? moduleMeta.title : norma.moduleTitle}
              </span>
            </div>

            <h4 className="text-sm sm:text-base font-extrabold text-slate-900">
              {(() => {
                const secClean = String(norma.sectionNumber || norma.section || '').replace(/^seção\s*/i, '').trim();
                return secClean ? `SEÇÃO ${secClean} • ${norma.title}` : norma.title;
              })()}
            </h4>
            {norma.summary && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                {norma.summary}
              </p>
            )}
          </div>
        </div>

        {/* Actions: Admin (Edit / Delete) + Toggle Chevron */}
        <div className="flex items-center space-x-1.5 shrink-0">
          {isAdmin && onEditNorma && onDeleteNorma && (
            <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditNorma(norma);
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
                  onDeleteNorma(norma);
                }}
                className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                title="Excluir esta norma do banco"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              {onOpenFeedback && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenFeedback(norma);
                  }}
                  className="px-2 py-1 text-teal-800 hover:text-teal-950 bg-teal-100 hover:bg-teal-200 rounded-lg transition-colors cursor-pointer flex items-center space-x-1 text-[11px] font-bold border border-teal-300"
                  title={`Elaborar feedback com IA vinculado à norma "${norma.title}"`}
                >
                  <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                  <span className="hidden sm:inline">Feedback IA</span>
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onToggleExpand}
            className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
            title={isExpanded ? 'Recolher detalhes' : 'Expandir checklist e detalhes'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Card Details com Checklist Individual Interativo */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 space-y-3.5 border-t border-slate-100 bg-slate-50/50">
          {norma.summary && (
            <p className="text-xs text-slate-700 font-semibold bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
              {norma.summary}
            </p>
          )}

          {/* Seção do Checklist Individual por Norma */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                  Checklist de Leitura e Pontos de Atenção Obrigatórios:
                </span>
                <span className="text-[10px] text-slate-500">
                  Marque cada item abaixo para liberar a confirmação de ciência individual desta norma.
                </span>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-[11px] font-extrabold text-slate-600">
                  {checkedCount}/{detailsCount} ({progressPercent}%)
                </span>
                {!isCompleted && !isAllChecked && (
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                  >
                    Marcar todos
                  </button>
                )}
              </div>
            </div>

            {/* Lista com Checkboxes Interativos */}
            <div className="space-y-2">
              {Array.isArray(norma.details) && norma.details.length > 0 ? (
                norma.details.map((detail, dIdx) => {
                  const isChecked = Boolean(checkedItems[dIdx]);
                  return (
                    <div
                      key={dIdx}
                      className={`flex items-start justify-between gap-2 p-2.5 rounded-xl border transition-all ${
                        isChecked
                          ? 'bg-emerald-50/60 border-emerald-200 text-slate-900'
                          : 'bg-slate-50/70 border-slate-200 hover:bg-white text-slate-700'
                      }`}
                    >
                      <label className="flex items-start space-x-2.5 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(dIdx)}
                          className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer shrink-0"
                        />
                        <span className="text-xs leading-relaxed select-none">
                          {detail}
                        </span>
                      </label>

                      {isAdmin && onOpenFeedback && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenFeedback(norma, detail);
                          }}
                          className="px-2 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 hover:border-teal-300 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer flex items-center space-x-1 shrink-0 group/itemBtn shadow-2xs"
                          title={`Elaborar feedback por IA focado estritamente neste item: "${detail}"`}
                        >
                          <Sparkles className="w-3 h-3 text-amber-500 group-hover/itemBtn:scale-110 transition-transform" />
                          <span className="hidden sm:inline">Feedback deste item</span>
                          <span className="sm:hidden">Feedback</span>
                        </button>
                      )}
                    </div>
                  );
                })
              ) : (
                <label className="flex items-start space-x-2.5 p-2 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(checkedItems[0])}
                    onChange={() => toggleCheck(0)}
                    className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-slate-300 cursor-pointer shrink-0"
                  />
                  <span className="text-xs text-slate-800">
                    Confirmo a leitura atenta das diretrizes desta norma.
                  </span>
                </label>
              )}
            </div>

            {/* Barra de Ação Individual da Norma */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <span className="text-[11px] text-slate-500">
                {isCompleted
                  ? 'Você já registrou sua ciência nesta norma institucional.'
                  : isAllChecked
                  ? '✓ Todos os pontos lidos. Você já pode confirmar sua ciência.'
                  : `Aguardando você marcar os ${detailsCount - checkedCount} item(ns) restantes.`}
              </span>

              {isCompleted ? (
                <div className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-black shrink-0 border border-emerald-300">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>🟢 Norma Concluída</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!isAllChecked || isSubmitting}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  title={
                    isAllChecked
                      ? 'Confirmar ciência individual desta norma'
                      : 'Marque 100% dos checkboxes para habilitar'
                  }
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>Gravando no Firestore...</span>
                    </>
                  ) : (
                    <>
                      <span>[ ✍️ Confirmar Ciência Desta Norma ]</span>
                    </>
                  )}
                </button>
              )}

              {isAdmin && onOpenFeedback && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const firstCheckedDetail = Array.isArray(norma.details)
                      ? norma.details.find((_, idx) => Boolean(checkedItems[idx]))
                      : undefined;
                    onOpenFeedback(norma, firstCheckedDetail);
                  }}
                  className="px-3.5 py-2 bg-gradient-to-r from-teal-600 to-emerald-700 hover:from-teal-500 hover:to-emerald-600 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer shrink-0"
                  title={`Abrir módulo para elaborar feedback pedagógico cordial com IA para a norma "${norma.title}"`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>[ ✨ Elaborar Feedback com IA ]</span>
                </button>
              )}
            </div>
          </div>

          <div className="pt-1 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2">
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
                Atualizado em {new Date(norma.updatedAt).toLocaleDateString('pt-BR')}{' '}
                {norma.updatedBy ? `por ${norma.updatedBy}` : ''}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
