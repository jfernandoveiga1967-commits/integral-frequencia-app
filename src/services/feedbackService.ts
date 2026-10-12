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
  targetUserId: string;
  targetUserName: string;
  targetUserEmail?: string;
  targetUserPhone?: string;
  normId: string;
  normTitle: string;
  normSection?: string;
  rawContext: string;
  generatedMessage: string;
  actionPoints: string[];
  status: FeedbackStatus;
  createdByUserId: string;
  createdByUserName: string;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedIp?: string;
  acknowledgedUserAgent?: string;
  whatsappSentAt?: string;
}

const COLLECTION_NAME = 'pedagogical_feedbacks';
const LOCAL_STORAGE_KEY = 'crescer_pedagogical_feedbacks_cache';

/**
 * Salva um novo feedback pedagógico cordial no Firestore
 */
export async function createPedagogicalFeedback(
  data: Omit<PedagogicalFeedback, 'id' | 'status' | 'createdAt'>
): Promise<PedagogicalFeedback> {
  const id = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  const feedback: PedagogicalFeedback = {
    ...data,
    id,
    status: 'PENDING',
    createdAt: nowIso,
  };

  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await setDoc(docRef, feedback);
  } catch (err) {
    console.warn('[feedbackService] Erro ao salvar no Firestore, gravando no cache local:', err);
  }

  // Atualiza cache local
  try {
    const cachedRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const cached: PedagogicalFeedback[] = cachedRaw ? JSON.parse(cachedRaw) : [];
    const updated = [feedback, ...cached.filter((f) => f.id !== id)];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch {}

  // Dispara evento local para notificação imediata caso o destinatário esteja na mesma sessão
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

  // Leitura inicial rápida do cache local
  try {
    const cachedRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cachedRaw) {
      const all: PedagogicalFeedback[] = JSON.parse(cachedRaw);
      const userPending = all.filter(
        (f) =>
          (f.targetUserId === userId || (userEmail && f.targetUserEmail === userEmail)) &&
          f.status === 'PENDING'
      );
      if (userPending.length > 0) {
        onData?.(userPending);
      }
    }
  } catch {}

  const colRef = collection(db, COLLECTION_NAME);
  // Escuta todos os feedbacks e filtra no cliente para evitar necessidade de índices compostos
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: PedagogicalFeedback[] = [];
      snapshot.forEach((snap) => {
        const item = snap.data() as PedagogicalFeedback;
        if (
          (item.targetUserId === userId || (userEmail && item.targetUserEmail === userEmail)) &&
          item.status === 'PENDING'
        ) {
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
 * Escuta todos os feedbacks para gestão da coordenação
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

  const colRef = collection(db, COLLECTION_NAME);
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
 * Registra a ciência e aceite do feedback pedagógico pela monitora
 */
export async function acknowledgePedagogicalFeedback(
  feedbackId: string,
  currentUser: UserProfile
): Promise<void> {
  const nowIso = new Date().toISOString();
  let userIp = '127.0.0.1';
  try {
    userIp = await getClientIpAddress();
  } catch {}

  const updatePayload = {
    status: 'ACKNOWLEDGED' as FeedbackStatus,
    acknowledgedAt: nowIso,
    acknowledgedIp: userIp,
    acknowledgedUserAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Desconhecido',
  };

  try {
    const docRef = doc(db, COLLECTION_NAME, feedbackId);
    await updateDoc(docRef, updatePayload);
  } catch (err) {
    console.warn(`[feedbackService] Erro ao atualizar ${feedbackId} no Firestore:`, err);
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
        detail: { feedbackId, acknowledgedAt: nowIso, userIp },
      })
    );
  }
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
