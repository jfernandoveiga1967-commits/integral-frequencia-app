import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  getDocsFromServer,
  collection,
  query,
  where,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
}, firebaseConfig.firestoreDatabaseId);

async function run() {
  console.log('=== DIAGNÓSTICO DE FREQUÊNCIA NO FIRESTORE ===');

  // 1. Buscar turmas
  const turmasSnap = await getDocsFromServer(collection(db, 'turmas'));
  console.log(`Total de turmas cadastradas no Firestore: ${turmasSnap.size}`);
  turmasSnap.forEach((t) => console.log(' - Turma:', t.id, t.data()));

  // 2. Buscar alunos
  const studentsSnap = await getDocsFromServer(collection(db, 'students'));
  console.log(`Total de alunos na coleção 'students': ${studentsSnap.size}`);

  const alunosSnap = await getDocsFromServer(collection(db, 'alunos'));
  console.log(`Total de alunos na coleção 'alunos': ${alunosSnap.size}`);

  // 3. Buscar attendanceRecords
  const attendanceSnap = await getDocsFromServer(collection(db, 'attendanceRecords'));
  console.log(`Total de registros na coleção 'attendanceRecords': ${attendanceSnap.size}`);

  // Agrupar por data e turma
  const dateTurmaMap: Record<string, number> = {};
  attendanceSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const key = `${d.date || d.data}_${d.turma}_${d.activity}`;
    dateTurmaMap[key] = (dateTurmaMap[key] || 0) + 1;
  });

  console.log('Registros por [data_turma_atividade]:', dateTurmaMap);
}

run().catch(console.error);
