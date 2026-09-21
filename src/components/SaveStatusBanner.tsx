import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, RotateCcw, FileText, X } from 'lucide-react';
import { ConfirmedActionError } from '../hooks/useConfirmedAction';

export interface SaveStatusBannerProps {
  /** Se a ação assíncrona está em execução */
  isPending?: boolean;
  /** Texto exibido durante o salvamento */
  pendingText?: string;
  /** Mensagem de sucesso quando a gravação é confirmada */
  successNotice?: string | null;
  /** Objeto de erro com mensagem legível e função retry */
  error?: ConfirmedActionError | { message: string; retry?: () => Promise<any> | void } | null;
  /** Callback para limpar ou fechar o aviso de erro */
  onClearError?: () => void;
  /** Callback opcional quando o usuário clica em 'Manter Rascunho / Fechar' */
  onKeepDraft?: () => void;
  /** Classes CSS adicionais */
  className?: string;
  /** ID para propósitos de teste e acessibilidade */
  id?: string;
  /** Versão compacta para cabeçalhos ou barras estreitas */
  compact?: boolean;
}

export const SaveStatusBanner: React.FC<SaveStatusBannerProps> = ({
  isPending = false,
  pendingText = 'Gravando dados com segurança no Firestore...',
  successNotice = null,
  error = null,
  onClearError,
  onKeepDraft,
  className = '',
  id = 'save-status-banner',
  compact = false,
}) => {
  // Se não houver nenhum estado ativo, não renderiza nada
  if (!isPending && !successNotice && !error) {
    return null;
  }

  // 1. ESTADO: SALVANDO / PROCESSANDO (isPending)
  if (isPending) {
    return (
      <div
        id={`${id}-pending`}
        role="status"
        aria-live="polite"
        className={`flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/90 px-4 py-2.5 text-blue-900 shadow-xs dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200 ${
          compact ? 'text-xs py-1.5 px-3' : 'text-sm'
        } ${className}`}
      >
        <Loader2 className={`animate-spin text-blue-600 dark:text-blue-400 shrink-0 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`} />
        <div className="flex-1 font-medium leading-snug">
          {pendingText}
        </div>
      </div>
    );
  }

  // 2. ESTADO: SUCESSO CONFIRMADO (successNotice)
  if (successNotice) {
    return (
      <div
        id={`${id}-success`}
        role="alert"
        aria-live="polite"
        className={`flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/90 px-4 py-2.5 text-emerald-900 shadow-xs dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200 ${
          compact ? 'text-xs py-1.5 px-3' : 'text-sm'
        } ${className}`}
      >
        <div className="flex items-center gap-2.5 font-medium leading-snug min-w-0">
          <CheckCircle2 className={`text-emerald-600 dark:text-emerald-400 shrink-0 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`} />
          <span className="truncate">{successNotice}</span>
        </div>
      </div>
    );
  }

  // 3. ESTADO: ERRO COM BOTÕES DE AÇÃO (error)
  if (error) {
    const errorMessage = typeof error === 'string' ? error : error.message || 'Falha ao salvar os dados no servidor.';
    const hasRetry = typeof error === 'object' && typeof error?.retry === 'function';

    return (
      <div
        id={`${id}-error`}
        role="alert"
        aria-live="assertive"
        className={`flex flex-col gap-2.5 rounded-lg border border-rose-200 bg-rose-50/95 p-3.5 text-rose-950 shadow-xs dark:border-rose-900/80 dark:bg-rose-950/50 dark:text-rose-100 ${
          compact ? 'text-xs p-2.5' : 'text-sm'
        } ${className}`}
      >
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertCircle className={`text-rose-600 dark:text-rose-400 shrink-0 mt-0.5 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`} />
            <div className="flex-1">
              <p className="font-semibold leading-tight text-rose-900 dark:text-rose-200">
                Não foi possível confirmar no Firestore
              </p>
              <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300 leading-normal">
                {errorMessage}
              </p>
            </div>
          </div>
          {onClearError && (
            <button
              type="button"
              onClick={onClearError}
              aria-label="Fechar aviso de erro"
              className="text-rose-400 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-200 p-1 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Botões de Ação no estado de Erro */}
        <div className="mt-1 flex flex-wrap items-center gap-2 pt-1 border-t border-rose-200/60 dark:border-rose-900/40">
          {hasRetry && (
            <button
              type="button"
              id={`${id}-btn-retry`}
              onClick={() => {
                if (typeof error?.retry === 'function') {
                  error.retry();
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 active:bg-rose-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Tentar Novamente
            </button>
          )}

          <button
            type="button"
            id={`${id}-btn-keep-draft`}
            onClick={() => {
              if (onKeepDraft) {
                onKeepDraft();
              } else if (onClearError) {
                onClearError();
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white/80 dark:bg-zinc-900/60 dark:border-rose-800/80 px-3 py-1.5 text-xs font-medium text-rose-800 dark:text-rose-200 hover:bg-rose-100/50 dark:hover:bg-zinc-800 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Manter Rascunho / Fechar
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default SaveStatusBanner;
