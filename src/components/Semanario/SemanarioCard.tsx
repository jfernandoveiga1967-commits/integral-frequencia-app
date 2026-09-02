import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  RefreshCw,
  Edit3,
  Trash2,
  Copy,
  ChevronDown,
  Calendar,
} from 'lucide-react';
import { SemanarioPlan, SemanarioStatus } from '../../types';
import { getCategoryBadgeStyle, getStatusStyle } from '../../utils/semanarioUtils';

interface SemanarioCardProps {
  plan: SemanarioPlan;
  onEdit: (plan: SemanarioPlan) => void;
  onDelete: (planId: string) => void;
  onDuplicate: (plan: SemanarioPlan) => void;
  onStatusChange: (planId: string, newStatus: SemanarioStatus, reason?: string) => void;
  onRegenerateWithAI?: (plan: SemanarioPlan) => void;
  isCoordinator?: boolean;
}

const DAY_LABELS: Record<string, string> = {
  segunda: 'Segunda-feira',
  terca: 'Terça-feira',
  quarta: 'Quarta-feira',
  quinta: 'Quinta-feira',
  sexta: 'Sexta-feira',
};

export const SemanarioCard: React.FC<SemanarioCardProps> = ({
  plan,
  onEdit,
  onDelete,
  onDuplicate,
  onStatusChange,
  isCoordinator = true,
}) => {
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const categoryStyle = getCategoryBadgeStyle(plan.category);
  const statusStyle = getStatusStyle(plan.status);
  const dayLabel = DAY_LABELS[plan.dayOfWeek] || plan.dayOfWeek || 'Dia';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all duration-200 flex flex-col justify-between overflow-hidden group">
      {/* Top Section: Category Badge & Time */}
      <div className="p-4 pb-3 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between gap-2">
          {/* Category Badge */}
          <span
            className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-extrabold border shadow-2xs ${categoryStyle.bg} ${categoryStyle.text} ${categoryStyle.border}`}
          >
            <span className={`w-2 h-2 rounded-full ${categoryStyle.dot}`} />
            <span className="truncate max-w-[180px]">{plan.category}</span>
          </span>

          {/* Time Slot */}
          {plan.timeSlot ? (
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200/80 shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span>{plan.timeSlot}</span>
            </span>
          ) : (
            <span className="text-[11px] font-medium text-slate-400">Horário livre</span>
          )}
        </div>
      </div>

      {/* Middle Section: Turma & Day of the Week */}
      <div className="px-4 py-3 bg-white flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-extrabold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
            {plan.turma}
          </span>
          <span className="inline-flex items-center space-x-1 text-xs font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200/70">
            <Calendar className="w-3 h-3 text-slate-400" />
            <span>{dayLabel}</span>
          </span>
        </div>
      </div>

      {/* Bottom Section: Status Selector & Actions */}
      <div className="p-3 pt-2.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between gap-2">
        {/* Status Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-2xs ${statusStyle.bg}`}
            title="Alterar status de execução"
          >
            {plan.status === 'realizada' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
            {plan.status === 'pendente' && <Clock className="w-3.5 h-3.5 text-slate-500" />}
            {plan.status === 'substituida' && <RefreshCw className="w-3.5 h-3.5 text-amber-600" />}
            <span>{statusStyle.label}</span>
            <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
          </button>

          {showStatusMenu && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setShowStatusMenu(false)}
              />
              <div className="absolute left-0 bottom-full mb-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 animate-in fade-in zoom-in-95">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Status da Atividade
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onStatusChange(plan.id, 'realizada');
                    setShowStatusMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center space-x-2 hover:bg-emerald-50 text-emerald-800 transition-colors cursor-pointer ${
                    plan.status === 'realizada' ? 'bg-emerald-50/70 font-black' : ''
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Realizada</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onStatusChange(plan.id, 'pendente');
                    setShowStatusMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center space-x-2 hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer ${
                    plan.status === 'pendente' ? 'bg-slate-100 font-black' : ''
                  }`}
                >
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span>Pendente</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowStatusMenu(false);
                    onEdit({ ...plan, status: 'substituida' });
                  }}
                  className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center space-x-2 hover:bg-amber-50 text-amber-900 transition-colors cursor-pointer ${
                    plan.status === 'substituida' ? 'bg-amber-50/70 font-black' : ''
                  }`}
                >
                  <RefreshCw className="w-4 h-4 text-amber-600" />
                  <span>Substituída...</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => onDuplicate(plan)}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
            title="Duplicar Atividade"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onEdit(plan)}
            className="px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200/70 transition-colors flex items-center space-x-1 cursor-pointer shadow-2xs"
            title="Editar Proposta"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Editar</span>
          </button>

          {isCoordinator && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Excluir a atividade de "${plan.category}" (${plan.timeSlot})?`)) {
                  onDelete(plan.id);
                }
              }}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              title="Excluir Atividade"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

