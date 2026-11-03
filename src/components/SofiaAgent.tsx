/**
 * SofiaAgent.tsx
 * Agente de IA Autônomo e Resolutivo Oficial do Colégio Crescer (Sofia).
 * Compreende linguagem natural, analisa o estado global em tempo real (RAG Local)
 * e executa ferramentas reais do sistema (PDFs de Ponto, Autorizações de Portaria,
 * Frequência, Alertas e Diagnóstico).
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  FileDown,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Activity,
  FileText,
  MessageSquare,
  Maximize2,
  Minimize2,
  Loader2,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import {
  Student,
  AttendanceRecord,
  PontoRecord,
  UserProfile,
  ScheduleBlock,
  SofiaChatMessage,
  SofiaToolCall,
  SofiaToolResult,
} from '../types';
import { isAdmin, getStoredUser } from '../utils/authUtils';
import { toISODateString, getDayOfWeekFromDate } from '../utils/dateUtils';
import {
  sendSofiaMessage,
  buildLiveAppStateSummary,
} from '../services/sofiaService';
import { SofiaToolExecutionContext } from '../services/sofiaTools';
import { TextToSpeechManager } from '../services/voiceAiService';

export interface SofiaAgentProps {
  students: Student[];
  records: AttendanceRecord[];
  currentUser?: UserProfile | null;
  selectedDate: string;
  selectedTurma?: string;
  selectedActivity?: string;
  schedules?: ScheduleBlock[];
  pontoRecords?: PontoRecord[];
  activeTurmas?: string[];
  feedbacksCount?: number;
  feedbacksPendingCount?: number;
  onSaveRecord?: (record: Omit<AttendanceRecord, 'id' | 'createdAt'>) => Promise<void> | void;
  onNavigateTab?: (tab: any) => void;
  onSelectTurma?: (turma: any) => void;
  onSelectDate?: (date: string) => void;
}

export const SofiaAgent: React.FC<SofiaAgentProps> = ({
  students,
  records,
  currentUser,
  selectedDate,
  selectedTurma,
  selectedActivity,
  schedules,
  pontoRecords,
  activeTurmas,
  onSaveRecord,
  onNavigateTab,
  onSelectTurma,
  onSelectDate,
}) => {
  const effectiveUser = currentUser || getStoredUser();
  const isUserAdmin = isAdmin(effectiveUser);

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [executingToolName, setExecutingToolName] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Estado ao vivo RAG
  const appState = buildLiveAppStateSummary({
    students,
    records,
    pontoRecords,
    currentUser: effectiveUser,
    selectedDate,
    activeTurmas,
    schedules,
  });

  const toolContext: SofiaToolExecutionContext = {
    students,
    records,
    pontoRecords,
    currentUser: effectiveUser,
    selectedDate,
    selectedTurma,
    selectedActivity,
    activeTurmas,
    schedules,
    onSaveRecord,
    onNavigateTab,
    appState,
  };

  const userFirstName = effectiveUser?.name ? effectiveUser.name.split(' ')[0] : 'Fernando';
  const initialGreeting = `Olá, ${userFirstName}! Como posso te ajudar hoje?`;

  // Histórico de Mensagens da Sessão
  const [messages, setMessages] = useState<SofiaChatMessage[]>([
    {
      id: 'welcome',
      sender: 'sofia',
      text: initialGreeting,
      timestamp: appState.currentTime,
    },
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, executingToolName]);

  // Conjunto de alertas proativos de saída antecipada já emitidos para evitar repetições
  const spokenDepartureAlertsRef = useRef<Set<string>>(new Set());

  // Motor de Alertas Proativos em Segundo Plano (Background Speech Trigger)
  // Monitora a proximidade de 10-15 minutos de saídas antecipadas agendadas no dia
  useEffect(() => {
    const checkUpcomingDepartures = () => {
      const now = new Date();
      const nowHours = now.getHours();
      const nowMinutes = now.getMinutes();
      const currentTotalMinutes = nowHours * 60 + nowMinutes;
      const todayISO = toISODateString(now);
      const dayOfWeek = getDayOfWeekFromDate(todayISO);

      const activeStudents = (students || []).filter(
        (s) => (s.status || s.statusMatricula || 'ativo') === 'ativo'
      );

      const recordMap = new Map<string, AttendanceRecord>();
      (records || []).forEach((r) => {
        if (r.date === todayISO) {
          recordMap.set(r.studentId, r);
        }
      });

      activeStudents.forEach((student) => {
        const rec = recordMap.get(student.id);

        // Se o checkout já foi confirmado ou o aluno já foi liberado, não dispara
        if (rec?.checkoutConfirmed) {
          return;
        }

        let departureTimeStr = '';
        if (rec && (rec.status === 'saida_antecipada' || rec.exitTime)) {
          departureTimeStr = rec.exitTime || '';
        }

        if (!departureTimeStr) {
          const sHorario = student.horariosSaida?.[dayOfWeek as any] || student.horarioSaida;
          if (sHorario) {
            const cleanH = sHorario.trim();
            // Saída antecipada em relação ao fim do turno regular (17:30)
            if (cleanH < '17:00' && cleanH >= '12:00') {
              departureTimeStr = cleanH;
            }
          }
        }

        if (!departureTimeStr || !departureTimeStr.includes(':')) {
          return;
        }

        const [depH, depM] = departureTimeStr.split(':').map((v) => parseInt(v, 10));
        if (isNaN(depH) || isNaN(depM)) return;

        const depTotalMinutes = depH * 60 + depM;
        const diffMinutes = depTotalMinutes - currentTotalMinutes;

        // Janela de 10-15 minutos antes da Saída Antecipada cadastrada
        if (diffMinutes >= 10 && diffMinutes <= 15) {
          const alertKey = `${todayISO}_${student.id}_${departureTimeStr}`;
          if (!spokenDepartureAlertsRef.current.has(alertKey)) {
            spokenDepartureAlertsRef.current.add(alertKey);

            const spokenNotice = `Aviso de Portaria: A saída antecipada de ${student.name} está agendada para às ${departureTimeStr}.`;

            // Adiciona aviso proativo no histórico da Sofia
            setMessages((prev) => [
              ...prev,
              {
                id: `dep_alert_${Date.now()}_${student.id}`,
                sender: 'sofia',
                text: `⏰ **Aviso de Portaria (Saída Antecipada)**\nA saída antecipada do(a) aluno(a) **${student.name}** (${student.turma}) está agendada para às **${departureTimeStr}** (em aproximadamente ${diffMinutes} minutos).`,
                timestamp: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
              },
            ]);

            // Emite aviso de voz curto caso áudio esteja ativo
            if (!isMuted) {
              TextToSpeechManager.speak(spokenNotice);
            }
          }
        }
      });
    };

    checkUpcomingDepartures();
    const intervalTimer = setInterval(checkUpcomingDepartures, 30000);
    return () => clearInterval(intervalTimer);
  }, [students, records, isMuted]);

  // Envio de Mensagem
  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt || inputText).trim();
    if (!textToSend || isProcessing) return;

    const userMessage: SofiaChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!customPrompt) setInputText('');
    setIsProcessing(true);
    setExecutingToolName(null);

    try {
      const response = await sendSofiaMessage({
        message: textToSend,
        history: messages,
        context: toolContext,
        onToolExecuting: (toolName) => {
          setExecutingToolName(toolName);
        },
      });

      const sofiaMessage: SofiaChatMessage = {
        id: `sofia_${Date.now()}`,
        sender: 'sofia',
        text: response.text,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        toolCall: response.toolCall,
        toolResult: response.toolResult,
      };

      setMessages((prev) => [...prev, sofiaMessage]);

      // Leitura por voz (Text-to-Speech) direta e natural
      if (!isMuted && (response.toolResult?.spokenText || response.text)) {
        const textToSpeak = response.toolResult?.spokenText || response.text;
        const cleanSpeakText = textToSpeak
          .replace(/http[^\s]+/g, '')
          .replace(/[#*`_]/g, '')
          .replace(/\n•/g, ', ')
          .replace(/\n+/g, '. ')
          .trim()
          .slice(0, 320);
        TextToSpeechManager.speak(cleanSpeakText);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'sofia',
          text: 'Ocorreu uma oscilação na resposta. Pode repetir seu comando, por favor?',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsProcessing(false);
      setExecutingToolName(null);
    }
  };

  // Reconhecimento de Voz
  const toggleListening = () => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          sender: 'sofia',
          text: initialGreeting,
          timestamp: appState.currentTime,
        },
      ]);
    }

    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
      setIsListening(false);
      return;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Reconhecimento de voz não suportado neste navegador. Digite sua mensagem no campo de texto.');
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = 'pt-BR';
      rec.continuous = false;
      rec.interimResults = false;

      rec.onstart = () => setIsListening(true);
      rec.onresult = (e: any) => {
        const transcript = e.results[0][0].transcript;
        setIsListening(false);
        handleSendMessage(transcript);
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleOpenSofia = () => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          sender: 'sofia',
          text: initialGreeting,
          timestamp: appState.currentTime,
        },
      ]);
    }
    setIsOpen(true);
  };

  // Restrito à Coordenação / Administrador
  if (!isUserAdmin) return null;

  return (
    <>
      {/* Botão Flutuante Sofia */}
      {!isOpen && (
        <button
          type="button"
          onClick={handleOpenSofia}
          className="fixed bottom-5 right-5 z-40 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl shadow-2xl border border-teal-500/40 hover:border-teal-400/80 hover:scale-105 active:scale-95 transition-all flex items-center space-x-2.5 cursor-pointer group"
          title="Abrir Sofia"
        >
          <div className="relative">
            <div className="w-7 h-7 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center border border-teal-400/40 shadow-inner">
              <Sparkles className="w-4 h-4 text-teal-300 group-hover:rotate-12 transition-transform duration-300" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-slate-900 animate-ping" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-slate-900" />
          </div>
          <span className="text-xs font-bold text-white tracking-wide pr-1">
            💬 Sofia
          </span>
        </button>
      )}

      {/* Janela do Chat da Sofia */}
      {isOpen && (
        <div
          className={`fixed bottom-4 right-4 z-50 bg-white rounded-3xl shadow-2xl border border-slate-300/80 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200 ${
            isExpanded
              ? 'w-[96vw] sm:w-[680px] h-[85vh] max-h-[92vh]'
              : 'w-full sm:w-[460px] max-w-[95vw] h-[640px] max-h-[90vh]'
          }`}
        >
          {/* Header Superior */}
          <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-teal-950 text-white p-4 flex items-center justify-between border-b border-teal-500/30 shrink-0">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-2xl bg-teal-500/20 text-teal-300 flex items-center justify-center border border-teal-400/40">
                  <Sparkles className="w-5 h-5 text-teal-300" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2 leading-tight">
                  Sofia
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-200 border border-teal-400/30">
                    Assistente Oficial • IA
                  </span>
                </h3>
                <p className="text-[11px] text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-teal-300" />
                  Programa Integral • Colégio Crescer
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => {
                  TextToSpeechManager.stop();
                  setIsMuted(!isMuted);
                }}
                className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                  isMuted
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-white/10 text-slate-300 hover:text-white'
                }`}
                title={isMuted ? 'Áudio desativado' : 'Áudio ativado'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded-xl bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer hidden sm:block"
                title={isExpanded ? 'Diminuir janela' : 'Expandir janela'}
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  TextToSpeechManager.stop();
                  setIsOpen(false);
                }}
                className="p-1.5 rounded-xl bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Fechar Sofia"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tarja de RAG Local / Estado Vivo */}
          <div className="bg-slate-900 text-slate-200 px-4 py-2 text-[11px] flex items-center justify-between border-b border-slate-800 shrink-0">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-white">Estado ao Vivo:</span>
              <span className="text-slate-300">
                {appState.currentTime} • {appState.totalPresentesHoje} presentes
              </span>
            </div>
            <div className="flex items-center space-x-1 text-slate-400">
              <Clock className="w-3 h-3 text-teal-400" />
              <span>{appState.formattedDate}</span>
            </div>
          </div>

          {/* Área de Mensagens com Rolagem */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/70">
            {messages.map((msg) => {
              const isSofia = msg.sender === 'sofia';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isSofia ? 'items-start' : 'items-end'}`}
                >
                  <div className="flex items-center space-x-1.5 mb-1 px-1">
                    <span className="text-[10px] font-bold text-slate-500">
                      {isSofia ? 'Sofia (Assistente Oficial)' : effectiveUser?.name || 'Você'}
                    </span>
                    <span className="text-[10px] text-slate-400">• {msg.timestamp}</span>
                  </div>

                  <div
                    className={`max-w-[88%] rounded-2xl p-3.5 text-xs shadow-sm whitespace-pre-wrap leading-relaxed ${
                      isSofia
                        ? 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-sm'
                        : 'bg-indigo-900 text-white rounded-tr-sm'
                    }`}
                  >
                    {msg.text}

                    {/* Badge e Card de Ação Concluída da Ferramenta */}
                    {msg.toolResult && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col space-y-2">
                        <div className="flex items-center space-x-2 text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-200">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Ação concluída com sucesso no sistema</span>
                        </div>

                        {/* Botão de Download de PDF */}
                        {msg.toolResult.downloadUrl && (
                          <div className="bg-slate-900 text-white p-3 rounded-2xl flex items-center justify-between shadow-md">
                            <div className="flex items-center space-x-2.5 overflow-hidden">
                              <FileText className="w-5 h-5 text-teal-300 shrink-0" />
                              <div className="truncate">
                                <span className="block font-bold text-teal-200 text-[11px] truncate">
                                  {msg.toolResult.filename || 'Documento Oficial em PDF'}
                                </span>
                                <span className="text-[10px] text-slate-300">
                                  Pronto para visualização e impressão
                                </span>
                              </div>
                            </div>

                            <a
                              href={msg.toolResult.downloadUrl}
                              download={msg.toolResult.filename || 'documento_sofia.pdf'}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white text-[11px] font-bold rounded-xl shadow transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                              <span>Baixar PDF</span>
                            </a>
                          </div>
                        )}

                        {/* Botão de Disparo WhatsApp */}
                        {msg.toolResult.whatsappUrl && (
                          <div className="bg-emerald-950 text-white p-3 rounded-2xl flex items-center justify-between shadow-md">
                            <div className="flex items-center space-x-2.5 overflow-hidden">
                              <MessageSquare className="w-5 h-5 text-emerald-400 shrink-0" />
                              <div className="truncate">
                                <span className="block font-bold text-emerald-200 text-[11px] truncate">
                                  Alerta WhatsApp Pronto
                                </span>
                                <span className="text-[10px] text-emerald-300/80">
                                  Texto formatado para envio direto
                                </span>
                              </div>
                            </div>

                            <a
                              href={msg.toolResult.whatsappUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-xl shadow transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Abrir WhatsApp</span>
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Indicador Visual de Execução de Ferramenta */}
            {isProcessing && (
              <div className="flex flex-col items-start animate-in fade-in duration-200">
                <div className="flex items-center space-x-2 bg-gradient-to-r from-teal-50 to-indigo-50 border border-teal-300/60 text-slate-800 px-3.5 py-2.5 rounded-2xl shadow-sm text-xs">
                  <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />
                  <span className="font-semibold text-teal-900">
                    {executingToolName
                      ? `Executando ferramenta: ${executingToolName}...`
                      : 'Sofia está analisando e formulando resposta...'}
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>


          {/* Campo de Entrada de Mensagem */}
          <div className="p-3 bg-white border-t border-slate-200/80 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center space-x-2"
            >
              <button
                type="button"
                onClick={toggleListening}
                className={`p-2.5 rounded-2xl transition-all cursor-pointer ${
                  isListening
                    ? 'bg-rose-600 text-white animate-pulse ring-4 ring-rose-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                }`}
                title={isListening ? 'Parar gravação' : 'Falar por voz com a Sofia'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isProcessing}
                placeholder="Fale com a Sofia ou solicite uma ação..."
                className="flex-1 bg-slate-100 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white transition-all disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || isProcessing}
                className="p-2.5 bg-gradient-to-r from-teal-700 to-indigo-900 hover:from-teal-800 hover:to-indigo-950 text-white rounded-2xl shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Enviar comando"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default SofiaAgent;
