import React, { useState, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  ShieldCheck,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import { UserProfile } from '../types';
import { ConnectionState } from '../services/syncService';
import { getRoleBadgeStyle } from '../utils/authUtils';
import {
  isAudioNotificationsEnabled,
  setAudioNotificationsEnabled,
  unlockAudioContextAndPlayTest,
  isAudioContextReady,
} from '../utils/notificationUtils';

export interface FooterProps {
  currentUser: UserProfile | null;
  onLogout: () => void;
  connectionState?: ConnectionState;
  onForceSync?: () => void;
  firebaseConnected?: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  currentUser,
  onLogout,
  connectionState,
  onForceSync,
  firebaseConnected,
}) => {
  const roleStyle = currentUser ? getRoleBadgeStyle(currentUser.role) : null;

  // Sound Notifications state
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(() => isAudioNotificationsEnabled());
  const [, setIsAudioReady] = useState<boolean>(() => isAudioContextReady());
  const [showToastFeedback, setShowToastFeedback] = useState<string | null>(null);

  useEffect(() => {
    const handleAudioStateChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled: boolean; isUnlocked: boolean }>;
      if (customEvent.detail) {
        setIsAudioEnabled(customEvent.detail.enabled);
        setIsAudioReady(customEvent.detail.isUnlocked);
      } else {
        setIsAudioEnabled(isAudioNotificationsEnabled());
        setIsAudioReady(isAudioContextReady());
      }
    };

    window.addEventListener('integral_audio_state_change', handleAudioStateChange);
    return () => {
      window.removeEventListener('integral_audio_state_change', handleAudioStateChange);
    };
  }, []);

  const handleToggleAudio = async () => {
    if (!isAudioEnabled) {
      const success = await unlockAudioContextAndPlayTest();
      setIsAudioEnabled(true);
      setIsAudioReady(success);
      setShowToastFeedback('Som de Notificações ativado com teste sonoro!');
      setTimeout(() => setShowToastFeedback(null), 3000);
    } else {
      setAudioNotificationsEnabled(false);
      setIsAudioEnabled(false);
      setShowToastFeedback('Som de Notificações desativado');
      setTimeout(() => setShowToastFeedback(null), 2500);
    }
  };

  const renderRoleIcon = () => {
    if (!currentUser) return null;
    switch (currentUser.role) {
      case 'coordenador':
        return <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />;
      case 'professor':
      default:
        return <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />;
    }
  };

  return (
    <footer id="app-footer" className="bg-slate-900 text-slate-400 text-xs py-3 border-t border-slate-800 print:hidden no-print select-none relative">
      {/* Toast feedback for sound notification toggle */}
      {showToastFeedback && (
        <div className="fixed bottom-16 right-4 z-50 bg-slate-950/95 border border-indigo-500/40 text-indigo-200 px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{showToastFeedback}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: App Version & Connection State */}
        <div className="flex flex-wrap items-center gap-2 text-center md:text-left justify-center md:justify-start">
          <span className="font-bold text-white whitespace-nowrap">Programa do Integral</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400 font-medium">v1.2</span>
          {firebaseConnected && (
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/90 text-emerald-400 border border-emerald-800/80">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Nuvem Conectada</span>
            </span>
          )}
        </div>

        {/* Right: Status Pills (Sync, Som) and Logged User Badge */}
        <div className="flex flex-wrap items-center justify-center md:justify-end gap-2.5">
          {/* 1. Real-time Sync & Connectivity Status */}
          <button
            type="button"
            onClick={onForceSync}
            title={
              connectionState?.quotaExceeded
                ? 'Cota diária gratuita do Firestore atingida (50.000 leituras/dia no projeto Google Cloud). O app continua operando em modo offline com o cache local até o reset diário pelo Google ou upgrade do plano.'
                : connectionState?.status === 'offline'
                ? 'Rede offline. Dados gravados em contingência local e serão enviados ao reconectar. Clique para tentar reconectar agora.'
                : connectionState?.status === 'syncing' || connectionState?.status === 'reconnecting'
                ? 'Sincronizando com o servidor e outros dispositivos...'
                : 'Sincronização em tempo real ativa (100%). Clique para forçar verificação agora.'
            }
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer shadow-sm ${
              connectionState?.quotaExceeded
                ? 'bg-rose-950/70 border-rose-500/40 text-rose-300 hover:bg-rose-900/80'
                : connectionState?.status === 'offline'
                ? 'bg-amber-950/70 border-amber-500/40 text-amber-300 hover:bg-amber-900/80'
                : connectionState?.status === 'syncing' || connectionState?.status === 'reconnecting'
                ? 'bg-blue-950/70 border-blue-500/40 text-blue-300 hover:bg-blue-900/80'
                : 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/80'
            }`}
          >
            {connectionState?.quotaExceeded ? (
              <WifiOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : connectionState?.status === 'offline' ? (
              <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : connectionState?.status === 'syncing' || connectionState?.status === 'reconnecting' ? (
              <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
            ) : (
              <span className="relative flex h-2 w-2 mr-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
            <span className="hidden sm:inline">Sync:</span>
            <span>
              {connectionState?.quotaExceeded
                ? 'Cota Firebase Excedida'
                : connectionState?.status === 'offline'
                ? 'Offline (Salvo)'
                : connectionState?.status === 'syncing' || connectionState?.status === 'reconnecting'
                ? 'Sincronizando...'
                : '100% Ao Vivo'}
            </span>
          </button>

          {/* 2. Sound Notification Toggle */}
          <button
            type="button"
            onClick={handleToggleAudio}
            title={
              isAudioEnabled
                ? 'Som de Notificações ativado. Clique para desativar.'
                : 'Som de Notificações desativado. Clique para ativar e tocar teste sonoro.'
            }
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer shadow-sm ${
              isAudioEnabled
                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/80 hover:border-emerald-400'
                : 'bg-slate-800/90 border-slate-700 text-slate-400 hover:bg-slate-700/80 hover:text-slate-200'
            }`}
          >
            {isAudioEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            )}
            <span className="hidden sm:inline">Som:</span>
            <span className={isAudioEnabled ? 'text-emerald-300' : 'text-slate-400'}>
              {isAudioEnabled ? 'Ativado' : 'Desativado'}
            </span>
          </button>

          {/* 3. Logged User Badge & Logout */}
          {currentUser && roleStyle && (
            <div className="flex items-center space-x-2 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm">
              <div
                className={`w-6 h-6 rounded-lg ${
                  currentUser.avatarColor || 'bg-indigo-600'
                } flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-inner`}
              >
                {currentUser.name.charAt(0)}
              </div>
              <div className="min-w-0 text-left">
                <div className="text-xs font-bold text-white truncate max-w-[130px] sm:max-w-[180px] leading-tight">
                  {currentUser.name}
                </div>
                <div className="flex items-center space-x-1 mt-0.5">
                  {renderRoleIcon()}
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}
                  >
                    {roleStyle.label}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onLogout}
                title="Trocar Perfil / Sair"
                className="ml-1.5 p-1 rounded-lg bg-slate-700/60 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 transition-colors cursor-pointer border border-slate-600/50"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
};
