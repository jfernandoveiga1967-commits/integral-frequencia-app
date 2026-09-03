import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  enableNetwork,
  disableNetwork,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Student, AttendanceRecord, UserProfile, UserRole, ActivityItem, ScheduleBlock, HolidayItem, PontoRecord, PontoMonthClosing } from './types';
import { formatMinutesToHoursAndMinutes, parseHoursAndMinutesStringToMinutes, repairOverlappedPontoRecords } from './utils/pontoUtils';
import { normalizeStudent, addToAttendanceOutbox, removeFromAttendanceOutbox, getAttendanceOutbox } from './utils/storageUtils';
import { normalizeAndDeduplicateUsers, ADMIN_EMAIL, MASTER_ADMIN_ACTIVITIES, MASTER_ADMIN_TURMAS } from './utils/authUtils';

export { doc, deleteDoc };

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  // Graceful warning for offline sync or delayed connection
  if (process.env.NODE_ENV !== 'production') {
    console.warn('Firestore sync notice:', errInfo.error);
  }
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    const pingPromise = getDocFromServer(doc(db, 'test', 'connection'))
      .then(() => true)
      .catch((err) => {
        // Offline or connection in progress - Firestore will continue working in offline cache mode
        if (err instanceof Error && (err.message.includes('the client is offline') || err.message.includes('unavailable'))) {
          console.info('Firestore is operating in offline mode.');
        }
        return false;
      });

    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), 2500);
    });

    return await Promise.race([pingPromise, timeoutPromise]);
  } catch {
    return false;
  }
}

// Firestore Realtime Subscription & Operations

export function subscribeStudents(
  onData: (students: Student[]) => void,
  onError?: (err: Error) => void
) {
  const colRef = collection(db, 'students');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: Student[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data) return;
        const normalized = normalizeStudent({
          ...data,
          id: docSnap.id,
        });
        list.push(normalized);
      });
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'students');
    }
  );
}

export function subscribeRecords(
  onData: (records: AttendanceRecord[]) => void,
  onError?: (err: Error) => void
) {
  const colRef = collection(db, 'attendanceRecords');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: AttendanceRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data) return;
        list.push({
          id: docSnap.id,
          studentId: data.studentId || '',
          date: data.date || '',
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

export function subscribeTurmas(
  onData: (turmas: string[]) => void,
  onError?: (err: Error) => void
) {
  const colRef = collection(db, 'turmas');
  return onSnapshot(
    colRef,
    (snapshot) => {
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

export function subscribeUsers(
  onData: (users: UserProfile[]) => void,
  onError?: (err: Error) => void
) {
  const colRef = collection(db, 'users');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const rawList: { docId: string; user: UserProfile }[] = [];
      const seenDocsByKey = new Map<string, string[]>();

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
          const cargoLabel = isMasterAdmin ? 'Coordenador (Administrador)' : (data.cargoLabel || 'Monitor / Professor');
          const avatarColor = isMasterAdmin ? 'bg-amber-500' : (data.avatarColor || 'bg-indigo-600');

          let assignedActivities = Array.isArray(data.assignedActivities) ? data.assignedActivities : [];
          if (isMasterAdmin) {
            assignedActivities = MASTER_ADMIN_ACTIVITIES;
          }

          let assignedTurmas = Array.isArray(data.allowedClassIds)
            ? data.allowedClassIds
            : (Array.isArray(data.assignedTurmas) ? data.assignedTurmas : undefined);
          if (isMasterAdmin && (!assignedTurmas || assignedTurmas.length === 0)) {
            assignedTurmas = MASTER_ADMIN_TURMAS;
          }

          const rawMinutes = data.contractDailyMinutes !== undefined && data.contractDailyMinutes !== null && !isNaN(Number(data.contractDailyMinutes))
            ? Number(data.contractDailyMinutes)
            : (data.contractDailyHours !== undefined && !isNaN(Number(data.contractDailyHours)) ? Math.round(Number(data.contractDailyHours) * 60) : 360);
          const formattedHours = data.contractDailyHoursFormatted
            ? formatMinutesToHoursAndMinutes(parseHoursAndMinutesStringToMinutes(data.contractDailyHoursFormatted))
            : formatMinutesToHoursAndMinutes(rawMinutes);

          const profile: UserProfile = {
            id: isMasterAdmin ? 'usr_coord_1' : (data.id || docId),
            name: (data.name && data.name.trim()) || (isMasterAdmin ? 'Fernando Veiga' : ''),
            email: isMasterAdmin ? ADMIN_EMAIL : (data.email || ''),
            phone: data.phone || undefined,
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
            assignedTurmas,
            allowedClassIds: assignedTurmas,
            canManageStudents: isMasterAdmin ? true : (data.canManageStudents !== undefined ? data.canManageStudents : true),
            canMarkAttendance: isMasterAdmin ? true : (data.canMarkAttendance !== undefined ? data.canMarkAttendance : true),
            pixKey: data.pixKey || data.phone || undefined,
            contractSchedule: data.contractSchedule || undefined,
            contractDailyHours: data.contractDailyHours !== undefined ? Number(data.contractDailyHours) : Number((rawMinutes / 60).toFixed(2)),
            contractDailyMinutes: rawMinutes,
            contractDailyHoursFormatted: formattedHours,
            baseSalary: data.baseSalary !== undefined && data.baseSalary !== null && !isNaN(Number(data.baseSalary)) ? Number(data.baseSalary) : (isMasterAdmin ? 5000 : 1200),
            company: data.company || 'GADAL - Gestão e Apoio',
            updatedAt: data.updatedAt || new Date().toISOString(),
          };

          rawList.push({ docId, user: profile });
        }
      });

      // Aplica a normalização e deduplicação rigorosa em memória (sem disparar mutações em tempo de leitura)
      const deduplicated = normalizeAndDeduplicateUsers(rawList.map((item) => item.user));
      onData(deduplicated);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'users');
    }
  );
}

export async function saveUserToFirestore(user: UserProfile): Promise<void> {
  const isMasterAdmin =
    (user.email || '').trim().toLowerCase() === 'jfernandoveiga1967@gmail.com' ||
    user.id === 'usr_coord_1' ||
    (user.name && user.name.toLowerCase().includes('fernando veiga'));

  const canonicalId = isMasterAdmin ? 'usr_coord_1' : (user.id || 'usr_' + Date.now());

  // If previously saved under a different ID, clean up old doc
  if (user.id && user.id !== canonicalId) {
    try {
      await deleteDoc(doc(db, 'users', user.id));
    } catch {
      // Ignore if didn't exist
    }
  }

  const role: UserRole = isMasterAdmin ? 'coordenador' : (user.role || 'professor');
  const cargoLabel = isMasterAdmin ? (user.cargoLabel || 'Coordenador (Administrador)') : (user.cargoLabel || 'Monitor / Professor');
  const avatarColor = isMasterAdmin ? 'bg-amber-500' : (user.avatarColor || 'bg-indigo-600');
  const assignedActivities = (user.assignedActivities && user.assignedActivities.length > 0)
    ? user.assignedActivities
    : (isMasterAdmin ? MASTER_ADMIN_ACTIVITIES : []);
  const assignedTurmas = (user.allowedClassIds && user.allowedClassIds.length > 0)
    ? user.allowedClassIds
    : ((user.assignedTurmas && user.assignedTurmas.length > 0) ? user.assignedTurmas : (isMasterAdmin ? MASTER_ADMIN_TURMAS : []));

  const resolvedMinutes = user.contractDailyMinutes !== undefined && Number(user.contractDailyMinutes) > 0
    ? Number(user.contractDailyMinutes)
    : (user.contractDailyHoursFormatted ? parseHoursAndMinutesStringToMinutes(user.contractDailyHoursFormatted) : (user.contractDailyHours ? Math.round(Number(user.contractDailyHours) * 60) : (isMasterAdmin ? 480 : 360)));
  const formattedHours = user.contractDailyHoursFormatted || formatMinutesToHoursAndMinutes(resolvedMinutes);
  const decimalHours = user.contractDailyHours !== undefined ? Number(user.contractDailyHours) : Number((resolvedMinutes / 60).toFixed(2));

  const docRef = doc(db, 'users', canonicalId);
  const docData: any = {
    id: canonicalId,
    name: user.name ? user.name.trim() : (isMasterAdmin ? 'Fernando Veiga' : 'Colaborador'),
    email: isMasterAdmin ? ADMIN_EMAIL : (user.email || '').trim().toLowerCase(),
    phone: user.phone ? user.phone.trim() : '',
    role,
    cargoLabel,
    avatarColor,
    birthDate: user.birthDate || (isMasterAdmin ? '1967-08-12' : '1995-01-01'),
    pin: user.pin || (isMasterAdmin ? '12/08/1967' : '1234'),
    assignedActivities,
    assignedTurmas,
    allowedClassIds: assignedTurmas,
    canManageStudents: isMasterAdmin ? true : (user.canManageStudents !== undefined ? user.canManageStudents : true),
    canMarkAttendance: isMasterAdmin ? true : (user.canMarkAttendance !== undefined ? user.canMarkAttendance : true),
    pixKey: user.pixKey ? user.pixKey.trim() : (user.phone ? user.phone.trim() : ''),
    status: isMasterAdmin ? 'ATIVO' : (user.status || 'ATIVO'),
    dataDesligamento: user.dataDesligamento || '',
    motivoDesligamento: user.motivoDesligamento || '',
    workShiftType: user.workShiftType || (isMasterAdmin ? 'padrao_8h' : 'continua_6h'),
    contractSchedule: user.contractSchedule ? user.contractSchedule.trim() : (isMasterAdmin ? '07:30 - 17:30' : '11:40 - 17:40'),
    contractDailyHours: decimalHours,
    contractDailyMinutes: resolvedMinutes,
    contractDailyHoursFormatted: formattedHours,
    baseSalary: user.baseSalary !== undefined && user.baseSalary !== null && !isNaN(Number(user.baseSalary)) ? Number(user.baseSalary) : (isMasterAdmin ? 5000 : 1200),
    company: user.company ? user.company.trim() : 'GADAL - Gestão e Apoio',
    updatedAt: user.updatedAt || new Date().toISOString(),
  };

  try {
    await setDoc(docRef, docData, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${canonicalId}`);
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

export async function deleteUserFromFirestore(userId: string) {
  try {
    const docRef = doc(db, 'users', userId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
  }
}

export async function saveStudentToFirestore(student: Student) {
  try {
    const normalized = normalizeStudent(student);
    const docRef = doc(db, 'students', normalized.id);
    await setDoc(docRef, {
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
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `students/${student.id}`);
  }
}

export async function deleteStudentFromFirestore(studentId: string) {
  try {
    const docRef = doc(db, 'students', studentId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `students/${studentId}`);
  }
}

export async function saveRecordToFirestore(record: AttendanceRecord): Promise<void> {
  const docRef = doc(db, 'attendanceRecords', record.id);
  const payload = {
    id: record.id,
    studentId: record.studentId,
    date: record.date,
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

export async function reconnectFirestore(): Promise<boolean> {
  if (!isNetworkDisabled) {
    // Network is already active and healthy; do not reset active write streams
    return true;
  }
  try {
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

export function subscribeToSchedules(callback: (schedules: ScheduleBlock[]) => void) {
  const collectionRef = collection(db, 'schedules');
  return onSnapshot(
    collectionRef,
    (snapshot) => {
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
            divisorDays: Number(data.divisorDays) || 30,
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
        divisorDays: Number(closing.divisorDays) || 30,
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



