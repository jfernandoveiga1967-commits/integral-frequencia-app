import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  Bot,
  User,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  BookMarked,
  Utensils,
  ClipboardList,
  HelpCircle,
  Radio,
} from 'lucide-react';
import {
  VoiceAgentState,
  VoiceActionResult,
  VoiceAgentContext,
  processVoiceAgentQuery,
  TextToSpeechManager,
} from '../services/voiceAiService';
import { Student, AttendanceRecord, ScheduleBlock, UserProfile } from '../types';
import { isAdmin, getStoredUser } from '../utils/authUtils';

interface VoiceMessage {
  id: string;
  sender: 'user' | 'sofia';
  text: string;
  timestamp: string;
  actionResult?: VoiceActionResult;
}

interface VoiceWidgetProps {
  students: Student[];
  records: AttendanceRecord[];
  currentUser?: UserProfile | null;
  selectedDate: string;
  selectedTurma?: string;
  selectedActivity?: string;
  schedules?: ScheduleBlock[];
  onSaveRecord?: (record: Omit<AttendanceRecord, 'id' | 'createdAt'>) => Promise<void> | void;
  onNavigateTab?: (tab: any) => void;
  onSelectTurma?: (turma: any) => void;
  onSelectDate?: (date: string) => void;
}

export const VoiceWidget: React.FC<VoiceWidgetProps> = ({
  students,
  records,
  currentUser,
  selectedDate,
  selectedTurma,
  selectedActivity,
  schedules,
  onSaveRecord,
  onNavigateTab,
  onSelectTurma,
  onSelectDate,
}) => {
  const effectiveUser = currentUser || getStoredUser();
  const isUserAdmin = isAdmin(effectiveUser);

  const [isOpen, setIsOpen] = useState(false);
  const [agentState, setAgentState] = useState<VoiceAgentState>('Aguardando');
  const [transcript, setTranscript] = useState('');
  const currentTranscriptRef = useRef('');
  const [messages, setMessages] = useState<VoiceMessage[]>([
    {
      id: 'welcome',
      sender: 'sofia',
      text: 'Olá! Sou Sofia, sua assistente por voz do Integral. Posso consultar pendências de chamada, registrar presença, buscar no Manual de 50 Normas ou conferir o cardápio e semanário. Toque no microfone ou fale comigo!',
      timestamp: 'Agora',
      actionResult: {
        type: 'info',
        title: 'Sofia • Guia do Integral',
        details: 'Comandos por voz e inteligência artificial pedagógica.',
        badge: 'Pronta',
      },
    },
  ]);

  // Audio Visualizer states
  const [audioLevels, setAudioLevels] = useState<number[]>([20, 35, 60, 45, 25, 50, 30]);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Context bundle
  const voiceContext: VoiceAgentContext = {
    currentUser: effectiveUser,
    selectedDate,
    selectedTurma,
    selectedActivity,
    students,
    records,
    schedules,
    onSaveRecord,
    onNavigateTab,
    onSelectTurma,
    onSelectDate,
  };

  // Scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Cleanup Web Audio & Speech on unmount
  useEffect(() => {
    return () => {
      stopListening();
      TextToSpeechManager.stop();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Web Audio Visualizer Loop
  const startAudioVisualizer = async () => {
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }
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

        const updateLevels = () => {
          if (!analyserRef.current) return;
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);

          // Pega 7 bandas de frequência
          const sampleCount = 7;
          const step = Math.max(1, Math.floor(dataArray.length / sampleCount));
          const newLevels: number[] = [];

          for (let i = 0; i < sampleCount; i++) {
            const val = dataArray[i * step] || 0;
            // Normaliza entre 15% e 100% de altura
            const heightPercent = Math.min(100, Math.max(15, (val / 255) * 100));
            newLevels.push(heightPercent);
          }

          setAudioLevels(newLevels);
          animFrameRef.current = requestAnimationFrame(updateLevels);
        };

        updateLevels();
      }
    } catch (err) {
      console.warn('[VoiceWidget] Audio visualizer fallback acionado:', err);
    }
  };

  const stopAudioVisualizer = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevels([18, 28, 40, 30, 20, 35, 22]);
  };

  // Simulação de ondas sonoras rítmicas durante o estado 'Falando...'
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (agentState === 'Falando...') {
      interval = setInterval(() => {
        setAudioLevels([
          30 + Math.random() * 55,
          45 + Math.random() * 50,
          60 + Math.random() * 40,
          75 + Math.random() * 25,
          55 + Math.random() * 45,
          40 + Math.random() * 55,
          25 + Math.random() * 60,
        ]);
      }, 120);
    } else if (agentState === 'Processando...') {
      interval = setInterval(() => {
        setAudioLevels((prev) => prev.map((_, idx) => 25 + Math.sin(Date.now() / 200 + idx) * 20));
      }, 100);
    } else if (agentState === 'Aguardando') {
      setAudioLevels([15, 20, 25, 20, 18, 22, 16]);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [agentState]);

  // Redefinição e recuperação resiliente do AudioContext
  const resetAudioContext = async () => {
    try {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        await audioContextRef.current.close().catch(() => {});
      }
      audioContextRef.current = null;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioContextRef.current = new AudioCtx();
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
      }
    } catch (err) {
      console.warn('[VoiceWidget] Aviso ao redefinir AudioContext:', err);
    }
  };

  // Envio e processamento de consulta para Sofia
  const handleProcessUserText = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed) {
      setAgentState('Aguardando');
      return;
    }

    // Adiciona fala do usuário
    const userMsg: VoiceMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setTranscript('');
    currentTranscriptRef.current = '';
    setAgentState('Processando...');

    try {
      const response = await processVoiceAgentQuery(trimmed, voiceContext);

      const sofiaMsg: VoiceMessage = {
        id: `sofia-${Date.now()}`,
        sender: 'sofia',
        text: response.displayText || response.spokenText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionResult: response.actionResult,
      };

      setMessages((prev) => [...prev, sofiaMsg]);
      setAgentState('Falando...');

      // Síntese de Voz (TTS) com destravamento garantido
      TextToSpeechManager.speak(response.spokenText, {
        onStart: () => setAgentState('Falando...'),
        onEnd: () => setAgentState('Aguardando'),
        onError: () => setAgentState('Aguardando'),
      });
    } catch (error) {
      console.error('[VoiceWidget] Erro ao processar:', error);
      const fallbackText = 'Estou reestabelecendo minha conexão com o sistema do Crescer, tente novamente em alguns instantes.';
      const errorMsg: VoiceMessage = {
        id: `err-${Date.now()}`,
        sender: 'sofia',
        text: fallbackText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setAgentState('Falando...');
      TextToSpeechManager.speak(fallbackText, {
        onEnd: () => setAgentState('Aguardando'),
        onError: () => setAgentState('Aguardando'),
      });
    }
  };

  // Inicia captura de voz
  const startListening = async () => {
    TextToSpeechManager.stop();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.resume();
      } catch {}
    }
    await resetAudioContext();

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Seu navegador não suporta captura nativa de fala. Você pode usar as sugestões interativas.');
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.interimResults = true;
      recognition.continuous = false;

      recognition.onstart = () => {
        setAgentState('Ouvindo...');
        setTranscript('');
        currentTranscriptRef.current = '';
        startAudioVisualizer();
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        currentTranscriptRef.current = currentTranscript;
        setTranscript(currentTranscript);

        // Se for o resultado final
        if (event.results[0] && event.results[0].isFinal) {
          stopListening();
          handleProcessUserText(currentTranscript);
        }
      };

      recognition.onerror = (e: any) => {
        console.warn('[VoiceWidget] Reconhecimento de fala:', e.error);
        stopListening();
        setAgentState('Aguardando');
      };

      recognition.onend = () => {
        stopAudioVisualizer();
        const pending = currentTranscriptRef.current.trim();
        if (pending && agentState === 'Ouvindo...') {
          handleProcessUserText(pending);
        } else if (agentState === 'Ouvindo...') {
          setAgentState('Aguardando');
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('[VoiceWidget] Erro ao abrir microfone:', err);
      setAgentState('Aguardando');
      stopAudioVisualizer();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    stopAudioVisualizer();
  };

  const toggleListening = async () => {
    if (agentState === 'Ouvindo...') {
      const captured = currentTranscriptRef.current.trim() || transcript.trim();
      stopListening();
      if (captured) {
        handleProcessUserText(captured);
      } else {
        setAgentState('Aguardando');
      }
    } else {
      // Se estava Processando..., Falando... ou Aguardando, destrava, redefine AudioContext e inicia
      TextToSpeechManager.stop();
      await resetAudioContext();
      startListening();
    }
  };

  const stopSpeaking = () => {
    TextToSpeechManager.stop();
    setAgentState('Aguardando');
  };

  // Proteção de visibilidade: exclusivo para Administrador
  if (!isUserAdmin) {
    return null;
  }

  return (
    <>
      {/* 1. BOTÃO FLUTUANTE DISCRETO E ELEGANTE (FAB) */}
      <div className="fixed bottom-6 right-6 z-40 print:hidden no-print">
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            // Começa ouvindo ao abrir se estiver ociosa
            if (agentState === 'Aguardando') {
              setTimeout(() => startListening(), 300);
            }
          }}
          className="relative group p-3.5 sm:p-4 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-xl shadow-indigo-500/25 border border-indigo-400/30 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center"
          title="Abrir Sofia — Guia do Integral por Voz"
        >
          {/* Anel de Pulso Animado */}
          <span className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 opacity-30 group-hover:opacity-75 blur-xs animate-pulse transition duration-500" />

          {/* Ícone com mini visualizer */}
          <div className="relative flex items-center space-x-2">
            <Mic className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            <span className="hidden md:inline-block font-extrabold text-xs tracking-wide">
              Sofia • Voz
            </span>
          </div>

          {/* Badge de status */}
          <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white" />
          </span>
        </button>
      </div>

      {/* 2. MODAL DE ESCUTA INTERATIVA E DIÁLOGO POR VOZ */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header da Modal */}
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/30">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-black tracking-wide text-white">
                      Sofia — Guia do Integral
                    </h3>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-full flex items-center space-x-1">
                      <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
                      <span>IA por Voz</span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Colégio Crescer • Chamada, Manual de 50 Normas e Cardápio
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1.5">
                {agentState === 'Falando...' && (
                  <button
                    type="button"
                    onClick={stopSpeaking}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 transition-colors cursor-pointer"
                    title="Parar fala de Sofia"
                  >
                    <VolumeX className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    stopListening();
                    TextToSpeechManager.stop();
                    setIsOpen(false);
                  }}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Fechar janela"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Status Bar Proeminente com os 4 Estados */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-500">Status:</span>
                <span
                  className={`text-xs font-black px-3 py-1 rounded-full border flex items-center space-x-1.5 transition-all ${
                    agentState === 'Ouvindo...'
                      ? 'bg-rose-50 text-rose-700 border-rose-300 ring-2 ring-rose-400/40 animate-pulse'
                      : agentState === 'Processando...'
                      ? 'bg-amber-50 text-amber-800 border-amber-300 ring-2 ring-amber-400/40 animate-pulse'
                      : agentState === 'Falando...'
                      ? 'bg-purple-50 text-purple-700 border-purple-300 ring-2 ring-purple-400/40 animate-pulse'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      agentState === 'Ouvindo...'
                        ? 'bg-rose-500 animate-ping'
                        : agentState === 'Processando...'
                        ? 'bg-amber-500 animate-spin'
                        : agentState === 'Falando...'
                        ? 'bg-purple-500 animate-bounce'
                        : 'bg-emerald-500'
                    }`}
                  />
                  <span>{agentState}</span>
                </span>
              </div>

              {/* Indicador de Onda Sonora (Audio Visualizer Waves) */}
              <div className="flex items-center space-x-1 h-7 px-3 py-1 bg-white border border-slate-200 rounded-xl shadow-2xs">
                {audioLevels.map((lvl, idx) => (
                  <span
                    key={idx}
                    className={`w-1 rounded-full transition-all duration-75 ${
                      agentState === 'Ouvindo...'
                        ? 'bg-rose-500'
                        : agentState === 'Falando...'
                        ? 'bg-purple-600'
                        : agentState === 'Processando...'
                        ? 'bg-amber-500'
                        : 'bg-slate-300'
                    }`}
                    style={{ height: `${lvl}%` }}
                  />
                ))}
              </div>
            </div>

            {/* Área de Histórico de Diálogo */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/60">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.sender === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`flex items-start space-x-2.5 max-w-[88%] ${
                      msg.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                        msg.sender === 'user'
                          ? 'bg-slate-800 text-white'
                          : 'bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-2xs'
                      }`}
                    >
                      {msg.sender === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                    </div>

                    <div
                      className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-slate-900 text-white rounded-tr-xs shadow-xs'
                          : 'bg-white text-slate-800 border border-slate-200 rounded-tl-xs shadow-xs'
                      }`}
                    >
                      <div className="font-medium whitespace-pre-wrap">{msg.text}</div>

                      {/* Card de Ação Concluída (Function Calling Result) */}
                      {msg.actionResult && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-col space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-[11px] text-indigo-950 flex items-center space-x-1">
                              {msg.actionResult.type === 'chamada' && <ClipboardList className="w-3.5 h-3.5 text-emerald-600" />}
                              {msg.actionResult.type === 'norma' && <BookMarked className="w-3.5 h-3.5 text-indigo-600" />}
                              {msg.actionResult.type === 'cardapio' && <Utensils className="w-3.5 h-3.5 text-amber-600" />}
                              {msg.actionResult.type === 'semanario' && <Sparkles className="w-3.5 h-3.5 text-purple-600" />}
                              <span>{msg.actionResult.title}</span>
                            </span>
                            {msg.actionResult.badge && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {msg.actionResult.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600">{msg.actionResult.details}</p>
                        </div>
                      )}

                      <span
                        className={`text-[9.5px] block mt-1 text-right ${
                          msg.sender === 'user' ? 'text-slate-400' : 'text-slate-400'
                        }`}
                      >
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Transcrição em tempo real enquanto o usuário fala */}
              {agentState === 'Ouvindo...' && transcript && (
                <div className="flex flex-col items-end animate-in fade-in">
                  <div className="bg-rose-50 border border-rose-200 text-rose-950 text-xs sm:text-sm p-3 rounded-2xl rounded-tr-xs shadow-2xs max-w-[85%] italic flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                    <span>"{transcript}"</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Sugestões Rápidas de Comando */}
            <div className="px-4 py-2.5 bg-white border-t border-slate-100 shrink-0">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                <HelpCircle className="w-3 h-3 text-slate-400" />
                <span>Exemplos de comandos rápidos:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Quem falta chamar hoje?',
                  'Regra do uso de celular',
                  'Qual é o cardápio do almoço?',
                  'Semanário do 1º Ano',
                ].map((sug, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleProcessUserText(sug)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>

            {/* Painel de Controle Principal do Microfone */}
            <div className="p-4 sm:p-5 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-500 font-medium">
                {agentState === 'Ouvindo...'
                  ? 'Fale com clareza... (toque no botão para finalizar)'
                  : agentState === 'Falando...'
                  ? 'Sofia está respondendo...'
                  : agentState === 'Processando...'
                  ? 'Consultando base pedagógica...'
                  : 'Toque no microfone para falar'}
              </div>

              <div className="flex items-center space-x-3">
                {agentState === 'Falando...' ? (
                  <button
                    type="button"
                    onClick={stopSpeaking}
                    className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
                  >
                    <VolumeX className="w-4 h-4" />
                    <span>Silenciar</span>
                  </button>
                ) : null}

                {/* Botão de Gravação Principal */}
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`px-5 py-3 rounded-2xl font-black text-xs transition-all shadow-lg cursor-pointer flex items-center space-x-2 ${
                    agentState === 'Ouvindo...'
                      ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30 scale-105 ring-4 ring-rose-400/40 animate-pulse'
                      : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-500/25'
                  }`}
                >
                  {agentState === 'Ouvindo...' ? (
                    <>
                      <MicOff className="w-4 h-4 animate-bounce" />
                      <span>Concluir Fala</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      <span>Falar com Sofia</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
