import { UserProfile, UserRole, UserStatus, TabType, ALL_APP_TAB_IDS } from '../types';

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
    allowedTabs: ALL_APP_TAB_IDS,
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
    allowedTabs: ['cardapio'],
    canManageStudents: false,
    canMarkAttendance: false,
    company: 'Colégio Crescer',
  } as UserProfile,
  {
    id: 'usr_danyelpereira',
    name: 'Danyel Pereira',
    email: 'danyel.pereira@crescercampinas.com.br',
    role: 'professor' as UserRole,
    cargoLabel: 'Professor de Flauta',
    avatarColor: 'bg-sky-600',
    birthDate: '1985-05-15',
    pin: '15/05/1985',
    status: 'ATIVO' as UserStatus,
    workShiftType: 'continua_6h',
    assignedActivities: ['Flauta'],
    assignedTurmas: [],
    allowedClassIds: [],
    allowedTabs: ['ponto', 'semanario', 'momento'],
    canManageStudents: false,
    canMarkAttendance: true,
    company: 'Colégio Crescer',
    contractSchedule: '13:00 - 17:30',
    contractDailyHours: 4.5,
    contractDailyMinutes: 270,
  } as UserProfile,
];

// ===========================================================================
// EXPURGO DEFINITIVO DE PERFIS DE TESTE / FICTÍCIOS
// ===========================================================================
export const PURGED_EMAILS = [
  'amanda.oliveira@crescercampinas.com.br',
  'leticia.danca@crescercampinas.com.br',
] as const;

export const PURGED_USER_IDS = [
  'usr_amanda',
  'usr_leticia',
] as const;

export function isPurgedUser(user: { email?: string; id?: string; name?: string } | null | undefined): boolean {
  if (!user) return false;
  const email = (user.email || '').trim().toLowerCase();
  const id = (user.id || '').trim().toLowerCase();
  if (email && PURGED_EMAILS.some((p) => p.toLowerCase() === email)) return true;
  if (id && PURGED_USER_IDS.some((p) => p.toLowerCase() === id)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Autenticação e login
// ---------------------------------------------------------------------------

export function verifyUserCredentials(
  user: UserProfile,
  email: string,
  password: string
): boolean {
  const emailClean = email.trim().toLowerCase();
  const userEmailClean = (user.email || '').trim().toLowerCase();

  const isFernando =
    user.id === 'usr_coord_1' ||
    userEmailClean === 'fernando.veiga@crescercampinas.com.br' ||
    userEmailClean === 'jfernandoveiga1967@gmail.com';

  const emailMatch = isFernando
    ? (emailClean === 'fernando.veiga@crescercampinas.com.br' || emailClean === 'jfernandoveiga1967@gmail.com' || emailClean === 'coordenacao@crescer.edu.br')
    : (userEmailClean === emailClean);

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
  return isAdmin(user);
}

/**
 * Verifica se o usuário possui perfil de Administrador / Coordenação Geral.
 * Aceita role 'coordenador', 'admin', 'ADMIN', 'administrador', ou cargoLabel equivalente.
 */
export function isAdmin(user?: UserProfile | null): boolean {
  if (!user) return false;
  const role = String(user.role || '').trim().toLowerCase();
  const label = String(user.cargoLabel || '').trim().toLowerCase();
  return (
    role === 'coordenador' ||
    role === 'admin' ||
    role === 'administrador' ||
    label.includes('administrador') ||
    label.includes('coordenador') ||
    user.email === ADMIN_EMAIL ||
    user.id === 'usr_coord_1'
  );
}

/**
  * Verifica se uma determinada aba do aplicativo está liberada para o usuário.
  * - Coordenador: sempre tem acesso irrestrito a todas as abas.
  * - Demais usuários: apenas se a aba estiver explicitamente em user.allowedTabs.
  */
export function isTabAllowed(tab: TabType, user?: UserProfile | null): boolean {
  if (!user) return false;
  if (isCoordenador(user)) return true;
  // A aba 'manual' (Manual de Orientações e Normas) é pública para todas as monitoras, professores e equipe
  if (tab === 'manual') return true;
  return Array.isArray(user.allowedTabs) && user.allowedTabs.includes(tab);
}

/**
  * Retorna a lista de IDs de abas liberadas para o usuário.
  */
export function getUserAllowedTabs(user?: UserProfile | null): TabType[] {
  if (!user) return [];
  if (isCoordenador(user)) return ALL_APP_TAB_IDS;
  const userTabs = Array.isArray(user.allowedTabs) ? [...user.allowedTabs] : [];
  if (!userTabs.includes('manual')) {
    userTabs.push('manual');
  }
  return userTabs;
}

export function isNutricionista(user?: UserProfile | null): boolean {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  const label = (user.cargoLabel || '').toLowerCase();
  const name = (user.name || '').toLowerCase();
  const email = (user.email || '').toLowerCase();
  return (
    role === 'nutricionista' ||
    label.includes('nutri') ||
    name.includes('thaís grisoni') ||
    name.includes('thais grisoni') ||
    email.includes('thaisgriisoni') ||
    (Array.isArray(user.assignedActivities) ? user.assignedActivities : []).some((a) => String(a).toLowerCase().includes('culinária') || String(a).toLowerCase().includes('nutri'))
  );
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

/**
 * Verifica se o usuário logado possui a função/cargo de Auxiliar (ADI).
 * Considera role 'auxiliar', 'adi', 'auxiliar_adi' e variações no rótulo de cargo ('Auxiliar (ADI)', 'ADI', etc.).
 */
export function isAuxiliar(user?: UserProfile | null): boolean {
  if (!user) return false;
  const role = String(user.role || '').trim().toLowerCase();
  const label = String(user.cargoLabel || '').trim().toLowerCase();

  return (
    role === 'auxiliar' ||
    role === 'adi' ||
    role === 'auxiliar_adi' ||
    label.includes('auxiliar') ||
    label.includes('adi') ||
    label.includes('assistente de desenvolvimento infantil') ||
    detectCargoCategory(user) === 'auxiliar_adi'
  );
}

/**
 * Verifica se o usuário tem permissão para editar o Planejamento/Semanário.
 * Permite Coordenador, Professor e Auxiliar (ADI).
 */
export function canEditSemanario(user?: UserProfile | null): boolean {
  if (!user) return true;
  return isCoordenador(user) || user.role === 'professor' || isAuxiliar(user);
}

/**
 * Verifica se o usuário tem permissão para excluir atividades do Planejamento/Semanário (ícone da lixeira).
 * Permite Coordenador, Professor e Auxiliar (ADI).
 */
export function canDeleteSemanarioActivity(user?: UserProfile | null): boolean {
  if (!user) return true;
  return isCoordenador(user) || user.role === 'professor' || isAuxiliar(user);
}

/**
 * Verifica se o usuário tem permissão para editar e salvar o Quadro de Atribuições de Turmas e Apoio.
 * Permite Coordenador e Auxiliar (ADI).
 */
export function canEditQuadroAtribuicoes(user?: UserProfile | null): boolean {
  if (!user) return false;
  return isCoordenador(user) || isAuxiliar(user);
}

export interface BadgeStyle {
  bg: string;
  text: string;
  border: string;
  label: string;
  className: string;
}

export type UnifiedCargoCategory =
  | 'coordenador'
  | 'auxiliar_adi'
  | 'professor_horista'
  | 'professor_prestador'
  | 'monitor'
  | 'nutricionista';

/**
 * Detecta a categoria padronizada oficial do colaborador.
 * Categorias oficiais:
 * - coordenador: Coordenador (Admin)
 * - auxiliar_adi: Auxiliar (ADI)
 * - professor_horista: Professor Horista (CLT)
 * - professor_prestador: Professor Prestador (PJ)
 * - monitor: Monitor
 * - nutricionista: Nutricionista
 */
export function detectCargoCategory(userOrRole?: UserProfile | UserRole | string | null): UnifiedCargoCategory {
  if (!userOrRole) return 'monitor';

  if (typeof userOrRole === 'string') {
    const s = userOrRole.trim().toLowerCase();
    if (s === 'coordenador' || s === 'admin' || s === 'administrador') return 'coordenador';
    if (s === 'nutricionista' || s.includes('nutri')) return 'nutricionista';
    if (s === 'professor_prestador' || s.includes('prestador') || s.includes('pj')) return 'professor_prestador';
    if (s === 'professor_horista' || s.includes('horista')) return 'professor_horista';
    if (s === 'auxiliar_adi' || s === 'auxiliar' || s.includes('adi')) return 'auxiliar_adi';
    if (s === 'monitor') return 'monitor';
    return 'monitor';
  }

  const user = userOrRole as any;
  const role = String(user.role || '').trim().toLowerCase();
  const label = String(user.cargoLabel || '').trim().toLowerCase();
  const regimeTrab = String(user.regimeTrabalho || '').trim().toLowerCase();
  const regimeCont = String(user.regimeContratual || '').trim().toLowerCase();
  const email = String(user.email || '').trim().toLowerCase();
  const id = String(user.id || '').trim().toLowerCase();
  const name = String(user.name || '').trim().toLowerCase();

  // 1. Coordenador (Admin)
  if (
    role === 'coordenador' ||
    role === 'admin' ||
    role === 'administrador' ||
    id === 'usr_coord_1' ||
    email === ADMIN_EMAIL ||
    email === 'jfernandoveiga1967@gmail.com' ||
    label.includes('coordenador') ||
    label.includes('administrador')
  ) {
    return 'coordenador';
  }

  // 2. Nutricionista
  if (
    role === 'nutricionista' ||
    label.includes('nutri') ||
    name.includes('thaís grisoni') ||
    name.includes('thais grisoni') ||
    email.includes('thaisgriisoni')
  ) {
    return 'nutricionista';
  }

  // 3. Professor Prestador (PJ)
  if (
    regimeTrab === 'prestador_aula_efetiva' ||
    regimeCont.includes('prestador') ||
    regimeCont.includes('aula efetiva') ||
    regimeCont.includes('pj') ||
    label.includes('prestador') ||
    label.includes('pj') ||
    label.includes('flauta') ||
    ((user.assignedActivities || []).some((a: any) => String(a).toLowerCase().includes('flauta')))
  ) {
    return 'professor_prestador';
  }

  // 4. Professor Horista (CLT)
  if (
    regimeTrab === 'professor_horista' ||
    regimeCont.includes('horista') ||
    label.includes('horista') ||
    (label.includes('professor') && regimeTrab.includes('horista')) ||
    (label.includes('professora') && regimeTrab.includes('horista'))
  ) {
    return 'professor_horista';
  }

  // 5. Auxiliar (ADI)
  if (
    label.includes('adi') ||
    label.includes('auxiliar') ||
    (role === 'auxiliar' && !label.includes('monitor'))
  ) {
    return 'auxiliar_adi';
  }

  // 6. Monitor
  if (
    label.includes('monitor') ||
    role === 'auxiliar' ||
    role === 'professor'
  ) {
    return 'monitor';
  }

  return 'monitor';
}

/**
 * Retorna a oficina vinculada para professores PJ (sem resquícios de Musicalização).
 */
export function getProfessorPJOficina(user?: UserProfile | null): string | null {
  if (!user) return null;

  const label = (user.cargoLabel || '').trim();
  if (label && !label.toLowerCase().includes('prestador') && !label.toLowerCase().includes('pj')) {
    const cleanLabel = label
      .replace(/musicalização/gi, '')
      .replace(/musicalidade/gi, '')
      .replace(/roda de música/gi, '')
      .trim();
    if (cleanLabel) return cleanLabel;
  }

  if (user.specialtyActivity) {
    const act = user.specialtyActivity.trim();
    if (act.toLowerCase() === 'flauta') return 'Professor de Flauta';
    return act;
  }

  const activities = (user.assignedActivities || []).filter(
    (a) =>
      !String(a).toLowerCase().includes('musicalização') &&
      !String(a).toLowerCase().includes('musicalidade') &&
      !String(a).toLowerCase().includes('roda de música')
  );

  if (activities.length > 0) {
    const act = activities[0];
    if (act.toLowerCase() === 'flauta') return 'Professor de Flauta';
    return act;
  }

  return null;
}

/**
 * Retorna o rótulo unificado exato do cargo/função para badges da tela e exportação de PDF.
 * Garante que a coluna 'CARGO/FUNÇÃO' do PDF utilize estritamente a mesma string/rótulo formatado das badges da tela.
 */
export function getUnifiedCargoDisplay(userOrRole?: UserProfile | UserRole | string | null): string {
  const cat = detectCargoCategory(userOrRole);
  const user = typeof userOrRole === 'object' && userOrRole !== null ? userOrRole : null;
  const badge = getRoleBadgeStyle(userOrRole);

  if (cat === 'professor_prestador') {
    const oficina = getProfessorPJOficina(user);
    if (oficina) {
      return `${badge.label} - ${oficina}`;
    }
    return badge.label;
  }

  return badge.label;
}

// Estilo do selo (badge) exibido ao lado do nome/cargo do usuário.
// Aceita tanto objeto UserProfile quanto string de cargo/role/categoria.
export function getRoleBadgeStyle(userOrRole?: UserProfile | UserRole | string | null): BadgeStyle {
  const cat = detectCargoCategory(userOrRole);

  switch (cat) {
    case 'coordenador':
      return {
        bg: 'bg-amber-500/15',
        text: 'text-amber-800 dark:text-amber-300',
        border: 'border-amber-500/30',
        label: 'COORDENADOR (ADMIN)',
        className: 'bg-amber-500/20 text-amber-800 border border-amber-500/40',
      };
    case 'nutricionista':
      return {
        bg: 'bg-teal-500/15',
        text: 'text-teal-800 dark:text-teal-300',
        border: 'border-teal-500/30',
        label: 'NUTRICIONISTA',
        className: 'bg-teal-500/20 text-teal-800 border border-teal-500/40',
      };
    case 'professor_prestador':
      return {
        bg: 'bg-emerald-500/15',
        text: 'text-emerald-800 dark:text-emerald-300',
        border: 'border-emerald-500/30',
        label: 'PROFESSOR PRESTADOR (PJ)',
        className: 'bg-emerald-500/20 text-emerald-800 border border-emerald-500/40',
      };
    case 'professor_horista':
      return {
        bg: 'bg-purple-500/15',
        text: 'text-purple-800 dark:text-purple-300',
        border: 'border-purple-500/30',
        label: 'PROFESSOR HORISTA (CLT)',
        className: 'bg-purple-500/20 text-purple-800 border border-purple-500/40',
      };
    case 'auxiliar_adi':
      return {
        bg: 'bg-blue-500/15',
        text: 'text-blue-800 dark:text-blue-300',
        border: 'border-blue-500/30',
        label: 'AUXILIAR',
        className: 'bg-blue-500/20 text-blue-800 border border-blue-500/40',
      };
    case 'monitor':
    default:
      return {
        bg: 'bg-indigo-500/15',
        text: 'text-indigo-800 dark:text-indigo-300',
        border: 'border-indigo-500/30',
        label: 'MONITOR',
        className: 'bg-indigo-500/20 text-indigo-800 border border-indigo-500/40',
      };
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

// Estilo do selo de status. Aceita tanto UserProfile quanto string de status.
export function getUserStatusBadge(userOrStatus?: UserProfile | UserStatus | string | null): BadgeStyle {
  let status: string = 'ATIVO';
  let dataDesligamento: string | undefined;

  if (typeof userOrStatus === 'object' && userOrStatus !== null) {
    status = String(userOrStatus.status || 'ATIVO').toUpperCase();
    dataDesligamento = userOrStatus.dataDesligamento;
  } else if (typeof userOrStatus === 'string') {
    status = userOrStatus.toUpperCase();
  }

  switch (status) {
    case 'DESLIGADO':
      return {
        label: dataDesligamento ? `Desligado(a) em ${formatBirthDateToDisplay(dataDesligamento)}` : 'Desligado(a)',
        bg: 'bg-rose-500/15',
        text: 'text-rose-400',
        border: 'border-rose-500/30',
        className: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
      };
    case 'INATIVO':
      return {
        label: 'Inativo(a)',
        bg: 'bg-slate-500/15',
        text: 'text-slate-400',
        border: 'border-slate-500/30',
        className: 'bg-slate-500/20 text-slate-300 border border-slate-500/40',
      };
    case 'ATIVO':
    default:
      return {
        label: 'Ativo(a)',
        bg: 'bg-emerald-500/15',
        text: 'text-emerald-400',
        border: 'border-emerald-500/30',
        className: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
      };
  }
}

// ---------------------------------------------------------------------------
// Normalização e armazenamento local de usuários
// ---------------------------------------------------------------------------

export const DELETED_USERS_STORAGE_KEY = 'app_deleted_user_ids';

/**
 * Retorna o conjunto de IDs e emails de usuários permanentemente excluídos.
 * Inicializa e garante a presença dos perfis de teste expurgados como tombstones irremovíveis.
 */
export function getDeletedUserIds(): Set<string> {
  const baseSet = new Set<string>();

  // Semente obrigatória com perfis de teste permanentemente expurgados
  PURGED_EMAILS.forEach((e) => baseSet.add(e.toLowerCase().trim()));
  PURGED_USER_IDS.forEach((id) => baseSet.add(id.toLowerCase().trim()));

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(DELETED_USERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            const clean = String(item).toLowerCase().trim();
            if (clean) baseSet.add(clean);
          });
        }
      }
      // Registra no cache local para assegurar que restaurações de backup não ressuscitem esses perfis
      localStorage.setItem(DELETED_USERS_STORAGE_KEY, JSON.stringify(Array.from(baseSet)));
    }
  } catch (e) {
    console.error('Erro ao ler lista de usuários excluídos:', e);
  }
  return baseSet;
}

/**
 * Marca permanentemente um usuário como excluído no cache do navegador
 */
export function markUserAsDeleted(userId: string, email?: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const current = getDeletedUserIds();
      if (userId) current.add(userId.toLowerCase().trim());
      if (email) current.add(email.toLowerCase().trim());
      localStorage.setItem(DELETED_USERS_STORAGE_KEY, JSON.stringify(Array.from(current)));
    }
  } catch (e) {
    console.error('Erro ao marcar usuário como excluído:', e);
  }
}

export function normalizeAndDeduplicateUsers(rawUsers: UserProfile[]): UserProfile[] {
  const deletedIds = getDeletedUserIds();
  const userById = new Map<string, UserProfile>();

  PRESET_USERS.forEach((preset) => {
    const pId = (preset.id || '').toLowerCase().trim();
    const pEmail = (preset.email || '').toLowerCase().trim();
    if (!deletedIds.has(pId) && !deletedIds.has(pEmail) && !isPurgedUser(preset)) {
      userById.set(preset.id, { ...preset });
    }
  });

  if (Array.isArray(rawUsers)) {
    rawUsers.forEach((raw) => {
      if (!raw || !raw.id) return;
      const rawId = (raw.id || '').toLowerCase().trim();
      const rawEmail = (raw.email || '').toLowerCase().trim();

      // Ignora usuários permanentemente excluídos ou pertencentes aos perfis de teste expurgados
      if (deletedIds.has(rawId) || (rawEmail && deletedIds.has(rawEmail)) || isPurgedUser(raw)) {
        return;
      }

      const existing = userById.get(raw.id) || ({} as UserProfile);
      const cleanRawName = raw.name ? raw.name.replace(/\s*\([^)]*\)\s*$/, '').trim() : '';
      const cleanExistingName = existing.name ? existing.name.replace(/\s*\([^)]*\)\s*$/, '').trim() : '';
      const resolvedName = cleanRawName || cleanExistingName || (raw.name || existing.name || '');

      const normalizedUser: UserProfile = {
        ...existing,
        ...raw,
        name: resolvedName,
        email: raw.email || existing.email || '',
        cargoLabel: raw.cargoLabel || existing.cargoLabel || '',
        pixKey: raw.pixKey || existing.pixKey || '',
        baseSalary: raw.baseSalary ?? existing.baseSalary,
        status: raw.status || existing.status || ('ATIVO' as UserStatus),
        dataAdmissao: raw.dataAdmissao || existing.dataAdmissao || undefined,
        assignedActivities: Array.isArray(raw.assignedActivities)
          ? raw.assignedActivities
          : (existing.assignedActivities || []),
        specialtyActivity: raw.specialtyActivity || existing.specialtyActivity,
        assignedTurmas: Array.isArray(raw.assignedTurmas)
          ? raw.assignedTurmas
          : (existing.assignedTurmas || []),
        regimeTrabalho: raw.regimeTrabalho || existing.regimeTrabalho || 'mensalista',
        regimeContratual: raw.regimeContratual || existing.regimeContratual || undefined,
        valorHoraAula: raw.valorHoraAula !== undefined && raw.valorHoraAula !== null ? Number(raw.valorHoraAula) : existing.valorHoraAula,
        duracaoAulaMinutos: raw.duracaoAulaMinutos !== undefined ? Number(raw.duracaoAulaMinutos) : existing.duracaoAulaMinutos,
        diasGradeAutorizados: raw.diasGradeAutorizados || existing.diasGradeAutorizados,
        tetoSemanalAulas: raw.tetoSemanalAulas !== undefined ? Number(raw.tetoSemanalAulas) : existing.tetoSemanalAulas,
        ajudaDeCusto: raw.ajudaDeCusto !== undefined ? Number(raw.ajudaDeCusto) : existing.ajudaDeCusto,
        company: raw.company || raw.empresa || existing.company,
        empresa: raw.empresa || raw.company || existing.empresa,
      };
      userById.set(raw.id, normalizedUser);
    });
  }

  return Array.from(userById.values());
}

export function getLocalUsersList(): UserProfile[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('app_users_list');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const filtered = parsed.filter((u) => !isPurgedUser(u));
          const normalized = normalizeAndDeduplicateUsers(filtered);
          // Limpa cache se continha perfis expurgados
          if (filtered.length !== parsed.length) {
            localStorage.setItem('app_users_list', JSON.stringify(normalized));
          }
          return normalized;
        }
      }
    }
  } catch (e) {
    console.error('Erro ao ler usuários do localStorage:', e);
  }
  return [...PRESET_USERS];
}

export function saveLocalUsersList(users: UserProfile[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const sanitized = (users || []).filter((u) => !isPurgedUser(u));
      const normalized = normalizeAndDeduplicateUsers(sanitized);
      localStorage.setItem('app_users_list', JSON.stringify(normalized));
    }
  } catch (e) {
    console.error('Erro ao salvar usuários no localStorage:', e);
  }
}
// ---------------------------------------------------------------------------
// Usuário atualmente logado (sessão local)
// ---------------------------------------------------------------------------

const CURRENT_USER_STORAGE_KEY = 'app_current_user';

export function getStoredUser(): UserProfile | null {
  try {
    const stored = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as UserProfile;
      if (parsed && isPurgedUser(parsed)) {
        localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
        return null;
      }
      return parsed;
    }
  } catch (e) {
    console.error('Erro ao ler usuário logado do localStorage:', e);
  }
  return null;
}

export function saveStoredUser(user: UserProfile | null): void {
  try {
    if (user) {
      localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    }
  } catch (e) {
    console.error('Erro ao salvar usuário logado no localStorage:', e);
  }
}