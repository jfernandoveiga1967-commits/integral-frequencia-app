import { useState, useCallback, useRef, useEffect } from 'react';

export interface ConfirmedActionError {
  message: string;
  originalError?: any;
  retry: () => Promise<boolean>;
}

export interface ConfirmedActionOptions<T = any> {
  /** Mensagem customizada de carregamento */
  loadingMessage?: string;
  /** Mensagem exibida ao confirmar a gravação no servidor */
  successMessage?: string;
  /** Mensagem amigável de erro se a operação falhar */
  errorMessage?: string;
  /** Callback executado após o await resolver com sucesso */
  onSuccess?: (result: T) => void | Promise<void>;
  /** Callback executado em caso de erro na Promise */
  onError?: (error: any) => void | Promise<void>;
  /** Tempo em milissegundos para limpar automaticamente o aviso de sucesso (padrão: 3500ms, 0 para desativar) */
  autoClearSuccessMs?: number;
}

/**
 * Traduz erros comuns do Firestore / rede em mensagens amigáveis em português
 */
export function formatFirestoreErrorMessage(err: any, fallback?: string): string {
  if (!err) return fallback || 'Ocorreu um erro ao comunicar com o servidor.';

  const rawMsg = String(err?.message || err?.code || err || '').toLowerCase();

  if (rawMsg.includes('permission-denied') || rawMsg.includes('missing or insufficient permissions')) {
    return 'Permissão negada pelo servidor Firestore. Verifique se seu usuário tem acesso para esta operação.';
  }
  if (
    rawMsg.includes('unavailable') ||
    rawMsg.includes('offline') ||
    rawMsg.includes('network') ||
    rawMsg.includes('failed to fetch')
  ) {
    return 'Sem conexão com o banco de dados na nuvem. Verifique sua conexão de rede ou tente novamente.';
  }
  if (rawMsg.includes('resource-exhausted') || rawMsg.includes('quota')) {
    return 'Cota diária do Firestore temporariamente atingida. Tente novamente em alguns minutos.';
  }
  if (rawMsg.includes('not-found')) {
    return 'O documento ou recurso solicitado não foi encontrado no servidor.';
  }
  if (rawMsg.includes('deadline-exceeded') || rawMsg.includes('timeout')) {
    return 'Tempo limite de comunicação com o Firestore esgotado. Tente novamente.';
  }

  if (fallback) {
    return fallback;
  }

  return err?.message || 'Falha na operação no banco de dados na nuvem.';
}

export function useConfirmedAction() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<ConfirmedActionError | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const autoClearTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearSuccess = useCallback(() => {
    if (autoClearTimerRef.current) {
      clearTimeout(autoClearTimerRef.current);
      autoClearTimerRef.current = null;
    }
    setSuccessNotice(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const reset = useCallback(() => {
    clearSuccess();
    clearError();
    setIsPending(false);
  }, [clearSuccess, clearError]);

  useEffect(() => {
    return () => {
      if (autoClearTimerRef.current) {
        clearTimeout(autoClearTimerRef.current);
      }
    };
  }, []);

  /**
   * Executa uma ação assíncrona garantindo que o sucesso só seja emitido
   * após a Promise realmente resolver (sem engolir erros).
   */
  const execute = useCallback(
    async <T>(
      actionFn: () => Promise<T>,
      options?: ConfirmedActionOptions<T>
    ): Promise<boolean> => {
      if (autoClearTimerRef.current) {
        clearTimeout(autoClearTimerRef.current);
        autoClearTimerRef.current = null;
      }

      setIsPending(true);
      setError(null);
      setSuccessNotice(null);

      try {
        const result = await actionFn();
        setIsPending(false);

        const successText = options?.successMessage || 'Dados gravados e confirmados no servidor com sucesso!';
        setSuccessNotice(successText);

        if (options?.autoClearSuccessMs !== 0) {
          const delay = options?.autoClearSuccessMs || 3500;
          autoClearTimerRef.current = setTimeout(() => {
            setSuccessNotice(null);
            autoClearTimerRef.current = null;
          }, delay);
        }

        if (options?.onSuccess) {
          await options.onSuccess(result);
        }

        return true;
      } catch (err: any) {
        setIsPending(false);
        const friendlyMessage = formatFirestoreErrorMessage(err, options?.errorMessage);

        const retryFn = () => execute(actionFn, options);

        setError({
          message: friendlyMessage,
          originalError: err,
          retry: retryFn,
        });

        if (options?.onError) {
          await options.onError(err);
        }

        return false;
      }
    },
    []
  );

  return {
    isPending,
    error,
    successNotice,
    execute,
    clearError,
    clearSuccess,
    reset,
  };
}

export default useConfirmedAction;
