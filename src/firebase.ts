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
  console.warn('Firestore notice (offline or sync delay):', JSON.stringify(errInfo));
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
          list.push({
            id: data.id,
            name: data.name || '',
            email: data.email || '',
            role: data.role || 'professor',
            cargoLabel: data.cargoLabel || 'Monitor / Professor',
            avatarColor: data.avatarColor || 'bg-indigo-600',
            pin: data.pin || '1234',
            assignedActivities: Array.isArray(data.assignedActivities) ? data.assignedActivities : [],
            assignedTurmas: Array.isArray(data.assignedTurmas) ? data.assignedTurmas : [],
            canManageStudents: data.canManageStudents !== undefined ? data.canManageStudents : true,
            canMarkAttendance: data.canMarkAttendance !== undefined ? data.canMarkAttendance : true,
            updatedAt: data.updatedAt || new Date().toISOString(),
          });
        }
      });
      onData(list);
    },
    (error) => {
      console.error('Error subscribing to users:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'users');
    }
  );
}

export async function saveUserToFirestore(user: UserProfile) {
  try {
    const docRef = doc(db, 'users', user.id);
    await setDoc(docRef, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      cargoLabel: user.cargoLabel,
      avatarColor: user.avatarColor || 'bg-indigo-600',
      pin: user.pin || '1234',
      assignedActivities: user.assignedActivities || [],
      assignedTurmas: user.assignedTurmas || [],
      canManageStudents: user.canManageStudents !== undefined ? user.canManageStudents : true,
      canMarkAttendance: user.canMarkAttendance !== undefined ? user.canMarkAttendance : true,
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
      console.error('Error subscribing to activities:', error);
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
