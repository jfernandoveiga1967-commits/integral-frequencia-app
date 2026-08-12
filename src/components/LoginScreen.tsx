import React, { useState } from 'react';
import { UserProfile, UserRole } from '../types';
import { PRESET_USERS } from '../utils/authUtils';
import {
  ShieldCheck,
  GraduationCap,
  UserCheck,
  KeyRound,
  LogIn,
  ArrowRight,
  UserPlus,
  Lock,
  CheckCircle2,
} from 'lucide-react';

interface LoginScreenProps {
  onLogin: (user: UserProfile) => void;
  usersList?: UserProfile[];
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, usersList = [] }) => {
  const [activeTab, setActiveTab] = useState<'quick' | 'credentials' | 'custom'>('quick');

  // Combine provided usersList with PRESET_USERS, deduplicating by ID or email
  const allRegisteredUsers = React.useMemo(() => {
    const list = [...usersList];
    PRESET_USERS.forEach((p) => {
      if (!list.some((u) => u.id === p.id || (u.email && p.email && u.email.toLowerCase() === p.email.toLowerCase()))) {
        list.push(p);
      }
    });
    // Ensure Administrator (coordenador) is always placed first
    return list.sort((a, b) => {
      if (a.role === 'coordenador') return -1;
      if (b.role === 'coordenador') return 1;
      return 0;
    });
  }, [usersList]);

  const [selectedPreset, setSelectedPreset] = useState<UserProfile>(allRegisteredUsers[0] || PRESET_USERS[0]);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Custom user form state
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [customRole, setCustomRole] = useState<UserRole>('professor');
  const [customError, setCustomError] = useState<string | null>(null);

  const handleQuickLogin = (user: UserProfile) => {
    onLogin(user);
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    if (!enteredPin.trim()) {
      setPinError('Por favor, informe a senha / PIN de acesso.');
      return;
    }
    // For demo/preset users, pin is '1234' or any 4 digits
    if (selectedPreset.pin && enteredPin.trim() !== selectedPreset.pin && enteredPin.trim() !== '1234') {
      setPinError('Senha/PIN incorreto. (Dica de demonstração: 1234)');
      return;
    }
    onLogin(selectedPreset);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);
    if (!customName.trim()) {
      setCustomError('Por favor, digite o nome completo.');
      return;
    }

    const roleLabels: Record<UserRole, string> = {
      coordenador: 'Coordenador (Administrador)',
      professor: 'Monitor / Professor',
      auxiliar: 'Auxiliar',
    };

    const roleColors: Record<UserRole, string> = {
      coordenador: 'bg-amber-500',
      professor: 'bg-indigo-600',
      auxiliar: 'bg-emerald-600',
    };

    const newUser: UserProfile = {
      id: 'usr_' + Date.now(),
      name: customName.trim(),
      email: customEmail.trim() || `${customName.toLowerCase().replace(/\s+/g, '.')}@crescer.edu.br`,
      role: customRole,
      cargoLabel: roleLabels[customRole],
      avatarColor: roleColors[customRole],
    };

    onLogin(newUser);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Subtle Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Card Container */}
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 z-10 my-auto">
        
        {/* Header Branding */}
        <div className="text-center mb-8 select-none">
          <div className="inline-flex items-center space-x-2 bg-red-500/10 border border-red-500/30 px-3.5 py-1 rounded-full text-red-500 text-xs font-extrabold uppercase tracking-wider mb-3">
            <span>COLÉGIO CRESCER • PROGRAMA INTEGRAL</span>
          </div>
          
          <div className="flex justify-center mb-3">
            <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-xl shadow-red-500/10 ring-4 ring-slate-800">
              <img src="/pwa-192.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Frequência Extracurricular
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
            Identifique-se para acessar o diário de classe.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('quick')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
              activeTab === 'quick'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Categorias de Acesso</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('credentials')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
              activeTab === 'credentials'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Acesso com PIN / Senha</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
              activeTab === 'custom'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Novo Usuário</span>
          </button>
        </div>

        {/* TAB 1: QUICK CATEGORY SELECTOR */}
        {activeTab === 'quick' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Usuários Cadastrados no Sistema ({allRegisteredUsers.length}):
              </p>
              <span className="text-[11px] text-slate-500">Clique para entrar/inspecionar</span>
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
              {allRegisteredUsers.map((usr) => {
                let icon = <GraduationCap className="w-5 h-5" />;
                let borderStyle = 'border-indigo-500/30 hover:border-indigo-500/80 hover:shadow-indigo-500/10';
                let iconBg = 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
                let badgeText = usr.cargoLabel || 'Docente';
                let badgeBg = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
                let btnColor = 'text-indigo-400';

                if (usr.role === 'coordenador') {
                  icon = <ShieldCheck className="w-5 h-5" />;
                  borderStyle = 'border-amber-500/30 hover:border-amber-500/80 hover:shadow-amber-500/10';
                  iconBg = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
                  badgeBg = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                  btnColor = 'text-amber-400';
                } else if (usr.role === 'auxiliar') {
                  icon = <UserCheck className="w-5 h-5" />;
                  borderStyle = 'border-emerald-500/30 hover:border-emerald-500/80 hover:shadow-emerald-500/10';
                  iconBg = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
                  badgeBg = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                  btnColor = 'text-emerald-400';
                }

                return (
                  <div
                    key={usr.id}
                    onClick={() => handleQuickLogin(usr)}
                    className={`p-3.5 rounded-2xl bg-slate-950 border ${borderStyle} transition-all cursor-pointer group flex items-start space-x-3.5 hover:shadow-lg`}
                  >
                    <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0 border group-hover:scale-105 transition-transform mt-0.5`}>
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                          {usr.name}
                        </h3>
                        <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${badgeBg}`}>
                          {badgeText}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {usr.email}
                      </p>
                      {usr.assignedActivities && usr.assignedActivities.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {usr.assignedActivities.slice(0, 4).map((act, idx) => (
                            <span key={idx} className="text-[10px] bg-slate-900 border border-slate-800 text-slate-300 px-1.5 py-0.2 rounded-md font-medium">
                              {act}
                            </span>
                          ))}
                          {usr.assignedActivities.length > 4 && (
                            <span className="text-[10px] text-slate-500 font-medium self-center">
                              +{usr.assignedActivities.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                      <div className={`mt-2 flex items-center text-xs font-semibold ${btnColor} group-hover:translate-x-1 transition-transform`}>
                        <span>Acessar Diário de Classe como {usr.name.split(' ')[0]}</span>
                        <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: CREDENTIALS WITH PIN */}
        {activeTab === 'credentials' && (
          <form onSubmit={handlePinSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Selecione a Conta ou Perfil Autorizado:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                {allRegisteredUsers.map((usr) => {
                  const isSel = selectedPreset.id === usr.id;
                  return (
                    <button
                      key={usr.id}
                      type="button"
                      onClick={() => {
                        setSelectedPreset(usr);
                        setPinError(null);
                      }}
                      className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                        isSel
                          ? 'bg-slate-950 border-indigo-500 ring-2 ring-indigo-500/30 text-white'
                          : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-950 hover:text-slate-200'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-200 truncate">{usr.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate">{usr.cargoLabel || usr.role}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Senha / PIN fornecido pelo Administrador:
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  maxLength={6}
                  value={enteredPin}
                  onChange={(e) => setEnteredPin(e.target.value)}
                  placeholder="Digite sua senha ou PIN"
                  className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono tracking-widest"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Insira o login e senha/PIN de acesso fornecidos pela coordenação. (Dica de teste: <span className="font-mono text-indigo-400">1234</span>)
              </p>
            </div>

            {pinError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-medium">
                {pinError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center justify-center space-x-2"
            >
              <LogIn className="w-5 h-5" />
              <span>Confirmar Credenciais e Entrar</span>
            </button>
          </form>
        )}

        {/* TAB 3: CUSTOM USER CREATION */}
        {activeTab === 'custom' && (
          <form onSubmit={handleCustomSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Nome do Profissional / Usuário:
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Ex: Prof. Roberto Andrade"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                E-mail Institucional (Opcional):
              </label>
              <input
                type="email"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                placeholder="Ex: roberto@crescer.edu.br"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Categoria de Acesso / Cargo:
              </label>
              <select
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value as UserRole)}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold"
              >
                <option value="professor">Monitor / Professor</option>
                <option value="auxiliar">Auxiliar</option>
                <option value="coordenador">Coordenador (Administrador)</option>
              </select>
            </div>

            {customError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-medium">
                {customError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition-all cursor-pointer flex items-center justify-center space-x-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Criar Perfil e Entrar</span>
            </button>
          </form>
        )}

        {/* Footer info */}
        <div className="mt-8 pt-6 border-t border-slate-800 text-center text-[11px] text-slate-500">
          Colégio Crescer • Sistema de Controle de Frequência Extracurricular v2.5
        </div>
      </div>
    </div>
  );
};
