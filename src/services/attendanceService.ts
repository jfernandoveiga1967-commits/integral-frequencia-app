import { collection, doc, getDocs, onSnapshot, query, setDoc, where, writeBatch, or } from 'firebase/firestore';
import { db } from '../firebase';
import { AttendanceRecord, AttendanceStatus, ActivityType, TurmaType } from '../types';
import { normalizeAttendanceStatus } from '../utils/frequenciaUtils';

/**
 * Retorna o horário atual no formato HH:mm
 */
export function getCurrentHHMM(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Constrói a chave composta por data e ID do aluno (ex: attendance/${dataSelecionada}_${studentId})
 */
export function buildAttendanceDocId(date: string, studentId: string): string {
  const cleanDate = (date || '').trim();
  const cleanStudentId = (studentId || '').trim();
  return `${cleanDate}_${cleanStudentId}`;
}

/**
 * Mapeia o status para a versão em maiúsculas ('PRESENTE', 'FALTA', 'SAIDA_ANTECIPADA', 'SEM_EQUIPAMENTO')
 */
export function toAttendanceStatusUpper(status: string | undefined): 'PRESENTE' | 'FALTA' | 'SAIDA_ANTECIPADA' | 'SEM_EQUIPAMENTO' {
  const normalized = normalizeAttendanceStatus(status);
  switch (normalized) {
    case 'presente':
      return 'PRESENTE';
    case 'saida_antecipada':
      return 'SAIDA_ANTECIPADA';
    case 'sem_equipamento':
      return 'SEM_EQUIPAMENTO';
    case 'falta':
    default:
      return 'FALTA';
  }
}

/**
 * Grava o registro de frequência no Firestore utilizando a chave composta por data e ID do aluno (attendance/${dataSelecionada}_${studentId})
 * e também atualiza a coleção de registros para compatibilidade integral do sistema.
 */
export async function saveAttendanceRecordToFirestore(
  recordData: Omit<AttendanceRecord, 'id' | 'createdAt'> & {
    id?: string;
    createdAt?: string;
    modalidade?: string;
    dataSelecionada?: string;
    horarioAlteracao?: string;
  }
): Promise<{ record: AttendanceRecord; savedAtTime: string }> {
  const date = recordData.date || recordData.dataSelecionada || new Date().toISOString().split('T')[0];
  const studentId = recordData.studentId;
  const compositeId = buildAttendanceDocId(date, studentId);
  const legacyId = `${studentId}_${recordData.activity || 'Rotina'}_${date}`;
  const savedAtTime = recordData.horarioAlteracao || getCurrentHHMM();
  const nowIso = new Date().toISOString();

  const canonicalStatus = normalizeAttendanceStatus(recordData.status);
  const upperStatus = toAttendanceStatusUpper(recordData.status);
  const activity = (recordData.activity || recordData.modalidade || 'Rotina') as ActivityType;

  const payload = {
    id: compositeId,
    studentId,
    date,
    data: date,
    dataSelecionada: date,
    weekNumber: recordData.weekNumber || 1,
    year: recordData.year || 2026,
    activity,
    modalidade: activity,
    tipo: activity,
    turma: (recordData.turma || '') as TurmaType,
    status: canonicalStatus,
    statusUpper: upperStatus,
    horarioAlteracao: savedAtTime,
    exitTime: recordData.exitTime || '',
    equipmentMissingDetails: recordData.equipmentMissingDetails || '',
    observation: recordData.observation || '',
    instructorId: recordData.instructorId || '',
    instructorName: recordData.instructorName || '',
    timeSlot: recordData.timeSlot || '',
    confirmadoNoBloco: recordData.confirmadoNoBloco ?? true,
    confirmedAt: recordData.confirmedAt || nowIso,
    createdAt: recordData.createdAt || nowIso,
    updatedAt: nowIso,
  };

  const canonicalRecord: AttendanceRecord = {
    id: compositeId,
    studentId,
    activity,
    turma: (recordData.turma || '') as TurmaType,
    date,
    weekNumber: recordData.weekNumber || 1,
    year: recordData.year || 2026,
    status: canonicalStatus,
    exitTime: recordData.exitTime,
    equipmentMissingDetails: recordData.equipmentMissingDetails,
    observation: recordData.observation,
    instructorId: recordData.instructorId,
    instructorName: recordData.instructorName,
    timeSlot: recordData.timeSlot,
    confirmadoNoBloco: recordData.confirmadoNoBloco ?? true,
    confirmedAt: recordData.confirmedAt || nowIso,
    createdAt: recordData.createdAt || nowIso,
  };

  // Grava atômica em lote em ambas as coleções (attendance/${dataSelecionada}_${studentId} e attendanceRecords)
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'attendance', compositeId), payload, { merge: true });
    batch.set(doc(db, 'attendanceRecords', compositeId), payload, { merge: true });
    // Mantém também o ID legado `${studentId}_${activity}_${date}` para retrocompatibilidade total
    batch.set(doc(db, 'attendanceRecords', legacyId), { ...payload, id: legacyId }, { merge: true });
    await batch.commit();
  } catch (err) {
    console.warn('Erro ao salvar no Firestore (tentando gravação individual):', err);
    await Promise.allSettled([
      setDoc(doc(db, 'attendance', compositeId), payload, { merge: true }),
      setDoc(doc(db, 'attendanceRecords', compositeId), payload, { merge: true }),
      setDoc(doc(db, 'attendanceRecords', legacyId), { ...payload, id: legacyId }, { merge: true }),
    ]);
  }

  return {
    record: canonicalRecord,
    savedAtTime,
  };
}

/**
 * Converte documento bruto do Firestore em AttendanceRecord estrito
 */
function parseDocToAttendanceRecord(docId: string, data: any): AttendanceRecord | null {
  if (!data || !data.studentId) return null;
  const date = data.date || data.data || data.dataSelecionada || '';
  if (!date) return null;

  const rawStatus = data.statusUpper || data.status;
  const status = normalizeAttendanceStatus(rawStatus);
  const activity = (data.activity || data.modalidade || data.tipo || 'Rotina') as ActivityType;

  return {
    id: docId,
    studentId: String(data.studentId).trim(),
    activity,
    turma: (data.turma || '') as TurmaType,
    date,
    weekNumber: Number(data.weekNumber) || 1,
    year: Number(data.year) || 2026,
    status,
    exitTime: data.exitTime || undefined,
    equipmentMissingDetails: data.equipmentMissingDetails || undefined,
    observation: data.observation || undefined,
    instructorId: data.instructorId || undefined,
    instructorName: data.instructorName || undefined,
    timeSlot: data.timeSlot || undefined,
    confirmadoNoBloco: !!data.confirmadoNoBloco,
    confirmedAt: data.confirmedAt || undefined,
    createdAt: data.createdAt || new Date().toISOString(),
  };
}

/**
 * Busca todos os registros de presença do Firestore para uma data específica (incluindo dias retroativos)
 */
export async function fetchAttendanceRecordsForDate(targetDate: string): Promise<AttendanceRecord[]> {
  if (!targetDate) return [];

  const resultsMap = new Map<string, AttendanceRecord>();

  try {
    const [snapAttendance, snapRecords] = await Promise.allSettled([
      getDocs(
        query(
          collection(db, 'attendance'),
          or(
            where('date', '==', targetDate),
            where('data', '==', targetDate),
            where('dataSelecionada', '==', targetDate)
          )
        )
      ),
      getDocs(
        query(
          collection(db, 'attendanceRecords'),
          or(
            where('date', '==', targetDate),
            where('data', '==', targetDate),
            where('dataSelecionada', '==', targetDate)
          )
        )
      ),
    ]);

    if (snapAttendance.status === 'fulfilled') {
      snapAttendance.value.forEach((d) => {
        const parsed = parseDocToAttendanceRecord(d.id, d.data());
        if (parsed) {
          const key = `${parsed.studentId}_${parsed.activity}_${parsed.date}`;
          resultsMap.set(key, parsed);
        }
      });
    }

    if (snapRecords.status === 'fulfilled') {
      snapRecords.value.forEach((d) => {
        const parsed = parseDocToAttendanceRecord(d.id, d.data());
        if (parsed) {
          const key = `${parsed.studentId}_${parsed.activity}_${parsed.date}`;
          if (!resultsMap.has(key)) {
            resultsMap.set(key, parsed);
          }
        }
      });
    }
  } catch (err) {
    console.warn(`Erro ao buscar attendance records para a data ${targetDate}:`, err);
  }

  return Array.from(resultsMap.values());
}

/**
 * Escuta em tempo real todas as alterações de presença para a data selecionada (onSnapshot)
 */
export function subscribeAttendanceByDate(
  targetDate: string,
  onData: (records: AttendanceRecord[]) => void,
  onError?: (err: any) => void
): () => void {
  if (!targetDate) {
    onData([]);
    return () => {};
  }

  const recordsMap = new Map<string, AttendanceRecord>();

  const emit = () => {
    onData(Array.from(recordsMap.values()));
  };

  const colAttendance = collection(db, 'attendance');
  const qAttendance = query(
    colAttendance,
    or(
      where('date', '==', targetDate),
      where('data', '==', targetDate),
      where('dataSelecionada', '==', targetDate)
    )
  );

  const colRecords = collection(db, 'attendanceRecords');
  const qRecords = query(
    colRecords,
    or(
      where('date', '==', targetDate),
      where('data', '==', targetDate),
      where('dataSelecionada', '==', targetDate)
    )
  );

  const unsubAttendance = onSnapshot(
    qAttendance,
    (snap) => {
      snap.forEach((d) => {
        const parsed = parseDocToAttendanceRecord(d.id, d.data());
        if (parsed) {
          const key = `${parsed.studentId}_${parsed.activity}_${parsed.date}`;
          recordsMap.set(key, parsed);
        }
      });
      emit();
    },
    (err) => {
      console.warn('Erro no listener attendance:', err);
      onError?.(err);
    }
  );

  const unsubRecords = onSnapshot(
    qRecords,
    (snap) => {
      snap.forEach((d) => {
        const parsed = parseDocToAttendanceRecord(d.id, d.data());
        if (parsed) {
          const key = `${parsed.studentId}_${parsed.activity}_${parsed.date}`;
          recordsMap.set(key, parsed);
        }
      });
      emit();
    },
    (err) => {
      console.warn('Erro no listener attendanceRecords:', err);
      onError?.(err);
    }
  );

  return () => {
    unsubAttendance();
    unsubRecords();
  };
}
