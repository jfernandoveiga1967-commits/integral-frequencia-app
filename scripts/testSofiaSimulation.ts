/**
 * scripts/testSofiaSimulation.ts
 * Simulação completa de ponta a ponta (Sofia exclusiva para Administrador):
 * - Renderização de interface (zero vestígios para não-admin; presente para admin)
 * - Segurança no servidor (/api/sofia/chat, /api/sofia/admin-status, /api/gemini/voice-agent):
 *   403 sem detalhes para não autenticado, payload forjado e sessão não-admin
 * - Sessão admin via /api/auth/session + fluxo completo (tools, confirmação, auditoria, PDF, alerta)
 *
 * Execução: npx tsx scripts/testSofiaSimulation.ts
 */

// Polyfill mínimo de localStorage para execução em Node
const memStorage = new Map<string, string>();
if (typeof (globalThis as any).localStorage === 'undefined') {
  (globalThis as any).localStorage = {
    getItem: (k: string) => memStorage.get(k) ?? null,
    setItem: (k: string, v: string) => memStorage.set(k, String(v)),
    removeItem: (k: string) => memStorage.delete(k),
    clear: () => memStorage.clear(),
  };
}

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import http from 'http';
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import {
  Student,
  AttendanceRecord,
  PontoRecord,
  UserProfile,
  ScheduleBlock,
  SofiaChatMessage,
} from '../src/types';
import { getDayOfWeekFromDate } from '../src/utils/dateUtils';
import { getTodayISOSaoPaulo, getNowTimeSaoPaulo } from '../src/utils/frequenciaUtils';
import {
  buildLiveAppStateSummary,
  sendSofiaMessage,
  isReadOnlySofiaTool,
  READ_ONLY_SOFIA_TOOLS,
  WRITE_SOFIA_TOOLS,
  getStoredSofiaAdminAlert,
} from '../src/services/sofiaService';
import {
  executeSofiaTool,
  SofiaToolExecutionContext,
  clearRecentPdfDownloadCache,
} from '../src/services/sofiaTools';
import {
  clearLocalSofiaAuditLogsForTest,
  clearStoredSofiaAdminAlert,
  loadLocalSofiaAuditLogs,
  persistSofiaAdminAlertToDbAndNotify,
  resolvePersistentSofiaAdminAlert,
} from '../src/services/sofiaSecurityService';
import { SofiaAgent } from '../src/components/SofiaAgent';
import { SofiaAssistant } from '../src/components/SofiaAssistant';
import { VoiceWidget } from '../src/components/VoiceWidget';

function addMinutesToHHMM(hhmm: string, deltaMinutes: number): string {
  const [hStr, mStr] = hhmm.split(':');
  let total = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + deltaMinutes;
  total = ((total % 1440) + 1440) % 1440;
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function buildTestFixtures() {
  const todayStr = getTodayISOSaoPaulo();
  const currentTime = getNowTimeSaoPaulo();
  const dayKey = (getDayOfWeekFromDate(todayStr) || 'quinta') as any;

  const activeTurmas = [
    'Mini Maternal Azul',
    'Maternal Azul',
    'Infantil 1 Azul',
    'Infantil 2',
    '1º Ano Azul',
    '1º Ano Laranja',
    '2º Ano Azul',
    '3º Ano',
    '4º Ano',
    '5º Ano',
  ];

  const turmaConfigs: Array<{
    turma: string;
    total: number;
    presentes: number;
    faltas: number;
    justificados: number;
    pendentes: number;
  }> = [
    { turma: 'Mini Maternal Azul', total: 14, presentes: 14, faltas: 0, justificados: 0, pendentes: 0 },
    { turma: 'Maternal Azul', total: 16, presentes: 15, faltas: 1, justificados: 0, pendentes: 0 },
    { turma: 'Infantil 1 Azul', total: 18, presentes: 16, faltas: 2, justificados: 0, pendentes: 0 },
    { turma: 'Infantil 2', total: 16, presentes: 16, faltas: 0, justificados: 0, pendentes: 0 },
    { turma: '1º Ano Azul', total: 18, presentes: 17, faltas: 1, justificados: 0, pendentes: 0 },
    { turma: '1º Ano Laranja', total: 15, presentes: 15, faltas: 0, justificados: 0, pendentes: 0 },
    { turma: '2º Ano Azul', total: 15, presentes: 14, faltas: 0, justificados: 1, pendentes: 0 },
    { turma: '3º Ano', total: 15, presentes: 15, faltas: 0, justificados: 0, pendentes: 0 },
    { turma: '4º Ano', total: 15, presentes: 15, faltas: 0, justificados: 0, pendentes: 0 },
    { turma: '5º Ano', total: 3, presentes: 0, faltas: 0, justificados: 0, pendentes: 3 },
  ];

  const firstNames = [
    'Alice', 'Arthur', 'Bernardo', 'Cecília', 'Davi', 'Elena', 'Enzo', 'Gabriel',
    'Helena', 'Heitor', 'Isabella', 'João', 'Júlia', 'Laura', 'Lorenzo', 'Lucas',
    'Luiza', 'Manuela', 'Mariana', 'Matheus', 'Miguel', 'Pedro', 'Rafael', 'Sofia',
    'Sophia', 'Theo', 'Valentina', 'Vinícius',
  ];
  const lastNames = ['Almeida', 'Barbosa', 'Cardoso', 'Dias', 'Ferreira', 'Gomes', 'Lima', 'Mendes', 'Oliveira', 'Pereira', 'Ribeiro', 'Silva', 'Souza', 'Teixeira'];

  const students: Student[] = [];
  const records: AttendanceRecord[] = [];
  let seq = 1;

  for (const cfg of turmaConfigs) {
    for (let i = 0; i < cfg.total; i++) {
      const id = `stu_${String(seq).padStart(3, '0')}`;
      const fName = firstNames[(seq + i) % firstNames.length];
      const lName = lastNames[(seq * 3 + i) % lastNames.length];
      const name = `${fName} ${lName}`;

      const hasVan = i === 0 && (cfg.turma === 'Infantil 1 Azul' || cfg.turma === 'Maternal Azul');
      const hasAllergy = i === 1 && cfg.turma === 'Maternal Azul';

      students.push({
        id,
        name,
        turma: cfg.turma,
        status: 'ativo',
        statusMatricula: 'ativo',
        anoLetivo: 2026,
        tipoContrato: 'regular',
        diasFrequencia: [dayKey, 'segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        activities: ['Rotina', ...(cfg.turma === 'Maternal Azul' ? ['Natação'] : [])],
        horarioSaida: i === 2 && cfg.turma === 'Infantil 1 Azul' ? '15:30' : '17:40',
        tipoSaida: hasVan ? 'TRANSPORTE_ESCOLAR' : 'PAIS',
        nomeCondutor: hasVan ? 'Tio Marcos (Van 02)' : undefined,
        notes: hasAllergy ? 'Alergia à proteína do leite (APLV)' : undefined,
      });

      const weekNum = 47;
      const yearNum = parseInt(todayStr.split('-')[0], 10) || 2026;
      const createdAtISO = new Date().toISOString();

      if (i < cfg.presentes) {
        const isEarly = i === 2 && cfg.turma === 'Infantil 1 Azul';
        records.push({
          id: `rec_rot_${id}`,
          studentId: id,
          turma: cfg.turma,
          activity: 'Rotina',
          date: todayStr,
          weekNumber: weekNum,
          year: yearNum,
          status: isEarly ? 'saida_antecipada' : 'presente',
          exitTime: isEarly ? '15:30' : undefined,
          observation: isEarly ? 'Consulta pediatra' : undefined,
          createdAt: createdAtISO,
        });
        if (cfg.turma === 'Maternal Azul') {
          records.push({
            id: `rec_nat_${id}`,
            studentId: id,
            turma: cfg.turma,
            activity: 'Natação',
            date: todayStr,
            weekNumber: weekNum,
            year: yearNum,
            status: 'presente',
            createdAt: createdAtISO,
          });
        }
      } else if (i < cfg.presentes + cfg.faltas) {
        records.push({
          id: `rec_rot_${id}`,
          studentId: id,
          turma: cfg.turma,
          activity: 'Rotina',
          date: todayStr,
          weekNumber: weekNum,
          year: yearNum,
          status: 'falta',
          observation: i % 2 === 0 ? 'Família avisou — resfriado' : 'Sem justificativa informada',
          createdAt: createdAtISO,
        });
      } else if (i < cfg.presentes + cfg.faltas + cfg.justificados) {
        records.push({
          id: `rec_rot_${id}`,
          studentId: id,
          turma: cfg.turma,
          activity: 'Rotina',
          date: todayStr,
          weekNumber: weekNum,
          year: yearNum,
          status: 'justificado' as any,
          observation: 'Atestado médico enviado',
          createdAt: createdAtISO,
        });
      }
      seq++;
    }
  }

  const startNow = addMinutesToHHMM(currentTime, -15);
  const endNow = addMinutesToHHMM(currentTime, 45);
  const schedules: ScheduleBlock[] = [
    {
      id: 'sch_mat_nat',
      turma: 'Maternal Azul',
      dayOfWeek: dayKey,
      startTime: startNow,
      endTime: endNow,
      activityId: 'Natação',
      location: 'Piscina Aquecida',
      guidelines: 'Touca obrigatória e acompanhamento da monitora Carla.',
    },
    {
      id: 'sch_inf1_judo',
      turma: 'Infantil 1 Azul',
      dayOfWeek: dayKey,
      startTime: startNow,
      endTime: endNow,
      activityId: 'Judô',
      location: 'Tatame Central',
    },
    {
      id: 'sch_1ano_leitura',
      turma: '1º Ano Azul',
      dayOfWeek: dayKey,
      startTime: startNow,
      endTime: endNow,
      activityId: 'Oficina de Leitura',
      location: 'Biblioteca',
    },
  ];

  const currentUser: UserProfile = {
    id: 'usr_coord_1',
    name: 'Fernando Veiga',
    email: 'fernando.veiga@crescercampinas.com.br',
    role: 'coordenador',
    cargoLabel: 'Coordenador (Administrador)',
    status: 'ATIVO',
  };

  const users: UserProfile[] = [
    currentUser,
    {
      id: 'usr_carla',
      name: 'Carla Mendes',
      email: 'carla@colegiocrescer.com.br',
      role: 'professor',
      cargoLabel: 'Monitora Titular',
      status: 'ATIVO',
    },
    {
      id: 'usr_fernanda',
      name: 'Fernanda Silva',
      email: 'fernanda@colegiocrescer.com.br',
      role: 'professor',
      cargoLabel: 'ADI',
      status: 'ATIVO',
    },
    {
      id: 'usr_beatriz',
      name: 'Beatriz Oliveira',
      email: 'beatriz@colegiocrescer.com.br',
      role: 'professor',
      cargoLabel: 'Monitora Auxiliar',
      status: 'ATIVO',
    },
    {
      id: 'usr_lucas',
      name: 'Lucas Ferreira',
      email: 'lucas@colegiocrescer.com.br',
      role: 'professor',
      cargoLabel: 'Professor de Natação',
      status: 'ATIVO',
    },
  ];

  const monthKey = todayStr.slice(0, 7);
  const dayNumber = parseInt(todayStr.slice(8, 10), 10) || 19;

  const pontoRecords: PontoRecord[] = [
    {
      id: 'ponto_carla',
      userId: 'usr_carla',
      userName: 'Carla Mendes',
      date: todayStr,
      monthKey,
      dayNumber,
      status: 'normal',
      entry1: '08:00',
      exit1: '12:00',
    },
    {
      id: 'ponto_fernanda',
      userId: 'usr_fernanda',
      userName: 'Fernanda Silva',
      date: todayStr,
      monthKey,
      dayNumber,
      status: 'normal',
      entry1: '07:55',
      exit1: '12:00',
      entry2: '13:00',
      exit2: '17:00',
    },
    {
      id: 'ponto_beatriz',
      userId: 'usr_beatriz',
      userName: 'Beatriz Oliveira',
      date: todayStr,
      monthKey,
      dayNumber,
      status: 'normal',
      entry1: '11:00',
    },
  ];

  const appState = buildLiveAppStateSummary({
    students,
    records,
    pontoRecords,
    currentUser,
    selectedDate: todayStr,
    activeTab: 'momento',
    selectedTurma: 'TODAS',
    activeTurmas,
    schedules,
  });

  const context: SofiaToolExecutionContext = {
    students,
    records,
    pontoRecords,
    currentUser,
    selectedDate: todayStr,
    activeTab: 'momento',
    activeTurmas,
    schedules,
    users,
    appState,
  };

  return { appState, context };
}

async function runSimulation() {
  const { appState, context } = buildTestFixtures();
  const baseUrl = process.env.SOFIA_TEST_BASE_URL || 'http://127.0.0.1:3000';

  const monitoraUser: UserProfile = {
    id: 'usr_carla',
    name: 'Carla Mendes',
    email: 'carla@colegiocrescer.com.br',
    role: 'professor',
    cargoLabel: 'Monitora Titular',
    status: 'ATIVO',
    assignedTurmas: ['Infantil 1 Azul'],
    allowedTabs: ['alunos', 'momento', 'frequencia', 'semanario', 'ponto', 'manual'],
    canMarkAttendance: true,
    canManageStudents: false,
  };

  const secretariaUser: UserProfile = {
    id: 'usr_sec_claudia',
    name: 'Cláudia Secretaria',
    email: 'secretaria@colegiocrescer.com.br',
    role: 'auxiliar',
    cargoLabel: 'Secretaria Escolar',
    status: 'ATIVO',
    canManageStudents: true,
    canMarkAttendance: false,
    allowedTabs: ['alunos', 'momento', 'cardapio', 'ponto', 'relatorio', 'manual'],
  };

  const nutricionistaUser: UserProfile = {
    id: 'usr_nutri_1',
    name: 'Thaís Grisoni',
    email: 'thaisgriisoni@gmail.com',
    role: 'nutricionista',
    cargoLabel: 'Nutricionista (CRN: 84367)',
    status: 'ATIVO',
    allowedTabs: ['cardapio'],
    canManageStudents: false,
    canMarkAttendance: false,
  };

  const coordUser = context.currentUser!;

  // ===================================================================
  // 1. TESTE DE INTERFACE (SSR renderToStaticMarkup) E MANUAL
  // ===================================================================
  console.log('==================================================================');
  console.log('1) TESTE DE INTERFACE (EXCLUSIVA PARA ADMIN):');
  console.log('==================================================================');

  const uiProfiles: Array<{ label: string; user: UserProfile | null; expectEmpty: boolean }> = [
    { label: 'Deslogado (null)', user: null, expectEmpty: true },
    { label: 'Monitora (professor)', user: monitoraUser, expectEmpty: true },
    { label: 'Secretaria (auxiliar)', user: secretariaUser, expectEmpty: true },
    { label: 'Nutricionista', user: nutricionistaUser, expectEmpty: true },
    { label: 'Administrador (Fernando Veiga)', user: coordUser, expectEmpty: false },
  ];

  for (const p of uiProfiles) {
    const htmlAssistant = renderToStaticMarkup(
      React.createElement(SofiaAssistant, {
        students: context.students,
        records: context.records,
        currentUser: p.user,
        selectedDate: context.selectedDate,
        schedules: context.schedules,
      })
    );
    const htmlAgent = renderToStaticMarkup(
      React.createElement(SofiaAgent, {
        students: context.students,
        records: context.records,
        currentUser: p.user,
        selectedDate: context.selectedDate,
        schedules: context.schedules,
      })
    );
    const htmlVoice = renderToStaticMarkup(
      React.createElement(VoiceWidget, {
        students: context.students,
        records: context.records,
        currentUser: p.user,
        selectedDate: context.selectedDate,
        schedules: context.schedules,
      })
    );

    if (p.expectEmpty) {
      assert.strictEqual(htmlAssistant, '', `SofiaAssistant deveria renderizar vazio para ${p.label}`);
      assert.strictEqual(htmlAgent, '', `SofiaAgent deveria renderizar vazio para ${p.label}`);
      assert.strictEqual(htmlVoice, '', `VoiceWidget deveria renderizar vazio para ${p.label}`);
      console.log(`- [OK] ${p.label}: 0 bytes renderizados (nenhum botão, painel ou atalho da Sofia)`);
    } else {
      assert.ok(htmlAssistant.includes('Sofia'), 'SofiaAssistant deveria renderizar botão Sofia para Admin');
      assert.ok(htmlAgent.includes('Sofia'), 'SofiaAgent deveria renderizar botão Sofia para Admin');
      assert.ok(htmlVoice.includes('Sofia'), 'VoiceWidget deveria renderizar botão Sofia para Admin');
      console.log(`- [OK] ${p.label}: botão flutuante da Sofia renderizado (${htmlAssistant.length} chars)`);
    }
  }

  // Checar ausência de menção à Sofia no Manual / Normas visíveis para não-admin
  const manualContent = fs.readFileSync(path.join(process.cwd(), 'src/components/ManualOrientacoes.tsx'), 'utf-8');
  const normasContent = fs.readFileSync(path.join(process.cwd(), 'src/data/normasData.ts'), 'utf-8');
  assert.strictEqual(/sofia/i.test(manualContent), false, 'ManualOrientacoes não deve mencionar Sofia');
  assert.strictEqual(/sofia/i.test(normasContent), false, 'normasData não deve mencionar Sofia');
  console.log('- [OK] ManualOrientacoes.tsx e normasData.ts: zero referências à Sofia.');

  // ===================================================================
  // 2. TESTE DE BLOQUEIO NO SERVIDOR (403 SEM DETALHES E SEM GEMINI)
  // ===================================================================
  console.log('\n==================================================================');
  console.log('2) TESTE DE SERVIDOR (/api/sofia/* e /api/gemini/voice-agent):');
  console.log('==================================================================');

  // Login não-admin real no servidor
  const nonAdminLoginRes = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({
      email: 'thaisgriisoni@gmail.com',
      password: '01/01/1990',
    }),
  });
  const nonAdminLoginJson: any = await nonAdminLoginRes.json();
  assert.strictEqual(nonAdminLoginRes.status, 200);
  assert.strictEqual(nonAdminLoginJson.isAdmin, false, 'Não-admin deve receber isAdmin=false do servidor');
  const nonAdminToken: string = nonAdminLoginJson.token;
  assert.ok(nonAdminToken);
  console.log(`- [OK] POST /api/auth/session (não-admin): status=${nonAdminLoginRes.status}, isAdmin=${nonAdminLoginJson.isAdmin}`);

  const forgedPayload = {
    message: 'Quantos presentes hoje?',
    history: [],
    currentUser: { id: 'usr_coord_1', role: 'coordenador', isAdmin: true, name: 'Fake Admin' },
    role: 'coordenador',
    isAdmin: true,
    appState: {
      currentUser: { id: 'usr_coord_1', role: 'coordenador', isAdmin: true },
    },
  };

  const unauthorizedChecks: Array<{
    name: string;
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: any;
  }> = [
    { name: 'POST /api/sofia/chat sem sessão', method: 'POST', path: '/api/sofia/chat', body: { message: 'Oi' } },
    { name: 'POST /api/sofia/chat com corpo forjado isAdmin=true', method: 'POST', path: '/api/sofia/chat', body: forgedPayload },
    {
      name: 'POST /api/sofia/chat com token de usuário não-admin + corpo forjado',
      method: 'POST',
      path: '/api/sofia/chat',
      headers: { Authorization: `Bearer ${nonAdminToken}`, 'X-Requested-With': 'XMLHttpRequest' },
      body: forgedPayload,
    },
    { name: 'GET /api/sofia/admin-status sem sessão', method: 'GET', path: '/api/sofia/admin-status' },
    {
      name: 'GET /api/sofia/admin-status com token de usuário não-admin',
      method: 'GET',
      path: '/api/sofia/admin-status',
      headers: { Authorization: `Bearer ${nonAdminToken}` },
    },
    {
      name: 'DELETE /api/sofia/admin-status com token de usuário não-admin',
      method: 'DELETE',
      path: '/api/sofia/admin-status',
      headers: { Authorization: `Bearer ${nonAdminToken}`, 'X-Requested-With': 'XMLHttpRequest' },
    },
    {
      name: 'POST /api/gemini/voice-agent com token de usuário não-admin',
      method: 'POST',
      path: '/api/gemini/voice-agent',
      headers: { Authorization: `Bearer ${nonAdminToken}`, 'X-Requested-With': 'XMLHttpRequest' },
      body: { message: 'Oi', currentUser: { role: 'coordenador', isAdmin: true } },
    },
  ];

  for (const check of unauthorizedChecks) {
    const res = await fetch(`${baseUrl}${check.path}`, {
      method: check.method,
      headers: {
        'Content-Type': 'application/json',
        ...(check.headers || {}),
      },
      body: check.body ? JSON.stringify(check.body) : undefined,
    });
    const textBody = await res.text();
    assert.strictEqual(res.status, 403, `${check.name} deveria retornar 403 e retornou ${res.status}`);
    assert.strictEqual(textBody, '', `${check.name} deveria retornar corpo vazio sem detalhes`);
    console.log(`- [OK] ${check.name} -> HTTP ${res.status} (corpo vazio: "${textBody}")`);
  }

  // Autenticar como Administrador real no servidor (usando registro autoritativo do Firestore/PRESET_USERS em memória, sem exibir senha)
  let adminTestEmail = 'fernando.veiga@crescercampinas.com.br';
  let adminTestPassword = '12/08/1967';
  try {
    const { initializeApp, getApps } = await import('firebase/app');
    const { getFirestore, doc, getDoc } = await import('firebase/firestore');
    const fbCfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8'));
    const fbApp = getApps().find((a) => a.name === 'test-sim-auth') || initializeApp(fbCfg, 'test-sim-auth');
    const fbDb = getFirestore(fbApp, fbCfg.firestoreDatabaseId);
    const coordSnap = await getDoc(doc(fbDb, 'users', 'usr_coord_1'));
    if (coordSnap.exists()) {
      const data = coordSnap.data() as any;
      if (data?.email) adminTestEmail = String(data.email);
      if (data?.pin) adminTestPassword = String(data.pin);
    }
  } catch {
    // Fallback para PRESET_USERS se offline
  }

  const adminLoginRes = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({
      email: adminTestEmail,
      password: adminTestPassword,
    }),
  });
  const adminLoginJson: any = await adminLoginRes.json();
  const adminSetCookie = adminLoginRes.headers.get('set-cookie') || '';
  assert.strictEqual(adminLoginRes.status, 200);
  assert.strictEqual(adminLoginJson.isAdmin, true, 'Admin autenticado deve receber isAdmin=true');
  assert.ok(adminLoginJson.token);
  assert.ok(adminSetCookie.includes('HttpOnly'), 'Cookie de sessão deve ser HttpOnly');
  console.log(`- [OK] POST /api/auth/session (admin): status=${adminLoginRes.status}, isAdmin=${adminLoginJson.isAdmin}, cookieHttpOnly=true`);

  const adminAuthHeaders = {
    Authorization: `Bearer ${adminLoginJson.token}`,
    'X-Requested-With': 'XMLHttpRequest',
  };

  const adminStatusRes = await fetch(`${baseUrl}/api/sofia/admin-status`, {
    headers: adminAuthHeaders,
  });
  const adminStatusJson: any = await adminStatusRes.json();
  assert.strictEqual(adminStatusRes.status, 200);
  assert.strictEqual(adminStatusJson.success, true);
  console.log(
    `- [OK] GET /api/sofia/admin-status -> HTTP 200, model=${adminStatusJson.model}, defaultModel=${adminStatusJson.defaultModel}, fallbackModel=${adminStatusJson.fallbackModel}, alert=${JSON.stringify(adminStatusJson.alert)}, lastError=${JSON.stringify(adminStatusJson.lastError)}`
  );

  // ===================================================================
  // 3. SIMULAÇÃO CONVERSACIONAL COMO ADMIN AUTENTICADO (7 PEDIDOS REAIS)
  // ===================================================================
  console.log('\n==================================================================');
  console.log('3) SIMULAÇÃO CONVERSACIONAL DA SOFIA COMO ADMIN (/api/sofia/chat - 7 PEDIDOS):');
  console.log('==================================================================');
  console.log(`Painel (Header): ${appState.dayOfWeekFull} • ${appState.currentTime} • ${appState.totalPresentesHoje} presentes (${appState.totalMatriculados} matriculados, ${appState.totalFaltasHoje} faltas, ${appState.totalChamadasPendentesBlocoAtual} turma com chamada pendente: ${appState.turmasComChamadaPendenteHoje.join(', ')})`);

  const scriptPrompts = [
    'Quantos presentes hoje?',
    'Gere um PDF dos presentes.',
    'E só do Infantil 1 Azul?',
    'Quem faltou?',
    'Algum funcionário não registrou o ponto?',
    'O que o Maternal Azul está fazendo agora?',
    'Faz um resumo do dia para a coordenação.',
  ];

  const history: SofiaChatMessage[] = [
    {
      id: 'welcome',
      sender: 'sofia',
      text: 'Oi, Fernando! Tô por aqui — no que posso te ajudar agora?',
      timestamp: appState.currentTime,
    },
  ];

  // Garantir que sendSofiaMessage bloqueia localmente se usuário não for admin
  const clientBlocked = await sendSofiaMessage({
    message: 'Quantos presentes?',
    history: [],
    context: { ...context, currentUser: monitoraUser },
    apiBaseUrl: baseUrl,
  });
  assert.ok(clientBlocked.text.includes('exclusivo para administradores'));
  console.log(`- [OK] Guarda cliente em sendSofiaMessage para não-admin: "${clientBlocked.text}"`);

  const responses: string[] = [];
  for (let i = 0; i < scriptPrompts.length; i++) {
    const prompt = scriptPrompts[i];
    console.log(`\n[Turno ${i + 1}] Admin: "${prompt}"`);
    const result = await sendSofiaMessage({
      message: prompt,
      history,
      context,
      apiBaseUrl: baseUrl,
      authHeaders: adminAuthHeaders,
    });

    const toolsSummary = (result.toolResults || []).map((tr) => ({
      tool: tr.toolName,
      ok: tr.success,
      filename: tr.filename,
      error: tr.error,
    }));
    console.log(`  Modelo: ${result.model || 'N/A'} | Fallback: ${result.fallbackUsed ? 'sim' : 'nao'}`);
    if (result.error) {
      console.log(`  Erro real Gemini (codigo=${result.errorCode ?? 'N/A'}): ${result.error}`);
    }
    console.log(`  Ferramentas (${toolsSummary.length}): ${JSON.stringify(toolsSummary)}`);
    console.log(`  Sofia: ${result.text}`);
    assert.ok(result.text && result.text.trim().length > 0);
    responses.push(result.text);

    history.push({
      id: `usr_${i + 1}`,
      sender: 'user',
      text: prompt,
      timestamp: appState.currentTime,
    });
    history.push({
      id: `sofia_${i + 1}`,
      sender: 'sofia',
      text: result.text,
      timestamp: appState.currentTime,
      toolCall: result.toolCall,
      toolResult: result.toolResult,
      toolResults: result.toolResults,
      toolTurns: result.toolTurns,
    });
  }

  // ===================================================================
  // 4. VALIDAÇÃO DETERMINÍSTICA DAS FERRAMENTAS, 2ª BARREIRA ADMIN E AUDITORIA
  // ===================================================================
  console.log('\n==================================================================');
  console.log('4) FERRAMENTAS REAIS, 2ª BARREIRA ADMIN, CONFIRMAÇÃO, AUDITORIA E PDF:');
  console.log('==================================================================');

  clearLocalSofiaAuditLogsForTest();
  clearRecentPdfDownloadCache();
  clearStoredSofiaAdminAlert();

  let mockSaveCalls = 0;
  const noopSaveRecord = async () => {
    mockSaveCalls++;
  };

  const monitoraCtx: SofiaToolExecutionContext = { ...context, currentUser: monitoraUser, onSaveRecord: noopSaveRecord };
  const secretariaCtx: SofiaToolExecutionContext = { ...context, currentUser: secretariaUser, onSaveRecord: noopSaveRecord };
  const anonCtx: SofiaToolExecutionContext = { ...context, currentUser: null, onSaveRecord: noopSaveRecord };
  const coordCtx: SofiaToolExecutionContext = { ...context, currentUser: coordUser, onSaveRecord: noopSaveRecord };

  // 2ª barreira dentro de executeSofiaTool: nega qualquer não-admin (inclusive leitura)
  const blockedCalls = await Promise.all([
    executeSofiaTool('consultarFrequenciaHoje', {}, anonCtx),
    executeSofiaTool('consultarFrequenciaHoje', {}, monitoraCtx),
    executeSofiaTool('consultarLivroPonto', {}, monitoraCtx),
    executeSofiaTool('confirmarSaidaAluno', { alunoId: context.students[0].id }, monitoraCtx),
    executeSofiaTool('cadastrarRefeicaoCardapio', { tipo: 'Almoço', descricao: 'Teste' }, secretariaCtx),
    executeSofiaTool('gerar_pdf_frequencia', { tipo: 'presentes' }, secretariaCtx),
  ]);
  for (const r of blockedCalls) {
    assert.strictEqual(r.success, false, `Esperava negação na 2ª barreira para ${r.toolName}`);
    assert.strictEqual(r.data?.motivo, 'sem_permissao');
  }
  console.log('- [OK] Segunda barreira dentro de executeSofiaTool: 100% de negação (sem_permissao) para não-admin/nulo.');

  // Admin: leitura e escrita funcionando normalmente
  const t1 = await executeSofiaTool('consultarFrequenciaHoje', {}, coordCtx);
  const t2 = await executeSofiaTool('gerar_pdf_frequencia', { tipo: 'presentes' }, coordCtx);
  const t5 = await executeSofiaTool('consultarLivroPonto', {}, coordCtx);
  const t7 = await executeSofiaTool('analisarDesarranjosDoDia', { foco: 'geral' }, coordCtx);
  const cAllowFin = await executeSofiaTool('consultarResumoFinanceiro', {}, coordCtx);
  assert.strictEqual(t1.success, true);
  assert.strictEqual(t1.data?.presentes, appState.totalPresentesHoje);
  assert.strictEqual(t2.success, true);
  assert.strictEqual(t2.data?.totalAlunos, appState.totalPresentesHoje);
  assert.strictEqual(t5.success, true);
  assert.strictEqual(t7.success, true);
  assert.strictEqual(cAllowFin.success, true);
  console.log(`- [OK] Admin ferramentas leitura: presentes=${t1.data?.presentes} === Header (${appState.totalPresentesHoje}), ponto_pendencias=${t5.data?.pendencias?.length}, financeiro=ok`);

  // Trava de confirmação nas 6 ferramentas críticas
  mockSaveCalls = 0;
  const previewCalls = await Promise.all([
    executeSofiaTool('cadastrarUsuario', { nome: 'Novo Prof', email: 'novoprof@escola.com' }, coordCtx),
    executeSofiaTool('editarAluno', { alunoId: context.students[0].id, dadosAtualizados: { notes: 'Teste confirmação' } }, coordCtx),
    executeSofiaTool('alterarAnoLetivoAluno', { alunoId: context.students[0].id, novoAnoLetivo: 2027 }, coordCtx),
    executeSofiaTool('dispararAlertaWhatsApp', { destinatario: 'coordenacao', mensagem: 'Mensagem crítica' }, coordCtx),
    executeSofiaTool('registrarFaltaFrequencia', { alunoId: context.students[0].id, justificativa: 'Teste' }, coordCtx),
    executeSofiaTool('lancarFrequenciaTurma', { turmaId: 'Infantil 1 Azul' }, coordCtx),
  ]);
  for (const prev of previewCalls) {
    assert.strictEqual(prev.success, true);
    assert.strictEqual(prev.data?.requer_confirmacao, true);
    assert.strictEqual(prev.data?.confirmado, false);
    assert.strictEqual(prev.whatsappUrl, undefined);
  }
  assert.strictEqual(mockSaveCalls, 0);

  const confirmedFalta = await executeSofiaTool(
    'registrarFaltaFrequencia',
    { alunoId: context.students[0].id, justificativa: 'Teste confirmado', confirmado: true },
    coordCtx
  );
  assert.strictEqual(confirmedFalta.success, true);
  assert.strictEqual(confirmedFalta.data?.requer_confirmacao, undefined);
  assert.strictEqual(mockSaveCalls, 1);
  console.log('- [OK] Trava de confirmação explícita (confirmado:true) nas 6 ferramentas críticas.');

  // Log de auditoria
  const auditEntries = loadLocalSofiaAuditLogs();
  assert.ok(auditEntries.some((e) => e.outcome === 'negado'));
  assert.ok(auditEntries.some((e) => e.outcome === 'aguardando_confirmacao'));
  assert.ok(auditEntries.some((e) => e.outcome === 'sucesso' && e.toolName === 'registrarFaltaFrequencia'));
  console.log(`- [OK] Log de auditoria (${auditEntries.length} entradas registradas).`);

  // Retry policy (leitura vs escrita)
  let mockTurns = 0;
  let capturedFunctionResponse: any = null;
  const mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      mockTurns++;
      const parsed = JSON.parse(body || '{}');
      if (mockTurns === 1) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          hasFunctionCall: true,
          toolCalls: [{ id: 'call_write_1', name: 'confirmarSaidaAluno', args: { alunoId: context.students[0].id } }],
          rawModelContent: { role: 'model', parts: [{ functionCall: { name: 'confirmarSaidaAluno', args: { alunoId: context.students[0].id } } }] },
        }));
        return;
      }
      const lastTurn = parsed.pendingToolTurns?.[parsed.pendingToolTurns.length - 1];
      capturedFunctionResponse = lastTurn?.results?.[0]?.response;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        hasFunctionCall: false,
        text: 'Não consegui confirmar a saída agora porque ocorreu uma falha ao salvar. Quer tentar novamente?',
        toolCalls: [],
        rawModelContent: { role: 'model', parts: [{ text: 'Não consegui confirmar a saída agora porque ocorreu uma falha ao salvar. Quer tentar novamente?' }] },
      }));
    });
  });

  await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const addr = mockServer.address() as any;
  let saveCalls = 0;
  const writeTestRes = await sendSofiaMessage({
    message: `Confirma a saída de ${context.students[0].name}`,
    history: [],
    context: {
      ...coordCtx,
      onSaveRecord: async () => {
        saveCalls++;
        throw new Error('Falha simulada de gravação');
      },
    },
    apiBaseUrl: `http://127.0.0.1:${addr.port}`,
    authHeaders: adminAuthHeaders,
  });
  mockServer.close();
  assert.strictEqual(saveCalls, 1);
  assert.strictEqual(capturedFunctionResponse?.ok, false);
  assert.strictEqual(capturedFunctionResponse?.acao_nao_repetida_automaticamente, true);
  console.log(`- [OK] Política de retry (${READ_ONLY_SOFIA_TOOLS.size} leitura / ${WRITE_SOFIA_TOOLS.size} escrita, isReadOnly('confirmarSaidaAluno')=${isReadOnlySofiaTool('confirmarSaidaAluno')}): escrita falhou sem auto-retry.`);

  // Bloqueio de download duplicado nos 4 PDFs
  const pdfCases: Array<{ name: 'gerar_pdf_frequencia' | 'gerarListaChamadaPDF' | 'gerarEspelhoPontoPDF' | 'gerarAutorizacaoEntradaSaidaPDF'; args: Record<string, any> }> = [
    { name: 'gerar_pdf_frequencia', args: { tipo: 'presentes' } },
    { name: 'gerarListaChamadaPDF', args: { turmaId: 'Maternal Azul' } },
    { name: 'gerarEspelhoPontoPDF', args: { colaboradorId: 'usr_carla' } },
    { name: 'gerarAutorizacaoEntradaSaidaPDF', args: { alunoId: context.students[0].id, motivo: 'atraso', horario: '13:30' } },
  ];
  for (const tc of pdfCases) {
    clearRecentPdfDownloadCache();
    let downloadTriggerCount = 0;
    const pdfCtx: SofiaToolExecutionContext = {
      ...coordCtx,
      executedDownloadKeys: new Set<string>(),
      onPdfAutoDownload: () => {
        downloadTriggerCount++;
      },
    };
    const first = await executeSofiaTool(tc.name, tc.args, pdfCtx);
    const secondRetry = await executeSofiaTool(tc.name, tc.args, pdfCtx);
    assert.strictEqual(first.success, true);
    assert.strictEqual(secondRetry.success, true);
    assert.strictEqual(downloadTriggerCount, 1);
  }
  console.log('- [OK] Proteção contra download duplicado nos 4 PDFs durante retry.');

  // Alerta persistente da IA + Sino admin
  await resolvePersistentSofiaAdminAlert();
  const sampleAlert = {
    active: true,
    code: 402,
    kind: 'billing_depleted' as const,
    message: 'Créditos da IA esgotados — recarregue em ai.studio/projects',
    actionUrl: 'https://ai.studio/projects',
    detectedAt: new Date().toISOString(),
  };
  const notifsCreated = await persistSofiaAdminAlertToDbAndNotify(sampleAlert, [coordUser, monitoraUser]);
  const storedAlert = getStoredSofiaAdminAlert();
  assert.ok(storedAlert && storedAlert.active && storedAlert.code === 402);
  assert.ok(notifsCreated.some((n) => n.userId === coordUser.id && n.type === 'ia_alerta'));
  assert.ok(!notifsCreated.some((n) => n.userId === monitoraUser.id));
  console.log('- [OK] Alerta persistente da IA + notificação exclusiva no sino da administração.');
  console.log('==================================================================');
}

runSimulation().catch((err) => {
  console.error('Erro fatal na simulação:', err);
  process.exit(1);
});
