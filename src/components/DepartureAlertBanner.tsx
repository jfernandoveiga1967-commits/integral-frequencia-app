import React from 'react';
import { Bell, Clock, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { DepartureAlertItem } from '../utils/departureAlertUtils';

interface DepartureAlertBannerProps {
  alerts: DepartureAlertItem[];
  onDismiss: (alertId: string) => void;
  onDismissAll: () => void;
}

export const DepartureAlertBanner: React.FC<DepartureAlertBannerProps> = ({
  alerts,
  onDismiss,
  onDismissAll,
}) => {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="mb-4 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
      {alerts.map((alert) => {
        const stage = alert.stage || (alert.diffMinutes <= 0 ? '0m' : alert.diffMinutes <= 5 ? '5m' : '10m');

        // Dynamic theme configurations for the 3 stages
        let cardBg = 'bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 border-amber-300/60';
        let stageLabel = '1º Aviso • 10 min antes';
        let stageBadgeStyle = 'bg-black/25 text-amber-200 border-white/20';
        let instructionText = alert.instruction || 'Organizar pertences e mochila do aluno';
        let IconComponent = Clock;
        let isCritical = false;

        if (stage === '5m') {
          cardBg = 'bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 border-orange-300/60 shadow-md';
          stageLabel = '2º Aviso • 5 min antes';
          stageBadgeStyle = 'bg-black/30 text-orange-200 border-white/25';
          instructionText = alert.instruction || 'Encaminhar aluno ao portão / ponto de encontro';
          IconComponent = Bell;
        } else if (stage === '0m') {
          cardBg = 'bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 border-rose-300/80 shadow-lg ring-2 ring-rose-400/40';
          stageLabel = '3º Aviso • Horário Atingido (0 min)';
          stageBadgeStyle = 'bg-black/35 text-rose-200 border-white/30 animate-pulse';
          instructionText = alert.instruction || 'Horário atingido: Aluno liberado';
          IconComponent = AlertTriangle;
          isCritical = true;
        }

        return (
          <div
            key={alert.id}
            className={`p-3.5 sm:p-4 rounded-xl text-white shadow-md border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative overflow-hidden transition-all ${cardBg}`}
          >
            {/* Ambient indicator accent */}
            <div className="absolute top-0 right-0 w-36 h-36 bg-white/10 rounded-full blur-xl pointer-events-none -mr-10 -mt-10" />

            <div className="flex items-start sm:items-center space-x-3 z-10">
              <div className={`p-2.5 bg-white/20 backdrop-blur-xs rounded-xl text-white shrink-0 shadow-xs flex items-center justify-center ${isCritical ? 'animate-pulse' : 'animate-bounce'}`}>
                <IconComponent className="w-5 h-5 text-white" />
              </div>

              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-[10px] uppercase tracking-wider font-black px-2 py-0.5 rounded-full border ${stageBadgeStyle}`}>
                    {stageLabel}
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-white/20 text-white">
                    Turma {alert.turma}
                  </span>
                </div>

                <div className="text-sm sm:text-base font-black tracking-tight flex items-center space-x-2">
                  <span>{alert.studentName}</span>
                </div>

                {/* Direct action instruction */}
                <div className="text-xs font-extrabold text-white flex items-center space-x-1.5 pt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                  <span>{instructionText}</span>
                </div>

                <div className="text-[11px] text-white/90 font-medium flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5">
                  <span className="flex items-center space-x-1 font-bold text-white bg-black/25 px-2 py-0.5 rounded">
                    <Clock className="w-3 h-3 text-white/80" />
                    <span>Saída: {alert.departureTime}</span>
                  </span>
                  <span>(padrão da turma: {alert.standardTime})</span>
                  <span className="font-bold text-white">
                    • {alert.diffMinutes <= 0 ? 'Horário exato atingido' : `Faltam ${alert.diffMinutes} min`}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 self-end sm:self-center z-10 shrink-0">
              <button
                type="button"
                onClick={() => onDismiss(alert.id)}
                className="px-3.5 py-1.5 rounded-lg bg-white/25 hover:bg-white/35 text-white text-xs font-extrabold flex items-center space-x-1 transition-all backdrop-blur-xs cursor-pointer shadow-xs border border-white/30"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>OK, ciente</span>
                <X className="w-3 h-3 ml-1" />
              </button>
            </div>
          </div>
        );
      })}

      {alerts.length > 1 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismissAll}
            className="text-[11px] font-bold text-amber-800 hover:text-amber-950 underline px-2 py-1 cursor-pointer"
          >
            Dispensar todos os avisos ({alerts.length})
          </button>
        </div>
      )}
    </div>
  );
};
