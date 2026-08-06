import React, { useState, useEffect } from 'react';
import { ClipboardCheck, Users, BarChart3, Layers, Library, Download, Smartphone } from 'lucide-react';

export type TabType = 'frequencia' | 'alunos' | 'relatorio' | 'biblioteca';

interface HeaderProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  totalStudents: number;
  totalRecordsThisWeek: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  totalStudents,
  totalRecordsThisWeek,
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);

  useEffect(() => {
    // Check if running in standalone mode (installed as PWA)
    const checkStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsStandalone(checkStandalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('Usuário aceitou a instalação do PWA');
      }
      setDeferredPrompt(null);
    } else {
      alert('Para instalar no iPhone/iPad: Toque no botão Compartilhar 📤 no Safari e selecione "Adicionar à Tela de Início".\n\nNo Android/Chrome: Abra o menu (⋮) e toque em "Instalar aplicativo" ou "Adicionar à tela inicial".');
    }
  };

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between py-3 gap-3">
          {/* Logo & Main Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
                  Programa Integral • PWA
                </span>
                {isStandalone && (
                  <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 inline-flex items-center space-x-1">
                    <Smartphone className="w-3 h-3" />
                    <span>App Nativo</span>
                  </span>
                )}
              </div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-white">
                Frequência em Atividades Extracurriculares
              </h1>
            </div>
          </div>

          {/* Header Stats & PWA Install Button */}
          <div className="flex items-center justify-between md:justify-end space-x-3 border-t md:border-t-0 border-slate-800 pt-2 md:pt-0">
            {!isStandalone && (
              <button
                onClick={handleInstallClick}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 border border-indigo-400/30 shadow-sm transition-all cursor-pointer flex items-center space-x-1.5"
                title="Instalar como aplicativo na tela inicial do dispositivo"
              >
                <Download className="w-4 h-4 text-indigo-200" />
                <span>Instalar App</span>
              </button>
            )}

            <div className="flex items-center space-x-4 text-xs text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <div>
                <span className="text-slate-400">Total Alunos: </span>
                <span className="font-bold text-indigo-300">{totalStudents}</span>
              </div>
              <div className="h-3 w-px bg-slate-700" />
              <div>
                <span className="text-slate-400">Registros no Período: </span>
                <span className="font-bold text-emerald-400">{totalRecordsThisWeek}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 border-t border-slate-800 overflow-x-auto pt-1 no-scrollbar">
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
        </div>
      </div>
    </header>
  );
};
