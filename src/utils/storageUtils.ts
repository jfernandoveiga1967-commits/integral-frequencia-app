import { Student, AttendanceRecord, ActivityType, TurmaType, AttendanceStatus, ActivityItem, ScheduleBlock, HolidayItem, PontoRecord, PontoMonthClosing, SemanarioPlan, DayOfWeek, StudentStatus, ContractType, UserProfile } from '../types';
import { INITIAL_STUDENTS, TURMAS_LIST, ACTIVITIES_LIST, INITIAL_HOLIDAYS } from '../data/initialData';
import { getISOWeekNumber, getWeekInfo, getWeekDays, toISODateString } from './dateUtils';
import { getInitialSamplePlans } from './semanarioUtils';
import { getDefaultScheduleBlocks } from './scheduleDefaults';
import { getLocalUsersList, saveLocalUsersList, normalizeAndDeduplicateUsers, PRESET_USERS } from './authUtils';
import { repairOverlappedPontoRecords } from './pontoUtils';
import { db } from '../firebase';
import { collection, getDocs, doc, deleteDoc, onSnapshot } from 'firebase/firestore';

export { normalizeAndDeduplicateUsers };

const STUDENTS_KEY = 'integral_frequencia_students_v1';
export const DELETED_STUDENTS_KEY = 'integral_frequencia_deleted_students_v1';
const RECORDS_KEY = 'integral_frequencia_records_v1';
const ATTENDANCE_OUTBOX_KEY = 'integral_frequencia_attendance_outbox_v1';
const TURMAS_KEY = 'integral_frequencia_turmas_v1';
const ACTIVITIES_KEY = 'integral_frequencia_activities_v1';
const SCHEDULES_KEY = 'integral_frequencia_schedules_v1';
const HOLIDAYS_KEY = 'integral_frequencia_holidays_v1';
const PONTO_RECORDS_KEY = 'integral_frequencia_ponto_records_v1';
const PONTO_CLOSINGS_KEY = 'integral_frequencia_ponto_closings_v1';
const SEMANARIO_KEY = 'integral_semanario_plans_v1';
export const ALL_USERS_KEY = 'frequencia_integral_all_users';

export function getDeletedStudentIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_STUDENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch (e) {
    console.error('Erro ao ler IDs de alunos excluídos:', e);
  }
  return new Set();
}

export function markStudentAsDeleted(id: string): void {
  if (!id) return;
  try {
    const set = getDeletedStudentIds();
    set.add(id);
    localStorage.setItem(DELETED_STUDENTS_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.error('Erro ao registrar aluno como excluído:', e);
  }
}

/**
 * Limpeza de Cache ao Deletar:
 * Remove o aluno do LocalStorage e registra o ID na lista de exclusão
 * para evitar que o cache do navegador re-sincronize o documento antigo.
 */
export function removeStudentFromLocalStorage(id: string): void {
  if (!id) return;
  try {
    markStudentAsDeleted(id);
    const raw = localStorage.getItem(STUDENTS_KEY);
    if (raw) {
      const parsed: any[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((s) => s.id !== id && !isMockStudent(s));
        localStorage.setItem(STUDENTS_KEY, JSON.stringify(filtered));
      }
    }
  } catch (e) {
    console.error('Erro ao remover aluno do LocalStorage:', e);
  }
}

export interface AttendanceOutboxItem {
  id: string;
  type: 'SET' | 'DELETE';
  record?: AttendanceRecord;
  recordId: string;
  timestamp: number;
}

export function getAttendanceOutbox(): AttendanceOutboxItem[] {
  try {
    const raw = localStorage.getItem(ATTENDANCE_OUTBOX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Erro ao ler outbox de frequência:', e);
  }
  return [];
}

export function addToAttendanceOutbox(item: Omit<AttendanceOutboxItem, 'id' | 'timestamp'> & { id?: string; timestamp?: number }): void {
  try {
    const current = getAttendanceOutbox();
    const id = item.id || `outbox_${item.recordId}_${Date.now()}`;
    const timestamp = item.timestamp || Date.now();
    const filtered = current.filter((i) => i.recordId !== item.recordId);
    const updated = [...filtered, { ...item, id, timestamp }];
    localStorage.setItem(ATTENDANCE_OUTBOX_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Erro ao adicionar item na outbox de frequência:', e);
  }
}

export function removeFromAttendanceOutbox(recordId: string): void {
  try {
    const current = getAttendanceOutbox();
    const updated = current.filter((i) => i.recordId !== recordId && i.id !== recordId);
    localStorage.setItem(ATTENDANCE_OUTBOX_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Erro ao remover item da outbox de frequência:', e);
  }
}

export function clearAttendanceOutbox(): void {
  try {
    localStorage.removeItem(ATTENDANCE_OUTBOX_KEY);
  } catch (e) {
    console.error('Erro ao limpar outbox:', e);
  }
}

export function loadUsers(): UserProfile[] {
  const list = getLocalUsersList();
  return normalizeAndDeduplicateUsers(list);
}

export function saveUsers(users: UserProfile[]): void {
  const deduped = normalizeAndDeduplicateUsers(users);
  saveLocalUsersList(deduped);
}

export const DEFAULT_DIAS_FREQUENCIA: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];

/**
 * Normaliza e enriquece os dados de um aluno, garantindo a integridade e
 * preservação irrestrita das propriedades customizadas (diasFrequencia, horariosSaida, statusMatricula, etc.),
 * aplicando valores padrão APENAS quando essas propriedades estiverem ausentes.
 */
export function normalizeStudent(
  rawStudent: any,
  existingStudent?: Student
): Student {
  if (!rawStudent && !existingStudent) {
    return {
      id: `st-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: '',
      turma: '',
      activities: ['Rotina'],
      diasFrequencia: [...DEFAULT_DIAS_FREQUENCIA],
      horariosSaida: {},
      status: 'ativo',
      statusMatricula: 'ativo',
    };
  }

  const s = rawStudent || {};
  const id = String(s.id || existingStudent?.id || `st-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`).trim();
  const name = String(s.name !== undefined ? s.name : (existingStudent?.name || '')).trim();
  const turma = String(s.turma !== undefined ? s.turma : (existingStudent?.turma || '')) as TurmaType;

  // Atividades: Garantir array e presença obrigatória da 'Rotina'
  let rawActs: string[] = [];
  if (Array.isArray(s.activities)) {
    rawActs = s.activities;
  } else if (Array.isArray(existingStudent?.activities)) {
    rawActs = existingStudent.activities;
  }
  const uniqueActs = Array.from(new Set(rawActs.map((a: any) => String(a).trim()).filter(Boolean)));
  const activities = uniqueActs.includes('Rotina') ? uniqueActs : ['Rotina', ...uniqueActs];

  // Preservação de Dias de Frequência (diasFrequencia / dias_frequencia)
  // REGRA CRÍTICA: Se já existir no registro ou no aluno existente (mesmo que parcial, ex: 2ª/4ª/6ª), PRESERVAR!
  let diasFrequencia: DayOfWeek[];
  if (Array.isArray(s.diasFrequencia) && s.diasFrequencia.length > 0) {
    diasFrequencia = [...s.diasFrequencia];
  } else if (Array.isArray(s.dias_frequencia) && s.dias_frequencia.length > 0) {
    diasFrequencia = [...s.dias_frequencia];
  } else if (existingStudent && Array.isArray(existingStudent.diasFrequencia) && existingStudent.diasFrequencia.length > 0) {
    diasFrequencia = [...existingStudent.diasFrequencia];
  } else {
    diasFrequencia = [...DEFAULT_DIAS_FREQUENCIA];
  }

  // Preservação de Horários de Saída (horariosSaida / horarioSaida)
  let horariosSaida: Partial<Record<DayOfWeek, string>> = {};
  if (existingStudent?.horariosSaida && typeof existingStudent.horariosSaida === 'object') {
    horariosSaida = { ...existingStudent.horariosSaida };
  }
  if (s.horariosSaida && typeof s.horariosSaida === 'object') {
    horariosSaida = { ...horariosSaida, ...s.horariosSaida };
  } else if (typeof s.horarioSaida === 'string' && s.horarioSaida.trim().length > 0) {
    const fixedTime = s.horarioSaida.trim();
    horariosSaida = {
      segunda: fixedTime,
      terca: fixedTime,
      quarta: fixedTime,
      quinta: fixedTime,
      sexta: fixedTime,
    };
  }

  // Preservação de Status / Status de Matrícula
  const rawStatus = s.status || s.statusMatricula || existingStudent?.status || existingStudent?.statusMatricula || 'ativo';
  const status: StudentStatus = (rawStatus === 'inativo' || rawStatus === 'cancelado') ? rawStatus : 'ativo';

  // Preservação de Tipo de Contrato e Período (Regular vs. Avulso/Temporário)
  const tipoContrato: ContractType = (s.tipoContrato === 'avulso' || existingStudent?.tipoContrato === 'avulso') ? 'avulso' : 'regular';
  const dataInicioContrato = s.dataInicioContrato !== undefined ? s.dataInicioContrato : (existingStudent?.dataInicioContrato || undefined);
  const dataTerminoContrato = s.dataTerminoContrato !== undefined ? s.dataTerminoContrato : (existingStudent?.dataTerminoContrato || undefined);
  
  let diasContratados: DayOfWeek[] | undefined = undefined;
  if (Array.isArray(s.diasContratados) && s.diasContratados.length > 0) {
    diasContratados = [...s.diasContratados];
  } else if (existingStudent && Array.isArray(existingStudent.diasContratados) && existingStudent.diasContratados.length > 0) {
    diasContratados = [...existingStudent.diasContratados];
  } else if (tipoContrato === 'avulso' && diasFrequencia.length > 0) {
    diasContratados = [...diasFrequencia];
  }

  // Para alunos avulsos, garante sincronia entre diasContratados e diasFrequencia
  if (tipoContrato === 'avulso' && diasContratados && diasContratados.length > 0) {
    diasFrequencia = [...diasContratados];
  }

  const inactivationDate = s.inactivationDate || existingStudent?.inactivationDate || undefined;
  const inactivationReason = s.inactivationReason || existingStudent?.inactivationReason || undefined;
  const notes = s.notes !== undefined ? s.notes : (existingStudent?.notes !== undefined ? existingStudent.notes : undefined);

  return {
    id,
    name,
    turma,
    activities,
    tipoContrato,
    dataInicioContrato,
    dataTerminoContrato,
    diasContratados,
    diasFrequencia,
    horariosSaida,
    status,
    statusMatricula: status,
    inactivationDate,
    inactivationReason,
    notes,
  };
}

/**
 * Fusão inteligente (Deep Merge) de dois registros de alunos,
 * preservando todas as customizações (diasFrequencia, horariosSaida, status)
 * sem redefinir para padrões default.
 */
export function mergeStudentData(
  existingStudent: Student | undefined,
  incomingStudent: Partial<Student> | Student
): Student {
  if (!existingStudent) {
    return normalizeStudent(incomingStudent);
  }

  // Se o incoming tem diasFrequencia com valores válidos, usa; se não, preserva o do existing
  const incomingDays = Array.isArray(incomingStudent.diasFrequencia) && incomingStudent.diasFrequencia.length > 0
    ? incomingStudent.diasFrequencia
    : existingStudent.diasFrequencia;

  // Merge de horários de saída: preserva os horários já definidos no existing
  const mergedHorarios: Partial<Record<DayOfWeek, string>> = {
    ...(existingStudent.horariosSaida || {}),
    ...(incomingStudent.horariosSaida || {}),
  };

  // Se incoming tem horarioSaida string único especificado
  if (typeof (incomingStudent as any).horarioSaida === 'string' && (incomingStudent as any).horarioSaida.trim().length > 0) {
    const fixedTime = (incomingStudent as any).horarioSaida.trim();
    (['segunda', 'terca', 'quarta', 'quinta', 'sexta'] as DayOfWeek[]).forEach((d) => {
      if (!mergedHorarios[d]) mergedHorarios[d] = fixedTime;
    });
  }

  // Atividades
  const incomingActs = Array.isArray(incomingStudent.activities) ? incomingStudent.activities : [];
  const existingActs = Array.isArray(existingStudent.activities) ? existingStudent.activities : [];
  const baseActs = incomingActs.length > 0 ? incomingActs : existingActs;
  const mergedActivities = Array.from(new Set(['Rotina', ...baseActs]));

  const status = incomingStudent.status || (incomingStudent as any).statusMatricula || existingStudent.status || existingStudent.statusMatricula || 'ativo';

  const tipoContrato: ContractType = incomingStudent.tipoContrato || existingStudent.tipoContrato || 'regular';
  const dataInicioContrato = incomingStudent.dataInicioContrato !== undefined ? incomingStudent.dataInicioContrato : existingStudent.dataInicioContrato;
  const dataTerminoContrato = incomingStudent.dataTerminoContrato !== undefined ? incomingStudent.dataTerminoContrato : existingStudent.dataTerminoContrato;
  const diasContratados = Array.isArray(incomingStudent.diasContratados) && incomingStudent.diasContratados.length > 0
    ? incomingStudent.diasContratados
    : (existingStudent.diasContratados || (tipoContrato === 'avulso' ? incomingDays : undefined));

  return {
    ...existingStudent,
    ...incomingStudent,
    id: incomingStudent.id || existingStudent.id,
    name: incomingStudent.name !== undefined ? incomingStudent.name : existingStudent.name,
    turma: incomingStudent.turma !== undefined ? incomingStudent.turma : existingStudent.turma,
    activities: mergedActivities,
    tipoContrato,
    dataInicioContrato,
    dataTerminoContrato,
    diasContratados,
    diasFrequencia: (tipoContrato === 'avulso' && diasContratados && diasContratados.length > 0)
      ? diasContratados
      : (incomingDays && incomingDays.length > 0 ? incomingDays : (existingStudent.diasFrequencia || [...DEFAULT_DIAS_FREQUENCIA])),
    horariosSaida: mergedHorarios,
    status,
    statusMatricula: status,
    inactivationDate: incomingStudent.inactivationDate !== undefined ? incomingStudent.inactivationDate : existingStudent.inactivationDate,
    inactivationReason: incomingStudent.inactivationReason !== undefined ? incomingStudent.inactivationReason : existingStudent.inactivationReason,
    notes: incomingStudent.notes !== undefined ? incomingStudent.notes : existingStudent.notes,
  };
}

/**
 * Rotina de verificação para alunos de contrato avulso/temporário.
 * Identifica alunos temporários ativos cuja Data de Término seja anterior à data atual (Data de Término < Data Atual)
 * e atualiza seu status para 'inativo' com motivo 'Contrato Concluído', sem alterar históricos de chamadas passadas.
 */
export function checkAndInactivateExpiredTemporaryStudents(
  students: Student[],
  referenceDateStr?: string
): { updatedStudents: Student[]; inactivatedStudents: Student[] } {
  const today = referenceDateStr || toISODateString(new Date());
  const inactivated: Student[] = [];

  const updated = (students || []).map((student) => {
    if (!student) return student;
    const isAvulso = student.tipoContrato === 'avulso';
    const isActive = (student.status || 'ativo') === 'ativo';
    const hasEndDate = Boolean(student.dataTerminoContrato && student.dataTerminoContrato.trim().length > 0);
    const isExpired = hasEndDate && student.dataTerminoContrato!.trim() < today;

    if (isAvulso && isActive && isExpired) {
      const inactivatedStudent: Student = {
        ...student,
        status: 'inativo',
        statusMatricula: 'inativo',
        inactivationDate: student.dataTerminoContrato!.trim(),
        inactivationReason: 'Contrato Concluído',
      };
      inactivated.push(inactivatedStudent);
      return inactivatedStudent;
    }
    return student;
  });

  return { updatedStudents: updated, inactivatedStudents: inactivated };
}

/**
 * Extrai o timestamp de um aluno para ordenação (mais recente primeiro).
 * Avalia campos de data e o timestamp no ID (ex: st-1788527089570-ctsi).
 */
export function extractStudentTimestamp(student: any): number {
  if (!student) return 0;
  if (student.updatedAt) {
    const t = new Date(student.updatedAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (student.createdAt) {
    const t = new Date(student.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (student.id && typeof student.id === 'string') {
    const match = student.id.match(/st-(\d{10,14})/);
    if (match && match[1]) {
      const num = Number(match[1]);
      if (!isNaN(num)) return num;
    }
  }
  return 0;
}

/**
 * Chave de deduplicação de cadastro:
 * Agrupa pelo e-mail do responsável ou por nomeCompleto + turma.
 */
export function getStudentDeduplicationKey(student: any): string {
  const emailResp = student?.emailResponsavel || student?.parentEmail || student?.email;
  if (emailResp && typeof emailResp === 'string' && emailResp.trim().includes('@')) {
    return `email:${emailResp.trim().toLowerCase()}`;
  }
  const normName = (student?.name || student?.nomeCompleto || student?.nome || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const normTurma = (student?.turma || '').toString().trim().toLowerCase();
  return `name_turma:${normName}__${normTurma}`;
}

/**
 * Agrupa registros pelo e-mail do responsável ou nomeCompleto + turma.
 * Se existirem dois ou mais documentos com o mesmo nome na mesma turma,
 * consolida-os mantendo apenas o ID mais recente.
 */
export function deduplicateStudentsList(
  students: Student[],
  onDuplicateFound?: (winner: Student, olderDuplicates: Student[]) => void
): Student[] {
  const groups = new Map<string, Student[]>();
  const deletedIds = getDeletedStudentIds();

  (students || []).forEach((student) => {
    if (!student || !student.id || isMockStudent(student) || deletedIds.has(student.id)) return;
    const key = getStudentDeduplicationKey(student);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(student);
  });

  const consolidated: Student[] = [];

  groups.forEach((group) => {
    if (group.length === 1) {
      consolidated.push(group[0]);
      return;
    }

    // Ordenar: mais recente primeiro
    const sorted = [...group].sort((a, b) => {
      const tA = extractStudentTimestamp(a);
      const tB = extractStudentTimestamp(b);
      return tB - tA;
    });

    const mostRecent = sorted[0];
    const olderDuplicates = sorted.slice(1);

    let winner = { ...mostRecent };
    olderDuplicates.forEach((old) => {
      winner = mergeStudentData(old, winner);
    });

    consolidated.push(winner);

    if (onDuplicateFound) {
      onDuplicateFound(winner, olderDuplicates);
    }
  });

  return consolidated;
}

/**
 * Busca inicial de alunos (fetchStudents) com Deduplicação de Cadastro:
 * Agrupa registros pelo e-mail do responsável ou nomeCompleto + turma.
 * Caso existam dois documentos com o mesmo nome na mesma turma, consolida-os
 * automaticamente mantendo apenas o ID mais recente no Firestore e deletando
 * os documentos duplicados antigos no Firestore de forma assíncrona.
 */
export async function fetchStudents(): Promise<Student[]> {
  try {
    const studentsCol = collection(db, 'students');
    const alunosCol = collection(db, 'alunos');

    const [snapStudents, snapAlunos] = await Promise.allSettled([
      getDocs(studentsCol),
      getDocs(alunosCol),
    ]);

    const rawDocsMap = new Map<string, any>();

    if (snapStudents.status === 'fulfilled') {
      snapStudents.value.forEach((d) => {
        rawDocsMap.set(d.id, { ...d.data(), id: d.id });
      });
    }

    if (snapAlunos.status === 'fulfilled') {
      snapAlunos.value.forEach((d) => {
        rawDocsMap.set(d.id, { ...d.data(), id: d.id });
      });
    }

    const deletedIds = getDeletedStudentIds();
    const allList: Student[] = [];

    rawDocsMap.forEach((data, id) => {
      if (!isMockStudent({ id, name: data.name }) && !deletedIds.has(id)) {
        allList.push(normalizeStudent({ ...data, id }));
      }
    });

    if (allList.length === 0) {
      const local = loadStudents();
      const dedupedLocal = deduplicateStudentsList(local);
      saveStudents(dedupedLocal);
      return dedupedLocal;
    }

    const duplicatesToDelete: string[] = [];
    const consolidated = deduplicateStudentsList(allList, (winner, olderDuplicates) => {
      olderDuplicates.forEach((old) => {
        duplicatesToDelete.push(old.id);
      });
    });

    // Se existirem duplicatas com o mesmo nome na mesma turma,
    // consolida mantendo apenas o ID mais recente e remove as duplicatas antigas do Firestore
    if (duplicatesToDelete.length > 0) {
      console.info(
        `[fetchStudents] Deduplicação automática: consolidando e removendo ${duplicatesToDelete.length} registros duplicados do Firestore:`,
        duplicatesToDelete
      );

      for (const oldId of duplicatesToDelete) {
        removeStudentFromLocalStorage(oldId);
        markStudentAsDeleted(oldId);
        try {
          await deleteDoc(doc(db, 'alunos', oldId));
          await deleteDoc(doc(db, 'students', oldId));
        } catch (delErr) {
          console.warn(`[fetchStudents] Erro ao remover documento duplicado ${oldId} do Firestore:`, delErr);
        }
      }
    }

    // Força atualização imediata da coleção local
    saveStudents(consolidated);
    return consolidated;
  } catch (error) {
    console.error('Erro na rotina fetchStudents:', error);
    const local = loadStudents();
    return deduplicateStudentsList(local);
  }
}

/**
 * Ouvinte em Tempo Real (onSnapshot) da Coleção de Alunos:
 * Substitui as chamadas estáticas getDocs na busca da coleção de alunos por um escutador contínuo em tempo real onSnapshot(collection(db, "alunos"), ...).
 * 
 * - Reflexo Imediato de Exclusões: Quando um aluno for excluído ou inativado no painel do administrador,
 *   o ouvinte remove/atualiza automaticamente esse registro na tela de todos os outros dispositivos conectados sem exigir ação manual.
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
    // Preenche com 'students' e mescla com 'alunos' para sincronização e integridade total
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
    saveStudents(deduped);
    onData(deduped);
  };

  const unsubAlunos = onSnapshot(
    collection(db, 'alunos'),
    (snapshot) => {
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
      console.error('Erro no listener onSnapshot da coleção alunos:', error);
    }
  );

  const unsubStudents = onSnapshot(
    collection(db, 'students'),
    (snapshot) => {
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
      console.error('Erro no listener onSnapshot da coleção students:', error);
    }
  );

  return () => {
    unsubAlunos();
    unsubStudents();
  };
}

export const subscribeStudents = subscribeAlunos;

/**
 * Mescla uma lista de alunos recebida (ex: do Firestore ou importação) com a lista local existente,
 * preservando todas as configurações customizadas já salvas de cada aluno.
 * Se o Firestore trouxer dados, ele é a fonte de verdade para a lista de alunos cadastrados,
 * evitando ressuscitar alunos que já foram excluídos.
 */
export function mergeStudentsList(
  currentStudents: Student[],
  incomingStudents: Student[]
): Student[] {
  const deletedIds = getDeletedStudentIds();
  const currentMap = new Map<string, Student>();
  const nameTurmaMap = new Map<string, Student>();

  (currentStudents || []).forEach((s) => {
    if (s.id && !deletedIds.has(s.id)) currentMap.set(s.id, s);
    if (s.name && s.turma && !deletedIds.has(s.id)) {
      const key = `${s.name.toLowerCase().trim()}_${s.turma.toLowerCase().trim()}`;
      nameTurmaMap.set(key, s);
    }
  });

  const processedIds = new Set<string>();
  const mergedList: Student[] = [];

  (incomingStudents || []).forEach((incoming) => {
    if (!incoming || !incoming.id) return;
    if (isMockStudent(incoming)) return;
    if (deletedIds.has(incoming.id)) return;

    let existing = incoming.id ? currentMap.get(incoming.id) : undefined;
    if (!existing && incoming.name && incoming.turma) {
      const key = `${incoming.name.toLowerCase().trim()}_${incoming.turma.toLowerCase().trim()}`;
      existing = nameTurmaMap.get(key);
    }

    const merged = mergeStudentData(existing, incoming);
    processedIds.add(merged.id);
    mergedList.push(merged);
  });

  // Se incomingStudents estiver vazio (ex: offline ou snapshot ainda carregando),
  // mantém os alunos locais que não foram deletados.
  // MAS se incomingStudents tem dados do Firestore, ele é a fonte de verdade:
  // NÃO ressuscita alunos excluídos que existiam apenas em cache local!
  if (!incomingStudents || incomingStudents.length === 0) {
    (currentStudents || []).forEach((localStudent) => {
      if (!isMockStudent(localStudent) && !deletedIds.has(localStudent.id) && !processedIds.has(localStudent.id)) {
        mergedList.push(normalizeStudent(localStudent));
      }
    });
  }

  return deduplicateStudentsList(mergedList);
}

export function loadHolidays(): HolidayItem[] {
  try {
    const data = localStorage.getItem(HOLIDAYS_KEY);
    if (data) {
      const parsed: HolidayItem[] = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Create lookup map for initial data to enrich any missing endDates
        const initialMap = new Map<string, HolidayItem>();
        INITIAL_HOLIDAYS.forEach((initH) => {
          initialMap.set(initH.id, initH);
          initialMap.set(initH.name.toLowerCase().trim(), initH);
        });

        let migrated = false;
        const normalized = parsed.map((h) => {
          let updated = { ...h };
          
          // Normalize any old types ('ferias', 'ponto_facultativo') to 'recesso'
          if ((updated.type as string) === 'ferias' || (updated.type as string) === 'ponto_facultativo') {
            updated.type = 'recesso';
            migrated = true;
          }

          // If this is a known initial holiday that originally lacked endDate in previous storage versions, enrich it
          if (!updated.endDate) {
            const initMatch = initialMap.get(updated.id) || initialMap.get(updated.name.toLowerCase().trim());
            if (initMatch && initMatch.endDate) {
              updated.endDate = initMatch.endDate;
              migrated = true;
            }
          }

          return updated;
        });

        if (migrated) {
          saveHolidays(normalized);
        }
        return normalized.sort((a, b) => a.date.localeCompare(b.date));
      }
    }
  } catch (e) {
    console.error('Erro ao carregar feriados do LocalStorage:', e);
  }
  saveHolidays(INITIAL_HOLIDAYS);
  return INITIAL_HOLIDAYS;
}

export function saveHolidays(holidays: HolidayItem[]): void {
  try {
    const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem(HOLIDAYS_KEY, JSON.stringify(sorted));
  } catch (e) {
    console.error('Erro ao salvar feriados:', e);
  }
}


export function loadSchedules(): ScheduleBlock[] {
  try {
    const data = localStorage.getItem(SCHEDULES_KEY);
    if (data) {
      const parsed: ScheduleBlock[] = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar grade horária do LocalStorage:', e);
  }
  const defaultBlocks = getDefaultScheduleBlocks();
  saveSchedules(defaultBlocks);
  return defaultBlocks;
}

export function saveSchedules(schedules: ScheduleBlock[]): void {
  try {
    localStorage.setItem(SCHEDULES_KEY, JSON.stringify(schedules));
  } catch (e) {
    console.error('Erro ao salvar grade horária:', e);
  }
}

export const REMOVED_CATEGORY_NAMES = new Set([
  'Estimulação Psicomotora',
  'Estimulação Motora',
  'Estimulação Psicomotora / Motora',
  'Jogos de Tabuleiro',
  'Oficina Pedagógica',
  'Recreação Dirigida',
  'Relaxamento',
  'Tarefas Escolares',
]);

export function loadActivities(): ActivityItem[] {
  try {
    const data = localStorage.getItem(ACTIVITIES_KEY);
    if (data) {
      const parsed: ActivityItem[] = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Remove quaisquer categorias excluídas do sistema
        const filteredParsed = parsed.filter(
          (act) => !REMOVED_CATEGORY_NAMES.has(act.id) && !REMOVED_CATEGORY_NAMES.has(act.name)
        );

        const officialMap = new Map<string, ActivityItem>();
        ACTIVITIES_LIST.forEach((a) => {
          officialMap.set(a.id, a);
          officialMap.set(a.name, a);
        });
        
        // Enrich activities
        const enriched: ActivityItem[] = filteredParsed.map((act): ActivityItem => {
          const official = officialMap.get(act.id) || officialMap.get(act.name);
          return {
            ...act,
            requiresRollCall: official ? (official.requiresRollCall ?? false) : (act.requiresRollCall ?? false),
            icon: act.icon || (official ? official.icon : 'Clock'),
          };
        });

        // Ensure all default official activities are present
        ACTIVITIES_LIST.forEach((officialAct) => {
          if (!enriched.some((a) => a.id === officialAct.id || a.name === officialAct.name)) {
            enriched.push({ ...officialAct });
          }
        });

        const sorted = enriched.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'pt-BR', { sensitivity: 'base' }));
        saveActivities(sorted);
        return sorted;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar atividades do LocalStorage:', e);
  }
  const defaultSorted = [...ACTIVITIES_LIST].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'pt-BR', { sensitivity: 'base' }));
  saveActivities(defaultSorted);
  return defaultSorted;
}

export function saveActivities(activities: ActivityItem[]): void {
  try {
    const cleanList = activities.filter(
      (act) => !REMOVED_CATEGORY_NAMES.has(act.id) && !REMOVED_CATEGORY_NAMES.has(act.name)
    );
    const sorted = [...cleanList].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'pt-BR', { sensitivity: 'base' }));
    localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(sorted));
  } catch (e) {
    console.error('Erro ao salvar atividades:', e);
  }
}

export function loadTurmas(): string[] {
  try {
    const data = localStorage.getItem(TURMAS_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar turmas do LocalStorage:', e);
  }
  saveTurmas(TURMAS_LIST);
  return TURMAS_LIST;
}

export function saveTurmas(turmas: string[]): void {
  try {
    localStorage.setItem(TURMAS_KEY, JSON.stringify(turmas));
  } catch (e) {
    console.error('Erro ao salvar turmas:', e);
  }
}

export function isMockStudent(student: { id: string; name?: string }): boolean {
  if (!student || !student.id) return false;
  // Fictional model student IDs: st-1 through st-32 (pattern: st- followed by 1 or 2 digits)
  return /^st-\d{1,2}$/.test(student.id);
}

export function loadStudents(): Student[] {
  try {
    const data = localStorage.getItem(STUDENTS_KEY);
    if (data) {
      const parsed: any[] = JSON.parse(data);
      if (Array.isArray(parsed)) {
        let migrated = false;
        const newTurmas: TurmaType[] = ['Mini Maternal Azul', 'Maternal Azul', 'Infantil 1 Azul'];

        // Filter out any mock/fictional model students and deleted students
        const deletedIds = getDeletedStudentIds();
        const nonMock = parsed.filter((s) => !isMockStudent(s) && !deletedIds.has(s.id));
        if (nonMock.length !== parsed.length) migrated = true;

        const normalized = nonMock.map((s, idx) => {
          let studentToUpdate = { ...s };
          if ((studentToUpdate.turma as string) === 'Mini Maternal / Maternal / Infantil 1 Azul') {
            migrated = true;
            studentToUpdate.turma = newTurmas[idx % 3];
          }
          return normalizeStudent(studentToUpdate);
        });

        if (migrated) {
          saveStudents(normalized);
        }
        return deduplicateStudentsList(normalized);
      }
    }
  } catch (e) {
    console.error('Erro ao carregar alunos do LocalStorage:', e);
  }
  const defaultInitial = INITIAL_STUDENTS.map((s) => normalizeStudent(s));
  saveStudents(defaultInitial);
  return defaultInitial;
}

export function saveStudents(students: Student[]): void {
  try {
    const deletedIds = getDeletedStudentIds();
    const nonMock = (students || []).filter((s) => !isMockStudent(s) && !deletedIds.has(s.id));
    const deduped = deduplicateStudentsList(nonMock);
    const normalized = deduped.map((s) => normalizeStudent(s));
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(normalized));
  } catch (e) {
    console.error('Erro ao salvar alunos:', e);
  }
}

export function loadAttendanceRecords(): AttendanceRecord[] {
  try {
    const data = localStorage.getItem(RECORDS_KEY);
    if (data) {
      let parsed: AttendanceRecord[] = JSON.parse(data);
      // Check if records are the initial 82 seed records (generated automatically)
      const isInitialSeed = parsed.some((r) => r.id.startsWith('st-1_') || r.id.startsWith('st-2_') || r.id.startsWith('st-3_'));
      if (isInitialSeed) {
        saveAttendanceRecords([]);
        return [];
      }
      return parsed;
    }
  } catch (e) {
    console.error('Erro ao carregar registros do LocalStorage:', e);
  }
  
  saveAttendanceRecords([]);
  return [];
}

export function saveAttendanceRecords(records: AttendanceRecord[]): void {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('Erro ao salvar registros:', e);
  }
}

export function loadPontoRecords(): PontoRecord[] {
  try {
    const data = localStorage.getItem(PONTO_RECORDS_KEY);
    if (data) {
      const parsed: PontoRecord[] = JSON.parse(data);
      if (Array.isArray(parsed)) {
        const { repairedRecords, repairedCount } = repairOverlappedPontoRecords(parsed);
        if (repairedCount > 0) {
          savePontoRecords(repairedRecords);
        }
        return repairedRecords;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar registros de ponto do LocalStorage:', e);
  }
  return [];
}

export function savePontoRecords(records: PontoRecord[]): void {
  try {
    localStorage.setItem(PONTO_RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('Erro ao salvar registros de ponto:', e);
  }
}

export function loadPontoClosings(): PontoMonthClosing[] {
  try {
    const data = localStorage.getItem(PONTO_CLOSINGS_KEY);
    if (data) {
      const parsed: PontoMonthClosing[] = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar fechamentos de ponto do LocalStorage:', e);
  }
  return [];
}

export function savePontoClosings(closings: PontoMonthClosing[]): void {
  try {
    localStorage.setItem(PONTO_CLOSINGS_KEY, JSON.stringify(closings));
  } catch (e) {
    console.error('Erro ao salvar fechamentos de ponto:', e);
  }
}

export function loadSemanarioPlans(): SemanarioPlan[] {
  try {
    const data = localStorage.getItem(SEMANARIO_KEY);
    if (data) {
      const parsed: SemanarioPlan[] = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar planos do Semanário do LocalStorage:', e);
  }
  const defaultPlans = getInitialSamplePlans();
  saveSemanarioPlans(defaultPlans);
  return defaultPlans;
}

export function saveSemanarioPlans(plans: SemanarioPlan[]): void {
  try {
    localStorage.setItem(SEMANARIO_KEY, JSON.stringify(plans));
  } catch (e) {
    console.error('Erro ao salvar planos do Semanário:', e);
  }
}

export function resetAllData(): void {
  localStorage.removeItem(STUDENTS_KEY);
  localStorage.removeItem(RECORDS_KEY);
  localStorage.removeItem(TURMAS_KEY);
  localStorage.removeItem(PONTO_RECORDS_KEY);
  localStorage.removeItem(PONTO_CLOSINGS_KEY);
  localStorage.removeItem(SEMANARIO_KEY);
}

function generateInitialSeedRecords(): AttendanceRecord[] {
  return [];
}

/**
 * Operações de Usuários com Persistência Robusta no Firestore e Invalidação de Cache:
 * Garante gravação prioritária em 'usuarios' (com updateDoc / setDoc),
 * mapeamento correto de ID (Auth UID, e-mail ou canonical) e sincronia sem simulação em tela.
 */
export {
  saveUserToFirestore,
  fetchAllUsersDirectFromServer,
  deleteUserFromFirestore,
  resolveUserFirestoreDocId,
} from '../firebase';
