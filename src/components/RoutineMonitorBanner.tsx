import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock,
  MapPin,
  FileText,
  UserCheck,
  CheckCircle2,
  Bell,
  BellRing,
  BellOff,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Calendar,
  Layers,
  ArrowRight,
  Coffee,
  Sun,
  Utensils,
  Volume2,
} from 'lucide-react';
import { ScheduleBlock, DayOfWeek, TurmaType, ActivityItem, ActivityType } from '../types';
import { ActivityBadge, renderActivityIcon } from './ActivityBadge';
import { getDayOfWeekFromDate, getDayOfWeekLabel } from '../utils/dateUtils';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  sendScheduleNotification,
  playChimeSound,
} from '../utils/notificationUtils';

interface RoutineMonitorBannerProps {
  schedules: ScheduleBlock[];
  activitiesList: ActivityItem[];
  selectedTurma: TurmaType | 'TODAS';
  selectedDate: string; // YYYY-MM-DD
  turmasList: string[];
  onSelectActivityAndTurma: (activity: ActivityType, turma?: TurmaType) => void;
  onNavigateToScheduleManager?: () => void;
}

export const RoutineMonitorBanner: React.FC<RoutineMonitorBannerProps> = ({
  schedules,
  activitiesList,
  selectedTurma,
  selectedDate,
  turmasList,
  onSelectActivityAndTurma,
  onNavigateToScheduleManager,
}) => {
  // Real-time clock state (HH:mm:ss)
  const [currentTime, setCurrentTime] = useState<string>(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [currentSeconds, setCurrentSeconds] = useState<number>(() => new Date().getSeconds());

  // Notification permission state
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() =>
    getNotificationPermission()
  );
  const [notifBannerFeedback, setNotifBannerFeedback] = useState<string | null>(null);

  // Timeline expanded state
  const [isTimelineExpanded, setIsTimelineExpanded] = useState<boolean>(true);

  // Track which schedule blocks have already triggered a notification today
  const notifiedBlocksRef = useRef<Set<string>>(new Set());

  // Determine current day of week (from real-time clock)
  const realDayOfWeek = useMemo<DayOfWeek | null>(() => {
    return getDayOfWeekFromDate(new Date());
  }, []);

  // Determine day of week from selectedDate
  const selectedDateDayOfWeek = useMemo<DayOfWeek | null>(() => {
    return getDayOfWeekFromDate(selectedDate);
  }, [selectedDate]);

  // Active Day of Week to display (defaults to selectedDateDayOfWeek, or realDayOfWeek, or 'segunda')
  const activeDayOfWeek: DayOfWeek = selectedDateDayOfWeek || realDayOfWeek || 'segunda';

  // Determine which Turma to inspect for the banner
  const activeTurma: TurmaType =
    selectedTurma !== 'TODAS'
      ? selectedTurma
      : turmasList[0] || '1º Ano A';

  // Update clock every 5 seconds
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      setCurrentTime(hhmm);
      setCurrentSeconds(d.getSeconds());
    };

    updateTime();
    const interval = setInterval(updateTime, 5000);
    return () => clearInterval(interval);
  }, []);

  // Filter and sort today's schedules for this turma
  const todaySchedules = useMemo(() => {
    return schedules
      .filter((s) => s.turma === activeTurma && s.dayOfWeek === activeDayOfWeek)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [schedules, activeTurma, activeDayOfWeek]);

  // Find active, next, and past blocks
  const { activeBlock, nextBlock, pastBlocks, upcomingBlocks } = useMemo(() => {
    let active: ScheduleBlock | null = null;
    let next: ScheduleBlock | null = null;
    const past: ScheduleBlock[] = [];
    const upcoming: ScheduleBlock[] = [];

    todaySchedules.forEach((block) => {
      if (currentTime >= block.startTime && currentTime < block.endTime) {
        active = block;
      } else if (currentTime < block.startTime) {
        upcoming.push(block);
        if (!next) {
          next = block;
        }
      } else {
        past.push(block);
      }
    });

    return {
      activeBlock: active,
      nextBlock: next,
      pastBlocks: past,
      upcomingBlocks: upcoming,
    };
  }, [todaySchedules, currentTime]);

  // Activity details helper
  const getActivityDetails = (actId: string): ActivityItem | undefined => {
    return activitiesList.find((a) => a.id === actId);
  };

  // Automated notification check when block starts
  useEffect(() => {
    if (notifPermission !== 'granted') return;
    if (!realDayOfWeek || activeDayOfWeek !== realDayOfWeek) return;

    // Check today's schedules for the current time
    todaySchedules.forEach((block) => {
      const notifKey = `${new Date().toISOString().split('T')[0]}_${block.id}_${block.startTime}`;
      if (currentTime === block.startTime && !notifiedBlocksRef.current.has(notifKey)) {
        notifiedBlocksRef.current.add(notifKey);
        const act = getActivityDetails(block.activityId);
        sendScheduleNotification(block, act?.name || block.activityId, 'start');
      }
    });
  }, [currentTime, notifPermission, todaySchedules, realDayOfWeek, activeDayOfWeek, activitiesList]);

  // Handle request notification permission
  const handleEnableNotifications = async () => {
    const perm = await requestNotificationPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      setNotifBannerFeedback('Notificações de rotina ativadas com sucesso!');
      setTimeout(() => setNotifBannerFeedback(null), 4000);
    } else if (perm === 'denied') {
      setNotifBannerFeedback('Notificações foram bloqueadas no navegador. Verifique as permissões.');
      setTimeout(() => setNotifBannerFeedback(null), 5000);
    }
  };

  // Handle Test Notification
  const handleTestNotification = () => {
    playChimeSound();
    if (todaySchedules.length > 0) {
      const sample = activeBlock || nextBlock || todaySchedules[0];
      const act = getActivityDetails(sample.activityId);
      sendScheduleNotification(sample, act?.name || sample.activityId, 'test');
    } else {
      const dummy: ScheduleBlock = {
        id: 'test',
        turma: activeTurma,
        dayOfWeek: activeDayOfWeek,
        startTime: currentTime,
        endTime: '17:00',
        activityId: 'Natação',
        location: 'Piscina Aquecida',
        guidelines: 'Acompanhar fila de alunos e conferir toucas.',
      };
      sendScheduleNotification(dummy, 'Natação', 'test');
    }
    setNotifBannerFeedback('Alerta de teste enviado com som!');
    setTimeout(() => setNotifBannerFeedback(null), 3000);
  };

  // Highlight block to feature in the main hero card
  const featuredBlock = activeBlock || nextBlock;
  const featuredActivity = featuredBlock ? getActivityDetails(featuredBlock.activityId) : null;
  const featuredRequiresRollCall = featuredActivity?.requiresRollCall !== false;

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5 overflow-hidden transition-all">
      {/* Feedback Toast Banner */}
      {notifBannerFeedback && (
        <div className="p-3 bg-indigo-950 text-indigo-200 border border-indigo-800 rounded-2xl text-xs font-bold flex items-center space-x-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notifBannerFeedback}</span>
        </div>
      )}

      {/* Top Header Row: Status & Live Clock */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full border border-indigo-200">
                Rotina da Monitora
              </span>
              <span className="text-xs font-bold text-slate-500">
                {getDayOfWeekLabel(activeDayOfWeek)} • Turma: <strong className="text-slate-800">{activeTurma}</strong>
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 leading-snug mt-0.5">
              {activeBlock ? (
                <span className="text-emerald-700 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                  Atividade do Momento
                </span>
              ) : nextBlock ? (
                <span className="text-indigo-700 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-500" />
                  Próxima Atividade Programada
                </span>
              ) : todaySchedules.length > 0 ? (
                <span className="text-slate-700">Rotina do Dia Finalizada</span>
              ) : (
                <span className="text-slate-500">Sem Grade Cadastrada para Hoje</span>
              )}
            </h2>
          </div>
        </div>

        {/* Live Clock & Notification Toggle */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Live Clock Pill */}
          <div className="bg-slate-900 text-white px-3 py-1.5 rounded-2xl flex items-center space-x-2 text-xs font-mono font-bold shadow-inner">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              {currentTime}:{String(currentSeconds).padStart(2, '0')}
            </span>
          </div>

          {/* Web Notification Pill / Button */}
          {isNotificationSupported() && (
            <>
              {notifPermission === 'granted' ? (
                <button
                  type="button"
                  onClick={handleTestNotification}
                  title="Notificações ativas. Clique para testar o som do alerta."
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-2xl text-xs font-extrabold flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <BellRing className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                  <span>Notificações Ativas</span>
                  <Volume2 className="w-3 h-3 text-emerald-600 opacity-70" />
                </button>
              ) : notifPermission === 'denied' ? (
                <div
                  title="Notificações bloqueadas pelo navegador. Permita nas configurações da página se desejar alertas sonoros."
                  className="px-3 py-1.5 bg-slate-100 text-slate-500 border border-slate-200 rounded-2xl text-xs font-bold flex items-center space-x-1.5"
                >
                  <BellOff className="w-3.5 h-3.5 text-slate-400" />
                  <span>Notificações Bloqueadas</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleEnableNotifications}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-2xl text-xs font-extrabold flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Bell className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Ativar Alertas Web</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Hero Card: Active or Upcoming Block */}
      {featuredBlock ? (
        <div
          className={`relative rounded-3xl p-5 sm:p-6 border transition-all ${
            activeBlock
              ? 'bg-gradient-to-br from-emerald-50/90 via-teal-50/50 to-white border-emerald-200 shadow-sm'
              : 'bg-gradient-to-br from-indigo-50/90 via-slate-50/60 to-white border-indigo-200 shadow-sm'
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            {/* Left Info Column */}
            <div className="space-y-3 flex-1">
              {/* Timing badge & status */}
              <div className="flex items-center flex-wrap gap-2">
                <span
                  className={`px-3 py-1 rounded-xl text-xs font-black tracking-wide uppercase flex items-center space-x-1.5 ${
                    activeBlock
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-indigo-600 text-white shadow-xs'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {featuredBlock.startTime} às {featuredBlock.endTime}
                  </span>
                </span>

                <span
                  className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg border ${
                    activeBlock
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : 'bg-indigo-100 text-indigo-900 border-indigo-300'
                  }`}
                >
                  {activeBlock ? 'Em Andamento Agora' : 'A Seguir'}
                </span>

                {featuredRequiresRollCall ? (
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                    ✓ Exige Chamada
                  </span>
                ) : (
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                    Rotina / Grade
                  </span>
                )}
              </div>

              {/* Activity Title & Badge */}
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-800 shrink-0">
                  {renderActivityIcon(featuredActivity?.icon, 'w-6 h-6')}
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                    {featuredActivity?.name || featuredBlock.activityId}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Turma: <strong>{featuredBlock.turma}</strong>
                  </p>
                </div>
              </div>

              {/* Location & Guidelines Highlight */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Location / Sala */}
                {featuredBlock.location ? (
                  <div className="bg-white/90 border border-slate-200/90 rounded-2xl p-3 flex items-start space-x-2.5 shadow-2xs">
                    <MapPin className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                        Local / Sala:
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {featuredBlock.location}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/60 border border-slate-200/60 rounded-2xl p-3 flex items-start space-x-2.5">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                        Local:
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">
                        Espaço padrão da modalidade
                      </span>
                    </div>
                  </div>
                )}

                {/* Guidelines / Orientações */}
                {featuredBlock.guidelines ? (
                  <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl p-3 flex items-start space-x-2.5 shadow-2xs">
                    <FileText className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-amber-800 block">
                        Orientações da Coordenação:
                      </span>
                      <span className="text-xs text-amber-950 font-medium leading-snug">
                        {featuredBlock.guidelines}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/60 border border-slate-200/60 rounded-2xl p-3 flex items-start space-x-2.5">
                    <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                        Orientações:
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">
                        Acompanhamento padrão de rotina
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Action Column: Roll Call Shortcut */}
            <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end justify-center gap-2.5 shrink-0 pt-2 lg:pt-0">
              {featuredRequiresRollCall ? (
                <button
                  type="button"
                  onClick={() =>
                    onSelectActivityAndTurma(
                      featuredBlock.activityId,
                      featuredBlock.turma
                    )
                  }
                  className={`px-5 py-3.5 rounded-2xl font-black text-xs sm:text-sm text-white shadow-md transition-all cursor-pointer flex items-center justify-center space-x-2.5 ${
                    activeBlock
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25 ring-2 ring-emerald-400/30'
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/25 ring-2 ring-indigo-400/30'
                  }`}
                >
                  <UserCheck className="w-5 h-5" />
                  <span>Iniciar Chamada Agora</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="p-3 bg-amber-100/70 border border-amber-300/80 rounded-2xl text-center max-w-xs">
                  <span className="text-[11px] font-bold text-amber-900 block">
                    Atividade de Rotina
                  </span>
                  <span className="text-[10px] text-amber-700">
                    Não requer lançamento de presença no diário de classe.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Empty State / No active schedule */
        <div className="p-6 rounded-3xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Sun className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-extrabold text-slate-800">
              {todaySchedules.length > 0
                ? 'Todas as atividades programadas para hoje foram concluídas!'
                : `Nenhum horário cadastrado na grade de ${getDayOfWeekLabel(activeDayOfWeek)} para a turma ${activeTurma}.`}
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Utilize o cronograma abaixo ou acesse a Gestão da Grade para configurar os horários da semana.
            </p>
          </div>
        </div>
      )}

      {/* Cronograma do Dia (Daily Timeline Strip) */}
      <div className="pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
            className="flex items-center space-x-2 text-xs font-extrabold uppercase tracking-wider text-slate-700 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-indigo-500" />
            <span>
              Cronograma do Dia ({todaySchedules.length}{' '}
              {todaySchedules.length === 1 ? 'atividade' : 'atividades'})
            </span>
            {isTimelineExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>
        </div>

        {isTimelineExpanded && (
          <div className="space-y-2">
            {todaySchedules.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium italic p-2">
                Nenhum bloco de horário cadastrado para {activeTurma} neste dia da semana.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {todaySchedules.map((block) => {
                  const act = getActivityDetails(block.activityId);
                  const isCurrent = currentTime >= block.startTime && currentTime < block.endTime;
                  const isPast = currentTime >= block.endTime;
                  const isRollCall = act?.requiresRollCall !== false;

                  return (
                    <div
                      key={block.id}
                      className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-2.5 ${
                        isCurrent
                          ? 'bg-emerald-50/80 border-emerald-300 shadow-sm ring-1 ring-emerald-400/50'
                          : isPast
                          ? 'bg-slate-50/60 border-slate-200 opacity-75'
                          : 'bg-white border-slate-200 hover:border-indigo-300 shadow-2xs'
                      }`}
                    >
                      {/* Top Time + Status */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center space-x-1.5 bg-slate-900 text-white px-2 py-0.5 rounded-lg text-[10px] font-extrabold">
                          <Clock className="w-3 h-3 text-indigo-400" />
                          <span>
                            {block.startTime} - {block.endTime}
                          </span>
                        </div>

                        {isCurrent ? (
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-emerald-600 text-white animate-pulse">
                            Agora
                          </span>
                        ) : isPast ? (
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-600">
                            Finalizado
                          </span>
                        ) : (
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                            A Seguir
                          </span>
                        )}
                      </div>

                      {/* Activity Title */}
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                          {renderActivityIcon(act?.icon, 'w-4 h-4')}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-black text-slate-900 truncate">
                            {act?.name || block.activityId}
                          </h4>
                          {block.location && (
                            <p className="text-[10px] text-slate-500 font-semibold truncate flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5 text-rose-500 shrink-0" />
                              {block.location}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Guidelines (if present) */}
                      {block.guidelines && (
                        <p className="text-[10px] text-slate-600 bg-slate-100/80 p-1.5 rounded-lg line-clamp-2 leading-tight">
                          {block.guidelines}
                        </p>
                      )}

                      {/* Action Button */}
                      {isRollCall && (
                        <button
                          type="button"
                          onClick={() =>
                            onSelectActivityAndTurma(block.activityId, block.turma)
                          }
                          className="w-full mt-1 py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200 rounded-xl text-[10px] font-extrabold transition-colors cursor-pointer flex items-center justify-center space-x-1"
                        >
                          <UserCheck className="w-3 h-3" />
                          <span>Fazer Chamada</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
