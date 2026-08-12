import React, { useState } from 'react';
import { UserProfile, UserRole } from '../types';
import { PRESET_USERS, verifyUserCredentials, formatBirthDateToDisplay, saveLocalUsersList } from '../utils/authUtils';
import { saveUserToFirestore } from '../firebase';
import {
  ShieldCheck,
  GraduationCap,
  UserCheck,
  KeyRound,
  LogIn,
  ArrowRight,
  UserPlus,
  Lock,
  Mail,
  CheckCircle2,
  Calendar,
  Info,
  Edit3,
  X,
  Save,
} from 'lucide-react';

interface LoginScreenProps {
  onLogin: (user: UserProfile) => void;
  onSaveUser?: (user: UserProfile) => void;
  usersList?: UserProfile[];
}

function normalizeToIsoDate(dateStr?: string): string {
  if (!dateStr) return '1990-01-01';
  const clean = dateStr.trim();
  if (clean.includes('-') && clean.length === 10) return clean;
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
  }
  return '1990-01-01';
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onSaveUser, usersList = [] }) => {
  const [activeTab, setActiveTab] = useState<'login' | 'custom' | 'usersList'>('login');

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

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editBirthDate, setEditBirthDate] = useState('1990-01-01');
  const [editRole, setEditRole] = useState<UserRole>('professor');
  const [editError, setEditError] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const handleEmailPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (!loginEmail.trim()) {
      setLoginError('Por favor, informe seu e-mail institucional.');
      return;
    }

    if (!loginPassword.trim()) {
      setLoginError('Por favor, informe sua senha (data de nascimento).');
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
        'E-mail ou senha (data de nascimento) incorretos. Verifique suas credenciais com a coordenação.'
      );
    }
  };

  const handleQuickFill = (user: UserProfile) => {
    setLoginEmail(user.email);
    setLoginPassword(formatBirthDateToDisplay(user.birthDate) || user.pin || '1234');
    setActiveTab('login');
    setLoginError(null);
  };

  const handleOpenEditModal = (user: UserProfile, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditBirthDate(normalizeToIsoDate(user.birthDate));
    setEditRole(user.role);
    setEditError(null);
  };

  const handleCloseEditModal = () => {
    setEditingUser(null);
    setEditError(null);
  };

  const handleSaveEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    if (!editingUser) return;

    if (!editName.trim()) {
      setEditError('Por favor, informe o nome do profissional.');
      return;
    }

    if (!editEmail.trim()) {
      setEditError('Por favor, informe o e-mail institucional.');
      return;
    }

    if (!editBirthDate) {
      setEditError('Por favor, selecione a data de nascimento (senha de acesso).');
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

    const formattedPass = formatBirthDateToDisplay(editBirthDate);

    const updatedUser: UserProfile = {
      ...editingUser,
      name: editName.trim(),
      email: editEmail.trim().toLowerCase(),
      role: editRole,
      cargoLabel: roleLabels[editRole],
      avatarColor: roleColors[editRole],
      birthDate: editBirthDate,
      pin: formattedPass || editBirthDate,
    };

    // Trigger save callback if provided
    if (onSaveUser) {
      onSaveUser(updatedUser);
    } else {
      saveUserToFirestore(updatedUser);
    }

    // Auto update login form if this user was currently being filled
    if (loginEmail === editingUser.email) {
      setLoginEmail(updatedUser.email);
      setLoginPassword(formattedPass || editBirthDate);
    }

    setSaveSuccessMsg(`Dados do usuário "${updatedUser.name}" atualizados com sucesso!`);
    setTimeout(() => setSaveSuccessMsg(null), 4000);

    setEditingUser(null);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);

    if (!customName.trim()) {
      setCustomError('Por favor, digite o nome completo.');
      return;
    }

    if (!customEmail.trim()) {
      setCustomError('Por favor, informe o e-mail institucional.');
      return;
    }

    if (!customBirthDate) {
      setCustomError('Por favor, selecione a data de nascimento (sua senha de acesso).');
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

      {/* Toast Notification Banner */}
      {saveSuccessMsg && (
        <div className="fixed top-5 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl font-bold text-xs sm:text-sm flex items-center space-x-2 animate-bounce border border-emerald-400">
          <CheckCircle2 className="w-5 h-5" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Main Card Container */}
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 z-10 my-auto">
        
        {/* Header Branding */}
        <div className="text-center mb-6 select-none">
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
            Acesse o diário de classe informando seu e-mail e senha (data de nascimento).
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

          <button
            type="button"
            onClick={() => setActiveTab('usersList')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
              activeTab === 'usersList'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Usuários Cadastrados</span>
          </button>
        </div>

        {/* TAB 1: MANDATORY EMAIL & PASSWORD LOGIN */}
        {activeTab === 'login' && (
          <form onSubmit={handleEmailPasswordSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center space-x-1.5">
                <Mail className="w-4 h-4 text-indigo-400" />
                <span>E-mail Institucional:</span>
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
                <span>Senha (Data de Nascimento):</span>
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Digite sua data de nascimento (ex: 12/08/1967)"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono tracking-wide"
                required
              />
              <p className="text-[11px] text-slate-400 mt-1.5 flex items-center space-x-1">
                <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>A senha do usuário é a sua data de nascimento informada no cadastro (ex: 12/08/1967).</span>
              </p>
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

            {/* Quick Fill Preset Cards for Easy Testing */}
            <div className="pt-4 border-t border-slate-800">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Atalho de Teste • Preencher E-mail e Senha em 1 clique:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {allRegisteredUsers.map((usr) => (
                  <div
                    key={usr.id}
                    className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-xl transition-all flex items-center justify-between group gap-2"
                  >
                    <div
                      onClick={() => handleQuickFill(usr)}
                      className="min-w-0 flex-1 cursor-pointer"
                      title="Preencher e-mail e senha"
                    >
                      <div className="text-xs font-bold text-slate-200 truncate group-hover:text-amber-300">
                        {usr.name}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{usr.email}</div>
                    </div>
                    
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleOpenEditModal(usr, e)}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-indigo-600 text-slate-400 hover:text-white border border-slate-800 transition-all cursor-pointer"
                        title="Editar Dados (Nome, E-mail, Senha)"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickFill(usr)}
                        className="text-[10px] font-mono text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-1 rounded border border-amber-500/30 cursor-pointer"
                      >
                        Preencher
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
                E-mail Institucional:
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
                <option value="auxiliar">Auxiliar</option>
                <option value="coordenador">Coordenador (Administrador)</option>
              </select>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center space-x-1.5">
                <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Data de Nascimento (Sua Senha de Acesso):</span>
              </label>
              <input
                type="date"
                value={customBirthDate}
                onChange={(e) => setCustomBirthDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-amber-500/40 rounded-xl text-white font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                required
              />
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                🔑 <strong>Senha de Acesso:</strong> Ao criar sua conta, sua data de nascimento (ex: <span className="font-mono text-amber-300 font-bold">{formatBirthDateToDisplay(customBirthDate) || 'DD/MM/AAAA'}</span>) será registrada como sua senha de login.
              </p>
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

        {/* TAB 3: REGISTERED USERS DIRECTORY */}
        {activeTab === 'usersList' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Usuários Cadastrados ({allRegisteredUsers.length}):
              </p>
              <span className="text-[11px] text-slate-500">Credenciais para login por e-mail</span>
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
              {allRegisteredUsers.map((usr) => {
                let icon = <GraduationCap className="w-5 h-5" />;
                let borderStyle = 'border-indigo-500/30 hover:border-indigo-500/80';
                let iconBg = 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
                let badgeText = usr.cargoLabel || 'Docente';
                let badgeBg = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';

                if (usr.role === 'coordenador') {
                  icon = <ShieldCheck className="w-5 h-5" />;
                  borderStyle = 'border-amber-500/30 hover:border-amber-500/80';
                  iconBg = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
                  badgeBg = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                } else if (usr.role === 'auxiliar') {
                  icon = <UserCheck className="w-5 h-5" />;
                  borderStyle = 'border-emerald-500/30 hover:border-emerald-500/80';
                  iconBg = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
                  badgeBg = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                }

                return (
                  <div
                    key={usr.id}
                    className={`p-3.5 rounded-2xl bg-slate-950 border ${borderStyle} transition-all flex items-start space-x-3.5`}
                  >
                    <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0 border mt-0.5`}>
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-white truncate">
                          {usr.name}
                        </h3>
                        <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${badgeBg}`}>
                          {badgeText}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 truncate font-mono mt-0.5">
                        E-mail: {usr.email}
                      </p>
                      <p className="text-[11px] text-amber-400 truncate font-mono mt-0.5">
                        Senha (Data Nasc.): {formatBirthDateToDisplay(usr.birthDate) || usr.pin || '1234'}
                      </p>
                      
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleOpenEditModal(usr, e)}
                          className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center space-x-1.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar Dados</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleQuickFill(usr)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center space-x-1"
                        >
                          <span>Usar estas credenciais</span>
                          <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="mt-8 pt-6 border-t border-slate-800 text-center text-[11px] text-slate-500">
          Colégio Crescer • Sistema de Controle de Frequência Extracurricular v2.5
        </div>
      </div>

      {/* MODAL PARA EDITAR DADOS DO USUÁRIO (NOME, E-MAIL, SENHA) */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Editar Dados do Usuário</h3>
                  <p className="text-xs text-slate-400">Altere nome, e-mail e senha de acesso</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseEditModal}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                  Nome do Profissional / Usuário:
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                  E-mail Institucional:
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                  Categoria de Acesso / Cargo:
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                >
                  <option value="professor">Monitor / Professor</option>
                  <option value="auxiliar">Auxiliar</option>
                  <option value="coordenador">Coordenador (Administrador)</option>
                </select>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center space-x-1.5">
                  <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Nova Senha (Data de Nascimento):</span>
                </label>
                <input
                  type="date"
                  value={editBirthDate}
                  onChange={(e) => setEditBirthDate(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-amber-500/40 rounded-xl text-white font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  required
                />
                <p className="text-[11px] text-amber-200/80 leading-relaxed">
                  🔑 <strong>A senha de login será:</strong> <span className="font-mono text-amber-300 font-bold">{formatBirthDateToDisplay(editBirthDate) || 'DD/MM/AAAA'}</span>
                </p>
              </div>

              {editError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-medium">
                  {editError}
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs transition-all cursor-pointer shadow-lg shadow-amber-500/20 flex items-center space-x-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Alterações</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
