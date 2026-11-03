import React, { useState, useEffect, useRef } from 'react';
import {
  ClipboardCheck,
  Users,
  BarChart3,
  Library,
  UserCog,
  Radio,
  BellRing,
  Sparkles,
  X,
  Clock,
  BookOpen,
  Utensils,
  LogOut,
  User,
  CreditCard,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { UserProfile, TabType } from '../types';
import { ConnectionState } from '../services/syncService';
import { LOGO_CRESCER_BASE64 } from '../utils/appLogoData';
import { isCoordenador, isTabAllowed } from '../utils/authUtils';
import {
  isAudioNotificationsEnabled,
  unlockAudioContextAndPlayTest,
  isAudioContextReady,
} from '../utils/notificationUtils';
import { HeaderStats } from './HeaderStats';

export type { TabType };

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
  selectedTurma?: string;
  onClearTurmaFilter?: () => void;
  onNavigateToPending?: () => void;
  currentUser?: UserProfile | null;
  onLogout?: () => void;
  connectionState?: ConnectionState;
  onForceSync?: () => void;
  onOpenUserProfile?: () => void;
  pendingFeedbacksCount?: number;
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
  selectedTurma,
  onClearTurmaFilter,
  onNavigateToPending,
  currentUser = null,
  onLogout,
  connectionState,
  onForceSync,
  onOpenUserProfile,
  pendingFeedbacksCount = 0,
}) => {
  // Network and synchronization states
  const isOnline = connectionState?.isOnline ?? true;
  const isOffline = !isOnline || connectionState?.status === 'offline';
  const isSyncing = connectionState?.status === 'syncing' || connectionState?.status === 'reconnecting';

  // Sound Notifications state
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(() => isAudioNotificationsEnabled());
  const [isAudioReady, setIsAudioReady] = useState<boolean>(() => isAudioContextReady());
  const [isBannerDismissed, setIsBannerDismissed] = useState<boolean>(false);
  const [showToastAudioStatus, setShowToastAudioStatus] = useState<string | null>(null);

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

  const handleUnlockAudioFromBanner = async () => {
    const success = await unlockAudioContextAndPlayTest();
    setIsAudioEnabled(true);
    setIsAudioReady(success);
    setShowToastAudioStatus('Alertas sonoros de chamada liberados com sucesso!');
    setTimeout(() => setShowToastAudioStatus(null), 3500);
  };

  // Navigation tabs horizontal scroll state and refs
  const tabsContainerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(true);

  const updateScrollButtons = () => {
    const el = tabsContainerRef.current;
    if (el) {
      const hasOverflow = el.scrollWidth > el.clientWidth;
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(hasOverflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    }
  };

  useEffect(() => {
    updateScrollButtons();
    const handleResize = () => updateScrollButtons();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentUser]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const el = tabsContainerRef.current;
      if (el) {
        const activeButton = el.querySelector<HTMLButtonElement>('[data-active="true"]');
        if (activeButton) {
          activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
        updateScrollButtons();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [activeTab]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (tabsContainerRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      tabsContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      setTimeout(updateScrollButtons, 250);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (tabsContainerRef.current && e.deltaY !== 0) {
      tabsContainerRef.current.scrollLeft += e.deltaY;
      updateScrollButtons();
    }
  };

  // Determine if audio needs activation banner (either disabled in preferences or blocked/not yet unlocked by browser gesture)
  const isSoundBlockedOrInactive = (!isAudioEnabled || !isAudioReady) && !isBannerDismissed;

  return (
    <header id="app-header" className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-50 shadow-md print:hidden no-print">
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

      {/* Floating Audio Activation Toast */}
      {showToastAudioStatus && (
        <div className="absolute top-12 right-4 z-50 bg-slate-950/95 border border-indigo-500/40 text-indigo-200 px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-top-2">
          <BellRing className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{showToastAudioStatus}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between py-3 gap-3">
          {/* Logo & Main Title (Always Single Line, No Wrapping) */}
          <div className="flex items-center space-x-3 select-none shrink-0">
            {/* Official School Logo */}
            <div className="bg-white rounded-xl px-2.5 py-1.5 shadow-md shrink-0 flex items-center justify-center border border-white/20">
              <img
                src={LOGO_CRESCER_BASE64}
                alt="Colégio Crescer"
                className="h-7 sm:h-8 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="shrink-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white leading-tight whitespace-nowrap">
                Programa do Integral
              </h1>
            </div>
          </div>

          {/* Live Real-Time Attendance Counters (Baseado na Rotina de Hoje / Contextual por Turma) */}
          <HeaderStats
            totalStudents={totalStudents}
            totalAtivosHoje={totalAtivosHoje}
            totalMatriculados={totalMatriculados}
            presentesHoje={presentesHoje}
            faltasHoje={faltasHoje}
            justificadosHoje={justificadosHoje}
            pendentesHoje={pendentesHoje}
            selectedTurma={selectedTurma}
            onClearTurmaFilter={onClearTurmaFilter}
            onNavigateToPending={onNavigateToPending}
            isOffline={isOffline}
            isSyncing={isSyncing}
          />

          {/* Quick Actions (Sair / Logout) */}
          {currentUser && onLogout && (
            <div className="flex items-center space-x-2 shrink-0 self-end md:self-auto">
              <button
                type="button"
                onClick={onLogout}
                title="Sair / Trocar Usuário"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-rose-500/20 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-400/30 transition-colors cursor-pointer text-xs font-semibold"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span>Sair</span>
              </button>
            </div>
          )}
        </div>

        {/* Navigation Tabs Bar with Left/Right Scroll Arrows */}
        <div className="relative flex items-center border-t border-slate-800 pt-1">
          {/* Seta de navegação Esquerda */}
          <button
            type="button"
            onClick={() => handleScroll('left')}
            disabled={!canScrollLeft}
            title="Rolar abas para a esquerda"
            aria-label="Rolar abas para a esquerda"
            className={`p-1.5 sm:p-2 rounded-lg transition-all shrink-0 mr-0.5 sm:mr-1 ${
              canScrollLeft
                ? 'text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer active:scale-95'
                : 'text-slate-600 cursor-default opacity-40'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Navigation Tabs Container com rolagem nativa horizontal e suporte a mouse wheel */}
          <div
            ref={tabsContainerRef}
            onScroll={updateScrollButtons}
            onWheel={handleWheel}
            className="flex-1 flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth"
          >
            {/* 1. Atividades do Momento */}
            {isTabAllowed('momento', currentUser) && (
              <button
                data-active={activeTab === 'momento' ? 'true' : 'false'}
                onClick={() => setActiveTab('momento')}
                className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 border-b-2 ${
                  activeTab === 'momento'
                    ? 'bg-slate-800 text-indigo-400 border-indigo-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
                }`}
              >
                <Radio className={`w-4 h-4 shrink-0 ${isOffline ? 'text-slate-400' : 'text-rose-400 animate-pulse'}`} />
                <span>Atividades do Momento</span>
                {isOffline ? (
                  <span className="ml-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-slate-700/60 text-slate-300 border border-slate-600">
                    Cache
                  </span>
                ) : (
                  <span className="ml-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    Ao Vivo
                  </span>
                )}
              </button>
            )}

            {/* 2. Chamada de Frequência */}
            {isTabAllowed('frequencia', currentUser) && (
              <button
                data-active={activeTab === 'frequencia' ? 'true' : 'false'}
                onClick={() => setActiveTab('frequencia')}
                className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 border-b-2 ${
                  activeTab === 'frequencia'
                    ? 'bg-slate-800 text-indigo-400 border-indigo-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
                }`}
              >
                <ClipboardCheck className="w-4 h-4 shrink-0" />
                <span>Chamada de Frequência</span>
              </button>
            )}

            {/* 3. Semanário / Planejamento Pedagógico */}
            {isTabAllowed('semanario', currentUser) && (
              <button
                data-active={activeTab === 'semanario' ? 'true' : 'false'}
                onClick={() => setActiveTab('semanario')}
                className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 border-b-2 ${
                  activeTab === 'semanario'
                    ? 'bg-slate-800 text-amber-400 border-amber-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
                }`}
              >
                <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Semanário</span>
              </button>
            )}

            {/* 4. Livro Ponto */}
            {isTabAllowed('ponto', currentUser) && (
              <button
                data-active={activeTab === 'ponto' ? 'true' : 'false'}
                onClick={() => setActiveTab('ponto')}
                className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 border-b-2 ${
                  activeTab === 'ponto'
                    ? 'bg-slate-800 text-emerald-400 border-emerald-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
                }`}
              >
                <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Livro Ponto</span>
              </button>
            )}

            {/* 5. Cardápio e Culinária */}
            {isTabAllowed('cardapio', currentUser) && (
              <button
                data-active={activeTab === 'cardapio' ? 'true' : 'false'}
                onClick={() => setActiveTab('cardapio')}
                className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 border-b-2 ${
                  activeTab === 'cardapio'
                    ? 'bg-slate-800 text-teal-400 border-teal-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
                }`}
              >
                <Utensils className="w-4 h-4 text-teal-400 shrink-0" />
                <span>Cardápio</span>
              </button>
            )}

            {/* 6. Manual de Orientações e Normas */}
            {isTabAllowed('manual', currentUser) && (
              <button
                data-active={activeTab === 'manual' ? 'true' : 'false'}
                onClick={() => setActiveTab('manual')}
                className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 border-b-2 ${
                  activeTab === 'manual'
                    ? 'bg-slate-800 text-sky-400 border-sky-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
                }`}
              >
                <BookOpen className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Manual</span>
              </button>
            )}

            {/* 7. Alunos e Turmas */}
            {isTabAllowed('alunos', currentUser) && (
              <button
                id="tab-alunos"
                data-active={activeTab === 'alunos' ? 'true' : 'false'}
                onClick={() => setActiveTab('alunos')}
                className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 border-b-2 ${
                  activeTab === 'alunos'
                    ? 'bg-slate-800 text-indigo-400 border-indigo-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>Alunos e Turmas</span>
                <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300 font-semibold">
                  {totalStudents}
                </span>
              </button>
            )}

            {/* 8. Financeiro (Gestão Financeira e Contratos) */}
            {isTabAllowed('financeiro', currentUser) && (
              <button
                id="tab-financeiro"
                data-active={activeTab === 'financeiro' ? 'true' : 'false'}
                onClick={() => setActiveTab('financeiro')}
                className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 border-b-2 ${
                  activeTab === 'financeiro'
                    ? 'bg-slate-800 text-emerald-400 border-emerald-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
                }`}
              >
                <CreditCard className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Financeiro</span>
              </button>
            )}

            {/* 9. Relatórios */}
            {isTabAllowed('relatorio', currentUser) && (
              <button
                data-active={activeTab === 'relatorio' ? 'true' : 'false'}
                onClick={() => setActiveTab('relatorio')}
                className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 border-b-2 ${
                  activeTab === 'relatorio'
                    ? 'bg-slate-800 text-indigo-400 border-indigo-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
                }`}
              >
                <BarChart3 className="w-4 h-4 shrink-0" />
                <span>Relatórios</span>
              </button>
            )}

            {/* 10. Biblioteca de Semanas */}
            {isTabAllowed('biblioteca', currentUser) && (
              <button
                data-active={activeTab === 'biblioteca' ? 'true' : 'false'}
                onClick={() => setActiveTab('biblioteca')}
                className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 border-b-2 ${
                  activeTab === 'biblioteca'
                    ? 'bg-slate-800 text-indigo-400 border-indigo-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
                }`}
              >
                <Library className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Biblioteca</span>
              </button>
            )}

            {/* 11. Gerenciamento de Usuários */}
            {isTabAllowed('usuarios', currentUser) && (
              <button
                data-active={activeTab === 'usuarios' ? 'true' : 'false'}
                onClick={() => setActiveTab('usuarios')}
                className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 border-b-2 ${
                  activeTab === 'usuarios'
                    ? 'bg-slate-800 text-amber-400 border-amber-500'
                    : 'text-amber-300/80 hover:text-amber-200 hover:bg-slate-800/50 border-transparent'
                }`}
              >
                <UserCog className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Usuários</span>
                {isCoordenador(currentUser) && (
                  <span className="ml-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Admin
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Seta de navegação Direita */}
          <button
            type="button"
            onClick={() => handleScroll('right')}
            disabled={!canScrollRight}
            title="Rolar abas para a direita"
            aria-label="Rolar abas para a direita"
            className={`p-1.5 sm:p-2 rounded-lg transition-all shrink-0 ml-0.5 sm:mr-1 ${
              canScrollRight
                ? 'text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer active:scale-95'
                : 'text-slate-600 cursor-default opacity-40'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

