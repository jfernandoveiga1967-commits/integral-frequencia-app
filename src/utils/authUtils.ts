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
    avatarColor: 'bg-emerald-600',
    birthDate: '1995-05-15',
    pin: '15/05/1995',
    status: 'ATIVO' as UserStatus,
    regimeTrabalho: 'prestador_aula_efetiva',
    regimeContratual: 'Prestador por Aula Efetiva (PJ/Horista Efetivo)',
    valorHoraAula: 33.06,
    duracaoAulaMinutos: 50,
    diasGradeAutorizados: ['segunda', 'terca'],
    tetoSemanalAulas: 8,
    assignedActivities: ['Flauta'],
    specialtyActivity: 'Flauta',
    assignedTurmas: [],
    allowedClassIds: [],
    allowedTabs: ['frequencia', 'ponto', 'semanario', 'relatorio', 'manual'],
    company: 'Prestação de Serviços PJ',
    empresa: 'Prestação de Serviços PJ',
    contractSchedule: '13:00 - 17:30',
    horarioInicio: '13:00',
    horarioFim: '17:30',
    workShiftType: 'continua_6h',
    ajudaDeCusto: 0,
    baseSalary: 0,
    canManageStudents: false,
    canMarkAttendance: true,
  } as UserProfile,
  {
    id: 'usr_leticia',
    name: 'Letícia',
    email: 'leticia.danca@crescercampinas.com.br',
    role: 'professor' as UserRole,
    cargoLabel: 'Professora de Balé e Dança',
    avatarColor: 'bg-purple-600',
    birthDate: '1996-03-22',
    pin: '22/03/1996',
    status: 'ATIVO' as UserStatus,
    regimeTrabalho: 'professor_horista',
    regimeContratual: 'Professor Horista (CLT)',
    valorHoraAula: 35.00,
    duracaoAulaMinutos: 50,
    diasGradeAutorizados: ['segunda', 'terca'],
    assignedActivities: ['Balé', 'Dança'],
    specialtyActivity: 'Balé',
    assignedTurmas: [],
    allowedClassIds: [],
    allowedTabs: ['frequencia', 'ponto', 'semanario', 'relatorio', 'manual'],
    company: 'Colégio Crescer',
    empresa: 'Colégio Crescer',
    contractSchedule: '13:00 - 17:30',
    horarioInicio: '13:00',
    horarioFim: '17:30',
    workShiftType: 'continua_6h',
    ajudaDeCusto: 150,
    baseSalary: 0,
    canManageStudents: false,
    canMarkAttendance: true,
  } as UserProfile,
  {
    id: 'usr_amanda',
    name: 'Amanda Oliveira',
    email: 'amanda.oliveira@crescercampinas.com.br',
    role: 'auxiliar' as UserRole,
    cargoLabel: 'Monitora do Período Integral',
    avatarColor: 'bg-rose-500',
    birthDate: '1998-04-20',
    pin: '20/04/1998',
    status: 'ATIVO' as UserStatus,
    regimeTrabalho: 'mensalista',
    regimeContratual: 'Mensalista CLT',
    assignedActivities: ['Rotina'],
    assignedTurmas: ['1º Ano A', '2º Ano A'],
    allowedClassIds: ['1º Ano A', '2º Ano A'],
    allowedTabs: ['momento', 'frequencia', 'ponto', 'cardapio', 'manual'],
    company: 'Colégio Crescer',
    empresa: 'Colégio Crescer',
    phone: '19998765432',
    contractSchedule: '07:30 - 17:30',
    horarioInicio: '07:30',
    horarioFim: '17:30',
    workShiftType: 'padrao_8h',
    canManageStudents: false,
    canMarkAttendance: true,
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
    id === 'usr_danyelpereira' ||
    name.includes('danyel') ||
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
    (label.includes('professora') && regimeTrab.includes('horista')) ||
    id === 'usr_leticia' ||
    name.includes('letícia') ||
    name.includes('leticia')
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
  const isDanyel =
    user.id === 'usr_danyelpereira' ||
    (user.name && user.name.toLowerCase().includes('danyel'));

  if (isDanyel) {
    return 'Professor de Flauta';
  }

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

export function normalizeAndDeduplicateUsers(rawUsers: UserProfile[]): UserProfile[] {
  const userById = new Map<string, UserProfile>();

  PRESET_USERS.forEach((preset) => {
    userById.set(preset.id, { ...preset });
  });

  if (Array.isArray(rawUsers)) {
    rawUsers.forEach((raw) => {
      if (!raw || !raw.id) return;
      const existing = userById.get(raw.id) || ({} as UserProfile);
      const isDanyel =
        raw.id === 'usr_danyelpereira' ||
        (raw.name && raw.name.toLowerCase().includes('danyel'));

      const cleanRawName = raw.name ? raw.name.replace(/\s*\([^)]*\)\s*$/, '').trim() : '';
      const cleanExistingName = existing.name ? existing.name.replace(/\s*\([^)]*\)\s*$/, '').trim() : '';
      const resolvedName = cleanRawName || cleanExistingName || (isDanyel ? 'Danyel Pereira' : (raw.name || existing.name || ''));

      const normalizedUser: UserProfile = {
        ...existing,
        ...raw,
        name: resolvedName,
        email: raw.email || existing.email || '',
        cargoLabel: raw.cargoLabel || existing.cargoLabel || (isDanyel ? 'Professor de Flauta' : ''),
        pixKey: raw.pixKey || existing.pixKey || '',
        baseSalary: raw.baseSalary ?? existing.baseSalary,
        status: raw.status || existing.status || ('ATIVO' as UserStatus),
        dataAdmissao: raw.dataAdmissao || existing.dataAdmissao || undefined,
        assignedActivities: isDanyel
          ? ['Flauta']
          : (Array.isArray(raw.assignedActivities)
              ? raw.assignedActivities
              : (existing.assignedActivities || [])),
        specialtyActivity: isDanyel ? 'Flauta' : (raw.specialtyActivity || existing.specialtyActivity),
        assignedTurmas: Array.isArray(raw.assignedTurmas)
          ? raw.assignedTurmas
          : (existing.assignedTurmas || []),
        regimeTrabalho: isDanyel
          ? 'prestador_aula_efetiva'
          : (raw.regimeTrabalho || existing.regimeTrabalho || 'mensalista'),
        regimeContratual: isDanyel
          ? 'Prestador por Aula Efetiva (PJ/Horista Efetivo)'
          : (raw.regimeContratual || existing.regimeContratual || undefined),
        valorHoraAula: isDanyel
          ? (raw.valorHoraAula && Number(raw.valorHoraAula) > 0 ? Number(raw.valorHoraAula) : 33.06)
          : (raw.valorHoraAula !== undefined && raw.valorHoraAula !== null ? Number(raw.valorHoraAula) : existing.valorHoraAula),
        duracaoAulaMinutos: isDanyel
          ? (raw.duracaoAulaMinutos && Number(raw.duracaoAulaMinutos) > 0 ? Number(raw.duracaoAulaMinutos) : 50)
          : (raw.duracaoAulaMinutos !== undefined ? Number(raw.duracaoAulaMinutos) : existing.duracaoAulaMinutos),
        diasGradeAutorizados: isDanyel
          ? (Array.isArray(raw.diasGradeAutorizados) && raw.diasGradeAutorizados.length > 0 ? raw.diasGradeAutorizados : ['segunda', 'terca'])
          : (raw.diasGradeAutorizados || existing.diasGradeAutorizados),
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
          return normalizeAndDeduplicateUsers(parsed);
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
      const normalized = normalizeAndDeduplicateUsers(users);
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
      return JSON.parse(stored) as UserProfile;
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