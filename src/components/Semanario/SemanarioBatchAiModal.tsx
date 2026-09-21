import React from 'react';
import { Sparkles, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Layers, Brain } from 'lucide-react';
import { SemanarioAiProgress } from '../../utils/semanarioAiGenerator';

interface SemanarioBatchAiModalProps {
  isOpen: boolean;
  isGenerating: boolean;
  progress: SemanarioAiProgress;
  summaryMessage?: string | null;
  onCancel: () => void;
  onClose: () => void;
  onRetryFailed?: () => void;
  failedCount: number;
}

export const SemanarioBatchAiModal: React.FC<SemanarioBatchAiModalProps> = ({
  isOpen,
  isGenerating,
  progress,
  summaryMessage,
  onCancel,
  onClose,
  onRetryFailed,
  failedCount,
}) => {
  if (!isOpen) return null;

  const isCompleted = !isGenerating && progress.total > 0 && progress.current >= progress.total;

  return (
    <div
      id="semanario-batch-ai-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-slate-100 relative">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Brain className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Povoamento com IA (Gemini)
                <Sparkles className="w-4 h-4 text-amber-300" />
              </h3>
              <p className="text-xs text-slate-400">
                {isGenerating
                  ? 'Gerando planos pedagógicos adaptados à faixa etária e BNCC...'
                  : isCompleted
                  ? 'Processo de geração finalizado!'
                  : 'Geração interrompida pelo usuário.'}
              </p>
            </div>
          </div>
          {!isGenerating && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <XCircle className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Quota context note */}
        {isGenerating && progress.total > 20 && (
          <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-[11px] text-indigo-200/90 leading-relaxed flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Lote volumoso ({progress.total} propostas):</strong> Se a cota diária de IA gratuita for atingida, as propostas excedentes receberão automaticamente a grade curada padrão de salvaguarda.
            </span>
          </div>
        )}

        {/* Progress Bar & Percentage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span>
              {isGenerating
                ? `Gerando ${progress.current} de ${progress.total} planos...`
                : `${progress.current} de ${progress.total} planos processados`}
            </span>
            <span className="text-indigo-400 font-mono text-sm">{progress.percent}%</span>
          </div>

          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50 p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isCompleted
                  ? failedCount > 0
                    ? 'bg-gradient-to-r from-amber-500 to-indigo-500'
                    : 'bg-emerald-500'
                  : 'bg-gradient-to-r from-indigo-500 to-cyan-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
            />
          </div>
        </div>

        {/* Current Activity Indicator */}
        {isGenerating && (
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/40 flex items-center space-x-3">
            <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
            <div className="text-xs truncate">
              <span className="text-slate-400">Processando agora: </span>
              <span className="font-semibold text-indigo-200">
                {progress.currentTurma || 'Turma'} • {progress.currentCategory || 'Atividade'}
              </span>
              {progress.currentDay && (
                <span className="text-slate-400 ml-1">({progress.currentDay})</span>
              )}
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="p-3 bg-emerald-950/30 border border-emerald-500/20 rounded-xl">
            <div className="text-xs text-emerald-400 flex items-center justify-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Sucesso via Gemini
            </div>
            <div className="text-xl font-bold text-emerald-300 font-mono mt-0.5">
              {progress.successCount}
            </div>
          </div>

          <div className="p-3 bg-amber-950/30 border border-amber-500/20 rounded-xl">
            <div className="text-xs text-amber-400 flex items-center justify-center gap-1 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              Fallback Curado
            </div>
            <div className="text-xl font-bold text-amber-300 font-mono mt-0.5">
              {progress.failCount}
            </div>
          </div>
        </div>

        {/* Feedback Message */}
        {summaryMessage && (
          <div
            className={`p-3 rounded-xl border text-xs leading-relaxed ${
              failedCount > 0
                ? 'bg-amber-900/20 border-amber-500/30 text-amber-200'
                : 'bg-emerald-900/20 border-emerald-500/30 text-emerald-200'
            }`}
          >
            {summaryMessage}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-800">
          {isGenerating ? (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-200 border border-rose-500/40 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <XCircle className="w-4 h-4" />
              <span>Interromper Geração</span>
            </button>
          ) : (
            <>
              {failedCount > 0 && onRetryFailed && (
                <button
                  type="button"
                  onClick={onRetryFailed}
                  className="px-3.5 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-200 border border-amber-500/40 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Tentar Novamente ({failedCount} com fallback)</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-indigo-600/30"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Concluir e Salvar Planos</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
