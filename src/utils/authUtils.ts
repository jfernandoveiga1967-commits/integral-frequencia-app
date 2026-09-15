import { UserProfile } from '../types';

export const ADMIN_EMAIL = 'fernando.veiga@crescercampinas.com.br';

// Atividades padrão atribuídas ao Coordenador/Admin por padrão.
// Ajuste esta lista conforme as modalidades reais do Programa Integral.
export const MASTER_ADMIN_ACTIVITIES: string[] = [
  'Rotina',
];

// Turmas padrão atribuídas ao Coordenador/Admin por padrão.
// O Coordenador tem acesso irrestrito independente desta lista (ver lógica de permissões),
// mas ela é usada como valor de exibição/registro. Ajuste conforme necessário.
export const MASTER_ADMIN_TURMAS: string[] = [];

export const PRESET_USERS: UserProfile[] = [
  {
    id: 'usr_coord_1',
    name: 'Fernando Veiga',
    email: ADMIN_EMAIL,
    role: 'coordenador',
    cargoLabel: 'Coordenador (Administrador)',
    avatarColor: 'bg-amber-500',
    birthDate: '1967-08-12',
    pin: '12/08/1967',
    status: 'ATIVO',
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
];

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

export function normalizeAndDeduplicateUsers(rawUsers: UserProfile[]): UserProfile[] {
  const userById = new Map<string, UserProfile>();

  // 1. Carrega primeiro os usuários pré-definidos como base
  PRESET_USERS.forEach((preset) => {
    userById.set(preset.id, { ...preset });
  });

  // 2. Sobrescreve/Mescla com os usuários salvos/recebidos
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