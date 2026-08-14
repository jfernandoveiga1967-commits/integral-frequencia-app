import { UserProfile, UserRole } from '../types';

export const ADMIN_EMAIL = 'jfernandoveiga1967@gmail.com';

export const PRESET_USERS: UserProfile[] = [
  {
    id: 'usr_coord_1',
    name: 'Fernando Veiga',
    email: 'jfernandoveiga1967@gmail.com',
    role: 'coordenador',
    cargoLabel: 'Coordenador (Administrador)',
    avatarColor: 'bg-amber-500',
    birthDate: '1967-08-12',
    pin: '12/08/1967',
    assignedActivities: ['Natação', 'Balé', 'Dança', 'Judô', 'Futebol', 'Ginástica', 'Flauta'],
    assignedTurmas: ['1º Ano Azul', '1º Ano Amarelo', '2º Ano Azul', '2º Ano Amarelo', '3º Ano', '4º Ano', '5º Ano', '6º ao 9º Ano'],
    allowedClassIds: ['1º Ano Azul', '1º Ano Amarelo', '2º Ano Azul', '2º Ano Amarelo', '3º Ano', '4º Ano', '5º Ano', '6º ao 9º Ano'],
    canManageStudents: true,
    canMarkAttendance: true,
  },
];

export function formatBirthDateToDisplay(dateStr?: string): string {
  if (!dateStr) return '';
  const clean = dateStr.trim();
  if (clean.includes('/')) return clean;
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }
  if (clean.length === 8 && !isNaN(Number(clean))) {
    return `${clean.substring(0, 2)}/${clean.substring(2, 4)}/${clean.substring(4)}`;
  }
  return clean;
}

export function verifyUserCredentials(user: UserProfile, enteredEmail: string, enteredPass: string): boolean {
  if (!user || !enteredEmail || !enteredPass) return false;

  const normalizedUserEmail = (user.email || '').trim().toLowerCase();
  const normalizedInputEmail = enteredEmail.trim().toLowerCase();

  if (normalizedUserEmail !== normalizedInputEmail) {
    return false;
  }

  const cleanPass = enteredPass.trim();
  const passOnlyDigits = cleanPass.replace(/\D/g, '');

  // 1. Direct match with pin or birthDate
  if (user.pin && user.pin.trim() === cleanPass) return true;
  if (user.birthDate && user.birthDate.trim() === cleanPass) return true;

  // 2. Formatted birth date match (e.g., input was "20/05/1990" and user.birthDate is "1990-05-20")
  if (user.birthDate) {
    const formattedBd = formatBirthDateToDisplay(user.birthDate);
    if (formattedBd === cleanPass) return true;

    // Digits comparison
    const bdDigits = user.birthDate.replace(/\D/g, '');
    const formattedBdDigits = formattedBd.replace(/\D/g, '');
    if (passOnlyDigits && (passOnlyDigits === bdDigits || passOnlyDigits === formattedBdDigits)) {
      return true;
    }
  }

  // 3. Fallback PIN digit check (e.g., "1234")
  if (user.pin) {
    const pinDigits = user.pin.replace(/\D/g, '');
    if (passOnlyDigits && pinDigits && passOnlyDigits === pinDigits) return true;
  }

  // Demo fallback PIN '1234' for preset testing
  if (cleanPass === '1234' || passOnlyDigits === '1234') return true;

  return false;
}

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
    // Enforce Fernando Veiga as Coordenador (Administrador)
    if (
      (user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) ||
      user.email === 'coordenacao@crescer.edu.br' ||
      user.name.includes('Ana Clara') ||
      user.id === 'usr_coord_1'
    ) {
      const coordUser: UserProfile = {
        ...user,
        id: user.id || 'usr_coord_1',
        name: 'Fernando Veiga',
        email: ADMIN_EMAIL,
        role: 'coordenador',
        cargoLabel: 'Coordenador (Administrador)',
        avatarColor: 'bg-amber-500',
        canManageStudents: true,
        canMarkAttendance: true,
      };
      saveStoredUser(coordUser);
      return coordUser;
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
      const normalizedUser =
        user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
          ? {
              ...user,
              role: 'coordenador' as UserRole,
              cargoLabel: 'Coordenador (Administrador)',
              avatarColor: 'bg-amber-500',
              canManageStudents: true,
              canMarkAttendance: true,
            }
          : user;
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(normalizedUser));
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
    // Remove Prof. Marcos Silva & Mariana/Marina Santos mock users
    list = list.filter(
      (u) =>
        u.id !== 'usr_prof_1' &&
        u.id !== 'usr_aux_1' &&
        !u.name.toLowerCase().includes('marcos silva') &&
        !u.name.toLowerCase().includes('mariana santos') &&
        !u.name.toLowerCase().includes('marina santos') &&
        u.email !== 'marcos.professor@crescer.edu.br' &&
        u.email !== 'mariana.auxiliar@crescer.edu.br'
    );
    // Ensure Fernando Veiga is strictly Coordenador in stored user list
    let hasAdmin = false;
    list = list.map((u) => {
      if (
        (u.email && u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) ||
        u.email === 'coordenacao@crescer.edu.br' ||
        u.name.includes('Ana Clara') ||
        u.id === 'usr_coord_1'
      ) {
        hasAdmin = true;
        return {
          ...u,
          id: u.id || 'usr_coord_1',
          name: 'Fernando Veiga',
          email: ADMIN_EMAIL,
          role: 'coordenador' as UserRole,
          cargoLabel: 'Coordenador (Administrador)',
          avatarColor: 'bg-amber-500',
          canManageStudents: true,
          canMarkAttendance: true,
        };
      }
      return u;
    });

    if (!hasAdmin) {
      list = [PRESET_USERS[0], ...list];
    }

    saveLocalUsersList(list);
    return list.length > 0 ? list : PRESET_USERS;
  } catch (err) {
    console.error('Error loading local users list:', err);
    return PRESET_USERS;
  }
}

export function saveLocalUsersList(users: UserProfile[]): void {
  try {
    const normalizedList = users.map((u) => {
      if (u.email && u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        return {
          ...u,
          role: 'coordenador' as UserRole,
          cargoLabel: 'Coordenador (Administrador)',
          avatarColor: 'bg-amber-500',
          canManageStudents: true,
          canMarkAttendance: true,
        };
      }
      return u;
    });
    localStorage.setItem(ALL_USERS_STORAGE_KEY, JSON.stringify(normalizedList));
  } catch (err) {
    console.error('Error saving local users list:', err);
  }
}

export function isCoordenador(user: UserProfile | null): boolean {
  if (!user) return false;
  if (user.email && user.email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  return user.role === 'coordenador';
}

export function isProfessor(user: UserProfile | null): boolean {
  if (!user) return false;
  if (user.email && user.email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return false;
  }
  return user.role === 'professor';
}

export function isAuxiliar(_user: UserProfile | null): boolean {
  return false;
}

export function canManageStudents(user: UserProfile | null): boolean {
  if (!user) return false;
  if (isCoordenador(user)) return true;
  if (user.canManageStudents !== undefined) return user.canManageStudents;
  return user.role === 'coordenador' || user.role === 'professor';
}

export function canMarkAttendance(user: UserProfile | null): boolean {
  if (!user) return false;
  if (isCoordenador(user)) return true;
  if (user.canMarkAttendance !== undefined) return user.canMarkAttendance;
  return true;
}

export function canManageTurmas(user: UserProfile | null): boolean {
  if (!user) return false;
  return isCoordenador(user);
}

export function canResetSystem(user: UserProfile | null): boolean {
  if (!user) return false;
  return isCoordenador(user);
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
    default:
      return {
        bg: 'bg-indigo-500/15',
        text: 'text-indigo-300',
        border: 'border-indigo-500/30',
        label: 'Monitor / Professor',
      };
  }
}
