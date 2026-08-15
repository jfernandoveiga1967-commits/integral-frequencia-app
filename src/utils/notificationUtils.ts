import { ScheduleBlock } from '../types';

let audioCtx: AudioContext | null = null;

/**
 * Play a pleasant, non-intrusive alert chime using Web Audio API
 */
export function playChimeSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx || audioCtx.state === 'suspended') {
      audioCtx = new AudioContextClass();
    }

    const now = audioCtx.currentTime;

    // Tone 1 (D5 - 587.33 Hz)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.18, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Tone 2 (A5 - 880 Hz) - harmonic chime
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0, now + 0.12);
    gain2.gain.linearRampToValueAtTime(0.22, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.65);
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
 * Request notification permission from user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      playChimeSound();
    }
    return permission;
  } catch (e) {
    console.error('Error requesting notification permission:', e);
    return 'denied';
  }
}

/**
 * Send a native notification for a schedule block transition
 */
export function sendScheduleNotification(
  block: ScheduleBlock,
  activityName: string,
  type: 'start' | 'reminder' | 'test' = 'start'
): boolean {
  playChimeSound();

  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  try {
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

    const notification = new Notification(title, {
      body: bodyLines.join('\n'),
      icon: '/icon.png',
      tag: `schedule_${block.id}_${block.startTime}`,
      silent: false,
    });

    // Auto close after 8 seconds
    setTimeout(() => {
      try {
        notification.close();
      } catch {
        // ignore
      }
    }, 8000);

    return true;
  } catch (err) {
    console.error('Error showing notification:', err);
    return false;
  }
}
