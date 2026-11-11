/**
 * studentService.ts
 * Serviço centralizado de gerenciamento de alunos e matrículas (Colégio Crescer).
 */

import { Student } from '../types';
import {
  loadStudents,
  saveStudents,
  loadTurmas,
  saveTurmas,
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

/**
 * Garante o remanejamento oficial do aluno Klaus (Klaus Cuciolli) para o 4º Ano Azul
 * em ambos os exercícios (2026 e 2027), com status ATIVO, preservando seu histórico
 * de frequência e restabelecendo sua visibilidade imediata em todas as listas de chamada,
 * semanário e gestão de matrículas.
 */
export async function reclassifyKlausTo4thYear(): Promise<{
  student2026: Student;
  student2027: Student;
}> {
  const nowIso = new Date().toISOString();
  const currentList = getStudents();

  // Klaus 2026
  const existing2026 = currentList.find(
    (s) => (s.anoLetivo || 2026) === 2026 && s.name.toLowerCase().includes('klaus')
  );
  const student2026: Student = {
    ...(existing2026 || {}),
    id: existing2026?.id || 'st-1789472909713-11-oq78',
    name: 'Klaus Cuciolli',
    turma: '4º Ano Azul',
    anoLetivo: 2026,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: existing2026?.activities && existing2026.activities.length > 0
      ? existing2026.activities
      : ['Rotina', 'Natação', 'Futebol', 'Judô', 'Flauta'],
    modalidadesEspeciais: existing2026?.modalidadesEspeciais || ['Reforço'],
    diasFrequencia: existing2026?.diasFrequencia || ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: existing2026?.horariosSaida || {},
    notes: 'Remanejado do 3º Ano para o 4º Ano Azul com histórico preservado',
    dataInicioContrato: '',
    dataTerminoContrato: '',
    inactivationDate: '',
    inactivationReason: '',
    updatedAt: nowIso,
  };

  // Klaus 2027
  const existing2027 = currentList.find(
    (s) => s.anoLetivo === 2027 && s.name.toLowerCase().includes('klaus')
  );
  const student2027: Student = {
    ...(existing2027 || {}),
    id: existing2027?.id || 'st-1793979401405-105',
    name: 'Klaus Cuciolli',
    matricula: existing2027?.matricula || 'st-1793979401405-105',
    turma: '4º Ano Azul',
    anoLetivo: 2027,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: existing2027?.activities || ['Rotina'],
    diasFrequencia: existing2027?.diasFrequencia || ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: existing2027?.horariosSaida || {},
    planoContratual: existing2027?.planoContratual || 'Integral Semana (18:30h)',
    horarioPermanenciaLimite: '18:30h',
    valorPlanoBase: 1250,
    descontoBolsa: 0,
    valorMensalidadeFinal: 1250,
    tipoSaida: 'PAIS',
    notes: 'Rematrícula 2027 4º Ano Azul confirmada',
    inactivationDate: '',
    inactivationReason: '',
    updatedAt: nowIso,
  };

  // Atualizar lista local
  const filtered = currentList.filter(
    (s) => s.id !== student2026.id && s.id !== student2027.id
  );
  const updatedList = [student2026, student2027, ...filtered];
  saveStudents(updatedList);

  // Persistir no Firestore
  try {
    await saveStudentToFirestore(student2026);
    await saveStudentToFirestore(student2027);
  } catch (e) {
    console.warn('[studentService] Aviso ao persistir remanejamento de Klaus no Firestore:', e);
  }

  broadcastSyncEvent('SYNC_STUDENTS', updatedList);

  return {
    student2026,
    student2027,
  };
}

/**
 * Lista canônica dos 14 alunos oficiais do Mini Maternal de 2026 vinculados
 * aos 528 registros históricos de chamada na coleção attendanceRecords.
 */
export const OFFICIAL_MINI_MATERNAL_2026_STUDENTS: Student[] = [
  {
    id: 'st-1786023256048-0-xgds',
    matricula: 'st-1786023256048-0-xgds',
    name: 'Maria Eloá Bueno Nunes',
    turma: 'Mini Maternal Azul',
    anoLetivo: 2026,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: ['Rotina'],
    diasFrequencia: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: {},
    notes: 'Matrícula Oficial 2026 - Mini Maternal Azul',
  },
  {
    id: 'st-1786023256048-1-h1if',
    matricula: 'st-1786023256048-1-h1if',
    name: 'Lucas Ribeiro Motta',
    turma: 'Mini Maternal Azul',
    anoLetivo: 2026,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: ['Rotina'],
    diasFrequencia: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: {},
    notes: 'Matrícula Oficial 2026 - Mini Maternal Azul',
  },
  {
    id: 'st-1786023256048-2-0bbc',
    matricula: 'st-1786023256048-2-0bbc',
    name: 'Lucas Xavier Rodrigues',
    turma: 'Mini Maternal Azul',
    anoLetivo: 2026,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: ['Rotina'],
    diasFrequencia: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: {},
    notes: 'Matrícula Oficial 2026 - Mini Maternal Azul',
  },
  {
    id: 'st-1786023256048-3-xx25',
    matricula: 'st-1786023256048-3-xx25',
    name: 'Antonella dos Santos Lima',
    turma: 'Mini Maternal Azul',
    anoLetivo: 2026,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: ['Rotina'],
    diasFrequencia: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: {},
    notes: 'Matrícula Oficial 2026 - Mini Maternal Azul',
  },
  {
    id: 'st-1786023256048-4-l16u',
    matricula: 'st-1786023256048-4-l16u',
    name: 'Pedro Guimarães Santos',
    turma: 'Mini Maternal Azul',
    anoLetivo: 2026,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: ['Rotina'],
    diasFrequencia: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: {},
    notes: 'Matrícula Oficial 2026 - Mini Maternal Azul',
  },
  {
    id: 'st-1786023256048-5-5vrf',
    matricula: 'st-1786023256048-5-5vrf',
    name: 'Helena Vasconcelos Ramos',
    turma: 'Mini Maternal Azul',
    anoLetivo: 2026,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: ['Rotina'],
    diasFrequencia: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: {},
    notes: 'Matrícula Oficial 2026 - Mini Maternal Azul',
  },
  {
    id: 'st-1787171728919-w8dx',
    matricula: 'st-1787171728919-w8dx',
    name: 'Joaquim Ferreira Prado',
    turma: 'Mini Maternal Azul',
    anoLetivo: 2026,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: ['Rotina'],
    diasFrequencia: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: {},
    notes: 'Matrícula Oficial 2026 - Mini Maternal Azul',
  },
  {
    id: 'st-1788527089570-ctsi',
    matricula: 'st-1788527089570-ctsi',
    name: 'Cecília Rocha Almeida',
    turma: 'Mini Maternal Azul',
    anoLetivo: 2026,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: ['Rotina'],
    diasFrequencia: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: {},
    notes: 'Matrícula Oficial 2026 - Mini Maternal Azul',
  },
  {
    id: 'st-1788878234936-yklw',
    matricula: 'st-1788878234936-yklw',
    name: 'Davi Lucca Moreira',
    turma: 'Mini Maternal Azul',
    anoLetivo: 2026,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: ['Rotina'],
    diasFrequencia: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: {},
    notes: 'Matrícula Oficial 2026 - Mini Maternal Azul',
  },
  {
    id: 'st-1791559436540-ru3a',
    matricula: 'st-1791559436540-ru3a',
    name: 'Lara Beatriz Mendes',
    turma: 'Mini Maternal Azul',
    anoLetivo: 2026,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: ['Rotina'],
    diasFrequencia: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: {},
    notes: 'Matrícula Oficial 2026 - Mini Maternal Azul',
  },
  {
    id: 'st-1793456297352-0-nqty',
    matricula: 'st-1793456297352-0-nqty',
    name: 'Noah Rodrigues Lima',
    turma: 'Mini Maternal Azul',
    anoLetivo: 2026,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: ['Rotina'],
    diasFrequencia: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: {},
    notes: 'Matrícula Oficial 2026 - Mini Maternal Azul',
  },
  {
    id: 'st-1793721721927-43-sev8r',
    matricula: 'st-1793721721927-43-sev8r',
    name: 'Bernardo Silva Ramos',
    turma: 'Mini Maternal Azul',
    anoLetivo: 2026,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: ['Rotina'],
    diasFrequencia: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: {},
    notes: 'Matrícula Oficial 2026 - Mini Maternal Azul',
  },
  {
    id: 'st-1793721721927-44-b6yeo',
    matricula: 'st-1793721721927-44-b6yeo',
    name: 'Theo Henrique Barbosa',
    turma: 'Mini Maternal Azul',
    anoLetivo: 2026,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: ['Rotina'],
    diasFrequencia: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: {},
    notes: 'Matrícula Oficial 2026 - Mini Maternal Azul',
  },
  {
    id: 'st-1793721721927-45-k9o55',
    matricula: 'st-1793721721927-45-k9o55',
    name: 'Valentina Souza Castro',
    turma: 'Mini Maternal Azul',
    anoLetivo: 2026,
    status: 'ativo',
    statusMatricula: 'ativo',
    tipoContrato: 'regular',
    activities: ['Rotina'],
    diasFrequencia: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    horariosSaida: {},
    notes: 'Matrícula Oficial 2026 - Mini Maternal Azul',
  },
];

/**
 * Restaura imediatamente a Turma do Mini Maternal para o exercício de 2026 no
 * banco de dados Firestore e localStorage, reconstituindo o cadastro da turma,
 * a atribuição de sala/equipe e os 14 alunos vinculados a ela em 2026 com
 * histórico preservado e sem afetar o exercício de 2027.
 */
export async function restoreMiniMaternal2026(): Promise<{
  turmaRestaurada: string;
  restoredStudentsCount: number;
  studentsList: Student[];
}> {
  // 1. Assegurar turma no LocalStorage
  const currentTurmas = loadTurmas();
  if (!currentTurmas.includes('Mini Maternal Azul')) {
    currentTurmas.unshift('Mini Maternal Azul');
    saveTurmas(currentTurmas);
  }

  // 2. Persistir turma e quadro no Firestore
  try {
    const { saveTurmaToFirestore, saveTurmaAtribuicaoToFirestore } = await import('../firebase');
    await saveTurmaToFirestore('Mini Maternal Azul');

    await saveTurmaAtribuicaoToFirestore({
      id: 'atrib_minimaternal_azul',
      turma: 'Mini Maternal Azul',
      espacoBase: 'Sala 4 (Maternal)',
      horarioTurno: '11:20 às 17:20',
      monitoraName: 'Stefani Caroline Germano',
      monitoraPhone: '(19) 98976-6174',
      adiName: 'Patrícia Nascimento',
      adiPhone: '(19) 99525-1590',
      observacao: 'Cuidados, rotina e estimulação psicomotora com bebês (Mini Maternal).',
    });
  } catch (e) {
    console.warn('[studentService] Aviso ao persistir Mini Maternal no Firestore:', e);
  }

  // 3. Reconstituir e relincar alunos do Mini Maternal 2026
  const currentStudents = getStudents();
  const studentMap = new Map<string, Student>();
  currentStudents.forEach((s) => studentMap.set(s.id, s));

  const nowIso = new Date().toISOString();
  const restoredStudents: Student[] = OFFICIAL_MINI_MATERNAL_2026_STUDENTS.map((st) => {
    const existing = studentMap.get(st.id);
    return {
      ...(existing || {}),
      ...st,
      updatedAt: nowIso,
    };
  });

  // Atualizar mapa
  restoredStudents.forEach((st) => {
    studentMap.set(st.id, st);
  });

  const updatedStudents = Array.from(studentMap.values());
  saveStudents(updatedStudents);

  // 4. Salvar alunos no Firestore em lote
  try {
    for (const st of restoredStudents) {
      await saveStudentToFirestore(st);
    }
  } catch (e) {
    console.warn('[studentService] Aviso ao salvar alunos do Mini Maternal no Firestore:', e);
  }

  broadcastSyncEvent('SYNC_TURMAS', currentTurmas);
  broadcastSyncEvent('SYNC_STUDENTS', updatedStudents);

  return {
    turmaRestaurada: 'Mini Maternal Azul',
    restoredStudentsCount: restoredStudents.length,
    studentsList: restoredStudents,
  };
}

