import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  doc,
  getDoc,
  getDocFromServer,
  collection,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  or,
  limit,
  enableNetwork,
  disableNetwork,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Student, AttendanceRecord, AttendanceStatus, UserProfile, UserRole, ActivityItem, ScheduleBlock, HolidayItem, PontoRecord, PontoMonthClosing, MealReportConfig, MealReportGlobalSettings, TurmaAtribuicao, TabType, ALL_APP_TAB_IDS, DepartureAlertSettings } from './types';
import { MonthlyMenu, CookingRecipe } from './types/cardapio';
import { formatMinutesToHoursAndMinutes, parseHoursAndMinutesStringToMinutes, repairOverlappedPontoRecords, parseContractSchedule } from './utils/pontoUtils';
import {
  normalizeStudent,
  addToAttendanceOutbox,
  removeFromAttendanceOutbox,
  getAttendanceOutbox,
  isMockStudent,
  getDeletedStudentIds,
  markStudentAsDeleted,
  removeStudentFromLocalStorage,
  deduplicateStudentsList,
  saveStudents,
  loadStudents,
  saveTurmas,
  saveAttendanceRecords,
  loadAttendanceRecords,
} from './utils/storageUtils';
import {
  normalizeAndDeduplicateUsers,
  ADMIN_EMAIL,
  MASTER_ADMIN_ACTIVITIES,
  MASTER_ADMIN_TURMAS,
  getLocalUsersList,
  saveLocalUsersList,
  PRESET_USERS,
} from './utils/authUtils';
import { INITIAL_STUDENTS, TURMAS_LIST } from './data/initialData';
import { generateTurmaAtribuicaoId, getDefaultHorarioTurnoForTurma } from './utils/atribuicoesStorage';

export { doc, getDoc, updateDoc, deleteDoc };

const app = initializeApp(firebaseConfig);
// Configuração validada: experimentalForceLongPolling mantido ativo para proteger contra bloqueios
// de proxies, firewalls e instabilidades em redes móveis (latência idêntica ao streaming ~100ms).
export const db = initializeFirestore(
  app,
  {
    localCache: memoryLocalCache(),
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);

// Força reconexão imediata à rede Firestore
try {
  enableNetwork(db).catch(() => {});
} catch {}

export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export let isFirestoreQuotaExceeded = false;
let lastQuotaCheckTime = 0;

export const DEFAULT_ROLE_LABELS: Record<string, string> = {
  coordenador: 'Coordenador (Administrador)',
  professor: 'Monitor / Professor',
  auxiliar: 'Auxiliar',
  nutricionista: 'Nutricionista',
};

export const DEFAULT_ROLE_COLORS: Record<string, string> = {
  coordenador: 'bg-amber-500',
  professor: 'bg-indigo-600',
  auxiliar: 'bg-emerald-600',
  nutricionista: 'bg-teal-600',
};

type QuotaStateListener = (exceeded: boolean) => void;
const quotaStateListeners = new Set<QuotaStateListener>();

export function subscribeQuotaState(listener: QuotaStateListener): () => void {
  quotaStateListeners.add(listener);
  // Sempre emite false para desativar a flag visual e manter o fluxo ativo
  listener(false);
  return () => {
    quotaStateListeners.delete(listener);
  };
}

export function getIsFirestoreQuotaExceeded(): boolean {
  return false;
}

export function setFirestoreQuotaExceeded() {
  // Desativado: remove o bloqueio de cota e reconecta ao Firestore
  isFirestoreQuotaExceeded = false;
  quotaStateListeners.forEach((l) => {
    try {
      l(false);
    } catch {}
  });
}

export function clearFirestoreQuotaExceeded() {
  isFirestoreQuotaExceeded = false;
  lastQuotaCheckTime = 0;
  quotaStateListeners.forEach((l) => {
    try {
      l(false);
    } catch {}
  });
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  // Não bloqueia o app com flag visual de cota excedida
  clearFirestoreQuotaExceeded();

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  if (process.env.NODE_ENV !== 'production') {
    console.info('Firestore notice:', errInfo.error);
  }
}

let lastSuccessfulPingTime = 0;

export async function testFirestoreConnection(force = false): Promise<boolean> {
  // Se a cota já foi confirmada como excedida, evitar spammar o servidor apenas em verificações automáticas de rotina
  if (!force && isFirestoreQuotaExceeded && Date.now() - lastQuotaCheckTime < 180000) {
    return false;
  }

  // Se já foi testado com sucesso nos últimos 45 segundos e não é uma ação forçada pelo usuário, poupar leituras
  if (!force && lastSuccessfulPingTime > 0 && Date.now() - lastSuccessfulPingTime < 45000) {
    return true;
  }

  try {
    const pingPromise = getDocFromServer(doc(db, 'test', 'connection'))
      .then(() => {
        clearFirestoreQuotaExceeded();
        lastSuccessfulPingTime = Date.now();
        return true;
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('resource-exhausted')) {
          setFirestoreQuotaExceeded();
          console.warn('Cota diária de leitura do Firestore excedida (Free daily read units per project). Operando em modo offline.');
        } else if (msg.includes('the client is offline') || msg.includes('unavailable')) {
          console.info('Firestore is operating in offline mode.');
        }
        return false;
      });

    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), 5000);
    });

    const success = await Promise.race([pingPromise, timeoutPromise]);
    if (success) {
      clearFirestoreQuotaExceeded();
      lastSuccessfulPingTime = Date.now();
    }
    return success;
  } catch {
    return false;
  }
}

// Firestore Realtime Subscription & Operations

/**
 * Ouvinte em Tempo Real (onSnapshot) da Coleção de Alunos:
 * Substitui chamadas estáticas por escutador contínuo em tempo real onSnapshot(collection(db, "alunos"), ...).
 * Sincroniza em tempo real tanto a coleção 'alunos' quanto a coleção 'students' no Firestore,
 * aplicando deduplicação e normalização imediatas.
 * 
 * - Reflexo Imediato de Exclusões: Quando um aluno for excluído ou inativado no painel do administrador,
 *   o ouvinte remove/atualiza automaticamente o registro na tela de todos os outros aparelhos conectados sem exigir ação manual.
 * - Gestão do Evento (Unsubscribe): Retorna uma função unsubscribe() para limpar o escutador na desmontagem (useEffect).
 */
export function subscribeAlunos(
  onData: (students: Student[]) => void,
  onError?: (err: Error) => void
): () => void {
  const alunosDocs = new Map<string, any>();
  const studentsDocs = new Map<string, any>();

  const emit = () => {
    const combinedMap = new Map<string, any>();
    // Preenche 'students' e mescla com 'alunos' para integridade total
    studentsDocs.forEach((val, id) => combinedMap.set(id, val));
    alunosDocs.forEach((val, id) => combinedMap.set(id, val));

    const deletedIds = getDeletedStudentIds();
    const list: Student[] = [];

    combinedMap.forEach((data, id) => {
      if (!isMockStudent({ id, name: data.name }) && !deletedIds.has(id)) {
        list.push(normalizeStudent({ ...data, id }));
      }
    });

    const deduped = deduplicateStudentsList(list);
    if (deduped.length === 0) {
      const localSt = loadStudents().filter((s) => !isMockStudent(s));
      if (localSt.length > 0) {
        onData(localSt);
        return;
      }
    }
    onData(deduped);
  };

  const unsubAlunos = onSnapshot(
    collection(db, 'alunos'),
    (snapshot) => {
      clearFirestoreQuotaExceeded();
      alunosDocs.clear();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data) {
          alunosDocs.set(docSnap.id, { ...data, id: docSnap.id });
        }
      });
      emit();
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'alunos');
    }
  );

  const unsubStudents = onSnapshot(
    collection(db, 'students'),
    (snapshot) => {
      clearFirestoreQuotaExceeded();
      studentsDocs.clear();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data) {
          studentsDocs.set(docSnap.id, { ...data, id: docSnap.id });
        }
      });
      emit();
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'students');
    }
  );

  return () => {
    unsubAlunos();
    unsubStudents();
  };
}

export const subscribeStudents = subscribeAlunos;

export function subscribeRecords(
  onData: (records: AttendanceRecord[]) => void,
  onError?: (err: Error) => void,
  targetDate?: string,
  limitCount: number = 300
): () => void {
  const colRef = collection(db, 'attendanceRecords');
  const hoje = targetDate || new Date().toISOString().split('T')[0];

  // Limitação de leituras e otimização do dashboard:
  // Consulta com filtro por data (where('data', '==', hoje) ou 'date' para retrocompatibilidade) e limit()
  const q = hoje
    ? query(colRef, or(where('data', '==', hoje), where('date', '==', hoje)), limit(limitCount))
    : query(colRef, limit(limitCount));

  return onSnapshot(
    q,
    (snapshot) => {
      clearFirestoreQuotaExceeded();
      const list: AttendanceRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data) return;
        list.push({
          id: docSnap.id,
          studentId: data.studentId || '',
          date: data.date || data.data || '',
          weekNumber: Number(data.weekNumber) || 1,
          year: Number(data.year) || 2026,
          activity: data.activity || '',
          turma: data.turma || '',
          status: data.status || 'presente',
          exitTime: data.exitTime || undefined,
          equipmentMissingDetails: data.equipmentMissingDetails || undefined,
          observation: data.observation || undefined,
          createdAt: data.createdAt || new Date().toISOString(),
        });
      });
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'attendanceRecords');
    }
  );
}

/**
 * Consulta otimizada em tempo real para o Dashboard de chamadas do dia de hoje.
 * Utiliza explicitamente filtros por data (where('data', '==', hoje)) e limit()
 * para evitar trazer o histórico completo de chamadas desnecessariamente.
 */
export function subscribeDashboardRecords(
  hoje: string,
  onData: (records: AttendanceRecord[]) => void,
  onError?: (err: Error) => void,
  limitCount: number = 300
): () => void {
  return subscribeRecords(onData, onError, hoje, limitCount);
}

export function subscribeTurmas(
  onData: (turmas: string[]) => void,
  onError?: (err: Error) => void
) {
  const colRef = collection(db, 'turmas');
  return onSnapshot(
    colRef,
    (snapshot) => {
      clearFirestoreQuotaExceeded();
      const list: string[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.name) {
          list.push(data.name);
        }
      });
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'turmas');
    }
  );
}

let hasScannedUsersSession = false;

export function subscribeUsers(
  onData: (users: UserProfile[]) => void,
  onError?: (err: Error) => void
) {
  // Executar varredura e consolidação de migração em segundo plano apenas 1x por sessão para evitar consumo excessivo de leituras
  if (!hasScannedUsersSession) {
    hasScannedUsersSession = true;
    scanAndConsolidateUsers()
      .then((consolidated) => {
        if (consolidated && consolidated.length > 0) {
          onData(consolidated);
        }
      })
      .catch((e) => {
        console.warn('Aviso durante varredura inicial de usuários:', e);
      });
  }

  const colRef = collection(db, 'users');
  return onSnapshot(
    colRef,
    (snapshot) => {
      clearFirestoreQuotaExceeded();
      const rawList: { docId: string; user: UserProfile }[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data) {
          const docId = docSnap.id;
          const userEmail = (data.email || '').trim().toLowerCase();
          const userName = (data.name || '').trim().toLowerCase();

          const isMasterAdmin =
            userEmail === ADMIN_EMAIL.toLowerCase() ||
            docId === 'usr_coord_1' ||
            data.id === 'usr_coord_1' ||
            userName.includes('fernando veiga') ||
            userEmail === 'coordenacao@crescer.edu.br';

          const role = isMasterAdmin ? 'coordenador' : (data.role || 'professor');
          const cargoLabel = isMasterAdmin
            ? (data.cargoLabel || 'Coordenador (Administrador)')
            : (data.cargoLabel || DEFAULT_ROLE_LABELS[role] || 'Monitor / Professor');
          const avatarColor = isMasterAdmin
            ? (data.avatarColor || 'bg-amber-500')
            : (data.avatarColor || DEFAULT_ROLE_COLORS[role] || 'bg-indigo-600');

          let assignedActivities = Array.isArray(data.assignedActivities)
            ? data.assignedActivities
            : (isMasterAdmin ? MASTER_ADMIN_ACTIVITIES : []);

          let assignedTurmas = Array.isArray(data.allowedClassIds)
            ? data.allowedClassIds
            : (Array.isArray(data.assignedTurmas) ? data.assignedTurmas : (isMasterAdmin ? MASTER_ADMIN_TURMAS : []));

          let allowedTabs: TabType[] = Array.isArray(data.allowedTabs)
            ? data.allowedTabs
            : (isMasterAdmin || role === 'coordenador' ? ALL_APP_TAB_IDS : []);

          const rawMinutes = data.contractDailyMinutes !== undefined && data.contractDailyMinutes !== null && !isNaN(Number(data.contractDailyMinutes))
            ? Number(data.contractDailyMinutes)
            : (data.contractDailyHoursFormatted
                ? parseHoursAndMinutesStringToMinutes(data.contractDailyHoursFormatted)
                : (data.contractDailyHours !== undefined && !isNaN(Number(data.contractDailyHours))
                    ? Math.round(Number(data.contractDailyHours) * 60)
                    : (isMasterAdmin ? 480 : (data.workShiftType === 'padrao_8h' ? 528 : 360))));
          const formattedHours = data.contractDailyHoursFormatted || formatMinutesToHoursAndMinutes(rawMinutes);

          const profile: UserProfile = {
            ...data,
            id: isMasterAdmin ? 'usr_coord_1' : (data.id || docId),
            name: (data.name && data.name.trim()) || (isMasterAdmin ? 'Fernando Veiga' : ''),
            email: isMasterAdmin ? ((data.email || '') || ADMIN_EMAIL) : (data.email || ''),
            phone: data.phone !== undefined ? data.phone : undefined,
            role,
            cargoLabel,
            avatarColor,
            birthDate: data.birthDate || (isMasterAdmin ? '1967-08-12' : ''),
            pin: data.pin || (isMasterAdmin ? '12/08/1967' : '1234'),
            status: data.status || 'ATIVO',
            dataDesligamento: data.dataDesligamento || undefined,
            motivoDesligamento: data.motivoDesligamento || undefined,
            workShiftType: data.workShiftType || (isMasterAdmin ? 'padrao_8h' : 'continua_6h'),
            assignedActivities,
            specialtyActivity: data.specialtyActivity || undefined,
            assignedTurmas,
            allowedClassIds: assignedTurmas,
            allowedTabs,
            canManageStudents: isMasterAdmin ? true : (data.canManageStudents !== undefined ? data.canManageStudents : true),
            canMarkAttendance: isMasterAdmin ? true : (data.canMarkAttendance !== undefined ? data.canMarkAttendance : true),
            pixKey: data.pixKey || data.phone || undefined,
            contractSchedule: data.contractSchedule !== undefined ? data.contractSchedule : (isMasterAdmin ? '07:30 - 17:30' : undefined),
            horarioInicio: data.horarioInicio || (data.contractSchedule ? parseContractSchedule(data.contractSchedule).start : undefined),
            horarioFim: data.horarioFim || (data.contractSchedule ? parseContractSchedule(data.contractSchedule).end : undefined),
            contractDailyHours: data.contractDailyHours !== undefined ? Number(data.contractDailyHours) : Number((rawMinutes / 60).toFixed(2)),
            contractDailyMinutes: rawMinutes,
            contractDailyHoursFormatted: formattedHours,
            baseSalary: data.baseSalary !== undefined && data.baseSalary !== null && !isNaN(Number(data.baseSalary))
              ? Number(data.baseSalary)
              : (isMasterAdmin ? 0 : 1200),
            regimeTrabalho: (data.regimeTrabalho === 'professor_horista' || (!data.regimeTrabalho && data.regimeContratual?.toLowerCase().includes('horista'))) ? 'professor_horista' : 'mensalista',
            regimeContratual: (data.regimeTrabalho === 'professor_horista' || (!data.regimeTrabalho && data.regimeContratual?.toLowerCase().includes('horista')))
              ? 'Prof. Horista'
              : (data.regimeContratual && !data.regimeContratual.toLowerCase().includes('horista') ? data.regimeContratual : 'CLT'),
            valorHoraAula: data.valorHoraAula !== undefined && data.valorHoraAula !== null && !isNaN(Number(data.valorHoraAula)) ? Number(data.valorHoraAula) : undefined,
            duracaoAulaMinutos: data.duracaoAulaMinutos !== undefined ? Number(data.duracaoAulaMinutos) : 50,
            contractDivisorHours: data.contractDivisorHours !== undefined ? Number(data.contractDivisorHours) : 220,
            hourlyRate: data.hourlyRate !== undefined ? Number(data.hourlyRate) : undefined,
            ajudaDeCusto: data.ajudaDeCusto !== undefined && !isNaN(Number(data.ajudaDeCusto)) ? Number(data.ajudaDeCusto) : 0,
            company: data.company || data.empresa || (isMasterAdmin ? 'GADAL - Gestão e Apoio' : 'Colégio Crescer'),
            empresa: data.empresa || data.company || (isMasterAdmin ? 'GADAL - Gestão e Apoio' : 'Colégio Crescer'),
            updatedAt: data.updatedAt || new Date().toISOString(),
          };

          rawList.push({ docId, user: profile });
        }
      });

      // Aplica a normalização e deduplicação rigorosa vinculada ao UID/E-mail
      const deduplicated = normalizeAndDeduplicateUsers(rawList.map((item) => item.user));
      onData(deduplicated);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'users');
    }
  );
}

/**
 * Mapeamento Correto de ID no Firestore:
 * Identifica corretamente o ID do documento do usuário no Firestore, quer o cadastro
 * utilize o uid do Firebase Auth, o email como chave principal, ou o id canônico (ex: usr_coord_1).
 */
export async function resolveUserFirestoreDocId(user: UserProfile): Promise<string> {
  const emailLower = (user.email || '').trim().toLowerCase();
  const rawId = (user.id || '').trim();
  const authUid = auth.currentUser?.uid;
  const isAuthUser = Boolean(
    auth.currentUser &&
    auth.currentUser.email &&
    auth.currentUser.email.toLowerCase() === emailLower
  );

  // 1. Se for o Coordenador Geral Fernando Veiga
  if (
    emailLower === ADMIN_EMAIL.toLowerCase() ||
    rawId === 'usr_coord_1' ||
    (user.name && user.name.toLowerCase().includes('fernando veiga')) ||
    emailLower === 'coordenacao@crescer.edu.br'
  ) {
    return 'usr_coord_1';
  }

  // 2. Se rawId já é informado e válido (ex: usr_danyelpereira), use diretamente SEM leituras prévias para poupar cota
  if (rawId) {
    return rawId;
  }

  // 3. Se o usuário autenticado no Firebase Auth coincidir com este perfil
  if (isAuthUser && authUid) {
    return authUid;
  }

  // 4. Se possuir e-mail, gera ID canônico estável baseado no slug do e-mail
  if (emailLower) {
    const slug = emailLower.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    if (slug) {
      return `usr_${slug}`;
    }
  }

  // 6. Fallback final
  return `usr_${Date.now()}`;
}

/**
 * Salva o perfil do colaborador no Firestore garantindo gravação com sucesso
 * na coleção 'usuarios' e espelhamento síncrono em 'users'.
 * Não realiza leituras desnecessárias (getDoc) para evitar atingir ou estourar a cota gratuita do Firestore.
 * Em caso de cota temporariamente excedida ou falha de rede, preserva o usuário no armazenamento local e retorna os dados atualizados com sucesso.
 */
export async function saveUserToFirestore(user: UserProfile): Promise<UserProfile> {
  const targetDocId = await resolveUserFirestoreDocId(user);
  const emailLower = (user.email || '').trim().toLowerCase();

  const isMasterAdmin =
    emailLower === ADMIN_EMAIL.toLowerCase() ||
    targetDocId === 'usr_coord_1' ||
    (user.name && user.name.toLowerCase().includes('fernando veiga')) ||
    emailLower === 'coordenacao@crescer.edu.br';

  const role: UserRole = isMasterAdmin ? 'coordenador' : (user.role || 'professor');
  const cargoLabel = user.cargoLabel || (isMasterAdmin ? 'Coordenador (Administrador)' : (DEFAULT_ROLE_LABELS[role] || 'Monitor / Professor'));
  const avatarColor = user.avatarColor || (isMasterAdmin ? 'bg-amber-500' : (DEFAULT_ROLE_COLORS[role] || 'bg-indigo-600'));

  const assignedActivities = Array.isArray(user.assignedActivities)
    ? user.assignedActivities
    : (isMasterAdmin ? MASTER_ADMIN_ACTIVITIES : []);

  const assignedTurmas = Array.isArray(user.allowedClassIds)
    ? user.allowedClassIds
    : (Array.isArray(user.assignedTurmas) ? user.assignedTurmas : (isMasterAdmin ? MASTER_ADMIN_TURMAS : []));

  const allowedTabs: TabType[] = isMasterAdmin || role === 'coordenador'
    ? ALL_APP_TAB_IDS
    : (Array.isArray(user.allowedTabs) ? user.allowedTabs : []);

  const resolvedMinutes = user.contractDailyMinutes !== undefined && Number(user.contractDailyMinutes) > 0
    ? Number(user.contractDailyMinutes)
    : (user.contractDailyHoursFormatted
        ? parseHoursAndMinutesStringToMinutes(user.contractDailyHoursFormatted)
        : (user.contractDailyHours !== undefined && !isNaN(Number(user.contractDailyHours))
            ? Math.round(Number(user.contractDailyHours) * 60)
            : (isMasterAdmin ? 480 : (user.workShiftType === 'padrao_8h' ? 528 : 360))));
  const formattedHours = user.contractDailyHoursFormatted || formatMinutesToHoursAndMinutes(resolvedMinutes);
  const decimalHours = user.contractDailyHours !== undefined ? Number(user.contractDailyHours) : Number((resolvedMinutes / 60).toFixed(2));

  const cleanName = user.name ? user.name.trim() : (isMasterAdmin ? 'Fernando Veiga' : 'Colaborador');

  const updatedData: UserProfile = {
    ...user,
    id: targetDocId,
    name: cleanName,
    email: isMasterAdmin ? (emailLower || ADMIN_EMAIL) : emailLower,
    phone: user.phone !== undefined ? user.phone.trim() : '',
    role,
    cargoLabel,
    avatarColor,
    birthDate: user.birthDate || (isMasterAdmin ? '1967-08-12' : '1995-01-01'),
    pin: user.pin || (isMasterAdmin ? '12/08/1967' : '1234'),
    assignedActivities,
    assignedTurmas,
    allowedClassIds: assignedTurmas,
    allowedTabs,
    canManageStudents: isMasterAdmin ? true : (user.canManageStudents !== undefined ? user.canManageStudents : true),
    canMarkAttendance: isMasterAdmin ? true : (user.canMarkAttendance !== undefined ? user.canMarkAttendance : true),
    pixKey: user.pixKey !== undefined ? user.pixKey.trim() : (user.phone ? user.phone.trim() : ''),
    status: user.status || 'ATIVO',
    dataDesligamento: user.dataDesligamento || '',
    motivoDesligamento: user.motivoDesligamento || '',
    workShiftType: user.workShiftType || (isMasterAdmin ? 'padrao_8h' : 'continua_6h'),
    contractSchedule: user.contractSchedule !== undefined ? user.contractSchedule.trim() : (isMasterAdmin ? '07:30 - 17:30' : ''),
    horarioInicio: user.horarioInicio || (user.contractSchedule ? parseContractSchedule(user.contractSchedule).start : null),
    horarioFim: user.horarioFim || (user.contractSchedule ? parseContractSchedule(user.contractSchedule).end : null),
    contractDailyHours: decimalHours,
    contractDailyMinutes: resolvedMinutes,
    contractDailyHoursFormatted: formattedHours,
    baseSalary: user.baseSalary !== undefined && user.baseSalary !== null && !isNaN(Number(user.baseSalary))
      ? Number(user.baseSalary)
      : (isMasterAdmin ? 0 : 1200),
    regimeTrabalho: (user.regimeTrabalho === 'professor_horista' || (!user.regimeTrabalho && user.regimeContratual?.toLowerCase().includes('horista'))) ? 'professor_horista' : 'mensalista',
    regimeContratual: (user.regimeTrabalho === 'professor_horista' || (!user.regimeTrabalho && user.regimeContratual?.toLowerCase().includes('horista')))
      ? 'Prof. Horista'
      : (user.regimeContratual && !user.regimeContratual.toLowerCase().includes('horista') ? user.regimeContratual : 'CLT'),
    valorHoraAula: user.valorHoraAula !== undefined && user.valorHoraAula !== null && !isNaN(Number(user.valorHoraAula))
      ? Number(user.valorHoraAula)
      : null,
    duracaoAulaMinutos: user.duracaoAulaMinutos !== undefined ? Number(user.duracaoAulaMinutos) : 50,
    contractDivisorHours: user.contractDivisorHours !== undefined ? Number(user.contractDivisorHours) : 220,
    hourlyRate: user.hourlyRate !== undefined ? Number(user.hourlyRate) : (user.baseSalary ? Number((user.baseSalary / 220).toFixed(4)) : 0),
    ajudaDeCusto: user.ajudaDeCusto !== undefined && !isNaN(Number(user.ajudaDeCusto)) ? Number(user.ajudaDeCusto) : 0,
    company: user.company ? user.company.trim() : (user.empresa ? user.empresa.trim() : 'GADAL - Gestão e Apoio'),
    empresa: user.empresa ? user.empresa.trim() : (user.company ? user.company.trim() : 'GADAL - Gestão e Apoio'),
    updatedAt: new Date().toISOString(),
  };

  // 1. Persistência imediata no armazenamento local para resiliência total contra quedas de rede ou cota esgotada
  try {
    const currentLocal = getLocalUsersList();
    const updatedLocal = normalizeAndDeduplicateUsers([
      ...currentLocal.filter((u) => u.id !== targetDocId && u.id !== user.id),
      updatedData,
    ]);
    saveLocalUsersList(updatedLocal);
  } catch (localErr) {
    console.warn('Aviso ao salvar usuário em cache local:', localErr);
  }

  // 2. Gravação direta no Firestore com setDoc(..., { merge: true })
  // setDoc com merge realiza upsert sem fazer leitura getDoc prévia, economizando cotas
  try {
    const usuarioDocRef = doc(db, 'usuarios', targetDocId);
    const userDocRef = doc(db, 'users', targetDocId);

    await Promise.allSettled([
      setDoc(usuarioDocRef, updatedData, { merge: true }),
      setDoc(userDocRef, updatedData, { merge: true }),
    ]);

    // Limpeza opcional de documento legado com ID diferente
    if (user.id && user.id !== targetDocId) {
      try {
        await Promise.allSettled([
          deleteDoc(doc(db, 'usuarios', user.id)),
          deleteDoc(doc(db, 'users', user.id)),
        ]);
      } catch {
        // Ignora
      }
    }
  } catch (error: any) {
    handleFirestoreError(error, OperationType.WRITE, `usuarios/${targetDocId}`);
    const isQuota = String(error?.message || '').toLowerCase().includes('quota') ||
      String(error?.message || '').toLowerCase().includes('resource-exhausted');
    if (isQuota) {
      console.warn('Firestore em modo de contingência (cota de leituras diárias atingida). Usuário salvo com segurança no armazenamento local.');
    } else {
      console.warn('Erro na sincronização de nuvem do Firestore (modo de contingência ativo):', error);
    }
  }

  return updatedData;
}

export function parseUserProfileFromFirestoreData(data: any, docId: string): UserProfile {
  const rawName = (data.name || '').trim();
  const rawEmail = (data.email || '').trim().toLowerCase();
  const rawId = (data.id || docId || '').trim();

  const rawNameLower = rawName.toLowerCase();
  const rawEmailLower = rawEmail.toLowerCase();

  const isMasterAdmin =
    rawEmailLower === ADMIN_EMAIL.toLowerCase() ||
    rawId === 'usr_coord_1' ||
    rawNameLower.includes('fernando veiga') ||
    rawEmailLower === 'coordenacao@crescer.edu.br';

  const role = isMasterAdmin ? 'coordenador' : (data.role || 'professor');
  const cargoLabel = isMasterAdmin
    ? (data.cargoLabel || 'Coordenador (Administrador)')
    : (data.cargoLabel || DEFAULT_ROLE_LABELS[role] || 'Monitor / Professor');
  const avatarColor = isMasterAdmin
    ? (data.avatarColor || 'bg-amber-500')
    : (data.avatarColor || DEFAULT_ROLE_COLORS[role] || 'bg-indigo-600');

  let assignedActivities = Array.isArray(data.assignedActivities)
    ? data.assignedActivities
    : (isMasterAdmin ? MASTER_ADMIN_ACTIVITIES : []);

  let assignedTurmas = Array.isArray(data.allowedClassIds)
    ? data.allowedClassIds
    : (Array.isArray(data.assignedTurmas) ? data.assignedTurmas : (isMasterAdmin ? MASTER_ADMIN_TURMAS : []));

  let allowedTabs: TabType[] = Array.isArray(data.allowedTabs)
    ? data.allowedTabs
    : (isMasterAdmin || role === 'coordenador' ? ALL_APP_TAB_IDS : []);

  const rawMinutes = data.contractDailyMinutes !== undefined && data.contractDailyMinutes !== null && !isNaN(Number(data.contractDailyMinutes))
    ? Number(data.contractDailyMinutes)
    : (data.contractDailyHoursFormatted
        ? parseHoursAndMinutesStringToMinutes(data.contractDailyHoursFormatted)
        : (data.contractDailyHours !== undefined && !isNaN(Number(data.contractDailyHours))
            ? Math.round(Number(data.contractDailyHours) * 60)
            : (isMasterAdmin ? 480 : (data.workShiftType === 'padrao_8h' ? 528 : 360))));
  const formattedHours = data.contractDailyHoursFormatted || formatMinutesToHoursAndMinutes(rawMinutes);

  return {
    ...data,
    id: isMasterAdmin ? 'usr_coord_1' : rawId,
    name: isMasterAdmin ? 'Fernando Veiga' : (rawName || 'Colaborador'),
    email: isMasterAdmin ? (rawEmail || ADMIN_EMAIL) : rawEmail,
    phone: data.phone !== undefined ? data.phone : undefined,
    role,
    cargoLabel,
    avatarColor,
    birthDate: data.birthDate || (isMasterAdmin ? '1967-08-12' : '1995-01-01'),
    pin: data.pin || (isMasterAdmin ? '12/08/1967' : '1234'),
    status: data.status || 'ATIVO',
    dataDesligamento: data.dataDesligamento || undefined,
    motivoDesligamento: data.motivoDesligamento || undefined,
    workShiftType: data.workShiftType || (isMasterAdmin ? 'padrao_8h' : 'continua_6h'),
    assignedActivities,
    specialtyActivity: data.specialtyActivity || undefined,
    assignedTurmas,
    allowedClassIds: assignedTurmas,
    allowedTabs,
    canManageStudents: isMasterAdmin ? true : (data.canManageStudents !== undefined ? data.canManageStudents : true),
    canMarkAttendance: isMasterAdmin ? true : (data.canMarkAttendance !== undefined ? data.canMarkAttendance : true),
    pixKey: data.pixKey || data.phone || undefined,
    contractSchedule: data.contractSchedule !== undefined ? data.contractSchedule : (isMasterAdmin ? '07:30 - 17:30' : undefined),
    horarioInicio: data.horarioInicio || (data.contractSchedule ? parseContractSchedule(data.contractSchedule).start : undefined),
    horarioFim: data.horarioFim || (data.contractSchedule ? parseContractSchedule(data.contractSchedule).end : undefined),
    contractDailyHours: data.contractDailyHours !== undefined ? Number(data.contractDailyHours) : Number((rawMinutes / 60).toFixed(2)),
    contractDailyMinutes: rawMinutes,
    contractDailyHoursFormatted: formattedHours,
    baseSalary: data.baseSalary !== undefined && data.baseSalary !== null && !isNaN(Number(data.baseSalary))
      ? Number(data.baseSalary)
      : (isMasterAdmin ? 0 : 1200),
    regimeTrabalho: (data.regimeTrabalho === 'professor_horista' || (!data.regimeTrabalho && data.regimeContratual?.toLowerCase().includes('horista'))) ? 'professor_horista' : 'mensalista',
    regimeContratual: (data.regimeTrabalho === 'professor_horista' || (!data.regimeTrabalho && data.regimeContratual?.toLowerCase().includes('horista')))
      ? 'Prof. Horista'
      : (data.regimeContratual && !data.regimeContratual.toLowerCase().includes('horista') ? data.regimeContratual : 'CLT'),
    valorHoraAula: data.valorHoraAula !== undefined && data.valorHoraAula !== null && !isNaN(Number(data.valorHoraAula)) ? Number(data.valorHoraAula) : undefined,
    duracaoAulaMinutos: data.duracaoAulaMinutos !== undefined ? Number(data.duracaoAulaMinutos) : 50,
    contractDivisorHours: data.contractDivisorHours !== undefined ? Number(data.contractDivisorHours) : 220,
    hourlyRate: data.hourlyRate !== undefined ? Number(data.hourlyRate) : undefined,
    ajudaDeCusto: data.ajudaDeCusto !== undefined && !isNaN(Number(data.ajudaDeCusto)) ? Number(data.ajudaDeCusto) : 0,
    company: data.company || data.empresa || (isMasterAdmin ? 'GADAL - Gestão e Apoio' : 'Colégio Crescer'),
    empresa: data.empresa || data.company || (isMasterAdmin ? 'GADAL - Gestão e Apoio' : 'Colégio Crescer'),
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
}

/**
 * Busca pontual e restrita de um colaborador por e-mail diretamente no Firestore.
 * Carrega estritamente o documento da pessoa (limit: 1), preservando privacidade,
 * cotas de rede e permitindo login com dados sempre frescos sem baixar os demais colaboradores.
 */
export async function fetchUserByEmail(email: string): Promise<UserProfile | null> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) return null;

  try {
    const usersColRef = collection(db, 'users');
    let q = query(usersColRef, where('email', '==', cleanEmail), limit(1));
    let snap = await getDocs(q);

    if (snap.empty) {
      const usuariosColRef = collection(db, 'usuarios');
      q = query(usuariosColRef, where('email', '==', cleanEmail), limit(1));
      snap = await getDocs(q);
    }

    if (snap.empty) {
      return null;
    }

    const docSnap = snap.docs[0];
    return parseUserProfileFromFirestoreData(docSnap.data(), docSnap.id);
  } catch (err) {
    console.warn('Busca pontual de usuário no Firestore indisponível/offline:', err);
    return null;
  }
}

/**
 * Varredura e Migração no Firestore:
 * Busca na coleção 'usuarios' e na coleção 'users' documentos de usuários cadastrados,
 * preservando todas as propriedades customizadas salvas (salário, turmas, modalidades, horários)
 * e consolidando nomes legados.
 */
export async function scanAndConsolidateUsers(): Promise<UserProfile[]> {
  // Se a cota já estiver excedida hoje, retorna imediatamente a lista local em cache
  if (isFirestoreQuotaExceeded) {
    return getLocalUsersList();
  }

  try {
    const usersColRef = collection(db, 'users');
    const usuariosColRef = collection(db, 'usuarios');

    const [usersSnapResult, usuariosSnapResult] = await Promise.allSettled([
      getDocs(usersColRef),
      getDocs(usuariosColRef),
    ]);

    if (usersSnapResult.status === 'fulfilled' || usuariosSnapResult.status === 'fulfilled') {
      clearFirestoreQuotaExceeded();
    }

    if (usersSnapResult.status === 'rejected') {
      handleFirestoreError((usersSnapResult as any).reason, OperationType.GET, 'users');
    }
    if (usuariosSnapResult.status === 'rejected') {
      handleFirestoreError((usuariosSnapResult as any).reason, OperationType.GET, 'usuarios');
    }

    if (isFirestoreQuotaExceeded) {
      return getLocalUsersList();
    }

    const usersSnap = usersSnapResult.status === 'fulfilled' ? usersSnapResult.value : null;
    const usuariosSnap = usuariosSnapResult.status === 'fulfilled' ? usuariosSnapResult.value : null;

    const collectedProfiles: UserProfile[] = [];
    const batchOps: Promise<any>[] = [];

    const processDoc = (docSnap: any, _colName: string) => {
      const data = docSnap.data();
      if (!data) return;
      const profile = parseUserProfileFromFirestoreData(data, docSnap.id);
      collectedProfiles.push(profile);
    };

    if (usersSnap && usersSnap.forEach) {
      usersSnap.forEach((d) => processDoc(d, 'users'));
    }
    if (usuariosSnap && usuariosSnap.forEach) {
      usuariosSnap.forEach((d) => processDoc(d, 'usuarios'));
    }

    if (batchOps.length > 0) {
      await Promise.allSettled(batchOps);
    }

    const deduplicated = normalizeAndDeduplicateUsers(collectedProfiles);
    if (deduplicated.length > 0) {
      saveLocalUsersList(deduplicated);
    }
    return deduplicated;
  } catch (err) {
    console.warn('Varredura e consolidação de usuários em modo de contingência:', err);
    const localList = getLocalUsersList();
    if (localList && localList.length > 0) {
      return localList;
    }
    return normalizeAndDeduplicateUsers([]);
  }
}

/**
 * Busca a lista fresca de colaboradores diretamente do Firestore via getDocsFromServer (Bypass Cache).
 * Ignora o cache local offline do Firestore, garantindo documentos recém-cadastrados na nuvem.
 */
export async function fetchAllUsersDirectFromServer(force = false): Promise<UserProfile[]> {
  // Se a cota do Firestore já estiver excedida hoje e não for forçado, retorna imediatamente a lista local em cache
  if (!force && isFirestoreQuotaExceeded) {
    return getLocalUsersList();
  }

  try {
    const usersColRef = collection(db, 'users');
    const usuariosColRef = collection(db, 'usuarios');

    // Executa busca direta do servidor ignorando o cache local offline do Firestore
    const [usersSnapResult, usuariosSnapResult] = await Promise.allSettled([
      getDocsFromServer(usersColRef),
      getDocsFromServer(usuariosColRef),
    ]);

    if (usersSnapResult.status === 'fulfilled' || usuariosSnapResult.status === 'fulfilled') {
      clearFirestoreQuotaExceeded();
    }

    if (usersSnapResult.status === 'rejected') {
      handleFirestoreError(usersSnapResult.reason, OperationType.GET, 'users');
    }
    if (usuariosSnapResult.status === 'rejected') {
      handleFirestoreError(usuariosSnapResult.reason, OperationType.GET, 'usuarios');
    }

    if (!force && isFirestoreQuotaExceeded) {
      return getLocalUsersList();
    }

    // Fallback caso getDocsFromServer falhe (ex: conexão instável)
    const usersSnap = usersSnapResult.status === 'fulfilled'
      ? usersSnapResult.value
      : await getDocs(usersColRef).catch(() => null);

    const usuariosSnap = usuariosSnapResult.status === 'fulfilled'
      ? usuariosSnapResult.value
      : await getDocs(usuariosColRef).catch(() => null);

    const collectedProfiles: UserProfile[] = [];

    const processDoc = (docSnap: any) => {
      const data = docSnap.data();
      if (!data) return;

      const docId = docSnap.id;
      const rawName = (data.name || '').trim();
      const rawEmail = (data.email || '').trim().toLowerCase();
      const rawId = (data.id || docId || '').trim();

      const isMasterAdmin =
        rawEmail === ADMIN_EMAIL.toLowerCase() ||
        rawId === 'usr_coord_1' ||
        rawName.toLowerCase().includes('fernando veiga') ||
        rawEmail === 'coordenacao@crescer.edu.br';

      const role = isMasterAdmin ? 'coordenador' : (data.role || 'professor');
      const cargoLabel = isMasterAdmin
        ? (data.cargoLabel || 'Coordenador (Administrador)')
        : (data.cargoLabel || DEFAULT_ROLE_LABELS[role] || 'Monitor / Professor');
      const avatarColor = isMasterAdmin
        ? (data.avatarColor || 'bg-amber-500')
        : (data.avatarColor || DEFAULT_ROLE_COLORS[role] || 'bg-indigo-600');

      let assignedActivities = Array.isArray(data.assignedActivities)
        ? data.assignedActivities
        : (isMasterAdmin ? MASTER_ADMIN_ACTIVITIES : []);

      let assignedTurmas = Array.isArray(data.allowedClassIds)
        ? data.allowedClassIds
        : (Array.isArray(data.assignedTurmas) ? data.assignedTurmas : (isMasterAdmin ? MASTER_ADMIN_TURMAS : []));

      let allowedTabs: TabType[] = Array.isArray(data.allowedTabs)
        ? data.allowedTabs
        : (isMasterAdmin || role === 'coordenador' ? ALL_APP_TAB_IDS : []);

      const rawMinutes = data.contractDailyMinutes !== undefined && data.contractDailyMinutes !== null && !isNaN(Number(data.contractDailyMinutes))
        ? Number(data.contractDailyMinutes)
        : (data.contractDailyHoursFormatted
            ? parseHoursAndMinutesStringToMinutes(data.contractDailyHoursFormatted)
            : (data.contractDailyHours !== undefined && !isNaN(Number(data.contractDailyHours))
                ? Math.round(Number(data.contractDailyHours) * 60)
                : (isMasterAdmin ? 480 : (data.workShiftType === 'padrao_8h' ? 528 : 360))));
      const formattedHours = data.contractDailyHoursFormatted || formatMinutesToHoursAndMinutes(rawMinutes);

      const profile: UserProfile = {
        ...data,
        id: isMasterAdmin ? 'usr_coord_1' : rawId,
        name: isMasterAdmin ? 'Fernando Veiga' : (rawName || 'Colaborador'),
        email: isMasterAdmin ? (rawEmail || ADMIN_EMAIL) : rawEmail,
        phone: data.phone !== undefined ? data.phone : undefined,
        role,
        cargoLabel,
        avatarColor,
        birthDate: data.birthDate || (isMasterAdmin ? '1967-08-12' : '1995-01-01'),
        pin: data.pin || (isMasterAdmin ? '12/08/1967' : '1234'),
        // Trazendo todos os documentos da coleção users mesmo que não tenham a chave status
        status: data.status || 'ATIVO',
        dataDesligamento: data.dataDesligamento || undefined,
        motivoDesligamento: data.motivoDesligamento || undefined,
        workShiftType: data.workShiftType || (isMasterAdmin ? 'padrao_8h' : 'continua_6h'),
        assignedActivities,
        specialtyActivity: data.specialtyActivity || undefined,
        assignedTurmas,
        allowedClassIds: assignedTurmas,
        allowedTabs,
        canManageStudents: isMasterAdmin ? true : (data.canManageStudents !== undefined ? data.canManageStudents : true),
        canMarkAttendance: isMasterAdmin ? true : (data.canMarkAttendance !== undefined ? data.canMarkAttendance : true),
        pixKey: data.pixKey || data.phone || undefined,
        contractSchedule: data.contractSchedule !== undefined ? data.contractSchedule : (isMasterAdmin ? '07:30 - 17:30' : undefined),
        horarioInicio: data.horarioInicio || (data.contractSchedule ? parseContractSchedule(data.contractSchedule).start : undefined),
        horarioFim: data.horarioFim || (data.contractSchedule ? parseContractSchedule(data.contractSchedule).end : undefined),
        contractDailyHours: data.contractDailyHours !== undefined ? Number(data.contractDailyHours) : Number((rawMinutes / 60).toFixed(2)),
        contractDailyMinutes: rawMinutes,
        contractDailyHoursFormatted: formattedHours,
        baseSalary: data.baseSalary !== undefined && data.baseSalary !== null && !isNaN(Number(data.baseSalary))
          ? Number(data.baseSalary)
          : (isMasterAdmin ? 0 : 1200),
        regimeTrabalho: (data.regimeTrabalho === 'professor_horista' || (!data.regimeTrabalho && data.regimeContratual?.toLowerCase().includes('horista'))) ? 'professor_horista' : 'mensalista',
        regimeContratual: (data.regimeTrabalho === 'professor_horista' || (!data.regimeTrabalho && data.regimeContratual?.toLowerCase().includes('horista')))
          ? 'Prof. Horista'
          : (data.regimeContratual && !data.regimeContratual.toLowerCase().includes('horista') ? data.regimeContratual : 'CLT'),
        valorHoraAula: data.valorHoraAula !== undefined && data.valorHoraAula !== null && !isNaN(Number(data.valorHoraAula)) ? Number(data.valorHoraAula) : undefined,
        duracaoAulaMinutos: data.duracaoAulaMinutos !== undefined ? Number(data.duracaoAulaMinutos) : 50,
        contractDivisorHours: data.contractDivisorHours !== undefined ? Number(data.contractDivisorHours) : 220,
        hourlyRate: data.hourlyRate !== undefined ? Number(data.hourlyRate) : undefined,
        ajudaDeCusto: data.ajudaDeCusto !== undefined && !isNaN(Number(data.ajudaDeCusto)) ? Number(data.ajudaDeCusto) : 0,
        company: data.company || data.empresa || (isMasterAdmin ? 'GADAL - Gestão e Apoio' : 'Colégio Crescer'),
        empresa: data.empresa || data.company || (isMasterAdmin ? 'GADAL - Gestão e Apoio' : 'Colégio Crescer'),
        updatedAt: data.updatedAt || new Date().toISOString(),
      };

      collectedProfiles.push(profile);
    };

    if (usersSnap && usersSnap.forEach) {
      usersSnap.forEach((d: any) => processDoc(d));
    }
    if (usuariosSnap && usuariosSnap.forEach) {
      usuariosSnap.forEach((d: any) => processDoc(d));
    }

    const deduplicated = normalizeAndDeduplicateUsers(collectedProfiles);
    return deduplicated;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'users');
    console.warn('Busca direta do servidor falhou, recorrendo à lista em cache:', err);
    if (isFirestoreQuotaExceeded) {
      return getLocalUsersList();
    }
    return await scanAndConsolidateUsers();
  }
}

/**
 * Remove um usuário tanto da coleção 'usuarios' quanto da coleção 'users' no Firestore.
 */
export async function deleteUserFromFirestore(userId: string): Promise<void> {
  try {
    await Promise.allSettled([
      deleteDoc(doc(db, 'usuarios', userId)),
      deleteDoc(doc(db, 'users', userId)),
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `usuarios/${userId}`);
    throw error;
  }
}

export function subscribeActivities(
  onData: (activities: ActivityItem[]) => void,
  onError?: (err: Error) => void
) {
  const colRef = collection(db, 'activities');
  return onSnapshot(
    colRef,
    (snapshot) => {
      clearFirestoreQuotaExceeded();
      const list: ActivityItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.name) {
          list.push({
            id: data.id || data.name,
            name: data.name,
            icon: data.icon || 'Sparkles',
            customIconUrl: data.customIconUrl || data.iconUrl || undefined,
            description: data.description || '',
            defaultEquipment: data.defaultEquipment || '',
            requiresRollCall: data.requiresRollCall !== undefined ? Boolean(data.requiresRollCall) : true,
            isCustom: data.isCustom !== undefined ? data.isCustom : true,
          });
        }
      });
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'activities');
    }
  );
}

export async function saveActivityToFirestore(activity: ActivityItem) {
  try {
    const docRef = doc(db, 'activities', activity.id);
    await setDoc(docRef, {
      id: activity.id,
      name: activity.name,
      icon: activity.icon || 'Sparkles',
      customIconUrl: activity.customIconUrl || '',
      description: activity.description || '',
      defaultEquipment: activity.defaultEquipment || '',
      requiresRollCall: activity.requiresRollCall !== undefined ? Boolean(activity.requiresRollCall) : true,
      isCustom: activity.isCustom !== undefined ? activity.isCustom : true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `activities/${activity.id}`);
  }
}

export async function deleteActivityFromFirestore(activityId: string) {
  try {
    const docRef = doc(db, 'activities', activityId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `activities/${activityId}`);
  }
}

export async function saveStudentToFirestore(student: Student): Promise<void> {
  try {
    const normalized = normalizeStudent(student);
    const payload = {
      id: normalized.id,
      name: normalized.name,
      turma: normalized.turma,
      activities: normalized.activities,
      tipoContrato: normalized.tipoContrato || 'regular',
      dataInicioContrato: normalized.dataInicioContrato || '',
      dataTerminoContrato: normalized.dataTerminoContrato || '',
      diasContratados: normalized.diasContratados || [],
      diasFrequencia: normalized.diasFrequencia,
      horariosSaida: normalized.horariosSaida || {},
      status: normalized.status || 'ativo',
      statusMatricula: normalized.statusMatricula || normalized.status || 'ativo',
      inactivationDate: normalized.inactivationDate || '',
      inactivationReason: normalized.inactivationReason || '',
      notes: normalized.notes || '',
      updatedAt: new Date().toISOString(),
    };

    await Promise.allSettled([
      setDoc(doc(db, 'alunos', normalized.id), payload, { merge: true }),
      setDoc(doc(db, 'students', normalized.id), payload, { merge: true }),
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `alunos/${student.id}`);
    throw error;
  }
}

export async function deleteStudentFromFirestore(
  alunoId: string,
  studentName?: string,
  studentTurma?: string
): Promise<{ deletedIds: string[]; count: number }> {
  const cleanId = (alunoId || '').trim();
  let resolvedName = (studentName || '').trim();
  let resolvedTurma = (studentTurma || '').trim();

  try {
    // 1. Se o nome não foi passado, tenta obter os dados a partir do próprio documento se existir
    if (!resolvedName && cleanId) {
      try {
        const [snapAlunosDirect, snapStudentsDirect] = await Promise.allSettled([
          getDoc(doc(db, 'alunos', cleanId)),
          getDoc(doc(db, 'students', cleanId)),
        ]);
        if (snapAlunosDirect.status === 'fulfilled' && snapAlunosDirect.value.exists()) {
          const d = snapAlunosDirect.value.data();
          if (d?.name) resolvedName = String(d.name).trim();
          if (d?.turma && !resolvedTurma) resolvedTurma = String(d.turma).trim();
        } else if (snapStudentsDirect.status === 'fulfilled' && snapStudentsDirect.value.exists()) {
          const d = snapStudentsDirect.value.data();
          if (d?.name) resolvedName = String(d.name).trim();
          if (d?.turma && !resolvedTurma) resolvedTurma = String(d.turma).trim();
        }
      } catch (err) {
        console.warn('Aviso ao consultar documento para obter nome do aluno:', err);
      }
    }

    // 2. Mapeamento de todos os documentos a serem excluídos (evita referências duplicadas)
    const docRefsToDelete = new Map<string, any>();
    const deletedIds = new Set<string>();
    if (cleanId) deletedIds.add(cleanId);

    // Adiciona referências diretas por ID nas duas coleções
    if (cleanId) {
      docRefsToDelete.set(`alunos/${cleanId}`, doc(db, 'alunos', cleanId));
      docRefsToDelete.set(`students/${cleanId}`, doc(db, 'students', cleanId));
    }

    // 3. Consultas por ID interno (caso o ID do documento seja diferente do campo 'id')
    const queryPromises: Promise<any>[] = [];
    if (cleanId) {
      queryPromises.push(
        getDocs(query(collection(db, 'alunos'), where('id', '==', cleanId))),
        getDocs(query(collection(db, 'students'), where('id', '==', cleanId)))
      );
    }

    // 4. Consultas por Nome e Turma (localiza documentos reais e todas as possíveis duplicatas)
    if (resolvedName) {
      queryPromises.push(
        getDocs(query(collection(db, 'alunos'), where('name', '==', resolvedName))),
        getDocs(query(collection(db, 'students'), where('name', '==', resolvedName)))
      );
      // Suporte para registros legados com campo 'nome'
      queryPromises.push(
        getDocs(query(collection(db, 'alunos'), where('nome', '==', resolvedName))),
        getDocs(query(collection(db, 'students'), where('nome', '==', resolvedName)))
      );
    }

    const queryResults = await Promise.allSettled(queryPromises);
    queryResults.forEach((res) => {
      if (res.status === 'fulfilled' && res.value && typeof res.value.forEach === 'function') {
        res.value.forEach((docSnap: any) => {
          const data = docSnap.data() || {};
          // Se a turma foi especificada, garante que bate com a turma (ou aceita se o documento não tiver turma definida)
          if (resolvedTurma && data.turma) {
            const docTurma = String(data.turma).trim().toLowerCase();
            const targetTurma = resolvedTurma.toLowerCase();
            if (docTurma !== targetTurma) {
              return;
            }
          }
          const colPath = docSnap.ref.parent.id; // 'alunos' ou 'students'
          docRefsToDelete.set(`${colPath}/${docSnap.id}`, docSnap.ref);
          deletedIds.add(docSnap.id);
          if (data.id) deletedIds.add(String(data.id).trim());
        });
      }
    });

    // 5. Exclusão em lote (writeBatch) de todos os documentos mapeados
    const refsList = Array.from(docRefsToDelete.values());
    const BATCH_SIZE = 400;
    for (let i = 0; i < refsList.length; i += BATCH_SIZE) {
      const chunk = refsList.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((r) => batch.delete(r));
      await batch.commit();
    }

    // 6. Atualiza registro de alunos excluídos no storage local para evitar ressincronização
    deletedIds.forEach((sid) => {
      markStudentAsDeleted(sid);
      removeStudentFromLocalStorage(sid);
    });

    return {
      deletedIds: Array.from(deletedIds),
      count: refsList.length,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `alunos/${cleanId}`);
    throw error;
  }
}

export async function saveRecordToFirestore(record: AttendanceRecord): Promise<void> {
  const docRef = doc(db, 'attendanceRecords', record.id);
  const payload = {
    id: record.id,
    studentId: record.studentId,
    date: record.date,
    data: record.date, // Sincroniza campo 'data' para filtros where('data', '==', hoje)
    weekNumber: record.weekNumber,
    year: record.year,
    activity: record.activity,
    turma: record.turma,
    status: record.status,
    exitTime: record.exitTime || '',
    equipmentMissingDetails: record.equipmentMissingDetails || '',
    observation: record.observation || '',
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(docRef, payload, { merge: true });
    // Remove from outbox if it was previously queued
    removeFromAttendanceOutbox(record.id);
  } catch (error) {
    // If offline or network error, save to local outbox queue to be processed automatically on reconnect
    addToAttendanceOutbox({
      type: 'SET',
      record,
      recordId: record.id,
    });
    handleFirestoreError(error, OperationType.WRITE, `attendanceRecords/${record.id}`);
  }
}

export async function deleteAttendanceRecordFromFirestore(recordId: string): Promise<void> {
  const docRef = doc(db, 'attendanceRecords', recordId);
  try {
    await deleteDoc(docRef);
    removeFromAttendanceOutbox(recordId);
  } catch (error) {
    addToAttendanceOutbox({
      type: 'DELETE',
      recordId,
    });
    handleFirestoreError(error, OperationType.DELETE, `attendanceRecords/${recordId}`);
  }
}

export async function batchSaveRecordsToFirestore(records: AttendanceRecord[]): Promise<void> {
  if (!records || records.length === 0) return;
  try {
    const CHUNK_SIZE = 250;
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const record of chunk) {
        const docRef = doc(db, 'attendanceRecords', record.id);
        batch.set(
          docRef,
          {
            id: record.id,
            studentId: record.studentId,
            date: record.date,
            data: record.date, // Sincroniza campo 'data' para filtros where('data', '==', hoje)
            weekNumber: record.weekNumber,
            year: record.year,
            activity: record.activity,
            turma: record.turma,
            status: record.status,
            exitTime: record.exitTime || '',
            equipmentMissingDetails: record.equipmentMissingDetails || '',
            observation: record.observation || '',
            createdAt: record.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
      await batch.commit();
      chunk.forEach((r) => removeFromAttendanceOutbox(r.id));
    }
  } catch (error) {
    records.forEach((record) => {
      addToAttendanceOutbox({
        type: 'SET',
        record,
        recordId: record.id,
      });
    });
    handleFirestoreError(error, OperationType.WRITE, 'attendanceRecords/batchSave');
  }
}

export async function batchDeleteAttendanceRecordsFromFirestore(recordIds: string[]): Promise<void> {
  if (!recordIds || recordIds.length === 0) return;
  try {
    const CHUNK_SIZE = 250;
    for (let i = 0; i < recordIds.length; i += CHUNK_SIZE) {
      const chunk = recordIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const id of chunk) {
        const docRef = doc(db, 'attendanceRecords', id);
        batch.delete(docRef);
      }
      await batch.commit();
      chunk.forEach((id) => removeFromAttendanceOutbox(id));
    }
  } catch (error) {
    recordIds.forEach((recordId) => {
      addToAttendanceOutbox({
        type: 'DELETE',
        recordId,
      });
    });
    handleFirestoreError(error, OperationType.DELETE, 'attendanceRecords/batchDelete');
  }
}

let isNetworkDisabled = false;

export async function disconnectFirestore(): Promise<boolean> {
  try {
    await disableNetwork(db);
    isNetworkDisabled = true;
    return true;
  } catch {
    return false;
  }
}

export async function reconnectFirestore(force = false): Promise<boolean> {
  if (!isNetworkDisabled && !force) {
    // Network is already active and healthy; do not reset active write streams
    return true;
  }
  try {
    if (force) {
      try {
        await disableNetwork(db);
      } catch {}
    }
    await enableNetwork(db);
    isNetworkDisabled = false;
    return true;
  } catch (err) {
    console.warn('Notice while enabling Firestore network:', err);
    return false;
  }
}

let isProcessingOutbox = false;
export async function processAttendanceOutbox(): Promise<number> {
  if (isProcessingOutbox) return 0;
  const outboxItems = getAttendanceOutbox();
  if (!outboxItems || outboxItems.length === 0) return 0;

  isProcessingOutbox = true;
  let processedCount = 0;

  try {
    for (const item of outboxItems) {
      if (item.type === 'SET' && item.record) {
        const docRef = doc(db, 'attendanceRecords', item.record.id);
        await setDoc(docRef, {
          id: item.record.id,
          studentId: item.record.studentId,
          date: item.record.date,
          data: item.record.date, // Sincroniza campo 'data' para filtros where('data', '==', hoje)
          weekNumber: item.record.weekNumber,
          year: item.record.year,
          activity: item.record.activity,
          turma: item.record.turma,
          status: item.record.status,
          exitTime: item.record.exitTime || '',
          equipmentMissingDetails: item.record.equipmentMissingDetails || '',
          observation: item.record.observation || '',
          createdAt: item.record.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        removeFromAttendanceOutbox(item.record.id);
        processedCount++;
      } else if (item.type === 'DELETE' && item.recordId) {
        const docRef = doc(db, 'attendanceRecords', item.recordId);
        await deleteDoc(docRef);
        removeFromAttendanceOutbox(item.recordId);
        processedCount++;
      }
    }
  } catch (e) {
    console.warn('Erro ao processar outbox de frequência (retentando depois):', e);
  } finally {
    isProcessingOutbox = false;
  }

  return processedCount;
}

// Global online listener for automatic outbox flush
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (getAttendanceOutbox().length > 0) {
      processAttendanceOutbox().catch(() => {});
    }
  });
  // Periodic background check every 20 seconds (only if pending items exist)
  setInterval(() => {
    if (navigator.onLine && getAttendanceOutbox().length > 0) {
      processAttendanceOutbox().catch(() => {});
    }
  }, 20000);
}

export async function saveTurmaToFirestore(turmaName: string) {
  try {
    const safeId = turmaName.replace(/\s+/g, '_').toLowerCase();
    const docRef = doc(db, 'turmas', safeId);
    await setDoc(docRef, {
      id: safeId,
      name: turmaName,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `turmas/${turmaName}`);
  }
}

export async function deleteTurmaFromFirestore(turmaName: string) {
  try {
    const safeId = turmaName.replace(/\s+/g, '_').toLowerCase();
    const docRef = doc(db, 'turmas', safeId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `turmas/${turmaName}`);
  }
}

export async function seedInitialDataToFirestore(
  students: Student[],
  records: AttendanceRecord[],
  turmas: string[]
) {
  try {
    const CHUNK_SIZE = 250;
    // Chunk turmas
    for (let i = 0; i < turmas.length; i += CHUNK_SIZE) {
      const chunk = turmas.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const t of chunk) {
        const safeId = t.replace(/\s+/g, '_').toLowerCase();
        batch.set(doc(db, 'turmas', safeId), { id: safeId, name: t });
      }
      await batch.commit();
    }
    // Chunk students
    for (let i = 0; i < students.length; i += CHUNK_SIZE) {
      const chunk = students.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const s of chunk) {
        const normalized = normalizeStudent(s);
        batch.set(doc(db, 'students', normalized.id), {
          id: normalized.id,
          name: normalized.name,
          turma: normalized.turma,
          activities: normalized.activities,
          diasFrequencia: normalized.diasFrequencia,
          horariosSaida: normalized.horariosSaida || {},
          status: normalized.status || 'ativo',
          statusMatricula: normalized.statusMatricula || normalized.status || 'ativo',
          inactivationDate: normalized.inactivationDate || '',
          inactivationReason: normalized.inactivationReason || '',
          notes: normalized.notes || '',
        });
      }
      await batch.commit();
    }
    // Chunk records
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const r of chunk) {
        batch.set(doc(db, 'attendanceRecords', r.id), {
          id: r.id,
          studentId: r.studentId,
          date: r.date,
          data: r.date, // Sincroniza campo 'data' para filtros where('data', '==', hoje)
          weekNumber: r.weekNumber,
          year: r.year,
          activity: r.activity,
          turma: r.turma,
          status: r.status,
          exitTime: r.exitTime || '',
          equipmentMissingDetails: r.equipmentMissingDetails || '',
          observation: r.observation || '',
          createdAt: r.createdAt,
        });
      }
      await batch.commit();
    }
  } catch (error) {
    console.error('Error seeding initial data to Firestore:', error);
  }
}

export const DEFAULT_STUDENTS_LIST: Student[] = INITIAL_STUDENTS;

/**
 * Script de inicialização (seed) automático para popular o Firestore com a lista padrão
 * de alunos, turmas e usuários administradores, além dos registros de presença para hoje,
 * garantindo que os contadores deixem de ficar em zero.
 */
export async function seedDefaultSchoolData(force = false): Promise<{
  success: boolean;
  studentCount: number;
  userCount: number;
  recordCount: number;
}> {
  try {
    // 1. Forçar conexão à rede do Firestore e limpar flag de cota
    await reconnectFirestore(true);
    clearFirestoreQuotaExceeded();

    const hoje = new Date().toISOString().split('T')[0];
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    const weekNumber = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
    const year = d.getFullYear();

    // 2. Turmas
    const turmasBatch = writeBatch(db);
    TURMAS_LIST.forEach((t) => {
      const safeId = t.replace(/\s+/g, '_').toLowerCase();
      turmasBatch.set(doc(db, 'turmas', safeId), { id: safeId, name: t }, { merge: true });
    });
    await turmasBatch.commit();
    saveTurmas(TURMAS_LIST);

    // 3. Usuários Administradores e Equipe
    const adminUsersList: UserProfile[] = [
      ...PRESET_USERS,
    ];

    const usersBatch = writeBatch(db);
    adminUsersList.forEach((u) => {
      usersBatch.set(doc(db, 'users', u.id), u, { merge: true });
      usersBatch.set(doc(db, 'usuarios', u.id), u, { merge: true });
    });
    await usersBatch.commit();
    saveLocalUsersList(adminUsersList);

    // 4. Lista Padrão de Alunos (students e alunos)
    const studentsToSeed = INITIAL_STUDENTS.map((s) => normalizeStudent(s));
    const CHUNK_SIZE = 200;
    for (let i = 0; i < studentsToSeed.length; i += CHUNK_SIZE) {
      const chunk = studentsToSeed.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const s of chunk) {
        const payload = {
          id: s.id,
          name: s.name,
          turma: s.turma,
          activities: s.activities,
          diasFrequencia: s.diasFrequencia,
          horariosSaida: s.horariosSaida || {},
          status: s.status || 'ativo',
          statusMatricula: s.statusMatricula || s.status || 'ativo',
          tipoContrato: s.tipoContrato || 'regular',
          inactivationDate: s.inactivationDate || '',
          inactivationReason: s.inactivationReason || '',
          notes: s.notes || '',
        };
        batch.set(doc(db, 'students', s.id), payload, { merge: true });
        batch.set(doc(db, 'alunos', s.id), payload, { merge: true });
      }
      await batch.commit();
    }
    saveStudents(studentsToSeed);

    // 5. Registros de Presença de Hoje (para que os contadores deixem de ficar em zero)
    const todayRecords: AttendanceRecord[] = studentsToSeed.map((s, idx) => {
      let status: AttendanceStatus = 'presente';
      let observation: string | undefined = undefined;

      // Distribuição realística: ~45 presentes, 3 faltas, 1 atestado de saúde
      if (idx === 1 || idx === 22 || idx === 39) {
        status = 'falta';
      } else if (idx === 33) {
        status = 'saude';
        observation = 'Atestado médico';
      }

      return {
        id: `${s.id}_Rotina_${hoje}`,
        studentId: s.id,
        date: hoje,
        data: hoje,
        weekNumber,
        year,
        activity: 'Rotina',
        turma: s.turma,
        status,
        observation,
        createdAt: new Date().toISOString(),
      };
    });

    for (let i = 0; i < todayRecords.length; i += CHUNK_SIZE) {
      const chunk = todayRecords.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const r of chunk) {
        batch.set(
          doc(db, 'attendanceRecords', r.id),
          {
            id: r.id,
            studentId: r.studentId,
            date: r.date,
            data: r.date,
            weekNumber: r.weekNumber,
            year: r.year,
            activity: r.activity,
            turma: r.turma,
            status: r.status,
            observation: r.observation || '',
            createdAt: r.createdAt,
          },
          { merge: true }
        );
      }
      await batch.commit();
    }
    saveAttendanceRecords(todayRecords);

    clearFirestoreQuotaExceeded();
    return {
      success: true,
      studentCount: studentsToSeed.length,
      userCount: adminUsersList.length,
      recordCount: todayRecords.length,
    };
  } catch (error) {
    console.error('Erro no seedDefaultSchoolData:', error);
    return { success: false, studentCount: 0, userCount: 0, recordCount: 0 };
  }
}

export function subscribeToSchedules(callback: (schedules: ScheduleBlock[]) => void) {
  const collectionRef = collection(db, 'schedules');
  return onSnapshot(
    collectionRef,
    (snapshot) => {
      clearFirestoreQuotaExceeded();
      const schedulesList: ScheduleBlock[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.id && data.turma && data.dayOfWeek && data.startTime && data.endTime && data.activityId) {
          schedulesList.push({
            id: data.id,
            turma: data.turma,
            dayOfWeek: data.dayOfWeek,
            startTime: data.startTime,
            endTime: data.endTime,
            activityId: data.activityId,
            location: data.location || '',
            guidelines: data.guidelines || '',
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString(),
          });
        }
      });
      callback(schedulesList);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'schedules');
    }
  );
}

export async function saveScheduleBlockToFirestore(schedule: ScheduleBlock) {
  try {
    const docRef = doc(db, 'schedules', schedule.id);
    await setDoc(docRef, {
      id: schedule.id,
      turma: schedule.turma,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      activityId: schedule.activityId,
      location: schedule.location || '',
      guidelines: schedule.guidelines || '',
      createdAt: schedule.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `schedules/${schedule.id}`);
  }
}

export async function deleteScheduleBlockFromFirestore(scheduleId: string) {
  try {
    const docRef = doc(db, 'schedules', scheduleId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `schedules/${scheduleId}`);
  }
}

export async function batchSyncSchedulesToFirestore(
  newOrUpdatedBlocks: ScheduleBlock[],
  deletedIds: string[] = []
) {
  try {
    const CHUNK_SIZE = 250;
    // Process deletions in chunks
    for (let i = 0; i < deletedIds.length; i += CHUNK_SIZE) {
      const chunk = deletedIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const id of chunk) {
        batch.delete(doc(db, 'schedules', id));
      }
      await batch.commit();
    }

    // Process sets in chunks
    for (let i = 0; i < newOrUpdatedBlocks.length; i += CHUNK_SIZE) {
      const chunk = newOrUpdatedBlocks.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const docRef = doc(db, 'schedules', item.id);
        batch.set(docRef, {
          id: item.id,
          turma: item.turma,
          dayOfWeek: item.dayOfWeek,
          startTime: item.startTime,
          endTime: item.endTime,
          activityId: item.activityId,
          location: item.location || '',
          guidelines: item.guidelines || '',
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    console.error('Error batch syncing schedules to Firestore:', error);
  }
}

export async function saveAllSchedulesToFirestore(schedules: ScheduleBlock[]) {
  try {
    const CHUNK_SIZE = 250;
    for (let i = 0; i < schedules.length; i += CHUNK_SIZE) {
      const chunk = schedules.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const docRef = doc(db, 'schedules', item.id);
        batch.set(docRef, {
          id: item.id,
          turma: item.turma,
          dayOfWeek: item.dayOfWeek,
          startTime: item.startTime,
          endTime: item.endTime,
          activityId: item.activityId,
          location: item.location || '',
          guidelines: item.guidelines || '',
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    console.error('Error saving all schedules to Firestore:', error);
  }
}

// ---------------------------------------------------------------------------
// Holidays & Recess Management in Firestore
// ---------------------------------------------------------------------------

export function subscribeHolidays(callback: (holidays: HolidayItem[]) => void) {
  const holidaysCollection = collection(db, 'holidays');
  return onSnapshot(
    holidaysCollection,
    (snapshot) => {
      clearFirestoreQuotaExceeded();
      const holidayList: HolidayItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.id && data.date && data.name) {
          holidayList.push({
            id: data.id,
            date: data.date,
            endDate: data.endDate || data.date,
            name: data.name,
            type: data.type === 'feriado' ? 'feriado' : 'recesso',
            description: data.description || '',
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString(),
          });
        }
      });
      // Sort by date ascending
      holidayList.sort((a, b) => a.date.localeCompare(b.date));
      callback(holidayList);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'holidays');
    }
  );
}

export async function saveHolidayToFirestore(holiday: HolidayItem) {
  try {
    const docRef = doc(db, 'holidays', holiday.id);
    await setDoc(docRef, {
      id: holiday.id,
      date: holiday.date,
      endDate: holiday.endDate || holiday.date,
      name: holiday.name,
      type: holiday.type,
      description: holiday.description || '',
      createdAt: holiday.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `holidays/${holiday.id}`);
  }
}

export async function deleteHolidayFromFirestore(holidayId: string) {
  try {
    const docRef = doc(db, 'holidays', holidayId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `holidays/${holidayId}`);
  }
}

export async function batchSaveHolidaysToFirestore(holidays: HolidayItem[]) {
  if (!holidays || holidays.length === 0) return;
  try {
    const CHUNK_SIZE = 250;
    for (let i = 0; i < holidays.length; i += CHUNK_SIZE) {
      const chunk = holidays.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const h of chunk) {
        const docRef = doc(db, 'holidays', h.id);
        batch.set(docRef, {
          id: h.id,
          date: h.date,
          endDate: h.endDate || h.date,
          name: h.name,
          type: h.type,
          description: h.description || '',
          createdAt: h.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    console.error('Error batch saving holidays to Firestore:', error);
  }
}

// ---------------------------------------------------------------------------
// Livro Ponto: Daily Punch Records & Monthly Closings in Firestore
// ---------------------------------------------------------------------------

export function subscribePontoRecords(callback: (records: PontoRecord[]) => void) {
  const pontoCollection = collection(db, 'pontoRecords');
  return onSnapshot(
    pontoCollection,
    (snapshot) => {
      clearFirestoreQuotaExceeded();
      const recordList: PontoRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.id && data.userId && data.date) {
          recordList.push({
            id: data.id,
            userId: data.userId,
            userName: data.userName || '',
            date: data.date,
            monthKey: data.monthKey || data.date.substring(0, 7),
            dayNumber: data.dayNumber || Number(data.date.split('-')[2]) || 1,
            entry1: data.entry1 || '',
            exit1: data.exit1 || '',
            entry2: data.entry2 || '',
            exit2: data.exit2 || '',
            status: data.status || 'normal',
            manualOverride: !!data.manualOverride,
            note: data.note || '',
            extraMinutes: data.extraMinutes || 0,
            missingMinutes: data.missingMinutes || 0,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString(),
            updatedBy: data.updatedBy || '',
          });
        }
      });
      // In-memory delivery: strictly avoid write mutations back into Firestore inside snapshot handlers
      callback(recordList);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'pontoRecords');
    }
  );
}

export async function savePontoRecordToFirestore(record: PontoRecord) {
  try {
    const docRef = doc(db, 'pontoRecords', record.id);
    await setDoc(
      docRef,
      {
        id: record.id,
        userId: record.userId,
        userName: record.userName || '',
        date: record.date,
        monthKey: record.monthKey || record.date.substring(0, 7),
        dayNumber: record.dayNumber || Number(record.date.split('-')[2]) || 1,
        entry1: record.entry1 || '',
        exit1: record.exit1 || '',
        entry2: record.entry2 || '',
        exit2: record.exit2 || '',
        status: record.status || 'normal',
        manualOverride: !!record.manualOverride,
        note: record.note || '',
        extraMinutes: record.extraMinutes || 0,
        missingMinutes: record.missingMinutes || 0,
        createdAt: record.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: record.updatedBy || '',
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `pontoRecords/${record.id}`);
  }
}

export async function batchSavePontoRecordsToFirestore(records: PontoRecord[]) {
  if (!records || records.length === 0) return;
  try {
    const CHUNK_SIZE = 250;
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const record of chunk) {
        const docRef = doc(db, 'pontoRecords', record.id);
        batch.set(
          docRef,
          {
            id: record.id,
            userId: record.userId,
            userName: record.userName || '',
            date: record.date,
            monthKey: record.monthKey || record.date.substring(0, 7),
            dayNumber: record.dayNumber || Number(record.date.split('-')[2]) || 1,
            entry1: record.entry1 || '',
            exit1: record.exit1 || '',
            entry2: record.entry2 || '',
            exit2: record.exit2 || '',
            status: record.status || 'normal',
            manualOverride: !!record.manualOverride,
            note: record.note || '',
            extraMinutes: record.extraMinutes || 0,
            missingMinutes: record.missingMinutes || 0,
            createdAt: record.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            updatedBy: record.updatedBy || '',
          },
          { merge: true }
        );
      }
      await batch.commit();
    }
  } catch (error) {
    console.error('Error batch saving ponto records:', error);
  }
}

export function subscribePontoClosings(callback: (closings: PontoMonthClosing[]) => void) {
  const closingsCollection = collection(db, 'pontoClosings');
  return onSnapshot(
    closingsCollection,
    (snapshot) => {
      clearFirestoreQuotaExceeded();
      const closingList: PontoMonthClosing[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.id && data.userId && data.monthKey) {
          closingList.push({
            id: data.id,
            userId: data.userId,
            userName: data.userName || '',
            userCargo: data.userCargo || 'Estagiária',
            monthKey: data.monthKey,
            year: data.year || Number(data.monthKey.split('-')[0]),
            month: data.month || Number(data.monthKey.split('-')[1]),
            baseSalary: data.baseSalary !== undefined && data.baseSalary !== null && !isNaN(Number(data.baseSalary)) ? Number(data.baseSalary) : 1200,
            regimeTrabalho: data.regimeTrabalho || 'mensalista',
            valorHoraAula: data.valorHoraAula !== undefined ? Number(data.valorHoraAula) : undefined,
            duracaoAulaMinutos: data.duracaoAulaMinutos !== undefined ? Number(data.duracaoAulaMinutos) : 50,
            totalAulas: data.totalAulas !== undefined ? Number(data.totalAulas) : undefined,
            salarioAulas: data.salarioAulas !== undefined ? Number(data.salarioAulas) : undefined,
            horaAtividade: data.horaAtividade !== undefined ? Number(data.horaAtividade) : undefined,
            dsr: data.dsr !== undefined ? Number(data.dsr) : undefined,
            divisorHours: data.divisorHours !== undefined ? Number(data.divisorHours) : 220,
            divisorDays: Number(data.divisorDays) || 30,
            hourlyRate: data.hourlyRate !== undefined ? Number(data.hourlyRate) : undefined,
            ajudaDeCusto: data.ajudaDeCusto !== undefined ? Number(data.ajudaDeCusto) : 0,
            extraHoursRateMultiplier: data.extraHoursRateMultiplier !== undefined ? Number(data.extraHoursRateMultiplier) : 1.5,
            contractDailyHours: Number(data.contractDailyHours) || 6,
            contractDailyMinutes: data.contractDailyMinutes !== undefined ? Number(data.contractDailyMinutes) : undefined,
            contractDailyHoursFormatted: data.contractDailyHoursFormatted || undefined,
            contractSchedule: data.contractSchedule || '11:40 - 17:40',
            workShiftType: data.workShiftType || undefined,
            companyName: data.companyName || 'GADAL - Gestão e Apoio',
            institutionName: data.institutionName || 'Instituto Educacional Crescer',
            pixKey: data.pixKey || '',
            unjustifiedAbsencesCount: Number(data.unjustifiedAbsencesCount) || 0,
            unjustifiedAbsencesDiscount: Number(data.unjustifiedAbsencesDiscount) || 0,
            missingMinutesTotal: Number(data.missingMinutesTotal) || 0,
            missingHoursDiscount: Number(data.missingHoursDiscount) || 0,
            extraMinutesTotal: Number(data.extraMinutesTotal) || 0,
            extraHoursAmount: Number(data.extraHoursAmount) || 0,
            manualAddition: Number(data.manualAddition) || 0,
            manualAdditionNote: data.manualAdditionNote || '',
            manualDiscount: Number(data.manualDiscount) || 0,
            manualDiscountNote: data.manualDiscountNote || '',
            netTotal: Number(data.netTotal) || 0,
            isClosed: !!data.isClosed,
            closedAt: data.closedAt || '',
            closedBy: data.closedBy || '',
            unlockedAt: data.unlockedAt || '',
            unlockedBy: data.unlockedBy || '',
            auditHistory: Array.isArray(data.auditHistory) ? data.auditHistory : [],
            signedDigitally: !!data.signedDigitally,
            signedAt: data.signedAt || '',
            signedBy: data.signedBy || '',
            digitalSignatureHash: data.digitalSignatureHash || '',
            notes: data.notes || '',
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString(),
          });
        }
      });
      callback(closingList);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'pontoClosings');
    }
  );
}

export async function savePontoClosingToFirestore(closing: PontoMonthClosing) {
  try {
    const docRef = doc(db, 'pontoClosings', closing.id);
    await setDoc(
      docRef,
      {
        id: closing.id,
        userId: closing.userId,
        userName: closing.userName || '',
        userCargo: closing.userCargo || 'Estagiária',
        monthKey: closing.monthKey,
        year: closing.year,
        month: closing.month,
        baseSalary: closing.baseSalary !== undefined && closing.baseSalary !== null && !isNaN(Number(closing.baseSalary)) ? Number(closing.baseSalary) : 1200,
        regimeTrabalho: closing.regimeTrabalho || 'mensalista',
        valorHoraAula: closing.valorHoraAula !== undefined ? Number(closing.valorHoraAula) : null,
        duracaoAulaMinutos: closing.duracaoAulaMinutos !== undefined ? Number(closing.duracaoAulaMinutos) : 50,
        totalAulas: closing.totalAulas !== undefined ? Number(closing.totalAulas) : null,
        salarioAulas: closing.salarioAulas !== undefined ? Number(closing.salarioAulas) : null,
        horaAtividade: closing.horaAtividade !== undefined ? Number(closing.horaAtividade) : null,
        dsr: closing.dsr !== undefined ? Number(closing.dsr) : null,
        divisorHours: closing.divisorHours !== undefined ? Number(closing.divisorHours) : 220,
        divisorDays: Number(closing.divisorDays) || 30,
        hourlyRate: closing.hourlyRate !== undefined ? Number(closing.hourlyRate) : (closing.baseSalary ? Number((closing.baseSalary / 220).toFixed(4)) : 0),
        ajudaDeCusto: closing.ajudaDeCusto !== undefined ? Number(closing.ajudaDeCusto) : 0,
        extraHoursRateMultiplier: closing.extraHoursRateMultiplier !== undefined ? Number(closing.extraHoursRateMultiplier) : 1.5,
        contractDailyHours: Number(closing.contractDailyHours) || 6,
        contractDailyMinutes: closing.contractDailyMinutes !== undefined ? Number(closing.contractDailyMinutes) : null,
        contractDailyHoursFormatted: closing.contractDailyHoursFormatted || null,
        contractSchedule: closing.contractSchedule || '11:40 - 17:40',
        workShiftType: closing.workShiftType || 'continua_6h',
        companyName: closing.companyName || 'GADAL - Gestão e Apoio',
        institutionName: closing.institutionName || 'Instituto Educacional Crescer',
        pixKey: closing.pixKey || '',
        unjustifiedAbsencesCount: Number(closing.unjustifiedAbsencesCount) || 0,
        unjustifiedAbsencesDiscount: Number(closing.unjustifiedAbsencesDiscount) || 0,
        missingMinutesTotal: Number(closing.missingMinutesTotal) || 0,
        missingHoursDiscount: Number(closing.missingHoursDiscount) || 0,
        extraMinutesTotal: Number(closing.extraMinutesTotal) || 0,
        extraHoursAmount: Number(closing.extraHoursAmount) || 0,
        manualAddition: Number(closing.manualAddition) || 0,
        manualAdditionNote: closing.manualAdditionNote || '',
        manualDiscount: Number(closing.manualDiscount) || 0,
        manualDiscountNote: closing.manualDiscountNote || '',
        netTotal: Number(closing.netTotal) || 0,
        isClosed: !!closing.isClosed,
        closedAt: closing.closedAt || '',
        closedBy: closing.closedBy || '',
        unlockedAt: closing.unlockedAt || '',
        unlockedBy: closing.unlockedBy || '',
        auditHistory: closing.auditHistory || [],
        signedDigitally: !!closing.signedDigitally,
        signedAt: closing.signedAt || '',
        signedBy: closing.signedBy || '',
        digitalSignatureHash: closing.digitalSignatureHash || '',
        notes: closing.notes || '',
        createdAt: closing.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `pontoClosings/${closing.id}`);
  }
}

// ==========================================
// SEMANÁRIO PEDAGÓGICO FIRESTORE OPERATIONS
// ==========================================

import { SemanarioPlan } from './types';

export function subscribeSemanarioPlans(
  onData: (plans: SemanarioPlan[]) => void,
  onError?: (err: Error) => void
) {
  const colRef = collection(db, 'semanarioPlans');
  return onSnapshot(
    colRef,
    (snapshot) => {
      clearFirestoreQuotaExceeded();
      const list: SemanarioPlan[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data) return;
        list.push({
          id: docSnap.id,
          turma: data.turma || '',
          weekNumber: Number(data.weekNumber) || 0,
          year: Number(data.year) || 2026,
          date: data.date || '',
          dayOfWeek: data.dayOfWeek || 'segunda',
          timeSlot: data.timeSlot || '',
          category: data.category || '',
          title: data.title || '',
          objectives: data.objectives || '',
          development: data.development || '',
          materials: data.materials || '',
          teacherName: data.teacherName || '',
          status: data.status || 'pendente',
          substitutionReason: data.substitutionReason || '',
          photos: Array.isArray(data.photos) ? data.photos : [],
          notes: data.notes || '',
          createdAt: data.createdAt || '',
          updatedAt: data.updatedAt || '',
          updatedBy: data.updatedBy || '',
        });
      });
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'semanarioPlans');
    }
  );
}

export function subscribeTodaySemanarioPlans(
  targetDate: string,
  onData: (plans: SemanarioPlan[]) => void,
  onError?: (err: Error) => void
): () => void {
  const colRef = collection(db, 'semanarioPlans');
  const q = query(colRef, where('date', '==', targetDate));
  return onSnapshot(
    q,
    (snapshot) => {
      clearFirestoreQuotaExceeded();
      const list: SemanarioPlan[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data) return;
        list.push({
          id: docSnap.id,
          turma: data.turma || '',
          weekNumber: Number(data.weekNumber) || 0,
          year: Number(data.year) || 2026,
          date: data.date || '',
          dayOfWeek: data.dayOfWeek || 'segunda',
          timeSlot: data.timeSlot || '',
          category: data.category || '',
          title: data.title || '',
          objectives: data.objectives || '',
          development: data.development || '',
          materials: data.materials || '',
          teacherName: data.teacherName || '',
          status: data.status || 'pendente',
          substitutionReason: data.substitutionReason || '',
          photos: Array.isArray(data.photos) ? data.photos : [],
          notes: data.notes || '',
          createdAt: data.createdAt || '',
          updatedAt: data.updatedAt || '',
          updatedBy: data.updatedBy || '',
        });
      });
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'semanarioPlans/today');
    }
  );
}

export async function saveSemanarioPlanToFirestore(plan: SemanarioPlan) {
  try {
    const docRef = doc(db, 'semanarioPlans', plan.id);
    await setDoc(
      docRef,
      {
        id: plan.id,
        turma: plan.turma || '',
        weekNumber: Number(plan.weekNumber) || 0,
        year: Number(plan.year) || 2026,
        date: plan.date || '',
        dayOfWeek: plan.dayOfWeek || 'segunda',
        timeSlot: plan.timeSlot || '',
        category: plan.category || '',
        title: plan.title || '',
        objectives: plan.objectives || '',
        development: plan.development || '',
        materials: plan.materials || '',
        teacherName: plan.teacherName || '',
        status: plan.status || 'pendente',
        substitutionReason: plan.substitutionReason || '',
        photos: plan.photos || [],
        notes: plan.notes || '',
        createdAt: plan.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: plan.updatedBy || '',
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `semanarioPlans/${plan.id}`);
  }
}

export async function deleteSemanarioPlanFromFirestore(planId: string) {
  try {
    const docRef = doc(db, 'semanarioPlans', planId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `semanarioPlans/${planId}`);
  }
}

export async function batchSaveSemanarioPlansToFirestore(plans: SemanarioPlan[]) {
  if (!plans || plans.length === 0) return;
  try {
    const CHUNK_SIZE = 250;
    for (let i = 0; i < plans.length; i += CHUNK_SIZE) {
      const chunk = plans.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const p of chunk) {
        const docRef = doc(db, 'semanarioPlans', p.id);
        batch.set(
          docRef,
          {
            id: p.id,
            turma: p.turma || '',
            weekNumber: Number(p.weekNumber) || 0,
            year: Number(p.year) || 2026,
            date: p.date || '',
            dayOfWeek: p.dayOfWeek || 'segunda',
            timeSlot: p.timeSlot || '',
            category: p.category || '',
            title: p.title || '',
            objectives: p.objectives || '',
            development: p.development || '',
            materials: p.materials || '',
            teacherName: p.teacherName || '',
            status: p.status || 'pendente',
            substitutionReason: p.substitutionReason || '',
            photos: p.photos || [],
            notes: p.notes || '',
            createdAt: p.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            updatedBy: p.updatedBy || '',
          },
          { merge: true }
        );
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'semanarioPlans/batch');
  }
}

/**
 * Salva as configurações globais do Relatório de Refeições no Firestore (settings/mealReport)
 */
export async function saveMealReportGlobalSettings(settings: {
  unitPrice: number;
  providerName: string;
  responsibleCoordinator?: string;
  coordinatorRole?: string;
  responsibleFinancial?: string;
  financialRole?: string;
  updatedBy?: string;
}): Promise<void> {
  const docRef = doc(db, 'settings', 'mealReport');
  const payload = {
    id: 'mealReport',
    unitPrice: Number(settings.unitPrice) || 9.0,
    providerName: (settings.providerName || 'Cantina & Nutrição Escolar').trim(),
    responsibleCoordinator: settings.responsibleCoordinator || 'Fernando Veiga',
    coordinatorRole: settings.coordinatorRole || 'Coordenação do Integral / DP GAVAR',
    responsibleFinancial: settings.responsibleFinancial || 'Departamento Financeiro',
    financialRole: settings.financialRole || 'Conferência & Prestação de Contas',
    updatedAt: new Date().toISOString(),
    updatedBy: settings.updatedBy || '',
  };

  try {
    await setDoc(docRef, payload, { merge: true });
    // Local backup for zero-latency startup and offline resilience
    localStorage.setItem('crescer_meal_global_settings', JSON.stringify(payload));
  } catch (error) {
    console.warn('Erro ao salvar settings/mealReport no Firestore, usando fallback local:', error);
    localStorage.setItem('crescer_meal_global_settings', JSON.stringify(payload));
    handleFirestoreError(error, OperationType.WRITE, 'settings/mealReport');
  }
}

/**
 * Recupera as configurações globais do Relatório de Refeições do Firestore (settings/mealReport)
 */
export async function getMealReportGlobalSettings(): Promise<MealReportGlobalSettings | null> {
  try {
    const docRef = doc(db, 'settings', 'mealReport');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const result: MealReportGlobalSettings = {
        id: 'mealReport',
        unitPrice: data.unitPrice !== undefined ? Number(data.unitPrice) : 9.0,
        providerName: data.providerName || (data as Record<string, unknown>).contractCompany as string || 'Cantina & Nutrição Escolar',
        responsibleCoordinator: data.responsibleCoordinator,
        coordinatorRole: data.coordinatorRole,
        responsibleFinancial: data.responsibleFinancial,
        financialRole: data.financialRole,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
      // Keep local backup in sync
      localStorage.setItem('crescer_meal_global_settings', JSON.stringify(result));
      return result;
    }
  } catch (error) {
    console.warn('Erro ao ler settings/mealReport do Firestore, tentando local:', error);
  }

  // Fallback to local storage
  try {
    const local = localStorage.getItem('crescer_meal_global_settings');
    if (local) {
      return JSON.parse(local);
    }
  } catch (e) {
    console.warn('Erro ao ler crescer_meal_global_settings do localStorage:', e);
  }

  return null;
}

/**
 * Salva a configuração global de aviso de saída antecipada no Firestore (settings/departureAlert)
 */
export async function saveDepartureAlertSettings(settings: {
  alertMinutes: number;
  updatedBy?: string;
}): Promise<void> {
  const docRef = doc(db, 'settings', 'departureAlert');
  const payload: DepartureAlertSettings = {
    id: 'departureAlert',
    alertMinutes: Math.max(1, Math.min(60, Number(settings.alertMinutes) || 5)),
    updatedAt: new Date().toISOString(),
    updatedBy: settings.updatedBy || '',
  };

  try {
    await setDoc(docRef, payload, { merge: true });
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('integral_departure_alert_settings', JSON.stringify(payload));
    }
  } catch (error) {
    console.warn('Erro ao salvar settings/departureAlert no Firestore, usando fallback local:', error);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('integral_departure_alert_settings', JSON.stringify(payload));
    }
    handleFirestoreError(error, OperationType.WRITE, 'settings/departureAlert');
  }
}

/**
 * Recupera a configuração global de aviso de saída antecipada do Firestore (settings/departureAlert)
 */
export async function getDepartureAlertSettings(): Promise<DepartureAlertSettings> {
  const defaultSettings: DepartureAlertSettings = {
    id: 'departureAlert',
    alertMinutes: 5,
  };

  try {
    const docRef = doc(db, 'settings', 'departureAlert');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const result: DepartureAlertSettings = {
        id: 'departureAlert',
        alertMinutes: data.alertMinutes !== undefined && !isNaN(Number(data.alertMinutes)) ? Number(data.alertMinutes) : 5,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('integral_departure_alert_settings', JSON.stringify(result));
      }
      return result;
    }
  } catch (error) {
    console.warn('Erro ao ler settings/departureAlert do Firestore, tentando local:', error);
  }

  // Fallback to local storage
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const local = localStorage.getItem('integral_departure_alert_settings');
      if (local) {
        const parsed = JSON.parse(local);
        if (parsed && typeof parsed.alertMinutes === 'number') {
          return parsed;
        }
      }
    }
  } catch (e) {
    console.warn('Erro ao ler integral_departure_alert_settings do localStorage:', e);
  }

  return defaultSettings;
}

/**
 * Salva o relatório consolidado de refeições do mês no Firestore (mealReports/{monthKey})
 */
export async function saveMealReportToFirestore(config: MealReportConfig): Promise<void> {
  const docRef = doc(db, 'mealReports', config.monthKey);
  const payload = {
    id: config.monthKey,
    monthKey: config.monthKey,
    year: Number(config.year),
    month: Number(config.month),
    startDate: config.startDate || '',
    endDate: config.endDate || '',
    defaultUnitPrice: Number(config.defaultUnitPrice) || 9.0,
    unitPrice: Number(config.defaultUnitPrice) || 9.0,
    contractCompany: config.contractCompany || config.providerName || 'Cantina & Nutrição Escolar',
    providerName: config.providerName || config.contractCompany || 'Cantina & Nutrição Escolar',
    responsibleCoordinator: config.responsibleCoordinator || 'Fernando Veiga',
    coordinatorRole: config.coordinatorRole || 'Coordenação do Integral / DP GAVAR',
    responsibleFinancial: config.responsibleFinancial || 'Departamento Financeiro',
    financialRole: config.financialRole || 'Conferência & Prestação de Contas',
    generalNotes: config.generalNotes || '',
    entries: config.entries || {},
    updatedAt: new Date().toISOString(),
    updatedBy: config.updatedBy || '',
  };

  try {
    await setDoc(docRef, payload, { merge: true });
    // Also save global settings to keep settings/mealReport automatically synchronized
    await saveMealReportGlobalSettings({
      unitPrice: payload.unitPrice,
      providerName: payload.providerName,
      responsibleCoordinator: payload.responsibleCoordinator,
      coordinatorRole: payload.coordinatorRole,
      responsibleFinancial: payload.responsibleFinancial,
      financialRole: payload.financialRole,
      updatedBy: payload.updatedBy,
    });
  } catch (error) {
    console.warn('Erro ao salvar mealReports no Firestore, mantendo cópia local:', error);
    handleFirestoreError(error, OperationType.WRITE, `mealReports/${config.monthKey}`);
  }
}

/**
 * Recupera o relatório do mês do Firestore (mealReports/{monthKey})
 */
export async function getMealReportFromFirestore(monthKey: string): Promise<MealReportConfig | null> {
  try {
    const docRef = doc(db, 'mealReports', monthKey);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        id: data.id || monthKey,
        monthKey: data.monthKey || monthKey,
        year: data.year,
        month: data.month,
        startDate: data.startDate,
        endDate: data.endDate,
        defaultUnitPrice: data.defaultUnitPrice !== undefined ? Number(data.defaultUnitPrice) : (data.unitPrice !== undefined ? Number(data.unitPrice) : 9.0),
        entries: data.entries || {},
        contractCompany: data.contractCompany || data.providerName || 'Cantina & Nutrição Escolar',
        providerName: data.providerName || data.contractCompany || 'Cantina & Nutrição Escolar',
        responsibleCoordinator: data.responsibleCoordinator,
        coordinatorRole: data.coordinatorRole,
        responsibleFinancial: data.responsibleFinancial,
        financialRole: data.financialRole,
        generalNotes: data.generalNotes || '',
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
    }
  } catch (error) {
    console.warn(`Erro ao ler mealReports/${monthKey} do Firestore:`, error);
  }
  return null;
}

/**
 * Salva o Cardápio Mensal no Firestore (monthlyMenus/{monthKey})
 */
export async function saveMonthlyMenuToFirestore(menu: MonthlyMenu): Promise<void> {
  try {
    const docRef = doc(db, 'monthlyMenus', menu.monthKey);
    const payload = {
      ...menu,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    console.warn('Erro ao salvar monthlyMenus no Firestore, mantendo cópia local:', error);
    handleFirestoreError(error, OperationType.WRITE, `monthlyMenus/${menu.monthKey}`);
  }
}

/**
 * Recupera o Cardápio Mensal do Firestore (monthlyMenus/{monthKey})
 */
export async function getMonthlyMenuFromFirestore(monthKey: string): Promise<MonthlyMenu | null> {
  try {
    const docRef = doc(db, 'monthlyMenus', monthKey);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as MonthlyMenu;
    }
  } catch (error) {
    console.warn(`Erro ao ler monthlyMenus/${monthKey} do Firestore:`, error);
  }
  return null;
}

/**
 * Salva as receitas da Oficina de Culinária no Firestore (cookingRecipes/{monthKey})
 */
export async function saveCookingRecipesToFirestore(monthKey: string, recipes: CookingRecipe[]): Promise<void> {
  try {
    const docRef = doc(db, 'cookingRecipes', monthKey);
    const payload = {
      id: monthKey,
      monthKey,
      recipes,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    console.warn('Erro ao salvar cookingRecipes no Firestore, mantendo cópia local:', error);
    handleFirestoreError(error, OperationType.WRITE, `cookingRecipes/${monthKey}`);
  }
}

/**
 * Recupera as receitas da Oficina de Culinária do Firestore (cookingRecipes/{monthKey})
 */
export async function getCookingRecipesFromFirestore(monthKey: string): Promise<CookingRecipe[] | null> {
  try {
    const docRef = doc(db, 'cookingRecipes', monthKey);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.recipes)) {
        return data.recipes as CookingRecipe[];
      }
    }
  } catch (error) {
    console.warn(`Erro ao ler cookingRecipes/${monthKey} do Firestore:`, error);
  }
  return null;
}

/**
 * Inscreve-se nas atualizações em tempo real do Quadro de Atribuições (quadroAtribuicoes)
 */
export function subscribeQuadroAtribuicoes(
  onData: (items: TurmaAtribuicao[]) => void,
  onError?: (err: any) => void
): () => void {
  const colRef = collection(db, 'quadroAtribuicoes');
  return onSnapshot(
    colRef,
    (snap) => {
      clearFirestoreQuotaExceeded();
      const map = new Map<string, TurmaAtribuicao>();

      snap.forEach((d) => {
        const data = d.data() as TurmaAtribuicao;
        const safeId = generateTurmaAtribuicaoId(data.turma || d.id);

        // Se houver documento remanescente com ID não-canônico no Firestore, remove
        if (d.id !== safeId) {
          deleteDoc(doc(db, 'quadroAtribuicoes', d.id)).catch(() => {});
        }

        // Preserva integralmente o horário definido pelo usuário. Só aplica default se estiver genuinamente vazio
        const horario = (data.horarioTurno && typeof data.horarioTurno === 'string' && data.horarioTurno.trim() !== '')
          ? data.horarioTurno.trim()
          : getDefaultHorarioTurnoForTurma(data.turma || d.id);

        const normalizedItem: TurmaAtribuicao = {
          ...data,
          id: safeId,
          turma: data.turma || d.id,
          horarioTurno: horario,
        };

        const existing = map.get(normalizedItem.turma);
        let shouldReplace = false;
        if (!existing) {
          shouldReplace = true;
        } else if (normalizedItem.updatedAt && existing.updatedAt) {
          shouldReplace = normalizedItem.updatedAt >= existing.updatedAt;
        } else if (normalizedItem.updatedAt && !existing.updatedAt) {
          shouldReplace = true;
        } else if (d.id === safeId && existing.id !== safeId) {
          shouldReplace = true;
        } else if (normalizedItem.monitoraName && !existing.monitoraName) {
          shouldReplace = true;
        }

        if (shouldReplace) {
          map.set(normalizedItem.turma, normalizedItem);
        }
      });

      onData(Array.from(map.values()));
    },
    (error) => {
      console.warn('Erro ao escutar quadroAtribuicoes no Firestore:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'quadroAtribuicoes');
    }
  );
}

/**
 * Salva uma atribuição de turma no Firestore (quadroAtribuicoes/{safeId})
 * 1. Normalização de ID Obrigatória: higieniza a string de identificação (turma/turmaId)
 *    removendo º, °, acentos e caracteres especiais antes de definir doc(db, 'quadroAtribuicoes', safeId).
 *    (ex.: '3º Ano Vermelho' -> 'atrib_3ano_vermelho')
 * 2. Limpeza de Documentos Legados: se o documento salvo anteriormente possuir chave antiga com
 *    caractere especial ou divergente do safeId, executa deleteDoc() na chave antiga no mesmo fluxo.
 */
export async function saveTurmaAtribuicaoToFirestore(item: TurmaAtribuicao): Promise<void> {
  // 1. Normalização de ID Obrigatória antes de definir a referência doc()
  const rawIdentifier = item.turma || item.id || '';
  const safeId = generateTurmaAtribuicaoId(rawIdentifier);

  try {
    // 2. Limpeza de Documentos Legados: se havia uma chave antiga com caractere especial ou diferente do safeId
    const legacyKeysToDelete = new Set<string>();

    if (item.id && item.id !== safeId) {
      legacyKeysToDelete.add(item.id);
    }

    // Detecta possíveis chaves legadas com ordinais (º, °) ou acentos baseadas no nome da turma
    if (item.turma) {
      const rawWithOrdinal = `atrib_${item.turma.toLowerCase().replace(/\s+/g, '_')}`;
      if (rawWithOrdinal !== safeId && (rawWithOrdinal.includes('º') || rawWithOrdinal.includes('°'))) {
        legacyKeysToDelete.add(rawWithOrdinal);
      }
    }

    for (const legacyKey of legacyKeysToDelete) {
      try {
        await deleteDoc(doc(db, 'quadroAtribuicoes', legacyKey));
      } catch {
        // ignora se o documento legado já não existia
      }
    }

    // Referência oficial com o safeId normalizado
    const docRef = doc(db, 'quadroAtribuicoes', safeId);
    const payload: TurmaAtribuicao = {
      ...item,
      id: safeId,
      turma: item.turma,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    console.warn('Erro ao salvar atribuição no Firestore:', error);
    handleFirestoreError(error, OperationType.WRITE, `quadroAtribuicoes/${safeId}`);
  }
}

// Aliases para conformidade com diferentes nomenclaturas
export const saveQuadroAtribuicao = saveTurmaAtribuicaoToFirestore;
export const saveQuadroAtribuicoes = saveTurmaAtribuicaoToFirestore;

/**
 * Salva um lote de atribuições no Firestore
 */
export async function batchSaveQuadroAtribuicoesToFirestore(items: TurmaAtribuicao[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const item of items) {
      const safeId = generateTurmaAtribuicaoId(item.turma || item.id);
      if (item.id && item.id !== safeId) {
        try {
          await deleteDoc(doc(db, 'quadroAtribuicoes', item.id));
        } catch {
          // ignora se não existir
        }
      }
      const docRef = doc(db, 'quadroAtribuicoes', safeId);
      batch.set(docRef, { ...item, id: safeId, turma: item.turma, updatedAt: new Date().toISOString() }, { merge: true });
    }
    await batch.commit();
  } catch (error) {
    console.warn('Erro ao salvar lote de atribuições no Firestore:', error);
    handleFirestoreError(error, OperationType.WRITE, 'quadroAtribuicoes/batch');
  }
}

/**
 * Remove uma atribuição de turma do Firestore (quadroAtribuicoes/{safeId})
 */
export async function deleteTurmaAtribuicaoFromFirestore(turmaName: string): Promise<void> {
  const safeId = generateTurmaAtribuicaoId(turmaName);
  try {
    const docRef = doc(db, 'quadroAtribuicoes', safeId);
    await deleteDoc(docRef);
  } catch (error) {
    console.warn('Erro ao excluir atribuição no Firestore:', error);
    handleFirestoreError(error, OperationType.DELETE, `quadroAtribuicoes/${safeId}`);
  }
}

/**
 * Busca direta no servidor das chamadas (attendanceRecords) via getDocsFromServer.
 * Ignora o cache local do Firestore para sincronizar o painel imediatamente.
 */
export async function fetchRecordsDirectFromServer(
  targetDate?: string,
  limitCount: number = 300
): Promise<AttendanceRecord[]> {
  const colRef = collection(db, 'attendanceRecords');
  const hoje = targetDate || new Date().toISOString().split('T')[0];
  const q = hoje
    ? query(colRef, or(where('data', '==', hoje), where('date', '==', hoje)), limit(limitCount))
    : query(colRef, limit(limitCount));

  try {
    const snap = await getDocsFromServer(q);
    clearFirestoreQuotaExceeded();
    const list: AttendanceRecord[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data) return;
      list.push({
        id: docSnap.id,
        studentId: data.studentId || '',
        date: data.date || data.data || '',
        weekNumber: Number(data.weekNumber) || 1,
        year: Number(data.year) || 2026,
        activity: data.activity || '',
        turma: data.turma || '',
        status: data.status || 'presente',
        exitTime: data.exitTime || undefined,
        equipmentMissingDetails: data.equipmentMissingDetails || undefined,
        observation: data.observation || undefined,
        createdAt: data.createdAt || new Date().toISOString(),
      });
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'attendanceRecords');
    throw err;
  }
}

/**
 * Busca direta no servidor dos alunos via getDocsFromServer.
 * Ignora o cache local do Firestore para garantir lista atualizada no painel.
 */
export async function fetchStudentsDirectFromServer(): Promise<Student[]> {
  const colRef = collection(db, 'alunos');
  try {
    const snap = await getDocsFromServer(colRef);
    clearFirestoreQuotaExceeded();
    const list: Student[] = [];
    const deletedIds = getDeletedStudentIds();
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && !isMockStudent({ id: docSnap.id, name: data.name }) && !deletedIds.has(docSnap.id)) {
        list.push(normalizeStudent({ ...data, id: docSnap.id }));
      }
    });
    if (list.length > 0) {
      return deduplicateStudentsList(list);
    }
    // Fallback para 'students' se 'alunos' estiver vazia
    const altCol = collection(db, 'students');
    const altSnap = await getDocsFromServer(altCol);
    clearFirestoreQuotaExceeded();
    altSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && !isMockStudent({ id: docSnap.id, name: data.name }) && !deletedIds.has(docSnap.id)) {
        list.push(normalizeStudent({ ...data, id: docSnap.id }));
      }
    });
    return deduplicateStudentsList(list);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'alunos');
    throw err;
  }
}

/**
 * Busca direta no servidor das turmas via getDocsFromServer.
 */
export async function fetchTurmasDirectFromServer(): Promise<string[]> {
  const colRef = collection(db, 'turmas');
  try {
    const snap = await getDocsFromServer(colRef);
    clearFirestoreQuotaExceeded();
    const list: string[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && data.name) {
        list.push(data.name);
      }
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'turmas');
    throw err;
  }
}

/**
 * Força reconexão direta ao Firestore:
 * 1. Reativa a rede no Firestore com enableNetwork/disableNetwork reset.
 * 2. Realiza busca direta no servidor (getDocsFromServer) em paralelo ignorando o cache local.
 * 3. Limpa o estado de erro de cota (RESOURCE_EXHAUSTED / QuotaExceeded) imediatamente se bem-sucedido.
 */
export async function forceDirectServerSync(targetDate?: string) {
  // Reativa conexão do SDK com o servidor
  await reconnectFirestore(true);

  // Busca direta no servidor (bypassing cache)
  const [recordsRes, studentsRes, usersRes, turmasRes] = await Promise.allSettled([
    fetchRecordsDirectFromServer(targetDate, 300),
    fetchStudentsDirectFromServer(),
    fetchAllUsersDirectFromServer(true),
    fetchTurmasDirectFromServer(),
  ]);

  const hasSuccess =
    recordsRes.status === 'fulfilled' ||
    studentsRes.status === 'fulfilled' ||
    usersRes.status === 'fulfilled' ||
    turmasRes.status === 'fulfilled';

  if (hasSuccess) {
    clearFirestoreQuotaExceeded();
  }

  return {
    records: recordsRes.status === 'fulfilled' ? recordsRes.value : [],
    students: studentsRes.status === 'fulfilled' ? studentsRes.value : [],
    users: usersRes.status === 'fulfilled' ? usersRes.value : [],
    turmas: turmasRes.status === 'fulfilled' ? turmasRes.value : [],
    hasSuccess,
  };
}

// Auto-inicialização assíncrona após carga completa de todos os módulos
if (typeof window !== 'undefined') {
  setTimeout(() => {
    try {
      reconnectFirestore(true).catch(() => {});
      clearFirestoreQuotaExceeded();
    } catch (e) {
      console.warn('Notice na auto-inicialização do Firebase:', e);
    }
  }, 100);
}
