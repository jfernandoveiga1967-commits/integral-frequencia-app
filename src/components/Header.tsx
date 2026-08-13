import React from 'react';
import { ClipboardCheck, Users, BarChart3, Library, LogOut, ShieldCheck, GraduationCap, UserCheck, UserCog } from 'lucide-react';
import { UserProfile } from '../types';
import { getRoleBadgeStyle, isCoordenador } from '../utils/authUtils';

export type TabType = 'frequencia' | 'alunos' | 'relatorio' | 'biblioteca' | 'usuarios';

interface HeaderProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  totalStudents: number;
  totalRecordsThisWeek: number;
  currentUser: UserProfile | null;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  totalStudents,
  totalRecordsThisWeek,
  currentUser,
  onLogout,
}) => {
  const roleStyle = currentUser ? getRoleBadgeStyle(currentUser.role) : null;

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
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
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

          {/* User Badge & Header Stats */}
          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 border-t lg:border-t-0 border-slate-800 pt-2 lg:pt-0 select-none">
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

            {/* Stats Counter */}
            <div className="flex items-center space-x-3 text-xs text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
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

          {isCoordenador(currentUser) && (
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
          )}
        </div>
      </div>
    </header>
  );
};
