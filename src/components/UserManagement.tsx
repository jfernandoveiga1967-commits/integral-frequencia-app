import React, { useState } from 'react';
import { UserProfile, UserRole, ActivityType } from '../types';
import { ACTIVITIES_LIST } from '../data/initialData';
import { getRoleBadgeStyle, isCoordenador } from '../utils/authUtils';
import { ActivityBadge } from './ActivityBadge';
import {
  ShieldCheck,
  GraduationCap,
  UserCheck,
  UserPlus,
  Search,
  Edit3,
  Trash2,
  CheckCircle2,
  XCircle,
  Mail,
  Lock,
  KeyRound,
  ShieldAlert,
  Save,
  Users,
  Check,
  Info,
  Sparkles,
} from 'lucide-react';

interface UserManagementProps {
  currentUser: UserProfile | null;
  users: UserProfile[];
  onSaveUser: (user: UserProfile) => void;
  onDeleteUser: (userId: string) => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({
  currentUser,
  users,
  onSaveUser,
  onDeleteUser,
}) => {
  const isAdmin = isCoordenador(currentUser);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'TODOS' | UserRole>('TODOS');

  // Editing state
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);

  // Form State for Adding / Editing User
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('professor');
  const [formPin, setFormPin] = useState('1234');
  const [formActivities, setFormActivities] = useState<ActivityType[]>([]);
  const [formCanManageStudents, setFormCanManageStudents] = useState(true);
  const [formCanMarkAttendance, setFormCanMarkAttendance] = useState(true);

  // Success / Error Feedback Toast
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // If user is not admin
  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto my-12 p-8 bg-white border border-slate-200 rounded-3xl shadow-sm text-center">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-800">Acesso Restrito ao Coordenador</h2>
        <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
          Apenas usuários com o cargo de <strong>Coordenador (Administrador)</strong> possuem permissão para gerenciar os cadastros, cargos e atribuições de atividades da equipe.
        </p>
      </div>
    );
  }

  // Filtered Users List
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'TODOS' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Role Statistics
  const countCoord = users.filter((u) => u.role === 'coordenador').length;
  const countProf = users.filter((u) => u.role === 'professor').length;
  const countAux = users.filter((u) => u.role === 'auxiliar').length;

  const handleOpenEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormRole(user.role);
    setFormPin(user.pin || '1234');
    setFormActivities(user.assignedActivities || ACTIVITIES_LIST.map((a) => a.id));
    setFormCanManageStudents(user.canManageStudents !== undefined ? user.canManageStudents : true);
    setFormCanMarkAttendance(user.canMarkAttendance !== undefined ? user.canMarkAttendance : true);
  };

  const handleOpenNewUserModal = () => {
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormRole('professor');
    setFormPin('1234');
    setFormActivities(['Futebol', 'Natação']); // Default sample
    setFormCanManageStudents(true);
    setFormCanMarkAttendance(true);
    setIsNewUserModalOpen(true);
  };

  const toggleActivityInForm = (activity: ActivityType) => {
    if (formActivities.includes(activity)) {
      setFormActivities(formActivities.filter((a) => a !== activity));
    } else {
      setFormActivities([...formActivities, activity]);
    }
  };

  const handleSaveFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) {
      showToast('Preencha o nome e o e-mail do usuário.', 'error');
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

    const updatedUser: UserProfile = {
      id: editingUser ? editingUser.id : 'usr_' + Date.now(),
      name: formName.trim(),
      email: formEmail.trim().toLowerCase(),
      role: formRole,
      cargoLabel: roleLabels[formRole],
      avatarColor: roleColors[formRole],
      pin: formPin.trim() || '1234',
      assignedActivities: formActivities,
      canManageStudents: formRole === 'auxiliar' ? formCanManageStudents : true,
      canMarkAttendance: formCanMarkAttendance,
      updatedAt: new Date().toISOString(),
    };

    onSaveUser(updatedUser);
    setEditingUser(null);
    setIsNewUserModalOpen(false);
    showToast(`Perfil de ${updatedUser.name} atualizado com sucesso em tempo real!`);
  };

  const handleQuickRoleChange = (user: UserProfile, newRole: UserRole) => {
    if (user.role === newRole) return;

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

    const updated: UserProfile = {
      ...user,
      role: newRole,
      cargoLabel: roleLabels[newRole],
      avatarColor: roleColors[newRole],
      updatedAt: new Date().toISOString(),
    };

    onSaveUser(updated);
    showToast(`Cargo de ${user.name} alterado para ${roleLabels[newRole]}!`);
  };

  const confirmDeleteUser = () => {
    if (!userToDelete) return;
    onDeleteUser(userToDelete.id);
    showToast(`Usuário ${userToDelete.name} removido do sistema.`);
    setUserToDelete(null);
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedbackMsg && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-center space-x-2 text-xs font-bold animate-fade-in ${
            feedbackMsg.type === 'success'
              ? 'bg-slate-900 text-emerald-400 border-emerald-500/30'
              : 'bg-slate-900 text-rose-400 border-rose-500/30'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <XCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center space-x-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full text-amber-300 text-xs font-bold uppercase tracking-wider mb-2">
              <ShieldCheck className="w-4 h-4" />
              <span>PAINEL DE ADMINISTRADOR • EM TEMPO REAL</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Gerenciamento de Usuários, E-mails e Permissões
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
              Altere cargos de e-mails cadastrados, atribua modalidades esportivas/culturais e configure permissões específicas para a equipe de monitores, professores e auxiliares.
            </p>
          </div>

          <button
            onClick={handleOpenNewUserModal}
            className="px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer flex items-center justify-center space-x-2 shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Cadastrar Novo Usuário</span>
          </button>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800">
          <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Cadastrados
            </span>
            <span className="text-xl font-extrabold text-white">{users.length}</span>
          </div>

          <div className="bg-amber-950/30 p-3 rounded-2xl border border-amber-500/20">
            <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block">
              Coordenadores (Admins)
            </span>
            <span className="text-xl font-extrabold text-amber-300">{countCoord}</span>
          </div>

          <div className="bg-indigo-950/30 p-3 rounded-2xl border border-indigo-500/20">
            <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider block">
              Monitores / Professores
            </span>
            <span className="text-xl font-extrabold text-indigo-300">{countProf}</span>
          </div>

          <div className="bg-emerald-950/30 p-3 rounded-2xl border border-emerald-500/20">
            <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider block">
              Auxiliares
            </span>
            <span className="text-xl font-extrabold text-emerald-300">{countAux}</span>
          </div>
        </div>
      </div>

      {/* Filters & Search Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Role Category Pills */}
        <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {(['TODOS', 'coordenador', 'professor', 'auxiliar'] as const).map((r) => {
            const labels: Record<string, string> = {
              TODOS: 'Todos os Usuários',
              coordenador: 'Coordenadores',
              professor: 'Professores / Monitores',
              auxiliar: 'Auxiliares',
            };

            const isSel = roleFilter === r;
            return (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isSel
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {labels[r]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Users List Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredUsers.length === 0 ? (
          <div className="col-span-full bg-white border border-slate-200 rounded-3xl p-8 text-center text-slate-500">
            Nenhum usuário encontrado para os critérios selecionados.
          </div>
        ) : (
          filteredUsers.map((user) => {
            const roleStyle = getRoleBadgeStyle(user.role);
            const userActivities = user.assignedActivities || ACTIVITIES_LIST.map((a) => a.id);

            return (
              <div
                key={user.id}
                className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow relative flex flex-col justify-between space-y-4"
              >
                {/* Header info */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-2xl ${
                        user.avatarColor || 'bg-indigo-600'
                      } flex items-center justify-center text-white font-extrabold text-base shrink-0 shadow-md`}
                    >
                      {user.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-base font-bold text-slate-900 truncate">{user.name}</h3>
                        {currentUser?.id === user.id && (
                          <span className="text-[10px] font-extrabold uppercase bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                            Você
                          </span>
                        )}
                      </div>
                      <div className="flex items-center text-xs text-slate-500 mt-0.5 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-400 mr-1 shrink-0" />
                        <span className="truncate">{user.email}</span>
                      </div>
                    </div>
                  </div>

                  {/* Role Badge */}
                  <div className="shrink-0">
                    <span
                      className={`text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-xl border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border} inline-flex items-center space-x-1`}
                    >
                      {user.role === 'coordenador' && <ShieldCheck className="w-3.5 h-3.5 mr-1" />}
                      {user.role === 'professor' && <GraduationCap className="w-3.5 h-3.5 mr-1" />}
                      {user.role === 'auxiliar' && <UserCheck className="w-3.5 h-3.5 mr-1" />}
                      <span>{roleStyle.label}</span>
                    </span>
                  </div>
                </div>

                {/* Assigned Activities Section */}
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>Modalidades Atribuídas ({userActivities.length}):</span>
                    {user.role === 'coordenador' && (
                      <span className="text-[10px] text-amber-600 font-semibold">(Acesso a Todas)</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {userActivities.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">Nenhuma modalidade atribuída</span>
                    ) : (
                      userActivities.map((act) => <ActivityBadge key={act} activity={act} size="sm" />)
                    )}
                  </div>
                </div>

                {/* Permissions & Quick Role Changer */}
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  {/* Quick Role Dropdown / Selector */}
                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    <span className="font-bold text-slate-500 text-[11px] uppercase">Alterar Cargo:</span>
                    <select
                      value={user.role}
                      onChange={(e) => handleQuickRoleChange(user, e.target.value as UserRole)}
                      className="bg-slate-100 border border-slate-200 font-bold text-slate-700 text-xs rounded-xl px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="coordenador">Coordenador (Admin)</option>
                      <option value="professor">Monitor / Professor</option>
                      <option value="auxiliar">Auxiliar</option>
                    </select>
                  </div>

                  {/* Edit & Delete Action buttons */}
                  <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                    <button
                      onClick={() => handleOpenEditModal(user)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs transition-all cursor-pointer flex items-center space-x-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar Permissões</span>
                    </button>

                    {currentUser?.id !== user.id && (
                      <button
                        onClick={() => setUserToDelete(user)}
                        className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-all cursor-pointer"
                        title="Remover usuário"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: ADD / EDIT USER */}
      {(editingUser || isNewUserModalOpen) && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-fade-in my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {editingUser ? 'Editar Cargo e Permissões do Usuário' : 'Cadastrar Novo Usuário por E-mail'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ajuste o e-mail, cargo e modalidades associadas em tempo real.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingUser(null);
                  setIsNewUserModalOpen(false);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFormSubmit} className="space-y-4 text-xs">
              {/* Name & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Nome Completo:
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ex: Prof. Roberto Santos"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                    E-mail Institucional:
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="Ex: roberto@crescer.edu.br"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Cargo / Categoria de Acesso:
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="coordenador">Coordenador (Administrador - Acesso Total)</option>
                  <option value="professor">Monitor / Professor (Diário de Classe + Alunos)</option>
                  <option value="auxiliar">Auxiliar (Lançamento de Frequência de Campo)</option>
                </select>
              </div>

              {/* PIN Code */}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  PIN de Acesso Direto (4 dígitos):
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={formPin}
                  onChange={(e) => setFormPin(e.target.value)}
                  placeholder="Ex: 1234"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Assign Extracurricular Activities */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Atribuir Modalidades Extracurriculares ao Usuário:
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  Selecione as atividades específicas que este professor/monitor gerencia:
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ACTIVITIES_LIST.map((act) => {
                    const isChecked = formActivities.includes(act.id);
                    return (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => toggleActivityInForm(act.id)}
                        className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                          isChecked
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <ActivityBadge activity={act.id} size="sm" />
                        {isChecked && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setIsNewUserModalOpen(false);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-extrabold shadow-md shadow-indigo-600/30 transition-all cursor-pointer flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Permissões</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-fade-in text-center">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">Remover Usuário?</h3>
            <p className="text-xs text-slate-600">
              Tem certeza que deseja revogar o acesso do usuário <strong>{userToDelete.name}</strong> ({userToDelete.email})? Esta ação sincronizará em tempo real.
            </p>

            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteUser}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer text-xs shadow-md shadow-rose-600/20"
              >
                Sim, Remover Usuário
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
