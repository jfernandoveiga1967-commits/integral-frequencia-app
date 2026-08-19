import React, { useState, useMemo, useEffect } from 'react';
import { MessageSquare, Send, Copy, Check, X, Phone, User, MapPin, Clock, Sparkles, AlertCircle, Edit3 } from 'lucide-react';
import { UserProfile, ScheduleBlock } from '../types';
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
  // Find potential monitors for this turma or activity
  const relevantUsers = useMemo(() => {
    return users.filter((u) => {
      if (u.role === 'coordenador') return true;
      const assignedTurmas = u.assignedTurmas || u.allowedClassIds || [];
      const assignedActs = u.assignedActivities || [];
      return (
        assignedTurmas.includes(turmaName) ||
        assignedActs.includes(activityName as any)
      );
    });
  }, [users, turmaName, activityName]);

  const defaultUser = relevantUsers.find((u) => u.role !== 'coordenador') || users[0] || null;

  const [selectedUserId, setSelectedUserId] = useState<string>(defaultUser?.id || '');
  const [customPhone, setCustomPhone] = useState<string>(defaultUser?.phone || '');
  const [customNote, setCustomNote] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Sync phone when selected user changes
  useEffect(() => {
    const user = users.find((u) => u.id === selectedUserId);
    if (user && user.phone) {
      setCustomPhone(user.phone);
    } else {
      setCustomPhone('');
    }
  }, [selectedUserId, users]);

  const selectedUser = useMemo(() => {
    return users.find((u) => u.id === selectedUserId) || null;
  }, [users, selectedUserId]);

  const messageText = useMemo(() => {
    return buildActivityWhatsAppMessage({
      monitorName: selectedUser?.name,
      turmaName,
      activityName,
      startTime,
      endTime,
      location,
      guidelines,
      customNote,
      coordName: currentUser?.name || 'Coordenação',
    });
  }, [selectedUser, turmaName, activityName, startTime, endTime, location, guidelines, customNote, currentUser]);

  const whatsAppUrl = useMemo(() => {
    const phoneToUse = customPhone || selectedUser?.phone || '';
    return generateWhatsAppUrl(phoneToUse, messageText);
  }, [customPhone, selectedUser, messageText]);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleSendWhatsApp = () => {
    // If phone was typed manually and user is selected, optionally save to profile
    if (selectedUser && customPhone && customPhone !== selectedUser.phone && onUpdateUserPhone) {
      onUpdateUserPhone(selectedUser.id, customPhone);
    }
    window.open(whatsAppUrl, '_blank', 'noopener,noreferrer');
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
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-emerald-600" />
              <span>Selecionar Monitora / Destinatário:</span>
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">-- Escolha um colaborador --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.cargoLabel || u.role}) {u.phone ? `• ${formatPhoneDisplay(u.phone)}` : '• (Sem tel)'}
                </option>
              ))}
            </select>
          </div>

          {/* Phone Input */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Telefone / WhatsApp:</span>
              </span>
              {selectedUser?.phone && (
                <span className="text-[10px] text-emerald-600 font-semibold">
                  Cadastrado: {formatPhoneDisplay(selectedUser.phone)}
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
              onChange={(e) => setCustomNote(e.target.value)}
              rows={2}
              placeholder="Ex: Favor verificar se todos estão de maiô/touca antes de descer; aula com professor substituto..."
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Live Message Preview */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Prévia da Mensagem Formatada:</span>
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
            </label>
            <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-3.5 text-xs text-slate-800 font-sans whitespace-pre-wrap leading-relaxed shadow-inner max-h-48 overflow-y-auto">
              {messageText}
            </div>
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
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
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
