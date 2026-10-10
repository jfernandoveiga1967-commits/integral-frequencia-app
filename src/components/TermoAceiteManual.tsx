import React, { useState } from 'react';
import {
  ShieldCheck,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ArrowRight,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { UserProfile } from '../types';
import { ManualAcknowledgmentRecord } from '../services/manualProgressService';
import { NormaAceite } from '../types/manualNormas';

export interface TermoAceiteManualProps {
  currentUser?: UserProfile | null;
  totalNormasAtivas: number;
  normIdsCompleted: string[];
  existingAcknowledgment: ManualAcknowledgmentRecord | null;
  legacyAceite?: NormaAceite | null;
  isConfirming: boolean;
  onConfirmFullManual: () => Promise<void> | void;
  onNavigateToPendingNormas?: () => void;
}

export const TermoAceiteManual: React.FC<TermoAceiteManualProps> = ({
  currentUser,
  totalNormasAtivas,
  normIdsCompleted,
  existingAcknowledgment,
  legacyAceite,
  isConfirming,
  onConfirmFullManual,
  onNavigateToPendingNormas,
}) => {
  const [hasDeclaredCheckbox, setHasDeclaredCheckbox] = useState(false);

  // Status de aceite
  const isAlreadyAcknowledged = Boolean(
    existingAcknowledgment?.isFullManualAcknowledged ||
    legacyAceite?.id
  );

  // Verificação de liberação: normIdsCompleted.length === totalNormasAtivas
  const total = Math.max(totalNormasAtivas, 1);
  const completedCount = normIdsCompleted.length;
  const isAllNormasCompleted = completedCount >= total;
  const pendingCount = Math.max(total - completedCount, 0);

  // Se já assinado
  if (isAlreadyAcknowledged) {
    const timestamp = existingAcknowledgment?.timestamp || legacyAceite?.timestamp || new Date().toISOString();
    const userName = currentUser?.name || existingAcknowledgment?.userName || legacyAceite?.userName || 'Colaborador';
    const userEmail = currentUser?.email || existingAcknowledgment?.userEmail || legacyAceite?.userEmail || '';
    const userRole = currentUser?.cargoLabel || currentUser?.role || existingAcknowledgment?.userRole || legacyAceite?.userRole || 'Monitora';
    const ackId = existingAcknowledgment?.id || legacyAceite?.id || '';
    const userIp = existingAcknowledgment?.userIp || (legacyAceite as any)?.userIp || 'Registrado';

    return (
      <div id="termo-de-aceite" className="mt-8 rounded-3xl overflow-hidden border border-emerald-400 shadow-sm transition-all duration-200">
        <div className="bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 p-6 sm:p-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center space-x-3.5">
              <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-md shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Termo de Ciência Institucional Assinado</span>
                  </span>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                    🟢 100% de Conformidade Verificada
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  Declaração de Ciência e Compromisso Institucional
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Seu aceite digital está registrado e autenticado com segurança no banco de dados do Colégio Crescer.
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right sm:self-center shrink-0 bg-white/90 p-3 rounded-2xl border border-emerald-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assinado em</span>
              <span className="text-xs font-black text-emerald-700 block">
                {new Date(timestamp).toLocaleDateString('pt-BR')} às{' '}
                {new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-[9px] text-slate-400 block font-mono">
                IP: {userIp} • ID: {ackId.slice(0, 18)}
              </span>
            </div>
          </div>

          <div className="bg-white/90 p-4 rounded-2xl border border-emerald-100 text-xs text-slate-700 leading-relaxed space-y-1.5 shadow-2xs">
            <p className="font-semibold text-slate-800">
              "Eu, <strong className="text-emerald-900">{userName}</strong> ({userEmail}), confirmo que realizei a leitura atenta e tomei plena ciência de todas as diretrizes do Manual de Normas Internas, Rotina do Integral, Regras da Academia e Transporte, e do Guia de Abordagem Sensível do Colégio Crescer, assumindo o compromisso de aplicá-las com rigor e zelo profissional."
            </p>
            <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-400 pt-2 border-t border-slate-100">
              <span>Colaborador(a): <strong>{userName}</strong></span>
              <span>Função: <strong>{userRole}</strong></span>
              <span>Normas Validadas: <strong className="text-emerald-700">{total} de {total}</strong></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // PENDENTE: Renderiza o fluxo com a Trava do Termo Geral do Manual
  return (
    <div id="termo-de-aceite" className="mt-8 rounded-3xl overflow-hidden border-2 border-indigo-200 shadow-sm transition-all duration-200">
      <div className="bg-gradient-to-br from-indigo-50/90 via-white to-amber-50/50 p-6 sm:p-7 space-y-4">
        <div className="flex items-start space-x-3.5">
          <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-md shrink-0">
            <FileCheck className="w-6 h-6 text-amber-300" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white">
                <AlertTriangle className="w-3 h-3" />
                <span>Aguardando Confirmação de Leitura</span>
              </span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Conformidade Funcional 2026/2027 • Colégio Crescer
              </span>
            </div>
            <h3 className="text-lg font-black text-slate-900">
              Termo de Ciência e Compromisso Geral do Manual Institucional
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Conforme as diretrizes da Coordenação do Integral, a aceitação formal de todo o manual exige a leitura e validação prévia de cada norma individual.
            </p>
          </div>
        </div>

        {/* Banner Informativo de Trava / Progresso quando houver normas pendentes */}
        {!isAllNormasCompleted ? (
          <div className="bg-amber-50 border border-amber-300/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-2xs">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-xl shrink-0 mt-0.5 sm:mt-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-950">
                  Trava de Segurança Ativa: {pendingCount} {pendingCount === 1 ? 'norma restante' : 'normas restantes'}
                </h4>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                  Você concluiu <strong>{completedCount} de {total}</strong> normas ({Math.round((completedCount / total) * 100)}%). Para habilitar o aceite de todo o manual, abra as normas pendentes e confirme o checklist individual de cada uma.
                </p>
              </div>
            </div>

            {onNavigateToPendingNormas && (
              <button
                type="button"
                onClick={onNavigateToPendingNormas}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-sm cursor-pointer shrink-0 self-start sm:self-center"
              >
                <span>Ver Normas Pendentes</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3.5 flex items-center space-x-3 text-emerald-900 shadow-2xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-xs font-bold">
              🎉 Todas as {total} normas foram concluídas e validadas! O botão de aceite geral do manual está liberado abaixo.
            </p>
          </div>
        )}

        {/* Declaração de Ciência e Checkbox Geral */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 text-xs text-slate-700 leading-relaxed space-y-2.5 shadow-2xs">
          <p className="font-medium text-slate-800">
            <strong>Declaração de Ciência Institucional:</strong> "Declaro que li atentamente e compreendi todas as {total} normas, fluxos operacionais, diretrizes de vestuário, uso do rádio frequência 2, regras de segurança do parque e da academia, e os princípios de abordagem sensível e não violenta estabelecidos pela Coordenação do Programa Integral do Colégio Crescer, comprometendo-me a cumpri-las integralmente no exercício de minhas funções."
          </p>

          <label className="flex items-start space-x-2.5 pt-2 border-t border-slate-100 cursor-pointer">
            <input
              type="checkbox"
              checked={hasDeclaredCheckbox}
              onChange={(e) => setHasDeclaredCheckbox(e.target.checked)}
              disabled={!isAllNormasCompleted}
              className="mt-0.5 w-4 h-4 text-indigo-600 rounded-md border-slate-300 focus:ring-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            />
            <span className={`text-xs font-bold ${!isAllNormasCompleted ? 'text-slate-400' : 'text-slate-800'}`}>
              Confirmo que concluí a leitura de todas as normas do manual e assumo o compromisso de cumprir as diretrizes institucionais.
            </span>
          </label>
        </div>

        {/* Rodapé com Botão e Trava de Liberação */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <p className="text-[11px] text-slate-500">
            O aceite final gravará data, hora e IP na coleção <code className="font-mono text-indigo-600 font-bold">manual_acknowledgments</code> para o colaborador ({currentUser?.name || 'Colaborador'}).
          </p>

          <button
            type="button"
            onClick={onConfirmFullManual}
            disabled={!isAllNormasCompleted || !hasDeclaredCheckbox || isConfirming}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-emerald-700/30 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title={
              !isAllNormasCompleted
                ? `Bloqueado: restam ${pendingCount} norma(s) pendente(s)`
                : !hasDeclaredCheckbox
                ? 'Marque a caixa de declaração acima para assinar'
                : 'Confirmar e aceitar todo o manual institucional'
            }
          >
            {isConfirming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Registrando Aceite no Firestore...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                <span>[ ✍️ Confirmar e Aceitar Todo o Manual Institucional ]</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
