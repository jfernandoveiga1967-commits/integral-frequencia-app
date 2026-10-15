import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { getClientIpAddress } from './manualProgressService';

export type FeedbackStatus = 'PENDING' | 'ACKNOWLEDGED';

export interface PedagogicalFeedback {
  id: string;
  // Identificadores de usuário / colaborador
  targetUserId: string;
  employee_id: string; // Obrigatório pelo sistema
  user_id: string;     // Obrigatório pelo sistema
  targetUserName: string;
  targetUserEmail?: string;
  targetUserPhone?: string;
  // Norma e texto gerado pela IA
  normId: string;
  normTitle: string;
  normSection?: string;
  rawContext: string;
  generatedMessage: string;
  // Itens do checklist de ciência da monitora
  actionPoints: string[];
  checklistItems?: { text: string; checked: boolean }[];
  // Status e auditoria
  status: FeedbackStatus;
  displayStatus?: string; // '🔴 PENDENTE DE ASSINATURA' | '🟢 CIENTE E ASSINADO'
  createdByUserId: string;
  createdByUserName: string;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedFormatted?: string; // "DD/MM/AAAA às HH:mm"
  acknowledgedIp?: string;
  acknowledgedUserAgent?: string;
  whatsappSentAt?: string;
}

const PRIMARY_COLLECTION = 'feedbacks_pedagogicos';
const BACKUP_COLLECTION = 'pedagogical_feedbacks';
const LOCAL_STORAGE_KEY = 'crescer_pedagogical_feedbacks_cache';

/**
 * Formata data e hora para o padrão brasileiro (DD/MM/AAAA às HH:mm)
 */
export function formatFeedbackDateTimeBR(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} às ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}

/**
 * Salva um novo feedback pedagógico cordial no Firestore na coleção 'feedbacks_pedagogicos'
 */
export async function createPedagogicalFeedback(
  data: Omit<PedagogicalFeedback, 'id' | 'status' | 'createdAt' | 'displayStatus'> & {
    id?: string;
    employee_id?: string;
    user_id?: string;
  }
): Promise<PedagogicalFeedback> {
  const id = data.id || `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  const employeeId = data.employee_id || data.user_id || data.targetUserId || '';
  const userId = data.user_id || data.employee_id || data.targetUserId || '';
  const targetUserId = data.targetUserId || employeeId || userId;

  const feedback: PedagogicalFeedback = {
    ...data,
    id,
    employee_id: employeeId,
    user_id: userId,
    targetUserId,
    status: 'PENDING',
    displayStatus: '🔴 PENDENTE DE ASSINATURA',
    createdAt: nowIso,
  };

  try {
    const docRef = doc(db, PRIMARY_COLLECTION, id);
    await setDoc(docRef, feedback);
  } catch (err) {
    console.warn('[feedbackService] Erro ao salvar em feedbacks_pedagogicos, tentando fallback:', err);
    try {
      const backupRef = doc(db, BACKUP_COLLECTION, id);
      await setDoc(backupRef, feedback);
    } catch (backupErr) {
      console.warn('[feedbackService] Falha também no backup, mantendo cache:', backupErr);
    }
  }

  // Atualiza cache local
  try {
    const cachedRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const cached: PedagogicalFeedback[] = cachedRaw ? JSON.parse(cachedRaw) : [];
    const updated = [feedback, ...cached.filter((f) => f.id !== id)];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch {}

  // Dispara evento local para notificação imediata
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('app_pedagogical_feedback_created', { detail: feedback })
    );
  }

  return feedback;
}

/**
 * Escuta feedbacks pendentes para um usuário específico (monitora logada)
 */
export function subscribePendingFeedbacksForUser(
  userId: string,
  userEmail?: string,
  onData?: (feedbacks: PedagogicalFeedback[]) => void,
  onError?: (err: any) => void
): () => void {
  if (!userId && !userEmail) {
    onData?.([]);
    return () => {};
  }

  const cleanUserId = userId.trim();
  const cleanEmail = (userEmail || '').trim().toLowerCase();

  // Leitura inicial rápida do cache local
  try {
    const cachedRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cachedRaw) {
      const all: PedagogicalFeedback[] = JSON.parse(cachedRaw);
      const userPending = all.filter((f) => {
        const matchUser =
          f.targetUserId === cleanUserId ||
          f.employee_id === cleanUserId ||
          f.user_id === cleanUserId ||
          (cleanEmail && f.targetUserEmail?.toLowerCase() === cleanEmail);
        return matchUser && f.status === 'PENDING';
      });
      if (userPending.length > 0) {
        onData?.(userPending);
      }
    }
  } catch {}

  const colRef = collection(db, PRIMARY_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: PedagogicalFeedback[] = [];
      snapshot.forEach((snap) => {
        const item = snap.data() as PedagogicalFeedback;
        const matchUser =
          item.targetUserId === cleanUserId ||
          item.employee_id === cleanUserId ||
          item.user_id === cleanUserId ||
          (cleanEmail && item.targetUserEmail?.toLowerCase() === cleanEmail);
        if (matchUser && item.status === 'PENDING') {
          list.push(item);
        }
      });

      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData?.(list);
    },
    (err) => {
      console.warn(`[feedbackService] Erro ao escutar feedbacks pendentes para ${userId}:`, err);
      onError?.(err);
    }
  );
}

/**
 * Escuta TODOS os feedbacks de uma colaboradora (Pendentes e Assinados) para a aba "Meus Feedbacks e Orientações"
 */
export function subscribeAllFeedbacksForUser(
  userId: string,
  userEmail?: string,
  userName?: string,
  onData?: (feedbacks: PedagogicalFeedback[]) => void,
  onError?: (err: any) => void
): () => void {
  const cleanUserId = (userId || '').trim();
  const cleanEmail = (userEmail || '').trim().toLowerCase();
  const cleanName = (userName || '').trim().toLowerCase();

  // Leitura inicial do cache local
  try {
    const cachedRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cachedRaw) {
      const all: PedagogicalFeedback[] = JSON.parse(cachedRaw);
      const userFeedbacks = all.filter((f) => {
        return (
          f.targetUserId === cleanUserId ||
          f.employee_id === cleanUserId ||
          f.user_id === cleanUserId ||
          (cleanEmail && f.targetUserEmail?.toLowerCase() === cleanEmail) ||
          (cleanName && f.targetUserName?.toLowerCase().includes(cleanName))
        );
      });
      userFeedbacks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData?.(userFeedbacks);
    }
  } catch {}

  const colRef = collection(db, PRIMARY_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: PedagogicalFeedback[] = [];
      snapshot.forEach((snap) => {
        const item = snap.data() as PedagogicalFeedback;
        const match =
          item.targetUserId === cleanUserId ||
          item.employee_id === cleanUserId ||
          item.user_id === cleanUserId ||
          (cleanEmail && item.targetUserEmail?.toLowerCase() === cleanEmail) ||
          (cleanName && item.targetUserName?.toLowerCase().includes(cleanName));
        if (match) {
          list.push(item);
        }
      });

      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData?.(list);
    },
    (err) => {
      console.warn(`[feedbackService] Erro ao escutar histórico da usuária ${userId}:`, err);
      onError?.(err);
    }
  );
}

/**
 * Escuta todos os feedbacks para gestão da coordenação em tempo real
 */
export function subscribeAllPedagogicalFeedbacks(
  onData: (feedbacks: PedagogicalFeedback[]) => void,
  onError?: (err: any) => void
): () => void {
  // Leitura do cache local
  try {
    const cachedRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cachedRaw) {
      onData(JSON.parse(cachedRaw));
    }
  } catch {}

  const colRef = collection(db, PRIMARY_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: PedagogicalFeedback[] = [];
      snapshot.forEach((snap) => {
        list.push(snap.data() as PedagogicalFeedback);
      });

      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
      } catch {}

      onData(list);
    },
    (err) => {
      console.warn('[feedbackService] Erro ao escutar todos feedbacks:', err);
      onError?.(err);
    }
  );
}

/**
 * Registra a ciência e assinatura digital obrigatória do feedback pedagógico pela monitora
 */
export async function acknowledgePedagogicalFeedback(
  feedbackId: string,
  currentUser: UserProfile,
  checklistState?: Record<number, boolean>
): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const formattedBR = formatFeedbackDateTimeBR(nowIso);

  let userIp = '127.0.0.1';
  try {
    userIp = await getClientIpAddress();
  } catch {}

  const updatePayload = {
    status: 'ACKNOWLEDGED' as FeedbackStatus,
    displayStatus: '🟢 CIENTE E ASSINADO',
    acknowledgedAt: nowIso,
    acknowledgedFormatted: formattedBR,
    acknowledgedIp: userIp,
    acknowledgedUserAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Desconhecido',
    acknowledgedByUserId: currentUser.id || currentUser.uid || '',
    acknowledgedByUserName: currentUser.name || '',
  };

  try {
    const docRef = doc(db, PRIMARY_COLLECTION, feedbackId);
    await updateDoc(docRef, updatePayload);
  } catch (err) {
    console.warn(`[feedbackService] Erro ao atualizar ${feedbackId} no Firestore (${PRIMARY_COLLECTION}):`, err);
    try {
      const backupRef = doc(db, BACKUP_COLLECTION, feedbackId);
      await updateDoc(backupRef, updatePayload);
    } catch {}
  }

  // Atualiza cache local
  try {
    const cachedRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cachedRaw) {
      const all: PedagogicalFeedback[] = JSON.parse(cachedRaw);
      const updated = all.map((f) => (f.id === feedbackId ? { ...f, ...updatePayload } : f));
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    }
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('app_pedagogical_feedback_acknowledged', {
        detail: { feedbackId, acknowledgedAt: nowIso, acknowledgedFormatted: formattedBR, userIp },
      })
    );
  }
}

/**
 * Registra que o WhatsApp foi acionado sem sobrescrever ou anular dados do Firestore
 */
export async function recordWhatsAppSent(feedbackId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  try {
    const docRef = doc(db, PRIMARY_COLLECTION, feedbackId);
    await updateDoc(docRef, { whatsappSentAt: nowIso });
  } catch {}
}

/**
 * Converte a formatação markdown para o padrão nativo do WhatsApp:
 * Transforma asteriscos duplos '**' em asteriscos simples '*' para negrito nativo sem marcadores residuais.
 */
export function formatWhatsAppMessage(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '*$1*')
    .replace(/\*\*/g, '*');
}

/**
 * Sanitiza o texto para envio via WhatsApp eliminando caracteres corrompidos (\uFFFD / )
 * e garantindo a integridade dos emojis e símbolos em UTF-8.
 */
export function sanitizeWhatsAppText(raw: string): string {
  if (!raw) return '';
  return raw
    .normalize('NFC')
    .replace(/\uFFFD/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

/**
 * Limpa textos redundantes (cabeçalhos legados e rodapés duplicados),
 * converte negritos para o padrão nativo do WhatsApp (*)
 * e padroniza estritamente o encerramento da mensagem.
 */
export function cleanWhatsAppCordialMessage(raw: string): string {
  if (!raw) return '';
  let msg = raw.trim();

  // Remove eventuais cabeçalhos legados repetitivos
  msg = msg.replace(/^\*Colégio Crescer • Coordenação Pedagógica\*.*?\n+/is, '');
  msg = msg.replace(/^Olá, [^!\n]+! Tudo bem\?\s*Compartilhamos uma orientação.*?\n+/is, '');
  msg = msg.replace(/^Abaixo está a mensagem na íntegra:\s*\n+/is, '');
  msg = msg.replace(/^---+\s*\n*/gm, '');

  // Remove eventuais rodapés legados repetitivos
  msg = msg.replace(/\n+Por gentileza, acesse o portal do Colégio Crescer.*$/is, '');

  // Remove despedidas e assinaturas anteriores para garantir encerramento estrito
  msg = msg.replace(/\n+(?:Um abraço fraterno,?|Atenciosamente,?|Fraternalmente,?|Com carinho,?)\s*\n+.*$/is, '');
  msg = msg.replace(/\n+\*?(?:Coordenação (?:do Integral|Pedagógica) • Colégio Crescer)\*?$/is, '');

  // Converte asteriscos duplos (**) para simples (*) para negrito nativo do WhatsApp
  msg = formatWhatsAppMessage(msg);

  // Aplica encerramento institucional estrito padronizado
  const padraoEncerramento = 'Atenciosamente,\nCoordenação do Integral • Colégio Crescer';
  msg = `${msg.trim()}\n\n${padraoEncerramento}`;

  return sanitizeWhatsAppText(msg);
}

/**
 * Constrói link wa.me para acionamento direto via WhatsApp
 * Transmite estritamente a mensagem cordial principal sem textos redundantes,
 * com markdown nativo do WhatsApp (*negrito*) e sanitização completa de emojis/ícones em UTF-8.
 */
export function buildWhatsAppFeedbackLink(
  rawPhone: string | undefined,
  feedback: {
    targetUserName: string;
    normTitle: string;
    generatedMessage: string;
    actionPoints?: string[];
  }
): string {
  let cleanPhone = (rawPhone || '').replace(/\D/g, '');
  if (!cleanPhone) {
    cleanPhone = '';
  } else if (!cleanPhone.startsWith('55') && cleanPhone.length <= 11) {
    cleanPhone = `55${cleanPhone}`;
  }

  // Transmite estritamente a mensagem cordial principal limpa com negritos nativos e assinatura padronizada
  const messageText = cleanWhatsAppCordialMessage(feedback.generatedMessage);
  const encoded = encodeURIComponent(messageText);

  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}
