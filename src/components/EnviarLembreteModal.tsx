import React, { useState, useMemo } from 'react';
import {
  X,
  Phone,
  Send,
  Bell,
  Check,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  Copy,
  CheckCheck,
  ShieldAlert,
} from 'lucide-react';
import { UserProfile } from '../types';
import { ManualNorma } from '../types/manualNormas';
import { generateWhatsAppUrl, formatPhoneDisplay } from '../utils/whatsappUtils';
import {
  saveUserNotificationToFirestore,
  saveNormaReminderToFirestore,
  saveUserToFirestore,
} from '../firebase';

export interface EnviarLembreteModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: UserProfile | null;
  currentUser: UserProfile | null;
  normas?: ManualNorma[];
  defaultNormaTitle?: string;
  onReminderSent: (result: {
    channel: 'whatsapp' | 'app' | 'ambos';
    lastSentAt: string;
    messageText: string;
    updatedPhone?: string;
  }) => void;
  onUpdateUserPhone?: (userId: string, newPhone: string) => void;
}

export const EnviarLembreteModal: React.FC<EnviarLembreteModalProps> = ({
  isOpen,
  onClose,
  targetUser,
  currentUser,
  normas = [],
  defaultNormaTitle,
  onReminderSent,
  onUpdateUserPhone,
}) => {
  if (!isOpen || !targetUser) return null;

  const [phone, setPhone] = useState<string>(targetUser.phone || '');
  const [selectedNormaTitle, setSelectedNormaTitle] = useState<string>(
    defaultNormaTitle || 'Normas Internas e Rotina do Integral (Manual 2026)'
  );
  const [isSendingApp, setIsSendingApp] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Template oficial do lembrete:
  // "Olá, {nomeCompleto}! Lembrete da Coordenação do Integral:
  // Identificamos que a norma '📌 {tituloNorma}' ainda aguarda sua leitura e confirmação de ciente no aplicativo.
  // Por favor, acesse o app para ler e assinar.
  // Atenciosamente, Coordenação do Integral"
  const messageText = useMemo(() => {
    const nomeCompleto = (targetUser.name || 'Colaborador').trim();
    const tituloNorma = selectedNormaTitle.trim();
    return `Olá, ${nomeCompleto}! Lembrete da Coordenação do Integral:\nIdentificamos que a norma '📌 ${tituloNorma}' ainda aguarda sua leitura e confirmação de ciente no aplicativo.\nPor favor, acesse o app para ler e assinar.\nAtenciosamente, Coordenação do Integral`;
  }, [targetUser.name, selectedNormaTitle]);

  const whatsappUrl = useMemo(() => {
    return generateWhatsAppUrl(phone, messageText);
  }, [phone, messageText]);

  // Persiste telefone se foi preenchido ou alterado
  const persistPhoneIfChanged = async (newPhone: string) => {
    const clean = newPhone.trim();
    if (clean && clean !== targetUser.phone) {
      try {
        const updated = {
          ...targetUser,
          phone: clean,
          updatedAt: new Date().toISOString(),
        };
        await saveUserToFirestore(updated);
        if (onUpdateUserPhone) {
          onUpdateUserPhone(targetUser.id, clean);
        }
      } catch (err) {
        console.warn('Erro ao atualizar telefone do colaborador:', err);
      }
    }
  };

  // Disparo 1: WhatsApp Direct
  const handleSendWhatsApp = async () => {
    const nowIso = new Date().toISOString();
    await persistPhoneIfChanged(phone);

    // Registra envio no Firestore
    try {
      await saveNormaReminderToFirestore({
        id: `reminder_${targetUser.id}`,
        userId: targetUser.id,
        userName: targetUser.name,
        normaTitle: selectedNormaTitle,
        channel: 'whatsapp',
        lastSentAt: nowIso,
        sentBy: currentUser?.name || 'Coordenação',
        messageText,
      });
    } catch (err) {
      console.warn('Aviso ao registrar lembrete de norma:', err);
    }

    onReminderSent({
      channel: 'whatsapp',
      lastSentAt: nowIso,
      messageText,
      updatedPhone: phone.trim() || undefined,
    });

    // Abre o WhatsApp com fallback seguro
    if (typeof window !== 'undefined') {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    }

    setFeedback({
      type: 'success',
      text: `WhatsApp aberto com sucesso para envio a ${targetUser.name}!`,
    });

    setTimeout(() => {
      onClose();
    }, 1200);
  };

  // Disparo 2: Notificar no App (user_notifications)
  const handleNotifyInApp = async () => {
    setIsSendingApp(true);
    const nowIso = new Date().toISOString();

    try {
      // 1. Grava o alerta na coleção 'user_notifications' com prioridade alta e status UNREAD
      await saveUserNotificationToFirestore({
        id: `notif_${targetUser.id}_${Date.now()}`,
        userId: targetUser.id,
        userName: targetUser.name,
        title: `🔔 Lembrete da Coordenação do Integral`,
        message: `Identificamos que a norma '📌 ${selectedNormaTitle}' ainda aguarda sua leitura e confirmação de ciente no aplicativo. Por favor, acesse o módulo de Normas para ler e assinar quando possível.`,
        priority: 'alta',
        type: 'norma_pendente',
        linkTab: 'manual',
        normaTitle: selectedNormaTitle,
        read: false,
        status: 'UNREAD',
        createdAt: nowIso,
        createdBy: currentUser?.name || 'Coordenação',
      });

      // 2. Atualiza registro de lembrete em normas_reminders
      await saveNormaReminderToFirestore({
        id: `reminder_${targetUser.id}`,
        userId: targetUser.id,
        userName: targetUser.name,
        normaTitle: selectedNormaTitle,
        channel: 'app',
        lastSentAt: nowIso,
        sentBy: currentUser?.name || 'Coordenação',
        messageText,
      });

      onReminderSent({
        channel: 'app',
        lastSentAt: nowIso,
        messageText,
      });

      setFeedback({
        type: 'success',
        text: `Alerta com prioridade alta gravado com sucesso! Banner ativo no app de ${targetUser.name}.`,
      });

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: `Erro ao notificar no app: ${err?.message || 'Falha na conexão'}`,
      });
    } finally {
      setIsSendingApp(false);
    }
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(messageText);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur-xs text-white">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight leading-tight">
                Disparo de Lembrete de Norma
              </h3>
              <p className="text-xs text-indigo-200 font-medium">
                Canal direto WhatsApp & Notificação no App da monitora
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Feedback banner if present */}
          {feedback && (
            <div
              className={`p-3 rounded-2xl text-xs font-bold flex items-center space-x-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                  : 'bg-rose-50 text-rose-800 border border-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Collaborator Profile Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                {targetUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-black text-slate-900 truncate">
                  {targetUser.name}
                </h4>
                <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-medium truncate">
                  <span className="truncate">{targetUser.email || 'Sem e-mail'}</span>
                  <span>•</span>
                  <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 shrink-0">
                    {targetUser.cargoLabel || 'Monitora / Colaborador'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Input: Telefone / WhatsApp */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Contato WhatsApp da Monitora:</span>
              </span>
              {phone && (
                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  {formatPhoneDisplay(phone)}
                </span>
              )}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex: (19) 99876-5432 ou 19998765432"
              className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono font-bold text-slate-800"
            />
            <p className="text-[10px] text-slate-400">
              Se informado, o número será atualizado no cadastro da monitora automaticamente.
            </p>
          </div>

          {/* Norma Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Norma ou Manual Pendente:
            </label>
            <select
              value={selectedNormaTitle}
              onChange={(e) => setSelectedNormaTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold text-slate-800"
            >
              <option value="Normas Internas e Rotina do Integral (Manual 2026)">
                📌 Normas Internas e Rotina do Integral (Manual Geral 2026)
              </option>
              <option value="Regras da Academia, Transporte e Portaria B/C">
                📌 Regras da Academia, Transporte e Portaria B/C
              </option>
              <option value="Guia de Abordagem Sensível e Respeitosa">
                📌 Guia de Abordagem Sensível e Respeitosa
              </option>
              {normas.slice(0, 15).map((n) => (
                <option key={n.id} value={n.title}>
                  📌 {n.sectionNumber ? `${n.sectionNumber} - ` : ''}{n.title}
                </option>
              ))}
            </select>
          </div>

          {/* Message Preview Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase text-slate-500 tracking-wider">
                Pré-visualização da Mensagem:
              </span>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer"
              >
                {copiedLink ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copiado!' : 'Copiar Texto'}</span>
              </button>
            </div>
            <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-2xl text-xs text-slate-700 whitespace-pre-line font-medium leading-relaxed font-sans">
              {messageText}
            </div>
          </div>

          {/* Actions: Duplo Canal */}
          <div className="pt-2 space-y-2.5">
            <span className="text-xs font-black uppercase text-slate-700 block tracking-wider">
              Escolha o Canal de Disparo:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Opção A: WhatsApp Direct */}
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="w-full p-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl shadow-md font-bold text-xs flex flex-col justify-between transition-all cursor-pointer group active:scale-[0.99]"
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="flex items-center space-x-1.5 font-black text-sm">
                    <span className="text-base">📱</span>
                    <span>WhatsApp Direct</span>
                  </span>
                  <ExternalLink className="w-4 h-4 text-emerald-200 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-[10px] text-emerald-100 text-left font-normal">
                  Abre o WhatsApp com a mensagem formatada diretamente para o contato da monitora.
                </p>
              </button>

              {/* Opção B: Notificar no App */}
              <button
                type="button"
                onClick={handleNotifyInApp}
                disabled={isSendingApp}
                className="w-full p-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-50 text-white rounded-2xl shadow-md font-bold text-xs flex flex-col justify-between transition-all cursor-pointer group active:scale-[0.99]"
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="flex items-center space-x-1.5 font-black text-sm">
                    <span className="text-base">🔔</span>
                    <span>Notificar no App</span>
                  </span>
                  <Send className="w-4 h-4 text-indigo-200 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-[10px] text-indigo-100 text-left font-normal">
                  Cria alerta de alta prioridade na coleção 'user_notifications' com Banner no topo do app.
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center space-x-1 text-[11px]">
            <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
            <span>Registro de conformidade e auditoria da Coordenação</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold transition cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
