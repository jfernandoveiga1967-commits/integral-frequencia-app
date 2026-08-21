import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MessageSquare, Send, Copy, Check, X, Phone, User, MapPin, Clock, Sparkles, AlertCircle, Edit3, RotateCcw, UserCheck, Users } from 'lucide-react';
import { UserProfile } from '../types';
import {
  buildActivityWhatsAppMessage,
  generateWhatsAppUrl,
  formatPhoneDisplay,
  cleanPhoneNumber,
  findAllResponsibleCollaborators,
} from '../utils/whatsappUtils';

export interface WhatsAppNotifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  turmaName: string;
  activityName: string;
  startTime: string;
  endTime: string;
  location?: string;
  guidelines?: string;
  targetUserId?: string;
  targetUserEmail?: string;
  targetUserName?: string;
  teacherId?: string;
  monitorId?: string;
  users: UserProfile[];
  currentUser?: UserProfile | null;
  onUpdateUserPhone?: (userId: string, newPhone: string) => void;
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
  targetUserId,
  targetUserEmail,
  targetUserName,
  teacherId,
  monitorId,
  users,
  currentUser,
  onUpdateUserPhone,
}) => {
  // Find ALL responsible collaborators specifically linked to this card/turma/activity
  const responsibleUsers = useMemo(() => {
    return findAllResponsibleCollaborators({
      users,
      turmaName,
      activityName,
      targetUserId,
      targetUserEmail,
      targetUserName,
      teacherId,
      monitorId,
    });
  }, [users, turmaName, activityName, targetUserId, targetUserEmail, targetUserName, teacherId, monitorId]);

  const responsibleUserIds = useMemo(() => {
    return new Set(responsibleUsers.map((u) => u.id));
  }, [responsibleUsers]);

  const otherUsers = useMemo(() => {
    return users.filter((u) => !responsibleUserIds.has(u.id));
  }, [users, responsibleUserIds]);

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [customPhone, setCustomPhone] = useState<string>('');
  const [customNote, setCustomNote] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [editableMessage, setEditableMessage] = useState<string>('');
  const [isManuallyEdited, setIsManuallyEdited] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    return users.find((u) => u.id === selectedUserId) || null;
  }, [users, selectedUserId]);

  // Synchronize modal state on open or when exact collaborators/turma/activity change
  useEffect(() => {
    if (isOpen) {
      const collabs = findAllResponsibleCollaborators({
        users,
        turmaName,
        activityName,
        targetUserId,
        targetUserEmail,
        targetUserName,
        teacherId,
        monitorId,
      });

      const initialCollaborator = collabs.length > 0 ? collabs[0] : null;

      setSelectedUserId(initialCollaborator?.id || '');
      setCustomPhone(initialCollaborator?.phone || '');
      setIsManuallyEdited(false);

      const initialMsg = buildActivityWhatsAppMessage({
        monitorName: initialCollaborator?.name,
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
  }, [
    isOpen,
    turmaName,
    activityName,
    startTime,
    endTime,
    location,
    guidelines,
    targetUserId,
    targetUserEmail,
    targetUserName,
    teacherId,
    monitorId,
    users,
  ]);

  // Handle manual selection of recipient from the dropdown or quick buttons
  const handleSelectRecipient = (userId: string) => {
    setSelectedUserId(userId);
    const chosenUser = users.find((u) => u.id === userId) || null;

    // Immediately update phone field
    const newPhone = chosenUser?.phone || '';
    setCustomPhone(newPhone);

    // Immediately update the message greeting with the chosen user ("Olá, [Nome da Monitora]!")
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
    const defaultMsg = buildActivityWhatsAppMessage({
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
    setEditableMessage(defaultMsg);
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
              <div className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5 flex-wrap">
                <span>Avisar Monitora / WhatsApp</span>
                {responsibleUsers.length > 0 && (
                  <span className="bg-emerald-500/30 text-emerald-200 text-[9px] px-2 py-0.5 rounded-md border border-emerald-400/30 font-bold">
                    {responsibleUsers.length === 1
                      ? '⭐ 1 Responsável Vinculado'
                      : `⭐ ${responsibleUsers.length} Responsáveis Vinculados`}
                  </span>
                )}
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
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="whatsapp-recipient-select" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-emerald-600" />
                <span>Selecionar Monitora / Destinatário:</span>
              </label>
              {selectedUser && responsibleUserIds.has(selectedUser.id) && (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <UserCheck className="w-3 h-3 text-emerald-600" />
                  <span>Responsável Vinculado(a)</span>
                </span>
              )}
            </div>

            {/* Quick Switch Chips when multiple responsible collaborators are linked */}
            {responsibleUsers.length > 1 && (
              <div className="mb-2 p-2 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-emerald-900 font-bold uppercase tracking-wider">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-emerald-700" />
                    <span>Responsáveis vinculados a esta turma/atividade:</span>
                  </span>
                  <span className="text-emerald-700 font-semibold">{responsibleUsers.length} encontrados</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {responsibleUsers.map((u) => {
                    const isSelected = selectedUserId === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleSelectRecipient(u.id)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition-all cursor-pointer flex items-center space-x-1.5 ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-400/50'
                            : 'bg-white hover:bg-emerald-100 text-slate-700 hover:text-emerald-900 border-slate-200'
                        }`}
                      >
                        <span>⭐</span>
                        <span>{u.name}</span>
                        <span className={`text-[10px] ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                          ({u.cargoLabel || u.role})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <select
              id="whatsapp-recipient-select"
              value={selectedUserId}
              onChange={(e) => handleSelectRecipient(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all cursor-pointer shadow-xs"
            >
              <option value="">-- Selecione uma monitora ou colaborador --</option>
              {responsibleUsers.length > 0 && (
                <optgroup
                  label={
                    responsibleUsers.length > 1
                      ? `⭐ Responsáveis Vinculados à Atividade / Turma (${responsibleUsers.length})`
                      : '⭐ Responsável Vinculado(a) à Atividade / Turma'
                  }
                >
                  {responsibleUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      ⭐ {u.name} ({u.cargoLabel || u.role}) {u.phone ? `• ${formatPhoneDisplay(u.phone)}` : '• (Sem telefone)'}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup
                label={
                  responsibleUsers.length > 0
                    ? '📋 Outros Colaboradores Cadastrados'
                    : '📋 Todos os Colaboradores Cadastrados'
                }
              >
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
                  {selectedUser ? 'Nenhum telefone no cadastro' : 'Selecione um destinatário'}
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
