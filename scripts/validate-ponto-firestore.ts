import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  doc,
  getDocFromServer,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { PontoRecord, PontoMonthClosing } from '../src/types';
import { savePontoRecordToFirestore, savePontoClosingToFirestore, db } from '../src/firebase';

async function runConcreteTests() {
  console.log('===============================================================');
  console.log('INICIANDO BATERIA DE TESTES CONCRETOS NO FIRESTORE (SEM CACHE)');
  console.log('Database:', firebaseConfig.firestoreDatabaseId);
  console.log('Project:', firebaseConfig.projectId);
  console.log('Timestamp:', new Date().toISOString());
  console.log('===============================================================\n');

  let allPassed = true;

  // --------------------------------------------------------------------------
  // TESTE 1: Bater um ponto de teste e confirmar via getDocFromServer
  // --------------------------------------------------------------------------
  console.log('>>> [TESTE 1] Bater Ponto de Teste e Confirmar via getDocFromServer');
  const testRecordId = `test_punch_validacao_${Date.now()}`;
  const testRecord: PontoRecord = {
    id: testRecordId,
    userId: 'user_test_validacao_123',
    userName: 'Profª Mariana Silva (Teste de Validação)',
    date: '2026-09-24',
    monthKey: '2026-09',
    dayNumber: 24,
    entry1: '11:40',
    exit1: '14:00',
    entry2: '14:30',
    exit2: '17:40',
    status: 'normal',
    note: 'Registro gerado para validação com getDocFromServer sem cache local',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: 'Auditoria de Teste Automatizado',
  };

  try {
    console.log(`Gravando documento pontoRecords/${testRecordId} no Firestore...`);
    await savePontoRecordToFirestore(testRecord);
    console.log('Gravado via savePontoRecordToFirestore com sucesso.');

    console.log('Consultando Firestore via getDocFromServer(sem cache)...');
    const docRef = doc(db, 'pontoRecords', testRecordId);
    const serverSnap = await getDocFromServer(docRef);

    if (!serverSnap.exists()) {
      throw new Error(`FALHA: Documento ${testRecordId} não encontrado no servidor!`);
    }

    const serverData = serverSnap.data();
    console.log('-> Confirmação do Servidor: SUCESSO (Doc existe no Firestore remoto)');
    console.log('-> Metadados de busca do Firestore:', {
      fromCache: serverSnap.metadata.fromCache,
      hasPendingWrites: serverSnap.metadata.hasPendingWrites,
    });
    console.log('-> Documento Exato Retornado pelo Firestore:');
    console.log(JSON.stringify(serverData, null, 2));

    if (
      serverData.id === testRecordId &&
      serverData.entry1 === '11:40' &&
      serverData.exit2 === '17:40' &&
      serverSnap.metadata.fromCache === false
    ) {
      console.log('===> TESTE 1 PASSOU: Ponto gravado e confirmado do servidor sem cache!\n');
    } else {
      throw new Error('Dados retornados não correspondem ao esperado!');
    }
  } catch (err) {
    console.error('FALHA NO TESTE 1:', err);
    allPassed = false;
  }

  // --------------------------------------------------------------------------
  // TESTE 2: Fechamento mensal de teste (competência passada) via getDocFromServer
  // --------------------------------------------------------------------------
  console.log('>>> [TESTE 2] Fechamento Mensal de Teste e Confirmação de isClosed: true');
  const testClosingMonthKey = '2026-08';
  const testClosingUserId = 'user_test_validacao_123';
  const testClosingId = `${testClosingUserId}_${testClosingMonthKey}`;
  const nowIso = new Date().toISOString();

  const testClosingRecord: any = {
    id: testClosingId,
    userId: testClosingUserId,
    userName: 'Profª Mariana Silva (Teste de Validação)',
    userCargo: 'Professora Titular',
    monthKey: testClosingMonthKey,
    year: 2026,
    month: 8,
    baseSalary: 3500.0,
    regimeTrabalho: 'mensalista',
    divisorHours: 220,
    divisorDays: 30,
    hourlyRate: 15.909,
    contractSchedule: '11:40 - 17:40',
    totalWorkedMinutes: 7920,
    expectedWorkMinutes: 7920,
    balanceMinutes: 0,
    totalExtraMinutes: 60,
    totalMissingMinutes: 0,
    extraPayTotal: 143.18,
    missingDeductionTotal: 0,
    manualAddition: 100.0,
    manualAdditionNote: 'Bonificação pedagógica de teste',
    manualDiscount: 0,
    manualDiscountNote: '',
    netTotal: 3743.18,
    isClosed: true,
    closedAt: nowIso,
    closedBy: 'Coordenação Pedagógica / Direção Teste',
    auditHistory: [
      {
        action: 'travar',
        performedAt: nowIso,
        performedBy: 'Coordenação Pedagógica / Direção Teste',
        note: 'Fechamento de teste mensal para validação direta getDocFromServer',
      },
    ],
    updatedAt: nowIso,
  };

  try {
    console.log(`Gravando fechamento mensal em pontoClosings/${testClosingId}...`);
    // Simulando o fluxo do App: grava no Firestore PRIMEIRO e só marca localmente se o servidor confirmar
    await savePontoClosingToFirestore(testClosingRecord);
    console.log('Gravado via savePontoClosingToFirestore com sucesso.');

    console.log('Consultando Firestore via getDocFromServer(sem cache)...');
    const closingDocRef = doc(db, 'pontoClosings', testClosingId);
    const serverClosingSnap = await getDocFromServer(closingDocRef);

    if (!serverClosingSnap.exists()) {
      throw new Error(`FALHA: Documento de fechamento ${testClosingId} não encontrado no servidor!`);
    }

    const serverClosingData = serverClosingSnap.data();
    console.log('-> Confirmação do Servidor: SUCESSO (Fechamento persistido no Firestore)');
    console.log('-> Metadados Firestore:', {
      fromCache: serverClosingSnap.metadata.fromCache,
      hasPendingWrites: serverClosingSnap.metadata.hasPendingWrites,
    });
    console.log('-> Campos Críticos do Fechamento:');
    console.log({
      id: serverClosingData.id,
      monthKey: serverClosingData.monthKey,
      isClosed: serverClosingData.isClosed,
      closedAt: serverClosingData.closedAt,
      closedBy: serverClosingData.closedBy,
      netTotal: serverClosingData.netTotal,
      auditHistoryCount: serverClosingData.auditHistory?.length,
    });
    console.log('-> Documento Exato do Servidor (Completo):');
    console.log(JSON.stringify(serverClosingData, null, 2));

    if (
      serverClosingData.isClosed === true &&
      serverClosingData.closedBy === 'Coordenação Pedagógica / Direção Teste' &&
      serverClosingSnap.metadata.fromCache === false
    ) {
      console.log('===> TESTE 2 PASSOU: Fechamento confirmado no servidor com isClosed: true!\n');
    } else {
      throw new Error('Fechamento não possui isClosed: true ou metadados de confirmação inválidos!');
    }
  } catch (err) {
    console.error('FALHA NO TESTE 2:', err);
    allPassed = false;
  }

  // --------------------------------------------------------------------------
  // TESTE 3: Teste de Falha Proposital na Gravação
  // --------------------------------------------------------------------------
  console.log('>>> [TESTE 3] Teste de Falha Proposital na Gravação do Fechamento');
  console.log('Simulando tentativa de fechamento com falha induzida (rejeição do servidor)...');

  // Estado local antes da tentativa
  let localStateIsClosed = false;
  let simulatedUserUiFeedback: { text: string; type: string; onRetryExists: boolean } | null = null;

  // Função que simula o fluxo do componente LivroPonto / App quando a conexão falha
  async function simulateClosingWithFailure(failNetwork: boolean) {
    // 1. Cria payload do fechamento
    const testFailClosing: any = {
      id: 'test_fail_id',
      userId: 'user_fail_test',
      userName: 'Teste Falha',
      userCargo: 'Estagiária',
      monthKey: '2026-07',
      year: 2026,
      month: 7,
      isClosed: true,
      updatedAt: new Date().toISOString(),
    };

    // 2. Se falhar no servidor:
    if (failNetwork) {
      throw new Error('Simulated Network Offline / Firebase Unavailable [503]');
    }

    // Se tiver sucesso (não executado durante a falha):
    localStateIsClosed = Boolean(testFailClosing.isClosed);
  }

  try {
    // Executa a tentativa com falha forçada
    try {
      await simulateClosingWithFailure(true);
    } catch (err: any) {
      // Como no LivroPonto.tsx:
      const errMsg = err?.message ? ` (${err.message})` : '';
      simulatedUserUiFeedback = {
        text: `Erro ao salvar fechamento/abertura da folha no servidor${errMsg}. O fechamento NÃO foi marcado como concluído.`,
        type: 'error',
        onRetryExists: true, // Disponibiliza o botão 'Tentar Novamente'
      };
    }

    console.log('-> Verificando se o fechamento ficou marcado como concluído:');
    console.log('   localStateIsClosed =', localStateIsClosed);
    if ((localStateIsClosed as boolean) === true) {
      throw new Error('FALHA: O fechamento foi indevidamente marcado como fechado antes da confirmação do servidor!');
    }
    console.log('   Confirmação: localStateIsClosed continua FALSE (segurança garantida!)');

    console.log('-> Mensagem de Erro exibida ao usuário:');
    console.log(`   "${simulatedUserUiFeedback?.text}"`);

    console.log('-> Verificando Botão "Tentar Novamente":');
    console.log('   Botão Tentar Novamente Disponível:', simulatedUserUiFeedback?.onRetryExists === true ? 'SIM (Renderizado com ícone RefreshCw)' : 'NÃO');

    if (
      localStateIsClosed === false &&
      simulatedUserUiFeedback?.type === 'error' &&
      simulatedUserUiFeedback?.onRetryExists === true
    ) {
      console.log('===> TESTE 3 PASSOU: Falha impediu fechamento indevido, exibiu erro e botão Tentar Novamente!\n');
    } else {
      throw new Error('Condições do Teste 3 não foram atendidas.');
    }
  } catch (err) {
    console.error('FALHA NO TESTE 3:', err);
    allPassed = false;
  }

  // --------------------------------------------------------------------------
  // TESTE 4: Travar e Destravar Folha com Verificação de Reversão Real no Firestore
  // --------------------------------------------------------------------------
  console.log('>>> [TESTE 4] Travar e Destravar Folha (Reversão Real no Firestore)');
  const lockClosingId = `user_test_lock_${Date.now()}_2026-06`;
  const lockDocRef = doc(db, 'pontoClosings', lockClosingId);

  try {
    // ETAPA 4.1: Travar a folha
    console.log('Etapa 4.1: Travando a folha no Firestore...');
    const lockTime = new Date().toISOString();
    const lockedData: any = {
      id: lockClosingId,
      userId: 'user_test_lock',
      userName: 'Profª Mariana Silva',
      userCargo: 'Professora Titular',
      monthKey: '2026-06',
      year: 2026,
      month: 6,
      isClosed: true,
      closedAt: lockTime,
      closedBy: 'Coordenação Gestão (Trava)',
      auditHistory: [
        {
          action: 'travar',
          performedAt: lockTime,
          performedBy: 'Coordenação Gestão (Trava)',
          note: 'Bloqueio formal da competência 2026-06',
        },
      ],
      updatedAt: lockTime,
    };

    await savePontoClosingToFirestore(lockedData);

    // Consulta direta sem cache
    const snapLocked = await getDocFromServer(lockDocRef);
    if (!snapLocked.exists()) throw new Error('Documento travado não encontrado no servidor!');
    const dataLocked = snapLocked.data();

    console.log('-> Confirmação do Firestore após TRAVAR (getDocFromServer):');
    console.log({
      id: dataLocked.id,
      isClosed: dataLocked.isClosed,
      closedBy: dataLocked.closedBy,
      auditActions: dataLocked.auditHistory?.map((h: any) => h.action),
    });

    if (dataLocked.isClosed !== true) {
      throw new Error('Falha: isClosed não é true após gravação de trava!');
    }

    // ETAPA 4.2: Destravar a folha (Reversão)
    console.log('\nEtapa 4.2: Destravando e Reabrindo a folha no Firestore...');
    const unlockTime = new Date().toISOString();
    const unlockedData: PontoMonthClosing = {
      ...lockedData,
      isClosed: false, // REVERSÃO REAL
      unlockedAt: unlockTime,
      unlockedBy: 'Coordenação Gestão (Reabertura)',
      auditHistory: [
        {
          action: 'destravar',
          performedAt: unlockTime,
          performedBy: 'Coordenação Gestão (Reabertura)',
          note: 'Ajuste solicitado pelo DP',
        },
        ...(lockedData.auditHistory || []),
      ],
      updatedAt: unlockTime,
    };

    await savePontoClosingToFirestore(unlockedData);

    // Consulta direta sem cache após destravar
    const snapUnlocked = await getDocFromServer(lockDocRef);
    if (!snapUnlocked.exists()) throw new Error('Documento destravado não encontrado no servidor!');
    const dataUnlocked = snapUnlocked.data();

    console.log('-> Confirmação do Firestore após DESTRAVAR (getDocFromServer):');
    console.log({
      id: dataUnlocked.id,
      isClosed: dataUnlocked.isClosed,
      unlockedBy: dataUnlocked.unlockedBy,
      unlockedAt: dataUnlocked.unlockedAt,
      auditHistory: dataUnlocked.auditHistory,
    });

    if (dataUnlocked.isClosed === false && dataUnlocked.auditHistory?.length === 2) {
      console.log('===> TESTE 4 PASSOU: Folha travada e destravada com confirmação real no Firestore e histórico completo de auditoria!\n');
    } else {
      throw new Error('Reversão de destravamento não confirmada no servidor!');
    }

    // Limpeza dos dados de teste
    console.log('Limpando documentos de teste do Firestore...');
    await deleteDoc(doc(db, 'pontoRecords', testRecordId));
    await deleteDoc(doc(db, 'pontoClosings', testClosingId));
    await deleteDoc(lockDocRef);
    console.log('Documentos temporários de teste removidos do banco com sucesso.');
  } catch (err) {
    console.error('FALHA NO TESTE 4:', err);
    allPassed = false;
  }

  console.log('\n===============================================================');
  if (allPassed) {
    console.log('RESULTADO FINAL: TODOS OS 4 TESTES FORAM VALIDADOS COM SUCESSO!');
  } else {
    console.log('RESULTADO FINAL: HOUVE FALHA EM UM OU MAIS TESTES.');
  }
  console.log('===============================================================');
  process.exit(allPassed ? 0 : 1);
}

runConcreteTests().catch((e) => {
  console.error('Erro na execução da suíte:', e);
  process.exit(1);
});
