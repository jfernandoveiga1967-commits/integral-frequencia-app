import { useState, useEffect, useCallback } from 'react';

export interface PushNotificationState {
  isSupported: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  isIOSPWARequired: boolean;
  permission: NotificationPermission | 'unsupported';
  registration: ServiceWorkerRegistration | null;
  subscription: PushSubscription | null;
  isLoading: boolean;
  error: string | null;
}

export interface ExtendedNotificationOptions extends NotificationOptions {
  vibrate?: number | number[];
}

export interface UsePushNotificationsReturn extends PushNotificationState {
  requestPermission: () => Promise<NotificationPermission>;
  registerServiceWorker: () => Promise<ServiceWorkerRegistration | null>;
  subscribeToPush: (vapidPublicKey?: string) => Promise<PushSubscription | null>;
  unsubscribeFromPush: () => Promise<boolean>;
  sendLocalNotification: (title: string, options?: ExtendedNotificationOptions) => Promise<boolean>;
}

/**
 * Hook de Permissão e Inscrição para Web Push Notifications
 * Trata suporte para navegadores desktop, Android e iOS (Safari PWA instalado na tela de início).
 */
export function usePushNotifications(): UsePushNotificationsReturn {
  const [state, setState] = useState<PushNotificationState>(() => {
    if (typeof window === 'undefined') {
      return {
        isSupported: false,
        isIOS: false,
        isStandalone: false,
        isIOSPWARequired: false,
        permission: 'unsupported',
        registration: null,
        subscription: null,
        isLoading: true,
        error: null,
      };
    }

    const isNotificationSupported = 'Notification' in window;
    const isServiceWorkerSupported = 'serviceWorker' in navigator;
    const isSupported = isNotificationSupported && isServiceWorkerSupported;

    // Detectar iOS / iPadOS
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Detectar se está executando em modo Standalone (PWA instalado na tela de início)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    // No iOS (Safari), o Web Push requer que o PWA esteja instalado na tela de início (iOS 16.4+)
    const isIOSPWARequired = isIOS && !isStandalone;

    const permission: NotificationPermission | 'unsupported' = isNotificationSupported
      ? Notification.permission
      : 'unsupported';

    return {
      isSupported,
      isIOS,
      isStandalone,
      isIOSPWARequired,
      permission,
      registration: null,
      subscription: null,
      isLoading: false,
      error: null,
    };
  });

  // Registrar ou obter o Service Worker existente
  const registerServiceWorker = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }

    try {
      // Obter registro existente ou registrar novo
      let reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[Push] Service Worker registrado com escopo:', reg.scope);
      }

      // Aguardar o Service Worker estar pronto
      await navigator.serviceWorker.ready;

      setState((prev) => ({ ...prev, registration: reg }));

      // Verificar inscrição existente se suportado pelo navegador
      if ('PushManager' in window && reg?.pushManager) {
        try {
          const sub = await reg.pushManager.getSubscription();
          setState((prev) => ({ ...prev, subscription: sub }));
        } catch (subErr) {
          console.warn('[Push] Falha ao verificar subscrição existente:', subErr);
        }
      }

      return reg;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn('[Push] Erro ao registrar Service Worker:', errorMsg);
      setState((prev) => ({ ...prev, error: errorMsg }));
      return null;
    }
  }, []);

  // Inicialização automática ao montar
  useEffect(() => {
    if (state.isSupported) {
      registerServiceWorker();
    }
  }, [state.isSupported, registerServiceWorker]);

  // Solicitar permissão de notificação nativa ao usuário
  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }

    // Se no iOS e não estiver no modo PWA instalado, registrar aviso
    if (state.isIOSPWARequired) {
      console.info(
        '[Push] No iOS, adicione o aplicativo à tela de início (Compartilhar > Adicionar à Tela de Início) para habilitar notificações push.'
      );
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const permission = await Notification.requestPermission();
      setState((prev) => ({ ...prev, permission, isLoading: false }));

      if (permission === 'granted') {
        const reg = await registerServiceWorker();
        // Disparar evento para atualizar outros componentes ou listeners
        window.dispatchEvent(new CustomEvent('integral_push_permission_granted'));
        return permission;
      }

      return permission;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[Push] Erro ao solicitar permissão:', errorMsg);
      setState((prev) => ({ ...prev, error: errorMsg, isLoading: false }));
      return 'denied';
    }
  }, [state.isIOSPWARequired, registerServiceWorker]);

  // Inscrição no PushManager (com chave VAPID opcional)
  const subscribeToPush = useCallback(
    async (vapidPublicKey?: string): Promise<PushSubscription | null> => {
      let reg = state.registration;
      if (!reg) {
        reg = await registerServiceWorker();
      }

      if (!reg || !('PushManager' in window) || !reg.pushManager) {
        console.warn('[Push] PushManager não suportado neste navegador.');
        return null;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        let sub = await reg.pushManager.getSubscription();

        if (!sub && vapidPublicKey) {
          // Converter chave pública VAPID base64 para Uint8Array
          const padding = '='.repeat((4 - (vapidPublicKey.length % 4)) % 4);
          const base64 = (vapidPublicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
          const rawData = window.atob(base64);
          const outputArray = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
          }

          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: outputArray,
          });
        }

        setState((prev) => ({ ...prev, subscription: sub, isLoading: false }));
        return sub;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn('[Push] Erro ao subscrever Push:', errorMsg);
        setState((prev) => ({ ...prev, error: errorMsg, isLoading: false }));
        return null;
      }
    },
    [state.registration, registerServiceWorker]
  );

  // Cancelar inscrição
  const unsubscribeFromPush = useCallback(async (): Promise<boolean> => {
    if (!state.subscription) return false;

    try {
      const successful = await state.subscription.unsubscribe();
      if (successful) {
        setState((prev) => ({ ...prev, subscription: null }));
      }
      return successful;
    } catch (err: unknown) {
      console.warn('[Push] Erro ao desinscrever:', err);
      return false;
    }
  }, [state.subscription]);

  // Enviar uma notificação local (pelo Service Worker ou API direta)
  const sendLocalNotification = useCallback(
    async (title: string, options: ExtendedNotificationOptions = {}): Promise<boolean> => {
      if (state.permission !== 'granted') {
        const perm = await requestPermission();
        if (perm !== 'granted') return false;
      }

      const defaultOptions: ExtendedNotificationOptions = {
        icon: '/pwa-192.png',
        badge: '/icon.svg',
        vibrate: [200, 100, 200],
        tag: 'crescer_notification',
        ...options,
      };

      try {
        const reg = state.registration || (await registerServiceWorker());
        if (reg && 'showNotification' in reg) {
          await reg.showNotification(title, defaultOptions as NotificationOptions);
          return true;
        } else if ('Notification' in window) {
          new Notification(title, defaultOptions as NotificationOptions);
          return true;
        }
        return false;
      } catch (err) {
        console.warn('[Push] Erro ao exibir notificação local:', err);
        return false;
      }
    },
    [state.permission, state.registration, requestPermission, registerServiceWorker]
  );

  return {
    ...state,
    requestPermission,
    registerServiceWorker,
    subscribeToPush,
    unsubscribeFromPush,
    sendLocalNotification,
  };
}

export default usePushNotifications;
