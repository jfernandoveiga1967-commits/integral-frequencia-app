import React, { useState, useEffect } from 'react';
import { Bell, ArrowRight, X, AlertTriangle, ShieldCheck } from 'lucide-react';
import { UserProfile, UserNotification } from '../types';
import {
  subscribeUserNotifications,
  markUserNotificationAsRead,
} from '../firebase';

export interface UserNotificationBannerProps {
  currentUser: UserProfile | null;
  notifications?: UserNotification[];
  onDismissNotification?: (id: string) => Promise<void> | void;
  onNavigateToTab?: (tab: string) => void;
}

export const UserNotificationBanner: React.FC<UserNotificationBannerProps> = ({
  currentUser,
  notifications: propsNotifications,
  onDismissNotification,
}) => {
  const [internalNotifications, setInternalNotifications] = useState<UserNotification[]>(() => {
    if (!currentUser) return [];
    try {
      const currentUid = currentUser.uid || currentUser.id;
      const cached = localStorage.getItem(`crescer_notifs_${currentUid}`);
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  });

  const targetUid = currentUser?.uid || currentUser?.id;

  // Se as notificações não vierem de fora via prop, ouve em tempo real
  useEffect(() => {
    if (propsNotifications !== undefined) return;
    if (!targetUid) {
      setInternalNotifications([]);
      return;
    }

    const unsubscribe = subscribeUserNotifications(
      targetUid,
      (list) => {
        setInternalNotifications(list);
      },
      (err) => {
        console.warn('Erro ao escutar notificações do usuário:', err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [targetUid, propsNotifications]);

  const activeList = propsNotifications !== undefined ? propsNotifications : internalNotifications;

  // Apenas notificações com status == 'UNREAD' (ou !read), excluindo alertas técnicos da Sofia (exibidos apenas no chat da Sofia)
  const unreadAlerts = activeList.filter(
    (n) => n.type !== 'ia_alerta' && (n.status === 'UNREAD' || (!n.read && n.status !== 'READ'))
  );

  if (unreadAlerts.length === 0) return null;

  const currentAlert = unreadAlerts[0];

  const handleDismiss = async (notificationId: string) => {
    // 1. Oculta imediatamente no estado local e no cache local para resposta instantânea
    setInternalNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, read: true, status: 'READ' as const } : n
      )
    );

    if (targetUid) {
      try {
        const key = `crescer_notifs_${targetUid}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed: UserNotification[] = JSON.parse(raw);
          const updated = parsed.filter((n) => n.id !== notificationId);
          localStorage.setItem(key, JSON.stringify(updated));
        }
      } catch {}
    }

    if (onDismissNotification) {
      try {
        await onDismissNotification(notificationId);
      } catch (err) {
        console.warn('Erro ao disparar onDismissNotification:', err);
      }
    }

    // 2. Atualiza no Firestore: status: 'READ' e read: true (sem forçar navegação imediata)
    try {
      await markUserNotificationAsRead(notificationId);
    } catch (err) {
      console.warn('Aviso ao marcar notificação como lida no Firestore:', err);
    }
  };

  const isAiAlert = currentAlert.type === 'ia_alerta';
  const isGeneralAlert = currentAlert.type === 'aviso_geral';

  // Monta o título e mensagem conforme o tipo real da notificação
  const tituloNorma =
    currentAlert.normaTitle ||
    (currentAlert.title && !currentAlert.title.includes('🔔')
      ? currentAlert.title
      : 'Normas Internas e Rotina do Integral');

  const bannerTitle = isAiAlert
    ? currentAlert.title || '⚠️ Alerta Técnico da Assistente Sofia'
    : isGeneralAlert && currentAlert.title
    ? currentAlert.title
    : '🔔 Lembrete da Coordenação do Integral';

  const formattedMessage = isAiAlert || isGeneralAlert
    ? currentAlert.message
    : currentAlert.message && currentAlert.message.includes('Identificamos que a norma')
    ? currentAlert.message
    : `Identificamos que a norma '📌 ${tituloNorma}' ainda aguarda sua leitura e confirmação de ciente no aplicativo. Por favor, acesse o módulo de Normas para ler e assinar quando possível.`;

  return (
    <aside
      aria-label="Alerta Informativo do Sistema"
      className={
        isAiAlert
          ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white rounded-2xl p-0.5 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300'
          : 'bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 text-white rounded-2xl p-0.5 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300'
      }
    >
      <div className="bg-slate-900/95 backdrop-blur-md rounded-[14px] p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-white">
        {/* Conteúdo Informativo */}
        <div className="flex items-start space-x-3 min-w-0">
          <div className={`p-2.5 rounded-xl shrink-0 border ${isAiAlert ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'}`}>
            {isAiAlert ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <Bell className="w-5 h-5 animate-bounce" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-white ${isAiAlert ? 'bg-amber-600' : 'bg-rose-500'}`}>
                {isAiAlert ? 'Alerta IA • Coordenação' : 'Aviso do Sistema'}
              </span>
              {unreadAlerts.length > 1 && (
                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                  +{unreadAlerts.length - 1} aviso(s)
                </span>
              )}
            </div>

            {/* Título Oficial */}
            <h4 className="text-sm font-black text-white mt-1 leading-snug">
              {bannerTitle}
            </h4>

            {/* Mensagem Oficial Formatada */}
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              {formattedMessage}
            </p>
          </div>
        </div>

        {/* Ações: Link (para alerta de IA) e botão discreto de fechar / ciente */}
        <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
          {isAiAlert && currentAlert.actionUrl && (
            <a
              href={currentAlert.actionUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition shadow-sm"
            >
              <span>Abrir ai.studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => handleDismiss(currentAlert.id)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold transition shadow-sm cursor-pointer active:scale-95"
            title="Dispensar aviso e marcar como lido"
          >
            <X className="w-3.5 h-3.5 text-rose-400" />
            <span>Entendido</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
