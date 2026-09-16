import { UserProfile, UserRole, UserStatus } from '../types';

export const ADMIN_EMAIL = 'fernando.veiga@crescercampinas.com.br';

// Atividades e turmas padrão atribuídas ao Coordenador/Admin.
// O Coordenador tem acesso irrestrito independente destas listas (ver isCoordenador),
// elas servem apenas como valor de exibição/registro. Ajuste conforme necessário.
export const MASTER_ADMIN_ACTIVITIES: string[] = ['Rotina'];
export const MASTER_ADMIN_TURMAS: string[] = [];

export const PRESET_USERS: UserProfile[] = [
  {
    id: 'usr_coord_1',
    name: 'Fernando Veiga',
    email: ADMIN_EMAIL,
    role: 'coordenador' as UserRole,
    cargoLabel: 'Coordenador (Administrador)',
    avatarColor: 'bg-amber-500',
    birthDate: '1967-08-12',
    pin: '12/08/1967',
    status: 'ATIVO' as UserStatus,
    workShiftType: 'padrao_8h',
    assignedActivities: MASTER_ADMIN_ACTIVITIES,
    assignedTurmas: MASTER_ADMIN_TURMAS,
    allowedClassIds: MASTER_ADMIN_TURMAS,
    canManageStudents: true,
    canMarkAttendance: true,
    company: 'GADAL - Gestão e Apoio',
    contractSchedule: '07:30 - 17:30',
    baseSalary: 0,
  } as UserProfile,
  {
    id: 'usr_nutri_1',
    name: 'Thaís Grisoni',
    email: 'thaisgriisoni@gmail.com',
    role: 'nutricionista' as UserRole,
    cargoLabel: 'Nutricionista (CRN: 84367)',
    avatarColor: 'bg-teal-600',
    birthDate: '1990-01-01',
    pin: '01/01/1990',
    status: 'ATIVO' as UserStatus,
    assignedActivities: [],
    assignedTurmas: [],
    allowedClassIds: [],
    canManageStudents: false,
    canMarkAttendance: false,
    company: 'Colégio Crescer',
  } as UserProfile,
];

// ---------------------------------------------------------------------------
// Autenticação e login
// ---------------------------------------------------------------------------

export function verifyUserCredentials(
  user: UserProfile,
  email: string,
  password: string
): boolean {
  const emailMatch = (user.email || '').trim().toLowerCase() === email.trim().toLowerCase();
  const passwordMatch = (user.pin || '') === password.trim();
  return emailMatch && passwordMatch;
}

export function formatBirthDateToDisplay(isoDate: string): string {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

// ---------------------------------------------------------------------------
// Papel do usuário (role) e permissões
// ---------------------------------------------------------------------------

export function isCoordenador(user?: UserProfile | null): boolean {
  return user?.role === 'coordenador';
}

export function isNutricionista(user?: UserProfile | null): boolean {
  return user?.role === 'nutricionista';
}

// Coordenador sempre pode gerenciar alunos; demais perfis seguem a flag do próprio usuário.
export function canManageStudents(user?: UserProfile | null): boolean {
  if (!user) return false;
  if (isCoordenador(user)) return true;
  return user.canManageStudents !== undefined ? Boolean(user.canManageStudents) : false;
}

// Coordenador sempre pode marcar frequência; demais perfis seguem a flag do próprio usuário.
export function canMarkAttendance(user?: UserProfile | null): boolean {
  if (!user) return false;
  if (isCoordenador(user)) return true;
  return user.canMarkAttendance !== undefined ? Boolean(user.canMarkAttendance) : false;
}

// Gestão de turmas (criar/editar/excluir turmas): restrito ao Coordenador.
export function canManageTurmas(user?: UserProfile | null): boolean {
  return isCoordenador(user);
}

// Gestão do Cardápio: Coordenador ou Nutricionista.
export function canManageCardapio(user?: UserProfile | null): boolean {
  return isCoordenador(user) || isNutricionista(user);
}

// Estilo do selo (badge) exibido ao lado do nome/cargo do usuário.
// Retorna { label, className } — ajuste aqui se o visual não bater com o esperado.
export function getRoleBadgeStyle(user?: UserProfile | null): { label: string; className: string } {
  const role = user?.role;
  switch (role) {
    case 'coordenador':
      return { label: 'Coordenador', className: 'bg-amber-500/20 text-amber-300 border border-amber-500/40' };
    case 'nutricionista':
      return { label: 'Nutricionista', className: 'bg-teal-500/20 text-teal-300 border border-teal-500/40' };
    case 'auxiliar':
      return { label: 'Auxiliar', className: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' };
    case 'professor':
    default:
      return { label: 'Monitor / Professor', className: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' };
  }
}

// ---------------------------------------------------------------------------
// Status do usuário (ativo / inativo / desligado)
// ---------------------------------------------------------------------------

export function getUserStatus(user?: UserProfile | null): UserStatus {
  return (user?.status as UserStatus) || ('ATIVO' as UserStatus);
}

export function isUserActive(user?: UserProfile | null): boolean {
  return getUserStatus(user) === 'ATIVO';
}

export function isUserDismissed(user?: UserProfile | null): boolean {
  return getUserStatus(user) === 'DESLIGADO';
}

export function isUserInactiveOrDismissed(user?: UserProfile | null): boolean {
  return getUserStatus(user) !== 'ATIVO';
}

// Estilo do selo de status. Retorna { label, className } — ajuste se necessário.
export function getUserStatusBadge(user?: UserProfile | null): { label: string; className: string } {
  const status = getUserStatus(user);
  switch (status) {
    case 'DESLIGADO':
      return { label: 'Desligado', className: 'bg-rose-500/20 text-rose-300 border border-rose-500/40' };
    case 'INATIVO':
      return { label: 'Inativo', className: 'bg-slate-500/20 text-slate-300 border border-slate-500/40' };
    case 'ATIVO':
    default:
      return { label: 'Ativo', className: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' };
  }
}

// ---------------------------------------------------------------------------
// Normalização e armazenamento local de usuários
// ---------------------------------------------------------------------------

export function normalizeAndDeduplicateUsers(rawUsers: UserProfile[]): UserProfile[] {
  const userById = new Map<string, UserProfile>();

  PRESET_USERS.forEach((preset) => {
    userById.set(preset.id, { ...preset });
  });

  if (Array.isArray(rawUsers)) {
    rawUsers.forEach((raw) => {
      if (!raw || !raw.id) return;
      const existing = userById.get(raw.id) || ({} as UserProfile);
      const normalizedUser: UserProfile = {
        ...existing,
        ...raw,
        email: raw.email || existing.email || '',
        cargoLabel: raw.cargoLabel || existing.cargoLabel || '',
        pixKey: raw.pixKey || existing.pixKey || '',
        baseSalary: raw.baseSalary ?? existing.baseSalary,
        status: raw.status || existing.status || ('ATIVO' as UserStatus),
        assignedActivities: Array.isArray(raw.assignedActivities)
          ? raw.assignedActivities
          : (existing.assignedActivities || []),
        assignedTurmas: Array.isArray(raw.assignedTurmas)
          ? raw.assignedTurmas
          : (existing.assignedTurmas || []),
      };
      userById.set(raw.id, normalizedUser);
    });
  }

  return Array.from(userById.values());
}

export function getLocalUsersList(): UserProfile[] {
  try {
    const stored = localStorage.getItem('app_users_list');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeAndDeduplicateUsers(parsed);
      }
    }
  } catch (e) {
    console.error('Erro ao ler usuários do localStorage:', e);
  }
  return [...PRESET_USERS];
}

export function saveLocalUsersList(users: UserProfile[]): void {
  try {
    const normalized = normalizeAndDeduplicateUsers(users);
    localStorage.setItem('app_users_list', JSON.stringify(normalized));
  } catch (e) {
    console.error('Erro ao salvar usuários no localStorage:', e);
  }
}
