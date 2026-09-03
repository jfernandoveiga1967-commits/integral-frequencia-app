import {
  AttendanceRecord,
  Student,
  ScheduleBlock,
  ActivityItem,
  PontoRecord,
  PontoMonthClosing,
  SemanarioPlan,
  UserProfile,
} from '../types';
import { reconnectFirestore, disconnectFirestore, testFirestoreConnection, processAttendanceOutbox } from '../firebase';

export type SyncEventType =
  | 'SYNC_ATTENDANCE_RECORDS'
  | 'SYNC_ATTENDANCE_RECORD_UPSERT'
  | 'SYNC_ATTENDANCE_RECORDS_DELETE'
  | 'SYNC_STUDENTS'
  | 'SYNC_SCHEDULES'
  | 'SYNC_ACTIVITIES'
  | 'SYNC_TURMAS'
  | 'SYNC_PONTO_RECORDS'
  | 'SYNC_PONTO_CLOSINGS'
  | 'SYNC_SEMANARIO'
  | 'SYNC_USERS'
  | 'FORCE_RESYNC'
  | 'CONNECTION_STATUS_CHANGE';

export interface SyncMessage<T = unknown> {
  id: string;
  senderId: string;
  type: SyncEventType;
  payload: T;
  timestamp: number;
}

export type SyncConnectionStatus = 'synced' | 'syncing' | 'offline' | 'reconnecting';

export interface ConnectionState {
  status: SyncConnectionStatus;
  isOnline: boolean;
  lastSyncTime: number;
  pendingOutboxCount: number;
}

// Generate unique tab/window identifier
const TAB_INSTANCE_ID = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
const CHANNEL_NAME = 'integral_crescer_realtime_sync_channel';
const STORAGE_SYNC_KEY = 'integral_crescer_sync_event';

// Internal BroadcastChannel
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  } catch (err) {
    console.warn('BroadcastChannel not supported in this environment, using storage events fallback.', err);
  }
}

// Track seen message IDs to prevent loops and duplicate processing
const seenMessageIds = new Set<string>();
function markSeen(id: string): boolean {
  if (seenMessageIds.has(id)) return true;
  seenMessageIds.add(id);
  if (seenMessageIds.size > 200) {
    // Keep set bounded
    const firstItems = Array.from(seenMessageIds).slice(0, 100);
    firstItems.forEach((item) => seenMessageIds.delete(item));
  }
  return false;
}

// Listeners registry
type SyncEventListener = (message: SyncMessage) => void;
const listeners = new Set<SyncEventListener>();

// Connection state
let currentConnectionState: ConnectionState = {
  status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced',
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  lastSyncTime: Date.now(),
  pendingOutboxCount: 0,
};

type ConnectionStatusListener = (state: ConnectionState) => void;
const statusListeners = new Set<ConnectionStatusListener>();

function updateConnectionState(partial: Partial<ConnectionState>) {
  currentConnectionState = {
    ...currentConnectionState,
    ...partial,
  };
  statusListeners.forEach((listener) => {
    try {
      listener(currentConnectionState);
    } catch (err) {
      console.error('Error in connection status listener:', err);
    }
  });
}

/**
 * Broadcast an event to all other tabs and windows immediately.
 */
export function broadcastSyncEvent<T>(type: SyncEventType, payload: T): void {
  const message: SyncMessage<T> = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    senderId: TAB_INSTANCE_ID,
    type,
    payload,
    timestamp: Date.now(),
  };

  markSeen(message.id);

  // 1. Send via BroadcastChannel (instant in same-browser tabs)
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(message);
    } catch (err) {
      console.warn('Error posting to BroadcastChannel:', err);
    }
  }

  // 2. Storage event fallback (for cross-window or older browsers)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_SYNC_KEY, JSON.stringify(message));
    } catch {
      // Ignore quota/private mode errors
    }
  }

  // 3. CustomEvent on window for same-frame modules
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('integral_sync_bus', { detail: message }));
    } catch {
      // Ignore
    }
  }
}

/**
 * Subscribe to sync messages across tabs.
 */
export function subscribeToSyncEvents(listener: SyncEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Subscribe to connectivity and sync status changes (synced, syncing, offline, reconnecting).
 */
export function subscribeConnectionStatus(listener: ConnectionStatusListener): () => void {
  statusListeners.add(listener);
  listener(currentConnectionState);
  return () => {
    statusListeners.delete(listener);
  };
}

export function getConnectionState(): ConnectionState {
  return currentConnectionState;
}

// Internal dispatcher
function dispatchToListeners(message: SyncMessage) {
  if (!message || !message.id) return;
  if (message.senderId === TAB_INSTANCE_ID) return; // Don't echo to sender
  if (markSeen(message.id)) return; // Already processed

  listeners.forEach((listener) => {
    try {
      listener(message);
    } catch (err) {
      console.error('Error in sync listener:', err);
    }
  });
}

// Setup BroadcastChannel receiver
if (broadcastChannel) {
  broadcastChannel.onmessage = (event) => {
    if (event.data) {
      dispatchToListeners(event.data);
    }
  };
}

// Setup storage event receiver (fallback)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_SYNC_KEY && event.newValue) {
      try {
        const msg = JSON.parse(event.newValue) as SyncMessage;
        dispatchToListeners(msg);
      } catch {
        // Ignore parse error
      }
    }
  });

  window.addEventListener('integral_sync_bus', (event: Event) => {
    const customEvent = event as CustomEvent<SyncMessage>;
    if (customEvent.detail) {
      dispatchToListeners(customEvent.detail);
    }
  });
}

/**
 * Robust background auto-reconnection and connectivity manager.
 * Detects school network drops, tab switching, and automatically reconnects Firestore.
 */
let isConnectivityInitialized = false;
let heartbeatInterval: NodeJS.Timeout | null = null;
let isReconnecting = false;

export async function runAutoReconnect(): Promise<boolean> {
  if (isReconnecting) return false;
  isReconnecting = true;
  updateConnectionState({ status: 'reconnecting' });

  try {
    const isOnline = navigator.onLine;
    if (!isOnline) {
      updateConnectionState({ status: 'offline', isOnline: false });
      isReconnecting = false;
      return false;
    }

    // Force Firestore network reconnection
    await reconnectFirestore();

    // Check actual Firestore server ping
    const isConnected = await testFirestoreConnection();
    if (isConnected) {
      // Process pending outbox
      const processed = await processAttendanceOutbox();
      updateConnectionState({
        status: 'synced',
        isOnline: true,
        lastSyncTime: Date.now(),
        pendingOutboxCount: 0,
      });

      // Broadcast force resync to make sure all instances refresh any missed writes
      broadcastSyncEvent('FORCE_RESYNC', { timestamp: Date.now(), processedOutbox: processed });
      isReconnecting = false;
      return true;
    } else {
      updateConnectionState({ status: 'offline', isOnline: false });
      isReconnecting = false;
      return false;
    }
  } catch (err) {
    console.warn('Auto-reconnect notice:', err);
    updateConnectionState({ status: 'offline' });
    isReconnecting = false;
    return false;
  }
}

export function initConnectivityMonitor(): () => void {
  if (isConnectivityInitialized || typeof window === 'undefined') {
    return () => {};
  }
  isConnectivityInitialized = true;

  const handleOnline = async () => {
    console.info('Dispositivo voltou online. Iniciando reconexão automática e sincronização...');
    updateConnectionState({ isOnline: true, status: 'reconnecting' });
    await runAutoReconnect();
  };

  const handleOffline = () => {
    console.warn('Dispositivo offline. Modo de contingência e outbox ativado.');
    updateConnectionState({ isOnline: false, status: 'offline' });
    disconnectFirestore().catch(() => {});
  };

  const handleVisibilityOrFocus = async () => {
    // If the tab just became active or focused and was marked offline, verify and sync
    if ((document.visibilityState === 'visible' || document.hasFocus()) && (!currentConnectionState.isOnline || currentConnectionState.status === 'offline')) {
      await runAutoReconnect();
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('focus', handleVisibilityOrFocus);
  document.addEventListener('visibilitychange', handleVisibilityOrFocus);

  // Periodic heartbeat every 15 seconds to monitor connection health
  heartbeatInterval = setInterval(async () => {
    if (navigator.onLine) {
      // If was offline or reconnecting, run reconnect
      if (currentConnectionState.status === 'offline' || currentConnectionState.status === 'reconnecting') {
        await runAutoReconnect();
      } else {
        // Quick silent check and outbox flush
        processAttendanceOutbox().catch(() => {});
      }
    } else {
      updateConnectionState({ isOnline: false, status: 'offline' });
    }
  }, 15000);

  // Initial check
  if (navigator.onLine) {
    runAutoReconnect().catch(() => {});
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('focus', handleVisibilityOrFocus);
    document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    isConnectivityInitialized = false;
  };
}

/**
 * Manually triggered force-resync by the user (e.g. clicking the sync status badge).
 */
export async function forceManualSync(): Promise<{ success: boolean; message: string }> {
  updateConnectionState({ status: 'syncing' });
  try {
    const success = await runAutoReconnect();
    if (success) {
      return { success: true, message: 'Dados e conexões 100% sincronizados com sucesso!' };
    }
    return { success: false, message: 'Conectado em modo offline/cache. Alterações salvas localmente.' };
  } catch (err) {
    updateConnectionState({ status: 'offline' });
    return { success: false, message: 'Erro ao sincronizar. Verifique a rede da escola.' };
  }
}
