import React, { useState } from 'react';
import { Bell, Clock, Volume2, Check, X, Sparkles, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { DepartureAlertSettings, UserProfile } from '../types';
import { saveDepartureAlertSettings } from '../firebase';
import {
  playDepartureStage1Sound,
  playDepartureStage2Sound,
  playDepartureStage3Sound,
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
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTestStage1 = async () => {
    await unlockAudioContextAndPlayTest();
    setTimeout(() => {
      playDepartureStage1Sound();
    }, 120);
  };

  const handleTestStage2 = async () => {
    await unlockAudioContextAndPlayTest();
    setTimeout(() => {
      playDepartureStage2Sound();
    }, 120);
  };

  const handleTestStage3 = async () => {
    await unlockAudioContextAndPlayTest();
    setTimeout(() => {
      playDepartureStage3Sound();
    }, 120);
  };

  const handleConfirm = async () => {
    setIsSaving(true);
    setSuccessMessage(null);
    try {
      await saveDepartureAlertSettings({
        alertMinutes: 10,
        updatedBy: currentUser?.name || 'Coordenação',
      });
      const updated: DepartureAlertSettings = {
        id: 'departureAlert',
        alertMinutes: 10,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Coordenação',
      };
      onSettingsUpdated(updated);
      setSuccessMessage('Sistema gradual automático de 3 estágios ativado com sucesso!');
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Erro ao salvar confirmação:', err);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const isSoundActive = isAudioNotificationsEnabled();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/15 rounded-xl">
              <Bell className="w-5 h-5 text-amber-100" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight leading-tight">
                Aviso Gradual Automático de Saída
              </h3>
              <p className="text-[11px] text-amber-100 font-medium">
                Regra institucional padronizada em 3 estágios de alerta sonoro e visual
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
        <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto text-slate-700">
          {/* Institutional Rule Badge */}
          <div className="p-3.5 bg-amber-50/80 rounded-xl border border-amber-200/80 text-xs text-amber-950 space-y-1">
            <div className="flex items-center space-x-1.5 font-bold text-amber-950">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Regra Padrão do Colégio Crescer:</span>
            </div>
            <p className="text-[11px] text-amber-900 leading-relaxed">
              O sistema monitora continuamente e dispara <strong>100% automaticamente</strong> os avisos para qualquer aluno com horário de saída antecipada diferente do padrão da turma. Cada monitora é alertada sobre suas turmas atribuídas.
            </p>
          </div>

          {/* Visual Timeline of the 3 Stages */}
          <div className="space-y-2.5 pt-1">
            <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Linha do Tempo dos 3 Estágios de Saída</span>
            </label>

            {/* Estágio 1 (10 min) */}
            <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300">
                    1º Estágio • 10 min antes
                  </span>
                  <span className="text-xs font-bold text-amber-800">1 toque suave</span>
                </div>
                <div className="text-xs font-extrabold text-amber-950">
                  Organizar pertences e mochila do aluno
                </div>
                <p className="text-[11px] text-amber-800">
                  Preparo inicial de material para garantir saída pontual e tranquila.
                </p>
              </div>
              <button
                type="button"
                onClick={handleTestStage1}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all flex items-center space-x-1.5 shrink-0 shadow-2xs cursor-pointer"
                title="Ouvir som do Estágio 1"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                <span>Ouvir 1 Toque</span>
              </button>
            </div>

            {/* Estágio 2 (5 min) */}
            <div className="p-3.5 rounded-xl border border-orange-300 bg-orange-50/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-200 text-orange-950 border border-orange-300">
                    2º Estágio • 5 min antes
                  </span>
                  <span className="text-xs font-bold text-orange-800">2 toques médios</span>
                </div>
                <div className="text-xs font-extrabold text-orange-950">
                  Encaminhar aluno ao portão / ponto de encontro
                </div>
                <p className="text-[11px] text-orange-800">
                  Deslocamento seguro da sala/atividade até a portaria de saída.
                </p>
              </div>
              <button
                type="button"
                onClick={handleTestStage2}
                className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all flex items-center space-x-1.5 shrink-0 shadow-2xs cursor-pointer"
                title="Ouvir som do Estágio 2"
              >
                <Sparkles className="w-3.5 h-3.5 text-orange-200" />
                <span>Ouvir 2 Toques</span>
              </button>
            </div>

            {/* Estágio 3 (0 min / Horário exato) */}
            <div className="p-3.5 rounded-xl border border-rose-300 bg-rose-50/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-200 text-rose-950 border border-rose-300">
                    3º Estágio • Horário Exato (0 min)
                  </span>
                  <span className="text-xs font-bold text-rose-800">Sequência tripla</span>
                </div>
                <div className="text-xs font-extrabold text-rose-950">
                  Horário atingido: Aluno liberado
                </div>
                <p className="text-[11px] text-rose-800">
                  Momento exato da entrega do aluno aos pais/responsáveis.
                </p>
              </div>
              <button
                type="button"
                onClick={handleTestStage3}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all flex items-center space-x-1.5 shrink-0 shadow-2xs cursor-pointer"
                title="Ouvir som do Estágio 3"
              >
                <Sparkles className="w-3.5 h-3.5 text-rose-200" />
                <span>Ouvir Alerta Triplo</span>
              </button>
            </div>
          </div>

          {/* Sound Status Indicator */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Volume2 className={`w-4 h-4 ${isSoundActive ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span className="text-xs font-medium text-slate-600">
                {isSoundActive ? 'Áudio do sistema: Ativo e desbloqueado' : 'Áudio do sistema: Desativado'}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Disparos automáticos únicos por aluno
            </span>
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
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium hidden sm:inline">
            Configuração padronizada ativa
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white text-xs font-extrabold flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <span>Salvando...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar Padrão dos 3 Estágios</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
