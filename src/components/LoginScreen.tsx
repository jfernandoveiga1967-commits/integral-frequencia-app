import React, { useState } from 'react';
import { UserProfile, UserRole } from '../types';
import { PRESET_USERS } from '../utils/authUtils';
import {
  ShieldCheck,
  GraduationCap,
  UserCheck,
  KeyRound,
  LogIn,
  School,
  ArrowRight,
  UserPlus,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';

interface LoginScreenProps {
  onLogin: (user: UserProfile) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [activeTab, setActiveTab] = useState<'quick' | 'credentials' | 'custom'>('quick');
  const [selectedPreset, setSelectedPreset] = useState<UserProfile>(PRESET_USERS[0]);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Custom user form state
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [customRole, setCustomRole] = useState<UserRole>('professor');
  const [customError, setCustomError] = useState<string | null>(null);

  // Firebase auth state
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

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

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setGoogleError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;
      
      // Map google email or ask for default role (default to Coordenador if email is jfernandoveiga1967@gmail.com or admin/coord)
      let role: UserRole = 'professor';
      if (
        googleUser.email === 'jfernandoveiga1967@gmail.com' ||
        googleUser.email?.includes('veiga') ||
        googleUser.email?.includes('coord') ||
        googleUser.email?.includes('admin')
      ) {
        role = 'coordenador';
      }

      const roleLabels: Record<UserRole, string> = {
        coordenador: 'Coordenador (Administrador)',
        professor: 'Monitor / Professor',
        auxiliar: 'Auxiliar',
      };

      const userProfile: UserProfile = {
        id: googleUser.uid,
        name: googleUser.displayName || 'Usuário Google',
        email: googleUser.email || '',
        role: role,
        cargoLabel: roleLabels[role],
        avatarColor: 'bg-blue-600',
      };

      onLogin(userProfile);
    } catch (err: any) {
      console.warn('Google sign-in error:', err);
      setGoogleError('Não foi possível autenticar com o Google no momento. Use o acesso direto por perfil.');
    } finally {
      setIsGoogleLoading(false);
    }
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
          <div className="inline-flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full text-indigo-400 text-xs font-bold uppercase tracking-wider mb-3">
            <School className="w-4 h-4 text-indigo-400" />
            <span>COLÉGIO CRESCER • PROGRAMA INTEGRAL</span>
          </div>
          
          <div className="flex justify-center mb-3">
            <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-xl shadow-indigo-500/20 ring-4 ring-slate-800">
              <img src="/pwa-192.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Frequência Extracurricular
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
            Identifique-se com sua categoria para acessar o diário de classe e relatórios.
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
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Clique em uma categoria para entrar instantaneamente:
            </p>

            {/* Coordenador / Admin */}
            <div
              onClick={() => handleQuickLogin(PRESET_USERS[0])}
              className="p-4 rounded-2xl bg-slate-950 border border-amber-500/30 hover:border-amber-500/80 transition-all cursor-pointer group flex items-start space-x-4 hover:shadow-lg hover:shadow-amber-500/10"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white group-hover:text-amber-300 transition-colors">
                    Coordenador (Administrador)
                  </h3>
                  <span className="text-[10px] uppercase tracking-wider font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full">
                    Acesso Total
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Gestão completa de alunos, turmas, relatórios, biblioteca e configurações gerais.
                </p>
                <div className="mt-2.5 flex items-center text-xs font-semibold text-amber-400 group-hover:translate-x-1 transition-transform">
                  <span>Entrar como {PRESET_USERS[0].name}</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </div>
              </div>
            </div>

            {/* Monitor / Professor */}
            <div
              onClick={() => handleQuickLogin(PRESET_USERS[1])}
              className="p-4 rounded-2xl bg-slate-950 border border-indigo-500/30 hover:border-indigo-500/80 transition-all cursor-pointer group flex items-start space-x-4 hover:shadow-lg hover:shadow-indigo-500/10"
            >
              <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/30 group-hover:scale-105 transition-transform">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">
                    Monitor / Professor
                  </h3>
                  <span className="text-[10px] uppercase tracking-wider font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded-full">
                    Docente
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Lançamento de chamadas diárias, inclusão de notas/equipamentos e gerenciamento de alunos.
                </p>
                <div className="mt-2.5 flex items-center text-xs font-semibold text-indigo-400 group-hover:translate-x-1 transition-transform">
                  <span>Entrar como {PRESET_USERS[1].name}</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </div>
              </div>
            </div>

            {/* Auxiliar */}
            <div
              onClick={() => handleQuickLogin(PRESET_USERS[2])}
              className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 hover:border-emerald-500/80 transition-all cursor-pointer group flex items-start space-x-4 hover:shadow-lg hover:shadow-emerald-500/10"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30 group-hover:scale-105 transition-transform">
                <UserCheck className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors">
                    Auxiliar
                  </h3>
                  <span className="text-[10px] uppercase tracking-wider font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                    Suporte
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Lançamento de chamadas de frequência de campo e consulta às listagens de alunos.
                </p>
                <div className="mt-2.5 flex items-center text-xs font-semibold text-emerald-400 group-hover:translate-x-1 transition-transform">
                  <span>Entrar como {PRESET_USERS[2].name}</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CREDENTIALS WITH PIN */}
        {activeTab === 'credentials' && (
          <form onSubmit={handlePinSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Selecione a Conta / Perfil:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {PRESET_USERS.map((usr) => {
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
                      <div className="text-xs font-bold text-slate-200">{usr.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{usr.cargoLabel}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Senha / PIN de Acesso (4 dígitos):
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  maxLength={6}
                  value={enteredPin}
                  onChange={(e) => setEnteredPin(e.target.value)}
                  placeholder="Digite ex: 1234"
                  className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono tracking-widest"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Dica para teste rápido: use o PIN <span className="font-mono text-indigo-400">1234</span>
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
              <span>Confirmar e Entrar</span>
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
                <option value="coordenador">Coordenador (Administrador)</option>
                <option value="professor">Monitor / Professor</option>
                <option value="auxiliar">Auxiliar</option>
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

        {/* Optional Google Login Option */}
        <div className="mt-8 pt-6 border-t border-slate-800 flex flex-col items-center">
          <p className="text-xs text-slate-500 mb-3 font-medium">Ou autentique-se via conta institucional Google:</p>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
            className="w-full sm:w-auto px-6 py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-200 transition-all cursor-pointer flex items-center justify-center space-x-2.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.2 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9c-.2-.8-.4-1.6-.4-2.3z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.2-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
              />
            </svg>
            <span>{isGoogleLoading ? 'Conectando ao Google...' : 'Entrar com Conta Google'}</span>
          </button>

          {googleError && (
            <p className="text-[11px] text-amber-400/90 mt-2 text-center">{googleError}</p>
          )}
        </div>

        {/* Footer info */}
        <div className="mt-6 text-center text-[11px] text-slate-500">
          Colégio Crescer • Sistema de Controle de Frequência Extracurricular v2.5
        </div>
      </div>
    </div>
  );
};
