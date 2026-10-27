import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  Send,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  BookMarked,
  Utensils,
  ClipboardList,
  Clock,
  Radio,
  FileText,
  User,
  ChevronRight,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  Student,
  AttendanceRecord,
  ScheduleBlock,
  UserProfile,
  PontoRecord,
  SofiaActionPayload,
} from '../types';
import { isAdmin, getStoredUser } from '../utils/authUtils';
import {
  querySofiaAgent,
  SofiaAgentContext,
} from '../services/sofiaAgentService';
import { TextToSpeechManager } from '../services/voiceAiService';

export interface SofiaAssistantMessage {
  id: string;
  sender: 'user' | 'sofia';
  text: string;
  timestamp: string;
  action?: SofiaActionPayload;
}

export interface SofiaAssistantProps {
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
  onOpenFeedbacks?: () => void;
}

export const SofiaAssistant: React.FC<SofiaAssistantProps> = ({
  students,
  records,
  currentUser,
  selectedDate,
  selectedTurma,
  selectedActivity,
  schedules,
  pontoRecords,
  activeTurmas,
  feedbacksCount,
  feedbacksPendingCount,
  onSaveRecord,
  onNavigateTab,
  onSelectTurma,
  onSelectDate,
  onOpenFeedbacks,
}) => {
  const effectiveUser = currentUser || getStoredUser();
  const isUserAdmin = isAdmin(effectiveUser);

  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [inputText, setInputText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [audioLevels, setAudioLevels] = useState<number[]>([20, 35, 60, 45, 25, 50, 30]);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [messages, setMessages] = useState<SofiaAssistantMessage[]>([
    {
      id: 'welcome',
      sender: 'sofia',
      text: 'Olá! Sou Sofia, assistente oficial do Programa Integral. Como posso ajudar com frequência, livro ponto, atividades ou normas hoje?',
      timestamp: 'Agora',
      action: {
        type: 'info',
        title: 'Sofia • Assistente Oficial',
        details: 'Pronta para comandos por voz ou texto',
        badge: 'Online',
        success: true,
      },
    },
  ]);

  // Contexto sincronizado com o estado vivo da aplicação
  const agentContext: SofiaAgentContext = {
    currentUser: effectiveUser,
    selectedDate,
    selectedTurma,
    selectedActivity,
    students,
    records,
    pontoRecords,
    schedules,
    activeTurmas,
    feedbacksCount,
    feedbacksPendingCount,
    onSaveRecord,
    onNavigateTab,
    onSelectTurma,
    onSelectDate,
    onOpenFeedbacks,
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Cooldown timer
  const triggerCooldown = useCallback((seconds = 4) => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    setCooldownSeconds(seconds);
    cooldownTimerRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      stopListening();
      TextToSpeechManager.stop();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Visualizer Loop
  const startVisualizer = async () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioContextRef.current && AudioCtx) {
        audioContextRef.current = new AudioCtx();
      }
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      if (!micStreamRef.current && navigator.mediaDevices?.getUserMedia) {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      if (audioContextRef.current && micStreamRef.current) {
        const source = audioContextRef.current.createMediaStreamSource(micStreamRef.current);
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 32;
        source.connect(analyser);
        analyserRef.current = analyser;

        const update = () => {
          if (!analyserRef.current) return;
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const sampleCount = 7;
          const step = Math.max(1, Math.floor(dataArray.length / sampleCount));
          const newLevels = [];
          for (let i = 0; i < sampleCount; i++) {
            const val = dataArray[i * step] || 0;
            newLevels.push(Math.min(100, Math.max(15, (val / 255) * 100)));
          }
          setAudioLevels(newLevels);
        };
        const interval = setInterval(update, 80);
        return () => clearInterval(interval);
      }
    } catch {
      // Ignora falha de microfone em ambientes restritos
    }
  };

  const stopVisualizer = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevels([20, 20, 20, 20, 20, 20, 20]);
  };

  // Envio de comando para a Sofia
  const handleSendCommand = async (text: string) => {
    const clean = text.trim();
    if (!clean || isProcessing || cooldownSeconds > 0) return;

    // Adiciona mensagem do usuário
    const userMsg: SofiaAssistantMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: clean,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setTranscript('');
    setIsProcessing(true);

    try {
      const response = await querySofiaAgent(clean, agentContext);

      const sofiaMsg: SofiaAssistantMessage = {
        id: `sofia_${Date.now()}`,
        sender: 'sofia',
        text: response.displayText || response.spokenText,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        action: response.action,
      };

      setMessages((prev) => [...prev, sofiaMsg]);

      // Síntese de fala se não estiver mudo
      if (!isMuted && response.spokenText) {
        setIsSpeaking(true);
        TextToSpeechManager.speak(response.spokenText, {
          onEnd: () => setIsSpeaking(false),
          onError: () => setIsSpeaking(false),
        });
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'sofia',
          text: 'Estou reestabelecendo a conexão com o sistema do Crescer. Tente novamente em alguns segundos.',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      triggerCooldown(5);
    } finally {
      setIsProcessing(false);
    }
  };

  // Reconhecimento de Fala
  const startListening = () => {
    if (cooldownSeconds > 0) return;
    TextToSpeechManager.stop();
    setIsSpeaking(false);

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Reconhecimento de fala não suportado neste navegador. Utilize o campo de texto para digitar seu comando.');
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = 'pt-BR';
      rec.continuous = false;
      rec.interimResults = true;

      rec.onstart = () => {
        setIsListening(true);
        startVisualizer();
      };

      rec.onresult = (e: any) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            const finalQuery = e.results[i][0].transcript;
            setTranscript(finalQuery);
            stopListening();
            handleSendCommand(finalQuery);
            return;
          } else {
            interim += e.results[i][0].transcript;
          }
        }
        setTranscript(interim);
      };

      rec.onerror = () => {
        stopListening();
      };

      rec.onend = () => {
        stopListening();
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      stopListening();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    stopVisualizer();
  };

  if (!isUserAdmin) return null;

  return (
    <>
      {/* Botão Flutuante Sofia */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-40 p-3.5 bg-gradient-to-r from-teal-800 via-indigo-900 to-slate-900 text-white rounded-3xl shadow-2xl border border-teal-500/40 hover:scale-105 active:scale-95 transition-all flex items-center space-x-2.5 cursor-pointer group"
          title="Abrir Assistente Virtual Sofia"
        >
          <div className="relative">
            <div className="w-8 h-8 rounded-2xl bg-teal-500/20 text-teal-300 flex items-center justify-center border border-teal-400/40 shadow-inner">
              <Sparkles className="w-4 h-4 text-teal-300 animate-pulse" />
            </div>
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900 animate-ping" />
          </div>
          <div className="text-left pr-1.5">
            <span className="block text-xs font-black tracking-tight text-white flex items-center gap-1">
              Sofia • IA
            </span>
            <span className="block text-[10px] text-teal-200/80 font-medium">
              Guia do Integral
            </span>
          </div>
        </button>
      )}

      {/* Janela de Interação Sofia */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-full sm:w-[420px] max-w-[95vw] h-[580px] max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-slate-300/80 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-teal-950 text-white p-4 flex items-center justify-between border-b border-teal-500/30 shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="relative">
                <div className="w-9 h-9 rounded-2xl bg-teal-500/20 text-teal-300 flex items-center justify-center border border-teal-400/40">
                  <Sparkles className="w-4.5 h-4.5 text-teal-300" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-1.5 leading-tight">
                  Sofia
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-200 border border-teal-400/30">
                    Oficial • Crescer
                  </span>
                </h3>
                <p className="text-[11px] text-slate-300">
                  Frequência • Ponto • Atividades • Normas
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => {
                  if (isSpeaking) {
                    TextToSpeechManager.stop();
                    setIsSpeaking(false);
                  }
                  setIsMuted(!isMuted);
                }}
                className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                  isMuted ? 'text-slate-400 hover:text-white' : 'text-teal-300 hover:text-white'
                }`}
                title={isMuted ? 'Ativar Voz' : 'Silenciar Voz'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopListening();
                  TextToSpeechManager.stop();
                  setIsOpen(false);
                }}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          {/* Visualizador de Áudio / Status de Voz */}
          {(isListening || isSpeaking) && (
            <div className="bg-teal-950/90 text-teal-200 px-4 py-2 border-b border-teal-800/60 flex items-center justify-between text-xs font-semibold shrink-0">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-teal-400 animate-pulse" />
                {isListening ? 'Ouvindo sua voz...' : 'Sofia respondendo...'}
              </span>
              <div className="flex items-center space-x-1">
                {audioLevels.map((lvl, idx) => (
                  <span
                    key={idx}
                    className="w-1 bg-teal-400 rounded-full transition-all duration-75"
                    style={{ height: `${lvl * 0.16}px` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Histórico do Chat */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-slate-50/70">
            {messages.map((m) => {
              const isUser = m.sender === 'user';
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-in fade-in duration-150`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs leading-relaxed ${
                      isUser
                        ? 'bg-gradient-to-r from-teal-700 to-indigo-800 text-white font-medium rounded-tr-xs'
                        : 'bg-white border border-slate-200/90 text-slate-800 rounded-tl-xs'
                    }`}
                  >
                    <p className="whitespace-pre-line">{m.text}</p>
                    {m.action && (
                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/80">
                          {m.action.badge || m.action.title}
                        </span>
                        {m.action.targetTab && (
                          <button
                            type="button"
                            onClick={() => onNavigateTab && onNavigateTab(m.action!.targetTab)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>Ir para tela</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-400 mt-0.5 px-1 font-medium">
                    {m.timestamp}
                  </span>
                </div>
              );
            })}

            {isProcessing && (
              <div className="flex items-center space-x-2 text-xs text-slate-500 bg-white p-2.5 rounded-2xl border border-slate-200 w-fit">
                <Sparkles className="w-3.5 h-3.5 text-teal-600 animate-spin" />
                <span className="font-semibold text-slate-600">Consultando o sistema do Integral...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Atalhos Rápidos de Ação Institucional */}
          <div className="px-3 py-2 bg-white border-t border-slate-100 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-[11px]">
              <button
                type="button"
                onClick={() => handleSendCommand('gerar resumo do dia')}
                className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold whitespace-nowrap cursor-pointer transition-colors"
              >
                📊 Resumo do Dia
              </button>
              <button
                type="button"
                onClick={() => handleSendCommand('ir para o livro ponto')}
                className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold whitespace-nowrap cursor-pointer transition-colors"
              >
                ⏱️ Livro Ponto
              </button>
              <button
                type="button"
                onClick={() => handleSendCommand('buscar faltas')}
                className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold whitespace-nowrap cursor-pointer transition-colors"
              >
                ⚠️ Buscar Faltas
              </button>
              <button
                type="button"
                onClick={() => handleSendCommand('abrir manual de normas')}
                className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold whitespace-nowrap cursor-pointer transition-colors"
              >
                📖 Manual de Normas
              </button>
              <button
                type="button"
                onClick={() => handleSendCommand('ver cardápio de hoje')}
                className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold whitespace-nowrap cursor-pointer transition-colors"
              >
                🍽️ Cardápio
              </button>
            </div>
          </div>

          {/* Barra de Entrada (Texto e Voz) */}
          <div className="p-3 bg-white border-t border-slate-200 shrink-0">
            {transcript && (
              <p className="text-[11px] text-teal-800 italic mb-1.5 truncate">
                Ouvindo: &quot;{transcript}&quot;
              </p>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendCommand(inputText);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Fale com a Sofia ou digite um comando..."
                disabled={isProcessing}
                className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 text-slate-800 placeholder-slate-400 font-medium"
              />

              {/* Botão de Microfone */}
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                disabled={cooldownSeconds > 0}
                className={`p-2 rounded-xl transition-all cursor-pointer shrink-0 ${
                  isListening
                    ? 'bg-rose-600 text-white animate-pulse shadow-md shadow-rose-600/30'
                    : 'bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200'
                }`}
                title={isListening ? 'Parar gravação' : 'Falar por voz'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Botão de Enviar */}
              <button
                type="submit"
                disabled={!inputText.trim() || isProcessing}
                className="p-2 bg-gradient-to-r from-teal-700 to-indigo-800 hover:from-teal-600 hover:to-indigo-700 text-white rounded-xl transition-all cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
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

export default SofiaAssistant;
export { SofiaAssistant as VoiceWidget };
