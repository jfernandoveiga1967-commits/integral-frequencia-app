import React, { useState } from 'react';
import { Bell, Clock, Volume2, Check, X, Sparkles, ShieldCheck } from 'lucide-react';
import { DepartureAlertSettings, UserProfile } from '../types';
import { saveDepartureAlertSettings } from '../firebase';
import {
  playDepartureAlertSound,
  isAudioNotificationsEnabled,
  unlockAudioContextAndPlayTest,
} from '../utils/notificationUtils';

interface DepartureAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: DepartureAlertSettings;
  currentUser: UserProfile | null;
  onSettingsUpdated: (newSettings: DepartureAlertSettings) => void;
}

export const DepartureAlertModal: React.FC<DepartureAlertModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  currentUser,
  onSettingsUpdated,
}) => {
  const [minutes, setMinutes] = useState<number>(currentSettings.alertMinutes || 5);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const quickOptions = [3, 5, 10, 15];

  const handleTestSound = async () => {
    // Garante que o contexto de áudio esteja desbloqueado no clique do usuário
    await unlockAudioContextAndPlayTest();
    setTimeout(() => {
      playDepartureAlertSound();
    }, 150);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSuccessMessage(null);
    try {
      const validMinutes = Math.max(1, Math.min(60, Number(minutes) || 5));
      await saveDepartureAlertSettings({
        alertMinutes: validMinutes,
        updatedBy: currentUser?.name || 'Coordenação',
      });
      const updated: DepartureAlertSettings = {
        id: 'departureAlert',
        alertMinutes: validMinutes,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Coordenação',
      };
      onSettingsUpdated(updated);
      setSuccessMessage('Configuração salva com sucesso no Firestore!');
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Erro ao salvar configuração:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const isSoundActive = isAudioNotificationsEnabled();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-amber-600 to-rose-600 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/15 rounded-xl">
              <Bell className="w-5 h-5 text-amber-100" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight leading-tight">
                Aviso de Saída Customizada
              </h3>
              <p className="text-[11px] text-amber-100 font-medium">
                Alerta sonoro e visual para alunas e alunos com horário diferenciado
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-all cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-slate-700">
          {/* Rule description */}
          <div className="p-3.5 bg-amber-50/80 rounded-xl border border-amber-200/70 text-xs text-amber-900 space-y-1.5">
            <div className="flex items-center space-x-1.5 font-bold text-amber-950">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Como funciona este aviso:</span>
            </div>
            <p className="leading-relaxed">
              O aviso sonoro e visual toca apenas para alunos cujo <strong>horário de saída do dia seja diferente do padrão da turma</strong> (ex: saída às 16:30 quando a turma sai às 17:20).
            </p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Cada monitora é avisada <strong>apenas sobre as turmas atribuídas a ela</strong>.
            </p>
          </div>

          {/* Setting input */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Minutos de antecedência do aviso</span>
            </label>
            <p className="text-[11px] text-slate-500">
              Quantos minutos antes do horário de saída o aviso deve soar:
            </p>

            {/* Quick buttons */}
            <div className="grid grid-cols-4 gap-2 pt-1">
              {quickOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setMinutes(opt)}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    minutes === opt
                      ? 'bg-amber-600 border-amber-600 text-white shadow-xs scale-[1.02]'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {opt} min
                </button>
              ))}
            </div>

            {/* Manual input */}
            <div className="flex items-center space-x-2 pt-2">
              <span className="text-xs text-slate-600 font-semibold shrink-0">Personalizado:</span>
              <input
                type="number"
                min="1"
                max="60"
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="w-24 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-extrabold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <span className="text-xs text-slate-500 font-medium">minutos antes da saída</span>
            </div>
          </div>

          {/* Sound test button */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Volume2 className={`w-4 h-4 ${isSoundActive ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span className="text-xs font-medium text-slate-600">
                {isSoundActive ? 'Som do sistema: Ativo' : 'Som do sistema: Desativado'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleTestSound}
              className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Testar Som</span>
            </button>
          </div>

          {/* Feedback */}
          {successMessage && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-800 flex items-center space-x-1.5 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <span>Salvando...</span>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Salvar Configuração</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
