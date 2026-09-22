import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  getDocsFromServer,
  collection,
  query,
  where,
  doc,
  getDocFromServer,
  terminate,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
}, firebaseConfig.firestoreDatabaseId);

// Import schedule / active helpers
function isStudentActiveOnDate(student: any, targetDate: string): boolean {
  const status = student.status || student.statusMatricula || 'ativo';
  if (status !== 'ativo') return false;
  if (student.dataCancelamento && targetDate >= student.dataCancelamento) return false;
  if (student.dataMatricula && targetDate < student.dataMatricula) return false;
  return true;
}

const DAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

function getDayOfWeek(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  return DAYS[d.getDay()];
}

function isStudentScheduled(student: any, dateStr: string): boolean {
  const day = getDayOfWeek(dateStr);
  const dias = student.diasFrequencia;
  if (!dias || !Array.isArray(dias) || dias.length === 0) return true;
  return dias.some((d: string) => {
    const norm = d.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const targetNorm = day.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return norm.startsWith(targetNorm.slice(0, 3));
  });
}

async function run() {
  const testTurma = '4º Ano Azul';
  const testDate = '2026-09-21';
  const testActivity = 'Rotina';

  console.log(`\n=== VERIFICANDO ALUNOS VS REGISTROS PARA ${testTurma} EM ${testDate} ===\n`);

  // 1. Buscar todos os alunos da turma
  const studentsSnap = await getDocsFromServer(collection(db, 'students'));
  const allStudents: any[] = [];
  studentsSnap.forEach((s) => allStudents.push(s.data()));

  const turmaStudents = allStudents.filter((s) => s.turma === testTurma);
  console.log(`Total de alunos cadastrados em ${testTurma}: ${turmaStudents.length}`);

  const activeStudents = turmaStudents.filter((s) => isStudentActiveOnDate(s, testDate));
  console.log(`Alunos ativos em ${testDate}: ${activeStudents.length}`);

  const scheduledStudents = activeStudents.filter((s) => isStudentScheduled(s, testDate));
  console.log(`Alunos esperados (escalados na segunda-feira ${testDate}): ${scheduledStudents.length}`);

  console.log('\nLista de alunos esperados:');
  scheduledStudents.forEach((s) => {
    console.log(` - [${s.id}] ${s.name} (dias: ${JSON.stringify(s.diasFrequencia || 'todos')})`);
  });

  // 2. Buscar registros em attendanceRecords para a data e turma
  const recordsSnap = await getDocsFromServer(collection(db, 'attendanceRecords'));
  const records: any[] = [];
  recordsSnap.forEach((r) => records.push(r.data()));

  const recordsForDayTurma = records.filter(
    (r) => (r.date === testDate || r.data === testDate) && r.turma === testTurma && r.activity === testActivity
  );
  console.log(`\nTotal de registros encontrados no Firestore para ${testTurma} / ${testActivity} / ${testDate}: ${recordsForDayTurma.length}`);
  recordsForDayTurma.forEach((r) => {
    console.log(` - Record ID: ${r.id}, StudentId: ${r.studentId}, Status: ${r.status}`);
  });

  // 3. Comparar
  const recordedStudentIds = new Set(recordsForDayTurma.map((r) => r.studentId));
  const missingStudents = scheduledStudents.filter((s) => !recordedStudentIds.has(s.id));

  console.log(`\n--- RESULTADO DA COMPARAÇÃO ---`);
  console.log(`Esperados: ${scheduledStudents.length}`);
  console.log(`Gravados no Firestore: ${recordsForDayTurma.length}`);
  console.log(`Faltando / Pendentes: ${missingStudents.length}`);

  if (missingStudents.length > 0) {
    console.log('\nAlunos que ficaram pendentes:');
    missingStudents.forEach((s) => console.log(` * [${s.id}] ${s.name}`));
  } else {
    console.log('\nTODOS os alunos esperados possuem registro gravado no Firestore!');
  }

  await terminate(db);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
