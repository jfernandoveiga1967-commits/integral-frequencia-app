import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

export interface UserManualProgress {
  userId: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  normIdsCompleted: string[];
  lastUpdated: string;
}

export interface ManualAcknowledgmentRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole?: string;
  timestamp: string;
  userIp?: string;
  userAgent?: string;
  appVersion: string;
  manualHash: string;
  isFullManualAcknowledged: boolean;
  totalNormasCount: number;
  normIdsCompleted: string[];
}

/**
 * Escuta em tempo real o progresso de normas concluídas do usuário logado
 */
export function subscribeUserManualProgress(
  userId: string,
  onProgress: (progress: UserManualProgress) => void,
  onError?: (error: any) => void
): () => void {
  if (!userId) {
    onProgress({ userId: '', normIdsCompleted: [], lastUpdated: '' });
    return () => {};
  }

  // Tenta recuperar do cache local imediato
  try {
    const cached = localStorage.getItem(`crescer_manual_progress_${userId}`);
    if (cached) {
      onProgress(JSON.parse(cached));
    }
  } catch {}

  const docRef = doc(db, 'manual_user_progress', userId);
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as UserManualProgress;
        const result: UserManualProgress = {
          userId,
          userName: data.userName || '',
          userEmail: data.userEmail || '',
          userRole: data.userRole || '',
          normIdsCompleted: Array.isArray(data.normIdsCompleted) ? data.normIdsCompleted : [],
          lastUpdated: data.lastUpdated || '',
        };
        try {
          localStorage.setItem(`crescer_manual_progress_${userId}`, JSON.stringify(result));
        } catch {}
        onProgress(result);
      } else {
        // Inicializa vazio se não existir
        const initial: UserManualProgress = {
          userId,
          normIdsCompleted: [],
          lastUpdated: new Date().toISOString(),
        };
        onProgress(initial);
      }
    },
    (err) => {
      console.warn(`[manualProgressService] Erro ao escutar progresso de normas para ${userId}:`, err);
      onError?.(err);
    }
  );
}

/**
 * Adiciona o ID da norma concluída ao array 'normIdsCompleted' do usuário no Firestore
 */
export async function markNormaCompletedInFirestore(
  userId: string,
  normaId: string,
  userProfile?: UserProfile | null
): Promise<string[]> {
  if (!userId || !normaId) return [];

  const docRef = doc(db, 'manual_user_progress', userId);

  let currentCompleted: string[] = [];
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.normIdsCompleted)) {
        currentCompleted = [...data.normIdsCompleted];
      }
    } else {
      // Verifica cache local se novo no firestore
      const cached = localStorage.getItem(`crescer_manual_progress_${userId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.normIdsCompleted)) {
          currentCompleted = [...parsed.normIdsCompleted];
        }
      }
    }
  } catch (err) {
    console.warn(`[manualProgressService] Fallback local ao ler progresso antes de gravar:`, err);
  }

  if (!currentCompleted.includes(normaId)) {
    currentCompleted.push(normaId);
  }

  const updatedProgress: UserManualProgress = {
    userId,
    userName: userProfile?.name || '',
    userEmail: userProfile?.email || '',
    userRole: userProfile?.cargoLabel || userProfile?.role || 'monitora',
    normIdsCompleted: currentCompleted,
    lastUpdated: new Date().toISOString(),
  };

  try {
    localStorage.setItem(`crescer_manual_progress_${userId}`, JSON.stringify(updatedProgress));
  } catch {}

  await setDoc(docRef, updatedProgress, { merge: true });
  return currentCompleted;
}

/**
 * Busca IP público opcional do usuário para fins de auditoria de conformidade digital
 */
export async function getClientIpAddress(): Promise<string> {
  try {
    const response = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const data = await response.json();
      return data.ip || '127.0.0.1';
    }
  } catch {
    // Sem conectividade externa a serviços de IP, usa identificador interno
  }
  return 'local-client';
}

/**
 * Registra o aceite final de todo o manual na coleção 'manual_acknowledgments'
 * alterando o status 'isFullManualAcknowledged' para true, com data, hora e IP
 */
export async function saveFullManualAcknowledgmentToFirestore(params: {
  currentUser: UserProfile;
  totalNormasCount: number;
  normIdsCompleted: string[];
}): Promise<ManualAcknowledgmentRecord> {
  const { currentUser, totalNormasCount, normIdsCompleted } = params;
  const userId = currentUser.id || currentUser.uid || 'colaborador';
  const ackId = `ack_${userId}`;

  let userIp = '127.0.0.1';
  try {
    userIp = await getClientIpAddress();
  } catch {}

  const nowIso = new Date().toISOString();
  const ackRecord: ManualAcknowledgmentRecord = {
    id: ackId,
    userId,
    userName: currentUser.name || 'Colaborador',
    userEmail: currentUser.email || '',
    userRole: currentUser.cargoLabel || currentUser.role || 'monitora',
    timestamp: nowIso,
    userIp,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Desconhecido',
    appVersion: '2026.1',
    manualHash: 'crescer_manual_normas_2026_v1',
    isFullManualAcknowledged: true,
    totalNormasCount,
    normIdsCompleted,
  };

  // Salva no doc manual_acknowledgments/{ackId}
  const ackDocRef = doc(db, 'manual_acknowledgments', ackId);
  await setDoc(ackDocRef, ackRecord, { merge: true });

  // Também sincroniza na coleção clássica normas_aceites/{userId} para manter compatibilidade total
  const legacyDocRef = doc(db, 'normas_aceites', `aceite_${userId}`);
  await setDoc(
    legacyDocRef,
    {
      id: `aceite_${userId}`,
      userId,
      userName: currentUser.name || 'Colaborador',
      userEmail: currentUser.email || '',
      userRole: currentUser.cargoLabel || currentUser.role || 'monitora',
      timestamp: nowIso,
      appVersion: '2026.1',
      manualHash: 'crescer_manual_normas_2026_v1',
      userIp,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Desconhecido',
      isFullManualAcknowledged: true,
    },
    { merge: true }
  );

  // Armazena no cache local
  try {
    localStorage.setItem(`crescer_manual_acknowledgment_${userId}`, JSON.stringify(ackRecord));
    localStorage.setItem(`crescer_norma_aceite_${userId}`, JSON.stringify(ackRecord));
  } catch {}

  return ackRecord;
}

/**
 * Escuta em tempo real o aceite geral do manual do usuário logado na coleção 'manual_acknowledgments'
 */
export function subscribeUserManualAcknowledgment(
  userId: string,
  onAck: (ack: ManualAcknowledgmentRecord | null) => void,
  onError?: (err: any) => void
): () => void {
  if (!userId) {
    onAck(null);
    return () => {};
  }

  try {
    const cached = localStorage.getItem(`crescer_manual_acknowledgment_${userId}`);
    if (cached) {
      onAck(JSON.parse(cached));
    }
  } catch {}

  const docRef = doc(db, 'manual_acknowledgments', `ack_${userId}`);
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as ManualAcknowledgmentRecord;
        try {
          localStorage.setItem(`crescer_manual_acknowledgment_${userId}`, JSON.stringify(data));
        } catch {}
        onAck(data);
      } else {
        onAck(null);
      }
    },
    (err) => {
      console.warn(`[manualProgressService] Erro ao escutar manual_acknowledgments para ${userId}:`, err);
      onError?.(err);
    }
  );
}

/**
 * Escuta todos os aceites completos para painel do coordenador/admin
 */
export function subscribeAllManualAcknowledgments(
  onData: (records: ManualAcknowledgmentRecord[]) => void,
  onError?: (err: any) => void
): () => void {
  const colRef = collection(db, 'manual_acknowledgments');
  return onSnapshot(
    colRef,
    (snap) => {
      const list: ManualAcknowledgmentRecord[] = [];
      snap.forEach((d) => {
        list.push(d.data() as ManualAcknowledgmentRecord);
      });
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      onData(list);
    },
    (err) => {
      console.warn('[manualProgressService] Erro ao escutar todos manual_acknowledgments:', err);
      onError?.(err);
      onData([]);
    }
  );
}
