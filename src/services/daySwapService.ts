import { doc, setDoc } from 'firebase/firestore';
import { db, saveStudentToFirestore } from '../firebase';
import { DaySwapRecord, Student } from '../types';
import { getDayOfWeekFromDate, isStudentScheduledForDay } from '../utils/dateUtils';
import { loadStudents, saveStudents } from '../utils/storageUtils';
import { broadcastSyncEvent } from './syncService';

export const DAY_SWAPS_COLLECTION = 'daySwaps';
export const LOCAL_DAY_SWAPS_STORAGE_KEY = 'colegio_crescer_day_swaps_v1';

export function loadLocalDaySwaps(anoLetivo?: number): DaySwapRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_DAY_SWAPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter((item): item is DaySwapRecord => Boolean(item && item.id && item.dataOrigem && item.dataDestino));
    return anoLetivo ? valid.filter((r) => Number(r.anoLetivo) === Number(anoLetivo)) : valid;
  } catch {
    return [];
  }
}

export function saveLocalDaySwaps(records: DaySwapRecord[]): void {
  try {
    localStorage.setItem(LOCAL_DAY_SWAPS_STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.warn('Erro ao salvar trocas de dias localmente:', err);
  }
}

export interface RegisterDaySwapParams {
  student: Student;
  dataOrigem: string;
  dataDestino: string;
  horarioSaida: string;
  observacao?: string;
  createdBy?: string;
}

/**
 * Registra uma Troca / Permuta Pontual de Dia para aluno ativo de contrato Regular com < 5 dias:
 * - Inclui o aluno na dataDestino (com o horário informado) na Chamada, Atividades e Alertas;
 * - Retira o aluno da contagem de esperados/faltas na dataOrigem;
 * - NÃO altera diasFrequencia, horários fixos, nem gera qualquer cobrança no Financeiro (R$ 0,00).
 */
export async function registerDaySwap({
  student,
  dataOrigem,
  dataDestino,
  horarioSaida,
  observacao,
  createdBy,
}: RegisterDaySwapParams): Promise<{ record: DaySwapRecord; updatedStudent: Student }> {
  if (!student || !student.id) {
    throw new Error('Aluno inválido para registro de Troca de Dia.');
  }
  if ((student.status || 'ativo') !== 'ativo') {
    throw new Error('Apenas alunos com matrícula ativa podem realizar Troca de Dia.');
  }
  if (student.tipoContrato === 'avulso') {
    throw new Error('A Troca de Dia é exclusiva para alunos de contrato Regular com menos de 5 dias na semana.');
  }
  if (!Array.isArray(student.diasFrequencia) || student.diasFrequencia.length === 0 || student.diasFrequencia.length >= 5) {
    throw new Error('Este aluno já possui frequência integral de 5 dias na semana.');
  }

  const originStr = (dataOrigem || '').trim();
  const destStr = (dataDestino || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(originStr) || !/^\d{4}-\d{2}-\d{2}$/.test(destStr)) {
    throw new Error('Informe datas válidas no formato YYYY-MM-DD para origem e destino.');
  }
  if (originStr === destStr) {
    throw new Error('A data substituída e a nova data devem ser diferentes.');
  }

  const originDay = getDayOfWeekFromDate(originStr);
  if (!originDay) {
    throw new Error('O dia do contrato a substituir deve ser um dia útil (Segunda a Sexta).');
  }
  if (!isStudentScheduledForDay(student, originDay)) {
    throw new Error('A data substituída selecionada não faz parte dos dias fixos contratados do aluno.');
  }

  const destDay = getDayOfWeekFromDate(destStr);
  if (!destDay) {
    throw new Error('O novo dia escolhido deve ser um dia útil (Segunda a Sexta).');
  }
  if (isStudentScheduledForDay(student, destDay)) {
    throw new Error('O aluno já frequenta regularmente no dia de destino escolhido pela grade contratada.');
  }

  const activeSwaps = (student.trocasDias || []).filter((s) => s && s.status !== 'cancelado');
  if (activeSwaps.some((s) => s.dataOrigem === originStr)) {
    throw new Error('O dia substituído informado já possui uma troca ativa registrada.');
  }
  if (activeSwaps.some((s) => s.dataDestino === destStr)) {
    throw new Error('Já existe uma troca ativa agendada para esta mesma data de destino.');
  }

  const activeExtraOnDest = (student.diasExtrasAvulsos || []).find(
    (ex) => ex && ex.date === destStr && ex.status !== 'cancelado'
  );
  if (activeExtraOnDest) {
    throw new Error('Já existe um Dia Extra Avulso ativo lançado para este aluno na data de destino.');
  }

  const cleanTime = (horarioSaida || '18:30').trim() || '18:30';
  const anoLetivo = Number(student.anoLetivo) || Number(destStr.slice(0, 4)) || 2026;
  const nowIso = new Date().toISOString();
  const swapId = `swap_${student.id}_${originStr}_${destStr}_${Date.now().toString(36)}`;

  const record: DaySwapRecord = {
    id: swapId,
    studentId: student.id,
    studentName: student.name,
    turma: student.turma,
    anoLetivo,
    dataOrigem: originStr,
    dataDestino: destStr,
    horarioSaida: cleanTime,
    ...(observacao && observacao.trim() ? { observacao: observacao.trim() } : {}),
    status: 'ativo',
    createdAt: nowIso,
    createdBy: createdBy || 'Coordenação',
    updatedAt: nowIso,
    updatedBy: createdBy || 'Coordenação',
  };

  const cleanRecord = Object.fromEntries(
    Object.entries(record).filter(([, v]) => v !== undefined)
  ) as DaySwapRecord;

  // 1. Persiste na coleção operacional `daySwaps` (sem qualquer impacto financeiro)
  await setDoc(doc(db, DAY_SWAPS_COLLECTION, swapId), cleanRecord, { merge: true }).catch((err) => {
    console.warn('Aviso ao gravar troca de dia no Firestore (mantida em cache local):', err);
  });

  const currentLocalSwaps = loadLocalDaySwaps().filter((r) => r.id !== swapId);
  saveLocalDaySwaps([cleanRecord, ...currentLocalSwaps]);

  // 2. Anexa apenas em `student.trocasDias` sem alterar grade fixa nem valores financeiros
  const prevSwaps = Array.isArray(student.trocasDias) ? student.trocasDias : [];
  const updatedStudent: Student = {
    ...student,
    trocasDias: [...prevSwaps.filter((s) => s && s.id !== swapId), cleanRecord],
    updatedAt: nowIso,
  };

  await saveStudentToFirestore(updatedStudent).catch((err) => {
    console.warn('Aviso ao salvar trocasDias no cadastro do aluno:', err);
  });

  const allLocalStudents = loadStudents();
  const nextStudentsList = allLocalStudents.some((s) => s.id === updatedStudent.id)
    ? allLocalStudents.map((s) => (s.id === updatedStudent.id ? updatedStudent : s))
    : [...allLocalStudents, updatedStudent];
  saveStudents(nextStudentsList);

  broadcastSyncEvent('SYNC_DAY_SWAPS', { anoLetivo, record: cleanRecord });
  broadcastSyncEvent('SYNC_STUDENTS', nextStudentsList);

  return { record: cleanRecord, updatedStudent };
}

export async function cancelDaySwap(
  swapRecord: DaySwapRecord,
  updatedBy: string = 'Coordenação'
): Promise<{ updatedRecord: DaySwapRecord; updatedStudent: Student | null }> {
  const nowIso = new Date().toISOString();
  const cancelled: DaySwapRecord = {
    ...swapRecord,
    status: 'cancelado',
    updatedAt: nowIso,
    updatedBy,
  };

  await setDoc(doc(db, DAY_SWAPS_COLLECTION, swapRecord.id), cancelled, { merge: true }).catch((err) => {
    console.warn('Aviso ao cancelar troca de dia no Firestore:', err);
  });

  const localSwaps = loadLocalDaySwaps();
  saveLocalDaySwaps(localSwaps.map((r) => (r.id === swapRecord.id ? cancelled : r)));

  let updatedStudent: Student | null = null;
  const allStudents = loadStudents();
  const targetStudent = allStudents.find((s) => s.id === swapRecord.studentId);
  if (targetStudent) {
    const nextSwaps = (targetStudent.trocasDias || []).map((s) =>
      s.id === swapRecord.id ? cancelled : s
    );
    updatedStudent = {
      ...targetStudent,
      trocasDias: nextSwaps,
      updatedAt: nowIso,
    };
    await saveStudentToFirestore(updatedStudent).catch(() => {});
    const nextStudents = allStudents.map((s) => (s.id === updatedStudent!.id ? updatedStudent! : s));
    saveStudents(nextStudents);
    broadcastSyncEvent('SYNC_STUDENTS', nextStudents);
  }

  broadcastSyncEvent('SYNC_DAY_SWAPS', { anoLetivo: swapRecord.anoLetivo, record: cancelled });
  return { updatedRecord: cancelled, updatedStudent };
}
