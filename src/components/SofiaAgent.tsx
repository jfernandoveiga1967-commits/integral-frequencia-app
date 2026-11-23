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
  Clock,
  FileText,
  MessageSquare,
  Maximize2,
  Minimize2,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import {
  Student,
  AttendanceRecord,
  PontoRecord,
  UserProfile,
  ScheduleBlock,
  SemanarioPlan,
  TurmaAtribuicao,
  HolidayItem,
  ActivityItem,
  SofiaChatMessage,
  SofiaAuditLogEntry,
} from '../types';
import { getStoredUser, isAdmin } from '../utils/authUtils';
import { toISODateString, getDayOfWeekFromDate } from '../utils/dateUtils';
import {
  sendSofiaMessage,
  buildLiveAppStateSummary,
} from '../services/sofiaService';
import { subscribeSofiaAuditLogs } from '../services/sofiaSecurityService';
import { SofiaToolExecutionContext } from '../services/sofiaTools';
import { formatHourPTBR, SOFIA_DEFAULT_MODEL } from '../utils/sofiaPromptBuilder';
import { TextToSpeechManager } from '../services/voiceAiService';
import { clearSofiaClientMemoryAndStorage, getSofiaAuthHeaders } from '../services/authSessionService';

export interface SofiaAgentProps {
  students: Student[];
  records: AttendanceRecord[];
  currentUser?: UserProfile | null;
  selectedDate: string;
  selectedTurma?: string;
  selectedActivity?: string;
  activeTab?: string;
  schedules?: ScheduleBlock[];
  semanarioPlans?: SemanarioPlan[];
  quadroAtribuicoes?: TurmaAtribuicao[];
  users?: UserProfile[];
  holidays?: HolidayItem[];
  activitiesList?: ActivityItem[];
  pontoRecords?: PontoRecord[];
  activeTurmas?: string[];
  feedbacksCount?: number;
  feedbacksPendingCount?: number;
  onSaveRecord?: (record: Omit<AttendanceRecord, 'id' | 'createdAt'>) => Promise<void> | void;
  onNavigateTab?: (tab: any) => void;
  onSelectTurma?: (turma: any) => void;
  onSelectDate?: (date: string) => void;
}

function getFriendlyToolStatus(toolName: string | null): string {
  switch (toolName) {
    case 'consultarAtividadesMomento':
    case 'consultarGradeHoraria':
      return 'Vendo a grade e o que tá rolando agora...';
    case 'consultarFrequenciaHoje':
    case 'obterResumoFrequenciaPorData':
    case 'lancarFrequenciaTurma':
    case 'registrarFaltaFrequencia':
      return 'Conferindo a chamada...';
    case 'gerar_pdf_frequencia':
    case 'gerarListaChamadaPDF':
      return 'Gerando o PDF da chamada...';
    case 'registrarSaidaAntecipada':
    case 'confirmarSaidaAluno':
    case 'consultarAlertasSaidaHoje':
    case 'gerarTermoSaidaAvulsa':
    case 'gerarAutorizacaoEntradaSaidaPDF':
      return 'Checando e atualizando as saídas...';
    case 'consultarCardapio':
    case 'cadastrarRefeicaoCardapio':
      return 'Olhando o cardápio...';
    case 'consultarSemanario':
      return 'Conferindo o semanário...';
    case 'consultarManualNormas':
      return 'Consultando o manual...';
    case 'consultarAlunosOuTurma':
    case 'cadastrarAluno':
    case 'editarAluno':
      return 'Buscando na lista de alunos...';
    case 'consultarQuadroAtribuicoes':
      return 'Vendo quem está com cada turma...';
    case 'consultarLivroPonto':
    case 'gerarEspelhoPontoPDF':
      return 'Conferindo o ponto...';
    default:
      return 'Um segundinho, já vejo isso...';
  }
}

export const SofiaAgent: React.FC<SofiaAgentProps> = ({
  students,
  records,
  currentUser,
  selectedDate,
  selectedTurma,
  selectedActivity,
  activeTab,
  schedules,
  semanarioPlans,
  quadroAtribuicoes,
  users,
  holidays,
  activitiesList,
  pontoRecords,
  activeTurmas,
  onSaveRecord,
  onNavigateTab,
  onSelectTurma,
  onSelectDate,
}) => {
  const effectiveUser = currentUser || getStoredUser();

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [executingToolName, setExecutingToolName] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showAuditLogPanel, setShowAuditLogPanel] = useState(false);
  const [auditLogs, setAuditLogs] = useState<SofiaAuditLogEntry[]>([]);
  const [runtimeStatus, setRuntimeStatus] = useState<{
    model: string;
    fallbackUsed?: boolean;
    lastError?: { code?: number; message: string; model?: string } | null;
  }>({
    model: SOFIA_DEFAULT_MODEL,
    fallbackUsed: false,
    lastError: null,
  });

  const userIsAdmin = isAdmin(effectiveUser);

  // Ao perder o perfil de administrador (logout ou troca de usuário), fecha o painel e limpa histórico local/memória
  useEffect(() => {
    if (!effectiveUser || !userIsAdmin) {
      setIsOpen(false);
      setIsExpanded(false);
      setShowAuditLogPanel(false);
      setInputText('');
      setMessages([]);
      setAuditLogs([]);
      setIsListening(false);
      setRuntimeStatus({ model: SOFIA_DEFAULT_MODEL, fallbackUsed: false, lastError: null });
      spokenDepartureAlertsRef.current.clear();
      TextToSpeechManager.stop();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      clearSofiaClientMemoryAndStorage();
      return;
    }

    return subscribeSofiaAuditLogs((logs) => {
      setAuditLogs(logs);
    });
  }, [userIsAdmin, effectiveUser?.id]);

  useEffect(() => {
    if (!effectiveUser || !userIsAdmin || (!isOpen && !showAuditLogPanel)) return;
    let cancelled = false;
    fetch('/api/sofia/admin-status', {
      credentials: 'include',
      headers: getSofiaAuthHeaders(),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setRuntimeStatus({
          model: data.model || SOFIA_DEFAULT_MODEL,
          fallbackUsed: Boolean(data.fallbackUsed),
          lastError: data.lastError || (data.alert?.active ? { code: data.alert.code, message: data.alert.lastError || data.alert.message, model: data.alert.model } : null),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [effectiveUser?.id, userIsAdmin, isOpen, showAuditLogPanel]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Estado ao vivo RAG
  const appState = buildLiveAppStateSummary({
    students,
    records,
    pontoRecords,
    currentUser: effectiveUser,
    selectedDate,
    activeTab,
    selectedTurma,
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
    activeTab,
    activeTurmas,
    schedules,
    semanarioPlans,
    quadroAtribuicoes,
    users,
    holidays,
    activitiesList,
    onSaveRecord,
    onNavigateTab,
    onSelectTurma,
    onSelectDate,
    appState,
  };

  const userFirstName = effectiveUser?.name ? effectiveUser.name.split(' ')[0] : '';
  const initialGreeting = userFirstName
    ? `Oi, ${userFirstName}! Tô por aqui — no que posso te ajudar agora?`
    : 'Oi! Tô por aqui — no que posso te ajudar agora?';

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

  // Motor de Alertas Proativos em Segundo Plano (exclusivo para administrador)
  useEffect(() => {
    if (!effectiveUser || !userIsAdmin) return;
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
        if (rec?.checkoutConfirmed) return;

        let departureTimeStr = '';
        if (rec && (rec.status === 'saida_antecipada' || rec.exitTime)) {
          departureTimeStr = rec.exitTime || '';
        }

        if (!departureTimeStr) {
          const sHorario = student.horariosSaida?.[dayOfWeek as any] || student.horarioSaida;
          if (sHorario) {
            const cleanH = sHorario.trim();
            if (cleanH < '17:00' && cleanH >= '12:00') {
              departureTimeStr = cleanH;
            }
          }
        }

        if (!departureTimeStr || !departureTimeStr.includes(':')) return;

        const [depH, depM] = departureTimeStr.split(':').map((v) => parseInt(v, 10));
        if (isNaN(depH) || isNaN(depM)) return;

        const depTotalMinutes = depH * 60 + depM;
        const diffMinutes = depTotalMinutes - currentTotalMinutes;

        if (diffMinutes >= 10 && diffMinutes <= 15) {
          const alertKey = `${todayISO}_${student.id}_${departureTimeStr}`;
          if (!spokenDepartureAlertsRef.current.has(alertKey)) {
            spokenDepartureAlertsRef.current.add(alertKey);

            const formattedHour = formatHourPTBR(departureTimeStr);
            const spokenNotice = `Atenção: ${student.name}, do ${student.turma}, sai mais cedo às ${formattedHour}.`;

            setMessages((prev) => [
              ...prev,
              {
                id: `dep_alert_${Date.now()}_${student.id}`,
                sender: 'sofia',
                text: `⏰ **Saída daqui a pouco**: **${student.name}** (${student.turma}) sai às **${formattedHour}** (em cerca de ${diffMinutes} min).`,
                timestamp: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
              },
            ]);

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
  }, [students, records, isMuted, userIsAdmin, effectiveUser?.id]);

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
        toolResults: response.toolResults,
        toolTurns: response.toolTurns,
      };

      setMessages((prev) => [...prev, sofiaMessage]);

      setRuntimeStatus({
        model: response.model || SOFIA_DEFAULT_MODEL,
        fallbackUsed: Boolean(response.fallbackUsed),
        lastError: response.error
          ? { code: response.errorCode, message: response.error, model: response.model }
          : null,
      });

      if (!isMuted && response.text) {
        const cleanSpeakText = response.text
          .replace(/http[^\s]+/g, '')
          .replace(/[#*`_]/g, '')
          .replace(/\n•/g, ', ')
          .replace(/\n+/g, '. ')
          .trim()
          .slice(0, 320);
        TextToSpeechManager.speak(cleanSpeakText);
      }
    } catch (err) {
      console.error('[SofiaAgent] Erro ao enviar mensagem:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'sofia',
          text: 'Não consegui concluir agora. Quer que eu tente de novo?',
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
      setMessages((prev) => [
        ...prev,
        {
          id: `voice_unsupported_${Date.now()}`,
          sender: 'sofia',
          text: 'Esse navegador não liberou o microfone por aqui. Pode digitar que eu te ajudo rapidinho!',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
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

  // Exclusivo para Administrador: nenhum vestígio para demais perfis
  if (!effectiveUser || !userIsAdmin) return null;

  const quickSuggestions = [
    'Resumo e pendências de hoje',
    'Tem chamada pendente?',
    'Pendências do Livro Ponto',
    'Saídas antecipadas e vans hoje',
  ];

  return (
    <>
      {/* Botão Flutuante Sofia */}
      {!isOpen && (
        <button
          type="button"
          onClick={handleOpenSofia}
          className="fixed bottom-5 right-5 z-40 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl shadow-2xl border border-teal-500/40 hover:border-teal-400/80 hover:scale-105 active:scale-95 transition-all flex items-center space-x-2.5 cursor-pointer group"
          title="Falar com a Sofia"
        >
          <div className="relative">
            <div className="w-7 h-7 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center border border-teal-400/40 shadow-inner">
              <Sparkles className="w-4 h-4 text-teal-300 group-hover:rotate-12 transition-transform duration-300" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-slate-900 animate-ping" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-slate-900" />
          </div>
          <span className="text-xs font-bold text-white tracking-wide pr-1">
            Sofia
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
                <h3 className="text-sm font-black text-white leading-tight">
                  Sofia
                </h3>
                <p className="text-[11px] text-slate-300">
                  Integral • Colégio Crescer
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1.5">
              {userIsAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAuditLogPanel((prev) => !prev)}
                  className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors cursor-pointer ${
                    showAuditLogPanel
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-white/10 text-amber-200 hover:bg-white/20'
                  }`}
                  title="Log de auditoria de ações da Sofia (visível para Coordenação)"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Auditoria</span>
                  {auditLogs.length > 0 && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${showAuditLogPanel ? 'bg-slate-900 text-amber-300' : 'bg-amber-500/30 text-amber-200'}`}>
                      {auditLogs.length > 99 ? '99+' : auditLogs.length}
                    </span>
                  )}
                </button>
              )}

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
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tarja discreta de contexto ao vivo */}
          <div className="bg-slate-900 text-slate-200 px-4 py-2 text-[11px] flex items-center justify-between border-b border-slate-800 shrink-0">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-200 capitalize">
                {appState.dayOfWeekFull || appState.dayOfWeek} • {formatHourPTBR(appState.currentTime)} • {appState.totalPresentesHoje} presentes
              </span>
            </div>
            <div className="flex items-center space-x-1 text-slate-400">
              <Clock className="w-3 h-3 text-teal-400" />
              <span>{appState.formattedDate}</span>
            </div>
          </div>

          {/* Painel de Auditoria (exclusivo para Coordenação/Admin) */}
          {userIsAdmin && showAuditLogPanel ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-50">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 gap-2">
                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                    Log de Auditoria da Sofia (Ações de Escrita e Bloqueios)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Registro completo de quem pediu, ferramenta, data/hora e resultado.
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500 font-mono">
                    <span>
                      Modelo em uso: <strong className="text-slate-700">{runtimeStatus.model}</strong>
                      {runtimeStatus.fallbackUsed ? ' (fallback)' : ''}
                    </span>
                    {runtimeStatus.lastError && (
                      <span className="text-rose-700 truncate max-w-[320px]" title={runtimeStatus.lastError.message}>
                        Último erro{runtimeStatus.lastError.code ? ` (${runtimeStatus.lastError.code})` : ''}: {runtimeStatus.lastError.message}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAuditLogPanel(false)}
                  className="text-[11px] font-bold text-indigo-700 hover:underline cursor-pointer shrink-0"
                >
                  Voltar ao chat
                </button>
              </div>

              {auditLogs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Nenhuma ação de escrita ou bloqueio registrada até o momento.
                </div>
              ) : (
                auditLogs.map((entry) => {
                  const badgeClass =
                    entry.outcome === 'sucesso'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : entry.outcome === 'aguardando_confirmacao'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : entry.outcome === 'negado'
                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                      : 'bg-red-100 text-red-800 border-red-200';
                  const outcomeLabel =
                    entry.outcome === 'sucesso'
                      ? 'Sucesso'
                      : entry.outcome === 'aguardando_confirmacao'
                      ? 'Aguardando confirmação'
                      : entry.outcome === 'negado'
                      ? 'Negado'
                      : 'Erro';

                  return (
                    <div
                      key={entry.id}
                      className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs space-y-1.5 text-[11px]"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-mono font-bold text-slate-900">
                          {entry.toolName}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md border font-bold text-[10px] ${badgeClass}`}>
                          {outcomeLabel}
                        </span>
                      </div>
                      <div className="text-slate-600 flex items-center justify-between gap-2 flex-wrap">
                        <span>
                          <strong>{entry.userName}</strong> ({entry.userProfile})
                        </span>
                        <span className="text-slate-400 font-mono">
                          {entry.formattedDateTime}
                        </span>
                      </div>
                      {entry.detail && (
                        <p className="text-slate-600 leading-snug">{entry.detail}</p>
                      )}
                      {entry.argsSummary && Object.keys(entry.argsSummary).length > 0 && (
                        <pre className="bg-slate-100 text-slate-700 rounded-lg p-2 text-[10px] overflow-x-auto font-mono">
                          {JSON.stringify(entry.argsSummary)}
                        </pre>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <>

          {/* Área de Mensagens */}
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
                      {isSofia ? 'Sofia' : userFirstName || 'Você'}
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

                    {(() => {
                      const actionResults = (
                        msg.toolResults && msg.toolResults.length > 0
                          ? msg.toolResults
                          : msg.toolResult
                          ? [msg.toolResult]
                          : []
                      ).filter((tr) =>
                        tr &&
                        (tr.downloadUrl ||
                          tr.whatsappUrl ||
                          (tr.success &&
                            !tr.data?.requer_confirmacao &&
                            [
                              'registrarFaltaFrequencia',
                              'registrarSaidaAntecipada',
                              'confirmarSaidaAluno',
                              'lancarFrequenciaTurma',
                              'cadastrarAluno',
                              'editarAluno',
                              'cadastrarUsuario',
                              'cadastrarRefeicaoCardapio',
                              'alterarAnoLetivoAluno',
                            ].includes(tr.toolName)))
                      );

                      if (actionResults.length === 0) return null;

                      return (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col space-y-2">
                          {actionResults.map((tr, idx) => (
                            <React.Fragment key={`${msg.id}_tr_${idx}`}>
                              {tr.success &&
                                !tr.data?.requer_confirmacao &&
                                [
                                  'registrarFaltaFrequencia',
                                  'registrarSaidaAntecipada',
                                  'confirmarSaidaAluno',
                                  'lancarFrequenciaTurma',
                                  'cadastrarAluno',
                                  'editarAluno',
                                  'cadastrarUsuario',
                                  'cadastrarRefeicaoCardapio',
                                  'alterarAnoLetivoAluno',
                                ].includes(tr.toolName) && (
                                  <div className="flex items-center space-x-2 text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-200">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                    <span>Pronto, salvo por aqui!</span>
                                  </div>
                                )}

                              {tr.downloadUrl && (
                                <div className="bg-slate-900 text-white p-3 rounded-2xl flex items-center justify-between shadow-md">
                                  <div className="flex items-center space-x-2.5 overflow-hidden">
                                    <FileText className="w-5 h-5 text-teal-300 shrink-0" />
                                    <div className="truncate">
                                      <span className="block font-bold text-teal-200 text-[11px] truncate">
                                        {tr.filename || 'Documento em PDF'}
                                      </span>
                                      <span className="text-[10px] text-slate-300">
                                        Pronto para abrir ou imprimir
                                      </span>
                                    </div>
                                  </div>

                                  <a
                                    href={tr.downloadUrl}
                                    download={tr.filename || 'documento_sofia.pdf'}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-1.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white text-[11px] font-bold rounded-xl shadow transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer"
                                  >
                                    <FileDown className="w-3.5 h-3.5" />
                                    <span>Baixar PDF</span>
                                  </a>
                                </div>
                              )}

                              {tr.whatsappUrl && (
                                <div className="bg-emerald-950 text-white p-3 rounded-2xl flex items-center justify-between shadow-md">
                                  <div className="flex items-center space-x-2.5 overflow-hidden">
                                    <MessageSquare className="w-5 h-5 text-emerald-400 shrink-0" />
                                    <div className="truncate">
                                      <span className="block font-bold text-emerald-200 text-[11px] truncate">
                                        Mensagem pronta pro WhatsApp
                                      </span>
                                      <span className="text-[10px] text-emerald-300/80">
                                        Só clicar para enviar
                                      </span>
                                    </div>
                                  </div>

                                  <a
                                    href={tr.whatsappUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-xl shadow transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>Abrir WhatsApp</span>
                                  </a>
                                </div>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}

            {messages.length <= 1 && !isProcessing && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {quickSuggestions.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => handleSendMessage(sug)}
                    className="px-2.5 py-1.5 bg-white hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-200 hover:border-teal-300 rounded-xl text-[11px] font-medium transition-colors cursor-pointer shadow-xs"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}

            {isProcessing && (
              <div className="flex flex-col items-start animate-in fade-in duration-200">
                <div className="flex items-center space-x-2 bg-gradient-to-r from-teal-50 to-indigo-50 border border-teal-300/60 text-slate-800 px-3.5 py-2.5 rounded-2xl shadow-sm text-xs">
                  <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />
                  <span className="font-semibold text-teal-900">
                    {getFriendlyToolStatus(executingToolName)}
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
                title={isListening ? 'Parar gravação' : 'Falar com a Sofia'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isProcessing}
                placeholder="Pode perguntar ou pedir qualquer coisa..."
                className="flex-1 bg-slate-100 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white transition-all disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || isProcessing}
                className="p-2.5 bg-gradient-to-r from-teal-700 to-indigo-900 hover:from-teal-800 hover:to-indigo-950 text-white rounded-2xl shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Enviar"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
          </>
          )}
        </div>
      )}
    </>
  );
};

export default SofiaAgent;
