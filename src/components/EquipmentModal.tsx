import React, { useState } from 'react';
import { ActivityType } from '../types';
import { Shirt, X, Check } from 'lucide-react';
import { activityConfig } from './ActivityBadge';

interface EquipmentModalProps {
  isOpen: boolean;
  studentName: string;
  activity: ActivityType;
  initialDetails?: string;
  onSave: (details: string) => void;
  onClose: () => void;
}

export const EquipmentModal: React.FC<EquipmentModalProps> = ({
  isOpen,
  studentName,
  activity,
  initialDetails = '',
  onSave,
  onClose,
}) => {
  const [details, setDetails] = useState(initialDetails);

  if (!isOpen) return null;

  const activityInfo = activityConfig[activity];

  const quickOptionsMap: Record<ActivityType, string[]> = {
    Natação: ['Sem maiô/sunga', 'Sem touca de natação', 'Sem óculos de natação', 'Esqueceu a toalha/chinelo', 'Sem sunga/maiô e touca'],
    Balé: ['Sem sapatilha de balé', 'Sem colan/meia-calça', 'Sem roupa de balé', 'Sem coque no cabelo'],
    Dança: ['Sem calçado de dança', 'Sem uniforme de dança', 'Com roupa inadequada'],
    Judô: ['Sem kimono completo', 'Sem calça do kimono', 'Sem faixa de judô', 'Kimono em tamanho incorreto'],
    Futebol: ['Sem chuteira/tênis de futsal', 'Sem meião de futebol', 'Sem uniforme de futebol', 'Sem caneleira'],
    Ginástica: ['Sem uniforme de ginástica', 'Sem sapatilha/meia'],
    Flauta: ['Esqueceu a Flauta Doce', 'Sem a pasta de partituras/músicas', 'Flauta danificada/sem instrumento', 'Esqueceu flauta e apostila'],
  };

  const currentQuickOptions = quickOptionsMap[activity] || ['Sem uniforme adequado', 'Esqueceu o equipamento necessário'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(details || 'Sem equipamento necessário');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-orange-50 border-b border-orange-100 p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Shirt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Falta de Equipamento / Uniforme</h3>
              <p className="text-xs text-orange-800 font-medium">
                Atividade: <span className="font-semibold">{activity}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-orange-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Aluno(a):
            </label>
            <div className="text-base font-bold text-slate-900 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              {studentName}
            </div>
          </div>

          <div className="text-xs text-slate-600 bg-amber-50/80 border border-amber-200 p-2.5 rounded-lg">
            <span className="font-semibold text-amber-900">Equipamento Padrão ({activity}): </span>
            {activityInfo?.equipmentHint}
          </div>

          {/* Quick Select Options */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Opções Rápidas:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {currentQuickOptions.map((opt) => (
                <button
                  type="button"
                  key={opt}
                  onClick={() => setDetails(opt)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                    details === opt
                      ? 'bg-orange-600 text-white border-orange-700 font-semibold shadow-xs'
                      : 'bg-slate-50 hover:bg-orange-50 text-slate-700 border-slate-200 hover:border-orange-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Text Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Descrição Detalhada do Equipamento Faltante:
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Ex: Esqueceu a flauta doce em casa; ou Veio de uniforme comum sem sunga de natação..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-slate-800"
              required
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-md shadow-orange-600/20 transition-all cursor-pointer flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Confirmar Ausência</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
