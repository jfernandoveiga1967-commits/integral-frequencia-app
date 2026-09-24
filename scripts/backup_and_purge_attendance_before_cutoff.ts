import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  memoryLocalCache,
  getDocsFromServer,
  collection,
  writeBatch,
  doc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const CUTOFF_DATE = '2026-09-24';

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(
  app,
  {
    localCache: memoryLocalCache(),
    experimentalForceLongPolling: true,
    ignoreUndefinedProperties: true,
  },
  firebaseConfig.firestoreDatabaseId
);

function convertToCSV(records: any[]): string {
  if (records.length === 0) return '';
  const headers = ['id', 'studentId', 'turma', 'activity', 'date', 'status', 'observation', 'exitTime', 'equipmentMissingDetails', 'weekNumber', 'year', 'createdAt'];
  const escapeCell = (val: any) => {
    if (val === undefined || val === null) return '';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const lines = [headers.join(',')];
  for (const r of records) {
    const row = headers.map(h => escapeCell(r[h] ?? (h === 'date' ? r.data : '')));
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

async function run() {
  console.log('====================================================');
  console.log(`INICIANDO PROCEDIMENTO DE BACKUP E EXCLUSÃO PERMANENTE`);
  console.log(`Data de corte: ${CUTOFF_DATE} (todos os registros com data < ${CUTOFF_DATE})`);
  console.log('====================================================\n');

  // ETAPA 1: Leitura direta do servidor Firestore (sem cache)
  console.log('1. Carregando documentos de attendanceRecords diretamente do servidor Firestore...');
  const initialSnap = await getDocsFromServer(collection(db, 'attendanceRecords'));
  console.log(`Total de documentos encontrados em attendanceRecords: ${initialSnap.size}`);

  const toDelete: { id: string; data: any }[] = [];
  const toKeep: { id: string; data: any }[] = [];

  initialSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const recordDate = data.date || data.data || '';
    if (recordDate < CUTOFF_DATE) {
      toDelete.push({ id: docSnap.id, data });
    } else {
      toKeep.push({ id: docSnap.id, data });
    }
  });

  console.log(`Registros anteriores a ${CUTOFF_DATE} a serem excluídos: ${toDelete.length}`);
  console.log(`Registros a partir de ${CUTOFF_DATE} a serem preservados: ${toKeep.length}\n`);

  if (toDelete.length === 0) {
    console.log('Nenhum registro anterior à data de corte foi encontrado. Nada a excluir.');
    return;
  }

  // ETAPA 2: Exportação do Backup de Segurança
  console.log('2. Gerando arquivos de backup (JSON e CSV)...');
  const backupData = toDelete.map(item => ({
    id: item.id,
    ...item.data
  }));

  const jsonContent = JSON.stringify(backupData, null, 2);
  const csvContent = convertToCSV(backupData);

  const publicDir = path.resolve(process.cwd(), 'public');
  const backupsDir = path.resolve(process.cwd(), 'backups');

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const jsonPublicPath = path.join(publicDir, 'backup_attendance_before_2026-09-24.json');
  const csvPublicPath = path.join(publicDir, 'backup_attendance_before_2026-09-24.csv');
  const jsonBackupPath = path.join(backupsDir, 'backup_attendance_before_2026-09-24.json');
  const csvBackupPath = path.join(backupsDir, 'backup_attendance_before_2026-09-24.csv');

  fs.writeFileSync(jsonPublicPath, jsonContent, 'utf-8');
  fs.writeFileSync(csvPublicPath, csvContent, 'utf-8');
  fs.writeFileSync(jsonBackupPath, jsonContent, 'utf-8');
  fs.writeFileSync(csvBackupPath, csvContent, 'utf-8');

  const jsonStats = fs.statSync(jsonPublicPath);
  const csvStats = fs.statSync(csvPublicPath);

  console.log(`Backup salvo com sucesso:`);
  console.log(` - JSON: ${jsonPublicPath} (${(jsonStats.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(` - CSV:  ${csvPublicPath} (${(csvStats.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(` - Espelho de segurança guardado em: ${backupsDir}`);
  console.log(`Total de registros protegidos no backup: ${backupData.length}\n`);

  // ETAPA 3: Exclusão em lote no Firestore com writeBatch em chunks de 450 (limite Firestore = 500)
  console.log(`3. Iniciando exclusão em lote no Firestore (writeBatch, lotes de até 450 documentos)...`);
  const CHUNK_SIZE = 450;
  const totalBatches = Math.ceil(toDelete.length / CHUNK_SIZE);
  let deletedCount = 0;

  for (let i = 0; i < toDelete.length; i += CHUNK_SIZE) {
    const chunk = toDelete.slice(i, i + CHUNK_SIZE);
    const batchIndex = Math.floor(i / CHUNK_SIZE) + 1;
    const batch = writeBatch(db);

    for (const item of chunk) {
      batch.delete(doc(db, 'attendanceRecords', item.id));
    }

    await batch.commit();
    deletedCount += chunk.length;

    console.log(`Lote ${batchIndex}/${totalBatches} processado: ${deletedCount}/${toDelete.length} registros excluídos...`);
    // Pequena pausa para evitar sobrecarga de taxa
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\nExclusão em lote concluída com sucesso! Total excluído: ${deletedCount} registros.\n`);

  // ETAPA 4: Validação rigorosa pós-exclusão via getDocsFromServer (Bypass de Cache)
  console.log('4. Verificando integridade no Firestore via getDocsFromServer (ignora cache)...');
  const postVerifySnap = await getDocsFromServer(collection(db, 'attendanceRecords'));
  console.log(`Total de documentos restantes em attendanceRecords no servidor: ${postVerifySnap.size}`);

  let remainingBeforeCutoff = 0;
  let remainingOnOrAfterCutoff = 0;
  const remainingDates = new Set<string>();

  postVerifySnap.forEach((docSnap) => {
    const d = docSnap.data();
    const dt = d.date || d.data || '';
    remainingDates.add(dt);
    if (dt < CUTOFF_DATE) {
      remainingBeforeCutoff++;
    } else {
      remainingOnOrAfterCutoff++;
    }
  });

  console.log(`Documentos restantes com data < ${CUTOFF_DATE}: ${remainingBeforeCutoff}`);
  console.log(`Documentos restantes com data >= ${CUTOFF_DATE}: ${remainingOnOrAfterCutoff}`);
  console.log(`Datas remanescentes na coleção:`, Array.from(remainingDates).sort());

  console.log('\n====================================================');
  if (remainingBeforeCutoff === 0) {
    console.log(`SUCESSO TOTAL!`);
    console.log(`- Contagem de registros anteriores a ${CUTOFF_DATE} no Firestore: ZERO (0)`);
    console.log(`- Registros preservados (de ${CUTOFF_DATE} em diante): ${remainingOnOrAfterCutoff}`);
    console.log(`- Total de registros excluídos definitivamente: ${deletedCount}`);
    console.log(`- Backups intactos e disponíveis para download em /backup_attendance_before_2026-09-24.json e .csv`);
  } else {
    console.error(`ATENÇÃO: Ainda restam ${remainingBeforeCutoff} registros anteriores à data de corte!`);
  }
  console.log('====================================================\n');
}

run().catch((err) => {
  console.error('Erro na execução do script:', err);
  process.exit(1);
});
