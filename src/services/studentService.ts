/**
 * studentService.ts
 * Serviço centralizado de gerenciamento de alunos e matrículas (Colégio Crescer).
 */

import { Student } from '../types';
import { loadStudents, saveStudents } from '../utils/storageUtils';
import { saveStudentToFirestore } from '../firebase';
import { broadcastSyncEvent } from './syncService';

/**
 * Carrega a lista atual de alunos matriculados
 */
export function getStudents(): Student[] {
  return loadStudents();
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
