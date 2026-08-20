import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ScheduleBlock,
  AttendanceRecord,
  Student,
  ActivityItem,
  UserProfile,
  HolidayItem,
  DayOfWeek,
} from '../types';
import {
  getNotificationPermission,
  requestNotificationAndAudioPermission,
  sendSystemPushNotification,
  playPendingRollCallAlertSound,
  playTestSound,
  initWebPushAndServiceWorker,
} from '../utils/notificationUtils';
import {
  getDayOfWeekFromDate,
  toISODateString,
  isWeekend,
  isHolidayOrRecess,
} from '../utils/dateUtils';
import { isCoordenador } from '../utils/authUtils';

interface UseWebPushNotificationsProps {
  currentUser: UserProfile | null;
  schedules: ScheduleBlock[];
  records: AttendanceRecord[];
  students: Student[];
  activitiesList: ActivityItem[];
  holidays: HolidayItem[];
  onNavigateToAttendance?: (activity?: string, turma?: string, date?: string) => void;
}

export function useWebPushNotifications({
  currentUser,
  schedules,
  records,
  students,
  activitiesList,
  holidays,
  onNavigateToAttendance,
}: UseWebPushNotificationsProps) {
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    getNotificationPermission()
  );
  const [lastNotificationTime, setLastNotificationTime] = useState<string | null>(null);

  // Track notified blocks to prevent spam: Map of "blockId_type_date" -> timestamp
  const notifiedEventsRef = useRef<Map<string, number>>(new Map());

  // Initialize service worker for push notifications on startup
  useEffect(() => {
    initWebPushAndServiceWorker();
  }, []);

  // Request permission helper
  const handleRequestPermission = useCallback(async () => {
    const result = await requestNotificationAndAudioPermission();
    setPermission(result.notificationPermission);
    return result;
  }, []);

  // Map of activities for quick lookup
  const activityMap = useRef<Map<string, ActivityItem>>(new Map());
  useEffect(() => {
    const map = new Map<string, ActivityItem>();
    activitiesList.forEach((act) => {
      map.set(act.id, act);
      map.set(act.name, act);
    });
    activityMap.current = map;
  }, [activitiesList]);

  // Main background monitoring loop
  useEffect(() => {
    if (!currentUser) return;

    const checkAndNotify = () => {
      const now = new Date();
      const todayDate = toISODateString(now);
      const currentDayOfWeek: DayOfWeek | null = getDayOfWeekFromDate(now);

      // Skip on weekends or holidays
      if (!currentDayOfWeek || isWeekend(todayDate) || isHolidayOrRecess(todayDate, holidays)) {
        return;
      }

      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentMinutesOfDay = currentHours * 60 + currentMinutes;
      const currentTimeStr = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;

      const isCoord = isCoordenador(currentUser);
      const userTurmas = new Set(
        currentUser.allowedClassIds || currentUser.assignedTurmas || []
      );
      const userActivities = new Set(currentUser.assignedActivities || []);

      // Filter blocks applicable to this user
      const relevantBlocks = schedules.filter((block) => {
        if (block.dayOfWeek !== currentDayOfWeek) return false;
        if (isCoord) return true;

        const matchesTurma = userTurmas.size === 0 || userTurmas.has(block.turma);
        const matchesActivity =
          userActivities.size === 0 ||
          userActivities.has(block.activityId) ||
          userActivities.has(activityMap.current.get(block.activityId)?.name || '');

        return matchesTurma || matchesActivity;
      });

      const nowTimestamp = Date.now();

      relevantBlocks.forEach((block) => {
        const [startH, startM] = block.startTime.split(':').map(Number);
        const [endH, endM] = block.endTime.split(':').map(Number);
        const startMinutesOfDay = startH * 60 + startM;
        const endMinutesOfDay = endH * 60 + endM;

        const actItem = activityMap.current.get(block.activityId);
        const activityDisplayName = actItem?.name || block.activityId;
        const requiresRollCall = actItem ? actItem.requiresRollCall !== false : true;

        // 1. Check: Activity Start Notification (between start and start + 4 minutes)
        const startEventKey = `start_${block.id}_${todayDate}`;
        const lastStartNotified = notifiedEventsRef.current.get(startEventKey) || 0;

        if (
          currentMinutesOfDay >= startMinutesOfDay &&
          currentMinutesOfDay <= startMinutesOfDay + 4 &&
          nowTimestamp - lastStartNotified > 15 * 60 * 1000 // at least 15 min cooldown
        ) {
          notifiedEventsRef.current.set(startEventKey, nowTimestamp);
          setLastNotificationTime(currentTimeStr);

          const bodyParts = [`Turma: ${block.turma} • ${block.startTime} às ${block.endTime}`];
          if (block.location) bodyParts.push(`📍 Local: ${block.location}`);
          if (block.guidelines) bodyParts.push(`📋 ${block.guidelines}`);

          sendSystemPushNotification({
            title: `🔔 Início de Atividade: ${activityDisplayName}`,
            body: bodyParts.join('\n'),
            tag: `start_${block.id}_${block.startTime}`,
            activityId: block.activityId,
            turma: block.turma,
            date: todayDate,
            type: 'start',
          });
        }

        // 2. Check: Pending Roll Call Notification (after start + 3 minutes and before end)
        if (requiresRollCall && currentMinutesOfDay >= startMinutesOfDay + 3 && currentMinutesOfDay < endMinutesOfDay) {
          // Check enrolled students
          const enrolledStudents = students.filter(
            (s) => s.turma === block.turma && (s.activities || []).includes(block.activityId)
          );

          if (enrolledStudents.length > 0) {
            // Check attendance records for today
            const recordsToday = records.filter(
              (r) =>
                r.date === todayDate &&
                r.turma === block.turma &&
                r.activity === block.activityId
            );

            const recordStudentIds = new Set(recordsToday.map((r) => r.studentId));
            const recordedCount = enrolledStudents.filter((s) =>
              recordStudentIds.has(s.id)
            ).length;

            // If roll call is pending or incomplete
            if (recordedCount < enrolledStudents.length) {
              const pendingEventKey = `pending_${block.id}_${todayDate}`;
              const lastPendingNotified =
                notifiedEventsRef.current.get(pendingEventKey) || 0;

              // Send alert every 8 minutes while in progress if roll call is pending
              if (nowTimestamp - lastPendingNotified > 8 * 60 * 1000) {
                notifiedEventsRef.current.set(pendingEventKey, nowTimestamp);
                setLastNotificationTime(currentTimeStr);

                sendSystemPushNotification({
                  title: `🚨 Chamada Pendente: ${activityDisplayName} (${block.turma})`,
                  body: `A aula iniciou às ${block.startTime}. Chamada realizada: ${recordedCount}/${enrolledStudents.length} alunos. Toque para registrar a presença agora.`,
                  tag: `pending_call_${block.id}_${todayDate}`,
                  activityId: block.activityId,
                  turma: block.turma,
                  date: todayDate,
                  type: 'pending_call',
                });
              }
            }
          }
        }
      });
    };

    // Run check immediately and then periodically every 15 seconds
    checkAndNotify();
    const interval = setInterval(checkAndNotify, 15000);

    // Also run check when window/tab regains visibility
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAndNotify();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser, schedules, records, students, holidays]);

  // Test notification helper
  const triggerTestPush = useCallback(async () => {
    playTestSound();
    await sendSystemPushNotification({
      title: '🔔 Teste de Notificação Web Push • Colégio Crescer',
      body: 'O sistema de notificações e alertas sonoros em segundo plano está funcionando perfeitamente!',
      tag: `test_${Date.now()}`,
      type: 'test',
    });
  }, []);

  return {
    permission,
    requestPermission: handleRequestPermission,
    triggerTestPush,
    lastNotificationTime,
  };
}
