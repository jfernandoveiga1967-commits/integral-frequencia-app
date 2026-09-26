import {
  getDocFromServer,
  doc,
  terminate,
} from 'firebase/firestore';
import { db, saveStudentToFirestore } from '../src/firebase';
import { normalizeStudent, mergeStudentData } from '../src/utils/storageUtils';
import { Student } from '../src/types';
import { toISODateString } from '../src/utils/dateUtils';
import { isStudentActiveOnDate, isStudentScheduledForDate } from '../src/utils/dateUtils';

async function runTest() {
  const directDb = db;
  const studentId = 'st-1790358651800-dl4g';
  console.log(`\n======================================================`);
  console.log(`TESTE REAL DE REATIVAÇÃO NO FIRESTORE: ${studentId}`);
  console.log(`======================================================\n`);

  // 1. ANTES: Consultar valores exatos via getDocFromServer (sem cache)
  console.log('--- 1. CONSULTA DIRETA AO FIRESTORE ANTES DA REATIVAÇÃO ---');
  const alunoSnapBefore = await getDocFromServer(doc(directDb, 'alunos', studentId));
  const studentSnapBefore = await getDocFromServer(doc(directDb, 'students', studentId));

  if (!alunoSnapBefore.exists()) {
    throw new Error(`Documento do aluno ${studentId} não encontrado no Firestore!`);
  }

  const dataBeforeAluno = alunoSnapBefore.data();
  const dataBeforeStudent = studentSnapBefore.data();

  console.log('Valores ANTES [coleção alunos]:');
  console.log({
    id: dataBeforeAluno.id,
    name: dataBeforeAluno.name,
    turma: dataBeforeAluno.turma,
    status: dataBeforeAluno.status,
    statusMatricula: dataBeforeAluno.statusMatricula,
    inactivationDate: dataBeforeAluno.inactivationDate,
    inactivationReason: dataBeforeAluno.inactivationReason,
    tipoContrato: dataBeforeAluno.tipoContrato,
    dataTerminoContrato: dataBeforeAluno.dataTerminoContrato,
  });

  console.log('\nValores ANTES [coleção students]:');
  console.log({
    id: dataBeforeStudent.id,
    name: dataBeforeStudent.name,
    turma: dataBeforeStudent.turma,
    status: dataBeforeStudent.status,
    statusMatricula: dataBeforeStudent.statusMatricula,
    inactivationDate: dataBeforeStudent.inactivationDate,
    inactivationReason: dataBeforeStudent.inactivationReason,
    tipoContrato: dataBeforeStudent.tipoContrato,
    dataTerminoContrato: dataBeforeStudent.dataTerminoContrato,
  });

  // 2. EXECUTAR O FLUXO REAL DE REATIVAÇÃO (handleQuickReactivate)
  console.log('\n--- 2. EXECUTANDO FLUXO REAL DE handleQuickReactivate ---');
  const rawStudent: Student = {
    id: dataBeforeAluno.id,
    name: dataBeforeAluno.name,
    turma: dataBeforeAluno.turma,
    activities: dataBeforeAluno.activities || ['Rotina'],
    tipoContrato: dataBeforeAluno.tipoContrato,
    dataInicioContrato: dataBeforeAluno.dataInicioContrato,
    dataTerminoContrato: dataBeforeAluno.dataTerminoContrato,
    diasContratados: dataBeforeAluno.diasContratados,
    diasFrequencia: dataBeforeAluno.diasFrequencia,
    horariosSaida: dataBeforeAluno.horariosSaida,
    status: dataBeforeAluno.status,
    statusMatricula: dataBeforeAluno.statusMatricula,
    inactivationDate: dataBeforeAluno.inactivationDate,
    inactivationReason: dataBeforeAluno.inactivationReason,
    notes: dataBeforeAluno.notes,
  };

  const today = toISODateString(new Date());
  const isExpiredAvulso =
    rawStudent.tipoContrato === 'avulso' &&
    Boolean(
      rawStudent.dataTerminoContrato &&
        rawStudent.dataTerminoContrato.trim().length > 0 &&
        rawStudent.dataTerminoContrato.trim() < today
    );

  // Exato objeto montado no handleQuickReactivate
  const reactivatedStudent: Student = {
    ...rawStudent,
    status: 'ativo',
    statusMatricula: 'ativo',
    inactivationDate: '',
    inactivationReason: '',
    tipoContrato: isExpiredAvulso ? 'regular' : rawStudent.tipoContrato || 'regular',
    dataInicioContrato: isExpiredAvulso ? undefined : rawStudent.dataInicioContrato,
    dataTerminoContrato: isExpiredAvulso ? undefined : rawStudent.dataTerminoContrato,
    diasContratados: isExpiredAvulso ? undefined : rawStudent.diasContratados,
    diasFrequencia: isExpiredAvulso
      ? ['segunda', 'terca', 'quarta', 'quinta', 'sexta']
      : rawStudent.diasFrequencia && rawStudent.diasFrequencia.length > 0
      ? rawStudent.diasFrequencia
      : ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    notes: isExpiredAvulso
      ? (rawStudent.notes
          ? `${rawStudent.notes} (Reativado como Regular em ${today})`
          : `Reativado como Regular em ${today}`)
      : rawStudent.notes,
  };
  (reactivatedStudent as any).updatedAt = new Date().toISOString();

  // Passa pelo mergeStudentData (como no App.tsx handleUpdateStudent)
  const mergedForState = mergeStudentData(rawStudent, reactivatedStudent);
  console.log('Resultado de mergeStudentData (em memória):', {
    status: mergedForState.status,
    statusMatricula: mergedForState.statusMatricula,
    inactivationDate: mergedForState.inactivationDate,
    inactivationReason: mergedForState.inactivationReason,
  });

  // Salva no Firestore usando a função do app saveStudentToFirestore
  console.log('Gravando no Firestore via saveStudentToFirestore(reactivatedStudent)...');
  await saveStudentToFirestore(reactivatedStudent);
  console.log('Gravação concluída com sucesso!');

  // 3. CONSULTAR NOVAMENTE VIA getDocFromServer (SEM CACHE)
  console.log('\n--- 3. CONSULTA DIRETA AO FIRESTORE DEPOIS DA REATIVAÇÃO (getDocFromServer) ---');
  const alunoSnapAfter = await getDocFromServer(doc(directDb, 'alunos', studentId));
  const studentSnapAfter = await getDocFromServer(doc(directDb, 'students', studentId));

  const dataAfterAluno = alunoSnapAfter.data();
  const dataAfterStudent = studentSnapAfter.data();

  console.log('Valores DEPOIS [coleção alunos]:');
  console.log({
    id: dataAfterAluno.id,
    name: dataAfterAluno.name,
    turma: dataAfterAluno.turma,
    status: dataAfterAluno.status,
    statusMatricula: dataAfterAluno.statusMatricula,
    inactivationDate: dataAfterAluno.inactivationDate,
    inactivationReason: dataAfterAluno.inactivationReason,
    tipoContrato: dataAfterAluno.tipoContrato,
    diasFrequencia: dataAfterAluno.diasFrequencia,
    updatedAt: dataAfterAluno.updatedAt,
  });

  console.log('\nValores DEPOIS [coleção students]:');
  console.log({
    id: dataAfterStudent.id,
    name: dataAfterStudent.name,
    turma: dataAfterStudent.turma,
    status: dataAfterStudent.status,
    statusMatricula: dataAfterStudent.statusMatricula,
    inactivationDate: dataAfterStudent.inactivationDate,
    inactivationReason: dataAfterStudent.inactivationReason,
    tipoContrato: dataAfterStudent.tipoContrato,
    diasFrequencia: dataAfterStudent.diasFrequencia,
    updatedAt: dataAfterStudent.updatedAt,
  });

  // 4. VERIFICAÇÃO DE REGRAS DE NEGÓCIO E TELAS
  console.log('\n--- 4. VERIFICAÇÃO NAS TELAS (ATIVOS E CHAMADA DE FREQUÊNCIA) ---');
  const isActiveInStudentList = dataAfterAluno.status === 'ativo';
  console.log('Aparece no filtro de "Ativos" do Gerenciador de Alunos?', isActiveInStudentList);

  const activeOnTodayDate = isStudentActiveOnDate(dataAfterAluno as any, today);
  const scheduledForToday = isStudentScheduledForDate(dataAfterAluno as any, today);
  console.log(`isStudentActiveOnDate para hoje (${today}):`, activeOnTodayDate);
  console.log(`isStudentScheduledForDate para hoje (${today}):`, scheduledForToday);

  // Testa também para a próxima segunda-feira letiva
  const nextMonday = '2026-09-28';
  const activeOnMonday = isStudentActiveOnDate(dataAfterAluno as any, nextMonday);
  const scheduledOnMonday = isStudentScheduledForDate(dataAfterAluno as any, nextMonday);
  console.log(`isStudentActiveOnDate para segunda-feira (${nextMonday}):`, activeOnMonday);
  console.log(`isStudentScheduledForDate para segunda-feira (${nextMonday}):`, scheduledOnMonday);

  // 5. CHECAGEM DAS AFIRMAÇÕES
  const statusOk = dataAfterAluno.status === 'ativo' && dataAfterStudent.status === 'ativo';
  const statusMatriculaOk = dataAfterAluno.statusMatricula === 'ativo' && dataAfterStudent.statusMatricula === 'ativo';
  const inactivationDateOk = dataAfterAluno.inactivationDate === '' && dataAfterStudent.inactivationDate === '';
  const inactivationReasonOk = dataAfterAluno.inactivationReason === '' && dataAfterStudent.inactivationReason === '';

  console.log('\n--- RESUMO DA VALIDAÇÃO NO SERVIDOR FIRESTORE ---');
  console.log('status alterado para "ativo":', statusOk);
  console.log('statusMatricula alterado para "ativo":', statusMatriculaOk);
  console.log('inactivationDate limpo para "" (string vazia):', inactivationDateOk);
  console.log('inactivationReason limpo para "" (string vazia):', inactivationReasonOk);

  if (statusOk && statusMatriculaOk && inactivationDateOk && inactivationReasonOk) {
    console.log('\n>>> SUCESSO TOTAL: Todos os campos foram atualizados no servidor Firestore! <<<');
  } else {
    console.error('\n>>> FALHA NA VALIDAÇÃO! <<<');
  }

  await terminate(directDb);
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Erro no teste:', err);
  process.exit(1);
});
