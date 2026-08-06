import React, { useState, useEffect } from 'react';
import { ClipboardCheck, Users, BarChart3, Layers, Library, Download, Smartphone, X, CheckCircle, Info } from 'lucide-react';

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
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);

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
      try {
        deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          console.log('Usuário aceitou a instalação do PWA');
          setDeferredPrompt(null);
          return;
        }
      } catch (err) {
        console.error('Erro ao acionar prompt de instalação:', err);
      }
    }
    // If prompt is null or failed/dismissed, show explicit visual guide
    setShowGuideModal(true);
  };

  return (
    <>
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between py-3 gap-3">
            {/* Logo & Main Title */}
            <div className="flex items-center space-x-3 select-none">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 shrink-0">
                <Layers className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleInstallClick();
                    }}
                    className="touch-manipulation text-[11px] font-bold uppercase tracking-wider bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/30 flex items-center space-x-1.5 cursor-pointer transition-all active:scale-95"
                    title="Clique para ver instruções de instalação do App no celular"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-300" />
                    <span>Instalar App • PWA</span>
                  </button>
                </div>
                <h1 className="text-base sm:text-lg md:text-xl font-bold tracking-tight text-white leading-tight">
                  Frequência em Atividades Extracurriculares
                </h1>
              </div>
            </div>

            {/* Header Stats & PWA Install Button */}
            <div className="flex items-center justify-between md:justify-end space-x-3 border-t md:border-t-0 border-slate-800 pt-2 md:pt-0 select-none">
              {!isStandalone && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handleInstallClick();
                  }}
                  className="touch-manipulation px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 border border-indigo-400/30 shadow-md transition-all cursor-pointer flex items-center space-x-2 active:scale-95 shrink-0"
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

      {/* Modal de Instruções de Instalação do PWA */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 text-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Como Instalar o Aplicativo</h3>
                  <p className="text-xs text-slate-400">Integral Frequência no Celular</p>
                </div>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="py-4 space-y-4 text-sm text-slate-300">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-1.5 text-amber-200 text-xs">
                <div className="flex items-center space-x-2 font-bold text-amber-300">
                  <Info className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Passo OBRIGATÓRIO se você já adicionou antes:</span>
                </div>
                <p className="pl-6 leading-relaxed">
                  Se você tem um <strong>atalho antigo do Google/Chrome na tela inicial</strong>, você precisa <strong>REMOVÊ-LO (excluir o atalho antigo)</strong> antes de baixar o App novo. Caso contrário, o Android continuará usando o atalho antigo.
                </p>
              </div>

              {/* Android Section */}
              <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/80 space-y-2.5">
                <h4 className="font-bold text-indigo-300 flex items-center space-x-2 text-sm">
                  <span>📱 Passo a Passo no Android (Chrome):</span>
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-xs text-slate-300 leading-relaxed">
                  <li>
                    <strong>Remova o atalho antigo:</strong> Vá até a tela inicial do celular, mantenha o dedo pressionado sobre o atalho antigo do Google e toque em <strong>"Remover"</strong> ou <strong>"Lixo"</strong>.
                  </li>
                  <li>
                    <strong>Abra o site no Chrome:</strong> Acesse <strong className="text-white">integral-frequencia-app.onrender.com</strong>
                  </li>
                  <li>
                    <strong>Menu do Chrome:</strong> Toque nos <strong>três pontinhos (⋮)</strong> no canto superior direito do Chrome.
                  </li>
                  <li>
                    <strong>Instalar:</strong> Escolha <strong className="text-emerald-400 text-sm">"Instalar aplicativo"</strong> ou <strong className="text-emerald-400 text-sm">"Instalar app"</strong>.
                  </li>
                  <li>
                    Toque em <strong className="text-indigo-400">Instalar</strong> na janela que aparecer. O Android vai criar o aplicativo verdadeiro com o ícone novo!
                  </li>
                </ol>
              </div>

              {/* iOS Section */}
              <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/80 space-y-2">
                <h4 className="font-bold text-indigo-300 flex items-center space-x-2">
                  <span>🍏 No iPhone / iPad (Safari)</span>
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-xs text-slate-300 leading-relaxed">
                  <li>
                    Toque no ícone de <strong>Compartilhar 📤</strong> (na barra inferior do Safari).
                  </li>
                  <li>
                    Role as opções para baixo e toque em <strong className="text-emerald-400">"Adicionar à Tela de Início" ➕</strong>.
                  </li>
                  <li>
                    Toque em <strong className="text-indigo-400">Adicionar</strong> no canto superior direito.
                  </li>
                </ol>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowGuideModal(false)}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-md cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

