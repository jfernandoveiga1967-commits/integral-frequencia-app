import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MessageSquare, Send, Copy, Check, X, Phone, User, MapPin, Clock, Sparkles, AlertCircle, Edit3, RotateCcw } from 'lucide-react';
import { UserProfile } from '../types';
import { buildActivityWhatsAppMessage, generateWhatsAppUrl, formatPhoneDisplay, cleanPhoneNumber } from '../utils/whatsappUtils';

interface WhatsAppNotifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  turmaName: string;
  activityName: string;
  startTime: string;
  endTime: string;
  location?: string;
  guidelines?: string;
  users: UserProfile[];
  currentUser?: UserProfile | null;
  onUpdateUserPhone?: (userId: string, newPhone: string) => void;
}

/**
 * Identifies the best responsible monitor or teacher for a given activity and turma
 */
function findBestResponsibleUser(
  users: UserProfile[],
  turmaName: string,
  activityName: string
): UserProfile | null {
  if (!users || users.length === 0) return null;

  const normActivity = (activityName || '').trim().toLowerCase();
  const normTurma = (turmaName || '').trim().toLowerCase();

  const isActivityMatch = (u: UserProfile) => {
    const assignedActs = (u.assignedActivities || []).map((a) => a.trim().toLowerCase());
    const specialty = (u.specialtyActivity || '').trim().toLowerCase();
    const cargo = (u.cargoLabel || '').trim().toLowerCase();
    return (
      assignedActs.includes(normActivity) ||
      specialty === normActivity ||
      (normActivity !== '' && cargo.includes(normActivity))
    );
  };

  const isTurmaMatch = (u: UserProfile) => {
    const assignedTurmas = (u.assignedTurmas || u.allowedClassIds || []).map((t) =>
      t.trim().toLowerCase()
    );
    return assignedTurmas.includes(normTurma);
  };

  // 1. Non-coordinators matching BOTH Activity and Turma
  const perfectMatch = users.find(
    (u) => u.role !== 'coordenador' && isActivityMatch(u) && isTurmaMatch(u)
  );
  if (perfectMatch) return perfectMatch;

  // 2. Non-coordinators matching Activity (e.g. Professor de Natação, Professor de Judô, etc.)
  const activityMatch = users.find((u) => u.role !== 'coordenador' && isActivityMatch(u));
  if (activityMatch) return activityMatch;

  // 3. Non-coordinators matching Turma (e.g. Monitora do 1º Ano Azul)
  const turmaMatch = users.find((u) => u.role !== 'coordenador' && isTurmaMatch(u));
  if (turmaMatch) return turmaMatch;

  // 4. Any Non-coordinator (professor / monitor)
  const anyTeacher = users.find((u) => u.role !== 'coordenador');
  if (anyTeacher) return anyTeacher;

  // 5. Coordinator matching Activity or Turma
  const coordMatch = users.find((u) => isActivityMatch(u) || isTurmaMatch(u));
  if (coordMatch) return coordMatch;

  // 6. First user
  return users[0] || null;
}

export const WhatsAppNotifyModal: React.FC<WhatsAppNotifyModalProps> = ({
  isOpen,
  onClose,
  turmaName,
  activityName,
  startTime,
  endTime,
  location,
  guidelines,
  users,
  currentUser,
  onUpdateUserPhone,
}) => {
  // Find the automatically identified best responsible monitor
  const bestUser = useMemo(() => {
    return findBestResponsibleUser(users, turmaName, activityName);
  }, [users, turmaName, activityName]);

  const [selectedUserId, setSelectedUserId] = useState<string>(bestUser?.id || '');
  const [customPhone, setCustomPhone] = useState<string>(bestUser?.phone || '');
  const [customNote, setCustomNote] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [editableMessage, setEditableMessage] = useState<string>('');
  const [isManuallyEdited, setIsManuallyEdited] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedUser = useMemo(() => {
    return users.find((u) => u.id === selectedUserId) || null;
  }, [users, selectedUserId]);

  // Generate base message template
  const defaultGeneratedMessage = useMemo(() => {
    return buildActivityWhatsAppMessage({
      monitorName: selectedUser?.name,
      turmaName,
      activityName,
      startTime,
      endTime,
      location,
      guidelines,
      customNote,
      coordName: currentUser?.name || 'Fernando Veiga',
    });
  }, [selectedUser, turmaName, activityName, startTime, endTime, location, guidelines, customNote, currentUser]);

  // When modal is newly opened or turma/activity changes, automatically select the responsible monitor
  useEffect(() => {
    if (isOpen) {
      const targetUser = bestUser || users[0] || null;
      setSelectedUserId(targetUser?.id || '');
      setCustomPhone(targetUser?.phone || '');
      setIsManuallyEdited(false);

      const initialMsg = buildActivityWhatsAppMessage({
        monitorName: targetUser?.name,
        turmaName,
        activityName,
        startTime,
        endTime,
        location,
        guidelines,
        customNote,
        coordName: currentUser?.name || 'Fernando Veiga',
      });
      setEditableMessage(initialMsg);
    }
  }, [isOpen, turmaName, activityName, startTime, endTime, bestUser, users]);

  // Handle manual selection of recipient from the dropdown
  const handleSelectRecipient = (userId: string) => {
    setSelectedUserId(userId);
    const chosenUser = users.find((u) => u.id === userId) || null;

    // Immediately update phone field
    const newPhone = chosenUser?.phone || '';
    setCustomPhone(newPhone);

    // Immediately update the message with the chosen user's greeting ("Olá, [Nome]!")
    const updatedMsg = buildActivityWhatsAppMessage({
      monitorName: chosenUser?.name,
      turmaName,
      activityName,
      startTime,
      endTime,
      location,
      guidelines,
      customNote,
      coordName: currentUser?.name || 'Fernando Veiga',
    });
    setEditableMessage(updatedMsg);
    setIsManuallyEdited(false);
  };

  const handleResetToDefault = () => {
    setIsManuallyEdited(false);
    setEditableMessage(defaultGeneratedMessage);
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(editableMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleSendWhatsApp = () => {
    // If phone was typed manually and user is selected, save phone to profile
    if (selectedUser && customPhone && customPhone !== selectedUser.phone && onUpdateUserPhone) {
      onUpdateUserPhone(selectedUser.id, customPhone);
    }

    const phoneToUse = customPhone || selectedUser?.phone || '';
    const url = generateWhatsAppUrl(phoneToUse, editableMessage);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!isOpen) return null;

  const otherUsers = bestUser ? users.filter((u) => u.id !== bestUser.id) : users;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 text-white p-4 sm:p-5 flex items-center justify-between border-b border-emerald-900/40">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-emerald-600/30">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400">
                Avisar Monitora / WhatsApp
              </div>
              <h3 className="font-extrabold text-base text-white truncate">
                {activityName} • {turmaName}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Recipient Selector */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="whatsapp-recipient-select" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-emerald-600" />
                <span>Selecionar Monitora / Destinatário:</span>
              </label>
              {bestUser && selectedUserId === bestUser.id && (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                  Responsável Vinculada
                </span>
              )}
            </div>

            <select
              id="whatsapp-recipient-select"
              value={selectedUserId}
              onChange={(e) => handleSelectRecipient(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all cursor-pointer shadow-xs"
            >
              <option value="">-- Selecione uma monitora ou colaborador --</option>
              {bestUser && (
                <optgroup label="⭐ Responsável Vinculado(a) à Atividade / Turma">
                  <option value={bestUser.id}>
                    ⭐ {bestUser.name} ({bestUser.cargoLabel || bestUser.role}) {bestUser.phone ? `• ${formatPhoneDisplay(bestUser.phone)}` : '• (Sem telefone)'}
                  </option>
                </optgroup>
              )}
              <optgroup label="📋 Todos os Colaboradores Cadastrados">
                {otherUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.cargoLabel || u.role}) {u.phone ? `• ${formatPhoneDisplay(u.phone)}` : '• (Sem telefone)'}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Phone Input */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Telefone / WhatsApp:</span>
              </span>
              {selectedUser?.phone ? (
                <span className="text-[10px] text-emerald-600 font-semibold">
                  Cadastrado: {formatPhoneDisplay(selectedUser.phone)}
                </span>
              ) : (
                <span className="text-[10px] text-amber-600 font-semibold">
                  Nenhum telefone no cadastro
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type="tel"
                value={customPhone}
                onChange={(e) => setCustomPhone(e.target.value)}
                placeholder="Ex: (19) 99999-9999 ou 19999999999"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              O link será gerado com o código do Brasil (+55).
            </p>
          </div>

          {/* Optional Custom Note from Coordination */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Mensagem Adicional da Coordenação (Opcional):</span>
            </label>
            <textarea
              value={customNote}
              onChange={(e) => {
                const val = e.target.value;
                setCustomNote(val);
                if (!isManuallyEdited) {
                  const updatedMsg = buildActivityWhatsAppMessage({
                    monitorName: selectedUser?.name,
                    turmaName,
                    activityName,
                    startTime,
                    endTime,
                    location,
                    guidelines,
                    customNote: val,
                    coordName: currentUser?.name || 'Fernando Veiga',
                  });
                  setEditableMessage(updatedMsg);
                }
              }}
              rows={2}
              placeholder="Ex: Favor verificar se todos estão de maiô/touca antes de descer; aula com professor substituto..."
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Editable Text Area for Formatted Message */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Prévia da Mensagem (Editável):
                </label>
                {isManuallyEdited && (
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    Modificado
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {isManuallyEdited && (
                  <button
                    type="button"
                    onClick={handleResetToDefault}
                    className="text-[10px] text-slate-500 hover:text-slate-800 font-bold flex items-center space-x-1 cursor-pointer transition-colors"
                    title="Restaurar mensagem gerada automaticamente"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restaurar Padrão</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center space-x-1 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-600 font-extrabold">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copiar Texto</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="relative">
              <textarea
                ref={textareaRef}
                value={editableMessage}
                onChange={(e) => {
                  setEditableMessage(e.target.value);
                  setIsManuallyEdited(true);
                }}
                rows={8}
                placeholder="Escreva ou edite a mensagem..."
                className="w-full p-3 bg-emerald-50/40 border border-emerald-300/80 rounded-2xl text-xs sm:text-[13px] text-slate-800 font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white resize-y min-h-[140px] max-h-[300px] shadow-inner selection:bg-emerald-200 selection:text-emerald-950"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
              <span>✍️ Você pode alterar, copiar, colar ou apagar qualquer parte do texto livremente.</span>
              <span className="font-mono text-[9px] text-slate-400">{editableMessage.length} caracteres</span>
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
          >
            Fechar
          </button>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopyMessage}
              className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-extrabold text-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado' : 'Copiar Texto'}</span>
            </button>

            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="flex-1 sm:flex-initial px-4.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/30 transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Avisar via WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
