import { UserProfile, UserRole } from '../types';

export const PRESET_USERS: UserProfile[] = [
  {
    id: 'usr_coord_1',
    name: 'Fernando Veiga',
    email: 'jfernandoveiga1967@gmail.com',
    role: 'coordenador',
    cargoLabel: 'Coordenador (Administrador)',
    avatarColor: 'bg-amber-500',
    pin: '1234',
    assignedActivities: ['Natação', 'Balé', 'Dança', 'Judô', 'Futebol', 'Ginástica', 'Flauta'],
    canManageStudents: true,
    canMarkAttendance: true,
  },
  {
    id: 'usr_aux_1',
    name: 'Mariana Santos',
    email: 'mariana.auxiliar@crescer.edu.br',
    role: 'auxiliar',
    cargoLabel: 'Auxiliar',
    avatarColor: 'bg-emerald-600',
    pin: '1234',
    assignedActivities: ['Balé', 'Dança', 'Ginástica'],
    canManageStudents: false,
    canMarkAttendance: true,
  },
];

const AUTH_STORAGE_KEY = 'frequencia_integral_active_user';
const ALL_USERS_STORAGE_KEY = 'frequencia_integral_all_users';

export function getStoredUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as UserProfile;
    if (user.id === 'usr_prof_1' || user.name.toLowerCase().includes('marcos silva') || user.email === 'marcos.professor@crescer.edu.br') {
      saveStoredUser(null);
      return null;
    }
    // Migrate Ana Clara to Fernando Veiga if previously logged in
    if (user.email === 'coordenacao@crescer.edu.br' || user.name.includes('Ana Clara')) {
      const migratedUser: UserProfile = {
        ...user,
        name: 'Fernando Veiga',
        email: 'jfernandoveiga1967@gmail.com',
        role: 'coordenador',
        cargoLabel: 'Coordenador (Administrador)',
      };
      saveStoredUser(migratedUser);
      return migratedUser;
    }
    return user;
  } catch (err) {
    console.error('Error loading stored user profile:', err);
    return null;
  }
}

export function saveStoredUser(user: UserProfile | null): void {
  try {
    if (!user) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } else {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    }
  } catch (err) {
    console.error('Error saving active user profile:', err);
  }
}

export function getLocalUsersList(): UserProfile[] {
  try {
    const raw = localStorage.getItem(ALL_USERS_STORAGE_KEY);
    if (!raw) return PRESET_USERS;
    let list = JSON.parse(raw) as UserProfile[];
    // Remove Prof. Marcos Silva mock user
    list = list.filter((u) => u.id !== 'usr_prof_1' && !u.name.toLowerCase().includes('marcos silva') && u.email !== 'marcos.professor@crescer.edu.br');
    // Replace Ana Clara with Fernando Veiga if present in stored user list
    let updated = false;
    list = list.map((u) => {
      if (u.email === 'coordenacao@crescer.edu.br' || u.name.includes('Ana Clara')) {
        updated = true;
        return {
          ...u,
          name: 'Fernando Veiga',
          email: 'jfernandoveiga1967@gmail.com',
          role: 'coordenador',
          cargoLabel: 'Coordenador (Administrador)',
        };
      }
      return u;
    });
    saveLocalUsersList(list);
    return list.length > 0 ? list : PRESET_USERS;
  } catch (err) {
    console.error('Error loading local users list:', err);
    return PRESET_USERS;
  }
}

export function saveLocalUsersList(users: UserProfile[]): void {
  try {
    localStorage.setItem(ALL_USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (err) {
    console.error('Error saving local users list:', err);
  }
}

export function isCoordenador(user: UserProfile | null): boolean {
  return user?.role === 'coordenador';
}

export function isProfessor(user: UserProfile | null): boolean {
  return user?.role === 'professor';
}

export function isAuxiliar(user: UserProfile | null): boolean {
  return user?.role === 'auxiliar';
}

export function canManageStudents(user: UserProfile | null): boolean {
  if (!user) return false;
  if (user.canManageStudents !== undefined) return user.canManageStudents;
  return user.role === 'coordenador' || user.role === 'professor';
}

export function canManageTurmas(user: UserProfile | null): boolean {
  if (!user) return false;
  return user.role === 'coordenador';
}

export function canResetSystem(user: UserProfile | null): boolean {
  if (!user) return false;
  return user.role === 'coordenador';
}

export function getRoleBadgeStyle(role: UserRole): { bg: string; text: string; border: string; label: string } {
  switch (role) {
    case 'coordenador':
      return {
        bg: 'bg-amber-500/15',
        text: 'text-amber-300',
        border: 'border-amber-500/30',
        label: 'Coordenador (Admin)',
      };
    case 'professor':
      return {
        bg: 'bg-indigo-500/15',
        text: 'text-indigo-300',
        border: 'border-indigo-500/30',
        label: 'Monitor / Professor',
      };
    case 'auxiliar':
      return {
        bg: 'bg-emerald-500/15',
        text: 'text-emerald-300',
        border: 'border-emerald-500/30',
        label: 'Auxiliar',
      };
  }
}
