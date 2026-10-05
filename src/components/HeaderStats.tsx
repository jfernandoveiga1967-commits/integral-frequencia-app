import React from 'react';
import { Users, X } from 'lucide-react';

export interface HeaderStatsProps {
  totalStudents: number;
  totalAtivosHoje?: number;
  totalMatriculados?: number;
  presentesHoje?: number;
  faltasHoje?: number;
  justificadosHoje?: number;
  pendentesHoje?: number;
  selectedTurma?: string;
  onNavigateToPending?: () => void;
  isOffline?: boolean;
  isSyncing?: boolean;
  onClearTurmaFilter?: () => void;
}

export const HeaderStats: React.FC<HeaderStatsProps> = ({
  totalStudents,
  totalAtivosHoje,
  totalMatriculados,
  presentesHoje = 0,
  faltasHoje = 0,
  justificadosHoje = 0,
  pendentesHoje = 0,
  selectedTurma,
  onNavigateToPending,
  isOffline = false,
  isSyncing = false,
  onClearTurmaFilter,
}) => {
  const isTurmaContextActive = Boolean(
    selectedTurma && selectedTurma !== 'TODAS' && selectedTurma !== 'all' && selectedTurma !== 'Todas as Turmas'
  );

  return (
    <div className="flex flex-wrap items-center justify-start md:justify-end gap-2 sm:gap-2.5 text-xs text-slate-300 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm select-none">
      {/* Indicador Contextual da Turma Selecionada (Destaque visual para as Monitoras) */}
      {isTurmaContextActive && (
        <>
          <div
            className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-lg bg-indigo-500/25 text-indigo-200 border border-indigo-400/40 text-[11px] font-black shadow-xs animate-in fade-in zoom-in-95 duration-150"
            title={`Painel contextualizado: exibindo métricas exclusivas da Turma ${selectedTurma}`}
          >
            <Users className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span className="truncate max-w-[130px] sm:max-w-[190px]">Turma: {selectedTurma}</span>
            {onClearTurmaFilter && (
              <button
                type="button"
                onClick={onClearTurmaFilter}
                className="p-0.5 hover:bg-white/10 rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer ml-0.5"
                title="Voltar para visão consolidada de todas as turmas"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="h-3.5 w-px bg-slate-700 hidden sm:block" />
        </>
      )}

      {/* 1. Esperados Hoje */}
      <div
        className="flex items-center space-x-1.5"
        title={
          isTurmaContextActive
            ? `Alunos da turma ${selectedTurma} com frequência programada para hoje`
            : 'Alunos ativos com frequência agendada para hoje (conforme escala)'
        }
      >
        <span className="text-slate-400 font-medium">Esperados Hoje:</span>
        <span className="font-extrabold text-indigo-300">
          {totalAtivosHoje !== undefined ? totalAtivosHoje : totalStudents}
        </span>
      </div>

      <div className="h-3.5 w-px bg-slate-700 hidden sm:block" />

      {/* 2. Total Matriculados */}
      <div
        className="flex items-center space-x-1.5"
        title={
          isTurmaContextActive
            ? `Total de alunos ativos matriculados na turma ${selectedTurma}`
            : 'Total geral de alunos matriculados na escola'
        }
      >
        <span className="text-slate-400 font-medium">Total Matriculados:</span>
        <span className="font-bold text-slate-300">
          {totalMatriculados !== undefined ? totalMatriculados : totalStudents}
        </span>
      </div>

      <div className="h-3.5 w-px bg-slate-700 hidden sm:block" />

      {/* 3. Presentes */}
      <div
        className="flex items-center space-x-1.5"
        title={
          isOffline
            ? 'Modo Offline: exibindo presenças locais'
            : isSyncing
            ? 'Sincronizando presenças em tempo real...'
            : isTurmaContextActive
            ? `Presenças confirmadas hoje na turma ${selectedTurma}`
            : 'Alunos presentes hoje no Integral'
        }
      >
        <span
          className={`inline-block w-2 h-2 rounded-full shrink-0 transition-colors ${
            isOffline
              ? 'bg-slate-500'
              : isSyncing
              ? 'bg-amber-400 animate-ping'
              : 'bg-emerald-400 animate-pulse'
          }`}
        />
        <span className="text-slate-400 font-medium">Presentes:</span>
        <span className={`font-extrabold ${isOffline ? 'text-emerald-500/80' : 'text-emerald-400'}`}>
          {presentesHoje}
        </span>
      </div>

      <div className="h-3.5 w-px bg-slate-700 hidden sm:block" />

      {/* 4. Faltas */}
      <div
        className="flex items-center space-x-1.5"
        title={
          isTurmaContextActive
            ? `Faltas confirmadas hoje na turma ${selectedTurma}`
            : 'Faltas não justificadas hoje no Integral'
        }
      >
        <span className="text-slate-400 font-medium">Faltas:</span>
        <span className={`font-extrabold ${faltasHoje > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
          {faltasHoje}
        </span>
      </div>

      {/* 5. Atestados / Justificados */}
      {justificadosHoje > 0 && (
        <>
          <div className="h-3.5 w-px bg-slate-700 hidden sm:block" />
          <div
            className="flex items-center space-x-1.5"
            title={
              isTurmaContextActive
                ? `Ausências justificadas com atestado na turma ${selectedTurma}`
                : 'Ausências justificadas com atestado hoje'
            }
          >
            <span className="text-slate-400 font-medium">Atestados:</span>
            <span className="font-extrabold text-amber-400">{justificadosHoje}</span>
          </div>
        </>
      )}

      {/* 6. Pendentes */}
      {pendentesHoje > 0 && (
        <>
          <div className="h-3.5 w-px bg-slate-700 hidden sm:block" />
          <button
            type="button"
            onClick={onNavigateToPending}
            title={
              isTurmaContextActive
                ? `Existem ${pendentesHoje} alunos da turma ${selectedTurma} aguardando chamada de rotina. Clique para conferir.`
                : `Existem ${pendentesHoje} alunos aguardando chamada de rotina. Clique para conferir.`
            }
            className="flex items-center space-x-1 px-1.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors cursor-pointer"
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 ${
                isOffline ? '' : 'animate-ping'
              }`}
            />
            <span className="font-medium text-[11px]">Pendentes:</span>
            <span className="font-extrabold text-amber-300 text-[11px]">{pendentesHoje}</span>
          </button>
        </>
      )}
    </div>
  );
};
