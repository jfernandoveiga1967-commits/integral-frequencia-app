import React, { useState, useEffect } from 'react';
import {
  Student,
  AttendanceRecord,
  ActivityType,
  AttendanceStatus,
  WeekInfo,
  UserProfile,
  ActivityItem,
} from '../types';
import { ActivityBadge } from './ActivityBadge';
import { StatusBadge } from './StatusBadge';
import {
  formatDateBR,
  formatDiasFrequencia,
  formatHorarioSaida,
} from '../utils/dateUtils';
import {
  CheckCircle2,
  Clock,
  Shirt,
  XCircle,
  FileText,
} from 'lucide-react';

function getCurrentHHMM(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

interface ActivityControlProps {
  act: ActivityType;
  student: Student;
  selectedDate: string;
  rec?: AttendanceRecord;
  actMeta?: ActivityItem;
  onStatusChange: (
    student: Student,
    activity: ActivityType,
    date: string,
    status: AttendanceStatus,
    equipmentDetails?: string,
    obs?: string,
    exitTimeParam?: string
  ) => void | Promise<void>;
}

const StudentActivityControl: React.FC<ActivityControlProps> = React.memo(
  ({ act, student, selectedDate, rec, actMeta, onStatusChange }) => {
    const currentStatus = rec?.status;
    const [localObs, setLocalObs] = useState<string>(rec?.observation || '');

    useEffect(() => {
      setLocalObs(rec?.observation || '');
    }, [rec?.observation]);

    return (
      <div
        className={`p-3 rounded-xl border transition-all ${
          currentStatus === 'presente'
            ? 'bg-emerald-50/60 border-emerald-200'
            : currentStatus === 'saida_antecipada'
            ? 'bg-amber-50/90 border-amber-200'
            : currentStatus === 'sem_equipamento'
            ? 'bg-orange-50/80 border-orange-200'
            : currentStatus === 'falta'
            ? 'bg-rose-50/80 border-rose-200'
            : 'bg-amber-50/30 border-amber-200/80'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <ActivityBadge
              activity={act}
              iconName={actMeta?.icon}
              customIconUrl={actMeta?.customIconUrl}
              customEquipment={actMeta?.defaultEquipment}
              size="sm"
            />
            {rec ? (
              <StatusBadge
                status={rec.status}
                equipmentDetails={rec.equipmentMissingDetails}
                exitTime={rec.exitTime}
                size="sm"
              />
            ) : (
              <StatusBadge status="pendente" size="sm" />
            )}
          </div>

          {/* Attendance Status Action Buttons */}
          <div className="flex flex-wrap sm:flex-nowrap gap-1.5 w-full lg:w-auto print:hidden no-print">
            {/* 1. PRESENTE */}
            <button
              type="button"
              onClick={() => onStatusChange(student, act, selectedDate, 'presente')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 border flex-1 sm:flex-none ${
                currentStatus === 'presente'
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                  : 'bg-white hover:bg-emerald-50 text-emerald-800 border-slate-200 hover:border-emerald-300'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Presente</span>
            </button>

            {/* 2. SAÍDA ANTECIPADA */}
            <button
              type="button"
              onClick={() => onStatusChange(student, act, selectedDate, 'saida_antecipada')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 border flex-1 sm:flex-none ${
                currentStatus === 'saida_antecipada'
                  ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                  : 'bg-white hover:bg-amber-50 text-amber-900 border-slate-200 hover:border-amber-300'
              }`}
              title="Registrar saída antecipada com horário de saída"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Saída Ant.</span>
            </button>

            {/* 3. SEM EQUIPAMENTO */}
            <button
              type="button"
              onClick={() => onStatusChange(student, act, selectedDate, 'sem_equipamento')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 border flex-1 sm:flex-none ${
                currentStatus === 'sem_equipamento'
                  ? 'bg-orange-600 text-white border-orange-700 shadow-xs'
                  : 'bg-white hover:bg-orange-50 text-orange-900 border-slate-200 hover:border-orange-300'
              }`}
              title="Ausência por falta de uniforme, flauta ou material"
            >
              <Shirt className="w-3.5 h-3.5" />
              <span>Sem Equip.</span>
            </button>

            {/* 4. FALTA */}
            <button
              type="button"
              onClick={() => onStatusChange(student, act, selectedDate, 'falta')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 border flex-1 sm:flex-none ${
                currentStatus === 'falta'
                  ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                  : 'bg-white hover:bg-rose-50 text-rose-800 border-slate-200 hover:border-rose-300'
              }`}
              title="Ausência por falta geral não justificada"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Falta</span>
            </button>
          </div>
        </div>

        {/* Inline Time Picker for Saída Antecipada */}
        {currentStatus === 'saida_antecipada' && (
          <div className="mt-2.5 pt-2 border-t border-amber-200 flex items-center space-x-2 bg-amber-50/90 px-3 py-1.5 rounded-lg border border-amber-200">
            <Clock className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="text-xs font-bold text-amber-900">Horário da Saída:</span>
            <input
              type="time"
              value={rec?.exitTime || getCurrentHHMM()}
              onChange={(e) => {
                onStatusChange(
                  student,
                  act,
                  selectedDate,
                  'saida_antecipada',
                  rec?.equipmentMissingDetails,
                  rec?.observation,
                  e.target.value
                );
              }}
              className="text-xs font-bold px-2 py-0.5 border border-amber-300 rounded bg-white text-amber-950 focus:ring-2 focus:ring-amber-500 outline-none"
            />
            <span className="text-[11px] text-amber-800 font-medium hidden sm:inline">
              (Alteração de horário em tempo real)
            </span>
          </div>
        )}

        {/* Optional Observation input with local state */}
        <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center space-x-2 print:hidden no-print">
          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Observação opcional (ex: Atestado médico entregue, aviso dos pais)..."
            value={localObs}
            onChange={(e) => setLocalObs(e.target.value)}
            onBlur={(e) => {
              if (currentStatus && e.target.value !== (rec?.observation || '')) {
                onStatusChange(
                  student,
                  act,
                  selectedDate,
                  currentStatus,
                  rec?.equipmentMissingDetails,
                  e.target.value
                );
              }
            }}
            className="w-full text-xs px-2.5 py-1 border border-slate-200 rounded-md bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>
    );
  }
);

export interface StudentAttendanceItemProps {
  student: Student;
  selectedDate: string;
  selectedActivity: ActivityType | 'TODAS';
  allowedActivityIds: ActivityType[];
  activityMap: Map<string, ActivityItem>;
  isCoordenador: boolean;
  currentWeek: WeekInfo;
  currentUser?: UserProfile | null;
  isReforcoStudent: boolean;
  departureTimeToday?: string;
  activitiesToDisplay: ActivityType[];
  recordSignature: string;
  recordsForStudent: Record<string, AttendanceRecord | undefined>;
  reforcoRecord?: AttendanceRecord;
  onStatusChange: (
    student: Student,
    activity: ActivityType,
    date: string,
    status: AttendanceStatus,
    equipmentDetails?: string,
    obs?: string,
    exitTimeParam?: string
  ) => void | Promise<void>;
  onSaveRecord: (record: Omit<AttendanceRecord, 'id' | 'createdAt'>) => Promise<void> | void;
}

export const StudentAttendanceItem: React.FC<StudentAttendanceItemProps> = React.memo(
  function StudentAttendanceItem({
    student,
    selectedDate,
    selectedActivity,
    allowedActivityIds,
    activityMap,
    isCoordenador,
    currentWeek,
    isReforcoStudent,
    departureTimeToday,
    activitiesToDisplay,
    recordsForStudent,
    reforcoRecord,
    onStatusChange,
    onSaveRecord,
  }) {
    const isEncaminhado = Boolean(
      reforcoRecord?.observation?.includes('Reforço') ||
        reforcoRecord?.observation?.includes('Encaminhado')
    );
    const targetReforcoAct = (selectedActivity === 'TODAS' ? 'Rotina' : selectedActivity) as ActivityType;

    return (
      <div
        className={`p-4 transition-colors space-y-3 ${
          isReforcoStudent
            ? 'bg-amber-50/40 border-l-4 border-l-amber-500'
            : 'hover:bg-slate-50/80'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Student Info */}
          <div className="flex items-start space-x-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center shrink-0 border border-indigo-200">
              {student.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-slate-900 text-sm md:text-base">
                  {student.name}
                </h3>
                {isReforcoStudent && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-xs animate-pulse flex items-center space-x-1">
                    <span>⚡ ENVIAR PARA O REFORÇO</span>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                <span className="font-medium px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700">
                  {student.turma}
                </span>
                {isReforcoStudent && (
                  <button
                    type="button"
                    onClick={() => {
                      onSaveRecord({
                        studentId: student.id,
                        activity: targetReforcoAct,
                        turma: student.turma,
                        date: selectedDate,
                        weekNumber: currentWeek.weekNumber,
                        year: currentWeek.year,
                        status: 'presente',
                        observation: 'Encaminhado para a sala de Reforço',
                      });
                    }}
                    className={`text-[10px] font-black px-2.5 py-0.5 rounded-lg border transition-all cursor-pointer shadow-2xs flex items-center space-x-1 ${
                      isEncaminhado
                        ? 'bg-amber-600 text-white border-amber-700'
                        : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300'
                    }`}
                    title="Registrar que o aluno foi encaminhado à sala de reforço"
                  >
                    <span>
                      {isEncaminhado
                        ? '✅ Encaminhado ao Reforço'
                        : '👉 Confirmar Envio ao Reforço'}
                    </span>
                  </button>
                )}
                {student.tipoContrato === 'avulso' && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs flex items-center space-x-0.5"
                    title={`Contrato Avulso / Temporário (${
                      student.dataInicioContrato
                        ? formatDateBR(student.dataInicioContrato)
                        : ''
                    } até ${
                      student.dataTerminoContrato
                        ? formatDateBR(student.dataTerminoContrato)
                        : ''
                    })`}
                  >
                    <span>⚡ Avulso</span>
                  </span>
                )}
                {student.diasFrequencia && student.diasFrequencia.length < 5 && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200"
                    title="Grade parcial de frequência semanal"
                  >
                    {formatDiasFrequencia(student.diasFrequencia)}
                  </span>
                )}
                {departureTimeToday && (
                  <span
                    className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-900 border border-indigo-200 flex items-center space-x-1 shadow-2xs"
                    title={`Horário de saída cadastrado para ${formatDateBR(
                      selectedDate
                    )}: ${departureTimeToday}`}
                  >
                    <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>⏱️ Saída às {formatHorarioSaida(departureTimeToday)}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Extracurricular Activities badges for this student */}
          <div className="flex flex-wrap items-center gap-1.5">
            {student.activities.map((act) => {
              const isAllowed = allowedActivityIds.includes(act as ActivityType);
              if (!isCoordenador && !isAllowed) return null;
              const actMeta = activityMap.get(act);
              return (
                <span key={act} className="opacity-90">
                  <ActivityBadge
                    activity={act}
                    iconName={actMeta?.icon}
                    customIconUrl={actMeta?.customIconUrl}
                    customEquipment={actMeta?.defaultEquipment}
                    size="sm"
                  />
                </span>
              );
            })}
          </div>
        </div>

        {/* Attendance Controls per Activity */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          {activitiesToDisplay.map((act) => {
            const rec = recordsForStudent[act];
            const actMeta = activityMap.get(act);
            return (
              <StudentActivityControl
                key={act}
                act={act}
                student={student}
                selectedDate={selectedDate}
                rec={rec}
                actMeta={actMeta}
                onStatusChange={onStatusChange}
              />
            );
          })}
        </div>
      </div>
    );
  },
  (prev, next) => {
    // Comparação de propriedades rasas para ignorar re-renders desnecessários
    if (prev.student !== next.student) return false;
    if (prev.selectedDate !== next.selectedDate) return false;
    if (prev.selectedActivity !== next.selectedActivity) return false;
    if (prev.isReforcoStudent !== next.isReforcoStudent) return false;
    if (prev.departureTimeToday !== next.departureTimeToday) return false;
    if (prev.isCoordenador !== next.isCoordenador) return false;
    if (prev.currentUser?.id !== next.currentUser?.id) return false;
    if (prev.onStatusChange !== next.onStatusChange) return false;
    if (prev.onSaveRecord !== next.onSaveRecord) return false;
    if (prev.recordSignature !== next.recordSignature) return false;
    return true;
  }
);
