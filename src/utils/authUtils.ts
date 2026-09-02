import { UserProfile, UserRole, ActivityType } from '../types';

export const ADMIN_EMAIL = 'jfernandoveiga1967@gmail.com';

export const MASTER_ADMIN_ACTIVITIES: ActivityType[] = ['Rotina', 'Natação', 'Balé', 'Dança', 'Judô', 'Futebol', 'Ginástica', 'Flauta'];
export const MASTER_ADMIN_TURMAS: string[] = ['1º Ano Azul', '1º Ano Amarelo', '2º Ano Azul', '2º Ano Amarelo', '3º Ano', '4º Ano', '5º Ano', '6º ao 9º Ano'];

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
    status: 'ATIVO',
    assignedActivities: MASTER_ADMIN_ACTIVITIES,
    assignedTurmas: MASTER_ADMIN_TURMAS,
    allowedClassIds: MASTER_ADMIN_TURMAS,
    canManageStudents: true,
    canMarkAttendance: true,
    company: 'GADAL - Gestão e Apoio',
    contractSchedule: '07:30 - 17:30',
    contractDailyHours: 8,
    contractDailyMinutes: 480,
    contractDailyHoursFormatted: '8h 00min',
  },
];

/**
 * Normaliza e deduplica rigorosamente uma lista de usuários por E-mail e ID único.
 * Elimina perfis duplicados, contas fantasmas e garante a integridade do Coordenador Geral.
 */
export function normalizeAndDeduplicateUsers(rawUsers: UserProfile[]): UserProfile[] {
  if (!Array.isArray(rawUsers)) return [...PRESET_USERS];

  const userMap = new Map<string, UserProfile>();

  rawUsers.forEach((raw) => {
    if (!raw) return;

    const rawName = (raw.name || '').trim();
    const rawNameLower = rawName.toLowerCase();
    const rawEmail = (raw.email || '').trim();
    const rawEmailLower = rawEmail.toLowerCase();
    const rawId = (raw.id || '').trim();

    // 1. Filtrar apenas contas mock de demonstração legadas
    const isBannedProfile =
      rawId === 'usr_prof_1' ||
      rawId === 'usr_aux_1' ||
      rawNameLower.includes('marcos silva') ||
      rawNameLower.includes('mariana santos') ||
      rawNameLower.includes('marina santos') ||
      rawEmailLower === 'marcos.professor@crescer.edu.br' ||
      rawEmailLower === 'mariana.auxiliar@crescer.edu.br';

    if (isBannedProfile) {
      return;
    }

    // 2. Identificar se é o Coordenador Geral (Fernando Veiga)
    const isMasterAdmin =
      rawEmailLower === ADMIN_EMAIL.toLowerCase() ||
      rawId === 'usr_coord_1' ||
      rawNameLower.includes('fernando veiga') ||
      rawEmailLower === 'coordenacao@crescer.edu.br';

    if (isMasterAdmin) {
      const adminKey = `email:${ADMIN_EMAIL.toLowerCase()}`;
      const existingAdmin = userMap.get(adminKey);

      const resolvedAdmin: UserProfile = {
        ...(existingAdmin || {}),
        ...raw,
        id: 'usr_coord_1',
        name: raw.name?.trim() || existingAdmin?.name || 'Fernando Veiga',
        email: ADMIN_EMAIL,
        role: 'coordenador' as UserRole,
        cargoLabel: raw.cargoLabel || existingAdmin?.cargoLabel || 'Coordenador (Administrador)',
        avatarColor: 'bg-amber-500',
        birthDate: raw.birthDate || existingAdmin?.birthDate || '1967-08-12',
        pin: raw.pin || existingAdmin?.pin || '12/08/1967',
        status: 'ATIVO',
        phone: raw.phone !== undefined ? (raw.phone ? raw.phone.trim() : undefined) : existingAdmin?.phone,
        pixKey: raw.pixKey !== undefined ? (raw.pixKey ? raw.pixKey.trim() : undefined) : existingAdmin?.pixKey,
        workShiftType: raw.workShiftType || existingAdmin?.workShiftType || 'padrao_8h',
        company: raw.company || existingAdmin?.company || 'GADAL - Gestão e Apoio',
        contractSchedule: raw.contractSchedule || existingAdmin?.contractSchedule || '07:30 - 17:30',
        contractDailyHours: raw.contractDailyHours !== undefined ? raw.contractDailyHours : (existingAdmin?.contractDailyHours !== undefined ? existingAdmin.contractDailyHours : 8),
        contractDailyMinutes: raw.contractDailyMinutes !== undefined ? raw.contractDailyMinutes : (existingAdmin?.contractDailyMinutes !== undefined ? existingAdmin.contractDailyMinutes : 480),
        contractDailyHoursFormatted: raw.contractDailyHoursFormatted || existingAdmin?.contractDailyHoursFormatted || '8h 00min',
        baseSalary: raw.baseSalary !== undefined && raw.baseSalary !== null && !isNaN(Number(raw.baseSalary)) ? Number(raw.baseSalary) : (existingAdmin?.baseSalary !== undefined ? existingAdmin.baseSalary : 5000),
        assignedActivities: (raw.assignedActivities && raw.assignedActivities.length > 0) ? raw.assignedActivities : (existingAdmin?.assignedActivities || MASTER_ADMIN_ACTIVITIES),
        assignedTurmas: (raw.assignedTurmas && raw.assignedTurmas.length > 0) ? raw.assignedTurmas : (raw.allowedClassIds && raw.allowedClassIds.length > 0 ? raw.allowedClassIds : (existingAdmin?.assignedTurmas || MASTER_ADMIN_TURMAS)),
        allowedClassIds: (raw.allowedClassIds && raw.allowedClassIds.length > 0) ? raw.allowedClassIds : (raw.assignedTurmas && raw.assignedTurmas.length > 0 ? raw.assignedTurmas : (existingAdmin?.allowedClassIds || MASTER_ADMIN_TURMAS)),
        canManageStudents: true,
        canMarkAttendance: true,
        updatedAt: raw.updatedAt || existingAdmin?.updatedAt || new Date().toISOString(),
      };

      userMap.set(adminKey, resolvedAdmin);
      return;
    }

    // 3. Usuários regulares da equipe
    // Chave de deduplicação primária: E-mail normalizado; secundária: Nome normalizado; terciária: ID
    const dedupKey = rawEmailLower
      ? `email:${rawEmailLower}`
      : (rawNameLower ? `name:${rawNameLower}` : `id:${rawId}`);

    const existing = userMap.get(dedupKey);

    if (!existing) {
      const role = raw.role === 'coordenador' ? 'coordenador' : 'professor';
      const cargoLabel = raw.cargoLabel || (role === 'coordenador' ? 'Coordenador (Administrador)' : 'Monitor / Professor');
      const avatarColor = raw.avatarColor || (role === 'coordenador' ? 'bg-amber-500' : 'bg-indigo-600');
      const rawStatus = (raw.status || 'ATIVO').toUpperCase() as any;
      const status = rawStatus || 'ATIVO';

      const singleProfile: UserProfile = {
        ...raw,
        id: rawId || 'usr_' + Date.now() + Math.random().toString(36).substr(2, 4),
        name: rawName || 'Colaborador',
        email: rawEmailLower || (rawNameLower ? `${rawNameLower.replace(/[^a-z0-9]/g, '')}@crescer.local` : ''),
        role,
        cargoLabel,
        avatarColor,
        status,
        dataDesligamento: raw.dataDesligamento || undefined,
        motivoDesligamento: raw.motivoDesligamento || undefined,
        workShiftType: raw.workShiftType || undefined,
        birthDate: raw.birthDate || '1995-01-01',
        pin: raw.pin || '1234',
        assignedActivities: Array.isArray(raw.assignedActivities) ? raw.assignedActivities : [],
        assignedTurmas: Array.isArray(raw.allowedClassIds) ? raw.allowedClassIds : (Array.isArray(raw.assignedTurmas) ? raw.assignedTurmas : []),
        allowedClassIds: Array.isArray(raw.allowedClassIds) ? raw.allowedClassIds : (Array.isArray(raw.assignedTurmas) ? raw.assignedTurmas : []),
        canManageStudents: raw.canManageStudents !== undefined ? raw.canManageStudents : true,
        canMarkAttendance: raw.canMarkAttendance !== undefined ? raw.canMarkAttendance : true,
        phone: raw.phone ? raw.phone.trim() : undefined,
        pixKey: raw.pixKey ? raw.pixKey.trim() : undefined,
        contractSchedule: raw.contractSchedule ? raw.contractSchedule.trim() : undefined,
        company: raw.company ? raw.company.trim() : 'GADAL - Gestão e Apoio',
        baseSalary: raw.baseSalary !== undefined && raw.baseSalary !== null && !isNaN(Number(raw.baseSalary)) ? Number(raw.baseSalary) : 1200,
        updatedAt: raw.updatedAt || new Date().toISOString(),
      };

      userMap.set(dedupKey, singleProfile);
    } else {
      // Mesclagem rigorosa para unificar duplicatas / preservar o status explicitamente alterado
      const rawStatus = (raw.status || '').toUpperCase();
      const existingStatus = (existing.status || '').toUpperCase();
      
      // REGRA CRÍTICA: Se algum registro foi marcado explicitamente como INATIVO, DESLIGADO, FERIAS ou LICENCA, respeitar!
      let mergedStatus = 'ATIVO';
      if (rawStatus && rawStatus !== 'ATIVO') {
        mergedStatus = rawStatus;
      } else if (existingStatus && existingStatus !== 'ATIVO') {
        mergedStatus = existingStatus;
      }

      // Unir atividades e turmas sem repetições
      const mergedActs = Array.from(
        new Set([...(existing.assignedActivities || []), ...(raw.assignedActivities || [])])
      );
      const mergedTurmas = Array.from(
        new Set([
          ...(existing.allowedClassIds || existing.assignedTurmas || []),
          ...(raw.allowedClassIds || raw.assignedTurmas || []),
        ])
      );

      const mergedRole = (existing.role === 'coordenador' || raw.role === 'coordenador') ? 'coordenador' : 'professor';
      const cargoLabel = mergedRole === 'coordenador' ? 'Coordenador (Administrador)' : (raw.cargoLabel || existing.cargoLabel || 'Monitor / Professor');
      const avatarColor = mergedRole === 'coordenador' ? 'bg-amber-500' : (raw.avatarColor || existing.avatarColor || 'bg-indigo-600');

      // Preservar ID canônico mais antigo / estável
      const canonicalId = existing.id || raw.id;

      // Nome com melhor formatação (mais longo / completo)
      const mergedName = (rawName.length >= existing.name.length ? rawName : existing.name) || 'Colaborador';

      const mergedProfile: UserProfile = {
        ...existing,
        ...raw,
        id: canonicalId,
        name: mergedName,
        email: existing.email || rawEmailLower,
        role: mergedRole,
        cargoLabel,
        avatarColor,
        status: mergedStatus as any,
        dataDesligamento: raw.dataDesligamento || existing.dataDesligamento || undefined,
        motivoDesligamento: raw.motivoDesligamento || existing.motivoDesligamento || undefined,
        workShiftType: raw.workShiftType || existing.workShiftType || undefined,
        phone: raw.phone || existing.phone,
        pixKey: raw.pixKey || existing.pixKey,
        birthDate: (raw.birthDate && raw.birthDate !== '1995-01-01') ? raw.birthDate : existing.birthDate,
        pin: (raw.pin && raw.pin !== '1234') ? raw.pin : existing.pin,
        contractSchedule: raw.contractSchedule || existing.contractSchedule,
        contractDailyHours: raw.contractDailyHours !== undefined ? raw.contractDailyHours : existing.contractDailyHours,
        contractDailyMinutes: raw.contractDailyMinutes !== undefined ? raw.contractDailyMinutes : existing.contractDailyMinutes,
        contractDailyHoursFormatted: raw.contractDailyHoursFormatted || existing.contractDailyHoursFormatted,
        company: raw.company || existing.company || 'GADAL - Gestão e Apoio',
        baseSalary: raw.baseSalary !== undefined && raw.baseSalary !== null ? Number(raw.baseSalary) : existing.baseSalary,
        assignedActivities: mergedActs,
        assignedTurmas: mergedTurmas,
        allowedClassIds: mergedTurmas,
        canManageStudents: raw.canManageStudents !== undefined ? raw.canManageStudents : existing.canManageStudents,
        canMarkAttendance: raw.canMarkAttendance !== undefined ? raw.canMarkAttendance : existing.canMarkAttendance,
        updatedAt: raw.updatedAt || new Date().toISOString(),
      };

      userMap.set(dedupKey, mergedProfile);
    }
  });

  // Garantir que Fernando Veiga esteja sempre presente
  const adminKey = `email:${ADMIN_EMAIL.toLowerCase()}`;
  if (!userMap.has(adminKey)) {
    userMap.set(adminKey, PRESET_USERS[0]);
  }

  const result = Array.from(userMap.values());

  // Ordenar: Fernando Veiga (Admin) sempre em primeiro, depois em ordem alfabética por nome
  return result.sort((a, b) => {
    if (a.role === 'coordenador' && b.role !== 'coordenador') return -1;
    if (a.role !== 'coordenador' && b.role === 'coordenador') return 1;
    return (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
  });
}

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
    const userEmailLower = (user.email || '').toLowerCase().trim();
    const userNameLower = (user.name || '').toLowerCase().trim();

    if (
      user.id === 'usr_prof_1' ||
      user.id === 'usr_aux_1' ||
      userNameLower.includes('marcos silva') ||
      userNameLower.includes('mariana santos') ||
      userEmailLower === 'marcos.professor@crescer.edu.br' ||
      userEmailLower === 'mariana.auxiliar@crescer.edu.br'
    ) {
      saveStoredUser(null);
      return null;
    }
    // Enforce Fernando Veiga as Coordenador (Administrador)
    if (
      (user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) ||
      user.email === 'coordenacao@crescer.edu.br' ||
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
    if (!raw) return [...PRESET_USERS];
    const parsed = JSON.parse(raw) as UserProfile[];
    const deduplicated = normalizeAndDeduplicateUsers(parsed);
    saveLocalUsersList(deduplicated);
    return deduplicated.length > 0 ? deduplicated : [...PRESET_USERS];
  } catch (err) {
    console.error('Error loading local users list:', err);
    return [...PRESET_USERS];
  }
}

export function saveLocalUsersList(users: UserProfile[]): void {
  try {
    const deduplicated = normalizeAndDeduplicateUsers(users);
    localStorage.setItem(ALL_USERS_STORAGE_KEY, JSON.stringify(deduplicated));
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

export function isUserActive(user: UserProfile | null | undefined): boolean {
  if (!user) return false;
  if (isCoordenador(user)) return true;
  const s = (user.status || 'ATIVO').toUpperCase();
  return s === 'ATIVO';
}

export function isUserDismissed(user: UserProfile | null | undefined): boolean {
  if (!user) return false;
  const s = (user.status || '').toUpperCase();
  return s === 'DESLIGADO';
}

export function isUserInactiveOrDismissed(user: UserProfile | null | undefined): boolean {
  if (!user) return false;
  if (isCoordenador(user)) return false;
  const s = (user.status || 'ATIVO').toUpperCase();
  return s === 'INATIVO' || s === 'DESLIGADO';
}

export function getUserStatus(user: UserProfile | null | undefined): 'ATIVO' | 'INATIVO' | 'DESLIGADO' {
  if (!user) return 'ATIVO';
  const s = (user.status || 'ATIVO').toUpperCase();
  if (s === 'DESLIGADO') return 'DESLIGADO';
  if (s === 'INATIVO') return 'INATIVO';
  return 'ATIVO';
}

export function getUserStatusBadge(user: UserProfile | null | undefined): {
  label: string;
  bg: string;
  text: string;
  border: string;
} {
  const status = getUserStatus(user);
  switch (status) {
    case 'DESLIGADO':
      return {
        label: user?.dataDesligamento ? `Desligado(a) em ${formatBirthDateToDisplay(user.dataDesligamento)}` : 'Desligado(a)',
        bg: 'bg-rose-500/15',
        text: 'text-rose-400',
        border: 'border-rose-500/30',
      };
    case 'INATIVO':
      return {
        label: 'Inativo(a)',
        bg: 'bg-slate-500/15',
        text: 'text-slate-400',
        border: 'border-slate-500/30',
      };
    case 'ATIVO':
    default:
      return {
        label: 'Ativo(a)',
        bg: 'bg-emerald-500/15',
        text: 'text-emerald-400',
        border: 'border-emerald-500/30',
      };
  }
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
