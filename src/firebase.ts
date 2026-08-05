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
import { Student, AttendanceRecord } from './types';

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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, '_connection_test', 'ping'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or database ping timed out.');
    }
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
        list.push({
          id: docSnap.id,
          name: data.name || '',
          turma: data.turma || '',
          activities: Array.isArray(data.activities) ? data.activities : [],
        });
      });
      onData(list);
    },
    (error) => {
      console.error('Error subscribing to students:', error);
      if (onError) onError(error);
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
        list.push({
          id: docSnap.id,
          studentId: data.studentId || '',
          date: data.date || '',
          weekNumber: Number(data.weekNumber) || 1,
          year: Number(data.year) || 2026,
          activity: data.activity || '',
          turma: data.turma || '',
          status: data.status || 'presente',
          equipmentMissingDetails: data.equipmentMissingDetails || undefined,
          observation: data.observation || undefined,
          createdAt: data.createdAt || new Date().toISOString(),
        });
      });
      onData(list);
    },
    (error) => {
      console.error('Error subscribing to attendanceRecords:', error);
      if (onError) onError(error);
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
      console.error('Error subscribing to turmas:', error);
      if (onError) onError(error);
    }
  );
}

export async function saveStudentToFirestore(student: Student) {
  try {
    const docRef = doc(db, 'students', student.id);
    await setDoc(docRef, {
      id: student.id,
      name: student.name,
      turma: student.turma,
      activities: student.activities,
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
