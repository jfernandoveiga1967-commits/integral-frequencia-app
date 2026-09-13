import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Send, Copy, Check, X, Phone, User, Sparkles, MessageCircle, RotateCcw } from 'lucide-react';
import { formatPhoneDisplay, cleanPhoneNumber } from '../utils/whatsappUtils';
import { getFirstName, buildApoioWhatsAppUrl } from '../utils/atribuicoesStorage';

export interface ApoioWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  destinatarioRole: 'adi' | 'monitora' | 'monitora_assistente' | 'coordenador';
  destinatarioName: string;
  destinatarioPhone?: string;
  remetenteName?: string;
  turmaName: string;
  onUpdatePhone?: (newPhone: string) => void;
}

export const ApoioWhatsAppModal: React.FC<ApoioWhatsAppModalProps> = ({
  isOpen,
  onClose,
  destinatarioRole,
  destinatarioName,
  destinatarioPhone = '',
  remetenteName = '',
  turmaName,
  onUpdatePhone,
}) => {
  const firstName = useMemo(() => getFirstName(destinatarioName), [destinatarioName]);
  
  const defaultText = useMemo(() => {
    return firstName ? `Olá, ${firstName}! Preciso do seu apoio.` : 'Olá! Preciso do seu apoio.';
  }, [firstName]);

  const [message, setMessage] = useState<string>(defaultText);
  const [phone, setPhone] = useState<string>(destinatarioPhone);
  const [copied, setCopied] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMessage(defaultText);
      setPhone(destinatarioPhone);
      setCopied(false);
    }
  }, [isOpen, defaultText, destinatarioPhone]);

  if (!isOpen) return null;

  const quickPresets = [
    {
      label: 'Mensagem Padrão',
      text: defaultText,
    },
    {
      label: 'Pode vir por favor?',
      text: firstName ? `Olá, ${firstName}! Preciso do seu apoio. Pode vir por favor?` : 'Olá! Preciso do seu apoio. Pode vir por favor?',
    },
    {
      label: 'Dúvida Rápida',
      text: firstName ? `Olá, ${firstName}! Preciso tirar uma dúvida rápida, pode me responder por favor?` : 'Olá! Preciso tirar uma dúvida rápida.',
    },
    {
      label: 'Apoio com Alunos',
      text: firstName ? `Olá, ${firstName}! Consegue me apoiar com a turma agora?` : 'Olá! Consegue me apoiar com a turma agora?',
    },
  ];

  const handleSendWhatsApp = () => {
    if (onUpdatePhone && phone !== destinatarioPhone) {
      onUpdatePhone(phone);
    }
    const cleanNum = cleanPhoneNumber(phone);
    const url = buildApoioWhatsAppUrl(cleanNum, destinatarioName, message);
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.warn('Erro ao copiar texto:', err);
    }
  };

  const roleLabel =
    destinatarioRole === 'adi'
      ? 'Sua ADI'
      : destinatarioRole === 'monitora'
      ? 'Monitora Titular'
      : destinatarioRole === 'monitora_assistente'
      ? 'Monitora Assistente'
      : 'Apoio';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-emerald-200 shadow-inner shrink-0">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/20 text-emerald-100">
                  {roleLabel}
                </span>
                <span className="text-xs text-emerald-200 font-semibold truncate">
                  {turmaName}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black leading-tight truncate text-white">
                {destinatarioName}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Recipient & Phone bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                WhatsApp do Contato:
              </span>
              <span className="text-[11px] text-slate-500">
                {cleanPhoneNumber(phone) ? 'Pronto para envio' : 'Telefone não cadastrado'}
              </span>
            </div>

            <div className="relative">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(XX) XXXXX-XXXX"
                className="w-full pl-3 pr-24 py-2 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              {phone && (
                <span className="absolute right-3 top-2.5 text-[11px] font-semibold text-slate-400">
                  {formatPhoneDisplay(phone)}
                </span>
              )}
            </div>
            {!cleanPhoneNumber(phone) && (
              <p className="text-[10px] text-amber-700 font-medium">
                💡 Caso o número esteja vazio, você pode digitar acima para abrir diretamente no WhatsApp e salvar o contato.
              </p>
            )}
          </div>

          {/* Quick presets buttons */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>Opções Rápidas de Mensagem:</span>
              <button
                type="button"
                onClick={() => setMessage(defaultText)}
                className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Restaurar Padrão
              </button>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {quickPresets.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setMessage(preset.text)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                    message === preset.text
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Editable Message Field */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Mensagem a Enviar (Editável com seu estilo):
              </label>
              <span className="text-[10px] font-medium text-slate-400">
                {message.length} caracteres
              </span>
            </div>
            <textarea
              ref={textareaRef}
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite o recado para enviar..."
              className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 leading-relaxed shadow-xs"
            />
            <p className="text-[10px] text-slate-500 mt-1 italic">
              * Nota: A mensagem usa o nome da pessoa e não fixa sala, pois a turma pode estar em outro espaço (parque, quadra, etc.).
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyMessage}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors shadow-xs"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Copiar</span>
              </>
            )}
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md shadow-emerald-600/20 active:scale-[0.98] transition-all"
            >
              <Send className="w-4 h-4" />
              <span>Abrir WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
