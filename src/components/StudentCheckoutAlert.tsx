import React from 'react';
import { Student } from '../types';
import { PendingEarlyDeparture } from '../utils/departureAlertUtils';
import { CheckCircle2, Loader2 } from 'lucide-react';

export interface StudentCheckoutAlertProps {
  pendingDepartures: PendingEarlyDeparture[];
  turmaName: string;
  onConfirmCheckout?: (student: Student, departureTime: string) => void | Promise<void>;
  isConfirmingId?: string | null;
}

export const StudentCheckoutAlert: React.FC<StudentCheckoutAlertProps> = ({
  pendingDepartures,
  turmaName,
  onConfirmCheckout,
  isConfirmingId,
}) => {
  // Se a turma não tiver alunos com saída antecipada pendente, o bloco NÃO deve ser exibido.
  if (!pendingDepartures || pendingDepartures.length === 0) {
    return null;
  }

  return (
    <div className="bg-amber-500/10 border border-amber-300/80 rounded-xl p-2.5 space-y-1.5 shadow-2xs animate-in fade-in duration-200">
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center space-x-1.5 text-[11px] font-black text-amber-950">
          <span className="text-sm">🏃</span>
          <span>Saída Antecipada Hoje:</span>
        </div>
        <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded-md">
          {pendingDepartures.length} {pendingDepartures.length === 1 ? 'aluno pendente' : 'alunos pendentes'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs text-amber-950">
        {pendingDepartures.map(({ student, departureTime }) => {
          const isConfirming = isConfirmingId === student.id;

          return (
            <div
              key={student.id}
              className="inline-flex items-center space-x-1.5 bg-white border border-amber-300/90 rounded-lg px-2 py-1 shadow-2xs"
            >
              <span className="font-bold text-slate-900">
                • {student.name}
              </span>
              {student.tipoSaida === 'TRANSPORTE_ESCOLAR' ? (
                <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-amber-100 text-amber-950 border border-amber-300">
                  <span>🚌</span>
                  <span>{student.nomeCondutor || 'Transp'}</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[9.5px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  <span>🚗</span>
                  <span>Pais</span>
                </span>
              )}
              <span className="font-extrabold text-amber-900 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded text-[10px]">
                ({departureTime})
              </span>

              {onConfirmCheckout && (
                <button
                  type="button"
                  onClick={() => onConfirmCheckout(student, departureTime)}
                  disabled={Boolean(isConfirmingId)}
                  className="ml-0.5 p-0.5 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 rounded transition-colors cursor-pointer disabled:opacity-50 flex items-center"
                  title={`Dar baixa / confirmar saída de ${student.name} às ${departureTime}`}
                >
                  {isConfirming ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 hover:scale-110 transition-transform" />
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StudentCheckoutAlert;
