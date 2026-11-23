/**
 * sofiaSecurityService.ts
 * Camada de Segurança da Sofia (uso exclusivo do Administrador / Coordenação),
 * Confirmação explícita para ações de alto impacto, Auditoria de escrita e Alertas persistentes da IA.
 */

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db, saveUserNotificationToFirestore } from '../firebase';
import {
  SofiaAdminAiAlert,
  SofiaAgentToolName,
  SofiaAuditLogEntry,
  SofiaAuditOutcome,
  SofiaSecurityProfile,
  SofiaToolPermissionRule,
  UserNotification,
  UserProfile,
} from '../types';
import { isAdmin } from '../utils/authUtils';

export const SOFIA_ADMIN_ALERT_STORAGE_KEY = 'crescer_sofia_admin_ai_alert_v1';
export const SOFIA_ADMIN_ALERT_EVENT = 'crescer-sofia-admin-alert-updated';
export const SOFIA_AUDIT_LOGS_STORAGE_KEY = 'crescer_sofia_audit_logs_v1';
export const SOFIA_AUDIT_LOGS_EVENT = 'crescer-sofia-audit-updated';
export const USER_NOTIFICATIONS_UPDATED_EVENT = 'crescer-user-notifications-updated';
const SOFIA_ALERT_NOTIF_DEDUP_KEY = 'crescer_sofia_alert_notif_dedup_v1';

let inMemoryAuditLogs: SofiaAuditLogEntry[] = [];

/**
 * Resolve o perfil de segurança efetivo para a Sofia:
 * apenas administradores ('coordenador') têm acesso; qualquer outro usuário cai em 'nao_admin' ou 'desconhecido' (negação total).
 */
export function resolveSofiaSecurityProfile(user?: UserProfile | null): SofiaSecurityProfile {
  if (!user) return 'desconhecido';
  if (isAdmin(user)) return 'coordenador';
  return 'nao_admin';
}

/**
 * Ferramentas com efeitos grandes que exigem confirmação explícita (`confirmado: true`)
 * antes de gravar ou enviar mensagens.
 */
export const CONFIRMATION_REQUIRED_TOOLS = new Set<SofiaAgentToolName>([
  'cadastrarUsuario',
  'editarAluno',
  'alterarAnoLetivoAluno',
  'dispararAlertaWhatsApp',
  'registrarFaltaFrequencia',
  'lancarFrequenciaTurma',
]);

export function requiresConfirmation(toolName: SofiaAgentToolName): boolean {
  return CONFIRMATION_REQUIRED_TOOLS.has(toolName);
}

export interface PermissionCheckResult {
  allowed: boolean;
  profile: SofiaSecurityProfile;
  rule: SofiaToolPermissionRule;
  motivo?: 'sem_permissao';
  reason?: string;
}

/**
 * Segunda barreira em código dentro de executeSofiaTool:
 * valida estritamente se o solicitante é administrador (padrão de negação).
 */
export function checkSofiaToolPermission(params: {
  toolName: SofiaAgentToolName;
  args?: Record<string, any>;
  currentUser?: UserProfile | null;
}): PermissionCheckResult {
  const { currentUser } = params;
  const profile = resolveSofiaSecurityProfile(currentUser);

  if (profile !== 'coordenador' || !isAdmin(currentUser)) {
    return {
      allowed: false,
      profile,
      rule: 'deny',
      motivo: 'sem_permissao',
      reason: 'Acesso negado.',
    };
  }

  return {
    allowed: true,
    profile: 'coordenador',
    rule: 'allow',
  };
}

// ===========================================================================
// LOG DE AUDITORIA DE ESCRITA / NEGAÇÕES
// ===========================================================================

function sanitizeArgsForAudit(args: Record<string, any> = {}): Record<string, any> {
  const blockedKeys = new Set(['pin', 'password', 'senha', 'token', 'secret', 'apiKey']);
  const summary: Record<string, any> = {};

  Object.entries(args || {}).forEach(([key, val]) => {
    if (blockedKeys.has(key.toLowerCase())) {
      summary[key] = '***';
      return;
    }
    if (Array.isArray(val)) {
      summary[key] = val.length > 8 ? `[${val.length} itens]` : val;
    } else if (val && typeof val === 'object') {
      const nested: Record<string, any> = {};
      Object.entries(val).forEach(([nk, nv]) => {
        nested[nk] = blockedKeys.has(nk.toLowerCase()) ? '***' : nv;
      });
      summary[key] = nested;
    } else {
      summary[key] = typeof val === 'string' && val.length > 160 ? `${val.slice(0, 157)}...` : val;
    }
  });

  return summary;
}

function formatDateTimeSaoPaulo(date: Date): string {
  try {
    return date.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return date.toISOString();
  }
}

export function loadLocalSofiaAuditLogs(): SofiaAuditLogEntry[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(SOFIA_AUDIT_LOGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          inMemoryAuditLogs = parsed;
          return parsed;
        }
      }
    }
  } catch {
    // fallback em memória
  }
  return [...inMemoryAuditLogs];
}

export function clearLocalSofiaAuditLogsForTest(): void {
  inMemoryAuditLogs = [];
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SOFIA_AUDIT_LOGS_STORAGE_KEY);
    }
  } catch {}
}

export async function recordSofiaAuditLog(params: {
  toolName: SofiaAgentToolName;
  args?: Record<string, any>;
  currentUser?: UserProfile | null;
  outcome: SofiaAuditOutcome;
  detail?: string;
}): Promise<SofiaAuditLogEntry> {
  const now = new Date();
  const entry: SofiaAuditLogEntry = {
    id: `sofia_audit_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: params.currentUser?.uid || params.currentUser?.id || 'anonimo',
    userName: params.currentUser?.name || 'Usuário não identificado',
    userRole: params.currentUser?.cargoLabel || params.currentUser?.role || 'desconhecido',
    userProfile: resolveSofiaSecurityProfile(params.currentUser),
    toolName: params.toolName,
    argsSummary: sanitizeArgsForAudit(params.args || {}),
    timestamp: now.toISOString(),
    formattedDateTime: formatDateTimeSaoPaulo(now),
    outcome: params.outcome,
    detail: params.detail,
  };

  inMemoryAuditLogs = [entry, ...inMemoryAuditLogs].slice(0, 200);
  try {
    if (typeof localStorage !== 'undefined') {
      const existing = loadLocalSofiaAuditLogs();
      const merged = [entry, ...existing.filter((e) => e.id !== entry.id)].slice(0, 200);
      inMemoryAuditLogs = merged;
      localStorage.setItem(SOFIA_AUDIT_LOGS_STORAGE_KEY, JSON.stringify(merged));
    }
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SOFIA_AUDIT_LOGS_EVENT, { detail: entry }));
    }
  } catch {}

  try {
    const docRef = doc(db, 'sofia_audit_logs', entry.id);
    await setDoc(docRef, entry);
  } catch {
    // Auditoria nunca deve quebrar o fluxo nem falhar em ambiente offline/testes
  }

  return entry;
}

export function subscribeSofiaAuditLogs(
  onData: (logs: SofiaAuditLogEntry[]) => void
): () => void {
  onData(loadLocalSofiaAuditLogs());

  let unsubFirestore: (() => void) | null = null;
  try {
    const colRef = collection(db, 'sofia_audit_logs');
    const q = query(colRef, orderBy('timestamp', 'desc'), limit(100));
    unsubFirestore = onSnapshot(
      q,
      (snap) => {
        const remoteList: SofiaAuditLogEntry[] = [];
        snap.forEach((d) => {
          const item = d.data() as SofiaAuditLogEntry;
          if (item && item.id) remoteList.push(item);
        });
        const localList = loadLocalSofiaAuditLogs();
        const byId = new Map<string, SofiaAuditLogEntry>();
        [...remoteList, ...localList].forEach((item) => {
          if (item && item.id && !byId.has(item.id)) byId.set(item.id, item);
        });
        const merged = Array.from(byId.values())
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 150);
        inMemoryAuditLogs = merged;
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(SOFIA_AUDIT_LOGS_STORAGE_KEY, JSON.stringify(merged));
          }
        } catch {}
        onData(merged);
      },
      () => {
        onData(loadLocalSofiaAuditLogs());
      }
    );
  } catch {
    onData(loadLocalSofiaAuditLogs());
  }

  const handleLocalAuditEvent = () => {
    onData(loadLocalSofiaAuditLogs());
  };

  if (typeof window !== 'undefined') {
    window.addEventListener(SOFIA_AUDIT_LOGS_EVENT, handleLocalAuditEvent);
  }

  return () => {
    if (unsubFirestore) {
      try { unsubFirestore(); } catch {}
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener(SOFIA_AUDIT_LOGS_EVENT, handleLocalAuditEvent);
    }
  };
}

// ===========================================================================
// ALERTA PERSISTENTE DE IA (402 / 429 / 404) + NOTIFICAÇÃO NO SINO DO APP
// ===========================================================================

export function getStoredSofiaAdminAlert(): SofiaAdminAiAlert | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SOFIA_ADMIN_ALERT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.active ? (parsed as SofiaAdminAiAlert) : null;
  } catch {
    return null;
  }
}

export function saveSofiaAdminAlert(alert: SofiaAdminAiAlert): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SOFIA_ADMIN_ALERT_STORAGE_KEY, JSON.stringify(alert));
    }
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SOFIA_ADMIN_ALERT_EVENT, { detail: alert }));
    }
  } catch {}
}

export function clearStoredSofiaAdminAlert(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SOFIA_ADMIN_ALERT_STORAGE_KEY);
    }
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SOFIA_ADMIN_ALERT_EVENT, { detail: null }));
    }
  } catch {}
}

function shouldCreateAiNotificationForCode(code: number): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    const raw = localStorage.getItem(SOFIA_ALERT_NOTIF_DEDUP_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    const sameCode = Number(parsed?.code) === Number(code);
    const elapsedMs = Date.now() - Number(parsed?.timestamp || 0);
    // Evita flood se houver múltiplas tentativas consecutivas dentro de 10 minutos
    if (sameCode && elapsedMs >= 0 && elapsedMs < 10 * 60 * 1000) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

function markAiNotificationCreated(code: number): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        SOFIA_ALERT_NOTIF_DEDUP_KEY,
        JSON.stringify({ code, timestamp: Date.now() })
      );
    }
  } catch {}
}

export async function persistSofiaAdminAlertToDbAndNotify(
  alert: SofiaAdminAiAlert,
  usersList?: UserProfile[]
): Promise<UserNotification[]> {
  saveSofiaAdminAlert(alert);

  // 1. Grava registro persistente em sofia_ai_alerts (current + histórico do evento)
  try {
    const currentRef = doc(db, 'sofia_ai_alerts', 'current');
    await setDoc(currentRef, { id: 'current', ...alert }, { merge: true });

    const historyId = `evt_${alert.code}_${Date.now()}`;
    const historyRef = doc(db, 'sofia_ai_alerts', historyId);
    await setDoc(historyRef, { id: historyId, ...alert });
  } catch {
    // Segue para notificação local mesmo se Firestore falhar
  }

  if (!shouldCreateAiNotificationForCode(alert.code)) {
    return [];
  }
  markAiNotificationCreated(alert.code);

  // 2. Identifica todos os coordenadores/administradores para notificar no sino interno (user_notifications)
  const coordTargets = new Map<string, { uid: string; name: string }>();
  (usersList || []).forEach((u) => {
    if (u && isAdmin(u)) {
      const uid = u.uid || u.id;
      if (uid) coordTargets.set(uid, { uid, name: u.name || 'Coordenação' });
    }
  });
  if (coordTargets.size === 0) {
    coordTargets.set('usr_coord_1', { uid: 'usr_coord_1', name: 'Coordenação' });
  }

  const createdNotifications: UserNotification[] = [];
  const nowISO = new Date().toISOString();

  for (const target of coordTargets.values()) {
    const notif: UserNotification = {
      id: `notif_ia_${alert.code}_${target.uid}_${Date.now()}`,
      userId: target.uid,
      userName: target.name,
      title: `Assistente Sofia indisponível (Erro ${alert.code})`,
      message: `${alert.message}. Enquanto isso, a equipe vê apenas um aviso discreto sem termos técnicos.`,
      priority: 'alta',
      type: 'ia_alerta',
      actionUrl: alert.actionUrl,
      read: false,
      status: 'UNREAD',
      createdAt: nowISO,
      createdBy: 'Sistema Sofia',
    };

    createdNotifications.push(notif);

    // Atualiza cache local imediato do usuário para o sino/banner responderem na hora
    try {
      if (typeof localStorage !== 'undefined') {
        const storageKey = `crescer_notifs_${target.uid}`;
        const raw = localStorage.getItem(storageKey);
        const existing: UserNotification[] = raw ? JSON.parse(raw) : [];
        const updated = [notif, ...existing.filter((n) => n.id !== notif.id)].slice(0, 30);
        localStorage.setItem(storageKey, JSON.stringify(updated));
      }
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(USER_NOTIFICATIONS_UPDATED_EVENT, {
            detail: { userId: target.uid, notification: notif },
          })
        );
      }
    } catch {}

    try {
      await saveUserNotificationToFirestore(notif);
    } catch {
      // Cache local já foi gravado
    }
  }

  return createdNotifications;
}

export async function resolvePersistentSofiaAdminAlert(): Promise<void> {
  clearStoredSofiaAdminAlert();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SOFIA_ALERT_NOTIF_DEDUP_KEY);
    }
  } catch {}
  try {
    const currentRef = doc(db, 'sofia_ai_alerts', 'current');
    await setDoc(
      currentRef,
      {
        id: 'current',
        active: false,
        resolvedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch {}
}

export function subscribeSofiaPersistentAdminAlert(
  onData: (alert: SofiaAdminAiAlert | null) => void
): () => void {
  try {
    const currentRef = doc(db, 'sofia_ai_alerts', 'current');
    return onSnapshot(
      currentRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as SofiaAdminAiAlert;
        if (data?.active) {
          saveSofiaAdminAlert(data);
          onData(data);
        } else {
          clearStoredSofiaAdminAlert();
          onData(null);
        }
      },
      () => {
        // Silencioso; mantém cache local/servidor
      }
    );
  } catch {
    return () => {};
  }
}
