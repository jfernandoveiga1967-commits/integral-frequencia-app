import React, { useState, useMemo } from 'react';
import { UserProfile, UserRole, ActivityType, ActivityItem } from '../types';
import { TURMAS_LIST } from '../data/initialData';
import { getRoleBadgeStyle, isCoordenador, formatBirthDateToDisplay, canManageStudents, canMarkAttendance } from '../utils/authUtils';
import { ActivityBadge, renderActivityIcon } from './ActivityBadge';
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
  Plus,
  Calendar,
  BookOpen,
  Cpu,
  Palette,
  Dumbbell,
  Gamepad2,
  Layers,
  Award,
  Trophy,
  Activity as ActivityIcon,
  Music,
  Music2,
  Waves,
} from 'lucide-react';

interface UserManagementProps {
  currentUser: UserProfile | null;
  users: UserProfile[];
  activitiesList: ActivityItem[];
  turmas?: string[];
  onSaveUser: (user: UserProfile) => void;
  onDeleteUser: (userId: string) => void;
  onSaveActivity: (activity: ActivityItem) => void;
  onDeleteActivity: (activityId: string) => void;
}

const AVAILABLE_ICONS = [
  { id: 'Waves', label: 'Natação / Água' },
  { id: 'Sparkles', label: 'Balé / Brilho' },
  { id: 'Music', label: 'Dança / Músicas' },
  { id: 'Award', label: 'Judô / Lutas' },
  { id: 'Trophy', label: 'Futebol / Esporte' },
  { id: 'Activity', label: 'Ginástica / Fitness' },
  { id: 'Music2', label: 'Instrumentos / Flauta' },
  { id: 'Gamepad2', label: 'Xadrez / Mente' },
  { id: 'Cpu', label: 'Robótica / Tech' },
  { id: 'Palette', label: 'Artes / Pintura' },
  { id: 'BookOpen', label: 'Teatro / Leitura' },
  { id: 'Dumbbell', label: 'Treino / Atletismo' },
];

export const UserManagement: React.FC<UserManagementProps> = ({
  currentUser,
  users,
  activitiesList,
  turmas,
  onSaveUser,
  onDeleteUser,
  onSaveActivity,
  onDeleteActivity,
}) => {
  const isAdmin = isCoordenador(currentUser);

  const availableTurmas = useMemo(() => {
    const rawList = turmas && turmas.length > 0 ? turmas : TURMAS_LIST;
    return [...rawList].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }, [turmas]);

  // Sub-tab switcher state
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'activities'>('users');

  // Search & Filter state for Users
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'TODOS' | UserRole>('TODOS');

  // User Editing state
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);

  // User Form State
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formBirthDate, setFormBirthDate] = useState('1990-01-01');
  const [formRole, setFormRole] = useState<UserRole>('professor');
  const [formPin, setFormPin] = useState('1234');
  const [formActivities, setFormActivities] = useState<ActivityType[]>([]);
  const [formTurmas, setFormTurmas] = useState<string[]>([]);
  const [formCanManageStudents, setFormCanManageStudents] = useState(true);
  const [formCanMarkAttendance, setFormCanMarkAttendance] = useState(true);

  // Activity Management State
  const [editingActivity, setEditingActivity] = useState<ActivityItem | null>(null);
  const [isNewActivityModalOpen, setIsNewActivityModalOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<ActivityItem | null>(null);

  // Activity Form State
  const [actName, setActName] = useState('');
  const [actIcon, setActIcon] = useState('Sparkles');
  const [actDescription, setActDescription] = useState('');
  const [actDefaultEquipment, setActDefaultEquipment] = useState('');

  // Toast Feedback
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Restrict access if not admin
  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto my-12 p-8 bg-white border border-slate-200 rounded-3xl shadow-sm text-center">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-800">Acesso Restrito ao Coordenador</h2>
        <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
          Apenas usuários com o cargo de <strong>Coordenador (Administrador)</strong> possuem permissão para gerenciar os cadastros de usuários, permissões e criar novas modalidades de atividades.
        </p>
      </div>
    );
  }

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'TODOS' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Stats
  const countCoord = users.filter((u) => u.role === 'coordenador').length;
  const countProf = users.filter((u) => u.role === 'professor').length;

  // Handlers for User Modal
  const handleOpenEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormBirthDate(user.birthDate || '1990-01-01');
    setFormRole(user.role);
    setFormPin(user.pin || '1234');
    setFormActivities(user.assignedActivities || activitiesList.map((a) => a.id));
    setFormTurmas(
      Array.isArray(user.allowedClassIds)
        ? user.allowedClassIds
        : (Array.isArray(user.assignedTurmas) ? user.assignedTurmas : availableTurmas)
    );
    setFormCanManageStudents(user.canManageStudents !== undefined ? user.canManageStudents : true);
    setFormCanMarkAttendance(user.canMarkAttendance !== undefined ? user.canMarkAttendance : true);
  };

  const handleOpenNewUserModal = () => {
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormBirthDate('1995-05-20');
    setFormRole('professor');
    setFormPin('1234');
    setFormActivities(activitiesList.slice(0, 3).map((a) => a.id));
    setFormTurmas(availableTurmas);
    setFormCanManageStudents(true);
    setFormCanMarkAttendance(true);
    setIsNewUserModalOpen(true);
  };

  const toggleActivityInForm = (activityId: string) => {
    if (formActivities.includes(activityId)) {
      setFormActivities(formActivities.filter((a) => a !== activityId));
    } else {
      setFormActivities([...formActivities, activityId]);
    }
  };

  const toggleTurmaInForm = (turmaName: string) => {
    if (formTurmas.includes(turmaName)) {
      setFormTurmas(formTurmas.filter((t) => t !== turmaName));
    } else {
      setFormTurmas([...formTurmas, turmaName]);
    }
  };

  const handleSaveFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) {
      showToast('Preencha o nome e o e-mail do usuário.', 'error');
      return;
    }
    if (!formBirthDate) {
      showToast('Informe a data de nascimento do usuário.', 'error');
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

    const formattedPass = formatBirthDateToDisplay(formBirthDate);

    const isMasterAdmin =
      (formEmail || '').trim().toLowerCase() === 'jfernandoveiga1967@gmail.com' ||
      (editingUser && editingUser.id === 'usr_coord_1');
    const effectiveRole = isMasterAdmin ? 'coordenador' : formRole;

    const updatedUser: UserProfile = {
      id: editingUser ? editingUser.id : (isMasterAdmin ? 'usr_coord_1' : 'usr_' + Date.now()),
      name: isMasterAdmin ? 'Fernando Veiga' : formName.trim(),
      email: formEmail.trim().toLowerCase(),
      role: effectiveRole,
      cargoLabel: roleLabels[effectiveRole],
      avatarColor: roleColors[effectiveRole],
      birthDate: formBirthDate,
      pin: formattedPass || formBirthDate,
      assignedActivities: formActivities,
      assignedTurmas: formTurmas,
      allowedClassIds: formTurmas,
      canManageStudents: isMasterAdmin ? true : formCanManageStudents,
      canMarkAttendance: isMasterAdmin ? true : formCanMarkAttendance,
      updatedAt: new Date().toISOString(),
    };

    onSaveUser(updatedUser);
    setEditingUser(null);
    setIsNewUserModalOpen(false);
    showToast(`Perfil de ${updatedUser.name} atualizado com sucesso!`);
  };

  const handleQuickRoleChange = (user: UserProfile, newRole: UserRole) => {
    if (user.role === newRole) return;
    if (user.email.toLowerCase() === 'jfernandoveiga1967@gmail.com' || user.id === 'usr_coord_1') {
      showToast('O perfil do Coordenador Geral não pode ser alterado para Monitor/Professor.', 'error');
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

  const handleToggleCanManageStudents = (user: UserProfile) => {
    const currentVal = canManageStudents(user);
    const updated: UserProfile = {
      ...user,
      canManageStudents: !currentVal,
      updatedAt: new Date().toISOString(),
    };
    onSaveUser(updated);
    showToast(`Permissão de cadastro de alunos para ${user.name}: ${!currentVal ? 'LIBERADA' : 'BLOQUEADA'}`);
  };

  const handleToggleCanMarkAttendance = (user: UserProfile) => {
    const currentVal = canMarkAttendance(user);
    const updated: UserProfile = {
      ...user,
      canMarkAttendance: !currentVal,
      updatedAt: new Date().toISOString(),
    };
    onSaveUser(updated);
    showToast(`Permissão de lançamento de chamada para ${user.name}: ${!currentVal ? 'LIBERADA' : 'BLOQUEADA'}`);
  };

  const handleToggleUserActivity = (user: UserProfile, activityId: ActivityType) => {
    const currentList = user.assignedActivities || activitiesList.map((a) => a.id);
    const exists = currentList.includes(activityId);
    const newList = exists ? currentList.filter((a) => a !== activityId) : [...currentList, activityId];

    const updated: UserProfile = {
      ...user,
      assignedActivities: newList,
      updatedAt: new Date().toISOString(),
    };
    onSaveUser(updated);
    showToast(`Modalidade ${activityId} ${!exists ? 'atribuída a' : 'removida de'} ${user.name}`);
  };

  const handleAssignAllActivities = (user: UserProfile) => {
    const allIds = activitiesList.map((a) => a.id);
    const updated: UserProfile = {
      ...user,
      assignedActivities: allIds,
      updatedAt: new Date().toISOString(),
    };
    onSaveUser(updated);
    showToast(`Todas as modalidades foram liberadas para ${user.name}!`);
  };

  const handleClearAllActivities = (user: UserProfile) => {
    const updated: UserProfile = {
      ...user,
      assignedActivities: [],
      updatedAt: new Date().toISOString(),
    };
    onSaveUser(updated);
    showToast(`Modalidades de ${user.name} foram limpas.`);
  };

  const handleToggleUserTurma = (user: UserProfile, turmaName: string) => {
    const currentList = Array.isArray(user.allowedClassIds)
      ? user.allowedClassIds
      : (Array.isArray(user.assignedTurmas) ? user.assignedTurmas : availableTurmas);
    const exists = currentList.includes(turmaName);
    const newList = exists ? currentList.filter((t) => t !== turmaName) : [...currentList, turmaName];

    const updated: UserProfile = {
      ...user,
      assignedTurmas: newList,
      allowedClassIds: newList,
      updatedAt: new Date().toISOString(),
    };
    onSaveUser(updated);
    showToast(`Turma ${turmaName} ${!exists ? 'liberada para' : 'revogada de'} ${user.name}`);
  };

  const handleAssignAllTurmas = (user: UserProfile) => {
    const updated: UserProfile = {
      ...user,
      assignedTurmas: availableTurmas,
      allowedClassIds: availableTurmas,
      updatedAt: new Date().toISOString(),
    };
    onSaveUser(updated);
    showToast(`Todas as turmas foram liberadas para ${user.name}!`);
  };

  const handleClearAllTurmas = (user: UserProfile) => {
    const updated: UserProfile = {
      ...user,
      assignedTurmas: [],
      allowedClassIds: [],
      updatedAt: new Date().toISOString(),
    };
    onSaveUser(updated);
    showToast(`Turmas de ${user.name} foram limpas.`);
  };

  const confirmDeleteUser = () => {
    if (!userToDelete) return;
    if (userToDelete.email.toLowerCase() === 'jfernandoveiga1967@gmail.com' || userToDelete.id === 'usr_coord_1') {
      showToast('O perfil do Coordenador Geral não pode ser excluído.', 'error');
      setUserToDelete(null);
      return;
    }
    onDeleteUser(userToDelete.id);
    showToast(`Usuário ${userToDelete.name} removido.`);
    setUserToDelete(null);
  };

  // Handlers for Activity Modal
  const handleOpenNewActivityModal = () => {
    setEditingActivity(null);
    setActName('');
    setActIcon('Sparkles');
    setActDescription('');
    setActDefaultEquipment('');
    setIsNewActivityModalOpen(true);
  };

  const handleOpenEditActivityModal = (activity: ActivityItem) => {
    setEditingActivity(activity);
    setActName(activity.name);
    setActIcon(activity.icon || 'Sparkles');
    setActDescription(activity.description || '');
    setActDefaultEquipment(activity.defaultEquipment || '');
  };

  const handleSaveActivitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!actName.trim()) {
      showToast('Digite o nome da atividade extracurricular.', 'error');
      return;
    }

    const activityObj: ActivityItem = {
      id: editingActivity ? editingActivity.id : actName.trim(),
      name: actName.trim(),
      icon: actIcon,
      description: actDescription.trim() || `Modalidade de ${actName.trim()} no Programa Integral`,
      defaultEquipment: actDefaultEquipment.trim() || 'Material necessário para a aula',
      isCustom: true,
    };

    onSaveActivity(activityObj);
    setEditingActivity(null);
    setIsNewActivityModalOpen(false);
    showToast(`Atividade "${activityObj.name}" salva com sucesso!`);
  };

  const confirmDeleteActivity = () => {
    if (!activityToDelete) return;
    onDeleteActivity(activityToDelete.id);
    showToast(`Atividade "${activityToDelete.name}" removida.`);
    setActivityToDelete(null);
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
              <span>PAINEL DE ADMINISTRADOR • FERNANDO VEIGA</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Gerenciamento de Usuários e Modalidades
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
              Gerencie cadastros, e-mails e cargos da equipe, e crie ou personalize novas modalidades de atividades extracurriculares.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleOpenNewUserModal}
              className="px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer flex items-center justify-center space-x-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Novo Usuário</span>
            </button>

            <button
              onClick={handleOpenNewActivityModal}
              className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center justify-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Criar Nova Atividade</span>
            </button>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 mt-6 max-w-md">
          <button
            onClick={() => setActiveSubTab('users')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
              activeSubTab === 'users'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Usuários e Permissões ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('activities')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
              activeSubTab === 'activities'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Modalidades ({activitiesList.length})</span>
          </button>
        </div>
      </div>

      {/* ================= SECTION 1: USERS & PERMISSIONS ================= */}
      {activeSubTab === 'users' && (
        <div className="space-y-6">
          {/* Filters & Search Controls */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
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

            <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              {(['TODOS', 'coordenador', 'professor'] as const).map((r) => {
                const labels: Record<string, string> = {
                  TODOS: 'Todos os Usuários',
                  coordenador: 'Coordenadores',
                  professor: 'Professores / Monitores',
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
                const userActivities = user.assignedActivities || activitiesList.map((a) => a.id);
                const userTurmas = Array.isArray(user.allowedClassIds)
                  ? user.allowedClassIds
                  : (Array.isArray(user.assignedTurmas) ? user.assignedTurmas : availableTurmas);

                return (
                  <div
                    key={user.id}
                    className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow relative flex flex-col justify-between space-y-4"
                  >
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
                              <span className="text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-300">
                                Você (Admin)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center text-xs text-slate-500 mt-0.5 truncate">
                            <Mail className="w-3.5 h-3.5 text-slate-400 mr-1 shrink-0" />
                            <span className="truncate">{user.email}</span>
                          </div>
                          <div className="flex items-center text-[11px] text-amber-700 font-semibold mt-1">
                            <KeyRound className="w-3 h-3 text-amber-600 mr-1 shrink-0" />
                            <span>Senha (Data Nasc.): <strong className="font-mono text-slate-900">{formatBirthDateToDisplay(user.birthDate) || user.pin || 'Não cadastrada'}</strong></span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0">
                        <span
                          className={`text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-xl border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border} inline-flex items-center space-x-1`}
                        >
                          {user.role === 'coordenador' && <ShieldCheck className="w-3.5 h-3.5 mr-1" />}
                          {user.role === 'professor' && <GraduationCap className="w-3.5 h-3.5 mr-1" />}
                          <span>{roleStyle.label}</span>
                        </span>
                      </div>
                    </div>

                    {/* Painel de Permissões e Acessos */}
                    <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 space-y-3">
                      <div className="flex items-center justify-between text-xs font-extrabold text-slate-800 border-b border-slate-200/60 pb-2">
                        <span className="flex items-center space-x-1.5">
                          <ShieldCheck className="w-4 h-4 text-indigo-600" />
                          <span>Painel de Permissões & Acessos</span>
                        </span>
                        <span className="text-[10px] text-indigo-700 font-bold bg-indigo-100/60 px-2 py-0.5 rounded-full border border-indigo-200">
                          Controle Direto
                        </span>
                      </div>

                      {/* Toggles de Permissões Principais */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {/* Toggle: Cadastrar/Editar Alunos */}
                        <button
                          type="button"
                          onClick={() => handleToggleCanManageStudents(user)}
                          className={`p-2.5 rounded-xl border transition-all text-left flex items-center justify-between cursor-pointer ${
                            canManageStudents(user)
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 font-bold shadow-xs'
                              : 'bg-white border-slate-200 text-slate-500 font-medium hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center space-x-2 min-w-0">
                            <Users className={`w-4 h-4 shrink-0 ${canManageStudents(user) ? 'text-emerald-600' : 'text-slate-400'}`} />
                            <div className="truncate">
                              <p className="text-[11px] font-extrabold leading-tight">Cadastrar/Editar Alunos</p>
                              <p className="text-[10px] opacity-80">{canManageStudents(user) ? 'Liberado' : 'Bloqueado'}</p>
                            </div>
                          </div>
                          <div className={`w-7 h-4 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${canManageStudents(user) ? 'bg-emerald-600 justify-end' : 'bg-slate-300 justify-start'}`}>
                            <div className="w-3 h-3 rounded-full bg-white shadow-xs" />
                          </div>
                        </button>

                        {/* Toggle: Lançar Chamada & Presença */}
                        <button
                          type="button"
                          onClick={() => handleToggleCanMarkAttendance(user)}
                          className={`p-2.5 rounded-xl border transition-all text-left flex items-center justify-between cursor-pointer ${
                            canMarkAttendance(user)
                              ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-900 font-bold shadow-xs'
                              : 'bg-white border-slate-200 text-slate-500 font-medium hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center space-x-2 min-w-0">
                            <CheckCircle2 className={`w-4 h-4 shrink-0 ${canMarkAttendance(user) ? 'text-indigo-600' : 'text-slate-400'}`} />
                            <div className="truncate">
                              <p className="text-[11px] font-extrabold leading-tight">Lançar Chamada & Presença</p>
                              <p className="text-[10px] opacity-80">{canMarkAttendance(user) ? 'Liberado' : 'Bloqueado'}</p>
                            </div>
                          </div>
                          <div className={`w-7 h-4 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${canMarkAttendance(user) ? 'bg-indigo-600 justify-end' : 'bg-slate-300 justify-start'}`}>
                            <div className="w-3 h-3 rounded-full bg-white shadow-xs" />
                          </div>
                        </button>
                      </div>

                      {/* Modalidades / Atividades Liberadas */}
                      <div className="pt-2 border-t border-slate-200/60 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-700">
                          <span>Modalidades Liberadas ({userActivities.length}):</span>
                          <div className="flex items-center space-x-2 text-[10px]">
                            <button
                              type="button"
                              onClick={() => handleAssignAllActivities(user)}
                              className="text-indigo-600 hover:text-indigo-800 font-extrabold cursor-pointer hover:underline"
                            >
                              Todas
                            </button>
                            <span className="text-slate-300">•</span>
                            <button
                              type="button"
                              onClick={() => handleClearAllActivities(user)}
                              className="text-slate-500 hover:text-slate-700 font-bold cursor-pointer hover:underline"
                            >
                              Limpar
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {activitiesList.map((act) => {
                            const isAssigned = userActivities.includes(act.id);
                            return (
                              <button
                                key={act.id}
                                type="button"
                                onClick={() => handleToggleUserActivity(user, act.id)}
                                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer flex items-center space-x-1 ${
                                  isAssigned
                                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600 opacity-60'
                                }`}
                                title={isAssigned ? `Clique para revogar ${act.id}` : `Clique para liberar ${act.id}`}
                              >
                                <span>{isAssigned ? '✓' : '+'}</span>
                                <span>{act.id}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Turmas / Anos Escolares Liberados */}
                      <div className="pt-2 border-t border-slate-200/60 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-700">
                          <span>Turmas Liberadas ({user.role === 'coordenador' ? 'Todas (Admin)' : `${userTurmas.length} de ${availableTurmas.length}`}):</span>
                          <div className="flex items-center space-x-2 text-[10px]">
                            <button
                              type="button"
                              onClick={() => handleAssignAllTurmas(user)}
                              className="text-blue-600 hover:text-blue-800 font-extrabold cursor-pointer hover:underline"
                            >
                              Todas
                            </button>
                            <span className="text-slate-300">•</span>
                            <button
                              type="button"
                              onClick={() => handleClearAllTurmas(user)}
                              className="text-slate-500 hover:text-slate-700 font-bold cursor-pointer hover:underline"
                            >
                              Limpar
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {availableTurmas.map((t) => {
                            const isAssigned = user.role === 'coordenador' || userTurmas.includes(t);
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => handleToggleUserTurma(user, t)}
                                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer flex items-center space-x-1 ${
                                  isAssigned
                                    ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600 opacity-60'
                                }`}
                                title={isAssigned ? `Clique para revogar ${t}` : `Clique para liberar ${t}`}
                              >
                                <span>{isAssigned ? '✓' : '+'}</span>
                                <span>{t}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                      <div className="flex items-center space-x-2 w-full sm:w-auto">
                        <span className="font-bold text-slate-500 text-[11px] uppercase">Alterar Cargo:</span>
                        <select
                          value={user.role}
                          onChange={(e) => handleQuickRoleChange(user, e.target.value as UserRole)}
                          className="bg-slate-100 border border-slate-200 font-bold text-slate-700 text-xs rounded-xl px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value="coordenador">Coordenador (Admin)</option>
                          <option value="professor">Monitor / Professor</option>
                        </select>
                      </div>

                      <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                        <button
                          onClick={() => handleOpenEditModal(user)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs transition-all cursor-pointer flex items-center space-x-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar Dados</span>
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
        </div>
      )}

      {/* ================= SECTION 2: EXTRACURRICULAR ACTIVITIES LAYER ================= */}
      {activeSubTab === 'activities' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Camada de Gestão de Modalidades</h3>
              <p className="text-xs text-slate-500">
                Cadastre novas atividades para o diário de classe ou edite as especificações e materiais padrão.
              </p>
            </div>
            <button
              onClick={handleOpenNewActivityModal}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Atividade</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activitiesList.map((act) => {
              const assignedProfs = users.filter((u) => u.assignedActivities?.includes(act.id));

              return (
                <div
                  key={act.id}
                  className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <ActivityBadge activity={act.id} iconName={act.icon} customEquipment={act.defaultEquipment} size="lg" />
                      {act.isCustom && (
                        <span className="text-[10px] font-extrabold uppercase bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
                          Personalizada
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 font-medium leading-relaxed">
                      {act.description || 'Atividade extracurricular do Integral.'}
                    </p>

                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-xs space-y-1">
                      <span className="font-bold text-slate-700 block">Equipamento / Material Padrão:</span>
                      <span className="text-slate-600">{act.defaultEquipment || 'Sem equipamento específico'}</span>
                    </div>

                    <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
                      <span>Professores Associados:</span>
                      <span className="font-bold text-indigo-600">{assignedProfs.length} profissional(is)</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                    <button
                      onClick={() => handleOpenEditActivityModal(act)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs transition-all cursor-pointer flex items-center space-x-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>

                    <button
                      onClick={() => setActivityToDelete(act)}
                      className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-all cursor-pointer"
                      title="Excluir modalidade"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                    E-mail:
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
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>Data de Nascimento:</span>
                </label>
                <input
                  type="date"
                  value={formBirthDate}
                  onChange={(e) => setFormBirthDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="block font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Atribuir Modalidades Extracurriculares ao Usuário:
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  Selecione as atividades específicas que este professor/monitor gerencia:
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {activitiesList.map((act) => {
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
                        <ActivityBadge activity={act.id} iconName={act.icon} customEquipment={act.defaultEquipment} size="sm" />
                        {isChecked && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Atribuir Turmas Liberadas ao Usuário */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-800 uppercase tracking-wider text-xs">
                    Atribuir Turmas Liberadas ao Usuário:
                  </label>
                  <div className="flex items-center space-x-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setFormTurmas(availableTurmas)}
                      className="text-blue-600 hover:text-blue-800 font-extrabold cursor-pointer hover:underline"
                    >
                      Todas
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => setFormTurmas([])}
                      className="text-slate-500 hover:text-slate-700 font-bold cursor-pointer hover:underline"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Selecione os anos escolares e turmas para liberação de acesso:
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-1 border border-slate-100 rounded-xl bg-slate-50/50">
                  {availableTurmas.map((t) => {
                    const isChecked = formRole === 'coordenador' || formTurmas.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTurmaInForm(t)}
                        className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                          isChecked
                            ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-xs truncate">{t}</span>
                        {isChecked && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

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
                  <span>Salvar Usuário</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT ACTIVITY */}
      {(editingActivity || isNewActivityModalOpen) && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-fade-in my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {editingActivity ? 'Editar Atividade Extracurricular' : 'Criar Nova Atividade Extracurricular'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Adicione modalidades esportivas, artísticas ou culturais ao programa.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingActivity(null);
                  setIsNewActivityModalOpen(false);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveActivitySubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nome da Atividade / Modalidade:
                </label>
                <input
                  type="text"
                  value={actName}
                  onChange={(e) => setActName(e.target.value)}
                  placeholder="Ex: Xadrez, Teatro, Robótica, Karatê..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Ícone Representativo:
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {AVAILABLE_ICONS.map((ic) => {
                    const isSel = actIcon === ic.id;
                    return (
                      <button
                        key={ic.id}
                        type="button"
                        onClick={() => setActIcon(ic.id)}
                        className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center space-x-2 ${
                          isSel
                            ? 'bg-indigo-50 border-indigo-400 text-indigo-900 font-bold ring-2 ring-indigo-500/20'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {renderActivityIcon(ic.id)}
                        <span className="text-[11px] truncate">{ic.label.split('/')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Descrição da Modalidade:
                </label>
                <textarea
                  value={actDescription}
                  onChange={(e) => setActDescription(e.target.value)}
                  placeholder="Descreva o objetivo ou dinâmica da aula..."
                  rows={2}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Equipamento / Material Padrão Exigido:
                </label>
                <input
                  type="text"
                  value={actDefaultEquipment}
                  onChange={(e) => setActDefaultEquipment(e.target.value)}
                  placeholder="Ex: Tabuleiro de Xadrez e Caderno de Anotações"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingActivity(null);
                    setIsNewActivityModalOpen(false);
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
                  <span>Salvar Atividade</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE USER CONFIRMATION */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-fade-in text-center">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">Remover Usuário?</h3>
            <p className="text-xs text-slate-600">
              Tem certeza que deseja revogar o acesso do usuário <strong>{userToDelete.name}</strong> ({userToDelete.email})?
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

      {/* MODAL: DELETE ACTIVITY CONFIRMATION */}
      {activityToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-fade-in text-center">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">Excluir Atividade Extracurricular?</h3>
            <p className="text-xs text-slate-600">
              Tem certeza que deseja excluir a modalidade <strong>{activityToDelete.name}</strong>?
            </p>

            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                onClick={() => setActivityToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteActivity}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer text-xs shadow-md shadow-rose-600/20"
              >
                Sim, Excluir Modalidade
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
