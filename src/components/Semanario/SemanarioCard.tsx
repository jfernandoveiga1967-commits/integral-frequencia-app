import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Clock,
  RefreshCw,
  Edit3,
  Trash2,
  Image as ImageIcon,
  Copy,
  Layers,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Maximize2,
  X,
  AlertCircle,
  FileText,
  User,
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

export const SemanarioCard: React.FC<SemanarioCardProps> = ({
  plan,
  onEdit,
  onDelete,
  onDuplicate,
  onStatusChange,
  onRegenerateWithAI,
  isCoordinator = true,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const categoryStyle = getCategoryBadgeStyle(plan.category);
  const statusStyle = getStatusStyle(plan.status);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden group">
      {/* Top Bar / Category & Status */}
      <div className="p-4 pb-3 flex items-start justify-between gap-2 border-b border-slate-100 bg-slate-50/50">
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          <span
            className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${categoryStyle.bg} ${categoryStyle.text} ${categoryStyle.border}`}
          >
            <span className={`w-2 h-2 rounded-full ${categoryStyle.dot}`} />
            <span className="truncate max-w-[200px]">{plan.category}</span>
          </span>

          {plan.timeSlot && (
            <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-600 bg-white border border-slate-200">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{plan.timeSlot}</span>
            </span>
          )}

          <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
            {plan.turma}
          </span>
        </div>

        {/* Status Dropdown / Button */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${statusStyle.bg}`}
            title="Alterar status de execução da proposta"
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
              <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 animate-in fade-in zoom-in-95">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Status da Atividade
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onStatusChange(plan.id, 'realizada');
                    setShowStatusMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center space-x-2 hover:bg-emerald-50 text-emerald-800 transition-colors ${
                    plan.status === 'realizada' ? 'bg-emerald-50/70' : ''
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
                  className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center space-x-2 hover:bg-slate-50 text-slate-700 transition-colors ${
                    plan.status === 'pendente' ? 'bg-slate-100' : ''
                  }`}
                >
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span>Pendente</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowStatusMenu(false);
                    // Opens modal to edit and set replacement reason + photos
                    onEdit({ ...plan, status: 'substituida' });
                  }}
                  className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center space-x-2 hover:bg-amber-50 text-amber-900 transition-colors ${
                    plan.status === 'substituida' ? 'bg-amber-50/70' : ''
                  }`}
                >
                  <RefreshCw className="w-4 h-4 text-amber-600" />
                  <span>Substituída...</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          {plan.weekTheme && (
            <div className="mb-1.5 inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200/80 text-[11px] font-bold text-amber-900">
              <span className="text-amber-600">Tema:</span>
              <span className="truncate max-w-[240px]">{plan.weekTheme}</span>
            </div>
          )}

          <h4 className="text-sm font-extrabold text-slate-900 leading-snug group-hover:text-indigo-950 transition-colors">
            {plan.title}
          </h4>

          {/* Substituted Notice Box */}
          {plan.status === 'substituida' && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Motivo da Substituição: </span>
                <span className="text-amber-800">
                  {plan.substitutionReason || 'Atividade alterada pela coordenação/monitoria.'}
                </span>
              </div>
            </div>
          )}

          {/* Objectives Summary or Description excerpt */}
          {plan.objectives ? (
            <div className="mt-2 text-xs text-slate-600">
              <span className="font-bold text-slate-700">Objetivos & BNCC: </span>
              <span className="line-clamp-2">{plan.objectives}</span>
            </div>
          ) : plan.development ? (
            <div className="mt-2 text-xs text-slate-600">
              <span className="font-bold text-slate-700">Descrição: </span>
              <span className="line-clamp-2">{plan.development}</span>
            </div>
          ) : null}

          {/* Collapsible Full Details */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5 text-xs text-slate-700 animate-in fade-in duration-200">
              {plan.development && (
                <div>
                  <div className="font-bold text-slate-900 flex items-center space-x-1.5 mb-1">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Descrição / Passo a Passo:</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 text-slate-700 whitespace-pre-line leading-relaxed">
                    {plan.development}
                  </div>
                </div>
              )}

              {plan.objectives && (
                <div>
                  <div className="font-bold text-slate-900 flex items-center space-x-1.5 mb-1">
                    <FileText className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Objetivos & BNCC:</span>
                  </div>
                  <div className="bg-emerald-50/50 p-2 rounded-xl border border-emerald-200/60 text-slate-700">
                    {plan.objectives}
                  </div>
                </div>
              )}

              {plan.materials && (
                <div>
                  <div className="font-bold text-slate-900 flex items-center space-x-1.5 mb-1">
                    <Layers className="w-3.5 h-3.5 text-amber-600" />
                    <span>Materiais & Recursos:</span>
                  </div>
                  <div className="bg-amber-50/50 p-2 rounded-xl border border-amber-200/60 text-slate-700">
                    {plan.materials}
                  </div>
                </div>
              )}

              {(plan.adiResponsible || plan.monitors || plan.teacherName) && (
                <div className="space-y-1 pt-1">
                  {plan.adiResponsible && (
                    <div className="flex items-center space-x-1.5 text-slate-600">
                      <User className="w-3.5 h-3.5 text-indigo-500" />
                      <span>ADI Responsável: </span>
                      <span className="font-bold text-slate-800">{plan.adiResponsible}</span>
                    </div>
                  )}
                  {plan.monitors && (
                    <div className="flex items-center space-x-1.5 text-slate-600">
                      <User className="w-3.5 h-3.5 text-teal-500" />
                      <span>Monitora(s): </span>
                      <span className="font-bold text-slate-800">{plan.monitors}</span>
                    </div>
                  )}
                  {!plan.adiResponsible && !plan.monitors && plan.teacherName && (
                    <div className="flex items-center space-x-1.5 text-slate-600">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>Responsável: </span>
                      <span className="font-bold text-slate-800">{plan.teacherName}</span>
                    </div>
                  )}
                </div>
              )}

              {plan.notes && (
                <div className="text-[11px] text-slate-500 italic pt-1">
                  Obs: {plan.notes}
                </div>
              )}
            </div>
          )}

          {/* Photo Attachments Preview Strip */}
          {plan.photos && plan.photos.length > 0 && (
            <div className="mt-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1.5">
                <span className="flex items-center space-x-1">
                  <ImageIcon className="w-3 h-3 text-indigo-500" />
                  <span>Evidências Pedagógicas ({plan.photos.length})</span>
                </span>
                <span className="text-[10px] text-slate-400">Clique para ampliar</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {plan.photos.map((photo, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedPhoto(photo)}
                    className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-200 hover:border-indigo-500 transition-colors shrink-0 group/img cursor-pointer"
                  >
                    <img
                      src={photo}
                      alt={`Evidência ${idx + 1}`}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                      <Maximize2 className="w-3 h-3 text-white" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Card Footer Actions */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
          >
            <span>{expanded ? 'Menos Detalhes' : 'Ver Detalhes'}</span>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <div className="flex items-center space-x-1">
            {onRegenerateWithAI && (
              <button
                type="button"
                onClick={() => onRegenerateWithAI(plan)}
                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                title="Regerar Proposta Pedagógica com IA"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onDuplicate(plan)}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Duplicar Proposta"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onEdit(plan)}
              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
              title="Editar Proposta"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>

            {isCoordinator && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Excluir a proposta "${plan.title}"?`)) {
                    onDelete(plan.id);
                  }
                }}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                title="Excluir Proposta"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox Photo Preview Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative max-w-3xl w-full bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-800">
            <div className="p-4 flex items-center justify-between border-b border-slate-800 text-white">
              <div className="flex items-center space-x-2">
                <ImageIcon className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold">Evidência Pedagógica • {plan.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={selectedPhoto}
                alt="Foto ampliada da atividade"
                className="max-h-[70vh] w-auto rounded-2xl object-contain shadow-lg"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
