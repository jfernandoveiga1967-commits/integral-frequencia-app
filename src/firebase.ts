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
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Student, AttendanceRecord, UserProfile, ActivityItem } from './types';

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
    const pingPromise = getDocFromServer(doc(db, '_connection_test', 'ping'));
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout')), 3500)
    );
    await Promise.race([pingPromise, timeoutPromise]);
    return true;
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
        const rawActivities = Array.isArray(data.activities) ? data.activities : [];
        const activities = rawActivities.includes('Rotina') ? rawActivities : ['Rotina', ...rawActivities];
        list.push({
          id: docSnap.id,
          name: data.name || '',
          turma: data.turma || '',
          activities,
        });
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
      const list: UserProfile[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.id) {
          const isMasterAdmin =
            (data.email || '').trim().toLowerCase() === 'jfernandoveiga1967@gmail.com' ||
            data.id === 'usr_coord_1' ||
            (data.name && data.name.toLowerCase().includes('fernando veiga'));
          const role = isMasterAdmin ? 'coordenador' : (data.role || 'professor');
          const cargoLabel = isMasterAdmin ? 'Coordenador (Administrador)' : (data.cargoLabel || 'Monitor / Professor');
          const avatarColor = isMasterAdmin ? 'bg-amber-500' : (data.avatarColor || 'bg-indigo-600');

          list.push({
            id: data.id,
            name: data.name || (isMasterAdmin ? 'Fernando Veiga' : ''),
            email: data.email || (isMasterAdmin ? 'jfernandoveiga1967@gmail.com' : ''),
            role,
            cargoLabel,
            avatarColor,
            birthDate: data.birthDate || (isMasterAdmin ? '1967-08-12' : ''),
            pin: data.pin || (isMasterAdmin ? '12/08/1967' : '1234'),
            assignedActivities: Array.isArray(data.assignedActivities) ? data.assignedActivities : [],
            assignedTurmas: Array.isArray(data.allowedClassIds) ? data.allowedClassIds : (Array.isArray(data.assignedTurmas) ? data.assignedTurmas : undefined),
            allowedClassIds: Array.isArray(data.allowedClassIds) ? data.allowedClassIds : (Array.isArray(data.assignedTurmas) ? data.assignedTurmas : undefined),
            canManageStudents: isMasterAdmin ? true : (data.canManageStudents !== undefined ? data.canManageStudents : true),
            canMarkAttendance: isMasterAdmin ? true : (data.canMarkAttendance !== undefined ? data.canMarkAttendance : true),
            updatedAt: data.updatedAt || new Date().toISOString(),
          });
        }
      });
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'users');
    }
  );
}

export async function saveUserToFirestore(user: UserProfile) {
  try {
    const isMasterAdmin =
      (user.email || '').trim().toLowerCase() === 'jfernandoveiga1967@gmail.com' ||
      user.id === 'usr_coord_1' ||
      (user.name && user.name.toLowerCase().includes('fernando veiga'));
    const role = isMasterAdmin ? 'coordenador' : user.role;
    const cargoLabel = isMasterAdmin ? 'Coordenador (Administrador)' : user.cargoLabel;
    const avatarColor = isMasterAdmin ? 'bg-amber-500' : (user.avatarColor || 'bg-indigo-600');

    const docRef = doc(db, 'users', user.id);
    await setDoc(docRef, {
      id: user.id,
      name: user.name,
      email: user.email,
      role,
      cargoLabel,
      avatarColor,
      birthDate: user.birthDate || (isMasterAdmin ? '1967-08-12' : ''),
      pin: user.pin || (isMasterAdmin ? '12/08/1967' : '1234'),
      assignedActivities: user.assignedActivities || [],
      assignedTurmas: user.allowedClassIds !== undefined ? user.allowedClassIds : (user.assignedTurmas !== undefined ? user.assignedTurmas : []),
      allowedClassIds: user.allowedClassIds !== undefined ? user.allowedClassIds : (user.assignedTurmas !== undefined ? user.assignedTurmas : []),
      canManageStudents: isMasterAdmin ? true : (user.canManageStudents !== undefined ? user.canManageStudents : true),
      canMarkAttendance: isMasterAdmin ? true : (user.canMarkAttendance !== undefined ? user.canMarkAttendance : true),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.id}`);
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
            description: data.description || '',
            defaultEquipment: data.defaultEquipment || '',
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
      description: activity.description || '',
      defaultEquipment: activity.defaultEquipment || '',
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
    const acts = Array.isArray(student.activities) ? student.activities : [];
    const activities = acts.includes('Rotina') ? acts : ['Rotina', ...acts];
    const docRef = doc(db, 'students', student.id);
    await setDoc(docRef, {
      id: student.id,
      name: student.name,
      turma: student.turma,
      activities,
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

export async function saveRecordToFirestore(record: AttendanceRecord) {
  try {
    const docRef = doc(db, 'attendanceRecords', record.id);
    await setDoc(docRef, {
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
      createdAt: record.createdAt,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `attendanceRecords/${record.id}`);
  }
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
    const batch = writeBatch(db);
    for (const t of turmas) {
      const safeId = t.replace(/\s+/g, '_').toLowerCase();
      batch.set(doc(db, 'turmas', safeId), { id: safeId, name: t });
    }
    for (const s of students) {
      batch.set(doc(db, 'students', s.id), {
        id: s.id,
        name: s.name,
        turma: s.turma,
        activities: s.activities,
      });
    }
    for (const r of records) {
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
  } catch (error) {
    console.error('Error seeding initial data to Firestore:', error);
  }
}
