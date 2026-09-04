import React, { useState, useMemo } from 'react';
import { UserProfile, UserRole, UserStatus, ActivityType, ActivityItem, ScheduleBlock, HolidayItem } from '../types';
import { TURMAS_LIST } from '../data/initialData';
import {
  getRoleBadgeStyle,
  isCoordenador,
  formatBirthDateToDisplay,
  canManageStudents,
  canMarkAttendance,
  isUserActive,
  isUserDismissed,
  isUserInactiveOrDismissed,
  getUserStatus,
  getUserStatusBadge,
  normalizeAndDeduplicateUsers,
} from '../utils/authUtils';
import { formatDateBR } from '../utils/dateUtils';
import { formatPhoneDisplay, generateWhatsAppUrl } from '../utils/whatsappUtils';
import { sortTurmasPedagogical } from '../utils/turmaUtils';
import {
  calculateDailyHoursFromSchedule,
  formatMinutesToTime,
  formatMinutesToHoursAndMinutes,
  parseHoursAndMinutesStringToMinutes,
  isContinuousShift,
} from '../utils/pontoUtils';
import { ActivityBadge, renderActivityIcon, renderActivityIconOrImage, BASE_AVAILABLE_ICONS, detectIconFromActivityName } from './ActivityBadge';
import { ScheduleManager } from './ScheduleManager';
import { HolidayManager } from './HolidayManager';
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
  Phone,
  MessageSquare,
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
  CalendarDays,
  CalendarOff,
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
  Clock,
  Briefcase,
  Building2,
  DollarSign,
  HeartHandshake,
  HandHeart,
  Heart,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Upload,
  Image as ImageIcon,
  FileImage,
  X,
  RefreshCw,
} from 'lucide-react';

interface UserManagementProps {
  currentUser: UserProfile | null;
  users: UserProfile[];
  activitiesList: ActivityItem[];
  turmas?: string[];
  schedules?: ScheduleBlock[];
  holidays?: HolidayItem[];
  onSaveUser: (user: UserProfile) => void | Promise<void>;
  onDeleteUser: (userId: string) => void;
  onSaveActivity: (activity: ActivityItem) => void;
  onDeleteActivity: (activityId: string) => void;
  onSaveScheduleBlock?: (block: ScheduleBlock) => void;
  onDeleteScheduleBlock?: (id: string) => void;
  onBatchSaveSchedules?: (
    blocks: ScheduleBlock[],
    deletedIds?: string[],
    newOrUpdatedOnly?: ScheduleBlock[]
  ) => void;
  onSaveHoliday?: (holiday: HolidayItem) => void;
  onDeleteHoliday?: (id: string) => void;
  onBatchSaveHolidays?: (holidays: HolidayItem[]) => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({
  currentUser,
  users,
  activitiesList,
  turmas,
  schedules = [],
  holidays = [],
  onSaveUser,
  onDeleteUser,
  onSaveActivity,
  onDeleteActivity,
  onSaveScheduleBlock,
  onDeleteScheduleBlock,
  onBatchSaveSchedules,
  onSaveHoliday,
  onDeleteHoliday,
  onBatchSaveHolidays,
}) => {
  const isAdmin = isCoordenador(currentUser);

  // Dynamic icon library: merges base Lucide presets with any custom icons found in existing/saved activities
  const availableIconList = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    BASE_AVAILABLE_ICONS.forEach((ic) => {
      map.set(ic.id, ic);
    });

    activitiesList.forEach((act) => {
      if (act.icon && !map.has(act.icon)) {
        map.set(act.icon, {
          id: act.icon,
          label: `${act.name} / Personalizado`,
        });
      }
    });

    return Array.from(map.values());
  }, [activitiesList]);

  const availableTurmas = useMemo(() => {
    const rawList = turmas && turmas.length > 0 ? turmas : TURMAS_LIST;
    return sortTurmasPedagogical(rawList);
  }, [turmas]);

  // Sub-tab switcher state
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'activities' | 'schedules' | 'holidays'>('users');

  // Search & Filter state for Users
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'TODOS' | UserRole>('TODOS');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ATIVOS' | 'INATIVOS'>('ATIVOS');

  // User Editing state
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);

  // User Form State
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formBirthDate, setFormBirthDate] = useState('1990-01-01');
  const [formRole, setFormRole] = useState<UserRole>('professor');
  const [formStatus, setFormStatus] = useState<UserStatus>('ATIVO');
  const [formDataDesligamento, setFormDataDesligamento] = useState('');
  const [formMotivoDesligamento, setFormMotivoDesligamento] = useState('');
  const [formPin, setFormPin] = useState('1234');
  const [formActivities, setFormActivities] = useState<ActivityType[]>([]);
  const [formTurmas, setFormTurmas] = useState<string[]>([]);
  const [formCanManageStudents, setFormCanManageStudents] = useState(true);
  const [formCanMarkAttendance, setFormCanMarkAttendance] = useState(true);
  const [formPixKey, setFormPixKey] = useState('');
  const [formWorkShiftType, setFormWorkShiftType] = useState<'continua_6h' | 'padrao_8h' | 'personalizada'>('continua_6h');
  const [formContractSchedule, setFormContractSchedule] = useState('');
  const [formContractDailyHours, setFormContractDailyHours] = useState<number | string>(6);
  const [formContractDailyHoursFormatted, setFormContractDailyHoursFormatted] = useState('6h 00min');
  const [formContractDailyMinutes, setFormContractDailyMinutes] = useState(360);
  const [formBaseSalary, setFormBaseSalary] = useState<number | string>(1200);
  const [formCompany, setFormCompany] = useState('GADAL - Gestão e Apoio');

  // Dynamic calculation for schedule and lunch interval
  const scheduleCalculation = useMemo(() => {
    return calculateDailyHoursFromSchedule(formContractSchedule);
  }, [formContractSchedule]);

  const handleScheduleInputChange = (val: string) => {
    setFormContractSchedule(val);
    if (val.trim()) {
      const calc = calculateDailyHoursFromSchedule(val);
      if (calc.workedMinutes > 0) {
        setFormContractDailyHours(calc.dailyHours);
        setFormContractDailyHoursFormatted(calc.dailyHoursFormatted);
        setFormContractDailyMinutes(calc.workedMinutes);
      }
    }
  };

  const handleDailyHoursChange = (val: string) => {
    setFormContractDailyHoursFormatted(val);
    const parsedMin = parseHoursAndMinutesStringToMinutes(val);
    setFormContractDailyMinutes(parsedMin);
    setFormContractDailyHours(Number((parsedMin / 60).toFixed(2)));
  };

  // Activity Management State
  const [editingActivity, setEditingActivity] = useState<ActivityItem | null>(null);
  const [isNewActivityModalOpen, setIsNewActivityModalOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<ActivityItem | null>(null);

  // Activity Form State
  const [actName, setActName] = useState('');
  const [actIcon, setActIcon] = useState('Sparkles');
  const [actCustomIconUrl, setActCustomIconUrl] = useState<string>('');
  const [iconUploadError, setIconUploadError] = useState<string>('');
  const [iconSourceTab, setIconSourceTab] = useState<'upload' | 'preset'>('upload');
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isManualIconChosen, setIsManualIconChosen] = useState(false);
  const [iconSearchTerm, setIconSearchTerm] = useState('');
  const [actDescription, setActDescription] = useState('');
  const [actDefaultEquipment, setActDefaultEquipment] = useState('');
  const [actRequiresRollCall, setActRequiresRollCall] = useState<boolean>(true);

  // Toast Feedback
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);

  // Accordion Expand/Collapse State for Users
  const [expandedUserIds, setExpandedUserIds] = useState<string[]>([]);

  const toggleUserExpand = (userId: string) => {
    setExpandedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const expandAllUsers = () => {
    setExpandedUserIds(filteredUsers.map((u) => u.id));
  };

  const collapseAllUsers = () => {
    setExpandedUserIds([]);
  };

  // Accordion Expand/Collapse State for Activities / Modalidades
  const [expandedActivityIds, setExpandedActivityIds] = useState<string[]>(() =>
    activitiesList.map((a) => a.id)
  );
  const [activitySearchTerm, setActivitySearchTerm] = useState('');
  const [activityTypeFilter, setActivityTypeFilter] = useState<'TODAS' | 'CHAMADA' | 'ROTINA' | 'PERSONALIZADA'>('TODAS');

  const toggleActivityExpand = (actId: string) => {
    setExpandedActivityIds((prev) =>
      prev.includes(actId) ? prev.filter((id) => id !== actId) : [...prev, actId]
    );
  };

  const expandAllActivities = () => {
    setExpandedActivityIds(filteredActivities.map((a) => a.id));
  };

  const collapseAllActivities = () => {
    setExpandedActivityIds([]);
  };

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

  // Filtered & Sorted Users (Admin always pinned on top + alphabetical A-Z for others)
  const filteredUsers = useMemo(() => {
    const deduplicatedUsers = normalizeAndDeduplicateUsers(users || []);
    return deduplicatedUsers
      .filter((u) => {
        if (!u) return false;
        const matchesSearch =
          (u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (u.company || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'TODOS' || u.role === roleFilter;

        let matchesStatus = true;
        if (statusFilter === 'ATIVOS') {
          matchesStatus = isUserActive(u);
        } else if (statusFilter === 'INATIVOS') {
          matchesStatus = isUserInactiveOrDismissed(u);
        }

        return matchesSearch && matchesRole && matchesStatus;
      })
      .sort((a, b) => {
        // 1. Coordenador/Admin fica sempre no topo
        if (a.role === 'coordenador' && b.role !== 'coordenador') return -1;
        if (a.role !== 'coordenador' && b.role === 'coordenador') return 1;

        // 2. Colaboradores Ativos antes de Desligados/Inativos se visualizando Todos
        const aActive = isUserActive(a) ? 1 : 0;
        const bActive = isUserActive(b) ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;

        // 3. Demais usuários ordenados por nome (A-Z)
        return (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
      });
  }, [users, searchTerm, roleFilter, statusFilter]);

  // Filtered Activities / Modalidades
  const filteredActivities = useMemo(() => {
    return (activitiesList || []).filter((act) => {
      if (!act) return false;
      const search = activitySearchTerm.toLowerCase().trim();
      const matchesSearch =
        !search ||
        (act.name || '').toLowerCase().includes(search) ||
        (act.id || '').toLowerCase().includes(search) ||
        (act.description || '').toLowerCase().includes(search) ||
        (act.defaultEquipment || '').toLowerCase().includes(search);

      if (!matchesSearch) return false;

      if (activityTypeFilter === 'CHAMADA') {
        return act.requiresRollCall !== false;
      }
      if (activityTypeFilter === 'ROTINA') {
        return act.requiresRollCall === false;
      }
      if (activityTypeFilter === 'PERSONALIZADA') {
        return !!act.isCustom;
      }
      return true;
    });
  }, [activitiesList, activitySearchTerm, activityTypeFilter]);

  // Modalidades extracurriculares que exigem chamada individual (inclui "Rotina" e modalidades com requiresRollCall: true, excluindo blocos gerais informativos de rotina que não possuem chamada)
  const rollCallExtracurriculars = useMemo(() => {
    const nonRollCallRoutineKeywords = [
      'acolhimento',
      'almoço',
      'almoco',
      'higienização',
      'higienizacao',
      'higiene',
      'lanche',
      'descanso',
      'sono',
      'parque',
      'recreio',
      'patio',
      'pátio',
      'lição de casa',
      'licao de casa',
      'estudo orientado',
      'saída',
      'saida',
      'entrada',
    ];

    return (activitiesList || []).filter((act) => {
      if (!act) return false;
      // Deve exigir chamada
      if (act.requiresRollCall === false || (act as any).exigeChamada === false) {
        return false;
      }
      const norm = (act.name || act.id || '').toLowerCase().trim();
      const normNoAccent = norm.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      // Se for a atividade oficial "Rotina", sempre inclui
      if (norm === 'rotina' || normNoAccent === 'rotina') {
        return true;
      }

      // Exclui termos de rotina secundária/informativa
      if (
        nonRollCallRoutineKeywords.some(
          (k) =>
            norm === k ||
            normNoAccent === k ||
            norm.startsWith(`${k} `) ||
            norm.endsWith(` ${k}`) ||
            normNoAccent.startsWith(`${k} `) ||
            normNoAccent.endsWith(` ${k}`)
        )
      ) {
        return false;
      }

      return true;
    });
  }, [activitiesList]);

  // Stats
  const countCoord = (users || []).filter((u) => u && u.role === 'coordenador').length;
  const countProf = (users || []).filter((u) => u && u.role === 'professor').length;

  // Handlers for User Modal
  const handleOpenEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormPhone(user.phone || '');
    setFormBirthDate(user.birthDate || '1990-01-01');
    setFormRole(user.role);
    setFormStatus(getUserStatus(user));
    setFormDataDesligamento(user.dataDesligamento || '');
    setFormMotivoDesligamento(user.motivoDesligamento || '');
    setFormPin(user.pin || '1234');
    setFormActivities(user.assignedActivities || activitiesList.map((a) => a.id));
    setFormTurmas(
      Array.isArray(user.allowedClassIds)
        ? user.allowedClassIds
        : (Array.isArray(user.assignedTurmas) ? user.assignedTurmas : availableTurmas)
    );
    setFormCanManageStudents(user.canManageStudents !== undefined ? user.canManageStudents : true);
    setFormCanMarkAttendance(user.canMarkAttendance !== undefined ? user.canMarkAttendance : true);
    setFormPixKey(user.pixKey || user.phone || '');

    const shiftType = user.workShiftType || (isContinuousShift(user, user.contractSchedule) ? 'continua_6h' : 'padrao_8h');
    setFormWorkShiftType(shiftType);

    const sched = user.contractSchedule || (shiftType === 'continua_6h' ? '11:40 - 17:40' : '');
    setFormContractSchedule(sched);
    const calc = calculateDailyHoursFromSchedule(sched);

    if (user.contractDailyHoursFormatted) {
      setFormContractDailyHoursFormatted(user.contractDailyHoursFormatted);
      setFormContractDailyMinutes(user.contractDailyMinutes || parseHoursAndMinutesStringToMinutes(user.contractDailyHoursFormatted));
      setFormContractDailyHours(user.contractDailyHours !== undefined ? user.contractDailyHours : calc.dailyHours);
    } else if (user.contractDailyMinutes !== undefined && user.contractDailyMinutes > 0) {
      setFormContractDailyMinutes(user.contractDailyMinutes);
      setFormContractDailyHoursFormatted(formatMinutesToHoursAndMinutes(user.contractDailyMinutes));
      setFormContractDailyHours(user.contractDailyHours !== undefined ? user.contractDailyHours : Number((user.contractDailyMinutes / 60).toFixed(2)));
    } else if (user.contractDailyHours !== undefined) {
      const minutes = Math.round(Number(user.contractDailyHours) * 60);
      setFormContractDailyHours(user.contractDailyHours);
      setFormContractDailyMinutes(minutes);
      setFormContractDailyHoursFormatted(formatMinutesToHoursAndMinutes(minutes));
    } else if (sched && calc.workedMinutes > 0) {
      setFormContractDailyHours(calc.dailyHours);
      setFormContractDailyHoursFormatted(calc.dailyHoursFormatted);
      setFormContractDailyMinutes(calc.workedMinutes);
    } else {
      setFormContractDailyHours(6);
      setFormContractDailyHoursFormatted('6h00min');
      setFormContractDailyMinutes(360);
    }

    setFormBaseSalary(user.baseSalary !== undefined && user.baseSalary !== null ? user.baseSalary : 1200);
    setFormCompany(user.company || 'GADAL - Gestão e Apoio');
  };

  const handleOpenNewUserModal = () => {
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormBirthDate('1995-05-20');
    setFormRole('professor');
    setFormStatus('ATIVO');
    setFormDataDesligamento('');
    setFormMotivoDesligamento('');
    setFormPin('1234');
    setFormActivities(activitiesList.slice(0, 3).map((a) => a.id));
    setFormTurmas(availableTurmas);
    setFormCanManageStudents(true);
    setFormCanMarkAttendance(true);
    setFormPixKey('');
    setFormWorkShiftType('continua_6h');
    setFormContractSchedule('11:40 - 17:40');
    setFormContractDailyHours(6);
    setFormContractDailyHoursFormatted('6h00min');
    setFormContractDailyMinutes(360);
    setFormBaseSalary(1200);
    setFormCompany('GADAL - Gestão e Apoio');
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

  const handleSaveFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanName = formName.trim();
    if (!cleanName) {
      showToast('Por favor, informe o Nome Completo do usuário.', 'error');
      return;
    }

    const effectiveBirthDate = formBirthDate || (editingUser?.birthDate) || '1995-01-01';
    const rawEmail = formEmail.trim().toLowerCase();
    const fallbackEmail = `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'usuario'}${Date.now().toString().slice(-4)}@crescer.local`;
    const normalizedEmail = rawEmail || (editingUser?.email) || fallbackEmail;

    if (!rawEmail && !editingUser?.email) {
      showToast('Por favor, informe o E-mail de acesso do usuário.', 'error');
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

    const formattedPass = formatBirthDateToDisplay(effectiveBirthDate);

    const isMasterAdmin =
      normalizedEmail === 'jfernandoveiga1967@gmail.com' ||
      (editingUser && editingUser.id === 'usr_coord_1') ||
      (editingUser && editingUser.email && editingUser.email.toLowerCase() === 'jfernandoveiga1967@gmail.com') ||
      (editingUser && editingUser.name && editingUser.name.toLowerCase().includes('fernando veiga'));

    const effectiveRole: UserRole = isMasterAdmin ? 'coordenador' : formRole;

    const existingUserWithEmail = (users || []).find(
      (u) => u && (u.email || '').trim().toLowerCase() === normalizedEmail && (!editingUser || u.id !== editingUser.id)
    );

    const targetId = isMasterAdmin
      ? 'usr_coord_1'
      : (editingUser ? editingUser.id : (existingUserWithEmail ? existingUserWithEmail.id : 'usr_' + Date.now()));

    const effectiveActivities = (formActivities && formActivities.length > 0)
      ? formActivities
      : (isMasterAdmin ? ['Rotina', 'Natação', 'Balé', 'Dança', 'Judô', 'Futebol', 'Ginástica', 'Flauta'] : []);

    const parsedSalary = formBaseSalary !== '' && !isNaN(Number(formBaseSalary)) ? Math.max(0, Number(formBaseSalary)) : (isMasterAdmin ? 5000 : 1200);
    
    // Resolve precise minutes and formatted daily hours string (Model: 8h40min)
    let resolvedMinutes = formContractDailyMinutes > 0 ? formContractDailyMinutes : (isMasterAdmin ? 480 : 360);
    if (formContractDailyHoursFormatted && formContractDailyHoursFormatted.trim()) {
      resolvedMinutes = parseHoursAndMinutesStringToMinutes(formContractDailyHoursFormatted);
    } else if (formContractDailyHours !== '' && !isNaN(Number(formContractDailyHours))) {
      resolvedMinutes = parseHoursAndMinutesStringToMinutes(Number(formContractDailyHours));
    }
    const formattedHoursStr = formatMinutesToHoursAndMinutes(resolvedMinutes);
    const decimalHours = Number((resolvedMinutes / 60).toFixed(2));

    const effectiveStatus: UserStatus = isMasterAdmin ? 'ATIVO' : formStatus;
    const effectiveDataDesligamento =
      !isMasterAdmin && (effectiveStatus === 'DESLIGADO' || effectiveStatus === 'INATIVO') && formDataDesligamento.trim()
        ? formDataDesligamento.trim()
        : undefined;
    const effectiveMotivoDesligamento =
      !isMasterAdmin && (effectiveStatus === 'DESLIGADO' || effectiveStatus === 'INATIVO') && formMotivoDesligamento.trim()
        ? formMotivoDesligamento.trim()
        : undefined;

    const updatedUser: UserProfile = {
      id: targetId,
      name: isMasterAdmin ? (cleanName || 'Fernando Veiga') : cleanName,
      email: isMasterAdmin ? 'jfernandoveiga1967@gmail.com' : normalizedEmail,
      phone: formPhone.trim() || undefined,
      role: effectiveRole,
      status: effectiveStatus,
      dataDesligamento: effectiveDataDesligamento,
      motivoDesligamento: effectiveMotivoDesligamento,
      cargoLabel: roleLabels[effectiveRole],
      avatarColor: roleColors[effectiveRole],
      birthDate: effectiveBirthDate,
      pin: formattedPass || effectiveBirthDate,
      assignedActivities: effectiveActivities,
      assignedTurmas: formTurmas,
      allowedClassIds: formTurmas,
      canManageStudents: isMasterAdmin ? true : formCanManageStudents,
      canMarkAttendance: isMasterAdmin ? true : formCanMarkAttendance,
      pixKey: formPixKey.trim() || formPhone.trim() || undefined,
      contractSchedule: formContractSchedule.trim() || (isMasterAdmin ? '07:30 - 17:30' : undefined),
      contractDailyHours: decimalHours,
      contractDailyMinutes: resolvedMinutes,
      contractDailyHoursFormatted: formattedHoursStr,
      baseSalary: parsedSalary,
      company: formCompany.trim() || 'GADAL - Gestão e Apoio',
      workShiftType: formWorkShiftType,
      updatedAt: new Date().toISOString(),
    };

    try {
      setIsSavingUser(true);
      await Promise.resolve(onSaveUser(updatedUser));
      setEditingUser(null);
      setIsNewUserModalOpen(false);
      showToast(`Perfil de ${updatedUser.name} salvo com sucesso!`, 'success');
    } catch (err: any) {
      console.error('Erro ao salvar usuário:', err);
      showToast(`Erro ao gravar usuário no Firestore: ${err?.message || 'Falha de comunicação'}`, 'error');
    } finally {
      setIsSavingUser(false);
    }
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

  const handleQuickStatusChange = (user: UserProfile, newStatus: UserStatus) => {
    if (user.status === newStatus) return;
    if (user.email.toLowerCase() === 'jfernandoveiga1967@gmail.com' || user.id === 'usr_coord_1') {
      showToast('O status do Coordenador Geral não pode ser alterado.', 'error');
      return;
    }

    const updated: UserProfile = {
      ...user,
      status: newStatus,
      dataDesligamento: newStatus === 'DESLIGADO' ? (user.dataDesligamento || new Date().toISOString().split('T')[0]) : undefined,
      motivoDesligamento: newStatus === 'DESLIGADO' ? (user.motivoDesligamento || 'Desligamento') : undefined,
      updatedAt: new Date().toISOString(),
    };

    onSaveUser(updated);
    showToast(`Status de ${user.name} alterado para ${newStatus}!`);
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
    setActCustomIconUrl('');
    setIconUploadError('');
    setIconSourceTab('upload');
    setIsManualIconChosen(false);
    setIconSearchTerm('');
    setActDescription('');
    setActDefaultEquipment('');
    setActRequiresRollCall(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsNewActivityModalOpen(true);
  };

  const handleOpenEditActivityModal = (activity: ActivityItem) => {
    setEditingActivity(activity);
    setActName(activity.name);
    setActIcon(activity.icon || detectIconFromActivityName(activity.name) || 'Sparkles');
    setActCustomIconUrl(activity.customIconUrl || '');
    setIconUploadError('');
    setIconSourceTab(activity.customIconUrl ? 'upload' : 'preset');
    setIsManualIconChosen(true);
    setIconSearchTerm('');
    setActDescription(activity.description || '');
    setActDefaultEquipment(activity.defaultEquipment || '');
    setActRequiresRollCall(activity.requiresRollCall !== undefined ? activity.requiresRollCall : true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsNewActivityModalOpen(true);
  };

  const handleIconFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIconUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const validExtensions = /\.(png|svg|jpe?g|webp|gif)$/i;
    const isImage = file.type.startsWith('image/') || validExtensions.test(file.name);
    if (!isImage) {
      setIconUploadError('Por favor, selecione uma imagem válida (PNG, SVG ou JPG).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setIconUploadError('O arquivo selecionado é muito grande. O limite é 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      if (!rawDataUrl) return;

      // If SVG, save vector format directly
      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        setActCustomIconUrl(rawDataUrl);
        setIconSourceTab('upload');
        showToast('Ícone vetorial SVG adicionado com sucesso!');
        return;
      }

      // For raster images (PNG, JPG, WebP), scale to max 256x256 using Canvas
      const img = new Image();
      img.onload = () => {
        const maxDim = 256;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const format = file.type.includes('png') ? 'image/png' : 'image/jpeg';
          const optimized = canvas.toDataURL(format, 0.9);
          setActCustomIconUrl(optimized);
        } else {
          setActCustomIconUrl(rawDataUrl);
        }
        setIconSourceTab('upload');
        showToast('Ícone/imagem personalizada processada com sucesso!');
      };
      img.onerror = () => {
        setIconUploadError('Não foi possível ler a imagem selecionada.');
      };
      img.src = rawDataUrl;
    };
    reader.onerror = () => {
      setIconUploadError('Erro ao ler arquivo.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveCustomIcon = () => {
    setActCustomIconUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    showToast('Ícone personalizado removido. O sistema usará o ícone padrão.');
  };

  const handleActNameChange = (val: string) => {
    setActName(val);
    if (!isManualIconChosen) {
      const autoIcon = detectIconFromActivityName(val);
      setActIcon(autoIcon);
    }
  };

  const handleResetToAutoIcon = () => {
    setIsManualIconChosen(false);
    const autoIcon = detectIconFromActivityName(actName);
    setActIcon(autoIcon);
    showToast(`Ícone representativo definido automaticamente (${autoIcon}).`);
  };

  const handleSaveActivitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = actName.trim();
    if (!cleanName) {
      showToast('Digite o nome da atividade extracurricular.', 'error');
      return;
    }

    const finalIcon = actIcon || detectIconFromActivityName(cleanName) || 'Sparkles';

    const activityObj: ActivityItem = {
      id: editingActivity ? editingActivity.id : cleanName,
      name: cleanName,
      icon: finalIcon,
      customIconUrl: actCustomIconUrl ? actCustomIconUrl : undefined,
      description: actDescription.trim() || `Modalidade de ${cleanName} no Programa Integral`,
      defaultEquipment: actDefaultEquipment.trim() || 'Material necessário para a aula',
      requiresRollCall: actRequiresRollCall,
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
        <div className="flex flex-wrap sm:flex-nowrap bg-slate-950 p-1.5 rounded-2xl border border-slate-800 mt-6 max-w-4xl gap-1">
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

          <button
            onClick={() => setActiveSubTab('schedules')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
              activeSubTab === 'schedules'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>Grade Horária ({schedules.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('holidays')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
              activeSubTab === 'holidays'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <CalendarOff className="w-4 h-4" />
            <span>Feriados e Recessos ({holidays.length})</span>
          </button>
        </div>
      </div>

      {/* ================= SECTION 1: USERS & PERMISSIONS ================= */}
      {activeSubTab === 'users' && (
        <div className="space-y-6">
          {/* Filters, Search & Expand/Collapse Controls */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nome, e-mail ou empresa..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {/* Status Filter */}
                <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
                  {(['ATIVOS', 'INATIVOS', 'TODOS'] as const).map((s) => {
                    const statusLabels: Record<string, string> = {
                      ATIVOS: 'Ativos',
                      INATIVOS: 'Inativos / Desligados',
                      TODOS: 'Todos',
                    };
                    const isSel = statusFilter === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                          isSel
                            ? s === 'ATIVOS'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : s === 'INATIVOS'
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-slate-900 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {statusLabels[s]}
                      </button>
                    );
                  })}
                </div>

                {/* Role Filter */}
                <div className="flex items-center space-x-1 overflow-x-auto pb-1 sm:pb-0">
                  {(['TODOS', 'coordenador', 'professor'] as const).map((r) => {
                    const labels: Record<string, string> = {
                      TODOS: 'Todos os Cargos',
                      coordenador: 'Coordenação',
                      professor: 'Monitoras / Prof.',
                    };

                    const isSel = roleFilter === r;
                    return (
                      <button
                        key={r}
                        onClick={() => setRoleFilter(r)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
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
            </div>

            {/* Quick Accordion Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center space-x-2 text-slate-500 font-medium">
                <span>Total: <strong className="text-slate-800 font-bold">{filteredUsers.length}</strong> usuário(s)</span>
                {expandedUserIds.length > 0 && (
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold text-[11px] border border-indigo-200">
                    {expandedUserIds.length} expandido(s)
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={expandAllUsers}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-slate-700 font-bold text-xs border border-slate-200 transition-all cursor-pointer flex items-center space-x-1.5"
                  title="Expandir todos os cartões de usuário"
                >
                  <ChevronsDown className="w-3.5 h-3.5" />
                  <span>Expandir Todos</span>
                </button>

                <button
                  type="button"
                  onClick={collapseAllUsers}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition-all cursor-pointer flex items-center space-x-1.5"
                  title="Recolher todos os cartões de usuário"
                >
                  <ChevronsUp className="w-3.5 h-3.5" />
                  <span>Recolher Todos</span>
                </button>
              </div>
            </div>
          </div>

          {/* Users List Cards - Accordion Layout */}
          <div className="flex flex-col space-y-4 w-full">
            {filteredUsers.length === 0 ? (
              <div className="w-full bg-white border border-slate-200 rounded-3xl p-8 text-center text-slate-500">
                Nenhum usuário encontrado para os critérios selecionados.
              </div>
            ) : (
              filteredUsers.map((user) => {
                const roleStyle = getRoleBadgeStyle(user.role);
                const userActivities = user.assignedActivities || activitiesList.map((a) => a.id);
                const userTurmas = Array.isArray(user.allowedClassIds)
                  ? user.allowedClassIds
                  : (Array.isArray(user.assignedTurmas) ? user.assignedTurmas : availableTurmas);
                const isMasterCoord =
                  user.role === 'coordenador' ||
                  (user.email && user.email.toLowerCase() === 'jfernandoveiga1967@gmail.com') ||
                  user.id === 'usr_coord_1';
                const isExpanded = expandedUserIds.includes(user.id);

                return (
                  <div
                    key={user.id}
                    className={`bg-white border rounded-3xl transition-all w-full overflow-hidden shadow-sm hover:shadow-md ${
                      isExpanded ? 'border-indigo-300 ring-2 ring-indigo-500/10' : 'border-slate-200'
                    }`}
                  >
                    {/* Header (Visível sempre) - Clickable to expand/collapse */}
                    <div
                      onClick={() => toggleUserExpand(user.id)}
                      className={`p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer transition-colors ${
                        isExpanded ? 'bg-slate-50/70 border-b border-slate-100' : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-start sm:items-center space-x-3.5 min-w-0 flex-1">
                        <div
                          className={`w-12 h-12 rounded-2xl ${
                            user.avatarColor || (isMasterCoord ? 'bg-amber-500' : 'bg-indigo-600')
                          } flex items-center justify-center text-white font-extrabold text-lg shrink-0 shadow-md`}
                        >
                          {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                        </div>

                        <div className="min-w-0 space-y-1 flex-1">
                          <div className="flex items-center flex-wrap gap-2">
                            <h3 className="text-base font-extrabold text-slate-900 truncate">{user.name}</h3>
                            {currentUser?.id === user.id && (
                              <span className="text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md border border-amber-300">
                                Você (Admin)
                              </span>
                            )}
                            <span
                              className={`text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-lg border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border} inline-flex items-center space-x-1`}
                            >
                              {user.role === 'coordenador' ? (
                                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                              ) : (
                                <GraduationCap className="w-3.5 h-3.5 mr-1" />
                              )}
                              <span>{roleStyle.label}</span>
                            </span>

                            {/* Status Badge */}
                            {(() => {
                              const badge = getUserStatusBadge(user);
                              return (
                                <span
                                  className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg border ${badge.bg} ${badge.text} ${badge.border} inline-flex items-center space-x-1`}
                                >
                                  {badge.label}
                                </span>
                              );
                            })()}
                          </div>

                          <div className="flex items-center flex-wrap gap-y-1.5 gap-x-4 text-xs text-slate-500">
                            <span className="flex items-center text-slate-600 font-medium">
                              <Mail className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
                              <span className="truncate">{user.email}</span>
                            </span>

                            {user.phone && (
                              <span className="flex items-center text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-[11px]">
                                <Phone className="w-3 h-3 text-emerald-600 mr-1 shrink-0" />
                                <span>{formatPhoneDisplay(user.phone)}</span>
                              </span>
                            )}

                            {/* Compact Badges shown in header */}
                            <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                              <BookOpen className="w-3 h-3 text-blue-600" />
                              <span>{isMasterCoord ? 'Todas as Turmas' : `${userTurmas.length} turmas`}</span>
                            </span>

                            <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                              <Sparkles className="w-3 h-3 text-indigo-600" />
                              <span>{userActivities.length} modalidades</span>
                            </span>

                            {isContinuousShift(user, user.contractSchedule) ? (
                              <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>Contínua (6h)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                                <Clock className="w-3 h-3 text-slate-500" />
                                <span>Padrão ({user.contractDailyHoursFormatted || '8h+'})</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Header Action Buttons & Expand Toggle */}
                      <div className="flex items-center space-x-2 shrink-0 self-end md:self-center" onClick={(e) => e.stopPropagation()}>
                        {user.phone && (
                          <a
                            href={generateWhatsAppUrl(user.phone, `Olá, ${user.name}! Tudo bem?\nAqui é a Coordenação do Programa Integral do Colégio Crescer.`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-all cursor-pointer flex items-center space-x-1 text-xs font-bold shadow-2xs"
                            title="Conversar no WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="hidden sm:inline">WhatsApp</span>
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(user)}
                          className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs"
                          title="Editar cadastro deste usuário"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>

                        {!isMasterCoord && currentUser?.id !== user.id && (
                          <button
                            type="button"
                            onClick={() => setUserToDelete(user)}
                            className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-all cursor-pointer"
                            title="Remover usuário"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleUserExpand(user.id)}
                          className={`px-3 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center space-x-1.5 ${
                            isExpanded
                              ? 'bg-slate-900 text-white shadow-xs hover:bg-slate-800'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20'
                          }`}
                          title={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes e permissões'}
                        >
                          <span>{isExpanded ? 'Recolher' : 'Ver Detalhes'}</span>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Accordion Expanded Body */}
                    {isExpanded && (
                      <div className="p-5 sm:p-6 space-y-4 bg-white animate-fade-in border-t border-slate-100">
                        {/* Inactivity / Dismissal Notice */}
                        {isUserInactiveOrDismissed(user) && (
                          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-rose-950">
                            <div className="flex items-center space-x-2.5">
                              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                              <div>
                                <p className="font-extrabold text-rose-900">
                                  Colaborador(a) {user.status === 'DESLIGADO' ? 'DESLIGADO(A) / CONTRATO ENCERRADO' : 'INATIVO(A) / SUSPENSO(A)'}
                                </p>
                                <p className="text-rose-700 text-[11px] mt-0.5">
                                  {user.dataDesligamento ? `Data do Desligamento: ${formatDateBR(user.dataDesligamento)}` : 'Data de desligamento não informada'}
                                  {user.motivoDesligamento ? ` • Motivo: ${user.motivoDesligamento}` : ''}
                                </p>
                              </div>
                            </div>
                            <span className="text-[10px] font-extrabold bg-white text-rose-800 px-2.5 py-1 rounded-lg border border-rose-300 shrink-0">
                              Ocultado da Lista Diária Ativa
                            </span>
                          </div>
                        )}

                        {/* Quick User Details Bar: Password / BirthDate & Direct Edit */}
                        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                          <div className="flex items-center space-x-2 text-amber-900">
                            <KeyRound className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>
                              Senha de Acesso (Data de Nascimento):{' '}
                              <strong className="font-mono text-slate-900 bg-white px-2 py-0.5 rounded border border-amber-300 text-xs">
                                {formatBirthDateToDisplay(user.birthDate) || user.pin || 'Não cadastrada'}
                              </strong>
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(user)}
                            className="text-amber-800 hover:text-amber-950 font-bold underline cursor-pointer shrink-0"
                          >
                            Alterar dados ou senha completa
                          </button>
                        </div>

                        {/* Contract & Livro Ponto Summary Bar */}
                        <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs text-indigo-950">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center space-x-1.5 font-bold">
                              <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                              <span>Empresa: <strong className="text-slate-900">{user.company || 'GADAL - Gestão e Apoio'}</strong></span>
                            </div>
                            <span className="text-indigo-300 hidden sm:inline">•</span>
                            <div className="flex items-center space-x-1.5 font-bold">
                              <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                              <span>
                                Horário: <strong className="text-slate-900">{user.contractSchedule || 'Conforme escala'}</strong> ({user.contractDailyHoursFormatted || (user.contractDailyHours ? `${user.contractDailyHours}h` : '6h 00min')}/dia)
                              </span>
                            </div>
                            <span className="text-indigo-300 hidden sm:inline">•</span>
                            <div className="flex items-center space-x-1.5 font-bold">
                              <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>Bolsa: <strong className="text-emerald-800">R$ {Number(user.baseSalary !== undefined ? user.baseSalary : 1200).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                            </div>
                          </div>
                          {user.pixKey && (
                            <div className="text-[11px] font-mono text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-indigo-200">
                              PIX: <strong className="text-slate-900">{user.pixKey}</strong>
                            </div>
                          )}
                        </div>

                        {/* Quick Status Control Bar */}
                        {!isMasterCoord && (
                          <div className="bg-slate-100/90 border border-slate-200 rounded-2xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs">
                            <div className="flex items-center space-x-2 text-slate-700 font-bold">
                              <UserCheck className="w-4 h-4 text-slate-600 shrink-0" />
                              <span>Status do Colaborador:</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {(
                                [
                                  { id: 'ATIVO', label: 'Ativo', bgActive: 'bg-emerald-600 text-white border-emerald-700 shadow-xs' },
                                  { id: 'INATIVO', label: 'Inativo / Suspenso', bgActive: 'bg-rose-600 text-white border-rose-700 shadow-xs' },
                                  { id: 'DESLIGADO', label: 'Desligado', bgActive: 'bg-slate-800 text-white border-slate-900 shadow-xs' },
                                  { id: 'FERIAS', label: 'Férias', bgActive: 'bg-sky-600 text-white border-sky-700 shadow-xs' },
                                  { id: 'LICENCA', label: 'Licença', bgActive: 'bg-amber-600 text-white border-amber-700 shadow-xs' },
                                ] as const
                              ).map((st) => {
                                const isCurrent = (user.status || 'ATIVO') === st.id;
                                return (
                                  <button
                                    key={st.id}
                                    type="button"
                                    onClick={() => handleQuickStatusChange(user, st.id as UserStatus)}
                                    className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                      isCurrent
                                        ? st.bgActive
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                                  >
                                    {isCurrent && <span className="mr-1">●</span>}
                                    {st.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Permissões, Turmas e Modalidades */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3.5 text-xs">
                          {/* Permissões Rápidas: 3 cols on xl */}
                          <div className="xl:col-span-3 bg-slate-50/90 border border-slate-200/80 rounded-2xl p-3.5 flex flex-col justify-between space-y-2.5">
                            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/70">
                              <span className="font-extrabold text-slate-800 flex items-center space-x-1.5">
                                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                                <span>Permissões de Ação</span>
                              </span>
                              <span className="text-[10px] text-indigo-700 font-bold bg-indigo-100/60 px-2 py-0.5 rounded-full border border-indigo-200">
                                Acesso Direto
                              </span>
                            </div>

                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={() => handleToggleCanManageStudents(user)}
                                className={`w-full p-2.5 rounded-xl border transition-all text-left flex items-center justify-between cursor-pointer ${
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

                              <button
                                type="button"
                                onClick={() => handleToggleCanMarkAttendance(user)}
                                className={`w-full p-2.5 rounded-xl border transition-all text-left flex items-center justify-between cursor-pointer ${
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
                          </div>

                          {/* Turmas Liberadas: 4 cols on xl */}
                          <div className="xl:col-span-4 bg-slate-50/90 border border-slate-200/80 rounded-2xl p-3.5 flex flex-col justify-between space-y-2">
                            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/70 text-[11px] font-extrabold text-slate-800">
                              <span className="flex items-center space-x-1.5 truncate">
                                <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
                                <span className="truncate">Turmas ({isMasterCoord ? 'Todas (Admin)' : `${userTurmas.length} de ${availableTurmas.length}`})</span>
                              </span>
                              {!isMasterCoord && (
                                <div className="flex items-center space-x-2 text-[10px] shrink-0">
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
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto py-1">
                              {availableTurmas.map((t) => {
                                const isAssigned = isMasterCoord || userTurmas.includes(t);
                                return (
                                  <button
                                    key={t}
                                    type="button"
                                    disabled={isMasterCoord}
                                    onClick={() => handleToggleUserTurma(user, t)}
                                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer flex items-center space-x-1 ${
                                      isAssigned
                                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600 opacity-60'
                                    } ${isMasterCoord ? 'cursor-default' : ''}`}
                                    title={isAssigned ? `Clique para revogar ${t}` : `Clique para liberar ${t}`}
                                  >
                                    <span>{isAssigned ? '✓' : '+'}</span>
                                    <span>{t}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Modalidades Liberadas: 5 cols on xl */}
                          <div className="md:col-span-2 xl:col-span-5 bg-slate-50/90 border border-slate-200/80 rounded-2xl p-3.5 flex flex-col justify-between space-y-2">
                            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/70 text-[11px] font-extrabold text-slate-800">
                              <span className="flex items-center space-x-1.5 truncate">
                                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                                <span className="truncate">Modalidades Liberadas ({userActivities.length})</span>
                              </span>
                              <div className="flex items-center space-x-2 text-[10px] shrink-0">
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

                            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto py-1">
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
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ================= SECTION 2: EXTRACURRICULAR ACTIVITIES LAYER (ACCORDION / COLAPSÁVEL) ================= */}
      {activeSubTab === 'activities' && (
        <div className="space-y-6">
          {/* Top Control Bar with Search, Filters & Accordion Actions */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Camada de Gestão de Modalidades</h3>
                <p className="text-xs text-slate-500">
                  Gerencie atividades extracurriculares, especificações de materiais e professores vinculados.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenNewActivityModal}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer flex items-center justify-center space-x-1.5 shrink-0 self-start md:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Atividade</span>
              </button>
            </div>

            {/* Search and Category Filters */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={activitySearchTerm}
                  onChange={(e) => setActivitySearchTerm(e.target.value)}
                  placeholder="Buscar modalidade, descrição ou material..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Filter Chips */}
              <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                {(
                  [
                    { id: 'TODAS', label: 'Todas as Modalidades' },
                    { id: 'CHAMADA', label: 'Exige Chamada' },
                    { id: 'ROTINA', label: 'Apenas Grade' },
                    { id: 'PERSONALIZADA', label: 'Personalizadas' },
                  ] as const
                ).map((f) => {
                  const isSel = activityTypeFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setActivityTypeFilter(f.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                        isSel
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Accordion Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center space-x-2 text-slate-500 font-medium">
                <span>
                  Total: <strong className="text-slate-800 font-bold">{filteredActivities.length}</strong> modalidade(s)
                </span>
                {expandedActivityIds.length > 0 && (
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold text-[11px] border border-indigo-200">
                    {expandedActivityIds.length} expandida(s)
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={expandAllActivities}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-slate-700 font-bold text-xs border border-slate-200 transition-all cursor-pointer flex items-center space-x-1.5"
                  title="Expandir todas as modalidades"
                >
                  <ChevronsDown className="w-3.5 h-3.5" />
                  <span>Expandir Todas</span>
                </button>

                <button
                  type="button"
                  onClick={collapseAllActivities}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition-all cursor-pointer flex items-center space-x-1.5"
                  title="Recolher todas as modalidades"
                >
                  <ChevronsUp className="w-3.5 h-3.5" />
                  <span>Recolher Todas</span>
                </button>
              </div>
            </div>
          </div>

          {/* Activities List - Accordion Cards */}
          <div className="flex flex-col space-y-4 w-full">
            {filteredActivities.length === 0 ? (
              <div className="w-full bg-white border border-slate-200 rounded-3xl p-8 text-center text-slate-500">
                Nenhuma modalidade encontrada para os critérios selecionados.
              </div>
            ) : (
              filteredActivities.map((act) => {
                const assignedProfs = users.filter((u) => u.assignedActivities?.includes(act.id));
                const isExpanded = expandedActivityIds.includes(act.id);
                const requiresRoll = act.requiresRollCall !== false;

                return (
                  <div
                    key={act.id}
                    className={`bg-white border rounded-3xl transition-all w-full overflow-hidden shadow-sm hover:shadow-md ${
                      isExpanded ? 'border-indigo-300 ring-2 ring-indigo-500/10' : 'border-slate-200'
                    }`}
                  >
                    {/* Header (Always visible) - Clickable for Accordion Toggle */}
                    <div
                      onClick={() => toggleActivityExpand(act.id)}
                      className={`p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer transition-colors select-none ${
                        isExpanded ? 'bg-slate-50/70 border-b border-slate-100' : 'hover:bg-slate-50/50'
                      }`}
                      title={isExpanded ? `Clique para recolher ${act.name || act.id}` : `Clique para expandir ${act.name || act.id}`}
                    >
                      {/* Left: Badge, Title, Category Pill, and Summary Tags */}
                      <div className="flex items-start sm:items-center space-x-3.5 min-w-0 flex-1">
                        <div className="shrink-0">
                          <ActivityBadge
                            activity={act.id}
                            iconName={act.icon}
                            customIconUrl={act.customIconUrl}
                            customEquipment={act.defaultEquipment}
                            size="lg"
                          />
                        </div>

                        <div className="min-w-0 space-y-1 flex-1">
                          <div className="flex items-center flex-wrap gap-2">
                            <h3 className="text-base font-extrabold text-slate-900 truncate">
                              {act.name || act.id}
                            </h3>

                            {requiresRoll ? (
                              <span className="inline-flex items-center space-x-1 text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-300">
                                <Check className="w-3 h-3 text-emerald-700 shrink-0" />
                                <span>Exige Chamada</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-300">
                                <Clock className="w-3 h-3 text-amber-700 shrink-0" />
                                <span>Grade / Rotina</span>
                              </span>
                            )}

                            {act.isCustom && (
                              <span className="text-[10px] font-extrabold uppercase bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
                                Personalizada
                              </span>
                            )}
                          </div>

                          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span className="flex items-center space-x-1">
                              <span className="font-semibold text-slate-700">Material Padrão:</span>
                              <span className="truncate max-w-[200px] sm:max-w-xs text-slate-600">
                                {act.defaultEquipment || 'Nenhum material cadastrado'}
                              </span>
                            </span>

                            <span className="flex items-center space-x-1">
                              <span className="font-semibold text-slate-700">Professores:</span>
                              <span className="font-bold text-indigo-600">
                                {assignedProfs.length} vinculado(s)
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions (Edit, Delete, Accordion Toggle) */}
                      <div
                        className="flex items-center space-x-2 shrink-0 self-end md:self-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditActivityModal(act)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs transition-all cursor-pointer flex items-center space-x-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => setActivityToDelete(act)}
                          className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-all cursor-pointer"
                          title="Excluir modalidade"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Accordion Toggle Arrow */}
                        <button
                          type="button"
                          onClick={() => toggleActivityExpand(act.id)}
                          className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                            isExpanded
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                              : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 shadow-2xs'
                          }`}
                          title={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Body (Expanded View) */}
                    {isExpanded && (
                      <div className="p-5 sm:p-6 space-y-5 bg-white border-t border-slate-100 animate-fadeIn">
                        {/* Bento Grid: Details & Material */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Description & Objective */}
                          <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-4 space-y-2">
                            <div className="flex items-center space-x-1.5 pb-2 border-b border-slate-200/70 text-xs font-extrabold text-slate-800">
                              <Info className="w-4 h-4 text-indigo-600 shrink-0" />
                              <span>Descrição & Finalidade Pedagógica</span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed font-medium">
                              {act.description || 'Atividade extracurricular integrada à rotina do Programa Integral.'}
                            </p>
                            <div className="pt-2 text-[11px] text-slate-500">
                              <span className="font-bold text-slate-700">Tipo de Controle: </span>
                              {requiresRoll ? (
                                <span className="text-emerald-700 font-bold">
                                  Lançamento no Diário de Classe com registro de frequência por aluno.
                                </span>
                              ) : (
                                <span className="text-amber-700 font-bold">
                                  Grade horária e rotina geral (não exige lista de chamada individual).
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Equipment & Kit Required */}
                          <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-4 space-y-2">
                            <div className="flex items-center space-x-1.5 pb-2 border-b border-slate-200/70 text-xs font-extrabold text-slate-800">
                              <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
                              <span>Equipamentos e Materiais Padrão</span>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-700 font-semibold shadow-2xs">
                              {act.defaultEquipment || 'Sem equipamento específico cadastrado.'}
                            </div>
                            <p className="text-[11px] text-slate-500">
                              💡 Este material é sugerido automaticamente ao cadastrar novos horários desta modalidade na Grade Horária.
                            </p>
                          </div>
                        </div>

                        {/* Associated Teachers & Monitors */}
                        <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-200/70 text-xs font-extrabold text-slate-800">
                            <span className="flex items-center space-x-1.5">
                              <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                              <span>
                                Professores e Monitores Vinculados ({assignedProfs.length})
                              </span>
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold">
                              Gerenciado na aba Usuários
                            </span>
                          </div>

                          {assignedProfs.length === 0 ? (
                            <div className="bg-white border border-dashed border-slate-200 rounded-xl p-4 text-center">
                              <p className="text-xs text-slate-500 font-medium">
                                Nenhum professor ou monitor vinculado a esta modalidade no momento.
                              </p>
                              <p className="text-[11px] text-indigo-600 font-bold mt-1">
                                Acesse a aba &quot;Usuários e Permissões&quot; para vincular professores a esta atividade.
                              </p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                              {assignedProfs.map((prof) => (
                                <div
                                  key={prof.id}
                                  className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center space-x-2.5 shadow-2xs"
                                >
                                  <div
                                    className={`w-8 h-8 rounded-lg ${
                                      prof.avatarColor || 'bg-indigo-600'
                                    } text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs`}
                                  >
                                    {prof.name ? prof.name.charAt(0).toUpperCase() : 'P'}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h4 className="text-xs font-bold text-slate-900 truncate">
                                      {prof.name}
                                    </h4>
                                    <span className="text-[10px] text-slate-500 truncate block">
                                      {prof.email}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ================= SECTION 3: GRADE HORÁRIA / SCHEDULES ================= */}
      {activeSubTab === 'schedules' && (
        <ScheduleManager
          turmas={availableTurmas}
          activitiesList={activitiesList}
          schedules={schedules}
          users={users}
          currentUser={currentUser}
          onSaveScheduleBlock={onSaveScheduleBlock || (() => {})}
          onDeleteScheduleBlock={onDeleteScheduleBlock || (() => {})}
          onBatchSaveSchedules={onBatchSaveSchedules}
          onUpdateUserPhone={(userId, newPhone) => {
            const target = users.find((u) => u.id === userId);
            if (target) {
              onSaveUser({
                ...target,
                phone: newPhone.trim() || undefined,
                updatedAt: new Date().toISOString(),
              });
            }
          }}
        />
      )}

      {/* ================= SECTION 4: FERIADOS E RECESSOS ESCOLARES ================= */}
      {activeSubTab === 'holidays' && (
        <HolidayManager
          holidays={holidays}
          onSaveHoliday={onSaveHoliday || (() => {})}
          onDeleteHoliday={onDeleteHoliday || (() => {})}
          onBatchSaveHolidays={onBatchSaveHolidays}
        />
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
                {editingUser && (editingUser.role === 'coordenador' || editingUser.email.toLowerCase() === 'jfernandoveiga1967@gmail.com' || editingUser.id === 'usr_coord_1') ? (
                  <div className="w-full px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 font-bold text-xs flex items-center justify-between shadow-xs">
                    <span className="flex items-center space-x-1.5">
                      <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Coordenador (Administrador - Acesso Total)</span>
                    </span>
                    <span className="text-[10px] uppercase font-extrabold bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
                      Perfil Principal Protegido
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <select
                      value="professor"
                      disabled
                      className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-800 font-bold focus:outline-none cursor-not-allowed text-xs"
                    >
                      <option value="professor">Monitor / Professor (Diário de Classe + Alunos)</option>
                    </select>
                    <p className="text-[11px] text-slate-500 font-medium">
                      🔒 O cadastro e a edição de membros da equipe são exclusivos para o perfil de <strong>Monitor / Professor</strong>.
                    </p>
                  </div>
                )}
              </div>

              {/* Status do Colaborador (Situação Funcional & Livro Ponto) */}
              {(!editingUser || (editingUser.role !== 'coordenador' && editingUser.email.toLowerCase() !== 'jfernandoveiga1967@gmail.com' && editingUser.id !== 'usr_coord_1')) && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>Situação Funcional / Status no Livro Ponto:</span>
                    </label>
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                        formStatus === 'ATIVO'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : formStatus === 'DESLIGADO'
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : 'bg-slate-200 text-slate-700 border-slate-300'
                      }`}
                    >
                      {formStatus === 'ATIVO' ? 'Ativo (Na Escala Diária)' : formStatus === 'DESLIGADO' ? 'Desligado (Histórico Preservado)' : 'Inativo (Suspenso)'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFormStatus('ATIVO');
                        setFormDataDesligamento('');
                        setFormMotivoDesligamento('');
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                        formStatus === 'ATIVO'
                          ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>ATIVO</span>
                        </span>
                        {formStatus === 'ATIVO' && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        Aparece na lista de batidas diárias e espelhos de ponto ativos.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormStatus('INATIVO')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                        formStatus === 'INATIVO'
                          ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20 text-amber-950 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-amber-800 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>INATIVO</span>
                        </span>
                        {formStatus === 'INATIVO' && <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        Afastado/suspenso temporariamente. Oculto na lista diária.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFormStatus('DESLIGADO');
                        if (!formDataDesligamento) {
                          setFormDataDesligamento(new Date().toISOString().split('T')[0]);
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                        formStatus === 'DESLIGADO'
                          ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-500/20 text-rose-950 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-rose-800 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          <span>DESLIGADO</span>
                        </span>
                        {formStatus === 'DESLIGADO' && <Check className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        Contrato rescindido. Bloqueia novas batidas; preserva relatórios passados.
                      </p>
                    </button>
                  </div>

                  {/* Detalhes de Desligamento / Inativação */}
                  {(formStatus === 'DESLIGADO' || formStatus === 'INATIVO') && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 animate-fade-in">
                      <div>
                        <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1 text-[11px] flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span>Data do Desligamento / Inativação:</span>
                        </label>
                        <input
                          type="date"
                          value={formDataDesligamento}
                          onChange={(e) => setFormDataDesligamento(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl text-slate-900 font-semibold text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1 text-[11px]">
                          Motivo / Observações do DP:
                        </label>
                        <input
                          type="text"
                          value={formMotivoDesligamento}
                          onChange={(e) => setFormMotivoDesligamento(e.target.value)}
                          placeholder="Ex: Término de contrato, transferência, etc."
                          className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl text-slate-900 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Telefone / WhatsApp:</span>
                  </label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="Ex: (19) 99999-9999 ou 19999999999"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Seção Contratual & Livro Ponto */}
              <div className="p-4 bg-gradient-to-br from-indigo-50/80 to-slate-50 border border-indigo-200/90 rounded-2xl space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
                  <span className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4 text-indigo-600" />
                    Contrato & Livro Ponto (Empresa / Convênio)
                  </span>
                  <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-200/80 text-indigo-900 border border-indigo-300/60">
                    Folha & Ponto
                  </span>
                </div>

                {/* Campo Empresa / Convênio */}
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1 text-[11px] flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>Empresa Conveniada / Vinculada (Cabeçalho do Ponto & Recibo):</span>
                  </label>
                  <input
                    type="text"
                    value={formCompany}
                    onChange={(e) => setFormCompany(e.target.value)}
                    placeholder="Ex: GADAL - Gestão e Apoio, Colégio Crescer, etc."
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Nome da empresa conveniada que sairá no cabeçalho do Livro Ponto, Espelho e Recibo de Pagamento.
                  </span>
                </div>

                {/* Grid PIX e Bolsa Auxílio */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1 text-[11px]">
                      Chave PIX para Pagamento:
                    </label>
                    <input
                      type="text"
                      value={formPixKey}
                      onChange={(e) => setFormPixKey(e.target.value)}
                      placeholder="Ex: CPF, celular, e-mail ou chave aleatória"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1 text-[11px] flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Bolsa Auxílio Base Mensal (R$):</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formBaseSalary}
                      onChange={(e) => setFormBaseSalary(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                      placeholder="Ex: 1200.00 (ou 0.00)"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Tipo de Jornada Selector */}
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center justify-between">
                    <span>Tipo de Jornada de Trabalho:</span>
                    <span className="text-[10px] text-indigo-600 font-bold">
                      {formWorkShiftType === 'continua_6h'
                        ? '2 Batidas (Entrada e Saída Direta • Sem Almoço)'
                        : formWorkShiftType === 'padrao_8h'
                        ? '4 Batidas (Com Intervalo de Almoço)'
                        : 'Horário Livre'}
                    </span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFormWorkShiftType('continua_6h');
                        setFormContractSchedule('11:40 - 17:40');
                        setFormContractDailyHoursFormatted('6h00min');
                        setFormContractDailyMinutes(360);
                        setFormContractDailyHours(6);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                        formWorkShiftType === 'continua_6h'
                          ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs flex items-center gap-1.5">
                          <span>⚡</span>
                          <span>Jornada Contínua (6h)</span>
                        </span>
                        {formWorkShiftType === 'continua_6h' && (
                          <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        Exige apenas 2 batidas diárias. Sem intervalo de almoço obrigatório (11:40 - 17:40).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFormWorkShiftType('padrao_8h');
                        setFormContractSchedule('07:30 - 11:30 / 13:00 - 17:42');
                        setFormContractDailyHoursFormatted('8h42min');
                        setFormContractDailyMinutes(522);
                        setFormContractDailyHours(8.7);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                        formWorkShiftType === 'padrao_8h'
                          ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs flex items-center gap-1.5">
                          <span>🍴</span>
                          <span>Jornada Padrão (8h+)</span>
                        </span>
                        {formWorkShiftType === 'padrao_8h' && (
                          <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        4 batidas (Entrada 1, Almoço, Retorno, Saída 2). Desconta intervalo (8h42min).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormWorkShiftType('personalizada')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                        formWorkShiftType === 'personalizada'
                          ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs flex items-center gap-1.5">
                          <span>⚙️</span>
                          <span>Personalizada</span>
                        </span>
                        {formWorkShiftType === 'personalizada' && (
                          <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        Defina livremente qualquer formato e carga horária específica.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Grid Horário Contratual e Carga Horária */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1 text-[11px] flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>Horário Contratual (1 ou 2 turnos com almoço):</span>
                    </label>
                    <input
                      type="text"
                      value={formContractSchedule}
                      onChange={(e) => handleScheduleInputChange(e.target.value)}
                      placeholder="Ex: 11:40 - 17:40 ou 07:30 - 11:30 / 13:00 - 17:42"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Detecta automaticamente turnos divididos (ex: 07:30 - 11:30 / 13:00 - 17:42)
                    </span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1 text-[11px] flex items-center justify-between">
                      <span>Carga Diária:</span>
                      <span className="text-[10px] font-mono text-indigo-600 font-extrabold">
                        {formContractDailyMinutes} min
                      </span>
                    </label>
                    <input
                      type="text"
                      value={formContractDailyHoursFormatted}
                      onChange={(e) => handleDailyHoursChange(e.target.value)}
                      placeholder="Ex: 8h 42min ou 6h 00min"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Formato Xh YYmin ou horas
                    </span>
                  </div>
                </div>

                {/* Dynamic Calculation Helper Card */}
                {scheduleCalculation.shiftsCount > 0 && (
                  <div className="p-3 bg-indigo-50/90 border border-indigo-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-indigo-950">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-extrabold">{scheduleCalculation.summary}</span>
                    </div>
                    <div className="flex items-center space-x-1.5 self-start sm:self-auto shrink-0">
                      <span className="text-[10px] bg-white text-indigo-900 font-mono font-bold px-2 py-0.5 rounded-md border border-indigo-200">
                        {scheduleCalculation.workedMinutes} min úteis
                      </span>
                      {scheduleCalculation.lunchBreakMinutes > 0 && (
                        <span className="text-[10px] bg-amber-100 text-amber-900 font-extrabold px-2 py-0.5 rounded-full border border-amber-300">
                          Almoço Descontado
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-800 uppercase tracking-wider text-xs">
                    Atribuir Modalidades Extracurriculares ao Usuário:
                  </label>
                  <div className="flex items-center space-x-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setFormActivities(rollCallExtracurriculars.map((a) => a.id))}
                      className="text-indigo-600 hover:text-indigo-800 font-extrabold cursor-pointer hover:underline"
                    >
                      Todas
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => setFormActivities([])}
                      className="text-slate-500 hover:text-slate-700 font-bold cursor-pointer hover:underline"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Selecione as modalidades com chamada individual gerenciadas por este professor/monitor:
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {rollCallExtracurriculars.map((act) => {
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
                        <ActivityBadge
                          activity={act.id}
                          iconName={act.icon}
                          customIconUrl={act.customIconUrl}
                          customEquipment={act.defaultEquipment}
                          size="sm"
                        />
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
                  disabled={isSavingUser}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-extrabold shadow-md shadow-indigo-600/30 transition-all cursor-pointer flex items-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingUser ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>{isSavingUser ? 'Salvando Usuário...' : 'Salvar Usuário'}</span>
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
                  onChange={(e) => handleActNameChange(e.target.value)}
                  placeholder="Ex: Xadrez, Teatro, Robótica, Karatê, Capoeira..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              {/* Ícone ou Imagem Personalizada */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-700 uppercase tracking-wider">
                    Identidade Visual / Ícone da Modalidade:
                  </label>
                  <span className="text-[10px] text-slate-500 font-semibold">
                    {actCustomIconUrl ? 'Imagem própria ativa' : `Padrão: ${actIcon}`}
                  </span>
                </div>

                {/* Sub-tabs: Enviar Imagem vs Biblioteca Lucide */}
                <div className="flex p-1 bg-slate-100/90 rounded-xl gap-1 border border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => setIconSourceTab('upload')}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      iconSourceTab === 'upload'
                        ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/60'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload de Imagem (PNG, SVG, JPG)</span>
                    {actCustomIconUrl && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIconSourceTab('preset')}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      iconSourceTab === 'preset'
                        ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/60'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Biblioteca de Ícones</span>
                  </button>
                </div>

                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleIconFileUpload}
                  accept="image/png,image/svg+xml,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                />

                {/* Error Banner */}
                {iconUploadError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                    <XCircle className="w-4 h-4 shrink-0 text-rose-500" />
                    <span>{iconUploadError}</span>
                  </div>
                )}

                {/* TAB 1: UPLOAD DE IMAGEM */}
                {iconSourceTab === 'upload' && (
                  <div className="space-y-2">
                    {actCustomIconUrl ? (
                      /* Active Custom Image Box */
                      <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-2xl p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-emerald-900 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Ícone Personalizado Cadastrado</span>
                          </span>
                          <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                            Ativo
                          </span>
                        </div>

                        <div className="flex items-center gap-3 bg-white/90 p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center p-1.5 shrink-0 overflow-hidden">
                            <img
                              src={actCustomIconUrl}
                              alt="Ícone personalizado"
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-800 truncate">
                              {actName || 'Modalidade'} (Custom Icon)
                            </p>
                            <p className="text-[10px] text-slate-500">
                              Renderizado nos cartões de gestão e chips da grade horária.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-indigo-700 font-bold rounded-xl border border-indigo-200 text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Trocar Imagem</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleRemoveCustomIcon}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl border border-rose-200 text-xs transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remover Imagem</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Upload Dropzone / Button */
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/70 hover:bg-indigo-50/40 rounded-2xl p-4 text-center cursor-pointer transition-all space-y-2 group"
                      >
                        <div className="w-10 h-10 mx-auto rounded-2xl bg-white group-hover:bg-indigo-100/70 text-slate-500 group-hover:text-indigo-600 border border-slate-200 group-hover:border-indigo-300 flex items-center justify-center transition-colors shadow-2xs">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-extrabold text-slate-800 group-hover:text-indigo-900">
                            Clique para selecionar um ícone ou imagem
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Formatos aceitos: <strong>PNG</strong> (com fundo transparente), <strong>SVG</strong> vetorial ou <strong>JPG</strong> (máx. 5MB).
                          </p>
                        </div>
                        <button
                          type="button"
                          className="px-3 py-1 bg-white group-hover:bg-indigo-600 text-slate-700 group-hover:text-white font-bold rounded-xl border border-slate-200 group-hover:border-indigo-600 text-[11px] transition-colors shadow-2xs pointer-events-none"
                        >
                          Procurar Arquivo no Computador
                        </button>
                      </div>
                    )}

                    <p className="text-[11px] text-slate-500 leading-snug">
                      💡 <strong>Dica de Fallback:</strong> Caso não envie uma imagem ou se ela for removida, o sistema usará automaticamente o ícone selecionado na aba Biblioteca ({actIcon}).
                    </p>
                  </div>
                )}

                {/* TAB 2: BIBLIOTECA DE ÍCONES LUCIDE */}
                {iconSourceTab === 'preset' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-600 font-medium">
                        Selecione o ícone padrão ou de fallback:
                      </span>
                      {actName && (
                        <button
                          type="button"
                          onClick={handleResetToAutoIcon}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-lg border border-indigo-200 transition-all cursor-pointer flex items-center gap-1"
                          title="Detectar automaticamente com base no nome digitado"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Auto-detectar</span>
                        </button>
                      )}
                    </div>

                    {/* Icon search / filter */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={iconSearchTerm}
                        onChange={(e) => setIconSearchTerm(e.target.value)}
                        placeholder="Filtrar ícones (ex: esporte, música, arte, luta, natação)..."
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      {iconSearchTerm && (
                        <button
                          type="button"
                          onClick={() => setIconSearchTerm('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-40 overflow-y-auto pr-1 border border-slate-100 rounded-2xl p-1.5 bg-slate-50/50">
                      {availableIconList
                        .filter((ic) => {
                          if (!iconSearchTerm) return true;
                          const q = iconSearchTerm.toLowerCase();
                          return ic.id.toLowerCase().includes(q) || ic.label.toLowerCase().includes(q);
                        })
                        .map((ic) => {
                          const isSel = actIcon === ic.id;
                          return (
                            <button
                              key={ic.id}
                              type="button"
                              onClick={() => {
                                setActIcon(ic.id);
                                setIsManualIconChosen(true);
                              }}
                              className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center space-x-2 shrink-0 ${
                                isSel
                                  ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs ring-2 ring-indigo-500/20'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-indigo-50/60 hover:border-indigo-200'
                              }`}
                              title={`${ic.label} (${ic.id})`}
                            >
                              <span className={isSel ? 'text-white' : 'text-indigo-600'}>
                                {renderActivityIcon(ic.id, 'w-4 h-4')}
                              </span>
                              <span className="text-[11px] truncate flex-1 leading-tight">
                                {ic.label.split('/')[0].trim()}
                              </span>
                              {isSel && <Check className="w-3 h-3 text-white shrink-0 ml-auto" />}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Live Preview Box */}
                <div className="bg-slate-100/90 border border-slate-200 rounded-2xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                  <div>
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                      Prévia do Chip Visual:
                    </span>
                    <div className="mt-1">
                      <ActivityBadge
                        activity={actName.trim() || 'Nome da Atividade'}
                        iconName={actIcon}
                        customIconUrl={actCustomIconUrl}
                        size="md"
                      />
                    </div>
                  </div>

                  <div className="text-left sm:text-right text-[11px]">
                    {actCustomIconUrl ? (
                      <span className="text-emerald-700 font-extrabold flex items-center sm:justify-end gap-1">
                        <Check className="w-3.5 h-3.5" />
                        Usando Imagem Enviada
                      </span>
                    ) : (
                      <span className="text-slate-600 font-medium">
                        Ícone Padrão: <strong className="text-indigo-700 font-bold">{actIcon}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Tipo de Atividade & Chamada de Presença:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setActRequiresRollCall(true)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-1.5 ${
                      actRequiresRollCall
                        ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20 text-emerald-950'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs flex items-center gap-1.5">
                        <Check className={`w-3.5 h-3.5 ${actRequiresRollCall ? 'text-emerald-600' : 'text-slate-400'}`} />
                        Exige Chamada (Diário)
                      </span>
                      {actRequiresRollCall && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      Gera lista de presença e coluna no diário de frequência diária.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActRequiresRollCall(false)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-1.5 ${
                      !actRequiresRollCall
                        ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20 text-amber-950'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs flex items-center gap-1.5">
                        <Clock className={`w-3.5 h-3.5 ${!actRequiresRollCall ? 'text-amber-600' : 'text-slate-400'}`} />
                        Apenas Grade
                      </span>
                      {!actRequiresRollCall && (
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      Evento ou bloco de horário (ex: Almoço, Lanche, Parque) sem chamada de presença.
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Descrição da Atividade / Modalidade:
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
