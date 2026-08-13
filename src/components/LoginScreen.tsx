import React, { useState } from 'react';
import { UserProfile, UserRole } from '../types';
import { PRESET_USERS, verifyUserCredentials, formatBirthDateToDisplay } from '../utils/authUtils';
import {
  LogIn,
  UserPlus,
  Lock,
  Mail,
  CheckCircle2,
  Calendar,
  Info,
} from 'lucide-react';

interface LoginScreenProps {
  onLogin: (user: UserProfile) => void;
  onSaveUser?: (user: UserProfile) => void;
  usersList?: UserProfile[];
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onSaveUser, usersList = [] }) => {
  const [activeTab, setActiveTab] = useState<'login' | 'custom'>('login');

  // Combine provided usersList with PRESET_USERS, deduplicating by ID or email
  const allRegisteredUsers = React.useMemo(() => {
    const list = [...usersList];
    PRESET_USERS.forEach((p) => {
      if (!list.some((u) => u.id === p.id || (u.email && p.email && u.email.toLowerCase() === p.email.toLowerCase()))) {
        list.push(p);
      }
    });
    return list;
  }, [usersList]);

  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  // New User Form State
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [customRole, setCustomRole] = useState<UserRole>('professor');
  const [customBirthDate, setCustomBirthDate] = useState('1995-05-20');
  const [customError, setCustomError] = useState<string | null>(null);

  const handleEmailPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (!loginEmail.trim()) {
      setLoginError('Por favor, informe seu e-mail.');
      return;
    }

    if (!loginPassword.trim()) {
      setLoginError('Por favor, informe sua senha.');
      return;
    }

    // Search matching user
    const matchedUser = allRegisteredUsers.find((user) =>
      verifyUserCredentials(user, loginEmail.trim(), loginPassword.trim())
    );

    if (matchedUser) {
      onLogin(matchedUser);
    } else {
      setLoginError(
        'E-mail ou senha incorretos. Verifique suas credenciais com a coordenação.'
      );
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);

    if (!customName.trim()) {
      setCustomError('Por favor, digite o nome completo.');
      return;
    }

    if (!customEmail.trim()) {
      setCustomError('Por favor, informe o e-mail.');
      return;
    }

    if (!customBirthDate) {
      setCustomError('Por favor, selecione a data de nascimento.');
      return;
    }

    const roleLabels: Record<UserRole, string> = {
      coordenador: 'Coordenador (Administrador)',
      professor: 'Monitor / Professor',
    };

    const roleColors: Record<UserRole, string> = {
      coordenador: 'bg-amber-500',
      professor: 'bg-indigo-600',
    };

    const formattedPass = formatBirthDateToDisplay(customBirthDate);

    const newUser: UserProfile = {
      id: 'usr_' + Date.now(),
      name: customName.trim(),
      email: customEmail.trim().toLowerCase(),
      role: customRole,
      cargoLabel: roleLabels[customRole],
      avatarColor: roleColors[customRole],
      birthDate: customBirthDate,
      pin: formattedPass || customBirthDate,
    };

    if (onSaveUser) {
      onSaveUser(newUser);
    }

    onLogin(newUser);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Subtle Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Card Container */}
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 z-10 my-auto">

        {/* Header Branding */}
        <div className="text-center mb-6 select-none">
          {/* School Logo (white card for contrast against dark background) */}
          <div className="flex justify-center mb-4">
            <div className="bg-white rounded-2xl px-5 py-3 shadow-lg inline-block">
              <img
                src="/logo-web.png"
                alt="Instituto Educacional Crescer"
                className="h-12 sm:h-14 w-auto object-contain"
              />
            </div>
          </div>

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
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md mx-auto">
            Acesse o diário de classe informando seu e-mail e senha.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('login')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
              activeTab === 'login'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>Login por E-mail e Senha</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
              activeTab === 'custom'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Novo Cadastro</span>
          </button>
        </div>

        {/* TAB 1: MANDATORY EMAIL & PASSWORD LOGIN */}
        {activeTab === 'login' && (
          <form onSubmit={handleEmailPasswordSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center space-x-1.5">
                <Mail className="w-4 h-4 text-indigo-400" />
                <span>E-mail:</span>
              </label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="Ex: jfernandoveiga1967@gmail.com"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center space-x-1.5">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Senha:</span>
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Digite sua senha"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono tracking-wide"
                required
              />
            </div>

            {loginError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-medium leading-relaxed">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-extrabold rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center justify-center space-x-2 text-sm"
            >
              <LogIn className="w-5 h-5" />
              <span>Acessar Diário de Classe</span>
            </button>
          </form>
        )}

        {/* TAB 2: NEW USER CREATION WITH BIRTH DATE PASSWORD */}
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
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                E-mail:
              </label>
              <input
                type="email"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                placeholder="Ex: roberto@crescer.edu.br"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                required
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
                <option value="coordenador">Coordenador (Administrador)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center space-x-1.5">
                <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Data de Nascimento:</span>
              </label>
              <input
                type="date"
                value={customBirthDate}
                onChange={(e) => setCustomBirthDate(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                required
              />
            </div>

            {customError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-medium">
                {customError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition-all cursor-pointer flex items-center justify-center space-x-2 text-sm"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Cadastrar Usuário e Fazer Login</span>
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