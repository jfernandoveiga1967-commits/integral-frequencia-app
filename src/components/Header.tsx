import React, { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  Users,
  BarChart3,
  Library,
  LogOut,
  ShieldCheck,
  GraduationCap,
  UserCog,
  Radio,
  Volume2,
  VolumeX,
  BellRing,
  Sparkles,
  X,
  Clock,
} from 'lucide-react';
import { UserProfile } from '../types';
import { getRoleBadgeStyle, isCoordenador } from '../utils/authUtils';
import {
  isAudioNotificationsEnabled,
  setAudioNotificationsEnabled,
  unlockAudioContextAndPlayTest,
  isAudioContextReady,
} from '../utils/notificationUtils';

export type TabType = 'momento' | 'frequencia' | 'alunos' | 'relatorio' | 'biblioteca' | 'usuarios' | 'ponto';

interface HeaderProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  totalStudents: number;
  totalAtivosHoje?: number;
  totalMatriculados?: number;
  presentesHoje?: number;
  faltasHoje?: number;
  justificadosHoje?: number;
  pendentesHoje?: number;
  onNavigateToPending?: () => void;
  currentUser: UserProfile | null;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  totalStudents,
  totalAtivosHoje,
  totalMatriculados,
  presentesHoje = 0,
  faltasHoje = 0,
  justificadosHoje = 0,
  pendentesHoje = 0,
  onNavigateToPending,
  currentUser,
  onLogout,
}) => {
  const roleStyle = currentUser ? getRoleBadgeStyle(currentUser.role) : null;

  // Sound Notifications state
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(() => isAudioNotificationsEnabled());
  const [isAudioReady, setIsAudioReady] = useState<boolean>(() => isAudioContextReady());
  const [isBannerDismissed, setIsBannerDismissed] = useState<boolean>(false);
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
      // Enabling & Unlocking Audio with test chime
      const success = await unlockAudioContextAndPlayTest();
      setIsAudioEnabled(true);
      setIsAudioReady(success);
      setShowToastFeedback('Som de Notificações ativado com teste sonoro!');
      setTimeout(() => setShowToastFeedback(null), 3500);
    } else {
      // Disabling Audio
      setAudioNotificationsEnabled(false);
      setIsAudioEnabled(false);
      setShowToastFeedback('Som de Notificações desativado');
      setTimeout(() => setShowToastFeedback(null), 2500);
    }
  };

  const handleUnlockAudioFromBanner = async () => {
    const success = await unlockAudioContextAndPlayTest();
    setIsAudioEnabled(true);
    setIsAudioReady(success);
    setShowToastFeedback('Alertas sonoros de chamada liberados com sucesso!');
    setTimeout(() => setShowToastFeedback(null), 3500);
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

  // Determine if audio needs activation banner (either disabled in preferences or blocked/not yet unlocked by browser gesture)
  const isSoundBlockedOrInactive = (!isAudioEnabled || !isAudioReady) && !isBannerDismissed;

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-50 shadow-md print:hidden">
      {/* Discrete Top Audio Activation Banner if sound is blocked or inactive */}
      {isSoundBlockedOrInactive && (
        <div className="bg-gradient-to-r from-amber-500/90 via-indigo-600/95 to-amber-600/90 text-white px-3 py-1.5 text-xs font-semibold flex items-center justify-between shadow-inner border-b border-amber-400/30">
          <button
            type="button"
            onClick={handleUnlockAudioFromBanner}
            className="flex-1 flex items-center justify-center space-x-2 text-center hover:opacity-90 transition-opacity cursor-pointer py-0.5"
          >
            <BellRing className="w-3.5 h-3.5 text-amber-200 animate-bounce shrink-0" />
            <span className="underline decoration-amber-200 underline-offset-2 tracking-wide font-bold">
              Clique aqui para ativar os alertas sonoros de chamada
            </span>
            <span className="hidden sm:inline text-[11px] opacity-90 font-normal">
              • Libera o áudio para as monitoras sem bloqueios do navegador
            </span>
          </button>
          <button
            type="button"
            onClick={() => setIsBannerDismissed(true)}
            className="p-1 hover:bg-black/20 rounded-md transition-colors text-white/80 hover:text-white shrink-0 ml-2"
            title="Fechar aviso temporariamente"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Action Feedback Toast */}
      {showToastFeedback && (
        <div className="absolute top-12 right-4 z-50 bg-slate-950/95 border border-indigo-500/40 text-indigo-200 px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-top-2">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{showToastFeedback}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between py-3 gap-3">
          {/* Logo & Main Title */}
          <div className="flex items-center space-x-3 select-none">
            <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-indigo-500/30 shrink-0">
              <img
                src="/pwa-192.png"
                alt="Ícone Frequência Integral"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-400 px-2.5 py-0.5 rounded-full border border-red-500/30">
                  Programa Integral • COLÉGIO CRESCER
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white leading-tight">
                Frequência Extracurricular
              </h1>
            </div>
          </div>

          {/* User Badge, Sound Notification Toggle & Header Stats */}
          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2.5 border-t lg:border-t-0 border-slate-800 pt-2 lg:pt-0 select-none">
            {/* Sound Notification Button Indicator */}
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

            {/* Active User Card */}
            {currentUser && roleStyle && (
              <div className="flex items-center space-x-2 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm">
                <div className={`w-7 h-7 rounded-lg ${currentUser.avatarColor || 'bg-indigo-600'} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-inner`}>
                  {currentUser.name.charAt(0)}
                </div>
                <div className="min-w-0 text-left">
                  <div className="text-xs font-bold text-white truncate max-w-[140px] sm:max-w-[180px] leading-tight">
                    {currentUser.name}
                  </div>
                  <div className="flex items-center space-x-1 mt-0.5">
                    {renderRoleIcon()}
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}>
                      {roleStyle.label}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  title="Trocar Perfil / Sair"
                  className="ml-2 p-1.5 rounded-lg bg-slate-700/60 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 transition-colors cursor-pointer border border-slate-600/50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Live Real-Time Attendance Counters (Baseado na Rotina de Hoje) */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 text-xs text-slate-300 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm select-none">
              {/* 1. Esperados Hoje (Alunos com frequência prevista/agendada para hoje) */}
              <div className="flex items-center space-x-1.5" title="Alunos ativos com frequência agendada para o dia de hoje (conforme dias de frequência cadastrados)">
                <span className="text-slate-400 font-medium">Esperados Hoje:</span>
                <span className="font-extrabold text-indigo-300">
                  {totalAtivosHoje !== undefined ? totalAtivosHoje : totalStudents}
                </span>
              </div>

              <div className="h-3.5 w-px bg-slate-700 hidden sm:block" />

              {/* 2. Total Geral Matriculados */}
              <div className="flex items-center space-x-1.5" title="Total geral de alunos matriculados na escola">
                <span className="text-slate-400 font-medium">Total Matriculados:</span>
                <span className="font-bold text-slate-300">
                  {totalMatriculados !== undefined ? totalMatriculados : totalStudents}
                </span>
              </div>

              <div className="h-3.5 w-px bg-slate-700 hidden sm:block" />

              {/* 3. Presentes */}
              <div className="flex items-center space-x-1.5" title="Alunos presentes hoje no Integral (Presença normal + Saída antecipada + Sem uniforme)">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-slate-400 font-medium">Presentes:</span>
                <span className="font-extrabold text-emerald-400">{presentesHoje}</span>
              </div>

              <div className="h-3.5 w-px bg-slate-700 hidden sm:block" />

              {/* 4. Faltas */}
              <div className="flex items-center space-x-1.5" title="Faltas não justificadas hoje no Integral">
                <span className="text-slate-400 font-medium">Faltas:</span>
                <span className={`font-extrabold ${faltasHoje > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {faltasHoje}
                </span>
              </div>

              {/* 5. Atestados / Justificados */}
              {justificadosHoje > 0 && (
                <>
                  <div className="h-3.5 w-px bg-slate-700 hidden sm:block" />
                  <div className="flex items-center space-x-1.5" title="Ausências justificadas / Atestados de saúde hoje">
                    <span className="text-slate-400 font-medium">Atestados:</span>
                    <span className="font-extrabold text-amber-400">{justificadosHoje}</span>
                  </div>
                </>
              )}

              {/* 6. Pendentes (Apenas alunos esperados hoje sem chamada de rotina) */}
              {pendentesHoje > 0 && (
                <>
                  <div className="h-3.5 w-px bg-slate-700 hidden sm:block" />
                  <button
                    type="button"
                    onClick={onNavigateToPending}
                    title="Alunos esperados hoje que ainda não receberam marcação de presença/falta na chamada de rotina. Clique para conferir."
                    className="flex items-center space-x-1 px-1.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors cursor-pointer"
                  >
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
                    <span className="font-medium text-[11px]">Pendentes:</span>
                    <span className="font-extrabold text-amber-300 text-[11px]">{pendentesHoje}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 border-t border-slate-800 overflow-x-auto pt-1 no-scrollbar">
          {/* 1. Atividades do Momento (Disponível para Todos) */}
          <button
            onClick={() => setActiveTab('momento')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap border-b-2 ${
              activeTab === 'momento'
                ? 'bg-slate-800 text-indigo-400 border-indigo-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
            }`}
          >
            <Radio className="w-4 h-4 text-rose-400 animate-pulse" />
            <span>Atividades do Momento</span>
            <span className="ml-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Ao Vivo
            </span>
          </button>

          {/* 2. Chamada de Frequência (Disponível para Todos) */}
          <button
            onClick={() => setActiveTab('frequencia')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap border-b-2 ${
              activeTab === 'frequencia'
                ? 'bg-slate-800 text-indigo-400 border-indigo-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>Chamada de Frequência</span>
          </button>

          {/* 3. Livro Ponto (Disponível para Todos) */}
          <button
            onClick={() => setActiveTab('ponto')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap border-b-2 ${
              activeTab === 'ponto'
                ? 'bg-slate-800 text-emerald-400 border-emerald-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
            }`}
          >
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>Livro Ponto</span>
            <span className="ml-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              GADAL
            </span>
          </button>

          {/* Abas exclusivas de Gestão / Administração (Apenas Coordenador / Admin) */}
          {isCoordenador(currentUser) && (
            <>
              <button
                onClick={() => setActiveTab('alunos')}
                className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap border-b-2 ${
                  activeTab === 'alunos'
                    ? 'bg-slate-800 text-indigo-400 border-indigo-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Alunos e Turmas</span>
                <span className="ml-1 text-xs px-1.5 py-0.2 rounded-full bg-slate-700 text-slate-300">
                  {totalStudents}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('relatorio')}
                className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap border-b-2 ${
                  activeTab === 'relatorio'
                    ? 'bg-slate-800 text-indigo-400 border-indigo-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>Relatório Semanal</span>
              </button>

              <button
                onClick={() => setActiveTab('biblioteca')}
                className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap border-b-2 ${
                  activeTab === 'biblioteca'
                    ? 'bg-slate-800 text-indigo-400 border-indigo-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
                }`}
              >
                <Library className="w-4 h-4 text-indigo-400" />
                <span>Biblioteca de Semanas</span>
              </button>

              <button
                onClick={() => setActiveTab('usuarios')}
                className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap border-b-2 ${
                  activeTab === 'usuarios'
                    ? 'bg-slate-800 text-amber-400 border-amber-500'
                    : 'text-amber-300/80 hover:text-amber-200 hover:bg-slate-800/50 border-transparent'
                }`}
              >
                <UserCog className="w-4 h-4 text-amber-400" />
                <span>Gerenciamento de Usuários</span>
                <span className="ml-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Admin
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

