import React, { useState, useEffect } from 'react';
import { Bell, ArrowRight, X, AlertTriangle, ShieldCheck } from 'lucide-react';
import { UserProfile, UserNotification } from '../types';
import {
  subscribeUserNotifications,
  markUserNotificationAsRead,
} from '../firebase';

export interface UserNotificationBannerProps {
  currentUser: UserProfile | null;
  onNavigateToTab?: (tab: string) => void;
}

export const UserNotificationBanner: React.FC<UserNotificationBannerProps> = ({
  currentUser,
  onNavigateToTab,
}) => {
  const [notifications, setNotifications] = useState<UserNotification[]>(() => {
    if (!currentUser) return [];
    try {
      const cached = localStorage.getItem(`crescer_notifs_${currentUser.id}`);
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  });

  useEffect(() => {
    if (!currentUser?.id) {
      setNotifications([]);
      return;
    }

    const unsubscribe = subscribeUserNotifications(
      currentUser.id,
      (list) => {
        setNotifications(list);
      },
      (err) => {
        console.warn('Erro ao escutar notificações do usuário:', err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentUser?.id]);

  // Apenas notificações não lidas
  const unreadAlerts = notifications.filter((n) => !n.read);
  if (unreadAlerts.length === 0) return null;

  const currentAlert = unreadAlerts[0];

  const handleDismiss = async (notificationId: string) => {
    // Atualiza estado local imediatamente para fluidez
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
    try {
      await markUserNotificationAsRead(notificationId);
    } catch (err) {
      console.warn('Aviso ao marcar notificação como lida:', err);
    }
  };

  const handleAction = async (alertItem: UserNotification) => {
    if (alertItem.linkTab && onNavigateToTab) {
      onNavigateToTab(alertItem.linkTab);
    }
    await handleDismiss(alertItem.id);
  };

  return (
    <div className="bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 text-white rounded-2xl p-0.5 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="bg-slate-900/95 backdrop-blur-md rounded-[14px] p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-white">
        <div className="flex items-start space-x-3 min-w-0">
          <div className="p-2.5 bg-rose-500/20 text-rose-400 rounded-xl shrink-0 border border-rose-500/30">
            <Bell className="w-5 h-5 animate-bounce" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white">
                Prioridade Alta
              </span>
              <span className="text-xs text-rose-300 font-bold">
                Lembrete da Coordenação
              </span>
              {unreadAlerts.length > 1 && (
                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                  +{unreadAlerts.length - 1} aviso(s)
                </span>
              )}
            </div>
            <h4 className="text-sm font-black text-white mt-0.5 leading-snug truncate">
              {currentAlert.title || 'Norma Pendente de Leitura e Confirmação'}
            </h4>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              {currentAlert.message}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
          <button
            type="button"
            onClick={() => handleAction(currentAlert)}
            className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95"
          >
            <span>Ler e Confirmar Ciência</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => handleDismiss(currentAlert.id)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            title="Dispensar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
