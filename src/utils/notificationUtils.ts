import { ScheduleBlock } from '../types';

const STORAGE_KEY_SOUND_ENABLED = 'integral_sound_notifications_enabled';
let audioCtx: AudioContext | null = null;
let isAudioUnlocked = false;

/**
 * Check if sound notifications are enabled in user settings (default: true)
 */
export function isAudioNotificationsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = localStorage.getItem(STORAGE_KEY_SOUND_ENABLED);
    return val !== 'false';
  } catch {
    return true;
  }
}

/**
 * Set sound notifications enabled / disabled and broadcast event
 */
export function setAudioNotificationsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_SOUND_ENABLED, enabled ? 'true' : 'false');
    window.dispatchEvent(
      new CustomEvent('integral_audio_state_change', {
        detail: { enabled, isUnlocked: isAudioUnlocked },
      })
    );
  } catch (err) {
    console.warn('Failed to save sound preference:', err);
  }
}

/**
 * Checks if the Web Audio API context is unlocked and ready for playback
 */
export function isAudioContextReady(): boolean {
  return isAudioUnlocked && audioCtx !== null && audioCtx.state === 'running';
}

/**
 * Get or initialize the Web Audio API context
 */
function getOrCreateAudioContext(): AudioContext | null {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => {
        isAudioUnlocked = true;
        window.dispatchEvent(
          new CustomEvent('integral_audio_state_change', {
            detail: { enabled: isAudioNotificationsEnabled(), isUnlocked: true },
          })
        );
      }).catch(() => {});
    } else if (audioCtx.state === 'running') {
      isAudioUnlocked = true;
    }

    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Helper to play a single bell-like harmonic tone
 */
function playBellHarmonic(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number = 0.4,
  volume: number = 0.2
): void {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    // Fast attack, smooth exponential decay
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);

    // Secondary overtone for rich metallic bell texture
    const overtoneOsc = ctx.createOscillator();
    const overtoneGain = ctx.createGain();
    overtoneOsc.type = 'triangle';
    overtoneOsc.frequency.setValueAtTime(freq * 2.02, startTime);

    overtoneGain.gain.setValueAtTime(0.0001, startTime);
    overtoneGain.gain.linearRampToValueAtTime(volume * 0.35, startTime + 0.015);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.6);

    overtoneOsc.connect(overtoneGain);
    overtoneGain.connect(ctx.destination);

    overtoneOsc.start(startTime);
    overtoneOsc.stop(startTime + duration * 0.6 + 0.05);
  } catch {
    // ignore
  }
}

/**
 * Unlocks audio context on user click and plays a crisp test sound
 */
export async function unlockAudioContextAndPlayTest(): Promise<boolean> {
  setAudioNotificationsEnabled(true);
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    isAudioUnlocked = true;
    playTestSound();
    window.dispatchEvent(
      new CustomEvent('integral_audio_state_change', {
        detail: { enabled: true, isUnlocked: true },
      })
    );
    return true;
  } catch (err) {
    console.warn('Failed to unlock audio context:', err);
    return false;
  }
}

/**
 * Plays a quick, pleasant 2-note confirmation test sound (C5 -> G5)
 */
export function playTestSound(): void {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    playBellHarmonic(ctx, 523.25, now, 0.28, 0.18); // C5
    playBellHarmonic(ctx, 783.99, now + 0.14, 0.45, 0.24); // G5
  } catch (err) {
    console.warn('Test sound playback error:', err);
  }
}

/**
 * Play a strong, repetitive alert sound (3 distinct striking chime bursts) for pending roll calls
 */
export function playPendingRollCallAlertSound(): void {
  if (!isAudioNotificationsEnabled()) return;

  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Burst 1: High distinct chime (E5 - 659Hz + B5 - 987Hz)
    playBellHarmonic(ctx, 659.25, now, 0.35, 0.26);
    playBellHarmonic(ctx, 987.77, now + 0.04, 0.4, 0.3);

    // Burst 2: Second attention chime (E5 - 659Hz + B5 - 987Hz) at +320ms
    playBellHarmonic(ctx, 659.25, now + 0.32, 0.35, 0.28);
    playBellHarmonic(ctx, 987.77, now + 0.36, 0.45, 0.32);

    // Burst 3: Third higher resolving chime (G#5 - 830Hz + E6 - 1318Hz) at +640ms
    playBellHarmonic(ctx, 830.61, now + 0.64, 0.45, 0.32);
    playBellHarmonic(ctx, 1318.51, now + 0.68, 0.65, 0.38);
  } catch (err) {
    console.warn('Pending roll call alert sound error:', err);
  }
}

/**
 * Play a standard chime sound
 */
export function playChimeSound(): void {
  if (!isAudioNotificationsEnabled()) return;

  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    // Tone 1 (D5 - 587.33 Hz)
    playBellHarmonic(ctx, 587.33, now, 0.35, 0.22);
    // Tone 2 (A5 - 880 Hz)
    playBellHarmonic(ctx, 880.0, now + 0.12, 0.6, 0.28);
  } catch (err) {
    console.warn('Audio chime playback failed:', err);
  }
}

/**
 * Check if Web Notifications are supported in current browser
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Get current browser notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

/**
 * Request notification permission from user and unlock audio
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      unlockAudioContextAndPlayTest();
    }
    return permission;
  } catch (e) {
    console.error('Error requesting notification permission:', e);
    return 'denied';
  }
}

/**
 * Combined helper to unlock audio and request push notification permissions during user interaction
 */
export async function requestNotificationAndAudioPermission(): Promise<{
  notificationPermission: NotificationPermission;
  audioUnlocked: boolean;
}> {
  const audioUnlocked = await unlockAudioContextAndPlayTest();
  let notificationPermission: NotificationPermission = 'denied';

  if (isNotificationSupported()) {
    try {
      notificationPermission = await Notification.requestPermission();
    } catch {
      notificationPermission = getNotificationPermission();
    }
  }

  return { notificationPermission, audioUnlocked };
}

/**
 * Initialize Service Worker and listen for notification click messages
 */
export function initWebPushAndServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[Push/PWA] Service Worker registered with scope:', registration.scope);
      })
      .catch((err) => {
        console.warn('[Push/PWA] Service Worker registration failed:', err);
      });

    // Listen for messages sent when a background notification is clicked
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'NOTIFICATION_CLICKED') {
        const payload = event.data.data;
        if (payload) {
          window.dispatchEvent(
            new CustomEvent('app_select_attendance_filter', {
              detail: {
                activity: payload.activityId,
                turma: payload.turma,
                date: payload.date,
              },
            })
          );
        }
      }
    });
  } catch (err) {
    console.warn('[Push/PWA] Init error:', err);
  }
}

export interface PushNotificationOptions {
  title: string;
  body: string;
  tag?: string;
  icon?: string;
  badge?: string;
  activityId?: string;
  turma?: string;
  date?: string;
  type?: 'start' | 'pending_call' | 'reminder' | 'test';
}

/**
 * Sends a native System Push Notification (via Service Worker or Notification API)
 * with accompanying device vibration and Web Audio alert chime.
 */
export async function sendSystemPushNotification(
  options: PushNotificationOptions
): Promise<boolean> {
  const {
    title,
    body,
    tag = 'integral_notification',
    icon = '/pwa-192.png',
    badge = '/icon.svg',
    activityId,
    turma,
    date,
    type = 'start',
  } = options;

  // 1. Play appropriate audio alert
  if (type === 'test') {
    playTestSound();
  } else if (type === 'pending_call') {
    playPendingRollCallAlertSound();
  } else {
    playPendingRollCallAlertSound();
  }

  // 2. Hardware vibration for mobile devices
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      if (type === 'pending_call') {
        navigator.vibrate([300, 150, 300, 150, 400]);
      } else {
        navigator.vibrate([200, 100, 200]);
      }
    } catch {
      // ignore
    }
  }

  // 3. Check browser notification permission
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const notificationPayload = {
    body,
    icon,
    badge,
    tag,
    renotify: true,
    requireInteraction: type === 'pending_call',
    data: {
      url: '/',
      activityId,
      turma,
      date,
      type,
    },
  };

  // Try Service Worker registration showNotification first (native background support on mobile & desktop)
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration && registration.showNotification) {
        await registration.showNotification(title, notificationPayload);
        return true;
      }
    } catch (err) {
      console.warn('[Push] ServiceWorker showNotification fallback:', err);
    }
  }

  // Fallback to standard Window Notification API
  try {
    const notification = new Notification(title, notificationPayload);

    notification.onclick = () => {
      window.focus();
      if (activityId || turma) {
        window.dispatchEvent(
          new CustomEvent('app_select_attendance_filter', {
            detail: { activity: activityId, turma, date },
          })
        );
      }
      notification.close();
    };

    if (type !== 'pending_call') {
      setTimeout(() => {
        try {
          notification.close();
        } catch {
          // ignore
        }
      }, 10000);
    }

    return true;
  } catch (err) {
    console.error('[Push] Standard Notification failed:', err);
    return false;
  }
}

/**
 * Send a native notification for a schedule block transition with audio alert
 */
export function sendScheduleNotification(
  block: ScheduleBlock,
  activityName: string,
  type: 'start' | 'reminder' | 'test' = 'start'
): boolean {
  let title = `🔔 Integral: Hora de ${activityName}`;
  if (type === 'test') {
    title = `🔔 Teste de Notificação: Integral Rotina`;
  } else if (type === 'reminder') {
    title = `⏳ Próxima Atividade: ${activityName}`;
  }

  const bodyLines: string[] = [
    `Turma: ${block.turma} • ${block.startTime} às ${block.endTime}`,
  ];

  if (block.location) {
    bodyLines.push(`📍 Local: ${block.location}`);
  }

  if (block.guidelines) {
    bodyLines.push(`📋 ${block.guidelines}`);
  }

  sendSystemPushNotification({
    title,
    body: bodyLines.join('\n'),
    tag: `schedule_${block.id}_${block.startTime}`,
    activityId: block.activityId,
    turma: block.turma,
    type,
  });

  return true;
}

/**
 * Send a system push notification for a Pending Roll Call (Chamada Pendente)
 */
export function sendPendingRollCallPushNotification(
  activityName: string,
  turma: string,
  startTime: string,
  activityId?: string
): boolean {
  const title = `🚨 Chamada Pendente: ${activityName} (${turma})`;
  const body = `A atividade iniciou às ${startTime}. A chamada dos alunos ainda não foi realizada. Toque para registrar a presença agora.`;

  sendSystemPushNotification({
    title,
    body,
    tag: `pending_call_${activityId || activityName}_${turma}`,
    activityId,
    turma,
    type: 'pending_call',
  });

  return true;
}

