/**
 * studentService.ts
 * Serviço centralizado de gerenciamento de alunos e matrículas (Colégio Crescer).
 */

import { Student } from '../types';
import {
  loadStudents,
  saveStudents,
  isSurplus2027Student,
  markStudentAsDeleted,
  removeStudentFromLocalStorage,
} from '../utils/storageUtils';
import { saveStudentToFirestore, batchDeleteStudentsFromFirestore } from '../firebase';
import { broadcastSyncEvent } from './syncService';
import { normalizeStudentNameForMatching } from '../utils/e1Parser';

export const OFFICIAL_2027_BATCH_COUNT = 133;

export interface Audit2027Report {
  isAuditedAndClean: boolean;
  officialExpectedCount: number;
  currentActiveCount: number;
  surplusCount: number;
  surplusStudents: Student[];
  rematriculadosCount: number;
  novosCount: number;
  novosMiniMaternalCount: number;
  novosOutrasTurmasCount: number;
  totalAtivos2026Count: number;
  formandos6AnoAtivosCount: number;
  baseElegivel2026Count: number;
  retentionRatePct: number;
}

/**
 * Validador estrito de status ativo do aluno (excluindo inativo, cancelado ou trancado)
 */
export function isStudentActive(student: Student): boolean {
  if (!student) return false;
  const st = (student.status || '').toLowerCase().trim();
  const stMat = (student.statusMatricula || '').toLowerCase().trim();
  if (st === 'inativo' || st === 'cancelado' || st === 'trancado') return false;
  if (stMat === 'inativo' || stMat === 'cancelado' || stMat === 'trancado') return false;
  return st === 'ativo' || stMat === 'ativo' || stMat === 'regular';
}

/**
 * Carrega a lista atual de alunos matriculados
 */
export function getStudents(): Student[] {
  return loadStudents();
}

/**
 * Audita a lista de alunos do ano letivo de 2027, verificando o alinhamento
 * estrito com o lote oficial de 133 alunos importados do Sistema E1 e
 * calculando a retenção sobre a base ESTRITAMENTE ATIVA de 2026.
 */
export function audit2027Students(studentsList?: Student[]): Audit2027Report {
  const currentList = studentsList || getStudents();
  const allStudents2026 = currentList.filter(
    (s) => (s.anoLetivo || 2026) === 2026
  );
  const activeStudents2026 = allStudents2026.filter(isStudentActive);
  const students2027 = currentList.filter(
    (s) => s.anoLetivo === 2027 && isStudentActive(s)
  );

  const surplusStudents = students2027.filter((s) => isSurplus2027Student(s));
  const valid2027 = students2027.filter((s) => !isSurplus2027Student(s));

  const history2026 = new Set(
    allStudents2026.map((s) => normalizeStudentNameForMatching(s.name))
  );

  const rematriculados = valid2027.filter((s) =>
    history2026.has(normalizeStudentNameForMatching(s.name))
  );
  const novos = valid2027.filter(
    (s) => !history2026.has(normalizeStudentNameForMatching(s.name))
  );

  const isMini = (t?: string) => (t || '').toLowerCase().includes('mini');
  const is6Ano = (t?: string) => (t || '').toLowerCase().includes('6');

  // Base Elegível 2026: Exclusivamente alunos com status ativo, subtraindo apenas 6º ano ativo
  const active6Ano2026 = activeStudents2026.filter((s) => is6Ano(s.turma));
  const baseElegivel2026 = activeStudents2026.filter((s) => !is6Ano(s.turma));
  const baseElegivel2026Count = baseElegivel2026.length;

  const novosMini = novos.filter((s) => isMini(s.turma));
  const novosOutras = novos.filter((s) => !isMini(s.turma));

  const retentionRatePct =
    baseElegivel2026Count > 0
      ? (rematriculados.length / baseElegivel2026Count) * 100
      : 0;

  return {
    isAuditedAndClean: valid2027.length === OFFICIAL_2027_BATCH_COUNT && surplusStudents.length === 0,
    officialExpectedCount: OFFICIAL_2027_BATCH_COUNT,
    currentActiveCount: valid2027.length,
    surplusCount: surplusStudents.length,
    surplusStudents,
    rematriculadosCount: rematriculados.length,
    novosCount: novos.length,
    novosMiniMaternalCount: novosMini.length,
    novosOutrasTurmasCount: novosOutras.length,
    totalAtivos2026Count: activeStudents2026.length,
    formandos6AnoAtivosCount: active6Ano2026.length,
    baseElegivel2026Count,
    retentionRatePct,
  };
}

/**
 * Realiza o expurgo de cadastros excedentes e duplicados fora da lista oficial de 133 alunos do E1 em 2027.
 */
export async function purgeSurplus2027Students(): Promise<{
  purgedCount: number;
  remainingCount: number;
}> {
  const currentList = getStudents();
  const surplusStudents = currentList.filter(
    (s) => s.anoLetivo === 2027 && isSurplus2027Student(s)
  );
  const surplusIds = surplusStudents.map((s) => s.id);

  if (surplusIds.length > 0) {
    try {
      await batchDeleteStudentsFromFirestore(surplusIds);
    } catch (e) {
      console.warn('[studentService] Aviso ao expurgar excedentes no Firestore:', e);
    }

    surplusIds.forEach((id) => {
      markStudentAsDeleted(id);
      removeStudentFromLocalStorage(id);
    });

    const cleanedList = currentList.filter((s) => !surplusIds.includes(s.id));
    saveStudents(cleanedList);
    broadcastSyncEvent('SYNC_STUDENTS', cleanedList);
  }

  const audited2027 = getStudents().filter(
    (s) => s.anoLetivo === 2027 && (s.status || 'ativo') === 'ativo'
  );

  return {
    purgedCount: surplusIds.length,
    remainingCount: audited2027.length,
  };
}

/**
 * Cadastra um novo aluno no sistema (estado local + Firestore + sincronização)
 */
export async function createStudent(dados: {
  nome: string;
  turmaId: string;
  responsavel?: string;
  telefone?: string;
  horarioEntradaSaida?: string;
  activities?: string[];
  anoLetivo?: number;
  tipoSaida?: 'PAIS' | 'TRANSPORTE_ESCOLAR';
  nomeCondutor?: string;
}): Promise<Student> {
  const currentList = getStudents();
  const id = `st_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const newStudent: Student = {
    id,
    name: dados.nome.trim(),
    turma: dados.turmaId.trim(),
    activities: dados.activities && dados.activities.length > 0 ? dados.activities : ['Rotina'],
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    anoLetivo: dados.anoLetivo ?? 2026,
    tipoSaida: dados.tipoSaida ?? 'PAIS',
    nomeCondutor: dados.tipoSaida === 'TRANSPORTE_ESCOLAR' ? dados.nomeCondutor?.trim() : undefined,
    notes: dados.responsavel || dados.telefone
      ? `Resp: ${dados.responsavel || 'Não informado'} | Tel: ${dados.telefone || 'Não informado'}`
      : undefined,
    horarioSaida: dados.horarioEntradaSaida || '17:30',
  };

  const updatedList = [newStudent, ...currentList];
  saveStudents(updatedList);

  try {
    await saveStudentToFirestore(newStudent);
  } catch (err) {
    console.warn('[studentService] Falha ao persistir no Firestore, mantido local:', err);
  }

  broadcastSyncEvent('SYNC_STUDENTS', updatedList);
  return newStudent;
}

/**
 * Atualiza os dados de um aluno existente
 */
export async function updateStudent(
  alunoId: string,
  dadosAtualizados: Partial<Student>
): Promise<Student | null> {
  const currentList = getStudents();
  const index = currentList.findIndex((s) => s.id === alunoId || s.name.toLowerCase() === alunoId.toLowerCase());

  if (index === -1) {
    return null;
  }

  const existing = currentList[index];
  const updatedStudent: Student = {
    ...existing,
    ...dadosAtualizados,
    id: existing.id, // Garante que o ID imutável seja mantido
  };

  currentList[index] = updatedStudent;
  saveStudents(currentList);

  try {
    await saveStudentToFirestore(updatedStudent);
  } catch (err) {
    console.warn('[studentService] Falha ao persistir atualização no Firestore:', err);
  }

  broadcastSyncEvent('SYNC_STUDENTS', currentList);
  return updatedStudent;
}
