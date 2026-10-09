import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, clearFirestoreQuotaExceeded } from '../firebase';
import { UserNotification } from '../types';

/**
 * Formata mensagem padrão informativa para lembrete de norma
 */
export function formatNormaReminderMessage(tituloNorma: string): string {
  const cleanTitle = (tituloNorma || 'Normas e Orientações do Integral').trim();
  return `Identificamos que a norma '📌 ${cleanTitle}' ainda aguarda sua leitura e confirmação de ciente no aplicativo. Por favor, acesse o módulo de Normas para ler e assinar quando possível.`;
}

/**
 * Salva notificação de usuário na coleção 'user_notifications' com prioridade alta e status 'UNREAD'
 */
export async function saveUserNotification(notification: Partial<UserNotification> & { id: string; userId: string; title: string; message: string }): Promise<void> {
  try {
    const fullNotification: UserNotification = {
      id: notification.id,
      userId: notification.userId,
      userName: notification.userName,
      title: notification.title,
      message: notification.message,
      priority: notification.priority || 'alta',
      type: notification.type || 'norma_pendente',
      linkTab: notification.linkTab || 'manual',
      normaId: notification.normaId,
      normaTitle: notification.normaTitle,
      read: false,
      status: 'UNREAD',
      createdAt: notification.createdAt || new Date().toISOString(),
      createdBy: notification.createdBy || 'Coordenação',
    };

    const docRef = doc(db, 'user_notifications', fullNotification.id);
    await setDoc(docRef, fullNotification, { merge: true });

    try {
      const stored = localStorage.getItem(`crescer_notifs_${fullNotification.userId}`);
      const list: UserNotification[] = stored ? JSON.parse(stored) : [];
      const updated = [fullNotification, ...list.filter((n) => n.id !== fullNotification.id)];
      localStorage.setItem(`crescer_notifs_${fullNotification.userId}`, JSON.stringify(updated.slice(0, 30)));
    } catch {}
  } catch (err) {
    console.warn('Erro ao salvar notificação do usuário no Firestore:', err);
    handleFirestoreError(err, OperationType.WRITE, 'user_notifications');
    throw err;
  }
}

/**
 * Listener Global em Tempo Real (onSnapshot) na coleção 'user_notifications'
 * Filtrado por userId == currentUser.uid AND status == 'UNREAD'
 */
export function subscribeUserNotifications(
  userId: string,
  onData: (notifications: UserNotification[]) => void,
  onError?: (err: any) => void
): () => void {
  if (!userId) {
    onData([]);
    return () => {};
  }

  try {
    const colRef = collection(db, 'user_notifications');
    // Consulta filtrada no Firestore por userId == currentUser.uid AND status == 'UNREAD'
    const q = query(
      colRef,
      where('userId', '==', userId),
      where('status', '==', 'UNREAD')
    );

    return onSnapshot(
      q,
      (snap) => {
        clearFirestoreQuotaExceeded();
        const list: UserNotification[] = [];
        snap.forEach((d) => {
          const item = d.data() as UserNotification;
          list.push(item);
        });

        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        try {
          localStorage.setItem(`crescer_notifs_${userId}`, JSON.stringify(list.slice(0, 30)));
        } catch {}
        onData(list);
      },
      (err) => {
        console.warn('Erro ao escutar user_notifications com status UNREAD, tentando fallback resiliente:', err);
        // Fallback resiliente caso haja documentos antigos sem o campo status explícito
        try {
          const fallbackQuery = query(colRef, where('userId', '==', userId));
          return onSnapshot(
            fallbackQuery,
            (fallbackSnap) => {
              const list: UserNotification[] = [];
              fallbackSnap.forEach((d) => {
                const item = d.data() as UserNotification;
                if (item.status === 'UNREAD' || (!item.read && item.status !== 'READ')) {
                  list.push(item);
                }
              });
              list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              onData(list);
            },
            (fallbackErr) => {
              handleFirestoreError(fallbackErr, OperationType.LIST, 'user_notifications');
              onError?.(fallbackErr);
              try {
                const cached = localStorage.getItem(`crescer_notifs_${userId}`);
                if (cached) {
                  const parsed: UserNotification[] = JSON.parse(cached);
                  onData(parsed.filter((n) => n.status === 'UNREAD' || (!n.read && n.status !== 'READ')));
                } else {
                  onData([]);
                }
              } catch {
                onData([]);
              }
            }
          );
        } catch {
          onError?.(err);
          onData([]);
        }
      }
    );
  } catch (e) {
    console.warn('Fallback ao configurar listener de notificações:', e);
    try {
      const cached = localStorage.getItem(`crescer_notifs_${userId}`);
      if (cached) {
        const parsed: UserNotification[] = JSON.parse(cached);
        onData(parsed.filter((n) => n.status === 'UNREAD' || (!n.read && n.status !== 'READ')));
      } else {
        onData([]);
      }
    } catch {
      onData([]);
    }
    return () => {};
  }
}

/**
 * Atualiza status da notificação no Firestore para 'READ' (e read: true)
 */
export async function markUserNotificationAsRead(notificationId: string): Promise<void> {
  try {
    const docRef = doc(db, 'user_notifications', notificationId);
    await updateDoc(docRef, {
      status: 'READ',
      read: true,
      readAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Erro ao marcar notificação como lida no Firestore:', err);
  }
}
