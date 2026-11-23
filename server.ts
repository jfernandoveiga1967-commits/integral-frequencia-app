import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, FunctionCallingConfigMode, Content } from '@google/genai';
import dotenv from 'dotenv';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
} from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';
import {
  isAdmin,
  isPurgedUser,
  PRESET_USERS,
  verifyUserCredentials,
} from './src/utils/authUtils';
import { getSalutationForName } from './src/utils/genderUtils';
import {
  buildDynamicPedagogicalFeedback,
  buildGeminiFeedbackSystemPrompt,
  sanitizeCordialMessageForWhatsApp,
} from './src/utils/feedbackPromptBuilder';
import {
  detectSegmentoFromTurma,
  getSegmentoConfig,
  buildFallback4PilaresProposal,
  format4PilaresDevelopment,
  Semanario4Pilares,
} from './src/services/semanarioAiService';
import {
  calculateDemonstrativoPJ,
  calculateDynamicTetoPrestador,
  getPrestadorWeeklyGradeBlocks,
} from './src/services/DemonstrativoService';
import {
  calculateFolhaProfessorHorista,
  calculateCargaSemanalFixa,
  getProfessorWeeklyGradeBlocks,
} from './src/services/FolhaService';
import {
  buildSofiaSystemPrompt,
  buildSofiaChatSystemInstruction,
  SOFIA_DEFAULT_MODEL,
  SOFIA_FALLBACK_MODEL,
  SOFIA_DEFAULT_TEMPERATURE,
} from './src/utils/sofiaPromptBuilder';
import { SOFIA_FUNCTION_DECLARATIONS } from './src/services/sofiaToolDeclarations';
import type { SofiaAdminAiAlert } from './src/types';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));

// Static files serving directly by Express
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/src/assets', express.static(path.join(process.cwd(), 'src/assets')));
app.use('/assets/images', express.static(path.join(process.cwd(), 'src/assets/images')));
app.use(
  '/node_modules/pdfjs-dist/build',
  express.static(path.join(process.cwd(), 'node_modules/pdfjs-dist/build'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      }
    },
  })
);

let aiClient: GoogleGenAI | null = null;
let geminiBillingCooldownUntil = 0;

function getAIClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
    }
  }
  return aiClient;
}

const SOFIA_ADMIN_ALERT_FILE = path.join(process.cwd(), '.sofia-admin-alert.json');

function readSofiaAdminAlertFromDisk(): SofiaAdminAiAlert | null {
  try {
    if (!fs.existsSync(SOFIA_ADMIN_ALERT_FILE)) return null;
    const raw = fs.readFileSync(SOFIA_ADMIN_ALERT_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed?.active ? (parsed as SofiaAdminAiAlert) : null;
  } catch {
    return null;
  }
}

function writeSofiaAdminAlertToDisk(alert: SofiaAdminAiAlert | null): void {
  try {
    if (!alert || !alert.active) {
      if (fs.existsSync(SOFIA_ADMIN_ALERT_FILE)) {
        fs.unlinkSync(SOFIA_ADMIN_ALERT_FILE);
      }
      return;
    }
    fs.writeFileSync(SOFIA_ADMIN_ALERT_FILE, JSON.stringify(alert, null, 2), 'utf-8');
  } catch {
    // silencioso
  }
}

interface SofiaRuntimeErrorInfo {
  code: number;
  message: string;
  model: string;
  detectedAt: string;
}

let currentSofiaAdminAlert: SofiaAdminAiAlert | null = readSofiaAdminAlertFromDisk();
let currentSofiaLastModelUsed: string = SOFIA_DEFAULT_MODEL;
let currentSofiaLastFallbackUsed: boolean = false;
let currentSofiaLastError: SofiaRuntimeErrorInfo | null = currentSofiaAdminAlert
  ? {
      code: currentSofiaAdminAlert.code,
      message: currentSofiaAdminAlert.lastError || currentSofiaAdminAlert.message,
      model: currentSofiaAdminAlert.model || SOFIA_DEFAULT_MODEL,
      detectedAt: currentSofiaAdminAlert.detectedAt,
    }
  : null;

function classifyGeminiError(
  err: any,
  modelName: string = SOFIA_DEFAULT_MODEL
): {
  statusCode: number;
  isQuotaOrBilling: boolean;
  isBillingDepleted: boolean;
  isRateLimit: boolean;
  isModelNotFound: boolean;
  isServiceUnavailable: boolean;
  adminAlert: SofiaAdminAiAlert | null;
} {
  const msg = String(err?.message || err || '');
  const rawStatus = Number(err?.status || err?.code || 0);
  const lower = msg.toLowerCase();

  const isBillingDepleted =
    rawStatus === 402 ||
    msg.includes('"code":402') ||
    lower.includes('prepayment credits are depleted') ||
    lower.includes('billing#prepay');

  const isModelNotFound =
    !isBillingDepleted &&
    (rawStatus === 404 ||
      msg.includes('"code":404') ||
      (msg.includes('NOT_FOUND') && lower.includes('model')) ||
      lower.includes('is not found for api version'));

  const isServiceUnavailable =
    !isBillingDepleted &&
    !isModelNotFound &&
    (rawStatus === 503 ||
      msg.includes('"code":503') ||
      msg.includes('UNAVAILABLE') ||
      lower.includes('service unavailable') ||
      lower.includes('overloaded'));

  const isRateLimit =
    !isBillingDepleted &&
    !isModelNotFound &&
    !isServiceUnavailable &&
    (rawStatus === 429 ||
      msg.includes('"code":429') ||
      lower.includes('quota exceeded') ||
      lower.includes('rate limit') ||
      msg.includes('RESOURCE_EXHAUSTED'));

  const nowISO = new Date().toISOString();
  let adminAlert: SofiaAdminAiAlert | null = null;
  let statusCode = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
  const compactErr = msg.slice(0, 260);

  if (isBillingDepleted) {
    statusCode = 402;
    adminAlert = {
      active: true,
      code: 402,
      kind: 'billing_depleted',
      message: 'Créditos da IA esgotados — recarregue em ai.studio/projects',
      actionUrl: 'https://ai.studio/projects',
      detectedAt: nowISO,
      model: modelName,
      lastError: compactErr,
    };
  } else if (isRateLimit) {
    statusCode = 429;
    adminAlert = {
      active: true,
      code: 429,
      kind: 'rate_limited',
      message: 'Limite temporário da IA atingido — verifique a cota em ai.studio/projects',
      actionUrl: 'https://ai.studio/projects',
      detectedAt: nowISO,
      model: modelName,
      lastError: compactErr,
    };
  } else if (isModelNotFound) {
    statusCode = 404;
    adminAlert = {
      active: true,
      code: 404,
      kind: 'model_not_found',
      message: `Modelo de IA (${modelName}) indisponível no projeto — verifique em ai.studio/projects`,
      actionUrl: 'https://ai.studio/projects',
      detectedAt: nowISO,
      model: modelName,
      lastError: compactErr,
    };
  } else if (isServiceUnavailable) {
    statusCode = 503;
    adminAlert = {
      active: true,
      code: 503,
      kind: 'service_error',
      message: `Serviço de IA (${modelName}) temporariamente indisponível — tente novamente em instantes`,
      actionUrl: 'https://ai.studio/projects',
      detectedAt: nowISO,
      model: modelName,
      lastError: compactErr,
    };
  }

  return {
    statusCode,
    isQuotaOrBilling: isBillingDepleted || isRateLimit,
    isBillingDepleted,
    isRateLimit,
    isModelNotFound,
    isServiceUnavailable,
    adminAlert,
  };
}

// Compatibilidade para a rota de voz existente
function isGeminiQuotaOrBillingError(err: any) {
  return classifyGeminiError(err, SOFIA_DEFAULT_MODEL);
}

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ============================================================================
// AUTENTICAÇÃO E SESSÃO NO SERVIDOR (NÃO CONFIA EM ROLE/ISADMIN DO CLIENTE)
// ============================================================================
const SESSION_COOKIE_NAME = 'crescer_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_SIGNING_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

interface VerifiedSessionPayload {
  sub: string;
  email: string;
  isAdmin: boolean;
  iat: number;
  exp: number;
}

let serverFirestoreDb: ReturnType<typeof getFirestore> | null = null;
function getServerFirestoreDb() {
  if (serverFirestoreDb) return serverFirestoreDb;
  const appName = 'server-auth-lookup';
  const existing = getApps().find((a) => a.name === appName);
  const serverApp = existing || initializeApp(firebaseConfig, appName);
  serverFirestoreDb = existing
    ? getFirestore(serverApp, firebaseConfig.firestoreDatabaseId)
    : initializeFirestore(
        serverApp,
        {
          localCache: memoryLocalCache(),
          experimentalAutoDetectLongPolling: true,
        },
        firebaseConfig.firestoreDatabaseId
      );
  return serverFirestoreDb;
}

function signServerSessionToken(payload: VerifiedSessionPayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${sig}`;
}

function verifyServerSessionToken(token?: string | null): VerifiedSessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  const providedBuf = Buffer.from(providedSig, 'utf-8');
  const expectedBuf = Buffer.from(expectedSig, 'utf-8');
  if (providedBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8')) as VerifiedSessionPayload;
    if (!parsed || typeof parsed.sub !== 'string' || typeof parsed.exp !== 'number') return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  });
  return result;
}

async function findAuthoritativeUserByEmail(emailInput: string): Promise<any | null> {
  const cleanEmail = (emailInput || '').trim().toLowerCase();
  if (!cleanEmail) return null;

  const isMasterAlias =
    cleanEmail === 'fernando.veiga@crescercampinas.com.br' ||
    cleanEmail === 'jfernandoveiga1967@gmail.com' ||
    cleanEmail === 'coordenacao@crescer.edu.br';

  const lookupPromise = (async () => {
    try {
      const db = getServerFirestoreDb();
      if (isMasterAlias) {
        const coordSnap = await getDoc(doc(db, 'users', 'usr_coord_1'));
        if (coordSnap.exists()) {
          return { id: coordSnap.id, ...coordSnap.data() };
        }
      }
      for (const colName of ['users', 'usuarios']) {
        const snap = await getDocs(
          query(collection(db, colName), where('email', '==', cleanEmail), limit(1))
        );
        if (!snap.empty) {
          const d = snap.docs[0];
          return { id: d.id, ...d.data() };
        }
      }
    } catch {
      // Fallback silencioso para PRESET_USERS
    }
    return null;
  })();

  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), 4000);
  });

  const fromFirestore = await Promise.race([lookupPromise, timeoutPromise]);
  if (fromFirestore) return fromFirestore;

  const fromPreset = PRESET_USERS.find((u) => {
    const pEmail = (u.email || '').trim().toLowerCase();
    if (isMasterAlias && u.id === 'usr_coord_1') return true;
    return pEmail === cleanEmail;
  });
  return fromPreset || null;
}

function isSameOriginCookieRequest(req: express.Request): boolean {
  if (req.headers['x-requested-with']) return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const originHost = new URL(String(origin)).host.toLowerCase();
    const expectedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
    return Boolean(expectedHost && originHost === expectedHost);
  } catch {
    return false;
  }
}

function requireAdminSession(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = String(req.headers.authorization || '');
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null;

  let session = verifyServerSessionToken(bearerToken);
  if (!session) {
    const cookies = parseCookies(req.headers.cookie);
    const cookieToken = cookies[SESSION_COOKIE_NAME];
    if (cookieToken) {
      const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
      if (!isMutating || isSameOriginCookieRequest(req)) {
        session = verifyServerSessionToken(cookieToken);
      }
    }
  }

  if (!session || session.isAdmin !== true) {
    return res.status(403).end();
  }

  (req as any).verifiedAdminSession = session;
  return next();
}

app.post('/api/auth/session', async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
    if (!email || !password) {
      return res.status(401).json({ success: false });
    }

    const authoritativeUser = await findAuthoritativeUserByEmail(email);
    if (!authoritativeUser || isPurgedUser(authoritativeUser)) {
      return res.status(401).json({ success: false });
    }

    const status = String(authoritativeUser.status || 'ATIVO').toUpperCase();
    if (status === 'DESLIGADO' || status === 'INATIVO') {
      return res.status(403).end();
    }

    if (!verifyUserCredentials(authoritativeUser, email, password)) {
      return res.status(401).json({ success: false });
    }

    const adminAuthorized = isAdmin(authoritativeUser);
    const now = Date.now();
    const payload: VerifiedSessionPayload = {
      sub: String(authoritativeUser.id || authoritativeUser.uid || email.toLowerCase()),
      email: String(authoritativeUser.email || email).trim().toLowerCase(),
      isAdmin: adminAuthorized,
      iat: now,
      exp: now + SESSION_TTL_MS,
    };

    const token = signServerSessionToken(payload);
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
      path: '/',
      maxAge: SESSION_TTL_MS,
    });

    return res.json({
      success: true,
      token,
      isAdmin: adminAuthorized,
    });
  } catch {
    return res.status(500).json({ success: false });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    path: '/',
  });
  return res.json({ success: true });
});

// Middleware obrigatório para TODAS as rotas /api/sofia/* (inclusive admin-status e chat)
app.use('/api/sofia', requireAdminSession);

// Status administrativo da Sofia (cota/créditos/modelo/último erro para banner/painel admin)
app.get('/api/sofia/admin-status', (req, res) => {
  res.json({
    success: true,
    model: currentSofiaLastModelUsed || SOFIA_DEFAULT_MODEL,
    defaultModel: SOFIA_DEFAULT_MODEL,
    fallbackModel: SOFIA_FALLBACK_MODEL,
    fallbackUsed: currentSofiaLastFallbackUsed,
    lastError: currentSofiaLastError,
    alert: currentSofiaAdminAlert,
  });
});

app.delete('/api/sofia/admin-status', (req, res) => {
  currentSofiaAdminAlert = null;
  currentSofiaLastError = null;
  writeSofiaAdminAlertToDisk(null);
  res.json({ success: true });
});

// API Route: Apuração do Demonstrativo PJ Sincronizado com a Grade Horária
app.post('/api/demonstrativo/apuracao', (req, res) => {
  try {
    const {
      prestador,
      startDate,
      endDate,
      holidays = [],
      records = [],
      schedules = [],
      prestadorActivities,
    } = req.body;

    if (!prestador || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Os parâmetros prestador, startDate e endDate são obrigatórios.',
      });
    }

    const isDanyel =
      prestador &&
      (prestador.id === 'usr_danyelpereira' ||
        Boolean(prestador.name && prestador.name.toLowerCase().includes('danyel')));

    const effectiveActivities = isDanyel
      ? ['Flauta']
      : (Array.isArray(prestadorActivities) && prestadorActivities.length > 0
          ? prestadorActivities
          : ['Flauta']);

    const resultado = calculateDemonstrativoPJ({
      prestador,
      startDate,
      endDate,
      holidays,
      records,
      schedules,
      prestadorActivities: effectiveActivities,
    });

    return res.json({
      success: true,
      demonstrativo: resultado,
    });
  } catch (error: any) {
    console.error('Erro na apuração do demonstrativo PJ no servidor:', error);
    return res.status(500).json({
      error: error.message || 'Erro interno na apuração do demonstrativo PJ.',
    });
  }
});

// API Route: Consulta da Grade Horária e Teto Semanal Dinâmico do Prestador PJ
app.get('/api/demonstrativo/teto-grade/:prestadorId', (req, res) => {
  try {
    const { prestadorId } = req.params;
    const isDanyel = prestadorId === 'usr_danyelpereira' || prestadorId.toLowerCase().includes('danyel');
    const dummyUser: any = {
      id: prestadorId,
      name: isDanyel ? 'Danyel Pereira' : 'Professor Prestador',
      role: 'professor',
      cargoLabel: isDanyel ? 'Professor de Flauta' : 'Professor Prestador',
      regimeTrabalho: 'prestador_aula_efetiva',
      valorHoraAula: 33.06,
      assignedActivities: ['Flauta'],
      specialtyActivity: 'Flauta',
    };

    const tetoInfo = calculateDynamicTetoPrestador(dummyUser, undefined, ['Flauta']);
    return res.json({
      success: true,
      prestadorId,
      ...tetoInfo,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Erro ao consultar teto da grade horária.',
    });
  }
});

// API Route: Apuração da Folha do Professor Horista CLT Sincronizada com a Grade Horária
app.post('/api/folha/apuracao-horista', (req, res) => {
  try {
    const {
      professor,
      startDate,
      endDate,
      holidays = [],
      records = [],
      pontoRecords = [],
      schedules = [],
      professorActivities,
      manualAddition = 0,
      manualAdditionNote = '',
      manualDiscount = 0,
      manualDiscountNote = '',
      ajudaDeCusto = 150,
    } = req.body;

    if (!professor || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Os parâmetros professor, startDate e endDate são obrigatórios.',
      });
    }

    const resultado = calculateFolhaProfessorHorista({
      professor,
      startDate,
      endDate,
      holidays,
      records,
      pontoRecords,
      schedules,
      professorActivities,
      manualAddition,
      manualAdditionNote,
      manualDiscount,
      manualDiscountNote,
      ajudaDeCusto,
    });

    return res.json({
      success: true,
      folha: resultado,
    });
  } catch (error: any) {
    console.error('Erro na apuração da folha do professor horista no servidor:', error);
    return res.status(500).json({
      error: error.message || 'Erro interno na apuração da folha do professor horista.',
    });
  }
});

// API Route: Consulta da Grade Horária e Carga Semanal Fixa CLT do Professor Horista
app.get('/api/folha/grade-horista/:professorId', (req, res) => {
  try {
    const { professorId } = req.params;
    const isLeticia = professorId === 'usr_leticia' || professorId.toLowerCase().includes('leticia');
    const dummyUser: any = {
      id: professorId,
      name: isLeticia ? 'Professora Letícia' : 'Professor Horista CLT',
      regimeTrabalho: 'professor_horista',
      regimeContratual: 'Professor Horista (CLT)',
      valorHoraAula: 35.0,
      assignedActivities: ['Balé', 'Dança'],
      specialtyActivity: 'Balé',
      diasGradeAutorizados: ['segunda', 'terca'],
    };

    const cargaInfo = calculateCargaSemanalFixa(dummyUser);
    return res.json({
      success: true,
      professorId,
      ...cargaInfo,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Erro ao consultar carga da grade horária do professor horista.',
    });
  }
});

// API Route: Gerador de Propostas Pedagógicas com Gemini (Equipe Pedagógica e Coordenadores)
app.post('/api/gemini/generate-proposal', async (req, res) => {
  try {
    const userRole = (
      (req.headers['x-user-role'] as string) ||
      req.body?.user?.role ||
      req.body?.userRole ||
      ''
    ).toLowerCase();

    // Validação de perfil: Permite Coordenadores, Professores, Monitores(as), Auxiliares, ADIs e Educadores cadastrados
    const allowedRoles = [
      'coordenador',
      'professor',
      'auxiliar',
      'nutricionista',
      'admin',
      'monitora',
      'monitor',
      'adi',
      'educador',
      'colaborador',
    ];
    if (userRole && !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Acesso negado: A geração de propostas pedagógicas com inteligência artificial é restrita à equipe pedagógica cadastrada.',
        forbidden: true,
      });
    }

    const { turma, category, theme, dayOfWeek, date, staffList } = req.body;

    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Chave GEMINI_API_KEY não configurada no ambiente.',
        useFallback: true,
      });
    }

    // Identificação de categoria e segmento escolar da turma
    const normalizedCat = (category || 'Atividade Geral').trim();
    const segmento = detectSegmentoFromTurma(turma);
    const segConfig = getSegmentoConfig(segmento);

    const isDevocional = normalizedCat.toLowerCase().includes('devocional');
    const isContacao =
      normalizedCat.toLowerCase().includes('história') ||
      normalizedCat.toLowerCase().includes('historia') ||
      normalizedCat.toLowerCase().includes('livro') ||
      normalizedCat.toLowerCase().includes('leitura') ||
      normalizedCat.toLowerCase().includes('literatura');

    // Fonte prioritária e mandatória: Quadro de Atribuições vinculado à turma selecionada
    const exactAdi =
      staffList?.turmaAtribuicao?.adi?.trim() ||
      (Array.isArray(staffList?.adis) && staffList.adis.length === 1 ? staffList.adis[0].trim() : '');
    const exactMonitor =
      staffList?.turmaAtribuicao?.monitora?.trim()
        ? (staffList.turmaAtribuicao.assistente?.trim()
            ? `${staffList.turmaAtribuicao.monitora.trim()} e ${staffList.turmaAtribuicao.assistente.trim()}`
            : staffList.turmaAtribuicao.monitora.trim())
        : (Array.isArray(staffList?.monitors) && staffList.monitors.length > 0 ? staffList.monitors.join(', ') : '');

    const adisText = exactAdi || (Array.isArray(staffList?.adis) && staffList.adis.length > 0
      ? staffList.adis.join(', ')
      : 'Patrícia');
    const monitorsText = exactMonitor || (Array.isArray(staffList?.monitors) && staffList.monitors.length > 0
      ? staffList.monitors.join(', ')
      : 'Márcia');

    const cleanTheme = theme && String(theme).trim() ? String(theme).trim() : '';

    const prompt = `Você é um Arquiteto Pedagógico e Coordenador experiente na Escola Crescer.
Sua missão é elaborar a proposta pedagógica para o Semanário do Programa Integral estruturada OBRIGATORIAMENTE nos 4 PILARES DIDÁTICOS, com linguagem e tempo adaptados ao segmento escolar da turma.

DADOS DA TURMA E SEGMENTAÇÃO:
- Turma: ${turma || 'Ensino Fundamental'}
- Segmento Escolar: ${segConfig.nomeSegmento} (Faixa Etária: ${segConfig.faixaEtaria})
- Tempo Estimado Obrigatório para o Segmento: ${segConfig.tempoEstimadoLabel} (${segConfig.tempoEstimadoMinutos} minutos)
- Diretriz de Linguagem do Segmento: ${segConfig.diretrizLinguagem}
- Categoria Pedagógica: ${normalizedCat}
- Tema da Semana: ${cleanTheme ? `"${cleanTheme}" (a proposta deve se inspirar e articular harmoniosamente a este tema)` : 'Nenhum tema inserido (proponha um tema pedagógico relevante, acolhedor e lúdico)'}
- Dia da semana e data: ${dayOfWeek || ''} ${date ? `(${date})` : ''}

EQUIPE OFICIAL ATRIBUÍDA:
- ADI(s): ${adisText}
- Monitora(s): ${monitorsText}

ESTRUTURAÇÃO OBRIGATÓRIA NOS 4 PILARES DIDÁTICOS:
1. Pilar 1 (Intencionalidade & BNCC):
   - Defina o objetivo pedagógico formativo da atividade (iniciando em letra minúscula).
   - Defina o foco de desenvolvimento: "motor", "cognitivo", "social" ou "socioemocional".
   - Liste os materiais simples e acessíveis da rotina escolar.
   - Tempo estimado: ${segConfig.tempoEstimadoLabel}.
2. Pilar 2 (Disparador Lúdico):
   - Crie uma introdução envolvente e disparadora:
     * Para Mini/Maternal e Infantil: música com gestos, história curta com fantoche ou elemento surpresa.
     * Para Fundamental I: pergunta disparadora instigante ou enigma cooperativo.
     * Para 6º Ano (REGRA ESTRITA ANTI-INFANTILIZAÇÃO): pergunta provocadora reflexiva, estudo de caso ou desafio contemporâneo.
3. Pilar 3 (Desenvolvimento Mão na Massa):
   - Detalhe o passo a passo da mediação prática do monitor e da ADI com os alunos (3 etapas claras e objetivas).
4. Pilar 4 (Sintetização & Transição):
   - Fechamento: partilha, reflexão ou apreciação coletiva.
   - Organização do Espaço: como as crianças e a equipe guardam os materiais e cuidam da sala.
   - Transição: encaminhamento sereno e acolhedor para a próxima rotina escolar.

REGRAS DE ESTILO E FORMATAÇÃO (ESTRITAMENTE OBRIGATÓRIAS):
- Sem Markdown Pesado: Proibido o uso de **, *, # ou formatações pesadas.
- Sem BNCC/Jargões: Proibido incluir códigos burocráticos (ex: EI02CG01, EF15EF01).
- Regra do Título: Frase normal com apenas a primeira letra maiúscula (e nomes próprios/sagrados). NUNCA em CAIXA ALTA. NUNCA repetir o nome do tema da semana nem o da categoria no título.
${isContacao ? '- Livro: Informar obrigatoriamente Livro, Autor e Editora reais existentes (formato: "Título do Livro, de Autor (Editora).").\n' : ''}${isDevocional ? '- Versículo: Citar versículo bíblico curto e real com livro, capítulo e versículo existentes.\n' : ''}
Retorne EXCLUSIVAMENTE um objeto JSON válido no formato:
{
  "title": "Nome da atividade em frase normal",
  "theme": "${cleanTheme || 'Tema pedagógico acolhedor'}",
  "suggestedAdi": "${adisText}",
  "suggestedMonitor": "${monitorsText}",
  "category": "${normalizedCat}",
  "segmento": "${segmento}",
  "tempoEstimadoMinutos": ${segConfig.tempoEstimadoMinutos},
  ${isContacao ? '"livro": "Título do Livro, de Autor (Editora).",\n  ' : ''}${isDevocional ? '"versiculo": "Citação bíblica curta e real",\n  ' : ''}"pilar1": {
    "objetivo": "texto em minúscula...",
    "focoDesenvolvimento": "motor | cognitivo | social | socioemocional",
    "materiais": ["item 1", "item 2"]
  },
  "pilar2": {
    "tipo": "musica | historia | pergunta | desafio",
    "descricao": "introdução disparadora envolvente..."
  },
  "pilar3": {
    "passoAPasso": ["etapa 1", "etapa 2", "etapa 3"],
    "mediacaoMonitor": "mediação da equipe..."
  },
  "pilar4": {
    "fechamento": "finalização com os alunos...",
    "organizacaoEspaco": "organização dos materiais...",
    "transicao": "transição para a próxima rotina..."
  },
  "materials": "• Item 1\\n• Item 2",
  "proposta": "resumo do objetivo em minúscula...",
  "atividades": "resumo do passo a passo...",
  "importante": "orientação acolhedora para a equipe..."
}`;

    let response: any = null;
    let attempts = 0;
    while (attempts < 2) {
      try {
        attempts++;
        response = await ai.models.generateContent({
          model: SOFIA_DEFAULT_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 2500,
          },
        });
        break;
      } catch (err: any) {
        if (attempts >= 2) {
          console.log('[Semanário IA] Ativando contingência dos 4 Pilares Didáticos (IA/créditos indisponíveis):', err?.status || 'indisponível');
          response = null;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    const responseText = response?.text || '';
    let parsed: any = null;
    if (responseText) {
      try {
        parsed = JSON.parse(responseText);
      } catch {
        const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          parsed = null;
        }
      }
    }

    // Se a IA não respondeu ou houve falha, utiliza o gerador curado oficial dos 4 Pilares Didáticos
    if (!parsed || !parsed.title) {
      const fallbackProposal = buildFallback4PilaresProposal(turma, normalizedCat, cleanTheme);
      parsed = {
        ...fallbackProposal,
        suggestedAdi: exactAdi || (staffList?.adis?.[0] || 'Patrícia'),
        suggestedMonitor: exactMonitor || (staffList?.monitors?.length ? staffList.monitors.join(' e ') : 'Márcia'),
      };
    }

    // Normaliza campos para string limpa
    const toStringField = (val: any): string => {
      if (!val) return '';
      if (typeof val === 'string') return val;
      if (Array.isArray(val)) {
        return val.map((item) => (typeof item === 'string' ? `• ${item}` : JSON.stringify(item))).join('\n');
      }
      if (typeof val === 'object') {
        return Object.entries(val)
          .map(([k, v]) => `${k}:\n${Array.isArray(v) ? v.map((x) => `  • ${x}`).join('\n') : v}`)
          .join('\n\n');
      }
      return String(val);
    };

    // Remove markdown pesado (**, *, #, `), jargões burocráticos e códigos da BNCC
    const cleanPedagogicalText = (val: any): string => {
      let str = toStringField(val);
      if (!str) return '';
      return str
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/^#+\s*/gm, '')
        .replace(/`{1,3}/g, '')
        .replace(/\(?\s*BNCC\s*:?[^)]*\)?/gi, '')
        .replace(/\b(EI|EF)\d{2}[A-Z]{2}\d{2}\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    };

    // Formata o título em frase normal (sentence case), sem caixa alta, sem repetir tema ou categoria
    const formatCleanTitle = (rawTitle: string): string => {
      let title = cleanPedagogicalText(rawTitle)
        .replace(/^["'“”«»]+|["'“”«»]+$/g, '')
        .replace(/[.:;!]+$/, '')
        .trim();

      if (!title) {
        title = 'Vivência lúdica integrada';
      }

      title = title.toLowerCase();
      title = title.charAt(0).toUpperCase() + title.slice(1);

      title = title
        .replace(/\bdeus\b/gi, 'Deus')
        .replace(/\bjesus\b/gi, 'Jesus')
        .replace(/\bbíblia\b/gi, 'Bíblia')
        .replace(/\bsenhor\b/gi, 'Senhor');

      if (cleanTheme) {
        const themeWords = cleanTheme.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
        for (const tw of themeWords) {
          const reg = new RegExp(`\\b${tw}\\b`, 'gi');
          if (reg.test(title)) {
            title = title.replace(reg, 'descobertas');
          }
        }
      }

      if (normalizedCat) {
        const catWords = normalizedCat.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
        for (const cw of catWords) {
          const reg = new RegExp(`\\b${cw}\\b`, 'gi');
          if (reg.test(title)) {
            title = title.replace(reg, 'vivência');
          }
        }
      }

      title = title.replace(/\s{2,}/g, ' ').trim();
      if (title.length > 0) {
        title = title.charAt(0).toUpperCase() + title.slice(1);
      }
      return title || 'Vivência lúdica integrada';
    };

    const ensureDiscretionaryLowerCase = (str: string): string => {
      if (!str) return '';
      let trimmed = str.trim();
      const firstWord = trimmed.split(/\s+/)[0] || '';
      if (!['Deus', 'Jesus', 'Cristo', 'Bíblia', 'Senhor'].includes(firstWord)) {
        trimmed = trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
      }
      return trimmed;
    };

    const finalTitle = formatCleanTitle(parsed?.title || '');
    const livroStr = cleanPedagogicalText(parsed?.livro || '');
    const versiculoStr = cleanPedagogicalText(parsed?.versiculo || '');
    const importanteStr = cleanPedagogicalText(parsed?.importante || parsed?.dicaMonitora || '');

    // Extrai e valida a estrutura dos 4 Pilares Didáticos
    const p1Obj = ensureDiscretionaryLowerCase(
      cleanPedagogicalText(parsed?.pilar1?.objetivo || parsed?.proposta || parsed?.objectives || 'proporcionar vivência acolhedora e integrada')
    );
    const p1FocoRaw = String(parsed?.pilar1?.focoDesenvolvimento || 'cognitivo').toLowerCase();
    const p1Foco = ['motor', 'cognitivo', 'social', 'socioemocional'].includes(p1FocoRaw)
      ? (p1FocoRaw as 'motor' | 'cognitivo' | 'social' | 'socioemocional')
      : 'cognitivo';

    let p1Materiais: string[] = [];
    if (Array.isArray(parsed?.pilar1?.materiais)) {
      p1Materiais = parsed.pilar1.materiais.map((m: any) => cleanPedagogicalText(m)).filter(Boolean);
    } else if (parsed?.materials) {
      p1Materiais = String(parsed.materials)
        .split('\n')
        .map((l) => l.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean);
    }
    if (p1Materiais.length === 0) {
      p1Materiais = ['Materiais pedagógicos simples da rotina escolar'];
    }

    const p2Tipo = parsed?.pilar2?.tipo || (segmento === 'mini_maternal' ? 'musica' : 'pergunta');
    const p2Desc = cleanPedagogicalText(
      parsed?.pilar2?.descricao ||
      (segmento === 'mini_maternal'
        ? 'cantar uma melodia suave com palmas para acolher a turma em semicírculo.'
        : 'apresentar uma pergunta disparadora curiosa para conectar a turma ao tema.')
    );

    let p3Passos: string[] = [];
    if (Array.isArray(parsed?.pilar3?.passoAPasso) && parsed.pilar3.passoAPasso.length > 0) {
      p3Passos = parsed.pilar3.passoAPasso.map((p: any) => cleanPedagogicalText(p)).filter(Boolean);
    } else if (parsed?.atividades || parsed?.dinamica) {
      p3Passos = [cleanPedagogicalText(parsed.atividades || parsed.dinamica)];
    } else {
      p3Passos = [
        'Acomodar as crianças com acolhimento e apresentar os recursos pedagógicos.',
        'Orientar a atividade prática de forma cooperativa e incentivando a autonomia.',
        'Acompanhar os alunos com mediação afetuosa e escuta atenta.',
      ];
    }

    const p3Mediacao = cleanPedagogicalText(
      parsed?.pilar3?.mediacaoMonitor ||
      'A monitora e a ADI conduzem a turma com presença atenta e incentivo constante aos avanços do grupo.'
    );

    const p4Fechamento = cleanPedagogicalText(
      parsed?.pilar4?.fechamento || 'roda de conversa breve para partilha e apreciação coletiva.'
    );
    const p4Organizacao = cleanPedagogicalText(
      parsed?.pilar4?.organizacaoEspaco || 'organização colaborativa dos materiais na sala.'
    );
    const p4Transicao = cleanPedagogicalText(
      parsed?.pilar4?.transicao || 'transição serena e acolhedora para a próxima rotina escolar.'
    );

    const pilares: Semanario4Pilares = {
      pilar1_intencionalidade: {
        objetivo: p1Obj,
        focoDesenvolvimento: p1Foco,
        materiais: p1Materiais,
        tempoEstimadoMinutos: segConfig.tempoEstimadoMinutos,
      },
      pilar2_disparadorLudico: {
        tipo: p2Tipo,
        descricao: p2Desc,
      },
      pilar3_maoNaMassa: {
        passoAPasso: p3Passos,
        mediacaoMonitor: p3Mediacao,
      },
      pilar4_sintetizacaoTransicao: {
        fechamento: p4Fechamento,
        organizacaoEspaco: p4Organizacao,
        transicao: p4Transicao,
      },
      segmento,
      tempoEstimadoMinutos: segConfig.tempoEstimadoMinutos,
    };

    const finalFormattedDev = format4PilaresDevelopment(normalizedCat, finalTitle, pilares, {
      livro: livroStr || undefined,
      versiculo: versiculoStr || undefined,
      dicaMonitora: importanteStr || undefined,
    });

    const finalMaterialsList = p1Materiais.map((m) => `• ${m}`).join('\n');
    const finalObjectives = `${p1Obj} [Foco: ${p1Foco.toUpperCase()} • ${segConfig.tempoEstimadoLabel}]`;

    // Fonte prioritária e mandatória: Quadro de Atribuições vinculado à turma
    const finalAdi = exactAdi || (typeof parsed?.suggestedAdi === 'string' && parsed.suggestedAdi.trim() ? cleanPedagogicalText(parsed.suggestedAdi) : (staffList?.adis?.[0] || 'Patrícia'));
    const finalMonitor = exactMonitor || (typeof parsed?.suggestedMonitor === 'string' && parsed.suggestedMonitor.trim() ? cleanPedagogicalText(parsed.suggestedMonitor) : (staffList?.monitors?.length ? staffList.monitors.join(' e ') : 'Márcia'));

    const normalizedProposal = {
      title: finalTitle,
      theme: typeof parsed?.theme === 'string' && parsed.theme.trim() ? cleanPedagogicalText(parsed.theme) : (cleanTheme || 'Vivência pedagógica integrada'),
      suggestedAdi: finalAdi,
      suggestedMonitor: finalMonitor,
      category: normalizedCat,
      segmento,
      livro: livroStr || undefined,
      versiculo: versiculoStr || undefined,
      objectives: finalObjectives,
      development: finalFormattedDev,
      formattedDevelopment: finalFormattedDev,
      materials: finalMaterialsList,
      proposta: p1Obj,
      atividades: p3Passos.join(' '),
      dinamica: `${p2Desc} ${p3Mediacao}`,
      dicaMonitora: importanteStr || undefined,
      pilares,
    };

    return res.json({
      success: true,
      proposal: normalizedProposal,
    });
  } catch (error: any) {
    console.warn('Erro ao chamar Gemini API para Semanário:', error?.message || error);
    return res.status(500).json({
      error: error?.message || 'Falha ao gerar proposta com IA',
      useFallback: true,
    });
  }
});

// Helper: Gerador pedagógico oficial de contingência baseado nos 3 Pilares e CNV
function buildServerFallbackCordialFeedback(
  userName: string,
  normTitle: string,
  rawContext: string,
  normSection?: string,
  normDetails?: string[],
  selectedChecklistItem?: string
): { message: string; actionPoints: string[] } {
  return buildDynamicPedagogicalFeedback({
    userName,
    normTitle,
    rawContext,
    normSection,
    normDetails,
    selectedChecklistItem,
  });
}

// Helper: Heurística Semântica Contextual no servidor para correspondência de normas no catálogo
function serverHeuristicMatchNorm(rawContext: string, condensedNorms: any[]): { normId: string; reason: string; confidence: 'high' | 'medium' | 'low' } {
  if (!rawContext || !Array.isArray(condensedNorms) || condensedNorms.length === 0) {
    return {
      normId: condensedNorms?.[0]?.id || '',
      reason: 'Norma institucional padrão do Manual',
      confidence: 'low',
    };
  }

  const text = rawContext.toLowerCase();
  let bestScore = -1;
  let bestNorm = condensedNorms[0];
  let matchReason = 'Correspondência semântica e contextual com as normas do Manual';

  const keywordsMap: Record<string, string[]> = {
    celular: ['celular', 'telefone', 'zap', 'whatsapp', 'rede social', 'foto', 'filmagem', 'ligação'],
    vestuario: ['uniforme', 'roupa', 'vestimenta', 'camisa', 'avental', 'calçado', 'tênis', 'chinelo', 'maiô', 'sunga'],
    transporte: ['van', 'ônibus', 'transporte', 'rampa', 'portão', 'portaria', 'calçada', 'embarque', 'desembarque', 'fila'],
    academia: ['academia', 'natação', 'piscina', 'judô', 'balé', 'deslocamento', 'vestiário'],
    alimentacao: ['almoço', 'jantar', 'lanche', 'refeição', 'refeitório', 'comida', 'prato', 'talher', 'engasgo'],
    sensivel: ['choro', 'mordida', 'birra', 'grito', 'conflito', 'briga', 'acolhimento', 'sono', 'fralda', 'machucou'],
    parque: ['parque', 'parcão', 'brinquedo', 'escorregador', 'queda', 'segurança', 'balanço'],
    culinaria: ['culinária', 'fogo', 'faca', 'cozinha', 'receita'],
    licao: ['lição', 'dever', 'tarefa', 'caderno', 'estudo', 'reforço'],
    pontualidade: ['horário', 'atraso', 'saída antecipada', 'ponto', 'falta', 'revezamento'],
  };

  condensedNorms.forEach((norm) => {
    let score = 0;
    const titleNorm = (norm.title || '').toLowerCase();
    const summaryNorm = (norm.summary || '').toLowerCase();
    const tagsNorm = (Array.isArray(norm.tags) ? norm.tags.join(' ') : '').toLowerCase();
    const sectionNorm = (norm.section || '').toLowerCase();

    if (sectionNorm && (text.includes(`seção ${sectionNorm}`) || text.includes(`secao ${sectionNorm}`) || text.includes(`item ${sectionNorm}`))) {
      score += 50;
      matchReason = `Identificada menção direta à Seção ${norm.section}`;
    }

    const words = text.split(/[\s,.;:!?()]+/).filter((w: string) => w.length > 3);
    words.forEach((w: string) => {
      if (titleNorm.includes(w)) score += 8;
      if (tagsNorm.includes(w)) score += 6;
      if (summaryNorm.includes(w)) score += 3;
    });

    Object.entries(keywordsMap).forEach(([theme, terms]) => {
      const textMatchesTheme = terms.some((term) => text.includes(term));
      const normMatchesTheme = terms.some((term) => titleNorm.includes(term) || tagsNorm.includes(term) || summaryNorm.includes(term));
      if (textMatchesTheme && normMatchesTheme) {
        score += 15;
        matchReason = `Alinhamento com o tema "${theme}" (${norm.title})`;
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestNorm = norm;
    }
  });

  return {
    normId: bestNorm?.id || condensedNorms[0]?.id || '',
    reason: matchReason,
    confidence: bestScore >= 20 ? 'high' : bestScore >= 8 ? 'medium' : 'low',
  };
}

// API Route: Gerador de Feedback Cordial por Norma com IA e CNV (Coordenação Pedagógica)
app.post('/api/gemini/generate-cordial-feedback', async (req, res) => {
  try {
    const { userName, normTitle, normSection, rawContext, normDetails, selectedChecklistItem } = req.body;
    if (!userName || !normTitle) {
      return res.status(400).json({
        error: 'Campos obrigatórios ausentes (userName, normTitle).',
      });
    }

    const safeContext = (rawContext || '').trim();
    const safeCheckItem = (selectedChecklistItem || '').trim();
    const { salutation, firstName } = getSalutationForName(userName);
    const sectionLabel = normSection ? ` (Seção ${normSection})` : '';
    const normFullRef = `"${normTitle}"${sectionLabel}`;

    const fallback = buildServerFallbackCordialFeedback(
      userName,
      normTitle,
      safeContext,
      normSection,
      normDetails,
      safeCheckItem
    );

    const ai = getAIClient();
    if (ai) {
      try {
        const prompt = buildGeminiFeedbackSystemPrompt({
          userName,
          normTitle,
          rawContext,
          normSection,
          normDetails,
          selectedChecklistItem: safeCheckItem,
        });

        const response = await ai.models.generateContent({
          model: SOFIA_DEFAULT_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 2500,
          },
        });

        const responseText = response?.text || '';
        let parsed: any = null;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
          parsed = JSON.parse(cleaned);
        }

        if (parsed?.message) {
          const messageText = sanitizeCordialMessageForWhatsApp(parsed.message, {
            userName,
            normTitle,
            rawContext,
            normSection,
          });

          return res.json({
            success: true,
            feedback: {
              message: messageText,
              actionPoints: Array.isArray(parsed?.actionPoints) && parsed.actionPoints.length > 0
                ? parsed.actionPoints
                : fallback.actionPoints,
            },
            isAiGenerated: true,
          });
        }
      } catch (geminiError: any) {
        // Se a cota/crédito foi esgotado (402/429) ou serviço indisponível, ativamos o motor CNV sem erro 500
        console.log('[Feedback CNV] Ativando motor pedagógico CNV integrado (contingência de IA/créditos):', geminiError?.status || 'indisponível');
      }
    }

    // Retorna fallback pedagógico oficial de CNV com HTTP 200
    return res.json({
      success: true,
      feedback: fallback,
      isFallback: true,
      isAiGenerated: false,
      notice: 'Mensagem elaborada via Diretrizes Institucionais e Metodologia CNV.',
    });
  } catch (error: any) {
    const fallback = buildServerFallbackCordialFeedback(
      req.body?.userName || 'Colaboradora',
      req.body?.normTitle || 'Norma Institucional',
      req.body?.rawContext || '',
      req.body?.normSection,
      req.body?.normDetails
    );
    return res.json({
      success: true,
      feedback: fallback,
      isFallback: true,
      isAiGenerated: false,
    });
  }
});

// API Route: Identificação Inteligente da Norma no Texto do Fato (AI Auto-Match)
app.post('/api/gemini/identify-norm', async (req, res) => {
  try {
    const { rawContext, norms } = req.body;
    if (!rawContext) {
      return res.status(400).json({ error: 'Parâmetro rawContext ausente.' });
    }

    const normsList = Array.isArray(norms) ? norms : [];
    const condensedNorms = normsList.map((n: any) => ({
      id: n.id,
      section: n.sectionNumber || '',
      title: n.title,
      module: n.moduleTitle || n.moduleId || '',
      type: n.type || '',
      tags: Array.isArray(n.tags) ? n.tags.slice(0, 5) : [],
      summary: (n.summary || '').slice(0, 140),
    }));

    const heuristicMatch = serverHeuristicMatchNorm(rawContext, condensedNorms);

    const ai = getAIClient();
    if (ai) {
      try {
        const prompt = `Você é o coordenador pedagógico e especialista em conformidade institucional do Colégio Crescer.
Sua tarefa é analisar o relato de um fato ocorrido na rotina escolar e identificar com precisão qual norma institucional do Manual de Orientações se aplica diretamente à situação.

Relato do Fato Ocorrido:
"${rawContext}"

Catálogo de Normas Disponíveis no Manual:
${JSON.stringify(condensedNorms, null, 2)}

Critérios de Seleção:
1. Identifique a norma mais relevante e específica para o fato (ex: se fala de celular/redes sociais, selecione a norma de celular; se fala de transporte/academia/rampa/portaria, selecione a norma correspondente; se fala de vestuário/uniforme, selecione vestuário; se fala de mordida/choro/mediação sensível, selecione a norma correspondente).
2. Se nenhuma for 100% exata, selecione a mais próxima pelo princípio do cuidado e segurança das crianças.

Responda estritamente em formato JSON:
{
  "normId": "id_da_norma_selecionada",
  "reason": "Explicação concisa (1 linha) de por que esta norma foi selecionada",
  "confidence": "high" | "medium" | "low"
}`;

        const response = await ai.models.generateContent({
          model: SOFIA_DEFAULT_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 600,
          },
        });

        const responseText = response?.text || '';
        let parsed: any = null;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
          parsed = JSON.parse(cleaned);
        }

        if (parsed?.normId) {
          const exists = condensedNorms.some((n: any) => n.id === parsed.normId);
          if (exists) {
            return res.json({
              success: true,
              normId: parsed.normId,
              reason: parsed?.reason || 'Identificado por inteligência contextual',
              confidence: parsed?.confidence || 'high',
              isAiIdentified: true,
            });
          }
        }
      } catch (geminiError: any) {
        console.log('[Identify Norm] Ativando heurística semântica integrada (contingência de IA/créditos):', geminiError?.status || 'indisponível');
      }
    }

    return res.json({
      success: true,
      normId: heuristicMatch.normId,
      reason: heuristicMatch.reason,
      confidence: heuristicMatch.confidence,
      isFallback: true,
      isAiIdentified: false,
    });
  } catch (error: any) {
    return res.json({
      success: true,
      normId: '',
      reason: 'Norma institucional',
      confidence: 'low',
      isFallback: true,
    });
  }
});

// Normaliza histórico de mensagens do app (últimos 20 turnos) para Content[] do Gemini, preservando turnos de ferramentas
function buildGeminiContentsFromHistory(
  history: any[],
  currentMessage: string,
  pendingToolTurns: any[] = []
): Content[] {
  const contents: Content[] = [];
  const recentHistory = Array.isArray(history)
    ? history.filter((h) => h && h.id !== 'welcome').slice(-20)
    : [];

  for (const h of recentHistory) {
    if (h.sender === 'user') {
      if (typeof h.text === 'string' && h.text.trim()) {
        contents.push({
          role: 'user',
          parts: [{ text: h.text }],
        });
      }
      continue;
    }

    if (h.sender === 'sofia') {
      if (Array.isArray(h.toolTurns) && h.toolTurns.length > 0) {
        for (const step of h.toolTurns) {
          if (step?.rawModelContent && Array.isArray(step.rawModelContent.parts) && step.rawModelContent.parts.length > 0) {
            contents.push(step.rawModelContent);
          } else if (Array.isArray(step?.calls) && step.calls.length > 0) {
            contents.push({
              role: 'model',
              parts: step.calls.map((c: any) => ({
                functionCall: {
                  ...(c.id ? { id: c.id } : {}),
                  name: c.name,
                  args: c.args || {},
                },
              })),
            });
          }

          if (Array.isArray(step?.results) && step.results.length > 0) {
            contents.push({
              role: 'user',
              parts: step.results.map((r: any) => ({
                functionResponse: {
                  ...(r.id ? { id: r.id } : {}),
                  name: r.name,
                  response: { result: r.response },
                },
              })),
            });
          }
        }
      }

      if (typeof h.text === 'string' && h.text.trim()) {
        contents.push({
          role: 'model',
          parts: [{ text: h.text }],
        });
      }
    }
  }

  // Gemini exige que o histórico comece no papel 'user'
  while (contents.length > 0 && contents[0].role !== 'user') {
    contents.shift();
  }

  if (typeof currentMessage === 'string' && currentMessage.trim()) {
    contents.push({
      role: 'user',
      parts: [{ text: currentMessage }],
    });
  }

  // Turnos ativos de execução de ferramentas do pedido atual (até 4 chamadas em sequência)
  if (Array.isArray(pendingToolTurns) && pendingToolTurns.length > 0) {
    for (const step of pendingToolTurns) {
      if (step?.rawModelContent && Array.isArray(step.rawModelContent.parts) && step.rawModelContent.parts.length > 0) {
        contents.push(step.rawModelContent);
      } else if (Array.isArray(step?.calls) && step.calls.length > 0) {
        contents.push({
          role: 'model',
          parts: step.calls.map((c: any) => ({
            functionCall: {
              ...(c.id ? { id: c.id } : {}),
              name: c.name,
              args: c.args || {},
            },
          })),
        });
      }

      if (Array.isArray(step?.results) && step.results.length > 0) {
        contents.push({
          role: 'user',
          parts: step.results.map((r: any) => ({
            functionResponse: {
              ...(r.id ? { id: r.id } : {}),
              name: r.name,
              response: { result: r.response },
            },
          })),
        });
      }
    }
  }

  return contents;
}

// API Route: Agente Autônomo e Resolutivo Sofia (Function Calling real em modo AUTO + functionResponse)
app.post('/api/sofia/chat', async (req, res) => {
  try {
    const {
      message,
      history = [],
      pendingToolTurns = [],
      appState,
      antiRepetitionNote,
      forceFinalAnswer = false,
    } = req.body;

    const verifiedSession = (req as any).verifiedAdminSession as VerifiedSessionPayload;
    const verifiedAppState = appState
      ? {
          ...appState,
          currentUser: {
            ...(appState.currentUser || {}),
            email: verifiedSession.email,
            isAdmin: true,
            role: 'coordenador',
          },
        }
      : appState;

    let systemInstruction = buildSofiaChatSystemInstruction(verifiedAppState);
    if (antiRepetitionNote && typeof antiRepetitionNote === 'string') {
      systemInstruction += `\n\n[INSTRUÇÃO CRÍTICA DE CONTINUIDADE]: ${antiRepetitionNote}`;
    }

    const ai = getAIClient();
    if (!ai) {
      console.error('[Sofia Chat API] GEMINI_API_KEY ausente ou cliente Gemini não inicializado.');
      return res.status(503).json({
        success: false,
        errorCode: 'AI_NOT_CONFIGURED',
        error: 'Serviço de IA não configurado no servidor.',
      });
    }

    const contentsPayload = buildGeminiContentsFromHistory(history, message, pendingToolTurns);
    const functionCallingMode = forceFinalAnswer
      ? FunctionCallingConfigMode.NONE
      : FunctionCallingConfigMode.AUTO;

    const baseConfig: any = {
      systemInstruction,
      temperature: SOFIA_DEFAULT_TEMPERATURE,
      tools: [{ functionDeclarations: SOFIA_FUNCTION_DECLARATIONS as any }],
      toolConfig: {
        functionCallingConfig: {
          mode: functionCallingMode,
        },
      },
    };

    const callGeminiWithModel = async (modelName: string) => {
      try {
        return await ai.models.generateContent({
          model: modelName,
          contents: contentsPayload,
          config: baseConfig,
        });
      } catch (err: any) {
        const msg = String(err?.message || err || '').toLowerCase();
        if (msg.includes('temperature') && (msg.includes('400') || msg.includes('invalid') || msg.includes('unsupported'))) {
          console.warn(`[Sofia Chat API] Modelo ${modelName} rejeitou temperature; repetindo chamada sem temperature.`);
          const { temperature: _removed, ...fallbackConfig } = baseConfig;
          return await ai.models.generateContent({
            model: modelName,
            contents: contentsPayload,
            config: fallbackConfig,
          });
        }
        throw err;
      }
    };

    let response: any;
    let usedModel: string = SOFIA_DEFAULT_MODEL;
    let usedFallback = false;

    try {
      response = await callGeminiWithModel(SOFIA_DEFAULT_MODEL);
    } catch (primaryErr: any) {
      const classifiedPrimary = classifyGeminiError(primaryErr, SOFIA_DEFAULT_MODEL);
      const shouldTryFallback =
        !classifiedPrimary.isBillingDepleted &&
        (classifiedPrimary.statusCode === 404 ||
          classifiedPrimary.statusCode === 503 ||
          classifiedPrimary.statusCode === 429) &&
        Boolean(SOFIA_FALLBACK_MODEL) &&
        String(SOFIA_FALLBACK_MODEL) !== String(SOFIA_DEFAULT_MODEL);

      if (!shouldTryFallback) {
        (primaryErr as any).__failedModel = SOFIA_DEFAULT_MODEL;
        (primaryErr as any).__fallbackAttempted = false;
        throw primaryErr;
      }

      console.warn(
        `[Sofia Chat API] Modelo principal (${SOFIA_DEFAULT_MODEL}) falhou com ${classifiedPrimary.statusCode}; tentando fallback único (${SOFIA_FALLBACK_MODEL}).`
      );
      usedModel = SOFIA_FALLBACK_MODEL;
      usedFallback = true;

      try {
        response = await callGeminiWithModel(SOFIA_FALLBACK_MODEL);
      } catch (fallbackErr: any) {
        (fallbackErr as any).__failedModel = SOFIA_FALLBACK_MODEL;
        (fallbackErr as any).__fallbackAttempted = true;
        throw fallbackErr;
      }
    }

    currentSofiaLastModelUsed = usedModel;
    currentSofiaLastFallbackUsed = usedFallback;
    currentSofiaLastError = null;

    if (currentSofiaAdminAlert) {
      currentSofiaAdminAlert = null;
      writeSofiaAdminAlertToDisk(null);
    }

    console.info(
      `[Sofia Chat API] Pedido respondido pelo modelo: ${usedModel} (fallback=${usedFallback ? 'sim' : 'nao'}, modo=${forceFinalAnswer ? 'NONE' : 'AUTO'})`
    );

    if (!forceFinalAnswer && response.functionCalls && response.functionCalls.length > 0) {
      const toolCalls = response.functionCalls.map((call: any) => ({
        id: call.id,
        name: call.name,
        args: call.args || {},
      }));
      const rawModelContent = response.candidates?.[0]?.content || {
        role: 'model',
        parts: toolCalls.map((call: any) => ({
          functionCall: {
            ...(call.id ? { id: call.id } : {}),
            name: call.name,
            args: call.args || {},
          },
        })),
      };

      return res.json({
        success: true,
        model: usedModel,
        fallbackUsed: usedFallback,
        hasFunctionCall: true,
        toolCalls,
        rawModelContent,
      });
    }

    return res.json({
      success: true,
      model: usedModel,
      fallbackUsed: usedFallback,
      hasFunctionCall: false,
      text: (response.text || '').trim(),
    });
  } catch (error: any) {
    const failedModel = error?.__failedModel || SOFIA_DEFAULT_MODEL;
    const fallbackAttempted = Boolean(error?.__fallbackAttempted);
    console.error(`[Sofia Chat API] Erro ao processar conversa (modelo=${failedModel}, fallbackAttempted=${fallbackAttempted}):`, error);
    const classified = classifyGeminiError(error, failedModel);
    const errorMessage = error?.message || 'Erro interno ao processar conversa com a Sofia.';

    currentSofiaLastModelUsed = failedModel;
    currentSofiaLastFallbackUsed = fallbackAttempted;
    currentSofiaLastError = {
      code: classified.statusCode,
      message: errorMessage.slice(0, 260),
      model: failedModel,
      detectedAt: new Date().toISOString(),
    };

    if (classified.adminAlert) {
      currentSofiaAdminAlert = classified.adminAlert;
      writeSofiaAdminAlertToDisk(classified.adminAlert);
    }

    return res.status(classified.statusCode).json({
      success: false,
      model: failedModel,
      fallbackAttempted,
      quotaDepleted: classified.isBillingDepleted,
      rateLimited: classified.isRateLimit,
      modelNotFound: classified.isModelNotFound,
      serviceUnavailable: classified.isServiceUnavailable,
      adminAlert: classified.adminAlert,
      error: errorMessage,
    });
  }
});

// API Route: Agente de Voz Sofia — Restrito exclusivamente à Administração
app.post('/api/gemini/voice-agent', requireAdminSession, async (req, res) => {
  try {
    const { prompt, context } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Comando não fornecido.' });
    }

    const ai = getAIClient();
    if (ai && Date.now() >= geminiBillingCooldownUntil) {
      try {
        const systemInstruction = buildSofiaSystemPrompt(context);

        // Manipulador de Timeout resiliente ajustado para 20 segundos
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), 20000);
        });

        // Montagem do payload multi-modal (suporte a áudio otimizado e texto)
        const contentsPayload: any[] = [];
        if (req.body.audioBase64) {
          contentsPayload.push({
            inlineData: {
              mimeType: req.body.mimeType || 'audio/webm',
              data: req.body.audioBase64,
            },
          });
        }
        contentsPayload.push(`Pedido: "${prompt}". Contexto: Data ${context?.selectedDate || 'hoje'}, Turma: ${context?.selectedTurma || 'todas'}, Pessoa: ${context?.userName || 'equipe'} (${context?.userCargoLabel || context?.userRole || 'Integral'}).`);

        const geminiCall = ai.models.generateContent({
          model: SOFIA_DEFAULT_MODEL,
          contents: contentsPayload,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        });

        const response: any = await Promise.race([geminiCall, timeoutPromise]);

        const responseText = response.text || '';
        let parsed: any = null;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
          parsed = JSON.parse(cleaned);
        }

        if (parsed?.spokenText) {
          const functionCall = parsed.functionCall || (parsed.action ? { name: parsed.action.type, args: parsed.action.args } : undefined);
          return res.json({
            success: true,
            spokenText: parsed.spokenText,
            displayText: parsed.displayText || parsed.spokenText,
            action: parsed.action,
            functionCall,
            isAiGenerated: true,
          });
        }
      } catch (geminiError: any) {
        const errorMsg = geminiError?.message || String(geminiError || '');
        const { isBillingDepleted, isRateLimit } = isGeminiQuotaOrBillingError(geminiError);
        const isTimeout = errorMsg.includes('TIMEOUT_EXCEEDED');

        if (isBillingDepleted) {
          geminiBillingCooldownUntil = Date.now() + 5 * 60 * 1000;
          console.info('[Sofia Voice] Créditos de IA indisponíveis; utilizando consulta local.');
        } else {
          console.info(`[Sofia Voice] ${isRateLimit ? 'Limite temporário' : isTimeout ? 'Tempo excedido' : 'Fallback local'} ativado.`);
        }

        return res.json({
          success: true,
          status: 'FALLBACK',
          spokenText: 'Tive um probleminha de conexão com a IA agora, mas continuo por aqui consultando os dados do aplicativo.',
          functionCall: null,
          isFallback: true,
          isQuotaOrTimeout: true,
          quotaDepleted: isBillingDepleted,
        });
      }
    }

    // Heurística local de contingência do servidor
    const lower = prompt.toLowerCase();
    let functionCall: any = null;
    let spokenText = 'Pronto!';

    if (lower.includes('presenca') || lower.includes('chamada') || lower.includes('falta') || lower.includes('pendencia')) {
      functionCall = {
        name: 'consultar_ou_lancar_chamada',
        args: {
          acao: lower.includes('presenca') ? 'lancar_presenca' : lower.includes('falta') ? 'lancar_falta' : 'consultar_pendencias',
        },
      };
      spokenText = 'Tô vendo a chamada aqui pra você.';
    } else if (lower.includes('norma') || lower.includes('manual') || lower.includes('regra') || lower.includes('celular') || lower.includes('radio') || lower.includes('alergia')) {
      functionCall = {
        name: 'consultar_manual_normas',
        args: { termoOuTema: prompt },
      };
      spokenText = 'Deixa eu conferir isso no Manual pra você.';
    } else if (lower.includes('cardapio') || lower.includes('almoco') || lower.includes('lanche') || lower.includes('semanario')) {
      functionCall = {
        name: 'consultar_cardapio_ou_semanario',
        args: { tipo: lower.includes('lanche') ? 'cardapio_lanche' : lower.includes('semanario') ? 'roteiro_semanario' : 'cardapio_almoco' },
      };
      spokenText = 'Tô checando o cardápio e a programação aqui.';
    } else {
      spokenText = 'Oi! Sou a Sofia, aqui do Integral. Como posso te ajudar agora?';
    }

    return res.json({
      success: true,
      spokenText,
      functionCall,
      isFallback: true,
    });
  } catch {
    return res.json({
      success: true,
      spokenText: 'Tive um probleminha agora. Pode tentar de novo em instantes?',
      isFallback: true,
    });
  }
});

// Vite Middleware setup for dev vs production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      optimizeDeps: { force: true },
    });
    app.use(vite.middlewares);

    // Dev fallback for SPA navigation and client routes
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
